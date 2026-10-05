---
title: Plugin manifest schema
description: plugin.json — every field, validation rule, and example for shipping a Spora plugin.
---

# Plugin manifest schema

Every Spora plugin ships a `plugin.json` at the root of its package. The `PluginLoader` reads it at boot and rejects invalid manifests with `PluginLoadFailedException` before the rest of the application boots.

The schema is defined in [plugin.schema.json](https://github.com/spora-ai/spora-core/blob/main/plugin.schema.json) (JSON Schema draft 2020-12) in the framework repo and published at [`https://docs.spora-ai.com/schemas/plugin.schema.json`](https://docs.spora-ai.com/schemas/plugin.schema.json) for editor tooling. This page is the human-readable reference. The JSON file is the contract: a CI job diffs the published copy against `spora-core@main`, so it cannot drift from what the loader actually enforces. Where this page and the schema disagree, the schema wins.

For the **how to author a plugin** walkthrough, see [Develop → Plugins → Author guide](/develop/plugins/author-guide). For the **operator install flow**, see [Install API](/develop/plugins/install-api).

## Top-level fields

| Field         | Type   | Required | Validation                                             | Description                                                                                                                                                                                                               |
| ------------- | ------ | -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`        | string | yes      | `^[a-z0-9][a-z0-9_-]*$`                                | Machine identifier. Stable across releases. Used as the `schema_versions` component key and as the migration filename prefix.                                                                                             |
| `class`       | string | yes      | non-empty string, FQCN                                 | Entry-point class. Must implement `Spora\Plugins\PluginInterface` and resolve via PSR-4 autoloading.                                                                                                                      |
| `description` | string | no       | max 500 chars                                          | Short human-readable description surfaced by the inventory UI.                                                                                                                                                            |
| `icon`        | string | no       | one of two forms (see below)                           | Icon shown next to the plugin in admin UIs. Defaults to `"puzzle"`.                                                                                                                                                       |
| `accent`      | string | no       | `violet`, `amber`, `emerald`, `sky`, `rose`, `primary` | Tile accent colour for the plugin's app tile; mirrors the enum in the host's `tileAccent()` map. Precedence: PHP `App::accent()` > this field > `"primary"`. Unknown or missing values fall back to `"primary"` silently. |

Those five are the **only** top-level properties, and `additionalProperties: false` — extra fields are rejected outright.

> **Note:** `autoload` is **not** one of them. The loader still reads an `autoload` block out of a manifest ([documented below](#autoload-block)), and five shipped plugins — `skeleton`, `staan`, `typst`, `word`, `zernio` — ship one, but the schema does not describe it, so a manifest carrying `autoload` does not validate. Declare PSR-4 mappings in `composer.json`; treat a manifest `autoload` block as loader behaviour, not as part of the contract.

## `icon` field — two forms

The schema accepts two forms in `icon`, resolved in this order: bundled name first, raw SVG path second.

### 1. Bundled name

A kebab-case identifier from the curated palette:

```json
{ "icon": "puzzle" }
```

Common bundled names: `puzzle` (default), `brain`, `lightbulb`, `compass`, `globe`, `sparkles`, `file-text`, `database`, `calendar`, `search`, `mail`, `music`, `zap`, `code`, plus a UI utility set (`bell`, `check`, `x`, `plus`, `chevron-*`, `arrow-right`, `menu`, `grid`, `user`, `logout`, `settings`, `sun`, `moon`, `warning`, `pencil`, `trash`, `star`, `clock`, `computer`, `tools`, `file`, `chat`, `agents`, `shield-check`, `user-plus`, `eye`, `lock`, `check-circle`, `info`, `error-circle`).

### 2. Raw SVG path

A single path string starting with a path command letter (`M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z`, lowercase or uppercase):

```json
{
  "icon": "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"
}
```

This is the smallest form in JSON, but it is limited to single-path icons — compose multi-shape glyphs with subpaths via `M`.

If `icon` is omitted, the backend defaults it to `"puzzle"`. If `icon` is set but matches neither form — including an empty or whitespace-only value — the frontend falls back to the bundled `puzzle` icon, silently.

> **There is no full-`<svg>` form.** A third form — a complete `<svg viewBox="0 0 24 24" …>…</svg>` blob — used to be documented here, and early plugin authors shipped it. It is gone. In the schema's own words: "Full `<svg>...</svg>` blobs are no longer accepted — the frontend's Icon component used to sanitise them through DOMPurify's SVG profile, but historical mXSS bypasses in that profile motivated dropping the `v-html` path entirely. Plugin authors should ship a single `d` string." The frontend no longer renders manifest markup at all, so there is nothing left to sanitise. A blob pasted into `icon` today matches neither form: no error, no warning, just the `puzzle` fallback. If your glyph needs primitives beyond a single path — a `circle`, a `rect`, a custom `stroke-width` — re-cut it as a path; one `d` string is the only shape the renderer still draws.

## `autoload` block

> **Not in the schema.** `autoload` is loader behaviour that the published schema does not describe, so a manifest carrying this block does not validate against it. Five shipped plugins ship one anyway (`skeleton`, `staan`, `typst`, `word`, `zernio`). This section documents what the loader does when it finds one.

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

Every field the schema accepts, and nothing else:

```json
{
  "slug": "acme-search",
  "class": "Acme\\Search\\AcmeSearchPlugin",
  "description": "Web search via the Acme API.",
  "icon": "globe",
  "accent": "sky"
}
```

Add the [`autoload` block](#autoload-block) if your plugin ships its own vendor tree or a non-Composer source layout — the loader honours it, the schema does not describe it.

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
