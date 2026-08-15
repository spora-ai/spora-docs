---
title: Scheduling agents
description: One-shot and recurring schedules, timezone selection, failure recovery, and the manual Trigger now button.
---

# Scheduling agents

A **schedule** is a trigger attached to an agent. When the trigger fires, Spora starts a new task with that agent using the schedule's prompt — exactly as if you had clicked **Send** in the chat. There are two flavours: **one-shot** (fire once at a specific moment) and **recurring** (fire on a cron schedule). Both are managed from the **Schedules** tab on the agent's detail page.

For the wire contract behind the UI, see [Concepts → Architecture & concepts → Schema](/reference/concepts/schema) (`scheduled_runs` and `scheduled_runs_next`) and [Concepts → Worker deployment](/reference/concepts/worker-deployment) (how the worker drains due entries).

## What the schedule form does

Open an agent, click the **Schedules** tab. The form exposes two modes, switched by a toggle at the top:

### One-shot

Pick a date, pick a time, pick a timezone. The schedule fires once at that moment and deactivates itself (`is_active = false`). The fire history is kept on the schedule row (`last_run_at`) so you can confirm it ran.

Example: a 30-minute reminder before a calendar event. Set `run_at` to `2026-04-20T09:30:00`, set `timezone` to `Europe/Berlin`, and the task starts at 09:30 Berlin time regardless of where the server is hosted.

### Recurring

Pick a cron expression and a timezone. The schedule keeps firing on that schedule until you delete it or set `is_active = false`. `next_run_at` is recomputed after each fire using wall-clock `now` in the schedule's `timezone` as the reference — a worker restart or a 10-minute outage does not cause drift.

Example: a daily summary at 07:00 in the user's local time. Cron expression `0 7 * * *`, timezone `Europe/Berlin`. Even if the cron tick at 07:00 lands 3 minutes late, the next fire is still computed for the next 07:00 Berlin — not 07:03.

### Prompt source

Both modes accept either a **template** (from the agent's **Templates** tab) or a free-form **raw prompt**. A template supports `{{variable}}` placeholders that are substituted at fire time using the template's declared variables plus a few built-ins — for example, `{{date}}`, `{{time}}`, `{{day_of_week}}`, `{{month}}`, `{{year}}`, `{{agent_name}}`, `{{user_name}}`. See the agent's template editor for the full list of available built-ins on your version.

## Timezone selection

The form's **Timezone** dropdown is pre-filled with the browser's IANA zone — for example, `Europe/Berlin` if the browser is configured for Berlin, or `America/New_York` for the US East Coast. The dropdown is populated from the IANA tz database, so anything `Intl.DateTimeFormat` recognises is offered.

Why this matters: the schedule's `timezone` is the **reference frame** the backend uses to evaluate cron expressions and to anchor offset-less timestamps in one-shot mode. It is **not** a storage format — every timestamp on `scheduled_runs` and `scheduled_runs_next` is stored in UTC, and the worker pins UTC internally before comparing against `due_at`. You do not need to configure the PHP process or the host OS to match the schedule's timezone. See [Concepts → Worker deployment → Timezone](/reference/concepts/worker-deployment#cron-mode) for the deployment-side detail.

If you switch the dropdown after creating a schedule, existing fires already on the queue are unaffected — the new timezone only governs future cron evaluations and any unanchored one-shot inputs.

## One-shot vs recurring — when to use which

| Use one-shot when...                                                                     | Use recurring when...                                             |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| The trigger is a specific calendar moment ("remind me at 14:30 on Friday")               | The trigger is a rhythm ("every weekday at 08:00")                |
| You want the schedule to retire itself after firing                                      | You want the schedule to keep firing until you pause or delete it |
| You're chaining off a one-time event (a release, a deadline, a webhook-driven follow-up) | You're driving a daily/weekly/monthly report or a routine check   |

## What happens on failure

The schedule lifecycle is symmetric for success and failure — both paths leave the schedule in a coherent state, not stuck mid-flight:

- **Recurring, transient failure** (LLM provider 5xx, brief DB connection drop, orchestrator exception): the schedule stays active, the next `PENDING` entry stays queued, the next worker tick retries. A single bad fire does **not** kill a recurring schedule.
- **Recurring, persistent failure** (the schedule is misconfigured, the agent is disabled, the user revoked the agent's tools): the schedule keeps trying on each cycle. Inspect the agent's task history to see the failure pattern; edit the schedule or the agent and the next fire picks up the fix.
- **One-shot, transient failure at dispatch**: the run deactivates (`is_active = false`) and the entry is marked `SKIPPED`. Re-enable with **Edit → Active** or trigger manually (see below).
- **One-shot, the run succeeded**: deactivates automatically. Nothing to do.

Manual recovery: **Schedules → [row] → Trigger now** enqueues an immediate execution regardless of `next_run_at` and regardless of whether the schedule is active or paused. The schedule's state is not changed by a manual trigger — recurring schedules stay recurring, paused one-shots stay paused (you can still trigger a paused one-shot once if you need to recover a stuck fire).

## What's next

- [Concepts → Worker deployment](/reference/concepts/worker-deployment) — cron and daemon modes, single-instance lock, reaper.
- [Concepts → Database schema → scheduled_runs](/reference/concepts/schema) — wire-level column reference.
- [REST API → Agents → Scheduled runs](/reference/api#scheduled-runs) — request body and error contract for `POST /api/v1/agents/{id}/scheduled-runs`.
- [Managing agents](/start/end-users/managing-agents) — the agent edit form, tool allowlist, system prompt templates.
- [Troubleshooting](/start/end-users/troubleshooting) — when a scheduled fire does not run.
