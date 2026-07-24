---
title: First conversation
description: Sign in, send your first message, and read the agent's reply.
---

# First conversation

This walks through a first session with Spora: signing in, sending a message, reading the reply, and understanding what just happened.

## Step 1 — Sign in

Open `http://localhost:8080` (or your deployment URL) in a browser. You'll see the login screen.

The default seeded admin credentials are printed by `db:seed` — `admin@spora.local` / `password` (defined in `spora-core/app/Core/DatabaseSeeder.php:47`). **Change these immediately** under **Settings → Users → Edit**.

If you disabled `SPORA_ALLOW_REGISTRATION` before creating your account, you can't sign up via the UI. Ask an admin to create the account for you, or re-enable registration in `.env` and restart.

## Step 2 — Pick an agent (or create one)

After sign-in, the home page lists your agents. By default there's a single sample agent (created by `db:seed` if you ran it). Click on it to open the chat.

If no agents exist, go to **Agents → New** and create one. The minimum:

- **Name** — what the agent is (e.g. "Research Assistant")
- **System prompt** — instructions for the LLM (e.g. "You are a helpful research assistant. Be concise. Cite sources.")
- **LLM config** — which model to use. The seeded agent points at a placeholder LLM; you need to configure one. See [Managing agents → LLM config](/start/end-users/managing-agents#llm-config).
- **Tools** — leave empty for now. The agent will reply without using any tools.

## Step 3 — Send a message

In the chat input at the bottom of the page, type something like:

> What's the capital of France?

Press Enter (or click Send). The page shows:

1. **Your message** in a bubble
2. **The agent's reply** appearing once the LLM responds
3. **Optional: a tool-call timeline** — if the agent called any tools, you see them with their inputs and outputs

For a simple "what's the capital" question with no tools enabled, the agent replies directly without calling anything. The reply is the LLM's plain text output.

## Step 4 — Read the agent's reply

The reply bubble shows:

- **The text** the agent produced
- **The model** that answered (if you have multiple LLM configs, hover or click to see which was used)
- **Token usage** — usually visible at the bottom of the bubble (input tokens, output tokens, cached)

If the LLM config has `exposeToLlm: true` settings (e.g. allowed domains for a search tool), the LLM sees those values as part of its system prompt. The reply is grounded in those values.

## Step 5 — Try with a tool

To see the agent call a tool:

1. Install a plugin. Go to **Plugins → Browse** (if enabled) or run `php bin/spora plugin:install spora-ai/spora-plugin-tavily` on the server.
2. Configure the tool. Go to **Tools → Tavily Search** and paste your `api_key` (from <https://tavily.com>).
3. Open your agent, go to the **Tools** tab, and enable Tavily Search.
4. Send a message: "Search the web for the latest on Apple's Vision Pro"

The agent will:

1. Recognise that the query needs web search
2. Call the `tavily_search` tool with your query
3. Receive the search results
4. Compose a reply that cites the sources

You'll see the tool call in the chat timeline — the agent's "thinking", the tool call with its arguments, the tool's result, and the agent's final reply.

## What just happened

Every chat message is a **task** in the Orchestrator. The lifecycle:

1. **Claim** — your message creates a `Task` record in `RUNNING` state (sync mode) or `QUEUED` state (worker mode)
2. **LLM call** — Orchestrator calls the LLM with the system prompt + your message + tool definitions
3. **Branch** — if the LLM returns text, the task is `COMPLETED`; if it returns a tool call, the Orchestrator executes the tool and calls the LLM again with the result
4. **Loop** — repeat step 3 until the LLM returns text or `max_steps` is reached
5. **History** — every LLM message and tool call is appended to `task_history` for the next turn

For details, see [Concepts → Agent loop and async mode](/reference/concepts/agent-loop-async).

## What the chat timeline shows

- **Your message** (right-aligned, plain text)
- **The agent's "thinking"** — appears when the assistant message contains `content_blocks` entries of type `thinking` (Anthropic with thinking enabled) or `redacted_thinking`. Token counts are surfaced separately in the `usage` panel (`input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, …).
- **Tool calls** — the LLM's `tool_use` block, shown with the tool name, arguments, and the result
- **The final reply** (left-aligned, the agent's actual response)

## When something goes wrong

If the agent doesn't reply:

- **LLM config is wrong** — go to **Settings → LLM drivers** and verify the API key and base URL
- **Worker isn't running** (worker mode) — check `php bin/spora worker:run --daemon` is running, or `* * * * * php bin/spora worker:run --once --include-queue` in cron
- **Mercure not running** (real-time updates fail) — the UI falls back to polling, so the reply will appear but with delay

See [Troubleshooting](/start/end-users/troubleshooting) for more.

## What's next

- **[Managing agents](/start/end-users/managing-agents)** — configure tools, write good system prompts, manage recipes
- **[Troubleshooting](/start/end-users/troubleshooting)** — common issues
- [Operators → Operations](/start/operators/operations) — plugin management, updates, logs (for the operator running the install)
