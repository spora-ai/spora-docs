---
title: Project structure
description: Directory tree of spora-core, where things live, and how the layers connect.
---

# Project structure

Spora follows a vanilla PHP MVC-style layout — no full-stack framework. The codebase ships inside the framework package (`spora-ai/spora-core`) and is consumed by the skeleton (`spora-ai/spora`).

The source of truth for the tree is `spora-core/AGENTS.md` § "Project Structure". Reproduced here for the docs site.

## Top-level tree

```text
/app               — PHP application code (MVC-style)
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
  /Recipes         — Recipe scanner
  /Services        — Business logic (ToolConfigService, NotificationService, etc.)
  /Tools           — Built-in tool implementations
/bin/spora         — Runtime CLI entry point
/bin/spora-build   — Build-time CLI entry point (companion to bin/spora)
/config.php        — Application configuration
/database          — Migrations and seeders
/frontend          — Vue 3 + Vite + Tailwind frontend
/plugins           — Installed plugins (auto-discovered)
/public            — Web root (PHP built-in server)
/recipes           — Recipe definitions (YAML)
/storage           — Runtime files (SQLite DB, logs)
/tests             — Pest test suites
```

## What lives where

| Directory             | Purpose                                                                               | Common edits                                                                    |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `app/Agents`          | The Orchestrator, agent models, tick state machine                                    | `Orchestrator.php`, `Agent.php`, `TaskStateMachine.php`                         |
| `app/Auth`            | Login, registration, session, password reset                                          | `AuthService.php`, `AuthController.php`                                         |
| `app/Console`         | `bin/spora` commands — install, db:reset, plugin:_, worker:_, etc.                    | Adding a new command = new file here                                            |
| `app/Build`           | `bin/spora-build` commands — build-time tools (no Kernel/DI/secret-key boot)          | Adding a new build command = new file here                                      |
| `app/Core`            | The framework: kernel, router, DI container, base classes                             | `Kernel.php`, `Router.php`, `ContainerDefinitions.php`, `AbstractExtension.php` |
| `app/Drivers`         | LLM driver implementations                                                            | `OpenAICompatibleDriver.php`, `AnthropicCompatibleDriver.php`                   |
| `app/Http`            | HTTP controllers + middleware                                                         | `Controllers/`, `Middleware/`                                                   |
| `app/Models`          | Eloquent models — User, Agent, Task, ToolCall, etc.                                   | Schema is auto-generated; don't edit manually                                   |
| `app/OpenApi`         | OpenAPI 3.0 spec generator — `RouteSpecCollector`, `RouteToOpenApi`                   | Editing routes? The generator reads `RouteDefinitions` directly.                |
| `app/Plugins`         | `PluginLoader` — reads `plugins/*/plugin.json` at boot                                | The framework's plugin machinery                                                |
| `app/Recipes`         | Recipe scanner — picks up YAML files from `recipes/` and plugins                      | `RecipeScanner.php`                                                             |
| `app/Services`        | Business logic that isn't a controller or model                                       | `ToolConfigService.php`, `NotificationService.php`                              |
| `app/Tools`           | Built-in tool implementations (Calculator, Memory, Handover, ReadUrl, UserInfo, etc.) | Adding a new core tool = new file here                                          |
| `app/Extensions`      | Base interfaces for App extensions and plugins                                        | `SporaExtensionInterface.php`, `AbstractExtension.php`                          |
| `bin/spora`           | The runtime CLI entry point — Symfony Console application, boots Kernel/DI            | Add a new command → register in `bin/spora`                                     |
| `bin/spora-build`     | The build-time CLI entry point — no Kernel/DI/secret-key boot                         | Add a new command → register in `bin/spora-build`                               |
| `config.php`          | App configuration (env-first, with `config.php` fallbacks)                            | `db_*`, `app_*`, `mercure_*` keys                                               |
| `database/migrations` | Laravel migrations (anonymous-class pattern)                                          | Add a new migration with the highest sequence number                            |
| `frontend/`           | Vue 3 + Vite + Tailwind admin SPA                                                     | Modifying the UI? This is where you work                                        |
| `plugins/`            | Composer-routed `spora-plugin` packages at runtime                                    | Operator-installed; rarely edited by hand                                       |
| `public/`             | Web root — `public/index.php` is the entry point                                      | `index.php` is the only file you need                                           |
| `recipes/`            | YAML recipe definitions — bundled with the operator install                           | Operator-authored; framework scans this on boot                                 |
| `storage/`            | Runtime state (SQLite DB, secret key, logs)                                           | Mount as a volume in Docker; back up to off-host storage                        |
| `tests/`              | Pest tests — mirrors the `app/` structure                                             | `Unit/`, `Feature/`, `Fixtures/`                                                |

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

The migrated documentation in this site maps to the framework structure as follows:

| Doc site page                                                                | Source file                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Concepts → Architecture](/reference/concepts/architecture)                  | `spora-core/AGENTS.md` + `spora-core/docs/01_architecture.md` |
| [Concepts → Agent loop and async mode](/reference/concepts/agent-loop-async) | `spora-core/docs/11_agent_loop_async.md`                      |
| [Concepts → Plugin system](/reference/concepts/plugins-system)               | `spora-core/docs/07_plugins.md`                               |
| [Concepts → Tool system](/reference/concepts/tools)                          | `spora-core/docs/06_tools.md`                                 |
| [Concepts → Database schema](/reference/concepts/schema)                     | `spora-core/docs/02_schema.md`                                |
| [Concepts → Code documentation](/reference/concepts/code-documentation)      | `spora-core/docs/14_code_documentation.md`                    |
| [Concepts → Testing](/reference/concepts/testing)                            | `spora-core/docs/16_testing.md`                               |

For the broader Stack table and "How to Add a Tool" walkthrough, see the [Stack](/start/developers/stack) and [How to add a tool](/start/developers/how-to-add-a-tool) pages in this track.
