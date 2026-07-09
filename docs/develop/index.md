---
title: Develop
description: Extend Spora with plugins or build standalone projects.
---

# Develop

Spora grows in two ways: **plugins** that drop into any Spora install, and **projects** that are standalone Spora-compatible applications.

## [Plugins](/develop/plugins/)

A Spora plugin is a Composer package that ships tools, drivers, and migrations to a Spora deployment _(recipes WIP — see [Recipes (WIP — not yet shipped)](/develop/plugins/author-guide#recipes-wip-—-not-yet-shipped) below)_. Authoring, install, and per-plugin reference docs:

- **[Plugin author guide](/develop/plugins/author-guide)** — end-to-end guide for writing a plugin (manifest, entry-point class, tools, drivers, migrations, testing, publishing; recipes noted as WIP throughout)
- **[Install API](/develop/plugins/install-api)** — `POST /api/v1/plugins` HTTP endpoints used by the Web UI (gated by `SPORA_PLUGIN_INSTALL_ENABLED`); CLI is always available
- **[Plugin reference](/develop/plugins/reference/)** — per-plugin reference for the 10 plugins in the Spora org (Tavily, Serper, Semantic Scholar, World News, Weather, Calendar, Email, MiniMax, Zernio, Skeleton)

## [Projects](/develop/projects/)

A project is a single Spora deployment customised with project-local code. The scaffolder (`spora-maker`) generates the boilerplate for Tools, Controllers, and the `app/App.php` entry class:

- **[Scaffolding → make:tool, make:controller, make:app](/develop/projects/scaffolding)** — the scaffolder command reference, with the generated-code templates and a guide for adding a new `make:*` command
