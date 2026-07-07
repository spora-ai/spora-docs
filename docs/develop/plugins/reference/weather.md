---
title: Weather
description: WeatherAPI.com current conditions, multi-day forecasts, location autocomplete, and astronomy (sunrise / sunset / moon phase).
---

# Weather Plugin for Spora

Adds [WeatherAPI.com](https://www.weatherapi.com) **current conditions, multi-day forecasts, location autocomplete, and astronomy (sunrise / sunset / moon phase)** data to [Spora](https://github.com/spora-ai/Spora) agents. Supports both metric and imperial units. A free tier is available (100k calls/month).

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-weather
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the plugin exposes a single agent-facing tool — `weather_api` — with four operations (see [Per-tool parameters](#per-tool-parameters)).

## Configuration

Settings → Tools → **Weather API**. The plugin reads its settings through `Spora\Services\ToolConfigService`; all settings can be left at defaults except `api_key`, which is required.

| Setting        | Required | Default                         | Notes                                                                                                                        |
| -------------- | -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `api_key`      | **yes**  | —                               | API key from <https://www.weatherapi.com>. Encrypted at rest by `ToolConfigService`; masked in the UI; never logged.         |
| `base_url`     | no       | `https://api.weatherapi.com/v1` | Override only if you proxy the API through your own gateway.                                                                 |
| `default_days` | no       | `3`                             | Default forecast length when the agent doesn't pass `days`. Clamped to `1..3` because the free plan caps forecast at 3 days. |
| `units`        | no       | `metric`                        | `metric` (°C, km/h) or `imperial` (°F, mph). Select in the admin UI.                                                         |
| `http_timeout` | no       | `10`                            | Seconds before an HTTP request fails. Falls back to `SPORA_TOOL_HTTP_TIMEOUT` env var.                                       |

The `q` location parameter accepts city names, `lat,lon`, US/UK/CA postal codes, METAR (`metar:EGLL`), IATA (`iata:DXB`), an IP address, `auto:ip`, or a search API `id:NNNNNN` (see the [WeatherAPI docs](https://www.weatherapi.com/docs/)).

## Per-tool parameters

The plugin exposes one tool (`weather_api`) with four operations. Pick the operation in the agent's tool call; on success the tool returns a human-readable text summary inside `ToolResult::ok`. It never throws — a single API failure surfaces as `ToolResult::fail` and the agent loop keeps running.

| Operation   | Endpoint          | Description                                                     | Parameters                                                                    | Returns                                                                                                                            |
| ----------- | ----------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `current`   | `/current.json`   | Current conditions for a location.                              | `location` (string)                                                           | Condition text + code, temp / feels-like, wind / gusts, humidity, cloud cover, UV, precipitation, pressure, day/night, local time. |
| `forecast`  | `/forecast.json`  | Multi-day forecast (clamped to 1–3 days on the free plan).      | `location` (string), `days` (int 1–3, optional, falls back to `default_days`) | One block per day: date, condition, avg/high/low temp, max wind, chance of rain, UV index.                                         |
| `search`    | `/search.json`    | Autocomplete / resolve a location name.                         | `query` (string, ≥2 chars)                                                    | Up to ~10 matches: name, region, country, lat/lon, local time.                                                                     |
| `astronomy` | `/astronomy.json` | Sunrise, sunset, moonrise/moonset, moon phase and illumination. | `location` (string), `date` (`yyyy-MM-dd`, optional, default today)           | All six astro fields for the given location and date.                                                                              |

All four operations are `enabledByDefault` and do not require human approval (`requiresApprovalByDefault: false`). Authentication is via `?key=<api_key>` query parameter on every request; the key is stripped from log lines.

## Vendor

- **Sign up**: <https://www.weatherapi.com>
- **API documentation**: <https://www.weatherapi.com/docs/>

Both metric and imperial units are supported natively by the upstream API — toggle between them with `units`.

## Development

```bash
composer install
./vendor/bin/pest           # Pest tests
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan, and php-cs-fixer dry-run. The `sonar` job uploads coverage to SonarCloud (project key `spora-ai_spora-plugin-weather`) so the `new_coverage` metric is measurable per PR; requires the `SONAR_TOKEN` secret in the repo. MIT license.

---

**Repo:** [spora-ai/spora-plugin-weather](https://github.com/spora-ai/spora-plugin-weather) · **MIT**
