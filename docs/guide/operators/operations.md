---
title: Day-2 operations
description: Backups, plugin management, updates, logs, workers, reset.
---

## Day-2 operations

This page covers what you do _after_ install: backups, plugin management, framework updates, log tailing, scheduled workers, and reset.

For a deeper backup strategy, see [Backups](/guide/operators/backups).

## Plugin management

Install plugins via the admin UI at `/apps/plugins` (admin role required). The UI calls `POST /api/v1/plugins`. Enable it with:

```bash
# In .env:
SPORA_PLUGIN_INSTALL_ENABLED=true
```

Or via CLI:

```bash
php bin/spora plugin:install spora-ai/spora-plugin-tavily
php bin/spora plugin:list
php bin/spora plugin:uninstall spora-ai/spora-plugin-tavily
php bin/spora plugin:update spora-ai/spora-plugin-tavily
```

> The CLI form is `php bin/spora plugin:install …` — without the `spora:` prefix that some older docs use. The `spora:` prefix is the convention for top-level lifecycle commands (`spora:install`, `db:seed`, `db:reset`); plugin commands are under the `plugin:` namespace.

Plugins land in `plugins/<name>/` (routed by `spora-ai/installer`). Each plugin owns its own migrations, tools, and assets.

## Updating the framework

```bash
composer update spora-ai/spora-core
php bin/spora spora:install   # apply any new migrations
```

Test the upgrade on a staging copy first.

## Updating the admin UI

```bash
composer update spora-ai/spora-frontend
# public/dist/ is replaced in place; no migrations needed
```

## Logs

- `storage/spora.log` — application log (PSR-3, Monolog).
- `storage/php.log` — PHP errors (from `bin/dev`'s PHP server, when applicable).

Tail with `tail -f storage/spora.log`.

For the full env-var controls on logging (`SPORA_LOG_LEVEL`, `SPORA_LOG_PATH`), see [Environment variables](/guide/operators/env-vars#logging).

## Cron workers (scheduled tasks)

Spora has two worker modes:

- **Sync** (`SPORA_SYNC_MODE=true`): inline — agent runs in the same request as the user. Default for dev.
- **Async** (`SPORA_SYNC_MODE=false`): queued — requires `php bin/spora worker:run` to drain the queue.

For scheduled tasks, run `php bin/spora worker:run --scheduled` via cron every minute:

```cron
* * * * * cd /path/to/app && php bin/spora worker:run --scheduled >> storage/spora.log 2>&1
```

## Reset

Wipe state for a fresh start:

```bash
php bin/spora db:reset --force   # drops the database, clears schema stamp
rm -rf plugins/*                  # uninstalls all plugins
composer install                  # reinstall frontend assets
php bin/spora spora:install
php bin/spora db:seed
```

## File permissions

```bash
chmod -R 775 storage
chmod -R 755 bin public
```

On shared hosts, the web user (e.g. `nobody`, `www-data`) needs write access to `storage/`.
