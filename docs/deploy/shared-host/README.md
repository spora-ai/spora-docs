---
title: Shared host (cPanel / Plesk)
description: Install Spora on a cPanel, Plesk, or FTP-only host — the original Spora target.
---

# Shared host (cPanel / Plesk)

Spora's original target environment: a shared host with PHP 8.4+, FTP or SSH access, and a `public_html`-style document root. No Docker, no root, no system services. Just a `composer create-project` and a couple of `chmod` calls.

If you have root or VPS access, [Classical server](/deploy/classical-server) or [Docker](/deploy/docker/multi-container) is a better fit. The cPanel path is for resource-constrained shared hosting where the host is the only thing available.

## Prerequisites

- **PHP 8.4+** — check via the cPanel "MultiPHP Manager" or `php -v` over SSH. Spora uses `readonly` properties, enums, and the FrankenPHP runtime; PHP 8.3 or earlier will not work.
- **`pdo_mysql` extension** — even if you use SQLite at runtime, the platform check at install time requires it. Most hosts include it; if not, ask the host to enable it or pick a host that does.
- **SSH access** (preferred) or **FTP-only** (slower but works)
- **A document root** that points to the skeleton's `public/` directory. For cPanel, this is usually `public_html/`.
- **PHP CLI access** — to run `composer install` and `php bin/spora spora:install`. Some shared hosts restrict CLI; if yours does, ask the host to enable SSH, or use FTP-only (steps below).

## Step-by-step install

### 1. Create the project locally

On your laptop, in a terminal:

```bash
composer create-project spora-ai/spora my-spora
cd my-spora
composer install --no-dev --optimize-autoloader    # production-only deps
```

### 2. Generate the secret key

```bash
php -r "echo base64_encode(random_bytes(32));" > .secret_key
```

Keep `.secret_key` somewhere safe — you'll paste it into `.env` next.

### 3. Edit `.env`

```bash
cp .env.example .env
nano .env
```

Fill in at minimum:

```text
SPORA_APP_ENV=production
SPORA_ALLOW_REGISTRATION=true   # true for first signup, then false
SPORA_SECRET_KEY=<paste the contents of .secret_key>
SPORA_DB_DRIVER=sqlite           # or mysql if your host offers MySQL
```

If using MySQL, also set:

```text
SPORA_DB_DRIVER=mysql
SPORA_DB_HOST=localhost
SPORA_DB_NAME=<your-cpanel-db-name>
SPORA_DB_USER=<your-cpanel-db-user>
SPORA_DB_PASSWORD=<your-cpanel-db-password>
```

### 4. Upload to the host

**Via SSH** (preferred):

```bash
# Tar the project (exclude .git, vendor will be re-installed)
tar --exclude='.git' --exclude='storage/*.sqlite' -czf my-spora.tar.gz my-spora
scp my-spora.tar.gz user@host:~/my-spora.tar.gz
ssh user@host
tar -xzf my-spora.tar.gz
cd my-spora
composer install --no-dev --optimize-autoloader
php bin/spora spora:install
```

**Via FTP** (slower, no CLI):

1. Upload the entire `my-spora/` directory EXCEPT `vendor/`, `node_modules/`, `.git/`, `storage/*.sqlite` to the host (above `public_html/`)
2. Open a web terminal (cPanel offers `Terminal` in some plans) or ask the host to enable SSH
3. Run:

   ```bash
   cd ~/my-spora
   composer install --no-dev --optimize-autoloader
   php bin/spora spora:install
   ```

### 5. Configure the document root

Spora's `public/` directory is the web root. The host's `public_html/` (or equivalent) needs to **point inside `my-spora/public/`**, not at `my-spora/` itself.

**cPanel** (MultiPHP Manager):

- Click "Set PHP versions per directory" or "Document Root"
- Set the document root for the domain to `my-spora/public`
- Save

**Plesk** (Domain Settings):

- Set "Document root" to `my-spora/public`
- Save

**Apache `.htaccess`** (fallback — most cPanels auto-generate this):

```apache
RewriteEngine On
RewriteRule ^(.*)$ public/$1 [L]
```

### 6. Set permissions

```bash
chmod -R 775 storage
chmod 644 .env
```

The `storage/` directory needs to be writable by the web server user (often `nobody` or `www-data`).

### 7. First-run signup

Visit `https://yourdomain.com`. With `SPORA_ALLOW_REGISTRATION=true`, you'll see the signup form. Create your admin account.

**Immediately after signup**, set `SPORA_ALLOW_REGISTRATION=false` in `.env` to prevent random signups. Re-upload the updated `.env`.

### 8. Verify

```bash
curl -I https://yourdomain.com/health
# → 200 OK

curl https://yourdomain.com/api/v1/auth/me
# → 401 (no session) — expected
```

## Daily operation

- **Updates:** SSH in, run `composer update spora-ai/spora`, then `php bin/spora spora:install` to apply any new migrations.
- **Backups:** see [Backups](/start/operators/backups). SQLite is one file; `.env` and `storage/secret.key` are the other essentials.
- **Logs:** `tail -f storage/spora.log` (Monolog). Most cPanels also expose this via the control panel.

## Cron workers

If you set `SPORA_SYNC_MODE=false` to use the async worker:

```cron
* * * * * cd /home/user/my-spora && /usr/bin/php bin/spora worker:run --once --include-queue >> storage/spora.log 2>&1
```

Run this every minute. For tasks that exceed 60 s, consider upgrading to [Classical server](/deploy/classical-server) and running the daemon instead.

## Important constraints

See the [Limitations](/deploy/shared-host/limitations) page. In short:

- The **Mercure SSE hub** requires a long-lived PHP process; on most shared hosts, it falls back to polling.
- **Worker daemon** mode is unreliable on most shared hosts (no `nohup`, no systemd).
- **HTTPS termination** is the host's responsibility (cPanel's AutoSSL or your DNS provider).
- **Custom Docker images** are not deployable.

## Next steps

- [Limitations](/deploy/shared-host/limitations) — what doesn't work on shared hosts
- [Backups](/start/operators/backups) — the operator's backup strategy
- [Day-2 ops](/start/operators/operations) — plugin management, updates, logs, reset
- [Classical server](/deploy/classical-server) — when you outgrow shared hosting
