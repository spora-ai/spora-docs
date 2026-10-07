---
title: Reference
description: Index of all canonical Spora reference material — env vars, config keys, CLI, API, schema, plugin schema.
---

# Spora — Reference Index

This page is the canonical TOC for the Spora reference material. The user-facing [Guide](/start/), [Develop](/develop/), and [Deploy](/deploy/) sections duplicate the relevant pieces in context; this index is the single source of truth for exact specifications.

> These pages are the authoritative source. `spora-core`'s own `docs/` directory holds only `04_api.md` and `14_speech.md`; every other topic was consolidated here, so the pages below are where to look and where to file a correction. Core's `AGENTS.md` points at `https://docs.spora-ai.com/…` for the same reason.

## Core internals

| Topic                                                                                   | Location                                                             |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Architecture (config priority, orchestrator, plugin system, agent templates, database)  | [/reference/concepts/architecture](/reference/concepts/architecture) |
| Database schema (tables, columns, migrations)                                           | [/reference/concepts/schema](/reference/concepts/schema)             |
| PHP interface contracts (ToolInterface, Orchestrator, LLMDriverConfig, PluginInterface) | [/reference/concepts/interfaces](/reference/concepts/interfaces)     |

## Extending Spora

| Topic                                                                                           | Location                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| LLM drivers (`LLMDriverConfigInterface`, `OpenAICompatibleDriver`, `AnthropicCompatibleDriver`) | [/reference/concepts/drivers](/reference/concepts/drivers)               |
| Tool system (`#[Tool]`, `#[ToolOperation]`, `#[ToolParameter]`, `#[ToolSetting]`)               | [/reference/concepts/tools](/reference/concepts/tools)                   |
| Plugin system (manifest, auto-discovery, conflicts)                                             | [/reference/concepts/plugins-system](/reference/concepts/plugins-system) |
| App extensions (`app/App.php`)                                                                  | [/reference/concepts/app-extension](/reference/concepts/app-extension)   |
| Media assets (binary outputs, `AssetStore`, `MediaEmbed`)                                       | [/reference/concepts/media-assets](/reference/concepts/media-assets)     |
| Plugin author guide (end-to-end)                                                                | [/develop/plugins/author-guide](/develop/plugins/author-guide)           |

## Operations

| Topic                                                   | Location                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Logging (PSR-3, PII policy, what gets logged)           | [/reference/concepts/logging](/reference/concepts/logging)                       |
| Error handling (envelope, codes, toast mapping)         | [/reference/concepts/error-handling](/reference/concepts/error-handling)         |
| Agent loop and async mode (tick structure, SSE)         | [/reference/concepts/agent-loop-async](/reference/concepts/agent-loop-async)     |
| Worker deployment (cron / daemon)                       | [/reference/concepts/worker-deployment](/reference/concepts/worker-deployment)   |
| Installation (5 routes)                                 | [/start/operators/install](/start/operators/install)                             |
| Environment variables (canonical `SPORA_*` reference)   | [/start/operators/env-vars](/start/operators/env-vars)                           |
| Security (encryption, auth, rate limiting, plugin risk) | [/start/operators/security](/start/operators/security)                           |
| REST API reference                                      | [/reference/api](/reference/api) — source of record: `spora-core/docs/04_api.md` |
| Plugin install API (`/api/v1/plugins/*`)                | [/develop/plugins/install-api](/develop/plugins/install-api)                     |

## Frontend

| Topic                                                       | Location                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Frontend architecture (Vue 3 + Vite + Tailwind + radix-vue) | [/reference/concepts/frontend-architecture](/reference/concepts/frontend-architecture) |

## Contributor docs

| Topic                                           | Location                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Code documentation (delete / keep / add)        | [/reference/concepts/code-documentation](/reference/concepts/code-documentation) |
| Testing (Pest, Vitest, SonarQube coverage gate) | [/reference/concepts/testing](/reference/concepts/testing)                       |
