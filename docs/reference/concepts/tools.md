---
title: Tool system
description: How to author a tool, the attribute system, naming conventions, settings cascade, and LLM exposure.
---

# Spora Tool System

This document covers how to author a tool, the attribute system, naming conventions, and how tools reach the LLM.

## Authoring a Tool

A tool is a `final` PHP class that **extends `AbstractTool`** and declares its identity, operations, parameters, and settings as PHP attributes. The base class composes `HasOperations` (operation dispatch) and `HasParameterSchema` (auto-generated JSON Schema), so a minimal tool is just `execute()` + `describeAction()`.

```php
use Spora\Tools\AbstractTool;
use Spora\Tools\Attributes\Tool;
use Spora\Tools\Attributes\ToolOperation;
use Spora\Tools\Attributes\ToolParameter;
use Spora\Tools\ValueObjects\ToolResult;

#[Tool(
    name: 'web_search',
    description: 'Search the web.',
    displayName: 'Web Search',
    category: 'research',
    icon: 'search',  // bundled icon key (optional; see below)
)]
#[ToolOperation(name: 'search', description: 'Run a search', enabledByDefault: true, requiresApprovalByDefault: false)]
#[ToolParameter(name: 'query', type: 'string', description: 'The search query.', required: true)]
final class MyWebSearchTool extends AbstractTool
{
    public function execute(array $arguments, int $agentId, ?int $userId = null): ToolResult
    {
        $query = trim((string) ($arguments['query'] ?? ''));
        // ...
        return new ToolResult(true, "Results for {$query}");
    }

    public function describeAction(array $arguments): string
    {
        return "Search the web for: '{$arguments['query']}'";
    }
}
```

That's it — no hand-written `getParametersSchema()`. The `ToolParameterSchemaBuilder` reads the `#[ToolOperation]` and `#[ToolParameter]` attributes via reflection and produces the JSON Schema sent to the LLM.

### Where `$userId` comes from

The `$userId` passed into `execute()` is **sourced by the Orchestrator from the calling Agent's row** (`Orchestrator::safeExecute()` at `app/Agents/Orchestrator.php`), not from the session. The dispatcher cannot thread a session-derived user id into a tool — the call site no longer accepts one. Tools therefore never need to trust the user_id argument as "whoever is signed in"; it's "the owner of the agent that issued this call". When the Orchestrator boots without `AgentServiceInterface` (a unit-test harness), `$userId` is `null` and the tool's own `getAgentByAgentId()` fallback applies. See [Concepts → Architecture → Orchestrator Loop](/reference/concepts/architecture#orchestrator-loop) for the structural guarantee.

### The auto-synthesized `action` discriminator

When a tool declares **two or more** `#[ToolOperation]` attributes, the builder prepends a property to the schema (named after the first operation's `discriminatorKey`, default `'action'`) whose `enum` lists every declared operation name. **Do not also write `#[ToolParameter(name: 'action', ...)]`** — the builder owns that property.

```php
#[ToolOperation(name: 'list_events', description: 'Fetch upcoming events')]
#[ToolOperation(name: 'create_event', description: 'Create an event')]
// Auto-generated:
//   properties.action = {type: string, enum: ['list_events', 'create_event'], description: '...'}
//   required = ['action']
```

Single-op tools skip discriminator synthesis — the LLM has no choice to make, and `HasOperations::getOperationName()` falls back to the one declared operation when the argument is absent.

To use a different discriminator key (e.g. `'operation'` for parity with an external API), declare it on **every** `#[ToolOperation]`:

```php
#[ToolOperation(name: 'search', ..., discriminatorKey: 'operation')]
#[ToolOperation(name: 'top_news', ..., discriminatorKey: 'operation')]
```

### Parameter declaration order is significant

The order in which `#[ToolParameter]` attributes appear on the class determines:

1. The property order in the JSON Schema sent to the LLM.
2. The render order of fields in the approval UI (the `parameter_schema` field on `tool_calls` API responses carries this order to the frontend).

Put the most important parameters first.

### Inheritance

`#[ToolParameter]` declared on a parent class is inherited by subclasses for **schema generation** — `ToolParameterSchemaBuilder` walks the class hierarchy when collecting `#[ToolParameter]` attributes. Use this for shared parameter sets:

```php
#[ToolParameter(name: 'name',    type: 'string',  description: '...', required: false)]
#[ToolParameter(name: 'content', type: 'string',  description: '...', required: false)]
abstract class AbstractMemoryTool extends AbstractTool { /* shared CRUD */ }

#[Tool(name: 'memory', description: 'Agent-scoped memory.')]
#[ToolOperation(name: 'list', ...)] #[ToolOperation(name: 'get', ...)]
#[ToolOperation(name: 'save', ...)] #[ToolOperation(name: 'delete', ...)]
final class AgentMemoryTool extends AbstractMemoryTool { protected function getScope(): string { return 'agent'; } }
```

The concrete `AgentMemoryTool` schema includes `action`, `name`, and `content` automatically.

> **Note on `#[ToolOperation]`:** `HasOperations` reads operation attributes only from the concrete class — it does **not** walk parent classes. Always declare `#[ToolOperation]` on the concrete tool class, otherwise dispatch will fail to resolve operations advertised by an inherited schema.

### `#[ToolParameter]` reference

| Field                 | Type                                  | Notes                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                | `string`                              | Argument key the LLM sends.                                                                                                                                                                                                                                                                      |
| `type`                | `string`                              | One of `string`, `number`, `integer`, `boolean`, `array`, `object`.                                                                                                                                                                                                                              |
| `description`         | `string`                              | Sent to the LLM.                                                                                                                                                                                                                                                                                 |
| `required`            | `bool\|list<string>` (default `true`) | `true`/`false` keep the global behaviour; a non-empty list of operation names binds the parameter to those operations only — e.g. `required: ['format']` makes the param required when the dispatcher is `format`. `required: []` is coerced to `true`; use `false` for the truly optional case. |
| `default`             | `mixed` (default `null`)              | Emitted as JSON Schema `default`. When set, the parameter is omitted from `required[]` regardless of the `required` flag.                                                                                                                                                                        |
| `enum`                | `list<string>`                        | Value allowlist (string types).                                                                                                                                                                                                                                                                  |
| `minimum` / `maximum` | `int\|float\|null`                    | Numeric bounds.                                                                                                                                                                                                                                                                                  |
| `format`              | `?string`                             | JSON Schema format hint (e.g. `'date'`, `'email'`).                                                                                                                                                                                                                                              |
| `items`               | `?array`                              | Sub-schema for `array` types, e.g. `['type' => 'string']`.                                                                                                                                                                                                                                       |

### Worked example: `required: list<string>`

`TimeTool::epoch` is shared across operations but required only by `format`, so it uses a per-operation binding:

```php
#[ToolParameter(
    name: 'epoch',
    type: 'integer',
    description: 'Unix timestamp to format.',
    required: ['format'],
)]
```

The generated schema requires `epoch` when the `action` dispatcher is `format`, while leaving it optional for other operations.

### Plugin tools

Plugin tools can either `extends AbstractTool` like core tools, or — if they need to extend a third-party base class — opt in via:

```php
use Spora\Tools\Traits\HasOperations;
use Spora\Tools\Traits\HasParameterSchema;

final class MyPluginTool extends ThirdPartyBase implements ToolInterface
{
    use HasOperations;
    use HasParameterSchema;
    // ...
}
```

The schema builder works on any FQCN via reflection — no path coupling.

## Tool naming

Every tool carries a **unique LLM-facing name** declared via the `#[Tool(name:)]` attribute:

```php
#[Tool(
    name: 'web_search',   // snake_case, /^[a-z][a-z0-9_]*$/
    description: 'Search the web.'
)]
```

Names must match `/^[a-z][a-z0-9_]*$/` (lowercase alphanumeric + underscore, starting with a letter). An `InvalidArgumentException` is thrown at class instantiation time if the name is invalid.

### Core vs Plugin namespacing

- **Core tools** (built-in): sent to the LLM with their plain name, e.g. `web_search`.
- **Plugin tools**: prefixed with the plugin slug and a colon, e.g. `my-plugin:web_search`.

This ensures global uniqueness — two plugins can never produce a tool name collision. The prefix is derived automatically from `plugin.json` and requires no changes to the plugin's `#[Tool]` attribute.

> **Note:** core tools intentionally do **not** use a `core:` prefix. Adding it would change every tool name currently known to the LLM, breaking existing agents. Only plugin tools get the slug prefix.

## Discovery from the LLM

The built-in `AgentTool` (`app/Tools/AgentTool.php`) exposes a `get_available_tools` operation that returns a compact, versioned JSON payload describing every registered tool on the agent. The LLM calls this operation to plan which tools to use, to identify the `tool_class` it needs for `configure_tools`, and to surface `plugin_slug` values for `required_plugins` (operator-upload path only).

### Response contract (version 2)

```json
{
  "version": 2,
  "count": 2,
  "tools": [
    {
      "tool_class": "Spora\\Tools\\CalculatorTool",
      "display_name": "Calculator",
      "description": "Perform arithmetic calculations.",
      "plugin_slug": null,
      "enabled": true,
      "ready_to_enable": true,
      "missing_required": [],
      "operations": [
        {
          "name": "calculate",
          "description": "Evaluate an expression.",
          "enabled": true,
          "requires_approval": false
        }
      ]
    },
    {
      "tool_class": "Spora\\Plugins\\Tavily\\Tools\\TavilySearchTool",
      "display_name": "Tavily Search",
      "description": "Search the web via Tavily.",
      "plugin_slug": "tavily",
      "enabled": false,
      "ready_to_enable": false,
      "missing_required": ["api_key"],
      "operations": [
        {
          "name": "search",
          "description": "Run a search.",
          "enabled": true,
          "requires_approval": false
        }
      ]
    }
  ]
}
```

### Field semantics

- `tool_class` is the FQCN the LLM passes verbatim into `configure_tools.tools[].tool_class`. Don't invent FQCNs — only registered classes can be enabled.
- `plugin_slug` is `null` for core tools, the plugin slug (e.g. `"tavily"`) for plugin-owned tools, and the plugin slug for tools registered by the operator's `app/App.php` extension. Use it for `required_plugins[]` on the operator-upload path; never substitute the FQCN.
- `display_name` and `description` are kept on `get_available_tools` for operator-facing browsing, but **dropped** from the slim per-tool manifest returned by `read_agent` / `configure_tools` / `update_agent` (the LLM already has `tool_class` — carrying descriptive metadata bloats every LLM turn). The slim shape is `{ tool_class, icon, enabled, operations[] }`.
- `enabled` mirrors the current `agent_tools` row presence.
- `ready_to_enable` is `true` when no required settings are missing. A tool with `enabled: false, ready_to_enable: false` needs configuration before the operator can enable it; the agent cannot enable it on its own.
- `missing_required` lists only the required setting **keys**; no effective values are exposed to avoid leaking credentials.
- `operations[]` carries per-operation `enabled` / `requires_approval` state, resolved against the effective override (or the operation's `enabledByDefault` / `requiresApprovalByDefault` when no override exists).

### Slim two-phase agent creation

The LLM-facing agent creation flow is **two-phase** — `create_agent` does NOT accept a `tools[]` block. The flow is:

1. **`create_agent`** — slim skeletal record (`name`, `description`, `system_prompt`, `max_steps`, `allow_followup`, `retry_after_minutes`, `max_retries`). Capture the returned `agent_id`.
2. **`configure_tools(agent_id: <id>, tools: [...])`** — apply the toolset. Each entry is `{ tool_class, enabled, operations: [{name, enabled?, auto_approve?}] }`.
3. **`read_agent(agent_id: <id>)`** — verify the toolset is exactly what was wanted.

The full agent-template shape (`id` / `version` / nested `agent{}` / `tools[]` / `required_plugins[]`) is reserved for the operator-upload endpoint at `POST /api/v1/agent-templates/import` (see [Agent template schema](/reference/agent-template-schema)). `create_agent` rejects the nested-object shape with a literal "send X instead" example; see `skills/agent-creation/SKILL.md` for the full protocol.

### Tool activation is operator-only

The agent-facing `get_available_tools` does **not** expose enable/disable operations. There is no `enable_tool` or `disable_tool` the LLM can call. To activate a tool:

- For sub-agents, call `create_agent` (slim) and then `configure_tools(agent_id: <id>, tools: [...])` — see [Slim two-phase agent creation](#slim-two-phase-agent-creation).
- For the calling agent itself, the operator must enable the tool through the agent settings UI or the `POST /api/v1/agents/{id}/tools/{toolId}/enable` endpoint. The `{toolId}` path segment is the tool's `#[Tool(name:)]` value (e.g. `tavily_search` or `calculator`) — see [Route definitions](/reference/api#tool-routes) for the canonical mapping.

This split keeps tool activation on the calling agent under explicit operator control while still letting the agent self-compose a sub-agent when it needs capabilities beyond its current set.

## Icon resolution

A tool may declare a `?string $icon` argument on the `#[Tool(...)]` attribute — a kebab-case key from the [bundled icon palette](/reference/plugin-schema#icon-field--three-forms) (e.g. `'calendar'`, `'mail'`, `'search'`, `'globe'`). The icon is surfaced on the Agent resource (`GET /api/v1/agents` / `GET /api/v1/agents/{id}`) so the admin UI can render a matching tile for the tool.

Resolution is a 3-layer chain, evaluated server-side:

1. The `*Tool` class's `#[Tool(icon: ...)]` argument (most specific — wins for multi-tool plugins).
2. The owning plugin's [`plugin.json` `icon`](/reference/plugin-schema#icon-field--three-forms) field (plugin-level identity — covers single-tool plugins automatically).
3. `null` — the frontend `<Icon>` component falls back to `'puzzle'`.

Single-tool plugins don't need to set `#[Tool(icon: ...)]` — their `plugin.json` `icon` field is enough via the layer-2 fallback. Multi-tool plugins should set both: `plugin.json` for the plugin's overall identity and `#[Tool(icon: ...)]` per tool for the per-tool override.

## Tool Settings Key Convention

Settings keys are the **bare field name** (e.g. `api_key`, `http_timeout`, `host`), scoped to the declaring tool class via its `#[ToolSetting]` attribute. The key is what the UI displays and what tool code reads via `ToolConfigService::getEffectiveSettings(toolClass, ...)`.

There is no shared key namespace — keys are looked up per tool class through reflection on the `#[ToolSetting]` attributes on that class. Two different tool classes may declare the same key name (e.g. `api_key`) without colliding; each resolves to its own setting on its own tool.

**Examples:**

- `http_timeout` (declared on `ReadUrlTool`)
- `api_key` (declared on whatever tool needs it — `TavilySearchTool`, `WeatherApiTool`, etc.)

### Plugin Tools

When a tool is contributed by a plugin, the same rule applies: the key is the bare field name. The plugin declares its tool class in a PSR-4-namespaced location and the `#[ToolSetting]` attributes on that class drive the same per-tool resolution. No `plugin.*` namespace prefix is used.

## Architecture: Settings Live on the Tool

Settings are declared as `#[ToolSetting]` PHP attributes **directly on the tool class** that consumes them. There are no separate "Configuration" shell classes.

### Example

```php
#[Tool(
    name: 'my_search',
    description: 'Search a remote API.',
)]
#[ToolSetting(
    key: 'api_key',
    label: 'API Key',
    type: 'password',
    description: 'API key for the remote search service.',
    required: true,
)]
#[ToolOperation(name: 'search', description: 'Search', enabledByDefault: true, requiresApprovalByDefault: false)]
#[ToolParameter(name: 'query', type: 'string', description: 'The search query.', required: true)]
final class MySearchTool extends AbstractTool
{
    public function __construct(
        private readonly ToolConfigService $configService,
        private readonly HttpClientInterface $httpClient,
    ) {}

    public function execute(array $arguments, int $agentId, ?int $userId = null): ToolResult
    {
        $settings = $this->configService->getEffectiveSettings(static::class, $agentId, $userId);
        $apiKey   = $settings['api_key'] ?? '';
        // ...
    }

    public function describeAction(array $arguments): string { /* ... */ }
}
```

### Why?

1. **Discoverability:** A developer reading a tool class can immediately see _what settings it needs_ and _what parameters the LLM sends it_.
2. **No empty shell classes:** Previously, settings lived on empty `*Configuration` classes that existed only to hold attributes. This was wasteful.
3. **Self-documenting:** The `ToolController` scans `#[ToolSetting]` attributes via reflection. Since they now live on the tool class itself, the API endpoint `GET /api/v1/tools` automatically returns both the tool schema and its settings schema in a single response.

### Exception: LLM driver settings

LLM driver settings (OpenAI/Anthropic API keys, model, base URL, etc.) are stored as a JSON blob on the `llm_driver_configurations` table, scoped to a per-driver `LLMDriverConfiguration` record, and surfaced via `LLMConfigService::decodeSettings()`. The driver class itself declares its settings via `#[ToolSetting]` on the class (see `app/Drivers/OpenAICompatibleDriver.php` and `app/Drivers/AnthropicCompatibleDriver.php`), and `DriverFactory` reads them when constructing a driver for an agent.

## Setting cascade: schema defaults → global → user → agent

`ToolConfigService::getEffectiveSettings(toolClass, agentId, userId)` resolves each setting in order:

1. **Schema defaults** — the `default:` value declared on the `#[ToolSetting(...)]` attribute, used when no row exists in any of the three tables below.
2. **Global** value (`tool_configurations` table, scoped to the tool class).
3. **User-level** override (`tool_user_settings`, when `userId` is provided).
4. **Agent-level** override (`agent_tool_overrides`, when an entry exists for `agentId + toolClass`).

Later layers win; schema defaults fill in any keys that no layer has set. Tools never read `tool_configurations` directly — always go through `ToolConfigService`.

## Per-Tool Key Scoping

Settings keys are scoped to the declaring tool class. Two tools that happen to declare a setting with the same key name (e.g. both declaring `api_key`) do **not** share values — each tool resolves its own settings independently via `ToolConfigService::getEffectiveSettings(static::class, ...)`.

This means:

- A user configures `api_key` once on the `TavilySearchTool` settings panel — that value is only used when `TavilySearchTool` runs.
- A different tool that also declares `api_key` (e.g. `WeatherApiTool`) reads its own separately-stored `api_key` value.

The `ToolConfigService::getEffectiveSettings()` method resolves settings by scanning the `#[ToolSetting]` attributes on the requested class, then looking up each key in the global and agent-override stores for that class.

## LLM Exposure (`exposeToLlm`)

By default, tool settings are **server-side only** — they influence how a tool behaves at execution time but are never sent to the LLM.

The `exposeToLlm` parameter on `#[ToolSetting]` controls whether a setting's resolved value is included in the tool definition the LLM receives. This lets the LLM make informed decisions based on its effective configuration.

```php
#[ToolSetting(
    key: 'allowed_domains',
    label: 'Allowed Domains',
    type: 'text',
    description: 'Comma-separated list of domains the agent is allowed to query.',
    exposeToLlm: true,  // included in LLM tool definition
)]
#[ToolSetting(
    key: 'api_key',
    label: 'API Key',
    type: 'password',
    exposeToLlm: false,  // NOT sent to LLM (credential)
)]
```

### Default behavior

`exposeToLlm` defaults to `false` because most settings are credentials or infrastructure (hosts, ports, timeouts). Only mark `exposeToLlm: true` for settings that **directly affect what the LLM can do** — e.g. allowed recipient lists, sender addresses, toggle-able capabilities.

### How it reaches the LLM

`ToolConfigService::getLlmToolSettings()` returns the effective (cascaded) values for all `exposeToLlm: true` settings on a tool. The Orchestrator appends these to the tool's description before sending it to the LLM:

```text
[Effective Configuration]
- Allowed Domains: example.com, internal.example.org
- From Address: agent@spora.local
```

Unconfigured settings are shown as `(not configured)` so the LLM knows a capability may be unavailable.

## Quick Reference: All Tool Settings Keys

| Key            | Type | Tool Class    | Purpose                         | LLM Exposed |
| -------------- | ---- | ------------- | ------------------------------- | ----------- |
| `http_timeout` | text | `ReadUrlTool` | Read URL HTTP timeout (seconds) | —           |

"LLM Exposed ✓" means `exposeToLlm: true` — the setting's effective value is included in the tool definition sent to the LLM.

The remaining tools (`Calculator`, `CurrentTime`, `AgentMemory`, `GlobalMemory`, `ReadUrl`, `UserInfo`) declare no `#[ToolSetting]` attributes — they take their inputs entirely from the LLM's arguments and have no infrastructure configuration to expose.

### Handover tool

The `Handover` tool (`app/Tools/HandoverTool.php`) is a single tool that declares two `#[ToolOperation]` entries on the `op` discriminator — `handover` (transfer + close) and `sub_agent` (spawn child + wait). Both ops share the `allowed_target_agents` multi-select under **Tools → Handover** settings.

| Operation   | Required params (per-op)                 | Requires approval | Side-effect on source task                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ---------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handover`  | `target_agent_id: int`, `prompt: string` | yes               | Source task closes; a new task starts on the target agent. The closed source `final_response` becomes "Handed off to …" and `data.handover.{target_task_id, target_agent_id, target_agent_name}` records the lineage breadcrumb.                                                                                                                                                        |
| `sub_agent` | `agent_id: int`, `prompt: string`        | yes               | Source task flips to `AWAITING_SUB_AGENTS`; a child `Task` with `parent_task_id` is created on the target agent. After every spawned child reaches a terminal state the parent's next tick resumes with each child's output appended as a `role:'tool'` history row. The parent's `result_data.spawned_sub_task_ids: list<int>` is always plural — same shape for one or many children. |

The LLM-facing schema declares `op` as the discriminator (enum: `handover | sub_agent`); single-op agents may omit `op` — `OperationSchemaFilter` strips the discriminator from `required[]` when only one op is allowed (back-compat path for agents created before the second op shipped).

The `target_agent_id` (handover) and `agent_id` (sub_agent) names are deliberately distinct — they identify the same target agent in each op, but the per-op rename keeps the LLM-facing schema self-documenting and avoids hidden field-aliasing surprises.

## Built-in tools

The tools below ship inside `spora-core` (not as plugins). Operators can configure their settings, but the implementations themselves are not pluggable — every operator gets the same behavior out of the box.

### `media` — `MediaTool`

The `media` tool lets an agent search the media archive and mint public share URLs for individual assets. Its `scope` setting controls which `media_assets` rows the agent can see:

| `scope`     | What the agent sees                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent`     | Assets where `asset.agent_id = $agentId` — only the calling agent's own media.                                                                                                                   |
| `principal` | Assets owned by the calling agent's principal — direct uploads by the principal's owner user, plus media attached to any agent of the principal. Works for user-principals AND group-principals. |

The deprecated `scope=user` value (pre-`#221`) is treated as a silent alias for `principal` so existing `agent_tool_settings` rows keep working without a DB migration. New operators see only `agent` and `principal` in the dropdown.

The `get_public_url` operation is `enabledByDefault: false` and `requiresApprovalByDefault: true`. Each call mints a 256-bit unguessable token (or reuses an existing one) and writes it to `media_assets.public_access_token`; the served URL has no auth — the token is the only protection. See [`PublicMediaController`](https://github.com/spora-ai/spora-core/blob/main/app/Http/PublicMediaController.php) for the no-auth, token-gated serving endpoint.

Admin users bypass `scope` and see every asset.
