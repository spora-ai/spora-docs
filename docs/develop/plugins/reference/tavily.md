---
title: Tavily
description: AI-native web search via Tavily — search the web and receive an LLM-optimised answer plus ranked source results.
---

# Tavily Plugin for Spora

Adds [Tavily](https://tavily.com)'s AI-native web search to [Spora](https://github.com/spora-ai/spora) agents — search the web and receive an LLM-optimised answer plus ranked source results in one tool call. A free tier is available.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-tavily
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the tool is exposed as `tavily_search` (visible in `php bin/spora plugin:list` and the agent UI under Tools).

## Configuration

Settings → Tools → Tavily Search. Authentication uses a Bearer token against `https://api.tavily.com`.

| Setting        | Required | Default                                                         |
| -------------- | -------- | --------------------------------------------------------------- |
| `api_key`      | yes      | —                                                               |
| `http_timeout` | no       | `30` (seconds; overridden by `SPORA_TOOL_HTTP_TIMEOUT` env var) |

`api_key` is encrypted at rest by Spora's `ToolConfigService`, masked in the UI, and never logged (the `api_key` field in outbound payload logs is redacted as `***`).

## Per-tool parameters

The plugin ships **one** tool, `tavily_search`. It calls Tavily's `POST https://api.tavily.com/search` endpoint and returns `ToolResult::ok` (formatted text) or `ToolResult::fail`. Never throws — a single API failure cannot kill the agent loop.

| Parameter      | Type   | Required | Default | Notes                                                              |
| -------------- | ------ | -------- | ------- | ------------------------------------------------------------------ |
| `query`        | string | yes      | —       | The exact research question or search query.                       |
| `search_depth` | string | no       | `basic` | `basic` or `advanced`. Advanced traverses deeper but takes longer. |

### What it returns

On success, the tool returns a single text block:

```text
Search Results for '<query>':

Summary: <LLM-generated answer, if include_answer is true>

[1] <result title>
URL: <result url>
<result content snippet>

[2] ...
```

Internally the tool sends:

```json
{
  "api_key": "<your key>",
  "query": "<query>",
  "search_depth": "basic",
  "include_answer": true
}
```

to `https://api.tavily.com/search`. The full Tavily `/search` parameter set (`topic`, `max_results`, `include_raw_content`, `time_range`, `start_date`, `end_date`, `include_domains`, `exclude_domains`, `country`, `include_images`, `auto_parameters`, `exact_match`, `safe_search`, …) is documented at <https://docs.tavily.com/documentation/api-reference/endpoint/search>. Exposing them as agent-callable arguments is out of scope for v1; if you need a knob, open an issue.

## Tavily account

- Sign up: <https://tavily.com>
- API key dashboard: <https://app.tavily.com/home>
- API reference: <https://docs.tavily.com>

Rate-limit / plan errors come back as HTTP `429` / `432` / `433` and surface as `ToolResult::fail` with the status code embedded.

## Development

```bash
composer install
./vendor/bin/pest           # 4 tests
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff --no-interaction
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan level (per `phpstan.neon`), php-cs-fixer dry-run. A separate `coverage` job runs Pest with `pcov` and uploads `coverage.xml` + JUnit; the `sonar` job uploads both to SonarCloud (project key `spora-ai_spora-plugin-tavily`), so the `new_coverage` metric is measurable per PR. Requires the `SONAR_TOKEN` secret in the repo.

---

**Repo:** [spora-ai/spora-plugin-tavily](https://github.com/spora-ai/spora-plugin-tavily) · **MIT**
