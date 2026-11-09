---
title: Plugin author guide — Distribution
description: The `spora-plugin` keyword, the PSR-4 entry-point quirk, testing, SemVer versioning, and the release checklist.
---

# Distribution

You have working code on `main`. This chapter covers the five things to do before tagging a release: the `spora-plugin` Packagist keyword, the PSR-4 entry-point quirk that breaks installs if you get it wrong, the test/lint stack, SemVer versioning, and the canonical reference implementations to crib from.

## The `spora-plugin` type

A plugin's `composer.json` **must** declare `"type": "spora-plugin"`:

```json
{
  "name": "spora-ai/spora-plugin-foo",
  "type": "spora-plugin"
}
```

That is the field the machinery actually reads, in three places: the
`spora-ai/installer` Composer plugin routes the package to
`plugins/<package-last-segment>/` because of it, the core's plugin loader
recognises it, and the operator-facing catalog searches Packagist with
`?type=spora-plugin` to fill the Browse tab.

A `keywords` array is a convention worth keeping — `"spora-plugin"` in it
makes the package findable by keyword on Packagist — but nothing in the
code reads it, and published plugins that omit it still install and still
appear in the Browse tab. Two of the shipped plugins
(`spora-plugin-office`, `spora-plugin-typst`) carry other keywords only.

## PSR-4 entry-point quirk

The entry-point class **must** be reachable via PSR-4 autoloading, full stop. The loader relies on whatever PSR-4 prefix the plugin declares in `composer.json` and throws `PluginLoadFailedException` if the FQCN cannot be resolved.

Practical implication: **the file path must literally match the class name**.

For an entry-point declared as:

```json
"class": "Spora\\Plugins\\AcmeSearch\\AcmeSearchPlugin"
```

the file must live at:

```text
src/AcmeSearchPlugin.php
```

declared under the matching PSR-4 prefix in `composer.json`:

```json
"autoload": {
    "psr-4": {
        "Spora\\Plugins\\AcmeSearch\\": "src/"
    }
}
```

The `spora-ai/installer` Composer plugin (transitive dep of `spora-core`) handles the path routing — `composer require spora-ai/spora-plugin-foo` on a Spora install lands the package at `plugins/<package-last-segment>/` (e.g. `plugins/foo/`) where `PluginLoader` expects to find it. The destination directory is derived from the package name, not the manifest slug, so if you rename the manifest slug you do not have to move the install path.

> **The skeleton's entry point follows the rule.** `spora-plugin-skeleton` declares
> `"class": "Spora\\Plugins\\Skeleton\\SkeletonPlugin"` and the class lives at
> `src/SkeletonPlugin.php` under the `Spora\\Plugins\\Skeleton\\` prefix. Earlier
> versions shipped it as `src/Plugin.php` with a mismatched name; name the file to
> match the FQCN.

The loader resolves the entry point through the PSR-4 mapping the plugin declares, and falls back to nothing: there is no `file` override and no `require_once` fallback for the entry-point class itself. (The `autoload.files` key in a manifest is still honoured, but it loads ordinary files — it cannot stand in for the entry point.)

If you see _"Plugin manifest … declares class … but the class is not autoloadable"_ at boot, the cause is almost always a class-name vs filename mismatch or a missing PSR-4 mapping in `composer.json` (regenerate the classmap with `composer dump-autoload` after adding the prefix).

## Testing

The reference plugins use **Pest 5** as the test runner (the skeleton template is still on Pest 4). The skeleton ships with `composer test`, `composer analyse` (PHPStan), and `composer lint` (PHP-CS-Fixer) wired up.

### Layout

```text
tests/
└── Unit/
    └── Tools/
        └── AcmeSearchToolTest.php
```

The autoload-dev PSR-4 mapping in `composer.json` exposes the namespace:

```json
"autoload-dev": {
    "psr-4": {
        "Spora\\Plugins\\AcmeSearch\\Tests\\": "tests/"
    }
}
```

### Conventions

- Extend the tool's behaviour, not its internals — hit `execute()` end-to-end whenever possible.
- Use **Mockery** (`mockery/mockery:^1.6`) to stub the HTTP client. Declare `phpstan/phpstan-mockery` in your own `require-dev` and include its `extension.neon` from your `phpstan.neon` — a plugin does not inherit the framework's dev dependencies.
- For migrations, **replay them into an in-memory SQLite database** instead of mocking the schema. Boot `new Spora\Core\Database(new Spora\Core\Config(['SPORA_DB_DRIVER' => 'sqlite', 'SPORA_DB_PATH' => ':memory:']))`, then `require` each file in your own `database/migrations/` and call `up()` on it — the host installer only runs plugin migrations behind a `PluginLoader`, which a plugin's own suite does not wire. `spora-plugin-custom-skills/tests/Pest.php` has the working pattern.
- Cover the happy path, one failure path, and one credential-missing path per tool.

### Skeleton scripts

Copy these from `spora-plugin-skeleton/composer.json`:

```json
"scripts": {
    "test": "pest",
    "analyse": "phpstan analyse --no-progress",
    "lint": "php-cs-fixer fix --dry-run --diff --no-interaction"
}
```

The framework's CI gates on three things — Pest (on PHP 8.4, 8.5, MySQL and MariaDB), PHPStan and a php-cs-fixer dry run — and its own composer scripts are `composer test:parallel`, `composer analyse` and `composer format`. That is the contract your plugin should meet before tagging a release; run the same three against your own checkout.

## Versioning

Plugins follow **SemVer** (`vX.Y.Z` tags). A plugin's constraint on the
framework is a range, not a caret — the shipped plugins use
`>=0.30.0 <2.0.0`.

| Bump  | When                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| Major | Renamed tools, removed settings keys, changed manifest fields, dropped migrations, PHP major version bump. |
| Minor | New tools or settings keys, new optional fields, new drivers.                                              |
| Patch | Bugfixes, docstring changes, dependency bumps that don't change the public surface.                        |

### Release checklist

1. All CI green (`composer test`, `composer analyse`, `composer lint`).
2. `composer.json` carries `"type": "spora-plugin"` — that field is the load-bearing one; a `keywords` array is a good convention but nothing reads it.
3. `plugin.json` validates against [plugin.schema.json](https://docs.spora-ai.com/schemas/plugin.schema.json) — the published schema, which is what editors fetch via the `$schema` key. (The copy in `spora-core`'s repo root is stale and is not the contract.)
4. `phpstan.neon` and `phpunit.xml` are present (copied from the skeleton template).
5. Tag format `vX.Y.Z` — never tag from a PR branch, only from `main` after CI is green.
6. Push the tag, then **create a GitHub Release** so Packagist picks up the version.

The catalog queries Packagist's `search.json` API, so a version appears there once Packagist has indexed the tag. Pushing the tag is what makes the version resolvable; creating the GitHub Release alongside it gives the entry the metadata Packagist shows.

## Reference implementations

The two canonical starting points:

- **[`spora-ai/spora-plugin-skeleton`](https://github.com/spora-ai/spora-plugin-skeleton)** — minimal template, copy-and-rename. The `composer.json` is the canonical example of `type`, scripts, and PSR-4 mapping.
- **[`spora-ai/spora-plugin-memories`](https://github.com/spora-ai/spora-plugin-memories)** — production example. Two tools, an admin app, two migrations (the second is forward-only — its `down()` is an empty body, so there is no rollback path for the principals/type/UUID change), custom DI bindings, 14 REST routes, and the canonical `Symfony\Component\EventDispatcher\EventSubscriberInterface` opt-in for the [lifecycle events](/reference/concepts/plugins-system#lifecycle-events). The closest real-world analogue to anything an author will actually need to build.

Other public plugins (`spora-plugin-tavily`, `spora-plugin-serper`, `spora-plugin-semantic-scholar`, `spora-plugin-worldnews`, `spora-plugin-weather`, `spora-plugin-calendar`, `spora-plugin-email`) are minimal single-tool plugins — ideal for studying the **minimum viable plugin** shape before adding tooling.

Per-plugin reference pages (Installation, Configuration, Per-tool parameters, Development) live under [Plugins → Reference](/develop/plugins/reference/) — that index is the maintained list. Not every published plugin has a page yet.
