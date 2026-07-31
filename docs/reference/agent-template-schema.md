---
title: Agent template schema
description: Full reference for the Spora Agent Template JSON Schema (draft 2020-12).
---

# Agent template schema

The Agent Template schema is published at [`https://spora.dev/agent-template.schema.json`](https://spora.dev/agent-template.schema.json) (mirrored in `spora-core/agent-template.schema.json`). It uses JSON Schema draft 2020-12 with `additionalProperties: false` at every level.

> **Operator-upload only.** This schema describes the payload accepted by the operator-upload endpoint `POST /api/v1/agent-templates/import`. The LLM-facing `create_agent` tool uses a **slim** subset (top-level `name` / `description` / `system_prompt` / `max_steps` / `allow_followup` / `retry_after_minutes` / `max_retries`) — see [Concepts → Tool system → Slim two-phase agent creation](/reference/concepts/tools#slim-two-phase-agent-creation). The two surfaces are explicit by design: the slim payload removes the N-nested-keys decision the LLM had to make in one call.
>
> **Settings are opt-in.** The new `tools[].settings` block is present only when the template was produced by `GET /agents/{id}/export?include_settings=1`. Password-typed keys (`#[ToolSetting(type: 'password')]`) and inherited global/user cascade values are NEVER included, regardless of how the template was produced. Recipients configure remaining secrets in **Settings → Tools** after import.

## Top-level shape

| Field              | Type   | Required | Notes                                                                                                                                                                                                                                   |
| ------------------ | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`          | string | no       | Always `"https://spora.dev/agent-template.schema.json"`.                                                                                                                                                                                |
| `id`               | string | **yes**  | Namespaced slug. Pattern: `^([a-z0-9][a-z0-9_-]{0,63}/)?[a-z0-9][a-z0-9_-]{0,63}$`. Length 1-130. Format: `<source>/<slug>` — `core/<name>` for built-ins, `<plugin-slug>/<name>` for plugin templates, bare `<slug>` for user exports. |
| `name`             | string | **yes**  | Human-readable name. Length 1-200.                                                                                                                                                                                                      |
| `description`      | string | no       | Up to 1000 chars.                                                                                                                                                                                                                       |
| `version`          | string | **yes**  | Semver `^[0-9]+\.[0-9]+\.[0-9]+([+-].+)?$`.                                                                                                                                                                                             |
| `agent`            | object | **yes**  | Agent identity block.                                                                                                                                                                                                                   |
| `tools`            | array  | no       | Tool activations. May be omitted (e.g. operator-uploaded skeleton that only configures `agent{}`) or empty. When present, applied atomically on import — disabled/missing tools are silently skipped.                                   |
| `required_plugins` | array  | no       | Plugin slugs. Pattern: `^[a-z0-9][a-z0-9_-]*$`.                                                                                                                                                                                         |
| `metadata`         | object | no       | Display metadata.                                                                                                                                                                                                                       |

## `agent` block

| Field                 | Type    | Default | Notes                                                                            |
| --------------------- | ------- | ------- | -------------------------------------------------------------------------------- |
| `description`         | string  | —       | Up to 2000 chars.                                                                |
| `system_prompt`       | string  | —       | System prompt. Omitting this produces a `SYSTEM_PROMPT_MISSING` warning at scan. |
| `max_steps`           | integer | `10`    | 1-100.                                                                           |
| `allow_followup`      | boolean | `true`  | Maps to DB `allow_followup`.                                                     |
| `retry_after_minutes` | integer | `0`     | ≥ 0.                                                                             |
| `max_retries`         | integer | `0`     | ≥ 0.                                                                             |

## `tools[]` entries

```json
{
  "tool_class": "Spora\\Tools\\CalculatorTool",
  "enabled": true,
  "operations": [{ "name": "calculate", "enabled": true, "auto_approve": true }],
  "settings": { "allowed_skills": ["weather", "calculator"] }
}
```

| Field        | Type    | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool_class` | string  | **yes**  | FQCN of a registered `ToolInterface` implementation.                                                                                                                                                                                                                                                                                                                                                |
| `enabled`    | boolean | **yes**  | Whether to enable the tool. Disabled tools get no row inserted on import.                                                                                                                                                                                                                                                                                                                           |
| `operations` | array   | **yes**  | Per-operation overrides.                                                                                                                                                                                                                                                                                                                                                                            |
| `settings`   | object  | no       | Optional agent-specific, non-secret tool overrides (e.g. the active skill allowlist). Only present when the template was produced by `GET /agents/{id}/export?include_settings=1`. Each key must match an `#[ToolSetting]` attribute on the registered tool class; password-typed keys are rejected at validation. The importer applies surviving keys via `ToolConfigService::putAgentOverride()`. |

> **LLM authoring note:** the `AgentTool.get_available_tools` operation returns
> `tool_class` for every registered tool. An agent that wants to spawn a
> sub-agent with a chosen toolset should pull `tool_class` straight out of
> the discovery response and use it verbatim in the `tools[]` block. Do not
> invent FQCNs — only registered classes can be enabled.

### `tools[].operations[]` entries

| Field          | Type    | Required | Notes                                                                           |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `name`         | string  | **yes**  | Operation method name (must match a `#[ToolOperation]` declared by the tool).   |
| `enabled`      | boolean | no       | Whether this operation is enabled. Omit to inherit the tool's default.          |
| `auto_approve` | boolean | no       | If true, this operation is pre-approved and does not require user confirmation. |

## `metadata` block

```json
{ "category": "research", "icon": "globe" }
```

`category` must be one of `general`, `productivity`, `research`, `communication`, `media`, `data`, `automation`. Unknown categories produce a `METADATA_CATEGORY_UNKNOWN` warning. `icon` is a bundled-icon name from the Spora palette.

## Warning codes

The scanner and validator surface these codes; none abort the import.

| Code                                                       | Severity | Meaning                                                                                                     |
| ---------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `PARSE_ERROR`                                              | error    | File failed to parse as JSON or YAML. Surfaces in scanner output.                                           |
| `EMPTY_PAYLOAD`                                            | error    | Decoded payload is empty / not an object.                                                                   |
| `ID_REQUIRED` / `ID_INVALID` / `ID_PATTERN`                | error    | `id` is missing, empty, or fails the slug regex.                                                            |
| `NAME_REQUIRED` / `NAME_INVALID`                           | error    | `name` is missing or empty.                                                                                 |
| `VERSION_REQUIRED` / `VERSION_INVALID` / `VERSION_PATTERN` | error    | `version` is missing or not semver.                                                                         |
| `AGENT_REQUIRED`                                           | error    | `agent` block missing or not an object.                                                                     |
| `MAX_STEPS_RANGE`                                          | error    | `agent.max_steps` is out of `[1, 100]`.                                                                     |
| `TOOLS_NOT_LIST`                                           | error    | `tools` is not a list.                                                                                      |
| `TOOL_CLASS_REQUIRED`                                      | error    | A tool entry is missing `tool_class`.                                                                       |
| `TOOL_CLASS_DUPLICATE`                                     | error    | Same `tool_class` appears more than once.                                                                   |
| `TOOL_ENABLED_REQUIRED`                                    | error    | A tool entry is missing boolean `enabled`.                                                                  |
| `OPERATIONS_NOT_LIST`                                      | error    | A tool's `operations` is not a list.                                                                        |
| `OPERATION_NOT_OBJECT`                                     | error    | An operation entry is not an object.                                                                        |
| `OPERATION_NAME_REQUIRED`                                  | error    | An operation entry is missing `name`.                                                                       |
| `AUTO_APPROVE_TYPE`                                        | error    | `auto_approve` is not boolean.                                                                              |
| `OPERATION_ENABLED_TYPE`                                   | error    | `enabled` is not boolean.                                                                                   |
| `SETTINGS_UNKNOWN_KEY`                                     | error    | `tools[].settings.<key>` is not declared by the tool's `#[ToolSetting]` attributes.                         |
| `SETTINGS_PASSWORD_KEY_FORBIDDEN`                          | error    | `tools[].settings.<key>` names a password-typed setting. Defence-in-depth — the exporter never emits these. |
| `SETTINGS_INVALID_VALUE_TYPE`                              | error    | A `tools[].settings` value fails the type check (e.g. scalar for `multi-select`, non-bool for `toggle`).    |
| `REQUIRED_PLUGINS_NOT_LIST` / `REQUIRED_PLUGINS_INVALID`   | error    | `required_plugins` is malformed.                                                                            |
| `METADATA_NOT_OBJECT`                                      | error    | `metadata` is not an object.                                                                                |
| `METADATA_ICON_TYPE`                                       | error    | `metadata.icon` is not a string.                                                                            |
| `UNKNOWN_TOP_LEVEL_KEY`                                    | error    | Top-level field is not in the allowed list.                                                                 |
| `UNKNOWN_AGENT_KEY`                                        | error    | `agent.*` field is not in the allowed list.                                                                 |
| `UNKNOWN_METADATA_KEY`                                     | error    | `metadata.*` field is not in the allowed list.                                                              |
| `SYSTEM_PROMPT_MISSING`                                    | warning  | `agent.system_prompt` is empty.                                                                             |
| `OPERATION_UNKNOWN`                                        | warning  | An operation name is not declared by the tool.                                                              |
| `SKILL_MISSING`                                            | warning  | A `multi-select` skill slug in `tools[].settings` is not available locally and was dropped on import.       |
| `METADATA_CATEGORY_UNKNOWN`                                | warning  | `metadata.category` is not in the known enum.                                                               |
| `NAMESPACE_MISMATCH`                                       | warning  | Built-in / plugin file id doesn't start with the source directory's namespace prefix.                       |
| `PLUGIN_MISSING`                                           | warning  | A `required_plugins` slug is not loaded. (Importer)                                                         |
| `TOOL_PLUGIN_MISSING`                                      | warning  | A `tool_class` is not currently registered. (Importer)                                                      |
| `TOOL_NEEDS_CONFIGURATION`                                 | warning  | Tool will be enabled but missing required settings. (Importer)                                              |
