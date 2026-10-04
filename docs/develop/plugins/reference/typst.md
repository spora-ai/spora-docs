---
title: Typst
description: Compile Typst source to PDF/PNG/SVG from an agent conversation, with Inter/DejaVu/Latin Modern fonts bundled under the OFL.
---

# Typst Plugin for Spora

Typesets documents from [Typst](https://typst.app) source inside a [Spora](https://github.com/spora-ai/spora) conversation. The agent writes `.typ` markup, runs a read-only inspector pass to catch syntax errors, then compiles to PDF, PNG, or SVG — the output lands in the Media Archive as a proper derivative and renders inline in chat.

The plugin also ships an admin panel at `/apps/typst` (five tabs: **Fonts**, **Templates**, **Examples**, **Images**, **Editor**) for managing a per-principal resource library, and a `TypstRenderProducer` registered with core's `MediaDerivativeProducerDiscovery` so any admin surface can dispatch a render.

Architecturally the plugin draws a hard line: **inputs on the filesystem, outputs in the media archive.** Fonts, templates, examples, and image inputs are plain files under `<storage>/typst/<principal>/` and never create `media_assets` rows. Only the rendered PDF/PNG/SVG flows through `MediaDerivativeService` and surfaces as a media-asset URL.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-typst
php bin/spora spora:install
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the two tools reach the LLM as `typst:typst_compile` and `typst:typst_resources` — plugin tools carry a `<plugin-slug>:` prefix on the wire (see [Concepts → Tools → Tool naming](/reference/concepts/tools#tool-naming)). Both sit in the `generation` category.

## Requirements

`ext-typst` is a **native PHP extension**, not a Composer package. It is a hard `require` in the plugin's `composer.json` (`"ext-typst": "*"`), so Composer will refuse to resolve the tree on a host that doesn't have it. [ext-typst](https://ext-typst.carthage.software/) ships via PECL:

```bash
pecl install typst
```

PHP must be `^8.4.1`. On a shared host where you cannot install a PHP extension, this plugin is not installable — there is no pure-PHP fallback, and no "preview mode" that degrades gracefully.

The frontend package `spora-ai/spora-plugin-typst-frontend` is a **hard Composer requirement** (not a `suggest`), because the admin panel is a Vue app the host serves from `public/plugins/typst/main.js`. It ships a prebuilt `main.js` + `style.css`, so no Node.js toolchain is needed on the server — the tool calls work without it, but the admin panel and its upload/list/edit affordances do not.

`spora-plugin-media-archive` is _not_ required. It is listed under `suggest`: when installed, it renders the Typst derivatives in its gallery; when absent, nothing breaks.

## Configuration

The tools declare no `#[ToolSetting]` attributes, so there is nothing to fill in under Settings → Tools. Configuration is entirely filesystem- and principal-shaped.

### Per-principal storage layout

```text
<storage>/typst/<principal>/
  templates/            # .typ document skeletons the agent composes from
  examples/             # .typ pattern snippets the agent cribs from
  fonts/                # .ttf / .otf / .woff / .woff2 uploads
  <image files>         # images live flat at the root, not in an images/ subdir
```

Every path is scoped to the **principal** (a user, a team, or an org), not to the operator globally. Two principals on the same Spora install each get their own template directory, their own font directory, and their own image library; neither sees the other's resources through `list`, `read`, or `delete`. `TypstWorldFactory` also sets the per-principal root as ext-typst's `template_dir`, so a `#include` cannot reach across principals even by accident.

Images live at the principal root rather than an `images/` subdirectory on purpose: `template_dir` is the principal root, so `#image("logo.png")` resolves there. The image listing filters by extension so the shared directory stays clean in the API.

### Two resource tiers

Every `list` returns the union of both tiers, deduplicated by basename with tier-2 first. Reads try tier-2, then tier-1. Writes and deletes only ever touch tier-2.

| Tier              | Location                                                  | Writable | Origin value |
| ----------------- | --------------------------------------------------------- | -------- | ------------ |
| 1 (skill-shipped) | `<plugin>/skills/typst/{fonts,templates,examples}/`       | no       | `skill`      |
| 2 (principal)     | `<storage>/typst/<principal>/{fonts,templates,examples}/` | yes      | `principal`  |

Tier-2 shadows tier-1 on a basename collision, so an operator can override a bundled file by uploading one of the same name. `delete` on a tier-1 basename is rejected — the bundled baseline cannot be stripped.

### Limits

| Limit                                   | Value                                                                        | Source                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Bytes per resource (write **and** read) | 5 MiB (5 242 880)                                                            | `TypstResourceStore::MAX_BYTES`, `TypstImageStore::MAX_BYTES`                |
| Basename charset                        | `A-Z a-z 0-9 . _ -`, max 128 chars; `/`, `\`, `..` rejected                  | `TypstResourceStore::validateBasename()`                                     |
| Image MIME allowlist                    | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`                     | `TypstImageStore::ALLOWED_MIMES`                                             |
| Source MIME                             | `text/x-typst` (the de-facto convention; ext-typst registers no MIME for it) | `TypstRenderProducer::SUPPORTED_SOURCE_MIMES`                                |
| Derivative formats                      | `pdf`, `png`, `svg`                                                          | `TypstRenderProducer::SUPPORTED_FORMATS`                                     |
| PNG `ppi`                               | 36–600 on the wire, default 144; operator UI offers 72 / 144 / 288 / 600     | `TypstRenderProducer::MIN_PPI` / `MAX_PPI` / `DEFAULT_PPI` / `SUPPORTED_PPI` |
| ext-typst world cache                   | 64 MiB per `World` allocation                                                | `TypstWorldFactory::CACHE_BYTES`                                             |

## Fonts

`ext-typst` does **not** auto-discover system fonts — it only sees what is in the `font_dirs` array the plugin hands it. That is why the plugin bundles a working set: a bare `$x^2$` on a host with STIX or Cambria installed still aborts with "no font could be found".

| Family              | Weights shipped                   | Licence                   | Use for                              |
| ------------------- | --------------------------------- | ------------------------- | ------------------------------------ |
| `Inter`             | Regular, Bold                     | SIL Open Font License 1.1 | Body and headings (UI-tuned)         |
| `DejaVu Sans`       | Regular, Bold, Italic, BoldItalic | DejaVu License            | Body fallback for glyphs Inter lacks |
| `DejaVu Sans Mono`  | Regular, Bold, Italic, BoldItalic | DejaVu License            | Code blocks (`#raw`, fenced blocks)  |
| `DejaVu Serif`      | Regular, Bold, Italic, BoldItalic | DejaVu License            | Serif body fallback                  |
| `Latin Modern Math` | Regular                           | SIL Open Font License 1.1 | Math mode (`$…$`, display equations) |

> **Licensing.** The font binaries live in `skills/typst/fonts/` under their own licences — `OFL.txt` covers Inter and Latin Modern Math, `LICENSE-dejavu.txt` covers the DejaVu families. Both files ship inside the plugin. Redistribution of either set is governed by its own licence, not the plugin's MIT; a deployment that ships the plugin to end users inherits those terms.

The recommended cascade, which the plugin also preprends to every source it renders (so a document with no explicit font choice still renders):

```typst
#set text(font: ("Inter", "DejaVu Sans", "DejaVu Serif"))
#show math.equation: set text(font: ("Latin Modern Math", "DejaVu Sans"))
```

`TypstWorldFactory::prelude()` supplies the first two lines. Because the prelude is prepended, an operator's own `#set text(font: …)` later in the file overrides it. `embed_default_fonts` is `false` on the world, so ext-typst does not silently bake Latin Modern into every output.

## Per-tool parameters

Both tools use a **two-level discriminator**: an `action` that selects the operation, and — on `typst_resources` — a second `op` parameter that selects the verb within that operation. The `action` property is synthesised by the schema builder from the `#[ToolOperation]` declarations; you never declare it yourself.

`typst_compile` has **two** actions and no `op`. `typst_resources` has **five** actions, four of which take the four verbs `list` / `write` / `delete` / `read`; the fifth (`media_assets`) takes the single verb `import`. Pairings the runtime considers nonsensical — `images` + `import`, `media_assets` + `write` — are rejected with a `typst_resources: action "<x>" does not accept op "<y>"` failure before anything touches disk.

### `typst:typst_compile` — action × op

| Action    | Approval by default | What it does                                                                                                    |
| --------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `render`  | yes                 | Compiles source to PDF/PNG/SVG and persists the result as a media derivative.                                   |
| `inspect` | no                  | Read-only inspector pass. Returns the structured error and warning list, produces no output and writes no rows. |

| Parameter  | Type    | Required | Default | Notes                                                                                                                                                                                                              |
| ---------- | ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `source`   | string  | no¹      | —       | Inline Typst source.                                                                                                                                                                                               |
| `file`     | string  | no¹      | —       | Polymorphic: a media-asset UUID **or** a basename under the caller's `templates/` or `examples/`, resolved per principal.                                                                                          |
| `format`   | string  | no       | `pdf`   | `pdf` \| `png` \| `svg`. Ignored on `inspect`.                                                                                                                                                                     |
| `filename` | string  | no       | auto    | Basename for the playground parent row when rendering inline `source`; `.typ` is auto-appended. Omitted → the tool generates `inline-YYYYMMDD-HHMMSS-XXXX.typ`. Ignored when `file` is supplied, and on `inspect`. |
| `page`     | integer | no       | `0`     | 0-indexed page for `png`/`svg`. Clamped to the document's last page, not rejected. Ignored on `inspect` or `format=pdf`.                                                                                           |
| `ppi`      | number  | no       | `144`   | Pixels per inch for `png` only; clamped to 36–600. Ignored on `inspect`, `pdf`, and `svg`.                                                                                                                         |

¹ At least one of `source` / `file` is required **at runtime**; both are schema-optional so the LLM driver does not coerce an empty string into another type. The failure message is `Typst tool: either 'source' (inline string) or 'file' (media asset id …) is required`.

`file` and `filename` are distinct keys, and LLMs routinely conflate them: `file` references an existing source, `filename` labels the row materialised from inline source. Re-rendering the same `(file, format)` tuple refreshes the existing derivative row in place (the natural key is `(parent_id, format, producer_plugin, producer_operation)`), so a bookmarked URL stays valid. Two renders with the same `filename` create **sibling** parent rows rather than overwriting, so the operator can compare revisions in the file picker.

### `typst:typst_resources` — action × op

All five actions are enabled by default and **none** require approval by default. Approval is a per-action property on the tool, not a per-verb one — the `list` / `read` / `write` / `delete` verbs inside a single action share that action's approval setting.

| Action         | Valid `op` values                 | Store                       | Notes                                                                                                                                                                                       |
| -------------- | --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fonts`        | `list`, `write`, `delete`, `read` | text (`TypstResourceStore`) | `.ttf` / `.otf` fonts.                                                                                                                                                                      |
| `templates`    | `list`, `write`, `delete`, `read` | text                        | Full document skeletons.                                                                                                                                                                    |
| `examples`     | `list`, `write`, `delete`, `read` | text                        | Pattern snippets.                                                                                                                                                                           |
| `images`       | `list`, `write`, `delete`, `read` | binary (`TypstImageStore`)  | `read` always returns base64. `write` takes text inline — for real binary uploads use the admin panel's images endpoint.                                                                    |
| `media_assets` | `import` **only**                 | —                           | Copies a Media Archive asset into the principal's image library. A peer action, deliberately not a verb on `images`, so the orchestrator routes it to one code path with a fixed arg shape. |

| Parameter  | Type   | Required | Default | Notes                                                                                                                                                   |
| ---------- | ------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `op`       | string | no       | `list`  | Enum: `list` \| `write` \| `delete` \| `read` \| `import`.                                                                                              |
| `name`     | string | no       | —       | Basename. Required for `write` / `delete` / `read`; ignored for `list`; optional for `media_assets` import (falls back to the source asset's filename). |
| `content`  | string | no       | —       | UTF-8 file contents for `op=write`. Base64-encode and pre-decode binary payloads here.                                                                  |
| `asset_id` | string | no       | —       | Media Archive UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, optional `.ext`) for `action=media_assets`. Required for `import`.                          |

`media_assets` + `import` exists because ext-typst resolves every `#image()` path as **filesystem-relative** against the principal's `template_dir`. The canonical `/api/v1/assets/<uuid>.<ext>` media-archive URL does not resolve in `#image()`. Import copies the bytes into the principal's image library, which is served at `/api/v1/typst/images/<basename>` — the only image URL form ext-typst accepts:

```text
1. image_muse(prompt: "autumn landscape")                    → /api/v1/assets/<uuid>.webp
2. typst_resources(action: "media_assets", op: "import",
                   asset_id: "<uuid>", name: "autumn.webp")
                                                              → /api/v1/typst/images/autumn.webp
3. typst_compile(action: "render",
                 source: "#image(\"/api/v1/typst/images/autumn.webp\", width: 80%)",
                 format: "pdf")
```

Import only accepts `data_url` and `local` storage modes on assets visible to the caller; `external`-mode assets are rejected with a message asking the source plugin to re-ingest with bytes. The MIME allowlist and the 5 MiB cap match the upload side. Import is idempotent — re-importing the same `(principal, name)` overwrites the file.

## What it returns

### `inspect`

A text block with either `typst_compile: no diagnostics (the source parses cleanly under the inspector)` or a count line followed by one bullet per diagnostic, with `hint:` lines appended where ext-typst supplies them. The data channel carries the structured form:

```json
{
  "errors": [{ "severity": "Error", "message": "…", "hints": ["…"] }],
  "warnings": [{ "severity": "Warning", "message": "…", "hints": [] }],
  "success": false
}
```

`inspect` never writes a `media_assets` row — inline source is handed straight to `inspectString()` with no parent materialisation.

### `render`

A `Rendered <FORMAT>` heading, a markdown block the chat UI renders inline, and a trailing instruction telling the agent to echo the block verbatim and read raw URLs from the data channel rather than constructing its own:

```text
Rendered PDF

[Open PDF](https://…/api/v1/assets/<uuid>.pdf)

![Typst PDF render of letter.typ (first-page preview)](https://…/api/v1/assets/<preview>.png)

Echo the markdown block above verbatim so the chat UI renders the result inline. For raw URLs (e.g. to embed in a follow-up tool call), read ToolResult.data.asset_urls. Do NOT invent or rewrite URLs — `file://` and external domains are unsupported; the data channel is the only authoritative source. ToolResult.data.source_id is the parent .typ row — call media.get_source(source_id) to read it back for the iterate loop; ToolResult.data.preview_id (PDF renders only) is the first-page PNG sibling.
```

For `png` and `svg` the markdown block is a single image. For `pdf` it is an `[Open PDF](url)` link **plus** a first-page PNG preview, because PDFs are not image-embedable in the chat sanitiser. The preview is rendered once and persisted as a sibling derivative; if it fails, the PDF render still succeeds.

| Data field               | What it is                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `derivative_id`          | The rendered output row (PDF / PNG / SVG bytes). Probing it with `media.get_source` returns the PDF, never the `.typ`.                                                |
| `source_id`              | The parent `.typ` row (`text/x-typst`). `media.get_source(source_id)` returns the bytes that were just compiled — this is what closes the read → modify → write loop. |
| `preview_id`             | First-page PNG sibling row. PDF renders only; omitted for `png` / `svg`.                                                                                              |
| `preview_url`            | Canonical URL of the preview sibling. PDF renders only.                                                                                                               |
| `asset_urls`             | List of canonical URLs for the rendered bytes. Kept plural even with one entry so a multi-page future does not change the field's type.                               |
| `format`, `mime`, `size` | Self-describing metadata for the rendered bytes.                                                                                                                      |
| `width`, `height`        | Populated for `png` only.                                                                                                                                             |

> The HTTP compile endpoint's JSON payload keeps the singular `asset_url` (the playground frontend binds to it). The LLM-facing tool deliberately uses the plural list.

### Resources

`list` returns a text block plus `data.resources` rows of `{ name, kind, origin, size, modified_at }` for the text kinds and `{ name, mime, size, modified_at }` for images. `read` inlines the bytes for templates and examples; `fonts` and `images` return base64 under `data.content_base64` so a binary payload cannot corrupt the tool-result transport. `write` returns `{ path, name, kind, size }`. `media_assets` + `import` returns `{ asset_id, name, url, mime, size, renamed, original_name }`.

## Admin panel

`/apps/typst` is a Vue app served by the host from `public/plugins/typst/main.js`, contributed by [`spora-ai/spora-plugin-typst-frontend`](https://github.com/spora-ai/spora-plugin-typst-frontend). Five tabs:

| Tab           | What it does                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Fonts**     | List and upload tier-2 fonts; marks bundled (tier-1) fonts as non-deletable.                                            |
| **Templates** | List, upload, edit, and delete `.typ` document skeletons. "Open Copy in Editor" hands the source to the Editor tab.     |
| **Examples**  | The same surface for pattern snippets.                                                                                  |
| **Images**    | Upload and grid-view the per-principal image library; insert the `/api/v1/typst/images/<basename>` URL into a document. |
| **Editor**    | Typst source editor with a format selector and a result panel. Formerly "Playground".                                   |

A principal chip row at the top switches which principal's library you are looking at, so an operator can copy a template from one principal to another. The Editor defaults to the **preview** endpoint (`POST /api/v1/typst/preview`, which returns bytes inline and writes nothing) so that each render does not add a parent row to the media archive; the agent-facing `typst_compile` render path still persists.

Behind the panel are **25 REST routes** under `/api/v1/typst/`, all behind `AuthMiddleware` + `CsrfMiddleware`:

| Group              | Routes                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| Fonts              | `GET`/`POST /fonts`, `GET`/`DELETE /fonts/{name}`                                  |
| Templates          | `GET`/`POST /templates`, `GET`/`PUT`/`DELETE /templates/{name}`                    |
| Examples           | `GET`/`POST /examples`, `GET`/`PUT`/`DELETE /examples/{name}`                      |
| Images             | `GET`/`POST /images`, `GET`/`DELETE /images/{name}`                                |
| Render             | `POST /compile` (persists a derivative), `POST /preview` (inline bytes, no writes) |
| Playground sources | `GET`/`POST /sources`, `GET`/`PUT`/`DELETE /sources/{id}`                          |

The compile body is `{ source, name?, format?, page?, ppi? }`; `name` defaults to `playground.typ`, `format` to `pdf`, `ppi` is clamped to 36–600.

`plugin.json` also carries an `autoload` block (`psr-4` → `src/`) that the loader reads, even though the plugin manifest schema does not describe that field. It mirrors the Composer `autoload` block and exists so the package works when it is routed into `plugins/` by the Composer installer.

## Skills

The plugin ships one skill, `typst` (`skills/typst/SKILL.md`), plus its resource payload:

- `SKILL.md` — when to use Typst, tool selection, the inline-vs-file decision, format/page/PPI semantics, a syntax primer, the font cascade, error handling, the verbatim-echo contract, and a limits checklist.
- `templates/report.typ` — a one-page report skeleton taking a `data` dictionary (`title`, `subtitle`, `author`, `date`, `sections`, `summary`).
- `examples/showcase.typ` — a full syntax demo document.
- `fonts/` — the five bundled families plus both licence files.

The skill is `allowedByDefault: "false"` and declares `requiresTools: typst_compile,typst_resources`, so the agent-tools UI offers to activate it (and `SkillTool`) when the operator enables either Typst tool.

## Agent template

`agent-templates/typst-expert.json` — id **`typst-expert`**, name "Spora Typst Expert", version 1.3.0. It is a PDF + chat-teaser specialist: its standard output is **two artefacts per request**, a low-PPI PNG teaser plus a full-quality PDF, teaser first so the chat preview sits above the link.

It enables all seven operations across both tools — `render`, `inspect`, `fonts`, `templates`, `examples`, `images`, `media_assets` — and auto-approves every one of them, including `render` (which requires approval by default at the tool level). It allows the `typst` skill, caps the agent at 10 steps, and carries the pre-versioned `required_plugins: ["spora-ai/spora-plugin-typst"]` so the template only installs once the plugin is present.

The system prompt encodes the rules the tool layer cannot enforce: inspect before rendering, prefer `origin: "principal"` resources over `origin: "skill"` ones, always `read` before `write`, pick PPI by use case, import media-archive images before embedding them, and echo both markdown blocks verbatim.

## Development

```bash
composer install
composer test:parallel     # Pest
composer analyse           # PHPStan level per phpstan.neon
composer lint              # php-cs-fixer dry-run
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan, php-cs-fixer dry-run, plus an `integration` job that boots the plugin in a throwaway `spora-core` skeleton and asserts it routes to `plugins/spora-plugin-typst/`, and a `sonarcloud` job (project key `spora-ai_spora-plugin-typst`) fed by the PHP 8.4 build's Clover + JUnit artifacts.

`pecl install typst` runs with `continue-on-error: true` and every Composer step passes `--ignore-platform-req=ext-typst`, so the suite stays green on runners without the extension: the producer and world-factory tests skip themselves when `Typst\World` is unavailable. `stubs/typst.php` gives PHPStan a shadow of the `Typst\*` classes so static analysis works on the same runners. This means a green CI run is _not_ evidence that the compile path works — the render path is only exercised where `ext-typst` is actually installed. MIT license.

---

**Repo:** [spora-ai/spora-plugin-typst](https://github.com/spora-ai/spora-plugin-typst) · **Frontend:** [spora-ai/spora-plugin-typst-frontend](https://github.com/spora-ai/spora-plugin-typst-frontend) · **MIT**
