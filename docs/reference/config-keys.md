---
title: Config keys
description: config.php reference — every key, its env-var equivalent, default, and purpose.
---

# Config keys

`config.php` is the file-based fallback for runtime configuration. **Env vars take priority** — `SPORA_*` env vars are read first, then `config.php`, then built-in defaults. On a shared host, the operator typically edits `config.php`; on Docker / VPS, env vars are the canonical source.

For the canonical env-var list (the source of truth), see [Environment variables](/start/operators/env-vars). This page covers the `config.php` keys that map to those env vars.

## Resolution priority

```text
OS environment variable (SPORA_FOO)
  → .env file (loaded by vlucas/phpdotenv)
    → config.php (the 'foo' key, if present)
      → built-in default (in ContainerDefinitions)
```

If `SPORA_DB_HOST` is set in `.env`, it wins. If `config.php` has `'db_host' => '127.0.0.1'` but no env var, the config wins. The default in `ContainerDefinitions.php` is the last resort.

## Keys

| Key                           | Env var                             | Default                               | Purpose                                                                                                                      |
| ----------------------------- | ----------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `app_url`                     | `SPORA_APP_URL`                     | auto-detected                         | Public URL of the instance (used for email links).                                                                           |
| `app_env`                     | `SPORA_APP_ENV`                     | `development`                         | `development` or `production`. Affects error reporting.                                                                      |
| `allow_registration`          | `SPORA_ALLOW_REGISTRATION`          | `true`                                | Whether `POST /api/v1/auth/register` is open.                                                                                |
| `secret_key`                  | `SPORA_SECRET_KEY`                  | —                                     | Base64 32-byte master key for encrypting tool credentials. **Required** in production.                                       |
| `key_path`                    | `SPORA_KEY_PATH`                    | `storage/secret.key` (auto-generated) | Path to the key file (alternative to inline `secret_key`).                                                                   |
| `db_driver`                   | `SPORA_DB_DRIVER`                   | `sqlite`                              | `sqlite` or `mysql`.                                                                                                         |
| `db_host`                     | `SPORA_DB_HOST`                     | `127.0.0.1`                           | MySQL/MariaDB host.                                                                                                          |
| `db_port`                     | `SPORA_DB_PORT`                     | `3306`                                | MySQL/MariaDB port.                                                                                                          |
| `db_name`                     | `SPORA_DB_NAME`                     | `spora`                               | Database name.                                                                                                               |
| `db_user`                     | `SPORA_DB_USER`                     | `spora`                               | Database user.                                                                                                               |
| `db_password`                 | `SPORA_DB_PASSWORD`                 | —                                     | Database password.                                                                                                           |
| `sqlite_busy_timeout`         | `SPORA_SQLITE_BUSY_TIMEOUT`         | `5000`                                | SQLite wait time when locked.                                                                                                |
| `worker_mode`                 | `SPORA_SYNC_MODE`                   | `true`                                | `true` = inline (sync), `false` = queued (worker).                                                                           |
| `worker_stale_minutes`        | `SPORA_WORKER_STALE_MINUTES`        | `60`                                  | Minutes before a `RUNNING` task is treated as orphaned.                                                                      |
| `max_workers`                 | `SPORA_MAX_WORKERS`                 | `0` (unlimited)                       | Max concurrent child processes in daemon mode.                                                                               |
| `llm_timeout`                 | `SPORA_LLM_TIMEOUT`                 | `300`                                 | Seconds for LLM API calls.                                                                                                   |
| `tool_http_timeout`           | `SPORA_TOOL_HTTP_TIMEOUT`           | `30`                                  | Seconds for tool HTTP requests.                                                                                              |
| `mercure_url`                 | `SPORA_MERCURE_URL`                 | —                                     | Public Mercure hub URL for SSE.                                                                                              |
| `mercure_publish_url`         | `SPORA_MERCURE_PUBLISH_URL`         | falls back to `mercure_url`           | Publisher endpoint (override for Docker internal vs public).                                                                 |
| `mercure_jwt_key`             | `SPORA_MERCURE_JWT_KEY`             | —                                     | HS256 shared secret for Mercure.                                                                                             |
| `log_level`                   | `SPORA_LOG_LEVEL`                   | `warning`                             | `debug`, `info`, `warning`, `error`.                                                                                         |
| `log_path`                    | `SPORA_LOG_PATH`                    | `storage/spora.log`                   | Log file path. `stdout` for supervisor / container logging.                                                                  |
| `notifications_email_enabled` | `SPORA_NOTIFICATIONS_EMAIL_ENABLED` | `false`                               | Send email when scheduled run completes.                                                                                     |
| `plugin_install_enabled`      | `SPORA_PLUGIN_INSTALL_ENABLED`      | `false`                               | Enable Web UI for plugin install / uninstall / update.                                                                       |
| `plugins_paths`               | `SPORA_PLUGINS_PATHS`               | `[<base>/plugins]`                    | Comma-separated additional plugin scan paths.                                                                                |
| `composer_binary`             | `SPORA_COMPOSER_BINARY`             | `composer`                            | Path to the `composer` executable used by the plugin manager. Absolute paths ending in `.phar` are auto-prefixed with `php`. |
| `plugin_catalog_enabled`      | `SPORA_PLUGIN_CATALOG_ENABLED`      | `true`                                | Show the Browse tab in `/apps/plugins` and enable `GET /api/v1/plugins/catalog`.                                             |
| `plugin_catalog_ttl`          | `SPORA_PLUGIN_CATALOG_TTL`          | `3600`                                | Cache TTL (seconds) for the on-disk Packagist cache.                                                                         |

For per-tool settings (e.g. Tavily `api_key`, Anthropic `api_key`), see [Concepts → Tool system → Setting cascade](/reference/concepts/tools).

## Example `config.php`

```php
<?php

declare(strict_types=1);

return [
    'app_env' => 'production',
    'allow_registration' => false,

    'db_driver' => 'mysql',
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'spora',
    'db_user' => 'spora',
    'db_password' => 'set-via-env-or-fail-loudly',

    'worker_mode' => false,
    'worker_stale_minutes' => 90,

    'mercure_url' => 'https://mercure.example.com/.well-known/mercure',
    'mercure_jwt_key' => 'set-via-env-or-fail-loudly',

    'log_level' => 'info',
    'log_path' => 'storage/spora.log',

    'plugin_install_enabled' => true,
];
```

Anything not set falls back to the built-in default from `app/Core/ContainerDefinitions.php`. Anything set via `SPORA_*` env vars wins over the file.

## Editing `config.php` after install

`config.php` is read on every request via the `config()` helper. Changes take effect immediately — no `php bin/spora` command needed. For long-running worker daemons, the running process keeps the old config in memory; restart the worker (`supervisorctl restart spora-worker`) to pick up changes.

## What's next

- [Environment variables](/start/operators/env-vars) — the canonical env-var reference (this page maps to it)
- [Plugin schema](/reference/plugin-schema) — the `plugin.json` manifest spec
- [CLI reference](/reference/cli) — every `bin/spora` command
- [REST API reference](/reference/api) — the HTTP surface
