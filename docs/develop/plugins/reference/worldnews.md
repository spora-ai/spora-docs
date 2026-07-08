---
title: World News
description: World News API — top news by country and full-text/semantic news search across 170k+ articles/day, 210+ countries, 86+ languages.
---

# World News Plugin for Spora

Adds [World News API](https://worldnewsapi.com) headline and search capabilities — **top news by country** and **full-text/semantic news search** across 170,000+ articles/day from 210+ countries in 86+ languages — to [Spora](https://github.com/spora-ai/spora) agents.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-worldnews
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the tool is exposed as `worldnews:search`.

## Configuration

Settings → Tools → World News. The plugin needs a single API key, issued at <https://worldnewsapi.com> → Console. A free tier is available.

| Setting        | Required | Default                                                |
| -------------- | -------- | ------------------------------------------------------ |
| `api_key`      | yes      | —                                                      |
| `http_timeout` | no       | `30` (seconds; respects `SPORA_TOOL_HTTP_TIMEOUT` env) |

`api_key` is encrypted at rest by Spora's `ToolConfigService`, masked in the UI, and never logged. Requests send it as the `x-api-key` header per the WorldNewsAPI contract.

## Per-tool parameters

The plugin exposes one tool, `worldnews:search`, with two operations selected by the `operation` discriminator (`search` or `top-news`). Both return `ToolResult::ok` (formatted list of articles with title, source, publish date, summary, URL) or `ToolResult::fail`. The tool never throws — a single API failure cannot kill the agent loop.

### `search` — `/search-news`

Searches news by text and optional filters. Returns `news[]` from the upstream response.

| Parameter               | Type            | Required | Notes                                                  |
| ----------------------- | --------------- | -------- | ------------------------------------------------------ |
| `q`                     | string          | yes      | Keywords or phrases to search for                      |
| `source-country`        | string          | no       | ISO country code, e.g. `us`, `de`                      |
| `language`              | string          | no       | ISO 639-1 language code, e.g. `en`, `de`               |
| `category`              | string          | no       | News category, e.g. `politics`, `sports`, `technology` |
| `earliest-publish-date` | string          | no       | ISO 8601 date, e.g. `2026-04-01`                       |
| `latest-publish-date`   | string          | no       | ISO 8601 date, e.g. `2026-04-23`                       |
| `entities`              | array\<string\> | no       | Semantic entities (people, organizations, locations)   |
| `number`                | integer         | no       | Max results (1–100, default 10)                        |
| `offset`                | integer         | no       | Pagination offset                                      |

### `top-news` — `/top-news`

Returns top trending news for a specific country/language combination. The upstream response is grouped per country; the tool flattens the groups into a single article list.

| Parameter        | Type   | Required | Notes                                    |
| ---------------- | ------ | -------- | ---------------------------------------- |
| `source-country` | string | yes      | ISO country code, e.g. `us`, `de`        |
| `language`       | string | yes      | ISO 639-1 language code, e.g. `en`, `de` |

## Vendor links

- Signup + console: <https://worldnewsapi.com>
- API documentation: <https://worldnewsapi.com/docs/>
- Dashboard: <https://console.worldnewsapi.com/>

## Development

```bash
composer install
./vendor/bin/pest           # unit tests
./vendor/bin/phpstan analyse
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan level per `phpstan.neon`, php-cs-fixer dry-run. A separate `sonar` job uploads coverage + JUnit to SonarCloud (project key `spora-ai_spora-plugin-worldnews`) so the `new_coverage` metric is measurable per PR. Requires the `SONAR_TOKEN` secret in the repo. MIT license.

---

**Repo:** [spora-ai/spora-plugin-worldnews](https://github.com/spora-ai/spora-plugin-worldnews) · **MIT**
