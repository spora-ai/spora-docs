---
title: Plugin manifest schema
description: plugin.json — every field, validation rule, and example for shipping a Spora plugin.
---

# Plugin manifest schema

Every Spora plugin ships a `plugin.json` at the root of its package. The `PluginLoader` reads it at boot and rejects invalid manifests with `PluginLoadFailedException` before the rest of the application boots.

The schema is defined in [plugin.schema.json](https://github.com/spora-ai/spora-core/blob/main/plugin.schema.json) (JSON Schema draft-07) in the framework repo. This page is the human-readable reference.

For the **how to author a plugin** walkthrough, see [Develop → Plugins → Author guide](/develop/plugins/author-guide). For the **operator install flow**, see [Install API](/develop/plugins/install-api).

## Top-level fields

| Field         | Type   | Required | Validation                              | Description                                                                                                                                                                                                                                                                             |
| ------------- | ------ | -------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`        | string | yes      | `^[a-z0-9][a-z0-9_-]*$`                 | Machine identifier. Stable across releases. Used as the `schema_versions` component key and as the migration filename prefix.                                                                                                                                                           |
| `class`       | string | yes      | non-empty string, FQCN                  | Entry-point class. Must implement `Spora\Plugins\PluginInterface` and resolve via PSR-4 autoloading.                                                                                                                                                                                    |
| `description` | string | no       | max 500 chars                           | Short human-readable description surfaced by the inventory UI.                                                                                                                                                                                                                          |
| `icon`        | string | no       | one of three forms (see below)          | Icon shown next to the plugin in admin UIs. Defaults to `"puzzle"`.                                                                                                                                                                                                                     |
| `autoload`    | object | no       | shape: `{ psr-4: {...}, files: [...] }` | PSR-4 namespace → path mappings + bootstrap files. **Note:** `autoload` in `plugin.json` is a re-declaration of what `composer.json` should already declare. The framework reads `composer.json`'s autoload first; the manifest's `autoload` is a fallback for sibling-clone workflows. |

`additionalProperties: false` — extra fields are rejected outright.

## `icon` field — three forms

The framework accepts three forms in `icon` (in priority order):

### 1. Bundled name

A kebab-case identifier from the curated palette:

```json
{ "icon": "puzzle" }
```

Common bundled names: `puzzle` (default), `brain`, `lightbulb`, `compass`, `globe`, `sparkles`, `file-text`, `database`, `calendar`, `search`, `mail`, `music`, `zap`, `code`, plus a UI utility set (`bell`, `check`, `x`, `plus`, `chevron-*`, `arrow-right`, `menu`, `grid`, `user`, `logout`, `settings`, `sun`, `moon`, `warning`, `pencil`, `trash`, `star`, `clock`, `computer`, `tools`, `file`, `chat`, `agents`, `shield-check`, `user-plus`, `eye`, `lock`, `check-circle`, `info`, `error-circle`).

### 2. Full `<svg>` string

A complete SVG element for multi-primitive icons:

```json
{
  "icon": "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z\"/></svg>"
}
```

The host's outer `<svg>` tag is discarded; the host's class, fill, stroke, viewBox, stroke-width win. The inner children are sanitized to a tight allowlist (`path`, `circle`, `ellipse`, `polyline`, `polygon`, `rect`, `g`) via DOMPurify before being rendered with `v-html`. Other tags and attributes are stripped.

### 3. Raw SVG path

A single path string starting with a path command letter (`M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z`, lowercase or uppercase):

```json
{
  "icon": "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"
}
```

Limited to single-path icons. Smaller than the `<svg>` form.

If `icon` is omitted, the backend defaults it to `"puzzle"`. If `icon` is set but doesn't match any of the three forms, the frontend falls back to the bundled `puzzle` icon.

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

**Important:** PSR-4 mappings belong in `composer.json`, not `plugin.json`. The manifest's `autoload` is a fallback for sibling-clone dev workflows (`SPORA_PLUGINS_PATHS=/path/to/checkout`) where the plugin isn't installed via Composer. The `PluginLoader` reads `composer.json`'s autoload first; the manifest's `autoload` is a backstop for the path-installed case.

## Full example

```json
{
  "slug": "acme-search",
  "class": "Acme\\Search\\AcmeSearchPlugin",
  "description": "Web search via the Acme API.",
  "icon": "globe",
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

- **Version** is taken from `composer.json` (no `version` field in the manifest).
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
- [Plugin reference](/develop/plugins/reference/) — per-plugin reference for the 10 plugins in the Spora org
