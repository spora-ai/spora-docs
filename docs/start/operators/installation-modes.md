---
title: Installation modes
description: Pick the right Spora package and runtime mode for your host — a one-screen reference.
---

# Installation modes

A short reference table for picking a Composer package and runtime mode. For the full discussion (trade-offs, browser support, what you give up), see [Deployment modes](/reference/concepts/deployment-modes).

## Pick your package

| Situation                                                       | Recommended package           | Default mode       |
| --------------------------------------------------------------- | ----------------------------- | ------------------ |
| Docker / VPS / dedicated server / multi-user                    | `spora-ai/spora`              | `server` + Mercure |
| Classical LAMP / shared host with shell access / PHP-FPM + cron | `spora-ai/spora`              | `server` + polling |
| Local dev (PHP built-in server, Ollama / LM Studio)             | `spora-ai/spora`              | `server` + polling |
| cPanel / FTP-only shared host / no daemon / no root             | `spora-ai/spora-shared` (NEW) | `client` + polling |

The package's `config.php` ships the right default — you do not need to flip the env var on a fresh install. Existing installs stay on the package they have; toggle `SPORA_WORKER_RUNTIME_MODE` only if the default doesn't fit your host.

## Mode quick-reference

| Mode     | Who runs the worker                          | UI push            | Scheduled runs                                                    |
| -------- | -------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `server` | `bin/spora worker:run --daemon` (supervised) | Mercure or polling | Unattended. The daemon dispatches on the schedule.                |
| `client` | Browser `SharedWorker` (per tab)             | Polling            | Dispatch only while a browser is open; completion is synchronous. |

The full three-configuration matrix is in [Deployment modes](/reference/concepts/deployment-modes#overview-table). The env-var reference is in [Environment variables](/start/operators/env-vars#worker-runtime-mode).

## What's next

- [Deployment modes](/reference/concepts/deployment-modes) — full overview, trade-offs, decision matrix
- [Client-worker mode](/deploy/shared-host/client-worker-mode) — zero-config shared-host guide
- [Upgrade to client-worker mode](/start/operators/upgrade-to-client-worker) — migrating from `SPORA_SYNC_MODE`
- [Deployment](/deploy/) — host-side setup walkthroughs
