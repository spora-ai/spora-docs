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
- **Favorites** — shows only agents you starred as favourites.
- **Archived** — shows only the Archived section.

To triage held conversations from the dashboard, **click the Aborted KPI tile** in the strip — that filters the agent list down to every agent with at least one task in `ABORTED` status. The tile is the wired shortcut; the filter chips are a narrower scope (status-independent).

The **Pinned**, **Favorites**, and **Archived** chips only appear once at least one loaded agent carries the flag.

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
- **Aborted** — tasks halted mid-loop that need a follow-up prompt to resume. Uses a static (non-pulsing) stone indicator so the dashboard does not falsely imply worker activity — the agent loop is paused waiting for you.
- **Scheduled today** — agents scheduled to fire today. Shows a pulse indicator when count > 0.

Pulse indicators only appear when the count is non-zero — a card with no activity of that type shows just the number, with no badge. The Aborted tile never pulses (no worker is driving those tasks) — the static stone chip is intentional, so a glance at the strip tells you what needs your attention vs. what's churning on its own.

### Layout

The dashboard's content sits in a centered, max-width container so the agent cards stay readable on wide monitors. The chrome (navbar, footer) is still flush to the viewport.

## Create a new agent

**Agents → New** opens a form with four tabs:

### Step 0 — Owner

(Shown only when the caller controls at least one group principal in addition to their own user-principal.) Pick **which principal owns the new agent**:

- **You** — the agent is owned by your user-principal (the default). Use this for personal agents.
- **\<Group name\>** — the agent is owned by the chosen group's group-principal. Use this for shared agents that everyone in the group should see.

The picker is the first step of the flow, not a tab — pick the owner, then the Identity / System prompt / LLM config / Tools tabs fill in below. The owner is the auth boundary: the agent inherits the chosen principal's tool settings, LLM configs, and membership visibility. An agent you own via a group is visible to every member of that group; an agent you own via your user-principal is visible only to you (and any admin).

The selected owner is also exposed as the **Owner badge** on the agent card: a small chip showing either your username or the group name, so you can tell which principal owns an agent at a glance.

Authorisation for cross-principal agent creation is enforced server-side via `AgentPrincipalService::callerControlsPrincipal()`. If you send `principal_id: <group>` but you don't control that group, the controller falls back to your own user-principal — no error is raised.

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

Above the list sits a toolbar with a search input (matches display name, internal name, description, and operation name), a four-way status segmented filter — **All / Enabled / Needs setup / Off** — and a category multi-select. The **Needs setup** bucket groups two shapes: tools that are already enabled but missing required settings (amber "Missing config" pill), and tools where the cascade (global → user → group) has no defaults — these show a single **Set up & enable** button that opens the configuration modal and auto-enables the tool once you save (no second click needed). When filters narrow the list, empty category groups drop out of the view; the footer reads `Showing N of M`.

For a new agent, **start with no tools**. Add tools one at a time to see how each changes the agent's behaviour. Common starting set:

- `web_search` (Tavily) — for current-events questions
- `calculator` (built-in) — for math
- `email` (plugin) — for sending mail
- `calendar` (plugin) — for calendar ops

Each tool has operator-configurable settings (API keys, hostnames). Configure these under **Settings → Tools** before enabling the tool on an agent.

Each tool tile in the picker shows an icon determined by the tool's `#[Tool]` attribute (or the owning plugin's `plugin.json` icon, or the default puzzle icon) — see the [`icon` field](/reference/api#agent-resource) on the Agent resource for the resolution chain.

## Agent templates

An **agent template** is a file — JSON or YAML — that bundles an agent's identity (name, description, system prompt, max steps, follow-up behaviour) with the tools it starts out with. Templates are how a working agent definition gets shared, and how plugins ship curated starter agents.

**Agents → New** opens a dialog that asks how you want to start. Three cards:

- **Blank agent** — start from a name and an optional system prompt. Tools are added in the next step.
- **From template** — browse the gallery, grouped by the template's `source` value. Each card shows the template's `id`, version, and how many tools it enables.
- **Upload template** — import a `.json` file someone exported from another Spora instance. The file is read in your browser, then sent to your own Spora instance for a dry-run validation pass before anything is written.

If you also control a group, the **Pick an owner** step runs after you choose a card — the same owner decision as the **Step 0 — Owner** step above.

The framework ships exactly one bundled template: **Spora Core Agent** (`core/core-assistant`), a general-purpose starter with the time and math tools. An empty gallery reads _"No templates available. Install a plugin or ship one with spora-core."_

### The warnings step

Picking a template — or uploading a file — opens a **Warnings** step listing anything the recipient has to sort out first. None of these block the import; the button reads **Import** when the list is empty and **Import anyway** when it is not.

This step is fed by one dry-run validation pass over the payload you are about to import, so it only ever shows the three codes the validator itself raises:

| Warning                     | What it means                                               |
| --------------------------- | ----------------------------------------------------------- |
| `OPERATION_UNKNOWN`         | An operation the template names does not exist on the tool. |
| `SYSTEM_PROMPT_MISSING`     | The template declares no system prompt.                     |
| `METADATA_CATEGORY_UNKNOWN` | The template's `metadata.category` is not a known category. |

A further three warnings are only knowable _after_ the import runs, so they never appear on this step. They reach you as a count on the toast that lands after the agent is created — `Agent #12 created (2 warnings)` — and the agent exists at that point:

| Warning                    | What it means                                                            |
| -------------------------- | ------------------------------------------------------------------------ |
| `PLUGIN_MISSING`           | A plugin the template expects is not installed.                          |
| `TOOL_PLUGIN_MISSING`      | A tool the template enables is not registered here. The tool is skipped. |
| `TOOL_NEEDS_CONFIGURATION` | The tool will be enabled but has no settings yet.                        |

An uploaded file that fails validation outright (a hard error rather than a warning) is rejected before you reach this step. A template picked from the gallery is not gated the same way — a hard error there still shows the Warnings step, and the import is then refused by the server.

> **Note:** two scan-time warnings never reach the Warnings step. `GET /api/v1/agent-templates/{id}` does return them alongside the template, but the dialog discards them and re-validates the raw payload instead — so a file that fails to parse, or an id that breaks the namespace rule, is not listed there. A `NAMESPACE_MISMATCH` does light up the amber warning triangle on the template's gallery card, though the number beside the triangle is the template's required-plugin count, not its warning count.
>
> **Note:** templates never carry secrets. A tool setting declared as a password is rejected at validation, and inherited global / user values are never written into an export. Recipients fill in their own keys under **Settings → Tools** after the import — a `TOOL_NEEDS_CONFIGURATION` warning is the prompt to do exactly that.
>
> **Note:** plugins are never installed for you. A template's `required_plugins` list is advisory; a missing plugin produces a warning, not an install.

### Templates are a starting point, not a link

An agent created from a template is an ordinary agent. Nothing on it records which template it came from, and editing the template file later does not reach agents built from it — there is no "revert to template" and no out-of-date badge. Treat the import as a one-time copy and edit the agent from there.

### Export an agent as a template

An existing agent's toolbar carries an **Export** button. The dialog asks what to include, then shows you the payload before anything downloads:

- **Without settings** — the agent definition, the enabled tools, and their operations. Best for sharing widely without exposing any configuration.
- **Include settings (no secrets)** — also adds agent-specific tool settings such as the active skill allowlist. API keys and inherited values are still **not** included.

The download lands as `{template-id}.json`, which is exactly the file the **Upload template** card expects.

For the file format, the field-by-field table, and the complete warning-code list, see [Concepts → Agent templates](/reference/concepts/agent-templates) and [Agent template schema](/reference/agent-template-schema).

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

## Agent templates and the plugin system

Plugins can ship their own agent templates. When a plugin is installed, every directory it returns from `agentTemplatePaths()` is scanned and its templates join the **From template** gallery — installing a plugin is what adds curated starter agents to your picker.

> **Known upstream defect:** the gallery does **not** group by plugin, and the bundled template is not grouped under **Core**, even though the UI is written as if it did. The group heading is the template's raw `source` value, and the backend derives `source` from the **name of the directory** the file lives in — not from the plugin slug. It only resolves to `core` when the filename without its extension is literally `core`, which the bundled `core-assistant.json` is not. Every hook today returns a directory named `agent-templates`, so on a real install the bundled template and every plugin template land in one single group headed `agent-templates`. Worth filing upstream.

The same defect is why id-namespacing does not work as intended. A scanned file's `id` has to be prefixed with its resolved `source` — the directory basename, not the plugin slug — so the rule the code actually enforces today is `agent-templates/<name>`. A plugin shipping `agent-templates/assistant.json` with the id `memories/assistant` gets a `NAMESPACE_MISMATCH` warning, and so does the bundled `core/core-assistant`. The check is skipped for the sources `core` and `uploaded`, and uploaded files never reach it at all because the import endpoint builds the template straight from the raw payload. `NAMESPACE_MISMATCH` is a warning, not a rejection: the template still appears in the gallery and still imports. The intended `<plugin-slug>/<name>` form is a documented-but-unimplemented convention.

Nothing is installed on your behalf. If a template lists a plugin you don't have, you get a `PLUGIN_MISSING` warning — reported on the post-import toast rather than the Warnings step — and the import proceeds with the rest. Install the plugin from **Plugins**, then re-import if you want its tools.

Authors: see [Develop → Plugin author guide → Agent templates](/develop/plugins/author-guide/agent-templates) for the `agentTemplatePaths()` hook, the schema, and the full warning table.

## Approval and tool permissions

Whether a tool call requires human approval is **per-operation and per-agent**, not a single global default. The tool author sets the operation's default via the `#[ToolOperation(requiresApprovalByDefault:)]` attribute; the operator can override that per-agent via the `agent_tool_operation_overrides.default_requires_approval` column (a nullable three-state — `1` = always require, `0` = never require, `null` = use the operation's class default). Read-only / generative operations typically default to `false` (no approval); side-effecting operations (send email, write file, call external API) typically default to `true` (require approval).

When approval is required, the task pauses on a sticky bar above the chat with one card per pending tool call. Each card shows the tool name and its proposed arguments (editable inline), and offers two buttons: **Approve** and **Reject**. Decisions are mutually exclusive — clicking Reject while Approved flips the card to Rejected and vice versa, and each rejected card reveals an optional **Reason** input that rides through verbatim on submit (empty defaults to `User rejected`).

When more than one tool is pending, a **✓ Approve all remaining** button appears in the bar's top row alongside the existing **✗ Reject All** shortcut; it flips every still-undecided card to approved in one click. When only one card is pending the top-row shortcuts are hidden (the card-level buttons handle it). **Submit Decisions** stays gated until every card has been decided — you cannot submit a partial batch.

The submitted payload `{decisions: [{provider_call_id, decision: 'approve'|'reject', arguments?, reason?}]}` hits `POST /api/v1/tasks/{taskId}/approve`. Approved cards execute with the confirmed arguments; rejected cards are recorded with `rejected_at` / `rejected_by` / `reject_reason` so the LLM sees the rejection in its next round-trip. Cards the operator did not decide stay `PENDING_APPROVAL` and can be decided in a future round-trip. To cancel the entire pending batch in one go (legacy task-level reject), use the **Reject All** shortcut with its single shared reason.

You can change an operation's default in **Settings → Tools → [tool] → Require approval by default**, and the per-agent override on the agent's **Tools** tab (`/agents/:id/tools`) under **Tools → [operation] → Approval**. Tool configuration no longer lives inside agent Settings.

## Voice input in the chat composer

If the chat composer's **Record** button is not visible and you see a "Voice not configured" pill instead, the agent does not have a Speech-to-Text provider configured at any scope the agent can read (agent, group, user, or global). The pill is read-only — configure a provider from **Settings → Speech** (or **Settings → Admin → Speech Providers** if you are a global admin and want the picker scoped to a plugin), then return to the agent page; the composer re-probes automatically on the next mount.

> The pill is passive by design. Earlier revisions embedded a "Set up" deep-link in the disabled state; the link was removed because a mounted recording button never owns its own navigation context, and the global settings nav is the canonical place for provider configuration regardless of which agent surfaced the disabled state.

If you switch between agents via the URL bar (for example `/agents/42` → `/agents/8`), the composer remounts against the new agent, so a freshly-mounted "Voice not configured" pill always reflects the agent being viewed (no stale "configured" state from the previous agent). The same remount-on-route-change behaviour also re-runs the agent's task history, header identity line, and chat follow-up composer against the newly-selected agent.

## Chat operations: sub-agent (handover + spawn)

The `sub_agent` tool ships two operations on the `op` discriminator — `handover` (transfer + close source task) and `sub_agent` (spawn child + wait for result). Both surface in the parent chat as a row in the timeline:

- **`op: 'handover'`** — the source task closes with a green "Handed off to &lt;Agent&gt;" pill and an **Open &lt;Agent&gt; →** link under the reply. The target agent's task starts as a new, unrelated task.
- **`op: 'sub_agent'`** — the source task stays open but flips to the violet `AWAITING_SUB_AGENTS` status pill until every spawned child terminates. A per-row widget lists each child with its live status (Running, Awaiting approval, Queued, Done, Failed, Cancelled); awaiting-approval rows are amber and expose a **Review approvals →** shortcut. If you no longer want to wait, the **Stop waiting** button on the widget header aborts the first child and cascades the abort up through every `AWAITING_SUB_AGENTS` ancestor — see [First conversation → Stop waiting for sub-agents](/start/end-users/first-conversation#stop-waiting-for-sub-agents) for the cascade semantics.

Both ops share the same `allowed_target_agents` allowlist on the agent's **Tools** tab (`/agents/:id/tools`). The same picker is also reachable from **Settings → Tools** (per-user overrides) and **Groups → {name} → Tools** (per-group overrides), and is scoped by the active principal — only same-principal agents appear as options. The picker is intentionally **not** available under **Settings → Admin → Tools** because no principal context exists at that level; existing global rows written before that hide still cascade down to users without overrides. For the per-row layout and status indicators, see [First conversation → Sub-agents and handovers](/start/end-users/first-conversation#sub-agents-and-handovers). Operators reviewing an `AWAITING_SUB_AGENTS` task (violet pill) can drill into any child row to unblock a `PENDING_APPROVAL` decision without waiting for the parent to time out.

## Task status pills

The chat header, dashboard list, and approval bar all share the same status-pill palette (`StatusBadge.vue`). The colour coding is the single source of truth — operators reading the dashboard and users reading the chat should never see a colour mismatch for the same underlying state:

| Status                | Palette | Icon           | Where it surfaces                                                                               |
| --------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `RUNNING`             | blue    | `loader-2`     | Chat typing-dots area, dashboard card, sub-agent row                                            |
| `PENDING_APPROVAL`    | amber   | `warning`      | Sticky approval bar, dashboard card, sub-agent row (`Review approvals →` shortcut on amber row) |
| `AWAITING_SUB_AGENTS` | violet  | `users`        | Dashboard card, sub-agent widget header (Stop waiting button visible while violet)              |
| `ABORTED`             | stone   | `x-circle`     | Chat ABORTED banner, dashboard card, sub-agent row after a Stop waiting click                   |
| `COMPLETED`           | green   | `check`        | Dashboard card, sub-agent row                                                                   |
| `FAILED`              | red     | `error-circle` | Dashboard card, sub-agent row, 500-class error toasts                                           |
| `CANCELLED`           | zinc    | `x`            | Dashboard card, sub-agent row                                                                   |
| `QUEUED`              | zinc    | `clock`        | Dashboard card, sub-agent row                                                                   |

`ABORTED` is intentionally stone (not red) so it does not read as an error — the agent did not crash; you asked it to stop, and it stopped cleanly. To resume, click the **Resume** button on the Aborted banner in the chat (it focuses the follow-up composer below), or click into an ABORTED card from the dashboard and type your next instruction.

## What's next

- [First conversation](/start/end-users/first-conversation) — sign in and chat
- [Scheduling agents](/start/end-users/scheduling-agents) — one-shot and recurring triggers, timezone, manual fire
- [Troubleshooting](/start/end-users/troubleshooting) — when an agent gets stuck
- [Operators → Operations](/start/operators/operations) — plugin management, the operator side

## Groups

The user dropdown in the navbar exposes a **My Groups →** link (icon: `groups`). It opens the Groups landing page where you can see every group you belong to, switch into a group to manage its members / agents / tools / LLM drivers / preferences, or create a new group if you're an admin. Groups are the principal axis that lets multiple users share an agent, its tool settings, and its LLM configs — see [Concepts → Architecture → Principal ownership model](/reference/concepts/architecture#principal-ownership-model) for the underlying model.

Inside a group page, the **Transfer** action on each agent row lets you re-key the agent's `principal_id` from the current group to a different principal you control (typically your user-principal — the "remove from group" flow). The confirmation dialog shows the new owner label and the list of tool settings / LLM configs that move with the agent. **The transfer also updates every inherited task row**: tasks that were attributed to the old principal are now owned by the new principal, so the new owner's "My Tasks" view picks them up immediately. The historical clicker attribution (`trigger_user_id` — who originally pressed "Send" on each task) is preserved across the transfer so the chat history stays intact.

### Cross-member run visibility

Every group member can see and act on every other member's runs on the shared agent:

- **Visibility**: the per-agent page shows every member's runs; the **My Tasks** dashboard aggregates them too. The dashboard's Running / Awaiting / Aborted chips dedupe by agent, so a shared agent with one running conversation counts as 1, not N.
- **Per-task actions**: any group member can approve, reject, retry, continue, abort, or delete a task on the shared agent — and any group member can also hand the chat off (`handover`) or spawn a sub-agent (`sub_agent`) from another member's run. The clicker no longer has exclusive control over the task or its chat operations; the principal (the group or its owner) does.
- **Credentials**: the task runs under the credentials of whoever clicked "Send" (`trigger_user_id`), not the group's owner. LLM drivers and tool overrides stay per-user even on a group-owned agent.
- **Real-time**: real-time Mercure updates only reach the original clicker's browser. Other members see state changes on their next 30s dashboard refresh, not live.

### Email notifications for scheduled runs

Scheduled runs (recurring cron-style triggers and one-shot future triggers) send an email when they complete. Who receives the email is governed by your **notification subscriptions** — a per-user list of targets you have opted in to.

- **My Account → Email Notifications · Scheduled Runs** lists your groups and a single "My personal agents" row. Tick a row to subscribe; untick to unsubscribe.
- **Group-level subscription** fans out to every agent the group owns (current and future). Subscribing to "Engineering" covers every agent Engineering owns, including new ones added later.
- **"My personal agents" subscription** targets your user-principal and covers every agent you own directly. It's the only row that fires for personal (non-group) agents.
- **Defaults**: on the first scheduled-run dispatch for an agent you can see, the system auto-subscribes the relevant principal (you for personal agents, every current group member for shared agents). You can unsubscribe right after — the email stops on the next dispatch.
- **What gets sent**: when a scheduled run completes, the system resolves the subscriber list (per the rules above) and sends one email per recipient. The template is `scheduled_run_completed` (under **Settings → Mail templates**); the variables are `task_id`, `agent_name`, `user_prompt`, `site_name`, and `run_url`.
- **Server kill switch**: the operator can set `SPORA_NOTIFICATIONS_EMAIL_ENABLED=false` in `.env` to disable scheduled-run dispatch globally. Defaults to `true`. When disabled, the subscription UI shows a "currently disabled on this server" banner so you know your toggles still save state but no mail will go out.

Subscriptions are mutable per user — toggling a row takes effect on the next scheduled-run dispatch. `trigger_user_id` (who clicked "Send") is not consulted for routing; it's purely the audit attribution on the task row.

## Sidebar and command palette

The left sidebar pins the bucket that owns your active agent at the top — either your personal **My Agents** section or the group the agent belongs to — and collapses every other bucket into a single **Other agents (N)** panel that you expand on demand. Agents without a `principal` (legacy fixtures) live in an **Unfiled** bucket inside that panel rather than getting their own pinned section.

To jump around without scrolling, press **⌘K** (or **Ctrl-K** on non-Mac platforms). A global command palette opens with five sections:

- **Actions** — quick links like "Create new agent" / "Create new group", shown on an empty query and whenever the search needle matches an action label or its description.
- **Groups** — every group you can see.
- **My Agents** — agents you own directly.
- **Agents by group** — every other agent, grouped by its owning group.
- **Recent chats** — your last 20 conversations, searchable on `user_prompt` and `final_response`.

Navigation: `↑` / `↓` move, `↵` activates, `Esc` or a backdrop click closes. The palette is wired to the existing Pinia stores and triggers no extra backend calls; if you open it before the dashboard data is loaded, it kicks off the same `ensureLoaded()` fetch the dashboard uses.

The ⌘K button is also exposed as a discoverable search icon in the navbar (between the client-worker indicator and the Groups link) so mouse-first users don't have to memorise the shortcut.
