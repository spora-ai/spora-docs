---
title: Plugin author guide — Foundations
description: What a Spora plugin is, its plugin.json manifest, and the entry-point class — the three things every plugin needs before it can do anything else.
---

# Foundations

The three things every Spora plugin needs before it can do anything else: the **package shape** (a Composer package of `type: "spora-plugin"`), the **manifest** (`plugin.json`), and the **entry-point class** (a PHP class that implements `PluginInterface`).

The complete plugin system reference (load order, manifest validation, boot-time stamp cache, security model) lives in [Concepts → Plugin system](/reference/concepts/plugins-system). This chapter is the "first commit" walkthrough.

## What a Spora plugin is

A Spora plugin is a Composer package — installable via `composer require` and shipped to Packagist like any other PHP library — that contributes runtime capabilities to a Spora deployment:

- **Tools** callable by an agent (web search, image generation, calendar ops).
- **Skills** that ship on disk via `skillPaths()` (a directory of `SKILL.md` folders) or that are generated at runtime via `skillProviders()`. See [Skills](/develop/plugins/author-guide/skills).
- **Apps** — operator-facing UI side-panels contributed via `apps()`. See [Admin UI](/develop/plugins/author-guide/admin-ui).
- **Migrations** that create plugin-owned database tables.
- **Agent templates** that bundle a system prompt + tool activations + per-operation auto-approve defaults into a one-click Agent. See [Agent templates](/develop/plugins/author-guide/agent-templates).

A plugin does **not** contribute LLM providers. There is no `drivers()` hook — LLM drivers are _configured_ per agent by the operator (config key, `base_url`, API key), not contributed by a plugin. See [Concepts → LLM drivers](/reference/concepts/drivers).

A plugin is identified by a **Composer package** with `type: "spora-plugin"`. On install, the `spora-ai/installer` Composer plugin routes the package to the host Spora's `plugins/{slug}/` directory and the host's `PluginLoader` picks up its manifest on the next request.

Two reference layouts:

- **Skeleton template** — `spora-ai/spora-plugin-skeleton`. Copy this repo to bootstrap a new plugin.
- **Production example** — `spora-ai/spora-plugin-memories`. Two tools (agent-scoped memory, principal-scoped memory), an admin app, two migrations, custom DI bindings, 14 REST routes, and the `memories/assistant` agent template — the canonical subscriber for the [lifecycle events](/reference/concepts/plugins-system#lifecycle-events).

### Standard layout

```text
spora-plugin-foo/
├── composer.json         # type: "spora-plugin"
├── plugin.json           # manifest (slug, class, description, icon, accent)
├── plugin.schema.json    # (optional) $schema pointer for editor hints
├── src/
│   ├── FooPlugin.php     # entry-point class (FQCN = Spora\Plugins\Foo\FooPlugin)
│   └── Tools/
│       └── FooTool.php   # at least one tool class
├── database/
│   └── migrations/
│       └── foo_000001_create_xyz_table.php
├── agent-templates/         ← optional: ship curated Agent templates
│   └── research-assistant.json
└── tests/
    └── Unit/
        └── Tools/
            └── FooToolTest.php
```

The directory name is up to you (Composer picks files by namespace, not directory name), but it must match the slug used in `plugin.json` and as the migration filename prefix.

## `plugin.json` manifest

The full JSON Schema lives at [plugin.schema.json](https://github.com/spora-ai/spora-core/blob/main/plugin.schema.json) in the framework repo, and the field-by-field reference — including every validation rule — is on the [Plugin manifest schema](/reference/plugin-schema) page. JSON-schema validation rejects extra fields outright (`additionalProperties: false`); `Spora\Plugins\PluginLoader` separately validates the two required fields (`slug` and `class`) and refuses to load if they are missing or malformed.

### Required fields

| Field   | Type   | Description                                                                                                                                                        |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `slug`  | string | Machine identifier. Matches `^[a-z0-9][a-z0-9_-]*$`. Stable across releases — used as the component key in `schema_versions` and as the migration filename prefix. |
| `class` | string | FQCN of the entry-point class. Must implement `Spora\Plugins\PluginInterface` and resolve via PSR-4 autoloading.                                                   |

### Optional fields

| Field         | Type   | Description                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | string | Short human-readable description surfaced by the inventory UI. Max 500 chars.                                                                                                                                                                                                                                                                                                                         |
| `icon`        | string | Icon shown next to the plugin in admin UIs. Two accepted forms — a bundled name (`"puzzle"`, `"brain"`, `"globe"`…) or a single raw SVG path string. A full `<svg>…</svg>` blob is **not** accepted: the frontend no longer renders manifest markup. Defaults to `"puzzle"` when omitted. See [Plugin system → Bundled icons](/reference/concepts/plugins-system#bundled-icons) for the full palette. |
| `accent`      | string | Tile accent colour for the plugin's app tile — one of `violet`, `amber`, `emerald`, `sky`, `rose`, `primary` (default). PHP `App::accent()` wins over this field; unknown or missing values fall back to `"primary"`.                                                                                                                                                                                 |

### Minimal example

```json
{
  "slug": "acme-search",
  "class": "Spora\\Plugins\\AcmeSearch\\AcmeSearchPlugin"
}
```

### Full example

```json
{
  "slug": "acme-search",
  "class": "Spora\\Plugins\\AcmeSearch\\AcmeSearchPlugin",
  "description": "Web search via the Acme API.",
  "icon": "globe",
  "accent": "sky"
}
```

### What is _not_ in the manifest

The previous schema (`<= v0.5.x`) accepted `version`, `dependencies`, `autoload`, and `file` overrides. Those were dropped when `PluginLoader` switched to PSR-4-only entry-point resolution:

- **Version** is taken from the git tag Composer recorded at install time (`Composer\InstalledVersions::getPrettyVersion()`). The runtime never reads `composer.json#version` — both the manifest contract and the runtime resolution are tag-driven, so a hand-edited bump can't drift from the release that operators actually see.
- **Inter-plugin dependencies** are declared in `composer.json` (`"require"`), not the manifest.
- **Autoload PSR-4 mappings** are declared in `composer.json`. The schema's only top-level fields are `slug`, `class`, `description`, `icon`, and `accent`, so a manifest carrying an `autoload` block does not validate — even though `PluginLoader` still reads one when it finds it, and a handful of shipped plugins ship it. See the [`autoload` block](/reference/plugin-schema#autoload-block) section for the full nuance.
- **`file` override** is gone — the loader instantiates `class` via PSR-4 and throws on failure.

If you are maintaining an older plugin, see the [PSR-4 entry-point quirk](/develop/plugins/author-guide/distribution#psr-4-entry-point-quirk) section in the Distribution chapter.

## Entry-point class

The class named in the manifest `class` field must implement `Spora\Plugins\PluginInterface`. In practice, extend `Spora\Plugins\AbstractPlugin` (or, for new code that may one day move into an App, `Spora\Extensions\AbstractExtension` — both implement the same interface).

`AbstractPlugin` provides empty defaults for every hook, so you only override what you actually use. The two methods every plugin overrides are `getName()` (for UI display) and `tools()` (the whole point of the plugin).

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\AcmeSearch;

use Spora\Plugins\AbstractPlugin;
use Spora\Plugins\AcmeSearch\Tools\AcmeSearchTool;

final class AcmeSearchPlugin extends AbstractPlugin
{
    public function getName(): string
    {
        return 'Acme Search';
    }

    /** @return array<class-string<\Spora\Tools\ToolInterface>> */
    public function tools(): array
    {
        return [
            AcmeSearchTool::class,
        ];
    }
}
```

### Available hooks

`Spora\Extensions\SporaExtensionInterface` declares **exactly ten** methods, and that is the complete data-hook surface. `Spora\Plugins\PluginInterface` re-exports it, so the table below is the whole contract. `AbstractPlugin` supplies a default for all ten: nine of them are the empty value their return type allows — `[]` for the seven list hooks, `0` for `schemaVersion()`, `null` for `migrationsPath()` — and `getName()` returns the short class name with a trailing `Plugin` stripped (`SkeletonPlugin` → `Skeleton`) rather than a no-op. You only override what you actually use, and in practice that is `getName()` and `tools()`.

| Hook                      | Returns                                         | Default | Purpose                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getName()`               | `string`                                        | —       | Human-facing name shown in admin UIs.                                                                                                                                             |
| `tools()`                 | `class-string<ToolInterface>[]`                 | `[]`    | Tools contributed to the tool registry. See [Tools](/develop/plugins/author-guide/tools).                                                                                         |
| `agentTemplatePaths()`    | `string[]`                                      | `[]`    | Absolute paths to Agent template files (`.json` / `.yaml` / `.yml`). See [Agent templates](/develop/plugins/author-guide/agent-templates).                                        |
| `skillPaths()`            | `string[]`                                      | `[]`    | Absolute paths to skill directories; each immediate subdirectory is a skill root containing a `SKILL.md`. See [Skills](/develop/plugins/author-guide/skills).                     |
| `schemaVersion()`         | `int`                                           | `0`     | Bump every time a new migration file is added. `0` if the plugin has no schema. See [Migrations](/develop/plugins/author-guide/migrations).                                       |
| `migrationsPath()`        | `?string`                                       | `null`  | Absolute path to the plugin's migrations directory, or `null` if it has no schema.                                                                                                |
| `apps()`                  | `class-string<AppInterface>[]`                  | `[]`    | UI side-panels contributed to the App registry. See [Admin UI](/develop/plugins/author-guide/admin-ui).                                                                           |
| `speechToTextProviders()` | `class-string<SpeechToTextProviderInterface>[]` | `[]`    | Speech-to-text provider classes. See [Speech providers](/develop/plugins/author-guide/speech-providers).                                                                          |
| `skillProviders()`        | `class-string<SkillProviderInterface>[]`        | `[]`    | Skill providers for skills with **no directory** — user-authored, tenant-scoped, or synthesised. A shipped skill is a directory plus `skillPaths()`.                              |
| `searchProviders()`       | `class-string<SearchProviderInterface>[]`       | `[]`    | Sources of ⌘K palette hits. Makes a resource **findable**, where `skillProviders()` makes it **readable**. Core's own provider already searches everything in the skill registry. |

### Lifecycle is events, not hooks

Six hooks that pre-1.0 plugins used to implement — `autoload()`, `drivers()`, `recipePaths()`, `register()`, `routes()`, and `boot()` — are **gone** from the interface. The first three had no callers (PSR-4 data lives in `composer.json` / `plugin.json`, and LLM providers are configured per agent rather than contributed); the last three became PSR-14 events.

To do the work `register()`, `routes()`, and `boot()` used to do, implement the event subscriber interface and return the events you care about from `getSubscribedEvents()`:

```php
<?php

declare(strict_types=1);

use Spora\Events\ContainerBuildingEvent;
use Spora\Events\RoutesRegisteringEvent;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

final class AcmeSearchPlugin extends AbstractPlugin implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [
            ContainerBuildingEvent::class => 'onContainerBuilding',
            RoutesRegisteringEvent::class => 'onRoutesRegistering',
        ];
    }

    public function onContainerBuilding(ContainerBuildingEvent $event): void
    {
        $event->builder()->addDefinitions([
            AcmeSearchService::class => \DI\autowire(),
        ]);
    }

    public function onRoutesRegistering(RoutesRegisteringEvent $event): void
    {
        $event->routes()->addRoute('GET', '/api/v1/acme-search', [AcmeController::class, 'index'], [AuthMiddleware::class]);
    }
}
```

> **Import the `Symfony\Component\EventDispatcher` interface, not the `Symfony\Contracts` one.** Both loaders check `instanceof Symfony\Component\EventDispatcher\EventSubscriberInterface` (`Spora\Extensions\AppLoader::wireEventSubscribers()` and `Spora\Plugins\PluginLoader::wireEventSubscribers()`), and so does every real plugin — `MemoriesPlugin` and `EmailPlugin` both import the `Component` variant. `Symfony\Contracts\EventDispatcher\EventSubscriberInterface` **does not exist** — `symfony/event-dispatcher-contracts` ships only `EventDispatcherInterface` and `Event`, so importing it is a fatal `Interface "…EventSubscriberInterface" not found` at class-load time, not a silently unwired subscriber. Note that the `SporaExtensionInterface` docblock itself still names the `Contracts` variant; ignore it.

The three events, all in the `Spora\Events` namespace:

| Event                    | When                                                                        | Accessor              |
| ------------------------ | --------------------------------------------------------------------------- | --------------------- |
| `ContainerBuildingEvent` | Once per process, **before** the DI container is built.                     | `$event->builder()`   |
| `RoutesRegisteringEvent` | Per request, after core and App routes are registered.                      | `$event->routes()`    |
| `BootingEvent`           | Once per process, after the container is built and the database has booted. | `$event->container()` |

`BootingEvent` is the one to use for stateful init that needs resolved DI services. Subscriber exceptions are tolerated, but the tolerance is coarser than it looks: `PluginLoader` wraps the **whole** dispatch in one `try`/`catch` that writes to `error_log()`, and Symfony's own dispatch loop has no per-listener catch — so a listener that throws skips the **remaining subscribers for that event** (later events still dispatch). The failure reaches the Spora log as nothing at all; it is an `error_log` line only. Full dispatch semantics are in [Concepts → Plugin system](/reference/concepts/plugins-system#lifecycle-events).

For the rationale behind the trim and the `PluginInterface`-as-marker split, see the docblock on [PluginInterface](https://github.com/spora-ai/spora-core/blob/main/app/Plugins/PluginInterface.php) in the framework repo.

## What's next

- [Tools](/develop/plugins/author-guide/tools) — add the first callable surface
- [Skills](/develop/plugins/author-guide/skills) — ship `SKILL.md` directories or generate skills at runtime
- [Migrations](/develop/plugins/author-guide/migrations) — when your plugin needs its own tables
- [Admin UI](/develop/plugins/author-guide/admin-ui) — when your plugin needs an operator-facing panel
- [Distribution](/develop/plugins/author-guide/distribution) — when you have working code on `main` and want to ship it
