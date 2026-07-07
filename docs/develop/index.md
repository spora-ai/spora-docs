---
title: Develop
description: Extend Spora with plugins or build standalone projects.
---

# Develop

Spora grows in two ways: **plugins** that drop into any Spora install, and **projects** that are standalone Spora-compatible applications.

## [Plugins](/develop/plugins/)

A Spora plugin is a Composer package that ships tools, drivers, recipes, and migrations to a Spora deployment. Authoring, install, and per-plugin reference docs:

- **[Plugin author guide](/develop/plugins/author-guide)** — end-to-end guide for writing a plugin (manifest, entry-point class, tools, drivers, migrations, recipes, testing, publishing)
- **[Install API](/develop/plugins/install-api)** — `POST /api/v1/plugins` HTTP endpoints used by the Web UI (gated by `SPORA_PLUGIN_INSTALL_ENABLED`); CLI is always available
- **[Plugin reference](/develop/plugins/reference/)** — per-plugin reference for the 10 plugins in the Spora org (Tavily, Serper, Semantic Scholar, World News, Weather, Calendar, Email, MiniMax, Zernio, Skeleton)

## [Projects](/develop/projects/)

Coming in a future phase. Projects are standalone Spora-compatible applications scaffolded with `spora-maker` — see the [operator guide on customization](/start/operators/customization#2-as-an-app-extension-recommended-for-project-local-code) for the current project-local workflow.
