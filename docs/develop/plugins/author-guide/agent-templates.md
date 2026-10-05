---
title: Plugin author guide — Agent templates
description: Ship agent templates with your plugin. Documents the agentTemplatePaths() hook, the JSON/YAML schema, the warning-code surface, and the relationship between activation, auto-approve, and settings.
---

# Agent templates

Agent templates are reusable agent definitions that bundle name, system prompt, max steps, tool activations, and per-operation auto-approve defaults. They live as `.json` / `.yaml` / `.yml` files alongside your plugin's source and are surfaced to operators as a gallery in the admin UI.

**What travels in a template:** activation (`enabled`), per-operation `auto_approve`, and — when the operator ticks "Include settings (no secrets)" at export time — per-tool non-secret settings. **What does NOT travel:** secret settings (anything declared with `#[ToolSetting(type: 'password')]`). Recipients must configure secrets in **Settings → Tools** after importing — the template UI surfaces this prominently before download.

> **Operator-upload shape.** This page documents the operator-upload shape consumed by `POST /api/v1/agent-templates/import` and the bundled templates. The LLM-facing `create_agent` tool uses a **slim** subset (top-level `name` / `description` / `system_prompt` / `max_steps` / `allow_followup` / `retry_after_minutes` / `max_retries`) — see [Concepts → Tool system → Slim two-phase agent creation](/reference/concepts/tools#slim-two-phase-agent-creation). `tools[]` is optional on both surfaces; on the operator-upload path an empty / missing `tools[]` produces an agent with no tool activations, and the operator adds them through the agent edit form.

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
        // Directories, scanned depth-0 for .json / .yaml / .yml.
        // A path that is not a directory is skipped.
        return [__DIR__ . '/../agent-templates'];
    }
}
```

The scanner aggregates your paths alongside the project's own `agent-templates/` directory, the framework's, and any paths contributed by the project App. Your paths are labelled with your plugin slug, and so are theirs — `project`, `core`, `app` — which is what the gallery groups on and what your ids are checked against. The result is a **flat list with no dedupe** — nothing is keyed, merged, or sorted by `id`, so two directories shipping the same `id` both appear, and the by-id lookups (`GET /api/v1/agent-templates/{id}` and the built-in import path) both return the **first** match. See [Concepts → Agent templates](/reference/concepts/agent-templates) for the full resolution order.

## JSON / YAML schema

The full schema lives at [`https://docs.spora-ai.com/schemas/agent-template.schema.json`](https://docs.spora-ai.com/schemas/agent-template.schema.json). A minimal example:

```json
{
  "$schema": "https://docs.spora-ai.com/schemas/agent-template.schema.json",
  "id": "serper/research-assistant",
  "name": "Research Assistant",
  "description": "Looks things up on the web and reports back.",
  "version": "1.0.0",
  "agent": {
    "description": "Default research workflow.",
    "system_prompt": "You are a research assistant. Cite your sources.",
    "max_steps": 12,
    "allow_followup": true,
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
      "tool_class": "Spora\\Plugins\\Serper\\Tools\\SerperSearchTool",
      "enabled": true,
      "operations": [
        { "name": "search", "enabled": true, "auto_approve": false },
        { "name": "news_search", "enabled": true, "auto_approve": false }
      ]
    }
  ],
  "required_plugins": ["spora-ai/spora-plugin-serper"],
  "metadata": {
    "category": "research",
    "icon": "globe"
  }
}
```

> **Namespace prefix checked at scan time.** Prefix your `id` with **your own plugin slug** — the `slug` field in your `plugin.json`, the same string the gallery names your group after. `PluginLoader::agentTemplatePaths()` labels every path you return with that slug, and the scanner checks your `id` against it, so `"id": "serper/research-assistant"` is clean. Two things worth knowing:
>
> - It is a **warning, not a rejection.** A mismatch raises `NAMESPACE_MISMATCH`; the template still loads, still appears in the gallery, and still imports. It just carries a flag, and the flag does not reach the operator's import dialog (see [Operator experience](#operator-experience)).
> - The sources `core` and `uploaded` are **exempt** — the framework's own bundled templates and operator uploads, neither of which competes with a plugin for the same id. Uploads skip the check entirely anyway: the import endpoint builds the template straight from the raw payload, so a bare slug is fine there.
>
> Because the label travels with your paths rather than being read off the directory name, keeping the directory called `agent-templates/` is fine and does not affect your ids. See [Agent template schema → `id`](/reference/agent-template-schema) for the exact regex.
>
> Three plugins currently ship a bare id and so do warn on every scan — `typst-expert` in spora-plugin-typst, `image-agent` in spora-plugin-openai-image, `media-agent` in spora-plugin-minimax. Renaming them to `typst/typst-expert`, `openai-image/image-agent` and `minimax/media-agent` is the fix, and it lives in the plugin's own repo.

YAML is accepted for third-party plugins. The framework itself ships JSON so diffs stay clean.

`required_plugins` takes **Composer `vendor/name` package strings** — the `name` field of your plugin's `composer.json`, e.g. `spora-ai/spora-plugin-serper` — not the plugin's directory slug. A bare slug like `serper` is a hard `REQUIRED_PLUGINS_INVALID` **error** and the import endpoint answers 422. The importer resolves each entry back to an installed plugin through `PluginLoader::getSlugForPackageName()`.

## Operator experience

1. Operator opens the agent gallery in the admin UI and picks your template.
2. A dry-run validation pass surfaces the payload's own non-fatal warnings — `OPERATION_UNKNOWN`, `SYSTEM_PROMPT_MISSING`, `METADATA_CATEGORY_UNKNOWN`. `NAMESPACE_MISMATCH` is a **scan-time** warning and does not reach that step: the dialog re-validates the raw payload and discards the warnings the scan attached. It does light up the amber triangle on your template's gallery card.
3. The operator can **Import anyway** — disabled/missing tools are silently skipped; the remaining warnings are reported once the agent exists.
4. After import, the operator configures API keys in Settings → Tools.

## Warning codes

The codes are split by **when they become knowable**, because an author only ever sees the first group on their own file:

| Code                        | Raised by  | Meaning                                                                                                  |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `SYSTEM_PROMPT_MISSING`     | validation | The template did not declare a `system_prompt`.                                                          |
| `OPERATION_UNKNOWN`         | validation | An operation name is not declared by the tool. Skipped silently.                                         |
| `METADATA_CATEGORY_UNKNOWN` | validation | `metadata.category` is not in the known enum.                                                            |
| `NAMESPACE_MISMATCH`        | scanner    | `id` does not start with the root's `source` label — your plugin slug. `core` and `uploaded` are exempt. |

These four are what `POST /api/v1/agent-templates/validate` returns, and the four more below only surface once an import actually runs, because they depend on what is installed on the recipient's instance:

| Code                       | Raised by | Meaning                                                          |
| -------------------------- | --------- | ---------------------------------------------------------------- |
| `PLUGIN_MISSING`           | importer  | A `required_plugins` package is not loaded.                      |
| `TOOL_PLUGIN_MISSING`      | importer  | A `tool_class` is not currently registered. Skipped silently.    |
| `TOOL_NEEDS_CONFIGURATION` | importer  | The tool will be enabled but is missing required settings.       |
| `PICTURE_METADATA_INVALID` | importer  | `metadata.archetype` / `variant_key` / `palette_key` is unknown. |

All eight are severity `warning`: none aborts the import. The importer collects them and returns them in `ImportResult.warnings[]`. Codes of severity `error` do reject the payload — see [Concepts → Agent templates → Validation codes](/reference/concepts/agent-templates#validation-codes) for the full list.

## Auto-install policy

Plugins are **never** auto-installed by the template importer. `required_plugins` is advisory only — operators must visit the Plugins page to install missing plugins manually. This is a deliberate safety choice: a downloaded template cannot silently add code to the host application.

## Round-trip example

1. Operator configures an agent in the UI, sets `auto_approve: false` on a few `save` operations.
2. Clicks **Export** on the agent toolbar → downloads `{template-id}.json`.
3. Shares the file. The recipient clicks **Import template** on their dashboard, picks the file.
4. The dry-run pass reports no warnings (all plugins installed) or lists the payload's own warnings. Missing plugins are not knowable yet — they surface on the toast after the import.
5. Recipient clicks **Import anyway**; the agent is created with the same activation + auto-approve configuration.
