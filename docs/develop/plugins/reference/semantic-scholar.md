---
title: Semantic Scholar
description: Academic paper search and metadata retrieval — backed by the public Semantic Scholar Graph API.
---

# Semantic Scholar Plugin for Spora

Academic paper search and metadata retrieval — backed by the public [Semantic Scholar](https://www.semanticscholar.org) Graph API (Allen Institute for AI). Free, no API key required; an optional key raises the rate limit.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-semantic-scholar
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the tool is exposed as `semantic_scholar` with five operations (see [Per-tool parameters](#per-tool-parameters)).

## Configuration

Settings → Tools → Semantic Scholar.

The plugin talks to the public Semantic Scholar Graph API (`https://api.semanticscholar.org`). The base URL is currently fixed and cannot be overridden from the UI.

| Setting        | Required | Default | Notes                                                                                                                                                             |
| -------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http_timeout` | no       | `30`    | Per-request timeout in seconds. Can also be set with the `SPORA_TOOL_HTTP_TIMEOUT` env var.                                                                       |
| API key        | no       | —       | Optional. Sign up at <https://www.semanticscholar.org/product/api> to receive a private key. The free tier works without one; a key raises the per-IP rate limit. |

**Rate limits** (vendor-published, see [API product page](https://www.semanticscholar.org/product/api)):

- **Unauthenticated** — shared budget of 1000 RPS across all anonymous callers; further throttling under load.
- **Authenticated** — introductory 1 RPS, with higher limits available to approved keys.

Either way, a single API failure cannot kill the agent loop: every call returns a `ToolResult::ok` or `ToolResult::fail` with a human-readable message, never throws.

## Per-tool parameters

The tool accepts an `action` discriminator selecting one of the five operations. All parameters are optional unless noted.

| Operation             | Parameters                                                                                                                                      | Returns                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `paper_search`        | `query` (string, **required**), `limit` (1-100, default 10), `year` (string, e.g. `2023` / `2020-2024` / `<2020`), `open_access_only` (boolean) | `total`, `returned`, `query`, plus formatted list of papers (title, authors, year, venue, citations, DOI, PDF link, abstract excerpt) |
| `get_paper`           | `paper_id` (string, **required** — 40-char Semantic Scholar ID, or DOI / ArXiv / PubMed)                                                        | `paper_id`, `title`, plus full formatted metadata including DOI, ArXiv, PubMed, open-access PDF                                       |
| `get_citations`       | `paper_id` (string, **required**), `limit` (1-100, default 20), `offset` (default 0)                                                            | `paper_id`, `total`, `returned`, `offset`, plus formatted citing papers                                                               |
| `get_references`      | `paper_id` (string, **required**), `limit` (1-100, default 20), `offset` (default 0)                                                            | `paper_id`, `total`, `returned`, `offset`, plus formatted referenced papers                                                           |
| `get_recommendations` | `paper_id` (string, **required**), `limit` (1-20, default 10)                                                                                   | `paper_id`, `returned`, plus formatted recommended papers                                                                             |

**Fields returned by the API** (set by the plugin, not configurable per call): `title, abstract, authors, year, venue, citationCount, url, openAccessPdf, externalIds, isOpenAccess`. Recommendations omits `isOpenAccess`.

Example agent invocation:

```json
{
  "action": "paper_search",
  "query": "transformer attention is all you need",
  "limit": 5,
  "year": "2017-2024"
}
```

```json
{
  "action": "get_citations",
  "paper_id": "DOI:10.1038/nature14539",
  "limit": 10,
  "offset": 0
}
```

## Vendor links

- **API product page / signup** — <https://www.semanticscholar.org/product/api>
- **API reference** — <https://api.semanticscholar.org/api-docs/>
- **API License Agreement** — <https://www.semanticscholar.org/product/api/license>

## Translations

The plugin ships a German catalogue at `locales/de.json`, declared through `SemanticScholarPlugin::translationsPaths()`. The catalogue key is the **English source string**:

```json
{
  "Semantic Scholar": "Semantic-Scholar",
  "Semantic Scholar academic paper search for Spora agents.": "Akademische Papersuche über Semantic Scholar für Spora-Agenten."
}
```

`"Semantic Scholar"` is a product name, and German orthography hyphenates a foreign proper name made of several words — so the value is `"Semantic-Scholar"`. The hyphen is the translation, not a rewording: inside a sentence the name keeps its original spelling, as the second entry shows.

Only operator-facing copy is translated — the tool's display name and the plugin description. The one `#[ToolSetting]` description the tool declares (`http_timeout`) is **not** in the catalogue, so that setting still reads in English on a German install — core declares the identical string and already translates it. Strings the model reads (`#[Tool].description`, `#[ToolParameter].description`, `#[ToolSetting].label` and its option labels) stay English, in the operator's view too: a German tool description degrades the model's tool selection, and a translated label that also reaches the model puts German into its prompt.

Editing the English orphans the translation — the key changes and the old entry is dead — so re-translate in the same commit. The repository checks its catalogue against three rules: no translation is empty, none is identical to its key, and no key survives a copy edit. The gate is this repository's own `tests/Unit/LocaleCatalogTest.php`.

Requires `spora-core >= 0.31.0`; on older cores the catalogue is ignored.

## Development

```bash
composer install
./vendor/bin/pest           # tests
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan, php-cs-fixer dry-run, plus SonarCloud analysis (project key `spora-ai_spora-plugin-semantic-scholar`). MIT license.

---

**Repo:** [spora-ai/spora-plugin-semantic-scholar](https://github.com/spora-ai/spora-plugin-semantic-scholar) · **MIT**
