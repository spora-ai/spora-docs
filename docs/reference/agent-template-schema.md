---
title: Agent template schema
description: Full reference for the Spora Agent Template JSON Schema (draft 2020-12).
---

# Agent template schema

The Agent Template schema is published at [`https://spora.dev/agent-template.schema.json`](https://spora.dev/agent-template.schema.json) (mirrored in `spora-core/agent-template.schema.json`). It uses JSON Schema draft 2020-12 with `additionalProperties: false` at every level.

> **Settings are never included.** ToolSettings (passwords, API keys, secrets) are not representable in this schema. Recipients configure those in **Settings → Tools** after import.

## Top-level shape

| Field              | Type   | Required | Notes                                                            |
| ------------------ | ------ | -------- | ---------------------------------------------------------------- |
| `$schema`          | string | no       | Always `"https://spora.dev/agent-template.schema.json"`.         |
| `id`               | string | **yes**  | Stable slug. Pattern: `^[a-z0-9][a-z0-9_-]{0,63}$`. Length 1-64. |
| `name`             | string | **yes**  | Human-readable name. Length 1-200.                               |
| `description`      | string | no       | Up to 1000 chars.                                                |
| `version`          | string | **yes**  | Semver `^[0-9]+\.[0-9]+\.[0-9]+([+-].+)?$`.                      |
| `agent`            | object | **yes**  | Agent identity block.                                            |
| `tools`            | array  | **yes**  | Tool activations. May be empty.                                  |
| `required_plugins` | array  | no       | Plugin slugs. Pattern: `^[a-z0-9][a-z0-9_-]*$`.                  |
| `metadata`         | object | no       | Display metadata.                                                |

## `agent` block

| Field                 | Type    | Default | Notes                                                                            |
| --------------------- | ------- | ------- | -------------------------------------------------------------------------------- |
| `description`         | string  | —       | Up to 2000 chars.                                                                |
| `system_prompt`       | string  | —       | System prompt. Omitting this produces a `SYSTEM_PROMPT_MISSING` warning at scan. |
| `max_steps`           | integer | `10`    | 1-100.                                                                           |
| `allow_continuation`  | boolean | `true`  | Maps to DB `allow_followup`.                                                     |
| `retry_after_minutes` | integer | `0`     | ≥ 0.                                                                             |
| `max_retries`         | integer | `0`     | ≥ 0.                                                                             |

## `tools[]` entries

```json
{
  "tool_class": "Spora\\Tools\\CalculatorTool",
  "enabled": true,
  "operations": [{ "name": "calculate", "enabled": true, "auto_approve": true }]
}
```

| Field        | Type    | Required | Notes                                                                     |
| ------------ | ------- | -------- | ------------------------------------------------------------------------- |
| `tool_class` | string  | **yes**  | FQCN of a registered `ToolInterface` implementation.                      |
| `enabled`    | boolean | **yes**  | Whether to enable the tool. Disabled tools get no row inserted on import. |
| `operations` | array   | **yes**  | Per-operation overrides.                                                  |

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

| Code                                                       | Severity | Meaning                                                           |
| ---------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `PARSE_ERROR`                                              | error    | File failed to parse as JSON or YAML. Surfaces in scanner output. |
| `EMPTY_PAYLOAD`                                            | error    | Decoded payload is empty / not an object.                         |
| `ID_REQUIRED` / `ID_INVALID` / `ID_PATTERN`                | error    | `id` is missing, empty, or fails the slug regex.                  |
| `NAME_REQUIRED` / `NAME_INVALID`                           | error    | `name` is missing or empty.                                       |
| `VERSION_REQUIRED` / `VERSION_INVALID` / `VERSION_PATTERN` | error    | `version` is missing or not semver.                               |
| `AGENT_REQUIRED`                                           | error    | `agent` block missing or not an object.                           |
| `MAX_STEPS_RANGE`                                          | error    | `agent.max_steps` is out of `[1, 100]`.                           |
| `TOOLS_NOT_LIST`                                           | error    | `tools` is not a list.                                            |
| `TOOL_CLASS_REQUIRED`                                      | error    | A tool entry is missing `tool_class`.                             |
| `TOOL_CLASS_DUPLICATE`                                     | error    | Same `tool_class` appears more than once.                         |
| `TOOL_ENABLED_REQUIRED`                                    | error    | A tool entry is missing boolean `enabled`.                        |
| `OPERATIONS_NOT_LIST`                                      | error    | A tool's `operations` is not a list.                              |
| `OPERATION_NOT_OBJECT`                                     | error    | An operation entry is not an object.                              |
| `OPERATION_NAME_REQUIRED`                                  | error    | An operation entry is missing `name`.                             |
| `AUTO_APPROVE_TYPE`                                        | error    | `auto_approve` is not boolean.                                    |
| `OPERATION_ENABLED_TYPE`                                   | error    | `enabled` is not boolean.                                         |
| `REQUIRED_PLUGINS_NOT_LIST` / `REQUIRED_PLUGINS_INVALID`   | error    | `required_plugins` is malformed.                                  |
| `METADATA_NOT_OBJECT`                                      | error    | `metadata` is not an object.                                      |
| `METADATA_ICON_TYPE`                                       | error    | `metadata.icon` is not a string.                                  |
| `UNKNOWN_TOP_LEVEL_KEY`                                    | error    | Top-level field is not in the allowed list.                       |
| `UNKNOWN_AGENT_KEY`                                        | error    | `agent.*` field is not in the allowed list.                       |
| `UNKNOWN_METADATA_KEY`                                     | error    | `metadata.*` field is not in the allowed list.                    |
| `SYSTEM_PROMPT_MISSING`                                    | warning  | `agent.system_prompt` is empty.                                   |
| `OPERATION_UNKNOWN`                                        | warning  | An operation name is not declared by the tool.                    |
| `METADATA_CATEGORY_UNKNOWN`                                | warning  | `metadata.category` is not in the known enum.                     |
| `PLUGIN_MISSING`                                           | warning  | A `required_plugins` slug is not loaded. (Importer)               |
| `TOOL_PLUGIN_MISSING`                                      | warning  | A `tool_class` is not currently registered. (Importer)            |
| `TOOL_NEEDS_CONFIGURATION`                                 | warning  | Tool will be enabled but missing required settings. (Importer)    |
