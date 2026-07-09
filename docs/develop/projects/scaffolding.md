---
title: Scaffolding
description: spora-maker commands — make:tool, make:controller, make:app, plus how to add a new make:* command.
---

# Scaffolding

`spora-maker` is the project scaffolder for Spora. It exposes a small set of `make:*` commands on the existing `bin/spora` console that generate the boilerplate for project-local code: a new Tool class, a new HTTP controller, or a fresh `app/App.php` entry class. The skeleton already includes `spora-ai/spora-maker` in `require-dev`; the path repository points at this repo locally, and Packagist will resolve it once published.

## Install

The skeleton already wires this up. If you need to add it manually to an existing project:

```bash
composer require-dev spora-ai/spora-maker
```

After install, all three commands below are available under `bin/spora`.

## Conventions

All `make:*` commands share the same conventions:

- **Project-relative paths** are emitted (`app/Tools/Foo.php`, never absolute).
- **No overwrites** — if the target file exists, the command throws `RuntimeException` before any partial write. Rename or move the existing file first.
- **Inline templates** — the scaffolder has no `templates/` directory; the PHP source it generates is inline strings in the maker classes. Keeps the dependency footprint small (only Symfony Console + `spora-core`).
- **`declare(strict_types=1);`** at the top of every generated file.

## `make:tool <Name>`

```bash
php bin/spora make:tool WebSearch
```

Creates `app/Tools/WebSearchTool.php` (the `Tool` suffix is appended automatically if you didn't include it) using the `AbstractTool` + `#[Tool]` attribute pattern from `spora-core`. Refuses to overwrite an existing file.

The generated class extends `AbstractTool`, declares the `#[Tool]` attribute with a snake_case `name` derived from the class name, and adds a placeholder `#[ToolParameter]` for the `query` argument. The `execute()` and `describeAction()` methods are stubbed with `// TODO: implement.` comments.

Generated shape:

```php
<?php

declare(strict_types=1);

namespace App\Tools;

use Spora\Tools\AbstractTool;
use Spora\Tools\Attributes\Tool;
use Spora\Tools\Attributes\ToolParameter;
use Spora\Tools\ValueObjects\ToolResult;

#[Tool(
    name: 'web_search',
    description: 'TODO: describe what this tool does.',
)]
final class WebSearchTool extends AbstractTool
{
    #[ToolParameter(
        name: 'query',
        type: 'string',
        description: 'TODO: describe this parameter.',
        required: true,
    )]
    private string $query = '';

    public function execute(array $arguments, int $agentId, ?int $userId = null, ?int $taskId = null): ToolResult
    {
        $query = (string) ($arguments['query'] ?? $this->query);

        // TODO: implement.

        return ToolResult::ok('Not implemented yet.');
    }

    public function describeAction(array $arguments): string
    {
        $query = (string) ($arguments['query'] ?? '');
        return sprintf('Running WebSearch with query "%s".', $query);
    }
}
```

After creation, the scaffolder prints:

```text
Don't forget to register the tool in app/App.php:
  public function tools(): array { return [Tools\WebSearchTool::class]; }
```

For the full `#[Tool]` / `#[ToolOperation]` / `#[ToolParameter]` / `#[ToolSetting]` attribute surface that the generated class composes with, see [Concepts → Tool system](/reference/concepts/tools). For how `app/App.php` discovers and wires the tool, see [Concepts → App extensions](/reference/concepts/app-extension).

## `make:controller <Name>`

```bash
php bin/spora make:controller MyApi
```

Creates `app/Http/Controllers/MyApiController.php` with a placeholder `index()` method that returns a basic JSON response, and prints the route-registration snippet to paste into `app/App.php` inside `routes(MiddlewareRouteCollector $r)`.

The generated controller has no parent class (Spora controllers are plain Symfony-style objects, not framework base classes). Routes are registered imperatively — the `addRoute()` call is printed for the developer to paste, not auto-injected, because each project owns its own route table and middleware stack.

The default route path is `/api/v1/<name-in-kebab-case>` (e.g. `make:controller MyApi` → `/api/v1/my-api`).

Generated shape:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

final class MyApiController
{
    public function index(Request $request): Response
    {
        // TODO: implement.

        return new JsonResponse([
            'message' => 'Hello from MyApiController!',
        ]);
    }
}
```

After creation, the scaffolder prints:

```text
Paste this into app/App.php inside routes(MiddlewareRouteCollector $r):

$r->addRoute(
    'GET',
    '/api/v1/my-api',
    [\App\Http\Controllers\MyApiController::class, 'index'],
    [\Spora\Http\Middleware\AuthMiddleware::class, \Spora\Http\Middleware\CsrfMiddleware::class],
);
```

The middleware stack (`AuthMiddleware` + `CsrfMiddleware`) matches every other admin route. Change the HTTP verb, add a new route for another verb, or strip the auth/CSRF stack for a public route by editing the snippet before pasting.

## `make:app`

```bash
php bin/spora make:app
```

Recreates `app/App.php` from the latest scaffold template. Useful when the file was deleted and the developer wants a fresh reference, or after upgrading `spora-core` if the App interface changes.

The generated class extends `AbstractExtension` and includes the standard hook-overrides comment block. No other argument is taken.

The generated file is a single `getName()` override (the rest stays at the `AbstractExtension` defaults). After regeneration, fill in the hooks your project needs:

```php
<?php

declare(strict_types=1);

namespace App;

use Spora\Extensions\AbstractExtension;

final class App extends AbstractExtension
{
    /**
     * Project-level App extension. Discovered by AppLoader via reflection;
     * one per installation, no manifest, no slug.
     *
     * Override hooks to wire project-local code into the framework:
     *   tools(), drivers(), recipePaths(), schemaVersion(), migrationsPath(),
     *   apps(), register(\DI\ContainerBuilder), routes(), boot().
     *
     * Promote to a plugin later: rename App → Plugin, add plugin.json, ship
     * as a Composer package.
     */
    public function getName(): string
    {
        return 'My Spora App';
    }
}
```

For the full hook surface and lifecycle ordering, see [Concepts → App extensions](/reference/concepts/app-extension).

## Adding a new `make:*` command

If the three built-in commands don't cover what your project needs, add your own. The scaffolder is designed for extension — three steps, no other wiring required.

> **Note:** the `make:recipe` command below is shown as an extension example, but **recipes are WIP — not yet shipped** in this release. See [Managing agents → Recipes _(WIP)_](/start/end-users/managing-agents#recipes-wip--not-yet-shipped) for status.

1. **Create the maker** at `src/Maker/<Name>.php` (in the `spora-ai/spora-maker` package — this is a scaffolder change, not a project change). The class extends `Symfony\Component\Console\Command\Command` and implements `Spora\Maker\MakerInterface`:

   ```php
   <?php

   declare(strict_types=1);

   namespace Spora\Maker\Maker;

   use Spora\Maker\AbstractMaker;
   use Spora\Maker\Generator;
   use Symfony\Component\Console\Input\InputInterface;
   use Symfony\Component\Console\Output\OutputInterface;

   final class MakeRecipe extends AbstractMaker
   {
       protected const COMMAND_NAME = 'make:recipe';
       protected const COMMAND_DESCRIPTION = 'Create a new Recipe YAML under recipes/.';
       protected const COMMAND_ARG_HELP = 'The recipe slug (lowercase, hyphenated).';

       public function generate(InputInterface $input, OutputInterface $output, Generator $generator): void
       {
           $slug = $input->getArgument('name');
           $path = 'recipes/' . $slug . '.yaml';
           $body = "id: {$slug}\nname: TODO\ndescription: TODO\nsystem_prompt: |\n  TODO.\n";

           $this->renderFile($path, $body, $generator);
       }

       public function getSuccessMessage(): string
       {
           return 'Recipe scaffolded. Edit recipes/<slug>.yaml to set the system prompt and tool allowlist.';
       }
   }
   ```

2. **Use the generator** to write the file. `$generator->generateFile('relative/path.php', $contents)` queues the file; the underlying `FileManager` raises `RuntimeException` if the target already exists.

3. **Register the maker** by appending the FQCN to the `MakeCommand::MAKERS` array in `spora-maker/src/MakeCommand.php`. No other wiring — the command is auto-registered with Symfony Console on the next `composer dump-autoload`.

That's it. The new command shows up under `bin/spora` immediately and inherits the abstract maker's standard options (target directory, dry-run, etc.) without extra code.

## Repository

- **Source:** [spora-ai/spora-maker](https://github.com/spora-ai/spora-maker)
- **License:** MIT

Inspired by Symfony's [maker-bundle](https://github.com/symfony/maker-bundle), scoped to the project-local extension model introduced in Spora v0.5.
