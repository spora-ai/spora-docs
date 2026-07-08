---
title: Docker — multi-container
description: Spora + MariaDB + phpMyAdmin — the canonical docker-compose setup.
---

# Docker — multi-container

The canonical Docker setup: Spora + MariaDB + phpMyAdmin, all networked, all health-checked. Suitable for production deployments, multi-app stacks, or any setup where you want MySQL semantics (concurrent writes, replication, managed-database options).

The full `docker-compose.yml` ships in the `spora-ai/spora` skeleton at `docker/docker-compose.yml`.

## Quick start

Copy the bundled `docker-compose.yml` to your project root (or reference it directly with `-f`):

```bash
# From the spora-ai/spora project root
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f
```

That starts three services:

| Service      | Port (host:container) | Image                          | Purpose                              |
| ------------ | --------------------- | ------------------------------ | ------------------------------------ |
| `spora`      | `8081:80`             | Built from `docker/Dockerfile` | Spora app + FrankenPHP + supervisord |
| `mariadb`    | (internal)            | `mariadb:11`                   | MySQL-compatible database            |
| `phpmyadmin` | `8082:80`             | `phpmyadmin:latest`            | Web UI for inspecting/editing the DB |

The site is at `http://localhost:8081`. phpMyAdmin is at `http://localhost:8082`.

## What the compose file does

```yaml
services:
  spora:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: spora-app
    restart: always
    ports:
      - '8081:80'
    env_file:
      - .env.local
    depends_on:
      mariadb:
        condition: service_healthy # ← waits for MariaDB to be ready
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost/health || exit 1']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    volumes:
      - spora_storage:/app/storage # ← SQLite DB + secret key + logs
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - spora

  mariadb:
    image: mariadb:11
    container_name: spora-db
    restart: always
    env_file:
      - .env.local
    environment:
      MYSQL_ROOT_PASSWORD: ${SPORA_DB_ROOT_PASSWORD:-rootpassword}
      MYSQL_DATABASE: ${SPORA_DB_NAME:-spora}
      MYSQL_USER: ${SPORA_DB_USER:-spora}
      MYSQL_PASSWORD: ${SPORA_DB_PASSWORD:-sporapassword}
    healthcheck:
      test: ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - spora

  phpmyadmin:
    image: phpmyadmin:latest
    container_name: spora-phpmyadmin
    restart: always
    ports:
      - '8082:80'
    environment:
      PMA_HOST: mariadb
      PMA_USER: ${SPORA_DB_USER:-spora}
      PMA_PASSWORD: ${SPORA_DB_PASSWORD:-sporapassword}
    networks:
      - spora
```

The `mariadb` service has a `healthcheck` (the standard `healthcheck.sh` from the official image). The `spora` service uses `depends_on: condition: service_healthy` — it won't start until MariaDB is accepting connections. The `spora` service has its own `healthcheck` that hits `/health` on the app, which the FrankenPHP routing returns 200 for.

## Required environment

Create `.env.local` in the project root:

```bash
# Database (used by both spora and mariadb services)
SPORA_DB_DRIVER=mysql
SPORA_DB_HOST=mariadb
SPORA_DB_PORT=3306
SPORA_DB_NAME=spora
SPORA_DB_USER=spora
SPORA_DB_PASSWORD=changeme-sporapassword
SPORA_DB_ROOT_PASSWORD=changeme-rootpassword

# Encryption (32-byte base64 — generate with `php -r "echo base64_encode(random_bytes(32));"`)
SPORA_SECRET_KEY=base64:your-key-here

# App
SPORA_APP_ENV=production
SPORA_ALLOW_REGISTRATION=false     # set true for the first admin signup, then false
```

The `SPORA_DB_*` values are read by both `spora` (via `env_file: .env.local`) and `mariadb` (via its own `env_file` + `environment` block that defaults to placeholder passwords if not set).

## What runs inside `spora`

The container starts two processes via supervisord (`docker/supervisord.conf`):

- **`spora-web`** — `frankenphp run --config /app/frankenphp.conf --adapter caddyfile`
- **`spora-worker`** — `php /app/bin/spora worker:run --daemon`

The web server's Caddy config (`docker/frankenphp.conf`) is:

- Listens on port 80 (the `EXPOSE` line in the Dockerfile) and 443/udp
- Security headers (HSTS, X-Content-Type-Options, X-Frame-Options DENY, X-XSS-Protection, Referrer-Policy) on every response
- Mercure hub at `/.well-known/mercure`, signed with `SPORA_MERCURE_JWT_KEY`
- Static assets served from `/app/public/dist`
- SPA fallback — non-API routes return `index.html`
- Everything else routed to PHP

The worker is only needed if you set `SPORA_SYNC_MODE=false` (queue mode). Default mode is sync (inline), so the worker idles.

## Volumes

| Volume          | Container path   | Purpose                                                            |
| --------------- | ---------------- | ------------------------------------------------------------------ |
| `spora_storage` | `/app/storage`   | SQLite DB, secret key, logs (persistent across container restarts) |
| `mysql_data`    | `/var/lib/mysql` | MariaDB data files                                                 |
| `caddy_data`    | `/data`          | FrankenPHP's cert storage (TLS via ACME, if you enable it)         |
| `caddy_config`  | `/config`        | FrankenPHP's runtime config                                        |

For a fresh start: `docker compose down -v` (deletes all 4 named volumes). For backups: stop the containers, then `tar` the volumes.

## Updating

```bash
git pull
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
```

The MariaDB schema is updated automatically by `bin/spora spora:install` on container start (see `docker/entrypoint.sh`).

## Security notes

- **`SPORA_SECRET_KEY`** is the master encryption key. Losing it means losing access to all encrypted tool settings. Back it up separately from the volumes.
- **Change the default MariaDB passwords** (currently `sporapassword` / `rootpassword`). Use strong random values.
- **`SPORA_ALLOW_REGISTRATION`** should be `true` only for the initial admin signup, then `false`.
- The `phpmyadmin` port (`8082`) is **not authenticated by default** beyond the MariaDB credentials. Put it behind a reverse proxy with basic auth, or remove the service for production.
- The Docker image runs as `www-data` (non-root). The base image sets `setcap cap_net_bind_service=+ep` on the FrankenPHP binary so it can bind 80/443 without root.

## Next steps

- For a custom image build (fork the Dockerfile, change base layers, ship to GHCR): see [Custom build](/deploy/docker/custom-build)
- For non-Docker setups: see [Shared host](/deploy/shared-host) or [Classical server](/deploy/classical-server)
- For local development: see [Local — PHP / Ollama / LM Studio](/deploy/local)
