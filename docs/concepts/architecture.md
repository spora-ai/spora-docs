---
title: Architecture
description: System overview — config priority, orchestrator loop, worker modes, plugin system, recipes, database.
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

If approval required → serialize `AgentState` to DB as `PENDING_APPROVAL`, PHP process exits. On human approval → status set to `RUNNING` (Sync) or `QUEUED` (Worker). `tick()` is invoked again only in sync mode; in worker mode the daemon picks up the task on its next drain cycle (see `Orchestrator::resume()` at `app/Agents/Orchestrator.php:585-589`).

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
    max -->|yes| failed
    max -.->|no| claim

    classDef entry fill:var(--spora-paper),stroke:var(--spora-warm),color:var(--spora-ink)
    classDef action fill:var(--spora-paper-deep),stroke:var(--spora-warm-deep),color:var(--spora-ink)
    classDef terminal fill:var(--spora-cream),stroke:var(--spora-warm-deep),color:var(--spora-ink),font-weight:bold
    class start,tick,claim,llm,text,input,output,required,approved,grant,history1,history2,max action
    class completed,failed,pending,cancel,resume,reject terminal
```

Status transitions: `QUEUED → RUNNING → COMPLETED | FAILED | PENDING_APPROVAL ⇄ RUNNING → CANCELLED` (PENDING is the initial value written by the migration; in practice the worker transitions QUEUED→RUNNING before the first tick. The `CANCELLED` terminal status is set by `TaskService::cancelRetryChain` — `REJECTED` is the analogous status for `tool_calls` rows, not `tasks`.)

### Worker Modes (`SPORA_SYNC_MODE`)

`SPORA_SYNC_MODE` is a boolean that flips a single `worker_mode` config flag (`true` → Sync, `false` → Worker). Only two worker modes exist: Sync and Worker.

| Mode                               | Default | Behaviour                                                                                                                                                                                |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync` (`SPORA_SYNC_MODE=true`)    | ✓       | `start()` creates task as `RUNNING` and calls `tick()` inline. HTTP response blocked until agent completes. Suitable for dev and lightweight deployments.                                |
| `worker` (`SPORA_SYNC_MODE=false`) |         | `start()` creates task as `QUEUED` and returns immediately. Run `php bin/spora worker:run` (default = daemon, `--once` for cron, `--once --include-queue` for cron-with-queue) to drain. |

In Worker mode, multi-step tasks (multiple LLM turns) still run synchronously within a single worker invocation — the loop continues until `COMPLETED`, `FAILED`, or `PENDING_APPROVAL`.

For the full details on tick phases, task lifecycle, and Mercure publishing, see [Agent loop and async mode](/concepts/agent-loop-async).

## Plugin System

Drop a folder into `plugins/` with a `plugin.json` manifest (and optional `Plugin.php`). Auto-discovered at boot — no manual registration.

Boot sequence (`app/Plugins/PluginLoader.php`):

1. Glob `plugins/*/plugin.json` and read each manifest
2. Register PSR-4 mappings from `autoload.psr-4` with the Composer classloader
3. `require_once` bootstrap files from `autoload.files` (e.g. the plugin's own `vendor/autoload.php`)
4. `require_once` the manifest's `file` (default `Plugin.php`)
5. Instantiate the declared class; call its `autoload()` for additional PSR-4 bindings
6. `tools()`, `drivers()`, `recipePaths()`, `schemaVersion()`, `migrationsPath()` → register contributions
7. `register(ContainerBuilder)` → arbitrary DI bindings

Plugins can contribute: tools, LLM drivers, recipes, and database migrations. See `app/Plugins/PluginInterface.php` and the [Plugin system](/concepts/plugins-system) page.

> **Status: WIP** — the plugin system is currently a work-in-progress. The hook methods (`tools()`, `drivers()`, `recipePaths()`, `register()`) are declared on the interface and surfaced by the manifest, but the explicit `PluginLoader → DI container` injection path is not yet fully wired up. New drivers, tools, and recipes contributed via plugins may not take effect without additional glue in `app/Plugins/PluginLoader.php` or direct registration via `config.php`.
>
> Three open PRs are landing this. The WIP note is preserved verbatim so readers know the limitations.

**Plugin conflicts:** duplicate slugs or duplicate entry-point FQCNs are silently skipped — first-loaded wins. Plugin Composer dependencies are isolated by shipping a separate `vendor/` per plugin (declared in `autoload.files`); the host vendor tree is not affected.

## Database

SQLite by default (zero config), MySQL/MariaDB supported via `config.php` or env vars (`SPORA_DB_DRIVER=mysql` + `SPORA_DB_HOST/PORT/NAME/USER/PASSWORD`). All schema managed by `DatabaseSchemaInstaller` using Illuminate Schema Builder — versioned, component-aware, with a hot-path stamp cache. See the [Database schema](/concepts/schema) page.

**Runtime artifacts in `storage/`:** `.schema_stamp` (DB installer cache) and `spora-worker.lock` (single-instance worker lock) are runtime state, not data — exclude them from backups. See the [Backups](/start/operators/backups) page for what to back up.
