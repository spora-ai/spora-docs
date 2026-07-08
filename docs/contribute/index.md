---
title: Contribute
description: How to file issues, send pull requests, and run the Spora test suite.
---

# Contribute

Spora is open source under MIT. Contributions are welcome from anyone — the project lives in the [spora-ai](https://github.com/spora-ai) GitHub org, primarily in [spora-core](https://github.com/spora-ai/spora-core) (the framework) and [spora](https://github.com/spora-ai/spora) (the deployed skeleton).

## Ways to contribute

| Type                  | Where to go                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **File a bug**        | [GitHub Issue](https://github.com/spora-ai/spora-core/issues/new?labels=bug) with a clear reproduction.                             |
| **Request a feature** | [GitHub Discussion](https://github.com/spora-ai/spora-core/discussions/new?category=ideas) with the `enhancement` tag.              |
| **Ask a question**    | [GitHub Discussions](https://github.com/spora-ai/spora-core/discussions/new?category=q-a) — please don't open issues for questions. |
| **Send a PR**         | See [PR workflow](/contribute/pr-workflow) — branches, commits, reviews, merge.                                                     |
| **Improve the docs**  | This site lives at [spora-ai/spora-docs](https://github.com/spora-ai/spora-docs). Same PR workflow.                                 |
| **Author a plugin**   | See [Develop → Plugins → Author guide](/develop/plugins/author-guide).                                                              |

## Repositories

The Spora org is split across several repos. Most contributions land in one or two of them.

| Repo                                                           | What's in it                                                                                         | When to edit it                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [spora-core](https://github.com/spora-ai/spora-core)           | The PHP framework — Orchestrator, plugin loader, LLM drivers, tool system, database, CLI, scheduler. | Most contributions land here.                       |
| [spora](https://github.com/spora-ai/spora)                     | The deployed skeleton — what operators `composer create-project`.                                    | Skeleton-level changes, Docker setup, install docs. |
| [spora-frontend](https://github.com/spora-ai/spora-frontend)   | The prebuilt Vue 3 admin SPA.                                                                        | UI changes (operator or end-user facing).           |
| [spora-installer](https://github.com/spora-ai/spora-installer) | The Composer plugin that routes `spora-plugin` and `spora-frontend` packages.                        | Composer routing changes.                           |
| [spora-maker](https://github.com/spora-ai/spora-maker)         | The project scaffolder (`make:tool`, `make:controller`, `make:app`).                                 | New scaffold commands.                              |
| [spora-plugin-*](https://github.com/spora-ai)                  | The 9 production plugins (Tavily, Serper, etc.) and the skeleton.                                    | Plugin-specific features.                           |
| [spora-docs](https://github.com/spora-ai/spora-docs)           | This site (VuePress 2 + Plume theme).                                                                | Docs content, IA, design.                           |

## Before you start

- **Read the existing docs** — the [Operators guide](/start/operators/), [Concepts](/concepts/), and [Developers guide](/start/developers/) likely cover what you're trying to change
- **Check the issue tracker** — your bug may already be filed, your feature may already be discussed
- **Check the roadmap** — [Roadmap](/about/roadmap) shows what's already planned

## Development rules

From the project's hard rules (enforced at code review):

- **`declare(strict_types=1);`** at the top of every PHP file
- **`final`** on all classes unless inheritance is required
- **No DB calls in constructors** — boot explicitly via `Database::bootDatabaseConnectionOnly()`
- **No mocks for integration tests** that already boot the DB via `beforeEach`
- **Don't add error handling, fallbacks, or abstractions** beyond what the task requires

For the full set of conventions (testing, code comments, branch naming), see [Developers → CLI & coding standards](/start/developers/cli-and-coding-standards).

## CI and coverage

Every PR runs through the project's CI pipeline (Pest + Vitest + PHPStan + ESLint + build). Per-PR coverage is tracked via SonarQube. See [CI and coverage](/contribute/ci-and-coverage) for details.

## Security

For security issues, **don't open a public issue**. Email `mail@fabiangrassl.de` (PGP key on request). See [SECURITY.md](https://github.com/spora-ai/spora-core/blob/main/SECURITY.md) in the framework repo for the full disclosure policy.

## License

By submitting a pull request, you agree to license your contribution under the project's MIT license. See [License](/about/license).

## What's next

- [PR workflow](/contribute/pr-workflow) — branches, commits, reviews, merge
- [CI and coverage](/contribute/ci-and-coverage) — the pipeline
- [Author guide](/develop/plugins/author-guide) — for plugin contributions
