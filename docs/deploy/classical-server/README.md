---
title: Classical server (nginx + PHP-FPM + systemd)
description: VPS or dedicated box — nginx + PHP-FPM + systemd + supervisord, no Docker.
---

# Classical server (nginx + PHP-FPM + systemd)

A VPS or dedicated box running Spora without Docker. nginx terminates TLS and reverse-proxies to PHP-FPM, supervisord manages the agent worker daemon, and systemd restarts everything on reboot.

This is the most "Unix-native" deployment of Spora. If you have shell access and want full control over the runtime, this is the right path.

If you have a managed environment (Docker, Kubernetes, PaaS), use [Docker — multi-container](/deploy/docker/multi-container) instead. The classical server path is for bare-metal or VPS where you own the OS.

## Prerequisites

- A Linux server (Debian / Ubuntu / RHEL — these examples use Debian 12)
- **PHP 8.4+** with `pdo_mysql`, `mbstring`, `zip`, `json` extensions
- **nginx** (any modern version)
- **supervisord** for the worker daemon
- **MariaDB** or **MySQL** (or skip and use SQLite)
- **Composer** (`curl -sS https://getcomposer.org/installer | php`)

## Architecture

```text
Internet
   │ :443 (TLS)
   ▼
┌─────────┐
│  nginx  │  ← TLS termination, static assets, gzip, rate limit
└────┬────┘
     │ :9000 (FastCGI)
     ▼
┌─────────────┐
│  PHP-FPM    │  ← /run/php/php8.4-fpm.sock or :9000
│  (Spora)    │
└────┬────────┘
     │
     ▼
┌─────────────┐
│ supervisord │
│ ├─ spora-web  (the PHP-FPM pool, also managed by systemd)
│ └─ spora-worker  (php bin/spora worker:run --daemon)
└─────────────┘
```

Two long-lived processes:

- **`spora-web`** — managed by systemd as part of the `php8.4-fpm` service (or by supervisord if you don't use systemd). Serves the Spora app via FastCGI from nginx.
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

### 5. nginx site

Create `/etc/nginx/sites-available/spora`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/spora-app/public;
    index index.php;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Mercure hub (SSE)
    location ~ ^/.well-known/mercure {
        default_type text/event-stream;
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 24h;
    }

    # Static assets
    location ~ ^/assets/ {
        try_files $uri =404;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri /index.php$is_args$args;
    }

    # PHP
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_pass unix:/run/php/php8.4-fpm-spora.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
        include fastcgi_params;
    }

    # Block direct access to sensitive files
    location ~ /\.(env|git|svn|hg) { deny all; }
    location ~ /(config|storage|vendor|bin|tests)/ { deny all; }
}
```

Get a free Let's Encrypt cert:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/spora /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

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

### 7. systemd for nginx + PHP-FPM

PHP-FPM and nginx are managed by systemd in standard Debian/Ubuntu installs. Just enable them:

```bash
sudo systemctl enable --now php8.4-fpm nginx
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

Set `SPORA_MERCURE_URL=https://yourdomain.com/.well-known/mercure` in `.env`. The nginx config above already proxies that path to `127.0.0.1:3000`.

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
