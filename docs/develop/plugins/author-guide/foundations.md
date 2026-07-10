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
- **LLM drivers** that plug into the driver factory alongside OpenAI and Anthropic.
- **Migrations** that create plugin-owned database tables.
- **Recipes** _(WIP — not yet shipped)_ that bundle a system prompt + tool allowlist into a one-click agent. The hook is declared and `RecipeScanner` exists, but no recipes are bundled or shipped in this release. See the [Recipes](/develop/plugins/author-guide/recipes) chapter for the WIP status.

A plugin is identified by a **Composer package** with `type: "spora-plugin"`. On install, the `spora-ai/installer` Composer plugin routes the package to the host Spora's `plugins/{slug}/` directory and the host's `PluginLoader` picks up its manifest on the next request.

Two reference layouts:

- **Skeleton template** — `spora-ai/spora-plugin-skeleton`. Copy this repo to bootstrap a new plugin.
- **Production example** — `spora-ai/spora-plugin-minimax`. Four tools (image, speech, music, video) — lyrics are operations on the music tool, not a separate tool — plus one migration and custom DI bindings.

### Standard layout

```text
spora-plugin-foo/
├── composer.json         # type: "spora-plugin"
├── plugin.json           # manifest (slug, class, description, icon)
├── plugin.schema.json    # (optional) $schema pointer for editor hints
├── src/
│   ├── FooPlugin.php     # entry-point class (FQCN = Spora\Plugins\Foo\FooPlugin)
│   └── Tools/
│       └── FooTool.php   # at least one tool class
├── database/
│   └── migrations/
│       └── foo_000001_create_xyz_table.php
├── recipes/                ← WIP — not yet shipped
│   └── default.yaml
└── tests/
    └── Unit/
        └── Tools/
            └── FooToolTest.php
```

The directory name is up to you (Composer picks files by namespace, not directory name), but it must match the slug used in `plugin.json` and as the migration filename prefix.

## `plugin.json` manifest

The full JSON Schema lives at [plugin.schema.json](https://github.com/spora-ai/spora-core/blob/main/plugin.schema.json) in the framework repo. JSON-schema validation rejects extra fields outright (`additionalProperties: false`); `Spora\Plugins\PluginLoader` separately validates the two required fields (`slug` and `class`) and refuses to load if they are missing or malformed.

### Required fields

| Field   | Type   | Description                                                                                                                                                        |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `slug`  | string | Machine identifier. Matches `^[a-z0-9][a-z0-9_-]*$`. Stable across releases — used as the component key in `schema_versions` and as the migration filename prefix. |
| `class` | string | FQCN of the entry-point class. Must implement `Spora\Plugins\PluginInterface` and resolve via PSR-4 autoloading.                                                   |

### Optional fields

| Field         | Type   | Description                                                                                                                                                                                                                                                                                                            |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | string | Short human-readable description surfaced by the inventory UI. Max 500 chars.                                                                                                                                                                                                                                          |
| `icon`        | string | Icon shown next to the plugin in admin UIs. Three accepted forms — bundled name (`"puzzle"`, `"brain"`, `"globe"`…), a full `<svg>` string, or a raw SVG path string. Defaults to `"puzzle"` when omitted. See [Plugin system → Bundled icons](/reference/concepts/plugins-system#bundled-icons) for the full palette. |

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
  "icon": "globe"
}
```

### What is _not_ in the manifest

The previous schema (`<= v0.5.x`) accepted `version`, `dependencies`, `autoload`, and `file` overrides. Those were dropped when `PluginLoader` switched to PSR-4-only entry-point resolution:

- **Version** is taken from `composer.json`. No `version` field.
- **Inter-plugin dependencies** are declared in `composer.json` (`"require"`), not the manifest.
- **Autoload PSR-4 mappings** are declared exclusively in `composer.json`. The manifest no longer accepts an `autoload` block.
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

All hooks live on `Spora\Plugins\PluginInterface` (re-exported from `Spora\Extensions\SporaExtensionInterface`). Most plugins override one or two; the rest stay at their `AbstractPlugin` no-op defaults.

| Hook                                       | Returns                             | Purpose                                                                          |
| ------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------- |
| `getName()`                                | `string`                            | Human-facing name shown in admin UIs.                                            |
| `autoload()`                               | `array<string, string>` (ns → path) | Additional PSR-4 namespace → path mappings registered at boot.                   |
| `tools()`                                  | `class-string<ToolInterface>[]`     | Tools contributed to the tool registry.                                          |
| `drivers()`                                | `string[]` (id → FQCN)              | LLM drivers contributed to the driver factory.                                   |
| `recipePaths()`                            | `string[]`                          | Absolute paths to recipe YAML directories or files. _(WIP — not yet shipped.)_   |
| `apps()`                                   | `class-string<AppInterface>[]`      | UI side-panels contributed to the App registry.                                  |
| `migrationsPath()`                         | `?string`                           | Absolute path to plugin migrations directory, or `null` if no schema.            |
| `schemaVersion()`                          | `int`                               | Bump every time a new migration file is added. `0` if no schema.                 |
| `register(ContainerBuilder $builder)`      | `void`                              | Hook for arbitrary DI bindings, middleware, or services.                         |
| `boot()`                                   | `void`                              | Lifecycle hook fired once after DI container is built, before the first request. |
| `routes(MiddlewareRouteCollector $routes)` | `void`                              | Register HTTP routes into the running middleware collector.                      |

For the new hook surface and why `PluginInterface` is now a marker (with `SporaExtensionInterface` carrying the contract), see the docblock on [PluginInterface](https://github.com/spora-ai/spora-core/blob/main/app/Plugins/PluginInterface.php) in the framework repo.

## What's next

- [Tools](/develop/plugins/author-guide/tools) — add the first callable surface
- [LLM drivers](/develop/plugins/author-guide/drivers) — register a new driver with the factory (rare; tools are usually enough)
- [Migrations](/develop/plugins/author-guide/migrations) — when your plugin needs its own tables
- [Admin UI](/develop/plugins/author-guide/admin-ui) — when your plugin needs an operator-facing panel
- [Distribution](/develop/plugins/author-guide/distribution) — when you have working code on `main` and want to ship it
