---
title: Local setup
description: Install dependencies, start the dev server, run tests, manage the database.
---

# Local setup

The skeleton (`spora-ai/spora`) ships a working local dev environment. The only thing you need to install is PHP 8.4+, Composer, and Node 18+ (for the SPA's Vite dev server).

## Prerequisites

- **PHP 8.4+** with `pdo_mysql`, `mbstring`, `zip`, `json` extensions
- **Composer** (latest 2.x)
- **Node.js 18+** and **npm** (only for the SPA's Vite dev server with HMR; not needed for the built production frontend)

## Install the skeleton

```bash
composer create-project spora-ai/spora my-spora
cd my-spora
composer install
```

`composer install` also installs `spora-ai/spora-frontend` (the prebuilt admin UI) and `spora-ai/installer` (the Composer plugin that routes `spora-plugin` and `spora-frontend` packages to the right directories).

## Initialise the database

```bash
cp .env.example .env
# Edit .env: set SPORA_SECRET_KEY (32-byte base64), leave SPORA_DB_DRIVER=sqlite
php bin/spora spora:install    # creates schema (idempotent)
php bin/spora db:seed         # creates a sample admin user
```

`spora:install` is idempotent — re-run it after any new migration ships. `db:seed` is one-shot — it skips itself if users/agents already exist.

To generate a secret key:

```bash
php -r "echo base64_encode(random_bytes(32));"
```

## Start the dev server

```bash
composer dev
```

This starts two processes concurrently:

- **PHP** — `php -S 127.0.0.1:8080 -t public public/index.php`
- **Vite** — only if `spora-frontend` is path-installed (a sibling clone, not the Packagist release). The skeleton's `bin/dev` auto-detects path installs.

The site is at `http://localhost:8080`. The SPA's Vite HMR is at `http://localhost:5173` (path install only).

For a production-like local server without Vite HMR, use the [Docker single-container path](/deploy/docker/single-container) or the [Local — PHP / Ollama / LM Studio](/deploy/local) path.

## Run tests

```bash
composer test                # Backend (Pest) — all tests
composer test:coverage     # With coverage
./vendor/bin/pest --filter="pattern"   # Filter tests by name
```

Frontend unit tests (if you're working on the SPA):

```bash
cd frontend
npm test                     # All Vitest unit tests
npm run test:watch           # Watch mode
```

End-to-end (E2E) tests are not currently wired up — no Playwright dependency, no `frontend/tests/e2e/` directory. The CI pipeline runs Pest + Vitest, not E2E.

The `composer frontend:test` script lives in `spora-core` (the framework), not the deployed `spora` skeleton. To run the framework's full test suite, check out `spora-ai/spora-core` separately and run its composer scripts.

## Database

- **SQLite** at `storage/database.sqlite` (the default, zero-config)
- **Migrations** — `php bin/spora spora:install` (idempotent; safe to re-run)
- **Seed** — `php bin/spora db:seed` (one-shot; skips if data exists)
- **Reset** — `php bin/spora db:reset --force` (wipes the SQLite file or drops + recreates the MySQL DB)

To use MySQL instead, edit `.env`:

```text
SPORA_DB_DRIVER=mysql
SPORA_DB_HOST=127.0.0.1
SPORA_DB_PORT=3306
SPORA_DB_NAME=spora
SPORA_DB_USER=spora
SPORA_DB_PASSWORD=your-password
```

Then re-run `php bin/spora spora:install` to apply the migrations to the new DB.

## Storage

`storage/` directory contents:

- `database.sqlite` — application database
- `spora.log` — application logs (PSR-3, Monolog)
- `php.log` — PHP error/fatal logs

`storage/` is intentionally not copied into the Docker image (it would risk shipping the SQLite DB and `secret.key`). For backup strategy, see [Backups](/start/operators/backups).

## Environment variables

Two are operationally important in dev:

- **`SPORA_SYNC_MODE`** — `true` (default) = agent runs inline in the HTTP request; `false` = agent queued, drained by `bin/spora worker:run --daemon`.
- **`APP_ENV`** — `dev` (default) or `prod`. Affects error reporting and cache behavior.

For the full env-var reference, see [Environment variables](/start/operators/env-vars).

## What's next

- [Project structure](/start/developers/project-structure) — where things live in `spora-core`
- [Stack](/start/developers/stack) — every Composer dependency and its role
- [How to add a tool](/start/developers/how-to-add-a-tool) — the canonical "Hello, Tool" walkthrough
