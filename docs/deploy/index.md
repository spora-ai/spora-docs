---
title: Deployment
description: Pick the right scenario — Docker, shared host, classical server, or local.
---

# Deployment

Spora runs anywhere PHP 8.4+ runs. Pick the scenario that matches your environment.

## Decision matrix

| Scenario                                                         | When                                                                                             | Effort    | Best for                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------- |
| **[Docker — single container](/deploy/docker/single-container)** | You want a self-contained container with Spora + SQLite. One image, one process, no external DB. | Minutes   | Local laptop, small production, "I just want it running" |
| **[Docker — multi-container](/deploy/docker/multi-container)**   | You want the canonical setup: Spora + MariaDB + phpMyAdmin, all networked, all health-checked.   | Minutes   | Production deployments, multi-app stacks                 |
| **[Docker — custom build](/deploy/docker/custom-build)**         | You want to fork the image, change a base layer, ship to GHCR, or pin a different Spora version. | 1-2 hours | Custom integrations, version pinning, CI-built images    |
| **[Shared host](/deploy/shared-host)**                           | You have a cPanel / Plesk / FTP-only host with PHP 8.4+ but no Docker and no root.               | ~30 min   | Shared cPanel/FTP hosting (the original Spora target)    |
| **[Classical server](/deploy/classical-server)**                 | You have a VPS or dedicated box and want nginx + PHP-FPM + systemd + supervisord, no Docker.     | 1-2 hours | VPS / bare-metal production with full control            |
| **[Local — PHP / Ollama / LM Studio](/deploy/local)**            | You're hacking on Spora locally, or running an offline LLM (Ollama or LM Studio) for privacy.    | Minutes   | Laptop dev, offline use                                  |

## What Spora needs

Regardless of scenario, Spora needs:

- **PHP 8.4+** (the codebase uses `readonly` properties, enums, and the FrankenPHP-targeted FrankenPHP runtime; PHP 8.3 or earlier will not work)
- **`pdo_mysql` PHP extension** (even for SQLite — the platform check at install time requires it)
- **Composer** (only for non-Docker installs; the Docker image bundles the deps)
- **A persistent `storage/` directory** for SQLite DB + secret key + logs
- **Outbound HTTPS** to your LLM provider (Anthropic, OpenAI, Ollama with TLS, etc.)

## What's next

For the **common case** (a self-contained install you can run on a laptop or a small VPS), start with [Docker — single container](/deploy/docker/single-container) or [Docker — multi-container](/deploy/docker/multi-container). They use the project's official images and require no source build.

For **shared hosting** (cPanel/FTP), see [Shared host](/deploy/shared-host) — the original Spora target. The 5-step install + the [limitations page](/deploy/shared-host/limitations) are required reading.

For **bare-metal / VPS** without Docker, see [Classical server](/deploy/classical-server) — nginx + PHP-FPM + systemd + supervisord, with TLS termination at nginx.

For **local development** with optional offline LLMs, see [Local — PHP / Ollama / LM Studio](/deploy/local).

For all scenarios, the env-var reference is in the operator's [Environment variables](/start/operators/env-vars) page. For per-scenario troubleshooting, the [Operations → Day-2 ops](/start/operators/operations) page covers the common cases.
