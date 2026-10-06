---
title: Plugin system
description: Plugin manifest, auto-discovery, bundled deps, agent templates, contributing tools/apps/providers.
---

# Spora Plugin System

Plugins extend Spora with additional tools, admin apps, agent templates, skills, and providers. Each plugin is a self-contained directory deployed alongside the core application.

## Directory layout

```text
plugins/
└── my-plugin/
    ├── plugin.json        ← required manifest
    ├── Plugin.php         ← entry-point class (default file location)
    ├── src/               ← optional: plugin source code
    └── vendor/            ← optional: plugin's own Composer dependencies
```

Plugins live in `<base>/plugins/`. Each plugin must occupy its own subdirectory and ship a `plugin.json` manifest.

For local development of a plugin you author, the recommended workflow is a [Composer path repository](/develop/plugins/local-development) — the sibling git checkout is added to the host skeleton's `composer.json` and a regular `composer require` installs it into `plugins/<slug>/`. The PluginLoader then picks it up like any other plugin.

## plugin.json manifest

The full JSON Schema is [`plugin.schema.json`](https://docs.spora-ai.com/schemas/plugin.schema.json), which this repository owns — the copy in `spora-core` is a stale earlier revision. See the [schema reference](/reference/plugin-schema#top-level-fields) for the field-by-field contract.

### Required fields

| Field   | Type   | Description                                                                                                                                                                                                                                                    |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`  | string | Unique machine-readable identifier. Lowercase alphanumeric, hyphens, and underscores only (`^[a-z0-9][a-z0-9_-]*$`). Must be stable across releases — it is used as the component key in `schema_versions` and as the required prefix for migration filenames. |
| `class` | string | Fully-qualified class name of the plugin entry point. Must implement `Spora\Plugins\PluginInterface`.                                                                                                                                                          |

### Optional fields

| Field            | Type   | Description                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`        | string | URI of the manifest schema (`https://docs.spora-ai.com/schemas/plugin.schema.json`), so editors and CI resolve the contract without a network round-trip. Read by no runtime code; safe to omit.                                                                                                                                                                                                                                  |
| `name`           | string | Package name — in practice the Composer package name from the plugin's `composer.json` (e.g. `spora-ai/spora-plugin-typst`). No runtime code reads it; `PluginLoader` keys on `slug` and `class`. Keep the two in sync.                                                                                                                                                                                                           |
| `description`    | string | Short human-readable description surfaced by the inventory UI. Max 500 chars.                                                                                                                                                                                                                                                                                                                                                     |
| `icon`           | string | Icon for the inventory UI. Two forms are accepted — a bundled name, or a raw SVG path whose first command is a moveto (`M`/`m` followed by a digit). Full `<svg>` blobs are not accepted. Defaults to `"puzzle"` when omitted or unrecognised. Lets a plugin ship its own visual identity without coordinating with the Spora frontend. See [Bundled icons](#bundled-icons) and [Two forms](#two-forms-of-plugin-supplied-icons). |
| `accent`         | string | Tile accent colour: `violet`, `amber`, `emerald`, `sky`, `rose`, or `primary`. Precedence is PHP `App::accent()` > this field > `"primary"`; unknown or missing values fall back to `"primary"` silently.                                                                                                                                                                                                                         |
| `autoload.psr-4` | object | PSR-4 namespace → relative path mappings registered with the Composer classloader before the plugin is instantiated. Multiple entries are supported.                                                                                                                                                                                                                                                                              |
| `autoload.files` | array  | PHP files to `require_once` before the plugin is instantiated, relative to the plugin directory. Use `["vendor/autoload.php"]` to load the plugin's own Composer dependency tree. Processed after `psr-4` mappings.                                                                                                                                                                                                               |
| `frontendEntry`  | string | Path to a pre-built frontend bundle, so a JSON-only plugin can ship a UI without writing PHP. Read by `AppsController` as a fallback only — an App class implementing `VueAppInterface` takes precedence. No in-tree manifest ships this yet.                                                                                                                                                                                     |

### Minimal example

```json
{
  "slug": "my-plugin",
  "class": "Acme\\MyPlugin\\Plugin"
}
```

### Bundled icons

The Spora frontend ships a curated palette of bundled SVG icons. Plugin authors can reference any of these by name from the manifest's `icon` field without shipping their own SVG. For categories not covered below, fall back to a raw SVG path string — which must begin with a moveto (`M` or `m`) followed by a digit; see [Two forms of plugin-supplied icons](#two-forms-of-plugin-supplied-icons).

| Category         | Names                                                                                                                                                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General / apps   | `puzzle` (default), `brain`, `lightbulb`, `compass`, `globe`, `sparkles`                                                                                                                                                                                                                                              |
| Documents & data | `file-text`, `database`                                                                                                                                                                                                                                                                                               |
| Productivity     | `calendar`, `search`, `mail`                                                                                                                                                                                                                                                                                          |
| Media            | `music`                                                                                                                                                                                                                                                                                                               |
| Tools & code     | `zap`, `code`                                                                                                                                                                                                                                                                                                         |
| UI utility       | `bell`, `check`, `x`, `plus`, `chevron-right/down/left`, `arrow-right`, `menu`, `grid`, `user`, `logout`, `settings`, `sun`, `moon`, `warning`, `pencil`, `trash`, `star`, `clock`, `computer`, `tools`, `file`, `chat`, `agents`, `shield-check`, `user-plus`, `eye`, `lock`, `check-circle`, `info`, `error-circle` |

### Two forms of plugin-supplied icons

The `icon` field in `plugin.json` accepts two forms. The frontend tries them in this order:

1. **Bundled name** — any kebab-case identifier from the table above (or the wider UI palette). Smallest in JSON, no shipping required. Best for the common case.

   ```json
   { "icon": "puzzle" }
   ```

2. **Raw SVG path** — a single path string whose **first command must be a moveto**. The host's lead test is `/^(?:(?:M\s*\d)|(?:m\s*-?\d))/`: the value must start with `M` or `m`, then optional whitespace, then a digit. A leading minus is accepted after a lowercase `m` only, so `m-3 6` and `m -3 6` pass while `M-3 6` does not. Smallest of the two forms, but limited to single-path icons.

   ```json
   {
     "icon": "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474 1.68l1.683 1.682a2.414 2.414 0 0 1-3.414 0z"
   }
   ```

Only `M`/`m` may lead, and that is not an arbitrary restriction. The SVG spec requires a path to begin with a moveto, so `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A` and `Z` are not valid first commands — a conforming renderer would reject them too. Separately, requiring a digit after the lead letter is what stops kebab-case names like `layout-template` and `log-out` from being read as path data and handed to the browser's SVG validator. Supplying one of those letters first falls back to `puzzle` rather than raising.

The distinction that matters in practice: **the lead is restricted to `M`/`m`, but the rest of the path is not.** Every other command — `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z` and their lowercase relative forms — is fine after that first moveto. Compose multi-shape glyphs as subpaths separated by further `M` commands.

> **Leading-dot coordinates are a known gap.** `M.5`, `M-.5` and `m-.5` are legal SVG and are what several icon sets emit, but they do not satisfy the host's lead test and fall back to `puzzle`. Write `M0.5` or `M 0.5` for a positive leading dot, and `m-0.5` or `m -0.5` for a negative one.

If `icon` is omitted, the backend defaults it to `"puzzle"` and the frontend renders the bundled `puzzle` icon. If `icon` is set but matches neither form (typo, non-SVG garbage, etc.), the frontend falls back to the bundled `puzzle` icon — silently, not an error, so a rejected value is indistinguishable from an omitted one. A whitespace-only `icon` value is treated the same as missing.

**Security note:** Plugin authors are operators with shell access to the Spora host — see § Security. The frontend trust boundary is the plugin manifest itself, not user input. A raw path is handed to the SVG `d` attribute directly, with no markup parsing involved at all.

**Full `<svg>` blobs are not accepted.** The host used to sanitise them through DOMPurify's SVG profile and render them via `v-html`, but historical mXSS bypasses in that profile motivated dropping the `v-html` path entirely. A `<svg>…</svg>` string no longer matches any accepted form and falls back to `puzzle`; ship a single `d` string instead.

### Full example

Every field the schema accepts, and nothing else:

```json
{
  "slug": "acme-search",
  "class": "Acme\\Search\\Plugin",
  "description": "Search the public web via the Acme API.",
  "icon": "M11 4a7 7 0 1 1-4.95 11.95l-2.43 2.43a1 1 0 0 1-1.42-1.42l2.43-2.43A7 7 0 0 1 11 4Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  "accent": "sky"
}
```

Add the [`autoload` block](/reference/plugin-schema#autoload-block) if your plugin ships its own vendor tree or a non-Composer source layout — the loader honours it, the schema does not describe it.

## Entry-point class

The class named in `class` must implement `Spora\Plugins\PluginInterface`. In practice, extend `Spora\Plugins\AbstractPlugin` — the base class supplies empty defaults for every hook so you only override what you actually use:

```php
namespace Acme\MyPlugin;

use Spora\Plugins\AbstractPlugin;
use Spora\Plugins\PluginInterface;

final class Plugin extends AbstractPlugin implements PluginInterface
{
    public function getName(): string { return 'My Plugin'; }

    /** @return array<class-string<\Spora\Tools\ToolInterface>> */
    public function tools(): array { return []; }
}
```

This page describes the **post-1.0 contract**. The interface was slimmed in 1.0: the data hooks `autoload()`, `drivers()`, and `recipePaths()` were removed (no in-tree plugin used them) and the three side-effect hooks `register()`, `routes()`, and `boot()` moved to PSR-14 events — see the [Lifecycle Events](#lifecycle-events) section below. The 0.x line carried a pre-1.0 deprecation window that emitted a one-line warning for every plugin still overriding the old hooks; that window closed at 1.0.

## Hooks

The data hook surface after the 1.0 cut. Every hook is optional — `AbstractPlugin` provides a no-op default for each, and a plugin that only needs `getName()` + `tools()` is perfectly valid.

| Hook                      | Returns                                         | Purpose                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getName()`               | `string`                                        | Human-readable name shown in the inventory UI and logs.                                                                                                                                                                                                                                                                                             |
| `tools()`                 | `class-string<ToolInterface>[]`                 | Tools contributed to the tool registry. Namespaced as `<plugin-slug>:<tool-name>` when sent to the LLM.                                                                                                                                                                                                                                             |
| `agentTemplatePaths()`    | `string[]`                                      | Absolute paths to Agent template files (`.json` / `.yaml` / `.yml`). See [Agent templates](/develop/plugins/author-guide/agent-templates).                                                                                                                                                                                                          |
| `skillPaths()`            | `string[]`                                      | Absolute paths to directories containing `SKILL.md` files. Each directory's immediate subdirectories are skill roots.                                                                                                                                                                                                                               |
| `schemaVersion()`         | `int`                                           | Bump every time a new migration file is added. `0` if no schema.                                                                                                                                                                                                                                                                                    |
| `migrationsPath()`        | `?string`                                       | Absolute path to the plugin's migrations directory, or `null` if no schema. The `{slug}_` filename prefix is enforced.                                                                                                                                                                                                                              |
| `apps()`                  | `class-string<AppInterface>[]`                  | Admin-UI side-panels contributed to the AppRegistry at container build time.                                                                                                                                                                                                                                                                        |
| `speechToTextProviders()` | `class-string<SpeechToTextProviderInterface>[]` | Speech-to-text provider classes participating in `Spora\Speech\SpeechToTextRegistry` alongside core's OpenAI-compatible transcriber. Only needed for a wire shape OpenAI-multipart cannot express. See [Speech providers](/develop/plugins/author-guide/speech-providers).                                                                          |
| `skillProviders()`        | `class-string<SkillProviderInterface>[]`        | Skill provider classes for skills that have **no directory** — user-authored, tenant-scoped, or synthesised. Ships [custom skills](/reference/concepts/skills#custom-skills); a static class list, read by the container at build time. See [Authoring a skill provider](/develop/plugins/author-guide/skills#shipping-a-provider-not-a-directory). |
| `searchProviders()`       | `class-string<SearchProviderInterface>[]`       | Search provider classes contributing to the host ⌘K palette's `Spora\Search\SearchProviderRegistry`. Distinct from `skillProviders()`: that makes a resource _readable_, this makes it _findable_. Core ships none, so every section the palette renders from the server comes from a plugin — see [Palette search](#palette-search).               |

> **Moved to events in 1.0.** The hooks `register()`, `routes()`, and `boot()` no longer exist on the interface. They became PSR-14 events — see [Lifecycle Events](#lifecycle-events) below. The hooks `autoload()`, `drivers()`, and `recipePaths()` were removed entirely; their data lives in `plugin.json` (PSR-4 mappings) or has no current consumers. The manifest `autoload` block is still read by the loader (`autoload.psr-4` / `autoload.files`) even though the published [`plugin.schema.json`](https://github.com/spora-ai/spora-core/blob/main/plugin.schema.json) does not list it — a strict JSON-Schema validator flags the block under its `additionalProperties: false`, but `PluginLoader` only enforces `slug` and `class`, so the block is honoured. `composer.json` remains the supported home for PSR-4 mappings; see [Plugin manifest schema](/reference/plugin-schema).

### Why `skillProviders()` is a data hook and not an event

`speechToTextProviders()`, `skillProviders()`, and `searchProviders()` all contribute a **static list of class names**, and all are read the same way: the container asks `PluginLoader` for the merged class list once, during build, and resolves the classes itself. None is behaviour, so none is a PSR-14 event. `PluginLoader` keeps the latter two on separate accessors (`skillProviderClasses()`, `searchProviderClasses()`) so the two hooks have independent precedence and no helper has to invent a merge order between them.

The timing is what settles it. Subscriber wiring runs _after_ plugin discovery and _before_ the container is built, but a plugin that tried to register a provider from a listener would be registering into a registry the container is in the middle of constructing — a second owner, and one that has to be re-entrant on warm boots where the manifest cache short-circuits discovery. A list returned from a data hook has neither problem: `PluginLoader::skillProviderClasses()` is a pure read over the already-discovered plugins, so it is correct on cold and warm boots alike.

`PluginLoader` explains the same reasoning at the accessor: a mutable registry populated from `boot()` "would arrive too late — the registry that would read it is built in the same pass — and would need a second owner." Core's own `FilesystemSkillProvider` is listed first in the static class list, so a plugin provider can never shadow a shipped skill by reusing its name; see [Custom skills](/reference/concepts/skills#custom-skills).

`searchProviders()` merges the same way and at the same point — a PHP-DI factory in `OrchestratorContainerBindings`, not a per-search decision. The factory concatenates core's `search_provider_classes` with `PluginLoader::searchProviderClasses()` and the `SearchProviderRegistry` binding resolves each merged class once, when the registry itself is first resolved. Identical in kind to `skillProviders()`; the paragraph above about subscriber wiring not landing in time applies to it verbatim.

A `SearchProviderInterface` is deliberately narrower than a skill provider — `search()` returns provenance-filtered summaries only, so there is no file read to police, and an implementation must stay inside the `SearchContext` it is handed (an empty context means return `[]`; widening it is a cross-tenant read).

### Palette search

`GET /api/v1/search` ([SearchController](https://github.com/spora-ai/spora-core/blob/main/app/Http/SearchController.php)) is the one index the ⌘K palette queries. It resolves the caller's visible principal ids once, hands them to every registered provider as a `SearchContext`, and returns a flat `hits` array; the palette groups the hits into one section per distinct `type`. The query is clamped to 200 characters rather than rejected, and an empty `q` returns an empty hit list without reaching a provider.

**Core ships no provider.** It used to ship `Spora\Search\Providers\SkillSearchProvider`, and it was deleted: its `hrefFor()` built the palette URL from the skill's own `source` and returned `null` whenever no Vue app was registered under that source — which is true for every shipped `filesystem` skill, so the entire core catalogue was unlinkable, and core has no page to display a skill at all. Core was referencing a plugin path it does not own. The container's `search_provider_classes` is now `[]`; the seam is the extension point, not a core implementation.

Two plugins now consume it:

| Plugin                                                                                 | Class                       | `type()`        | `href`                                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`spora-plugin-custom-skills`](https://github.com/spora-ai/spora-plugin-custom-skills) | `CustomSkillSearchProvider` | `skill`         | `/apps/custom-skills/skill/{name}` for its own skills, `/apps/custom-skills/library/{name}` for shipped and foreign ones — never null |
| [`spora-plugin-media-archive`](https://github.com/spora-ai/spora-plugin-media-archive) | `MediaAssetSearchProvider`  | `media-archive` | `/apps/media-archive/asset/{id}` — always                                                                                             |

`CustomSkillSearchProvider` enumerates **all** visible skills through core's `SkillProviderRegistry`, so shipped and custom skills appear in one list with no work from the other providers — which is why it can sit in a plugin while still covering skills core ships. Its href branches on ownership rather than on a source it can guess: a skill this plugin owns is principal-scoped and writable, so it opens on the desk; anything else is read-only content, and the desk would render it under a scope bar announcing a principal it does not have.

`MediaAssetSearchProvider` is the first non-skill consumer. It reuses core's `applyPrincipalIdScope()` ownership predicate shape — `principal_id IN (…) OR (principal_id IS NULL AND agent_id IN (…))` — rather than its own plugin's `MediaArchiveAdminController::canEdit()`. `canEdit()` is a _mutation_ gate answering a different question: it reads `user_id`, the column that says who pushed the bytes, and lets admins through unconditionally. `SearchContext` hands out principal ids and core resolves them the same way for every caller, so reproducing that bypass would be exactly the cross-tenant read the interface forbids.

### `type()` is a global namespace, not per-plugin

`SearchProviderRegistry` de-duplicates on `type::id`, first provider wins — the same precedence rule as `SkillProviderRegistry`, core first so installing a plugin cannot change an existing result. Two providers returning the same `type` **and** the same `id` means the second one's hit is silently dropped; a colliding `type` with disjoint ids merely merges two sections in the palette.

So `type()` is a namespace shared by every installed plugin, and `id` is a namespace within it. A plugin must not claim a `type` another plugin already ships — `skill` and `media-archive` are taken by the two providers above. Use the plugin slug, as `MediaAssetSearchProvider` does, and keep the value stable: it is half of the palette's dedup key and the palette title-cases it into a section header.

## Lifecycle Events

> **Why PSR-14?** Symfony Bundle, Laravel ServiceProvider, Shopware Plugin, and Magento Module all converged on the same shape: a thin interface for "what does this extension contribute" plus a publish/subscribe surface for "what does this extension do on boot." Spora adopts the same division — the hook table above is the data; the events below are the behaviour.

Plugins opt in to lifecycle behaviour by implementing `Symfony\Component\EventDispatcher\EventSubscriberInterface` and returning the event → method map from `getSubscribedEvents()`. `PluginLoader` wires every subscriber on every boot (see the [Cache-warmth wrinkle](#cache-warmth-wrinkle) below) and `Kernel` dispatches the events at the right moment.

> **Note:** import the `Symfony\Component\EventDispatcher` interface, not the `Symfony\Contracts` one — the `Contracts` package ships only `EventDispatcherInterface` and `Event`, so `Symfony\Contracts\EventDispatcher\EventSubscriberInterface` **does not exist** and a plugin that names it is silently never wired. Both loaders `instanceof`-check the `Component` variant, and so does every in-tree plugin. The `SporaExtensionInterface` docblock still names the `Contracts` one; ignore it.

The three lifecycle events:

| Event                    | Payload (`$event->…`)                           | When                                                                                                                                                   |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ContainerBuildingEvent` | `builder(): DI\ContainerBuilder`                | Once per process, after the App's autoload is registered, before the container is built. Mutate the builder to add DI bindings.                        |
| `RoutesRegisteringEvent` | `routes(): MiddlewareRouteCollector`            | Per request, after core and App routes are registered, before the router is built. Add routes to the running collector.                                |
| `BootingEvent`           | `container(): Psr\Container\ContainerInterface` | Once per process — on the first request handled by it, after the container is built and the database has booted. Read services off the live container. |

`PluginLoader` dispatches `ContainerBuildingEvent` from `registerPlugins(ContainerBuilder)`, `RoutesRegisteringEvent` from `registerRoutes(MiddlewareRouteCollector)`, and `BootingEvent` from `bootExtensions(ContainerInterface)` (with a single null-tolerant guard for legacy callers). The `App` follows the same pattern via `AppLoader`.

### Worked example — `spora-plugin-memories`

[`spora-plugin-memories`](https://github.com/spora-ai/spora-plugin-memories) is the canonical subscriber reference: it ships two migrations, one admin app, two LLM-callable tools, 14 REST routes, and the `memories/assistant` agent template. Its entry point subscribes to both `ContainerBuildingEvent` and `RoutesRegisteringEvent`:

```php
namespace Spora\Plugins\Memories;

use Spora\Events\ContainerBuildingEvent;
use Spora\Events\RoutesRegisteringEvent;
// Imports for the constants above:
use Spora\Http\Middleware\AuthMiddleware;
use Spora\Http\Middleware\CsrfMiddleware;
use Spora\Plugins\AbstractPlugin;
use Spora\Plugins\PluginInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

final class MemoriesPlugin extends AbstractPlugin
    implements PluginInterface, EventSubscriberInterface
{
    private const AUTH = [AuthMiddleware::class, CsrfMiddleware::class];

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
            MemoryQueryInterface::class   => \DI\autowire(MemoryQueryService::class),
            MemoryCommandInterface::class => \DI\autowire(MemoryCommandService::class),
            // …remaining bindings unchanged…
        ]);
    }

    public function onRoutesRegistering(RoutesRegisteringEvent $event): void
    {
        // Global (principal-scoped) memories
        $event->routes()->addRoute('GET',  '/api/v1/memories', [MemoryController::class, 'index'],   self::AUTH);
        $event->routes()->addRoute('POST', '/api/v1/memories', [MemoryController::class, 'store'],   self::AUTH);
        // …remaining routes unchanged…
    }
}
```

A plugin that only needs DI bindings (e.g. `spora-plugin-email` for `ImapClient`, `spora-plugin-openai-image` for the OpenAI client) subscribes to `ContainerBuildingEvent` alone. `BootingEvent` is rarely needed — reach for it when you must call a container service at startup (e.g. registering a cron with the scheduler).

Listeners are called in the order returned by `getSubscribedEvents()`. Use the third array element (`['methodName', $priority]`) when two listeners need a deterministic order — Symfony dispatches higher priorities first.

### Cache-warmth wrinkle

`PluginLoader` writes a sha256 stamp to `storage/.plugins_stamp` after each successful boot. On a warm boot the loader re-instantiates plugins from a sidecar JSON copy of the manifests instead of re-parsing each `plugin.json` from disk — but it does **not** skip the events. `Kernel` calls `registerPlugins(ContainerBuilder)` unconditionally on every boot, so `ContainerBuildingEvent` fires on warm and cold boots alike, and `RoutesRegisteringEvent` is dispatched per request either way. The wrinkle is that `wireEventSubscribers()` has to run _outside_ the cache hit/miss branch: it is called on every boot, after `boot()` and before the first dispatch, so a plugin restored from the sidecar is still attached to the dispatcher. Wire it inside the cache check and listener wiring would silently disappear on warm boots, taking the DI bindings and routes with it. See the `PluginLoader::wireEventSubscribers()` docblock (`spora-core/app/Plugins/PluginLoader.php`) for the full rationale. The cost is a cheap reflection-based subscriber re-bind per plugin per process; the gain is correct DI bindings and route registration on every boot, warm or cold.

## Stability contract

Spora divides its PHP surface into two zones. Plugins should depend only on the public zone; reaching into the framework-internal zone is a breaking-change risk and is not covered by SemVer deprecation windows.

### Plugin-stable (depend freely)

- `Spora\Plugins\PluginInterface` and the ten data hooks on `Spora\Extensions\SporaExtensionInterface` (`getName`, `tools`, `apps`, `skillPaths`, `skillProviders`, `searchProviders`, `speechToTextProviders`, `agentTemplatePaths`, `schemaVersion`, `migrationsPath`).
- `Spora\Skills\SkillProviderInterface` plus its two wire types `SkillSummary` / `SkillDescriptor` and the `SkillProviderRegistry` — the seam a custom-skill plugin implements. The five members and the `MAX_FILE_BYTES` constant are frozen; see [Authoring a skill provider](/develop/plugins/author-guide/skills#the-interface-contract).
- `Spora\Search\SearchProviderInterface` plus its two wire types `SearchHit` / `SearchContext` and the `SearchProviderRegistry` — the seam a palette-search plugin implements. Core ships no implementation, so this is the whole palette-search surface. See [Palette search](#palette-search) and [Author guide → Worked example: a palette search provider](/develop/plugins/author-guide/foundations#worked-example-a-palette-search-provider).
- `Spora\Events\*` (the three lifecycle events) and the PSR-14 `Symfony\Component\EventDispatcher\EventSubscriberInterface` opt-in pattern documented in [Lifecycle Events](#lifecycle-events).
- The orchestrator and task services: `Spora\Agents\AgentOrchestrator`, `Spora\Services\TaskService` (and its `TaskServiceInterface`).
- The `#[Tool]` attribute and the `ToolInterface` contract for declaring plugin-supplied tools.
- The two media-archive registration interfaces — `Spora\Services\MediaArchive\MediaDerivativeProducerInterface` and `Spora\Services\MediaArchive\MediaMimeRefinerInterface` — each paired with its registry class in the same namespace (`MediaDerivativeProducerDiscovery`, `MediaMimeRefinerDiscovery`). These are plugin contracts: implement the interface, then register the FQCN with the registry's idempotent `::add()` call (e.g. `MediaMimeRefinerDiscovery::add(MyRefiner::class)`) from a `ContainerBuildingEvent` subscriber — the post-1.0 replacement for the deleted `register(ContainerBuilder)` hook. A producer contributes a derivative format and, through `supportedSourceFormats()`, keeps that source format uploadable; see [The producer union is a second allowlist surface](/reference/concepts/media-assets#the-producer-union-is-a-second-allowlist-surface) for the coupling that creates. `MediaMimeRefinerInterface` is the newer of the two; implement it when a format your plugin handles sniffs as a coarser container type than it really is (an OOXML document libmagic reports as `application/zip`), and return `null` to decline. Refiners must be constructible without arguments — the consumer instantiates them statically and has no container to resolve their collaborators with. Producers are the opposite: the consumer resolves them through the container, so they may take constructor arguments.
- The `plugin.json` manifest fields documented above. The `slug` field is the only one that must stay stable across releases.

### Framework-internal (do not depend on)

The driver / history value-object layer is **framework-internal** and may change between minor releases without deprecation:

- `Spora\Drivers\ValueObjects\LLMResponse`, `Spora\Drivers\ValueObjects\ContentBlock`, `Spora\Drivers\ValueObjects\Usage`
- `Spora\Agents\ValueObjects\HistoryMessageContext`
- Anything else under `Spora\Drivers\` or `Spora\Agents\ValueObjects\`

If your plugin needs a value the orchestrator surface does not already expose, open an issue describing the use case — the fix is to add a stable accessor on `TaskService`, not for plugins to reach into the internal layer.

## Database migrations

Plugins that need their own tables declare a schema version and a migrations path:

```php
public function schemaVersion(): int     { return 1; }
public function migrationsPath(): ?string { return __DIR__ . '/../database/migrations'; }
```

Migration files follow the same anonymous-class pattern as core migrations and **must be prefixed with the plugin slug**:

```text
database/migrations/
└── acme-search_000001_create_search_index_table.php
```

```php
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;

return new class extends Migration {
    public function up(): void {
        Capsule::schema()->create('search_index', static function (Blueprint $table): void {
            $table->id();
            $table->string('keyword')->index();
            $table->timestamps();
        });
    }

    public function down(): void {
        Capsule::schema()->dropIfExists('search_index');
    }
};
```

The slug prefix is enforced at install time — `DatabaseSchemaInstaller` throws a `RuntimeException` if any migration file in the plugin's path lacks the `{slug}_` prefix.

## Tool namespacing

Plugin tools are automatically prefixed with their `slug` when sent to the LLM, e.g. a tool with `#[Tool(name: 'web_search')]` in a plugin with slug `acme-search` is exposed to the LLM as `acme-search:web_search`. This ensures plugin tools never collide with core tools or tools from other plugins.

Core tools use their plain `#[Tool(name:)]` value without any prefix.

The prefix is derived automatically from the loaded plugins — `ToolDefinitionBuilder::qualifiedToolName()` walks `PluginLoader::getPlugins()` and prepends the slug of the first plugin whose `tools()` list contains the class (`app/Agents/ToolDefinitionBuilder.php:307-317`) — so no changes to the plugin's `#[Tool]` attribute are needed.

## Shipping third-party dependencies

For plugins that depend on external Composer packages, run `composer install --no-dev` inside the plugin directory before deployment and declare the vendor autoloader in the manifest:

```json
{
  "slug": "acme-search",
  "class": "Acme\\Search\\Plugin",
  "autoload": {
    "files": ["vendor/autoload.php"]
  }
}
```

Spora will `require_once` the file before instantiating the plugin. The plugin's vendor tree is completely isolated from the host application's vendor tree.

## Manifest validation

`PluginLoader` enforces structural correctness at boot time and throws `PluginLoadFailedException` for any of the following:

- Invalid JSON in `plugin.json`
- Missing or non-string `slug` field
- `slug` value that does not match `^[a-z0-9][a-z0-9_-]*$`
- Missing or non-string `class` field
- A `class` that cannot be resolved via PSR-4 autoloading (bad `autoload.psr-4` mapping, missing composer.json entry, etc.), or that resolves to a class not implementing `PluginInterface`

The exception message includes the manifest path and the declared FQCN so the failure is straightforward to diagnose from a log line.

The following conditions result in a silent skip rather than a fatal error:

- **Duplicate slug** — a second plugin with the same `slug` as an already-loaded plugin.
- **Duplicate class** — a second plugin manifest pointing to the same entry-point FQCN as an already-loaded plugin.

In both cases the second plugin is quietly ignored. If a plugin appears to be "not found" at runtime, check that its slug and class are unique across all plugins in the plugins directory.

## Security

Plugins are loaded by `Spora\Plugins\PluginLoader` (`app/Plugins/PluginLoader.php`) at boot. They are **not sandboxed** — a plugin runs as ordinary PHP code with full access to the application, the database, the file system, and any decrypted credentials. Only install plugins from sources you trust, and review their `plugin.json` manifest and source before deployment.

For the broader security model (credential encryption, API auth, rate limiting), see the [Security](/start/operators/security) page.

### Boot-time stamp cache

`PluginLoader` writes a sha256 stamp to `storage/.plugins_stamp` after each successful boot. The stamp hashes every discovered manifest (path, mtime, content hash) across `<base>/plugins/`. On the next boot with an unchanged stamp, the loader re-instantiates plugins from a sidecar JSON (`storage/.plugins_stamp.cache.json`), skipping the manifest re-discovery. This eliminates the per-request cost of N file reads + N JSON parses for operators with many plugins.

The cache is invalidated automatically when any manifest's path, mtime, or content changes. It is also invalidated by a corrupt or missing sidecar (the loader falls back to full discovery and rewrites both files). The stamp path is currently non-configurable; advanced operators can clear it by removing the two files.

## Installing third-party plugins

Spora plugins are distributed as standalone PHP packages. The canonical way to install one is the `plugin:install` CLI command — it wraps `composer require` with the `spora-ai/installer` package so the plugin lands in the right place and its manifest is picked up on the next request. The `plugins/` directory is still supported as an escape hatch for plugin authors iterating on a sibling git checkout; see the options below.

The canonical reference implementation is [`spora-ai/spora-plugin-memories`](https://github.com/spora-ai/spora-plugin-memories) — it ships two migrations, an admin app, two LLM-callable tools, 14 REST routes, and the `memories/assistant` agent template. It is the canonical subscriber for the [lifecycle events](#lifecycle-events) above. Use it as a starting point when authoring your own plugin.

### Recommended — `bin/spora plugin:install`

```bash
php bin/spora plugin:install spora-plugin-memories
php bin/spora spora:install   # applies the plugin's migration
```

`plugin:install` is a thin wrapper around `composer require` that pins the right install path and runs `--optimize-autoloader`. The plugin's `plugin.json` manifest is auto-discovered on the next request; its tools are registered with the orchestrator and surfaced in `GET /api/v1/plugins`.

For development against a sibling git checkout, pass `--path`:

```bash
php bin/spora plugin:install spora-plugin-memories --path=/abs/path/to/checkout
```

The remaining options are listed under [Plugin CLI commands](#plugin-cli-commands).

### Option A — Drop into `plugins/` (legacy / path-based)

```bash
cd /path/to/your/spora
git clone https://github.com/spora-ai/spora-plugin-memories.git plugins/memories
php bin/spora spora:install   # applies the plugin's migration
```

Useful for plugin authors iterating on a plugin before tagging a release, or when you need the plugin's source visible at a stable path for debugging. The `plugins/` directory is gitignored by the operator skeleton.

### Install via Composer (`composer require`)

For a minimal install — no CLI wrapper — `composer require` works directly when the operator skeleton is in use (the bundled `spora-ai/installer` Composer plugin routes `spora-plugin` packages to `plugins/{$name}/` automatically):

```bash
composer require spora-ai/spora-plugin-tavily:^0.2
composer require spora-ai/spora-plugin-serper:^0.2
composer require spora-ai/spora-plugin-semantic-scholar:^0.1
composer require spora-ai/spora-plugin-worldnews:^0.1
composer require spora-ai/spora-plugin-weather:^0.1
composer require spora-ai/spora-plugin-calendar:^0.1
composer require spora-ai/spora-plugin-email:^0.1
php bin/spora spora:install   # applies the plugin's migration
```

### Install via the Web UI

When the operator has opted in by setting `SPORA_PLUGIN_INSTALL_ENABLED=true` in the host's environment, admins can install and uninstall plugins from the **Plugins** page in the admin UI. The UI calls a set of write endpoints under `/api/v1/plugins/install/*` that wrap the same `Spora\Core\Extension\PluginManager` that `plugin:install` uses on the CLI. For the request/response shape, gating, and audit-log behaviour, see the [Plugin install API](/develop/plugins/install-api) page.

### Updating a plugin

For a CLI-installed plugin, run `php bin/spora plugin:update [package]` (or `php bin/spora plugin:install … --constraint=…` to pin a version). For a path-based install, pull the latest changes into the plugin directory and rerun `spora:install` to apply any new migrations.

The `storage/.plugins_stamp` cache invalidates automatically when the manifest content changes — no manual cache-bust needed.

### Uninstalling a plugin

1. `php bin/spora plugin:uninstall <package>` for a CLI-installed plugin, or drop the plugin directory for a path-based install.
2. Manually roll back any plugin-specific migrations (Spora does not auto-rollback plugin migrations on uninstall — see [Database migrations](#database-migrations)).
3. Optional: drop the plugin's database tables if you don't need the historical data.

## Plugin CLI commands

Spora ships four `plugin:*` commands in `bin/spora` for Composer-driven plugin lifecycle management. All four delegate to `Spora\Core\Extension\PluginManager`, which wraps `composer require`, `composer remove`, `composer update`, and `composer show --installed` respectively.

| Command                      | Purpose                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `plugin:install <package>`   | Install a plugin from Packagist (or a local path repo via `--path`) |
| `plugin:uninstall <package>` | Run `composer remove` for the given package                         |
| `plugin:update [<package>]`  | Update one plugin, or all of them when no argument is given         |
| `plugin:list`                | List installed `spora-plugin` packages with version and path        |

### `plugin:install`

```bash
php bin/spora plugin:install vendor/package
php bin/spora plugin:install vendor/package --constraint=^1.0
php bin/spora plugin:install vendor/package --path=/abs/path/to/checkout
```

`--constraint` and `--path` are mutually exclusive. `--path` registers the local checkout as a Composer path repository — useful during plugin development against a sibling git clone.

### `plugin:list`

```bash
php bin/spora plugin:list
```

Renders a table of every installed Composer package whose type is `spora-plugin`, with name, version, and filesystem path. Non-plugin dependencies (e.g. `symfony/console`) are filtered out.

### `plugin:update`

```bash
php bin/spora plugin:update                       # update every installed plugin
php bin/spora plugin:update vendor/package        # update a single plugin
```

Runs `composer update` against the plugin subset (or the entire project when no package is given).

### `plugin:uninstall`

```bash
php bin/spora plugin:uninstall vendor/package
```

Runs `composer remove`. Note that this does **not** roll back plugin-specific database migrations — see [Uninstalling a plugin](#uninstalling-a-plugin) above.
