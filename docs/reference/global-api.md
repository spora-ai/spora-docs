---
title: Global API
description: Drive a whole Spora install from an external tool — manage its groups, their agents, and their chats.
---

# Global API

An install-wide HTTP API for external tools. It manages every group on the instance, the agents
those groups own, and their chats — for a script, a workflow runner, or another service that has
to work across the whole install rather than one team.

A global key reaches **every group**, **every agent a group owns**, and their transcripts and
media. It does **not** reach a personal agent — one a user owns rather than a group. There is no
user-scoped key: a personal agent is reachable only through its own
[per-agent key](/reference/agent-api).

::: warning This is the widest credential Spora issues
Whoever holds a global key can read every group's chats and rewrite every group's agents. Only a
global admin can mint one, the key is shown exactly once, and the scope is off by default. Treat
it like a root credential: one per integration, named after that integration, revoked when it is
no longer needed.
:::

> **Before you start:** two things are required, and only one is a toggle.
>
> **Global API** — a setting in [Global Settings](/start/operators/global-settings), applied on the
> next request. **Worker runtime mode = Server** — a _file-only_ setting, so it lives in `.env` as
> `SPORA_WORKER_RUNTIME_MODE=server`, not in Global Settings, and a running worker must be
> restarted. In [client-worker mode](/deploy/shared-host/client-worker-mode) the browser drives the
> agent loop, so nothing on the server executes a queued task and every endpoint answers `404`.
> See [Deployment modes](/reference/concepts/deployment-modes) for how to tell which you are on.

The three API scopes are independent switches: `SPORA_AGENT_API`, `SPORA_GROUP_API` and
`SPORA_GLOBAL_API`. Turning one on does not mount the others.

## Create a global API key

Open **Settings → Global API keys** in the admin UI. **New key**. Name it after the integration it
belongs to — one key per integration, so revoking one does not take the others down.

The endpoints behind that button are `GET|POST /api/v1/global-api-keys` and
`DELETE /api/v1/global-api-keys/{keyId}`. They are session-authenticated and CSRF-protected, so a
bearer key cannot mint or revoke one.

> **The key is shown once.** Spora stores a SHA-256 digest and cannot reproduce the secret, so a
> lost key must be replaced rather than recovered.
>
> **Who can mint and revoke.** Only a global admin. A group owner or a group admin gets a `403` —
> minting a global key is not a group-level right.

Keys survive disabling and re-enabling the feature — the toggle takes the API offline, it does not
revoke anything. Listing and revoking stay mounted either way, so a key minted before you
flipped the toggle can always be revoked, and the **Settings → Global API keys** page stays in the
sidebar either way, so it can be revoked from the UI too.

Minting follows the toggle, the way the surface the key drives does: with the **Global API** off,
`POST /api/v1/global-api-keys` is not registered and answers `405`. A credential for an API that
is not there would grant nothing, but it would come alive the moment the toggle was flipped.
Switch the toggle on, mint, and switch it back if you need to.

## Authentication

Send the key as a bearer token. This is the only credential the API accepts — a session cookie is
not a fallback, so holding one cannot widen a key's reach.

```bash
curl https://spora.example.com/api/v1/global-api/groups \
  -H 'Authorization: Bearer spk_9f2c…_qRt…'
```

A key has the shape `spk_<id>_<secret>`, where `<id>` is a random identifier that is safe to log
and `<secret>` is not. The format is the same for every scope, so a receiver does not need to know
which surface a key was minted for.

Missing, malformed, unknown and wrong keys all answer `401` — they are indistinguishable on
purpose, so a caller cannot tell a bad id from a bad secret. A key of the _wrong scope_ also
answers `401`: a global key is not a group key, and each surface accepts only its own scope.
Requests are rate limited per key.

## Endpoints

| Method   | Path                                       | Purpose                                    |
| -------- | ------------------------------------------ | ------------------------------------------ |
| `GET`    | `/api/v1/global-api/groups`                | List every group                           |
| `POST`   | `/api/v1/global-api/groups`                | Create a group                             |
| `GET`    | `/api/v1/global-api/groups/{id}`           | Read a group                               |
| `PATCH`  | `/api/v1/global-api/groups/{id}`           | Update a group                             |
| `DELETE` | `/api/v1/global-api/groups/{id}`           | Delete a group                             |
| `GET`    | `/api/v1/global-api/agents`                | List every group-owned agent               |
| `POST`   | `/api/v1/global-api/agents`                | Create an agent in a group (import format) |
| `GET`    | `/api/v1/global-api/agents/{id}`           | Read an agent (export format)              |
| `PATCH`  | `/api/v1/global-api/agents/{id}`           | Update an agent (import format, merged)    |
| `DELETE` | `/api/v1/global-api/agents/{id}`           | Delete an agent                            |
| `GET`    | `/api/v1/global-api/chats`                 | List the chats of every group-owned agent  |
| `POST`   | `/api/v1/global-api/chats`                 | Start a chat (body carries `agent_id`)     |
| `GET`    | `/api/v1/global-api/chats/{id}/status`     | Status and final answer                    |
| `GET`    | `/api/v1/global-api/chats/{id}/messages`   | User messages and answers                  |
| `POST`   | `/api/v1/global-api/chats/{id}/messages`   | Continue the chat                          |
| `GET`    | `/api/v1/global-api/chats/{id}/transcript` | Tool calls, thinking, usage totals         |
| `POST`   | `/api/v1/global-api/chats/{id}/approve`    | Approve pending tool calls                 |
| `POST`   | `/api/v1/global-api/chats/{id}/reject`     | Reject pending tool calls                  |
| `POST`   | `/api/v1/global-api/chats/{id}/answer`     | Answer a question the agent asked          |
| `POST`   | `/api/v1/global-api/media`                 | Upload a file for one of the agents        |
| `GET`    | `/api/v1/global-api/media/{mediaId}`       | Read a media asset an agent produced       |

The per-endpoint reference, including the full status-code list for each, is in the
[API reference](/reference/api/global-api).

## Groups

### List and read

```bash
curl https://spora.example.com/api/v1/global-api/groups \
  -H 'Authorization: Bearer spk_9f2c…_qRt…'
```

### Create a group

```bash
curl -X POST https://spora.example.com/api/v1/global-api/groups \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' -H 'Content-Type: application/json' \
  -d '{"name": "Marketing", "description": "Campaign work"}'
```

The group is owned by the admin who minted the key — a traceable human on every group, which is
what keeps the "a group must have an owner" rule meaningful. A group cannot be created without
one; the answer is `403`.

### Update a group

`PATCH /groups/{id}` takes `name` and/or `description`. A field the payload does not name is left
alone.

### Delete a group

`DELETE /groups/{id}` removes the group. It is refused with `409` while the group still owns
agents — delete or re-home those first, the same order the admin UI forces.

## Agents

Agent CRUD uses the **Agent Template format** — the same JSON the
[template import](/reference/concepts/agent-templates) accepts.

The target group is named in the body, because a global key spans every group.

```bash
curl -X POST https://spora.example.com/api/v1/global-api/agents \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' -H 'Content-Type: application/json' \
  -d '{
        "group_id": 4,
        "id": "acme/campaign",
        "name": "Campaign",
        "version": "1.0.0",
        "agent": { "system_prompt": "You draft campaigns.", "max_steps": 10 }
      }'
```

Read, update and delete work as they do on the [group surface](/reference/group-api#agents): the
same format, the same merge semantics for an update — only the fields the payload names are
written, and a tool it does not name is left alone.

## Chats

A global key drives the chats of every group-owned agent, including chats a human started in the
admin UI. The agent a chat belongs to is named in the body.

```bash
curl -X POST https://spora.example.com/api/v1/global-api/chats \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' -H 'Content-Type: application/json' \
  -d '{"agent_id": 7, "text": "Summarise the Q3 figures"}'
```

Everything else — polling, transcripts, blocked chats, callbacks, media — works exactly as on the
[per-agent surface](/reference/agent-api), with one difference: a chat outside the reach answers
`404`, not `403`. A caller must not be able to probe which chat ids exist.

`effort` is accepted on the chat body — the reasoning effort for that message. It is one of
`none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`. Leave it out and the LLM
configuration's default applies; send `""` to ask for the model's own default, so that nothing is
sent at all. A level that is not on that scale is a `422`. `POST /chats/{id}/messages` takes the
same field, where it applies to that follow-up only. See
[Concepts → LLM drivers](/reference/concepts/drivers#effort-levels) for the scale, the wire shapes
and the resolution order.

### Callbacks

Supply `callback_url` when starting a chat and Spora POSTs to it once the chat settles. The
signature is keyed on the digest of your key's secret, so a receiver written against the
per-agent API verifies a global-scoped callback with the same code — see
[verifying the signature](/reference/agent-api#verifying-the-signature).

## What a global key does not reach

- **Personal agents.** An agent a user owns rather than a group is outside every scope except the
  per-agent one. There is no user-scoped key, and a global key is not one.
- **Group members.** The groups, their agents and their chats — a group's member _count_ and the
  caller's own role in it, but not who the members are. Read the membership list through the
  [REST API](/reference/api/groups) with a session.
- **Other installs.** The key is bound to this database.

## Errors and rate limits

Standard Spora envelopes: `{ "data": … }` on success, `{ "error": { "code": "…", "message": "…" } }`
otherwise. The [error-handling reference](/reference/concepts/error-handling) is canonical.

| Status | Meaning                                                                                     |
| ------ | ------------------------------------------------------------------------------------------- |
| `400`  | The body was not JSON, or the media upload had no `file` part.                              |
| `401`  | The key is missing, malformed, unknown, revoked, of the wrong scope, or wrong.              |
| `403`  | The key has no owner to create a group with — a hand-edited key row.                        |
| `404`  | No such group, chat, agent or media — or the API is not mounted here.                       |
| `409`  | The group still owns agents, or the chat is not in a state that allows the action.          |
| `415`  | `POST /media` only — the uploaded file's type is not in the agent's accept-list.            |
| `422`  | The request body was not usable — a missing `agent_id`, or a payload the validator refuses. |
| `429`  | Rate limited. Retry after the interval in the `Retry-After` header.                         |
| `500`  | The upload could not be read off disk.                                                      |

The limit is per key and operator-tunable in Global Settings as **API rate limit**
(`SPORA_API_RATE_LIMIT_MAX`, 60 requests per minute by default) — one limit for every scope.

## Operational notes

- **Storage precedence.** `SPORA_GLOBAL_API=1` in `.env` seeds the setting, but once it has been
  saved in Global Settings the stored value wins. Set it in one place.
- **`GET /api/v1/config` carries `global_api_enabled`** — the flag the admin SPA reads to decide
  whether the scope is mounted. It drives the warning on the keys page, not whether the entry is
  in the sidebar: the page renders either way, so keys stay revocable when the scope is off.
- **The API is not a worker.** `POST /chats` answers `202` and returns immediately — it queues the
  chat and a worker runs it. In client-worker mode the API answers `404` on every endpoint.
- **Audit the keys.** `last_used_at` records the last request a key authenticated, at minute
  granularity, so the page shows which of the install's global keys are still in use before you
  revoke one.

## What's next

- [Agent API](/reference/agent-api) — the per-agent surface
- [Group API](/reference/group-api) — the per-group surface
- [Agent templates](/reference/concepts/agent-templates) — the format the agent endpoints speak
- [API reference](/reference/api/global-api) — every endpoint with its status codes
