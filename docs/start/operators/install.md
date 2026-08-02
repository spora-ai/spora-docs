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

## Troubleshooting

### `public/dist/index.html is missing` after `php bin/spora spora:install`

This means the frontend package didn't install. Run `composer install spora-ai/spora-frontend` and verify `vendor/spora-ai/installer` is present (it routes the package to `public/dist/``).

### `Permission denied` on `storage/`

`storage/` must be writable by the web user. On shared hosts: `chmod -R 775 storage`.

### Database errors after deploy

The first deploy needs `php bin/spora spora:install` to run migrations. Add it to your deploy script.
