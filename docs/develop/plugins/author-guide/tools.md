---
title: Plugin author guide — Tools
description: Adding a tool — the canonical callable surface every Spora plugin ships.
---

# Tools

A Spora plugin's primary job is to ship **tools** that an agent can call. A tool is a class that extends `Spora\Tools\AbstractTool` and lives in your plugin's `src/Tools/{Name}Tool.php`. The plugin's entry-point references the tool's FQCN from `tools()` and the orchestrator auto-prefixes it with the plugin slug (a tool named `web_search` in a plugin with `slug: "acme-search"` is exposed to the LLM as `acme-search:web_search`).

The full `#[Tool]` / `#[ToolParameter]` / `#[ToolSetting]` attribute surface is in [Concepts → Tool system](/reference/concepts/tools) — read it before shipping a tool with operator-facing config.

## Where the tool lives

The canonical base class is `Spora\Tools\AbstractTool` (in `app/Tools/AbstractTool.php`). It composes two opt-in traits:

- `HasOperations` — per-operation dispatch + override resolution.
- `HasParameterSchema` — builds `getParametersSchema()` from `#[ToolParameter]` attributes and synthesises a discriminator enum from `#[ToolOperation]`.

If your tool already extends a third-party base, you can `use` those traits directly instead.

## Minimal example

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\AcmeSearch\Tools;

use Spora\Services\PrincipalContext;
use Spora\Tools\AbstractTool;
use Spora\Tools\Attributes\Tool;
use Spora\Tools\Attributes\ToolParameter;
use Spora\Tools\ValueObjects\ToolResult;

#[Tool(name: 'web_search', description: 'Run a web query against the Acme Search API.')]
#[ToolParameter(name: 'query', type: 'string', required: true, description: 'Natural-language query.')]
final class AcmeSearchTool extends AbstractTool
{
    public function __construct(
        private readonly AcmeHttpClient $http,
        private readonly AcmeSettings $settings,
    ) {}

    public function execute(
        array $arguments,
        int $agentId,
        ?int $taskId = null,
        ?PrincipalContext $context = null,
    ): ToolResult {
        $response = $this->http->search($arguments['query'], $this->settings->maxResults);
        return ToolResult::ok(json_encode($response, JSON_THROW_ON_ERROR));
    }

    public function describeAction(array $arguments): string
    {
        return 'Search the web for: ' . ($arguments['query'] ?? '');
    }
}
```

`execute()` takes **four** parameters, and the signature above matches `Spora\Tools\ToolInterface::execute()` exactly. Only the first two are required — the rest default to `null`, so a direct call in a unit test can pass just the arguments and the agent id.

> **Note:** the legacy `?int $userId` third parameter was removed in spora-core PR #288. Getting the arity wrong is fatal at **class-load**, not at call time, and it fails in both directions — declaring four against the four-parameter interface is required, and declaring four against the still-five-parameter released v0.29.0 core is the same fatal. Core and every installed plugin must move together; there is no ordering in which one can go first.

`AbstractTool` implements only `getParametersSchema()` (via `HasParameterSchema`). Your class must still supply **both** `execute()` and `describeAction()`, or PHP fatals at class-load time with `contains 1 abstract method and must therefore be declared abstract or implement the remaining method`. `describeAction()` returns the one-line, markdown-safe summary the approval UI shows before the operator approves the call.

> **Note:** `#[ToolParameter]` goes on the **class**, never on a property. It is declared `#[Attribute(Attribute::TARGET_CLASS)]` and its first constructor argument (`name`) is required, so a property-level attribute is both illegal and ignored — `ToolParameterSchemaBuilder` reflects on the `ReflectionClass`, so a property attribute is invisible and the tool ships with an empty `properties` object. Declare the argument in the schema, then read it out of `$arguments['query']` in `execute()`; there is no typed property backing it.

| Parameter    | Type                | What it is for                                                                                                                                                                                    |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$arguments` | `array`             | Key-value pairs matching your `#[ToolParameter]` names — the `['query' => '...']` array, **not** the declared typed properties.                                                                   |
| `$agentId`   | `int`               | The agent executing the tool. Use it to scope per-agent state and per-agent credentials.                                                                                                          |
| `$taskId`    | `?int`              | The current tick's task id, so chat-level tools (`sub_agent`, `summarize`, `archive`) can reference the source `Task` without re-querying by user id.                                             |
| `$context`   | `?PrincipalContext` | **The ownership signal.** `ownerUserId` is the paying user or group owner and drives credential encryption, settings scope, and audit attribution; `runnerUserId` is whoever triggered this task. |

> **Note:** `$context->ownerUserId` carries the **same** user the removed `$userId` did — the orchestrator sourced `$userId` from `$callingAgent->user_id`, and that accessor delegates to `PrincipalResolver::ownerUserId($agent->principal_id)`, which is exactly what fills `ownerUserId`. For a group-owned agent that is the group's first `owner`, not the member who clicked. What `$context` adds is the rest of the bundle — `principalId`, `type`, `runnerUserId`, and `isResolvable()` — and the orchestrator always supplies it.

`execute()` must **not** throw — encode every failure in the returned `ToolResult` so the LLM can reason about it, with either `ToolResult::ok($content)` or `ToolResult::fail($message)`.

The contract is `Spora\Tools\ToolInterface`. Read [Concepts → Tool system](/reference/concepts/tools) for the full attribute surface and the settings-key convention.

## Starting a task from a tool

A tool that hands work to an agent — a research run of your own, a second pass over the same question — starts a task through `Spora\Services\TaskServiceInterface`. The interface is **plugin-stable**, so depending on it is safe:

```php
public function startTask(
    int $userId,
    int $agentId,
    string $prompt,
    ?int $maxSteps = null,
    ?int $parentTaskId = null,
    array $mediaIds = [],
    ?string $effort = null,
): array;
```

`effort` is the reasoning effort for that task: `null` leaves the task on the LLM configuration's default, an empty string asks for the model's own default, and a canonical level (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) asks for that level.

**The interface takes the effort as a plain string and does not check it against the agent's driver.** The HTTP boundary is what checks it: a task started through the API is refused with `422 EFFORT_LEVEL_UNSUPPORTED` when the level is not one the agent's effective driver declares, and `GET /api/v1/agents/{id}/effort` lists the levels that driver offers. A task started from a plugin skips that check — and what happens then depends on the driver. On the Anthropic driver a level the driver does not declare is dropped on the way to the provider, and the task runs at the model's own default. On the two OpenAI drivers every canonical level is declared, so there is nothing to drop: the level is sent, and a model that does not take it rejects the request with the provider's own error. See [Concepts → LLM drivers](/reference/concepts/drivers#effort-levels).

**An empty effort is not always "no effort".** On a GPT-5.4-or-later model with tools enabled, an empty effort resolves to nothing and the OpenAI-compatible driver sends `reasoning_effort: "none"` — on GPT-5.5, whose own default is `medium`, that **disables reasoning** rather than letting the model think as it would. See [Tools and effort on Chat Completions](/reference/concepts/drivers#tools-and-effort-on-chat-completions).

## Convention reminders

- Use `final` on the tool class.
- `declare(strict_types=1);` at the top of every PHP file.
- FQCN must match the file path (PSR-4) — `Spora\Plugins\AcmeSearch\Tools\AcmeSearchTool` lives at `src/Tools/AcmeSearchTool.php`.

## What's next

- [Skills](/develop/plugins/author-guide/skills) — ship operator knowledge alongside the tool's capability
- [Migrations](/develop/plugins/author-guide/migrations) — when your tool needs its own tables
- [Admin UI](/develop/plugins/author-guide/admin-ui) — when the operator needs a UI to manage the tool's data
