---
title: Serper
description: Google Search via Serper.dev — 9 operations across web, images, news, videos, scholar, shopping, patents, maps, places.
---

# Serper Plugin for Spora

Adds **Google Search** to [Spora](https://github.com/spora-ai/spora) agents via the [Serper.dev](https://serper.dev) REST API. One tool, nine operations covering web, images, news, videos, scholar, shopping, patents, maps, and places — backed by structured Google results (organic, knowledge graph, "people also ask", answer box, related searches, image/news/video blocks).

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-serper
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install the tool `serper_search` is registered with nine operations. Pick an operation by passing `"operation": "<name>"` to the tool — see [Per-tool operations](#per-tool-operations).

## Configuration

Settings → Tools → Serper Search. Sign up at <https://serper.dev> to obtain an API key (2,500 free queries on signup). Serper.dev is the upstream source — this plugin is a thin PHP wrapper, not a search engine.

| Setting        | Required | Default                                                     |
| -------------- | -------- | ----------------------------------------------------------- |
| `api_key`      | yes      | —                                                           |
| `http_timeout` | no       | `30` (seconds; falls back to `SPORA_TOOL_HTTP_TIMEOUT` env) |

`api_key` is encrypted at rest by Spora's `ToolConfigService`, masked in the UI, and never logged. The plugin uses the public endpoint `https://google.serper.dev` (hard-coded in `makeSerperRequest`; not overridable in v1) and authenticates every call with an `X-API-KEY` header. Rate limits and per-second quotas are governed by your Serper.dev plan — Spora does not throttle on top of that.

## Per-tool operations

The plugin ships one tool, `serper_search`, that dispatches on an `operation` parameter to one of nine Serper.dev endpoints. Every operation takes a single required `q` (the search query string) and POSTs JSON to the matching path under `https://google.serper.dev`. Responses are normalised into a human-readable numbered list the agent can quote or cite.

| Operation         | Endpoint         | What it returns                                               |
| ----------------- | ---------------- | ------------------------------------------------------------- |
| `search`          | `POST /search`   | Organic results, answer box / knowledge graph snippet         |
| `image_search`    | `POST /images`   | Image results with `imageUrl`, `sourceUrl`, `sourceName`      |
| `news_search`     | `POST /news`     | News articles with source, date, snippet                      |
| `video_search`    | `POST /videos`   | Video results with source, date, snippet                      |
| `scholar_search`  | `POST /scholar`  | Scholarly papers with title, link, snippet, `publicationInfo` |
| `shopping_search` | `POST /shopping` | Product results with source, price, snippet                   |
| `patents_search`  | `POST /patents`  | Patent records with `patentId`, date, snippet                 |
| `maps_search`     | `POST /maps`     | Local map results with address, phone, rating, hours, website |
| `places_search`   | `POST /places`   | Detailed place records with type, opening hours, website, URL |

All operations accept the same base Serper.dev parameters (`q` is the only one surfaced through the tool today — `gl`, `hl`, `num`, `page`, and `autocorrect` are accepted by the upstream API but not yet exposed through the tool's argument schema). Endpoint coverage matches [Serper.dev's endpoint list](https://serper.dev).

## Development

```bash
composer install
./vendor/bin/pest
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4, PHPStan analysis, php-cs-fixer dry-run. A separate `coverage` job runs Pest with `pcov` and uploads `coverage.xml` + JUnit; the `sonar` job uploads both to SonarCloud (project key `spora-ai_spora-plugin-serper`), so the `new_coverage` metric is measurable per PR. Requires the `SONAR_TOKEN` secret in the repo. MIT license.

---

**Repo:** [spora-ai/spora-plugin-serper](https://github.com/spora-ai/spora-plugin-serper) · **MIT**
