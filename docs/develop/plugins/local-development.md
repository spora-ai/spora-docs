---
title: Local plugin development
description: Develop a Spora plugin against a running Spora instance — Composer path repositories and the 3-terminal HMR walkthrough for plugins with a Vue frontend.
---

# Local plugin development

There are two workflows for developing a Spora plugin locally:

1. **Plugin is pure PHP** — wire it as a Composer path repository in the host skeleton's `composer.json`. The host's `composer install` symlinks your plugin into `plugins/<package-last-segment>/` on every run; PHP edits show up on the next request, no rebuild.
2. **Plugin ships a Vue frontend** (an admin panel) — same Composer path repository for the PHP half, plus two extra Vite dev servers for the frontend half (HMR for Vue components). This is the 3-terminal walkthrough below.

## Setup (Composer path repository)

In the host Spora skeleton's `composer.json`, add a `repositories` entry and a `require` line for the plugin. Because path repos publish the local checkout as a `dev` version, the skeleton's `composer.json` needs `minimum-stability: "dev"` (or `"@dev"` per-require flags) for the `@dev` constraint to resolve. The local `spora-local` skeleton ships with this set — see `spora-local/composer.json` for a worked example:

The local `spora-local` skeleton wires its 8 sibling plugins this way — see `spora-local/composer.json` for a worked example:

```json
{
  "repositories": [
    { "type": "path", "url": "../spora-plugin-foo", "options": { "symlink": true } }
  ],
  "require": {
    "spora-ai/spora-plugin-foo": "@dev"
  }
}
```

Then `composer install`. The plugin is symlinked into `plugins/foo/` of the host (the destination is the package's last segment, e.g. `spora-plugin-foo` → `plugins/foo/`; see [`SporaPluginInstaller::getInstallPath()`](https://github.com/spora-ai/spora-installer) for the exact rule). PHP file changes are picked up on the next request — no rebuild, no re-publish.

If your plugin also ships a Vue frontend, add a second path-repo entry for the frontend package and a matching `require` line:

```json
{
  "repositories": [
    { "type": "path", "url": "../spora-plugin-foo", "options": { "symlink": true } },
    { "type": "path", "url": "../spora-plugin-foo-frontend", "options": { "symlink": true } }
  ],
  "require": {
    "spora-ai/spora-plugin-foo": "@dev",
    "spora-ai/spora-plugin-foo-frontend": "@dev"
  }
}
```

`spora-ai/installer` routes the frontend package into `public/plugins/<slug>/` (where `<slug>` is the value declared in the frontend package's `composer.json#extra.spora-plugin-slug` and must equal the parent PHP plugin's `plugin.json#slug` — see [Author guide → Admin UI](/develop/plugins/author-guide/admin-ui#declaring-the-install-destination-slug)). The host SPA's bundle registry looks for it there.

## HMR for plugins with a Vue frontend

If your plugin ships a Vue admin panel, you need **three terminals running in parallel** to get HMR for both the host SPA and the plugin's bundle. The walkthrough below uses `spora-plugin-media-archive-frontend` as the worked example (a real plugin in the Spora org with a Vue IIFE bundle served by its own Vite on port 5174).

### Terminal 1 — Host (PHP)

```bash
cd /path/to/your-spora-skeleton    # e.g. spora-local
composer dev
# PHP built-in server: http://127.0.0.1:8080
# This serves the host's compiled public/dist/ (the index.php + the
# spora-frontend dist that spora-installer dropped there) and any
# spora-plugin-frontend bundles in public/plugins/<slug>/.
# API endpoints under /api/v1/...
```

The skeleton's `composer.json:33` runs `php -S ${PHP_HOST:-127.0.0.1}:${PHP_PORT:-8080} -t public public/index.php`. PHP edits to the host or to the plugin (symlinked into `plugins/`) show up on the next request; plugin-frontend bundles installed into `public/plugins/<slug>/` (line 47) are served by the same dev server.

### Terminal 2 — Plugin's Vue dev server (HMR for the plugin bundle)

```bash
cd /path/to/your-spora-plugin-foo-frontend
npm run dev
# Vite at http://localhost:5174
# Serves src/main.ts, src/App.vue, etc. directly — no build step.
# Tailwind compiles in this process (postcss + tailwind.config).
```

The plugin's `index.html` (the dev entry) is what Vite serves — it loads `/src/dev-main.ts`, which mounts the Vue app with the in-memory mock API (sandbox mode; no backend round-trips). The plugin's `vite.config.ts` sets `base: '/plugins/<slug>/'` (hardcoded per-plugin — e.g. `'/plugins/media-archive/'` for the Media Archive plugin) so the served paths match the host's runtime contract. The slug here is a coupled pair with the PHP app's `<Plugin>App::name()` value, not derivable from package metadata.

> **`dev-main.ts` is the dev entry only.** Production builds emit a self-contained IIFE bundle at `frontend/main.js` (per `vite.config.ts`'s `build.lib.entry: 'src/main.ts'`). The `dev-main.ts` shim is excluded from coverage because it is dev tooling, not production code.

### Terminal 3 — Host SPA (proxies to the plugin's dev server)

```bash
cd /path/to/spora-frontend
SPORA_PLUGIN_DEV_PORTS=foo:5174 npm run dev
# Vite at http://localhost:5173
# Proxies /plugins/foo/* → http://localhost:5174 (Terminal 2)
# so HMR pulls fresh sources from the plugin's Vite, not the prebuilt dist.
```

The host's Vite reads `SPORA_PLUGIN_DEV_PORTS` (a comma-separated `slug:port` list — `foo:5174,bar:5175`) and installs a path-rewrite proxy for each entry. The path-rewrite maps the runtime contract path (`/plugins/<slug>/main.js`) to the plugin's Vite source path (`/plugins/<slug>/src/main.ts`); everything else passes through. See `spora-frontend/vite/plugin-dev-proxies.ts` for the full proxy logic.

Open `http://localhost:5173` — the host SPA loads normally, the plugin's slot dynamically imports `/plugins/foo/main.js`, the proxy rewrites that to the plugin's Vite source, and you get HMR for the plugin's Vue components on save.

## Verifying changes locally

After editing, refresh the boot:

```bash
php bin/spora spora:install   # applies any new migrations
```

`PluginLoader` invalidates its boot-stamp cache (`storage/.plugins_stamp`) automatically when a manifest's content changes, so no manual cache-bust is needed for PHP edits.

For Vue edits, the HMR pipeline (Terminal 2 + Terminal 3) handles the refresh — no rebuild step.

For agents working on the plugin via sub-agents in parallel worktrees, `.worktrees/` is gitignored across all Spora repos.

## Which workflow do I need?

| Plugin shape                          | Workflow                                               |
| ------------------------------------- | ------------------------------------------------------ |
| PHP only (no admin UI)                | Composer path repo (the only step)                     |
| PHP + Vue admin UI                    | Composer path repo + 3-terminal HMR                    |
| Plugin already published on Packagist | `composer require` from the host — no path repo needed |
