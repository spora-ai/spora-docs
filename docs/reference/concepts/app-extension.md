---
title: App extensions
description: app/App.php — the single-class extension point for project-local Spora code.
---

# App Extensions (`app/App.php`)

A Symfony-style single-class extension point for project-local Spora code.

## TL;DR

Drop a class at `app/App.php` implementing `Spora\Extensions\AppInterface` (easiest: extend `Spora\Extensions\AbstractExtension`). Override only the hooks you need. That's it — the framework discovers the file via reflection, calls your hooks at the right lifecycle points, and lets you promote the App to a distributable plugin with a one-file rename.

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
| Multiple contributions + routes + DI | `app/App.php`                                                                                                 |
| Distribute to other Spora installs   | Migrate `app/` into a plugin: rename `App.php` → `Plugin.php`, add `plugin.json`, publish as Composer package |

The hook surface is identical for both. Promoting an App to a Plugin is a mechanical rename + manifest, not a refactor.

## Hooks

All hooks are inherited from [`SporaExtensionInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/SporaExtensionInterface.php). Implementations may extend [`AbstractExtension`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AbstractExtension.php) to get empty defaults for every hook.

| Hook                      | When called     | Default    | Purpose                                              |
| ------------------------- | --------------- | ---------- | ---------------------------------------------------- |
| `getName()`               | Discovery       | (required) | Human-readable name shown in the UI / logs           |
| `tools()`                 | Container build | `[]`       | Tool class FQCNs contributed to the Tool Registry    |
| `agentTemplatePaths()`    | Container build | `[]`       | Absolute paths to Agent template files               |
| `skillPaths()`            | Container build | `[]`       | Absolute paths to directories of `SKILL.md` skills   |
| `skillProviders()`        | Container build | `[]`       | Skill providers for skills with no directory on disk |
| `speechToTextProviders()` | Container build | `[]`       | Speech-to-text providers for the STT registry        |
| `searchProviders()`       | Container build | `[]`       | Search providers for the host ⌘K palette             |
| `schemaVersion()`         | Schema install  | `0`        | Bump when adding migrations                          |
| `migrationsPath()`        | Schema install  | `null`     | Absolute path to migration directory                 |
| `apps()`                  | Container build | `[]`       | UI side-panels (`Spora\Apps\AppInterface` FQCNs)     |

> **Removed in 1.0.** The hooks `autoload()`, `drivers()`, `recipePaths()`, `register(ContainerBuilder)`, `routes(MiddlewareRouteCollector)`, and `boot()` are **not** on `SporaExtensionInterface`. PSR-4 mappings for an App's own classes moved into the **host project's** `composer.json` (`"App\\": "app/"`), and for a plugin into `plugin.json`'s `autoload.psr-4`; the other five hooks had no consumers. The three side-effect hooks became PSR-14 events — see [Side effects are events](#side-effects-are-events) below.

### Side effects are events

Data hooks answer "what does this extension contribute?". DI bindings, route registration, and per-request setup are behaviour, and they are delivered as PSR-14 events: implement `Symfony\Contracts\EventDispatcher\EventSubscriberInterface`, return the event → method map from `getSubscribedEvents()`, and let the framework call you at the right moment.

```php
use Spora\Events\ContainerBuildingEvent;
use Spora\Events\RoutesRegisteringEvent;
use Spora\Events\BootingEvent;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

final class App extends AbstractExtension implements EventSubscriberInterface
{
    public function getSubscribedEvents(): array
    {
        return [
            ContainerBuildingEvent::class => 'onContainerBuilding',
            RoutesRegisteringEvent::class => 'onRoutesRegistering',
            BootingEvent::class           => 'onBooting',
        ];
    }

    public function onContainerBuilding(ContainerBuildingEvent $event): void
    {
        $event->builder()->addDefinitions([
            MyServiceInterface::class => \DI\autowire(MyService::class),
        ]);
    }

    public function onRoutesRegistering(RoutesRegisteringEvent $event): void
    {
        $event->routes()->addRoute(
            'GET',
            '/api/v1/hello',
            [\App\Http\Controllers\HelloController::class, 'index'],
            [\Spora\Http\Middleware\AuthMiddleware::class],
        );
    }

    public function onBooting(BootingEvent $event): void
    {
        // Safe to read container services here — the container is built.
    }
}
```

| Event                    | Payload (`$event->…`)                           | When                                                                                                    |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ContainerBuildingEvent` | `builder(): DI\ContainerBuilder`                | Once per process, before the container is built. Mutate the builder to add DI bindings.                 |
| `RoutesRegisteringEvent` | `routes(): MiddlewareRouteCollector`            | Per request, after core routes are registered, before the router is built. Add routes to the collector. |
| `BootingEvent`           | `container(): Psr\Container\ContainerInterface` | Per request, after the container is built and the database has booted. Read services off the container. |

### Lifecycle ordering

1. **Discovery** — `app/App.php` is loaded; the implementing class is instantiated.
2. **DI bindings** — `PluginLoader::registerPlugins()` fires the `ContainerBuildingEvent` BEFORE the container is built. The App and the plugins share one dispatcher, so an App subscriber's bindings land in the same builder as core's and the plugins'.
3. **Container build** — PHP-DI compiles the merged definitions.
4. **Routes** — `RouteDefinitions::register()` runs first (core routes), then `RoutesRegisteringEvent` (App and plugin routes appended). The router is built once.
5. **Boot** — `Database->boot()` (schema install), then `BootingEvent`, then request dispatch.

`AppLoader::load()` only instantiates the App; it dispatches nothing itself. `AppLoader::wireEventSubscribers()` attaches the App to the shared dispatcher on every process boot, warm or cold, and is idempotent — so a long-running worker cannot accumulate duplicate listeners. It mirrors `PluginLoader::wireEventSubscribers()`.

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

Ship as a Composer package. Install with `php bin/spora spora:plugin:install`. No internal refactor required — the hook surface is identical.

## Reference

- [`SporaExtensionInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/SporaExtensionInterface.php) — common contract
- [`AbstractExtension`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AbstractExtension.php) — empty-default base class
- [`AppInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AppInterface.php) — marker for project apps
- [`AppLoader`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/AppLoader.php) — discovery + boot
- [`PluginInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Plugins/PluginInterface.php) — marker for plugins
- [`AbstractPlugin`](https://github.com/spora-ai/spora-core/blob/main/app/Plugins/AbstractPlugin.php) — empty-default base class for plugins

See also:

- [Plugin system](/reference/concepts/plugins-system) — plugin system reference (for the migration target)
- [Tool system](/reference/concepts/tools) — how to write a Tool class
- [Architecture](/reference/concepts/architecture) — config priority and boot sequence
