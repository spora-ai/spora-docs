---
title: FAQ
description: Frequently asked questions about Spora — installation, plugins, security, performance, and licensing.
---

# FAQ

Common questions about Spora. If your question isn't here, ask in [GitHub Discussions](https://github.com/spora-ai/spora-core/discussions).

## Installation

**Q: What's the minimum PHP version?**

PHP 8.4 or later. The codebase uses `readonly` properties, enums, and the FrankenPHP-targeted FrankenPHP runtime. PHP 8.3 and earlier won't work — the Composer platform check fails the install.

**Q: Do I need a database?**

SQLite by default (no setup). For MySQL/MariaDB, set `SPORA_DB_*` env vars before `bin/spora spora:install`. See [Install](/start/operators/install) for the 5-route install matrix.

**Q: Can I run Spora on a shared host without root?**

Yes — that's the original target. cPanel/Plesk/FTP-only hosts with PHP 8.4+ work. See [Shared host](/deploy/shared-host) for the step-by-step.

**Q: Can I run Spora without Docker?**

Yes. Use the [Classical server](/deploy/classical-server) path (nginx + PHP-FPM + systemd + supervisord), or the [Shared host](/deploy/shared-host) path (cPanel-style). Docker is just a convenience.

## Plugins

**Q: Where do plugins come from?**

Plugins ship as Composer packages of `type: "spora-plugin"`. The Spora org publishes a starter template ([spora-plugin-skeleton](https://github.com/spora-ai/spora-plugin-skeleton)) and nine production plugins (Tavily, Serper, Semantic Scholar, World News, Weather, Calendar, Email, MiniMax, Zernio). Anyone can author one — see [Author guide](/develop/plugins/author-guide).

**Q: How do I install a plugin?**

CLI: `php bin/spora plugin:install vendor/package`. Web UI: **Plugins → Browse → Install** (requires `SPORA_PLUGIN_INSTALL_ENABLED=true`). For local development of a plugin you author, the recommended workflow is a [Composer path repository](/develop/plugins/local-development) — `SPORA_PLUGINS_PATHS` is the legacy env-var approach. See [Install API](/develop/plugins/install-api) for the full contract.

**Q: How do I author my own plugin?**

See [Develop → Plugins → Author guide](/develop/plugins/author-guide) — the canonical Hello-Tool walkthrough, the `plugin.json` schema reference, and the PSR-4 entry-point rule. The [Plugin skeleton](https://github.com/spora-ai/spora-plugin-skeleton) is the starting template.

**Q: Can I package project-local code as a plugin later?**

Yes — it's a mechanical rename + manifest addition, not a rewrite. See the **Promoting an App to a Plugin** section in [Customization](/start/operators/customization).

## Security

**Q: How are tool credentials encrypted?**

`SPORA_SECRET_KEY` (32-byte base64) is the master key. Tool credentials are encrypted at rest using **libsodium secretbox** (XSalsa20 stream cipher + Poly1305 MAC, AEAD). See [Security](/start/operators/security#credential-encryption) for the full algorithm and key-resolution chain.

**Q: Is the operator's data sent to Spora's authors?**

No. Spora is **self-hosted** — operator runs their own Spora instance. There are no telemetry, no phone-home, no analytics. The only outbound network calls are the ones the operator configures (LLM provider, IMAP, calendar, etc.).

**Q: Can the operator audit agent actions?**

Yes. Every tool call is recorded in `tool_calls` (input, output, approval, timestamp, agent, user, task). Every task is recorded in `tasks` with its full `task_history`. The admin UI has an audit log view (if enabled). The underlying SQL tables are accessible directly via `php bin/spora db:reset` etc.

## Performance

**Q: How fast is Spora?**

For single-instance deployments, the bottleneck is the LLM API call (200-2000 ms typical), not the framework. Spora's per-turn overhead is ~10-50 ms (DB write, history append, tool dispatch). The async worker mode (`SPORA_SYNC_MODE=false`) lets multiple tasks run concurrently on a single host.

**Q: Can Spora run on a Raspberry Pi?**

Yes for SQLite + small local models. No for hosted Claude/GPT-4 at production scale — the LLM provider's rate limits become the bottleneck before Spora does.

**Q: How many concurrent agents can run?**

Bounded by `SPORA_MAX_WORKERS` (default 0 = unlimited) and your database's connection pool. SQLite handles single-writer; MySQL handles many concurrent writers. The single-instance `flock` lock at `storage/spora-worker.lock` ensures only one worker process per host.

## Operations

**Q: How do I update Spora?**

`composer update spora-ai/spora-core` (and `spora-frontend` if you have it as a path repo), then `php bin/spora spora:install` to apply any new migrations. No downtime if you use worker mode; brief downtime for sync mode.

**Q: How do I back up Spora?**

For SQLite: copy `storage/database.sqlite` + `storage/secret.key` + `.env`. For MySQL: `mysqldump` + `storage/secret.key` + `.env`. See [Backups](/start/operators/backups) for the full strategy.

**Q: Can I run Spora on Kubernetes?**

Yes — there's no Spora-specific K8s operator, but a Deployment + Service + PVC + a worker Deployment works. Use the [Docker — multi-container](/deploy/docker/multi-container) image as the base. The single-instance `flock` is a per-host constraint — run one worker per node, scale horizontally by adding nodes.

## Licensing

**Q: What license is Spora under?**

MIT. See [License](/about/license).

**Q: Can I use Spora commercially?**

Yes. MIT permits commercial use, modification, and distribution, with attribution.

**Q: Are the plugins under the same license?**

Each plugin is independently licensed. The Spora org plugins are all MIT, but third-party plugins can be any OSI-approved license.

## What's next

- [Roadmap](/about/roadmap) — what we're building next
- [License](/about/license) — MIT, with attribution
- [Contribute](/contribute/) — file issues, send PRs
