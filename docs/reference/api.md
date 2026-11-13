---
title: REST API reference
description: Spora's HTTP API — endpoint catalog, request/response envelope, auth stack, error code registry.
---

# REST API reference

Spora exposes a JSON REST API at `/api/v1/`. Most routes require a session cookie (`PHPSESSID`) and a `X-CSRF-Token` header (the value of `data.csrf_token` returned by `GET /api/v1/auth/me`). The unauthenticated exceptions are the pre-auth flows (`/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/email/confirm`, `/auth/verify/{selector}`, `/auth/verification/resend`) and `GET /api/health`. The plugin install endpoints additionally require admin (`currentUser.isAdmin = true`).

For the canonical, comprehensive reference, see [Concepts → Error handling](/reference/concepts/error-handling) (envelope shape, error code registry, severity mapping) and the per-endpoint docs in [Operations → Day-2 ops](/start/operators/operations) (plugin install API in detail).

## Endpoint summary

The API surface splits into three areas: auth, agents, and tools/plugins. Auth and agents cover the most-used paths. Plugins have a separate write API gated by `SPORA_PLUGIN_INSTALL_ENABLED`.

### Auth

| Method  | Path                                | Auth   | Purpose                                                                   |
| ------- | ----------------------------------- | ------ | ------------------------------------------------------------------------- |
| `POST`  | `/api/v1/auth/login`                | —      | Authenticate (issues `data.csrf_token`)                                   |
| `POST`  | `/api/v1/auth/logout`               | + CSRF | End session                                                               |
| `GET`   | `/api/v1/auth/me`                   | + CSRF | Current user (returns `data.csrf_token`)                                  |
| `POST`  | `/api/v1/auth/register`             | —      | Create account (gated by `SPORA_ALLOW_REGISTRATION`)                      |
| `POST`  | `/api/v1/auth/forgot-password`      | —      | Start password reset flow                                                 |
| `POST`  | `/api/v1/auth/reset-password`       | —      | Complete password reset                                                   |
| `PATCH` | `/api/v1/auth/password`             | + CSRF | Change current user's password                                            |
| `PATCH` | `/api/v1/auth/account`              | + CSRF | Change current user's account name / email                                |
| `POST`  | `/api/v1/auth/email/change-request` | + CSRF | Request an email change (triggers confirmation)                           |
| `POST`  | `/api/v1/auth/email/confirm`        | —      | Confirm an email change (verifies the new address)                        |
| `GET`   | `/api/v1/auth/verify/{selector}`    | —      | Verify an email link (signup confirmation or address-change confirmation) |
| `POST`  | `/api/v1/auth/verification/resend`  | —      | Resend the initial signup verification email                              |

#### Verify endpoint response (`/api/v1/auth/verify/{selector}`)

The endpoint is CSRF-exempt and works whether or not the requester is logged in. The response carries a `kind` discriminator so the SPA can branch UI without inspecting the addresses itself:

**Initial signup** (`kind: "signup"`):

```json
{
  "kind": "signup",
  "old_email": null,
  "new_email": "user@example.com",
  "message": "Email verified successfully."
}
```

**Email change** (`kind: "change"`):

```json
{
  "kind": "change",
  "old_email": "previous@example.com",
  "new_email": "user@example.com",
  "message": "Email address changed successfully."
}
```

- `kind: "signup"` — initial account verification. The recipient clicks the link in the welcome email; `old_email` is `null` because the address itself has not changed. The user is not logged in; the SPA prompts to sign in.
- `kind: "change"` — email-address change confirmation. The recipient clicked the link in the change-confirmation email; `old_email` holds the previous address and `new_email` the one being confirmed. The user IS logged in (the change was initiated from their account page). The SPA should re-fetch `/auth/me` so the navbar reflects the new address without a full reload.

Source: `AuthWorkflow::performEmailVerification` (`app/Services/AuthWorkflow.php`); see spora-ai/spora-core#185.

### Agents

| Method   | Path                           | Auth    | Purpose                                                         |
| -------- | ------------------------------ | ------- | --------------------------------------------------------------- |
| `GET`    | `/api/v1/agents`               | session | List agents (accepts `?principal_id=` repeatable filter)        |
| `POST`   | `/api/v1/agents`               | + CSRF  | Create agent (accepts optional `principal_id` body field)       |
| `GET`    | `/api/v1/agents/{id}`          | session | Get one agent                                                   |
| `PATCH`  | `/api/v1/agents/{id}`          | + CSRF  | Update agent                                                    |
| `DELETE` | `/api/v1/agents/{id}`          | + CSRF  | Delete agent                                                    |
| `POST`   | `/api/v1/agents/{id}/transfer` | + CSRF  | Re-key agent ownership to another principal the caller controls |
| `GET`    | `/api/v1/agents/{id}/effort`   | session | The agent's reasoning-effort levels and its configured default  |

> To send a message to an agent, create a task via `POST /api/v1/tasks` — there's no `/chat` sub-resource. The agent picks up the task and processes it asynchronously.

#### Agent listing filter (`?principal_id=`)

`GET /api/v1/agents` accepts a repeatable `principal_id` query parameter (`?principal_id=1`, `?principal_id=1&principal_id=2`, or `?principal_id[]=1&principal_id[]=2`). Values are intersected with `PrincipalResolver::visiblePrincipalIds()` — out-of-scope ids are silently dropped so a caller cannot probe principal existence. Omitted filter = every visible agent.

#### Agent create body — `principal_id`

`POST /api/v1/agents` accepts an optional `principal_id` in the body. The caller must be admin OR control the target principal (`AgentPrincipalService::callerControlsPrincipal`); otherwise the request falls back to the caller's own user-principal. Use this when an admin wants to spawn an agent directly under a group without first creating a user-principal route.

#### Transfer authorisation

`POST /api/v1/agents/{id}/transfer` re-keys the agent's `principal_id`. Caller must control both source and target (admin/owner of source AND admin/owner of target, OR owner of target when the target is the caller's own user-principal). Admins skip the source side of the gate. `403 FORBIDDEN` on `UnauthorizedTransferException`; `404 NOT_FOUND` when the target principal doesn't exist.

#### Favourites (per-user, Plan A)

`POST /api/v1/agents/{id}/favorite` and `DELETE /api/v1/agents/{id}/favorite` flip the calling user's per-user favourite flag for the agent. Favourites are stored in the `user_agent_favorites` pivot table (composite PK `user_id, agent_id`, cascade FKs on both sides) and are private to the caller — toggling a favourite in one browser does not affect group peers. Both endpoints are idempotent: POST is a no-op when the row already exists; DELETE is a no-op when no row exists. Both return `404 NOT_FOUND` when the agent is not visible to the caller (visibility = same principal axis as everywhere else in the service). The legacy shared `agents.is_favorite` column was dropped in migration 0079; PATCH no longer accepts `is_favorite` (returns 422).

#### Reasoning effort (`GET /agents/{id}/effort`)

The levels the agent's effective LLM configuration offers, and the default the agent runs with.
It is a separate endpoint rather than a field on the agent resource, because the agent resource is
built for the list endpoint too.

```json
{
  "data": {
    "supported": true,
    "levels": [{ "value": "low", "label": "Low" }],
    "default": "high"
  }
}
```

- `supported` — the effective configuration offers a non-empty level set. A driver that cannot express effort, and an operator who turned the capability off for the endpoint, answer `false` with an empty `levels` array.
- `levels` — the levels the configuration offers, each with a label. A configuration that names its own list in `effort_levels` offers exactly that list; a configuration that names none falls back to its driver's own set, and that fallback is driver-dependent: the Anthropic driver answers with the levels the agent's _model_ takes, while the two OpenAI drivers answer with the whole canonical scale, whatever the model takes. **An offered level is not an accepted one** — a level the configuration offers can still be refused by the provider.
- `default` — the level this agent runs with when nobody names one: the agent's own `default_effort`, then the effective configuration's `effort` setting, then `null` for the model's own default. A default the configuration does not offer is never reported, because it would never be sent.

The effective configuration is resolved on the server, through the same three tiers the agent uses —
the agent's own configuration, the principal's preferred configuration, then the global default — so
a client never has to re-implement it.

An agent the caller may not see answers `404`, the same as `GET /api/v1/agents/{id}`.

**This endpoint takes the session cookie and no bearer key.** The bearer-key surfaces have their own
counterparts, one per key type: `GET /api/v1/agent-api/effort` (the key pins one agent, so the path
carries no id), `GET /api/v1/group-api/agents/{agentId}/effort` and
`GET /api/v1/global-api/agents/{agentId}/effort`. All four answer with the same envelope.

See [Concepts → LLM drivers](/reference/concepts/drivers#effort-levels) for the scale and the resolution order.

### Groups

| Method   | Path                                                | Auth                                  | Purpose                                                                       |
| -------- | --------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `GET`    | `/api/v1/groups`                                    | session                               | List groups (members see their own; admins see every group)                   |
| `POST`   | `/api/v1/groups`                                    | session + CSRF                        | Create a group (creator becomes `role: owner`; group-principal materialises)  |
| `GET`    | `/api/v1/groups/{id}`                               | session                               | Get one group (members only; 404 hides existence)                             |
| `PATCH`  | `/api/v1/groups/{id}`                               | owner/group-admin/global-admin + CSRF | Update name / description / `information` / `profile_picture`                 |
| `DELETE` | `/api/v1/groups/{id}`                               | owner/global-admin + CSRF             | Delete a group (409 if agents still reference its principal)                  |
| `GET`    | `/api/v1/groups/{id}/members`                       | session                               | List members                                                                  |
| `POST`   | `/api/v1/groups/{id}/members`                       | + CSRF                                | Add a member (accepts `user_id` OR `email`; global admin or group owner only) |
| `PATCH`  | `/api/v1/groups/{id}/members/{uid}`                 | + CSRF                                | Change a member's role                                                        |
| `DELETE` | `/api/v1/groups/{id}/members/{uid}`                 | + CSRF                                | Remove a member                                                               |
| `GET`    | `/api/v1/groups/{id}/agents`                        | session                               | List agents owned by the group's principal                                    |
| `GET`    | `/api/v1/groups/{id}/preferences`                   | session                               | Get the group's principal preference                                          |
| `PUT`    | `/api/v1/groups/{id}/preferences`                   | + CSRF                                | Upsert the group's principal preference                                       |
| `GET`    | `/api/v1/groups/{id}/tools`                         | session                               | List tool settings scoped to the group principal                              |
| `POST`   | `/api/v1/groups/{id}/tools/{toolClass}`             | + CSRF                                | Upsert tool settings for the group principal                                  |
| `DELETE` | `/api/v1/groups/{id}/tools/{toolClass}`             | + CSRF                                | Delete tool settings for the group principal                                  |
| `GET`    | `/api/v1/groups/{id}/llm-configs`                   | session                               | List LLM configs scoped to the group principal                                |
| `POST`   | `/api/v1/groups/{id}/llm-configs`                   | + CSRF                                | Create an LLM config under the group principal                                |
| `PATCH`  | `/api/v1/groups/{id}/llm-configs/{cid}`             | + CSRF                                | Update an LLM config under the group principal                                |
| `DELETE` | `/api/v1/groups/{id}/llm-configs/{cid}`             | + CSRF                                | Delete an LLM config under the group principal                                |
| `POST`   | `/api/v1/groups/{id}/llm-configs/{cid}/set-default` | + CSRF                                | Promote an LLM config to default for the group                                |
| `POST`   | `/api/v1/groups/{id}/picture/image`                 | + CSRF                                | Multipart avatar upload for the group                                         |
| `DELETE` | `/api/v1/groups/{id}/picture/image`                 | + CSRF                                | Clear the group's avatar and reset to default archetype                       |
| `GET`    | `/api/v1/groups/{id}/locations`                     | session                               | List the group's saved locations (members may read)                           |
| `POST`   | `/api/v1/groups/{id}/locations`                     | + CSRF                                | Create a location for the group (group owner/admin only)                      |
| `PATCH`  | `/api/v1/groups/{id}/locations/{locationId}`        | + CSRF                                | Update one of the group's locations (group owner/admin only)                  |
| `DELETE` | `/api/v1/groups/{id}/locations/{locationId}`        | + CSRF                                | Delete one of the group's locations (group owner/admin only)                  |

A global admin usually does not belong to the groups it administers, and the group routes do not all treat that the same way. The **group row** answers a global admin that is not a member — `PATCH` and `DELETE` both do — and so do the **member routes** and the **picture routes**: a global admin may read a group's membership, add and remove members, and replace the group's avatar without belonging to it. The routes that hold the group's **settings** — the agents, the locations, the tool settings, the LLM configs and the preferences — are gated on membership for everyone, a global admin included, so a non-member gets `404 GROUP_NOT_FOUND` on every one of them. Group creation is the other way round: it is open to every signed-in user unless the operator turns `allow_group_creation` off, in which case it is global-admin only. See [Principals and groups → Group authorisation](/reference/concepts/principals#group-authorisation) for the full table.

### Principals

| `GET` | `/api/v1/principals/me` | session | List the principal rows the caller can act as (own user-principal + every group-principal they belong to). Each entry carries a derived `name` so the principal picker can label entries without a second round-trip. Powers the principal selector in the agent-create dialog. |

#### Scheduled runs

Schedules live under the owning agent. The full route set is listed in the auto-generated table below; this subsection documents the wire contract that is **not** obvious from the OpenAPI spec.

`POST /api/v1/agents/{id}/scheduled-runs` accepts a one-shot or recurring trigger:

| Field                | Type                | Required for... | Notes                                                                                                                                                                                                                                            |
| -------------------- | ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cron_expression`    | string              | recurring       | Standard 5-field cron (`* * * * *`). Evaluated against the schedule's `timezone`, not UTC.                                                                                                                                                       |
| `run_at`             | string              | one-shot        | ISO 8601 timestamp. May be offset-less (`2026-04-20T10:00:00`) or offset-bearing (`2026-04-20T10:00:00+02:00`). If offset-less, the backend anchors the literal wall-clock value to `timezone`; if offset-bearing, the absolute instant is used. |
| `timezone`           | string (IANA, ≤ 50) | optional        | Defaults to `UTC`. Validated against the IANA tz database; an invalid id returns `422 VALIDATION_ERROR`. The frontend defaults to the browser's IANA zone via `Intl.DateTimeFormat().resolvedOptions().timeZone`.                                |
| `template_id`        | integer \| null     | optional        | FK to `agent_prompt_templates.id`. When set, `prompt_template` + its `variables` drive the prompt at fire time (template variables can be referenced via `{{var}}`).                                                                             |
| `raw_prompt`         | string              | optional        | Free-form prompt used when no template is attached. Same `{{var}}` substitution applies.                                                                                                                                                         |
| `max_steps_override` | integer \| null     | optional        | Override the agent's `max_steps` for this schedule only. Falls back to the template, then the agent.                                                                                                                                             |
| `effort_override`    | string \| null      | optional        | Override the reasoning effort for this schedule only. `null` inherits the template's, then the agent's, then the LLM configuration's. A level the agent's LLM configuration does not offer is a `422 EFFORT_LEVEL_UNSUPPORTED`.                  |
| `is_active`          | boolean             | optional        | Default `true`. Set `false` to pause without deleting.                                                                                                                                                                                           |

Error contract:

- **`422 VALIDATION_ERROR`** — invalid `timezone` (e.g. `'Not/A_Zone'` or a string longer than 50 characters), or a `run_at` that fails PHP's date parser.
- **`404 NOT_FOUND`** — agent id does not exist or is not owned by the caller. Both cases return 404 so a non-owner cannot probe agent existence.

Recurring semantics:

- `next_run_at` is recomputed after each successful fire using wall-clock `now` in the schedule's `timezone` as the cron reference (so arbitrarily-delayed invocations do not drift).
- A transient orchestrator failure no longer kills a recurring schedule — the next `PENDING` entry stays queued and the next cron fire retries. A one-shot that fails on dispatch deactivates the run (`is_active = false`); re-enable by `PUT`-ing with `is_active = true` or by triggering manually.

Manual trigger: `POST /api/v1/agents/{id}/scheduled-runs/{runId}/trigger` enqueues an immediate execution regardless of `next_run_at`. The schedule stays active.

#### Agent resource

Every `GET` and `PATCH` response (and each entry of `GET /api/v1/agents`) carries an `agent` object with the following wire-format fields. Fields introduced in this release are marked **(new)**.

| Field                      | Type                             | Notes                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | integer                          | Owning agent id.                                                                                                                                                                                                                                                                                  |
| `name`                     | string                           | Display name.                                                                                                                                                                                                                                                                                     |
| `description`              | string \| null                   | Short summary, up to 2000 chars.                                                                                                                                                                                                                                                                  |
| `system_prompt`            | string \| null                   | System prompt (Markdown allowed).                                                                                                                                                                                                                                                                 |
| `llm_driver_config_id`     | integer \| null                  | Bound LLM config; `null` means inherit the global default.                                                                                                                                                                                                                                        |
| `max_steps`                | integer                          | Max LLM turns per task (1-100). Default `10`.                                                                                                                                                                                                                                                     |
| `default_effort` **(new)** | string \| null                   | The reasoning effort this agent runs with when a message names none. `null` inherits the LLM configuration's default. A level the agent's LLM configuration does not offer is refused with `422 EFFORT_LEVEL_UNSUPPORTED`.                                                                        |
| `is_active`                | boolean                          | Whether the agent accepts new tasks.                                                                                                                                                                                                                                                              |
| `allow_followup`           | boolean                          | Whether the agent can be re-engaged in the same task.                                                                                                                                                                                                                                             |
| `retry_after_minutes`      | integer                          | Delay between scheduled retries (≥ 0).                                                                                                                                                                                                                                                            |
| `max_retries`              | integer                          | Max retries per task (≥ 0).                                                                                                                                                                                                                                                                       |
| `is_pinned` **(new)**      | boolean                          | `true` keeps the agent at the top of the dashboard list. Default `false`.                                                                                                                                                                                                                         |
| `is_archived` **(new)**    | boolean                          | `true` hides the agent from the default view; row + tasks are retained. Default `false`.                                                                                                                                                                                                          |
| `created_at` **(new)**     | string \| null (ATOM / ISO 8601) | When the agent row was created. `null` for stub/test fixtures.                                                                                                                                                                                                                                    |
| `tools`                    | array                            | See [Tool allowlist](#tool-allowlist-on-an-agent).                                                                                                                                                                                                                                                |
| `icon` **(new)**           | string \| null                   | Resolved icon key for the dashboard's `<Icon>` component (e.g. `'calendar'`, `'mail'`, `'search'`). Server-side 3-layer resolution: the `*Tool` class's `#[Tool(icon: ...)]` argument wins, then the owning plugin's `plugin.json` `icon` field, then `null` (frontend falls back to `'puzzle'`). |

`PATCH /api/v1/agents/{id}` accepts any subset of the fields above. `is_pinned` and `is_archived` accept JSON booleans or the strings `"true"` / `"false"` — both are coerced via `FILTER_VALIDATE_BOOLEAN` server-side, so the form layer and curl both work.

> No dedicated HTTP endpoints exist for toggling pin/archive in isolation. To flip just one flag without touching other fields, send a `PATCH` with the single boolean (e.g. `{"is_pinned": true}`).

#### Tool allowlist on an agent

The `tools` array on an agent lists the tool activations for that agent. Each entry has `tool_class`, `icon`, `enabled`, and the per-operation `enabled` / `requires_approval` flags — the slim shape used by `read_agent` / `configure_tools` / `update_agent`. Editing the allowlist is done through the agent's edit form, not via the wire. The richer per-tool metadata (`display_name`, `description`, `plugin_slug`, `ready_to_enable`, `missing_required`) lives on `AgentTool.get_available_tools` (version 2), not on the agent resource.

### Tasks

| Method   | Path                                 | Auth    | Purpose                                                                                                                                                              |
| -------- | ------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/tasks`                      | session | List tasks                                                                                                                                                           |
| `POST`   | `/api/v1/tasks`                      | + CSRF  | Create a task (use this to send a message to an agent)                                                                                                               |
| `GET`    | `/api/v1/tasks/{taskId}`             | session | Get one task (includes history)                                                                                                                                      |
| `POST`   | `/api/v1/tasks/{taskId}/approve`     | + CSRF  | Approve a pending tool call                                                                                                                                          |
| `POST`   | `/api/v1/tasks/{taskId}/reject`      | + CSRF  | Reject a pending tool call                                                                                                                                           |
| `POST`   | `/api/v1/tasks/{taskId}/retry`       | + CSRF  | Retry a failed task                                                                                                                                                  |
| `POST`   | `/api/v1/tasks/{taskId}/continue`    | + CSRF  | Continue a `COMPLETED` / `FAILED` / `ABORTED` / `RUNNING` task. `RUNNING` sources auto-abort first.                                                                  |
| `POST`   | `/api/v1/tasks/{taskId}/abort`       | + CSRF  | Abort a `RUNNING` or `AWAITING_SUB_AGENTS` task (sets status to `ABORTED`, stamps `data.aborted_at`); idempotent on already-`ABORTED`, 409 for non-abortable states. |
| `DELETE` | `/api/v1/tasks/{taskId}/retry-chain` | + CSRF  | Cancel a scheduled retry chain                                                                                                                                       |
| `DELETE` | `/api/v1/tasks/{taskId}`             | + CSRF  | Delete a task (and cancel if in flight)                                                                                                                              |

The `tool_calls[]` array on every task response is the canonical
`ToolCallSerializer::toArray()` shape — `operation`, `operation_description`,
a live-derived `parameter_schema` (from the registered `ToolInterface`
instance or reflection fallback), and a server-resolved `icon` (same
3-layer chain as the Agent resource: `#[Tool(icon: ...)]` wins, then the
owning plugin's `plugin.json` `icon`, then `null` — the frontend
`<Icon>` component falls back to `'puzzle'` on its own) are all present on
both `GET /api/v1/tasks/{taskId}` and the Mercure live-update stream. See
[Concepts → Tools → Discovery from the LLM](/reference/concepts/tools#discovery-from-the-llm)
for the per-tool LLM-facing contract returned by `AgentTool.get_available_tools`,
and [Concepts → Tools → Icon resolution](/reference/concepts/tools#icon-resolution)
for the resolution chain.

#### The `effort` field on a task body

`POST /api/v1/tasks` and `POST /api/v1/tasks/{taskId}/continue` accept an optional `effort` — the
reasoning effort for that task.

| Body               | Meaning                                                 |
| ------------------ | ------------------------------------------------------- |
| key absent         | the agent's default applies, then the configuration's   |
| `"effort": null`   | the same — a `null` is read as an omitted field         |
| `"effort": ""`     | explicitly the model's own default — no level asked for |
| `"effort": "high"` | that level                                              |

**A `null` is not a value the validator refuses.** `TaskEffortRequestValidator::parse()` reads the
body with a null-coalescing lookup, so an explicit `"effort": null` falls out exactly as an absent
key does: the agent's default applies and the request is not a `422 INVALID_EFFORT`. The
value that is refused for not being a string is the one that is neither a string nor `null`.

**The levels are not a fixed scale.** A configuration names the levels its endpoint takes, in
`effort_levels`, and a configuration that names none falls back to its driver's own set — the
levels the model takes on the Anthropic driver, the whole canonical scale on the two OpenAI
drivers — so the seven canonical names (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`)
are the default vocabulary, not the only names that exist. **An offered level is not an accepted
one**: a level the configuration offers can still be refused by the provider. **Two codes, five
refusals.** A value that is neither a string nor `null` is a `422 INVALID_EFFORT` — the request
has to be fixed. A level the agent's LLM configuration does not offer is a `422
EFFORT_LEVEL_UNSUPPORTED` — the client's cached capability for that agent is out of date, and the
effort endpoints list the levels the configuration offers.

The code says which kind of refusal it is. **The message says which one**, and it is the only thing that does: `EFFORT_LEVEL_UNSUPPORTED` answers four different situations and the code is the same for all of them.

| Reason                                      | Code                       | Message (English)                                                                                                  |
| ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| the field is neither a string nor `null`    | `INVALID_EFFORT`           | `effort must be a string.`                                                                                         |
| the agent has no LLM configuration          | `EFFORT_LEVEL_UNSUPPORTED` | `effort "<level>" cannot be sent: this agent has no LLM configuration.`                                            |
| the agent's driver could not be resolved    | `EFFORT_LEVEL_UNSUPPORTED` | `effort "<level>" cannot be sent: this agent's LLM driver could not be resolved.`                                  |
| the driver declares no level for this model | `EFFORT_LEVEL_UNSUPPORTED` | `effort "<level>" is not offered by this agent's LLM driver: it cannot express a reasoning effort for this model.` |
| the driver declares other levels            | `EFFORT_LEVEL_UNSUPPORTED` | `effort "<level>" is not offered by this agent's LLM driver. Supported levels: low, medium, …`                     |

The messages are the framework's own strings and they are **localised**: the router translates every error message it passes through and leaves the code alone. **The server picks the locale, not the client** — `Accept-Language` is never consulted, and the chain is the caller's stored locale → the instance default → English. A client that asked for one language can therefore be answered in another, so **match on the code and display the message rather than matching localised prose**; a client that would rather not read prose at all asks the effort endpoint for its key type and only ever sends a level that endpoint lists.

The empty string is a value in its own right — the wire value for _the model default_ — rather than
a missing field, which is why it appears among the accepted values on the endpoint's own page.

The resolved value is stored on the task row, where `NULL` means no level was resolved — the model's
own default — and the database never stores an empty string. One driver asks for a level anyway: on
a GPT-5.4-or-later reasoning model the OpenAI-compatible driver sends `reasoning_effort: "none"`
when the agent uses tools and no level resolves, because silence is not a working configuration on
the models that default to `medium` — see
[Concepts → LLM drivers](/reference/concepts/drivers#tools-and-effort-on-chat-completions).

See [Concepts → LLM drivers](/reference/concepts/drivers#effort-levels) for the scale, the wire shapes
and the resolution order.

### Plugins (operator, gated by `SPORA_PLUGIN_INSTALL_ENABLED`)

| Method   | Path                        | Auth         | Purpose                                      |
| -------- | --------------------------- | ------------ | -------------------------------------------- |
| `GET`    | `/api/v1/plugins`           | session      | List installed plugins                       |
| `POST`   | `/api/v1/plugins`           | admin + CSRF | Install (full envelope: error codes, status) |
| `DELETE` | `/api/v1/plugins/{package}` | admin + CSRF | Uninstall                                    |
| `PATCH`  | `/api/v1/plugins/{package}` | admin + CSRF | Update to latest matching constraint         |

Full envelope, error codes, and per-endpoint contract: [Install API](/develop/plugins/install-api). Implementation: `app/Http/PluginsController.php`.

### Notifications, agent templates, LLM drivers, tools, users

See [Concepts → Architecture](/reference/concepts/architecture) for the full HTTP surface. The Vue admin UI consumes these endpoints; the same `X-CSRF-Token` middleware protects all state-changing routes.

### Agent templates

| Method | Path                               | Auth           | Purpose                                    |
| ------ | ---------------------------------- | -------------- | ------------------------------------------ |
| `GET`  | `/api/v1/agent-templates`          | session        | List built-in + plugin templates           |
| `GET`  | `/api/v1/agent-templates/{id}`     | session        | Get one template (full payload + warnings) |
| `POST` | `/api/v1/agent-templates/validate` | session + CSRF | Validate a raw payload without importing   |
| `POST` | `/api/v1/agent-templates/import`   | session + CSRF | Create an agent from a payload             |
| `GET`  | `/api/v1/agents/{id}/export`       | session        | Export an agent as a template JSON         |

> **Settings are not exported by default.** Exporting an agent produces a JSON template that includes tool activations and per-operation auto-approve defaults. Pass `?include_settings=1` to also embed per-tool non-secret settings (anything declared with `#[ToolSetting]` except `type: 'password'`); the importer applies them on import. Passwords, API keys, and other secrets must always be reconfigured in **Settings → Tools** after import. The `inline_info` / `inline_warning` fields in the export response remind the caller to communicate which mode was used.

### Skills

| Method | Path                                 | Auth    | Purpose                                                           |
| ------ | ------------------------------------ | ------- | ----------------------------------------------------------------- |
| `GET`  | `/api/v1/skills`                     | session | List discovered skills (powers the `allowed_skills` multi-select) |
| `GET`  | `/api/v1/skills/{slug}`              | session | One skill — full `files` listing + raw `SKILL.md` body            |
| `GET`  | `/api/v1/skills/{slug}/files/{path}` | session | One sidecar's contents → `{"data": {"path", "content", "bytes"}}` |

Skills are auto-discovered from three sources (project, framework, plugin). All three accept `?principal_id=N` to narrow the lookup to one principal the caller can see; a name not visible to the caller is a `404`, never a `403`. See [Concepts → Skills](/reference/concepts/skills).

`{path}` is an exact-match key from the skill's `files` listing. Both the raw-slash and the percent-encoded form reach the route, so `…/files/references/REFERENCE.md` and `…/files/references%2FREFERENCE.md` are equivalent.

An unknown skill, a path the skill does not list, and a file over the 50 000-byte cap all answer the same `404 SKILL_FILE_NOT_FOUND` — deliberately, so the endpoint cannot be used to probe what exists in another tenant. Note that this differs from the plugin's own file route below, which answers `404 FILE_NOT_FOUND` and `413 FILE_TOO_LARGE` for the latter two; a viewer shared by both has to branch on the status code.

### Custom skills (`spora-plugin-custom-skills`)

**These routes ship with the plugin, not with core.** They exist only once [`spora-plugin-custom-skills`](https://github.com/spora-ai/spora-plugin-custom-skills) is installed; a stock install returns `404` on all of them. They are listed here because the admin panel and the `manage_skill` tool call them, and because the write side of the [Skills](/reference/concepts/skills#custom-skills) story has no core equivalent.

Base path `/api/v1/custom-skills`. Every route sits behind `[AuthMiddleware, CsrfMiddleware]`. `?principal_id=N` selects the acting principal: absent, the caller's own user-principal. Success envelopes are `{"data": …}`, errors `{"error": {"code": "…", "message": "…"}}`.

| Method   | Path                                        | Success                                            | Errors                                                              |
| -------- | ------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `GET`    | `/api/v1/custom-skills`                     | `{"data": {"skills": [CustomSkillResource, …]}}`   | —                                                                   |
| `GET`    | `/api/v1/custom-skills/{name}`              | `{"data": {"skill": CustomSkillResource}}`         | `404 SKILL_NOT_FOUND`                                               |
| `GET`    | `/api/v1/custom-skills/{name}/files`        | `{"data": {"files": [{path, bytes}, …]}}`          | `404 SKILL_NOT_FOUND`                                               |
| `GET`    | `/api/v1/custom-skills/{name}/files/{path}` | `{"data": {"path", "content", "bytes"}}`           | `404 SKILL_NOT_FOUND` · `404 FILE_NOT_FOUND` · `413 FILE_TOO_LARGE` |
| `POST`   | `/api/v1/custom-skills`                     | `201 {"data": {"skill": …}}`                       | `422` · `409 SKILL_NAME_TAKEN` · `409 SKILL_NAME_RESERVED`          |
| `PUT`    | `/api/v1/custom-skills/{name}`              | `200 {"data": {"skill": …}}`                       | `404` · `422` · `409`                                               |
| `DELETE` | `/api/v1/custom-skills/{name}`              | `{"data": {"deleted", "name", "scrubbed_agents"}}` | `404 SKILL_NOT_FOUND`                                               |
| `POST`   | `/api/v1/custom-skills/{name}/restore`      | `200 {"data": {"skill": …}}`                       | `404` · `409 NO_PREVIOUS_VERSION`                                   |
| `GET`    | `/api/v1/custom-skills/{name}/allowlist`    | `{"data": {"agents": [{id, name, scope}]}}`        | `404 SKILL_NOT_FOUND`                                               |

`CustomSkillResource` is the shape every route returns: `id`, `principal_id`, `name`, `slug`, `description`, `license`, `compatibility`, `allowed_tools`, `metadata`, `body`, `body_bytes`, `provenance` (`human` \| `agent`), `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`, `files[]` (`SKILL.md` first, always), `has_previous`, `previous_at`, `previous_by`, and `warnings[]` with `warning_count`. `name === slug` is enforced at write time; a name change on `PUT` is a `422`.

`POST` / `PUT` bodies take `{name, description, body, license?, compatibility?, allowed_tools?, metadata?, files?}`, where `files` is a `{path: content}` map that **fully replaces** the sidecar set. The response's `warnings[]` are `SkillValidator` entries verbatim.

`allowed_tools` is the skill's declared tool list, carried under the snake_case spelling `license` and `compatibility` also use — the hyphenated `allowed-tools` is the frontmatter's, and the composer owns that rename. Core's `SkillValidator` judges the value on the way in, so a non-string or a malformed entry is a `422` and never reaches the column. The declaration is descriptive and pre-approves nothing; see [Concepts → Skills](/reference/concepts/skills#declaring-the-tools-a-skill-uses). It is deliberately absent from `previous_snapshot`, so a rollback restores content and leaves the declaration as the author last wrote it.

`{path}` matches the rest of the path, percent-encoded by the client (`examples%2Finvoice.md`).

Principal resolution — the read and write gates differ on purpose:

| Caller relation to principal   | GET                   | POST/PUT/DELETE |
| ------------------------------ | --------------------- | --------------- |
| Own user-principal             | 200                   | 200/201         |
| Group they belong to, any role | 200                   | `403 FORBIDDEN` |
| Group owner/admin              | 200                   | 200/201         |
| Unrelated principal            | `404 SKILL_NOT_FOUND` | `403 FORBIDDEN` |

Cap errors (all `422`): `SKILL_LIMIT_REACHED` (25 skills per principal) · `TOO_MANY_FILES` (20 per skill) · `TOTAL_SIZE_EXCEEDED` (200 000 bytes per skill) · `FILE_TOO_LARGE` (50 000 bytes per file) · `DESCRIPTION_TOO_LONG` (1024 chars). A `422 SKILL_INVALID` carries the `ValidationResult` array in `data.errors`.

`DELETE` also scrubs the name from every `allowed_skills` array for that principal, in the same transaction, and names the agents it touched in `scrubbed_agents` — that is what the delete confirmation dialog renders, and what `manage_skill`'s `delete` `describeAction` quotes. Only principal-owned custom skills are deletable here, so a shipped skill can never be scrubbed.

Deliberately **not** endpoints: pre-shipped skills come from the host's `GET /api/v1/skills` (the frontend must not re-fetch them from this plugin); there is no draft/publish pair (`provenance` + `has_previous` are the whole lifecycle); and there is no cross-principal publishing — a skill belongs to exactly one principal.

### Locale

| Method | Path                              | Auth    | Purpose                                                                     |
| ------ | --------------------------------- | ------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/v1/user-preferences/locale` | session | The caller's language, the one it resolves to, and every language available |
| `PUT`  | `/api/v1/user-preferences/locale` | + CSRF  | Set the caller's language, or clear it back to "auto"                       |

A request renders in the first locale of this chain that has a catalogue:

```text
users.locale  →  SPORA_DEFAULT_LANG  →  en
```

`Accept-Language` is never consulted. The instance owner sets one default in the admin UI, and a browser header overriding it would make the rendered language depend on the machine rather than on the install.

`GET` returns:

```json
{
  "data": {
    "locale": "de",
    "resolved": "de",
    "available": ["de", "en"]
  }
}
```

- `locale` — the caller's stored value, or `null` for "auto".
- `resolved` — the first link of the chain above that has a catalogue.
- `available` — every locale with a catalogue in core or in an installed plugin. The language picker's whole option list; adding a language is a file, not a release.

`PUT` takes `{ "locale": "de" }`, or `{ "locale": null }` to clear the choice and restore "auto":

```json
{ "data": { "locale": "de", "resolved": "de" } }
```

It writes `users.locale` (migration 0096), **not** `principal_preferences`: the language belongs to the person, who acts as a user-principal _and_ any number of group principals — on a principal-scoped column the language would change with the active principal.

Errors: `400 INVALID_JSON` (the body is not valid JSON) · `401 UNAUTHENTICATED` · `404 NOT_FOUND` (the session's user row is gone) · `422 VALIDATION_ERROR` (a locale nobody has a catalogue for).

`GET /api/v1/config` carries `default_lang` (`SPORA_DEFAULT_LANG`). A pre-login visitor has no preference to fetch, so this is the only thing telling the SPA which language the instance is in — without it the first paint would be English on a German instance.

## Envelope

Success:

```json
{ "data": { ... } }
```

Error:

```json
{
  "error": {
    "code": "MACHINE_CODE",
    "message": "Human-readable description."
  }
}
```

Rate-limited responses carry `Retry-After` as an HTTP header. For the full error code registry (codes, HTTP statuses, severities, mapping to UI), see [Concepts → Error handling](/reference/concepts/error-handling).

## Auth stack

- **`AuthMiddleware`** — validates the `PHPSESSID` cookie, populates `$currentUser` for the request. Applied to all routes that need a session.
- **`CsrfMiddleware`** — validates `X-CSRF-Token` against `$_SESSION['csrf_token']`. Applied to all state-changing (POST/PUT/PATCH/DELETE) routes.
- **`AdminMiddleware`** — additionally requires `currentUser.isAdmin = true`. Applied to plugin install, user management.

The public plugin install endpoints follow this same stack: `[AuthMiddleware, CsrfMiddleware, AdminMiddleware]`. When `SPORA_PLUGIN_INSTALL_ENABLED=false`, the same routes return `403 FEATURE_DISABLED`.

## Health endpoint

`GET /api/health` is the unauthenticated health check used by Docker's `healthcheck` directive and load balancers. Returns `200 OK` with `{"status":"ok","database":"connected"}` if the app is up. Returns `503 NOT_CONFIGURED` if the Mercure subsystem is configured but unreachable.

## Versioning

The API is mounted at `/api/v1/`. Breaking changes require a version bump (e.g. `/api/v2/`). Additions within v1 are non-breaking and don't require a version bump — new endpoints, new optional fields, new error codes.

## What's next

- [Concepts → Error handling](/reference/concepts/error-handling) — full error code registry and envelope spec
- [Install API](/develop/plugins/install-api) — the plugin install endpoints in detail
- [Operations → Day-2 ops](/start/operators/operations) — operator-facing workflows

<!-- API:GENERATED:START -->

## Spora API — endpoint catalogue

> This overview is generated from `docs/.vuepress/openapi.json`. `npm run gen:api` regenerates the per-resource pages listed below in lockstep.

### Browse by resource

- [Agents](/reference/api/agents) — 36 routes
- [Groups](/reference/api/groups) — 29 routes
- [Global-api](/reference/api/global-api) — 25 routes
- [Group-api](/reference/api/group-api) — 18 routes
- [Agent-api](/reference/api/agent-api) — 14 routes
- [Tasks](/reference/api/tasks) — 14 routes
- [Auth](/reference/api/auth) — 12 routes
- [Media](/reference/api/media) — 12 routes
- [Speech](/reference/api/speech) — 10 routes
- [Users](/reference/api/users) — 10 routes
- [Me](/reference/api/me) — 9 routes
- [Notifications](/reference/api/notifications) — 8 routes
- [Llm-configs](/reference/api/llm-configs) — 7 routes
- [Tools](/reference/api/tools) — 7 routes
- [Mail-templates](/reference/api/mail-templates) — 6 routes
- [Plugins](/reference/api/plugins) — 5 routes
- [Agent-templates](/reference/api/agent-templates) — 4 routes
- [User-preferences](/reference/api/user-preferences) — 4 routes
- [Admin](/reference/api/admin) — 3 routes
- [Mail-config](/reference/api/mail-config) — 3 routes
- [Skills](/reference/api/skills) — 3 routes
- [Sse](/reference/api/sse) — 3 routes
- [Apps](/reference/api/apps) — 1 route
- [Assets](/reference/api/assets) — 1 route
- [Config](/reference/api/config) — 1 route
- [Health](/reference/api/health) — 1 route
- [Llm-drivers](/reference/api/llm-drivers) — 1 route
- [Principals](/reference/api/principals) — 1 route
- [Public](/reference/api/public) — 1 route
- [Search](/reference/api/search) — 1 route
- [Worker](/reference/api/worker) — 1 route

### Security schemes

| Scheme       | Where  | Key              | Description                                                                                                                                                                     |
| ------------ | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookieAuth` | cookie | `PHPSESSID`      | Session cookie issued by `delight-im/auth`. Required by `AuthMiddleware`.                                                                                                       |
| `csrfToken`  | header | `X-CSRF-Token`   | CSRF token issued alongside the session. Required by `CsrfMiddleware` on every write method.                                                                                    |
| `bearerAuth` | http   | `(scheme-level)` | API key (`spk_<id>_<secret>`), scoped to one agent, one group or the whole install. Required by the API key middleware; no session or CSRF token is accepted on those surfaces. |

### Endpoints

| Method   | Path                                                        | Auth                       | Purpose                                                                  | Tags             |
| -------- | ----------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ | ---------------- |
| `GET`    | `/api/health`                                               | —                          | Check Health                                                             |                  |
| `GET`    | `/api/v1/admin/settings`                                    | `cookieAuth`               | Every declared setting, its current value and where that value came from | Admin            |
| `PATCH`  | `/api/v1/admin/settings`                                    | `cookieAuth` + `csrfToken` | Upsert settings                                                          | Admin            |
| `DELETE` | `/api/v1/admin/settings/{group}/{key}`                      | `cookieAuth` + `csrfToken` | Reset one setting to its declared default                                | Admin            |
| `GET`    | `/api/v1/agent-api/chats`                                   | `bearerAuth`               | List this agent's chats                                                  | Agent-api        |
| `POST`   | `/api/v1/agent-api/chats`                                   | `bearerAuth`               | Start a chat with this agent                                             | Agent-api        |
| `POST`   | `/api/v1/agent-api/chats/{chatId}/answer`                   | `bearerAuth`               | Answer the agent's question                                              | Agent-api        |
| `POST`   | `/api/v1/agent-api/chats/{chatId}/approve`                  | `bearerAuth`               | Approve pending tool calls                                               | Agent-api        |
| `GET`    | `/api/v1/agent-api/chats/{chatId}/messages`                 | `bearerAuth`               | User messages and answers only                                           | Agent-api        |
| `POST`   | `/api/v1/agent-api/chats/{chatId}/messages`                 | `bearerAuth`               | Continue a chat                                                          | Agent-api        |
| `POST`   | `/api/v1/agent-api/chats/{chatId}/reject`                   | `bearerAuth`               | Reject pending tool calls                                                | Agent-api        |
| `GET`    | `/api/v1/agent-api/chats/{chatId}/status`                   | `bearerAuth`               | Status and final answer                                                  | Agent-api        |
| `GET`    | `/api/v1/agent-api/chats/{chatId}/transcript`               | `bearerAuth`               | Everything the admin UI shows                                            | Agent-api        |
| `GET`    | `/api/v1/agent-api/effort`                                  | `bearerAuth`               | The reasoning-effort levels this agent's LLM configuration offers        | Agent-api        |
| `POST`   | `/api/v1/agent-api/media`                                   | `bearerAuth`               | Upload a file for this agent                                             | Agent-api        |
| `GET`    | `/api/v1/agent-api/media/{mediaId}`                         | `bearerAuth`               | Fetch a media asset this agent produced                                  | Agent-api        |
| `POST`   | `/api/v1/agent-api/transcribe`                              | `bearerAuth`               | Transcribe an audio asset with this agent's driver                       | Agent-api        |
| `POST`   | `/api/v1/agent-api/transcribe-and-send`                     | `bearerAuth`               | Transcribe an audio asset and send the transcript to this agent          | Agent-api        |
| `GET`    | `/api/v1/agent-templates`                                   | `cookieAuth`               | Index AgentTemplate                                                      | Agent-templates  |
| `GET`    | `/api/v1/agent-templates/{id}`                              | `cookieAuth`               | Show AgentTemplate                                                       | Agent-templates  |
| `POST`   | `/api/v1/agent-templates/import`                            | `cookieAuth` + `csrfToken` | Import AgentTemplate                                                     | Agent-templates  |
| `POST`   | `/api/v1/agent-templates/validate`                          | `cookieAuth` + `csrfToken` | ValidatePayload AgentTemplate                                            | Agent-templates  |
| `GET`    | `/api/v1/agents`                                            | `cookieAuth`               | Index Agent                                                              | Agents           |
| `POST`   | `/api/v1/agents`                                            | `cookieAuth` + `csrfToken` | Store Agent                                                              | Agents           |
| `GET`    | `/api/v1/agents/{agentId}/api-keys`                         | `cookieAuth`               | List an agent's API keys                                                 | Agents           |
| `POST`   | `/api/v1/agents/{agentId}/api-keys`                         | `cookieAuth` + `csrfToken` | Mint an API key                                                          | Agents           |
| `DELETE` | `/api/v1/agents/{agentId}/api-keys/{keyId}`                 | `cookieAuth` + `csrfToken` | Revoke an API key                                                        | Agents           |
| `GET`    | `/api/v1/agents/{id}`                                       | `cookieAuth`               | Show Agent                                                               | Agents           |
| `PATCH`  | `/api/v1/agents/{id}`                                       | `cookieAuth` + `csrfToken` | Update Agent                                                             | Agents           |
| `DELETE` | `/api/v1/agents/{id}`                                       | `cookieAuth` + `csrfToken` | Destroy Agent                                                            | Agents           |
| `GET`    | `/api/v1/agents/{id}/effort`                                | `cookieAuth`               | The reasoning-effort levels this agent can use                           | Agents           |
| `GET`    | `/api/v1/agents/{id}/export`                                | `cookieAuth`               | ExportAgent AgentTemplate                                                | Agents           |
| `POST`   | `/api/v1/agents/{id}/favorite`                              | `cookieAuth` + `csrfToken` | Favorite Agent                                                           | Agents           |
| `DELETE` | `/api/v1/agents/{id}/favorite`                              | `cookieAuth` + `csrfToken` | Unfavorite Agent                                                         | Agents           |
| `POST`   | `/api/v1/agents/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | UploadImage AgentPicture                                                 | Agents           |
| `DELETE` | `/api/v1/agents/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | DeleteImage AgentPicture                                                 | Agents           |
| `GET`    | `/api/v1/agents/{id}/scheduled-runs`                        | `cookieAuth`               | Index ScheduledRun                                                       | Agents           |
| `POST`   | `/api/v1/agents/{id}/scheduled-runs`                        | `cookieAuth` + `csrfToken` | Store ScheduledRun                                                       | Agents           |
| `GET`    | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth`               | Show ScheduledRun                                                        | Agents           |
| `PUT`    | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth` + `csrfToken` | Update ScheduledRun                                                      | Agents           |
| `DELETE` | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth` + `csrfToken` | Destroy ScheduledRun                                                     | Agents           |
| `POST`   | `/api/v1/agents/{id}/scheduled-runs/{runId}/trigger`        | `cookieAuth` + `csrfToken` | Trigger ScheduledRun                                                     | Agents           |
| `GET`    | `/api/v1/agents/{id}/templates`                             | `cookieAuth`               | Index PromptTemplate                                                     | Agents           |
| `POST`   | `/api/v1/agents/{id}/templates`                             | `cookieAuth` + `csrfToken` | Store PromptTemplate                                                     | Agents           |
| `GET`    | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth`               | Show PromptTemplate                                                      | Agents           |
| `PUT`    | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth` + `csrfToken` | Update PromptTemplate                                                    | Agents           |
| `DELETE` | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth` + `csrfToken` | Destroy PromptTemplate                                                   | Agents           |
| `POST`   | `/api/v1/agents/{id}/tools/{toolId}/enable`                 | `cookieAuth` + `csrfToken` | EnableTool AgentTool                                                     | Agents           |
| `DELETE` | `/api/v1/agents/{id}/tools/{toolId}/enable`                 | `cookieAuth` + `csrfToken` | DisableTool AgentTool                                                    | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/operations/{operation}` | `cookieAuth`               | GetOperationOverride AgentOverride                                       | Agents           |
| `PATCH`  | `/api/v1/agents/{id}/tools/{toolId}/operations/{operation}` | `cookieAuth` + `csrfToken` | PatchOperationOverride AgentOverride                                     | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth`               | GetOverride AgentOverride                                                | Agents           |
| `PUT`    | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth` + `csrfToken` | PutOverride AgentOverride                                                | Agents           |
| `DELETE` | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth` + `csrfToken` | DeleteOverride AgentOverride                                             | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/status`                 | `cookieAuth`               | GetToolStatus AgentTool                                                  | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/operations`                      | `cookieAuth`               | GetToolsOperations AgentTool                                             | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/status`                          | `cookieAuth`               | GetToolsStatus AgentTool                                                 | Agents           |
| `POST`   | `/api/v1/agents/{id}/transfer`                              | `cookieAuth` + `csrfToken` | TransferPrincipal AgentTransfer                                          | Agents           |
| `GET`    | `/api/v1/apps`                                              | `cookieAuth`               | Index Apps                                                               | Apps             |
| `GET`    | `/api/v1/assets/{filename}`                                 | `cookieAuth`               | Show Asset                                                               | Assets           |
| `PATCH`  | `/api/v1/auth/account`                                      | `cookieAuth` + `csrfToken` | Account Auth                                                             | Auth             |
| `POST`   | `/api/v1/auth/email/change-request`                         | `cookieAuth` + `csrfToken` | RequestEmailChange Auth                                                  | Auth             |
| `POST`   | `/api/v1/auth/email/confirm`                                | —                          | ConfirmEmailChange Auth                                                  | Auth             |
| `POST`   | `/api/v1/auth/forgot-password`                              | —                          | ForgotPassword Auth                                                      | Auth             |
| `POST`   | `/api/v1/auth/login`                                        | —                          | Login Auth                                                               | Auth             |
| `POST`   | `/api/v1/auth/logout`                                       | `cookieAuth` + `csrfToken` | Logout Auth                                                              | Auth             |
| `GET`    | `/api/v1/auth/me`                                           | `cookieAuth`               | Me Auth                                                                  | Auth             |
| `PATCH`  | `/api/v1/auth/password`                                     | `cookieAuth` + `csrfToken` | Password Auth                                                            | Auth             |
| `POST`   | `/api/v1/auth/register`                                     | —                          | Register Auth                                                            | Auth             |
| `POST`   | `/api/v1/auth/reset-password`                               | —                          | ResetPassword Auth                                                       | Auth             |
| `POST`   | `/api/v1/auth/verification/resend`                          | —                          | ResendVerification Auth                                                  | Auth             |
| `GET`    | `/api/v1/auth/verify/{selector}`                            | —                          | Verify Auth                                                              | Auth             |
| `GET`    | `/api/v1/config`                                            | —                          | Index Config                                                             | Config           |
| `GET`    | `/api/v1/global-api-keys`                                   | `cookieAuth`               | List the global API keys                                                 | Global-api       |
| `POST`   | `/api/v1/global-api-keys`                                   | `cookieAuth` + `csrfToken` | Mint a global API key                                                    | Global-api       |
| `DELETE` | `/api/v1/global-api-keys/{keyId}`                           | `cookieAuth` + `csrfToken` | Revoke a global API key                                                  | Global-api       |
| `GET`    | `/api/v1/global-api/agents`                                 | `bearerAuth`               | List the agents this key may reach                                       | Global-api       |
| `POST`   | `/api/v1/global-api/agents`                                 | `bearerAuth`               | Create an agent from the import format                                   | Global-api       |
| `GET`    | `/api/v1/global-api/agents/{agentId}`                       | `bearerAuth`               | Read an agent in the import format                                       | Global-api       |
| `PATCH`  | `/api/v1/global-api/agents/{agentId}`                       | `bearerAuth`               | Update an agent from the import format                                   | Global-api       |
| `DELETE` | `/api/v1/global-api/agents/{agentId}`                       | `bearerAuth`               | Delete an agent                                                          | Global-api       |
| `GET`    | `/api/v1/global-api/agents/{agentId}/effort`                | `bearerAuth`               | The reasoning-effort levels an agent's LLM configuration offers          | Global-api       |
| `GET`    | `/api/v1/global-api/chats`                                  | `bearerAuth`               | List the chats this key may reach                                        | Global-api       |
| `POST`   | `/api/v1/global-api/chats`                                  | `bearerAuth`               | Start a chat with one of the agents this key reaches                     | Global-api       |
| `POST`   | `/api/v1/global-api/chats/{chatId}/answer`                  | `bearerAuth`               | Answer the agent's question                                              | Global-api       |
| `POST`   | `/api/v1/global-api/chats/{chatId}/approve`                 | `bearerAuth`               | Approve pending tool calls                                               | Global-api       |
| `GET`    | `/api/v1/global-api/chats/{chatId}/messages`                | `bearerAuth`               | User messages and answers only                                           | Global-api       |
| `POST`   | `/api/v1/global-api/chats/{chatId}/messages`                | `bearerAuth`               | Continue a chat                                                          | Global-api       |
| `POST`   | `/api/v1/global-api/chats/{chatId}/reject`                  | `bearerAuth`               | Reject pending tool calls                                                | Global-api       |
| `GET`    | `/api/v1/global-api/chats/{chatId}/status`                  | `bearerAuth`               | Status and final answer                                                  | Global-api       |
| `GET`    | `/api/v1/global-api/chats/{chatId}/transcript`              | `bearerAuth`               | Everything the admin UI shows                                            | Global-api       |
| `GET`    | `/api/v1/global-api/groups`                                 | `bearerAuth`               | List every group                                                         | Global-api       |
| `POST`   | `/api/v1/global-api/groups`                                 | `bearerAuth`               | Create a group                                                           | Global-api       |
| `GET`    | `/api/v1/global-api/groups/{groupId}`                       | `bearerAuth`               | Read a group                                                             | Global-api       |
| `PATCH`  | `/api/v1/global-api/groups/{groupId}`                       | `bearerAuth`               | Update a group                                                           | Global-api       |
| `DELETE` | `/api/v1/global-api/groups/{groupId}`                       | `bearerAuth`               | Delete a group                                                           | Global-api       |
| `POST`   | `/api/v1/global-api/media`                                  | `bearerAuth`               | Upload a file for one of the agents this key reaches                     | Global-api       |
| `GET`    | `/api/v1/global-api/media/{mediaId}`                        | `bearerAuth`               | Fetch a media asset this key may read                                    | Global-api       |
| `GET`    | `/api/v1/group-api/agents`                                  | `bearerAuth`               | List the agents this key may reach                                       | Group-api        |
| `POST`   | `/api/v1/group-api/agents`                                  | `bearerAuth`               | Create an agent from the import format                                   | Group-api        |
| `GET`    | `/api/v1/group-api/agents/{agentId}`                        | `bearerAuth`               | Read an agent in the import format                                       | Group-api        |
| `PATCH`  | `/api/v1/group-api/agents/{agentId}`                        | `bearerAuth`               | Update an agent from the import format                                   | Group-api        |
| `DELETE` | `/api/v1/group-api/agents/{agentId}`                        | `bearerAuth`               | Delete an agent                                                          | Group-api        |
| `GET`    | `/api/v1/group-api/agents/{agentId}/effort`                 | `bearerAuth`               | The reasoning-effort levels an agent's LLM configuration offers          | Group-api        |
| `GET`    | `/api/v1/group-api/chats`                                   | `bearerAuth`               | List the chats this key may reach                                        | Group-api        |
| `POST`   | `/api/v1/group-api/chats`                                   | `bearerAuth`               | Start a chat with one of the agents this key reaches                     | Group-api        |
| `POST`   | `/api/v1/group-api/chats/{chatId}/answer`                   | `bearerAuth`               | Answer the agent's question                                              | Group-api        |
| `POST`   | `/api/v1/group-api/chats/{chatId}/approve`                  | `bearerAuth`               | Approve pending tool calls                                               | Group-api        |
| `GET`    | `/api/v1/group-api/chats/{chatId}/messages`                 | `bearerAuth`               | User messages and answers only                                           | Group-api        |
| `POST`   | `/api/v1/group-api/chats/{chatId}/messages`                 | `bearerAuth`               | Continue a chat                                                          | Group-api        |
| `POST`   | `/api/v1/group-api/chats/{chatId}/reject`                   | `bearerAuth`               | Reject pending tool calls                                                | Group-api        |
| `GET`    | `/api/v1/group-api/chats/{chatId}/status`                   | `bearerAuth`               | Status and final answer                                                  | Group-api        |
| `GET`    | `/api/v1/group-api/chats/{chatId}/transcript`               | `bearerAuth`               | Everything the admin UI shows                                            | Group-api        |
| `GET`    | `/api/v1/group-api/group`                                   | `bearerAuth`               | The group this key belongs to                                            | Group-api        |
| `POST`   | `/api/v1/group-api/media`                                   | `bearerAuth`               | Upload a file for one of the agents this key reaches                     | Group-api        |
| `GET`    | `/api/v1/group-api/media/{mediaId}`                         | `bearerAuth`               | Fetch a media asset this key may read                                    | Group-api        |
| `GET`    | `/api/v1/groups`                                            | `cookieAuth`               | Index Group                                                              | Groups           |
| `POST`   | `/api/v1/groups`                                            | `cookieAuth` + `csrfToken` | Store Group                                                              | Groups           |
| `GET`    | `/api/v1/groups/{groupId}/api-keys`                         | `cookieAuth`               | List a group's API keys                                                  | Groups           |
| `POST`   | `/api/v1/groups/{groupId}/api-keys`                         | `cookieAuth` + `csrfToken` | Mint a group API key                                                     | Groups           |
| `DELETE` | `/api/v1/groups/{groupId}/api-keys/{keyId}`                 | `cookieAuth` + `csrfToken` | Revoke a group API key                                                   | Groups           |
| `GET`    | `/api/v1/groups/{id}`                                       | `cookieAuth`               | Show Group                                                               | Groups           |
| `PATCH`  | `/api/v1/groups/{id}`                                       | `cookieAuth` + `csrfToken` | Update Group                                                             | Groups           |
| `DELETE` | `/api/v1/groups/{id}`                                       | `cookieAuth` + `csrfToken` | Destroy Group                                                            | Groups           |
| `GET`    | `/api/v1/groups/{id}/agents`                                | `cookieAuth`               | Agents Group                                                             | Groups           |
| `GET`    | `/api/v1/groups/{id}/llm-configs`                           | `cookieAuth`               | Index GroupLlmConfigs                                                    | Groups           |
| `POST`   | `/api/v1/groups/{id}/llm-configs`                           | `cookieAuth` + `csrfToken` | Store GroupLlmConfigs                                                    | Groups           |
| `PATCH`  | `/api/v1/groups/{id}/llm-configs/{cid}`                     | `cookieAuth` + `csrfToken` | Update GroupLlmConfigs                                                   | Groups           |
| `DELETE` | `/api/v1/groups/{id}/llm-configs/{cid}`                     | `cookieAuth` + `csrfToken` | Destroy GroupLlmConfigs                                                  | Groups           |
| `POST`   | `/api/v1/groups/{id}/llm-configs/{cid}/set-default`         | `cookieAuth` + `csrfToken` | SetDefault GroupLlmConfigs                                               | Groups           |
| `GET`    | `/api/v1/groups/{id}/locations`                             | `cookieAuth`               | List a group's saved locations                                           | Groups           |
| `POST`   | `/api/v1/groups/{id}/locations`                             | `cookieAuth` + `csrfToken` | Save a location for a group                                              | Groups           |
| `PATCH`  | `/api/v1/groups/{id}/locations/{locationId}`                | `cookieAuth` + `csrfToken` | Edit one of a group's saved locations                                    | Groups           |
| `DELETE` | `/api/v1/groups/{id}/locations/{locationId}`                | `cookieAuth` + `csrfToken` | Delete one of a group's saved locations                                  | Groups           |
| `GET`    | `/api/v1/groups/{id}/members`                               | `cookieAuth`               | Index GroupMember                                                        | Groups           |
| `POST`   | `/api/v1/groups/{id}/members`                               | `cookieAuth` + `csrfToken` | Store GroupMember                                                        | Groups           |
| `PATCH`  | `/api/v1/groups/{id}/members/{uid}`                         | `cookieAuth` + `csrfToken` | Update GroupMember                                                       | Groups           |
| `DELETE` | `/api/v1/groups/{id}/members/{uid}`                         | `cookieAuth` + `csrfToken` | Destroy GroupMember                                                      | Groups           |
| `POST`   | `/api/v1/groups/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | UploadImage GroupPicture                                                 | Groups           |
| `DELETE` | `/api/v1/groups/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | DeleteImage GroupPicture                                                 | Groups           |
| `GET`    | `/api/v1/groups/{id}/preferences`                           | `cookieAuth`               | Show GroupPreferences                                                    | Groups           |
| `PUT`    | `/api/v1/groups/{id}/preferences`                           | `cookieAuth` + `csrfToken` | Update GroupPreferences                                                  | Groups           |
| `GET`    | `/api/v1/groups/{id}/tools`                                 | `cookieAuth`               | Index GroupTools                                                         | Groups           |
| `POST`   | `/api/v1/groups/{id}/tools/{toolClass}`                     | `cookieAuth` + `csrfToken` | Upsert GroupTools                                                        | Groups           |
| `DELETE` | `/api/v1/groups/{id}/tools/{toolClass}`                     | `cookieAuth` + `csrfToken` | Destroy GroupTools                                                       | Groups           |
| `GET`    | `/api/v1/llm-configs`                                       | `cookieAuth`               | Index LLMConfig                                                          | Llm-configs      |
| `POST`   | `/api/v1/llm-configs`                                       | `cookieAuth` + `csrfToken` | Store LLMConfig                                                          | Llm-configs      |
| `GET`    | `/api/v1/llm-configs/{id}`                                  | `cookieAuth`               | Show LLMConfig                                                           | Llm-configs      |
| `PUT`    | `/api/v1/llm-configs/{id}`                                  | `cookieAuth` + `csrfToken` | Update LLMConfig                                                         | Llm-configs      |
| `DELETE` | `/api/v1/llm-configs/{id}`                                  | `cookieAuth` + `csrfToken` | Destroy LLMConfig                                                        | Llm-configs      |
| `POST`   | `/api/v1/llm-configs/{id}/set-default`                      | `cookieAuth` + `csrfToken` | SetDefault LLMConfig                                                     | Llm-configs      |
| `GET`    | `/api/v1/llm-configs/global`                                | `cookieAuth`               | GlobalConfigs LLMConfig                                                  | Llm-configs      |
| `GET`    | `/api/v1/llm-drivers`                                       | `cookieAuth`               | Drivers LLMConfig                                                        | Llm-drivers      |
| `GET`    | `/api/v1/mail-config`                                       | `cookieAuth`               | Index MailConfig                                                         | Mail-config      |
| `PUT`    | `/api/v1/mail-config`                                       | `cookieAuth` + `csrfToken` | Update MailConfig                                                        | Mail-config      |
| `POST`   | `/api/v1/mail-config/test`                                  | `cookieAuth` + `csrfToken` | Test MailConfig                                                          | Mail-config      |
| `GET`    | `/api/v1/mail-templates`                                    | `cookieAuth`               | Index MailTemplate                                                       | Mail-templates   |
| `POST`   | `/api/v1/mail-templates`                                    | `cookieAuth` + `csrfToken` | Store MailTemplate                                                       | Mail-templates   |
| `GET`    | `/api/v1/mail-templates/{id}`                               | `cookieAuth`               | Show MailTemplate                                                        | Mail-templates   |
| `PUT`    | `/api/v1/mail-templates/{id}`                               | `cookieAuth` + `csrfToken` | Update MailTemplate                                                      | Mail-templates   |
| `DELETE` | `/api/v1/mail-templates/{id}`                               | `cookieAuth` + `csrfToken` | Destroy MailTemplate                                                     | Mail-templates   |
| `GET`    | `/api/v1/mail-templates/{name}/preview`                     | `cookieAuth`               | Preview MailTemplate                                                     | Mail-templates   |
| `GET`    | `/api/v1/me/locations`                                      | `cookieAuth`               | GetLocations UserProfile                                                 | Me               |
| `POST`   | `/api/v1/me/locations`                                      | `cookieAuth` + `csrfToken` | PostLocation UserProfile                                                 | Me               |
| `PUT`    | `/api/v1/me/locations/{id}`                                 | `cookieAuth` + `csrfToken` | PutLocation UserProfile                                                  | Me               |
| `DELETE` | `/api/v1/me/locations/{id}`                                 | `cookieAuth` + `csrfToken` | DeleteLocation UserProfile                                               | Me               |
| `GET`    | `/api/v1/me/picture`                                        | `cookieAuth`               | Show UserPicture                                                         | Me               |
| `POST`   | `/api/v1/me/picture/image`                                  | `cookieAuth` + `csrfToken` | UploadImage UserPicture                                                  | Me               |
| `DELETE` | `/api/v1/me/picture/image`                                  | `cookieAuth` + `csrfToken` | DeleteImage UserPicture                                                  | Me               |
| `GET`    | `/api/v1/me/profile`                                        | `cookieAuth`               | GetProfile UserProfile                                                   | Me               |
| `PUT`    | `/api/v1/me/profile`                                        | `cookieAuth` + `csrfToken` | PutProfile UserProfile                                                   | Me               |
| `GET`    | `/api/v1/media`                                             | `cookieAuth`               | Index MediaArchive                                                       | Media            |
| `POST`   | `/api/v1/media`                                             | `cookieAuth` + `csrfToken` | Store MediaUpload                                                        | Media            |
| `POST`   | `/api/v1/media/{id}/derivatives`                            | `cookieAuth` + `csrfToken` | Create MediaDerivative                                                   | Media            |
| `GET`    | `/api/v1/media/{id}/derivatives/options`                    | `cookieAuth`               | Index MediaDerivativeOptions                                             | Media            |
| `GET`    | `/api/v1/media/{id}/embed`                                  | `cookieAuth`               | Fetch a media asset as live, embeddable content                          | Media            |
| `POST`   | `/api/v1/media/{id}/keep`                                   | `cookieAuth` + `csrfToken` | Keep KeepMedia                                                           | Media            |
| `GET`    | `/api/v1/media/allowed-types`                               | `cookieAuth`               | Index MediaAllowedTypes                                                  | Media            |
| `GET`    | `/api/v1/media/folders`                                     | `cookieAuth`               | Index MediaFolder                                                        | Media            |
| `POST`   | `/api/v1/media/folders`                                     | `cookieAuth` + `csrfToken` | Store MediaFolder                                                        | Media            |
| `PATCH`  | `/api/v1/media/folders/{id}`                                | `cookieAuth` + `csrfToken` | Update MediaFolder                                                       | Media            |
| `DELETE` | `/api/v1/media/folders/{id}`                                | `cookieAuth` + `csrfToken` | Destroy MediaFolder                                                      | Media            |
| `POST`   | `/api/v1/media/resolve`                                     | `cookieAuth` + `csrfToken` | Resolve MediaResolve                                                     | Media            |
| `GET`    | `/api/v1/notifications`                                     | `cookieAuth`               | Index Notification                                                       | Notifications    |
| `DELETE` | `/api/v1/notifications`                                     | `cookieAuth` + `csrfToken` | DestroyAll Notification                                                  | Notifications    |
| `DELETE` | `/api/v1/notifications/{id}`                                | `cookieAuth` + `csrfToken` | Destroy Notification                                                     | Notifications    |
| `POST`   | `/api/v1/notifications/{id}/read`                           | `cookieAuth` + `csrfToken` | MarkRead Notification                                                    | Notifications    |
| `POST`   | `/api/v1/notifications/read-all`                            | `cookieAuth` + `csrfToken` | MarkAllRead Notification                                                 | Notifications    |
| `GET`    | `/api/v1/notifications/subscriptions`                       | `cookieAuth`               | Index NotificationSubscription                                           | Notifications    |
| `POST`   | `/api/v1/notifications/subscriptions`                       | `cookieAuth` + `csrfToken` | Subscribe NotificationSubscription                                       | Notifications    |
| `DELETE` | `/api/v1/notifications/subscriptions`                       | `cookieAuth` + `csrfToken` | Unsubscribe NotificationSubscription                                     | Notifications    |
| `GET`    | `/api/v1/plugins`                                           | `cookieAuth`               | Index Plugins                                                            | Plugins          |
| `POST`   | `/api/v1/plugins`                                           | `cookieAuth` + `csrfToken` | Store Plugins                                                            | Plugins          |
| `PATCH`  | `/api/v1/plugins/{package}`                                 | `cookieAuth` + `csrfToken` | Update Plugins                                                           | Plugins          |
| `DELETE` | `/api/v1/plugins/{package}`                                 | `cookieAuth` + `csrfToken` | Destroy Plugins                                                          | Plugins          |
| `GET`    | `/api/v1/plugins/catalog`                                   | `cookieAuth`               | Catalog Plugins                                                          | Plugins          |
| `GET`    | `/api/v1/principals/me`                                     | `cookieAuth`               | CurrentForUser Principal                                                 | Principals       |
| `GET`    | `/api/v1/public/media/{id}`                                 | —                          | Show PublicMedia                                                         | Public           |
| `GET`    | `/api/v1/search`                                            | `cookieAuth`               | Index Search                                                             | Search           |
| `GET`    | `/api/v1/skills`                                            | `cookieAuth`               | Index Skill                                                              | Skills           |
| `GET`    | `/api/v1/skills/{slug}`                                     | `cookieAuth`               | Show Skill                                                               | Skills           |
| `GET`    | `/api/v1/skills/{slug}/files/{path}`                        | `cookieAuth`               | File Skill                                                               | Skills           |
| `GET`    | `/api/v1/speech/capability`                                 | `cookieAuth`               | Speech-to-text provider capability                                       | Speech           |
| `GET`    | `/api/v1/speech/preference`                                 | `cookieAuth`               | Read the caller's preferred speech-to-text provider                      | Speech           |
| `PUT`    | `/api/v1/speech/preference`                                 | `cookieAuth` + `csrfToken` | Set or clear the caller's preferred speech-to-text configuration         | Speech           |
| `GET`    | `/api/v1/speech/provider-configs`                           | `cookieAuth`               | List speech provider configurations visible to the caller                | Speech           |
| `POST`   | `/api/v1/speech/provider-configs`                           | `cookieAuth` + `csrfToken` | Create a speech provider configuration                                   | Speech           |
| `PUT`    | `/api/v1/speech/provider-configs/{id}`                      | `cookieAuth` + `csrfToken` | Update an existing speech provider configuration                         | Speech           |
| `DELETE` | `/api/v1/speech/provider-configs/{id}`                      | `cookieAuth` + `csrfToken` | Delete a speech provider configuration                                   | Speech           |
| `POST`   | `/api/v1/speech/provider-configs/{id}/set-default`          | `cookieAuth` + `csrfToken` | Mark a global speech provider configuration as default                   | Speech           |
| `GET`    | `/api/v1/speech/provider-configs/schema`                    | `cookieAuth`               | Registered speech-to-text provider classes with their settings schemas   | Speech           |
| `POST`   | `/api/v1/speech/transcribe`                                 | `cookieAuth` + `csrfToken` | Transcribe a recorded audio asset                                        | Speech           |
| `GET`    | `/api/v1/sse/auth`                                          | `cookieAuth`               | Auth Sse                                                                 | Sse              |
| `GET`    | `/api/v1/sse/authorize`                                     | `cookieAuth`               | Authorize Sse                                                            | Sse              |
| `GET`    | `/api/v1/sse/status`                                        | `cookieAuth`               | Status Sse                                                               | Sse              |
| `GET`    | `/api/v1/tasks`                                             | `cookieAuth`               | Index Task                                                               | Tasks            |
| `POST`   | `/api/v1/tasks`                                             | `cookieAuth` + `csrfToken` | Store Task                                                               | Tasks            |
| `GET`    | `/api/v1/tasks/{taskId}`                                    | `cookieAuth`               | Show Task                                                                | Tasks            |
| `DELETE` | `/api/v1/tasks/{taskId}`                                    | `cookieAuth` + `csrfToken` | Destroy Task                                                             | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/abort`                              | `cookieAuth` + `csrfToken` | Abort Task                                                               | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/abort-sub-agent`                    | `cookieAuth` + `csrfToken` | Abort sub-agent and cascade-up                                           | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/answer`                             | `cookieAuth` + `csrfToken` | Answer pending question batch                                            | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/approve`                            | `cookieAuth` + `csrfToken` | Approve Task                                                             | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/compact`                            | `cookieAuth` + `csrfToken` | Compact Task History                                                     | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/continue`                           | `cookieAuth` + `csrfToken` | Continue Task                                                            | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/reject`                             | `cookieAuth` + `csrfToken` | Reject Task                                                              | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/retry`                              | `cookieAuth` + `csrfToken` | Retry Task                                                               | Tasks            |
| `DELETE` | `/api/v1/tasks/{taskId}/retry-chain`                        | `cookieAuth` + `csrfToken` | CancelRetryChain RetryChain                                              | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/tick`                               | `cookieAuth` + `csrfToken` | Tick a task (client-worker mode only)                                    | Tasks            |
| `GET`    | `/api/v1/tools`                                             | `cookieAuth`               | Index Tool                                                               | Tools            |
| `GET`    | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth`               | GetSettings Tool                                                         | Tools            |
| `PUT`    | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth` + `csrfToken` | PutSettings Tool                                                         | Tools            |
| `DELETE` | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth` + `csrfToken` | DeleteSettings Tool                                                      | Tools            |
| `GET`    | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth`               | GetUserSettings Tool                                                     | Tools            |
| `PUT`    | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth` + `csrfToken` | PutUserSettings Tool                                                     | Tools            |
| `DELETE` | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth` + `csrfToken` | DeleteUserSettings Tool                                                  | Tools            |
| `GET`    | `/api/v1/user-preferences/llm`                              | `cookieAuth`               | Show UserPreference                                                      | User-preferences |
| `PUT`    | `/api/v1/user-preferences/llm`                              | `cookieAuth` + `csrfToken` | Update UserPreference                                                    | User-preferences |
| `GET`    | `/api/v1/user-preferences/locale`                           | `cookieAuth`               | Show UserLocale                                                          | User-preferences |
| `PUT`    | `/api/v1/user-preferences/locale`                           | `cookieAuth` + `csrfToken` | Update UserLocale                                                        | User-preferences |
| `GET`    | `/api/v1/users`                                             | `cookieAuth`               | Index User                                                               | Users            |
| `POST`   | `/api/v1/users`                                             | `cookieAuth` + `csrfToken` | Store User                                                               | Users            |
| `GET`    | `/api/v1/users/{id}`                                        | `cookieAuth`               | Show User                                                                | Users            |
| `PUT`    | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Update User                                                              | Users            |
| `PATCH`  | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Update User                                                              | Users            |
| `DELETE` | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Destroy User                                                             | Users            |
| `GET`    | `/api/v1/users/{id}/picture`                                | `cookieAuth`               | Show UserPictureAsset                                                    | Users            |
| `GET`    | `/api/v1/users/{id}/roles`                                  | `cookieAuth`               | ListRoles User                                                           | Users            |
| `POST`   | `/api/v1/users/{id}/roles`                                  | `cookieAuth` + `csrfToken` | GrantRole User                                                           | Users            |
| `DELETE` | `/api/v1/users/{id}/roles/{role}`                           | `cookieAuth` + `csrfToken` | RevokeRole User                                                          | Users            |
| `POST`   | `/api/v1/worker/housekeeping`                               | `cookieAuth` + `csrfToken` | Housekeeping Worker                                                      | Worker           |

<!-- API:GENERATED:END -->
