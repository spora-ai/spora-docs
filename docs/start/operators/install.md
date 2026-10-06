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

## Upgrading — migration 0091 (`drop_markdown_content_from_media_assets`)

Spora-core PR #288 ships migration `0091_drop_markdown_content_from_media_assets`. It **drops the `media_assets.markdown_content` column**, retiring the second of two parallel storage contracts for the same fact — a derivative row joined through `media_derivatives` replaces it, carrying producer attribution the column never had and reusing the existing endpoints, the "Convert to" dropdown, and the OpenAPI surface. Ordering matters: 0091 must run after 0080, which places `transcript` with `->after('markdown_content')`; dropping the column first would leave 0080's `after()` pointing at a column that no longer exists.

### This migration deletes data

**There is no backfill, by deliberate operator decision.** Every previously-extracted document body stored in `media_assets.markdown_content` is lost when the column is dropped. The reasoning is that a backfill would instead run the PDF parser over every historical document on the first deploy after the upgrade — unbounded time and CPU on a live archive, with a failure mode (a corrupt or scanned PDF) that has no partial-success story. The dropped values are recoverable one row at a time, on demand, instead.

**Take a full database backup before running the upgrade.** SQLite: copy `storage/database.sqlite`. MySQL/MariaDB: `mysqldump` (or your managed snapshot).

What is _not_ lost: the **original document bytes are untouched**. Only the extracted text is gone — every uploaded PDF still exists as-is in `media_assets`, so nothing needs to be re-uploaded.

### Recovering the text after the upgrade

Recovery is one derivative request per row, on demand, rather than one bulk pass:

```http
POST /api/v1/media/{id}/derivatives
Content-Type: application/json

{ "format": "md" }
```

The endpoint is idempotent per `(parent, format, producer)` — a second call returns the same derivative id instead of re-rendering. `GET /api/v1/media/{id}/derivatives/options` lists the formats a given asset can actually be converted into, with an `available` flag, so you can check before you post.

Two limits worth knowing before you plan a bulk run:

- **PDFs only.** The `md` producer is core's `PdfToMarkdownProducer`, and it claims `application/pdf` sources. A non-PDF asset that had text in the column has no producer, so that call returns **409 Conflict**.
- **A PDF with no text layer yields no derivative either way.** Scanned documents have no OCR layer; the parser returns an empty string and the row is declined rather than persisted empty. If you have such documents, archive a `.md` (or `.txt`) alongside the PDF at upload time from now on — that is the supported path, and the asset's own bytes remain the pointer of record.

### Fresh installs and new rows are unaffected

The pipeline mints the `md` derivative at ingest and again at attach time through `MediaDerivativeService::ensureTextDerivative()` — a get-or-create that is idempotent on re-ingest and a blind retry, and that returns `null` rather than throwing when no producer claims the source or the parser fails. So a clean install never has anything in the dropped column, and every row created after the upgrade has its text as a derivative row already.

### Rollback is safe

0091's `down()` re-adds `markdown_content` as a nullable column (null is exactly the pre-converter state for images and unsupported types), and 0080's own `down()` never re-adds `markdown_content` — so a full rollback does not fight this migration. The column comes back empty; re-run the `create_derivative(format: "md")` calls to refill it.

## Troubleshooting

### `public/dist/index.html is missing` after `php bin/spora spora:install`

This means the frontend package didn't install. Run `composer install spora-ai/spora-frontend` and verify `vendor/spora-ai/installer` is present (it routes the package to `public/dist/``).

### `Permission denied` on `storage/`

`storage/` must be writable by the web user. On shared hosts: `chmod -R 775 storage`.

### Database errors after deploy

The first deploy needs `php bin/spora spora:install` to run migrations. Add it to your deploy script.
