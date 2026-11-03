---
title: Plugin author guide — Due work
description: Implementing Spora\Scheduling\DueWorkProviderInterface — running work of your own on a cadence, where the claim may happen, what the caller's scope means, and where the work is dispatched.
---

# Due work

A due-work provider is a class that says "I have work of my own to run on a cadence". Core's scheduler fires prompts at agents; it knows nothing about a publishing slot, a metrics sweep, or a half-finished upload. Your plugin knows. The worker asks your provider what is due, and executes what it hands back.

Two things to know before you start:

- **You own the guarantee that two workers on the same install do not run the same unit of work.** Core neither enforces it nor touches your tables — how you keep it is your own business.
- **A unit outside the caller's scope is discarded.** Claim one before you know it is in scope and the claim is spent on work that never runs.

## The hook

`Spora\Extensions\SporaExtensionInterface::dueWorkProviders()` returns the classes that provide the work:

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\Acme;

use Spora\Plugins\AbstractPlugin;

final class AcmePlugin extends AbstractPlugin
{
    public function getName(): string
    {
        return 'Acme';
    }

    /**
     * @return list<class-string<\Spora\Scheduling\DueWorkProviderInterface>>
     */
    public function dueWorkProviders(): array
    {
        return [AcmeDueWorkProvider::class];
    }
}
```

`AbstractPlugin` returns `[]`, so a plugin with no work of its own changes nothing. The registry resolves each class from the container once, when it is first built — PHP-DI autowires anything whose constructor arguments it can satisfy, and your own services are bound from a `ContainerBuildingEvent` subscriber (see [Lifecycle is events, not hooks](/develop/plugins/author-guide/foundations#lifecycle-is-events-not-hooks)).

**A provider class the container cannot resolve is not reported — it takes the worker down.** The registry resolves each class with no guard around it, so a class the container cannot build throws when the registry is first built: the housekeeping endpoint answers `500` and `bin/spora worker:run` fails to start. A provider whose constructor asks for something the container cannot satisfy fails the same way, and nothing in `plugin_problems` mentions it. A _settings_ provider that cannot be resolved is caught and reported instead — see [Plugin settings → When a provider does not contribute](/develop/plugins/author-guide/plugin-settings#when-a-provider-does-not-contribute).

Core ships no provider of its own, so the order the registry consults them in is plugin load order.

## The interface contract

```php
namespace Spora\Scheduling;

interface DueWorkProviderInterface
{
    /**
     * @param list<int> $principalIds principals the caller may act for
     * @return list<DueWork>
     */
    public function dueWork(array $principalIds): array;

    /** Execute one unit of work. */
    public function execute(DueWork $work): void;
}
```

## The `DueWork` value object

```php
namespace Spora\Scheduling;

final readonly class DueWork
{
    public function __construct(
        public string $provider,
        public int $principalId,
        public array $payload,
        public string $dueAt,
    ) {}
}
```

A value object, not a row: your provider recognises the payload, and core hands the unit back to the provider that reported it.

| Property      | What it is                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`    | Your class name, as you spell it. Core logs it and routes on the instance that reported the unit, so a wrong name costs nothing but a warning line. |
| `principalId` | The principal the work belongs to. Core checks it against the caller's scope.                                                                       |
| `payload`     | Your own data. Core does not read it.                                                                                                               |
| `dueAt`       | `Y-m-d H:i:s` in UTC. The dispatcher sorts by it, oldest first.                                                                                     |

## Where the claim may happen

The contract is that **two workers on the same install do not run the same unit of work**. Core does not enforce it — it hands over the principals and takes the result, and never touches your tables. The interface allows two shapes, and both are correct as long as the claim is atomic:

1. **Claim in `dueWork()`.** Take the unit out of the running there, in a single atomic transition of your own rows, and report only what you took. The unit you report is already yours.
2. **Claim in `execute()`.** Report the candidates, and take each one atomically when it is executed. `execute()` receives the unit you reported; if your claim finds the row already taken, do nothing and return.

What does not work is claiming in `dueWork()` without an atomic transition, or reporting a unit you never claimed and not claiming it in `execute()` either. Two workers would then both run it.

Atomic means the database decides, not your PHP: a conditional `UPDATE … WHERE status = 'scheduled'` that affects one row, or a `SELECT … FOR UPDATE` inside a transaction. A read-then-write in PHP is a race, and the race is won by two workers at once.

## What the scope means

`dueWork()` receives the principals the caller may act for, and `DueWork::$principalId` names the principal the unit belongs to. Core checks the two against each other: **a unit whose principal is not in the caller's scope is discarded, never executed, and logged at ERROR level**.

That is a guard, not a scope to lean on. A unit you claimed and then had discarded is lost work — the claim is spent and nothing runs it. So a provider must not claim a unit before it knows the unit is in scope: filter by `$principalIds` in the query, and claim only what the query returned.

Who the caller is depends on the worker mode:

| Mode   | Call site                                           | Scope                                                                                                            |
| ------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Server | `bin/spora worker:run` (daemon or `--once`)         | Every principal in the install — the server worker has no caller, so it acts for the whole install.              |
| Client | `POST /api/v1/worker/housekeeping` from the browser | The principals the calling user may act for: their own user-principal plus the group-principals of their groups. |

The server worker refreshes that list on an interval rather than on every iteration — the daemon runs the loop twice a second by default, and scanning the principals table on every iteration would cost two table scans a second for the life of the daemon.

## Where the work is dispatched

`DueWorkDispatcher` runs the work. It asks every registered provider what is due, drops the units outside the caller's scope, sorts what is left oldest-first by `dueAt`, and hands each unit back to the provider that reported it.

One provider's failure does not take the others with it:

- A provider that throws while **reporting** contributes nothing and is logged. The other providers still report.
- A unit that throws while **executing** leaves that unit unexecuted — what an unexecuted unit means is yours, since you own the rows — and the units behind it still run.

Both failures are logged at ERROR level. The report failure names the provider; the execution failure names the provider and the principal id.

In client-worker mode the dispatch happens inside the browser's housekeeping call, which the `SharedWorker` makes on the interval `SPORA_WORKER_CLIENT_HOUSEKEEPING_INTERVAL_SECONDS` sets. A shorter interval notices due work sooner and costs more requests. See [Environment variables](/start/operators/env-vars#worker-runtime-mode).

**The server worker dispatches on every iteration of its loop, and the daemon sleeps half a second between iterations by default.** Your `dueWork()` therefore runs at that rate — twice a second, all day. Keep the query cheap and let the database decide what is due; the worker is not a scheduler you can slow down.

## A minimal provider

A provider that claims the unit when it executes it:

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\Acme;

use Spora\Scheduling\DueWork;
use Spora\Scheduling\DueWorkProviderInterface;

final class AcmeDueWorkProvider implements DueWorkProviderInterface
{
    public function __construct(
        private readonly AcmePostRepository $posts,
    ) {}

    /**
     * @param  list<int> $principalIds
     * @return list<DueWork>
     */
    public function dueWork(array $principalIds): array
    {
        if ($principalIds === []) {
            return [];
        }

        $work = [];
        foreach ($this->posts->scheduledAndDue($principalIds) as $post) {
            $work[] = new DueWork(
                provider: self::class,
                principalId: (int) $post->principal_id,
                payload: ['post_id' => (int) $post->id],
                dueAt: $post->scheduled_for->format('Y-m-d H:i:s'),
            );
        }

        return $work;
    }

    public function execute(DueWork $work): void
    {
        $postId = (int) ($work->payload['post_id'] ?? 0);
        if ($postId <= 0) {
            return;
        }

        // The claim is atomic: the row comes out of the running only if
        // nobody else has taken it yet.
        $claimed = $this->posts->claimForPublishing($postId);
        if ($claimed === null) {
            return;
        }

        $this->posts->publish($claimed);
    }
}
```

`AcmePostRepository` is yours — it is the plugin's own table, and the plugin's own migration. The payload carries the row's identity from the report to the execution; nothing else crosses the boundary.

The other shape — claim in `dueWork()` — differs in one place:

```php
public function dueWork(array $principalIds): array
{
    $work = [];
    foreach ($this->posts->claimDue($principalIds) as $post) {
        $work[] = new DueWork(
            provider: self::class,
            principalId: (int) $post->principal_id,
            payload: ['post_id' => (int) $post->id],
            dueAt: $post->scheduled_for->format('Y-m-d H:i:s'),
        );
    }

    return $work;
}
```

`claimDue()` is the atomic statement that moves the row out of the running, so a unit reported here is already claimed and `execute()` only has to do the work. Either shape keeps the guarantee — what matters is that the claim is atomic and that the claim happens no earlier than the point where you know the unit is in scope.

## Testing

1. **An empty scope returns `[]`** before any query runs. That is the cross-tenant test.
2. **A unit outside the scope is discarded** — assert the provider's `execute()` is never called for it, and that the discard is logged.
3. **The claim is atomic** — two workers racing for the same unit, exactly one of them gets it. Assert that, not that the query filters correctly.
4. **A throwing provider** — assert the dispatcher logs and continues rather than taking the worker down.
5. **A throwing unit** — assert the units behind it still run.

## What's next

- [Foundations](/develop/plugins/author-guide/foundations) — the hook table, including `dueWorkProviders()`.
- [Concepts → Plugin system](/reference/concepts/plugins-system#due-work) — the dispatcher side: the scope, the ordering, and the failure isolation.
- [Migrations](/develop/plugins/author-guide/migrations) — the table your provider owns.
- [Environment variables](/start/operators/env-vars#worker-runtime-mode) — the housekeeping interval that decides how often the client worker looks for due work.
