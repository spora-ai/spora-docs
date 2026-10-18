---
title: Agent API
description: Drive a Spora agent from an external tool — start chats, read answers, attach files, and receive signed callbacks.
---

# Agent API

A per-agent HTTP API for external tools. An agent that has it switched on can be driven from a
script, a workflow runner, or another service, without a Spora session and without the caller
having to reconstruct the admin UI's task model.

Each agent has its own credentials. A key reaches **that agent's** chats, their transcripts, and
the media those chats produced — and nothing else.

> **Before you start:** two things are required. **Agent API** must be enabled in
> [Global Settings](/start/operators/global-settings), and **Worker runtime mode** must be
> **Server**. In [client-worker mode](/deploy/shared-host/client-worker-mode) the browser drives
> the agent loop, so nothing on the server executes a queued task and every endpoint answers
> `404`. See [Deployment modes](/reference/concepts/deployment-modes) for how to tell which you
> are on.

This differs from the [REST API](/reference/api) in two ways that matter. Authentication is a
bearer key rather than a session cookie, so there is no CSRF token and no login. And scope is
per-agent rather than per-user: the key is the authorisation.

## Create an API key

Open the agent in the admin UI and go to its **API keys** tab, then **New key**. Name it after
the integration it belongs to — one key per integration, so revoking one does not take the others
down.

> **The key is shown once.** Spora stores a SHA-256 digest and cannot reproduce the secret, so a
> lost key must be replaced rather than recovered.

Keys survive disabling and re-enabling the feature, and they keep working across a change of
worker mode.

## Authentication

Send the key as a bearer token. This is the only credential the API accepts — a session cookie is
not a fallback, so holding one cannot widen a key's reach.

```bash
curl https://spora.example.com/api/v1/agent-api/chats \
  -H 'Authorization: Bearer spk_9f2c…_qRt…'
```

A key has the shape `spk_<id>_<secret>`, where `<id>` is a random identifier that is safe to log
and `<secret>` is not.

Missing, malformed, unknown and wrong keys all answer `401` — they are indistinguishable on
purpose, so a caller cannot tell a bad id from a bad secret. Requests are rate limited per key.

## Endpoints

| Method | Path                                      | Purpose                                |
| ------ | ----------------------------------------- | -------------------------------------- |
| `GET`  | `/api/v1/agent-api/chats`                 | List this agent's chats                |
| `POST` | `/api/v1/agent-api/chats`                 | Start a chat                           |
| `GET`  | `/api/v1/agent-api/chats/{id}/status`     | Status and final answer                |
| `GET`  | `/api/v1/agent-api/chats/{id}/messages`   | User messages and answers              |
| `POST` | `/api/v1/agent-api/chats/{id}/messages`   | Continue the chat                      |
| `GET`  | `/api/v1/agent-api/chats/{id}/transcript` | Tool calls, thinking, usage totals     |
| `POST` | `/api/v1/agent-api/chats/{id}/approve`    | Approve pending tool calls             |
| `POST` | `/api/v1/agent-api/chats/{id}/reject`     | Reject pending tool calls              |
| `POST` | `/api/v1/agent-api/chats/{id}/answer`     | Answer a question the agent asked      |
| `POST` | `/api/v1/agent-api/media`                 | Upload a file for this agent           |
| `GET`  | `/api/v1/agent-api/media/{mediaId}`       | Read a media asset this agent produced |

The per-endpoint reference, including the full error list for each, is in the
[API reference](/reference/api/agent-api).

## Start a chat

`POST /chats` answers `202` and returns immediately. It queues the chat; a worker runs it. Nothing
in the request path drives the agent loop, which is why a server-side worker is required.

```bash
curl -X POST https://spora.example.com/api/v1/agent-api/chats \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' \
  -H 'Content-Type: application/json' \
  -d '{
        "text": "Summarise the attached Q3 figures",
        "files": [{ "filename": "q3.pdf", "data_url": "data:application/pdf;base64,…" }],
        "callback_url": "https://example.com/hooks/spora"
      }'
```

```json
{ "data": { "chat": { "id": 412, "status": "QUEUED", "answer": null, "blocked": null } } }
```

From there, either poll `/status` or supply a `callback_url` and be told.

## Reading a chat

Three endpoints, and choosing between them is the point of the feature.

### `/status` — the default

A status and an answer. No tool calls, no thinking, no token counts. This is what an integrator
polling for a result wants.

```json
{
  "data": {
    "chat": {
      "id": 412,
      "agent_id": 7,
      "status": "COMPLETED",
      "answer": "Q3 revenue was €4.2M, up 12%…",
      "error": null,
      "blocked": null,
      "created_at": "2026-10-17T09:12:44+00:00",
      "updated_at": "2026-10-17T09:13:02+00:00"
    }
  }
}
```

For a chat that failed, `error` carries `{ "code": "…", "message": "…" }` and `answer` falls back
to the last thing the agent said — so a partial result is never reported as an absence.

### `/messages` — the conversation

The human side of the chat, without the tool turns, with attachments resolved to URLs.

```json
{
  "data": {
    "messages": [
      {
        "sequence": 0,
        "role": "user",
        "text": "Summarise Q3",
        "at": "…",
        "attachments": [
          {
            "media_id": "…",
            "kind": "image",
            "url": "https://spora.example.com/api/v1/agent-api/media/…"
          }
        ]
      },
      {
        "sequence": 7,
        "role": "assistant",
        "text": "Q3 revenue was …",
        "at": "…",
        "attachments": null
      }
    ]
  }
}
```

Both endpoints, and `/transcript`, accept `?since_sequence=N`.

### `/transcript` — everything

The same view the admin UI has: `tool_calls`, the full `history` including reasoning blocks, token
`totals`, and the task's `data`. Reach for this when you need to know _how_ the agent got there.

## Blocked chats

An agent can stop for a reason only you can resolve — a tool awaiting sign-off, or a question it
asked. Neither is a dead end from outside.

```json
"blocked": {
  "reason": "PENDING_APPROVAL",
  "tool_calls": [{ "id": 55, "name": "send_email", "operation": "send",
                   "description": "Email a@example.com", "arguments": { "to": "a@example.com" } }]
}
```

or, when the agent asked something:

```json
"blocked": { "reason": "AWAITING_INPUT", "questions": [{ "question": "Which region?" }]}
```

Clear it with `POST /approve`, `POST /reject`, or `POST /answer`, then the chat resumes.

> **Do not poll only once.** A chat that parks will stay parked until someone acts, and the
> callback fires the moment it settles — including when it settles _blocked_. If you neither poll
> nor supply a callback, a parked chat is indistinguishable from a slow one.

## Callbacks

Supply `callback_url` when starting a chat and Spora POSTs to it once the chat settles. Settling
means it reached a terminal state, was aborted, or became blocked — the three moments at which
there is something new to say.

```json
{
  "id": 412,
  "agent_id": 7,
  "status": "COMPLETED",
  "answer": "…",
  "error": null,
  "blocked": null,
  "created_at": "…",
  "updated_at": "…"
}
```

### Verifying the signature

Three headers accompany every delivery. `X-Spora-Signature` is an HMAC-SHA256 over the timestamp
and the raw body, keyed on a digest of your key's secret — which means you can verify it with only
the secret you were issued, without Spora ever holding that secret again.

```php
$timestamp = $request->header('X-Spora-Timestamp');
$expected  = hash_hmac('sha256', $timestamp . '.' . $request->getContent(), hash('sha256', $secret));
$verified  = hash_equals($expected, $request->header('X-Spora-Signature'));

// A captured request replayed hours later must not be accepted.
$fresh = abs(time() - (int) $timestamp) < 300;

if ($verified && $fresh) {
    $payload = json_decode($request->getContent(), true);
}
```

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'

const body = rawRequestBody
const timestamp = headers['x-spora-timestamp']
const secretDigest = createHmac('sha256', secret).update(secret).digest('hex')

const expected = createHmac('sha256', secretDigest).update(`${timestamp}.${body}`).digest('hex')

const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(headers['x-spora-signature']))
const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300
```

`X-Spora-Key-Id` carries the key's public id, which is safe to log.

### What to expect

- **A chat can be delivered to twice.** If it parked on an approval and you cleared it, that is
  two settlements and two deliveries. Handle a delivery you have already seen for that status.
- **Failed deliveries are retried** with exponential backoff — 30 seconds doubling to about 16
  minutes, six attempts — and then abandoned. Treat a long silence as "still running or already
  failed", and fall back to polling.
- **A `2xx` is success.** Anything else is retried.
- **Delivery never blocks the agent**, and a receiver that is down cannot take the worker with it.

## Files and media

Two ways to attach a file, and two to read one back.

**Uploading**, for anything large:

```bash
curl -X POST https://spora.example.com/api/v1/agent-api/media \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' \
  -F 'file=@q3.pdf'
```

Then pass the returned `data.id` as `media_ids` when starting the chat. Inline `data_url` files
work too, for small attachments — 16 MiB each, at most 8 per request. Spora sniffs the bytes
rather than trusting a declared MIME type, and the agent's own accept-list applies either way.

**Reading**, when an answer references an image the agent produced: every media reference in a
`/messages`, `/transcript` or `/status` payload already carries an absolute `url`, so you rarely
need to build one. `GET /media/{mediaId}` streams the bytes inline.

A key can read an asset when its agent produced it, when it belongs to a chat in that agent's
tree — which is how a sub-agent's output becomes reachable through its parent — or when one of
that agent's chats attached it. Anything else answers `404`, the same as an id that does not exist,
so a key cannot probe for media.

## Errors and rate limits

Standard Spora envelopes: `{ "data": … }` on success, `{ "error": { "code": "…", "message": "…" } }`
otherwise. The [error-handling reference](/reference/concepts/error-handling) is canonical.

| Status | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| `401`  | The key is missing, malformed, unknown, revoked, or wrong.                    |
| `404`  | No such chat or media on this agent — or the feature is off on this instance. |
| `409`  | The chat is not in a state that allows the action.                            |
| `415`  | The uploaded file's type is not in the agent's accept-list.                   |
| `422`  | The request body was not usable — see the endpoint reference.                 |
| `429`  | Rate limited. Retry after the interval in the `Retry-After` header.           |

The limit is per key and operator-tunable in Global Settings.

## End to end

```bash
KEY='spk_9f2c…_qRt…'
HOST='https://spora.example.com'

# 1. Start a chat and remember its id.
CHAT=$(curl -sS -X POST "$HOST/api/v1/agent-api/chats" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"text":"What is 17 times 3?","callback_url":"https://example.com/hooks/spora"}' \
  | jq -r '.data.chat.id')

# 2. Poll until it settles.
until [ "$(curl -sS "$HOST/api/v1/agent-api/chats/$CHAT/status" \
           -H "Authorization: Bearer $KEY" | jq -r '.data.chat.status')" != "RUNNING" ]; do
  sleep 2
done

# 3. Read the answer.
curl -sS "$HOST/api/v1/agent-api/chats/$CHAT/status" \
  -H "Authorization: Bearer $KEY" | jq '.data.chat.answer'
```

## Operational notes

- **Callback latency follows your worker.** With `worker:run --daemon` it is sub-second, because
  the worker sweeps on every loop iteration. With `--once` from cron it is up to one cron interval.
- **A configured worker that is not alive** leaves chats `QUEUED` and callbacks undelivered. Spora
  does not detect this; treat it as a deployment health question, using the
  [worker deployment guide](/reference/concepts/worker-deployment).
- **Storage precedence.** `SPORA_AGENT_API=1` in `.env` seeds the setting, but once it has been
  saved in Global Settings the stored value wins. Set it in one place.

## What's next

- [API reference](/reference/api/agent-api) — every endpoint with its full error list
- [Error handling](/reference/concepts/error-handling) — the canonical error-code registry
- [Deployment modes](/reference/concepts/deployment-modes) — which runtime owns task progression
- [Worker deployment](/reference/concepts/worker-deployment) — daemon and cron setups
