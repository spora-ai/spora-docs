---
title: Plugin author guide — Recipes (WIP)
description: The recipes API surface (WIP — not yet shipped). Documents the recipePaths() hook, the planned YAML schema, and the open work items.
---

# Recipes (WIP — not yet shipped)

> **Status: WIP** — the recipe system is scaffolded but not shipped in this release. The hook (`PluginInterface::recipePaths()`) is declared, `RecipeScanner` exists, `RecipeController` and `GET /api/v1/recipes` are wired, and `agents.recipe_id` is in the schema — but **no recipes are bundled with Spora** (the framework's `recipes/` directory is empty), the agent create/edit UI does not yet wire up the `recipe_id` field, and no recipe picker drives the run flow yet. Treat this section as forward-looking API surface, not a usable feature. See [Roadmap → Medium](/about/roadmap) for the open work items.

Recipes bundle a system prompt + tool allowlist + LLM config into a one-click agent template. They would live under `recipes/` in your plugin and be returned from the entry-point's `recipePaths()` hook.

## Directory layout

```text
recipes/
└── default.yaml
```

## Example

```yaml
id: acme_search
name: Acme Web Search Agent
description: An agent that researches topics using the Acme Search API.
system_prompt: |
  You are a research assistant. Use the web_search tool when the user asks
  for current information, and cite your sources in the final answer.
tools:
  - acme-search:web_search
llm:
  driver: anthropic
  model: claude-opus-4-7
  temperature: 0.3
```

The full YAML schema (tool format, LLM driver override, max iterations, scheduled-run fields) would be documented in [Concepts → Architecture](/reference/concepts/architecture) once the recipe system lands. What is plugin-specific is the path declaration:

```php
public function recipePaths(): array
{
    return [
        __DIR__ . '/../recipes',
    ];
}
```

Once shipped, recipes would be picked up by `RecipeScanner` alongside the host Spora's `recipes/` directory; plugin recipes would be first-class and indistinguishable from operator-defined ones at runtime.

## What this page will look like once recipes ship

When the feature lands, this chapter will move from "forward-looking API surface" to "the canonical guide". The WIP callout at the top of this page will be removed, the YAML schema will be promoted to a stable reference, and the open work items will move to the changelog.

Until then, treat any code in this chapter as a contract that the framework is _committed to_ but has not yet _exposed to operators_ — installing a plugin that returns paths from `recipePaths()` is safe, but no operator-facing UI consumes the result.
