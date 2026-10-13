---
title: End users guide
description: Use the Spora admin UI — chat with agents, manage tools, install plugins, troubleshoot.
---

# End users guide

This track is for people using the Spora admin UI as their daily tool. If you are a developer working on Spora itself, see the [Developers guide](/start/developers/). If you are deploying Spora for yourself or your team, see the [Operators guide](/start/operators/).

The admin UI is a single-page Vue 3 application. Once you log in, everything happens in the browser.

## Pages in this track

- **[First conversation](/start/end-users/first-conversation)** — sign in, send your first message, what the agent's reply tells you
- **[Managing agents](/start/end-users/managing-agents)** — create, edit, configure agents; the system prompt; tool allowlist
- **[Scheduling agents](/start/end-users/scheduling-agents)** — one-shot and recurring schedules, timezone selection, manual trigger, failure recovery
- **[Troubleshooting](/start/end-users/troubleshooting)** — common issues, what to do when an agent gets stuck, where to find logs

## What you can do in the admin UI

| Section         | What it does                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agents**      | Create and edit agent definitions. Each agent has a system prompt, an LLM config, and a tool allowlist. Agents are the things the user chats with. The **New agent** dialog also lets you start from an agent template — browse the bundled and plugin-supplied ones, or upload a template `.json` someone shared with you — and any agent can be exported back to a template. |
| **Tools**       | Configure operator-level settings for each tool (API keys, hostnames, model names). Encrypted at rest.                                                                                                                                                                                                                                                                         |
| **Plugins**     | Install / uninstall / update Composer-based plugins. Gated by **Allow plugin installation** under **General settings → Plugins** (was `SPORA_PLUGIN_INSTALL_ENABLED`; the database now wins over the env var).                                                                                                                                                                 |
| **LLM drivers** | Add / edit LLM configs. Supports Anthropic, OpenAI, custom OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, etc.).                                                                                                                                                                                                                                                        |
| **Users**       | Admin-only: add or disable user accounts, reset passwords.                                                                                                                                                                                                                                                                                                                     |
| **Settings**    | Site-wide config, mail transport, Mercure, plugin install flag.                                                                                                                                                                                                                                                                                                                |

## What you can't do in the admin UI

Some things still require the CLI:

- **Database resets** — `php bin/spora db:reset --force` (irreversible; gated)
- **Clearing unreadable stored settings** — `php bin/spora settings:reset` (a lost secret key leaves every stored credential undecryptable, and this is the only way out when the page that would explain it will not load)
- **Worker daemon control** — `php bin/spora worker:run --daemon` (long-lived process)
- **Migrations** — `php bin/spora spora:install` (run automatically by the entrypoint, but you may want to trigger it manually)
- **Plugin install from a local path** — `php bin/spora plugin:install vendor/pkg --path=...` (the Web UI only supports Packagist installs)

For the full CLI reference, see [Operators → Operations](/start/operators/operations).

## Settings → Admin → Global settings

Nine sections: General, Access, Timeouts, Worker, Plugins, Media, Mail, Database, Security. What
makes it worth using rather than editing `.env` is that every field names **where its current value
actually comes from** — the built-in default, your `.env`, your `config.php`, or the database — so
you can see what a save here would override. Once a value is stored, that line is replaced by a
**Reset to default** link, and the page re-reads after a reset rather than guessing.

**What you cannot change here.** Settings read before the database is open — the `SPORA_DB_*`
family, the secret-key path, the log path, the app URL and prefix — render disabled with the reason
spelled out. They are file-only, permanently.

**Settings that need a worker restart** save immediately and say so.

**Secrets** never show their value, not even to an admin. They render as a locked row with a
**Change** button; **Cancel** restores it untouched. Submitting an empty value is how you _clear_ a
credential.

**Validation** comes back with the server's own message rather than a generic failure.

## What's next

- **[First conversation](/start/end-users/first-conversation)** — sign in and chat
- **[Managing agents](/start/end-users/managing-agents)** — create the agent that fits your use case
- **[Scheduling agents](/start/end-users/scheduling-agents)** — fire an agent on a cron or at a specific moment
- **[Troubleshooting](/start/end-users/troubleshooting)** — what to do when things go wrong
