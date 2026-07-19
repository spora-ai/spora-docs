---
title: REST API reference
description: Spora's HTTP API — endpoint catalog, request/response envelope, auth stack, error code registry.
---

# REST API reference

Spora exposes a JSON REST API at `/api/v1/`. Most routes require a session cookie (`PHPSESSID`) and a `X-CSRF-Token` header (the value of `data.csrf_token` returned by `GET /api/v1/auth/me`). The unauthenticated exceptions are the pre-auth flows (`/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/email/confirm`, `/auth/verify/{selector}`, `/auth/verification/resend`) and `GET /health`. The plugin install endpoints additionally require admin (`currentUser.isAdmin = true`).

For the canonical, comprehensive reference, see [Concepts → Error handling](/reference/concepts/error-handling) (envelope shape, error code registry, severity mapping) and the per-endpoint docs in [Operations → Day-2 ops](/start/operators/operations) (plugin install API in detail).

## Endpoint summary

The API surface splits into three areas: auth, agents, and tools/plugins. Auth and agents cover the most-used paths. Plugins have a separate write API gated by `SPORA_PLUGIN_INSTALL_ENABLED`.

### Auth

| Method  | Path                                | Auth   | Purpose                                              |
| ------- | ----------------------------------- | ------ | ---------------------------------------------------- |
| `POST`  | `/api/v1/auth/login`                | —      | Authenticate (issues `data.csrf_token`)              |
| `POST`  | `/api/v1/auth/logout`               | + CSRF | End session                                          |
| `GET`   | `/api/v1/auth/me`                   | + CSRF | Current user (returns `data.csrf_token`)             |
| `POST`  | `/api/v1/auth/register`             | —      | Create account (gated by `SPORA_ALLOW_REGISTRATION`) |
| `POST`  | `/api/v1/auth/forgot-password`      | —      | Start password reset flow                            |
| `POST`  | `/api/v1/auth/reset-password`       | —      | Complete password reset                              |
| `PATCH` | `/api/v1/auth/password`             | + CSRF | Change current user's password                       |
| `PATCH` | `/api/v1/auth/account`              | + CSRF | Change current user's account name / email           |
| `POST`  | `/api/v1/auth/email/change-request` | + CSRF | Request an email change (triggers confirmation)      |
| `POST`  | `/api/v1/auth/email/confirm`        | —      | Confirm an email change (verifies the new address)   |
| `GET`   | `/api/v1/auth/verify/{selector}`    | —      | Verify initial signup email (link in the welcome)    |
| `POST`  | `/api/v1/auth/verification/resend`  | —      | Resend the initial signup verification email         |

### Agents

| Method   | Path                  | Auth    | Purpose       |
| -------- | --------------------- | ------- | ------------- |
| `GET`    | `/api/v1/agents`      | session | List agents   |
| `POST`   | `/api/v1/agents`      | + CSRF  | Create agent  |
| `GET`    | `/api/v1/agents/{id}` | session | Get one agent |
| `PATCH`  | `/api/v1/agents/{id}` | + CSRF  | Update agent  |
| `DELETE` | `/api/v1/agents/{id}` | + CSRF  | Delete agent  |

> To send a message to an agent, create a task via `POST /api/v1/tasks` — there's no `/chat` sub-resource. The agent picks up the task and processes it asynchronously.

#### Agent resource

Every `GET` and `PATCH` response (and each entry of `GET /api/v1/agents`) carries an `agent` object with the following wire-format fields. Fields introduced in this release are marked **(new)**.

| Field                   | Type                             | Notes                                                                                    |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`                    | integer                          | Owning agent id.                                                                         |
| `name`                  | string                           | Display name.                                                                            |
| `description`           | string \| null                   | Short summary, up to 2000 chars.                                                         |
| `system_prompt`         | string \| null                   | System prompt (Markdown allowed).                                                        |
| `llm_driver_config_id`  | integer \| null                  | Bound LLM config; `null` means inherit the global default.                               |
| `max_steps`             | integer                          | Max LLM turns per task (1-100). Default `10`.                                            |
| `is_active`             | boolean                          | Whether the agent accepts new tasks.                                                     |
| `allow_followup`        | boolean                          | Whether the agent can be re-engaged in the same task.                                    |
| `retry_after_minutes`   | integer                          | Delay between scheduled retries (≥ 0).                                                   |
| `max_retries`           | integer                          | Max retries per task (≥ 0).                                                              |
| `is_pinned` **(new)**   | boolean                          | `true` keeps the agent at the top of the dashboard list. Default `false`.                |
| `is_archived` **(new)** | boolean                          | `true` hides the agent from the default view; row + tasks are retained. Default `false`. |
| `created_at` **(new)**  | string \| null (ATOM / ISO 8601) | When the agent row was created. `null` for stub/test fixtures.                           |
| `tools`                 | array                            | See [Tool allowlist](#tool-allowlist-on-an-agent).                                       |

`PATCH /api/v1/agents/{id}` accepts any subset of the fields above. `is_pinned` and `is_archived` accept JSON booleans or the strings `"true"` / `"false"` — both are coerced via `FILTER_VALIDATE_BOOLEAN` server-side, so the form layer and curl both work.

> No dedicated HTTP endpoints exist for toggling pin/archive in isolation. To flip just one flag without touching other fields, send a `PATCH` with the single boolean (e.g. `{"is_pinned": true}`).

#### Tool allowlist on an agent

The `tools` array on an agent lists the tool activations for that agent. Each entry has `tool_class`, `tool_name`, and the per-operation `auto_approve` / `enabled` flags. Editing the allowlist is done through the agent's edit form, not via the wire.

### Tasks

| Method   | Path                                 | Auth    | Purpose                                                |
| -------- | ------------------------------------ | ------- | ------------------------------------------------------ |
| `GET`    | `/api/v1/tasks`                      | session | List tasks                                             |
| `POST`   | `/api/v1/tasks`                      | + CSRF  | Create a task (use this to send a message to an agent) |
| `GET`    | `/api/v1/tasks/{taskId}`             | session | Get one task (includes history)                        |
| `POST`   | `/api/v1/tasks/{taskId}/approve`     | + CSRF  | Approve a pending tool call                            |
| `POST`   | `/api/v1/tasks/{taskId}/reject`      | + CSRF  | Reject a pending tool call                             |
| `POST`   | `/api/v1/tasks/{taskId}/retry`       | + CSRF  | Retry a failed task                                    |
| `POST`   | `/api/v1/tasks/{taskId}/continue`    | + CSRF  | Continue a completed/failed task                       |
| `DELETE` | `/api/v1/tasks/{taskId}/retry-chain` | + CSRF  | Cancel a scheduled retry chain                         |
| `DELETE` | `/api/v1/tasks/{taskId}`             | + CSRF  | Delete a task (and cancel if in flight)                |

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

> **Settings are not exported.** Exporting an agent produces a JSON template that includes tool activations and per-operation auto-approve defaults only. Passwords, API keys, and other secrets must be reconfigured in **Settings → Tools** after import. The `inline_warning` field in the export response reminds the caller to communicate this.

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

`GET /health` is the unauthenticated health check used by Docker's `healthcheck` directive and load balancers. Returns `200 OK` if the app is up, regardless of DB state. Returns `503 NOT_CONFIGURED` if the Mercure subsystem is configured but unreachable.

## Versioning

The API is mounted at `/api/v1/`. Breaking changes require a version bump (e.g. `/api/v2/`). Additions within v1 are non-breaking and don't require a version bump — new endpoints, new optional fields, new error codes.

## What's next

- [Concepts → Error handling](/reference/concepts/error-handling) — full error code registry and envelope spec
- [Install API](/develop/plugins/install-api) — the plugin install endpoints in detail
- [Operations → Day-2 ops](/start/operators/operations) — operator-facing workflows

<!-- API:GENERATED:START -->

## Spora API — endpoint catalogue

> This table is generated from `docs/.vuepress/openapi.json`. To refresh, run `npm run gen:api`.

### Security schemes

| Scheme       | Where  | Key            | Description                                                                                  |
| ------------ | ------ | -------------- | -------------------------------------------------------------------------------------------- |
| `cookieAuth` | cookie | `PHPSESSID`    | Session cookie issued by `delight-im/auth`. Required by `AuthMiddleware`.                    |
| `csrfToken`  | header | `X-CSRF-Token` | CSRF token issued alongside the session. Required by `CsrfMiddleware` on every write method. |

### Endpoints

| Method   | Path                                                        | Auth                       | Purpose                              | Tags             |
| -------- | ----------------------------------------------------------- | -------------------------- | ------------------------------------ | ---------------- |
| `GET`    | `/api/health`                                               | —                          | Check Health                         |                  |
| `GET`    | `/api/v1/agent-templates`                                   | `cookieAuth` + `csrfToken` | Index AgentTemplate                  | Agent-templates  |
| `POST`   | `/api/v1/agent-templates/import`                            | `cookieAuth` + `csrfToken` | Import AgentTemplate                 | Agent-templates  |
| `POST`   | `/api/v1/agent-templates/validate`                          | `cookieAuth` + `csrfToken` | ValidatePayload AgentTemplate        | Agent-templates  |
| `GET`    | `/api/v1/agent-templates/{id}`                              | `cookieAuth` + `csrfToken` | Show AgentTemplate                   | Agent-templates  |
| `GET`    | `/api/v1/agents`                                            | `cookieAuth` + `csrfToken` | Index Agent                          | Agents           |
| `POST`   | `/api/v1/agents`                                            | `cookieAuth` + `csrfToken` | Store Agent                          | Agents           |
| `GET`    | `/api/v1/agents/{agentId}/memories`                         | `cookieAuth` + `csrfToken` | Index AgentMemory                    | Agents           |
| `POST`   | `/api/v1/agents/{agentId}/memories`                         | `cookieAuth` + `csrfToken` | Store AgentMemory                    | Agents           |
| `PATCH`  | `/api/v1/agents/{agentId}/memories/reorder`                 | `cookieAuth` + `csrfToken` | Reorder AgentMemory                  | Agents           |
| `GET`    | `/api/v1/agents/{agentId}/memories/{memoryId}`              | `cookieAuth` + `csrfToken` | Show AgentMemory                     | Agents           |
| `PUT`    | `/api/v1/agents/{agentId}/memories/{memoryId}`              | `cookieAuth` + `csrfToken` | Update AgentMemory                   | Agents           |
| `DELETE` | `/api/v1/agents/{agentId}/memories/{memoryId}`              | `cookieAuth` + `csrfToken` | Destroy AgentMemory                  | Agents           |
| `GET`    | `/api/v1/agents/{id}`                                       | `cookieAuth` + `csrfToken` | Show Agent                           | Agents           |
| `PATCH`  | `/api/v1/agents/{id}`                                       | `cookieAuth` + `csrfToken` | Update Agent                         | Agents           |
| `DELETE` | `/api/v1/agents/{id}`                                       | `cookieAuth` + `csrfToken` | Destroy Agent                        | Agents           |
| `GET`    | `/api/v1/agents/{id}/export`                                | `cookieAuth` + `csrfToken` | ExportAgent AgentTemplate            | Agents           |
| `GET`    | `/api/v1/agents/{id}/scheduled-runs`                        | `cookieAuth` + `csrfToken` | Index ScheduledRun                   | Agents           |
| `POST`   | `/api/v1/agents/{id}/scheduled-runs`                        | `cookieAuth` + `csrfToken` | Store ScheduledRun                   | Agents           |
| `GET`    | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth` + `csrfToken` | Show ScheduledRun                    | Agents           |
| `PUT`    | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth` + `csrfToken` | Update ScheduledRun                  | Agents           |
| `DELETE` | `/api/v1/agents/{id}/scheduled-runs/{runId}`                | `cookieAuth` + `csrfToken` | Destroy ScheduledRun                 | Agents           |
| `POST`   | `/api/v1/agents/{id}/scheduled-runs/{runId}/trigger`        | `cookieAuth` + `csrfToken` | Trigger ScheduledRun                 | Agents           |
| `GET`    | `/api/v1/agents/{id}/templates`                             | `cookieAuth` + `csrfToken` | Index PromptTemplate                 | Agents           |
| `POST`   | `/api/v1/agents/{id}/templates`                             | `cookieAuth` + `csrfToken` | Store PromptTemplate                 | Agents           |
| `GET`    | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth` + `csrfToken` | Show PromptTemplate                  | Agents           |
| `PUT`    | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth` + `csrfToken` | Update PromptTemplate                | Agents           |
| `DELETE` | `/api/v1/agents/{id}/templates/{templateId}`                | `cookieAuth` + `csrfToken` | Destroy PromptTemplate               | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/operations`                      | `cookieAuth` + `csrfToken` | GetToolsOperations AgentTool         | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/status`                          | `cookieAuth` + `csrfToken` | GetToolsStatus AgentTool             | Agents           |
| `POST`   | `/api/v1/agents/{id}/tools/{toolId}/enable`                 | `cookieAuth` + `csrfToken` | EnableTool AgentTool                 | Agents           |
| `DELETE` | `/api/v1/agents/{id}/tools/{toolId}/enable`                 | `cookieAuth` + `csrfToken` | DisableTool AgentTool                | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/operations/{operation}` | `cookieAuth` + `csrfToken` | GetOperationOverride AgentOverride   | Agents           |
| `PATCH`  | `/api/v1/agents/{id}/tools/{toolId}/operations/{operation}` | `cookieAuth` + `csrfToken` | PatchOperationOverride AgentOverride | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth` + `csrfToken` | GetOverride AgentOverride            | Agents           |
| `PUT`    | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth` + `csrfToken` | PutOverride AgentOverride            | Agents           |
| `DELETE` | `/api/v1/agents/{id}/tools/{toolId}/override`               | `cookieAuth` + `csrfToken` | DeleteOverride AgentOverride         | Agents           |
| `GET`    | `/api/v1/agents/{id}/tools/{toolId}/status`                 | `cookieAuth` + `csrfToken` | GetToolStatus AgentTool              | Agents           |
| `GET`    | `/api/v1/apps`                                              | `cookieAuth` + `csrfToken` | Index Apps                           | Apps             |
| `GET`    | `/api/v1/assets/{filename}`                                 | `cookieAuth`               | Show Asset                           | Assets           |
| `PATCH`  | `/api/v1/auth/account`                                      | `csrfToken`                | Account Auth                         | Auth             |
| `POST`   | `/api/v1/auth/email/change-request`                         | `csrfToken`                | RequestEmailChange Auth              | Auth             |
| `POST`   | `/api/v1/auth/email/confirm`                                | —                          | ConfirmEmailChange Auth              | Auth             |
| `POST`   | `/api/v1/auth/forgot-password`                              | —                          | ForgotPassword Auth                  | Auth             |
| `POST`   | `/api/v1/auth/login`                                        | —                          | Login Auth                           | Auth             |
| `POST`   | `/api/v1/auth/logout`                                       | `csrfToken`                | Logout Auth                          | Auth             |
| `GET`    | `/api/v1/auth/me`                                           | `csrfToken`                | Me Auth                              | Auth             |
| `PATCH`  | `/api/v1/auth/password`                                     | `csrfToken`                | Password Auth                        | Auth             |
| `POST`   | `/api/v1/auth/register`                                     | —                          | Register Auth                        | Auth             |
| `POST`   | `/api/v1/auth/reset-password`                               | —                          | ResetPassword Auth                   | Auth             |
| `POST`   | `/api/v1/auth/verification/resend`                          | —                          | ResendVerification Auth              | Auth             |
| `GET`    | `/api/v1/auth/verify/{selector}`                            | —                          | Verify Auth                          | Auth             |
| `GET`    | `/api/v1/config`                                            | —                          | Index Config                         | Config           |
| `GET`    | `/api/v1/llm-configs`                                       | `cookieAuth` + `csrfToken` | Index LLMConfig                      | Llm-configs      |
| `POST`   | `/api/v1/llm-configs`                                       | `cookieAuth` + `csrfToken` | Store LLMConfig                      | Llm-configs      |
| `GET`    | `/api/v1/llm-configs/global`                                | `cookieAuth` + `csrfToken` | GlobalConfigs LLMConfig              | Llm-configs      |
| `GET`    | `/api/v1/llm-configs/{id}`                                  | `cookieAuth` + `csrfToken` | Show LLMConfig                       | Llm-configs      |
| `PUT`    | `/api/v1/llm-configs/{id}`                                  | `cookieAuth` + `csrfToken` | Update LLMConfig                     | Llm-configs      |
| `DELETE` | `/api/v1/llm-configs/{id}`                                  | `cookieAuth` + `csrfToken` | Destroy LLMConfig                    | Llm-configs      |
| `POST`   | `/api/v1/llm-configs/{id}/set-default`                      | `cookieAuth` + `csrfToken` | SetDefault LLMConfig                 | Llm-configs      |
| `GET`    | `/api/v1/llm-drivers`                                       | `cookieAuth` + `csrfToken` | Drivers LLMConfig                    | Llm-drivers      |
| `GET`    | `/api/v1/mail-config`                                       | `cookieAuth` + `csrfToken` | Index MailConfig                     | Mail-config      |
| `PUT`    | `/api/v1/mail-config`                                       | `cookieAuth` + `csrfToken` | Update MailConfig                    | Mail-config      |
| `POST`   | `/api/v1/mail-config/test`                                  | `cookieAuth` + `csrfToken` | Test MailConfig                      | Mail-config      |
| `GET`    | `/api/v1/mail-templates`                                    | `cookieAuth` + `csrfToken` | Index MailTemplate                   | Mail-templates   |
| `POST`   | `/api/v1/mail-templates`                                    | `cookieAuth` + `csrfToken` | Store MailTemplate                   | Mail-templates   |
| `GET`    | `/api/v1/mail-templates/{id}`                               | `cookieAuth` + `csrfToken` | Show MailTemplate                    | Mail-templates   |
| `PUT`    | `/api/v1/mail-templates/{id}`                               | `cookieAuth` + `csrfToken` | Update MailTemplate                  | Mail-templates   |
| `DELETE` | `/api/v1/mail-templates/{id}`                               | `cookieAuth` + `csrfToken` | Destroy MailTemplate                 | Mail-templates   |
| `GET`    | `/api/v1/mail-templates/{name}/preview`                     | `cookieAuth` + `csrfToken` | Preview MailTemplate                 | Mail-templates   |
| `GET`    | `/api/v1/me/locations`                                      | `cookieAuth` + `csrfToken` | GetLocations UserProfile             | Me               |
| `POST`   | `/api/v1/me/locations`                                      | `cookieAuth` + `csrfToken` | PostLocation UserProfile             | Me               |
| `PUT`    | `/api/v1/me/locations/{id}`                                 | `cookieAuth` + `csrfToken` | PutLocation UserProfile              | Me               |
| `DELETE` | `/api/v1/me/locations/{id}`                                 | `cookieAuth` + `csrfToken` | DeleteLocation UserProfile           | Me               |
| `GET`    | `/api/v1/me/profile`                                        | `cookieAuth` + `csrfToken` | GetProfile UserProfile               | Me               |
| `PUT`    | `/api/v1/me/profile`                                        | `cookieAuth` + `csrfToken` | PutProfile UserProfile               | Me               |
| `GET`    | `/api/v1/media`                                             | `cookieAuth` + `csrfToken` | Index MediaArchive                   | Media            |
| `POST`   | `/api/v1/media`                                             | `cookieAuth` + `csrfToken` | Store MediaUpload                    | Media            |
| `GET`    | `/api/v1/media/allowed-types`                               | `cookieAuth`               | Index MediaAllowedTypes              | Media            |
| `GET`    | `/api/v1/media/{id}`                                        | `cookieAuth` + `csrfToken` | Show MediaArchive                    | Media            |
| `PATCH`  | `/api/v1/media/{id}`                                        | `cookieAuth` + `csrfToken` | Update MediaArchive                  | Media            |
| `DELETE` | `/api/v1/media/{id}`                                        | `cookieAuth` + `csrfToken` | Destroy MediaArchive                 | Media            |
| `POST`   | `/api/v1/media/{id}/public-token/refresh`                   | `cookieAuth` + `csrfToken` | RefreshPublicToken MediaArchive      | Media            |
| `GET`    | `/api/v1/memories`                                          | `cookieAuth` + `csrfToken` | Index Memory                         | Memories         |
| `POST`   | `/api/v1/memories`                                          | `cookieAuth` + `csrfToken` | Store Memory                         | Memories         |
| `PATCH`  | `/api/v1/memories/reorder`                                  | `cookieAuth` + `csrfToken` | Reorder Memory                       | Memories         |
| `GET`    | `/api/v1/memories/{id}`                                     | `cookieAuth` + `csrfToken` | Show Memory                          | Memories         |
| `PUT`    | `/api/v1/memories/{id}`                                     | `cookieAuth` + `csrfToken` | Update Memory                        | Memories         |
| `DELETE` | `/api/v1/memories/{id}`                                     | `cookieAuth` + `csrfToken` | Destroy Memory                       | Memories         |
| `GET`    | `/api/v1/notifications`                                     | `cookieAuth` + `csrfToken` | Index Notification                   | Notifications    |
| `DELETE` | `/api/v1/notifications`                                     | `cookieAuth` + `csrfToken` | DestroyAll Notification              | Notifications    |
| `POST`   | `/api/v1/notifications/read-all`                            | `cookieAuth` + `csrfToken` | MarkAllRead Notification             | Notifications    |
| `DELETE` | `/api/v1/notifications/{id}`                                | `cookieAuth` + `csrfToken` | Destroy Notification                 | Notifications    |
| `POST`   | `/api/v1/notifications/{id}/read`                           | `cookieAuth` + `csrfToken` | MarkRead Notification                | Notifications    |
| `GET`    | `/api/v1/plugins`                                           | `cookieAuth` + `csrfToken` | Index Plugins                        | Plugins          |
| `POST`   | `/api/v1/plugins`                                           | `cookieAuth` + `csrfToken` | Store Plugins                        | Plugins          |
| `GET`    | `/api/v1/plugins/catalog`                                   | `cookieAuth`               | Catalog Plugins                      | Plugins          |
| `PATCH`  | `/api/v1/plugins/{package}`                                 | `cookieAuth` + `csrfToken` | Update Plugins                       | Plugins          |
| `DELETE` | `/api/v1/plugins/{package}`                                 | `cookieAuth` + `csrfToken` | Destroy Plugins                      | Plugins          |
| `GET`    | `/api/v1/public/media/{id}`                                 | —                          | Show PublicMedia                     | Public           |
| `GET`    | `/api/v1/sse/auth`                                          | `cookieAuth` + `csrfToken` | Auth Sse                             | Sse              |
| `GET`    | `/api/v1/sse/status`                                        | `cookieAuth` + `csrfToken` | Status Sse                           | Sse              |
| `GET`    | `/api/v1/tasks`                                             | `cookieAuth` + `csrfToken` | Index Task                           | Tasks            |
| `POST`   | `/api/v1/tasks`                                             | `cookieAuth` + `csrfToken` | Store Task                           | Tasks            |
| `GET`    | `/api/v1/tasks/{taskId}`                                    | `cookieAuth` + `csrfToken` | Show Task                            | Tasks            |
| `DELETE` | `/api/v1/tasks/{taskId}`                                    | `cookieAuth` + `csrfToken` | Destroy Task                         | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/approve`                            | `cookieAuth` + `csrfToken` | Approve Task                         | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/continue`                           | `cookieAuth` + `csrfToken` | Continue Task                        | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/reject`                             | `cookieAuth` + `csrfToken` | Reject Task                          | Tasks            |
| `POST`   | `/api/v1/tasks/{taskId}/retry`                              | `cookieAuth` + `csrfToken` | Retry Task                           | Tasks            |
| `DELETE` | `/api/v1/tasks/{taskId}/retry-chain`                        | `cookieAuth` + `csrfToken` | CancelRetryChain Task                | Tasks            |
| `GET`    | `/api/v1/tools`                                             | `cookieAuth` + `csrfToken` | Index Tool                           | Tools            |
| `GET`    | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth` + `csrfToken` | GetSettings Tool                     | Tools            |
| `PUT`    | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth` + `csrfToken` | PutSettings Tool                     | Tools            |
| `DELETE` | `/api/v1/tools/{toolId}/settings`                           | `cookieAuth` + `csrfToken` | DeleteSettings Tool                  | Tools            |
| `GET`    | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth` + `csrfToken` | GetUserSettings Tool                 | Tools            |
| `PUT`    | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth` + `csrfToken` | PutUserSettings Tool                 | Tools            |
| `DELETE` | `/api/v1/tools/{toolId}/user-settings`                      | `cookieAuth` + `csrfToken` | DeleteUserSettings Tool              | Tools            |
| `GET`    | `/api/v1/user-preferences/llm`                              | `cookieAuth` + `csrfToken` | Show UserPreference                  | User-preferences |
| `PUT`    | `/api/v1/user-preferences/llm`                              | `cookieAuth` + `csrfToken` | Update UserPreference                | User-preferences |
| `GET`    | `/api/v1/users`                                             | `cookieAuth` + `csrfToken` | Index User                           | Users            |
| `POST`   | `/api/v1/users`                                             | `cookieAuth` + `csrfToken` | Store User                           | Users            |
| `GET`    | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Show User                            | Users            |
| `PUT`    | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Update User                          | Users            |
| `PATCH`  | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Update User                          | Users            |
| `DELETE` | `/api/v1/users/{id}`                                        | `cookieAuth` + `csrfToken` | Destroy User                         | Users            |
| `GET`    | `/api/v1/users/{id}/roles`                                  | `cookieAuth` + `csrfToken` | ListRoles User                       | Users            |
| `POST`   | `/api/v1/users/{id}/roles`                                  | `cookieAuth` + `csrfToken` | GrantRole User                       | Users            |
| `DELETE` | `/api/v1/users/{id}/roles/{role}`                           | `cookieAuth` + `csrfToken` | RevokeRole User                      | Users            |

### Per-endpoint detail

#### `GET /api/health` — Check Health

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agent-templates` — Index AgentTemplate

**Tags:** Agent-templates

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agent-templates/import` — Import AgentTemplate

**Tags:** Agent-templates

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agent-templates/validate` — ValidatePayload AgentTemplate

**Tags:** Agent-templates

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agent-templates/{id}` — Show AgentTemplate

**Tags:** Agent-templates

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents` — Index Agent

**Tags:** Agents

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agents` — Store Agent

**Tags:** Agents

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{agentId}/memories` — Index AgentMemory

**Tags:** Agents

##### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `agentId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agents/{agentId}/memories` — Store AgentMemory

**Tags:** Agents

##### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `agentId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/agents/{agentId}/memories/reorder` — Reorder AgentMemory

**Tags:** Agents

##### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `agentId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{agentId}/memories/{memoryId}` — Show AgentMemory

**Tags:** Agents

##### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `agentId`  | string | yes      |             |
| `memoryId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/agents/{agentId}/memories/{memoryId}` — Update AgentMemory

**Tags:** Agents

##### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `agentId`  | string | yes      |             |
| `memoryId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/agents/{agentId}/memories/{memoryId}` — Destroy AgentMemory

**Tags:** Agents

##### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `agentId`  | string | yes      |             |
| `memoryId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}` — Show Agent

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/agents/{id}` — Update Agent

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/agents/{id}` — Destroy Agent

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/export` — ExportAgent AgentTemplate

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/scheduled-runs` — Index ScheduledRun

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agents/{id}/scheduled-runs` — Store ScheduledRun

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/scheduled-runs/{runId}` — Show ScheduledRun

**Tags:** Agents

##### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/agents/{id}/scheduled-runs/{runId}` — Update ScheduledRun

**Tags:** Agents

##### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/agents/{id}/scheduled-runs/{runId}` — Destroy ScheduledRun

**Tags:** Agents

##### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agents/{id}/scheduled-runs/{runId}/trigger` — Trigger ScheduledRun

**Tags:** Agents

##### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/templates` — Index PromptTemplate

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agents/{id}/templates` — Store PromptTemplate

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/templates/{templateId}` — Show PromptTemplate

**Tags:** Agents

##### Path parameters

| Name         | Type   | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `id`         | string | yes      |             |
| `templateId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/agents/{id}/templates/{templateId}` — Update PromptTemplate

**Tags:** Agents

##### Path parameters

| Name         | Type   | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `id`         | string | yes      |             |
| `templateId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/agents/{id}/templates/{templateId}` — Destroy PromptTemplate

**Tags:** Agents

##### Path parameters

| Name         | Type   | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `id`         | string | yes      |             |
| `templateId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/tools/operations` — GetToolsOperations AgentTool

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/tools/status` — GetToolsStatus AgentTool

**Tags:** Agents

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/agents/{id}/tools/{toolId}/enable` — EnableTool AgentTool

**Tags:** Agents

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/agents/{id}/tools/{toolId}/enable` — DisableTool AgentTool

**Tags:** Agents

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/tools/{toolId}/operations/{operation}` — GetOperationOverride AgentOverride

**Tags:** Agents

##### Path parameters

| Name        | Type   | Required | Description |
| ----------- | ------ | -------- | ----------- |
| `id`        | string | yes      |             |
| `toolId`    | string | yes      |             |
| `operation` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/agents/{id}/tools/{toolId}/operations/{operation}` — PatchOperationOverride AgentOverride

**Tags:** Agents

##### Path parameters

| Name        | Type   | Required | Description |
| ----------- | ------ | -------- | ----------- |
| `id`        | string | yes      |             |
| `toolId`    | string | yes      |             |
| `operation` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/tools/{toolId}/override` — GetOverride AgentOverride

**Tags:** Agents

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/agents/{id}/tools/{toolId}/override` — PutOverride AgentOverride

**Tags:** Agents

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/agents/{id}/tools/{toolId}/override` — DeleteOverride AgentOverride

**Tags:** Agents

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/agents/{id}/tools/{toolId}/status` — GetToolStatus AgentTool

**Tags:** Agents

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/apps` — Index Apps

**Tags:** Apps

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/assets/{filename}` — Show Asset

**Tags:** Assets

##### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `filename` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/auth/account` — Account Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/email/change-request` — RequestEmailChange Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/email/confirm` — ConfirmEmailChange Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/forgot-password` — ForgotPassword Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/login` — Login Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/logout` — Logout Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/auth/me` — Me Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/auth/password` — Password Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/register` — Register Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/reset-password` — ResetPassword Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/auth/verification/resend` — ResendVerification Auth

**Tags:** Auth

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/auth/verify/{selector}` — Verify Auth

**Tags:** Auth

##### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `selector` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/config` — Index Config

**Tags:** Config

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/llm-configs` — Index LLMConfig

**Tags:** Llm-configs

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/llm-configs` — Store LLMConfig

**Tags:** Llm-configs

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/llm-configs/global` — GlobalConfigs LLMConfig

**Tags:** Llm-configs

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/llm-configs/{id}` — Show LLMConfig

**Tags:** Llm-configs

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/llm-configs/{id}` — Update LLMConfig

**Tags:** Llm-configs

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/llm-configs/{id}` — Destroy LLMConfig

**Tags:** Llm-configs

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/llm-configs/{id}/set-default` — SetDefault LLMConfig

**Tags:** Llm-configs

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/llm-drivers` — Drivers LLMConfig

**Tags:** Llm-drivers

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/mail-config` — Index MailConfig

**Tags:** Mail-config

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/mail-config` — Update MailConfig

**Tags:** Mail-config

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/mail-config/test` — Test MailConfig

**Tags:** Mail-config

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/mail-templates` — Index MailTemplate

**Tags:** Mail-templates

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/mail-templates` — Store MailTemplate

**Tags:** Mail-templates

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/mail-templates/{id}` — Show MailTemplate

**Tags:** Mail-templates

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/mail-templates/{id}` — Update MailTemplate

**Tags:** Mail-templates

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/mail-templates/{id}` — Destroy MailTemplate

**Tags:** Mail-templates

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/mail-templates/{name}/preview` — Preview MailTemplate

**Tags:** Mail-templates

##### Path parameters

| Name   | Type   | Required | Description |
| ------ | ------ | -------- | ----------- |
| `name` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/me/locations` — GetLocations UserProfile

**Tags:** Me

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/me/locations` — PostLocation UserProfile

**Tags:** Me

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/me/locations/{id}` — PutLocation UserProfile

**Tags:** Me

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/me/locations/{id}` — DeleteLocation UserProfile

**Tags:** Me

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/me/profile` — GetProfile UserProfile

**Tags:** Me

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/me/profile` — PutProfile UserProfile

**Tags:** Me

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/media` — Index MediaArchive

**Tags:** Media

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/media` — Store MediaUpload

**Tags:** Media

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/media/allowed-types` — Index MediaAllowedTypes

**Tags:** Media

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/media/{id}` — Show MediaArchive

**Tags:** Media

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/media/{id}` — Update MediaArchive

**Tags:** Media

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/media/{id}` — Destroy MediaArchive

**Tags:** Media

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/media/{id}/public-token/refresh` — RefreshPublicToken MediaArchive

**Tags:** Media

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/memories` — Index Memory

**Tags:** Memories

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/memories` — Store Memory

**Tags:** Memories

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/memories/reorder` — Reorder Memory

**Tags:** Memories

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/memories/{id}` — Show Memory

**Tags:** Memories

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/memories/{id}` — Update Memory

**Tags:** Memories

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/memories/{id}` — Destroy Memory

**Tags:** Memories

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/notifications` — Index Notification

**Tags:** Notifications

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/notifications` — DestroyAll Notification

**Tags:** Notifications

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/notifications/read-all` — MarkAllRead Notification

**Tags:** Notifications

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/notifications/{id}` — Destroy Notification

**Tags:** Notifications

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/notifications/{id}/read` — MarkRead Notification

**Tags:** Notifications

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/plugins` — Index Plugins

**Tags:** Plugins

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/plugins` — Store Plugins

**Tags:** Plugins

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/plugins/catalog` — Catalog Plugins

**Tags:** Plugins

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/plugins/{package}` — Update Plugins

**Tags:** Plugins

##### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `package` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/plugins/{package}` — Destroy Plugins

**Tags:** Plugins

##### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `package` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/public/media/{id}` — Show PublicMedia

**Tags:** Public

##### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/sse/auth` — Auth Sse

**Tags:** Sse

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/sse/status` — Status Sse

**Tags:** Sse

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/tasks` — Index Task

**Tags:** Tasks

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/tasks` — Store Task

**Tags:** Tasks

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/tasks/{taskId}` — Show Task

**Tags:** Tasks

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/tasks/{taskId}` — Destroy Task

**Tags:** Tasks

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/tasks/{taskId}/approve` — Approve Task

**Tags:** Tasks

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/tasks/{taskId}/continue` — Continue Task

**Tags:** Tasks

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/tasks/{taskId}/reject` — Reject Task

**Tags:** Tasks

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/tasks/{taskId}/retry` — Retry Task

**Tags:** Tasks

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/tasks/{taskId}/retry-chain` — CancelRetryChain Task

**Tags:** Tasks

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/tools` — Index Tool

**Tags:** Tools

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/tools/{toolId}/settings` — GetSettings Tool

**Tags:** Tools

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/tools/{toolId}/settings` — PutSettings Tool

**Tags:** Tools

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/tools/{toolId}/settings` — DeleteSettings Tool

**Tags:** Tools

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/tools/{toolId}/user-settings` — GetUserSettings Tool

**Tags:** Tools

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/tools/{toolId}/user-settings` — PutUserSettings Tool

**Tags:** Tools

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/tools/{toolId}/user-settings` — DeleteUserSettings Tool

**Tags:** Tools

##### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/user-preferences/llm` — Show UserPreference

**Tags:** User-preferences

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/user-preferences/llm` — Update UserPreference

**Tags:** User-preferences

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/users` — Index User

**Tags:** Users

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/users` — Store User

**Tags:** Users

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/users/{id}` — Show User

**Tags:** Users

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PUT /api/v1/users/{id}` — Update User

**Tags:** Users

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `PATCH /api/v1/users/{id}` — Update User

**Tags:** Users

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/users/{id}` — Destroy User

**Tags:** Users

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `GET /api/v1/users/{id}/roles` — ListRoles User

**Tags:** Users

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `POST /api/v1/users/{id}/roles` — GrantRole User

**Tags:** Users

##### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

#### `DELETE /api/v1/users/{id}/roles/{role}` — RevokeRole User

**Tags:** Users

##### Path parameters

| Name   | Type    | Required | Description |
| ------ | ------- | -------- | ----------- |
| `id`   | integer | yes      |             |
| `role` | string  | yes      |             |

##### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

<!-- API:GENERATED:END -->
