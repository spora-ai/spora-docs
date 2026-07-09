---
title: Spora
description: Self-hosted AI agent orchestration. Zero-config. Anywhere.
---

<div style="text-align: center; padding: 4rem 0 3rem;">

## Spora

### Self-hosted AI agent orchestration. Zero-config. Anywhere.

PHP 8.4+ on a laptop, a shared host, or a Docker container.

[Get Started →](/start/) · [Concepts](/reference/concepts/) · [View on GitHub](https://github.com/spora-ai/spora)

</div>

---

## What is Spora?

Spora is a self-hosted AI agent orchestration platform. It runs anywhere PHP 8.4+ runs — a laptop, a shared cPanel/FTP host, a VPS, or a Docker container. Agents tick, call tools, and ask for human approval before touching the outside world. Plugins drop into a folder. Models are yours.

## Quick start

```bash
# Create a Spora project (skeleton)
composer create-project spora-ai/spora my-spora

# Install
cd my-spora && php bin/spora spora:install

# Run (dev server with hot reload)
composer dev            # → http://localhost:8080
# Or for a production-like server, see the [Deployment guide](/deploy/)
```

That is the whole bootstrap. SQLite by default; flip `SPORA_DB_*` in `.env` for MySQL.

## Pick your track

| If you…                                | Start here                               |
| -------------------------------------- | ---------------------------------------- |
| Are deploying Spora for yourself/team  | [Operators guide →](/start/operators/)   |
| Are setting up a local dev environment | [Developers guide →](/start/developers/) |
| Are using the admin UI to chat         | [End user guide →](/start/end-users/)    |

Looking for the architecture deep-dive? See [Concepts](/reference/concepts/).

## Project layout

| Repo                                                             | Role                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| [`spora-core`](https://github.com/spora-ai/spora-core)           | PHP framework, plugins, drivers _(recipes WIP)_      |
| [`spora`](https://github.com/spora-ai/spora)                     | Skeleton — what you deploy                           |
| [`spora-frontend`](https://github.com/spora-ai/spora-frontend)   | Vue 3 + Vite + Tailwind admin SPA                    |
| [`spora-plugin-*`](https://github.com/spora-ai)                  | Tool plugins (calendar, email, web search, etc.)     |
| [`spora-installer`](https://github.com/spora-ai/spora-installer) | Composer plugin that routes `spora-plugin` packages  |
| [`spora-maker`](https://github.com/spora-ai/spora-maker)         | Local scaffolder (Tools, Controllers, `app/App.php`) |

## Where to next?

- **New to Spora?** → [Getting Started → Operators](/start/operators/) or pick your track above.
- **Building a plugin?** → [Develop → Plugins](/develop/plugins/).
- **Running it in production?** → [Deploy](/deploy/).
- **Reading the source?** → [Concepts](/reference/concepts/).
