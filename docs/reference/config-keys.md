---
title: Config keys
description: config.php reference — every key, its env-var equivalent, default, and purpose.
---

# Config keys

`config.php` is one of four layers of runtime configuration. **The database wins** — a value an
admin saved at **Settings → Runtime settings** overrides both this file and the environment. Env
vars beat `config.php`, which beats the built-in defaults.

On a shared host `config.php` is often the only file an operator can edit. That used to mean it
was also the only place to configure the instance, and it no longer is.

For the canonical env-var list (the source of truth), see [Environment variables](/start/operators/env-vars). This page covers the `config.php` keys that map to those env vars.

## Resolution priority

```text
built-in default  (app/Settings/SettingDeclarations.php)
  < config.php   (nested legacy keys, or flat SPORA_*)
    < .env / OS environment
      < the `settings` table   (Settings → Runtime settings)
```

Last wins. A key present in `config.php` in both shapes resolves to the **flat** `SPORA_*` one,
so rewriting a file never breaks a deploy.

If `SPORA_DB_HOST` is set in `.env`, it wins. If `config.php` has `'db_host' => '127.0.0.1'` but no env var, the config wins. The registry default in `app/Settings/SettingDeclarations.php` is the last resort.

## System mail (SMTP)

Set `SPORA_MAIL_DRIVER=smtp` to send Spora's system messages through an SMTP submission server. Keep `SPORA_MAIL_HOST` as a hostname only; do not include `smtp://` or `ssl://`.

| Variable                | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `SPORA_MAIL_HOST`       | SMTP server hostname                                             |
| `SPORA_MAIL_PORT`       | SMTP port; normally `587` for STARTTLS or `465` for implicit TLS |
| `SPORA_MAIL_USERNAME`   | SMTP username                                                    |
| `SPORA_MAIL_PASSWORD`   | SMTP password or provider app password                           |
| `SPORA_MAIL_ENCRYPTION` | `tls` for STARTTLS, or `ssl` for implicit TLS                    |
| `SPORA_MAIL_FROM`       | Sender address                                                   |
| `SPORA_MAIL_FROM_NAME`  | Sender display name                                              |

| SMTP port | Encryption | Connection mode                      |
| --------- | ---------- | ------------------------------------ |
| `587`     | `tls`      | SMTP greeting, then STARTTLS upgrade |
| `465`     | `ssl`      | TLS established immediately (SMTPS)  |

Do not use `ssl` on port `587`: the server expects an SMTP greeting before STARTTLS, so an immediate TLS handshake fails with OpenSSL's `wrong version number`.

Example for STARTTLS:

```dotenv
SPORA_MAIL_DRIVER=smtp
SPORA_MAIL_HOST=smtp.example.com
SPORA_MAIL_PORT=587
SPORA_MAIL_USERNAME=user@example.com
SPORA_MAIL_PASSWORD=app-password
SPORA_MAIL_ENCRYPTION=tls
SPORA_MAIL_FROM=user@example.com
SPORA_MAIL_FROM_NAME=Spora
```

Example for implicit TLS:

```dotenv
SPORA_MAIL_DRIVER=smtp
SPORA_MAIL_HOST=smtp.example.com
SPORA_MAIL_PORT=465
SPORA_MAIL_USERNAME=user@example.com
SPORA_MAIL_PASSWORD=app-password
SPORA_MAIL_ENCRYPTION=ssl
SPORA_MAIL_FROM=user@example.com
SPORA_MAIL_FROM_NAME=Spora
```

| Key                           | Env var                                             | Default                               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app_url`                     | `SPORA_APP_URL`                                     | auto-detected                         | Public URL of the instance (used for email links). Precedence: `config.php` `app_url` → `SPORA_APP_URL` env var → web-server `HTTP_HOST`/`SERVER_NAME` → `http://localhost`. See [Environment variables](/start/operators/env-vars#application) for the resolution order and the no-`X-Forwarded-*` trust guarantee. Set via `config.php` for shared hosting where the env var is harder to manage.                                                                                                                                                                      |
| `app_prefix`                  | `SPORA_APP_PREFIX`                                  | `/spora`                              | Path prefix Spora is mounted under. **Default is `/spora`** because the admin UI ships under `public/spora/` and plugins ship under `public/plugins/<name>/` — the host root is reserved for operators who develop their own frontend. Normalised: leading/trailing slashes stripped, bare `/` collapses to empty. Set `SPORA_APP_PREFIX=""` to opt out and run at the host root. Used for verification / password-reset email links. Set via `config.php` (`app_prefix => '/spora'`) for shared hosting.                                                                |
| `app_env`                     | `SPORA_APP_ENV`                                     | `development`                         | `development` or `production`. Affects error reporting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `allow_registration`          | `SPORA_ALLOW_REGISTRATION`                          | `true`                                | Whether `POST /api/v1/auth/register` is open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `default_lang`                | `SPORA_DEFAULT_LANG`                                | `en`                                  | The language the instance renders in for people who have not chosen one of their own: `en` or `de`. A user's own choice wins over it, and `Accept-Language` is never consulted. See [Environment variables](/start/operators/env-vars#application).                                                                                                                                                                                                                                                                                                                      |
| `secret_key`                  | `SPORA_SECRET_KEY`                                  | —                                     | Base64 32-byte master key for encrypting tool credentials. **Required** in production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `key_path`                    | `SPORA_KEY_PATH`                                    | `storage/secret.key` (auto-generated) | Path to the key file (alternative to inline `secret_key`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `db_driver`                   | `SPORA_DB_DRIVER`                                   | `sqlite`                              | `sqlite`, `mysql`, or `mariadb`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `db_host`                     | `SPORA_DB_HOST`                                     | `127.0.0.1`                           | MySQL/MariaDB host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `db_port`                     | `SPORA_DB_PORT`                                     | `3306`                                | MySQL/MariaDB port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `db_name`                     | `SPORA_DB_NAME`                                     | `spora`                               | Database name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `db_user`                     | `SPORA_DB_USER`                                     | `spora`                               | Database user.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `db_password`                 | `SPORA_DB_PASSWORD`                                 | —                                     | Database password.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `sqlite_busy_timeout`         | `SPORA_SQLITE_BUSY_TIMEOUT`                         | `5000`                                | SQLite wait time when locked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `worker_runtime_mode`         | `SPORA_WORKER_RUNTIME_MODE`                         | `server`                              | Runtime mode. `server` = daemon drains the queue. `client` = browser `SharedWorker` ticks tasks the user ran. See [Deployment modes](/reference/concepts/deployment-modes).                                                                                                                                                                                                                                                                                                                                                                                              |
| `tick_lease_seconds`          | `SPORA_TICK_LEASE_SECONDS`                          | `600`                                 | **Client-mode only.** Lease TTL (seconds) for in-flight ticks. Written by `TaskTickController::tick` and `ScheduledRunProcessor::dispatchAndTick`; extended at every orchestrator step boundary. Server-mode daemon paths skip the lease entirely (single PHP process owns the task), so this value is read but never consulted in server mode.                                                                                                                                                                                                                          |
| `worker_stale_minutes`        | `SPORA_WORKER_STALE_MINUTES`                        | `60`                                  | Minutes before a `RUNNING` task is reaped. In client mode this applies after the lease has expired; in server mode (no lease granted) it applies directly to `updated_at`. Set to `0` to disable the reaper.                                                                                                                                                                                                                                                                                                                                                             |
| —                             | `SPORA_WORKER_CLIENT_HOUSEKEEPING_INTERVAL_SECONDS` | `300`                                 | Seconds between the housekeeping calls the browser's `SharedWorker` makes to `/api/v1/worker/housekeeping` — the call that reaps orphaned tasks and dispatches the scheduled runs and the plugin-owned work that are due. A shorter interval notices due work sooner and costs more requests. Never below 10 seconds: the endpoint allows 6 calls a minute per user, so a shorter interval is answered with `429`. Has no `config.php` key of its own — the only spelling `config.php` accepts is the flat `'SPORA_WORKER_CLIENT_HOUSEKEEPING_INTERVAL_SECONDS' => 300`. |
| `max_workers`                 | `SPORA_MAX_WORKERS`                                 | `0` (unlimited)                       | Max concurrent child processes in daemon mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `llm_timeout`                 | `SPORA_LLM_TIMEOUT`                                 | `300`                                 | Seconds for LLM API calls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tool_http_timeout`           | `SPORA_TOOL_HTTP_TIMEOUT`                           | `30`                                  | Seconds for tool HTTP requests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `mercure_url`                 | `SPORA_MERCURE_URL`                                 | —                                     | Public Mercure hub URL for SSE.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `mercure_publish_url`         | `SPORA_MERCURE_PUBLISH_URL`                         | falls back to `mercure_url`           | Publisher endpoint (override for Docker internal vs public).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mercure_jwt_key`             | `SPORA_MERCURE_JWT_KEY`                             | —                                     | HS256 shared secret for Mercure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `log_level`                   | `SPORA_LOG_LEVEL`                                   | `warning`                             | `debug`, `info`, `warning`, `error`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `log_path`                    | `SPORA_LOG_PATH`                                    | `storage/spora.log`                   | Log file path. `stdout` for supervisor / container logging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `notifications_email_enabled` | `SPORA_NOTIFICATIONS_EMAIL_ENABLED`                 | `true`                                | Send email when scheduled run completes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| —                             | `SPORA_AGENT_API`                                   | `false`                               | Mounts the per-agent `/api/v1/agent-api/*` surface. Needs a server-side worker; `404` otherwise. Keys live in the agent's Settings → API keys section. See [Agent API](/reference/agent-api). Has no `config.php` key of its own — the only spelling `config.php` accepts is the flat `'SPORA_AGENT_API' => true`.                                                                                                                                                                                                                                                       |
| —                             | `SPORA_AGENT_API_RATE_LIMIT_MAX`                    | `60`                                  | Requests per minute per Agent API key before `429`. Has no config.php key of its own — it is read straight from the env var or the stored setting.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `plugin_install_enabled`      | `SPORA_PLUGIN_INSTALL_ENABLED`                      | `false`                               | Enable Web UI for plugin install / uninstall / update.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `composer_binary`             | `SPORA_COMPOSER_BINARY`                             | `composer`                            | Path to the `composer` executable used by the plugin manager. Absolute paths ending in `.phar` are auto-prefixed with `php`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `plugin_catalog_enabled`      | `SPORA_PLUGIN_CATALOG_ENABLED`                      | `true`                                | Show the Browse tab in `/apps/plugins` and enable `GET /api/v1/plugins/catalog`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `plugin_catalog_ttl`          | `SPORA_PLUGIN_CATALOG_TTL`                          | `3600`                                | Cache TTL (seconds) for the on-disk Packagist cache.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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

    'worker_runtime_mode' => 'server',
    'tick_lease_seconds' => 600,
    'worker_stale_minutes' => 90,

    'mercure_url' => 'https://mercure.example.com/.well-known/mercure',
    'mercure_jwt_key' => 'set-via-env-or-fail-loudly',

    'log_level' => 'info',
    'log_path' => 'storage/spora.log',

    'plugin_install_enabled' => true,
];
```

Anything not set falls back to the built-in default from `app/Settings/SettingDeclarations.php`. Anything set via `SPORA_*` env vars wins over the file, and anything an admin saved in the database wins over both.

## Docker-only variables

The following have no `config.php` mapping — FrankenPHP / Caddy reads them directly (not the `SPORA_*` resolver) and only applies them in container deployments.

| Env var       | Default | Purpose                                                                                                                                                       |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERVER_NAME` | —       | Caddy listens on this address and auto-issues Let's Encrypt when it's a public domain. Set `localhost:80` for development, your public domain for production. |

See [Environment variables → SERVER_NAME](/start/operators/env-vars#server-name) and the [Docker deploy guides](/deploy/docker/multi-container) for context.

## Editing `config.php` after install

`config.php` is read on every request via the `config()` helper. Changes take effect immediately — no `php bin/spora` command needed. For long-running worker daemons, the running process keeps the old config in memory; restart the worker (`supervisorctl restart spora-worker`) to pick up changes.

## What's next

- [Environment variables](/start/operators/env-vars) — the canonical env-var reference (this page maps to it)
- [Plugin schema](/reference/plugin-schema) — the `plugin.json` manifest spec
- [CLI reference](/reference/cli) — every `bin/spora` command
- [REST API reference](/reference/api) — the HTTP surface
