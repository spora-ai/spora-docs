---
title: Usage
description: Usage metering, credits and limits for Spora. Tracks AI tokens and tool calls, bills them against credits, and stops a run that reaches its limit.
---

# Usage Plugin for Spora

Tracks what your agents cost and stops them when they have spent enough.

Spora meters nothing on its own. Token counters exist per assistant turn, tool calls are recorded, and the price of all of it is exactly zero — so "how much has this group spent this month" has no answer, and nothing can be stopped. This plugin supplies the missing half: a **usage meter** that the platform consults before every provider request and every tool execution, a ledger of what each run consumed, a price book that turns tokens and calls into credits, and a set of configurable limits that end a run when it goes over.

Nothing to authenticate against. The plugin has no API key, no third-party service and no external call — it reads the host's own task and principal rows and writes its own tables.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-usage
```

Requires `spora-core >= 0.33.0` — the metering seam the plugin binds into lands in that release. On an older core the plugin installs but meters nothing, because the platform never asks a meter.

The **Usage** tile appears in the admin panel's Apps dropdown at `/apps/usage`.

### The frontend package

The app is a pre-built Vue SPA shipped as a **separate** Composer package, [`spora-ai/spora-plugin-usage-frontend`](https://github.com/spora-ai/spora-plugin-usage-frontend) (type `spora-plugin-frontend`). The PHP package's `require` block pulls it in transitively, so there is nothing extra to install — but the split is real, and it is why the plugin still works on a backend-only checkout: the host simply never finds the bundle to mount.

## What it measures

| Event              | What is counted                                                  | What it is priced by |
| ------------------ | ---------------------------------------------------------------- | -------------------- |
| A provider request | input, output and cached tokens, with the provider and the model | a per-token rate     |
| A tool execution   | one call, with the tool's class and operation                    | a per-call rate      |

**Every provider call is metered, including the conversation compaction.** The compaction used to discard its token counters entirely, so those tokens cost nothing and appeared nowhere.

The **compaction** is not an agent turn — it is the platform's own housekeeping — but it spends the same budget, so it is metered against the same owner.

## Who is charged

Two rules, and they answer the two questions an operator actually asks.

- **The principal is always charged.** A group-shared agent charges the group's pool; a user's own agent charges the user's pool. The owner is the task's `principal_id` — the principal, not the person who pressed Send.
- **The individual is charged additionally, and only for an interactive run.** A scheduled run charges the pool and credits no individual, because the person who triggered it is whoever happened to fire the housekeeping, not a real attribution. Core tells the plugin which case it is through the context's `isSystemRun` flag.

So a shared agent's bill belongs to the group, and a group member's own usage is visible on top of it — without letting one member's spend become the group's.

**The ledger snapshots the owner.** Transferring an agent re-points its tasks at the new principal, so a ledger row that followed its principal would silently move a group's March history onto its new owner. The row keeps the owner it had when the spend happened.

### Not yet in the admin API

The **individual scope** is charged — an interactive run is billed to the triggering individual as well as to the owner — and the ledger records both. The admin API covers the **principal** scope only: there is no route that lists, limits or grants against a _user_ scope, so a per-user allowance can only be created by writing the `usage_limits` / `usage_credits` rows directly.

The scope is inert until it is configured — a scope with no limit row and no credit pool never blocks a run — so nothing is stopped invisibly. It is the _configuration_ that is missing, not the enforcement.

## What is billed

**Only the work the installation pays for.** A principal who runs an agent with their own provider key, or who configures a tool with their own credentials, pays their own provider bill — so the installation does not charge them for it either. The call is still metered and still counted against their limits; it simply costs no credits.

The rule in one line: **a metered event is billed when the configuration that served it was the installation's, and is not billed when the principal had a configuration of their own.**

- **A model** is served by one configuration row, and the row says who owns it — a principal-owned row is that principal's own key, and the global default is the installation's.
- **A tool** is served by the installation's own configuration unless the principal has one of their own for that tool class.

What the limits see:

| Limit unit                | Counts a call the principal paid for themselves? |
| ------------------------- | ------------------------------------------------ |
| `credits`                 | No — there are no credits to count.              |
| `total_tokens`            | Yes                                              |
| `output_tokens`           | Yes                                              |
| `llm_calls`, `tool_calls` | Yes                                              |

The tokens and the call count are facts about the run, so they are counted whatever the price: a cap on tokens is about the principal's own consumption, not about the installation's wallet.

**The rule belongs to the plugin, not to the core.** Core's seam reports what was metered and has no opinion about who pays — another metering plugin may bill every event and be equally right.

A configuration whose scope cannot be resolved is **not** billed. The call is recorded, the operator can see it in the report, and charging a principal for a call whose payer is unknown is the worse mistake.

## Credits

Credits are **abstract**. There is no currency, no conversion rate, and no money anywhere in the plugin — a credit is whatever the operator decides one is. A price is a decimal number of credits per token or per call.

Two independent mechanisms, presented as two sections in the app:

- **Budget** — a credit pool per owner. An admin grants credits; every metered event debits the pool; at zero the run is blocked.
- **Limits** — window ceilings in any unit. A monthly cap of 10 000 credits, a rolling five-hour cap of 2 000 000 tokens, a daily cap of 500 tool calls.

An owner with **no** credit pool has no budget — only its window limits apply. That is deliberate: minting a pool on the first charge would give an unbudgeted owner a negative balance and block it.

### The windows

| Window    | The range                                          |
| --------- | -------------------------------------------------- |
| `hour`    | the last hour                                      |
| `day`     | the last 24 hours                                  |
| `week`    | the last 7 days                                    |
| `month`   | the last 30 days                                   |
| `rolling` | the last _N_ **hours** — this is the five-hour cap |
| `total`   | everything ever recorded                           |

All of them are **rolling**, never a calendar boundary. A daily cap is the last 24 hours, so a run at 23:59 and one at 00:01 are treated alike and the boundary never moves under the operator's feet.

The units are `credits`, `total_tokens`, `output_tokens`, `llm_calls` and `tool_calls`. A token or call cap works with no price book at all.

### What the cap actually means

The gate compares **spend-to-date** against the cap. The call in flight is not reserved — its cost is unknown before it runs — so a run can overshoot by the cost of one turn plus one tool call. The providers themselves use the same model.

Concurrency follows from the same fact: two tasks running at once for the same owner can both pass the gate. A lock cannot span a provider call, so the overshoot is inherent rather than a bug to be fixed.

### How a limit is reported

A limit that is reached **fails the task**. The task lands on `FAILED` with `error_code = USAGE_LIMIT_REACHED` and the reason the operator reads, its pending approvals are closed, and **no retry is scheduled** — a retry would spend the very budget the limit just refused.

The refusal is not reported to the model as a tool error. A tool error reads as "that call failed", and the model tries something else — which is exactly what the limit exists to prevent.

A limit in **soft** mode records the breach and lets the call through.

## The price book

One table, two kinds of row:

| Kind    | Keyed on                                               | Priced by                          |
| ------- | ------------------------------------------------------ | ---------------------------------- |
| `model` | the provider and the model name                        | per input, output and cached token |
| `tool`  | the tool's **class name** and optionally its operation | per call                           |

**A model with no price row costs zero credits.** That is the failure mode the admin API exists for: `GET /api/v1/usage/unpriced` lists the models and tools that have been used and are silently free, so a renamed model or a swapped base URL does not quietly stop the charge. The same endpoint reports the calls that **had** a price and were not billed — the principal paid for those themselves.

Tools are keyed on the **class name**, not the wire name. The wire name comes from the `#[Tool]` attribute and changes between plugin releases; the class does not.

A model's cached tokens are charged at the discounted rate, and the cached count is subtracted from the input count first — for OpenAI the cached tokens are a subset of the prompt tokens, and charging both rates on the same tokens would bill twice.

## The Usage app

`/apps/usage`, four tabs.

| Tab          | Who      | What it shows                                                                                                                         |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview** | everyone | The caller's own principals: the balance, the limits with what is left of each window, and the spend over time.                       |
| **Limits**   | admin    | The picked principal's limit rows — the window, the unit, the cap, the mode, whether it is on — and the spend-to-date in each window. |
| **Budget**   | admin    | The picked principal's credit balance and a grant form.                                                                               |
| **Prices**   | admin    | The price book, and the unpriced models and tools.                                                                                    |

**The Overview is its own thing** and is about no principal in particular, so nothing above it selects one. A caller sees their own usage; an admin also sees the installation's — what it spent in the last 30 days, who spent it, the credit pools that are empty, the models and tools that are used and cost nothing, and the calls that had a price and were not billed.

**The principal is picked inside the tabs that are about one.** Limits and Budget each carry a picker at the top, listing every principal on the installation with its balance and its 30-day spend. Both read the same selection, so moving from Limits to Budget keeps the principal — no re-picking, and no trip to another tab.

The picker is an **admin** control, because the tabs it scopes are admin tabs. A caller who cannot configure anything is not offered a picker that scopes nothing, and the admin listing is not requested for them.

**The API is the real gate**: every admin route carries the admin middleware, and a 403 means "not an admin", not "try again".

**The price book offers what the installation knows.** The model and the tool of a price row are dropdowns, listing the models and the tools the install has used — the price book and the unpriced report together are the whole set. A price for something never used is still enterable: the dropdown is a shortcut that fills the free-text field, not a gate in front of it.

## Admin API surface

Base path `/api/v1/usage`. Every admin route carries `[AuthMiddleware, CsrfMiddleware, AdminMiddleware]`.

| Method | Path                                 | Who                | What it does                                                                                   |
| ------ | ------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------- |
| `GET`  | `/me`                                | any signed-in user | The caller's visible principals with their balances and limits.                                |
| `GET`  | `/me/series?window=day\|week\|month` | any signed-in user | The spend over time.                                                                           |
| `GET`  | `/principals`                        | admin              | Every principal.                                                                               |
| `GET`  | `/principals/{id}`                   | admin              | One principal, with its limits and its spend.                                                  |
| `PUT`  | `/principals/{id}/limits`            | admin              | Replaces the principal's whole set of limits. An absent limit is deleted.                      |
| `PUT`  | `/principals/{id}/credits`           | admin              | Grants credits. A negative amount subtracts.                                                   |
| `GET`  | `/prices`                            | admin              | The price book.                                                                                |
| `PUT`  | `/prices`                            | admin              | Replaces the whole price book.                                                                 |
| `GET`  | `/unpriced`                          | admin              | The models and tools used without a price row, and the calls that had one and were not billed. |

Success is `{"data": …}` and failure is `{"error": {"code", "message"}}` — the host's envelope.

## Settings

One plugin setting: **retention days** (default 90), how long the ledger rows and the bucket rows are kept. The host rewrites the key to `SPORA_USAGE_RETENTION_DAYS`.

## Schema and migrations

The plugin owns six tables, created by `usage_000001_create_usage_tables.php`:

| Table                 | What it holds                                                     |
| --------------------- | ----------------------------------------------------------------- |
| `usage_ledger`        | one row per metered event, with the owner snapshotted             |
| `usage_buckets`       | 15-minute rollups per owner scope, so every window is a range sum |
| `usage_limits`        | the window ceilings                                               |
| `usage_credits`       | the credit balance per owner                                      |
| `usage_credit_grants` | the grant history                                                 |
| `usage_prices`        | the price book                                                    |

`usage_000002_add_billed_to_usage_ledger.php` adds the ledger's `billed` column. It tells the two "cost nothing" cases apart: `priced = false` is a gap in the price book, and `priced = true, billed = false` is a call the principal ran with their own configuration and was not charged for.

The ledger and the buckets carry **no foreign keys on purpose**. The ledger's owner is a snapshot, and a cascading key would delete the history of every scope the owner ever paid for; the other tables are keyed on a polymorphic `(owner_type, owner_id)` pair that no single foreign key can express.

A window is measured in 15-minute buckets, so the sum covers at most one bucket more on each side: a cap can be reached up to 15 minutes early and up to 15 minutes late, and the sum rounds up rather than down.

## How it hooks into the platform

The plugin installs a **usage meter** over the core's null object:

```php
public function onContainerBuilding(ContainerBuildingEvent $event): void
{
    $event->builder()->addDefinitions([
        UsageMeterInterface::class => \DI\autowire(UsageMeter::class),
    ]);
}
```

The core owns the two moments that matter — the provider request about to leave, and the tool about to run — and asks the meter before each one. The plugin owns everything else: the ledger, the limits, the credits, the price book and the API.

See [Usage metering](/develop/plugins/author-guide/metering) in the author guide for the seam itself.

## Development

```bash
composer install
composer test:parallel   # Pest
composer analyse         # PHPStan
composer lint            # php-cs-fixer dry-run
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, a `static-analysis` job, a `code-style` job, a `coverage` job that uploads `coverage.xml`, and a `sonar` job (project key `spora-ai_spora-plugin-usage`).

MIT license.

---

**Repo:** [spora-ai/spora-plugin-usage](https://github.com/spora-ai/spora-plugin-usage) · **MIT**
