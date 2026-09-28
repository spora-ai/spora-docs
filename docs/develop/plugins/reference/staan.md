---
title: Staan
description: EU-hosted web search via Staan — a fast ranked result list, or the same search enriched with relevance-scored excerpts of the actual page text.
---

# Staan Plugin for Spora

Adds [Staan](https://staan.ai)'s EU-hosted web search to [Spora](https://github.com/spora-ai/spora) agents. Staan runs on the same infrastructure as [Qwant](https://www.qwant.com/), Europe's privacy-first search engine: data stays in EU data centres, no third-party tracking, and results are attributable to their source. Web Search starts at €2 per 1,000 requests with the first 1,000 free every month.

The plugin ships **one** tool with **two** operations. Both call the same endpoint — Staan enables enrichment by accepting `extra_snippets` in the payload, not by exposing a second URL — so the difference is latency and depth, not plumbing.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-staan
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install the tool is exposed to the LLM as `staan:search` (visible in `php bin/spora plugin:list` and in the agent UI under Tools).

## Configuration

Settings → Tools → Staan Search. Authentication uses a Bearer token against `https://api.staan.ai/v2`.

| Setting        | Type     | Required | Default | Notes                                                                                                                                                |
| -------------- | -------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api_key`      | password | yes      | —       | From [staan.ai](https://staan.ai). Encrypted at rest, masked in the UI, never logged, and sent as an `Authorization` header — never in the payload.  |
| `market`       | select   | no       | `fr-fr` | The 12 markets below. Exposed to the LLM so it knows the effective value.                                                                            |
| `min_score`    | text     | no       | `0.2`   | `enriched_search` only. Drops excerpts below this relevance (0–1). Operator-only — a lower floor means more context.                                 |
| `max_snippets` | text     | no       | `3`     | `enriched_search` only. The **ceiling** on excerpts kept per page (1–10). The agent may ask for fewer; never more.                                   |
| `result_limit` | text     | no       | `10`    | How many results reach the agent (1–10). Staan always returns 10 per page; this truncates what the agent pays context for.                           |
| `http_timeout` | text     | no       | `30`    | Falls back to `SPORA_TOOL_HTTP_TIMEOUT` when unset, then to 30s. `0` counts as unset. `enriched_search` fetches every result page, so keep headroom. |

### Markets

Staan's prose guides advertise three. The v2 API reference enum is wider — twelve — and Staan's own documentation site collapses its tail behind a "show 4 more" control, so the full list is only recoverable from that page's source. All twelve are exposed:

|         |                             |                                  |
| ------- | --------------------------- | -------------------------------- |
| `fr-fr` | French — France _(default)_ | `en-ca` — English — Canada       |
| `de-de` | German — Germany            | `en-au` — English — Australia    |
| `en-us` | English — United States     | `en-nz` — English — New Zealand  |
| `en-gb` | English — United Kingdom    | `en-in` — English — India        |
| `en-ie` | English — Ireland           | `en-sg` — English — Singapore    |
| `en-fr` | English — France            | `en-za` — English — South Africa |

`en-fr` is the one worth knowing about on a French deployment: it returns English-language pages _hosted in France_, which `fr-fr` will not.

### Tuning the context cost

The context cost of `enriched_search` is `result_limit` × `max_snippets` × 800 characters, because every excerpt is truncated to 800 characters before it reaches the agent. Upstream chunks run 300–1800 characters, but none of that extra length is paid for. At the maximum (`result_limit: 10`, `max_snippets: 10`) that is 80k characters — about 20k tokens in a single tool result — so those two dials are the only real budget control.

| Want               | Do this                              | Cost                         |
| ------------------ | ------------------------------------ | ---------------------------- |
| Cheaper            | `result_limit: 5`, `max_snippets: 2` | ~8k characters               |
| Default            | —                                    | ~24k characters              |
| Wider excerpt pool | `min_score: 0.1`                     | more, lower-scoring passages |
| More per page      | `max_snippets: 5`                    | ~40k characters              |

The agent can lower `max_snippets` per call but cannot raise it, so a runaway agent can never exceed the ceiling you set here. `result_limit` and `min_score` are operator-only.

## Operations

| Operation         | Default enabled | Default approval | Purpose                                                                   |
| ----------------- | --------------- | ---------------- | ------------------------------------------------------------------------- |
| `search`          | yes             | auto             | Fast ranked web results. No result page is fetched.                       |
| `enriched_search` | yes             | auto             | Fetches each result page and returns relevance-scored excerpts, reranked. |

`search` is declared first, so an LLM that omits the `action` discriminator falls back to the fast path.

**Order is not the same in both.** `search` returns raw search-engine order. `enriched_search` **reranks** by excerpt relevance — result `[1]` is the most on-topic page, not the top-ranked one. The tool description says so explicitly, because "the top result" is otherwise the easiest thing for an agent to get wrong.

## Parameters

| Parameter      | Type    | Required | Default     | Notes                                                                                                                              |
| -------------- | ------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `query`        | string  | yes      | —           | Max 400 characters. Keyword-style, not a full question.                                                                            |
| `market`       | string  | no       | the setting | Any of the 12 markets. Per-call override.                                                                                          |
| `offset`       | integer | no       | `0`         | `0` / `10` / `20` / `30`. `30` is the API maximum (40 results). Values are rounded down to the nearest page.                       |
| `max_snippets` | integer | no       | the setting | `1`–`10`, `enriched_search` only. **Can only lower** the operator's `max_snippets` ceiling — an over-ask is capped, never granted. |

### Domain filtering

Staan accepts Google-style operators inside the query, on both GET and POST, and the plugin passes `query` through untouched — no parsing on our side:

```text
vector database pricing site:qdrant.tech
vector db comparison site:a.com OR site:b.com
best practices -site:reddit.com
```

The dedicated `include_domains` / `exclude_domains` fields are **not** exposed. Staan documents them as the "your application decides" path — a curated allowlist enforced regardless of what the model generates — and the plugin deliberately leaves that unmapped for v1. If you need an operator-enforced source allowlist (for example to ground a compliance-sensitive agent on a fixed set of vendor docs), that is the feature to add; `site:` operators cannot give you the guarantee, because the LLM decides whether to emit them.

## What it returns

### `search`

```text
Staan web results for 'qdrant vs weaviate':

[1] Comparing vector databases in 2026
URL: https://www.example.com/vector-dbs
Host: www.example.com
Published: 2026-04-10
Snippet: A deep dive into Pinecone, Weaviate, Qdrant...
```

### `enriched_search`

```text
Staan enriched results for 'qdrant vs weaviate' (ranked by excerpt relevance):

[1] Comparing vector databases in 2026
URL: https://www.example.com/vector-dbs
Host: www.example.com
Published: 2026-04-10
Snippet: A deep dive into Pinecone, Weaviate, Qdrant...
  [0.91] Qdrant is fully self-hosted and exposes a full-text index.
  [0.78] Weaviate ships a managed cloud tier and an open-source kernel.

[2] Qdrant documentation
URL: https://qdrant.tech/documentation
Host: qdrant.tech
Snippet: Vector similarity search engine...
  (no page excerpt available for this result — the plain snippet is shown instead)

Note: 1 of 2 result pages could not be extracted (anti-bot wall, timeout, or no
excerpt above the minimum score); their plain snippet is shown instead. Consider a
differently-worded query, or `search` for the raw result list.
```

A `Snippet:` line is the search provider's preview, **not** a quotation from the page. A `[0.91]` line is page text, scored for relevance. The bundled `staan-search` skill teaches the agent exactly this distinction so it does not quote previews as though an author wrote them.

### Footer notes

The tool appends a `Note:` line only when something the agent should know differs from a clean call:

- the search engine **rewrote the query** (`altered_query`) — the results answer that string, not the one you sent;
- some result pages could **not be extracted** — anti-bot wall, timeout, or nothing above `min_score`;
- the result list was **truncated** at `result_limit`;
- the **offset was rounded** to the API maximum.

The tool call's structured `data` also records `market`, `offset`, `enriched` and `search_id` — never in the LLM context — so an operator can trace any result set back to Staan's logs.

## Error handling

The tool never lets a failure escape — a single API or configuration fault cannot kill the agent loop. Failures come back as a `ToolResult` the agent can reason about:

| Situation                 | Message                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| No API key                | Points at the Staan Search settings.                                                                                                                |
| Query over 400 characters | **Rejected, not truncated** — reports the length and asks for keywords. A silently shortened query would return results for a _different_ question. |
| Unknown `market`          | Rejected, naming all twelve valid values.                                                                                                           |
| HTTP 401 / 403            | "Staan rejected the API key" — points at the settings.                                                                                              |
| HTTP 429                  | Names the documented 20 req/s limit and warns against parallel searches.                                                                            |
| HTTP 4xx / 5xx            | Status plus the upstream body, whitespace-flattened and clipped to 300 characters.                                                                  |

## Limits

| Limit                      | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| Rate limit                 | 20 req/s                                                      |
| Max query length           | 400 characters                                                |
| Results per page           | 10 (fixed)                                                    |
| Max offset                 | 30 (40 results total)                                         |
| Excerpt length             | 300–1800 characters upstream, truncated to 800 by this plugin |
| Recommended client timeout | 8–10s when enrichment is on; this plugin defaults to 30s      |

## Bundled skill

The plugin ships `staan-search`, which teaches the agent when `enriched_search` is worth the extra latency, that enriched results are reranked, that snippets are not quotations, and that only URLs the tool returned may be cited. Attach it through the Skill tool's `allowed_skills` picker.

The `#[Tool(recommendsSkills:)]` attribute is not declared in v1: it exists only in spora-core's unreleased branch, so declaring it would fatal on boot against a released core. The skill is still discovered through `StaanPlugin::skillPaths()`.

## Staan account

- Sign up: <https://staan.ai>
- API documentation: <https://docs.staan.ai/introduction>
- Web Search API: <https://docs.staan.ai/docs/web-search>
- Web Search for AI API: <https://docs.staan.ai/docs/web-for-ai>

## Not implemented in v1

- **`full_content=markdown`.** Part of the same endpoint, but the largest context cost by far, and overlapping with core's `read_url` for the single-URL case. Use `enriched_search` for passages, or `read_url` for one specific page.
- **The Answer API.** Deliberately excluded — it returns a pre-written answer, which removes the agent's own reasoning from the loop.
- **`include_domains` / `exclude_domains`.** See [Domain filtering](#domain-filtering).

## Development

```bash
composer install
./vendor/bin/pest                                  # 106 tests
./vendor/bin/phpstan analyse --no-progress         # level 5
./vendor/bin/php-cs-fixer fix --dry-run --diff     # same ruleset as spora-core
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan level 5, php-cs-fixer dry-run, a `coverage` job producing the clover report, and a `sonar` job uploading to SonarCloud (project key `spora-ai_spora-plugin-staan`) so the `new_coverage` metric is measurable per PR. Requires the `SONAR_TOKEN` secret in the repo.

---

**Repo:** [spora-ai/spora-plugin-staan](https://github.com/spora-ai/spora-plugin-staan) · **MIT**
