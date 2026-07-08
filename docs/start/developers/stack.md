---
title: Stack
description: Every Composer dependency in spora-core, with the role it plays and why it's there.
---

# Stack

Spora is **standalone PHP** — not Laravel, not Symfony, not a full-stack framework. It borrows components from the Laravel and Symfony ecosystems for portability and reliability, but the codebase itself does not depend on a framework runtime.

The table below is the source-of-truth dependency list (verified against `spora-core/composer.json` and `spora-core/AGENTS.md`).

## Runtime dependencies

| Package                                               | Role                     | Why                                                                            |
| ----------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `symfony/http-foundation`                             | Request/response objects | Cleaner API than raw PHP globals (`$request->query->get('x')` vs `$_GET['x']`) |
| `symfony/console`                                     | CLI framework            | Powers `bin/spora` commands; well-known Symfony UX                             |
| `symfony/http-client`                                 | HTTP client              | HTTP transport for LLM driver requests (Anthropic, OpenAI, custom)             |
| `symfony/mailer`                                      | Email sending            | `SendEmailTool` via Symfony Mailer (SMTP transport)                            |
| `symfony/yaml`                                        | YAML parsing             | Parsing recipe definition files (`recipes/*.yaml`)                             |
| `symfony/process`                                     | Process management       | Used by plugin install/uninstall (shell out to `composer`)                     |
| `nikic/fast-route`                                    | Routing                  | Fast, standalone router — no framework coupling                                |
| `php-di/php-di`                                       | Dependency injection     | Framework-agnostic DI container (annotation-based + XML)                       |
| `illuminate/database` (Eloquent)                      | Database ORM             | Zero-config ORM with first-class SQLite support                                |
| `illuminate/filesystem`                               | Filesystem               | Used by PluginLoader for manifest discovery                                    |
| `illuminate/pagination`                               | Pagination               | Used by admin UI for long lists                                                |
| `delight-im/auth`                                     | Authentication           | Lightweight, standalone session+password auth                                  |
| `monolog/monolog`                                     | Logging                  | PSR-3 logger with PII-safe argument policy                                     |
| `dragonmantank/cron-expression`                       | Cron parsing             | Parsing `cron_expression` for scheduled runs                                   |
| `vlucas/phpdotenv`                                    | Env loading              | Loading `.env` files on boot                                                   |
| `webklex/php-imap`                                    | Email reading            | IMAP access for `ReadEmailTool`                                                |
| `chriskonnertz/string-calc`                           | Math expressions         | Evaluating math strings in `CalculatorTool`                                    |
| `pestphp/pest`                                        | PHP testing              | Elegant testing framework (only in dev)                                        |
| Vue 3 + Vite + Tailwind + radix-vue + lucide-vue-next | Frontend                 | Modern JS stack (shared with Laravel Breeze/Fortify patterns)                  |

All Composer constraints are pinned to `^8.0` (Symfony 8), `^13.0` (Eloquent 13), `^9.0` (delight-im/auth 9), etc. — the project keeps up with the latest minor of each major.

## Dev dependencies

| Package                     | Role                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `friendsofphp/php-cs-fixer` | Code style enforcement (PHP-CS-Fixer, ^3.94)                       |
| `pestphp/pest`              | Test framework (^4.0) — also a runtime dep so test code can use it |
| `phpstan/phpstan`           | Static analysis (^2.1)                                             |
| `phpstan/phpstan-mockery`   | PHPStan extension for Mockery annotations                          |

## Runtime requirement

- **`php: ^8.4.1`** — the codebase uses `readonly` properties, enums, and the FrankenPHP-targeted FrankenPHP runtime. PHP 8.3 or earlier will not work.

## Why this stack

The project's [AGENTS.md](https://github.com/spora-ai/spora-core/blob/main/AGENTS.md) puts it well: "Spora is standalone PHP — NOT Laravel. It borrows components from the Laravel and Symfony ecosystems for portability and reliability, but runs no full stack framework."

The key constraints the stack solves:

1. **Portability** — every component must work on a shared cPanel/FTP host with PHP 8.4+ and no system dependencies. No Node, no Redis, no Varnish.
2. **Single binary deploy** — the entire framework (vendored) + the prebuilt admin SPA fits in a small Docker image. The skeleton pulls `spora-core` + `spora-frontend` + `installer` via Composer.
3. **Zero-config dev** — `composer create-project` + `composer install` + `php bin/spora spora:install` + `composer dev` is the entire bootstrap. SQLite by default; flip a single env var for MySQL.
4. **Plugin-friendly** — components must compose via PSR-4 autoloading (not Laravel's service-provider magic). PHP-DI for DI; nikic/fast-route for routing; Symfony Console for CLI.

## What this stack is NOT

- **Not a full-stack framework.** Spora doesn't have a request lifecycle dispatcher, a kernel, a templating engine, or service providers. It's a collection of standalone components wired together by `ContainerDefinitions.php` and `Router.php`.
- **Not Laravel.** Despite using `illuminate/database`, Spora doesn't have Eloquent models in the framework sense — it uses the query builder and ORM directly. Don't add Laravel patterns (facades, service providers, middleware groups) outside what's explicitly documented.
- **Not Symfony.** Despite using `symfony/http-foundation` and `symfony/console`, Spora doesn't have a HttpKernel, a DependencyInjection container in the Symfony sense, or a Symfony bundle system.

The next major dependency addition (if any) would be a PSR-15 HTTP server request handler — currently Spora uses the PHP built-in server (`php -S`) for dev and FrankenPHP for production. Neither is in this Composer list.

## For more detail

- [Project structure](/start/developers/project-structure) — where each piece of the stack lives in the codebase
- [CLI & coding standards](/start/developers/cli-and-coding-standards) — how the tooling enforces style and runs tests
- [How to add a tool](/start/developers/how-to-add-a-tool) — a worked example of using the framework
