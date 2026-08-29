---
title: Deployment modes
description: The three realistic Spora deployment configurations — server + Mercure, server + polling, client + polling — and how they differ.
---

# Deployment modes

Spora has two independent axes that pick out the three realistic deployment configurations:

1. **Who runs the worker** — a server-side daemon (`bin/spora worker:run`) or a browser `SharedWorker` driving the user's own tasks.
2. **How the UI gets real-time updates** — Mercure SSE (push from server) or HTTP polling (frontend polls `/api/v1/tasks/{id}`).

The three configurations cover distinct, disjoint points on those axes. There is no "mixed" mode in practice:

- If you can run Mercure, you have a server. Run the daemon. You don't need a browser to tick tasks.
- If you can run a server daemon, the browser shouldn't be ticking tasks. A daemon-driven worker is the right fit; falling back to browser ticks is an anti-pattern (browser must stay open, lease churn, no scheduled-run coverage).

## Overview table

| Configuration               | Worker               | UI push      | Package                                               | Best for                                                                                          |
| --------------------------- | -------------------- | ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Full Deployment**         | server daemon        | Mercure SSE  | `spora-ai/spora`                                      | Docker, VPS, dedicated server, multi-user scale. Typically without the UI Plugin install.         |
| **Classical Server**        | server daemon        | HTTP polling | `spora-ai/spora`                                      | Classical LAMP / shared host with shell access, local dev. With or without the UI Plugin install. |
| **Zero-Config Shared Host** | browser SharedWorker | HTTP polling | `spora-ai/spora` + `SPORA_WORKER_RUNTIME_MODE=client` | cPanel, FTP-only, no root, no daemon. Typically with the UI Plugin install.                       |

The choice of **configuration** matches the runtime mode via one line in `.env`. On a fresh install of `spora-ai/spora` the default is `worker_runtime_mode: server`; setting `SPORA_WORKER_RUNTIME_MODE=client` flips the install to browser-driven without changing packages. Existing installs stay on the package they have and toggle the env var to switch mode. A future curated `spora-ai/spora-shared` package (no Docker, no Mercure, client-default) is the same idea with the shared-host-specific scaffolding baked into the skeleton.

## Who does what in each configuration

### Full Deployment — `spora-ai/spora` + Mercure

Spora runs in a container or on a VPS. A single `frankenphp` process serves the SPA and the API; a second process (`php bin/spora worker:run --daemon`, supervised by supervisord / systemd / Docker restart) drains the `QUEUED` task queue. Mercure ships with FrankenPHP — the Caddyfile serves a Mercure hub at `/.well-known/mercure`, the publisher POSTs task state changes after every `tick()`, and the browser subscribes to `user/{userId}/tasks`. UI updates are sub-second; no polling happens.

This is the canonical "I have a real server" setup. Multi-user, multi-tenant, scheduled runs dispatching unattended at 3 AM — all of it just works.

### Classical Server — `spora-ai/spora` + polling

Same skeleton, same daemon, but **no Mercure**. Either the operator chose not to run a Mercure hub (a small VPS may not need one for a single user), or the host doesn't expose a long-lived SSE process. The frontend detects the missing `SPORA_MERCURE_URL` and falls back to polling `/api/v1/tasks/{id}` every ~5 seconds. Task state changes appear in the UI after that interval.

This is the right pick when you have a server but want to keep the deployment minimal — Apache + PHP-FPM + supervisord + a daemon. Many small VPS installs fall here. The polling fallback is invisible for a single user; for heavy concurrent use the Mercure path feels snappier.

### Zero-Config Shared Host — `spora-ai/spora` + `SPORA_WORKER_RUNTIME_MODE=client` + polling

There is **no server-side worker daemon**. Instead, every logged-in browser spins up a `SharedWorker` that drives its user's own tasks. The flow has two interlocking intervals:

- **SPA discovery poll (every 5 s):** `GET /api/v1/tasks?status=QUEUED&since=<lastSeenAt>` filtered to `tasks.user_id = currentUser`. The SPA forwards any new matches to the `SharedWorker` over its message channel via `consider-task` messages.
- **SharedWorker tick loop (every 2 s):** iterates the `drivenTasks` map and calls `POST /api/v1/tasks/{id}/tick` for each. With `singleStep: true` (the client-worker default), one tick = one LLM turn, so a multi-tool chat takes N ticks.

Housekeeping (orphan reaping + scheduled-run dispatch) is driven by `POST /api/v1/worker/housekeeping`, called by any authed browser every 5 minutes.

This is the right pick when the operator has nothing but FTP access to a PHP 8.4 host. No `nohup`, no systemd, no shell. Upload, point the document root at `public/`, open the URL.

## What you give up

| Configuration               | You lose                                                                                                                           | You gain                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Full Deployment**         | Nothing — this is the most capable configuration.                                                                                  | A bit more ops: Mercure + daemon supervision + TLS termination.                                                     |
| **Classical Server**        | Real-time UI updates. Polling adds up to ~5 s of latency on task state changes.                                                    | Simpler ops. One fewer process. No Mercure key management.                                                          |
| **Zero-Config Shared Host** | Scheduled runs only DISPATCH while a browser is open. No daemon means no unattended nightly jobs. UI updates lag ~5 s. No Mercure. | Zero config. Upload, point, log in. No root, no daemon, no supervisord, no cron. Works on the cheapest shared host. |

## Decision matrix

Match the user's situation to the right configuration:

| Your situation                                                             | Configuration                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Docker / VPS / dedicated server / "I want real-time UI" / multi-user scale | **Full Deployment** (`spora-ai/spora`, Mercure)                                                 |
| Classical LAMP / PHP-FPM / "no Mercure needed" / local dev                 | **Classical Server** (`spora-ai/spora`, polling)                                                |
| cPanel / FTP-only / "no daemon" / small operators / testing                | **Zero-Config Shared Host** (`spora-ai/spora` with `SPORA_WORKER_RUNTIME_MODE=client`, polling) |

If you have shell access, keep the daemon on (server mode). Even on a single-user VPS, having the daemon lets scheduled runs dispatch unattended. Client mode is the right fit only when you genuinely cannot run a long-lived PHP process — typically cPanel / FTP-only shared hosts where you upload files and point a document root.

## What about plugins?

The Spora Plugin install feature (`POST /api/v1/plugins`, gated by `SPORA_PLUGIN_INSTALL_ENABLED=true`) ships a Composer dependency into `plugins/<name>/`. It is **independent of the runtime mode**:

| Configuration               | Plugin install from the UI                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Full Deployment**         | Usually **off**. Operators on Docker/VPS typically pre-bake plugins into the image via a Composer path repo.                    |
| **Classical Server**        | Either path. Plugin install from the UI is fine when the host allows `proc_open`; otherwise use `php bin/spora plugin:install`. |
| **Zero-Config Shared Host** | Usually **on**. The UI install path is the canonical way for shared-host operators to add a plugin (no shell needed).           |

The runtime mode does **not** change which tools a plugin exposes — `tool.execute()`'s signature is unchanged across server and client modes. The runtime mode only changes who calls `tick()`.

## Reading order

For a deeper look at any of these configurations:

- **Server + daemon** (Full Deployment, Classical Server) — see [Worker deployment](/reference/concepts/worker-deployment) for cron / supervisord / systemd patterns and the stale-task reaper.
- **Client + SharedWorker** (Zero-Config Shared Host) — see [Client-worker mode](/deploy/shared-host/client-worker-mode) for browser support, lease semantics, per-runner scoping, and the manual test scenarios.
- **Env-var reference** — see [Environment variables](/start/operators/env-vars#worker-runtime-mode) for the `SPORA_WORKER_RUNTIME_MODE` / `SPORA_TICK_LEASE_SECONDS` rows.
- **Picking a package** — see [Installation modes](/start/operators/installation-modes) for the one-screen summary.
- **Upgrading from pre-v0.19** — see [Upgrade to client-worker mode](/start/operators/upgrade-to-client-worker) if you have an existing install on `SPORA_SYNC_MODE`.

## What's next

- [Installation modes](/start/operators/installation-modes) — package + mode one-screen picker
- [Client-worker mode](/deploy/shared-host/client-worker-mode) — shared-host operator's guide
- [Upgrade to client-worker mode](/start/operators/upgrade-to-client-worker) — `SPORA_SYNC_MODE` migration
- [Deployment](/deploy/) — host-side setup (Docker, classical server, shared host, local)
- [Environment variables](/start/operators/env-vars) — full `SPORA_*` reference
