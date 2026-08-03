---
title: Docker — multi-container
description: Spora + MariaDB + phpMyAdmin — the canonical docker-compose setup.
---

# Docker — multi-container

The canonical Docker setup: Spora + MariaDB + phpMyAdmin, all networked, all health-checked. Suitable for production deployments and any setup where you want MySQL semantics (concurrent writes, replication, managed-database options).

The full `docker-compose.yml` ships in the `spora-ai/spora` skeleton at `docker/docker-compose.yml`.

## 1. Configure your environment

`.env.local` is the contract between the host and the three services (`spora`, `mariadb`, `phpmyadmin`). Create it in the project root:

```bash
# Database (read by spora + mariadb services)
SPORA_DB_DRIVER=mysql
SPORA_DB_HOST=mariadb
SPORA_DB_PORT=3306
SPORA_DB_NAME=spora
SPORA_DB_USER=spora
SPORA_DB_PASSWORD=changeme-sporapassword
SPORA_DB_ROOT_PASSWORD=changeme-rootpassword

# Encryption — generate with the one-liner from env-vars §Encryption (see link below)
SPORA_SECRET_KEY=<your-base64-key>

# App
SPORA_APP_ENV=production
SPORA_ALLOW_REGISTRATION=false         # set true for the first admin signup, then false

# Logging — keep stdout so `docker compose logs -f spora` shows every line.
SPORA_LOG_PATH=stdout
```

The `SPORA_DB_*` values are read by both `spora` (via `env_file: .env.local`) and `mariadb` (via its own `env_file` + `environment` block that defaults to placeholder passwords if not set).

For production TLS, set `SERVER_NAME` to your public domain so FrankenPHP / Caddy auto-issues a Let's Encrypt certificate on the first boot:

```bash
SERVER_NAME=spora.example.com
```

The container publishes ports `80`, `443` and `443/udp` (HTTP/3). Confirm your firewall allows all three. Caddy stores the issued certificate in the `caddy_data` named volume; back that up if you rebuild the image.

## 2. Run

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f
```

That starts three services:

| Service      | Port (host:container)             | Image                          | Purpose                              |
| ------------ | --------------------------------- | ------------------------------ | ------------------------------------ |
| `spora`      | `80:80`, `443:443`, `443:443/udp` | Built from `docker/Dockerfile` | Spora app + FrankenPHP + supervisord |
| `mariadb`    | (internal)                        | `mariadb:11`                   | MySQL-compatible database            |
| `phpmyadmin` | `8082:80`                         | `phpmyadmin:latest`            | Web UI for inspecting/editing the DB |

The site is at `https://<SERVER_NAME>` (or `http://localhost:8081` for the local-only port mapping documented in `docker/.env.local.example`). phpMyAdmin is at `http://localhost:8082`.

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
      - '80:80'
      - '443:443'
      - '443:443/udp' # HTTP/3
    env_file:
      - .env.local
    depends_on:
      mariadb:
        condition: service_healthy # waits for MariaDB to be ready
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost/api/health || exit 1']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    volumes:
      - spora_storage:/app/storage # secret key only — app logs flow to stdout
      - caddy_data:/data # TLS cert + Mercure BoltDB (auto-created on first boot)
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

The `mariadb` service has a `healthcheck` (the standard `healthcheck.sh` from the official image). The `spora` service uses `depends_on: condition: service_healthy` — it won't start until MariaDB is accepting connections. The `spora` service has its own `healthcheck` that hits `/api/health` on the app, which returns `200` with `{"status":"ok","database":"connected"}` when the framework is up.

## What runs inside `spora`

The container starts two processes via supervisord (`docker/supervisord.conf`):

- **`spora-web`** — `frankenphp run --config /app/frankenphp.conf --adapter caddyfile`
- **`spora-worker`** — `php /app/bin/spora worker:run --daemon`

The web server's Caddy config (`docker/frankenphp.conf`):

- Listens on port 80 (the `EXPOSE` line in the Dockerfile), 443 (TLS) and 443/udp (HTTP/3). When `SERVER_NAME` is a public domain, Caddy auto-issues a Let's Encrypt certificate on first boot.
- Security headers (HSTS, X-Content-Type-Options, X-Frame-Options DENY, X-XSS-Protection, Referrer-Policy) on every response
- Mercure hub at `/.well-known/mercure`, signed with `SPORA_MERCURE_JWT_KEY`. The frontend authenticates subscriber SSE connections with a `__Secure-mercure_access_token` HttpOnly cookie minted by `GET /api/v1/sse/authorize`; the hub is **not** `anonymous`, so private updates only reach subscribers whose JWT scopes match the publish topic.
- Static assets served from `/app/public/dist`
- SPA fallback — non-API routes return `index.html`
- Everything else routed to PHP

The worker drains the queued tasks when `SPORA_SYNC_MODE=false` (the value shipped in `spora/.env.example`, per [env-vars §Worker / Sync Mode](/start/operators/env-vars#worker--sync-mode)). In inline/dev mode (`SPORA_SYNC_MODE=true`), the worker idles.

## Volumes

| Volume          | Container path   | Purpose                                                                                                                                                        |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spora_storage` | `/app/storage`   | `secret.key` (encryption key for tool settings). App logs flow to stdout via `SPORA_LOG_PATH=stdout`. SQLite is not used in this mode.                         |
| `mysql_data`    | `/var/lib/mysql` | MariaDB data files                                                                                                                                             |
| `caddy_data`    | `/data`          | FrankenPHP's TLS cert + Mercure BoltDB. Re-applies www-data ownership on each entrypoint restart so a fresh volume doesn't trap the runtime in an EACCES loop. |
| `caddy_config`  | `/config`        | FrankenPHP's runtime config                                                                                                                                    |

For a fresh start: `docker compose down -v` (deletes all 4 named volumes). For backups: stop the containers, then `tar` the volumes.

## Updating

```bash
git pull
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
```

The MariaDB schema is migrated on first container start by the image's entrypoint (see `docker/entrypoint.sh` in the skeleton).

## Security notes

- **`SPORA_SECRET_KEY`** is the master encryption key. Losing it means losing access to all encrypted tool settings. Back it up separately from the volumes.
- **`SPORA_APP_ENV=production`** silences PHP deprecation warnings and removes the `debug` envelope from `/api/*` JSON error responses. Production deployments **must** set it.
- **`SPORA_MERCURE_JWT_KEY`** signs both publisher and subscriber tokens. Use a random 32-byte hex value (`php -r "echo bin2hex(random_bytes(32));"`). The `__Secure-mercure_access_token` cookie carries the subscriber JWT scoped to `user/{userId}/tasks` and `user/{userId}/notifications`; never set `anonymous` on the hub unless you intend to leak private updates.
- **`SPORA_MERCURE_PUBLISH_URL`** is the URL the in-container publisher POSTs to. When set to `http://localhost/...` and `SERVER_NAME` is a public domain, Caddy's auto-HTTPS redirects the publisher to HTTPS on a port it cannot reach, producing the `tlsv1 alert internal error` in the logs. Use the Docker service name (`http://spora:80/...`) when the publisher and hub are co-located.
- **Change the default MariaDB passwords** (currently `sporapassword` / `rootpassword`). Use strong random values.
- **`SPORA_ALLOW_REGISTRATION`** should be `true` only for the initial admin signup, then `false`.
- The `phpmyadmin` port (`8082`) is **not authenticated by default** beyond the MariaDB credentials. Put it behind a reverse proxy with basic auth, or remove the service for production.
- The Docker image runs as `www-data` (non-root). The base image sets `setcap cap_net_bind_service=+ep` on the FrankenPHP binary so it can bind 80/443 without root.

## Next steps

- For a custom image build (fork the Dockerfile, change base layers, ship to GHCR): see [Custom build](/deploy/docker/custom-build)
- For non-Docker setups: see [Shared host](/deploy/shared-host) or [Classical server](/deploy/classical-server)
- For local development: see [Local — PHP / Ollama / LM Studio](/deploy/local)
