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

use Spora\Tools\AbstractTool;
use Spora\Tools\Attributes\Tool;
use Spora\Tools\Attributes\ToolParameter;

#[Tool(name: 'web_search', description: 'Run a web query against the Acme Search API.')]
final class AcmeSearchTool extends AbstractTool
{
    public function __construct(
        private readonly AcmeHttpClient $http,
        private readonly AcmeSettings $settings,
    ) {}

    #[ToolParameter(type: 'string', required: true, description: 'Natural-language query.')]
    public string $query;

    public function execute(array $params): ToolResult
    {
        $response = $this->http->search($params['query'], $this->settings->maxResults);
        return ToolResult::ok(json_encode($response, JSON_THROW_ON_ERROR));
    }
}
```

The contract is `Spora\Tools\ToolInterface`. Read [Concepts → Tool system](/reference/concepts/tools) for the full attribute surface and the settings-key convention.

## Convention reminders

- Use `final` on the tool class.
- `declare(strict_types=1);` at the top of every PHP file.
- FQCN must match the file path (PSR-4) — `Spora\Plugins\AcmeSearch\Tools\AcmeSearchTool` lives at `src/Tools/AcmeSearchTool.php`.

## What's next

- [LLM drivers](/develop/plugins/author-guide/drivers) — only if your plugin needs a new LLM provider alongside the built-in OpenAI and Anthropic ones
- [Migrations](/develop/plugins/author-guide/migrations) — when your tool needs its own tables
- [Admin UI](/develop/plugins/author-guide/admin-ui) — when the operator needs a UI to manage the tool's data
