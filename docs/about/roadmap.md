---
title: Roadmap
description: What Spora is building next — high/medium/low priority items from the public backlog.
---

# Roadmap

The Spora roadmap is drawn from the public portion of `spora-core/docs/backlog.md` (the internal backlog has more items that aren't ready for public disclosure). Items below are listed in priority order — the team is free to reorder as priorities shift.

For questions, suggestions, or to flag something as a higher priority, see [Contribute](/contribute/).

## High

_No high-priority items currently — see below for medium and low priority items._

## Medium

### Parallel tool calls

Run multiple independent tool calls simultaneously within a single agent turn to reduce wall-clock wait. Note: the system currently handles parallel **Tasks** (multiple agents running concurrently), not parallel **tool calls** within a single LLM response.

### Web Push notifications

Surface `PENDING_APPROVAL` alerts even when the browser tab is closed/inactive. Currently implemented via Mercure/SSE for real-time web notifications, but NOT browser Web Push API (Service Workers).

### Agent-to-agent handovers

Handovers with various documents (conversation context, intermediate results, files, partial state) can happen in the future. The current `parent_task_id` chaining is the seed mechanism — it lets a follow-up task inherit the prior task's `task_history`, so a second agent can pick up where the first left off — but it is not yet a first-class UX surface (no "send to agent X with N more steps" shortcut in the UI, no explicit per-document handoff format). Add: (1) a UI action to forward a `COMPLETED` task to a chosen agent with optional additional steps, (2) a typed handoff document schema (which sections of history, which intermediate results, which files), (3) per-agent routing rules for automated handoffs.

### Notification optimizations

Bulk clear all notifications; e-mail alerts for scheduled run completions. Both are implemented: `markAllAsRead()` (`/api/v1/notifications/read-all`) and `deleteAllForUser()` (`DELETE /api/v1/notifications`) routes exist, and `sendEmailForScheduledRun()` runs after scheduled-run completion. Scheduled-run deduplication is already handled — `Orchestrator::tick()` suppresses `notifyTaskCompleted()` for tasks with a `run_id` (`app/Agents/Orchestrator.php:238`), so only `notifyScheduledRunCompleted()` fires.

### Mobile UI improvements

Fix broken Agent sidebar on small screens; optimize Settings Menu for mobile viewports. Responsive sidebar implemented in AgentLayout.vue, AppsLayout.vue, and SettingsSidebar.vue.

### Recipe system (not yet implemented end-to-end)

The recipe scaffolding exists in the backend (`agents.recipe_id` column, `RecipeScanner`, `RecipeController`, `GET /api/v1/recipes`, `PluginInterface::recipePaths()`), but the system is **not shipped and not usable** as of this release:

- `recipes/` is empty — no recipes are bundled with Spora.
- No frontend integration: `recipe_id` exists in `frontend/src/types/agent.ts` but is not consumed by any page or store.
- No plugin ships a recipe either.

To finish: (1) author at least one bundled recipe (e.g. `general_assistant.yaml`) so the scanner has something to return, (2) wire the `recipe_id` field into the agent create/edit UI, (3) add a recipe picker to the agent run flow so `agents.recipe_id` actually drives the system prompt, (4) document the recipe YAML schema, available variables, `{{var}}` templating in prompts, and how recipes differ from agent templates.

Note: the current variable substitution is a simple `{{var}}` regex (`app/Services/ScheduledRunService.php:416`, `app/Console/Commands/WorkerRunCommand.php:384`), not full Mustache (no `{{#section}}`/`{{^inverted}}`).

## Low

The internal backlog has additional low-priority items (small UX improvements, performance tuning, edge-case bug fixes) that aren't yet ready for public disclosure. They'll be added here as they graduate to medium or high.

## Versioning

Spora does not follow strict SemVer yet — pre-1.0 versions are tagged as `0.x.y` and breaking changes can land in minor bumps. The plan is to lock to SemVer once the 1.0 release ships.

For the project's tagging policy (tag from `main` only, after CI is green, never from a PR branch), see [Contribute → CI and coverage](/contribute/ci-and-coverage).

## How to influence the roadmap

- **File a feature request** — open a GitHub Discussion in [spora-ai/spora-core](https://github.com/spora-ai/spora-core/discussions) with the `enhancement` tag
- **File a bug** — open a GitHub Issue with a clear reproduction
- **Contribute code** — see [Contribute](/contribute/) for the PR workflow

## What's next

- [FAQ](/about/faq) — frequently asked questions
- [License](/about/license) — MIT
- [Contribute](/contribute/) — how to file issues and PRs
