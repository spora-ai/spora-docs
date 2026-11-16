---
title: Group API
description: Drive a whole Spora group from an external tool — manage its agents, start chats, and receive signed callbacks.
---

# Group API

A per-group HTTP API for external tools. A group that has it switched on can be driven from a
script, a workflow runner, or another service: its agents can be listed, created, updated and
deleted, and their chats can be started, read and continued.

A group key reaches **every agent of that group**, their transcripts, and the media those chats
produced — and nothing outside the group. A personal agent — one a user owns rather than a group
— is not reachable through it; that needs a [per-agent key](/reference/agent-api).

> **Before you start:** two things are required, and only one is a toggle.
>
> **Group API** — a setting in [Global Settings](/start/operators/global-settings), applied on the
> next request. **Worker runtime mode = Server** — a _file-only_ setting, so it lives in `.env` as
> `SPORA_WORKER_RUNTIME_MODE=server`, not in Global Settings, and a running worker must be
> restarted. In [client-worker mode](/deploy/shared-host/client-worker-mode) the browser drives the
> agent loop, so nothing on the server executes a queued task and every endpoint answers `404`.
> See [Deployment modes](/reference/concepts/deployment-modes) for how to tell which you are on.

The three API scopes are independent switches: `SPORA_AGENT_API`, `SPORA_GROUP_API` and
`SPORA_GLOBAL_API`. Turning one on does not mount the others, so enabling the group surface never
silently opens the install-wide one.

Authentication is a bearer key rather than a session cookie, so there is no CSRF token and no
login — and the key itself is the authorisation.

## Create a group API key

Open the group in the admin UI and go to **Settings**, then the **Developer access** section.
**New key**. Name it after the integration it belongs to — one key per integration, so revoking one
does not take the others down.

The endpoints behind that button are `GET|POST /api/v1/groups/{groupId}/api-keys` and
`DELETE /api/v1/groups/{groupId}/api-keys/{keyId}`. They are session-authenticated and
CSRF-protected, so a bearer key cannot mint or revoke one.

> **The key is shown once.** Spora stores a SHA-256 digest and cannot reproduce the secret, so a
> lost key must be replaced rather than recovered.

Keys survive disabling and re-enabling the feature — the toggle takes the API offline, it does not
revoke anything. Listing and revoking stay mounted either way, so a key minted before you flipped
the toggle can always be revoked.

Minting follows the toggle, the way the surface the key drives does: with the **Group API** off,
`POST /api/v1/groups/{groupId}/api-keys` is not registered and answers `405`. A credential for an
API that is not there would grant nothing, but it would come alive the moment the toggle was
flipped — to every group owner who had minted one. Switch the toggle on, mint, and switch it back
if you need to.

> **Who can mint and revoke.** The key-management endpoints require the _owner_ or _admin_ role on
> the group, and a global admin can manage any group's keys without holding either. A plain member
> sees no **Developer access** section at all — there is no button to click — and the endpoint
> answers a `403` if they call it anyway.

## Authentication

Send the key as a bearer token. This is the only credential the API accepts — a session cookie is
not a fallback, so holding one cannot widen a key's reach.

```bash
curl https://spora.example.com/api/v1/group-api/chats \
  -H 'Authorization: Bearer spk_9f2c…_qRt…'
```

A key has the shape `spk_<id>_<secret>`, where `<id>` is a random identifier that is safe to log
and `<secret>` is not. The format is the same for every scope, so a receiver does not need to know
which surface a key was minted for.

Missing, malformed, unknown and wrong keys all answer `401` — they are indistinguishable on
purpose, so a caller cannot tell a bad id from a bad secret. A key of the _wrong scope_ also
answers `401`: a group key is not a global key, and each surface accepts only its own scope.
Requests are rate limited per key.

## Endpoints

| Method   | Path                                        | Purpose                                        |
| -------- | ------------------------------------------- | ---------------------------------------------- |
| `GET`    | `/api/v1/group-api/group`                   | The group this key belongs to                  |
| `GET`    | `/api/v1/group-api/agents`                  | List the group's agents                        |
| `POST`   | `/api/v1/group-api/agents`                  | Create an agent (import format)                |
| `GET`    | `/api/v1/group-api/agents/{id}`             | Read an agent (export format)                  |
| `PATCH`  | `/api/v1/group-api/agents/{id}`             | Update an agent (import format, merged)        |
| `DELETE` | `/api/v1/group-api/agents/{id}`             | Delete an agent                                |
| `GET`    | `/api/v1/group-api/agents/{agentId}/effort` | The reasoning-effort levels that agent can use |
| `GET`    | `/api/v1/group-api/chats`                   | List the group's chats                         |
| `POST`   | `/api/v1/group-api/chats`                   | Start a chat (body carries `agent_id`)         |
| `GET`    | `/api/v1/group-api/chats/{id}/status`       | Status and final answer                        |
| `GET`    | `/api/v1/group-api/chats/{id}/messages`     | User messages and answers                      |
| `POST`   | `/api/v1/group-api/chats/{id}/messages`     | Continue the chat                              |
| `GET`    | `/api/v1/group-api/chats/{id}/transcript`   | Tool calls, thinking, usage totals             |
| `POST`   | `/api/v1/group-api/chats/{id}/approve`      | Approve pending tool calls                     |
| `POST`   | `/api/v1/group-api/chats/{id}/reject`       | Reject pending tool calls                      |
| `POST`   | `/api/v1/group-api/chats/{id}/answer`       | Answer a question the agent asked              |
| `POST`   | `/api/v1/group-api/media`                   | Upload a file for one of the group's agents    |
| `GET`    | `/api/v1/group-api/media/{mediaId}`         | Read a media asset the group produced          |

The per-endpoint reference, including the full status-code list for each, is in the
[API reference](/reference/api/group-api).

## Agents

Agent CRUD uses the **Agent Template format** — the same JSON the
[template import](/reference/concepts/agent-templates) accepts. One shape to learn, one validator
to trust.

### List the group's agents

```bash
curl https://spora.example.com/api/v1/group-api/agents \
  -H 'Authorization: Bearer spk_9f2c…_qRt…'
```

```json
{ "data": { "agents": [{ "id": 7, "name": "Research", "max_steps": 10 }], "total": 1 } }
```

### Create an agent

`POST /agents` takes the template payload verbatim.

```bash
curl -X POST https://spora.example.com/api/v1/group-api/agents \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' -H 'Content-Type: application/json' \
  -d '{
        "id": "acme/research",
        "name": "Research",
        "version": "1.0.0",
        "agent": {
          "system_prompt": "You are a research assistant.",
          "max_steps": 10,
          "allow_followup": true
        },
        "tools": [{ "tool_class": "Spora\\Tools\\CalculatorTool", "enabled": true }]
      }'
```

The new agent belongs to the group, so it is owned by the group's principal and its chats are
attributed to the group's owner. A payload the validator refuses answers `422` and creates
nothing.

### Read an agent back

`GET /agents/{id}` answers in export shape — the same template payload `POST /agents` reads. What
the API gives you can be fed straight back to it.

### Update an agent

`PATCH /agents/{id}` takes the same format, as a **merge**: only the fields the payload names are
written, and a tool the payload does not name is left alone. A caller can never destroy
configuration it did not send.

```bash
curl -X PATCH https://spora.example.com/api/v1/group-api/agents/7 \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' -H 'Content-Type: application/json' \
  -d '{"agent": {"system_prompt": "You are a careful research assistant."}}'
```

The agent's name, tools and every other field the payload does not mention survive the call.

The `agent` block carries `default_effort` — the level this agent runs with when nobody names one,
ahead of the LLM configuration's default. It is a level name from the set the agent's effective
configuration offers, and a name outside that set is refused. Leave the field out of a merge and
the agent keeps the default it had.

### Delete an agent

`DELETE /agents/{id}` removes the agent and everything that cascades from it — its chats, its
tools and its media.

### The reasoning-effort levels

`GET /agents/{agentId}/effort` tells a client which reasoning-effort levels an agent can use, and
which one it runs with when nobody says otherwise.

```bash
curl https://spora.example.com/api/v1/group-api/agents/7/effort \
  -H 'Authorization: Bearer spk_9f2c…_qRt…'
```

```json
{
  "data": {
    "supported": true,
    "levels": [
      { "value": "low", "label": "Low" },
      { "value": "high", "label": "High" }
    ],
    "default": "high"
  }
}
```

- `supported` — the agent's effective LLM configuration offers at least one level. A configuration
  whose endpoint has no reasoning-effort parameter at all answers `false` with an empty `levels`
  array.
- `levels` — the levels on offer, each with the label to show. The set is the operator's
  configuration, not a fixed scale: a provider's own vocabulary is expressible, so a name outside
  Spora's canonical seven can appear here.
- `default` — the level this agent runs with when nobody names one: its own `default_effort` when
  it has one and the configuration still offers it, the LLM configuration's default otherwise.
  `null` means the model's own default — no level asked for.

An agent outside the group answers `404`, the same as any other agent on this surface. See
[Concepts → Reasoning effort](/reference/concepts/reasoning-effort) for the level set, the default
chain and the bounds on a level name.

## Chats

A group key drives the chats of every agent in the group, including chats a human started in the
admin UI. The agent a chat belongs to is named in the body, because a group has many agents.

```bash
curl -X POST https://spora.example.com/api/v1/group-api/chats \
  -H 'Authorization: Bearer spk_9f2c…_qRt…' -H 'Content-Type: application/json' \
  -d '{
        "agent_id": 7,
        "text": "Summarise the attached Q3 figures",
        "callback_url": "https://example.com/hooks/spora"
      }'
```

Everything else — polling, transcripts, blocked chats, callbacks, media — works exactly as on
the [per-agent surface](/reference/agent-api), with one difference: a chat outside the group
answers `404`, not `403`. A caller must not be able to probe which chat ids exist.

`effort` is accepted on the chat body — the reasoning effort for that message. It is a **level name
from the set the agent's LLM configuration offers**, not a fixed scale; read the set from
[`GET /agents/{agentId}/effort`](#the-reasoning-effort-levels) and send the name back unchanged.
Leave it out and the agent's own default applies — its `default_effort` while the configuration
still offers that level, the LLM configuration's default otherwise. Send `""` to ask for the
model's own default, so that no level is asked for. A `null` is read as an omitted field, so it
applies the default too — it is not a `422 INVALID_EFFORT`. A value that is neither a string nor
`null` is a `422 INVALID_EFFORT`; a string the configuration does not offer is a
`422 EFFORT_LEVEL_UNSUPPORTED`, and the message names the levels it does offer.
`POST /chats/{id}/messages` takes the same field, where it applies to that follow-up only. See
[Concepts → Reasoning effort](/reference/concepts/reasoning-effort) for the level set and the
default chain, [Concepts → LLM drivers](/reference/concepts/drivers#effort-levels) for the wire
shapes, and [the refusals](/reference/api#the-effort-field-on-a-task-body) for every message the
two codes answer with.

One driver asks for a level anyway: on a GPT-5.4-or-later reasoning model the OpenAI-compatible
driver sends `reasoning_effort: "none"` when the agent uses tools and no level resolves, because
silence is not a working configuration on the models that default to `medium` — see
[Tools and effort on Chat Completions](/reference/concepts/drivers#tools-and-effort-on-chat-completions).

`GET /group-api/chats` lists the chats of all the group's agents, newest first, always paginated
(25 per page by default, 100 maximum) with `?page=` and `?per_page=`. `?since=<ISO-8601>` narrows
to chats updated after that instant.

### Callbacks

Supply `callback_url` when starting a chat and Spora POSTs to it once the chat settles. The
signature is keyed on the digest of your key's secret, so a receiver written against the
per-agent API verifies a group-scoped callback with the same code — see
[verifying the signature](/reference/agent-api#verifying-the-signature).

## Errors and rate limits

Standard Spora envelopes: `{ "data": … }` on success, `{ "error": { "code": "…", "message": "…" } }`
otherwise. The [error-handling reference](/reference/concepts/error-handling) is canonical.

| Status | Meaning                                                                                     |
| ------ | ------------------------------------------------------------------------------------------- |
| `400`  | The body was not JSON, or the media upload had no `file` part.                              |
| `401`  | The key is missing, malformed, unknown, revoked, of the wrong scope, or wrong.              |
| `404`  | No such chat, agent or media in this group — or the API is not mounted here.                |
| `409`  | The chat is not in a state that allows the action.                                          |
| `415`  | `POST /media` only — the uploaded file's type is not in the agent's accept-list.            |
| `422`  | The request body was not usable — a missing `agent_id`, or a payload the validator refuses. |
| `429`  | Rate limited. Retry after the interval in the `Retry-After` header.                         |
| `500`  | The upload could not be read off disk.                                                      |

The limit is per key and operator-tunable in Global Settings as **API rate limit**
(`SPORA_API_RATE_LIMIT_MAX`, 60 requests per minute by default) — one limit for every scope.

## Operational notes

- **Storage precedence.** `SPORA_GROUP_API=1` in `.env` seeds the setting, but once it has been
  saved in Global Settings the stored value wins. Set it in one place.
- **`GET /api/v1/config` carries `group_api_enabled`** — the flag the admin SPA reads to decide
  whether the scope is mounted. It drives the warning on the keys section, not whether the section
  is there: the section renders either way, so keys stay revocable when the scope is off.
- **The API is not a worker.** `POST /chats` answers `202` and returns immediately — it queues the
  chat and a worker runs it. In client-worker mode the API answers `404` on every endpoint.
- **A group key does not reach outside its group.** It cannot list or mutate groups, and it
  cannot see a personal agent. Moving an agent between groups is an ownership change and stays in
  the admin UI.

## What's next

- [Agent API](/reference/agent-api) — the per-agent surface, and the details this page builds on
- [Global API](/reference/global-api) — the install-wide scope
- [Agent templates](/reference/concepts/agent-templates) — the format the agent endpoints speak
- [API reference](/reference/api/group-api) — every endpoint with its status codes
