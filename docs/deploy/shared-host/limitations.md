---
title: Shared host — limitations
description: What doesn't work on shared hosts, and the workarounds.
---

# Shared host — limitations

A shared host gives you PHP, FTP/SSH, and a `public_html`-style document root. It does **not** give you root, systemd, Docker, or a way to run long-lived processes. Spora is designed to degrade gracefully under these constraints, but some features are restricted.

## Mercure SSE → falls back to polling

Spora publishes task state changes to a Mercure hub for real-time UI updates (no polling). The `docker/frankenphp.conf` in the canonical Docker image runs Mercure natively on FrankenPHP.

On a shared host, you don't have FrankenPHP or a way to run Mercure. The orchestrator detects this and falls back to polling. Specifically:

- The `MercurePublisher::publish()` method early-returns `false` (logged at debug level) when the `SPORA_MERCURE_URL` env var is not set
- The frontend falls back to polling `/api/v1/tasks/{id}` for state changes

**What you lose:** task state changes appear in the UI after the polling interval (default 5 s), not instantly. For most users this is invisible; for power users with many concurrent agents, it adds latency.

**What to do:** if your host offers a managed Mercure service, set `SPORA_MERCURE_URL` + `SPORA_MERCURE_JWT_KEY` and the publisher activates automatically. If not, ignore — the polling fallback works.

## Worker daemon mode → use cron

`php bin/spora worker:run --daemon` requires a long-lived process. Most shared hosts don't let you run daemons (no `nohup`, no systemd, the host kills background processes when your shell disconnects).

The fallback is `worker:run --once --include-queue` from cron:

```cron
* * * * * cd /home/user/my-spora && /usr/bin/php bin/spora worker:run --once --include-queue >> storage/spora.log 2>&1
```

**What you lose:** if a task takes longer than 60 s, the next cron fire will start a second worker process while the first is still running. The `lockForUpdate()` row lock in the claim transaction prevents double-processing, but you burn 2× CPU and make 2× LLM API calls.

**What to do:** for tasks that regularly exceed 60 s, move to [Classical server](/deploy/classical-server) and run the daemon properly. Otherwise, the cron fallback works fine for small workloads.

## HTTPS termination → the host's responsibility

Spora's Docker image includes a FrankenPHP Caddyfile that can do TLS via ACME (Let's Encrypt). On a shared host, you don't control the web server — the host terminates TLS, usually via:

- **cPanel AutoSSL** (Let's Encrypt, automatic renewal)
- **Plesk SSL** (same)
- **Cloudflare proxy** (if you put the host behind Cloudflare)

Spora's `SPORA_APP_URL` env var should match the public HTTPS URL so verification emails, password-reset links, and CSRF checks use the right origin. If the host uses a proxy that changes the host header, configure that on the host's reverse proxy.

## No Docker

If you need to deploy a custom build of Spora (your own fork, additional extensions, custom branding), the shared host path doesn't work. You need:

- A **VPS** with Docker (use [Docker — multi-container](/deploy/docker/multi-container) or [Docker — custom build](/deploy/docker/custom-build))
- A **classical server** ([Classical server](/deploy/classical-server))
- A **PaaS** that supports Docker (Fly.io, Render, Railway, etc.)

## Filesystem limitations

Most shared hosts have per-user disk quotas (1-50 GB). Spora's storage footprint is small by default:

- SQLite DB: grows with conversations, agents, and plugin data — typically 1-100 MB
- Secret key: 32 bytes (one-time)
- Logs: 1-10 MB/day at moderate traffic
- Frontend assets: 5-10 MB (prebuilt, static)

If you have many plugins with high LLM traffic, logs can grow. Set up log rotation via the host's control panel (most cPanels have a "log rotation" tool) or use `logrotate` if you have cron access.

## PHP extensions

The Spora `composer.json` requires:

- `php: ^8.4`
- `ext-pdo_mysql` (required, even for SQLite runtime)
- `ext-json` (always present in PHP 8+)
- `ext-mbstring` (usually present)
- `ext-zip` (required by Composer, usually present)

Most shared hosts have all of these. If `composer install` fails with a platform error, ask the host to enable the missing extension.

## `proc_open` may be disabled

`composer install` and the plugin install CLI shell out to `git`, `composer`, and similar. If the host has `disable_functions = proc_open` in `php.ini`, the install command will fail. There's no workaround at the application level — you need to ask the host to enable `proc_open`, or use a host that doesn't disable it.

## Resource limits

Shared hosts typically cap:

- **PHP memory_limit**: 128-512 MB. Spora needs at least 256 MB for large LLM responses. Adjust in cPanel's "MultiPHP INI Editor" if needed.
- **Max execution time**: 30-120 s. Long agent loops can hit this. Adjust in cPanel's "MultiPHP INI Editor" or via `.user.ini`.
- **Concurrent connections**: 10-50. Spora's FrankenPHP runtime is efficient but a long task per request will block others.

If your workload outgrows these, the path forward is a VPS.

## What IS supported

- ✓ `bin/spora` CLI commands (install, plugin install/uninstall, db:reset, db:seed, spora:install)
- ✓ Composer-managed dependencies
- ✓ SQLite runtime (no external service)
- ✓ MySQL runtime (if the host offers MySQL)
- ✓ Background tasks via cron + `--once --include-queue`
- ✓ Cron-triggered scheduled agent runs
- ✓ HTTPS via the host's TLS termination
- ✓ Backups via `tar` of the `storage/` directory + `.env`
- ✓ Per-tool encrypted credentials (`SPORA_SECRET_KEY` + `ToolConfigService`)

## What is NOT supported

- ✗ Long-lived worker daemon (use cron instead)
- ✗ Native Mercure SSE (falls back to polling)
- ✗ Docker / container builds (use a VPS or PaaS)
- ✗ Custom system services (no systemd on shared hosts)
- ✗ Server-pushed real-time updates (long-lived connections usually blocked)
- ✗ Loading custom PHP extensions (no root)
- ✗ Running Composer in production if `proc_open` is disabled

## Next steps

- [Shared host install walkthrough](/deploy/shared-host) — back to the step-by-step
- [Classical server](/deploy/classical-server) — for when you outgrow the shared host
- [Docker multi-container](/deploy/docker/multi-container) — the canonical "production" path
- [Operations → Day-2 ops](/start/operators/operations) — plugin management on shared hosts
