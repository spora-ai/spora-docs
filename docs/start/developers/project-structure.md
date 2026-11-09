---
title: Project structure
description: Directory tree of spora-core, where things live, and how the layers connect.
---

# Project structure

Spora follows a vanilla PHP MVC-style layout — no full-stack framework. The codebase ships inside the framework package (`spora-ai/spora-core`) and is consumed by the skeleton (`spora-ai/spora`).

The tree below tracks `spora-core/AGENTS.md` § "Project Structure". The framework's own `AGENTS.md` is stale on two rows: it still lists a `/Recipes` directory and a `/recipes` tree, and neither exists in the code any more — agent templates replaced them.

## Top-level tree

```text
/agent-templates   — Agent template definitions (JSON/YAML)
/app               — PHP application code (MVC-style)
  /AgentTemplates  — Agent template scanner, validator, importer, exporter
  /Agents          — Agent models and orchestration logic
  /Auth            — Authentication (AuthService, AuthController)
  /Build           — Build-time CLI commands (skips Kernel/DI boot; consumed by CI)
  /Console         — CLI commands (install, worker, etc.)
  /Core            — Kernel, Router, DI container, base classes
  /Drivers         — LLM driver implementations (OpenAI, Anthropic)
  /Http            — Controllers, middleware, request/response handling
  /Models          — Eloquent models
  /OpenApi         — OpenAPI generator (RouteSpecCollector, RouteToOpenApi)
  /Plugins         — Plugin loader and hooks
  /Services        — Business logic (ToolConfigService, NotificationService, etc.)
  /Tools           — Built-in tool implementations
/bin/spora         — Runtime CLI entry point
/bin/spora-build   — Build-time CLI entry point (companion to bin/spora)
/config.php        — Application configuration
/database          — Migrations and seeders
/plugins           — Installed plugins (auto-discovered)
/public            — Web root (PHP built-in server)
/storage           — Runtime files (SQLite DB, logs)
/tests             — Pest test suites
```

The admin SPA is **not** in this tree: it lives in the separate
[`spora-frontend`](https://github.com/spora-ai/spora-frontend) repository and
reaches a `spora-core` install as the `spora-ai/spora-frontend` Composer
package.

## What lives where

| Directory             | Purpose                                                                                                                | Common edits                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `agent-templates/`    | JSON/YAML agent template definitions — project-level overrides on top of the framework's bundled `core-assistant.json` | Operator-authored; scanned depth-0 by `AgentTemplateScanner`        |
| `app/AgentTemplates`  | Agent template scanning, validation, import, and export                                                                | `AgentTemplateScanner.php`, `AgentTemplateValidator.php`            |
| `app/Agents`          | The Orchestrator, agent models, tick state machine                                                                     | `Orchestrator.php`, `AgentStateResolver.php`, `TickPhaseRunner.php` |
| `app/Auth`            | Login, registration, session, password reset                                                                           | `AuthService.php`, `AuthController.php`                             |
| `app/Console`         | `bin/spora` commands — install, db:reset, plugin:_, worker:_, etc.                                                     | Adding a new command = new file here                                |
| `app/Build`           | `bin/spora-build` commands — build-time tools (no Kernel/DI/secret-key boot)                                           | Adding a new build command = new file here                          |
| `app/Core`            | The framework: kernel, router, DI container, base classes                                                              | `Kernel.php`, `Router.php`, `ContainerDefinitions.php`              |
| `app/Drivers`         | LLM driver implementations                                                                                             | `OpenAICompatibleDriver.php`, `AnthropicCompatibleDriver.php`       |
| `app/Http`            | HTTP controllers + middleware — the controllers sit directly in `app/Http/`, not in a `Controllers/` subdirectory      | `AgentController.php`, `TaskController.php`, `Middleware/`          |
| `app/Models`          | Eloquent models — User, Agent, Task, ToolCall, etc.                                                                    | Schema is auto-generated; don't edit manually                       |
| `app/OpenApi`         | OpenAPI 3.0 spec generator — `RouteSpecCollector`, `RouteToOpenApi`                                                    | Editing routes? The generator reads `RouteDefinitions` directly.    |
| `app/Plugins`         | `PluginLoader` — reads `plugins/*/plugin.json` at boot                                                                 | The framework's plugin machinery                                    |
| `app/Services`        | Business logic that isn't a controller or model                                                                        | `ToolConfigService.php`, `NotificationService.php`                  |
| `app/Tools`           | Built-in tool implementations (Calculator, ReadUrl, Sub-Agent, Schedule, Todo, etc.)                                   | Adding a new core tool = new file here                              |
| `app/Extensions`      | Base interfaces for App extensions and plugins                                                                         | `SporaExtensionInterface.php`, `AbstractExtension.php`              |
| `bin/spora`           | The runtime CLI entry point — Symfony Console application, boots Kernel/DI                                             | Add a new command → register in `bin/spora`                         |
| `bin/spora-build`     | The build-time CLI entry point — no Kernel/DI/secret-key boot                                                          | Add a new command → register in `bin/spora-build`                   |
| `config.php`          | App configuration (env-first, with `config.php` fallbacks)                                                             | `db_*`, `app_*`, `mercure_*` keys                                   |
| `database/migrations` | Laravel migrations (anonymous-class pattern)                                                                           | Add a new migration with the highest sequence number                |
| `plugins/`            | Composer-routed `spora-plugin` packages at runtime                                                                     | Operator-installed; rarely edited by hand                           |
| `public/`             | Web root — `public/index.php` is the entry point                                                                       | `index.php` is the only file you need                               |
| `storage/`            | Runtime state (SQLite DB, secret key, logs)                                                                            | Mount as a volume in Docker; back up to off-host storage            |
| `tests/`              | Pest tests — mirrors the `app/` structure                                                                              | `Unit/`, `Feature/`, `Fixtures/`, `Support/`                        |

## Conventions

- **MVC-style** — Controllers in `app/Http/Controllers`, models in `app/Models`, business logic in `app/Services`.
- **No framework lock-in** — Spora uses Symfony components, Laravel's Eloquent, and PHP-DI, but is not itself Laravel or Symfony. Don't add Laravel-specific patterns (e.g. facades, service providers) outside the explicit pattern documented in the plugin author guide.
- **No DB calls in constructors** — boot explicitly via `Database::bootDatabaseConnectionOnly()`. This is checked at code review time.
- **Strict types** — `declare(strict_types=1);` at the top of every PHP file. Enforced by PHPStan.
- **Final classes** — `final` on every class unless inheritance is required (e.g. base classes). Enforced by PHPStan.

## Plugin and skeleton overlay

When you run `composer create-project spora-ai/spora`, the skeleton's `app/` is _empty_ (or contains a stub `App.php`). The framework code lives in `vendor/spora-ai/spora-core/app/`. When developing:

- **To add to the framework** — clone `spora-core` separately, edit in there, and the skeleton's `path` Composer repository (set up in `spora-local`) picks up the changes immediately.
- **To add project-local code** — edit the skeleton's `app/` directly. Use the project scaffolder (`spora-ai/spora-maker`) for the boilerplate, see [Develop → Projects → Scaffolding](/develop/projects/scaffolding).
- **To add a plugin** — see [Develop → Plugins → Author guide](/develop/plugins/author-guide).

## Where the docs are

The concept documentation lives **in this site**, not in the framework
repository: `spora-core` once carried a `docs/` directory of Markdown
sources, and those documents were migrated here when this site was
built. There is no `spora-core/docs/` to point at any more.

| Doc site page                                                                | Lives at                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| [Concepts → Architecture](/reference/concepts/architecture)                  | `docs/reference/concepts/architecture.md`       |
| [Concepts → Agent loop and async mode](/reference/concepts/agent-loop-async) | `docs/reference/concepts/agent-loop-async.md`   |
| [Concepts → Plugin system](/reference/concepts/plugins-system)               | `docs/reference/concepts/plugins-system.md`     |
| [Concepts → Tool system](/reference/concepts/tools)                          | `docs/reference/concepts/tools.md`              |
| [Concepts → Database schema](/reference/concepts/schema)                     | `docs/reference/concepts/schema.md`             |
| [Concepts → Code documentation](/reference/concepts/code-documentation)      | `docs/reference/concepts/code-documentation.md` |
| [Concepts → Testing](/reference/concepts/testing)                            | `docs/reference/concepts/testing.md`            |

The framework repository keeps `AGENTS.md` and `CLAUDE.md` as its own
agent-facing notes; those are not the published documentation.

For the broader Stack table and "How to Add a Tool" walkthrough, see the [Stack](/start/developers/stack) and [How to add a tool](/start/developers/how-to-add-a-tool) pages in this track.
