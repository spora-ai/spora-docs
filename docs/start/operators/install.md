---
title: Installation
description: Standard install (Packagist) for Spora — plus troubleshooting. For Docker, Classical server, or Shared host, see the Deploy guide.
---

## Installation

> **Looking for a specific deployment scenario?** See the [Deployment guide](/deploy/) for Docker, Classical server (Apache+PHP-FPM), Local (PHP / Ollama / LM Studio), or Shared host (cPanel/FTP). The Standard install below works on any host with PHP 8.4 + Composer.

The Standard install is the canonical "if you have SSH and Composer, do this" reference. Spora ships as three coordinated Composer packages:

- `spora-ai/spora-core` — the framework
- `spora-ai/spora-frontend` — prebuilt admin UI (lands in `public/dist/`)
- `spora-ai/installer` — Composer plugin that routes the above

The admin UI is **prebuilt** — no Node toolchain is required on the operator's host.

> **Which package should I `composer create-project`?** One operator-facing skeleton exists today: `spora-ai/spora`. The runtime mode (`server` vs `client`) is selected per install via `SPORA_WORKER_RUNTIME_MODE` in `.env`. See [Installation modes](/start/operators/installation-modes) for the one-screen picker. For Docker / VPS / classical server / local dev, keep the default `server` (daemon or cron). For cPanel / FTP-only shared hosts, flip to `client` (browser-driven worker, no daemon).

### Repairing a stuck bootstrap admin

If the seeded `admin@spora.local` was persisted with `verified=0` (e.g. after an upgrade from a pre-`db:repair-admin` spora-core release), promote it without dropping the database:

```bash
php bin/spora db:repair-admin
# or for a non-default admin email:
php bin/spora db:repair-admin [email protected]
```

The command is idempotent and preserves any role bits you have already set. It refuses to create a missing row — it is a repair tool, not a backdoor.

## Standard install (Packagist)

```bash
composer create-project spora-ai/spora my-app
cd my-app
composer install
php bin/spora spora:install
php bin/spora db:seed
composer dev
```

`composer dev` starts the PHP server on `http://localhost:${PHP_PORT:-8080}`.

## Upgrading — migration 0067 (`introduce_principals_and_groups`)

Spora-core PR #209 ships migration `0067_introduce_principals_and_groups`. The migration **is forward-only** — `down()` is a no-op. It:

- Creates three new tables (`groups`, `group_memberships`, `principals`).
- Bulk-inserts one user-principal per existing user.
- Renames `user_preferences` → `principal_preferences`.
- Re-keys ownership on `agents`, `llm_driver_configurations`, `tool_user_settings`, and `principal_preferences` from `user_id` → `principal_id` (FK to `principals.id`; RESTRICT on delete for `agents.principal_id`).

**Take a full database backup before running the upgrade.** If the migration fails mid-way, restore from backup — there is no automatic rollback path. SQLite: copy `storage/database.sqlite`. MySQL/MariaDB: `mysqldump` (or your managed snapshot).

The migration runs the column swap **outside any transaction** so SQLite's `PRAGMA foreign_keys = OFF` actually takes effect (the pragma is a no-op inside a transaction; without it, the table rebuild would cascade-delete every dependent row). The pragma state is read back after each `OFF` / `ON` and the migration throws if it was silently ignored.

Migrations 0068 (`create_group_pictures_table`) and 0069 (`backfill_default_group_pictures`) are also forward-only.

## Troubleshooting

### `public/dist/index.html is missing` after `php bin/spora spora:install`

This means the frontend package didn't install. Run `composer install spora-ai/spora-frontend` and verify `vendor/spora-ai/installer` is present (it routes the package to `public/dist/``).

### `Permission denied` on `storage/`

`storage/` must be writable by the web user. On shared hosts: `chmod -R 775 storage`.

### Database errors after deploy

The first deploy needs `php bin/spora spora:install` to run migrations. Add it to your deploy script.
