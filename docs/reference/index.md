---
title: Reference
description: Index of all canonical Spora reference material — env vars, config keys, CLI, API, schema, plugin schema.
---

# Spora — Reference Index

This page is the canonical TOC for the Spora reference material. The user-facing [Guide](/guide/), [Develop](/develop/), and [Deploy](/deploy/) sections duplicate the relevant pieces in context; this index is the single source of truth for exact specifications.

## Core internals

| Topic                                                                                   | Location                                                                       | Source                               |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| Architecture (config priority, orchestrator, plugin system, recipes, database)          | [/guide/core-contributors/architecture](/guide/core-contributors/architecture) | `spora-core/docs/01_architecture.md` |
| Database schema (tables, columns, migrations)                                           | [/guide/core-contributors/schema](/guide/core-contributors/schema)             | `spora-core/docs/02_schema.md`       |
| PHP interface contracts (ToolInterface, Orchestrator, LLMDriverConfig, PluginInterface) | [/guide/core-contributors/interfaces](/guide/core-contributors/interfaces)     | `spora-core/docs/03_interfaces.md`   |

## Extending Spora

| Topic                                                                                           | Location                                                                           | Source                                      |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| LLM drivers (`LLMDriverConfigInterface`, `OpenAICompatibleDriver`, `AnthropicCompatibleDriver`) | [/guide/core-contributors/drivers](/guide/core-contributors/drivers)               | `spora-core/docs/05_drivers.md`             |
| Tool system (`#[Tool]`, `#[ToolOperation]`, `#[ToolParameter]`, `#[ToolSetting]`)               | [/guide/core-contributors/tools](/guide/core-contributors/tools)                   | `spora-core/docs/06_tools.md`               |
| Plugin system (manifest, auto-discovery, conflicts)                                             | [/guide/core-contributors/plugins-system](/guide/core-contributors/plugins-system) | `spora-core/docs/07_plugins.md`             |
| App extensions (`app/App.php`)                                                                  | [/guide/core-contributors/app-extension](/guide/core-contributors/app-extension)   | `spora-core/docs/08_app_extension.md`       |
| Media assets (binary outputs, `AssetStore`, `MediaEmbed`)                                       | [/guide/core-contributors/media-assets](/guide/core-contributors/media-assets)     | `spora-core/docs/19_media_assets.md`        |
| Plugin author guide (end-to-end)                                                                | [/develop/plugins/author-guide](/develop/plugins/author-guide)                     | `spora-core/docs/18_plugin_author_guide.md` |

## Operations

| Topic                                                   | Location                                                                                 | Source                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| Logging (PSR-3, PII policy, what gets logged)           | [/guide/core-contributors/logging](/guide/core-contributors/logging)                     | `spora-core/docs/08_logging.md`            |
| Error handling (envelope, codes, toast mapping)         | [/guide/core-contributors/error-handling](/guide/core-contributors/error-handling)       | `spora-core/docs/10_error_handling.md`     |
| Agent loop and async mode (tick structure, SSE)         | [/guide/core-contributors/agent-loop-async](/guide/core-contributors/agent-loop-async)   | `spora-core/docs/11_agent_loop_async.md`   |
| Worker deployment (cron / daemon)                       | [/guide/core-contributors/worker-deployment](/guide/core-contributors/worker-deployment) | `spora-core/docs/12_worker_deployment.md`  |
| Installation (5 routes)                                 | [/guide/operators/install](/guide/operators/install)                                     | `spora/docs/13_installation.md`            |
| Environment variables (canonical `SPORA_*` reference)   | [/guide/operators/env-vars](/guide/operators/env-vars)                                   | `spora-core/docs/17_env_vars.md`           |
| Security (encryption, auth, rate limiting, plugin risk) | [/guide/operators/security](/guide/operators/security)                                   | `spora-core/docs/15_security.md`           |
| REST API reference                                      | [/reference/api](/reference/api)                                                         | `spora-core/docs/04_api.md`                |
| Plugin install API (`/api/v1/plugins/*`)                | [/develop/plugins/install-api](/develop/plugins/install-api)                             | `spora-core/docs/20_plugin_install_api.md` |

## Frontend

| Topic                                                       | Location                                                                                         | Source                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- |
| Frontend architecture (Vue 3 + Vite + Tailwind + radix-vue) | [/guide/core-contributors/frontend-architecture](/guide/core-contributors/frontend-architecture) | `spora-core/docs/09_frontend.md` |

## Contributor docs

| Topic                                           | Location                                                                                   | Source                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Code documentation (delete / keep / add)        | [/guide/core-contributors/code-documentation](/guide/core-contributors/code-documentation) | `spora-core/docs/14_code_documentation.md` |
| Testing (Pest, Vitest, SonarQube coverage gate) | [/guide/core-contributors/testing](/guide/core-contributors/testing)                       | `spora-core/docs/16_testing.md`            |
