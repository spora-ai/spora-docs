---
title: Classical server (Apache httpd + PHP-FPM)
description: VPS or dedicated box — Apache httpd + PHP-FPM + supervisord, no Docker.
---

# Classical server (Apache httpd + PHP-FPM)

A Linux server running Spora without Docker. Apache httpd terminates TLS and reverse-proxies to PHP-FPM via `mod_proxy_fcgi`; supervisord manages the agent worker.

Use this when Docker isn't an option (locked-down VPS, air-gapped environment, shared host with shell access). For most operators, the [Docker — multi-container](/deploy/docker/multi-container) path is simpler.

## Prereqs

- Linux (Debian 12 / Ubuntu 24.04 or RHEL family)
- **Apache httpd 2.4.10+** with `mod_proxy`, `mod_proxy_fcgi`, `mod_ssl`, `mod_headers`, `mod_rewrite`
- **PHP 8.4** with FPM and the extensions: `pdo_mysql`, `mbstring`, `xml`, `curl`, `zip`, `intl`
- **Composer 2.x**
- **systemd**
- **supervisord** (for the worker)

```bash
sudo apt install apache2 php8.4-fpm php8.4-{cli,mbstring,xml,curl,zip,intl,mysql,sqlite3} composer supervisor
sudo a2enmod proxy proxy_fcgi ssl headers rewrite
```

PHP 8.4 is not in Debian 12's default repos — install it from [Sury's PHP PPA](https://deb.sury.org/php/) (or use Debian 13 / Ubuntu 24.04 where PHP 8.4 is native).

For full Apache, PHP-FPM, and systemd setup details, see the upstream docs:

- [Apache httpd 2.4 docs](https://httpd.apache.org/docs/2.4/)
- [PHP-FPM configuration](https://www.php.net/manual/en/install.fpm.php)
- [systemd.service man page](https://www.freedesktop.org/software/systemd/man/systemd.service.html)

## Layout

```mermaid
flowchart TB
    Internet([Internet])
    Apache["Apache httpd<br/>:443 TLS, mod_proxy_fcgi → PHP-FPM"]
    PHPFPM["PHP-FPM<br/>(Spora pool)"]
    App["spora-app<br/>/var/www/spora-app/public"]
    Worker["spora-worker<br/>(supervisord)"]
    Mercure["Mercure hub (optional)"]

    Internet -->|TLS| Apache
    Apache -->|/index.php via SetHandler| PHPFPM
    PHPFPM --> App
    Apache -.->|/.well-known/mercure<br/>ProxyPass| Mercure
    Worker -->|drains queue| App

    classDef edge fill:var(--spora-paper),stroke:var(--spora-warm),color:var(--spora-ink)
    classDef svc fill:var(--spora-paper-deep),stroke:var(--spora-warm-deep),color:var(--spora-ink)
    class Internet edge
    class Apache,PHPFPM,Mercure,Worker svc
```

## 1. Apache vhost

The vhost below handles everything: TLS, PHP dispatch, the SPA fallback, and the deny-by-existence rule. The project also ships a `spora/.htaccess` (the shared-host fallback for the cPanel-style deploy) but you do **not** need it on the classical-server path — the vhost's `DocumentRoot` is `public/`, and the rewrite rules live in the vhost itself.

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com
    Redirect permanent / https://yourdomain.com/
</VirtualHost>

<VirtualHost *:443 ssl http2>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com
    DocumentRoot /var/www/spora-app/public

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/yourdomain.com/privkey.pem
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5

    <Directory /var/www/spora-app/public>
        Options -Indexes -MultiViews
        AllowOverride None
        Require all granted
    </Directory>

    # PHP-FPM via mod_proxy_fcgi (Apache 2.4.10+).
    <FilesMatch "\.php$">
        SetHandler "proxy:unix:/run/php/php8.4-fpm-spora.sock|fcgi://localhost"
    </FilesMatch>

    # SPA fallback — anything that isn't a real file/directory routes
    # to /index.php, which then serves the SPA shell or the /api/*
    # endpoint. (Equivalent to the spora/.htaccess shared-host fallback
    # pattern, but inlined here because DocumentRoot is public/.)
    FallbackResource /index.php

    ErrorLog ${APACHE_LOG_DIR}/spora-error.log
    CustomLog ${APACHE_LOG_DIR}/spora-access.log combined
</VirtualHost>
```

## 2. PHP-FPM pool

The pool runs as a dedicated `spora` system user (separate from the web server's user, so the FPM workers can't be tricked into writing to anything the web server owns). Create it once:

```bash
sudo useradd --system --home /var/www/spora-app --shell /usr/sbin/nologin spora
```

Then `/etc/php/8.4/fpm/pool.d/spora.conf`:

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

## 3. supervisord for the worker

The worker drains the queued tasks in async mode (the default, per [env-vars §Worker / Sync Mode](/start/operators/env-vars#worker--sync-mode)). Create the log directory first (supervisord will fail to start the program if the log path doesn't exist), then write the program config:

```bash
sudo mkdir -p /var/log/spora
sudo chown spora:spora /var/log/spora
```

`/etc/supervisor/conf.d/spora.conf`:

```ini
[program:spora-worker]
command=/usr/bin/php /var/www/spora-app/bin/spora worker:run --daemon
user=spora
autostart=true
autorestart=true
startretries=3
stderr_logfile=/var/log/spora/worker.err.log
stdout_logfile=/var/log/spora/worker.out.log
```

Apply the new program config without restarting the supervisord daemon (works on every distro, doesn't drop the existing program set):

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo systemctl reload php8.4-fpm
```

## 4. TLS

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d yourdomain.com -d www.yourdomain.com
```

The Let's Encrypt cert is auto-renewed by a certbot systemd timer. See the [Certbot docs](https://eff-certbot.readthedocs.io/).

## 5. Mercure (optional)

The live chat UI streams updates via [Mercure](https://mercure.rocks/) (Server-Sent Events). For a public deploy, run a Mercure hub and reverse-proxy it through Apache at `/.well-known/mercure`. See the [Mercure install docs](https://mercure.rocks/docs/getting-started) — Mercure is a Go binary; there is no `apt install mercure` in the standard repos.

For a local-only or single-user deploy, you can skip Mercure — the chat UI will fall back to polling, with extra delay on message delivery.

## What's next

- For Docker-based deploys: [Docker — multi-container](/deploy/docker/multi-container)
- For a shared cPanel/FTP host: [Shared host](/deploy/shared-host)
- For local laptop: [Local — PHP / Ollama / LM Studio](/deploy/local)
