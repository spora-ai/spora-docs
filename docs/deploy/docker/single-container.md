---
title: Docker — single container
description: Spora + SQLite in one container, no external DB — the simplest Docker path.
---

# Docker — single container

The simplest Docker path: Spora + SQLite in one container, no external database. Suitable for laptops, small production deployments, and "I just want it running" setups.

This is a stripped-down version of the canonical `docker-compose.yml` — drop the `mariadb` and `phpmyadmin` services, use SQLite for `SPORA_DB_*`, and you have a single container.

## Quick start

Create a `docker-compose.yml` in your project root (the directory created by `composer create-project spora-ai/spora my-spora`):

```yaml
services:
  spora:
    build:
      context: .
      dockerfile: docker/Dockerfile
    container_name: spora-app
    restart: always
    ports:
      - '8080:80'
    environment:
      SPORA_APP_ENV: production
      SPORA_DB_DRIVER: sqlite
      SPORA_SECRET_KEY: ${SPORA_SECRET_KEY:?Set SPORA_SECRET_KEY in .env}
    volumes:
      - spora_storage:/app/storage

volumes:
  spora_storage:
```

Generate a secret key (see [env-vars §Encryption](/start/operators/env-vars#encryption) for the one-liner) and start:

```bash
echo "SPORA_SECRET_KEY=<your-base64-key>" > .env
docker compose up -d
docker compose logs -f
```

The site is at `http://localhost:8080`. SQLite DB + secret key persist in the `spora_storage` named volume.

## Why single container

The full `docker-compose.yml` ships MariaDB + phpMyAdmin + Spora (3 services, 4 if you count the volumes). For most users — local dev, demos, small production — that's overkill. SQLite with the same FrankenPHP runtime gives you:

- **One image to build and push** (CI/CD simplified)
- **One process to monitor** (no DB connection-pool tuning, no phpMyAdmin security surface)
- **One volume to back up** (the `spora_storage` named volume)
- **Same FrankenPHP runtime** (Mercure SSE, security headers, SPA fallback all work identically)

SQLite handles the same workload as MariaDB for single-instance Spora deployments. The `spora_storage` volume is a directory on the host — back it up the way you'd back up any file directory.

## What's in the image

The Dockerfile is at `docker/Dockerfile` in the `spora-ai/spora` skeleton. It uses a two-stage build:

- **Stage 1** (`composer:2.8`) — runs `composer install` to resolve PHP deps and the `spora-ai/spora-frontend` Composer package (which routes into `public/dist/` via `spora-ai/installer`)
- **Stage 2** (`dunglas/frankenphp:1-php8.5-bookworm`) — runtime base image. Adds `supervisord` + `pdo_mysql` extension, copies app source + vendor + supervisord/frankenphp configs, runs as the non-root `www-data` user

The runtime starts two processes via supervisord:

- **`spora-web`** — `frankenphp run` (the web server)
- **`spora-worker`** — `php /app/bin/spora worker:run --daemon` (the agent worker)

With the default `SPORA_SYNC_MODE=false` (per [env-vars §Worker](/start/operators/env-vars#worker)), the worker drains the task queue asynchronously and the HTTP request returns immediately after enqueuing.

If you flip `SPORA_SYNC_MODE=true` (inline / dev mode), the Orchestrator executes the entire agent loop inside the HTTP request, and the worker is no longer needed. The worker process still runs in the container (it is started by supervisord regardless) but drains no tasks. To save ~30 MB of RAM, remove the `[program:spora-worker]` section from `docker/supervisord.conf` when running in sync mode.

## Updating

```bash
git pull            # updates the source
docker compose build
docker compose up -d
```

The `spora_storage` volume survives container restarts. To wipe state (full reset), `docker compose down -v` and re-create.

## Security notes

- **`SPORA_SECRET_KEY`** must be set in `.env` (or via your secret manager). The container won't start without it (the `?:` syntax in the compose above forces the explicit error).
- The image runs as `www-data` (non-root). The base image's `setcap cap_net_bind_service=+ep` lets FrankenPHP bind 80/443 without root.
- For HTTPS in production, put a reverse proxy (Caddy, nginx, Traefik) in front, or use a managed load balancer. Don't expose port 80 directly to the internet.

## Next steps

- For multi-container with MariaDB + phpMyAdmin: see [Multi-container](/deploy/docker/multi-container)
- For pushing your custom build to GHCR: see [Custom build](/deploy/docker/custom-build)
- For non-Docker deployments: see [Shared host](/deploy/shared-host) or [Classical server](/deploy/classical-server)
