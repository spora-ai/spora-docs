---
title: PHP interfaces
description: PHP interface contracts — ToolInterface, OrchestratorInterface, LLMDriverConfigInterface, PluginInterface.
---

# Spora: PHP Interface Contracts

All interfaces live in `app/`. The authoritative source is the source code — this doc describes intent and usage rules.

## PHP Attributes (Tool Metadata)

**`app/Tools/Attributes/`** — read via PHP Reflection by the Orchestrator and UI.

| Attribute                                                                                             | Target             | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `#[Tool(name, description, displayName, category)]`                                                   | class              | LLM-facing snake_case name (must match `/^[a-z][a-z0-9_]*$/`), LLM description, optional human display name, category for UI grouping (default `"general"`). Required on every tool.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `#[ToolOperation(name, description, enabledByDefault, requiresApprovalByDefault, discriminatorKey)]`  | class (repeatable) | Per-operation enabled/approval flag. `discriminatorKey` (default `"action"`) is the argument field the LLM sends to pick the operation. Replaces the class-level Input/OutputTool split.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `#[ToolParameter(name, type, description, required, default, enum, minimum, maximum, format, items)]` | class (repeatable) | Read by `ToolParameterSchemaBuilder` to auto-generate the JSON Schema `parameters` block. The default implementation lives in the `HasParameterSchema` trait (composed by `AbstractTool`); tools may override `getParametersSchema()` for custom shapes.                                                                                                                                                                                                                                                                                                                                                                                   |
| `#[ToolSetting(key, label, type, description, default, required, options, validation, exposeToLlm)]`  | class (repeatable) | UI-configurable setting. `type` is `"text"\|"password"\|"select"\|"toggle"`. `exposeToLlm: true` includes the effective value in the LLM tool description. Global values live in `tool_configurations.settings`; per-user overrides in `tool_user_settings.settings`; per-agent overrides in `agent_tool_overrides.settings`. Merge order (later layers win, schema defaults fill unset keys): **schema defaults → `tool_configurations` → `tool_user_settings` → `agent_tool_overrides`**. See `ToolConfigService::getEffectiveSettings()` (`app/Services/ToolConfigService.php:187-223`). Never sent to LLM unless `exposeToLlm` is set. |

Since spora-core#165, `required` accepts `bool|list<string>` — list form is per-op binding (`required: ['format']`).

## `ToolInterface` (`app/Tools/ToolInterface.php`)

Unified tool interface — replaces the previous `InputToolInterface` / `OutputToolInterface` split. Per-operation enabled/approval state is read from `#[ToolOperation]`. Tools without `#[ToolOperation]` declarations are treated as single-operation tools with class-level defaults.

- `execute(array $arguments, int $agentId, ?int $userId = null): ToolResult` — MUST NOT throw; encode errors in `ToolResult`. `userId` is **sourced by the Orchestrator from the calling Agent's row** (see [Architecture → Orchestrator Loop](/reference/concepts/architecture#orchestrator-loop)); the dispatcher never threads a session user id. User settings are merged before agent overrides.
- `describeAction(array $arguments): string` — human-readable, markdown-safe description for the approval UI.
- `getParametersSchema(): array` — returns the JSON Schema `parameters` object (`type: "object"`, `properties`, `required`).

The Orchestrator pauses the loop on tool turns that resolve to `requiresApprovalByDefault: true` (creating `PENDING_APPROVAL` tool-call rows and setting the task to `PENDING_APPROVAL`); `TaskController` calls `Orchestrator::resume()` after human approval. There is no separate `ApprovalResumeHandler` — `Orchestrator::resume()` performs the validation, execution, history append, status reset, and conditional `tick()` itself.

## `OrchestratorInterface` (`app/Agents/OrchestratorInterface.php`)

- `start(agentId, userPrompt, maxSteps = 10, parentTaskId = null, runId = null): Task` — creates Task (`RUNNING` in sync mode, `QUEUED` in worker/cron mode), appends `user` history, calls `tick()` directly in sync mode.
- `tick(taskId): void` — one loop iteration: short claim transaction (lock, max-step check, status read) → LLM call (outside transaction) → write results. Recurses via `tick()` when a tool turn completes without requiring approval.
- `resume(taskId, decisions): void` — `decisions` is a `list<array{provider_call_id: string, decision: 'approve'|'reject', arguments?: array<string, mixed>, reason?: string}>` (PR #173). In a `lockForUpdate()` transaction: load task + `AgentState`, split the batch via `AgentDecisionProcessor::splitDecisions()`. Approved entries are handed to `ApprovedBatchExecutor` (partial-approval semantics preserved — undecided rows stay `PENDING_APPROVAL`); rejected entries are stamped `REJECTED` with `rejected_at` / `rejected_by` / `reject_reason` and a `role:'tool'` history row is appended carrying `toolCallId` + `toolName` so the LLM sees the rejection in its next round-trip. The task transitions back to `RUNNING` (Sync) or `QUEUED` (Worker) only when the batch leaves no `PENDING_APPROVAL` rows. Calls `tick()` afterwards only in sync mode so the LLM round-trip does not hold the lock open.
- `reject(taskId, reason): void` — task-level bulk reject. In a `lockForUpdate()` transaction: load task, assert `PENDING_APPROVAL`, clear `pending_state`. Then outside the transaction: mark `PENDING_APPROVAL` tool calls `REJECTED`, append `Action rejected by user: {reason}` history rows, set task status to `RUNNING`/`QUEUED`. The bulk path does not write `rejected_at` / `rejected_by` / `reject_reason` — those columns are reserved for per-call rejection via `resume()`. Calls `tick()` only in sync mode.
- `continue(taskId, newPrompt, additionalSteps = null): Task` — append a new user message, reset `step_count`, optionally override `max_steps`, re-enter the loop. Only valid when current status is `COMPLETED` or `FAILED`.
- `appendHistory(taskId, role, content, context?)` — write a single row into `task_history`. Used by extracted services (e.g. `SubAgentService`) that pre-existed the interface but need to write back into the orchestrator's history stream without a direct coupling. `context` is a `HistoryMessageContext` (carries `toolCallId`, `toolName`, `toolCallPayload`, `inputTokens`, `outputTokens`, `contentBlocks`, `usage`); defaults to an empty context. Promoted from the implementation to the interface in spora-core PR #196.

The `tick()` call in `resume()` and `reject()` is intentionally outside the transaction (and gated on `WorkerMode::Sync`) so the LLM round-trip does not hold a `lockForUpdate()` open during network I/O.

## `LLMDriverConfigInterface` (`app/Drivers/LLMDriverConfigInterface.php`)

Drivers are resolved per-request by `DriverFactory` from the agent's `llm_driver_config_id` FK (or the user's preferred / global default config; see `app/Drivers/DriverFactory.php:30-49`).

- `static getName(): string` — snake_case identifier, e.g. `"openai_compatible"`, `"anthropic_compatible"`.
- `static getDisplayName(): string` — human-readable, e.g. `"OpenAI Compatible"`.
- `static getDefaultTools(): list<class-string>` — default tool list for this driver.

Settings are stored encrypted in `LLMDriverConfiguration.settings` (JSON blob) and discovered per-driver via `#[ToolSetting]` attribute reflection — no hardcoded field lists. The interface itself does not expose a `getSettingsSchema()` method; the controller and `ToolConfigService` read the attributes directly (`app/Http/LLMConfigController.php:264`, `app/Services/ToolConfigService.php:441`). Implementations must be registered in the container under `llm_driver_classes`.

## `PluginInterface` (`app/Plugins/PluginInterface.php`)

- `getName(): string` — human-readable plugin name, shown in the UI and logs.
- `autoload(): array<string, string>` — PSR-4 namespace → path mappings for the plugin's own classes.
- `tools(): array<class-string<\Spora\Tools\ToolInterface>>` — tool FQCNs to register with the Tool Registry.
- `drivers(): array<string, class-string<\Spora\Drivers\LLMDriverInterface>>` — provider name → driver class (keys match the `llm_provider` string stored on agents).
- `recipePaths(): list<string>` — absolute paths to recipe directories or files.
- `schemaVersion(): int` — DB schema version this plugin requires (default 0).
- `migrationsPath(): ?string` — absolute path to the directory containing this plugin's Laravel Migration files (default null).
- `register(ContainerBuilder $builder): void` — arbitrary DI bindings, middleware, or services.
