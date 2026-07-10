---
title: Plugin author guide — Admin UI
description: Adding an operator-facing UI to a Spora plugin — the two-package Vue IIFE pattern, the apps() hook, and the auto-require convention.
---

# Admin UI

Plugins that need an operator-facing interface — a browseable list, a config panel, a settings page — contribute a **Vue IIFE bundle** to the host SPA via the `apps()` hook. The UI is shipped as a separate Composer package and the PHP plugin pulls it in by default so a single `composer require` gets both halves.

## When to ship one

A frontend bundle is overkill for plugins that only need server-side behaviour (a tool, an LLM driver, a migration). Reach for one when:

- An operator needs to **browse or filter** records the plugin produced (media assets, calendar events, emails, …).
- The plugin exposes **multi-step configuration** that doesn't fit a single settings key.
- You want **previews** of generated artefacts (images, audio, …).

If you only need a settings page with a few inputs, the operator-facing [Plugin settings](/develop/plugins/install-api#plugin-settings) surface is enough.

## The two-package pattern

A plugin with a UI is **two** Composer packages, each with its own `type`:

| Package                              | `type`                  | Lands in              | Job                                          |
| ------------------------------------ | ----------------------- | --------------------- | -------------------------------------------- |
| `spora-ai/spora-plugin-foo`          | `spora-plugin`          | `plugins/foo/`        | PHP entry point, manifest, tools, migrations |
| `spora-ai/spora-plugin-foo-frontend` | `spora-plugin-frontend` | `public/plugins/foo/` | Vue 3 IIFE bundle + Tailwind-compiled CSS    |

The split exists so the host SPA can lazy-load the bundle at `/plugins/foo/main.js` without a build step at install time (production ships pre-built assets via `SporaPluginFrontendInstaller`), and so a plugin author can swap or fork the bundle without touching PHP.

## Wiring the `apps()` hook

The PHP plugin's entry-point contributes the App class via `apps()`:

```php
public function apps(): array
{
    return [
        FooApp::class,
    ];
}
```

`FooApp` implements `Spora\Apps\VueAppInterface` and tells the host SPA which file to load:

```php
use Spora\Apps\VueAppInterface;

final class FooApp implements VueAppInterface
{
    public function name(): string { return 'foo'; }
    public function displayName(): string { return 'Foo'; }
    public function description(): string { return 'Browse, filter, and manage foo records.'; }
    public function icon(): string { return 'puzzle'; }

    /** File inside the frontend package's `frontend/` directory. */
    public function entry(): string { return 'main.js'; }
}
```

The host SPA fetches `entry()` via `/plugins/foo/main.js` at runtime and mounts the bundle's exported `mount(target, hostContext)` into the app slot. See [`spora-frontend/src/apps/registry.ts`](https://github.com/spora-ai/spora-frontend/blob/main/src/apps/registry.ts) for the full mount contract.

## Auto-requiring the frontend

The PHP plugin's `composer.json` should `require` the frontend package with a **permissive semver range**. That way a single `composer require spora-ai/spora-plugin-foo` pulls in both halves, and operators who want a different frontend version can constrain it in their own `composer.json`:

```json
"require": {
    "php": "^8.4.1",
    "spora-ai/spora-core": ">=0.7.0 <1.0.0",
    "spora-ai/spora-plugin-foo-frontend": ">=0.1.0 <1.0.0"
}
```

The `>=0.1.0 <1.0.0` shape matches `spora-core`'s constraint — any 0.x version of the frontend satisfies, leaving room for the frontend to ship 0.2, 0.3, … without breaking this dependency. Operators override with a stricter constraint:

```bash
composer require spora-ai/spora-plugin-foo-frontend:^0.2
```

Composer uses the stricter of the two constraints, so this upgrades the frontend in place while leaving the PHP plugin untouched. The PHP plugin stays plugin-agnostic — it knows the frontend by package name, not by inlining any of its bundle code.

## Publishing sequencing

The frontend must be **tagged and on Packagist** before the PHP plugin's CI can resolve the require. Recommended sequence:

1. Tag and publish the frontend first (`vX.Y.Z` from main, push tag, Packagist webhook fires within minutes).
2. Then — or in a separate PR — bump the PHP plugin's `require` to the new constraint.
3. Tag and publish the PHP plugin.

Trying to require an unpublished frontend leaves the PHP plugin's CI red (`composer install` can't resolve). If you're scaffolding both packages at once, publish the frontend first.

## Reference

- **PHP plugin**: [`spora-ai/spora-plugin-media-archive`](https://github.com/spora-ai/spora-plugin-media-archive) — the canonical worked example. The `apps()` hook contributes `MediaArchiveApp`, which implements `VueAppInterface` with `entry(): 'main.js'`.
- **Frontend bundle**: [`spora-ai/spora-plugin-media-archive-frontend`](https://github.com/spora-ai/spora-plugin-media-archive-frontend) — Vite builds a single `SporaAppMediaArchive` IIFE into `frontend/main.js` + `frontend/style.css`, which `SporaPluginFrontendInstaller` copies into `public/plugins/media-archive/` on `composer install`.

## Local dev for the UI

The frontend package has its own Vite dev server; for the full HMR pipeline (host + plugin + plugin's UI) see [Local plugin development](/develop/plugins/local-development) — the 3-terminal walkthrough covers running both halves with hot reload.

## What's next

- [Distribution](/develop/plugins/author-guide/distribution) — when you have working code on `main` and want to ship
