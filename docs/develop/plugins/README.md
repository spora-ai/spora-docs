---
title: Plugins
description: Extending Spora with plugins — Composer packages that ship tools, skills, apps, and migrations.
---

# Plugins

A Spora plugin is a Composer package — installable via `composer require` and shipped to Packagist like any other PHP library — that contributes runtime capabilities to a Spora deployment:

- **Tools** callable by an agent (web search, image generation, calendar ops)
- **Skills** that ship on disk via `skillPaths()` or are generated at runtime via `skillProviders()`
- **Migrations** that create plugin-owned database tables
- **Admin UI** (optional) — a Vue IIFE bundle that the host SPA mounts as a plugin app

A plugin does **not** contribute LLM providers. There is no `drivers()` hook — LLM drivers are _configured_ per agent by the operator (config key, `base_url`, API key), not contributed by a plugin. See [Concepts → LLM drivers](/reference/concepts/drivers).

For the local-development workflow (Composer path repos, the 3-terminal HMR walkthrough for plugins with a Vue frontend), see **[Local plugin development](/develop/plugins/local-development)**.

## Authoring a plugin

If you want to write a plugin — either for your own Spora install or to publish on Packagist — start with the **[Plugin author guide](/develop/plugins/author-guide)**. It walks you through the manifest, the entry-point class, tools, skills, migrations, admin UI, local development, the `spora-plugin` keyword, the PSR-4 entry-point quirk, testing, and SemVer versioning.

> Plugins can also ship **Agent templates** — a `.json` / `.yaml` file that bundles a system prompt, tool activations, and auto-approve defaults into a one-click Agent. Declare them under `agent-templates/` and return the directory from `agentTemplatePaths()`; see [Agent templates](/develop/plugins/author-guide/agent-templates).

## Operator: install, update, uninstall

For the operator-facing HTTP API (`POST /api/v1/plugins`, `DELETE /api/v1/plugins/{package}`, `PATCH /api/v1/plugins/{package}`) — the Web UI uses these when the `SPORA_PLUGIN_INSTALL_ENABLED` feature flag is on — see the **[Install API](/develop/plugins/install-api)** page. The CLI equivalents (`bin/spora plugin:install|uninstall|update`) are always available, regardless of the flag.

## Reference: shipped plugins

The 19 plugins currently in the Spora org:

| Plugin                                                                  | What it adds                                                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Skeleton](/develop/plugins/reference/plugin-skeleton)                  | Minimal template — start here for new plugins                                                                         |
| [Tavily](/develop/plugins/reference/tavily)                             | AI-native web search (LLM-optimised answer + ranked sources)                                                          |
| [Serper](/develop/plugins/reference/serper)                             | Google Search via Serper.dev — 9 operations (web, images, news, video, scholar, shopping, patents, maps, places)      |
| [Staan](/develop/plugins/reference/staan)                               | EU-hosted web search — fast ranked results, or the same search with relevance-scored page excerpts                    |
| [Semantic Scholar](/develop/plugins/reference/semantic-scholar)         | Academic paper search and metadata (free, no key)                                                                     |
| [World News](/develop/plugins/reference/worldnews)                      | Top news by country and full-text news search                                                                         |
| [Weather](/develop/plugins/reference/weather)                           | Current conditions, forecasts, astronomy (WeatherAPI.com)                                                             |
| [Calendar](/develop/plugins/reference/calendar)                         | CalDAV read/write — iCloud, Fastmail, Nextcloud, Radicale, Baïkal                                                     |
| [Email](/develop/plugins/reference/email)                               | SMTP send + IMAP read — 11 operations                                                                                 |
| [MiniMax](/develop/plugins/reference/minimax)                           | MiniMax's image, speech, music, video capabilities                                                                    |
| [Muse](/develop/plugins/reference/muse)                                 | Meta Muse vendor home — image generation / editing + speech-to-text on a single Meta Model API key                    |
| [Zernio](/develop/plugins/reference/zernio)                             | Social-media scheduling and publishing across 15+ networks                                                            |
| [Custom skills](/develop/plugins/reference/custom-skills)               | Principal-scoped custom skills — author them by hand or ask the agent to, served through core's `skill` tool          |
| [Media archive](https://github.com/spora-ai/spora-plugin-media-archive) | Browse, filter, and download media generated by your agents — a filterable admin panel over `MediaArchiveService`     |
| [Memories](/develop/plugins/reference/memories)                         | Persistent memory storage for agents and users — the Memories admin panel plus `memory` / `global_memory` tools       |
| [OpenAI Image](/develop/plugins/reference/openai-image)                 | OpenAI-compatible image generation — configure the model, API URL, and key for OpenAI or any compatible provider      |
| [Team graph](https://github.com/spora-ai/spora-plugin-team-graph)       | A directed graph of the spawning relationships between this principal's agents, rendered via Mermaid in the admin SPA |
| [Typst](/develop/plugins/reference/typst)                               | Compile Typst source to PDF/PNG/SVG via ext-typst — Inter OFL fonts and a writable per-principal example store        |
| [Word](https://github.com/spora-ai/spora-plugin-word)                   | Convert Markdown to Word (.docx), and read .docx back as Markdown for the LLM                                         |

> **Note:** [`spora-plugin-mistral`](https://github.com/spora-ai/spora-plugin-mistral) also lives in the org but is **archived** — it is no longer maintained and is excluded from the count above.

For the architecture, manifest schema, and boot semantics that any plugin has to satisfy, see [Concepts → Plugin system](/reference/concepts/plugins-system).
