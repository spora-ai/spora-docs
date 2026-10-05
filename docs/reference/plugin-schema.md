---
title: Plugin manifest schema
description: plugin.json — every field, validation rule, and example for shipping a Spora plugin.
---

# Plugin manifest schema

Every Spora plugin ships a `plugin.json` at the root of its package. The `PluginLoader` reads it at boot and rejects invalid manifests with `PluginLoadFailedException` before the rest of the application boots.

The schema is JSON Schema draft 2020-12 and is published at [`https://docs.spora-ai.com/schemas/plugin.schema.json`](https://docs.spora-ai.com/schemas/plugin.schema.json) for editor tooling. This page is the human-readable reference for it.

> **The published schema is maintained in spora-docs.** It is no longer mirrored from the framework repo: the copy in `spora-core` is a stale earlier revision, and every `$schema` reference in a plugin manifest points at the docs copy, not that one. The published file is validated against every plugin manifest in the tree on each PR (`npm run check:plugin-schema`), so it cannot drift from what plugins actually ship. If you change the manifest contract, change the schema and the tables on this page together.

For the **how to author a plugin** walkthrough, see [Develop → Plugins → Author guide](/develop/plugins/author-guide). For the **operator install flow**, see [Install API](/develop/plugins/install-api).

## Top-level fields

| Field           | Type   | Required | Validation                                                | Description                                                                                                                                                                                                                                                                             |
| --------------- | ------ | -------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`          | string | yes      | `^[a-z0-9][a-z0-9_-]*$`                                   | Machine identifier. Stable across releases. Used as the `schema_versions` component key and as the migration filename prefix.                                                                                                                                                           |
| `class`         | string | yes      | non-empty string, FQCN                                    | Entry-point class. Must implement `Spora\Plugins\PluginInterface` and resolve via PSR-4 autoloading.                                                                                                                                                                                    |
| `$schema`       | string | no       | absolute URI                                              | URI of this schema, so editors and CI resolve the contract without a network round-trip. Every manifest in the spora-ai org points at the published copy. Read by no runtime code; safe to omit.                                                                                        |
| `name`          | string | no       | —                                                         | Package name — in practice the Composer package name from the plugin's `composer.json` (e.g. `spora-ai/spora-plugin-typst`). No runtime code reads it: `PluginLoader` keys on `slug` and `class`, and `PluginManager`'s inventory prefers `composer.json#name`. Keep the two in sync.   |
| `description`   | string | no       | max 500 chars                                             | Short human-readable description surfaced by the inventory UI.                                                                                                                                                                                                                          |
| `icon`          | string | no       | bundled name, or a raw path starting with `M`/`m` + digit | Icon shown next to the plugin in admin UIs. Defaults to `"puzzle"`, and falls back to it for any unrecognised value. Full `<svg>` blobs are not accepted.                                                                                                                               |
| `accent`        | string | no       | one of six tokens                                         | Tile accent colour for the app tile: `violet`, `amber`, `emerald`, `sky`, `rose`, or `primary`. Precedence is PHP `App::accent()` > this field > `"primary"`; unknown or missing values fall back to `"primary"` silently.                                                              |
| `autoload`      | object | no       | shape: `{ psr-4: {...}, files: [...] }`                   | PSR-4 namespace → path mappings + bootstrap files. **Note:** `autoload` in `plugin.json` is a re-declaration of what `composer.json` should already declare. The framework reads `composer.json`'s autoload first; the manifest's `autoload` is a fallback for sibling-clone workflows. |
| `frontendEntry` | string | no       | —                                                         | Path to a pre-built frontend bundle, letting a JSON-only plugin ship a UI without writing PHP. Read by `AppsController` as a fallback only — a plugin whose App class implements `VueAppInterface` has its PHP-declared entry win. No in-tree manifest ships this yet.                  |

`additionalProperties: false` — extra fields are rejected outright. This is deliberate: the loader **silently ignores** manifest keys it does not recognise, so this schema is the only surface that can tell you a key is a typo. A plugin that needs a genuinely new manifest field has to have it added to `plugin.schema.json` first — inventing a key in the manifest is a no-op at runtime.

> **Not accepted: `version`.** No in-tree manifest declares one and no runtime code reads one. The operator-facing version comes from the git tag Composer recorded at install time, so a hand-edited manifest version could only ever drift from the release operators actually see. See [What is NOT in the manifest](#what-is-not-in-the-manifest).

## `icon` field — two forms

The framework accepts two forms in `icon`, tried in this order:

### 1. Bundled name

A kebab-case identifier from the curated palette:

```json
{ "icon": "puzzle" }
```

Common bundled names: `puzzle` (default), `brain`, `lightbulb`, `compass`, `globe`, `sparkles`, `file-text`, `database`, `calendar`, `search`, `mail`, `music`, `zap`, `code`, plus a UI utility set (`bell`, `check`, `x`, `plus`, `chevron-*`, `arrow-right`, `menu`, `grid`, `user`, `logout`, `settings`, `sun`, `moon`, `warning`, `pencil`, `trash`, `star`, `clock`, `computer`, `tools`, `file`, `chat`, `agents`, `shield-check`, `user-plus`, `eye`, `lock`, `check-circle`, `info`, `error-circle`).

### 2. Raw SVG path

A single path string whose **first command must be a moveto**. The host's lead test is `/^(?:(?:M\s*\d)|(?:m\s*-?\d))/`, so the value must start with `M` or `m`, then optional whitespace, then a digit. A leading minus is accepted after a lowercase `m` only — `m-3 6` and `m -3 6` pass, `M-3 6` does not:

```json
{
  "icon": "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474 1.68l1.683 1.682a2.414 2.414 0 0 1-3.414 0z"
}
```

Only `M`/`m` may lead, and that is not an arbitrary restriction. The SVG spec requires a path to begin with a moveto, so `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A` and `Z` are not valid first commands — a conforming renderer would reject them too. Separately, requiring a digit after the lead letter is what stops kebab-case icon names like `layout-template` and `log-out` from being read as path data and handed to the browser's SVG validator. Supplying one of those letters as the first character silently falls back to `puzzle` rather than raising.

The distinction that matters in practice: **the lead is restricted to `M`/`m`, but the rest of the path is not.** Every other command — `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z` and their lowercase relative forms — is fine after that first moveto. Compose multi-shape glyphs as subpaths separated by further `M` commands. Single path string only.

> **Leading-dot coordinates are a known gap.** `M.5`, `M-.5` and `m-.5` are legal SVG and are what several icon sets emit, but they do not satisfy the host's lead test and fall back to `puzzle`. Write `M0.5` or `M 0.5` for a positive leading dot, and `m-0.5` or `m -0.5` for a negative one.

Full `<svg>…</svg>` blobs are **not** accepted — a third form older revisions of this page documented, and one early plugin authors shipped. The host used to sanitise them through DOMPurify's SVG profile and render them via `v-html`, but historical mXSS bypasses in that profile motivated dropping the `v-html` path entirely, so manifest strings are no longer rendered as markup at all. A blob matches neither form: no error, no warning, just the `puzzle` fallback. Ship a single `d` string, and if the glyph needs primitives beyond a single path — a `circle`, a `rect`, a custom `stroke-width` — re-cut it as one; a single `d` string is the only shape the renderer still draws.

If `icon` is omitted, the backend defaults it to `"puzzle"`. If `icon` is set but matches neither form, the frontend falls back to the bundled `puzzle` icon — so a rejected value is indistinguishable from an omitted one.

## `autoload` block

```json
{
  "autoload": {
    "psr-4": {
      "Acme\\Search\\": "src/",
      "Acme\\Shared\\": "lib/"
    },
    "files": ["vendor/autoload.php"]
  }
}
```

| Sub-key          | Type             | Description                                                                                                                                                              |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `autoload.psr-4` | object           | PSR-4 namespace → path mappings. Multiple entries supported.                                                                                                             |
| `autoload.files` | array of strings | PHP files to `require_once` before the plugin is instantiated. Use `["vendor/autoload.php"]` to load the plugin's own Composer dependency tree. Processed after `psr-4`. |

**Important:** PSR-4 mappings belong in `composer.json`, not `plugin.json`. `PluginLoader` registers the manifest's `autoload` after `composer.json`'s, so the manifest entries serve as a plugin-author override — useful for vendoring extra packages locally or pointing at non-Composer source trees. For the recommended Composer path-repository workflow, see [Local plugin development](/develop/plugins/local-development).

## Full example

A plugin that ships its own vendor tree — a non-Composer source layout, or a sibling clone — carries the [`autoload` block](#autoload-block) alongside:

```json
{
  "slug": "acme-search",
  "class": "Acme\\Search\\AcmeSearchPlugin",
  "description": "Web search via the Acme API.",
  "icon": "globe",
  "accent": "sky",
  "autoload": {
    "psr-4": {
      "Acme\\Search\\": "src/",
      "Acme\\Shared\\": "lib/"
    },
    "files": ["vendor/autoload.php"]
  }
}
```

## What is NOT in the manifest

The previous schema (≤ v0.5.x) accepted `version`, `dependencies`, and `file` overrides. Those were dropped when `PluginLoader` switched to PSR-4-only entry-point resolution (commit ref: `fix/plugin-loader-psr4-entry-point`):

- **Version** is taken from the git tag Composer recorded at install time (`Composer\InstalledVersions::getPrettyVersion()`). The runtime never reads `composer.json#version` — both the manifest contract and the runtime resolution are tag-driven, so a hand-edited bump can't drift from the release operators actually see.
- **Inter-plugin dependencies** are declared in `composer.json` (`"require"`), not the manifest.
- **PSR-4 mappings** belong in `composer.json`. The manifest's `autoload.psr-4` is a backstop, not a replacement.
- **`file` override** is gone — the loader instantiates `class` via PSR-4 and throws on failure.

## Validation

`PluginLoader` enforces structural correctness at boot time and throws `PluginLoadFailedException` for any of the following:

- Invalid JSON in `plugin.json`
- Missing or non-string `slug` field
- `slug` value that does not match `^[a-z0-9][a-z0-9_-]*$`
- Missing or non-string `class` field
- A `class` that cannot be resolved via PSR-4 autoloading (bad `autoload.psr-4` mapping, missing `composer.json` entry), or that resolves to a class not implementing `PluginInterface`

The exception message includes the manifest path and the declared FQCN so the failure is straightforward to diagnose from a log line.

**Silent skips** (no exception, no fatal):

- **Duplicate slug** — a second plugin with the same `slug` as an already-loaded plugin. The first loaded wins.
- **Duplicate class** — a second plugin manifest pointing to the same entry-point FQCN as an already-loaded plugin. The first loaded wins.

If a plugin appears to be "not found" at runtime, check that its `slug` and `class` are unique across all plugins in the plugins directory.

## Boot-time stamp cache

`PluginLoader` writes a sha256 stamp to `storage/.plugins_stamp` after each successful boot. The stamp hashes every discovered manifest (path, mtime, content hash) across all configured directories. On the next boot with an unchanged stamp, the loader re-instantiates plugins from a sidecar JSON (`storage/.plugins_stamp.cache.json`), skipping the manifest re-discovery. This eliminates the per-request cost of N file reads + N JSON parses for operators with many plugins.

The cache is invalidated automatically when any manifest's path, mtime, or content changes. It is also invalidated by a corrupt or missing sidecar (the loader falls back to full discovery and rewrites both files).

## What's next

- [Develop → Plugins → Author guide](/develop/plugins/author-guide) — how to write a plugin
- [Install API](/develop/plugins/install-api) — the operator install flow
- [Plugin reference](/develop/plugins/reference/) — per-plugin reference for the 19 plugins in the Spora org
