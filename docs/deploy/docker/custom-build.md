---
title: Docker — custom build
description: Fork the Dockerfile, ship a prebuilt image to GHCR, or pin a specific Spora version.
---

# Docker — custom build

The `spora-ai/spora` skeleton ships a `docker/Dockerfile` that the canonical setup uses unmodified. If you need to fork the image (change a base layer, add a runtime extension, ship a prebuilt image to GHCR, or pin to a specific Spora version), this page covers the four common patterns.

## Pattern 1 — Pin to a specific Spora version

The skeleton's `docker/Dockerfile` builds from the current `composer.json` in your project, which (per Composer semver) resolves to the latest matching `^x.y` constraint. If you want a specific version:

```bash
# In your project root, before docker compose build
composer require spora-ai/spora:^0.5
git add composer.json composer.lock
git commit -m "Pin Spora to 0.5.x"
docker compose build
```

`composer.lock` is committed in the skeleton's `.gitignore` toggle — the lockfile forces the exact resolved version. Rebuild + restart after pulling upstream.

## Pattern 2 — Fork the Dockerfile

Clone the skeleton locally, edit `docker/Dockerfile`, and rebuild. The file is short (70 lines) and heavily commented. Common edits:

- **Add a PHP extension** — extend the `apt-get install` line in stage 2 and add a `docker-php-ext-install <name>` call. Example: add `gd` for image manipulation:

  ```dockerfile
  RUN apt-get update \
      && apt-get install -y --no-install-recommends supervisor libgd-dev \
      && docker-php-ext-install pdo_mysql gd \
      && rm -rf /var/lib/apt/lists/*
  ```

- **Change the base PHP version** — swap `dunglas/frankenphp:1-php8.5-bookworm` for an earlier tag (e.g. `1-php8.4-bookworm`). Spora's `composer.json` declares `"php": "^8.4"`; using PHP 8.3 will fail the platform check.
- **Switch to MySQL-only at build time** — remove the SQLite fallback from the deps stage by changing the platform check (Spora currently uses SQLite at runtime if no MySQL config is set; the build is the same either way).
- **Pin to a specific Composer version** — swap `composer:2.8` for `composer:2.8.5` or similar. The latest stable Composer 2.x is fine.

After editing, rebuild:

```bash
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
```

## Pattern 3 — Ship a prebuilt image to GHCR

Build the image in CI and push to GitHub Container Registry. Use the `docker/build-push-action@v6` pattern in a workflow like `.github/workflows/image.yml`:

```yaml
name: Docker image

on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@<40-char-sha> # vX.Y.Z
      - uses: docker/setup-buildx-action@<40-char-sha>
      - uses: docker/login-action@<40-char-sha>
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@<40-char-sha>
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,prefix=sha-
            type=ref,event=branch
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@<40-char-sha>
        with:
          context: .
          file: docker/Dockerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

(All actions pinned to 40-char commit SHAs with `# vX.Y.Z` comments per the project's supply-chain policy.)

This produces images at:

- `ghcr.io/<org>/<repo>:sha-<7-char-sha>` — every commit
- `ghcr.io/<org>/<repo>:<branch>` — every push to a branch
- `ghcr.io/<org>/<repo>:v<X.Y.Z>` — every semver tag

Pull the prebuilt image without building locally:

```yaml
services:
  spora:
    image: ghcr.io/<org>/<repo>:v0.5.3
    # ... rest of docker-compose.yml ...
    pull_policy: always # always pull, don't use a stale cached image
```

## Pattern 4 — Multi-arch builds

For arm64 (Apple Silicon, AWS Graviton) support, enable buildx multi-platform in CI:

```yaml
- uses: docker/setup-buildx-action@<40-char-sha>
- uses: docker/build-push-action@<40-char-sha>
  with:
    platforms: linux/amd64,linux/arm64
    # ...
```

The base `dunglas/frankenphp:1-php8.5-bookworm` is multi-arch, so this works without changes to your Dockerfile.

For local multi-arch testing (slow, only when debugging):

```bash
docker buildx create --use --name multiarch
docker buildx build --platform linux/amd64,linux/arm64 -t spora-local:test --load .
```

## What's NOT in the image

The image is **multi-stage**, which means:

- **No Node toolchain.** The admin SPA (`spora-ai/spora-frontend`) is a prebuilt Composer package — `spora-ai/installer` routes it into `public/dist/` during `composer install`. You don't need npm/yarn/pnpm in the image.
- **No Git.** The build stages use `COPY` of `composer.json` + `composer.lock`, not a git clone.
- **No `storage/` content from your dev machine.** The `storage/` directory is intentionally **not** `COPY`'d in the Dockerfile — it's created and `chown`'d at runtime. Copying it would risk shipping the SQLite DB and `secret.key` (the encryption key for tool settings) into the image.
- **No `vendor/` from your dev machine.** The `vendor/` is built in stage 1 (`composer install`) and `COPY --from=deps-builder`'d into stage 2.

## Production hardening checklist

- [ ] **Pin base image tags** — use `dunglas/frankenphp:1.1.0-php8.5-bookworm` (not `:latest`) so a base-image rebuild doesn't break your image
- [ ] **Pin Composer image tag** — use `composer:2.8.5` (not `:2`)
- [ ] **Use specific version tags** when pulling prebuilt images: `ghcr.io/<org>/<repo>:v0.5.3`
- [ ] **Set `SPORA_SECRET_KEY`** in your secret manager (not in the Dockerfile or .env)
- [ ] **Set `SPORA_ALLOW_REGISTRATION=false`** after the first admin signup
- [ ] **Drop phpMyAdmin** from production compose files (it's a debugging tool)
- [ ] **Run behind a reverse proxy** with TLS, rate limiting, and DDoS protection
- [ ] **Back up `spora_storage` + `mysql_data` volumes** to off-host storage
- [ ] **Set up monitoring** — the supervisord process is the right level to alert on

## Next steps

- For the canonical single-container SQLite setup: [Single container](/deploy/docker/single-container)
- For the canonical multi-container MariaDB setup: [Multi-container](/deploy/docker/multi-container)
- For non-Docker setups: [Shared host](/deploy/shared-host) or [Classical server](/deploy/classical-server)
- For local development with optional offline LLMs: [Local — PHP / Ollama / LM Studio](/deploy/local)
