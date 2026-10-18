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

> **Before you start:** two things are required, and only one is a toggle.
>
> **Agent API** — a setting in [Global Settings](/start/operators/global-settings), applied on the
> next request. **Worker runtime mode = Server** — a _file-only_ setting, so it lives in `.env` as
> `SPORA_WORKER_RUNTIME_MODE=server`, not in Global Settings, and a running worker must be
> restarted. In [client-worker mode](/deploy/shared-host/client-worker-mode) the browser drives the
> agent loop, so nothing on the server executes a queued task and every endpoint answers `404`.
> See [Deployment modes](/reference/concepts/deployment-modes) for how to tell which you are on.

This differs from the [REST API](/reference/api) in two ways that matter. Authentication is a
bearer key rather than a session cookie, so there is no CSRF token and no login. And scope is
per-agent rather than per-user: the key is the authorisation.

## Create an API key

Open the agent in the admin UI and go to **Settings**, then jump to the **API keys** section
(the pill bar at the top of the page, or link straight to
`/agents/<id>/settings#api-keys`). Then **New key**. Name it after the integration it belongs
to — one key per integration, so revoking one does not take the others down.

> **The key is shown once.** Spora stores a SHA-256 digest and cannot reproduce the secret, so a
> lost key must be replaced rather than recovered.

Keys survive disabling and re-enabling the feature — the toggle takes the API offline, it does
not revoke anything. Changing to client-worker mode also takes the whole surface offline (`404`)
until you switch back; the key itself is untouched either way.

## Revoke a key

The trash button beside a row revokes that key. From that moment every request carrying it answers
`401`, and the row disappears.

```bash
curl -X DELETE "$HOST/api/v1/agents/$AGENT_ID/api-keys/$KEY_ID" \
  -H "X-CSRF-Token: $CSRF" -b cookies.txt
```

```json
{ "data": { "revoked": true, "key_id": "9f2c…" } }
```

`200` with a body rather than `204 No Content`, so there is something to log and the dev proxy
has a response it can forward. Revocation is idempotent: the same body comes back whether or not
the key existed, which is what stops the endpoint being a probe for which key ids are real. It is
also scoped to the agent in the path, so one agent's key id cannot revoke another's.

> **Who can mint and revoke.** These admin endpoints require the _manage_ role on the agent's
> principal — the same role that edits the agent itself. A group member who can see the agent but
> not manage it gets a `403`, not a hidden button.

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
{
  "data": {
    "chat": {
      "id": 412,
      "agent_id": 7,
      "status": "QUEUED",
      "answer": null,
      "error": null,
      "blocked": null,
      "created_at": "2026-10-17T09:12:44+00:00",
      "updated_at": "2026-10-17T09:12:44+00:00"
    }
  }
}
```

From there, either poll `/status` or supply a `callback_url` and be told.

::: warning `callback_url` is screened before the chat is queued
It must be an absolute `https` URL of at most 2048 characters, and every address the hostname
resolves to must sit outside the private, loopback, link-local and carrier-grade-NAT ranges —
otherwise the request is refused with `422` and **no chat is created**. A URL that fails later
during delivery would leave you with a running chat and no callback, so the check happens first.

In practice this rules out `http://localhost:3000` and anything on a private network. Use a
publicly reachable receiver — a tunnel counts. Treat a callback URL as a credential: it tells a
third party when your agent finished something.
:::

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

or, when the agent asked something. `questions` is a list of **batches**, each belonging to one
tool call:

```json
"blocked": {
  "reason": "AWAITING_INPUT",
  "questions": [{
    "tool_call_id": "call_1",
    "questions": [{ "question": "Which region?", "header": "Region",
                    "options": [], "multiple": false, "allowFreeText": true }],
    "created_at": "2026-10-17T09:12:44+00:00"
  }]
}
```

### Clearing a block

The identifiers you need are the batch's `tool_call_id` and, for an approval, the
`provider_call_id` from `/transcript`'s `tool_calls[]` — **not** `blocked.tool_calls[].id`, which
is Spora's own row id and is not accepted by these endpoints.

```bash
# Approve: one decision per pending tool call.
curl -X POST "$HOST/api/v1/agent-api/chats/$CHAT/approve" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"decisions": [{
         "provider_call_id": "call_1",
         "decision": "approve",
         "arguments": {"to": "a@example.com"}
       }]}'
```

The `arguments` you send back are the ones the tool will actually run with, so send what you want
executed rather than echoing what the agent proposed. `decision` may also be `reject` to refuse a
single call while approving others.

```bash
# Reject the whole batch with a reason the agent sees.
curl -X POST "$HOST/api/v1/agent-api/chats/$CHAT/reject" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"reason": "Not authorised by policy."}'

# Answer a question, using the batch's tool_call_id.
curl -X POST "$HOST/api/v1/agent-api/chats/$CHAT/answer" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"tool_call_id": "call_1", "content": "Northern region"}'
```

All three answer `202` and queue the chat again. `409 INVALID_STATE` means the chat is not
currently in a state that allows the call — approving a chat that is not pending approval, for
instance.

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

// A captured request replayed after the window must not be accepted.
$fresh = abs(time() - (int) $timestamp) < 300;

if ($verified && $fresh) {
    $payload = json_decode($request->getContent(), true);
}
```

```typescript
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const body = rawRequestBody
const timestamp = headers['x-spora-timestamp']

// A plain SHA-256 of the secret, NOT an HMAC of it — this is the whole point
// of keying on the digest: the receiver can derive it from the secret it was
// issued, and Spora never has to hold that secret again.
const secretDigest = createHash('sha256').update(secret).digest('hex')

const expected = createHmac('sha256', secretDigest).update(`${timestamp}.${body}`).digest('hex')
const received = headers['x-spora-signature'] ?? ''

// timingSafeEqual throws when the lengths differ, so check first.
const valid =
  received.length === expected.length &&
  timingSafeEqual(Buffer.from(expected), Buffer.from(received))

const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300

if (valid && fresh) {
  const payload = JSON.parse(body)
}
```

`fresh` rejects a captured request replayed later, but it does not by itself
stop a replay inside the window — the signature is over the body, not over a
nonce, because Spora is a one-way caller and holds no per-delivery state. If
you need exactly-once semantics, record the `X-Spora-Key-Id` and `status`
pair you have already processed and ignore repeats.

`X-Spora-Key-Id` carries the key's public id, which is safe to log.

### What to expect

- **A chat can be delivered to twice.** If it parked on an approval and you cleared it, that is
  two settlements and two deliveries. Handle a delivery you have already seen for that status.
- **Failed deliveries are retried** five times, at 30 seconds, 1, 2, 4 and 8 minutes; the sixth
  failed attempt is abandoned. Treat a long silence as "still running or already failed", and fall
  back to polling.
- **A `2xx` is success.** Anything else is retried, including a `3xx` — Spora does not follow
  redirects, so a receiver that redirects is treated as one that failed.
- **Delivery is at-least-once, not exactly-once.** A delivery that succeeds but whose response is
  lost will be retried, so deduplicate on `(X-Spora-Key-Id, status)` before acting on a delivery.
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

**Reading**, when an answer references an image the agent produced: the attachments in a
`/messages` payload already carry an absolute `url`, so you rarely need to build one.
`/transcript` gives you `media_id` and `kind` only, and `/status` carries no media at all — from
either of those, construct the URL yourself as `{SPORA_APP_URL}/api/v1/agent-api/media/{mediaId}`.

`SPORA_APP_URL` must be your public origin **including any path prefix** (for example
`https://example.com/spora`). Spora builds these URLs from `SPORA_APP_URL` alone and does not
apply `SPORA_APP_PREFIX` itself, so on a subdirectory install an unset or prefix-less value
produces links that do not resolve. `GET /media/{mediaId}` streams the bytes inline.

A key can read an asset when its agent produced it, when it belongs to a chat in that agent's
tree — which is how a sub-agent's output becomes reachable through its parent — or when one of
that agent's chats attached it. Anything else answers `404`, the same as an id that does not exist,
so a key cannot probe for media.

## Errors and rate limits

Standard Spora envelopes: `{ "data": … }` on success, `{ "error": { "code": "…", "message": "…" } }`
otherwise. The [error-handling reference](/reference/concepts/error-handling) is canonical.

| Status | Meaning                                                               |
| ------ | --------------------------------------------------------------------- |
| `400`  | The body was not JSON, or the media upload had no `file` part.        |
| `401`  | The key is missing, malformed, unknown, revoked, or wrong.            |
| `404`  | No such chat or media on this agent — or the API is not mounted here. |
| `409`  | The chat is not in a state that allows the action.                    |
| `415`  | The uploaded file's type is not in the agent's accept-list.           |
| `422`  | The request body was not usable — see the endpoint reference.         |
| `429`  | Rate limited. Retry after the interval in the `Retry-After` header.   |
| `500`  | The upload could not be read off disk.                                |

The limit is per key and operator-tunable in Global Settings as **Agent API rate limit**
(`SPORA_AGENT_API_RATE_LIMIT_MAX`, 60 requests per minute by default).

## End to end

```bash
KEY='spk_9f2c…_qRt…'
HOST='https://spora.example.com'

# 1. Start a chat and remember its id.
CHAT=$(curl -sS -X POST "$HOST/api/v1/agent-api/chats" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"text":"What is 17 times 3?","callback_url":"https://example.com/hooks/spora"}' \
  | jq -r '.data.chat.id')

# 2. Poll until it settles. A fresh chat is QUEUED, not RUNNING, so wait for
#    every status that is still in progress to be gone — not for one to appear.
status() {
  curl -sS "$HOST/api/v1/agent-api/chats/$CHAT/status" -H "Authorization: Bearer $KEY" \
    | jq -r '.data.chat.status'
}
until printf '%s\n' QUEUED RUNNING AWAITING_SUB_AGENTS | grep -qx "$(status)"; do
  sleep 2
done

# 3. Read the answer.
curl -sS "$HOST/api/v1/agent-api/chats/$CHAT/status" \
  -H "Authorization: Bearer $KEY" | jq '.data.chat.answer'
```

`AWAITING_SUB_AGENTS` is the one non-terminal status that resolves on its own, so keep waiting
through it. When a chat settles _blocked_ the loop exits and the answer is empty — check
`.data.chat.blocked` before treating an empty answer as a failure.

## Operational notes

- **Callback latency follows your worker.** With `worker:run --daemon` it is a few seconds: Spora
  re-checks an unsettled chat every 5 seconds rather than on every loop iteration, so a long
  chat does not monopolise the delivery batch. With `--once` from cron it is up to one cron
  interval. If you need tighter than that, poll `/status` as well as accepting the callback.
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
