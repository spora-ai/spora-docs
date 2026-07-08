---
title: Managing agents
description: Create, edit, and configure agents — system prompt, LLM config, tool allowlist, recipes.
---

# Managing agents

An **agent** is the thing you chat with. It has a system prompt, an LLM config (which model to use), a tool allowlist (which tools it can call), and optionally a recipe (a template the agent is built from). This page covers how to manage agents in the admin UI.

For the underlying architecture (what an agent IS in the codebase), see [Concepts → Architecture](/concepts/architecture).

## List view

**Agents → List** shows every agent in the system, with:

- **Name** — display name
- **Driver / model** — which LLM config the agent is using
- **Tools** — number of tools enabled
- **Recipe** — which recipe the agent is built from (if any)
- **Last used** — when the agent last received a message
- **Status** — enabled / disabled

Click an agent to open the edit view.

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

For details on creating LLM configs, see **Settings → LLM drivers** (or, programmatically, [Concepts → LLM drivers](/concepts/drivers)).

### Tab 4 — Tools

The tool allowlist. Every tool in the system is listed; check the ones you want the agent to call.

For a new agent, **start with no tools**. Add tools one at a time to see how each changes the agent's behaviour. Common starting set:

- `web_search` (Tavily) — for current-events questions
- `calculator` (built-in) — for math
- `email` (plugin) — for sending mail
- `calendar` (plugin) — for calendar ops

Each tool has operator-configurable settings (API keys, hostnames). Configure these under **Settings → Tools** before enabling the tool on an agent.

## Recipes

A **recipe** is a YAML file that bundles a system prompt + tool allowlist + LLM config into a one-click template. Recipes live in `recipes/` (operator-authored) or in a plugin's `recipes/` (plugin-supplied).

**Agent → Recipe** dropdown lets you pick a recipe. The recipe's settings (system prompt, LLM, tools) are loaded into the form. You can then tweak the agent without losing the recipe as a starting point.

A recipe is **not** a snapshot — once an agent is built from a recipe, edits to the recipe don't propagate. The agent is a copy.

For details on the recipe format, see [Concepts → Architecture → Recipes](/concepts/architecture).

## Edit vs disable

- **Edit** — change config, save. The agent picks up the new config on its next task.
- **Disable** — toggle `enabled = false` in the Identity tab. The agent won't appear in the UI's chat list. Existing tasks complete normally.

Disable (don't delete) when:

- The agent is being replaced
- The agent has historical tasks you want to keep
- You're temporarily taking the agent offline for debugging

Delete only when:

- The agent is brand new and never used
- You're sure the historical tasks aren't needed

## Recipes and the plugin system

Plugins can ship their own recipes. When a plugin is installed, its `recipes/` directory is scanned and the recipes appear in the agent's Recipe dropdown.

For example, the `spora-plugin-email` plugin might ship an "Email Assistant" recipe that bundles a system prompt + the `email` tool. Installing the plugin makes the recipe available in every agent's create form.

## Approval and tool permissions

By default, every tool call requires **explicit human approval** in the admin UI. The agent's response pauses with a "Approve / Reject" button for each tool call.

You can change per-tool default behavior in **Settings → Tools → [tool] → Require approval by default**. The agent can also override per-operation via `requiresApprovalByDefault` in the `#[ToolOperation]` attribute (the tool author controls this).

When the agent is awaiting approval, the chat shows the tool call with **Approve**, **Reject**, and a comment field. Clicking Approve resumes the task; Reject halts it.

## Auditing

Every agent action is recorded in the database. For an audit trail of a specific agent:

- **Tools → Audit log** (if enabled) — every tool call with timestamp, arguments, result, approval status
- **Tasks → [task]** — the full conversation history (user message, LLM responses, tool calls)

These are admin-only views; non-admin users see only their own task history.

## What's next

- [First conversation](/start/end-users/first-conversation) — sign in and chat
- [Troubleshooting](/start/end-users/troubleshooting) — when an agent gets stuck
- [Operators → Operations](/start/operators/operations) — plugin management, the operator side
