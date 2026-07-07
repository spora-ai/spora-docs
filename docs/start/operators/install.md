---
title: Installation
description: Five install routes — standard, shared host, dev, Docker, troubleshooting.
---

## Installation

Pick the route that matches your environment.

| Route                                                      | Use when                                          |
| ---------------------------------------------------------- | ------------------------------------------------- |
| [Standard (Packagist)](#standard-install-packagist)        | You have SSH, Composer, and a normal PHP host     |
| [Shared host (cPanel/FTP)](#shared-host-install-cpanelftp) | You're on cPanel, Plesk, or a similar shared host |
| [Development (HMR)](#development-install-hmr)              | You want to hack on the framework or a plugin     |
| [Docker](#docker-install)                                  | You want a self-contained container               |
| [Troubleshooting](#troubleshooting)                        | Something didn't go as expected                   |

Spora ships as three coordinated Composer packages:

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

## Shared-host install (cPanel/FTP)

```bash
# On your dev machine:
composer create-project spora-ai/spora my-app
cd my-app
composer install --no-dev --optimize-autoloader

# Upload the entire `my-app/` directory to your shared host (via FTP or
# cPanel File Manager). Ensure `public/` is the document root.

# On the shared host (SSH or cPanel terminal):
php bin/spora spora:install
php bin/spora db:seed
```

Set the document root to the `public/` directory, not the project root. Update `storage/` to be writable by the web user (typically `chmod -R 775 storage`).

## Development install (HMR)

```bash
git clone https://github.com/spora-ai/spora my-app
cd my-app
git clone https://github.com/spora-ai/spora-frontend ..
composer require spora-ai/spora-frontend --path=../spora-frontend
composer install
php bin/spora spora:install
```

For full-stack dev (HMR), start Vite in a second terminal:

```bash
# Terminal 1: PHP + Spora API
composer dev

# Terminal 2: Vite dev server (path-installed frontend only)
cd vendor/spora-ai/spora-frontend
npm run dev
```

Vite's `server.proxy['/api']` forwards API calls to PHP. Visit `http://localhost:5173` for HMR; the API lives at `:8080/api/*`.

## Docker install

```bash
docker compose -f docker/docker-compose.yml up
```

The image runs FrankenPHP + supervisord. The prebuilt admin UI is baked in via the `spora-frontend` Composer package (no Node toolchain in the image). See the [Deployment → Docker](/deploy/docker/) guide for the long form.

## Troubleshooting

### `public/dist/index.html is missing` after `php bin/spora spora:install`

This means the frontend package didn't install. Run `composer install spora-ai/spora-frontend` and verify `vendor/spora-ai/installer` is present (it routes the package to `public/dist/``).

### `Permission denied` on `storage/`

`storage/` must be writable by the web user. On shared hosts: `chmod -R 775 storage`.

### Database errors after deploy

The first deploy needs `php bin/spora spora:install` to run migrations. Add it to your deploy script.
