---
title: Office
description: Convert Markdown to Word (.docx), OpenDocument (.odt), RTF and PowerPoint (.pptx) through the media-derivatives abstraction, and read documents back as Markdown for the LLM.
---

# Office Plugin for Spora

Adds Office-document support to the [Spora](https://github.com/spora-ai/Spora) Media Archive. The plugin registers **derivative producers** with the host — one that renders Markdown into a document, one that extracts a document back into Markdown — for the two halves it covers, plus a MIME refiner that stops an upload from being rejected on a host whose libmagic only sees `application/zip`.

The plugin ships **no tool of its own**, no route and no admin app: the LLM drives both directions through core's existing `media` tool, so an `office_document` tool would be a second spelling of what the registry already exposes.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-office
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

> The old package `spora-ai/spora-plugin-word` is **deprecated, not deleted**: it stays published, and its `.docx` half keeps working. The new package adds the OpenDocument, RTF and PowerPoint halves and drops the personal-scope dependency on `fabeat/markdown-word` in favour of the maintained [`markdown-office`](https://github.com/markdown-office) packages.

### Remove the old package

Installing the new package means **removing** the old one:

```bash
composer remove spora-ai/spora-plugin-word
```

The two cannot both be installed. They register producers for the same (source MIME, format) pairs — `text/markdown` → `docx` and `docx` → `md` — under different plugin and operation names: the old package under `spora-plugin-word` / `word.render` / `word.extract`, the new one under `spora-plugin-office` / `office.render` / `office.extract`. A derivative's natural key is `(parent_id, format, producer_plugin, producer_operation)`, so the two claim different keys for the same work. Core's `MediaDerivativeService::findProducer()` returns the **first** registered match, so whichever plugin loses that race mints a **second** derivative for the same parent and format: a duplicate `.docx`, or a duplicate extract, beside the migrated one.

### The host needs one Composer plugin allowed

This is the one operator step the plugin adds, and it is not optional.

The PowerPoint half is built on `markdown-office/markdown-presentation`, which **patches** `phpoffice/phppresentation`: the library needs parts of upstream PHPPresentation that no released version carries yet, and it gets them by asking the installer to apply a patch. The patch is applied by the `cweagans/composer-patches` **Composer plugin**, and `allow-plugins` is a **root-project** setting. `spora-ai/installer` routes `spora-plugin` packages into `plugins/{name}/`, so a plugin's dependencies land in the **host's** tree — and the host's setting is the one that governs.

The host's `composer.json` therefore needs the entry:

```bash
composer config allow-plugins.cweagans/composer-patches true
```

`composer config` **adds** to the `allow-plugins` block the host already has; it does not replace it. The host skeleton's own block carries `spora-ai/installer` — the Composer plugin that routes `spora-plugin` packages into `plugins/{name}/` — alongside `composer/installers` and `pestphp/pest-plugin`, and the host needs all of them. Replacing the block with the `cweagans/composer-patches` entry alone takes `spora-ai/installer` with it, and Composer **aborts the install** on a blocked plugin — so `php bin/spora plugin:install`, including the one at the top of this page, stops working.

Without the entry the install **aborts**. Composer's own message begins:

```text
cweagans/composer-patches contains a Composer plugin which is blocked by your allow-plugins config.
```

With the entry set to `false` — or with `composer install --no-plugins` — the install succeeds and every **deck** render fails at runtime with `MarkdownPresentation\Exception\UnpatchedDependency`, whose message names the plugin and what to do about it. The Word half is not patched and keeps working.

The entry goes away again when the patched parts are released upstream: `markdown-presentation` then drops the patch, the plugin and the entry with it. Until then the entry is required.

### Requires four PHP extensions

All four are hard requirements of the upstream packages — there is no partial mode.

|                |                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| PHP            | `^8.4.1`                                                                                              |
| `ext-zip`      | a `.docx` is a zip archive; `ZipArchive` is the only way in                                           |
| `ext-dom`      | the renderer writes and rewrites `word/document.xml`                                                  |
| `ext-mbstring` | multibyte-safe handling across the document model                                                     |
| `ext-gd`       | rescales an embedded image to `imageMaxWidth`; only reached when a readable _local_ image is embedded |
| spora-core     | `>=0.30.0`, and a core that ships the refiner seam                                                    |

Check them before installing:

```bash
php -m | grep -E '^(zip|dom|mbstring|gd)$'
```

`ext-gd` is the cheapest to skip: the reverse direction never calls into it, so reading a document back keeps working, and only rescaled embedded local images degrade to their alt text. `ext-zip` and `ext-dom` are required in **both** directions — without either, nothing works.

### The core floor

The plugin needs a core that ships `Spora\Services\MediaArchive\MediaMimeRefinerInterface`. `OfficePlugin::onContainerBuilding()` checks for the interface before it registers anything and throws `PluginLoadFailedException` naming the missing seam and the fix, so the failure is a **named** one rather than a silent half-load: the plugin loader logs a listener exception instead of aborting the boot, and the log line says which class is missing and that the host has to be upgraded or the plugin disabled. The refiner never registers on such a host, which on an old libmagic is the difference between a DOCX upload working and a `415`.

The producers share one seam, and their declared source formats are what put `.docx` and `.pptx` on the upload allowlist: `MediaAllowedTypesService` unions every registered producer's source MIME, and nothing else in this plugin contributes an upload type. That union reaches `allowedMimeTypes()` only from core's md-derivative cut onwards — the core change that deletes the converter registry has to land with the plugin, or the plugin boots fine and every `.docx` upload is rejected at the gate.

## The formats

| Format  | Written by            | Read back by           |
| ------- | --------------------- | ---------------------- |
| `.docx` | `office.render`       | `office.extract`       |
| `.odt`  | `office.render`       | —                      |
| `.rtf`  | `office.render`       | —                      |
| `.pptx` | `presentation.render` | `presentation.extract` |

The Word half **writes** three formats and **reads** one: its reverse reader opens an OOXML package (`word/document.xml`), so an `.odt` or an `.rtf` is written but never extracted. The slides half writes and reads `.pptx`.

## The registrations

`OfficePlugin::onContainerBuilding()` calls `add()` on two separate registries. Registering only some of them leaves a plugin that half-works rather than one that errors.

| Registration                       | Operation              | What it does                                                                                                                                                        |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaDerivativeProducerInterface` | `office.render`        | Markdown parent + `format: "docx" \| "odt" \| "rtf"` → the document's bytes as a new `media_assets` row                                                             |
| `MediaDerivativeProducerInterface` | `office.extract`       | `.docx` parent + `format: "md"` → GFM Markdown as a new `media_assets` row. This is the half the chat reads.                                                        |
| `MediaDerivativeProducerInterface` | `presentation.render`  | Markdown deck + `format: "pptx"` → the deck's bytes as a new `media_assets` row                                                                                     |
| `MediaDerivativeProducerInterface` | `presentation.extract` | `.pptx` parent + `format: "md"` → the deck's text as a new `media_assets` row                                                                                       |
| `MediaMimeRefinerInterface`        | —                      | Upgrades a coarse `application/zip` sniff to the MIME of the Office package it holds, but only when the archive actually carries the part that says which one it is |

`pluginSlug()` and `operationName()` are both part of the derivative's idempotency natural key `(parent_id, format, producer_plugin, producer_operation)`: renaming either orphans every derivative row already written instead of refreshing it.

The refiner exists for a concrete reason: `MimeSniffer` feeds 4096 bytes to `finfo_buffer`, which on most current libmagic builds reports a DOCX as its proper OOXML type — but on older builds the same 4096 bytes come back `application/zip` and the upload is rejected outright. `PK\x03\x04` matches every zip, so the signature table cannot fix it; only opening the archive can.

## The chain

Two calls on core's `media` tool.

```jsonc
// 1. store the Markdown
{ "action": "create_media", "content": "# Q3 Report\n\n…", "filename": "q3-report.md", "mime_type": "text/markdown" }
// → data.asset_id

// 2. render that asset to a document
{ "action": "create_derivative", "asset_id": "<asset_id from step 1>", "format": "docx" }
// → data.derivative_id, data.asset_url
```

`create_media` is **not** idempotent — every call inserts a new row, so the returned `asset_id` is the handle for everything downstream and a retry leaves a duplicate in the user's library. `create_derivative` **is** idempotent on `(parent_id, format, producer_plugin, producer_operation)`, so re-rendering the same parent in the same format is a safe retry and returns the same `derivative_id`.

There are **two** producer options. `options: {"plain": true}` is read by the Word producer, `options: {"theme": "<name>"}` by both render producers.

`plain` renders without the library's decoration — the code and link fonts, the quote style, table borders and code-block shading. It is not purely cosmetic — see the round-trip limits below. The slides half has no `plain` option: on a deck render the option is ignored.

`theme` names a theme for that one render, and it **outranks the document's own frontmatter `theme:`** — when the option names a theme, the frontmatter is not read at all. See [Themes](#themes) for how a render picks one.

Document assets render in chat as a download card rather than a bare markdown link, emitted by core's `MediaEmbed::fileCard()` and styled by core's CSS. The filename and the `href` are the entire contract.

## Reading a document back

No tool call. The archive extracts a document into an `md` derivative — a real `media_assets` row, reachable and re-derivable like any other — and the chat inlines its text into the agent's context. "What does this contract say" is answered from text the model can already see.

Behind the scenes the reverse direction is tightened for a chat attachment rather than a file server: `maxPartBytes` is lowered from the library's 256 MiB to 64 MiB, `mediaDirectory` stays `null` so no images are ever written to disk, and the upstream zip-bomb and style-loop caps (`maxEntries` 4096, `maxStyleDepth` 32) are kept. A corrupt or hostile document does not fail the upload — the extraction failure is caught, logged at warning, and the chat degrades to the asset's metadata block.

## Round-trip limits

A `.docx` is a lower-fidelity form of the Markdown it came from. Five documented losses, all silent: a table's header row returns **bold**; a fenced code block returns **without its language**; a **one-line** fence returns as **inline code** instead of a block; a quote's own line breaks are joined into one line; and the **last line has no trailing newline**.

`options: {"plain": true}` adds one more: the quote comes back as a plain paragraph, because dropping the renderer's quote _style_ is exactly what the reader cannot recognise — and it also drops the code font, so a fenced block returns as bare prose with no fence at all. Nested bullet and ordered lists work at any depth, and remote images are never fetched, so they fall back to their alt text.

Pictures do not come back either. The reverse direction writes no media directory, so a picture that was already inside a `.docx` returns as an image reference to a file that was never written — `![Chart](media/section_image1.png)`, the name the document carries — and the reference points at nothing. A deck's picture is left out altogether: the extracted Markdown carries the deck's words and its structure and **no picture at all**, not even an alt text. The picture is still inside the file; the Markdown is all the read-back gives you.

## Themes

A theme is a [media-library folder](/reference/concepts/media-folders): the folder's name is the theme's name, the folder's files are the library's own (`theme.yml`, `styles.yml`, `layouts.yml`, `text-styles.yml`, `template.pptx`), and the folder's UUID resolves as well as its name. A theme in the media library shadows a built-in theme of the same name.

A render picks its theme one of two ways:

- the **document's own frontmatter** — `theme: corporate` at the top of the Markdown, which for a deck is the frontmatter above its first slide;
- the **`options.theme` override** on the render call — `options: {"theme": "corporate"}` — which **outranks the frontmatter**: when the option names a theme, the frontmatter is not read at all.

Either way the value is a theme's **name**, or the UUID of a media-library folder — never a path. A theme's name is one path segment, so `theme: ../other-tenant` names no folder of yours and resolves to nothing.

## The skills

The plugin ships **two** skills: `office-documents` (`skills/office-documents/SKILL.md`) and `office-presentations` (`skills/office-presentations/SKILL.md`). The first teaches the agent the two-call chain, the round-trip limits, the image rules and the idempotency rules; the second the deck dialect, the theme catalogue and what a deck does and does not survive. Both declare `allowed-tools: media`, and neither is active by default — the operator adds them to an agent's `allowed_skills` allowlist.

## Licensing

The plugin and the upstream [`markdown-office`](https://github.com/markdown-office) packages are both **MIT**. `phpoffice/phpword`, which does the actual Word writing, and `phpoffice/phppresentation`, which does the actual deck writing, are both **LGPL-3.0** — copyleft licences, dynamically linked through Composer, and not relicensed by this plugin's MIT. Nothing here vendors its source.

## Translations

The plugin ships a German catalogue at `locales/de.json`, declared through `OfficePlugin::translationsPaths()`. The catalogue key is the **English source string**:

```json
{
  "Convert Markdown to Office documents — Word (.docx, .odt, .rtf) and PowerPoint (.pptx) — via the media-derivatives abstraction, and read them back as Markdown for the LLM.": "Markdown über die Media-Derivatives-Abstraktion in Office-Dokumente konvertieren — Word (.docx, .odt, .rtf) und PowerPoint (.pptx) — und sie für das LLM wieder als Markdown lesen."
}
```

The plugin has no tool, no setting and no admin app, so the **plugin description is the only string the catalogue carries**. Strings the model reads (`#[Tool].description`, `#[ToolParameter].description`, `#[ToolSetting].label` and its option labels) stay English, in the operator's view too: a German tool description degrades the model's tool selection, and a translated label that also reaches the model puts German into its prompt.

Editing the English orphans the translation — the key changes and the old entry is dead — so re-translate in the same commit. The gate is the plugin's own `tests/Unit/LocaleCatalogTest.php`: it fails on an empty translation, on a translation identical to its key, and on a key the source no longer produces.

## Development

```bash
composer install
./vendor/bin/pest                                  # Pest
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — five jobs. `test` runs Pest on PHP 8.4 and 8.5 (the 8.4 run also produces the coverage report), `static-analysis` runs PHPStan, `code-style` runs php-cs-fixer in dry-run, `integration` boots the plugin in a throwaway `spora-core` skeleton to prove the manifest parses and the registrations hook in, and `sonarcloud` scans the repository.

---

**Package:** `spora-ai/spora-plugin-office` · **MIT** — the source is in [`spora-ai/spora-plugin-word`](https://github.com/spora-ai/spora-plugin-word), the repository this plugin was renamed from.
