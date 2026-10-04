---
title: Develop
description: Build on top of Spora — projects, then plugins.
---

# Develop

Spora grows in two ways. Most operators start with a **project** (a customised Spora deployment with project-local code). When you have a tool worth sharing across projects, package it as a **plugin**.

## [Projects](/develop/projects/)

A project is a single Spora deployment customised with project-local code. The scaffolder (`spora-maker`) generates the boilerplate for Tools, Controllers, and the `app/App.php` entry class:

- **[Scaffolding → make:tool, make:controller, make:app](/develop/projects/scaffolding)** — the scaffolder command reference, with the generated-code templates and a guide for adding a new `make:*` command

## [Plugins](/develop/plugins/)

A Spora plugin is a Composer package that ships tools, drivers, and migrations to a Spora deployment. Authoring, install, and per-plugin reference docs:

- **[Plugin author guide](/develop/plugins/author-guide)** — end-to-end guide for writing a plugin (manifest, entry-point class, tools, drivers, migrations, testing, publishing)
- **[Local plugin development](/develop/plugins/local-development)** — Composer path repositories for local dev; 3-terminal HMR walkthrough for plugins with a Vue frontend
- **[Install API](/develop/plugins/install-api)** — `POST /api/v1/plugins` HTTP endpoints used by the Web UI (gated by `SPORA_PLUGIN_INSTALL_ENABLED`); CLI is always available
- **[Plugin reference](/develop/plugins/reference/)** — per-plugin reference for the 19 plugins in the Spora org (Skeleton, Tavily, Serper, Staan, Semantic Scholar, World News, Weather, Calendar, Email, MiniMax, Muse, Zernio, Custom skills, Media archive, Memories, OpenAI Image, Team graph, Typst, Word)

> Agent templates are the shipped way to reuse an agent definition — the framework bundles one (`core/core-assistant`) and plugins contribute their own via `agentTemplatePaths()`. See [Managing agents → Agent templates](/start/end-users/managing-agents#agent-templates) for the operator flow and [Plugin author guide → Agent templates](/develop/plugins/author-guide/agent-templates) for authoring one.
