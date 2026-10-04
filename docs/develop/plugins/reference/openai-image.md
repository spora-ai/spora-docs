---
title: OpenAI Image
description: OpenAI-compatible image generation for Spora agents — one tool, two operations, and a base_url that works with any compatible provider.
---

# OpenAI Image Plugin for Spora

Image generation for [Spora](https://github.com/spora-ai/spora) agents against any **OpenAI-compatible** image API. The plugin ships one tool with two operations: single-image generation, and a multi-image / variations operation that takes either a prompt or a source image.

This is the **vendor-neutral** option. The same trick that lets Spora's Anthropic-compatible LLM driver talk to any provider that speaks that shape — swap the `base_url`, keep the key — applies to image generation here. Point `base_url` at OpenAI's `https://api.openai.com/v1`, or at a self-hosted gateway, a regional endpoint, or another vendor that implements `/v1/images/generations` and `/v1/images/variations` over the same contract. If you find yourself choosing between a vendor-locked image plugin and this one, the deciding question is whether your provider is OpenAI-shaped. If it is, you do not need a second plugin.

There is no admin panel — settings live under Settings → Tools like any other tool.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-openai-image
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the tool reaches the LLM as `openai-image:image_openai` — plugin tools carry a `<plugin-slug>:` prefix on the wire (see [Concepts → Tools → Tool naming](/reference/concepts/tools#tool-naming)). It is declared as `image_openai` in the `#[Tool]` attribute, sits in the `generation` category, and uses the `image` icon. `spora-plugin-media-archive` is listed under `suggest` — when present, generated images land in the gallery; when absent, the tool falls back to a data URL.

## Configuration

Settings → Tools → OpenAI Image. Cascade: agent → principal → global, so one global key can serve a whole installation and a single agent can be pointed at a different provider or model.

| Setting                | Required | Default                     | Notes                                                                                                                                                                                                                                                                 |
| ---------------------- | -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api_key`              | yes      | —                           | API key for the configured provider. Encrypted at rest by Spora's `ToolConfigService`, masked in the UI, never logged. A missing key fails the call immediately with `OpenAI-compatible image API key is not configured for this agent.` — the plugin does not retry. |
| `base_url`             | no       | `https://api.openai.com/v1` | API base URL. `/images/generations` and `/images/variations` are appended automatically, so give the versioned base (`.../v1`), not the full endpoint. Trailing slashes are trimmed.                                                                                  |
| `model`                | no       | `gpt-image-2`               | Image model identifier supported by the configured provider.                                                                                                                                                                                                          |
| `http_timeout_seconds` | no       | `600`                       | Per-request timeout. The default is generous enough for `generate_variations(n: 8)` at high quality on a slow link. Lower it for fast failure on single-image drafts; raise it if the upstream still hits an idle timeout.                                            |

The plugin sends `Authorization: Bearer <api_key>` on every request. There is no internal retry loop — every failure surfaces to the LLM so it can adapt (smaller `size`, lower `quality`, or ask the operator to raise the timeout) rather than burning quota on a blind retry.

### Pointing at a different provider

Change `base_url` and, if the provider names models differently, `model`. Nothing else is provider-specific. Two shapes to know about:

- Any provider that returns `data[].b64_json` on `/v1/images/generations` works as-is. The plugin only ever reads that field — if the provider returns a hosted `url` instead of base64, the tool reports `Image API returned no base64 image data.`
- `/v1/images/variations` only has to accept a multipart `image` file plus `n` and `size`. Anything beyond those three fields is dropped, so a provider that implements only the generations half still works for `generate`.

## Per-tool parameters

The tool exposes **two** operations on the auto-synthesised `action` discriminator. `generate` is auto-approved; `generate_variations` requires approval by default because it can produce up to eight billable images per call.

| Operation             | Approval by default | Upstream endpoint                                                                                                   | Purpose                                                                              |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `generate`            | no                  | `POST {base_url}/images/generations`                                                                                | One image from a text prompt. Always exactly one.                                    |
| `generate_variations` | yes                 | `POST {base_url}/images/generations` (prompt-based) or `POST {base_url}/images/variations` (image-based, multipart) | `n` independent samples from one prompt, or semantic variations of a supplied image. |

| Parameter     | Type    | Required        | Default | Notes                                                                                                                                                                                                                     |
| ------------- | ------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`      | string  | for `generate`¹ | —       | The text prompt. Max 32 000 chars.                                                                                                                                                                                        |
| `input_image` | string  | no              | —       | Source image for image-based variations. Accepts an http(s) URL, a `data:` URI, a 36-char Media Archive UUID, or an opaque `/api/v1/assets/<uuid>.<ext>` URL. Max 4 096 chars. Only meaningful for `generate_variations`. |
| `n`           | integer | no              | `3`     | Number of variation images. Clamped to 2–8. Only applied by `generate_variations`; the upstream API charges per image produced.                                                                                           |
| `size`        | string  | no              | `auto`  | `auto` \| `1024x1024` \| `1536x1024` \| `1024x1536`.                                                                                                                                                                      |
| `quality`     | string  | no              | `auto`  | `auto` \| `low` \| `medium` \| `high`.                                                                                                                                                                                    |
| `background`  | string  | no              | `auto`  | `auto` \| `opaque` \| `transparent`.                                                                                                                                                                                      |
| `filename`    | string  | no              | auto    | Human-readable archive filename stem, no extension — `.png` is appended. A `-1`, `-2`, … suffix is added per image when more than one comes back. Max 120 chars.                                                          |

¹ `prompt` is required for `generate` and required for `generate_variations` _unless_ `input_image` is supplied. The tool returns `generate_variations requires either 'prompt' or 'input_image'.` when both are empty, and `Prompt cannot be empty.` for a blank `generate` prompt.

Fields set to `auto` are omitted from the outbound body entirely rather than sent as the literal string, so the provider picks its own default. `size` **is** forwarded on image-based variations — the multipart body carries `image`, `n` and `size`. Only `quality` and `background` are dropped there, because `/v1/images/variations` does not accept them; the tool's own parameter descriptions say so, and say nothing of the sort about `size`.

### Resolving `input_image`

`input_image` accepts four shapes, and the plugin normalises them server-side before the HTTP client sees them:

| Shape                                                | Handling                                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/assets/<uuid>.<ext>` or a bare 36-char UUID | Resolved through the Media Archive reader to a `data:` URI (or forwarded as the source URL for externally-stored assets), so the bytes never enter the chat context. |
| `data:` URI                                          | Decoded directly.                                                                                                                                                    |
| `http(s)` URL                                        | Fetched server-side.                                                                                                                                                 |

A UUID that does not resolve, or that the caller cannot see, fails the call with an actionable message rather than a generic HTTP error, as does an asset over the 25 MB `data:` URI cap — the message carries the actual size. Externally-stored assets are **not** a failure case: they are forwarded as their source URL and fetched server-side, so only the two inlining paths (`data_url` and `local`) are subject to the size cap. Only the first table row is Spora-specific; the last two are plain upstream behaviour.

## The verbatim-echo rule

This plugin is the reference implementation of a return contract that other Spora tools are converging on, and it is worth copying if you are writing a tool that produces a media artefact.

Every successful call returns three things: a heading, one or more Markdown image blocks, and a trailing instruction.

```text
Generated 3 images — a hand-drawn ink sketch of a lighthouse at dusk

![Generated image 1](/api/v1/assets/<uuid-1>.png)

![Generated image 2](/api/v1/assets/<uuid-2>.png)

![Generated image 3](/api/v1/assets/<uuid-3>.png)

Echo the markdown image block above verbatim so the chat UI renders the image inline. For raw URLs, read ToolResult.data.image_urls.
```

The contract has two halves, and both exist because of observed LLM failure modes:

1. **Echo the markdown block character for character.** The block is the only thing the chat UI's sanitiser accepts — it parses the `![alt](url)` form and renders it inline. An agent that rewrites the alt text, drops the block, or reformats it into prose loses the image. The block is also per-image (`Generated image 1`, `Generated image 2`, …) and joined by blank lines; splitting or re-captioning them breaks the layout. The **prompt** is truncated to 80 characters with whitespace collapsed for the heading and alt text — long headings eat chat context and long alt text breaks some markdown renderers — but the untruncated prompt stays available on the data channel.
2. **Read raw URLs from `ToolResult.data.image_urls`, never by re-parsing the rendered block.** The data channel is the only authoritative source. Agents asked to "embed the result in a follow-up call" otherwise re-extract a URL from the markdown, mangle it, or hallucinate a plausible-looking one. `image_urls` is a list even when there is one entry, so a future multi-image `generate` does not change the field's type.

The full data channel on success is:

```json
{
  "image_urls": ["/api/v1/assets/<uuid>.png"],
  "model": "gpt-image-2",
  "prompt": "<the full, untruncated prompt>"
}
```

Stashing the prompt matters for multi-turn work: the agent can feed it into a follow-up `generate_variations` without asking the user to retype it.

## What it returns

On success, the tool returns a `ToolResult::ok` with the heading + Markdown blocks + the echo instruction, and the three-key data channel above. Generated images are ingested into the Media Archive as PNG assets (`plugin_slug: openai-image`, `tool_name: image`) and the returned URL is the canonical `/api/v1/assets/<uuid>.png` form. When `filename` is supplied it becomes the archive filename stem; a multi-image call suffixes `-1`, `-2`, … per image so the rows do not collide.

If the Media Archive is unavailable or ingestion throws, the tool falls back to a `data:image/png;base64,…` URL rather than failing the whole call — the image is still deliverable, it just is not in the gallery.

Failures come back as `ToolResult::fail` with the upstream's `error.message` embedded:

```text
Image generation failed: Image API returned HTTP 429: Rate limit reached for …
Image generation failed: Image API request failed: … — try a smaller size or lower quality, or ask the operator to raise http_timeout_seconds (current: 600s).
Image generation failed: Image API returned no images.
Image generation failed: Image API returned no base64 image data.
```

A missing or unreadable Media Archive asset in `input_image` fails before any upstream call is made. Nothing here throws out of the tool — a single API failure cannot kill the agent loop.

`describeAction()` renders the call for the approval UI as `Generate image for prompt: '<first 80 chars>'` (or `Generate image variations for prompt: …`), so the operator approving a `generate_variations` call sees which prompt is about to cost money.

## Skills

The plugin ships one skill, `openai-image` (`skills/openai-image/SKILL.md`). It covers both operations with per-parameter tables, the `size` / `quality` / `background` semantics, when to ask the user about an ambiguous aspect ratio, the data-URL fallback, and a failure-handling section — including an explicit "do not retry a successful generation" rule, since extras consume provider quota. It declares `allowed-tools: Spora\Plugins\OpenAIImage\Tools\OpenAIImageGenerationTool` and a compatibility floor of `spora>=0.15 spora-plugin-openai-image>=1.1`.

## Agent template

`agent-templates/image-agent.json` — id **`image-agent`**, name "Image Agent", version 1.0.0, `required_plugins: ["spora-ai/spora-plugin-openai-image"]`. It enables the generation tool, `CalculatorTool`, `CurrentTimeTool`, `ReadUrlTool`, `TimeTool`, and `SkillTool` with an allowlist of `time-arithmetic` and `openai-image`; metadata is `category: general`, `archetype: creative`, `icon: image`.

Its system prompt is where the verbatim-echo rule is written down as an agent-level contract — echo the block exactly, keep the trailing sentence, read raw URLs from `ToolResult.data.image_urls` rather than re-extracting them — alongside two rules worth stealing: **ask before guessing** on size, quality, and background (a square avatar and a hero banner are not interchangeable), and **do not retry a successful call**.

## Development

```bash
composer install
composer test:parallel     # Pest
composer analyse           # PHPStan
composer lint              # php-cs-fixer dry-run
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan (2G memory limit), php-cs-fixer dry-run, a `coverage` job producing `coverage.xml` via Xdebug, and a `sonar` job (display name `SonarCloud scan`, project key `spora-ai_spora-plugin-openai-image`, 30-day `sonar.leak.period` from `sonar-project.properties`) that ingests it. MIT license.

`plugin.json` sets `icon` to a **raw SVG path string** rather than a bundled icon name — the host's `<Icon>` component falls back to a single-path icon only when the value matches `/^(?:(?:M\s*\d)|(?:m\s*-?\d))/`, i.e. it must begin `M` (or `m`) immediately followed by a digit. This plugin's value starts `M5 3h14…`, so it renders as the bespoke glyph it was written for; a path opening with `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A` or `Z` would **not** match and would silently render as the `puzzle` fallback icon. That is one of the two forms the manifest's `icon` field accepts; the other is a bundled name.

---

**Repo:** [spora-ai/spora-plugin-openai-image](https://github.com/spora-ai/spora-plugin-openai-image) · **MIT**
