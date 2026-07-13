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

| Method  | Path                                | Auth         | Purpose                                                  |
| ------- | ----------------------------------- | ------------ | -------------------------------------------------------- |
| `GET`   | `/api/v1/agent-templates`           | session      | List built-in + plugin templates                         |
| `GET`   | `/api/v1/agent-templates/{id}`      | session      | Get one template (full payload + warnings)               |
| `POST`  | `/api/v1/agent-templates/validate`  | session + CSRF | Validate a raw payload without importing               |
| `POST`  | `/api/v1/agent-templates/import`    | session + CSRF | Create an agent from a payload                         |
| `GET`   | `/api/v1/agents/{id}/export`        | session      | Export an agent as a template JSON                       |

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
