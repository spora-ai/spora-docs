---
title: Developers guide
description: Local dev environment for Spora — install, project structure, stack, adding a tool, CLI, testing, coding standards.
---

# Developers Guide

This track is for people setting up a local development environment for Spora or one of its plugins. It covers the daily workflow: install, dev server, tests, where things live in the codebase, and how to add a new tool.

## Project layout

| Repo                                                           | Role                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`spora-core`](https://github.com/spora-ai/spora-core)         | PHP framework — the codebase you'll work in most often. Composer package, not deployable on its own.        |
| [`spora`](https://github.com/spora-ai/spora)                   | Skeleton — what operators deploy. Pulls `spora-core` + the prebuilt `spora-frontend` admin SPA.             |
| [`spora-frontend`](https://github.com/spora-ai/spora-frontend) | Vue 3 + Vite + Tailwind admin SPA. Prebuilt; only modify if you're working on spora-frontend itself.        |
| [`spora-plugin-*`](https://github.com/spora-ai)                | Tool plugins (calendar, email, web search, etc.). See [Develop → Plugins](/develop/plugins/) for authoring. |

The "**project**" you're working on is typically `spora` (or `spora-local`, the private dev clone). `spora-core` is the framework inside it.

## Pages in this track

- **[Local setup](/start/developers/local-setup)** — install, dev server (`composer dev`), Pest + Vitest, database
- **[Project structure](/start/developers/project-structure)** — directory tree of `spora-core`, where things live
- **[Stack](/start/developers/stack)** — every Composer dependency and why it's there
- **[How to add a tool](/start/developers/how-to-add-a-tool)** — the canonical "Hello, Tool" walkthrough
- **[CLI & coding standards](/start/developers/cli-and-coding-standards)** — `bin/spora` commands, Pest + PHPStan, code comment policy, development rules

## Development rules (from spora-core/AGENTS.md)

These are the project's hard rules. Adopt them from day one.

- **`declare(strict_types=1);`** at the top of every PHP file.
- **`final`** on all classes unless inheritance is required.
- **No DB calls in constructors** — boot explicitly via `Database::bootDatabaseConnectionOnly()`.
- **No mocks for integration tests** that already boot the DB via `beforeEach`. Use a real in-memory SQLite.
- **Don't add error handling, fallbacks, or abstractions** beyond what the task requires.
- **Never commit or push directly to `main`.** Every change goes through a feature branch and a pull request. Branch naming: `<scope>/<phase-or-feature>` (e.g. `coverage/phase-1.4-orchestrator-and-controllers`, `feat/tool-authooring-dx`, `fix/logout`).
- Local `main` may be fast-forwarded via `git pull --ff-only` but never receives a direct push.

For the project-tree details, see [Project structure](/start/developers/project-structure). For the tooling that enforces some of these (Pest, PHPStan, PHP-CS-Fixer), see [CLI & coding standards](/start/developers/cli-and-coding-standards).
