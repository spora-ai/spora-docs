---
title: Muse
description: Meta Muse vendor home for Spora agents — Muse Image (generate / edit) and Muse Voice Transcribe (STT) on a single Meta Model API key.
---

# Muse Plugin for Spora

Adds [Meta's Muse](https://developers.meta.com) capabilities — **image generation + editing** and **speech-to-text** — to [Spora](https://github.com/spora-ai/spora) agents. Both capabilities share one Meta Model API key. Future Muse capabilities (Spark text, Glimmer TTS, Muse Video) slot into this plugin as additional tools/providers — install once, get every Meta Muse capability.

- **Muse Image** (`muse-image-1.0`) — text-to-image generation and image-to-image editing via Meta's OpenAI-compatible `/v1/images/generations` and `/v1/images/edits` endpoints. Generates a single PNG and ingests it into the [Media Archive](/start/end-users/media-archive).
- **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) — speech-to-text via `POST https://api.meta.ai/v1/asr/transcribe`. Browser audio containers (WebM/Opus, OGG/Opus, MP4/AAC) are transcoded to mono 16-bit PCM WAV at 24 kHz via [`ffmpeg`](#requirements).

> **Pre-release notice (v0.1.0).** The plugin depends on `Spora\Speech\SpeechToTextProviderInterface` (the speech-input contract added in `spora-core` for the speech-input plan). That contract lands on `spora-core`'s `main` as part of an upcoming core release; until the first tagged core that ships the interface is published, `php bin/spora plugin:install spora-ai/spora-plugin-muse` against the released `spora-core` will fail at boot with `Class "Spora\Speech\SpeechToTextProviderInterface" not found`. To run the plugin today, install it against `spora-core`'s `main` (or the `feat/speech-input-core-contract` branch) — see [Local development](#local-development) below. The `v0.1.0` tag will be cut **after** the matching core release ships.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-muse
php bin/spora spora:install
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the plugin exposes:

- one LLM-callable tool — `image_muse` (two actions: `generate`, `edit`); and
- one STT provider — `MuseTranscribeProvider`, registered against [`SpeechToTextRegistry`](https://github.com/spora-ai/spora-core/blob/main/app/Speech/SpeechToTextRegistry.php) so the recording button and the `/api/v1/speech/transcribe` endpoint can route through `muse-voice-transcribe-1.0` once an agent's speech settings are configured.

## Requirements

`ffmpeg` MUST be installed and reachable by either `$PATH` (default) or the `SPORA_FFMPEG_BINARY` env var pointing at an absolute path. The STT provider transcodes browser audio via Symfony Process. Image generation does **not** need ffmpeg.

```bash
# Debian / Ubuntu
sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg
```

The CI test job installs `ffmpeg` via `apt-get` so the Pest suite can exercise the audio pipeline on every PR.

## Configuration

Settings → Tools → Muse. Settings are namespaced by capability. Cascade: agent → principal → global. The same `api_key` serves both Muse Image and Muse Voice Transcribe.

| Setting                | Capability | Required | Default                              | Notes                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ---------- | -------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api_key`              | both       | yes      | —                                    | Meta Model API key. One key serves all Muse capabilities. Generate at <https://developers.meta.com> → API Keys. Encrypted at rest by `ToolConfigService`, masked in the UI, never logged.                                                                                                                       |
| `display_name` (STT)   | STT        | no       | `Meta Muse Voice Transcribe`         | Operator-facing label surfaced in the recording-button gate, the speech provider config list, and the per-agent speech settings section. Rename per-agent / per-user to disambiguate when several STT providers are configured.                                                                              |
| `model` (STT)          | STT        | no       | `muse-voice-transcribe-1.0`          | Meta model identifier for STT. Override to roll back after a bad release or A/B test predecessors shipped against the same API.                                                                                                                                                                                |
| `model` (Image)        | Image      | no       | `muse-image-1.0`                     | Meta model identifier for image generation. Same rollback / A-B rationale as the STT model.                                                                                                                                                                                                                   |
| `mode`                 | STT        | no       | `PUSH_TO_TALK`                       | `PUSH_TO_TALK` (single-turn, default), `ENDPOINTING` (turn boundaries), or `DIARIZATION` (speaker labels).                                                                                                                                                                                                     |
| `language_bias`        | STT        | no       | (auto-detect)                        | Multi-select checkboxes. Biases recognition toward the chosen languages (25 supported: Arabic, Bengali, Dutch, English, French, German, Hebrew, Hindi, Indonesian, Italian, Japanese, Kannada, Korean, Malay, Mandarin Chinese, Marathi, Polish, Portuguese, Spanish, Tagalog, Tamil, Telugu, Thai, Turkish, Vietnamese). Pick multiple for code-switching sessions. |
| `keywords`             | STT        | no       | (none)                               | Comma-separated list of terms to bias recognition toward (product names, jargon), e.g. `Spora, Muse, Sporadise`.                                                                                                                                                                                                |
| `SPORA_FFMPEG_BINARY`  | STT        | no       | `ffmpeg`                             | Env var override for the ffmpeg binary path (deployment-level — Docker / shared hosts). Wins over `$PATH`.                                                                                                                                                                                                     |
| `http_timeout_seconds` | Image      | no       | `300`                                | Per-request timeout for image generation / editing.                                                                                                                                                                                                                                                           |

`api_key` values are encrypted at rest by `ToolConfigService`, masked in the UI, and never logged.

## Per-tool operations

### `image_muse` — generate / edit

A single tool with two actions. Pick the action in the agent's tool call. On success the tool returns a `ToolResult::ok` carrying the asset id, the resolved URL, and a human-readable summary. Never throws — a single API failure surfaces as `ToolResult::fail` and the agent loop keeps running.

| Action     | Description                                          | Parameters                                                                                                          | Approval |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| `generate` | One image from a text prompt.                        | `prompt` (string, **required**), `filename` (optional stem, no ext), `size` (default `1024x1024`)                   | no       |
| `edit`     | Edit / compose from reference URLs or data URIs + prompt. | `prompt` (string, **required**), `input_images` (array, **required**), `filename` (optional), `size` (default `1024x1024`) | yes      |

**Sizes**: `1024x1024` (default, square), `1024x1536` (portrait), `1536x1024` (landscape). The `size` is a target aspect ratio; the model may produce a different exact pixel count.

**Reference inputs** (`edit` action only) accept `http://`, `https://`, or `data:` URIs. Spora Media Archive URLs (`/api/v1/assets/<token>.<ext>`) are accepted because Meta's servers can reach them.

**Pricing**: $0.01 / image flat — billed per successfully-returned image (per Meta's docs).

### Muse Voice Transcribe (`muse-voice-transcribe-1.0`)

No LLM-callable surface — used internally when audio input is enabled on a Spora session. Picks the first provider that returns `isConfigured() === true`; configure one key globally and all sessions share it.

- **Pricing**: $0.18 / hour of audio processed.
- **Caps**: 32 MB / 10 min per file before `ffmpeg` runs. Transcoding targets mono 16-bit PCM WAV at 24 kHz.
- **MIME**: `audio/wav` (post-transcode). Browser-recorded `webm/opus`, `ogg/opus`, and `mp4/AAC` are accepted and transcoded before upload.
- **Languages**: 25 supported — see `language_bias` in the configuration table above.

Configure the per-agent / per-user default via the cascade in [Concepts → Speech providers → The cascade](/reference/concepts/speech-providers#the-cascade). When several STT providers are configured, rename `display_name` per provider so the recording-button gate stays unambiguous.

Debug logging: every call emits `debug` / `info` / `warning` PSR-3 entries to the Spora logger (`storage/spora.log`). Enable `debug` level in the operator log config to see them.

## Vendor

- **Sign up / API keys**: <https://developers.meta.com> → API Keys
- **API documentation**: <https://developers.meta.com/docs>
- **Models**: `muse-image-1.0`, `muse-voice-transcribe-1.0`. Older model ids Meta ships against the same endpoints can be set via the per-capability `model` setting.

## Development

```bash
composer install
composer analyse       # PHPStan
composer test:parallel # Pest — ~22 s (requires ffmpeg on PATH)
composer lint          # php-cs-fixer dry-run
composer format        # apply formatting
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan per `phpstan.neon`, php-cs-fixer dry-run. The test job installs `ffmpeg` via `apt-get` so the audio pipeline is exercised on every PR. MIT license.

### Local development

Clone the plugin alongside a `spora-core` checkout and let Composer resolve the in-flight core branch via a VCS repo. The plugin's `composer.json` already declares the `spora-ai/spora-core` VCS repository and aliases the `feat/speech-input-core-contract` branch as `0.24.0`, so a plain `composer install` against the dev constraint gives you the interface.

```bash
# 1. Clone side-by-side
git clone https://github.com/spora-ai/spora-core.git ../spora-core
git clone https://github.com/spora-ai/spora-plugin-muse.git ../spora-plugin-muse
cd ../spora-plugin-muse && composer install

# 2. Run the test suite (requires ffmpeg on PATH or via Spora_FFMPEG_BINARY)
composer analyse && composer test:parallel && composer lint
```

When the core release ships, update `composer.json`'s `require` block from `"dev-feat/speech-input-core-contract as 0.24.0"` to `"^0.24.0"` and drop the `repositories` entry — the `v0.1.0` tag is gated on that switch.

---

**Repo:** [spora-ai/spora-plugin-muse](https://github.com/spora-ai/spora-plugin-muse) · **MIT**
