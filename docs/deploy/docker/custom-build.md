---
title: Docker — custom build
description: Fork the spora-ai/spora template, adjust composer.json + Dockerfile as needed, ship your own image via the shipped CI workflow.
---

# Docker — custom build

Spora's image is built from a Dockerfile in the [`spora-ai/spora`](https://github.com/spora-ai/spora) template. The template ships a working `docker/Dockerfile`, `docker/docker-compose.yml`, and a GitHub Actions workflow that publishes the image to GHCR. To deploy your own image, fork the template and follow the five-step pipeline below.

## The pipeline

### 1. Fork the template

Fork [`spora-ai/spora`](https://github.com/spora-ai/spora) on GitHub. The fork is your image's source of truth — every push to `main` rebuilds the image.

### 2. Adjust `composer.json`

Add the plugins and packages you need. The skeleton's `composer.json` already requires `spora-ai/spora-core` and `spora-ai/spora-frontend`; add anything else with `composer require`:

```bash
composer require spora-ai/spora-plugin-tavily spora-ai/spora-plugin-email
```

Commit the resulting `composer.json` + `composer.lock` change.

### 3. Update the Dockerfile (if needed)

The shipped `docker/Dockerfile` (in the template, two-stage, ~70 lines, heavily commented) covers the common case. Edit it only when you need to add an OS package or a PHP extension — e.g. a database client, an image library, or a missing PECL extension. Most plugins do not require a Dockerfile change because they install via Composer.

The base images are pinned:

- `composer:2.8` (deps-builder stage)
- `dunglas/frankenphp:1-php8.5-bookworm` (runtime stage)

Spora's `composer.json` declares `"php": "^8.4.1"`; downgrading the runtime to PHP 8.3 will fail the platform check.

### 4. Configure your environment

Create a `.env` file in the directory you'll run `docker compose` from (the project root, next to the compose file). The shipped `docker/.env.example` is the source of values:

```bash
cp docker/.env.example .env
# Edit .env: at minimum set SPORA_SECRET_KEY and the SPORA_DB_* values.
```

Minimum for a production image:

```bash
SPORA_SECRET_KEY=<your-base64-key>      # generate with: php -r "echo base64_encode(random_bytes(32));"
SPORA_DB_DRIVER=mysql
SPORA_DB_HOST=db
SPORA_DB_NAME=spora
SPORA_DB_USER=spora
SPORA_DB_PASSWORD=<strong-password>
SPORA_DB_ROOT_PASSWORD=<strong-password>
SPORA_APP_ENV=production
SPORA_ALLOW_REGISTRATION=false
```

The example compose below references this `.env` via `env_file: - .env` (Compose resolves the path relative to the compose file).

### 5. Push — the workflow builds and publishes

Commit and push. The template's shipped `.github/workflows/` (or your fork's equivalent) runs on `push` to `main`, builds the image, and pushes it to `ghcr.io/<your-org>/spora:<tag>`. No additional CI configuration is needed for the standard image.

## Example: docker-compose for your image

A minimal compose file that uses your published image + a local MariaDB:

```yaml
services:
  spora:
    image: ghcr.io/<your-org>/spora:latest
    container_name: spora-app
    restart: always
    ports:
      - '8081:80'
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - spora_storage:/app/storage
    networks:
      - spora

  db:
    image: mariadb:11
    container_name: spora-db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${SPORA_DB_ROOT_PASSWORD}
      MYSQL_DATABASE: ${SPORA_DB_NAME:-spora}
      MYSQL_USER: ${SPORA_DB_USER:-spora}
      MYSQL_PASSWORD: ${SPORA_DB_PASSWORD}
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

volumes:
  spora_storage:
  mysql_data:

networks:
  spora:
    driver: bridge
```

Run with `docker compose -f docker-compose.yml up -d`. The site is at `http://localhost:8081`.

## What's NOT in the image

The image is multi-stage, so the runtime image contains only what the app needs at runtime:

- **No Node toolchain.** The admin SPA (`spora-ai/spora-frontend`) is a prebuilt Composer package — `spora-ai/installer` routes it into `public/dist/` during `composer install`. You don't need npm in the image.
- **No Git.** The build stages use `COPY` of `composer.json` + `composer.lock`, not a git clone.
- **No `storage/` content from your dev machine.** The `storage/` directory is intentionally not `COPY`'d — it is created and `chown`'d at runtime. Copying it would risk shipping the SQLite DB and `secret.key` into the image.
- **No `vendor/` from your dev machine.** The `vendor/` is built in stage 1 and `COPY --from=deps-builder`'d into stage 2.

## When to fork the Dockerfile

Fork the Dockerfile when you need to add something the base image doesn't ship. The most common reasons:

- An OS package your plugin needs at runtime (e.g. `libpq-dev` for native PostgreSQL drivers).
- A PHP extension that the base image doesn't include (e.g. `gd` for image manipulation, `intl` for ICU — note: `intl` is already in the skeleton's `php` install list).
- A multi-arch build (`linux/amd64,linux/arm64` — for Apple Silicon or AWS Graviton). The base image is multi-arch, so this works without changing the Dockerfile; just enable `platforms: linux/amd64,linux/arm64` in your CI's `docker/build-push-action`.

If you only need to add PHP code, dependencies, or a plugin, do not fork the Dockerfile — `composer require` is enough.

## Next steps

- For the canonical single-container SQLite setup: [Single container](/deploy/docker/single-container)
- For the canonical multi-container MariaDB setup: [Multi-container](/deploy/docker/multi-container)
- For non-Docker setups: [Shared host](/deploy/shared-host) or [Classical server](/deploy/classical-server)
- For local development with optional offline LLMs: [Local — PHP / Ollama / LM Studio](/deploy/local)
