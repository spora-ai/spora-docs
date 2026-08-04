---
title: MiniMax
description: MiniMax's non-text multimodal capabilities — image, speech, music, video — for Spora agents.
---

# MiniMax Plugin for Spora

Adds MiniMax's non-text multimodal capabilities — **image, speech, music (instrumental, with lyrics, or standalone lyrics), video** — to [Spora](https://github.com/spora-ai/spora) agents. Text/chat is provided by Spora's built-in Anthropic-compatible driver pointed at MiniMax's base URL (see below).

## Installation

```bash
# Recommended — install via the Spora CLI
php bin/spora plugin:install spora-ai/spora-plugin-minimax
php bin/spora spora:install

# For development against a sibling git clone, pass --path:
php bin/spora plugin:install spora-ai/spora-plugin-minimax --path=/abs/path/to/checkout

# Alternative — drop a clone into the Spora repo
git clone https://github.com/spora-ai/spora-plugin-minimax.git plugins/minimax
php bin/spora spora:install
```

After install, tools are exposed as `minimax:image`, `minimax:speech`, `minimax:music`, `minimax:video`. The plugin ships no database migration as of `1.2.0`; `spora:install` simply registers the tools.

## Configuration

Settings → Tools → MiniMax. All four tools share the same `MINIMAX_API_KEY` (issued at <https://platform.minimax.io> → API Keys).

The default `base_url` is the **Global** endpoint (`https://api.minimax.io`). Operators in China should override `base_url` to `https://api.minimaxi.com` for the China-region endpoint.

| Setting                 | Required | Default                           |
| ----------------------- | -------- | --------------------------------- |
| `api_key`               | yes      | —                                 |
| `base_url`              | no       | `https://api.minimax.io` (Global) |
| `model`                 | no       | per provider (see below)          |
| `voice_id`              | no       | `English_PassionateWarrior`       |
| `poll_interval_seconds` | no       | `10` (video only)                 |
| `poll_timeout_seconds`  | no       | `900` (video only)                |
| `submit_timeout_seconds`| no       | `120` (video only)                |

`api_key` fields are encrypted at rest by Spora's `ToolConfigService`, masked in the UI, and never logged.

## Per-tool parameters

Each tool accepts a `prompt` and returns `ToolResult::ok` (with the upstream CDN URL, valid 24h) or `ToolResult::fail`. Never throws — a single API failure cannot kill the agent loop.

| Tool             | Default model        | Notes                                                                                                                                                             |
| ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimax:image`  | `image-01`           | `aspect_ratio` ∈ 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9                                                                                                        |
| `minimax:speech` | `speech-2.8-hd`      | TTS; `voice_id`, `speed` (0.5-2.0)                                                                                                                                |
| `minimax:music`  | `music-2.6`          | Operations: `compose` (instrumental or with `lyrics`, 1-3500 chars), `write_lyrics` (full song from a topic), `edit_lyrics` (rewrite existing lyrics)             |
| `minimax:video`  | `MiniMax-H3`         | Async; multimodal. Operations: `generate`, `resume`, `enhance_prompt`, `regenerate` (2K upscale). See [H3 video](#h3-video-tool) below. |

The music tool's `action` discriminator selects the operation. `compose` uses `/v1/music_generation` and accepts an optional `lyrics` parameter. The `write_lyrics` and `edit_lyrics` operations use `/v1/lyrics_generation`. All three operations share the same `api_key`, `base_url`, and (compose-only) `model` settings.

As of `1.2.0`, every tool emits `debug` / `info` / `warning` PSR-3 entries to the Spora logger (`storage/spora.log`) instead of writing to a database audit table. Enable `debug` level in the operator log config to see them.

## H3 video tool

`minimax:video` uses MiniMax's **H3** multimodal video model. Only `MiniMax-H3` is supported — the legacy Hailuo models (`MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-02`, `T2V-01-Director`, `T2V-01`) are gone.

### Operations

| Operation | Description |
| --- | --- |
| `generate` (default) | Submit a new H3 task with text + optional image/video/audio references. Polls until `succeeded`, archives the MP4 to the Media Archive. |
| `resume` | Continue polling a previously submitted task by `task_id`. Use when a previous `generate` returned `data.timed_out: true`. |
| `enhance_prompt` | Send the same multimodal inputs to H3-Context-IR and return an enriched, structured prompt (no video is produced). Use the returned prompt in a follow-up `generate` call for best results. |
| `regenerate` | Upsample a finished 768P H3 video to 2K. Re-submits the original `content[]` with the previous 768P output as `base_video`. Requires a `task_id` from the original `generate`. |

### Generation modes (auto-detected)

- **Text-to-video** — only the `prompt` is supplied. `aspect_ratio` must be a concrete value (`16:9`, `9:16`, etc.); `adaptive` falls back to `16:9`.
- **Image-to-video** — `first_frame_image` (or both `first_frame_image` + `last_frame_image`) is supplied. `aspect_ratio` is forced to `adaptive` server-side.
- **Reference-to-video** — `reference_images` / `reference_videos` / `reference_audio` is supplied. `aspect_ratio` defaults to `adaptive` but can be overridden.

i2v and r2v are mutually exclusive — passing both `first_frame_image` and `reference_*` is rejected client-side.

### Input limits

| Limit | Value |
| --- | --- |
| `prompt` length | ≤ 7000 chars |
| `duration_seconds` | integer 4–15 (default 6) |
| `resolution` | `768P` (default) or `2K` |
| `aspect_ratio` | `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16` |
| Reference images | ≤ 9 |
| Reference videos | ≤ 3 |
| Reference audio | ≤ 3 |
| Frame images | ≤ 2 (first + last) |
| Frame image size | ≤ 30 MB, [256, 5760] px, aspect [0.4, 2.5] |
| Frame image format | JPG / JPEG / PNG / WEBP / HEIC / HEIF |

### URL hygiene

`first_frame_image`, `last_frame_image`, and the `reference_*` lists accept only `http://`, `https://`, `mm_file://`, or `data:` URIs. Spora Media Archive URLs (`/api/v1/assets/<token>.<ext>`) are rejected — they aren't reachable from MiniMax's servers. For an uploaded image, either generate a fresh still via `minimax:image` first (recommended) or pass a publicly-reachable URL. See the `minimax-image-to-video` skill for the full workflow.

`data:` URIs are accepted up to 50 MB of inline base64 (the v2 endpoint caps the request body at 64 MB).

### Skills

The plugin ships five skills:

- `minimax-image` — generate a still image from a prompt
- `minimax-speech` — TTS synthesis
- `minimax-music` — instrumental / with-lyrics / standalone-lyrics music
- `minimax-video` — text-to-video, image-to-video, reference-to-video (the canonical H3 reference)
- `minimax-image-to-video` — workflow skill chaining `minimax:image` → `minimax:video` for animation-from-still use cases

The Media Agent template (`agent-templates/media-agent.json`) enables all four video operations and exposes the image-to-video workflow skill.

## Text generation via MiniMax

Spora's **Anthropic-compatible driver** talks to MiniMax's Anthropic-protocol endpoint. Configure any agent with:

- `llm_provider`: `anthropic`
- `base_url` (Global / international): `https://api.minimax.io/anthropic`
- `base_url` (China): `https://api.minimaxi.com/anthropic`
- `llm_api_key`: the same `MINIMAX_API_KEY`
- `llm_model`: e.g. `MiniMax-M3`

No plugin code is involved.

## Development

```bash
composer install
composer analyse            # PHPStan
./vendor/bin/pest --parallel --processes=auto   # 151 tests
./vendor/bin/php-cs-fixer fix --dry-run --diff  # formatting check
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan per `phpstan.neon`, php-cs-fixer dry-run. A separate `coverage` job runs Pest with `pcov` and uploads `coverage.xml` + JUnit; the `sonar` job then uploads both to SonarCloud (project key `spora-ai_spora-plugin-minimax`), so the `new_coverage` metric is measurable per PR. Requires the `SONAR_TOKEN` secret in the repo. MIT license.

---

**Repo:** [spora-ai/spora-plugin-minimax](https://github.com/spora-ai/spora-plugin-minimax) · **MIT**
