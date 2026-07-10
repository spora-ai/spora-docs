---
title: Plugin author guide — Distribution
description: The `spora-plugin` keyword, the PSR-4 entry-point quirk, testing, SemVer versioning, and the release checklist.
---

# Distribution

You have working code on `main`. This chapter covers the five things to do before tagging a release: the `spora-plugin` Packagist keyword, the PSR-4 entry-point quirk that breaks installs if you get it wrong, the test/lint stack, SemVer versioning, and the canonical reference implementations to crib from.

## The `spora-plugin` keyword

Plugins **must** include `"spora-plugin"` in their `composer.json` `keywords` array, alongside `"type": "spora-plugin"`:

```json
{
  "name": "spora-ai/spora-plugin-foo",
  "type": "spora-plugin",
  "keywords": ["spora-plugin", "spora"]
}
```

This is how the **operator-facing catalog** (P2 of the catalog plan, ships in the same release) discovers published plugins via Packagist's API. Without it, the plugin still installs fine via `plugin:install` or a direct GitHub URL — it just won't appear in the Browse tab.

A working `keywords` block on every published Spora plugin was verified on Packagist on 2026-07-04. Treat the keyword as load-bearing for discoverability. See [Install API](/develop/plugins/install-api) for the operator-facing catalog contract.

## PSR-4 entry-point quirk

The entry-point class **must** be reachable via PSR-4 autoloading, full stop. After the `fix/plugin-loader-psr4-entry-point` change in `spora-core`, the loader no longer supports a `file` override or `require_once` fallback — it relies on whatever PSR-4 prefix the plugin declares in `composer.json` and throws `PluginLoadFailedException` if the FQCN cannot be resolved.

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

> **Note on the skeleton's `src/Plugin.php`:** the skeleton's `src/Plugin.php` declares `final class SkeletonPlugin`, which violates the PSR-4 file-must-match-FQCN rule. The skeleton is the historical exception; `PluginLoader` resolves the class via the `class` field in `plugin.json`, not via the file name. For any new plugin, name the file to match the FQCN — `src/AcmeSearchPlugin.php` for `Spora\Plugins\AcmeSearch\AcmeSearchPlugin`.

If you see `"Plugin class X could not be resolved"` at boot, the cause is almost always a class-name vs filename mismatch or a missing PSR-4 mapping in `composer.json` (regenerate the classmap with `composer dump-autoload` after adding the prefix).

## Testing

The reference plugins use **Pest 4** as the test runner. The skeleton template ships with `composer test`, `composer analyse` (PHPStan), and `composer lint` (PHP-CS-Fixer) wired up.

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
- Use **Mockery** (`mockery/mockery:^1.6`) to stub the HTTP client. The core project ships `phpstan/phpstan-mockery` so Mockery annotations type-check cleanly.
- For migrations, **use the in-memory SQLite database fixture** (`tests/Fixtures/inmemory-sqlite.php` or boot `Database::bootDatabaseConnectionOnly()` in `beforeEach`) instead of mocking the schema.
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

CI in `spora-core` (`composer test && composer analyse`) is the same contract your plugin should meet before tagging a release.

## Versioning

Plugins follow **SemVer** (`vX.Y.Z` tags, `^X.Y` constraints in `composer.json`).

| Bump  | When                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| Major | Renamed tools, removed settings keys, changed manifest fields, dropped migrations, PHP major version bump. |
| Minor | New tools or settings keys, new optional fields, new drivers.                                              |
| Patch | Bugfixes, docstring changes, dependency bumps that don't change the public surface.                        |

### Release checklist

1. All CI green (`composer test`, `composer analyse`, `composer lint`).
2. `composer.json` carries `"type": "spora-plugin"` and `"keywords": ["spora-plugin", ...]`.
3. `plugin.json` validates against [plugin.schema.json](https://github.com/spora-ai/spora-core/blob/main/plugin.schema.json).
4. `phpstan.neon` and `phpunit.xml` are present (copied from the skeleton template).
5. Tag format `vX.Y.Z` — never tag from a PR branch, only from `main` after CI is green.
6. Push the tag, then **create a GitHub Release** so Packagist picks up the version.

The catalog indexes tags on every push; releasing a tag without a GitHub Release delays catalog visibility by up to a few minutes.

## Reference implementations

The two canonical starting points:

- **[`spora-ai/spora-plugin-skeleton`](https://github.com/spora-ai/spora-plugin-skeleton)** — minimal template, copy-and-rename. The `composer.json` is the canonical example of `type`, `keywords`, scripts, and PSR-4 mapping.
- **[`spora-ai/spora-plugin-minimax`](https://github.com/spora-ai/spora-plugin-minimax)** — production example. Four tools (image, speech, music, video) — lyrics are operations on the music tool, not a separate tool — plus DI bindings, a migration with both `up()` and `down()`, an HTTP client wrapper, and an opt-in log writer. The closest real-world analogue to anything an author will actually need to build.

Other public plugins (`spora-plugin-tavily`, `spora-plugin-serper`, `spora-plugin-semantic-scholar`, `spora-plugin-worldnews`, `spora-plugin-weather`, `spora-plugin-calendar`, `spora-plugin-email`) are minimal single-tool plugins — ideal for studying the **minimum viable plugin** shape before adding tooling.

Per-plugin reference pages (Installation, Configuration, Per-tool parameters, Development) live under [Plugins → Reference](/develop/plugins/reference/):

- [Skeleton](/develop/plugins/reference/plugin-skeleton) · [Tavily](/develop/plugins/reference/tavily) · [Serper](/develop/plugins/reference/serper) · [Semantic Scholar](/develop/plugins/reference/semantic-scholar) · [World News](/develop/plugins/reference/worldnews) · [Weather](/develop/plugins/reference/weather) · [Calendar](/develop/plugins/reference/calendar) · [Email](/develop/plugins/reference/email) · [MiniMax](/develop/plugins/reference/minimax) · [Zernio](/develop/plugins/reference/zernio)
