---
title: Managing agents
description: Create, edit, and configure agents — system prompt, LLM config, tool allowlist.
---

# Managing agents

An **agent** is the thing you chat with. It has a system prompt, an LLM config (which model to use), and a tool allowlist (which tools it can call). This page covers how to manage agents in the admin UI.

For the underlying architecture (what an agent IS in the codebase), see [Concepts → Architecture](/reference/concepts/architecture).

## List view

**Agents → List** (the home page after sign-in) shows every agent in the system. Click an agent to open the edit view.

### Dashboard sections

The list is grouped into sections so the operator can scan recent activity at a glance:

- **Pinned** — agents you pinned to the top. Always visible at the top of the list.
- **Today** — agents whose most recent task (or, if no task yet, creation date) is today.
- **This Week** — agents with recent activity in the last 7 days.
- **Older** — agents with no activity for more than a week.
- **Archived** — agents you archived. Visible when the **Archived** filter chip is active.

Sections with no agents are hidden — the list never shows a "Today — 0 agents" heading. The **Pinned** and **Archived** sections themselves only appear once at least one agent carries the corresponding flag.

### Filter chips and sort

Beneath the KPI strip, a row of filter chips narrows what you see:

- **All** — default; shows every section.
- **Pinned** — shows only the Pinned section.
- **Archived** — shows only the Archived section.

The **Pinned** and **Archived** chips also only appear once at least one loaded agent carries the flag.

Use the sort dropdown (top right) to order the visible agents:

- **Last activity** (default) — most recently used first; preserves the section grouping above.
- **Name** — alphabetical. The sections collapse into a single sorted list titled "All agents — sorted by Name".
- **Recently created** — newest agents first; same single-grid behaviour.
- **Task count** — most-run agents first; same single-grid behaviour.

Switching to **Pinned** or **Archived** while a non-activity sort is active restores the sectioned view, so pinned agents stay grouped at the top.

### KPI strip

A row of cards above the list summarises fleet activity:

- **Agents** — total agent count.
- **Running** — tasks in flight. Shows a pulse indicator when count > 0.
- **Awaiting input** — tasks waiting for your approval. Shows a pulse indicator when count > 0.
- **Scheduled today** — agents scheduled to fire today. Shows a pulse indicator when count > 0.

Pulse indicators only appear when the count is non-zero — a card with no activity of that type shows just the number, with no badge.

### Layout

The dashboard's content sits in a centered, max-width container so the agent cards stay readable on wide monitors. The chrome (navbar, footer) is still flush to the viewport.

## Create a new agent

**Agents → New** opens a form with four tabs:

### Tab 1 — Identity

- **Name** — display name (e.g. "Research Assistant")
- **Description** (optional) — short summary of what the agent does. Shown in the agent list and used in some tool UIs.
- **Enabled** — toggle to disable the agent without deleting it
- **Max steps** — the max number of LLM turns per task. Default 10. Higher = longer reasoning chains; lower = bounded cost.
- **Allow followup** — whether the agent can be re-engaged in the same task (continues the conversation thread) or each message creates a new task.

### Tab 2 — System prompt

The system prompt is the instruction to the LLM. It's prepended to every LLM call. Be specific:

```text
You are a research assistant. Use the tavily_search tool for any factual
question about the current state of the world. Cite your sources in the
final answer as numbered footnotes. Be concise — 2-3 paragraphs max.
If you don't know the answer, say so.
```

Tips:

- **Be specific** — "be helpful" is vague; "answer in 2-3 paragraphs, cite sources" is actionable
- **Define tone** — "formal", "casual", "academic", "executive summary"
- **Bound the response** — "max 3 paragraphs", "1 sentence per point"
- **Define the tool usage** — "use tavily_search for any current-events question", "use the calculator for any math"
- **Avoid roleplay** — "you are an expert in X" is fine; "pretend you are a pirate" is not (LLMs are easily jailbroken by it)

The system prompt supports Markdown. It also supports a few template variables (filled at task creation time):

- `{{user_name}}` — the user's name
- `{{user_email}}` — the user's email
- `{{date}}` — current date (ISO 8601)
- `{{time}}` — current time (HH:MM)

### Tab 3 — LLM config

Pick which LLM config the agent uses. You can:

- **Use a global default** — the agent inherits whichever LLM is marked `is_default = true` in **Settings → LLM drivers**
- **Override per agent** — pick a specific config from the dropdown

For details on creating LLM configs, see **Settings → LLM drivers** (or, programmatically, [Concepts → LLM drivers](/reference/concepts/drivers)).

### Tab 4 — Tools

The tool allowlist. Every tool in the system is listed; check the ones you want the agent to call.

For a new agent, **start with no tools**. Add tools one at a time to see how each changes the agent's behaviour. Common starting set:

- `web_search` (Tavily) — for current-events questions
- `calculator` (built-in) — for math
- `email` (plugin) — for sending mail
- `calendar` (plugin) — for calendar ops

Each tool has operator-configurable settings (API keys, hostnames). Configure these under **Settings → Tools** before enabling the tool on an agent.

## Recipes _(WIP — not yet shipped)_

> **Status: WIP** — recipes are not yet shipped in this release. The recipe scaffolding exists in the codebase (`RecipeScanner`, `RecipeController`, `agents.recipe_id`, `PluginInterface::recipePaths()`), but the system is **not usable**: `recipes/` is empty, the agent create/edit UI does not yet wire up the `recipe_id` field, and no recipe picker drives the run flow yet. See [Roadmap → Medium](/about/roadmap) for the open work items.

A **recipe** is a YAML file that bundles a system prompt + tool allowlist + LLM config into a one-click template. Recipes would live in `recipes/` (operator-authored) or in a plugin's `recipes/` (plugin-supplied). The intended behaviour once shipped:

- **Agent → Recipe** dropdown lets you pick a recipe. The recipe's settings (system prompt, LLM, tools) are loaded into the form. You can then tweak the agent without losing the recipe as a starting point.
- A recipe is **not** a snapshot — once an agent is built from a recipe, edits to the recipe don't propagate. The agent is a copy.

For details on the recipe format (when it's documented), see [Concepts → Architecture](/reference/concepts/architecture).

## Edit vs disable

- **Edit** — change config, save. The agent picks up the new config on its next task.
- **Disable** — toggle `enabled = false` in the Identity tab. The agent won't appear in the UI's chat list. Existing tasks complete normally.
- **Pin / Unpin** — pin keeps the agent anchored at the top of the list. Useful for agents you reach for daily.
- **Archive / Unarchive** — archive hides the agent from the default view while keeping the row and its task history. Use archive instead of delete when the agent has historical tasks you may want to consult later; unarchive to bring it back.

Disable (don't delete) when:

- The agent is being replaced
- The agent has historical tasks you want to keep
- You're temporarily taking the agent offline for debugging

Delete only when:

- The agent is brand new and never used
- You're sure the historical tasks aren't needed

> Pin and archive are independent of `enabled`: a pinned-and-archived agent still floats to the top when the Archived filter is on, and an unarchived agent with `enabled = false` still surfaces in the default list (greyed out) but does not respond to new messages. To take an agent fully offline, disable it; archive is for decluttering, not for stopping it.

## Recipes and the plugin system _(WIP — not yet shipped)_

> **Status: WIP** — see the note at the top of [Recipes](#recipes-wip--not-yet-shipped). The plugin → recipe pipeline is scaffolded but not yet shipping.

Plugins would ship their own recipes. When a plugin is installed, its `recipes/` directory would be scanned and the recipes would appear in the agent's Recipe dropdown.

For example, the `spora-plugin-email` plugin might ship an "Email Assistant" recipe that bundles a system prompt + the `email` tool. Installing the plugin makes the recipe available in every agent's create form.

## Approval and tool permissions

Whether a tool call requires human approval is **per-operation and per-agent**, not a single global default. The tool author sets the operation's default via the `#[ToolOperation(requiresApprovalByDefault:)]` attribute; the operator can override that per-agent via the `agent_tool_operation_overrides.default_requires_approval` column (a nullable three-state — `1` = always require, `0` = never require, `null` = use the operation's class default). Read-only / generative operations typically default to `false` (no approval); side-effecting operations (send email, write file, call external API) typically default to `true` (require approval).

When approval IS required, the agent's response pauses with an **Approve / Reject** button for each tool call. The chat shows the tool call with the proposed arguments, **Approve**, **Reject**, and a comment field. Clicking Approve resumes the task; Reject halts it.

You can change an operation's default in **Settings → Tools → [tool] → Require approval by default**, and the per-agent override in the agent's edit form under **Tools → [operation] → Approval**.

## What's next

- [First conversation](/start/end-users/first-conversation) — sign in and chat
- [Troubleshooting](/start/end-users/troubleshooting) — when an agent gets stuck
- [Operators → Operations](/start/operators/operations) — plugin management, the operator side
