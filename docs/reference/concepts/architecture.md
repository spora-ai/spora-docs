---
title: Architecture
description: System overview — config priority, orchestrator loop, worker modes, plugin system, agent templates, database.
---

# Spora: Architecture

## Configuration

Priority: `OS env` → `.env` → `config.php` → built-in defaults.

- **Shared hosting:** `config.php` (gitignored, like `wp-config.php`) — editable over FTP.
- **Docker/VPS/CI:** `SPORA_*` env vars, skip `config.php` entirely.

**Encryption key separation:** The DB stores encrypted tool credentials; the key must never be in the same backup. The path is recorded in `config.php` as `key_path` (default install writes `storage/secret.key`). `SPORA_SECRET_KEY` (base64 env var) bypasses the file entirely for containers; `SPORA_KEY_PATH` overrides the file path instead.

## Tool Taxonomy

**ToolInterface** — every tool implements `Spora\Tools\ToolInterface`. Input vs. output is a per-operation flag, not a class distinction. Read-only / generative operations (`requiresApprovalByDefault: false`) execute without approval; operations marked `requiresApprovalByDefault: true` are intercepted by the Orchestrator for human approval.

Approval resolution for an operation:

1. `agent_tool_operation_overrides.default_requires_approval` per-agent, per-operation override (0/1/null)
2. Fall back to the operation's `#[ToolOperation(requiresApprovalByDefault:)]` class default

If approval required → serialize `AgentState` to DB as `PENDING_APPROVAL`, PHP process exits. The operator submits per-call decisions in a single batch via `POST /tasks/{id}/approve`: `{decisions: [{provider_call_id, decision: 'approve'|'reject', arguments?, reason?}]}`. `Orchestrator::resume()` (via `AgentDecisionProcessor`) splits the batch:

- **All approved, no leftovers** → `ApprovedBatchExecutor` runs the tools, status → `RUNNING` (Sync) / `QUEUED` (Worker).
- **All rejected, no leftovers** → status → `QUEUED`; the next worker pickup (server daemon or browser `/tick`) drives the next `tick()` so the LLM round-trip doesn't hold the lock.
- **Mixed (some approved + some rejected + leftovers)** → `ApprovedBatchExecutor` runs the approved calls; rejected rows are stamped `REJECTED` with `rejected_at` / `rejected_by` / `reject_reason`; the task stays `PENDING_APPROVAL` until the remaining undecided calls are also decided.

In server mode, `ApprovedBatchExecutor` records approvals with `executed_at IS NULL` as the "approved, awaiting execution" sentinel; the daemon's next `task:run` drain picks them up (see `Orchestrator::resume()` at `app/Agents/Orchestrator.php:479`). In client mode the browser's next `/tick` picks them up via the same sentinel.

On **partial** approval — the operator approves some but not all of the parallel tool calls — `resume()` keeps the task in `PENDING_APPROVAL`, rewrites `pending_state` with only the un-approved calls, and returns. The un-approved `tool_calls` rows stay `status='PENDING_APPROVAL'`. The operator can keep deciding on later rounds until the batch is empty.

On full approval, `resume()` returns immediately: each approved tool row is persisted as `status='APPROVED'` + `executed_at=NULL` (the worker-pickup sentinel), the task moves to `QUEUED`, and the appropriate worker picks it up — the daemon's `task:run` drain in server mode, or the browser's `/tick` in client mode. `TickPhaseRunner::executeApprovedPendingToolsForTask()` consumes those sentinel rows at the top of `runTick()` — before the LLM round-trip — so the next assistant message sees the tool results on the same round-trip. The HTTP approval endpoint therefore returns within ~100 ms regardless of how long the approved tool takes.

### Tool ownership is principal-scoped

Migration 0067 (spora-core PR #209) re-keyed ownership from `agents.user_id` to `agents.principal_id`, and introduced the `PrincipalContext` value object that tools now see alongside — not instead of — a raw `int $userId`. `Orchestrator::safeExecute()` resolves the context once per tick via `PrincipalResolver::resolveForToolExecute($agentId)` and then calls every tool with the full five-argument signature, positionally (`app/Agents/Orchestrator.php:563`):

- `execute(array $arguments, int $agentId, ?int $userId = null, ?int $taskId = null, ?PrincipalContext $context = null): ToolResult` — the canonical post-PR #209 form. `PrincipalContext` is the **fifth** parameter; the four before it are unchanged. A tool written against the pre-#209 signature keeps compiling against the current interface as long as it keeps all four of its parameters and appends `$context` as an optional fifth.
- `$userId` is the legacy form's ownership signal. `safeExecute()` sources it from the calling agent's row, where `Agent::user_id` is a read-only legacy accessor that delegates to `PrincipalResolver::ownerUserId($agent->principal_id)` — the principal's `user_id` for a user-principal, the group's first `owner`-role member for a group-principal.

`PrincipalContext` carries `{principalId, type ('user'|'group'), ownerUserId, runnerUserId}` — a **four**-field value object, with no `visiblePrincipalIds`. The two user ids are deliberately separate: `ownerUserId` is who pays (credential encryption, settings scope, audit attribution) and `runnerUserId` is who clicked (memory write attribution, Mercure publish targets). To authorise a `principal_id` request against a caller's scope, call `PrincipalResolver::visiblePrincipalIds($userId)` — it is a resolver method, not a field, because answering it costs a query. Gate tenant-scoped code on `PrincipalContext::isResolvable()` rather than comparing `principalId` to `0`: `resolveForToolExecute()` has two unresolvable sentinels — `0` for a missing agent row, and the agent's own dangling `principal_id` for a missing principal row — and an id check alone only catches the first.

The structural guarantee holds unchanged: tools see the owner of the agent that issued the call, never "whoever is signed in". Async contexts (server-mode daemon, browser-driven `SharedWorker`, scheduled tasks, sub-agent hops) inherit the same invariant because the lookup walks the agent row, not a session.

### Principal ownership model

Every ownership column (`agents.principal_id`, `tool_user_settings.principal_id`, `principal_preferences.preferred_llm_config_id`'s enclosing principal, `llm_driver_configurations.principal_id`) points at one row of the `principals` table. The `principals` table has two flavours of rows:

- **User principal** — one row per `users.id`, materialised on demand by `PrincipalService::ensureUserPrincipal($userId)`. Auto-created the first time the user creates an agent, transfers an agent, or hits `GET /api/v1/principals/me`. `type='user'`, `user_id=…`, `group_id=NULL`.
- **Group principal** — one row per `groups.id`, materialised at group creation time by `PrincipalService::materialiseGroupPrincipal($groupId)`. `type='group'`, `user_id=NULL`, `group_id=…`.

Both `agents.principal_id` and `tool_user_settings.principal_id` FK into `principals.id` with `ON DELETE RESTRICT` — deleting a principal surfaces a structured 409 (`PrincipalHasDependentsException`) listing the orphan agent ids. The 409 response includes `reassign_endpoint: /api/v1/agents/{id}/transfer` so the operator UI can drive the remediation.

## Orchestrator Loop

Stateless and short-lived. Each `tick()` is one full LLM turn (Think → Act). Structured in three phases to avoid holding a DB connection during network I/O:

1. **Claim** — short `lockForUpdate()` transaction: validate status. Lock released before any network call.
2. **LLM call** — blocking HTTP call outside any transaction. `step_count` is incremented after the lock is released.
3. **Write** — append history rows, update task status.

```mermaid
flowchart LR
    start(["start()"])
    tick["tick()"]
    claim["claim<br/>(lockForUpdate)"]
    llm["LLM call<br/>(outside transaction)"]
    text["text response"]
    input["InputTool call"]
    output["OutputTool call"]
    approved["auto-approved"]
    grant["approval granted"]
    required{"requires approval?"}
    history1["append history"]
    history2["append history"]
    completed(["COMPLETED"])
    failed(["FAILED"])
    aborted(["ABORTED"])
    pending(["PENDING_APPROVAL"])
    cancel(["CANCELLED"])
    resume(["resume()"])
    reject(["reject()"])
    max{{"step_count >= max_steps?"}}

    start --> tick
    tick --> claim --> llm
    llm -->|text| text --> completed
    llm -->|InputTool| input --> history1 --> tick
    llm -->|OutputTool| output --> required
    required -->|no| approved --> history1
    required -->|yes| grant --> history2 --> tick
    required -->|yes| pending
    pending -->|resume| resume --> tick
    pending -->|reject| reject --> tick
    tick --> max
    max -->|yes| aborted
    max -.->|no| claim

    classDef entry fill:var(--spora-paper),stroke:var(--spora-warm),color:var(--spora-ink)
    classDef action fill:var(--spora-paper-deep),stroke:var(--spora-warm-deep),color:var(--spora-ink)
    classDef terminal fill:var(--spora-cream),stroke:var(--spora-warm-deep),color:var(--spora-ink),font-weight:bold
    class start,tick,claim,llm,text,input,output,required,approved,grant,history1,history2,max action
    class completed,failed,aborted,pending,cancel,resume,reject terminal
```

Status transitions: `QUEUED → RUNNING → COMPLETED | FAILED | PENDING_APPROVAL ⇄ RUNNING → CANCELLED` and `RUNNING → AWAITING_SUB_AGENTS → RUNNING (sync) | QUEUED (worker)` (added in spora-core PR #196 — `AWAITING_SUB_AGENTS` is set by the `SubAgentTool` `sub_agent` op while the parent task waits for every spawned child to reach a terminal state) plus `RUNNING → ABORTED` and `AWAITING_SUB_AGENTS → ABORTED` (quiescent, added in spora-core PR #207 via `POST /api/v1/tasks/{id}/abort`) and `RUNNING → ABORTED` from the step cap (system-initiated, added in spora-core PR #266 via `TaskStatusWriter::autoAbortTransition` — the row carries `data.max_steps_reached: true` to distinguish it from operator aborts; the existing follow-up flow covers continuation). `ABORTED` is resumable via `POST /api/v1/tasks/{id}/continue` and `data.aborted_at` (and `data.max_steps_reached`, where present) is wiped on resume. PENDING is the initial value written by the migration; in practice the worker transitions QUEUED→RUNNING before the first tick. The `CANCELLED` terminal status is set by `TaskService::cancelRetryChain`; the `ABORTED` quiescent status is set by `Orchestrator::abort` or by `TaskStatusWriter::autoAbortTransition` (the step-cap path) — `REJECTED` is the analogous status for `tool_calls` rows, not `tasks`.

### Worker runtime modes (`SPORA_WORKER_RUNTIME_MODE`)

Spora has two runtime modes — `server` (a supervised daemon drains the queue) and `client` (the browser's `SharedWorker` drives tasks for the user who ran them). The active mode is set via `SPORA_WORKER_RUNTIME_MODE` (env) or `worker_runtime_mode` (config key); `spora-ai/spora` defaults to `server`, and flipping the env var to `client` lands in the same place without changing packages. The HTTP request always returns once the task is `QUEUED`; the worker (daemon or browser) drives the result.

In both modes, multi-step tasks (multiple LLM turns before reaching a terminal state) run synchronously within a single `tick()` chain — the loop calls itself recursively until `COMPLETED`, `FAILED`, or `PENDING_APPROVAL`. The legacy `SPORA_SYNC_MODE` boolean and the `WorkerMode::Sync` enum case were removed in spora-core 0.19.0.

For the full three-configuration overview (server + Mercure, server + polling, client + polling), see [Deployment modes](/reference/concepts/deployment-modes). For tick phases, task lifecycle, and Mercure publishing, see [Agent loop and async mode](/reference/concepts/agent-loop-async). For the shared-host browser-driven path, see [Client-worker mode](/deploy/shared-host/client-worker-mode).

## Plugin System

Drop a folder into `plugins/` with a `plugin.json` manifest whose `class` field names the entry point (by convention the folder ships a `Plugin.php`, but the manifest is what the loader reads). Auto-discovered at boot — no manual registration.

Boot sequence (`app/Plugins/PluginLoader.php`):

1. Glob `plugins/*/plugin.json` and read each manifest
2. Register PSR-4 mappings from `autoload.psr-4` with the Composer classloader
3. `require_once` bootstrap files from `autoload.files` (e.g. the plugin's own `vendor/autoload.php`)
4. Validate the manifest's `class` resolves and implements `Spora\Plugins\PluginInterface`, then `new` it — the `class` name is the only entry-point locator, so a plugin that cannot be autoloaded fails the boot
5. Read the ten contribution hooks off the instantiated plugin: `getName()`, `tools()`, `agentTemplatePaths()`, `skillPaths()`, `schemaVersion()`, `migrationsPath()`, `apps()`, `speechToTextProviders()`, `skillProviders()`, `searchProviders()`. Each is read lazily by the matching `PluginLoader` accessor, not stored at boot.
6. Behaviour hooks are **not** in that list. `register()`, `routes()`, and `boot()` were removed from the interface in 1.0; DI bindings, route registration, and post-build init are PSR-14 events instead. `PluginLoader` dispatches `ContainerBuildingEvent` from `registerPlugins(ContainerBuilder)`, `RoutesRegisteringEvent` from `registerRoutes(MiddlewareRouteCollector)`, and `BootingEvent` from `bootExtensions(ContainerInterface)`, after wiring every `EventSubscriberInterface` plugin. The three data hooks `autoload()`, `drivers()`, and `recipePaths()` were also removed — PSR-4 data lives in `autoload.psr-4` in the manifest, and there is no LLM-driver contribution hook at all (LLM drivers are _configured_, not contributed). See [Lifecycle Events](/reference/concepts/plugins-system#lifecycle-events).

Plugins can contribute: tools, agent templates, skill directories and skill providers, search providers, admin-UI apps, speech-to-text providers, and database migrations — plus DI bindings, REST routes, and post-build init via the three lifecycle events. The data hooks live on the shared `Spora\Extensions\SporaExtensionInterface`; `Spora\Plugins\PluginInterface` is a pure marker that extends it, which is why an app and a plugin are interchangeable from the loader's perspective. See `app/Extensions/SporaExtensionInterface.php` and the [Plugin system](/reference/concepts/plugins-system) page.

> **Status:** wired. `PluginLoader` reads every contribution surface from a plugin's manifest entry point, and each one is consumed by a real accessor: agent templates (`agentTemplatePaths()`), skills on disk (`skillPaths()`), skills off disk (`skillProviders()`), palette search (`searchProviders()`), speech-to-text (`speechToTextProviders()`), tools (`tools()`), admin apps (`apps()`), database migrations (`migrationsPath()` + `schemaVersion()`), and DI bindings, routes, and post-build init through `ContainerBuildingEvent` / `RoutesRegisteringEvent` / `BootingEvent`. New tools, templates, skills, and migrations contributed via plugins take effect automatically once the plugin is installed — no additional glue in `app/Plugins/PluginLoader.php` or `config.php` is required.

**Plugin conflicts:** duplicate slugs or duplicate entry-point FQCNs are silently skipped — first-loaded wins. Plugin Composer dependencies are isolated by shipping a separate `vendor/` per plugin (declared in `autoload.files`); the host vendor tree is not affected.

## Database

SQLite by default (zero config), MySQL/MariaDB supported via `config.php` or env vars (`SPORA_DB_DRIVER=mysql` + `SPORA_DB_HOST/PORT/NAME/USER/PASSWORD`). All schema managed by `DatabaseSchemaInstaller` using Illuminate Schema Builder — versioned, component-aware, with a hot-path stamp cache. See the [Database schema](/reference/concepts/schema) page.

**Runtime artifacts in `storage/`:** `.schema_stamp` (DB installer cache) and `spora-worker.lock` (single-instance worker lock) are runtime state, not data — exclude them from backups. See the [Backups](/start/operators/backups) page for what to back up.
