---
title: Zernio
description: Social-media scheduling and publishing for Spora agents, powered by the Zernio API — 15+ networks.
---

# Zernio Plugin for Spora

Social-media scheduling and publishing for [Spora](https://github.com/spora-ai/spora-core) agents, powered by the [Zernio](https://docs.zernio.com/) API. Lets an agent discover connected social accounts, and draft, schedule, or publish posts across 15+ networks (Twitter/X, Instagram, Facebook, LinkedIn, TikTok, YouTube, Bluesky, Threads, Telegram, Discord, and more), plus manage the recurring posting queue and read analytics.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-zernio
```

For local development, install from a Composer path repository — see [Local plugin development](/develop/plugins/local-development).

## Configuration

Each tool exposes three settings (configurable globally, per user, or per agent in the admin UI):

| Setting        | Type     | Default                     | Notes                                                                        |
| -------------- | -------- | --------------------------- | ---------------------------------------------------------------------------- |
| `api_key`      | password | —                           | Zernio API key (`sk_…`). Encrypted at rest; never sent to the LLM or logged. |
| `base_url`     | text     | `https://zernio.com/api/v1` | Override only if Zernio gives you a different host.                          |
| `http_timeout` | text     | `30`                        | Per-request timeout in seconds. Falls back to `SPORA_TOOL_HTTP_TIMEOUT`.     |

If `api_key` is left blank, the tools fall back to the **`ZERNIO_API_KEY`** environment variable — so a self-hosted operator can set one key for all seven Zernio tools instead of configuring each.

Create an API key in your Zernio dashboard (`Settings → API keys`). Keys are shown only once.

## Tools

Seven grouped multi-operation tools; the LLM selects the operation via the `action` argument. Publishing and destructive operations require approval by default.

### `zernio_accounts` — discovery, profiles, account management

| Operation            | Approval | Purpose                                                                             |
| -------------------- | -------- | ----------------------------------------------------------------------------------- |
| `list_accounts`      | —        | List connected social accounts (optionally filter by `profile_id`).                 |
| `list_profiles`      | —        | List Zernio profiles (brand/project workspaces).                                    |
| `create_profile`     | ✅       | Create a new Zernio profile.                                                        |
| `update_profile`     | ✅       | Update a Zernio profile.                                                            |
| `delete_profile`     | ✅       | Delete a Zernio profile.                                                            |
| `update_account`     | ✅       | Update a connected social account (username, display name, X capabilities).         |
| `move_account`       | ✅       | Move a social account to a different profile.                                       |
| `disconnect_account` | ✅       | Disconnect a social account from Zernio.                                            |
| `account_health`     | —        | Bulk health snapshot across accounts (token status, posting/analytics permissions). |

Use `list_accounts` first to obtain the `account_ids` and platforms to target.

### `zernio_post` — post lifecycle

| Operation              | Approval | Purpose                                                                                 |
| ---------------------- | -------- | --------------------------------------------------------------------------------------- |
| `create_post`          | ✅       | Create a draft, schedule, or publish a post.                                            |
| `list_posts`           | —        | List posts (filter by `status`, `profile_id`).                                          |
| `get_post`             | —        | Get a single post by ID.                                                                |
| `update_post`          | ✅       | Update a draft, scheduled, or failed post.                                              |
| `delete_post`          | ✅       | Delete a draft or scheduled post (use `unpublish_post` for published ones).             |
| `retry_post`           | ✅       | Retry a failed post.                                                                    |
| `unpublish_post`       | ✅       | Unpublish a published post from a specific platform.                                    |
| `edit_post`            | ✅       | Edit the text of an X (Twitter) Premium post (within ~1h, max 5 edits).                 |
| `update_post_metadata` | ✅       | Update YouTube video metadata (title, description, tags, privacy, thumbnail, playlist). |

`create_post` accepts `publish_now: true` to publish immediately; `scheduled_for` + `timezone` to schedule; neither saves a draft. Pass `platforms` (per-platform targets, preferred) or `account_ids` + `platform`, plus `content` (required unless `media_items` or `customContent` cover every platform) and optional `media_items` ([{url, type (image\|video), thumbnailUrl?, alt?}, …]).

### `zernio_queue` — recurring schedule

| Operation       | Approval | Purpose                                                                   |
| --------------- | -------- | ------------------------------------------------------------------------- |
| `list_slots`    | —        | List queue schedules for a profile (use `all=true` to list every queue).  |
| `preview_queue` | —        | Preview upcoming scheduled slot times for a queue.                        |
| `next_slot`     | —        | Get the next available queue slot.                                        |
| `create_slot`   | ✅       | Create a new queue schedule (the first call creates the profile default). |
| `update_slot`   | ✅       | Update an existing queue (or the default one if `queue_id` is omitted).   |
| `delete_slot`   | ✅       | Delete a queue schedule.                                                  |

### `zernio_analytics` — insights (read-only)

| Operation            | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `post_analytics`     | Per-post or per-account performance metrics.              |
| `follower_analytics` | Follower count history for one or more accounts.          |
| `best_time_to_post`  | Best times of day to post for a given account/platform.   |
| `content_decay`      | Performance decay curve for a post or account.            |
| `daily_metrics`      | Cross-platform daily metrics rollup for a profile.        |
| `posting_frequency`  | Posting frequency vs engagement for a profile.            |
| `account_health`     | Bulk account health snapshot (token status, permissions). |

> The analytics endpoint paths follow Zernio's documented `/analytics/*` surface; confirm the exact fields against [docs.zernio.com](https://docs.zernio.com/) for your account.

### `zernio_media` — media library (upload)

| Operation       | Approval | Purpose                                                                     |
| --------------- | -------- | --------------------------------------------------------------------------- |
| `presign_media` | ✅       | Get a presigned S3 URL for uploading a file (your app does the binary PUT). |
| `upload_media`  | ✅       | Upload a small file directly to Zernio (JSON body, base64 in `data`).       |

The two-step flow for larger files: `presign_media` → your application PUTs the file to the returned URL → use the returned `public_url` in `media_items[].url` when creating a post. `upload_media` is for small single-shot uploads that fit in a JSON body.

### `zernio_webhooks` — webhook subscriptions

| Operation          | Approval | Purpose                                         |
| ------------------ | -------- | ----------------------------------------------- |
| `list_webhooks`    | —        | List all configured webhooks.                   |
| `create_webhook`   | ✅       | Create a new webhook subscription.              |
| `update_webhook`   | ✅       | Update an existing webhook (partial body).      |
| `delete_webhook`   | ✅       | Delete a webhook.                               |
| `get_webhook_logs` | —        | Get delivery logs for webhooks.                 |
| `test_webhook`     | ✅       | Fire a synthetic `webhook.test` event to a URL. |

### `zernio_validate` — pre-flight validation (read-only)

| Operation              | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `validate_post`        | Validate a post (content + media items) against platform rules. |
| `validate_post_length` | Check whether the content fits a platform character limit.      |
| `validate_media`       | Check whether a media URL is reachable.                         |
| `validate_subreddit`   | Check whether a subreddit exists on Reddit.                     |

## Development

```bash
composer install
composer test      # Pest
composer analyse   # PHPStan level 5
composer lint      # php-cs-fixer dry-run
```

## CI

Pest (PHP 8.4 + 8.5), PHPStan, php-cs-fixer, coverage, and a SonarCloud scan run on every push to `main`, on `v*` tags, and on pull requests. External actions are pinned to full commit SHAs.

## License

MIT — see [LICENSE](https://github.com/spora-ai/spora-plugin-zernio/blob/main/LICENSE).

---

**Repo:** [spora-ai/spora-plugin-zernio](https://github.com/spora-ai/spora-plugin-zernio) · **MIT**
