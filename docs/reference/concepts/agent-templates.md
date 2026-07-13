---
title: Agent templates
description: How Spora's Agent Template system lets operators ship reusable Agent definitions and lets users create Agents from them.
---

# Agent templates

An **Agent template** is a JSON or YAML file that bundles an Agent's identity, system prompt, tool activations, and per-operation auto-approve defaults. Templates are the canonical way to share Agents across environments and to ship curated "starter" Agents in plugins.

**What travels in a template:**

- Agent identity: name, description, system prompt, max steps, allow continuation, retry config.
- Tool activations: per-tool `enabled` flag.
- Per-operation `auto_approve` flag (mapped from the agent's `agent_tool_operation_overrides` row).

**What does NOT travel:** ToolSettings — including passwords, API keys, and other secrets. The export endpoint never reads `tool_configurations` or `agent_tool_overrides`; recipients must configure those in **Settings → Tools** after import.

## Discovery

Templates are discovered from three sources, scanned in priority order:

1. The project-level `<base>/agent-templates/` directory (if it exists).
2. The framework's bundled `<spora-core>/agent-templates/` directory (currently `core-assistant.json`).
3. Every directory returned by any loaded plugin's `agentTemplatePaths()` hook.

Operators can ship templates with a plugin by overriding the hook:

```php
public function agentTemplatePaths(): array
{
    return [__DIR__ . '/../agent-templates'];
}
```

The scanner walks each directory depth-0, parses `.json` / `.yaml` / `.yml` files, and validates each via `AgentTemplateValidator`. Parse or validation failures surface as **warnings** on the AgentTemplate — they are never silently dropped.

## HTTP surface

| Method  | Path                                | Purpose                                       |
| ------- | ----------------------------------- | --------------------------------------------- |
| `GET`   | `/api/v1/agent-templates`           | List built-in + plugin templates              |
| `GET`   | `/api/v1/agent-templates/{id}`      | Get one template (full payload + warnings)    |
| `POST`  | `/api/v1/agent-templates/validate`  | Dry-run validation of a raw payload           |
| `POST`  | `/api/v1/agent-templates/import`    | Create an Agent from a payload                |
| `GET`   | `/api/v1/agents/{id}/export`        | Export an Agent as a template JSON            |

The export endpoint always returns an `inline_warning` field reminding the caller that passwords and API keys are not included.

## Importer semantics

`AgentTemplateImporter` applies a template in a single transaction:

1. Insert the Agent row mirroring the template's `agent` block. Map `allow_continuation` → DB `allow_followup`.
2. For each tool entry:
   - **Tool class not registered** (plugin missing) → emit `TOOL_PLUGIN_MISSING` warning + skip.
   - **Tool registered but missing global config** → still insert the row + emit `TOOL_NEEDS_CONFIGURATION`.
   - **Tool disabled** → no row inserted.
3. For each operation on each tool: upsert `agent_tool_operation_overrides` (`auto_approve:true` → `default_requires_approval:0`). Preserve three-state `null` semantics.
4. Set `agents.recipe_id = $template->id` for traceability.

Plugins are **never** auto-installed. A slug in `required_plugins` that is not loaded produces a `PLUGIN_MISSING` warning but does not abort the import.

## Round-trip example

1. Operator configures an Agent in the UI, toggles `auto_approve: false` on a few `save` operations.
2. Clicks **Export** on the agent toolbar → downloads `{template-id}.json`.
3. Shares the file. Recipient clicks **Import template** on their dashboard, picks the file.
4. The validator reports no warnings (all plugins installed) or lists missing-plugin warnings.
5. Recipient clicks **Import anyway**; the Agent is created with the same activation + auto-approve configuration.

## Schema

The full JSON Schema is published at:

- [`https://spora.dev/agent-template.schema.json`](https://spora.dev/agent-template.schema.json) (mirrored in `spora-core/agent-template.schema.json`)

See [Agent template schema reference](/reference/agent-template-schema) for the field table and examples.