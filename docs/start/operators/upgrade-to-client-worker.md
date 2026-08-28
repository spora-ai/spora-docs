---
title: Upgrade to client-worker mode
description: Migration guide for operators on spora-core ≤ 0.18.x — replacing Spora_SYNC_MODE with the new WorkerRuntimeMode enum.
---

# Upgrade to client-worker mode

This page is for operators on **spora-core ≤ 0.18.x** who are upgrading to **0.19.0** or later. The legacy `SPORA_SYNC_MODE` env var is removed in 0.19.0; the new model has two runtime modes (`server`, `client`) plus a per-package default that picks the right one for your host.

## What changed

| Pre-0.19                                             | 0.19+                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `SPORA_SYNC_MODE=true` (HTTP request blocks)         | Removed. The HTTP endpoint always returns once the task is `QUEUED`.                                               |
| `SPORA_SYNC_MODE=false` + `php bin/spora worker:run` | `SPORA_WORKER_RUNTIME_MODE=server` + `php bin/spora worker:run --daemon`. Same daemon behaviour, no other changes. |
| Cron mode (`worker:run --once --include-queue`)      | Still supported in server mode.                                                                                    |
| (no equivalent)                                      | `SPORA_WORKER_RUNTIME_MODE=client` + browser `SharedWorker`. The new zero-config option for shared hosts.          |
| `WorkerMode::Sync` enum case                         | Removed. The enum is single-case (`WorkerMode::Worker`).                                                           |

The migration is **forward-only** — the `0070_add_lease_columns_to_tasks` migration that ships in 0.19.0 adds `lease_owner` (varchar 100) + `lease_expires_at` (datetime) to `tasks`. On MySQL/MariaDB it uses `ALGORITHM=INPLACE LOCK=NONE` for the index so writes are non-blocking. The migration is fully reversible via `down()`; see [Database schema](/reference/concepts/schema) for the migration conventions.

## Before you flip from `server` to `client`

If you have an existing install on `spora-ai/spora` (server-default) and want to migrate to `spora-ai/spora-shared` (client-default), the order matters:

1. **Finish or fail any `RUNNING` tasks.** The `WORKER_DISCONNECTED` reaper sweeps them 60 minutes after the lease expires; new tasks you create after the flip will be client-driven. Run `SELECT COUNT(*) FROM tasks WHERE status = 'RUNNING';` and either let them finish or set them to `FAILED` by hand.
2. **Open the UI once after the upgrade** so the reaper can sweep stale tasks. In server mode the daemon drives this every 5 minutes; client mode relies on the first `/housekeeping` call from any browser.
3. **Remove `bin/spora worker:run`** from supervisord / cron / systemd. The command now exits with a docs link in client mode — leaving it scheduled will produce a fresh exit log line every cron tick.
4. **If you have unattended scheduled runs (e.g. nightly at 3 AM, no humans online), do NOT flip.** Keep server mode. Client mode only dispatches schedules while a browser is open.

## Why two packages now

The two Composer packages target different host shapes:

| Package                       | Default `worker_runtime_mode` | Who it's for                                                    |
| ----------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `spora-ai/spora`              | `server`                      | Docker, VPS, dedicated server, classical server, local dev.     |
| `spora-ai/spora-shared` (NEW) | `client`                      | cPanel, FTP-only shared host, anywhere you cannot run a daemon. |

The packages share `spora-core` + `spora-frontend`. `spora-shared` simply omits `docker/`, `supervisord.conf`, and Mercure, and bakes `worker_runtime_mode: client` into its `config.php` default. A fresh install picks the package that matches the host — there's no need to flip the env var on a green-field deploy.

For existing installs, the simplest path is to **stay on the package you have** and toggle `SPORA_WORKER_RUNTIME_MODE` if needed. Don't switch packages mid-flight — the lockfiles, `.env.example` defaults, and `config.php` defaults differ.

## What changed for plugin authors

Nothing. The `tool.execute()` signature is unchanged across server and client modes. The runtime mode only affects who calls `tick()` (server daemon vs browser `SharedWorker`); the orchestrator, the lease, the approval flow, and the tool interface are identical. No code changes needed in any plugin.

## What changed for ops

Three new HTTP routes in `spora-core`, all gated on `WorkerRuntimeMode::Client` (inline 404 gate at the top of the controller, matching the `PluginsController::catalog` precedent):

| Verb   | Path                          | Purpose                                                               |
| ------ | ----------------------------- | --------------------------------------------------------------------- |
| `POST` | `/api/v1/tasks/{taskId}/tick` | Browser-driven claim + tick for a single task the caller ran.         |
| `POST` | `/api/v1/worker/housekeeping` | Browser-driven orphan reap + synchronous scheduled-run dispatch.      |
| `GET`  | `/api/v1/config`              | (existing public endpoint, extended) returns `client_worker.*` block. |

In `server` mode, these endpoints exist in the route table but **404**. No change in server-mode behaviour — server-mode operators running `php bin/spora worker:run --daemon` see no difference.

## Server-mode operators staying on `spora-ai/spora`

Nothing to do. The 0.19.0 upgrade is transparent: `SPORA_SYNC_MODE` is replaced by `SPORA_WORKER_RUNTIME_MODE=server` in `.env.example`, and the daemon picks up the new env var automatically. Existing supervisord / systemd / cron units continue to work — they call `php bin/spora worker:run --daemon` (or `--once`), the daemon polls the queue, scheduled runs dispatch, the reaper sweeps. The new `lease_owner` / `lease_expires_at` columns are populated by every tick path but are inert without a lease-aware reaper in the loop.

If you want the new reaper to be lease-aware (recommended), upgrade and let the daemon run its first sweep. Pre-0.19 orphans will be reaped under the new rules (lease TTL + `SPORA_WORKER_STALE_MINUTES` grace + retry-chain exclusion).

## Shared-host operators moving to `spora-ai/spora-shared`

The recommended migration path:

1. **Back up the database and `.env`** — `storage/database.sqlite` (or a `mysqldump` for MySQL/MariaDB), `storage/secret.key`, `.env`. See [Backups](/start/operators/backups).
2. **Switch to the `spora-shared` package** — `composer create-project spora-ai/spora-shared my-spora-shared` in a fresh directory, then point the document root at the new `public/`. Copy the SQLite file / migrate the MySQL DB into the new install.
3. **Set `SPORA_WORKER_RUNTIME_MODE=client`** in `.env` (the default for `spora-shared`, but explicit is safer during a migration).
4. **Open the UI, log in**, click into a chat. The browser's `SharedWorker` starts ticking.
5. **Remove any cron entries** invoking `worker:run` or `task:run` — they exit with a docs link now.

The data model is unchanged (`tasks`, `agents`, `principals`, etc. all migrate as-is). The new `lease_owner` / `lease_expires_at` columns on `tasks` are populated by the first `/tick` call.

## Verify the upgrade

After upgrading, before declaring done:

- Run `composer analyse` and `composer test:parallel` in `spora-local` / your dev clone. The CI suite must be green.
- Open the install in a browser and confirm the worker badge in the chat header shows **"Worker online"** (client mode) or that `php bin/spora worker:run --daemon` exits cleanly (server mode).
- Click into a chat and send a message. The task should progress `QUEUED → RUNNING → COMPLETED` within a few seconds.
- If you have schedules, force one to fire (`UPDATE scheduled_runs_next SET due_at = NOW() WHERE id = ?;`) and confirm `/housekeeping` dispatches + ticks it.

## What's next

- [Deployment modes](/reference/concepts/deployment-modes) — the canonical three-configuration overview
- [Client-worker mode](/deploy/shared-host/client-worker-mode) — the zero-config shared-host guide
- [Worker deployment](/reference/concepts/worker-deployment) — server-mode cron / supervisord / systemd patterns (unchanged)
- [Environment variables](/start/operators/env-vars#worker-runtime-mode) — full env-var reference
