---
title: Core contributors guide
description: Architecture, schema, agent loop, drivers, error handling — the deep-dive reference for spora-core contributors.
---

# Core contributors guide

This track is for people reading the source and contributing to [`spora-core`](https://github.com/spora-ai/spora-core). If you are deploying Spora, see the [Operators guide](/guide/operators/). If you are using the admin UI, see the [End user guide](/guide/end-users/).

## What you'll find here

The pages in this track are the deep-dive reference for Spora's internals. They were migrated from the numbered `spora-core/docs/0X_*.md` files, which have been retired in favour of this single audience-oriented site.

### Core architecture

- **[Architecture](/guide/core-contributors/architecture)** — config priority, orchestrator loop, worker modes, plugin system, database
- **[Database schema](/guide/core-contributors/schema)** — tables, columns, version model, migration conventions
- **[PHP interfaces](/guide/core-contributors/interfaces)** — `ToolInterface`, `OrchestratorInterface`, `LLMDriverConfigInterface`, `PluginInterface`

### Tools, drivers, plugins

- **[LLM drivers](/guide/core-contributors/drivers)** — `LLMDriverConfigInterface`, `OpenAICompatibleDriver`, `AnthropicCompatibleDriver`, `DriverFactory`
- **[Tool system](/guide/core-contributors/tools)** — `#[Tool]`, `#[ToolOperation]`, `#[ToolParameter]`, `#[ToolSetting]`, settings cascade
- **[Plugin system](/guide/core-contributors/plugins-system)** — manifest, auto-discovery, `PluginLoader`, conflicts, security model
- **[App extensions](/guide/core-contributors/app-extension)** — `app/App.php`, the `SporaExtensionInterface` hooks
- **[Media assets](/guide/core-contributors/media-assets)** — `AssetStore`, `MediaEmbed`, binary tool outputs

### Operations

- **[Agent loop and async mode](/guide/core-contributors/agent-loop-async)** — `tick()` phases, task lifecycle, Mercure SSE
- **[Worker deployment](/guide/core-contributors/worker-deployment)** — cron and daemon modes, reaping, single-instance lock
- **[Logging](/guide/core-contributors/logging)** — PSR-3, PII policy, what gets logged at which level
- **[Error handling](/guide/core-contributors/error-handling)** — error envelope, code registry, toast mapping

### Frontend

- **[Frontend architecture](/guide/core-contributors/frontend-architecture)** — Vue 3 + Vite + Tailwind + radix-vue, `apps/` module pattern

### Contributor standards

- **[Code documentation](/guide/core-contributors/code-documentation)** — comment policy (delete / keep / add)
- **[Testing](/guide/core-contributors/testing)** — Pest, Vitest, SonarQube coverage gate

## A note on WIP sections

The **plugin system** is currently a work-in-progress (see [Architecture](/guide/core-contributors/architecture#plugin-system)). The hook methods are declared and surfaced by the manifest, but the explicit `PluginLoader → DI container` injection path is not yet fully wired up. Several PRs are landing this; we keep the WIP callout visible on the page so readers know the limitations.
