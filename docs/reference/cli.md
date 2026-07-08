---
title: CLI reference
description: Complete bin/spora command catalog with options, examples, and source pointers.
---

# CLI reference

`bin/spora` is the single CLI entry point. Every operational task — install, plugin management, database ops, worker control, asset cleanup, media archiving — is a subcommand.

For the developer-oriented view (the same commands + the dev workflow, testing, and coding standards), see [Developers → CLI & coding standards](/start/developers/cli-and-coding-standards).

## Getting help

```bash
php bin/spora              # List top-level commands
php bin/spora list         # Same as above
php bin/spora help <cmd>   # Help for a specific command, with options
```

## Commands

| Command                      | Description                                                                                                                                                                          | Source                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `spora:install`              | Apply database migrations (idempotent — safe to re-run after any new migration ships). Equivalent to `php artisan migrate`.                                                          | `app/Console/Commands/InstallCommand.php`               |
| `spora:setup`                | Run migrations and seed a fresh database, or skip seeding on existing installs. Used by the Docker entrypoint.                                                                       | `app/Console/Commands/SetupCommand.php`                 |
| `db:reset`                   | Wipe the database (SQLite file or MySQL DROP+CREATE) and clear the schema stamp. Prompts unless `--force` is given.                                                                  | `app/Console/Commands/DbResetCommand.php`               |
| `db:seed`                    | Seed database with sample data (idempotent — skips itself if users/agents already exist).                                                                                            | `app/Console/Commands/SeedCommand.php`                  |
| `plugin:install <package>`   | Install a plugin from Packagist. Accepts `--path=/abs/path` for sibling-clone dev workflows, and `--constraint=<semver>` for pinning.                                                | `app/Console/Commands/PluginInstallCommand.php`         |
| `plugin:uninstall <package>` | Remove a plugin via Composer. Does **not** roll back plugin-specific migrations.                                                                                                     | `app/Console/Commands/PluginUninstallCommand.php`       |
| `plugin:update [<package>]`  | Update one plugin, or all when no argument is given.                                                                                                                                 | `app/Console/Commands/PluginUpdateCommand.php`          |
| `plugin:list`                | List installed `spora-plugin` packages with version and path. Non-plugin dependencies (e.g. `symfony/console`) are filtered out.                                                     | `app/Console/Commands/PluginListCommand.php`            |
| `worker:run`                 | Run async worker. Default = daemon; `--once` for cron; `--once --include-queue` for full cron replacement; `--reap-only` for orphan reaping; `--scheduled` for scheduled tasks only. | `app/Console/Commands/WorkerRunCommand.php`             |
| `task:run`                   | Run a single task synchronously (debugging).                                                                                                                                         | `app/Console/Commands/TaskRunCommand.php`               |
| `media:archive:list`         | List archived media.                                                                                                                                                                 | `app/Console/Commands/MediaArchiveListCommand.php`      |
| `media:archive:gc`           | Garbage-collect archived media past retention.                                                                                                                                       | `app/Console/Commands/MediaArchiveGcCommand.php`        |
| `assets:gc`                  | Garbage-collect unreferenced assets.                                                                                                                                                 | `app/Console/Commands/AssetGcCommand.php`               |
| `tool:settings:migrate`      | One-shot tool settings migration (used when the settings schema changes).                                                                                                            | `app/Console/Commands/ToolSettingsMigrationCommand.php` |

The `spora:` prefix is convention for the framework-level commands (`spora:install`, `spora:setup`). Plugin commands are unprefixed (`plugin:install`, `plugin:list`). Older docs sometimes use the prefixed form for plugin commands; both work in current versions.

## Common options

| Option                  | Applies to          | Purpose                                                   |
| ----------------------- | ------------------- | --------------------------------------------------------- |
| `--force`               | `db:reset`          | Skip the interactive confirm prompt                       |
| `--path=<dir>`          | `plugin:install`    | Install from a local path repo (Composer path repository) |
| `--constraint=<semver>` | `plugin:install`    | Pin to a semver constraint instead of `^x.y`              |
| `--once`                | `worker:run`        | Process one batch and exit (cron mode)                    |
| `--include-queue`       | `worker:run --once` | Also drain the task queue, not just scheduled runs        |
| `--reap-only`           | `worker:run`        | Reap orphaned `RUNNING` tasks only (no queue work)        |
| `--scheduled`           | `worker:run`        | Scheduled runs only (no task queue)                       |
| `--stale-minutes=<N>`   | `worker:run`        | Override `SPORA_WORKER_STALE_MINUTES` (default 60)        |
| `--limit=<N>`           | `worker:run`        | Max tasks per poll cycle (0 = unlimited)                  |

## Exit codes

| Code             | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `0`              | Success                                                                                  |
| `1`              | Generic failure (catch-all)                                                              |
| `2`              | Input validation failure (e.g. `db:reset` without `--force` and the prompt was rejected) |
| `64` (EX_USAGE)  | Reserved for command-line syntax errors                                                  |
| `78` (EX_CONFIG) | Reserved for config / env errors                                                         |

The CLI uses Symfony Console's standard exit codes. Tools that fail return `1` and print a stack trace at verbosity `-vv`.

## Verbosity

```bash
php bin/spora plugin:install vendor/pkg -v      # INFO
php bin/spora plugin:install vendor/pkg -vv     # DEBUG (stack traces)
php bin/spora plugin:install vendor/pkg -q      # Quiet
```

The dev workflow uses `-vv` to debug. Production cron jobs use the default (no flags) for clean log lines.

## Cron examples

The canonical cron schedule for a single-host deployment:

```cron
# Drain the task queue every minute
* * * * * cd /home/spora && /usr/bin/php bin/spora worker:run --once --include-queue >> storage/spora.log 2>&1
```

For the operator-facing workflows (install, plugin management, log tail), see [Operations → Day-2 ops](/start/operators/operations).

## What's next

- [REST API reference](/reference/api) — the HTTP surface
- [Config keys](/reference/config-keys) — the `config.php` reference
- [Plugin schema](/reference/plugin-schema) — the `plugin.json` manifest spec
- [Operations → Day-2 ops](/start/operators/operations) — operator workflows
