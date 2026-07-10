---
title: Local — PHP / Ollama / LM Studio
description: Run Spora on a laptop — with optional local LLM via Ollama or LM Studio.
---

# Local — PHP / Ollama / LM Studio

Run Spora on your laptop. No Docker, no VPS, no shared host. The skeleton's `composer dev` command starts the PHP built-in server against the prebuilt `public/dist/` (the host's compiled admin SPA + index.php front controller). You can also use the canonical FrankenPHP image via [Docker — single container](/deploy/docker/single-container).

Two paths for the LLM:

1. **Hosted LLM** (Anthropic Claude, OpenAI GPT) — point an [LLM driver config](/start/operators/security#llm-driver-config) at the hosted endpoint
2. **Local LLM via Ollama or LM Studio** — for offline use, privacy, or to avoid per-token costs

This page covers the local LLM path. The PHP server path is the same as the standard operator install.

## Prerequisites

- **PHP 8.4+** with `pdo_mysql`, `mbstring`, `zip`, `json` extensions
- **Composer** (latest 2.x)
- **Ollama** ([ollama.com](https://ollama.com)) OR **LM Studio** ([lmstudio.ai](https://lmstudio.ai)) — only needed for the local LLM path

> The skeleton's dev loop is PHP-only — there is no Vite dev server running against the host. If you're hacking on the host's Vue frontend itself (`spora-ai/spora-frontend`), see that repo's `npm run dev`; otherwise the prebuilt `public/dist/` is the source of truth at runtime.

## Path A — Pure PHP server (hosted LLM)

The skeleton's `composer dev` starts the PHP built-in server:

```bash
composer create-project spora-ai/spora my-spora
cd my-spora
composer install
cp .env.example .env
# Edit .env: set SPORA_SECRET_KEY, leave SPORA_DB_DRIVER=sqlite
php bin/spora spora:install
php bin/spora db:seed   # creates a sample admin user (see output for credentials)
composer dev
```

The site is at `http://127.0.0.1:8080`. The actual command (from `composer.json:33`) is:

```bash
php -S ${PHP_HOST:-127.0.0.1}:${PHP_PORT:-8080} -t public/dist public/index.php
```

For a more production-like local server, use the Docker image from [Custom build](/deploy/docker/custom-build) or the [Docker — single container](/deploy/docker/single-container) path.

## Path B — Local LLM with Ollama

[Ollama](https://ollama.com) is a single-binary LLM runner. It serves an OpenAI-compatible API at `http://localhost:11434/v1`, so Spora's `OpenAICompatibleDriver` works against it with no code changes.

### Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (a few GB)
ollama pull llama3.2:3b
ollama pull qwen2.5-coder:7b   # good for tool-calling
```

### Configure Spora

In the admin UI:

1. Go to **Settings → LLM drivers**
2. Add a new LLM config:
   - **Driver**: `OpenAI Compatible`
   - **Name**: `Ollama — Llama 3.2 3B` (or whatever)
   - **Base URL**: `http://localhost:11434/v1`
   - **API Key**: `(any value — Ollama ignores it, but the field is required)`
   - **Model**: `llama3.2:3b`
   - **Context window**: 8192
   - **Max output tokens**: 4096
3. Save

Then attach this driver to an agent in **Agents → [agent] → LLM config**.

### Try it

In the admin UI's chat view, send a message. The agent will use Ollama locally — no API calls leave your machine, no per-token cost, fully offline.

### Models that work well

Ollama supports many open-weights models. The ones that handle tool-calling reliably (essential for Spora agents):

- `llama3.2:3b`, `llama3.2:8b` — small, fast
- `qwen2.5-coder:7b` — good at code and tool calls
- `mistral:7b`, `mistral-nemo:12b` — good general-purpose
- `deepseek-coder-v2:16b` — best for coding tasks

Larger models (32B+) are smarter but need more RAM. 7B models fit comfortably on 16 GB Macs.

## Path C — Local LLM with LM Studio

[LM Studio](https://lmstudio.ai) is a GUI app for running LLMs locally. It also serves an OpenAI-compatible API at `http://localhost:1234/v1`.

### Install LM Studio

Download from [lmstudio.ai](https://lmstudio.ai). The app runs on macOS, Windows, and Linux. Once installed:

1. Search for a model in the LM Studio library (e.g. "Qwen2.5 Coder 7B Q4_K_M")
2. Click "Download"
3. Go to the "Developer" tab
4. Start the local server (default port 1234, OpenAI-compatible)

### Configure Spora

Same as Ollama:

- **Base URL**: `http://localhost:1234/v1`
- **API Key**: `(any value)`
- **Model**: the model name shown in LM Studio (e.g. `qwen2.5-coder-7b-instruct`)

## Path D — Both: PHP server + local LLM

The default `composer dev` is the dev loop. For a more production-like local server, use the Docker single-container and set the LLM to point at Ollama / LM Studio:

```yaml
# docker-compose.yml
services:
  spora:
    image: ghcr.io/<your-org>/spora:latest # your custom build
    ports:
      - '8080:80'
    environment:
      SPORA_APP_ENV: development
      SPORA_DB_DRIVER: sqlite
      SPORA_SECRET_KEY: ${SPORA_SECRET_KEY:?required}
    volumes:
      - spora_storage:/app/storage

  # No mariadb / phpmyadmin — SQLite + local LLM
volumes:
  spora_storage:
```

Start Ollama separately, then in the admin UI add a new LLM config pointing at `http://host.docker.internal:11434/v1` (the special Docker hostname for the host machine).

## Performance expectations

Local LLMs are 5-20× slower than hosted Claude/GPT-4 for tool-calling tasks. Expectations:

- A 3B model: 5-15 seconds per tool call
- A 7B model: 10-30 seconds per tool call
- A 12B+ model: 30-60 seconds per tool call

For exploratory dev and demos this is fine. For production agent workloads, hosted Claude or GPT-4 is dramatically faster.

## What's next

- [Operations → Day-2 ops](/start/operators/operations) — local LLM config in the admin UI, agent tools, etc.
- [Operations → Backups](/start/operators/backups) — local backup strategy
- [Docker — single container](/deploy/docker/single-container) — same setup, but via Docker
