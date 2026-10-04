---
title: Agent templates
description: How Spora's Agent Template system lets operators ship reusable Agent definitions and lets users create Agents from them.
---

# Agent templates

An **Agent template** is a JSON or YAML file that bundles an Agent's identity, system prompt, tool activations, and per-operation auto-approve defaults. Templates are the canonical way to share Agents across environments and to ship curated "starter" Agents in plugins.

**What travels in a template:**

- Agent identity: name, description, system prompt, operator-facing `notes`, max steps, allow followup, retry config.
- Tool activations: per-tool `enabled` flag.
- Per-operation `auto_approve` flag (mapped from the agent's `agent_tool_operation_overrides` row).
- Agent-specific, non-secret tool settings (e.g. the active skill allowlist) — **only when** the operator opts in via `?include_settings=1` on the export request. Secrets and inherited global/user values are never included.

## Discovery

Templates are discovered from four sources, concatenated in this order by the container binding for `AgentTemplateScanner` (`app/Core/OrchestratorContainerBindings.php`):

1. The project-level `<base>/agent-templates/` directory (only when it exists).
2. The framework's bundled `<spora-core>/agent-templates/` directory (currently `core-assistant.json`, id `core/core-assistant`).
3. Every directory returned by a loaded plugin's `agentTemplatePaths()` hook.
4. Every directory returned by the project App's (`app/App.php`) `agentTemplatePaths()` hook.

Plugins and Apps ship templates by overriding the hook:

```php
public function agentTemplatePaths(): array
{
    return [__DIR__ . '/../agent-templates'];
}
```

The scanner walks each directory depth-0, parses `.json` / `.yaml` / `.yml` files, and validates each via `AgentTemplateValidator`. Parse or validation failures surface as `PARSE_ERROR` / `VALIDATION_ERROR` entries on the AgentTemplate — they are never silently dropped.

> **Note:** `AgentTemplateScanner::scan()` returns a **flat list with no dedupe**. Two directories shipping the same template `id` both appear in `GET /api/v1/agent-templates`; the by-id endpoints (`GET /api/v1/agent-templates/{id}`, the built-in-template import path) resolve an id to the **first** match in the order above. What keeps two plugins from colliding is namespace enforcement, not dedupe: a template from a named source must declare an id prefixed with that source (`<plugin-slug>/<name>`), and a mismatch is reported as a `NAMESPACE_MISMATCH` warning. This differs from skills, where the scanner buckets by source and the first provider wins.

## HTTP surface

| Method | Path                               | Purpose                                    |
| ------ | ---------------------------------- | ------------------------------------------ |
| `GET`  | `/api/v1/agent-templates`          | List built-in + plugin templates           |
| `GET`  | `/api/v1/agent-templates/{id}`     | Get one template (full payload + warnings) |
| `POST` | `/api/v1/agent-templates/validate` | Dry-run validation of a raw payload        |
| `POST` | `/api/v1/agent-templates/import`   | Create an Agent from a payload             |
| `GET`  | `/api/v1/agents/{id}/export`       | Export an Agent as a template JSON         |

The export endpoint returns `inline_warning` on the default (no-settings) path and `inline_info` on the opt-in path. The opt-in path's `inline_info` banner lists which tools contributed settings and reminds the operator that passwords and inherited global/user values are still NOT included.

## Importer semantics

`AgentTemplateImporter` applies a template in a single transaction, then writes picture metadata after the commit:

1. **Resolve the owner principal.** `POST /api/v1/agent-templates/import` accepts a `principal_id` alongside the template body — it is API-level metadata, not part of the template schema, and is authorised the same way as direct agent creation (admin, or a principal the caller controls). With no `principal_id`, the importer materialises the caller's user-principal via `PrincipalService::ensureUserPrincipal()`, so an import succeeds on a fresh install whose seed step hasn't run yet. The Agent row is keyed on `principal_id`; there is no `recipe_id` column to stamp, because Agent templates are files on disk rather than database entities and have no canonical id to key on (migration `0055_drop_recipe_id_from_agents.php`).
2. **Insert the Agent row** mirroring the template's `agent` block: `name` (the template's `name`, falling back to its `id`), `description`, `system_prompt`, `notes`, `max_steps` (default 10), `allow_followup` (default true), `retry_after_minutes` and `max_retries` (default 0), and `is_active = 1`. Empty strings are normalised to `NULL`. Note that `notes` — the operator-facing markdown field the `AgentTool` `read_notes` / `write_notes` operations read — travels inside the template's `agent` block, capped at 200 000 characters by the schema.
3. **For each tool entry** in `tools[]` — skipped entirely when the payload has no `tools` block, which is the path the LLM-facing `create_agent` flow takes:
   - **Tool class not registered** (plugin missing) → emit `TOOL_PLUGIN_MISSING` warning + skip, no row.
   - **Tool disabled** → no row inserted, and none of its operations are applied.
   - **Tool enabled** → upsert `agent_tools`, then apply the entry's non-secret `settings` to `agent_tool_overrides` via the agent-override path (keys the tool doesn't declare, and `password`-typed keys, are skipped). If the resulting effective settings are still missing required keys, emit `TOOL_NEEDS_CONFIGURATION` — the row is inserted regardless.
4. **For each operation on each enabled tool:** upsert `agent_tool_operation_overrides`. `auto_approve: true` → `default_requires_approval = 0`; `auto_approve: false` → `1`. A key the template omits is left untouched, preserving the three-state `null` semantics. Operations the tool does not actually declare via `#[ToolOperation]` are silently skipped — they would be a no-op at runtime anyway.
5. **After commit, apply picture metadata:** `metadata.archetype`, `metadata.variant_key`, and `metadata.palette_key` are written to the new agent's `agent_pictures` row. An unknown archetype or palette surfaces as a `PICTURE_METADATA_INVALID` warning and the agent keeps its default picture, so the import still yields a usable agent.

Plugins are **never** auto-installed. An entry in `required_plugins` is a Composer `vendor/name` package string; the importer resolves it to the installed plugin's slug via `PluginLoader::getSlugForPackageName()`, and a package that no loaded plugin declares produces a `PLUGIN_MISSING` warning but does not abort the import.

## Round-trip example

1. Operator configures an Agent in the UI, toggles `auto_approve: false` on a few `save` operations.
2. Clicks **Export** on the agent toolbar → downloads `{template-id}.json`.
3. Shares the file. Recipient clicks **Import template** on their dashboard, picks the file.
4. The validator reports no warnings (all plugins installed) or lists missing-plugin warnings.
5. Recipient clicks **Import anyway**; the Agent is created with the same activation + auto-approve configuration.

## Schema

The full JSON Schema is published at:

- [`https://docs.spora-ai.com/schemas/agent-template.schema.json`](https://docs.spora-ai.com/schemas/agent-template.schema.json) (served from `docs/.vuepress/public/schemas/`; mirrored at build time from `spora-core/agent-template.schema.json`)

See [Agent template schema reference](/reference/agent-template-schema) for the field table and examples.
