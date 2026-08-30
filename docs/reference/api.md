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

> To send a message to an agent, create a task via `POST /api/v1/tasks` — there's no `/chat` sub-resource. The agent picks up the task and processes it asynchronously.

#### Agent listing filter (`?principal_id=`)

`GET /api/v1/agents` accepts a repeatable `principal_id` query parameter (`?principal_id=1`, `?principal_id=1&principal_id=2`, or `?principal_id[]=1&principal_id[]=2`). Values are intersected with `PrincipalResolver::visiblePrincipalIds()` — out-of-scope ids are silently dropped so a caller cannot probe principal existence. Omitted filter = every visible agent.

#### Agent create body — `principal_id`

`POST /api/v1/agents` accepts an optional `principal_id` in the body. The caller must be admin OR control the target principal (`AgentPrincipalService::callerControlsPrincipal`); otherwise the request falls back to the caller's own user-principal. Use this when an admin wants to spawn an agent directly under a group without first creating a user-principal route.

#### Transfer authorisation

`POST /api/v1/agents/{id}/transfer` re-keys the agent's `principal_id`. Caller must control both source and target (admin/owner of source AND admin/owner of target, OR owner of target when the target is the caller's own user-principal). Admins skip the source side of the gate. `403 FORBIDDEN` on `UnauthorizedTransferException`; `404 NOT_FOUND` when the target principal doesn't exist.

### Groups

| Method   | Path                                                | Auth         | Purpose                                                                      |
| -------- | --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `GET`    | `/api/v1/groups`                                    | session      | List groups (members see their own; admins see every group)                  |
| `POST`   | `/api/v1/groups`                                    | admin + CSRF | Create a group (creator becomes `role: owner`; group-principal materialises) |
| `GET`    | `/api/v1/groups/{id}`                               | session      | Get one group (members only; 404 hides existence)                            |
| `PATCH`  | `/api/v1/groups/{id}`                               | admin + CSRF | Update name / description / `profile_picture`                                |
| `DELETE` | `/api/v1/groups/{id}`                               | admin + CSRF | Delete a group (409 if agents still reference its principal)                 |
| `GET`    | `/api/v1/groups/{id}/members`                       | session      | List members                                                                 |
| `POST`   | `/api/v1/groups/{id}/members`                       | + CSRF       | Add a member (accepts `user_id` OR `email`; admin/owner only)                |
| `PATCH`  | `/api/v1/groups/{id}/members/{uid}`                 | + CSRF       | Change a member's role                                                       |
| `DELETE` | `/api/v1/groups/{id}/members/{uid}`                 | + CSRF       | Remove a member                                                              |
| `GET`    | `/api/v1/groups/{id}/agents`                        | session      | List agents owned by the group's principal                                   |
| `GET`    | `/api/v1/groups/{id}/preferences`                   | session      | Get the group's principal preference                                         |
| `PUT`    | `/api/v1/groups/{id}/preferences`                   | + CSRF       | Upsert the group's principal preference                                      |
| `GET`    | `/api/v1/groups/{id}/tools`                         | session      | List tool settings scoped to the group principal                             |
| `POST`   | `/api/v1/groups/{id}/tools/{toolClass}`             | + CSRF       | Upsert tool settings for the group principal                                 |
| `DELETE` | `/api/v1/groups/{id}/tools/{toolClass}`             | + CSRF       | Delete tool settings for the group principal                                 |
| `GET`    | `/api/v1/groups/{id}/llm-configs`                   | session      | List LLM configs scoped to the group principal                               |
| `POST`   | `/api/v1/groups/{id}/llm-configs`                   | + CSRF       | Create an LLM config under the group principal                               |
| `PATCH`  | `/api/v1/groups/{id}/llm-configs/{cid}`             | + CSRF       | Update an LLM config under the group principal                               |
| `DELETE` | `/api/v1/groups/{id}/llm-configs/{cid}`             | + CSRF       | Delete an LLM config under the group principal                               |
| `POST`   | `/api/v1/groups/{id}/llm-configs/{cid}/set-default` | + CSRF       | Promote an LLM config to default for the group                               |
| `POST`   | `/api/v1/groups/{id}/picture/image`                 | + CSRF       | Multipart avatar upload for the group                                        |
| `DELETE` | `/api/v1/groups/{id}/picture/image`                 | + CSRF       | Clear the group's avatar and reset to default archetype                      |

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

| Field                   | Type                             | Notes                                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | integer                          | Owning agent id.                                                                                                                                                                                                                                                                                  |
| `name`                  | string                           | Display name.                                                                                                                                                                                                                                                                                     |
| `description`           | string \| null                   | Short summary, up to 2000 chars.                                                                                                                                                                                                                                                                  |
| `system_prompt`         | string \| null                   | System prompt (Markdown allowed).                                                                                                                                                                                                                                                                 |
| `llm_driver_config_id`  | integer \| null                  | Bound LLM config; `null` means inherit the global default.                                                                                                                                                                                                                                        |
| `max_steps`             | integer                          | Max LLM turns per task (1-100). Default `10`.                                                                                                                                                                                                                                                     |
| `is_active`             | boolean                          | Whether the agent accepts new tasks.                                                                                                                                                                                                                                                              |
| `allow_followup`        | boolean                          | Whether the agent can be re-engaged in the same task.                                                                                                                                                                                                                                             |
| `retry_after_minutes`   | integer                          | Delay between scheduled retries (≥ 0).                                                                                                                                                                                                                                                            |
| `max_retries`           | integer                          | Max retries per task (≥ 0).                                                                                                                                                                                                                                                                       |
| `is_pinned` **(new)**   | boolean                          | `true` keeps the agent at the top of the dashboard list. Default `false`.                                                                                                                                                                                                                         |
| `is_archived` **(new)** | boolean                          | `true` hides the agent from the default view; row + tasks are retained. Default `false`.                                                                                                                                                                                                          |
| `created_at` **(new)**  | string \| null (ATOM / ISO 8601) | When the agent row was created. `null` for stub/test fixtures.                                                                                                                                                                                                                                    |
| `tools`                 | array                            | See [Tool allowlist](#tool-allowlist-on-an-agent).                                                                                                                                                                                                                                                |
| `icon` **(new)**        | string \| null                   | Resolved icon key for the dashboard's `<Icon>` component (e.g. `'calendar'`, `'mail'`, `'search'`). Server-side 3-layer resolution: the `*Tool` class's `#[Tool(icon: ...)]` argument wins, then the owning plugin's `plugin.json` `icon` field, then `null` (frontend falls back to `'puzzle'`). |

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
and a live-derived `parameter_schema` (from the registered `ToolInterface`
instance or reflection fallback) are all present on both `GET
/api/v1/tasks/{taskId}` and the Mercure live-update stream. See
[Concepts → Tools → Discovery from the LLM](/reference/concepts/tools#discovery-from-the-llm)
for the per-tool LLM-facing contract returned by `AgentTool.get_available_tools`.

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

| Method | Path                    | Auth    | Purpose                                                           |
| ------ | ----------------------- | ------- | ----------------------------------------------------------------- |
| `GET`  | `/api/v1/skills`        | session | List discovered skills (powers the `allowed_skills` multi-select) |
| `GET`  | `/api/v1/skills/{slug}` | session | One skill — full `files` listing + raw `SKILL.md` body            |

Skills are auto-discovered from three sources (project, framework, plugin). See [Concepts → Skills](/reference/concepts/skills).

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

- [Agents](/reference/api/agents) — 30 routes
- [Groups](/reference/api/groups) — 22 routes
- [Auth](/reference/api/auth) — 12 routes
- [Tasks](/reference/api/tasks) — 12 routes
- [Users](/reference/api/users) — 9 routes
- [Llm-configs](/reference/api/llm-configs) — 7 routes
- [Media](/reference/api/media) — 7 routes
- [Tools](/reference/api/tools) — 7 routes
- [Mail-templates](/reference/api/mail-templates) — 6 routes
- [Me](/reference/api/me) — 6 routes
- [Notifications](/reference/api/notifications) — 5 routes
- [Plugins](/reference/api/plugins) — 5 routes
- [Agent-templates](/reference/api/agent-templates) — 4 routes
- [Mail-config](/reference/api/mail-config) — 3 routes
- [Sse](/reference/api/sse) — 3 routes
- [Skills](/reference/api/skills) — 2 routes
- [User-preferences](/reference/api/user-preferences) — 2 routes
- [Apps](/reference/api/apps) — 1 route
- [Assets](/reference/api/assets) — 1 route
- [Config](/reference/api/config) — 1 route
- [Health](/reference/api/health) — 1 route
- [Llm-drivers](/reference/api/llm-drivers) — 1 route
- [Principals](/reference/api/principals) — 1 route
- [Public](/reference/api/public) — 1 route
- [Worker](/reference/api/worker) — 1 route

### Security schemes

| Scheme       | Where  | Key            | Description                                                                                  |
| ------------ | ------ | -------------- | -------------------------------------------------------------------------------------------- |
| `cookieAuth` | cookie | `PHPSESSID`    | Session cookie issued by `delight-im/auth`. Required by `AuthMiddleware`.                    |
| `csrfToken`  | header | `X-CSRF-Token` | CSRF token issued alongside the session. Required by `CsrfMiddleware` on every write method. |

### Endpoints

| Method   | Path                                                        | Auth                       | Purpose                              | Tags             |
| -------- | ----------------------------------------------------------- | -------------------------- | ------------------------------------ | ---------------- |
| `GET`    | `/api/health`                                               | —                          | Check Health                         |                  |
| `GET`    | `/api/v1/agent-templates`                                   | `cookieAuth`               | Index AgentTemplate                  | Agent-templates  |
| `POST`   | `/api/v1/agent-templates/import`                            | `cookieAuth` + `csrfToken` | Import AgentTemplate                 | Agent-templates  |
| `POST`   | `/api/v1/agent-templates/validate`                          | `cookieAuth` + `csrfToken` | ValidatePayload AgentTemplate        | Agent-templates  |
| `GET`    | `/api/v1/agent-templates/{id}`                              | `cookieAuth`               | Show AgentTemplate                   | Agent-templates  |
| `GET`    | `/api/v1/agents`                                            | `cookieAuth`               | Index Agent                          | Agents           |
| `POST`   | `/api/v1/agents`                                            | `cookieAuth` + `csrfToken` | Store Agent                          | Agents           |
| `GET`    | `/api/v1/agents/{id}`                                       | `cookieAuth`               | Show Agent                           | Agents           |
| `PATCH`  | `/api/v1/agents/{id}`                                       | `cookieAuth` + `csrfToken` | Update Agent                         | Agents           |
| `DELETE` | `/api/v1/agents/{id}`                                       | `cookieAuth` + `csrfToken` | Destroy Agent                        | Agents           |
| `GET`    | `/api/v1/agents/{id}/export`                                | `cookieAuth`               | ExportAgent AgentTemplate            | Agents           |
| `POST`   | `/api/v1/agents/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | UploadImage AgentPicture             | Agents           |
| `DELETE` | `/api/v1/agents/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | DeleteImage AgentPicture             | Agents           |
| `GET`    | `/api/v1/agents/{id}/scheduled-runs`                        | `cookieAuth`               | Index ScheduledRun                   | Agents           |
| `POST`   | `/api/v1/agents/{id}/scheduled-runs`                        | `cookieAuth` + `csrfToken` | Store ScheduledRun                   | Agents           |
| `GET`    | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth`               | Show ScheduledRun                    | Agents           |
| `PUT`    | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth` + `csrfToken` | Update ScheduledRun                  | Agents           |
| `DELETE` | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth` + `csrfToken` | Destroy ScheduledRun                 | Agents           |
| `POST`   | `/api/v1/agents/{id}/scheduled-runs/{runId}/trigger`        | `cookieAuth` + `csrfToken` | Trigger ScheduledRun                 | Agents           |
| `GET`    | `/api/v1/agents/{id}/templates`                             | `cookieAuth`               | Index PromptTemplate                 | Agents           |
| `POST`   | `/api/v1/agents/{id}/templates`                             | `cookieAuth` + `csrfToken` | Store PromptTemplate                 | Agents           |
| `GET`    | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth`               | Show PromptTemplate                  | Agents           |
| `PUT`    | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth` + `csrfToken` | Update PromptTemplate                | Agents           |
| `DELETE` | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth` + `csrfToken` | Destroy PromptTemplate               | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/operations`                      | `cookieAuth`               | GetToolsOperations AgentTool         | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/status`                          | `cookieAuth`               | GetToolsStatus AgentTool             | Agents           |
| `POST`   | `/api/v1/agents/{id}/tools/{toolId}/enable`                 | `cookieAuth` + `csrfToken` | EnableTool AgentTool                 | Agents           |
| `DELETE` | `/api/v1/agents/{id}/tools/{toolId}/enable`                 | `cookieAuth` + `csrfToken` | DisableTool AgentTool                | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/operations/{operation}` | `cookieAuth`               | GetOperationOverride AgentOverride   | Agents           |
| `PATCH`  | `/api/v1/agents/{id}/tools/{toolId}/operations/{operation}` | `cookieAuth` + `csrfToken` | PatchOperationOverride AgentOverride | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth`               | GetOverride AgentOverride            | Agents           |
| `PUT`    | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth` + `csrfToken` | PutOverride AgentOverride            | Agents           |
| `DELETE` | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth` + `csrfToken` | DeleteOverride AgentOverride         | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/status`                 | `cookieAuth`               | GetToolStatus AgentTool              | Agents           |
| `POST`   | `/api/v1/agents/{id}/transfer`                              | `cookieAuth` + `csrfToken` | TransferPrincipal AgentTransfer      | Agents           |
| `GET`    | `/api/v1/apps`                                              | `cookieAuth`               | Index Apps                           | Apps             |
| `GET`    | `/api/v1/assets/{filename}`                                 | `cookieAuth`               | Show Asset                           | Assets           |
| `PATCH`  | `/api/v1/auth/account`                                      | `cookieAuth` + `csrfToken` | Account Auth                         | Auth             |
| `POST`   | `/api/v1/auth/email/change-request`                         | `cookieAuth` + `csrfToken` | RequestEmailChange Auth              | Auth             |
| `POST`   | `/api/v1/auth/email/confirm`                                | —                          | ConfirmEmailChange Auth              | Auth             |
| `POST`   | `/api/v1/auth/forgot-password`                              | —                          | ForgotPassword Auth                  | Auth             |
| `POST`   | `/api/v1/auth/login`                                        | —                          | Login Auth                           | Auth             |
| `POST`   | `/api/v1/auth/logout`                                       | `cookieAuth` + `csrfToken` | Logout Auth                          | Auth             |
| `GET`    | `/api/v1/auth/me`                                           | `cookieAuth`               | Me Auth                              | Auth             |
| `PATCH`  | `/api/v1/auth/password`                                     | `cookieAuth` + `csrfToken` | Password Auth                        | Auth             |
| `POST`   | `/api/v1/auth/register`                                     | —                          | Register Auth                        | Auth             |
| `POST`   | `/api/v1/auth/reset-password`                               | —                          | ResetPassword Auth                   | Auth             |
| `POST`   | `/api/v1/auth/verification/resend`                          | —                          | ResendVerification Auth              | Auth             |
| `GET`    | `/api/v1/auth/verify/{selector}`                            | —                          | Verify Auth                          | Auth             |
| `GET`    | `/api/v1/config`                                            | —                          | Index Config                         | Config           |
| `GET`    | `/api/v1/groups`                                            | `cookieAuth`               | Index Group                          | Groups           |
| `POST`   | `/api/v1/groups`                                            | `cookieAuth` + `csrfToken` | Store Group                          | Groups           |
| `GET`    | `/api/v1/groups/{id}`                                       | `cookieAuth`               | Show Group                           | Groups           |
| `PATCH`  | `/api/v1/groups/{id}`                                       | `cookieAuth` + `csrfToken` | Update Group                         | Groups           |
| `DELETE` | `/api/v1/groups/{id}`                                       | `cookieAuth` + `csrfToken` | Destroy Group                        | Groups           |
| `GET`    | `/api/v1/groups/{id}/agents`                                | `cookieAuth`               | Agents Group                         | Groups           |
| `GET`    | `/api/v1/groups/{id}/llm-configs`                           | `cookieAuth`               | Index GroupLlmConfigs                | Groups           |
| `POST`   | `/api/v1/groups/{id}/llm-configs`                           | `cookieAuth` + `csrfToken` | Store GroupLlmConfigs                | Groups           |
| `PATCH`  | `/api/v1/groups/{id}/llm-configs/{cid}`                     | `cookieAuth` + `csrfToken` | Update GroupLlmConfigs               | Groups           |
| `DELETE` | `/api/v1/groups/{id}/llm-configs/{cid}`                     | `cookieAuth` + `csrfToken` | Destroy GroupLlmConfigs              | Groups           |
| `POST`   | `/api/v1/groups/{id}/llm-configs/{cid}/set-default`         | `cookieAuth` + `csrfToken` | SetDefault GroupLlmConfigs           | Groups           |
| `GET`    | `/api/v1/groups/{id}/members`                               | `cookieAuth`               | Index GroupMember                    | Groups           |
| `POST`   | `/api/v1/groups/{id}/members`                               | `cookieAuth` + `csrfToken` | Store GroupMember                    | Groups           |
| `PATCH`  | `/api/v1/groups/{id}/members/{uid}`                         | `cookieAuth` + `csrfToken` | Update GroupMember                   | Groups           |
| `DELETE` | `/api/v1/groups/{id}/members/{uid}`                         | `cookieAuth` + `csrfToken` | Destroy GroupMember                  | Groups           |
| `POST`   | `/api/v1/groups/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | UploadImage GroupPicture             | Groups           |
| `DELETE` | `/api/v1/groups/{id}/picture/image`                         | `cookieAuth` + `csrfToken` | DeleteImage GroupPicture             | Groups           |
| `GET`    | `/api/v1/groups/{id}/preferences`                           | `cookieAuth`               | Show GroupPreferences                | Groups           |
| `PUT`    | `/api/v1/groups/{id}/preferences`                           | `cookieAuth` + `csrfToken` | Update GroupPreferences              | Groups           |
| `GET`    | `/api/v1/groups/{id}/tools`                                 | `cookieAuth`               | Index GroupTools                     | Groups           |
| `POST`   | `/api/v1/groups/{id}/tools/{toolClass}`                     | `cookieAuth` + `csrfToken` | Upsert GroupTools                    | Groups           |
| `DELETE` | `/api/v1/groups/{id}/tools/{toolClass}`                     | `cookieAuth` + `csrfToken` | Destroy GroupTools                   | Groups           |
| `GET`    | `/api/v1/llm-configs`                                       | `cookieAuth`               | Index LLMConfig                      | Llm-configs      |
| `POST`   | `/api/v1/llm-configs`                                       | `cookieAuth` + `csrfToken` | Store LLMConfig                      | Llm-configs      |
| `GET`    | `/api/v1/llm-configs/global`                                | `cookieAuth`               | GlobalConfigs LLMConfig              | Llm-configs      |
| `GET`    | `/api/v1/llm-configs/{id}`                                  | `cookieAuth`               | Show LLMConfig                       | Llm-configs      |
| `PUT`    | `/api/v1/llm-configs/{id}`                                  | `cookieAuth` + `csrfToken` | Update LLMConfig                     | Llm-configs      |
| `DELETE` | `/api/v1/llm-configs/{id}`                                  | `cookieAuth` + `csrfToken` | Destroy LLMConfig                    | Llm-configs      |
| `POST`   | `/api/v1/llm-configs/{id}/set-default`                      | `cookieAuth` + `csrfToken` | SetDefault LLMConfig                 | Llm-configs      |
| `GET`    | `/api/v1/llm-drivers`                                       | `cookieAuth`               | Drivers LLMConfig                    | Llm-drivers      |
| `GET`    | `/api/v1/mail-config`                                       | `cookieAuth`               | Index MailConfig                     | Mail-config      |
| `PUT`    | `/api/v1/mail-config`                                       | `cookieAuth` + `csrfToken` | Update MailConfig                    | Mail-config      |
| `POST`   | `/api/v1/mail-config/test`                                  | `cookieAuth` + `csrfToken` | Test MailConfig                      | Mail-config      |
| `GET`    | `/api/v1/mail-templates`                                    | `cookieAuth`               | Index MailTemplate                   | Mail-templates   |
| `POST`   | `/api/v1/mail-templates`                                    | `cookieAuth` + `csrfToken` | Store MailTemplate                   | Mail-templates   |
| `GET`    | `/api/v1/mail-templates/{id}`                               | `cookieAuth`               | Show MailTemplate                    | Mail-templates   |
| `PUT`    | `/api/v1/mail-templates/{id}`                               | `cookieAuth` + `csrfToken` | Update MailTemplate                  | Mail-templates   |
| `DELETE` | `/api/v1/mail-templates/{id}`                               | `cookieAuth` + `csrfToken` | Destroy MailTemplate                 | Mail-templates   |
| `GET`    | `/api/v1/mail-templates/{name}/preview`                     | `cookieAuth`               | Preview MailTemplate                 | Mail-templates   |
| `GET`    | `/api/v1/me/locations`                                      | `cookieAuth`               | GetLocations UserProfile             | Me               |
| `POST`   | `/api/v1/me/locations`                                      | `cookieAuth` + `csrfToken` | PostLocation UserProfile             | Me               |
| `PUT`    | `/api/v1/me/locations/{id}`                                 | `cookieAuth` + `csrfToken` | PutLocation UserProfile              | Me               |
| `DELETE` | `/api/v1/me/locations/{id}`                                 | `cookieAuth` + `csrfToken` | DeleteLocation UserProfile           | Me               |
| `GET`    | `/api/v1/me/profile`                                        | `cookieAuth`               | GetProfile UserProfile               | Me               |
| `PUT`    | `/api/v1/me/profile`                                        | `cookieAuth` + `csrfToken` | PutProfile UserProfile               | Me               |
| `GET`    | `/api/v1/media`                                             | `cookieAuth`               | Index MediaArchive                   | Media            |
| `POST`   | `/api/v1/media`                                             | `cookieAuth` + `csrfToken` | Store MediaUpload                    | Media            |
| `GET`    | `/api/v1/media/allowed-types`                               | `cookieAuth`               | Index MediaAllowedTypes              | Media            |
| `GET`    | `/api/v1/media/{id}`                                        | `cookieAuth`               | Show MediaArchive                    | Media            |
| `PATCH`  | `/api/v1/media/{id}`                                        | `cookieAuth` + `csrfToken` | Update MediaArchive                  | Media            |
| `DELETE` | `/api/v1/media/{id}`                                        | `cookieAuth` + `csrfToken` | Destroy MediaArchive                 | Media            |
| `POST`   | `/api/v1/media/{id}/public-token/refresh`                   | `cookieAuth` + `csrfToken` | RefreshPublicToken MediaArchive      | Media            |
| `GET`    | `/api/v1/notifications`                                     | `cookieAuth`               | Index Notification                   | Notifications    |
| `DELETE` | `/api/v1/notifications`                                     | `cookieAuth` + `csrfToken` | DestroyAll Notification              | Notifications    |
| `POST`   | `/api/v1/notifications/read-all`                            | `cookieAuth` + `csrfToken` | MarkAllRead Notification             | Notifications    |
| `DELETE` | `/api/v1/notifications/{id}`                                | `cookieAuth` + `csrfToken` | Destroy Notification                 | Notifications    |
| `POST`   | `/api/v1/notifications/{id}/read`                           | `cookieAuth` + `csrfToken` | MarkRead Notification                | Notifications    |
| `GET`    | `/api/v1/plugins`                                           | `cookieAuth`               | Index Plugins                        | Plugins          |
| `POST`   | `/api/v1/plugins`                                           | `cookieAuth` + `csrfToken` | Store Plugins                        | Plugins          |
| `GET`    | `/api/v1/plugins/catalog`                                   | `cookieAuth`               | Catalog Plugins                      | Plugins          |
| `PATCH`  | `/api/v1/plugins/{package}`                                 | `cookieAuth` + `csrfToken` | Update Plugins                       | Plugins          |
| `DELETE` | `/api/v1/plugins/{package}`                                 | `cookieAuth` + `csrfToken` | Destroy Plugins                      | Plugins          |
| `GET`    | `/api/v1/principals/me`                                     | `cookieAuth`               | CurrentForUser Principal             | Principals       |
| `GET`    | `/api/v1/public/media/{id}`                                 | —                          | Show PublicMedia                     | Public           |
| `GET`    | `/api/v1/skills`                                            | `cookieAuth`               | Index Skill                          | Skills           |
| `GET`    | `/api/v1/skills/{slug}`                                     | `cookieAuth`               | Show Skill                           | Skills           |
| `GET`    | `/api/v1/sse/auth`                                          | `cookieAuth`               | Auth Sse                             | Sse              |
| `GET`    | `/api/v1/sse/authorize`                                     | `cookieAuth`               | Authorize Sse                        | Sse              |
| `GET`    | `/api/v1/sse/status`                                        | `cookieAuth`               | Status Sse                           | Sse              |
| `GET`    | `/api/v1/tasks`                                             | `cookieAuth`               | Index Task                           | Tasks            |
| `POST`   | `/api/v1/tasks`                                             | `cookieAuth` + `csrfToken` | Store Task                           | Tasks            |
| `GET`    | `/api/v1/tasks/{taskId}`                                    | `cookieAuth`               | Show Task                            | Tasks            |
| `DELETE` | `/api/v1/tasks/{taskId}`                                    | `cookieAuth` + `csrfToken` | Destroy Task                         | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/abort`                              | `cookieAuth` + `csrfToken` | Abort Task                           | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/abort-sub-agent`                    | `cookieAuth` + `csrfToken` | AbortSubAgent Task                   | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/approve`                            | `cookieAuth` + `csrfToken` | Approve Task                         | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/continue`                           | `cookieAuth` + `csrfToken` | Continue Task                        | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/reject`                             | `cookieAuth` + `csrfToken` | Reject Task                          | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/retry`                              | `cookieAuth` + `csrfToken` | Retry Task                           | Tasks            |
| `DELETE` | `/api/v1/tasks/{taskId}/retry-chain`                        | `cookieAuth` + `csrfToken` | CancelRetryChain RetryChain          | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/tick`                               | `cookieAuth` + `csrfToken` | Tick TaskTick                        | Tasks            |
| `GET`    | `/api/v1/tools`                                             | `cookieAuth`               | Index Tool                           | Tools            |
| `GET`    | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth`               | GetSettings Tool                     | Tools            |
| `PUT`    | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth` + `csrfToken` | PutSettings Tool                     | Tools            |
| `DELETE` | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth` + `csrfToken` | DeleteSettings Tool                  | Tools            |
| `GET`    | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth`               | GetUserSettings Tool                 | Tools            |
| `PUT`    | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth` + `csrfToken` | PutUserSettings Tool                 | Tools            |
| `DELETE` | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth` + `csrfToken` | DeleteUserSettings Tool              | Tools            |
| `GET`    | `/api/v1/user-preferences/llm`                              | `cookieAuth`               | Show UserPreference                  | User-preferences |
| `PUT`    | `/api/v1/user-preferences/llm`                              | `cookieAuth` + `csrfToken` | Update UserPreference                | User-preferences |
| `GET`    | `/api/v1/users`                                             | `cookieAuth`               | Index User                           | Users            |
| `POST`   | `/api/v1/users`                                             | `cookieAuth` + `csrfToken` | Store User                           | Users            |
| `GET`    | `/api/v1/users/{id}`                                        | `cookieAuth`               | Show User                            | Users            |
| `PUT`    | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Update User                          | Users            |
| `PATCH`  | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Update User                          | Users            |
| `DELETE` | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Destroy User                         | Users            |
| `GET`    | `/api/v1/users/{id}/roles`                                  | `cookieAuth`               | ListRoles User                       | Users            |
| `POST`   | `/api/v1/users/{id}/roles`                                  | `cookieAuth` + `csrfToken` | GrantRole User                       | Users            |
| `DELETE` | `/api/v1/users/{id}/roles/{role}`                           | `cookieAuth` + `csrfToken` | RevokeRole User                      | Users            |
| `POST`   | `/api/v1/worker/housekeeping`                               | `cookieAuth` + `csrfToken` | Housekeeping Worker                  | Worker           |

<!-- API:GENERATED:END -->
