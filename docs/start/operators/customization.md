---
title: Customization
description: How to extend a Spora install with custom tools, agents, agent templates, and theming.
---

## Customization

How to extend a Spora install with custom tools, agents, and agent templates.

## Custom tools

Tools are PHP classes implementing `ToolInterface`. Four ways to ship them:

### 1. As a plugin (recommended for reusable tools)

Scaffold from [spora-ai/spora-plugin-skeleton](https://github.com/spora-ai/spora-plugin-skeleton) (the plugin-author template):

```bash
# Use the GitHub "Use this template" button, then:
composer create-project spora-ai/spora-plugin-skeleton my-tool
# Or clone: git clone https://github.com/spora-ai/spora-plugin-skeleton my-tool
```

Edit the generated tool class, commit, tag a release, push to GitHub. Then in your operator install:

```bash
composer require my-vendor/my-tool
```

### 2. As an App extension (recommended for project-local code)

The Symfony-style approach: drop a class in `app/App.php` (shipped with this skeleton as a stub) and override any hook. The framework discovers the file via reflection — no manifest, no slug, no `composer require`.

```php
// app/App.php
final class App extends \Spora\Extensions\AbstractExtension
{
    public function getName(): string { return 'My Spora App'; }

    public function tools(): array { return [Tools\MyTool::class]; }
}
```

**Status:** the App extension surface **ships and is wired**. `AppLoader` discovers `app/App.php` by reflection at `<BASE_PATH>/app/App.php` — no manifest, no slug, no `composer require` — and the container consumes its `apps()` and `tools()` hooks alongside the plugin ones (`ContainerDefinitions.php:842-843` for apps, `InstalledToolClasses` for tools). The `phpstan.neon`, `composer lint`, and `composer analyse` scripts are wired up.

Two practical notes:

- **The skeleton does not ship the file.** `spora-plugin-skeleton` has no `app/` directory at all, so create `app/App.php` yourself — `php bin/spora make:app`, or by hand (see the snippet above).
- **`AppLoader` is a silent no-op when the file is absent.** No `app/App.php` means no warning and no error; Spora runs exactly as it always has. The only case that throws is a file that declares a class which does not implement `SporaExtensionInterface` (`InvalidAppClassException`) — a developer error, not a missing file.

When to migrate App → Plugin: when you need to ship the same code to multiple Spora installs. Renaming `App.php` → `Plugin.php` plus a `plugin.json` is the entire migration.

Full reference: see the [App extensions](/reference/concepts/app-extension) page.

### 3. In-app (for one-off tools)

Drop a PHP class into your project's `app/Tools/` (or any PSR-4 path you autoload), implement `ToolInterface`, and register it via `ToolConfigService`. Prefer the App extension above — this path is for the rare case where you don't want a single App entry-point at all.

### 4. Fork the skeleton

If your customization is tightly coupled to the operator project, fork the skeleton, edit the files in place, and rebuild the Docker image.

## Custom agents

Agents are Eloquent models. Create via the admin UI at `/apps/agents`, or programmatically:

```php
$agent = new Agent([
    'name' => 'Researcher',
    'system_prompt' => 'You are a research assistant...',
    'driver' => 'anthropic',
    'model' => 'claude-sonnet-4-6',
]);
$agent->save();
```

## Custom agent templates

Agent templates are the shipped way to share an agent's setup. Each one is a JSON or YAML file holding a name, system prompt, max steps, tool activations, and per-operation auto-approve defaults.

Drop your own files into `agent-templates/` at the project root. The framework also reads its own bundled `spora-core/agent-templates/` (currently `core-assistant.json`) and any directory a plugin returns from `agentTemplatePaths()`. Each directory is read one level deep and its `.json`, `.yaml`, and `.yml` files are validated; a file that fails to parse is listed with its warnings rather than silently skipped.

> **Note:** there is no CLI command to refresh templates. The scanner runs when the admin UI loads the template gallery in the **Create agent** dialog.

Templates never carry secrets. Settings declared as `#[ToolSetting(type: 'password')]` are rejected at validation, and the optional `tools[].settings` block only appears on an export you opt into with `?include_settings=1`. Recipients still fill in API keys in **Settings → Tools** after importing.

Every scanned file's `id` is checked against a required namespace prefix, and a mismatch raises a `NAMESPACE_MISMATCH` warning (the template still loads). The prefix is the `source` label the scan root declares, and there are four: `project` for your own `agent-templates/` at the project root, `core` for the framework's bundled directory, the contributing plugin's manifest slug for anything a plugin ships, and `app` for anything the project App contributes. So a plugin template wants `<plugin-slug>/<name>` and a project-level one wants `project/<name>`; the bundled `core/core-assistant` is exempt, as is the `uploaded` source. Uploads bypass the check entirely: the import endpoint builds the template straight from the raw payload, so a bare slug is fine there.

- [Concepts → Agent templates](/reference/concepts/agent-templates) — discovery order, the HTTP surface, and importer semantics.
- [Agent template schema](/reference/agent-template-schema) — every field, with examples.
- [Plugin author guide → Agent templates](/develop/plugins/author-guide/agent-templates) — shipping templates from a plugin.

## Custom mail templates

System-email defaults are YAML files under `email-templates/`. A project-local file with the same template `name` takes precedence over the default bundled with `spora-core`.

```yaml
name: welcome
subject: 'Welcome to {{site_name}}'
body: |
  Hi {{user_name}},

  Your account is ready.
body_html: '<main>{markdown_html}</main>'
```

- `body` is CommonMark Markdown and is rendered to HTML and plain text.
- `body_html` is an optional trusted HTML shell. Include `{markdown_html}` where the rendered Markdown should be injected.
- `{{variable}}` placeholders are substituted at send time; unknown placeholders remain unchanged.

After changing YAML defaults, reconcile them with the database:

```bash
php bin/spora mail:templates:sync --check  # dry run; exits 1 on drift
php bin/spora mail:templates:sync          # prompt before overwriting each drifted row
php bin/spora mail:templates:sync --force  # overwrite without prompting
```

Existing installations must run `php bin/spora spora:install` first so the `body_text` column is renamed to `body`. After that, running `php bin/spora db:seed` will pick up any new mail-template YAMLs (it does not overwrite operator-customised rows). To overwrite drifted rows, run `php bin/spora mail:templates:sync --force`.

## Theming the admin UI

The admin UI is a prebuilt Composer package. To customize:

1. Fork [spora-ai/spora-frontend](https://github.com/spora-ai/spora-frontend).
2. Modify the Vue components.
3. Build: `npm run build`.
4. Install your fork as a path repo:

   ```bash
   composer require spora-ai/spora-frontend --path=../my-frontend-fork
   composer install
   ```

5. Commit your fork + skeleton's `composer.json` updates.

## Environment variables

All configuration is `.env`-driven. See [Environment variables](/start/operators/env-vars) for the full reference (every `SPORA_*` var with its default and its effect).
