---
title: Plugin author guide — Admin UI
description: Adding an operator-facing UI to a Spora plugin — the two-package Vue IIFE pattern, the apps() hook, and the auto-require convention.
---

# Admin UI

Plugins that need an operator-facing interface — a browsable list, a config panel, a settings page — contribute a **Vue IIFE bundle** to the host SPA via the `apps()` hook. The UI is shipped as a separate Composer package and the PHP plugin pulls it in by default so a single `composer require` gets both halves.

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

## Declaring the install destination slug

The [`SporaPluginFrontendInstaller`](https://github.com/spora-ai/spora-installer/blob/main/src/Composer/SporaPluginFrontendInstaller.php) (in `spora-installer`) reads the destination slug from `composer.json#extra.spora-plugin-slug` on the frontend package. The slug **must** match the parent PHP plugin's `plugin.json#slug` exactly — the host SPA's `/api/v1/apps` response (emitted by `AppsController`) carries that slug, and the SPA lazy-loads `/plugins/<slug>/main.js`. A mismatch leaves the bundle unreachable and the SPA renders "Plugin uninstalled".

```json
{
  "name": "spora-ai/spora-plugin-foo-frontend",
  "extra": {
    "spora-plugin-slug": "foo"
  }
}
```

- The value MUST equal the parent PHP plugin's `plugin.json#slug` (which must match `^[a-z0-9][a-z0-9_-]*$` per `spora-core/plugin.schema.json`).
- The installer **fails loud at install time** (`InvalidArgumentException`) if the field is missing or empty — there is no fallback to the package short name. A silent fallback produced exactly this bug in pre-v0.2.0 installer releases (the frontend package's short name `spora-plugin-foo-frontend` did not match the parent plugin's slug `foo`, so the SPA requested a path the installer had not populated).
- Slugs containing `/`, `\`, or `..` are rejected at install time as path-traversal protection under the public web root — belt-and-braces against hand-rolled `composer.json` overrides, since the schema regex already excludes those characters from well-formed slugs.
- This contract shipped in `spora-installer` v0.2.0 (companion PR [`spora-ai/spora-installer#10`](https://github.com/spora-ai/spora-installer/pull/10)). Frontend packages whose install previously routed by short name will throw on the next `composer update` after the operator upgrades the installer — declare the slug before upgrading.

Canonical worked example: [`spora-plugin-media-archive-frontend`](https://github.com/spora-ai/spora-plugin-media-archive-frontend) declares `"spora-plugin-slug": "media-archive"` to match [`spora-plugin-media-archive`](https://github.com/spora-ai/spora-plugin-media-archive)'s `plugin.json#slug` (companion PR [`spora-ai/spora-plugin-media-archive-frontend#9`](https://github.com/spora-ai/spora-plugin-media-archive-frontend/pull/9), merged).

## Sharing Vue + Pinia with the host SPA

The host SPA **already has Vue and Pinia running**. Bundling your own copies would create two reactive systems and break shared state (the plugin couldn't read the host's auth/theme store, and a `createApp()` call from one Vue couldn't mount a component compiled against the other). The build therefore keeps Vue and Pinia **external** and reads them off the host's globals at evaluation time.

The host publishes the references in its `main.ts` after `app.mount(...)`:

```ts
import * as Vue from 'vue'
import * as Pinia from 'pinia'
;(window as unknown as { Vue: typeof Vue }).Vue = Vue
;(window as unknown as { Pinia: typeof Pinia }).Pinia = Pinia
```

Your `vite.config.ts` then maps the externals to those globals so Rollup emits the right call site:

```ts
export default defineConfig({
  build: {
    lib: { entry: 'src/main.ts', formats: ['iife'], name: 'SporaAppFoo' },
    rollupOptions: {
      external: ['vue', 'pinia'],
      output: {
        // Property access resolves at evaluation time against the
        // host's already-published globals. Without this the default
        // IIFE wrapper passes bare identifiers (`})(Vue, Pinia);`)
        // and the bundle throws `Vue is not defined` when loaded
        // via `import('/plugins/<slug>/main.js')`.
        globals: {
          vue: 'window.Vue',
          pinia: 'window.Pinia',
        },
      },
    },
  },
})
```

The resulting `frontend/main.js` ends with `})(window.Vue, window.Pinia);`. Plugins don't share the host's Pinia state — they instantiate a local one inside their own `mount()` — but they read `Vue.createApp` and `Pinia.createPinia` off the host's modules, which is what makes identity equality work.

If you skip the `output.globals` block, the build still succeeds but the runtime throws `Vue is not defined` the moment the host dynamic-imports your bundle. The canonical worked example is [`spora-plugin-media-archive-frontend`](https://github.com/spora-ai/spora-plugin-media-archive-frontend)'s [`vite.config.ts`](https://github.com/spora-ai/spora-plugin-media-archive-frontend/blob/main/vite.config.ts).

## Isolating plugin CSS

A plugin's `frontend/style.css` is loaded into the same document as the host SPA. In production the host adds a `<link>` to the document head; in the proxied Vite workflow the plugin's CSS module injects a `<style>` element that remains loaded for the module's lifetime. A plugin stylesheet is therefore **document-global**, even though Vue renders the plugin into a dedicated slot.

Unscoped Tailwind builds can override host utilities with the same specificity. For example, a plugin's later `.hidden` rule can beat the host's `lg:flex` sidebar rule, while its `.flex` rule can reveal a desktop-hidden mobile control. Every Tailwind-based plugin frontend must provide all three parts of the isolation contract below.

### 1. Disable plugin preflight and scope utilities

The host already owns document-level resets. Disable preflight and use Tailwind's selector-based `important` option to place generated utilities beneath a plugin-owned root:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  corePlugins: { preflight: false },
  important: '#spora-plugin-foo',
  // theme, plugins, and other settings…
} satisfies Config
```

Use `#spora-plugin-<slug>`, where `<slug>` matches the app and install-destination slug. Do not use `important: true`: that keeps selectors global and strengthens collisions with the host instead of containing them.

### 2. Omit the base layer

The plugin's Tailwind entry only needs components and utilities:

```css
@tailwind components;
@tailwind utilities;
```

Omitting `@tailwind base` makes ownership explicit in addition to `corePlugins.preflight: false` enforcing it in configuration.

### 3. Render the matching scope root

Wrap the plugin UI in one stable outer element with the matching ID:

```vue
<template>
  <div id="spora-plugin-foo">
    <FooPage />
  </div>
</template>
```

Selector-based `important` emits descendant selectors such as `#spora-plugin-foo .flex`. Keep the scope wrapper itself free of Tailwind utility classes and put layout utilities on descendants. Add a mount or component test that asserts the root exists, and inspect the production build to confirm it contains scoped selectors but no naked `.hidden` or `.flex` rules.

This setting only scopes utilities generated by Tailwind. Review handwritten global selectors and third-party CSS imports separately; they still share the host document. The canonical [`spora-plugin-media-archive-frontend`](https://github.com/spora-ai/spora-plugin-media-archive-frontend) uses this complete pattern.

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
