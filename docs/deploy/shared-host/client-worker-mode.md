---
title: Client-worker mode (zero-config shared host)
description: Browser-driven worker for shared-host operators — how the SharedWorker ticks tasks, lease semantics, and troubleshooting.
---

# Client-worker mode (zero-config shared host)

Client-worker mode is the **zero-config** deployment for Spora on cPanel, Plesk, or any other FTP-only shared host where you cannot run a long-lived PHP process. The browser drives the agent loop: a `SharedWorker` polls for the user's `QUEUED` tasks and calls `POST /api/v1/tasks/{id}/tick` for each one. The server stays stateless. No daemon, no cron, no supervisord.

For the full deployment-mode overview (server + Mercure, server + polling, client + polling), see [Deployment modes](/reference/concepts/deployment-modes). This page is the operator-facing guide for the client mode — what to expect, what to troubleshoot, and which manual tests prove it's working.

## What this is

The `spora-ai/spora-shared` package ships `worker_runtime_mode: client` as its `config.php` default. That single setting routes `/api/v1/tasks/{id}/tick` and `/api/v1/worker/housekeeping` to the active handlers, and instructs the server-side CLI commands (`worker:run`, `task:run`) to exit with an error pointing at this page if anyone tries to invoke them.

The flow, end to end:

1. The user clicks a chat. The server creates a `Task` with `status: QUEUED` and `user_id = currentUser` (the runner — see [Per-runner scoping](#per-runner-scoping)).
2. The user's browser `SharedWorker` polls `GET /api/v1/tasks?status=QUEUED&since=<lastSeenAt>` every 5 seconds.
3. For each match, the SharedWorker calls `POST /api/v1/tasks/{id}/tick`. The server's `TaskController::tick` claims the task under a per-user lease (`lease_owner='user:{id}'`, `lease_expires_at = now + Spora_TICK_LEASE_SECONDS`), publishes the `QUEUED → RUNNING` transition to Mercure (or skips it if Mercure is unconfigured), and runs `Orchestrator::tick()` inline.
4. The tick completes synchronously inside the HTTP request. The response is `{task: <fresh row>}`; the SharedWorker renders the new state.
5. Every 5 minutes, the same `SharedWorker` calls `POST /api/v1/worker/housekeeping` — it reaps orphaned tasks and synchronously dispatches any due scheduled runs (see [Scheduled runs](#scheduled-runs)).

If the browser tab closes mid-tick, the lease TTL on the row expires (default 600 s, extended on every step boundary) and the next housekeeping sweep flips the task to `FAILED` with `error_code: WORKER_DISCONNECTED`. Click **Retry** on the chat to start a fresh attempt.

## Browser support

The runtime prefers `SharedWorker` (one tick loop across every tab of the same origin), with a fallback to a dedicated `Worker` (one loop per tab) on older browsers:

| Browser             | `SharedWorker` | Fallback to `Worker` | Notes                                                                          |
| ------------------- | -------------- | -------------------- | ------------------------------------------------------------------------------ |
| Chrome 4+           | ✓              | —                    | —                                                                              |
| Firefox 29+         | ✓              | —                    | —                                                                              |
| Safari 16+          | ✓              | —                    | Safari 15.x does not implement `SharedWorker`.                                 |
| Safari 15.0 – 15.x  | —              | ✓                    | Dedicated `Worker` per tab — each tab drives its own tasks independently.      |
| iOS Safari 16+      | ✓              | —                    | Each PWA tab gets its own context; treat as dedicated `Worker`.                |
| iOS Safari 15       | —              | ✓                    | Same fallback as desktop Safari 15.                                            |
| Edge 79+ (Chromium) | ✓              | —                    | —                                                                              |
| Older browsers      | —              | —                    | UI shows **"Worker not supported"**. Scheduled runs and chat ticks do not run. |

When `SharedWorker` is unavailable, the runtime spins up a dedicated `Worker` per tab. The per-tab worker still ticks tasks correctly — `lockForUpdate` on the claim transaction is the tiebreaker — but two open tabs will both poll the queue and race for the same task (only one wins). This is rare in practice and acceptable for the "one browser, one tab" shared-host usage.

## Lease semantics

When a browser claims a task via `/tick`, the server writes:

```text
status: QUEUED → RUNNING
lease_owner: 'user:{id}'            # e.g. 'user:42'
lease_expires_at: now + Spora_TICK_LEASE_SECONDS  # default 600 s
```

The lease TTL is extended on every step boundary inside `Orchestrator::tick()` — after a tool batch write, after an LLM response, before a recursive tick. An in-flight tick never trips the reaper.

The reaper (`WorkerReaper::reapStaleTasks()`) flips `RUNNING` rows to `FAILED` when **all** of the following hold:

- `lease_expires_at IS NULL` **or** `lease_expires_at <= now()` (the lease expired)
- `updated_at <= now() - Spora_WORKER_STALE_MINUTES` (no progress for an hour, by default)
- `retry_of_task_id IS NULL` (not a retry — retries are left alone so the retry chain can do its work)

On reap, the task's `error_code` is `WORKER_DISCONNECTED` (new in this release) — distinct from the legacy `ORPHANED`, which kept its meaning of "server-side daemon died". The operator UI surfaces `WORKER_DISCONNECTED` as **"The browser driving this task disconnected. Click Retry to start a fresh attempt."**

The reaper is lease-aware: it reaps rows where `lease_owner` is anything (`user:42`, `server:housekeeping`, anything). The lease TTL + the stale-minutes grace period mean a row with `lease_owner='server:housekeeping'` and an active lease is never reaped, even if the housekeeping handler blocks longer than `SPORA_WORKER_STALE_MINUTES` for a long synchronous scheduled-run tick. The shared 30-second `worker_housekeeping_locks` lock prevents overlapping housekeeping calls (so two open browsers don't both dispatch the same schedule).

## Per-runner scoping

The `/tick` filter is:

```php
$task = Task::where('id', $taskId)->where('user_id', $userId)->first();
```

That `user_id` is the **runner** — the user who clicked the chat — not the principal / owner of the agent. Three implications:

1. **One worker per chat.** Even on a group-owned agent, only the clicker's browser drives the task. Group members see the chat and the Mercure-published state, but their browsers do not poll for the task. This is the structural guarantee that two browsers don't race to tick the same task.
2. **Ownership transfer = chat transfer.** A user who clicks **Transfer** on a chat they did not start still drives that chat from their browser, because the click sets `tasks.user_id = currentUser`. The previous runner's browser stops ticking it on the next polling cycle.
3. **Retry = self-driven.** Clicking **Retry** on a failed chat creates a new task with `user_id = currentUser`. The retry is then driven by the same browser.

## Per-principal scoping for schedules

Scheduled runs are not owned by a single user — they fire on a schedule regardless of who is online. The `/housekeeping` handler dispatches them with a **principal-scoped claim** so a group-owned agent's schedule fires regardless of which group member happens to be online:

```php
$visiblePrincipalIds = PrincipalResolver::visiblePrincipalIds($userId);
$entry = Capsule::table('scheduled_runs_next')
    ->join('scheduled_runs', 'scheduled_runs.id', '=', 'scheduled_runs_next.scheduled_run_id')
    ->join('agents', 'agents.id', '=', 'scheduled_runs.agent_id')
    ->where('scheduled_runs_next.status', 'PENDING')
    ->where('due_at', '<=', $now)
    ->whereIn('agents.principal_id', $visiblePrincipalIds)
    ->orderBy('due_at')
    ->lockForUpdate()
    ->first();
```

`visiblePrincipalIds` is the set of principals the calling user can act as — their own user-principal plus every group-principal where they're a member. So if User A is in Group G, User A's `/housekeeping` call can dispatch schedules for agents owned by A or by G.

Multiple group members race safely. The `lockForUpdate` + status flip is a DB-level CAS: only one of User A's, User B's, or User C's housekeeping calls wins a given scheduled-runs row in a given sweep. The others get a `null` claim and exit early.

The dispatched task has `tasks.user_id = $callerUserId` — the principal-scoped **dispatcher**, not the owner. If the synchronous tick fails partway, the task is reaped on the next housekeeping sweep, and only that dispatcher's browser would have driven a retry (the runner filter).

## Scheduled runs

Scheduled runs are **browser-driven** via `/housekeeping`. The trade-off is documented up front:

- **Dispatch** happens only while **any** browser is open and authenticated against the install. No browser, no dispatch. The schedule slips until the next sweep.
- **Completion** is **synchronous** inside `/housekeeping` — once dispatched, the task ticks to completion without needing the browser to stay open. The handler sets `lease_owner='server:housekeeping'`, extends the lease on every step boundary, and publishes the Mercure `RUNNING → COMPLETED` transition on the dispatcher's user-scoped topic so their UI updates.
- **Trade-off shift.** Compared to `SPORA_SYNC_MODE=true` (the old shared-host fallback that blocked the HTTP request), `/housekeeping` does not block the user's chat. Compared to a server-side daemon, `/housekeeping` does not dispatch unattended. Pick the right fit for the workload — see [Deployment modes → Decision matrix](/reference/concepts/deployment-modes#decision-matrix).

If you need **unattended scheduled runs** (nightly at 3 AM, with no humans online), keep server mode. The simplest path is to install `spora-ai/spora` (server-default) on a host where you can run the daemon.

## Orphan reaping

The reaper is shared between server-mode daemon (the legacy path) and the client-mode housekeeping handler. It is **lease-aware** across all lease owners (`user:N`, `server:housekeeping`) and **retry-chain-aware** (rows with `retry_of_task_id IS NOT NULL` are not reaped, so a retry that's stuck in a slow LLM provider is left alone). See [Lease semantics](#lease-semantics) for the full predicate.

The housekeeping handler uses a DB-backed shared lock (`worker_housekeeping_locks` table) with a 30-second no-op window. If User A's `/housekeeping` call is in flight, User B's `/housekeeping` call returns `204 No Content` immediately rather than contending.

## Operator setup

There is essentially nothing to configure — `spora-shared` ships `worker_runtime_mode: client` as the `config.php` default, so a fresh install is already in client mode. If you are migrating from `spora` (server-default) and want to flip, set in `.env`:

```text
SPORA_WORKER_RUNTIME_MODE=client
```

If you ever invoke `php bin/spora worker:run` on a client-mode install, the command exits with:

```text
Server-side worker disabled: Spora is running in client-worker mode.
Tasks are driven by your browser via POST /api/v1/tasks/{id}/tick.
See https://docs.spora-ai.com/deploy/shared-host/client-worker-mode
```

That is the canonical signal you have a server-mode CLI left over from an earlier install — remove it from any cron, supervisord, or systemd unit.

The `/api/v1/tasks/{id}/tick` and `/api/v1/worker/housekeeping` endpoints exist in server mode too but **404** (the inline 404 gate at the top of each controller — no behaviour change in server mode). This means the codebase can be flipped between modes without leaving dangling routes.

## Troubleshooting

### The UI indicator shows "Worker offline"

The SPA shows a small "Worker online" / "Worker offline" badge in the chat header. **Offline** means the `SharedWorker` (or fallback `Worker`) failed to start or crashed. Click the badge — the SPA tries to restart the worker. If it still fails, check the browser console for the underlying error (CSP policy blocking the `SharedWorker` constructor is the usual culprit on locked-down corporate browsers).

### Tasks sit `QUEUED` forever

Three things to check, in order:

1. **Is a browser tab open and authenticated against Spora?** The SharedWorker only ticks tasks for authenticated sessions. A closed tab = no ticks.
2. **Does the browser support `SharedWorker` or `Worker`?** See the [browser support](#browser-support) table. If the badge shows **"Worker not supported"**, that browser is too old — try Chrome, Firefox, Safari 16+, or Edge 79+.
3. **Is `tasks.user_id` correct?** Use phpMyAdmin or `php bin/spora` to confirm the task's `user_id` matches the authed user's id. If it doesn't (e.g. after a database restore from a different install), update the column directly — but this is rare.

### Scheduled runs don't fire

Scheduled runs are browser-driven. They fire only while **any** authenticated browser is open against the install. If you need unattended scheduled runs (e.g. nightly at 3 AM, no humans online), keep server mode — install `spora-ai/spora`, run `php bin/spora worker:run --daemon` under supervisord.

### A task shows `error_code: WORKER_DISCONNECTED`

The browser driving the task disconnected (closed tab, crash, network loss) before the tick finished. The reaper swept the row when the lease expired + `SPORA_WORKER_STALE_MINUTES` elapsed with no progress. The chat UI surfaces this as **"The browser driving this task disconnected. Click Retry to start a fresh attempt."** Clicking Retry creates a fresh task with `user_id = currentUser`; your browser will drive it on the next polling cycle.

### Token expiry / logout

When the auth token expires or the user logs out, the SharedWorker stops calling `/tick` and `/housekeeping`. Tasks for that user stay `QUEUED` until the user logs back in. If a different user on the same install is logged in on another tab, their SharedWorker drives **their** tasks — but not the logged-out user's tasks.

## Manual tests {#manual-tests}

These seven scenarios prove the runtime end-to-end. Run them in order — each one exercises a different layer of the lease + scoping model.

1. **Single-tab happy path** — open one tab, click into a chat, send a message. The chat should progress through `QUEUED → RUNNING → COMPLETED` without manual intervention. Verify `tasks.status` in phpMyAdmin.

2. **SharedWorker across tabs** — open two tabs of the same install, click into the same chat from tab 1, observe the chat updating in tab 2 via Mercure (or polling). Verify `tasks.lease_owner` stays `user:<your-id>` and only flips on tick boundaries.

3. **Dedicated Worker fallback** — disable `SharedWorker` in DevTools (e.g. set `chrome://flags/#shared-storage` off, or use Safari 15), refresh, confirm the worker badge says **"Worker online"** and a single chat still progresses. Open a second tab and confirm both tabs drive their own ticks independently.

4. **Multi-user-same-group** — create a group with three users, give the group a shared agent, have each user open a tab, click into a chat as User A, observe that User B and User C see the chat state via Mercure but their `tasks.user_id` filter does not match User A's task (`404` if you trace the `/tick` request from B's devtools).

5. **Scheduled run while a browser is open** — create a schedule on an agent the test user owns, set `due_at` to `now + 1 min`. Wait. The schedule should DISPATCH and COMPLETE inside `/housekeeping`. Confirm via phpMyAdmin that `tasks.lease_owner = 'server:housekeeping'` for the resulting task.

6. **Browser crash mid-tick** — start a long-running task (one that loops for several ticks), close the browser tab mid-tick. Wait `SPORA_TICK_LEASE_SECONDS + Spora_WORKER_STALE_MINUTES` (default 600 s + 60 min — shorter for tests via `Spora_WORKER_STALE_MINUTES=1`). Verify the row flips to `FAILED` with `error_code: WORKER_DISCONNECTED`.

7. **Logout / token expiry** — login, click into a chat, send a message. The chat goes `QUEUED → RUNNING` (browser-driven). Log out (clear session cookie or call `POST /api/v1/auth/logout`). The chat stays `QUEUED` after the lease expires + the reaper sweep. Re-login in a fresh tab; click **Retry**; verify the new task progresses.

## What's next

- [Deployment modes](/reference/concepts/deployment-modes) — the full three-configuration overview
- [Shared host overview](/deploy/shared-host) — the cPanel / FTP install walkthrough
- [Shared host limitations](/deploy/shared-host/limitations) — what doesn't work on shared hosts
- [Environment variables](/start/operators/env-vars#worker-runtime-mode) — `SPORA_WORKER_RUNTIME_MODE` / `SPORA_TICK_LEASE_SECONDS`
- [Upgrade to client-worker mode](/start/operators/upgrade-to-client-worker) — migrating from `SPORA_SYNC_MODE`
