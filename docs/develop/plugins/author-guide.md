---
title: Plugin author guide
description: End-to-end guide for writing a Spora plugin — Composer package, manifest, tools, drivers, migrations, admin UI, distribution. Recipes are WIP.
---

# Plugin author guide

End-to-end guide for writing a Spora plugin — a Composer package that ships tools, drivers, migrations, and an optional admin UI to a Spora deployment. Recipes are scaffolded in the codebase but not yet shipped (see [Recipes (WIP)](/develop/plugins/author-guide/recipes)).

The complete plugin system reference (load order, manifest validation, boot-time stamp cache, security model) lives in [Concepts → Plugin system](/reference/concepts/plugins-system). The operator-facing install/uninstall flow (`bin/spora plugin:install`, HTTP endpoints) is documented in [Install API](/develop/plugins/install-api). This guide is focused on **how to author a plugin** from scratch.

For the **local development workflow** (Composer path repos, 3-terminal HMR walkthrough for plugins with a Vue frontend), see [Local plugin development](/develop/plugins/local-development).

## Reading order

**New to plugin authoring?** Read in this order:

1. [Foundations](/develop/plugins/author-guide/foundations) — what a plugin is, the `plugin.json` manifest, the entry-point class.
2. [Tools](/develop/plugins/author-guide/tools) — add the first callable surface.
3. [Admin UI](/develop/plugins/author-guide/admin-ui) — only if your plugin ships a frontend.

Skip [LLM drivers](/develop/plugins/author-guide/drivers), [Migrations](/develop/plugins/author-guide/migrations), and [Recipes](/develop/plugins/author-guide/recipes) on first read — they are independent and can be picked up when needed. [Distribution](/develop/plugins/author-guide/distribution) is for after you have working code on `main` and want to ship it.

## Chapter index

| Chapter                                                    | What it covers                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Foundations](/develop/plugins/author-guide/foundations)   | The package shape, the `plugin.json` manifest, the entry-point class, and every hook on `PluginInterface`.         |
| [Tools](/develop/plugins/author-guide/tools)               | Adding a tool — the canonical callable surface. The `#[Tool]` / `#[ToolParameter]` attribute surface.              |
| [LLM drivers](/develop/plugins/author-guide/drivers)       | Adding a new LLM provider. Most plugins should not need this — built-in OpenAI/Anthropic drivers cover most cases. |
| [Migrations](/develop/plugins/author-guide/migrations)     | Schema versions, filename prefixes, the `up()` / `down()` convention.                                              |
| [Admin UI](/develop/plugins/author-guide/admin-ui)         | The two-package Vue IIFE pattern, the `apps()` hook, the auto-require convention, publishing sequencing.           |
| [Recipes (WIP)](/develop/plugins/author-guide/recipes)     | The recipe API surface (scaffolded, not shipped). For the WIP status only.                                         |
| [Distribution](/develop/plugins/author-guide/distribution) | The `spora-plugin` keyword, the PSR-4 entry-point quirk, testing, SemVer, the release checklist.                   |

## Looking for an older link?

This page used to be a single 564-line document. The chapter split happened in Phase 11 (July 2026). If you followed an old in-page anchor, the new URL is one of the chapters above:

- `#what-a-spora-plugin-is`, `#pluginjson-manifest`, `#entry-point-class` → [Foundations](/develop/plugins/author-guide/foundations)
- `#adding-a-tool` → [Tools](/develop/plugins/author-guide/tools)
- `#adding-an-llm-driver` → [LLM drivers](/develop/plugins/author-guide/drivers)
- `#adding-migrations` → [Migrations](/develop/plugins/author-guide/migrations)
- `#adding-an-admin-ui` → [Admin UI](/develop/plugins/author-guide/admin-ui)
- `#recipes-wip--not-yet-shipped` → [Recipes (WIP)](/develop/plugins/author-guide/recipes)
- `#the-spora-plugin-keyword`, `#psr-4-entry-point-quirk`, `#testing`, `#versioning`, `#reference-implementations` → [Distribution](/develop/plugins/author-guide/distribution)
