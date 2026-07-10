---
title: Plugin skeleton
description: Spora plugin skeleton — minimal template, copy-and-rename starting point for new spora-plugin packages.
---

# Spora Plugin Skeleton

Skeleton for a [Spora](https://github.com/spora-ai/spora-core) plugin.

Use this repository as a template for any new `spora-plugin`:

1. Click **Use this template** → **Create a new repository** on GitHub.
2. Rename the package in `composer.json` (e.g. `spora-ai/spora-plugin-tavily`).
3. Rename the namespace (`Spora\Plugins\Skeleton` → `Spora\Plugins\<YourPlugin>`) in every PHP file.
4. Update `plugin.json`'s `slug`, `description`, `class`, and `icon`.
5. Replace `src/Tools/EchoTool.php` with your real tool(s); add more files under `src/Tools/` and list them in `src/Plugin.php::tools()`.
6. If your plugin needs database tables, add Laravel migrations under `database/migrations/` and bump `SkeletonPlugin::schemaVersion()`.

> **Note on the skeleton's `src/Plugin.php`:** the class is named `SkeletonPlugin` (not `Plugin`), which is a violation of the PSR-4 file-must-match-FQCN rule the rest of the docs follow. The skeleton is the historical exception; the `PluginLoader` resolves the class via the `class` field in `plugin.json`, not via the file name. For any new plugin, name the file to match the FQCN — `src/AcmeSearchPlugin.php` for `Spora\Plugins\AcmeSearch\AcmeSearchPlugin`.

## Layout

```text
.
├── composer.json          # name=spora-ai/spora-plugin-<x>, type=spora-plugin
├── plugin.json            # manifest the PluginLoader reads at boot
├── src/
│   ├── Plugin.php         # PluginInterface implementation
│   └── Tools/
│       └── EchoTool.php   # one tool per file (replace this one)
├── tests/                 # Pest unit tests
│   ├── Pest.php
│   └── Unit/
└── .github/workflows/
    └── ci.yml             # pest + phpstan + cs-fixer
```

## Local development

Clone the repo, install dependencies, and run the tests:

```bash
composer install
./vendor/bin/pest
```

## Publishing

1. Bump `version` in `composer.json`.
2. Tag the release: `git tag v0.1.0 && git push --tags`.
3. (Optional) Configure Packagist to auto-pull from the GitHub repo.

## CI

Three parallel jobs run on every push to `main`, on `v*` tags, and on pull requests:

- `test` — Pest on PHP 8.4 + 8.5
- `static-analysis` — PHPStan level 5
- `code-style` — php-cs-fixer dry-run (same ruleset as Spora core)

External actions are pinned to full commit SHAs per the project's supply-chain policy.

---

**Repo:** [spora-ai/spora-plugin-skeleton](https://github.com/spora-ai/spora-plugin-skeleton) · **MIT**
