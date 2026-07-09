---
title: Reference
description: Index of all canonical Spora reference material — env vars, config keys, CLI, API, schema, plugin schema.
---

# Spora — Reference Index

This page is the canonical TOC for the Spora reference material. The user-facing [Guide](/start/), [Develop](/develop/), and [Deploy](/deploy/) sections duplicate the relevant pieces in context; this index is the single source of truth for exact specifications.

## Core internals

| Topic                                                                                   | Location                                                             | Source                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| Architecture (config priority, orchestrator, plugin system, recipes, database)          | [/reference/concepts/architecture](/reference/concepts/architecture) | `spora-core/docs/01_architecture.md` |
| Database schema (tables, columns, migrations)                                           | [/reference/concepts/schema](/reference/concepts/schema)             | `spora-core/docs/02_schema.md`       |
| PHP interface contracts (ToolInterface, Orchestrator, LLMDriverConfig, PluginInterface) | [/reference/concepts/interfaces](/reference/concepts/interfaces)     | `spora-core/docs/03_interfaces.md`   |

## Extending Spora

| Topic                                                                                           | Location                                                                 | Source                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| LLM drivers (`LLMDriverConfigInterface`, `OpenAICompatibleDriver`, `AnthropicCompatibleDriver`) | [/reference/concepts/drivers](/reference/concepts/drivers)               | `spora-core/docs/05_drivers.md`             |
| Tool system (`#[Tool]`, `#[ToolOperation]`, `#[ToolParameter]`, `#[ToolSetting]`)               | [/reference/concepts/tools](/reference/concepts/tools)                   | `spora-core/docs/06_tools.md`               |
| Plugin system (manifest, auto-discovery, conflicts)                                             | [/reference/concepts/plugins-system](/reference/concepts/plugins-system) | `spora-core/docs/07_plugins.md`             |
| App extensions (`app/App.php`)                                                                  | [/reference/concepts/app-extension](/reference/concepts/app-extension)   | `spora-core/docs/08_app_extension.md`       |
| Media assets (binary outputs, `AssetStore`, `MediaEmbed`)                                       | [/reference/concepts/media-assets](/reference/concepts/media-assets)     | `spora-core/docs/19_media_assets.md`        |
| Plugin author guide (end-to-end)                                                                | [/develop/plugins/author-guide](/develop/plugins/author-guide)           | `spora-core/docs/18_plugin_author_guide.md` |

## Operations

| Topic                                                   | Location                                                                       | Source                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Logging (PSR-3, PII policy, what gets logged)           | [/reference/concepts/logging](/reference/concepts/logging)                     | `spora-core/docs/08_logging.md`            |
| Error handling (envelope, codes, toast mapping)         | [/reference/concepts/error-handling](/reference/concepts/error-handling)       | `spora-core/docs/10_error_handling.md`     |
| Agent loop and async mode (tick structure, SSE)         | [/reference/concepts/agent-loop-async](/reference/concepts/agent-loop-async)   | `spora-core/docs/11_agent_loop_async.md`   |
| Worker deployment (cron / daemon)                       | [/reference/concepts/worker-deployment](/reference/concepts/worker-deployment) | `spora-core/docs/12_worker_deployment.md`  |
| Installation (5 routes)                                 | [/start/operators/install](/start/operators/install)                           | `spora/docs/13_installation.md`            |
| Environment variables (canonical `SPORA_*` reference)   | [/start/operators/env-vars](/start/operators/env-vars)                         | `spora-core/docs/17_env_vars.md`           |
| Security (encryption, auth, rate limiting, plugin risk) | [/start/operators/security](/start/operators/security)                         | `spora-core/docs/15_security.md`           |
| REST API reference                                      | [/reference/api](/reference/api)                                               | `spora-core/docs/04_api.md`                |
| Plugin install API (`/api/v1/plugins/*`)                | [/develop/plugins/install-api](/develop/plugins/install-api)                   | `spora-core/docs/20_plugin_install_api.md` |

## Frontend

| Topic                                                       | Location                                                                               | Source                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| Frontend architecture (Vue 3 + Vite + Tailwind + radix-vue) | [/reference/concepts/frontend-architecture](/reference/concepts/frontend-architecture) | `spora-core/docs/09_frontend.md` |

## Contributor docs

| Topic                                           | Location                                                                         | Source                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| Code documentation (delete / keep / add)        | [/reference/concepts/code-documentation](/reference/concepts/code-documentation) | `spora-core/docs/14_code_documentation.md` |
| Testing (Pest, Vitest, SonarQube coverage gate) | [/reference/concepts/testing](/reference/concepts/testing)                       | `spora-core/docs/16_testing.md`            |
