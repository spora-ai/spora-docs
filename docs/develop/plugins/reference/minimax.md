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

After install, tools are exposed as `minimax:image`, `minimax:speech`, `minimax:music`, `minimax:video`, `minimax:video_v1`.

## Configuration

Settings → Tools → MiniMax. All five tools share the same `MINIMAX_API_KEY` (issued at <https://platform.minimax.io> → API Keys).

The default `base_url` is the **Global** endpoint (`https://api.minimax.io`). Operators in China should override `base_url` to `https://api.minimaxi.com` for the China-region endpoint.

| Setting                 | Required | Default                           |
| ----------------------- | -------- | --------------------------------- |
| `api_key`               | yes      | —                                 |
| `base_url`              | no       | `https://api.minimax.io` (Global) |
| `model`                 | no       | per provider (see below)          |
| `voice_id`              | no       | `English_PassionateWarrior`       |
| `poll_interval_seconds` | no       | `10` (video tools)                |
| `poll_timeout_seconds`  | no       | `900` (video tools)               |
| `submit_timeout_seconds`| no       | `120` (video tools)               |
| `retrieve_timeout_seconds` | no    | `30` (video_v1 only)              |

`api_key` fields are encrypted at rest by Spora's `ToolConfigService`, masked in the UI, and never logged.

## Per-tool parameters

Each tool accepts a `prompt` and returns `ToolResult::ok` (with the upstream CDN URL, valid 24h) or `ToolResult::fail`. Never throws — a single API failure cannot kill the agent loop.

| Tool                 | Default model        | Notes                                                                                                                                                             |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimax:image`      | `image-01`           | `aspect_ratio` ∈ 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9                                                                                                        |
| `minimax:speech`     | `speech-2.8-hd`      | TTS; `voice_id`, `speed` (0.5-2.0)                                                                                                                                |
| `minimax:music`      | `music-3.0`          | Operations: `compose` (instrumental or with `lyrics`, 1-3500 chars), `write_lyrics` (full song from a topic), `edit_lyrics` (rewrite existing lyrics). `music-2.6` and `music-cover` are also accepted by the upstream endpoint. |
| `minimax:video`      | `MiniMax-H3`         | Async; multimodal. Operations: `generate`, `resume`, `enhance_prompt`, `regenerate` (2K upscale). See [H3 video tool](#h3-video-tool) below.                       |
| `minimax:video_v1`   | `MiniMax-Hailuo-2.3` | Fall-back for plans that don't include H3. Legacy v1 API. See [Video v1 (legacy)](#video-v1-legacy) below.                                                         |

The `minimax:music` tool's `action` discriminator selects the operation. `compose` uses `/v1/music_generation` and accepts an optional `lyrics` parameter. The `write_lyrics` and `edit_lyrics` operations use `/v1/lyrics_generation`. All three operations share the same `api_key`, `base_url`, and (compose-only) `model` settings.

Debug logging: every tool emits `debug` / `info` / `warning` PSR-3 entries to the Spora logger (`storage/spora.log`). Enable `debug` level in the operator log config to see them. As of 1.2.0, no audit table is written — the v1-era `minimax_generation_log` was removed (write-only, no SELECTs) and replaced with these debug logs.

### Error messages

`MiniMaxHttpClient` surfaces the upstream `error.message` on every 4xx/5xx response. For example, the v2 H3 endpoint returns:

```
MiniMax API returned HTTP 400: [2013] TokenPlan or Credit does not currently support MiniMax-H3 series models
```

— so the LLM can pivot to the v1 tool on the first failure instead of guessing. The agent's `media-agent.json` includes a fall-back rule that triggers on this exact error.

## H3 video tool

`minimax:video` uses MiniMax's **H3** multimodal video model. Only `MiniMax-H3` is supported — the legacy Hailuo models (`MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-02`, `T2V-01-Director`, `T2V-01`) are not exposed on this tool.

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

`first_frame_image`, `last_frame_image`, and the `reference_*` lists accept only `http://`, `https://`, `mm_file://`, or `data:` URIs (≤ 50 MB). Spora Media Archive URLs (`/api/v1/assets/<token>.<ext>`) are rejected — they aren't reachable from MiniMax's servers. For an uploaded image, either generate a fresh still via `minimax:image` first (recommended) or pass a publicly-reachable URL. See the `minimax-image-to-video` skill for the full workflow.

## Video v1 (legacy)

`minimax:video_v1` uses MiniMax's **legacy v1 video API**. Re-introduced in 1.3.0 as a fall-back for operators whose TokenPlan doesn't include `MiniMax-H3` (the v2-only model). The v2 endpoint returns `MiniMax API returned HTTP 400: [2013] TokenPlan or Credit does not currently support MiniMax-H3 series models` — the LLM should retry with `minimax:video_v1` and the same prompt.

### Operations

| Operation | Description |
| --- | --- |
| `generate` (default) | Submit a v1 task (text prompt). Polls until `Success` or timeout, then retrieves the download URL via `/v1/files/retrieve`. |
| `resume` | Continue polling a previously submitted v1 task by `task_id`. Use when a previous `generate` returned `data.timed_out: true`. |

### Models

`MiniMax-Hailuo-2.3` (default), `MiniMax-Hailuo-02`, `T2V-01-Director`, `T2V-01`. The i2v siblings (`MiniMax-Hailuo-2.3-Fast`, `I2V-01-Director`, `I2V-01-live`, `I2V-01`) are listed in the matrix but rejected by this build until the i2v code path lands.

### Resolution × duration matrix

| Model | 512P | 720P | 768P | 1080P |
| --- | --- | --- | --- | --- |
| `MiniMax-Hailuo-2.3` | — | 6s | 6s or 10s | 6s |
| `MiniMax-Hailuo-02` | — | 6s | 6s or 10s | 6s |
| `T2V-01-Director` | — | 6s | — | 6s |
| `T2V-01` | — | 6s | — | 6s |

The Hailuo family is the only one that supports 10s (and only at 768P). The T2V-01 family has no 768P at all.

### Settings

| Setting | Default | Notes |
| --- | --- | --- |
| `api_key` | — (required) | Shared with the v2 video tool. |
| `base_url` | `https://api.minimax.io` | Override for China-region or private gateway. |
| `model` | `MiniMax-Hailuo-2.3` | One of the four models above. |
| `poll_interval_seconds` | `10` | Seconds between status polls. |
| `poll_timeout_seconds` | `900` | Total wait window. |
| `submit_timeout_seconds` | `120` | Per-request timeout for the submit call. |
| `retrieve_timeout_seconds` | `30` | Per-request timeout for `/v1/files/retrieve`. |

### When to use v1 vs H3

Use `minimax:video` (H3) by default. Use `minimax:video_v1` only when:

1. The H3 endpoint returns `[2013]` `TokenPlan or Credit does not currently support MiniMax-H3 series models` (the plan-tier cap).
2. The operator's plan includes `MiniMax-Hailuo-2.3` at 1080P 6s (H3 doesn't expose 1080P).
3. The agent specifically needs a v1-only model configuration.

The Media Agent's `media-agent.json` routing table includes a fall-back rule that triggers on the `[2013]` error and switches to `minimax:video_v1` with the same prompt.

## Skills

The plugin ships five skills:

- `minimax-image` — generate a still image from a prompt
- `minimax-image-to-video` — workflow skill chaining `minimax:image` → `minimax:video` for animation-from-still use cases
- `minimax-music` — instrumental / with-lyrics / standalone-lyrics music
- `minimax-speech` — TTS synthesis
- `minimax-video` — text-to-video, image-to-video, reference-to-video (the canonical H3 reference)
- `minimax-video-v1` — fall-back v1 video generation

The Media Agent template (`agent-templates/media-agent.json`) enables the four video operations on `minimax:video` (including `enhance_prompt` and `regenerate`), the two video operations on `minimax:video_v1`, and exposes the `minimax-image-to-video` and `minimax-video-v1` workflow skills.

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
composer test:parallel       # Pest — 189 tests, ~50 s
composer lint               # PHP-CS-Fixer dry-run
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan per `phpstan.neon`, php-cs-fixer dry-run. A separate `coverage` job runs Pest with `pcov` and uploads `coverage.xml` + JUnit; the `sonar` job then uploads both to SonarCloud (project key `spora-ai_spora-plugin-minimax`), so the `new_coverage` metric is measurable per PR. Requires the `SONAR_TOKEN` secret in the repo. MIT license.

---

**Repo:** [spora-ai/spora-plugin-minimax](https://github.com/spora-ai/spora-plugin-minimax) · **MIT**
