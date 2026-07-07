---
title: Operators Guide
description: Deploying and running Spora in production.
---

## Operators Guide

This track is for people running Spora — installing it, configuring it, backing it up, and keeping it up. If you are a developer working on Spora itself, see the [Developers guide](/start/developers/). If you are using the admin UI, see the [End user guide](/start/end-users/).

## What you'll do here

1. **[Install](/start/operators/install)** — five routes: standard, shared host, dev mode, Docker, troubleshooting
2. **[Configure](/start/operators/customization)** — env vars, customization strategies, theming
3. **[Environment variables](/start/operators/env-vars)** — full `.env` reference
4. **[Security](/start/operators/security)** — credential encryption, auth, rate limiting, plugin risks
5. **[Day-2 operations](/start/operators/operations)** — backups, plugin management, updates, logs, workers, reset
6. **[Backups](/start/operators/backups)** — detailed backup strategy

## A note on shared hosting

Spora is designed to run on a shared cPanel/FTP host with PHP 8.4+. That is the original target environment and the one with the most polish. The Docker path is a convenience for the same architecture. See the [Deployment guide](/deploy/) for the long-form scenario pages.
