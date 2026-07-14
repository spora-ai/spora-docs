---
title: Plugin author guide — Agent templates
description: Ship agent templates with your plugin. Documents the agentTemplatePaths() hook, the JSON/YAML schema, the warning-code surface, and the relationship between activation, auto-approve, and settings.
---

# Agent templates

Agent templates are reusable agent definitions that bundle name, system prompt, max steps, tool activations, and per-operation auto-approve defaults. They live as `.json` / `.yaml` / `.yml` files alongside your plugin's source and are surfaced to operators as a gallery in the admin UI.

**What travels in a template:** activation (`enabled`) and per-operation `auto_approve`. **What does NOT travel:** tool settings, including passwords and API keys. Recipients must configure those in **Settings → Tools** after importing — the template UI surfaces this prominently before download.

## Directory layout

```text
your-plugin/
├── plugin.json
└── agent-templates/
    └── research-assistant.json
```

## Declaring the path

Override `agentTemplatePaths()` on your plugin entry point:

```php
final class YourPlugin extends AbstractPlugin
{
    public function agentTemplatePaths(): array
    {
        // Paths may point to directories (scanned depth-0) or individual files.
        return [__DIR__ . '/../agent-templates'];
    }
}
```

The scanner aggregates your paths alongside the framework's `agent-templates/` directory and any paths contributed by the project App. Templates are deduped by `id`.

## JSON / YAML schema

The full schema lives at [`https://spora.dev/agent-template.schema.json`](https://spora.dev/agent-template.schema.json). A minimal example:

```json
{
  "$schema": "https://spora.dev/agent-template.schema.json",
  "id": "web-search/research-assistant",
  "name": "Research Assistant",
  "description": "Looks things up on the web and reports back.",
  "version": "1.0.0",
  "agent": {
    "description": "Default research workflow.",
    "system_prompt": "You are a research assistant. Cite your sources.",
    "max_steps": 12,
    "allow_continuation": true,
    "retry_after_minutes": 5,
    "max_retries": 2
  },
  "tools": [
    {
      "tool_class": "Spora\\Tools\\CalculatorTool",
      "enabled": true,
      "operations": [{ "name": "calculate", "enabled": true, "auto_approve": true }]
    },
    {
      "tool_class": "Spora\\Plugins\\WebSearch\\Tools\\SearchTool",
      "enabled": true,
      "operations": [
        { "name": "search", "enabled": true, "auto_approve": false },
        { "name": "fetch", "enabled": true, "auto_approve": false }
      ]
    }
  ],
  "required_plugins": ["web-search"],
  "metadata": {
    "category": "research",
    "icon": "globe"
  }
}
```

> **Namespace prefix required.** Plugin templates must declare an `id` of the form `<plugin-slug>/<slug>` — e.g. `"id": "web-search/research-assistant"` for a plugin whose slug is `web-search`. Bare slugs (no `/`) are reserved for user-exported uploads and trigger a `NAMESPACE_MISMATCH` warning at scan time. See [Agent template schema → `id`](/reference/agent-template-schema) for the exact regex.

YAML is accepted for third-party plugins. The framework itself ships JSON so diffs stay clean.

## Operator experience

1. Operator opens the agent gallery in the admin UI and picks your template.
2. The validator surfaces any non-fatal warnings:
   - `PLUGIN_MISSING` — a slug in `required_plugins` is not installed.
   - `TOOL_PLUGIN_MISSING` — a `tool_class` is not currently registered.
   - `TOOL_NEEDS_CONFIGURATION` — a tool will be enabled but missing required settings.
   - `OPERATION_UNKNOWN` — an operation name is not declared by the tool's `#[ToolOperation]` set.
3. The operator can **Import anyway** — disabled/missing tools are silently skipped; warnings stay attached to the new agent for follow-up.
4. After import, the operator configures API keys in Settings → Tools.

## Warning codes

| Code                        | Severity | Meaning                                                          |
| --------------------------- | -------- | ---------------------------------------------------------------- |
| `PLUGIN_MISSING`            | warning  | A `required_plugins` slug is not loaded.                         |
| `TOOL_PLUGIN_MISSING`       | warning  | A `tool_class` is not currently registered. Skipped silently.    |
| `TOOL_NEEDS_CONFIGURATION`  | warning  | The tool will be enabled but is missing required settings.       |
| `OPERATION_UNKNOWN`         | warning  | An operation name is not declared by the tool. Skipped silently. |
| `SYSTEM_PROMPT_MISSING`     | warning  | The template did not declare a `system_prompt`.                  |
| `METADATA_CATEGORY_UNKNOWN` | warning  | `metadata.category` is not in the known enum.                    |

None of these abort the import. The importer collects them all and returns them in `ImportResult.warnings[]`.

## Auto-install policy

Plugins are **never** auto-installed by the template importer. `required_plugins` is advisory only — operators must visit the Plugins page to install missing plugins manually. This is a deliberate safety choice: a downloaded template cannot silently add code to the host application.

## Round-trip example

1. Operator configures an agent in the UI, sets `auto_approve: false` on a few `save` operations.
2. Clicks **Export** on the agent toolbar → downloads `{template-id}.json`.
3. Shares the file. The recipient clicks **Import template** on their dashboard, picks the file.
4. The validator reports no warnings (all plugins installed) or lists missing-plugin warnings.
5. Recipient clicks **Import anyway**; the agent is created with the same activation + auto-approve configuration.
