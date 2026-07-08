---
title: How to add a tool
description: The canonical Hello-Tool walkthrough — create a tool class, register it, test it, document it.
---

# How to add a tool

This is the canonical "Hello, Tool" walkthrough. By the end you'll have a working tool that returns a static result, registered in the operator's admin UI.

The principles: tools are PHP classes, registered via `tools: array<...>`, and surfaced to the LLM via the `#[Tool]` attribute.

## Step 1 — Create the tool class

Tools live in `app/Tools/`. The skeleton's `app/Tools/` is empty by default. Create `app/Tools/HelloTool.php`:

```php
<?php

declare(strict_types=1);

namespace App\Tools;

use Spora\Tools\AbstractTool;
use Spora\Tools\Attributes\Tool;
use Spora\Tools\Attributes\ToolParameter;
use Spora\Tools\ValueObjects\ToolResult;

#[Tool(
    name: 'hello',
    description: 'Returns a friendly greeting.',
)]
final class HelloTool extends AbstractTool
{
    #[ToolParameter(
        name: 'name',
        type: 'string',
        description: 'Who to greet.',
        required: true,
    )]
    private string $name = '';

    public function execute(array $arguments, int $agentId, ?int $userId = null, ?int $taskId = null): ToolResult
    {
        $name = (string) ($arguments['name'] ?? $this->name);
        return ToolResult::ok(sprintf('Hello, %s!', $name));
    }

    public function describeAction(array $arguments): string
    {
        $name = (string) ($arguments['name'] ?? '');
        return sprintf('Greeting %s', $name);
    }
}
```

What this class does:

- `#[Tool(name, description)]` — declares the tool's identity to the LLM. The `name` is what the LLM uses to call the tool (must match `/^[a-z][a-z0-9_]*$/`).
- `#[ToolParameter(...)]` — declares a single parameter. The LLM sees this as a property of the tool's JSON schema.
- `execute(...)` — the actual work. Returns a `ToolResult::ok(...)` on success or `ToolResult::fail(...)` on a graceful failure. **Never throws** — a single API failure cannot kill the agent loop.
- `describeAction(...)` — the human-readable summary shown in the approval UI when the agent calls this tool.

For the full attribute surface (`#[ToolSetting]`, `#[ToolOperation]`, `InputToolInterface` vs `OutputToolInterface`, etc.), see [Concepts → Tool system](/concepts/tools).

## Step 2 — Register the tool

The skeleton's `app/App.php` registers project-local tools. Find or create the file and override the `tools()` hook:

```php
<?php

declare(strict_types=1);

namespace App;

use App\Tools\HelloTool;
use Spora\Extensions\AbstractExtension;

final class App extends AbstractExtension
{
    public function getName(): string
    {
        return 'My Spora App';
    }

    /** @return array<class-string<\Spora\Tools\ToolInterface>> */
    public function tools(): array
    {
        return [
            HelloTool::class,
        ];
    }
}
```

If `app/App.php` doesn't exist, generate it with the scaffolder:

```bash
php bin/spora make:app
```

## Step 3 — Test it

Add a Pest test at `tests/Unit/Tools/HelloToolTest.php`:

```php
<?php

declare(strict_types=1);

use App\Tools\HelloTool;
use Spora\Tools\ValueObjects\ToolResult;

it('greets the named user', function (): void {
    $tool = new HelloTool();
    $result = $tool->execute(['name' => 'Spora']);

    expect($result)->toBeInstanceOf(ToolResult::class);
    expect($result->ok)->toBeTrue();
    expect($result->content)->toBe('Hello, Spora!');
});

it('handles a missing name gracefully', function (): void {
    $tool = new HelloTool();
    $result = $tool->execute([]);

    expect($result->ok)->toBeTrue();
    expect($result->content)->toBe('Hello, !');
});
```

Run:

```bash
./vendor/bin/pest tests/Unit/Tools/HelloToolTest.php
```

Per the project rule: **no mocks for integration tests that already boot the DB via `beforeEach`**. For a stateless tool like this, you don't need a DB at all — instantiate the tool directly and test it.

## Step 4 — Try it in the admin UI

1. Start the dev server: `composer dev`
2. Open `http://localhost:8080`
3. Go to **Agents → [an agent] → Tools**. The `hello` tool should appear in the list.
4. Enable it for the agent
5. Send the agent a message: "Use the hello tool to greet Spora"
6. The agent will call the tool, you'll see the tool call, the result, and the agent's response

If the tool doesn't appear, run `php bin/spora spora:install` — the `tools()` hook is read at boot.

## Step 5 — Add tool settings (optional)

If the tool needs operator-configurable settings (API keys, model names, hostnames), add `#[ToolSetting]` attributes. Example:

```php
#[Tool(
    name: 'hello',
    description: 'Returns a friendly greeting.',
)]
#[ToolSetting(
    key: 'default_greeting',
    label: 'Default greeting',
    type: 'text',
    description: 'The fallback greeting when no name is provided.',
    default: 'Hello, world!',
)]
final class HelloTool extends AbstractTool
{
    // ... rest as before
}
```

The operator sees `default_greeting` in the admin UI's Tools → Hello page. The setting is encrypted at rest and merged into the tool's effective settings via `ToolConfigService::getEffectiveSettings()`.

For the full settings key convention, see [Concepts → Tool system → Setting cascade](/concepts/tools#setting-cascade-schema-defaults--global--user--agent).

## Step 6 — Distribute as a plugin (optional)

If the tool should ship to other Spora installs, see [Develop → Plugins → Author guide](/develop/plugins/author-guide). The promotion path is mechanical:

1. Move the class to a new plugin's `src/Tools/`
2. Add a `plugin.json` manifest
3. Replace `app/App.php` with a `Plugin.php` entry class
4. Ship as a Composer package

## Common mistakes

- **Tool name not snake_case** — must match `/^[a-z][a-z0-9_]*$/`. `HelloTool` becomes `hello_tool` if you forget the explicit `#[Tool(name: ...)]` attribute.
- **Throwing on failure** — don't. The Orchestrator catches `Throwable` and marks the task `FAILED`. Use `ToolResult::fail(...)` for graceful failure.
- **Forgetting to register** — adding the class to `app/Tools/` is not enough. You must also list it in `app/App.php::tools()`.
- **Returning raw strings or arrays** — always wrap in `ToolResult::ok(...)` or `ToolResult::fail(...)`. The agent loop expects the wrapped form.
- **Tool not appearing in the admin UI** — run `php bin/spora spora:install` to refresh the boot-time tool registry.

## What's next

- [Tool system concepts](/concepts/tools) — the full `#[Tool]`, `#[ToolOperation]`, `#[ToolParameter]`, `#[ToolSetting]` attribute surface
- [CLI & coding standards](/start/developers/cli-and-coding-standards) — Pest + PHPStan, code comment policy
- [Plugin author guide](/develop/plugins/author-guide) — when the tool should be distributed
