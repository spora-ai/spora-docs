---
title: Scaffolding
description: spora-maker commands — make:tool, make:controller, make:skill, make:app, plus how to add a new make:* command.
---

# Scaffolding

`spora-maker` is the project scaffolder for Spora. It exposes a small set of `make:*` commands on the existing `bin/spora` console that generate the boilerplate for project-local code: a new Tool class, a new HTTP controller, a new skill bundle, or a fresh `app/App.php` entry class. The skeleton already includes `spora-ai/spora-maker` in `require-dev`; the path repository points at this repo locally, and Packagist will resolve it once published.

## Install

The skeleton already wires this up. If you need to add it manually to an existing project:

```bash
composer require-dev spora-ai/spora-maker
```

After install, all four commands below are available under `bin/spora`.

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

Creates `app/Http/Controllers/MyApiController.php` with a placeholder `index()` method that returns a basic JSON response, and prints the route-registration snippet for you to paste into a `RoutesRegisteringEvent` subscriber on the project App.

The generated controller has no parent class (Spora controllers are plain Symfony-style objects, not framework base classes). Routes are registered imperatively through the event's route collector — the `addRoute()` call is printed for the developer to paste, not auto-injected, because each project owns its own route table and middleware stack.

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

After creation, the scaffolder prints the route call:

```text
$r->addRoute(
    'GET',
    '/api/v1/my-api',
    [\App\Http\Controllers\MyApiController::class, 'index'],
    [\Spora\Http\Middleware\AuthMiddleware::class, \Spora\Http\Middleware\CsrfMiddleware::class],
);
```

The maker's own instruction line tells you to paste that call into `app/App.php` inside `routes(MiddlewareRouteCollector $r)`. That hook was **removed in 1.0** — there is no `routes()` method to paste into. The call itself is unchanged; only its target moved. Paste it into an `onRoutesRegistering()` listener instead:

```php
// app/App.php
namespace App;

use Spora\Events\RoutesRegisteringEvent;
use Spora\Extensions\AbstractExtension;
use Spora\Http\Middleware\AuthMiddleware;
use Spora\Http\Middleware\CsrfMiddleware;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

final class App extends AbstractExtension implements EventSubscriberInterface
{
    /** @return array<class-string, string> */
    public static function getSubscribedEvents(): array
    {
        return [RoutesRegisteringEvent::class => 'onRoutesRegistering'];
    }

    public function onRoutesRegistering(RoutesRegisteringEvent $event): void
    {
        $event->routes()->addRoute(
            'GET',
            '/api/v1/my-api',
            [\App\Http\Controllers\MyApiController::class, 'index'],
            [AuthMiddleware::class, CsrfMiddleware::class],
        );
    }
}
```

> **Note:** `make:controller` still prints the pre-1.0 wording verbatim — that string lives in `spora-maker/src/Maker/MakeController.php:63` and has not been updated. The route-registration model itself is unchanged; `RoutesRegisteringEvent::routes()` returns the same `MiddlewareRouteCollector` that the old `routes()` hook received.

The middleware stack (`AuthMiddleware` + `CsrfMiddleware`) matches every other admin route. Change the HTTP verb, add a new route for another verb, or strip the auth/CSRF stack for a public route by editing the snippet before pasting.

## `make:skill <slug>`

```bash
php bin/spora make:skill time-arithmetic
```

Creates `skills/time-arithmetic/SKILL.md` and `skills/time-arithmetic/examples.md` for a project-local skill. The slug must follow the agentskills.io name pattern: 1–64 lowercase alphanumeric characters and hyphens, with no leading, trailing, or consecutive hyphens; validation is enforced by `SkillValidator`.

After creation, the scaffolder prints a TODO to configure the skill under **Settings → Tools → Skill → `allowed_skills`** so agents can use it.

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

> **Note:** the scaffolder still emits that comment verbatim (`spora-maker/src/Maker/MakeApp.php:33-34`) — it has not been updated for 1.0, so **do not treat the list as the hook surface**. Only four of those nine names are hooks today: `tools()`, `schemaVersion()`, `migrationsPath()`, and `apps()`. The other five were removed in 1.0:
>
> - `drivers()` and `recipePaths()` had no callers and are simply gone.
> - `register()`, `routes()`, and `boot()` became PSR-14 events — `ContainerBuildingEvent` (payload `builder()`), `RoutesRegisteringEvent` (payload `routes()`), and `BootingEvent` (payload `container()`) respectively. An App takes part by implementing `Symfony\Component\EventDispatcher\EventSubscriberInterface`, exactly as the `make:controller` snippet above does.

The full ten-hook table and the three lifecycle events are in [Concepts → App extensions](/reference/concepts/app-extension); the same contract from the plugin side is in [Foundations → Available hooks](/develop/plugins/author-guide/foundations#available-hooks).

## Adding a new `make:*` command

If the four built-in commands don't cover what your project needs, add your own. The scaffolder is designed for extension — three steps, no other wiring required.

> **Note:** adding a maker is a change to the `spora-ai/spora-maker` package, not to the consuming project. The `MAKERS` list in `MakeCommand` is intentionally hardcoded rather than discovered, so the entry points stay grep-able.

1. **Create the maker** at `src/Maker/<Name>.php` (in the `spora-ai/spora-maker` package). The class extends `Spora\Maker\AbstractMaker` (which itself extends `Symfony\Component\Console\Command\Command` and implements `Spora\Maker\MakerInterface`) and sets the three `COMMAND_*` constants the base constructor wires into the console definition. The example below scaffolds an Agent template file — modelled on `MakeSkill`, the simplest of the built-ins.

   ```php
   <?php

   declare(strict_types=1);

   namespace Spora\Maker\Maker;

   use Spora\Maker\AbstractMaker;
   use Spora\Maker\Generator;
   use Symfony\Component\Console\Input\InputInterface;
   use Symfony\Component\Console\Output\OutputInterface;
   use Symfony\Component\Console\Style\SymfonyStyle;

   final class MakeAgentTemplate extends AbstractMaker
   {
       protected const COMMAND_NAME = 'make:agent-template';
       protected const COMMAND_DESCRIPTION = 'Create a new Agent template under agent-templates/.';
       protected const COMMAND_ARG_HELP = 'The template slug (lowercase, hyphenated).';

       public function generate(InputInterface $input, OutputInterface $output, Generator $generator): void
       {
           $io = new SymfonyStyle($input, $output);
           $slug = (string) $input->getArgument('name');

           $generator->generateFile(
               'agent-templates/' . $slug . '.json',
               $this->templateStub($slug),
           );

           $io->note("Point the project App at the directory from agentTemplatePaths(),\n"
               . 'then Import it from the operator agent gallery.');
       }

       public function getSuccessMessage(): string
       {
           return 'Agent template scaffolded. Fill in the system prompt and the tools[] entries.';
       }

       private function templateStub(string $slug): string
       {
           return <<<JSON
               {
                 "\$schema": "https://docs.spora-ai.com/schemas/agent-template.schema.json",
                 "id": "{$slug}",
                 "name": "TODO",
                 "version": "1.0.0",
                 "agent": {
                   "system_prompt": "TODO",
                   "max_steps": 10
                 },
                 "tools": []
               }

               JSON;
       }
   }
   ```

2. **Use the generator** to write the file. `$generator->generateFile('relative/path.json', $contents)` queues the write; the queue is flushed by `Generator::writeChanges()` once `generate()` returns, and the underlying `FileManager` raises `FileAlreadyExistsException` (a `RuntimeException`, which `MakerRunner` turns into `Command::FAILURE`) if the target already exists — so an **existing** file is never clobbered. Note that the flush is not transactional: queued files are written one at a time, so a collision on the third file leaves the first two on disk. `$this->renderClass(...)` is the shorthand for the PHP-class case — it takes a namespace, a `use` list, a class name, a parent, an inner body, a target path, **and the `Generator` itself** (all seven are required; an optional eighth takes a class-attribute string), then queues the built file for you.

3. **Register the maker** by appending the FQCN to the `MakeCommand::MAKERS` array in `spora-maker/src/MakeCommand.php`. No other wiring — the command is available under `bin/spora` on the next `composer dump-autoload`.

That's it. The new command shows up under `bin/spora` immediately, picks up the `name` argument the base class declares, and writes relative to the project root — `MakeCommand::buildMakers()` hands every maker a `Generator` bound to the project directory. There are no extra options to wire up.

## Repository

- **Source:** [spora-ai/spora-maker](https://github.com/spora-ai/spora-maker)
- **License:** MIT

Inspired by Symfony's [maker-bundle](https://github.com/symfony/maker-bundle), scoped to the project-local extension model introduced in Spora v0.5.
