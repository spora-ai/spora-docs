---
title: Environment variables
description: Full reference for every SPORA_* environment variable Spora reads at boot.
---

## Spora Environment Variables

This is the **canonical reference** for every `SPORA_*` environment variable Spora reads at boot. Both the [Deployment modes](/reference/concepts/deployment-modes) and [Worker deployment](/reference/concepts/worker-deployment) pages cross-link to this doc for env-var details.

**Resolution priority:** OS env → `.env` → `config.php` (gitignored) → built-in defaults. `SPORA_*` env vars always take highest priority. See the [Architecture overview](/reference/concepts/architecture) for the full config-priority chain.

**Quick links:** [SERVER_NAME](#server_name) · [Application](#application) · [Encryption](#encryption) · [Database](#database) · [Worker runtime mode](#worker-runtime-mode) · [Timeouts](#timeouts) · [Mercure (SSE)](#mercure-sse) · [Logging](#logging) · [Notifications / Mail](#notifications--mail) · [Plugins](#plugins) · [Config path](#config-path)

## SERVER_NAME

| Variable      | Default | Config key | Description                                                                                                                                                                                                                      |
| ------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERVER_NAME` | —       | —          | Read by FrankenPHP / Caddy. Not a `SPORA_*` env var — set it directly in `.env` / Compose. In development set `localhost:80`; in production set the public domain so Caddy auto-issues Let's Encrypt and redirects HTTP → HTTPS. |

## Application

| Variable                   | Default       | Config key           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_APP_URL`            | auto-detected | `app_url`            | Full public URL of this instance, including non-standard port. Used for verification / password-reset email links. Resolution order — first wins: `config.php` `app_url` → `SPORA_APP_URL` env var → the request's `HTTP_HOST` → the web server's `SERVER_NAME` (Apache `ServerName`) → `http://localhost`. **Never reads `X-Forwarded-*` headers** — those are spoofable and Spora has no trusted-proxy allowlist. Operators behind a reverse proxy that rewrites `Host` MUST set this. For shared hosting where the env var is awkward, set it in `config.php` instead. |
| `SPORA_APP_PREFIX`         | `/spora`      | `app_prefix`         | Path prefix Spora is mounted under. **Default is `/spora`** because the admin UI ships under `public/spora/` and plugins ship under `public/plugins/<name>/`. Operators running Spora at the host root (e.g. when developing their own frontend) MUST set `SPORA_APP_PREFIX=""` to opt out. Leading/trailing slashes are stripped; bare `/` collapses to empty. Prepended to email-link paths (verification, password reset). For shared hosting, set `app_prefix => '/spora'` in `config.php` instead.                                                                   |
| `SPORA_APP_ENV`            | `development` | `app_env`            | `development` or `production`. Read at `app/Core/container.php:104`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SPORA_ALLOW_REGISTRATION` | `true`        | `allow_registration` | Whether `POST /api/v1/auth/register` is open. Set to `false` once you have created your account.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Encryption

| Variable           | Default                                                                                          | Config key | Description                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_SECRET_KEY` | —                                                                                                | —          | **Base64-encoded 32-byte master key** for libsodium secretbox encryption of tool credentials. Required for production. Generate: `php -r "echo base64_encode(random_bytes(32));"`. Never commit. Losing it means losing access to encrypted settings. |
| `SPORA_KEY_PATH`   | `storage/secret.key` (auto-generated by `php bin/spora spora:install` / `php bin/spora db:seed`) | `key_path` | Alternative: path to a 32-byte binary key file. Overrides the default install path. On a fresh checkout, the key is auto-generated the first time you run `php bin/spora spora:install` or `php bin/spora db:seed`.                                   |

See [Security](/start/operators/security) for the full key-resolution chain and algorithm.

## Database

| Variable                    | Default     | Config key            | Description                                               |
| --------------------------- | ----------- | --------------------- | --------------------------------------------------------- |
| `SPORA_DB_DRIVER`           | `sqlite`    | `db_driver`           | `sqlite` (zero-config) or `mysql`.                        |
| `SPORA_DB_HOST`             | `127.0.0.1` | `db_host`             | MySQL/MariaDB host.                                       |
| `SPORA_DB_PORT`             | `3306`      | `db_port`             | MySQL/MariaDB port.                                       |
| `SPORA_DB_NAME`             | `spora`     | `db_name`             | MySQL/MariaDB database name.                              |
| `SPORA_DB_USER`             | `spora`     | `db_user`             | MySQL/MariaDB user.                                       |
| `SPORA_DB_PASSWORD`         | —           | `db_password`         | MySQL/MariaDB password.                                   |
| `SPORA_SQLITE_BUSY_TIMEOUT` | `5000`      | `sqlite_busy_timeout` | SQLite only. Wait time in ms when the database is locked. |

SQLite path is set in `config.php` (defaults to `storage/database.sqlite`).

The DB driver is selected by `SPORA_DB_DRIVER` (`sqlite` or `mysql`) and is also what `php bin/spora db:reset` reads to decide whether to wipe the local SQLite file or run `DROP DATABASE` + `CREATE DATABASE` on the configured MySQL server. See [Install](/start/operators/install#troubleshooting) for the destructive `db:reset` flow.

## Worker runtime mode

Spora has two runtime modes — `server` (a daemon drains the queue) and `client` (the browser's `SharedWorker` drives the user's own tasks). For the full three-configuration overview (server + Mercure, server + polling, client + polling), see [Deployment modes](/reference/concepts/deployment-modes).

| Variable                     | Default  | Config key             | Description                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_WORKER_RUNTIME_MODE`  | `server` | `worker_runtime_mode`  | `server` = `bin/spora worker:run` drains the queue (daemon or cron). `client` = the browser's `SharedWorker` calls `/api/v1/tasks/{id}/tick` for tasks the user ran. Default is `server`; set to `client` for shared hosts without a daemon. A future curated `spora-shared` skeleton will ship with `client` as its baked-in default. |
| `SPORA_TICK_LEASE_SECONDS`   | `600`    | `tick_lease_seconds`   | Lease TTL (seconds) for in-flight ticks. Set on the claim transaction, extended on every step boundary inside `Orchestrator::tick()`. The reaper flips a row to `FAILED` with `error_code: WORKER_DISCONNECTED` once the lease expires + `SPORA_WORKER_STALE_MINUTES` elapses with no progress.                                        |
| `SPORA_WORKER_STALE_MINUTES` | `60`     | `worker_stale_minutes` | Grace period (minutes) before an expired-lease `RUNNING` task is reaped. Should exceed worst-case LLM round-trip time. Set to `0` to disable the reaper.                                                                                                                                                                               |
| `SPORA_MAX_WORKERS`          | `0`      | `max_workers`          | Max concurrent child processes in daemon mode (0 = unlimited). No effect in `client` mode — the browser handles concurrency per tab.                                                                                                                                                                                                   |

> **Default mode.** `spora-ai/spora` ships `worker_runtime_mode: server` as the safe default for Docker/VPS/classical-server operators who run the daemon. For shared-host operators without shell access to run a long-lived PHP process, set `SPORA_WORKER_RUNTIME_MODE=client` in `.env`. There is one Composer package today; a curated `spora-shared` skeleton (client-default out of the box, no `docker/`/`supervisord.conf`/Mercure) is on the roadmap. See [Installation modes](/start/operators/installation-modes) for the one-screen picker.
>
> **Removed in 0.19.0: `SPORA_SYNC_MODE`.** Pre-0.19 used a boolean `SPORA_SYNC_MODE` (`true` = inline / dev, `false` = queued / worker). The boolean is gone. To get the inline-tick behaviour pre-0.19 operators got from `SPORA_SYNC_MODE=true`, run with `SPORA_WORKER_RUNTIME_MODE=server` and either invoke `php bin/spora worker:run --daemon` (a request's task is picked up on the next polling cycle) or use the dev-mode `bin/spora` CLI's direct task runner. The HTTP request always returns once the task is `QUEUED`; the worker drives the result. For shared hosts, set `SPORA_WORKER_RUNTIME_MODE=client` in `.env` instead.

See [Worker deployment](/reference/concepts/worker-deployment) for server-mode cron / daemon / supervisord / systemd patterns and the `--stale-minutes` / `--workers` CLI flag overrides. See [Client-worker mode](/deploy/shared-host/client-worker-mode) for the client-mode shared-host guide, lease semantics, and browser support.

## Timeouts

| Variable                  | Default | Config key          | Description                                                                                                                                                             |
| ------------------------- | ------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_LLM_TIMEOUT`       | `300`   | `llm_timeout`       | Seconds for LLM API calls. Reasoning models may need 300+.                                                                                                              |
| `SPORA_TOOL_HTTP_TIMEOUT` | `30`    | `tool_http_timeout` | Seconds for tool HTTP requests (web search, calendars, etc.). Per-tool overrides via the `http_timeout` setting on each tool's `#[ToolSetting]` in agent tool settings. |

## Mercure (SSE)

| Variable                    | Default                           | Config key            | Description                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_MERCURE_URL`         | —                                 | `mercure_url`         | Public Mercure hub URL the browser subscribes to. Omit to disable SSE.                                                                                                                                                                                                                                                                                                           |
| `SPORA_MERCURE_PUBLISH_URL` | falls back to `SPORA_MERCURE_URL` | `mercure_publish_url` | Publisher endpoint. In Docker with a public `SERVER_NAME`, use `http://localhost:80/.well-known/mercure` (loopback) so the in-container POST matches the Caddy site address. Avoid `http://spora:80/...` (bakes the docker-compose service name into the image) and `http://localhost/...` (no port → Caddy auto-HTTPS redirects to a port the in-container client can't reach). |
| `SPORA_MERCURE_JWT_KEY`     | —                                 | `mercure_jwt_key`     | HS256 shared secret for Mercure publisher and subscriber tokens.                                                                                                                                                                                                                                                                                                                 |

When all three are unset, `MercurePublisher::publish()` early-returns and the frontend falls back to polling. See [Agent loop and async mode](/reference/concepts/agent-loop-async) for the SSE topic model.

## Logging

| Variable          | Default             | Config key  | Description                                                                                                                                                          |
| ----------------- | ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_LOG_LEVEL` | `warning`           | `log_level` | `debug` \| `info` \| `warning` \| `error`. Tool arguments (potentially PII) are logged at `DEBUG` — use `info` or higher in production.                              |
| `SPORA_LOG_PATH`  | `storage/spora.log` | `log_path`  | Docker deployments should set `stdout` so records stream to the container's log driver. The framework default `storage/spora.log` is the env-less LAMP/FTP fallback. |

Note: `storage/php.log` is **not** produced by Spora's logger. In local dev it is the redirected stdout/stderr of the PHP built-in server started by `bin/dev`. In production Spora does not configure the PHP `error_log` directive; set it via `php.ini` / supervisord / your container entrypoint if needed. See [Logging](/reference/concepts/logging).

## Notifications / Mail

| Variable                            | Default | Config key                    | Description                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_NOTIFICATIONS_EMAIL_ENABLED` | `false` | `notifications_email_enabled` | Send an email when a scheduled run completes. Requires the `SPORA_MAIL_*` block to be configured.                                                                                                                                                                                                                                                                    |
| `SPORA_PLUGIN_INSTALL_ENABLED`      | `false` | `plugin_install_enabled`      | Enable the Web UI for plugin install/uninstall (`POST`/`DELETE`/`PATCH /api/v1/plugins`). When off, the routes return `403 FEATURE_DISABLED`. CLI commands (`php bin/spora plugin:install`, `plugin:uninstall`, `plugin:update`) are **not** gated — they're always available as the operator recovery path. See [Plugin install API](/develop/plugins/install-api). |

Mail transport itself is configured through the `SPORA_MAIL_*` env vars (read by `app/Services/SystemMailer.php:183-190` and `app/Http/MailConfigController.php:22-29`). These are **not** in the default `.env.example`; they are only in `docker/.env.local.example`. The full set is `SPORA_MAIL_DRIVER` / `SPORA_MAIL_HOST` / `SPORA_MAIL_PORT` / `SPORA_MAIL_USERNAME` / `SPORA_MAIL_PASSWORD` / `SPORA_MAIL_ENCRYPTION` / `SPORA_MAIL_FROM` / `SPORA_MAIL_FROM_NAME`.

For SMTP, use a bare hostname in `SPORA_MAIL_HOST`. Pair port `587` with `SPORA_MAIL_ENCRYPTION=tls` for STARTTLS, or port `465` with `SPORA_MAIL_ENCRYPTION=ssl` for implicit TLS/SMTPS. Using `ssl` on port `587` causes OpenSSL `wrong version number` errors because that port expects an SMTP greeting before the TLS upgrade.

## Plugins

| Variable                       | Default    | Config key               | Description                                                                                                                                                                                                   |
| ------------------------------ | ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_COMPOSER_BINARY`        | `composer` | `composer_binary`        | Path to the `composer` executable that the install/uninstall commands shell out to. Absolute paths ending in `.phar` are prefixed with `php` automatically.                                                   |
| `SPORA_PLUGIN_CATALOG_ENABLED` | `true`     | `plugin_catalog_enabled` | When `false`, the Browse tab in `/apps/plugins` is hidden and `GET /api/v1/plugins/catalog` returns `404`. Already-installed plugins are unaffected — only the discovery surface is gated.                    |
| `SPORA_PLUGIN_CATALOG_TTL`     | `3600`     | `plugin_catalog_ttl`     | Cache TTL (seconds) for the on-disk Packagist cache at `storage/.spora_plugin_catalog.json`. Different queries share the file but each gets its own entry keyed by a SHA-256 fingerprint of the query string. |

See [Plugin author guide → Distribution](/develop/plugins/author-guide/distribution#the-spora-plugin-keyword) for what authors need to ship so their plugin shows up under Browse, and [Plugin system](/develop/plugins/concepts) for the runtime side (manifest, auto-discovery).

## Config path

| Variable            | Default                | Config key    | Description                                                                                              |
| ------------------- | ---------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `SPORA_CONFIG_PATH` | (default install path) | `config_path` | Override the location of the `config.php` file. The installer uses this when no `config.php` exists yet. |
