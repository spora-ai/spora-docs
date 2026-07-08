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
- **[Troubleshooting](/start/end-users/troubleshooting)** — common issues, what to do when an agent gets stuck, where to find logs

## What you can do in the admin UI

| Section         | What it does                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agents**      | Create and edit agent definitions. Each agent has a system prompt, an LLM config, a tool allowlist, and a recipe. Agents are the things the user chats with. |
| **Tools**       | Configure operator-level settings for each tool (API keys, hostnames, model names). Encrypted at rest.                                                       |
| **Plugins**     | Install / uninstall / update Composer-based plugins. Requires `SPORA_PLUGIN_INSTALL_ENABLED=true`.                                                           |
| **Recipes**     | Browse and edit YAML recipe definitions (system prompt + tool allowlist + LLM config).                                                                       |
| **LLM drivers** | Add / edit LLM configs. Supports Anthropic, OpenAI, custom OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, etc.).                                      |
| **Users**       | Admin-only: add or disable user accounts, reset passwords.                                                                                                   |
| **Settings**    | Site-wide config, mail transport, Mercure, plugin install flag.                                                                                              |

## What you can't do in the admin UI

Some things still require the CLI:

- **Database resets** — `php bin/spora db:reset --force` (irreversible; gated)
- **Worker daemon control** — `php bin/spora worker:run --daemon` (long-lived process)
- **Migrations** — `php bin/spora spora:install` (run automatically by the entrypoint, but you may want to trigger it manually)
- **Plugin install from a local path** — `php bin/spora plugin:install vendor/pkg --path=...` (the Web UI only supports Packagist installs)

For the full CLI reference, see [Operators → Operations](/start/operators/operations).

## What's next

- **[First conversation](/start/end-users/first-conversation)** — sign in and chat
- **[Managing agents](/start/end-users/managing-agents)** — create the agent that fits your use case
- **[Troubleshooting](/start/end-users/troubleshooting)** — what to do when things go wrong
