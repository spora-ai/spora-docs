---
title: Plugin author guide — Translations
description: Shipping a German catalogue with your plugin — the translationsPaths() hook, the locales/ layout, why the key is the English source string, and what is never translated.
---

# Translations

A plugin can ship its own translation catalogue. The host merges it under core's, so a German install reads your tool names, your setting descriptions and your plugin description in German — with no i18n code on your side.

Two things to know before you start:

- **The catalogue key is the English source string.** `{"Typst Compile": "Typst-Kompilierung"}`, not `{"tool.typst_compile": "…"}`.
- **Only operator-facing copy belongs in it.** A string the model reads stays English, and so does the operator's view of that same string.

## The hook

`Spora\Plugins\PluginInterface::translationsPaths()` returns the absolute paths of the directories holding your catalogues. `AbstractPlugin` returns `[]`, so a plugin that ships none changes nothing.

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
     * @return string[]
     */
    public function translationsPaths(): array
    {
        return [__DIR__ . '/../locales'];
    }
}
```

It is declared on `PluginInterface` itself rather than on `Spora\Extensions\SporaExtensionInterface` because it is plugin-shaped: an App extends the host, and the host has no catalogue of its own to ship.

It is a PHP hook and not a `plugin.json` key. The manifest schema is `additionalProperties: false` and owned by `spora-docs`, so a new manifest field would be schema churn in a repository spora-core does not own.

## The directory layout

```text
spora-plugin-acme/
├── locales/
│   └── de.json          ← hand-edited, one file per language
├── plugin.json
└── src/
    └── AcmePlugin.php
```

One `<locale>.json` per language, holding a flat `string => string` map. The file name **is** the locale code — the same string the host writes to `users.locale`, and the same string the API's `available` list carries. Core ships `en` and `de`. A plugin that ships `de.json` adds a catalogue to a language the instance already knows; a plugin that ships `fr.json` adds a language the backend can resolve — but the SPA's picker lists the languages the _frontend_ ships a catalogue for, so a new language needs a frontend catalogue before a user can pick it.

`en.json` is core's business, not yours. Core's file is generated from the framework's own English literals as an identity map — key and value are the same string — and it is the fallback every miss resolves against. A plugin ships the languages it has translated, and only those.

## The key is the English source string

The host looks a string up by its English text. The catalogue is therefore keyed by the literal you wrote in your source, byte for byte:

```json
{
  "Search the Acme catalogue.": "Durchsuche den Acme-Katalog.",
  "Search the Acme catalogue for '%s'.": "Durchsuche den Acme-Katalog nach '%s'."
}
```

That is not a style choice — it is what makes a copy edit detectable. Because the key _is_ the source, editing the English in your code changes the key: the old entry no longer matches anything, and the new English has no entry. The string renders in English, the stale entry sits in your file looking perfectly fine, and nothing in the file looks wrong. A gate is what turns that into a failure instead of into a silent English string — and **the gate belongs to the repo that owns the catalogue**. The host merges your file and never checks it against your source, so a stale key is inert rather than an error; the check runs in your CI, over your own literals.

## The scope chain: core wins

The host resolves a string along one chain:

```text
core catalogue  →  your plugin's catalogue  →  the English literal itself
```

On a collision — the same English key in core's catalogue and in yours — **core wins and your entry is dropped, with a warning in the log**. A plugin can only add a key; it can never shadow one. A third-party package shipping a duplicate must not be able to reword the host's own button, and a duplicate must never fail the boot.

The consequence for you: a string shared with core is translated **in core only**. If your plugin says `Save changes` and core says it too, your entry is discarded and logged — and the German user still sees core's translation, which is the right one. Pick a wording that is yours when you can, and expect a warning when you do not.

## Placeholders

`%s` and `%d` are placeholders, and the host substitutes them after the translation. Keep them in the catalogue value, in the same order and the same number as in the English source:

```json
{
  "Created %d folders for '%s'.": "%d Ordner für '%s' erstellt."
}
```

Drop one, reorder them, or change `%d` to `%s` and the German sentence puts the count where the name belongs. The values interpolated into the sentence — a folder name, a status word — stay English: they are runtime data, not copy.

`{name}` slots work the same way: the slot name is the contract, so keep it and keep the surrounding text translated. The PHP translator fills them from a parameter array, and the Vue side fills them from its own.

## What is never translated

**The rule: the operator sees exactly what the model sees.** Where a string is model-facing it stays English, and the operator's view of that same string stays English too — there is no translated twin of a model-facing string.

| Never translated                                                | Why                                                                                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#[Tool].name`, `#[Tool].description`                           | The OpenAI function payload and the `AgentManifest` tool block.                                                                                                                     |
| `#[ToolOperation].name`, `.description`, `.operatorDescription` | The same two paths — the model reads `operator_description` too.                                                                                                                    |
| `#[ToolParameter].description`                                  | The LLM parameter schema.                                                                                                                                                           |
| `#[ToolSetting].label` — **all of them**                        | Some carry `exposeToLlm: true` and enter the model's prompt. And because the catalogue key _is_ the English text, a translated label would apply to every setting reusing the word. |
| `#[ToolSetting].options[].label`                                | Mostly language endonyms that must read verbatim.                                                                                                                                   |
| Tool output (`ToolResult::ok()` / `fail()`), all LLM output     | Model input.                                                                                                                                                                        |
| CLI output                                                      | A permanent documented non-goal.                                                                                                                                                    |

What is translated, and what a plugin therefore owns:

| Translated                                      | Where it surfaces         |
| ----------------------------------------------- | ------------------------- |
| `#[Tool].displayName`, `#[Tool].category`       | `GET /api/v1/tools`       |
| `#[ToolSetting].description`                    | Every settings schema     |
| `plugin.json#description`                       | `GET /api/v1/plugins`     |
| `AppInterface::displayName()` / `description()` | `GET /api/v1/apps`        |
| The `message` of your own error responses       | Every JSON error envelope |

A `#[ToolSetting].description` is the blurb the operator reads under the setting, so it translates. Its `label` does not, for the reasons in the table above.

## A minimal worked example

A plugin with one tool, one setting and a German catalogue:

```text
spora-plugin-acme/
├── locales/
│   └── de.json
├── plugin.json
└── src/
    ├── AcmePlugin.php
    └── Tools/SearchAcmeTool.php
```

`src/AcmePlugin.php`:

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
     * @return string[]
     */
    public function translationsPaths(): array
    {
        return [__DIR__ . '/../locales'];
    }
}
```

`src/Tools/SearchAcmeTool.php` — the strings that end up in the catalogue:

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\Acme\Tools;

use Spora\Services\PrincipalContext;
use Spora\Tools\AbstractTool;
use Spora\Tools\Attributes\Tool;
use Spora\Tools\Attributes\ToolSetting;
use Spora\Tools\ValueObjects\ToolResult;

#[Tool(
    name: 'search_acme',
    displayName: 'Search Acme',
    category: 'Productivity',
    description: 'Search the Acme catalogue. The model reads this, so it stays English.',
)]
#[ToolSetting(
    key: 'query',
    label: 'Query',
    type: 'text',
    description: 'What to search the Acme catalogue for.',
)]
final class SearchAcmeTool extends AbstractTool
{
    public function execute(
        array $arguments,
        int $agentId,
        ?int $taskId = null,
        ?PrincipalContext $context = null,
    ): ToolResult {
        return ToolResult::ok('…');
    }

    public function describeAction(array $arguments): string
    {
        return 'Search the Acme catalogue.';
    }
}
```

`locales/de.json`:

```json
{
  "Search Acme": "Acme durchsuchen",
  "Productivity": "Produktivität",
  "What to search the Acme catalogue for.": "Wonach im Acme-Katalog gesucht werden soll."
}
```

Three keys: the tool's display name, its category, and the setting's description. The tool's `description` and the setting's `label` are absent — one is model-facing, the other is a label.

## Checking your catalogue

The host does not validate your file, so your CI does. The shipped plugins enforce the same rules in a Pest test next to the catalogue:

```php
<?php

declare(strict_types=1);

$catalogDir = dirname(__DIR__, 2) . '/locales';

it('declares the locales directory through translationsPaths()', function () use ($catalogDir) {
    $paths = (new AcmePlugin())->translationsPaths();

    expect($paths)->toHaveCount(1);
    expect(realpath((string) $paths[0]))->toBe(realpath($catalogDir));
});

it('holds valid JSON in every catalogue', function (string $file) {
    $messages = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);

    expect($messages)->toBeArray();
    expect($messages)->not->toBeEmpty();
    expect(array_is_list($messages))->toBeFalse();
})->with([$catalogDir . '/de.json']);

it('never leaves a message untranslated', function (string $file) {
    $messages = (array) json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);

    foreach ($messages as $english => $german) {
        expect(trim((string) $german))->not->toBe('');
        expect((string) $german)->not->toBe((string) $english);
    }
})->with([$catalogDir . '/de.json']);
```

Three rules, and they are the ones that matter:

1. **No empty value.** An empty string renders as nothing, which reads as a broken screen rather than as unfinished work.
2. **No value identical to its English key.** A verbatim English value is an untranslated placeholder: it satisfies every other check while rendering as English in production.
3. **No key the source no longer produces.** A key that no longer appears in your code is an orphan — the copy edit that was never re-translated.

Core's own catalogue is held to the same rules by a build command rather than a test: `composer i18n:extract` regenerates `locales/en.json` from the framework's English literals, and `composer i18n:check` fails on drift, on a gap, on an orphan, on an empty or English-identical value, and on a message carrying an unescaped `{`, `}` or `|` — vue-i18n compiles those as interpolation and plural syntax and throws at render.

## What's next

- [Foundations](/develop/plugins/author-guide/foundations) — the hook table, including `translationsPaths()`.
- [Concepts → Plugin system](/reference/concepts/plugins-system) — the loader side: load order, the merge, and the collision rule.
- [Tools](/develop/plugins/author-guide/tools) — the `#[Tool]` and `#[ToolSetting]` attributes whose copy you are translating.
