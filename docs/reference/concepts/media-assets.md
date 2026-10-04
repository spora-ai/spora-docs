---
title: Media assets
description: Embedding images, audio, video, and downloadable documents in tool results — AssetStore, MediaEmbed, StoresBinaryAssets trait.
---

# Plugin Author Guide — Embedding Media in Tool Results

Many plugins generate binary output: images from a diffusion API, audio from a TTS service, video from a generative model, screenshots from a headless browser, PDFs from a renderer. Returning raw URLs in plain text gets the job done but produces ugly, non-interactive chat bubbles — and any payload the upstream API hands back as inline bytes (hex or base64) is otherwise lost.

Spora provides a small, opinionated pipeline for this:

```text
binary bytes ─► AssetStore::store() ─► AssetReference (url, mode)
                                                  │
ToolResult.content ◄──── MediaEmbed::* ◄──────────┘
        │                         │
        ▼                         ▼
   chat UI renders        operators configure
   inline media           via SPORA_* env vars
```

This page walks through each piece.

## 1. The two ingredients

### `Spora\Services\AssetStore`

A service interface in `app/Services/AssetStore.php`. Three implementations ship in core:

| Implementation      | Mode             | Behaviour                                                                                                                                  |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DataUrlAssetStore` | `data_url`       | Returns the payload inline as `data:<mime>;base64,…`. No disk write.                                                                       |
| `LocalAssetStore`   | `local`          | Writes to `<storage>/assets/<token>.<ext>` and returns a URL like `/api/v1/assets/<token>.<ext>` (served by `Spora\Http\AssetController`). |
| `AutoAssetStore`    | `auto` (default) | Composes the two above and dispatches per call based on a size threshold.                                                                  |

The container binds `AssetStore::class` to whichever mode the operator picks via `SPORA_ASSET_STORE_MODE`. Plugins depend on the **interface**, never on a concrete class.

### `Spora\Tools\MediaEmbed`

A final, stateless utility class in `app/Tools/MediaEmbed.php`. These return the canonical HTML the chat UI knows how to render (see [Frontend markdown allow-list](https://github.com/spora-ai/spora-frontend/blob/main/src/composables/useMarkdown.ts) for the source of truth).

`forAsset(MediaAsset $asset, MediaType $type, string $url, string $alt): string` is the single `MediaType` → embed dispatch, and the entry point to prefer. Every operation that surfaces an asset routes through it — `get_media`, `get_embed_code`, `create_media`, `create_derivative` — so one artifact looks the same however it came to exist. Matching on `MediaType` at your own call site is how a PDF ends up rendered as a download card by one operation and a bare link by the next.

| `MediaType`                            | Rendered as                           |
| -------------------------------------- | ------------------------------------- |
| `Image`                                | `image()` — inline markdown image     |
| `Audio`                                | `audioFromUrl()` — `<audio controls>` |
| `Video`                                | `videoFromUrl()` — `<video controls>` |
| `Document` (`text/*`, `application/*`) | `fileCard()` — one-line download card |
| `Unknown`                              | `link()` — plain markdown link        |

`Document` is the bucket PDFs and Word documents land in, and the card it produces is styled in `spora-frontend/src/style.css` under `.chat-bubble-content .spora-file-card*`. Emit those class names verbatim if you build your own card — a rename degrades to an unstyled link, still functional because `AssetController::applyContentDisposition()` forces `Content-Disposition: attachment` server-side. `Unknown` stays a link deliberately: it means the `media_type` column itself was null or unrecognised, and nothing about such a row is reliably a download.

`fileCard()` emits one line, and no icon element — the download glyph is a CSS `::before` pseudo-element on the link, because `aria-hidden` is not in the sanitizer's `ALLOWED_ATTR` and would be silently stripped, and because a generated text glyph would still be announced by a screen reader. `download` is likewise omitted, for the same server-side reason.

## 2. Configuration

| Env var                                  | Default             | Effect                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_ASSET_STORE_MODE`                 | `auto`              | `auto` / `data_url` / `local`. Invalid values throw at boot.                                                                                                                                                   |
| `SPORA_ASSET_STORE_AUTO_THRESHOLD_BYTES` | `1048576` (1 MiB)   | In `auto` mode, payloads ≤ this many bytes use `data_url`; larger payloads use `local`.                                                                                                                        |
| `SPORA_ASSET_STORE_MAX_BYTES`            | `16777216` (16 MiB) | Per-asset ceiling. Matches the MEDIUMBLOB ceiling of `media_assets.payload` (migration 0064 + `MediaArchiveService::DATA_URL_MAX_BYTES`); the `DatabaseAssetStore` factory throws if this is set above 16 MiB. |

Settings are merged from defaults → `config.php` → env vars, same as every other `SPORA_*` setting. See `ContainerDefinitions::configDefinition()` for the merge order.

> The 16 MiB default applies to **every** mode — `data_url` because the `payload` BLOB column is MEDIUMBLOB (16 MiB on MySQL/MariaDB; SQLite has no intrinsic cap), and `local` because the same `AssetStore` interface enforces the same ceiling. Operators on `local` mode who need larger individual assets raise this via `SPORA_ASSET_STORE_MAX_BYTES`; the factory will fail fast on boot if the value exceeds the column ceiling for the active mode.

## 3. Pattern A — you have a URL

The simplest case. The upstream API already gave you a CDN URL; just embed it:

```php
use Spora\Tools\MediaEmbed;

$content = "Generated image:\n\n" . MediaEmbed::image($cdnUrl, "alt text");
```

`MediaEmbed::image()` produces `![alt text](https://cdn.example/…)` — standard markdown that the renderer turns into `<img>`. No `AssetStore` involvement, no bytes in the DB, no auth surface.

User-supplied filenames flowing into `media_assets.filename` are scrubbed by `Utf8Sanitizer::scrubString` in `MediaUploadController::store()` before `MediaIngestRequest` is built, with a defensive re-scrub in `MediaArchiveService::insertNew()`. The serializer re-scrubs on read as defense-in-depth. See [UTF-8 sanitizer](/reference/concepts/utf8-sanitizer).

The same pattern works for already-hosted audio and video:

```php
$content = "Here is the audio:\n\n" . MediaEmbed::audioFromUrl($cdnUrl);
$content = "Here is the video:\n\n" . MediaEmbed::videoFromUrl($cdnUrl, 1920, 1080);
```

## 4. Pattern B — you have bytes (or hex from the API)

The upstream API hands back a blob — either raw bytes (e.g. fetched yourself) or a hex/base64-encoded string in the response body. Two ways to wire it:

### Option 1 — call `MediaEmbed::*FromBytes()` directly

```php
use Spora\Tools\MediaEmbed;

$bytes = hex2bin($response['data']['audio']);          // upstream gave us hex
$content = "Synthesized speech.\n\n"
         . MediaEmbed::audioFromBytes($bytes, $this->assetStore, 'speech.mp3');
```

`MediaEmbed::audioFromBytes()` calls `AssetStore::store()` internally and returns the embedded `<audio>`. The `AssetStore` decides between `data:` URL and `/api/v1/assets/…` URL based on the operator's mode setting.

### Option 2 — use the `StoresBinaryAssets` trait (opt-in)

```php
use Spora\Plugins\Concerns\StoresBinaryAssets;
use Spora\Tools\MediaEmbed;

final class MyAudioTool extends AbstractTool {
    use StoresBinaryAssets;

    protected function doWork(/* … */): ToolResult {
        $hex = $this->fetchUpstreamHex();
        // Returns [url, mode] — give `mode` to the UI in ToolResult::$data.
        [$url, $mode] = $this->embedHex($hex, mime: 'audio/mpeg', filename: 'speech.mp3');

        $content = "Audio ready.\n\n" . MediaEmbed::audioFromUrl($url);
        return new ToolResult(true, $content, ['asset_mode' => $mode]);
    }
}
```

`embedHex()` does the odd-length-hex guard, `hex2bin()` decode, and `AssetStore::store()` in one call. It returns `[url, mode]` so you can surface `mode` in `ToolResult::$data` (the UI may use it to render a "local copy" badge vs. inline).

### When to prefer bytes over URL

Most third-party APIs (MiniMax, ElevenLabs, OpenAI TTS) can return either inline bytes or a hosted URL. Prefer the URL when it's available and the URL will be valid for the duration of the user's task (typically 24 hours for CDN links). Fall back to bytes + `AssetStore` when:

- The API only returns inline bytes (e.g. some TTS endpoints).
- The hosted URL expires faster than your tool needs it (e.g. 1-hour URLs for assets you want to keep around for chat history).
- The payload is multi-megabyte and you want to avoid bloating the chat-history DB row with a base64 data URL.

## 5. Plumbing in your plugin

PHP-DI auto-resolves typed constructor parameters, so:

```php
use Spora\Services\AssetStore;

final class MyTool extends AbstractTool {
    public function __construct(
        private readonly AssetStore $assetStore,
        // … other deps …
    ) {}
}
```

is enough — the container will inject the configured `AssetStore` automatically. No plugin-level DI configuration is required.

If your tool uses the `StoresBinaryAssets` trait, the trait's `setAssetStore(AssetStore)` setter is auto-wired by PHP-DI too — you do **not** need to inject `AssetStore` explicitly through your constructor (though you can if you want to).

### Correcting a coarse sniffed MIME

Uploads are gated on the **sniffed** MIME (`MediaUploadController::checkMimeAllowed()`) before any converter is consulted, so a format your libmagic build reports as its container type is rejected outright. Word OOXML is the common case: a 200-byte prefix reads as `application/zip`, and older libmagic versions report that for every OOXML flavour. `MimeSniffer::MAGIC_SIGNATURES` cannot help — the `PK\x03\x04` local-file-header signature matches every zip archive in existence.

A refiner upgrades the verdict:

```php
final class WordDocxMimeRefiner implements Spora\Services\MediaArchive\MediaMimeRefinerInterface
{
    // No constructor — see the contract below.
    public function refine(string $bytes, ?string $filename, string $sniffedMime): ?string
    {
        if ($sniffedMime !== 'application/zip') {
            return null; // not our concern; decline
        }

        // `PK\x03\x04` alone proves nothing — check for the part that
        // distinguishes Word from xlsx / pptx / epub, or you will relabel
        // every spreadsheet upload as a document.
        $zip = new ZipArchive();
        if ($zip->open($stagedPath, ZipArchive::RDONLY) !== true) {
            return null;
        }

        try {
            return $zip->locateName('word/document.xml') !== false
                ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : null;
        } finally {
            $zip->close();
        }
    }
}
```

```php
MediaMimeRefinerDiscovery::add(WordDocxMimeRefiner::class);
```

Contract, and the reasons behind each part:

- **No-arg constructor, required.** `MimeSniffer` instantiates refiners with `new $class()`, which is what lets the sniffer itself stay argument-free — it is `new MimeSniffer()`-ed at its test call sites and bound as a bare construction in `ContainerDefinitions`.
- **Run in registration order** until one returns non-`null`; `null` means decline, and the next refiner gets its turn.
- **`$bytes` is the full payload**, not the 4 KiB prefix the sniffer works from — but you should still bound what you do with it. Refiners run inside the upload allowlist gate, before any size rejection, so an unbounded read is on the path for every archive a user ever attaches.
- **Runs after the built-in Typst `text/plain` → `text/x-typst` upgrade**, so `$sniffedMime` is the most specific verdict core can produce.
- **A refiner that throws is caught and declined**, not propagated. Plugin code is untrusted: an uncaught exception here would travel through `ingestFromBytes()` and fail every media upload in the process over one MIME verdict. This mirrors `MediaArchiveIngestPipeline::runConversionPipeline()`, which wraps the plugin-supplied _converter_ the same way.

This is the third of the three discovery registries — `MediaConverterDiscovery`, `MediaDerivativeProducerDiscovery`, `MediaMimeRefinerDiscovery` — and all three share one registration shape through the `DiscoversRegistrations` trait. They have independent storage, which is worth knowing if you extend them: a `private static` property declared on a shared _parent class_ would be inherited by every subclass and silently merge the three lists into one.

## 6. What the chat UI does with the HTML

- `<img>`, `<audio>`, `<video>`, `<source>` are in the allow-list.
- `<div>`, `<span>` and `class` are in the allow-list too, which is what lets `MediaEmbed::fileCard()` ship a styled download card as raw HTML rather than markdown.
- `data:` URIs are allowed on `src` of `<audio>`, `<video>`, and `<source>` (via a per-call DOMPurify hook) but blocked on `<a href>` so `data:text/html,…` XSS stays closed.
- `download` and `aria-hidden` are **not** in the allow-list. `download` is harmless here, since `AssetController::applyContentDisposition()` forces `Content-Disposition: attachment` from `media_assets.filename` regardless — but `aria-hidden` being dropped means an icon glyph inside a card cannot be hidden from assistive tech. Use a CSS pseudo-element or a background image instead of an element with a glyph character in it.
- Media elements get a sensible default style in `spora-frontend/src/style.css` under `.chat-bubble-content video` / `.chat-bubble-content audio`.
- The download card shows the filename and, when the archive knows it, the size. There is no MIME: the extension on the filename already says what the file is, and a long MIME overflowed the row and squeezed the filename to nothing in a narrow bubble.

### Styling the download card: register your classes

The card's **layout is Tailwind utilities that live in a PHP string**, and Tailwind's scanner only reads this repo — so it never sees them. `spora-frontend` registers the card's exact class list with `@source inline(...)` in `src/style.css`, and that registration is the only reason the card is styled at all.

This matters for your plugin because the failure mode is silent. A class missing from the list is **not generated**: no build error, no warning, no failing test, just an unstyled card in the chat. So if you emit card-like markup with utility classes, add every one of them to that list in the same change. `MediaEmbedFileCardTest` in `spora-core` asserts that the classes core's PHP emits are a subset of the registered list — that test covers core's card, not yours.

Only `spora-file-card__glyph` is a real class hook: it is not a utility, it names the `::before` mask that draws the download glyph, and it is the one card selector in `src/style.css` besides the colour/underline reset.

That reset is the second hand-written rule, and its reason is worth knowing before you add a third. This stylesheet's own link styling (`.chat-bubble-content a`) is **unlayered**, and unlayered author CSS outranks every layered declaration _regardless of specificity_ — so `text-inherit` and `no-underline` on the card lose to it and are undone by a rule instead. Specificity only breaks the tie once the layers match, so do not assume a utility class can win against the bubble's link styling.

If you emit HTML outside the canonical helpers (`MediaEmbed::*`), test that the result survives sanitization. Run the frontend tests in `spora-frontend/tests/composables/useMarkdown.spec.ts` against your markup.

## 7. Local-mode URLs are stable, not permanent

`LocalAssetStore` mints a token that embeds a daily-rotating HMAC. A URL generated today is valid until midnight UTC tomorrow; a URL from last week returns 404 even if the file is still on disk.

If you want long-term retention, run `php bin/spora assets:gc --max-age-days=N` periodically (cron) to free disk. The command does **not** invalidate URLs that are still in their validity window — it only unlinks files past `--max-age-days`.

## 8. End-to-end example

```php
final class TtsTool extends AbstractTool {
    use StoresBinaryAssets;

    public function __construct(
        HttpClientInterface $http,
        ToolConfigService $config,
        ?LoggerInterface $logger = null,
    ) {
        parent::__construct($config, $http, $logger);
    }

    protected function doWork(ToolContext $ctx, array $args): ToolResult {
        $resp = $this->http->request('POST', 'https://api.tts.example/synthesize', [
            'json'    => ['text' => $args['text']],
            'timeout' => 60,
        ])->toArray();

        if (! empty($resp['audio_url'])) {
            // Easy path: upstream hosted it.
            $embed = MediaEmbed::audioFromUrl($resp['audio_url']);
            $mode  = null;
        } elseif (! empty($resp['audio_hex'])) {
            // API returned hex; store via AssetStore, then embed.
            [$url, $mode] = $this->embedHex(
                $resp['audio_hex'],
                mime: 'audio/mpeg',
                filename: 'speech.mp3',
            );
            $embed = MediaEmbed::audioFromUrl($url);
        } else {
            return new ToolResult(false, 'TTS API returned no audio.');
        }

        $content = "Synthesized {$resp['usage_characters']} characters.\n\n{$embed}";
        return new ToolResult(true, $content, [
            'audio_url'  => $resp['audio_url'] ?? null,
            'asset_mode' => $mode,
        ]);
    }
}
```

That's the full pattern. Roughly 10 lines per tool beyond the upstream HTTP call.
