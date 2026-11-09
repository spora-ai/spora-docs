---
title: Local setup
description: Install dependencies, start the dev server, run tests, manage the database.
---

# Local setup

The skeleton (`spora-ai/spora`) ships a working local dev environment. The only thing you need to install is PHP 8.4+, Composer, and — only if you are working on the admin SPA — Node.js and npm.

## Prerequisites

- **PHP 8.4.1+** with `curl`, `dom`, `fileinfo`, `iconv`, `json`, `mbstring`, `openssl`, `pdo`, `pdo_mysql`, `pdo_sqlite`, `simplexml`, `sodium` and `zip`
- **Composer** (latest 2.x)
- **Node.js** and **npm** — only for working on the admin SPA in `spora-frontend`; the skeleton ships the prebuilt UI, so a plain install needs neither

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

`spora:install` is idempotent — re-run it after any new migration ships. It also ensures `storage/secret.key` exists (generating one if the file is missing) and points `config.php`'s `key_path` at it, so the `SPORA_SECRET_KEY` line in `.env` is optional — but note that the environment variable takes precedence at runtime, and the two must not disagree: encrypt with one and read with the other and every stored credential becomes undecryptable.

`db:seed` is **insert-only for admin and agent rows** — it never patches an existing admin row, so it cannot resurrect a deleted admin or overwrite an operator-rename/demote. If you need to promote an existing admin row (e.g. it's stuck at `verified=0` after an upgrade), use `php bin/spora db:repair-admin` instead.

In addition, `db:seed` reconciles mail templates against `email-templates/`: any YAML that is missing from the DB is inserted, and operator-customised templates are preserved (no `force`). Run `php bin/spora mail:templates:sync` interactively (or `php bin/spora mail:templates:sync --force`) if you want to overwrite drifted rows.

To generate a secret key yourself:

```bash
php -r "echo base64_encode(random_bytes(32));"
```

## Start the dev server

```bash
composer dev
```

This starts the PHP built-in server:

- **PHP** — `php -S 127.0.0.1:8080 -t public public/index.php`

The site is at `http://localhost:8080`.

The admin SPA ships prebuilt, so there is no Vite dev server in this workflow. To work on the SPA itself — with HMR — clone [`spora-frontend`](https://github.com/spora-ai/spora-frontend) and run it there; that repository is a separate checkout from the framework.

For a production-like local server without the PHP dev server, use the [Docker single-container path](/deploy/docker/single-container) or the [Local — PHP / Ollama / LM Studio](/deploy/local) path.

## Run tests

```bash
composer test                # Backend (Pest) — all tests
./vendor/bin/pest --filter="pattern"   # Filter tests by name
```

The skeleton has no `composer test:coverage` script — coverage runs in the framework repository. To run the framework's full test suite, check out `spora-ai/spora-core` separately and run its composer scripts.

Frontend unit tests live with the SPA, in `spora-frontend` — clone it and work in its own checkout:

```bash
git clone https://github.com/spora-ai/spora-frontend.git
cd /path/to/spora-frontend
npm test                     # All Vitest unit tests
npm run test:watch           # Watch mode
```

End-to-end (E2E) tests are not currently wired up — there is no Playwright dependency and no `tests/e2e/` directory. The two repositories' CI pipelines run Pest and Vitest separately, not E2E.

## Database

- **SQLite** at `storage/database.sqlite` (the default, zero-config)
- **Migrations** — `php bin/spora spora:install` (idempotent; safe to re-run)
- **Seed** — `php bin/spora db:seed` (inserts missing admin + sample agent; also reconciles mail templates against `email-templates/`, preserving operator-customised rows)
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

`storage/` directory contents after a first run:

- `database.sqlite` — application database
- `secret.key` — libsodium master key (32 bytes binary)
- `spora.log` — application logs (PSR-3, Monolog)
- `spora-worker.lock` — single-instance worker lock
- `.schema_stamp` — migration stamp cache
- `.plugins_stamp`, `.plugins_stamp.cache.json` — plugin loader caches
- `.spora_plugin_catalog.json` — on-disk Packagist catalogue cache

`storage/` is intentionally not copied into the Docker image (it would risk shipping the SQLite DB and `secret.key`). For backup strategy, see [Backups](/start/operators/backups).

## Environment variables

Two are operationally important in dev:

- **`SPORA_WORKER_RUNTIME_MODE`** — defaults to `server` (in `spora-ai/spora`). The local-dev path runs `composer dev`, which is the PHP built-in server — pair it with `php bin/spora worker:run --daemon` in a second terminal to drain the queue, or set `client` if you only want browser-driven ticks (see [Deployment modes](/reference/concepts/deployment-modes)).
- **`SPORA_APP_ENV`** — `development` (default) or `production`. Affects error reporting and cache behavior.

For the full env-var reference, see [Environment variables](/start/operators/env-vars).

## What's next

- [Project structure](/start/developers/project-structure) — where things live in `spora-core`
- [Stack](/start/developers/stack) — every Composer dependency and its role
- [How to add a tool](/start/developers/how-to-add-a-tool) — the canonical "Hello, Tool" walkthrough
