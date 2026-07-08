---
title: Classical server (Apache + PHP-FPM + systemd)
description: VPS or dedicated box — Apache httpd + PHP-FPM + systemd + supervisord, no Docker.
---

# Classical server (Apache + PHP-FPM + systemd)

A VPS or dedicated box running Spora without Docker. Apache terminates TLS and reverse-proxies to PHP-FPM via `mod_proxy_fcgi`, supervisord manages the agent worker daemon, and systemd restarts everything on reboot.

This is the most "Unix-native" deployment of Spora. If you have shell access and want full control over the runtime, this is the right path.

If you have a managed environment (Docker, Kubernetes, PaaS), use [Docker — multi-container](/deploy/docker/multi-container) instead. The classical server path is for bare-metal or VPS where you own the OS.

## Prerequisites

- A Linux server (Debian / Ubuntu / RHEL — these examples use Debian 12)
- **PHP 8.4+** with `pdo_mysql`, `mbstring`, `zip`, `json` extensions
- **Apache httpd 2.4.10+** (Debian/Ubuntu: `apt install apache2`; the modules listed in [step 5](#5-apache-virtualhost) are required)
- **supervisord** for the worker daemon
- **MariaDB** or **MySQL** (or skip and use SQLite)
- **Composer** (`curl -sS https://getcomposer.org/installer | php`)

## Architecture

```mermaid
flowchart TB
    Internet([Internet])
    Apache["Apache httpd<br/>:443 TLS, static assets,<br/>mod_proxy_fcgi → PHP-FPM"]
    PHPFPM["PHP-FPM<br/>(Spora pool)<br/>unix:/run/php/php8.4-fpm-spora.sock"]
    App["spora-app<br/>/var/www/spora-app/public"]
    Mercure["Mercure hub<br/>(Caddy :3000)"]
    Super["supervisord"]
    Worker["spora-worker<br/>php bin/spora worker:run --daemon"]
    Systemd1["systemd<br/>php8.4-fpm-spora.service"]
    Systemd2["systemd<br/>apache2.service"]

    Internet -->|TLS| Apache
    Apache -->|SetHandler proxy:unix:…&vert;fcgi://localhost| PHPFPM
    PHPFPM --> App
    Apache -.->|/.well-known/mercure<br/>ProxyPass| Mercure
    Systemd1 -.->|manages| PHPFPM
    Systemd2 -.->|manages| Apache
    Super -.->|manages| Worker

    classDef edge fill:var(--spora-paper),stroke:var(--spora-warm),color:var(--spora-ink)
    classDef service fill:var(--spora-paper-deep),stroke:var(--spora-warm-deep),color:var(--spora-ink)
    classDef runtime fill:var(--spora-cream),stroke:var(--spora-warm-deep),color:var(--spora-ink)
    class Internet edge
    class Apache,PHPFPM,Mercure service
    class App,Worker runtime
```

Two long-lived processes:

- **`spora-web`** — managed by systemd as the `php8.4-fpm-spora.service` unit. Serves the Spora app via FastCGI from Apache.
- **`spora-worker`** — managed by supervisord. Runs the agent worker daemon (`php bin/spora worker:run --daemon`). Restarts on crash.

## Step-by-step install

### 1. Create the Spora project

```bash
# As the spora user (or a dedicated deploy user)
sudo useradd -m -s /bin/bash spora
sudo su - spora

cd /var/www
git clone https://github.com/spora-ai/spora.git spora-app
cd spora-app
composer install --no-dev --optimize-autoloader
```

### 2. Configure the environment

```bash
cp .env.example .env
$EDITOR .env
```

Set at minimum:

```text
SPORA_APP_ENV=production
SPORA_ALLOW_REGISTRATION=true   # for the first admin signup
SPORA_SECRET_KEY=<base64-32-bytes>
SPORA_DB_DRIVER=mysql
SPORA_DB_HOST=127.0.0.1
SPORA_DB_PORT=3306
SPORA_DB_NAME=spora
SPORA_DB_USER=spora
SPORA_DB_PASSWORD=<strong-password>
SPORA_SYNC_MODE=false           # use the async worker
```

### 3. Set up the database

```bash
sudo mysql
> CREATE DATABASE spora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> CREATE USER 'spora'@'localhost' IDENTIFIED BY '<strong-password>';
> GRANT ALL ON spora.* TO 'spora'@'localhost';
> FLUSH PRIVILEGES;
> exit
```

Then run the install:

```bash
php bin/spora spora:install    # applies migrations, creates the schema
```

### 4. PHP-FPM pool

Create `/etc/php/8.4/fpm/pool.d/spora.conf`:

```ini
[spora]
user = spora
group = spora
listen = /run/php/php8.4-fpm-spora.sock
listen.owner = www-data
listen.group = www-data
pm = dynamic
pm.max_children = 20
pm.start_servers = 4
pm.min_spare_servers = 2
pm.max_spare_servers = 8
pm.max_requests = 500
php_admin_value[memory_limit] = 256M
php_admin_value[upload_max_filesize] = 50M
php_admin_value[post_max_size] = 50M
php_admin_value[max_execution_time] = 120
```

```bash
sudo systemctl reload php8.4-fpm
```

### 5. Apache virtualhost

Enable the required modules (Apache 2.4.10+):

```bash
sudo a2enmod proxy proxy_fcgi ssl headers expires rewrite rewrite
sudo a2dissite 000-default
```

Create `/etc/apache2/sites-available/spora.conf`:

```apache
# HTTP → HTTPS redirect
<VirtualHost *:80>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com
    Redirect permanent / https://yourdomain.com/
</VirtualHost>

<VirtualHost *:443 ssl http2>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com
    DocumentRoot /var/www/spora-app/public

    # SSL (Let's Encrypt)
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/yourdomain.com/privkey.pem
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5

    # Security headers (mirror spora/.htaccess)
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # /var/www/spora-app/public — AllowOverride All lets the bundled
    # .htaccess (rewrite + security headers) keep working in the
    # bare-vhost fallback path.
    <Directory /var/www/spora-app/public>
        Options -Indexes -MultiViews
        AllowOverride All
        Require all granted
    </Directory>

    # Block direct access to sensitive files at the project root.
    # (Mirrors spora/.htaccess lines 47-54.)
    <DirectoryMatch "/var/www/spora-app/\.(env|git|svn|hg)">
        Require all denied
    </DirectoryMatch>
    <DirectoryMatch "/var/www/spora-app/(config|storage|vendor|bin|tests)">
        Require all denied
    </DirectoryMatch>

    # Mercure hub (SSE) — reverse-proxied to the Caddy/Mercure process
    # on :3000. ProxyIOBufferSize 0 disables buffering so events stream
    # to the browser in real time.
    <LocationMatch "^/\.well-known/mercure">
        ProxyPass        http://127.0.0.1:3000/
        ProxyPassReverse http://127.0.0.1:3000/
        ProxyIOBufferSize 0
        SetEnv proxy-sendchunked 1
    </LocationMatch>

    # Static assets — long-lived cache, immutable.
    <DirectoryMatch "^/var/www/spora-app/public/assets">
        Header set Cache-Control "public, max-age=31536000, immutable"
        ExpiresActive On
        ExpiresDefault "access plus 1 year"
    </DirectoryMatch>

    # PHP-FPM via mod_proxy_fcgi (Apache 2.4.10+). The `|fcgi://localhost`
    # part of the SetHandler URL tells Apache to dispatch the request to
    # the FastCGI endpoint over a Unix socket.
    <FilesMatch "\.php$">
        SetHandler "proxy:unix:/run/php/php8.4-fpm-spora.sock|fcgi://localhost"
    </FilesMatch>

    # SPA fallback — any path that isn't a real file or directory is
    # routed to /index.php, which then serves the SPA shell or the
    # /api/* endpoint. (Equivalent to the nginx `try_files $uri /index.php`.)
    FallbackResource /index.php

    ErrorLog ${APACHE_LOG_DIR}/spora-error.log
    CustomLog ${APACHE_LOG_DIR}/spora-access.log combined
</VirtualHost>
```

Get a free Let's Encrypt cert:

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d yourdomain.com -d www.yourdomain.com
```

Enable and reload:

```bash
sudo a2ensite spora
sudo apache2ctl configtest
sudo systemctl reload apache2
```

> Requires Apache 2.4.10+ with `mod_proxy`, `mod_proxy_fcgi`, `mod_ssl`, `mod_headers`, `mod_expires`, and `mod_rewrite` enabled. The `a2enmod` line above enables them all.

### 6. supervisord for the worker

Create `/etc/supervisor/conf.d/spora.conf`:

```ini
[program:spora-worker]
command=/usr/bin/php /var/www/spora-app/bin/spora worker:run --daemon
directory=/var/www/spora-app
user=spora
autostart=true
autorestart=true
startsecs=5
stopwaitsecs=10
stdout_logfile=/var/log/spora-worker.log
stderr_logfile=/var/log/spora-worker.err
environment=APP_ENV=production
```

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status spora-worker   # should be RUNNING
```

### 7. systemd for Apache + PHP-FPM

Apache is managed by systemd out of the box. PHP-FPM is too, but if you want a dedicated Spora pool with its own unit (so it can be restarted independently of any other PHP-FPM pools on the host), add a drop-in:

Create `/etc/systemd/system/php8.4-fpm-spora.service`:

```ini
[Unit]
Description=Spora PHP-FPM pool
Documentation=https://docs.spora-ai.com/deploy/classical-server
After=network.target

[Service]
Type=notify
ExecStart=/usr/sbin/php-fpm8.4 --nodaemonize --fpm-config /etc/php/8.4/fpm/pool.d/spora.conf
ExecReload=/bin/kill -USR2 $MAINPID
Restart=on-failure
RestartSec=5s
RuntimeDirectory=php
RuntimeDirectoryMode=0750

[Install]
WantedBy=multi-user.target
```

Then enable the trio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now php8.4-fpm-spora
sudo systemctl enable --now apache2
```

Reboot survives — systemd restarts both.

## Mercure hub (optional, for real-time updates)

Spora publishes task state changes to a Mercure hub for real-time UI updates. The Docker setup runs Mercure natively on FrankenPHP. On a classical server, you need to run Mercure as a separate process.

The official [Mercure.rocks](https://mercure.rocks/) hub is a small Go binary. Install:

```bash
sudo apt install -y mercure
# or download the binary from https://github.com/dunglas/mercure
```

Configure `/etc/mercure/Caddyfile` or `mercure.toml`:

```caddyfile
{
    auto_https off
}
:3000
route {
    mercure {
        publisher_jwt {!env.SPORA_MERCURE_JWT_KEY} HS256
        subscriber_jwt {!env.SPORA_MERCURE_JWT_KEY} HS256
        anonymous
    }
    respond "Not Found" 404
}
```

Generate a JWT key (32 random bytes, base64-encoded — same as `SPORA_SECRET_KEY`):

```bash
export SPORA_MERCURE_JWT_KEY=$(php -r "echo base64_encode(random_bytes(32));")
echo "SPORA_MERCURE_JWT_KEY=$SPORA_MERCURE_JWT_KEY" | sudo tee -a /etc/default/mercure
```

Set `SPORA_MERCURE_URL=https://yourdomain.com/.well-known/mercure` in `.env`. The Apache vhost above already proxies that path to `127.0.0.1:3000`.

## Updating

```bash
cd /var/www/spora-app
sudo -u spora git pull
sudo -u spora composer install --no-dev --optimize-autoloader
sudo -u spora php bin/spora spora:install    # apply any migrations
sudo supervisorctl restart spora-worker
```

## Health monitoring

Watch for:

- **`spora-worker` process crashes** — supervisord auto-restarts; alert on `STARTING → RUNNING` transitions in `supervisorctl status` output
- **PHP-FPM stuck workers** — `pm.max_requests = 500` in the pool config recycles workers after 500 requests; if you see them stuck, lower the value
- **Disk usage on `storage/`** — alert at 80% full. Logs grow over time; rotate them
- **MariaDB connection count** — `SHOW STATUS LIKE 'Threads_connected';`. If it's near `max_connections`, scale up

For external monitoring (Prometheus, Datadog, etc.):

- The `/health` endpoint returns 200 OK and is safe to scrape every 5-10 s
- supervisord exposes an XML-RPC interface (not Prometheus, but scrapeable)
- PHP-FPM exposes a status page at `/fpm-status` (configure `pm.status_path` in the pool)

## Next steps

- [Backups](/start/operators/backups) — the operator's backup strategy
- [Day-2 ops](/start/operators/operations) — plugin management, updates, logs, reset
- [Docker multi-container](/deploy/docker/multi-container) — if you want the canonical Docker path
- [Local — PHP / Ollama / LM Studio](/deploy/local) — local dev with optional offline LLMs
