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

| Hook                      | Returns                                         | Default | Purpose                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getName()`               | `string`                                        | —       | Human-facing name shown in admin UIs.                                                                                                                                                                                                     |
| `tools()`                 | `class-string<ToolInterface>[]`                 | `[]`    | Tools contributed to the tool registry. See [Tools](/develop/plugins/author-guide/tools).                                                                                                                                                 |
| `agentTemplatePaths()`    | `string[]`                                      | `[]`    | Absolute paths to Agent template files (`.json` / `.yaml` / `.yml`). See [Agent templates](/develop/plugins/author-guide/agent-templates).                                                                                                |
| `skillPaths()`            | `string[]`                                      | `[]`    | Absolute paths to skill directories; each immediate subdirectory is a skill root containing a `SKILL.md`. See [Skills](/develop/plugins/author-guide/skills).                                                                             |
| `schemaVersion()`         | `int`                                           | `0`     | Bump every time a new migration file is added. `0` if the plugin has no schema. See [Migrations](/develop/plugins/author-guide/migrations).                                                                                               |
| `migrationsPath()`        | `?string`                                       | `null`  | Absolute path to the plugin's migrations directory, or `null` if it has no schema.                                                                                                                                                        |
| `apps()`                  | `class-string<AppInterface>[]`                  | `[]`    | UI side-panels contributed to the App registry. See [Admin UI](/develop/plugins/author-guide/admin-ui).                                                                                                                                   |
| `speechToTextProviders()` | `class-string<SpeechToTextProviderInterface>[]` | `[]`    | Speech-to-text provider classes. See [Speech providers](/develop/plugins/author-guide/speech-providers).                                                                                                                                  |
| `skillProviders()`        | `class-string<SkillProviderInterface>[]`        | `[]`    | Skill providers for skills with **no directory** — user-authored, tenant-scoped, or synthesised. A shipped skill is a directory plus `skillPaths()`.                                                                                      |
| `searchProviders()`       | `class-string<SearchProviderInterface>[]`       | `[]`    | Sources of ⌘K palette hits. Makes a resource **findable**, where `skillProviders()` makes it **readable**. Core ships no provider of its own. See [Worked example: a palette search provider](#worked-example-a-palette-search-provider). |

### Worked example: a palette search provider

Two methods and one hook, and only two shipped implementations to copy: [`spora-plugin-custom-skills`](https://github.com/spora-ai/spora-plugin-custom-skills) ships `CustomSkillSearchProvider` (`type()` = `skill`) and [`spora-plugin-media-archive`](https://github.com/spora-ai/spora-plugin-media-archive) ships `MediaAssetSearchProvider` (`type()` = `media-archive`). Core ships **no** implementation — the interface is the whole surface.

Reach for it when your plugin owns content the ⌘K palette should find by name, and only then. `skillProviders()` makes something _readable_ to an agent; `searchProviders()` makes it _findable_ to a person. A plugin with neither a searchable resource nor an app to open is adding nothing.

### The interface contract

```php
namespace Spora\Search;

interface SearchProviderInterface
{
    /** Palette section bucket, e.g. `skill` or a plugin slug. */
    public function type(): string;

    /** @return list<SearchHit> Hits for a query, most relevant first. */
    public function search(string $query, SearchContext $context): array;
}
```

Deliberately narrower than `SkillProviderInterface`: `search()` returns provenance-filtered summaries, so there is no unknown-vs-invisible distinction to make and no file read to police.

`SearchHit` is a small value object — `type`, `id`, `label`, and three nullable fields. Two of them carry rules:

- **`$id` is stable within `$type`** and is half of what the palette de-duplicates on.
- **`$href` is nullable by design, not an oversight.** The host has no page for every searchable thing, so a provider that cannot name a destination returns `null` and says so rather than inventing a 404. The palette renders such a hit as an inert row and skips it during arrow-key selection. If your plugin ships an app (see [Admin UI](/develop/plugins/author-guide/admin-ui)), return the path to it — `/apps/{slug}/…`, `rawurlencode`d — because a hit you cannot open is a row that does nothing.

### The three rules the registry depends on

1. **Stay inside the `SearchContext`.** Iterate `$context->principalIds()` and nothing else, and return `[]` when it is empty. Scope that is built from the context is structural: there is no branch in your code a later edit can widen. `spora-plugin-media-archive` is the cautionary example — its own controller has a `canEdit()` gate that reads `user_id` and lets admins through unconditionally. Copying that into a search provider would be precisely the cross-tenant read the interface forbids; it reuses core's `applyPrincipalIdScope()` predicate shape instead (`principal_id IN (…) OR (principal_id IS NULL AND agent_id IN (…))`).
2. **Fail soft.** A provider that throws contributes nothing and is logged by the registry rather than dropped in silence — ⌘K is a global affordance, so one broken plugin must not take the whole palette down.
3. **`type()` is a global namespace, not per-plugin.** The registry de-duplicates on `type::id`, first provider wins; core is first, so installing a plugin cannot change an existing result. Two providers with the same `type` **and** the same `id` means the second one's hit is silently dropped; a colliding `type` with disjoint ids merges two sections. Use the plugin slug and check what is already shipped — `skill` and `media-archive` are taken.

### A minimal provider

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\AcmeSearch;

use Spora\Search\SearchContext;
use Spora\Search\SearchHit;
use Spora\Search\SearchProviderInterface;

final class AcmeDocumentSearchProvider implements SearchProviderInterface
{
    /** The cap is a UX bound, not a security one — scope is already applied. */
    private const MAX_HITS = 20;

    public function __construct(private AcmeDocumentQuery $documents)
    {
    }

    public function type(): string
    {
        return 'acme-search';
    }

    /**
     * @return list<SearchHit>
     */
    public function search(string $query, SearchContext $context): array
    {
        $principalIds = $context->principalIds();
        if ($principalIds === []) {
            return [];
        }

        $hits = [];
        foreach ($this->documents->matching($query, $principalIds, self::MAX_HITS) as $doc) {
            $hits[] = new SearchHit(
                type: $this->type(),
                id: (string) $doc->id,
                label: $doc->title,
                subLabel: $doc->summary,
                href: '/apps/acme-search/document/' . rawurlencode((string) $doc->id),
            );
        }

        return $hits;
    }
}
```

Then register it beside `skillProviders()` on the entry point — the two hooks are independent, and a plugin may implement either, both, or neither:

```php
final class AcmeSearchPlugin extends AbstractPlugin
{
    /** @return list<class-string<\Spora\Skills\SkillProviderInterface>> */
    public function skillProviders(): array
    {
        return [AcmeTenantSkillProvider::class];
    }

    /** @return list<class-string<\Spora\Search\SearchProviderInterface>> */
    public function searchProviders(): array
    {
        return [AcmeDocumentSearchProvider::class];
    }
}
```

Registration is all the wiring most providers need: `SearchProviderRegistry` resolves each merged class straight from the container, and PHP-DI autowires anything whose constructor arguments it can satisfy — including the no-argument provider, which is what `MediaAssetSearchProvider` is. A provider that needs something the container cannot autowire declares the definition from a `ContainerBuildingEvent` subscriber, as [Lifecycle is events, not hooks](#lifecycle-is-events-not-hooks) describes.

**Enumerate a skill catalogue instead of reimplementing one.** If your searchable content is skills, do not query the `skills` tables yourself — core's `SkillProviderRegistry` already enumerates every visible skill, shipped and custom, through every registered provider. `CustomSkillSearchProvider` takes `SkillProviderRegistry` in its constructor and calls `getSkills($principalId)` once per visible principal. That is how a plugin-owned provider can cover skills core ships.

### What the consumer does with it

`GET /api/v1/search` resolves the caller's visible principals once, hands them to every provider as a `SearchContext`, and returns the hits flattened. `CommandPalette.vue` debounces the query, calls the endpoint, groups the hits into **one section per distinct `type`**, and appends those sections after its existing client-side ones. Providers are not asked to name a section: the palette title-cases `type` into the header.

The local sections — actions, groups, my agents, agents by group, recent chats — stay client-side and read the Pinia stores. A provider for each of those would have to ship in `spora-core` first, so a plugin cannot supply them and should not try.

### Testing

1. **Empty context returns `[]`** before any query runs. That is the cross-tenant test.
2. **A foreign principal yields nothing.** Seed a row owned by a principal outside the context and assert it is absent.
3. **Ranking** — assert the tier order, not just membership: a name-prefix match must outrank a description-only match, because prose is weak evidence.
4. **`href`** — assert both branches when they differ (own content vs foreign), and that a name containing a space or a `/` comes back `rawurlencode`d.
5. **A throwing provider** — assert the registry logs and continues rather than taking the palette down.

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
