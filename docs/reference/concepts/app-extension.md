---
title: App extensions
description: app/App.php — the single-class extension point for project-local Spora code.
---

# App Extensions (`app/App.php`)

A Symfony-style single-class extension point for project-local Spora code.

## TL;DR

Drop a class at `app/App.php` implementing `Spora\Extensions\SporaExtensionInterface` (easiest: extend `Spora\Extensions\AbstractExtension`, which supplies an empty default for every hook except `getName()`). `Spora\Extensions\AppInterface` is a pure marker that extends the same contract — the hook surface lives on the parent either way. Override only what you need. That's it — the framework discovers the file via reflection, reads your hooks at the right lifecycle points, and lets you promote the App to a distributable plugin with a one-file rename.

```php
// app/App.php
namespace App;

use Spora\Extensions\AbstractExtension;

final class App extends AbstractExtension
{
    public function getName(): string { return 'My Spora App'; }

    public function tools(): array
    {
        return [\App\Tools\HelloTool::class];
    }
}
```

## App vs Plugin — when to use which

| Need                                 | Use                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| One tool, this project only          | `app/Tools/Hello.php` + uncomment `tools()` in `App.php`                                                      |
| Multiple contributions + routes + DI | `app/App.php` (routes and DI arrive through [lifecycle events](#lifecycle-events))                            |
| Distribute to other Spora installs   | Migrate `app/` into a plugin: rename `App.php` → `Plugin.php`, add `plugin.json`, publish as Composer package |

The hook surface is identical for both. Promoting an App to a Plugin is a mechanical rename + manifest, not a refactor.

## Hooks

All ten hooks are declared on [`SporaExtensionInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/SporaExtensionInterface.php) — and on nothing else. `Spora\Extensions\AppInterface` and `Spora\Plugins\PluginInterface` are pure markers that extend it, so an App and a plugin share one contract. [`AbstractExtension`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AbstractExtension.php) provides an empty default for every hook except `getName()`.

| Hook                      | Returns                                                           | Purpose                                                                                     |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `getName()`               | `string`                                                          | Human-readable name shown in the UI and logs.                                               |
| `tools()`                 | `array<class-string<\Spora\Tools\ToolInterface>>`                 | Tool FQCNs registered with the Tool Registry.                                               |
| `agentTemplatePaths()`    | `string[]`                                                        | Absolute paths to agent-template files (`.json`/`.yaml`/`.yml`); the scanner reads depth-0. |
| `skillPaths()`            | `string[]`                                                        | Absolute paths to dirs whose immediate subdirs are `SKILL.md` roots.                        |
| `schemaVersion()`         | `int`                                                             | Bump when adding migrations. Default `0`.                                                   |
| `migrationsPath()`        | `?string`                                                         | Absolute path to the migration dir, or `null`.                                              |
| `apps()`                  | `array<class-string<\Spora\Apps\AppInterface>>`                   | Admin-UI side-panels.                                                                       |
| `speechToTextProviders()` | `list<class-string<\Spora\Speech\SpeechToTextProviderInterface>>` | STT providers beyond OpenAI-multipart.                                                      |
| `skillProviders()`        | `list<class-string<\Spora\Skills\SkillProviderInterface>>`        | Skills with **no directory** (user-authored, tenant-scoped).                                |
| `searchProviders()`       | `list<class-string<\Spora\Search\SearchProviderInterface>>`       | ⌘K palette search hits — makes a resource _findable_ (vs `skillProviders` = _readable_).    |

> **Removed in 1.0.** Six hooks that older docs still teach no longer exist. `autoload()`, `drivers()`, and `recipePaths()` had no callers: PSR-4 data moved to `composer.json` / `plugin.json`, and LLM providers are _configured_ rather than contributed. `register()`, `routes()`, and `boot()` became PSR-14 events — see [Lifecycle events](#lifecycle-events) below.
>
> **Note:** `skillProviders()` and `searchProviders()` are data hooks, not lifecycle hooks. The container reads both once at build time and resolves the classes itself; nothing wires subscribers before the container is built, so a listener could not register a provider in time.

### Lifecycle ordering

**Once per process**, in the `Kernel` constructor:

1. **Discovery** — `AppLoader::load()` requires `app/App.php` and instantiates the class that implements `SporaExtensionInterface`. It does not dispatch any event; `PluginLoader::boot()` scans `plugins/*/plugin.json` in the same pass and registers each manifest's PSR-4 mapping before instantiating the entry-point class.
2. **Subscriber wiring** — `AppLoader::wireEventSubscribers()` runs before `PluginLoader::wireEventSubscribers()`, so App listeners are registered ahead of plugin listeners for the same event. Both are idempotent, so a long-running worker cannot accumulate duplicate listeners.
3. **`ContainerBuildingEvent`** — `PluginLoader::registerPlugins()` dispatches it with the live `DI\ContainerBuilder`, before `$builder->build()`.
4. **Container build** — PHP-DI compiles the merged definitions. The data hooks above are read by the container factories as the corresponding services are resolved: `tools()` and `apps()` into the tool / App registries, `speechToTextProviders()`, `skillProviders()`, and `searchProviders()` into their merged class lists, `agentTemplatePaths()` and `skillPaths()` into the scanners.

**Per request**, in `Kernel::handle()`:

1. **Database** — `Database->boot()` runs the schema install, which picks up the `schemaVersion()` / `migrationsPath()` pair of every loaded extension.
2. **Routes** — `RouteDefinitions::register()` registers the core routes first, then `RoutesRegisteringEvent` is dispatched with the same collector. The router is built once from the result.
3. **`BootingEvent`** — dispatched with the live container, after the database is up and before the request is dispatched. Idempotent within a process.
4. **Dispatch** — the router hands the request to its middleware chain.

### Lifecycle events

`register()`, `routes()`, and `boot()` are gone from the contract. An App that needs DI bindings, HTTP routes, or post-build init implements `Symfony\Component\EventDispatcher\EventSubscriberInterface` alongside the extension contract and returns an event → method map. App and plugin subscribers share one framework-wide dispatcher, resolved from the container as `event_dispatcher`.

| Event                    | Payload accessor                                | When                                                                                                             |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ContainerBuildingEvent` | `builder(): DI\ContainerBuilder`                | Once per process, after discovery, before the container is built.                                                |
| `RoutesRegisteringEvent` | `routes(): MiddlewareRouteCollector`            | Per request, after the core routes are registered, before the router is built.                                   |
| `BootingEvent`           | `container(): Psr\Container\ContainerInterface` | Once per process — on the first request handled by it, after the container is built and the database has booted. |

```php
// app/App.php
namespace App;

use Psr\Log\LoggerInterface;
use Spora\Events\BootingEvent;
use Spora\Events\ContainerBuildingEvent;
use Spora\Events\RoutesRegisteringEvent;
use Spora\Extensions\AbstractExtension;
use Spora\Http\Middleware\AuthMiddleware;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

final class App extends AbstractExtension implements EventSubscriberInterface
{
    public function getName(): string { return 'My Spora App'; }

    public function tools(): array
    {
        return [\App\Tools\HelloTool::class];
    }

    /** @return array<class-string, string> */
    public static function getSubscribedEvents(): array
    {
        return [
            ContainerBuildingEvent::class => 'onContainerBuilding',
            RoutesRegisteringEvent::class   => 'onRoutesRegistering',
            BootingEvent::class            => 'onBooting',
        ];
    }

    public function onContainerBuilding(ContainerBuildingEvent $event): void
    {
        $event->builder()->addDefinitions([
            \App\Services\GreeterInterface::class => \DI\autowire(\App\Services\Greeter::class),
        ]);
    }

    public function onRoutesRegistering(RoutesRegisteringEvent $event): void
    {
        $event->routes()->addRoute(
            'GET',
            '/api/v1/hello',
            [\App\Http\Controllers\HelloController::class, 'index'],
            [AuthMiddleware::class],
        );
    }

    public function onBooting(BootingEvent $event): void
    {
        $event->container()->get(LoggerInterface::class)->info('app booted');
    }
}
```

> **Note:** the container is **not** resolvable inside `onContainerBuilding()` — only the builder is, and it is still mutable. Use `BootingEvent` when the listener needs a live service. A listener that throws does not fail the boot: `PluginLoader::dispatchWithTolerance()` wraps the whole dispatch in one `try`/`catch` and writes the failure to `error_log()`. That catch is around the dispatch, not around each listener, so the remaining subscribers **for that event** are skipped — the next event still dispatches, and the failure surfaces only as an `error_log` line, not through the Spora logger.

## Promoting an App to a Plugin

The App → Plugin migration is mechanical:

```bash
# 1. Create the plugin directory
mkdir plugins/my-tool
mv app/Tools/HelloTool.php plugins/my-tool/src/HelloTool.php

# 2. Rename App.php → Plugin.php
mv app/App.php plugins/my-tool/src/Plugin.php

# 3. Inside Plugin.php, rename class App → Plugin, change the namespace
#    from App\ to Spora\MyPlugin\ (or your vendor namespace)
```

Then add a `plugin.json`:

```json
{
  "slug": "my-tool",
  "class": "Spora\\MyTool\\Plugin",
  "description": "My tool, distributed.",
  "autoload": {
    "psr-4": { "Spora\\MyTool\\": "src/" }
  }
}
```

Ship as a Composer package. Install it with `php bin/spora plugin:install <vendor/package>` (the plugin commands are not `spora:`-prefixed), or `php bin/spora plugin:install <vendor/package> --path=/abs/path/to/checkout` for a sibling git clone. No internal refactor required — the hook surface is identical.

## Reference

- [`SporaExtensionInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/SporaExtensionInterface.php) — common contract
- [`AbstractExtension`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AbstractExtension.php) — empty-default base class
- [`AppInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AppInterface.php) — marker for project apps
- [`AppLoader`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AppLoader.php) — App discovery + subscriber wiring
- [`PluginInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Plugins/PluginInterface.php) — marker for plugins
- [`AbstractPlugin`](https://github.com/spora-ai/spora-core/blob/main/app/Plugins/AbstractPlugin.php) — empty-default base class for plugins
- [`ContainerBuildingEvent`](https://github.com/spora-ai/spora-core/blob/main/app/Events/ContainerBuildingEvent.php), [`RoutesRegisteringEvent`](https://github.com/spora-ai/spora-core/blob/main/app/Events/RoutesRegisteringEvent.php), [`BootingEvent`](https://github.com/spora-ai/spora-core/blob/main/app/Events/BootingEvent.php) — the three lifecycle events

See also:

- [Plugin system](/reference/concepts/plugins-system) — plugin system reference (for the migration target)
- [Plugin system → Lifecycle Events](/reference/concepts/plugins-system#lifecycle-events) — the same events from the plugin side
- [Tool system](/reference/concepts/tools) — how to write a Tool class
- [Architecture](/reference/concepts/architecture) — config priority and boot sequence
