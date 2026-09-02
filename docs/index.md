---
title: Spora
description: Spora transforms AI into assets. Independent, portable, ownable.
---

<div style="text-align: center; padding: 4rem 0 3rem;">

## Spora transforms AI into assets.

### Independent. Portable. Ownable.

Self-hosted infrastructure for the intelligence you build — agents, workflows and knowledge you can move, protect and pass on.

[Get Started →](/start/) · [Concepts](/reference/concepts/) · [View on GitHub](https://github.com/spora-ai/spora)

</div>

> **⚠️ Spora is under active development.**
>
> The project has not reached **1.0** yet. APIs, configuration keys, plugin manifests and database schemas are still evolving — **breaking changes can land between releases**, and upgrade paths for existing installations may require manual steps.
>
> Pin your dependencies to a known-good version, read the [release notes](https://github.com/spora-ai/spora/releases) before bumping, and follow the [Day-2 operations guide](/start/operators/operations) when upgrading an existing install.
>
> If you hit a migration wall, open an issue — the breaking change is intentional and we'd rather know about the friction.

---

## What is Spora?

Agents, workflows and knowledge are growing into productive assets — and capital needs ownership. **Spora** is the open-source infrastructure to make that intelligence **independent**, **portable** and **ownable**.

It runs anywhere PHP 8.4+ runs — a laptop, a shared cPanel/FTP host, a VPS, or a Docker container. Agents tick, call tools, and ask for human approval before touching the outside world. Plugins drop into a folder. Models are yours.

### Why ownership

For centuries, value was built through things we could own: land, machines, companies, patents and intellectual property. AI is creating a new kind of productive asset — and capital needs ownership.

Spora is the open infrastructure for **creating**, **operating**, **protecting** and **owning** AI assets — designed around sovereignty, portability and control. Move it. Protect it. License it. Sell it. Pass it on.

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

Starts PHP on `:8080`. (Docker multi-container uses `:8081`.)

## Pick your track

| If you…                                                                           | Start here                               |
| --------------------------------------------------------------------------------- | ---------------------------------------- |
| Are setting up a host environment (Docker, Apache, shared host)                   | [Deploy](/deploy/)                       |
| Are operating an already-installed Spora (env-vars, security, day-2 ops, backups) | [Operators guide →](/start/operators/)   |
| Are developing Spora plugins or projects                                          | [Develop → Projects](/develop/projects/) |
| Are using the admin UI to chat                                                    | [End user guide →](/start/end-users/)    |

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
- **Building on top of Spora?** → [Develop → Projects](/develop/projects/) — Spora grows with you.
- **Authoring a tool plugin?** → [Develop → Plugins](/develop/plugins/).
- **Running it in production?** → [Deploy](/deploy/).
- **Reading the source?** → [Reference → Architecture & concepts](/reference/concepts/).
