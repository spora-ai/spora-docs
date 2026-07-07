---
title: Concepts
description: System architecture, schema, agent loop, drivers, error handling, plugin system, worker deployment, and contributor docs.
---

# Concepts

The deep-dive reference for Spora's internals. These pages were migrated from the numbered `spora-core/docs/0X_*.md` files, which have been retired in favour of this single audience-oriented site. For the procedural "how to install / configure / run" walkthrough, see [Start → Operators](/start/operators/).

## Core architecture

- **[Architecture](/concepts/architecture)** — config priority, orchestrator loop, worker modes, plugin system, database
- **[Database schema](/concepts/schema)** — tables, columns, version model, migration conventions
- **[PHP interfaces](/concepts/interfaces)** — `ToolInterface`, `OrchestratorInterface`, `LLMDriverConfigInterface`, `PluginInterface`

### Tools, drivers, plugins

- **[LLM drivers](/concepts/drivers)** — `LLMDriverConfigInterface`, `OpenAICompatibleDriver`, `AnthropicCompatibleDriver`, `DriverFactory`
- **[Tool system](/concepts/tools)** — `#[Tool]`, `#[ToolOperation]`, `#[ToolParameter]`, `#[ToolSetting]`, settings cascade
- **[Plugin system](/concepts/plugins-system)** — manifest, auto-discovery, `PluginLoader`, conflicts, security model
- **[App extensions](/concepts/app-extension)** — `app/App.php`, the `SporaExtensionInterface` hooks
- **[Media assets](/concepts/media-assets)** — `AssetStore`, `MediaEmbed`, binary tool outputs

### Operations

- **[Agent loop and async mode](/concepts/agent-loop-async)** — `tick()` phases, task lifecycle, Mercure SSE
- **[Worker deployment](/concepts/worker-deployment)** — cron and daemon modes, reaping, single-instance lock
- **[Logging](/concepts/logging)** — PSR-3, PII policy, what gets logged at which level
- **[Error handling](/concepts/error-handling)** — error envelope, code registry, toast mapping

### Frontend

- **[Frontend architecture](/concepts/frontend-architecture)** — Vue 3 + Vite + Tailwind + radix-vue, `apps/` module pattern

### Contributor standards

- **[Code documentation](/concepts/code-documentation)** — comment policy (delete / keep / add)
- **[Testing](/concepts/testing)** — Pest, Vitest, SonarQube coverage gate

## A note on WIP sections

The **plugin system** is currently a work-in-progress (see [Architecture](/concepts/architecture#plugin-system)). The hook methods are declared and surfaced by the manifest, but the explicit `PluginLoader → DI container` injection path is not yet fully wired up. Three open PRs are landing this; we keep the WIP callout visible on the page so readers know the limitations.
