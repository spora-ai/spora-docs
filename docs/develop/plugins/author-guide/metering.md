---
title: Plugin author guide — Usage metering
description: Implementing Spora\Metering\UsageMeterInterface — measuring the AI tokens and tool calls a run consumes, billing them against credits, and stopping a run that reaches its limit.
---

# Usage metering

A usage meter is a class that answers two questions about the work an agent is about to do: **may this call proceed?** and **what did it cost?**

Spora meters nothing by default. Token counters exist per assistant turn, tool calls are recorded, and the price of all of it is exactly zero. A meter is how an operator finds out what a group spent this month, and how they stop a run that has spent too much.

Two things to know before you start:

- **The meter is asked before the call leaves, not after.** A meter that only observes sees the bill after it has been paid. Only a meter that is consulted _before_ the provider request and _before_ the tool execution can stop it.
- **A meter that throws never stops a run.** The meter is plugin code in the hot path, so core wraps every call to it: an exception is logged at ERROR and the call proceeds. Only a decision you deliberately _return_ stops anything.

> **The seam is not in a released core yet.** `Spora\Metering\UsageMeterInterface` has merged into the core's `main` ([spora-core#323](https://github.com/spora-ai/spora-core/pull/323)), but no core release carries it — a released core has no `Spora\Metering\` namespace at all — so a plugin cannot bind the seam until the release that carries it is published. Everything below describes the seam as it will be.

## The seam

Core owns the two moments that matter — the provider request is about to leave, and the tool is about to run — and asks the meter before each one. That is the whole extension point:

```php
namespace Spora\Metering;

interface UsageMeterInterface
{
    /**
     * Consulted before every provider request and every tool execution.
     *
     * @return UsageDecision|null  Null allows the call. A hard decision
     *                              stops the task; a soft decision lets the
     *                              call proceed and is not recorded here —
     *                              a meter that wants a soft breach to be
     *                              visible writes it down itself.
     */
    public function evaluate(MeteringContext $context, MeteringSubject $subject): ?UsageDecision;

    /** Called after a provider request returns, with the tokens it consumed. */
    public function recordLlmUsage(MeteringContext $context, LlmUsage $usage): void;

    /** Called after a tool execution returns. */
    public function recordToolUsage(MeteringContext $context, ToolUsage $usage): void;
}
```

There is no hook for it. A meter is not a plugin hook — the hook table has no entry for it — because it is not a thing the plugin _declares_. It is a thing the plugin _binds_: a meter replaces a binding in the container, and core looks the binding up when the call is about to happen.

```php
public function onContainerBuilding(ContainerBuildingEvent $event): void
{
    $event->builder()->addDefinitions([
        UsageMeterInterface::class => \DI\autowire(UsageMeter::class),
    ]);
}
```

Core binds `UsageMeterInterface::class` to a null object — `NullUsageMeter`, which allows everything and records nothing — so an install with no metering plugin behaves exactly as it did before the seam existed. Your binding replaces it: the container keeps the **last** definition for a key, and the plugin loader dispatches `ContainerBuildingEvent` after core's definitions are added.

> **The plugin's meter must not be the only one.** Two plugins that both bind `UsageMeterInterface` means the second one's binding wins and the first is silently inert. One meter per install.

## The context

```php
final readonly class MeteringContext
{
    public function __construct(
        public int $taskId,
        public int $agentId,
        public int $principalId,
        public ?int $triggerUserId,
        public bool $isSystemRun,
    ) {}
}
```

| Property        | What it is                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `taskId`        | The task the work belongs to.                                                                                    |
| `agentId`       | The agent running it.                                                                                            |
| `principalId`   | The **owner** — a user or a group. Migration 0073 makes `tasks.principal_id` NOT NULL, so a task always has one. |
| `triggerUserId` | Whoever clicked. Nullable — a scheduled run has no user behind it — and it carries **no** ownership weight.      |
| `isSystemRun`   | True when the platform started the run rather than a user.                                                       |

`isSystemRun` is the distinction that decides attribution. `Orchestrator::start()` writes a `run_id` into the task's `data` for a scheduled run, and the context reads it from there.

**`principalType` is deliberately absent.** The context costs one query per metered call, so it carries only what the task row already holds. A meter that needs to know whether the principal is a user or a group resolves it itself, where it needs the answer anyway, and caches it — a principal's type never changes.

**`principalId` and `triggerUserId` are not the same thing.** The principal is who owns the work; the trigger user is who asked for it. A group-shared agent charges the group; the person who happened to press Send is not the owner. Charging the trigger instead is what makes a shared agent's bill belong to whoever used it rather than to whoever owns it.

## The subjects

```php
interface MeteringSubject
{
    public const KIND_LLM = 'llm';
    public const KIND_TOOL = 'tool';

    public function kind(): string;
}
```

Two implementations:

```php
final readonly class LlmSubject implements MeteringSubject
{
    public function __construct(
        public string $provider,   // the driver's protocol name: 'openai_compatible', 'anthropic'
        public string $model,      // the configured model
    ) {}

    public function kind(): string
    {
        return self::KIND_LLM;
    }
}

final readonly class ToolSubject implements MeteringSubject
{
    public function __construct(
        public string $toolName,   // the wire name from #[Tool(name:)]
        public string $toolClass,  // the fully-qualified class name
        public ?string $operation, // the operation the call dispatches to
    ) {}

    public function kind(): string
    {
        return self::KIND_TOOL;
    }
}
```

`kind()` is the one method the interface requires, and it is how the core tells a provider request from a tool execution — the failure log names it when the meter throws.

`toolClass` is the stable key. The wire name comes from the `#[Tool]` attribute and changes between plugin releases; the class does not. `operation` narrows a multi-operation tool down to the operation the call actually dispatches to — the same resolver the runtime uses, so the two cannot disagree.

## The decision

```php
final readonly class UsageDecision
{
    public const MODE_HARD = 'hard';
    public const MODE_SOFT = 'soft';

    public function __construct(
        public string $reason,               // the sentence the operator reads
        public string $mode = self::MODE_HARD,
        public string $scope = '',           // an opaque machine key
    ) {}
}
```

`reason` becomes the task's `failure_reason` and `error_message`, so write it for a human: _"The monthly credit limit of 10 000 was reached."_

`scope` is **opaque**. Core passes it through without interpreting it, so the vocabulary of windows and units stays with the meter that owns the price book. A meter that has no opinion leaves it empty. A meter that does might use `month:credits`, `rolling:total_tokens` and `credits:balance` — but core does not know those words, and a meter is free to use others.

`mode` is the whole difference between a limit and a warning. A **hard** decision stops the task: it fails with `error_code = USAGE_LIMIT_REACHED`, and it is never retried — a retry would spend the very budget the decision refused. A **soft** decision lets the call proceed, and **core keeps no record of it**: it reads the decision, sees that it is not hard, and moves on. There is no core-side ledger of decisions to write to, so a meter that wants a soft breach to be visible — in the log, in its own table — has to write it down itself, in its own `evaluate()`.

## What the meter is told afterwards

```php
final readonly class LlmUsage
{
    public function __construct(
        public Usage $usage,      // Spora\Drivers\ValueObjects\Usage
        public string $provider,
        public string $model,
    ) {}
}

final readonly class ToolUsage
{
    public function __construct(
        public string $toolName,
        public string $toolClass,
        public ?string $operation,
        public bool $succeeded,
    ) {}
}
```

`LlmUsage` wraps core's own `Usage` value object rather than restating its counters — there is no second token accounting to keep in step. It carries the input, output, reasoning, cached, cache-creation and cache-read counters, plus the provider tag.

`ToolUsage` carries the outcome rather than only the successes: a tool that fails still cost something, so a meter that charges per call charges failures too.

**Both provider call sites are metered**, including the conversation compaction. Core routes every provider request through one funnel, `LlmCallRunner` — the agent turn and the compaction summary both come through it. The compaction call used to discard its `Usage` entirely, so those tokens cost nothing and appeared nowhere.

## What a hard decision does to the run

The task fails. Core writes `FAILED` with `error_code = USAGE_LIMIT_REACHED`, the reason from your decision, and it closes the task's pending approvals — nothing will ever pick them up, because the task is terminal. The notification fires, and no retry is scheduled.

The refusal is not reported to the model as a tool error. A tool error reads as "that call failed", and the model tries something else — which is exactly what the limit exists to prevent. So the refusal travels as a task failure, not as a message in the transcript.

## The order of the calls

For a tool call, core does this:

1. resolve the tool name, the class and the operation;
2. build the metering context — one query per metered call, and **none at all** when no meter is installed;
3. **ask the meter**, outside the `try` that catches the tool's own failures;
4. run the tool;
5. tell the meter what it cost.

The gate sits outside the `try` on purpose. Inside it, the refusal would become a failed `ToolResult`, and the model would read it as a tool error.

## Fail-open

Every call to a meter goes through `MeteringGuard`, which catches `Throwable`, logs at ERROR and carries on as if the meter had answered "allow".

This is the rule that keeps a metering plugin from taking the platform down: a corrupt price book, a missing table, a bug in your code — the run continues. The only thing that stops a run is a hard decision you deliberately returned, which is a value rather than an exception and therefore passes through untouched.

The cost of fail-open is that a broken meter is invisible in the task transcript. It is not invisible in the log — the ERROR line names the operation, the task and the exception.

## No meter, no cost

With the default binding, the seam is not merely cheap — it is **invisible**:

- `LlmCallRunner` returns the provider's response before it asks the driver for its provider and model name, so the driver is not asked for anything the agent turn did not already ask for;
- `Orchestrator::safeExecute()` skips the metering context entirely, so the operation resolver never runs and no query is added;
- the tool's own behaviour, the task's outcome and the timings are unchanged.

A plugin that installs a meter opts into the query per metered call. That is the price of knowing what the run costs.

## Testing

1. **A meter that throws** — assert the call proceeds and the exception is logged. This is the fail-open rule, and it is the one most likely to be broken by a later refactor.
2. **A hard decision on a provider call** — assert the request is **not** sent and the task lands on `FAILED` with `USAGE_LIMIT_REACHED` and no retry scheduled.
3. **A hard decision on a tool call** — assert it escapes `safeExecute()` rather than becoming a failed `ToolResult`, and that no `'System Error'` history row is written.
4. **A soft decision** — assert the call proceeds.
5. **The context** — assert a scheduled run is `isSystemRun` and has no trigger user, and that the principal is the task's owner rather than the trigger.
6. **The binding** — assert your `ContainerBuildingEvent` binding replaces core's null object. A meter that is installed and ignored is the worst failure mode available: every test passes and nothing is ever metered.

## What's next

- [Foundations](/develop/plugins/author-guide/foundations) — the hook table and the lifecycle events, including `ContainerBuildingEvent`.
- [Plugin settings](/develop/plugins/author-guide/plugin-settings) — declaring a plugin-wide setting such as a retention window.
- [Migrations](/develop/plugins/author-guide/migrations) — the ledger, the buckets and the price book are your tables.
- [Concepts → Plugin system](/reference/concepts/plugins-system) — the extension surface from the host's side.
