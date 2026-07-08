---
title: Troubleshooting
description: Common issues, what to do when an agent gets stuck, where to find logs.
---

# Troubleshooting

Common issues end users hit when chatting with Spora agents. The operator (who runs the install) handles most of the infrastructure, but these are the things you can check from the admin UI.

## Agent doesn't reply

The most common cause: **the LLM config is wrong** (missing API key, wrong model, wrong base URL). Check:

1. Go to **Settings → LLM drivers**
2. Click on the LLM config the agent is using
3. Verify:
   - **API key** is set (if your provider requires one)
   - **Base URL** is correct (e.g. `https://api.anthropic.com` for Claude, `http://localhost:11434/v1` for Ollama)
   - **Model** matches what the provider exposes (test with `curl` if unsure)

Test the LLM config directly — most providers have a "test" button in the edit form.

If the LLM is fine but the agent still doesn't reply:

- **Worker mode + worker not running** — if `SPORA_SYNC_MODE=false` and no worker is running, the message queues forever. Ask the operator to start the worker.
- **Database locked** — SQLite under contention. Restart the worker / PHP-FPM to drop any orphaned locks.
- **Mercure not running** — the chat falls back to polling. Messages still get through, but with delay (5-15 s).

## Agent replies, but tool calls never happen

The agent's system prompt may not be giving clear guidance on when to use tools. Check:

- **Tools enabled** — in the agent's **Tools** tab, is the tool checked?
- **Tool description** — the LLM uses the `#[Tool(description: '...')]` text to decide when to call the tool. If the description is vague, the LLM won't reach for it.
- **System prompt references the tool** — the LLM only knows what the system prompt tells it. If the prompt says "use tavily for current-events questions" but the tool isn't enabled, the LLM tries to call it and fails. The reverse is also true: if the tool is enabled but the prompt doesn't mention it, the LLM might never reach for it.

To debug: enable a tool, send a message that obviously needs it, and watch the chat timeline. The LLM's `tool_use` block should appear before the reply.

## Agent calls a tool but it fails

The chat timeline shows the tool call with its arguments and the failure message. Common patterns:

- **Authentication error** — wrong API key, expired API key, or rate-limit error
- **Network error** — the operator's host can't reach the external service (e.g. firewall blocks outbound HTTPS)
- **Schema validation error** — the LLM passed arguments that don't match the `#[ToolParameter]` schema (e.g. wrong type, missing required field)
- **Tool timeout** — the tool took too long. Default is 30 s; some upstream APIs (image generation, web scraping) take longer.

For each, the operator can adjust:

- API keys: **Settings → Tools → [tool]**
- Rate limits and timeouts: tool settings
- Network: ask the operator to check the firewall

## Agent runs but the response is wrong

The LLM is hallucinating, returning stale info, or refusing to answer. This is **not a Spora bug** — it's a model behaviour issue. Common fixes:

- **Better system prompt** — add explicit instructions, examples, and boundaries
- **Different model** — try a larger or more capable model
- **Tool grounding** — if the agent is making up facts, give it a tool to look them up (web search, knowledge base)
- **Lower the temperature** — in the LLM config, set `temperature=0.1` (or 0.0) for more deterministic answers

## "Approval required" prompt never appears

The agent is calling a tool, but the admin UI doesn't show the Approve / Reject button. This means:

- **WebSocket / Mercure broken** — the UI uses Mercure to push the approval prompt in real-time. If Mercure is down, you need to refresh the page to see the prompt.
- **The task is in a different state** — check the **Tasks** view. If the task is `RUNNING`, the approval is pending. If `COMPLETED`, the agent finished without approval. If `FAILED`, the task died.

Refresh the page; the approval prompt should appear if the task is genuinely awaiting input.

## "Rate limit exceeded" on the LLM

The LLM provider returned HTTP 429. The tool surfaces this as a `ToolResult::fail`. Common causes:

- The operator's plan has hit its quota
- The LLM provider is having an outage (check <https://status.anthropic.com> or <https://status.openai.com>)
- Too many concurrent agent tasks in the same minute

Wait, reduce concurrent usage, or upgrade the plan.

## "Internal server error" or 500s in the chat

The PHP backend hit an unhandled exception. The admin UI may show a generic error. Ask the operator to:

- Check `storage/spora.log` for the stack trace
- Check `storage/php.log` for PHP errors
- Restart PHP-FPM / FrankenPHP if needed

If the error is reproducible, ask the operator to file an issue with the request ID and stack trace.

## Where to look for logs

The admin UI doesn't show logs (logs are infrastructure concerns). The operator can read them at:

- `storage/spora.log` — application logs (Monolog, PSR-3)
- `storage/php.log` — PHP error log (only in dev or with `error_log` configured)
- Supervisord output — `supervisorctl tail -f spora-worker`
- systemd journal — `journalctl -u php8.4-fpm -f` (or `nginx`)

For Docker setups: `docker compose logs -f spora`.

## Where to ask for help

- **[Operators → Operations](/start/operators/operations)** — if you're an end user and the operator needs to fix something on the server
- **GitHub Issues** — if the operator has confirmed it's a Spora bug, file at <https://github.com/spora-ai/spora-core/issues>
- **GitHub Discussions** — for questions, not bugs: <https://github.com/spora-ai/spora-core/discussions>

## What's next

- [First conversation](/start/end-users/first-conversation) — sign in and chat
- [Managing agents](/start/end-users/managing-agents) — configure tools and recipes
- [Operators → Operations](/start/operators/operations) — the operator side of fixing these issues
