---
title: Operators Guide
description: Deploying and running Spora in production.
---

## Operators Guide

This track is for **running a Spora instance after install** — configuring it via env-vars, securing it, doing day-2 ops, and backing it up. If you are a developer working on Spora itself, see the [Developers guide](/start/developers/). If you are using the admin UI, see the [End user guide](/start/end-users/). For **host setup** (Docker, Apache, shared host, local), see the [Deployment guide](/deploy/).

## What you'll do here

1. **[Install](/start/operators/install)** — standard install (Packagist) + troubleshooting. For Docker, Classical, or Shared host, see the [Deployment guide](/deploy/).
2. **[Installation modes](/start/operators/installation-modes)** — pick the right package and runtime mode for your host
3. **[Configure](/start/operators/customization)** — env vars, customization strategies, theming
4. **[Environment variables](/start/operators/env-vars)** — full `.env` reference
5. **[Security](/start/operators/security)** — credential encryption, auth, rate limiting, plugin risks
6. **[Day-2 operations](/start/operators/operations)** — backups, plugin management, updates, logs, workers, reset
7. **[Backups](/start/operators/backups)** — detailed backup strategy
8. **[Upgrade to client-worker mode](/start/operators/upgrade-to-client-worker)** — migrating from `SPORA_SYNC_MODE` (pre-0.19 installs only)

## A note on shared hosting

Spora is designed to run on a shared cPanel/FTP host with PHP 8.4+. That is the original target environment and the one with the most polish. The Docker path is a convenience for the same architecture. See the [Deployment guide](/deploy/) for the long-form scenario pages.
