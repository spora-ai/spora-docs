---
title: Word
description: Convert Markdown to Word (.docx) through the media-derivatives abstraction, and read .docx files back as Markdown for the LLM.
---

# Word Plugin for Spora

Adds Microsoft Word support to the [Spora](https://github.com/spora-ai/Spora) Media Archive. The plugin registers two **derivative producers** with the host — one that renders Markdown into a `.docx`, one that extracts a `.docx` back into Markdown — plus a MIME refiner that stops an upload from being rejected on a host whose libmagic only sees `application/zip`.

The plugin ships **no tool of its own**, no route and no admin app: the LLM drives both directions through core's existing `media` tool, so a `word_document` tool would be a second spelling of what the registry already exposes.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-word
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

### Requires four PHP extensions

This is the first Spora plugin with more than one extension requirement, and **all four are hard requirements of the upstream package** — there is no partial mode.

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

`ext-gd` is the cheapest to skip: the reverse direction never calls into it, so reading `.docx` back keeps working, and only rescaled embedded local images degrade to their alt text. `ext-zip` and `ext-dom` are required in **both** directions — without either, nothing works.

### The core floor

The plugin needs a core that ships `Spora\Services\MediaArchive\MediaMimeRefinerInterface`. Without it the refiner registration is a fatal on the missing class, which `PluginLoader` catches and logs — leaving the refiner silently never running, which on an old libmagic is the difference between a DOCX upload working and a `415`.

The two producers share one seam, and their declared source formats are what put `.docx` on the upload allowlist: `MediaAllowedTypesService` unions every registered producer's source MIME, and nothing else in this plugin contributes an upload type. That union reaches `allowedMimeTypes()` only from core's md-derivative cut onwards — the core change that deletes the converter registry has to land with the plugin, or the plugin boots fine and every `.docx` upload is rejected at the gate.

## Configuration

The plugin declares **no settings** and reads no credentials.

## The three registrations

`WordPlugin::onContainerBuilding()` calls `add()` on two separate registries. Registering only some of them leaves a plugin that half-works rather than one that errors.

| Interface                          | Class                              | What it does                                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MediaDerivativeProducerInterface` | `Producers\MarkdownToDocxProducer` | Markdown parent + `format: "docx"` → DOCX bytes as a new `media_assets` row. `pluginSlug()` = `spora-plugin-word`, `operationName()` = `word.render` — both are part of the idempotency natural key.                     |
| `MediaDerivativeProducerInterface` | `Producers\DocxToMarkdownProducer` | DOCX parent + `format: "md"` → GFM Markdown as a new `media_assets` row. `operationName()` = `word.extract`, distinct from the render half so the two rows never collapse onto one key. This is the half the chat reads. |
| `MediaMimeRefinerInterface`        | `Refiners\WordDocxMimeRefiner`     | Upgrades a coarse `application/zip` sniff to the DOCX MIME, but only when the archive actually contains `word/document.xml` — so xlsx, pptx and epub are not mislabelled. Runs before the upload allowlist check.        |

The refiner exists for a concrete reason: `MimeSniffer` feeds 4096 bytes to `finfo_buffer`, which on most current libmagic builds reports a DOCX as its proper OOXML type — but on older builds the same 4096 bytes come back `application/zip` and the upload is rejected outright. `PK\x03\x04` matches every zip, so the signature table cannot fix it; only opening the archive can.

## The chain

Two calls on core's `media` tool.

```jsonc
// 1. store the Markdown
{ "action": "create_media", "content": "# Q3 Report\n\n…", "filename": "q3-report.md", "mime_type": "text/markdown" }
// → data.asset_id

// 2. render that asset to Word
{ "action": "create_derivative", "asset_id": "<asset_id from step 1>", "format": "docx" }
// → data.derivative_id, data.asset_url
```

`create_media` is **not** idempotent — every call inserts a new row, so the returned `asset_id` is the handle for everything downstream and a retry leaves a duplicate in the user's library. `create_derivative` **is** idempotent on `(parent_id, format, producer_plugin, producer_operation)`, so re-rendering the same parent in the same format is a safe retry and returns the same `derivative_id`.

The one producer option is `options: {"plain": true}`, which renders without decoration. It is not purely cosmetic — see the round-trip limits below.

Document assets render in chat as a download card rather than a bare markdown link, emitted by core's `MediaEmbed::fileCard()` and styled by core's CSS. The filename and the `href` are the entire contract.

## Reading a `.docx` back

No tool call. The archive extracts a `.docx` into a `md` derivative — a real `media_assets` row, reachable and re-derivable like any other — and the chat inlines its text into the agent's context. "What does this contract say" is answered from text the model can already see.

Behind the scenes the reverse direction is tightened for a chat attachment rather than a file server: `maxPartBytes` is lowered from the library's 256 MiB to 64 MiB, `mediaDirectory` stays `null` so no images are ever written to disk, and the upstream zip-bomb and style-loop caps (`maxEntries` 4096, `maxStyleDepth` 32) are kept. A corrupt or hostile `.docx` does not fail the upload — the extraction failure is caught, logged at warning, and the chat degrades to the asset's metadata block.

## Round-trip limits

A `.docx` is a lower-fidelity form of the Markdown it came from. Five documented losses, all silent: a table's header row returns **bold**; a fenced code block returns **without its language**; a **one-line** fence returns as **inline code**; a quote written as plain indentation returns as a **plain paragraph**; and the **last line has no trailing newline**.

`options: {"plain": true}` triggers the quote loss as a side effect, because dropping the renderer's quote _style_ is exactly the case the reader cannot recognise — and it also drops the code font, leaving fenced blocks as two bare prose paragraphs with no fence at all. Nested bullet and ordered lists work at any depth, and remote images are never fetched, so they fall back to their alt text.

The agent-facing version of all of this, with the practical rules, is the `word-documents` skill.

## The skill

The plugin ships one skill, `word-documents` (`skills/word-documents/SKILL.md`), which teaches the agent the two-call chain, the five round-trip losses, the image rules and the idempotency rules. It declares `allowed-tools: media` and is not active by default — the operator adds it to an agent's `allowed_skills` allowlist.

## Licensing

The plugin and the upstream [`fabeat/markdown-word`](https://github.com/fabeat/markdown-word) are both **MIT**. `phpoffice/phpword`, which does the actual Word writing, is **LGPL-3.0** — a copyleft licence, dynamically linked through Composer, and not relicensed by this plugin's MIT. Nothing here vendors its source.

`fabeat/markdown-word` is a personal-scope Composer package (`fabeat/`, not `spora-ai/`). That is fine as a library dependency, but a fork or a move to the org is a `composer.json` change here.

## Translations

The plugin ships a German catalogue at `locales/de.json`, declared through `WordPlugin::translationsPaths()`. The catalogue key is the **English source string**:

```json
{
  "Convert Markdown to Word (.docx) via the media-derivatives abstraction, and read .docx files back as Markdown for the LLM.": "Markdown über die Media-Derivatives-Abstraktion in Word (.docx) konvertieren und .docx-Dateien für das LLM wieder als Markdown lesen."
}
```

The plugin has no tool, no setting and no admin app, so the **plugin description is the only string the catalogue carries**. Strings the model reads (`#[Tool].description`, `#[ToolParameter].description`, `#[ToolSetting].label` and its option labels) stay English, in the operator's view too: a German tool description degrades the model's tool selection, and a translated label that also reaches the model puts German into its prompt.

Editing the English orphans the translation — the key changes and the old entry is dead — so re-translate in the same commit. The gate is the plugin's own `tests/Unit/LocaleCatalogTest.php`: it fails on an empty translation, on a translation identical to its key, and on a key the source no longer produces.

Requires `spora-core >= 0.31.0`; on older cores the catalogue is ignored.

## Development

```bash
composer install
./vendor/bin/pest                                  # Pest
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan, php-cs-fixer dry-run, a coverage job and a SonarCloud scan (project key `spora-ai_spora-plugin-word`).

---

**Repo:** [spora-ai/spora-plugin-word](https://github.com/spora-ai/spora-plugin-word) · **MIT**
