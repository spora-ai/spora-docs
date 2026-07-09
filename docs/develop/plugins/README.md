---
title: Plugins
description: Extending Spora with plugins — Composer packages that ship tools, drivers, and migrations. (Recipes WIP — not yet shipped.)
---

# Plugins

Spora grows in two ways: **plugins** that drop into any Spora install, and **projects** that are standalone Spora-compatible applications. This section covers plugins.

A Spora plugin is a Composer package — installable via `composer require` and shipped to Packagist like any other PHP library — that contributes runtime capabilities to a Spora deployment:

- **Tools** callable by an agent (web search, image generation, calendar ops)
- **LLM drivers** that plug into the driver factory alongside OpenAI and Anthropic
- **Migrations** that create plugin-owned database tables

> **Recipes are WIP** — the recipe hook (`PluginInterface::recipePaths()`) is declared on the interface and the scanner exists, but **no recipes are bundled or shipped in this release** and the agent create/edit UI does not yet wire up `recipe_id`. Treat recipes as scaffolded-but-not-functional until the Roadmap → Medium items land. See the [Plugin author guide](/develop/plugins/author-guide#recipes-wip--not-yet-shipped) for the same status as the plugin side.

## Authoring a plugin

If you want to write a plugin — either for your own Spora install or to publish on Packagist — start with the **[Plugin author guide](/develop/plugins/author-guide)**. It walks you through the manifest, the entry-point class, tools, drivers, migrations, local development, the `spora-plugin` keyword, the PSR-4 entry-point quirk, testing, and SemVer versioning. (Recipes are noted as WIP throughout the guide.)

## Operator: install, update, uninstall

For the operator-facing HTTP API (`POST /api/v1/plugins`, `DELETE /api/v1/plugins/{package}`, `PATCH /api/v1/plugins/{package}`) — the Web UI uses these when the `SPORA_PLUGIN_INSTALL_ENABLED` feature flag is on — see the **[Install API](/develop/plugins/install-api)** page. The CLI equivalents (`bin/spora plugin:install|uninstall|update`) are always available, regardless of the flag.

## Reference: shipped plugins

The 10 plugins currently shipped or in the Spora org:

| Plugin                                                          | What it adds                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Skeleton](/develop/plugins/reference/plugin-skeleton)          | Minimal template — start here for new plugins                                                                    |
| [Tavily](/develop/plugins/reference/tavily)                     | AI-native web search (LLM-optimised answer + ranked sources)                                                     |
| [Serper](/develop/plugins/reference/serper)                     | Google Search via Serper.dev — 9 operations (web, images, news, video, scholar, shopping, patents, maps, places) |
| [Semantic Scholar](/develop/plugins/reference/semantic-scholar) | Academic paper search and metadata (free, no key)                                                                |
| [World News](/develop/plugins/reference/worldnews)              | Top news by country and full-text news search                                                                    |
| [Weather](/develop/plugins/reference/weather)                   | Current conditions, forecasts, astronomy (WeatherAPI.com)                                                        |
| [Calendar](/develop/plugins/reference/calendar)                 | CalDAV read/write — iCloud, Fastmail, Nextcloud, Radicale, Baïkal                                                |
| [Email](/develop/plugins/reference/email)                       | SMTP send + IMAP read — 11 operations                                                                            |
| [MiniMax](/develop/plugins/reference/minimax)                   | MiniMax's image, speech, music, video capabilities                                                               |
| [Zernio](/develop/plugins/reference/zernio)                     | Social-media scheduling and publishing across 15+ networks                                                       |

For the architecture, manifest schema, and boot semantics that any plugin has to satisfy, see [Concepts → Plugin system](/reference/concepts/plugins-system). For operator install options (CLI vs. composer require vs. Web UI vs. `SPORA_PLUGINS_PATHS`), see the operator guide and the link to it from the [Plugins system page](/reference/concepts/plugins-system#installing-third-party-plugins).
