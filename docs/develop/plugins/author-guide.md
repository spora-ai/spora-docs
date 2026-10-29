---
title: Plugin author guide
description: End-to-end guide for writing a Spora plugin — Composer package, manifest, tools, migrations, admin UI, skills, agent templates, distribution.
---

# Plugin author guide

End-to-end guide for writing a Spora plugin — a Composer package that ships tools, migrations, an optional admin UI, skills, and reusable Agent templates to a Spora deployment.

The complete plugin system reference (load order, manifest validation, boot-time stamp cache, security model) lives in [Concepts → Plugin system](/reference/concepts/plugins-system). The operator-facing install/uninstall flow (`bin/spora plugin:install`, HTTP endpoints) is documented in [Install API](/develop/plugins/install-api). This guide is focused on **how to author a plugin** from scratch.

For the **local development workflow** (Composer path repos, 3-terminal HMR walkthrough for plugins with a Vue frontend), see [Local plugin development](/develop/plugins/local-development).

## Reading order

**New to plugin authoring?** Read in this order:

1. [Foundations](/develop/plugins/author-guide/foundations) — what a plugin is, the `plugin.json` manifest, the entry-point class.
2. [Tools](/develop/plugins/author-guide/tools) — add the first callable surface.
3. [Admin UI](/develop/plugins/author-guide/admin-ui) — only if your plugin ships a frontend.

Skip [Migrations](/develop/plugins/author-guide/migrations), [Skills](/develop/plugins/author-guide/skills), [Agent templates](/develop/plugins/author-guide/agent-templates), [Translations](/develop/plugins/author-guide/translations), [Due work](/develop/plugins/author-guide/due-work) and [Plugin settings](/develop/plugins/author-guide/plugin-settings) on first read — they are independent and can be picked up when needed. [Distribution](/develop/plugins/author-guide/distribution) is for after you have working code on `main` and want to ship it.

## Chapter index

| Chapter                                                            | What it covers                                                                                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Foundations](/develop/plugins/author-guide/foundations)           | The package shape, the `plugin.json` manifest, the entry-point class, the hooks on `SporaExtensionInterface`, and a worked ⌘K search provider. |
| [Tools](/develop/plugins/author-guide/tools)                       | Adding a tool — the canonical callable surface. The `#[Tool]` / `#[ToolParameter]` attribute surface.                                          |
| [Migrations](/develop/plugins/author-guide/migrations)             | Schema versions, filename prefixes, the `up()` / `down()` convention.                                                                          |
| [Admin UI](/develop/plugins/author-guide/admin-ui)                 | The two-package Vue IIFE pattern, the `apps()` hook, the auto-require convention, publishing sequencing.                                       |
| [Agent templates](/develop/plugins/author-guide/agent-templates)   | Ship curated Agent templates with your plugin. Operator gallery, auto-install policy, warning codes.                                           |
| [Skills](/develop/plugins/author-guide/skills)                     | Ship skills with your plugin — a directory via `skillPaths()`, or a provider via `skillProviders()`.                                           |
| [Speech providers](/develop/plugins/author-guide/speech-providers) | Contribute a `SpeechToTextProviderInterface` — only when the vendor's wire shape is not OpenAI-multipart.                                      |
| [Due work](/develop/plugins/author-guide/due-work)                 | Contribute a `DueWorkProviderInterface` — work of your own on a cadence, and the guarantee that two workers do not run the same unit.          |
| [Plugin settings](/develop/plugins/author-guide/plugin-settings)   | Contribute a `PluginSettingsProviderInterface` — operator-facing settings, and the key the host builds for you.                                |
| [Translations](/develop/plugins/author-guide/translations)         | Ship a German catalogue with your plugin — the `translationsPaths()` hook, the `locales/` layout, and what is never translated.                |
| [Distribution](/develop/plugins/author-guide/distribution)         | The `spora-plugin` keyword, the PSR-4 entry-point quirk, testing, SemVer, the release checklist.                                               |

## Looking for an older link?

This page used to be a single 564-line document. The chapter split happened in Phase 11 (July 2026). If you followed an old in-page anchor, the content moved to one of the chapter URLs above — these are hand-maintained pointers, not configured redirects, so nothing rewrites an inbound link for you:

- `#what-a-spora-plugin-is`, `#pluginjson-manifest`, `#entry-point-class` → [Foundations](/develop/plugins/author-guide/foundations)
- `#adding-a-tool` → [Tools](/develop/plugins/author-guide/tools)
- `#adding-an-llm-driver` → [LLM drivers](/develop/plugins/author-guide/drivers) — the `drivers()` hook was removed in 1.0, so that page is now a tombstone pointing at what replaced it
- `#adding-migrations` → [Migrations](/develop/plugins/author-guide/migrations)
- `#adding-an-admin-ui` → [Admin UI](/develop/plugins/author-guide/admin-ui)
- `#recipes-wip--not-yet-shipped` → [Agent templates](/develop/plugins/author-guide/agent-templates)
- `#the-spora-plugin-keyword`, `#psr-4-entry-point-quirk`, `#testing`, `#versioning`, `#reference-implementations` → [Distribution](/develop/plugins/author-guide/distribution)
