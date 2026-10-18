---
title: Security
description: Credential encryption, auth, rate limiting, plugin risks.
---

## Security in Spora

## Credential Encryption

LLM API keys and other secrets are encrypted at rest using **libsodium secretbox** (XSalsa20 stream cipher + Poly1305 MAC), authenticated encryption with a 32-byte master key (`SODIUM_CRYPTO_SECRETBOX_KEYBYTES`). The implementation lives in `app/Core/SecurityManager.php` (`encrypt()` / `decrypt()`).

The master key is resolved, in order, from:

1. `SPORA_SECRET_KEY` env var — must be **base64-encoded** 32 raw bytes
2. `SPORA_KEY_PATH` env var — path to a 32-byte binary key file
3. `config['key_path']` (auto-set to `storage/secret.key` on first run of `spora:install` or `db:seed`)

See `app/Core/ContainerDefinitions.php:237-267` for the resolution chain.

**Protect this key** — anyone with access can decrypt all stored credentials.

## The runtime settings store

Spora keeps two independent sets of secrets, encrypted with the same master key:

| Store                         | Holds                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `tool_configurations`         | Per-tool credentials — the `api_key` on a search tool, the `base_url` on `ReadUrlTool` |
| `settings` (migration `0092`) | Runtime configuration an admin edits — `SPORA_MAIL_PASSWORD`, `SPORA_MERCURE_JWT_KEY`  |

Both use the same key. Losing `SPORA_SECRET_KEY` / `secret.key` makes **every row in both stores**
undecryptable at once, not just one.

A shared settings group — one credential for every tool of a plugin — lives in
`tool_configurations` under the group's class rather than under each tool's.

### A secret never leaves the server in the clear

`GlobalSettingsController` substitutes the literal `'***'` for the value of any setting declared
`secret`, on **every** read, for **every** caller including a global admin. There is no endpoint that
returns a secret's real value, and the admin UI renders `'***'` as a locked field with a **Change**
button rather than a populated input.

Tool settings get the same treatment, and the mask is keyed off the schema that encrypted the value
— the plugin's shared group as well as the tool's own declarations.

### The three states of a secret field

Because the server cannot echo the value back, `PATCH /api/v1/admin/settings` distinguishes
"untouched" from "cleared":

| Submitted | Meaning                                                                                |
| --------- | -------------------------------------------------------------------------------------- |
| omitted   | untouched                                                                              |
| `'***'`   | untouched, explicitly — the key is not written and is not listed in `updated`          |
| `''`      | **clear it** — the stored row is deleted and the setting falls back to the file layers |

The last row is load-bearing. `encrypt('')` emits a bare nonce+MAC (40 bytes) and `decrypt()`
rejects anything shorter than nonce+MAC+1, so storing the empty string would produce a row that
reads as undecryptable _forever_ — after which every read of that key throws. "No credential" and
"clear the credential" mean the same thing to an operator, so both take the same path.

### When a stored value cannot be decrypted

The application still boots: the overlay skips an unreadable row, so the value from
`config.php` / `.env` stands — and the registry default when neither sets it. A site that cannot
start cannot show the admin the error explaining why. **Settings → Runtime settings** names every
affected key and says plainly that it is running on its default.

## Recovering a lost or rotated secret key

This is the one recovery that cannot go through the UI, and deliberately so. A row encrypted with a
key nobody held makes the page that reads it fail — and a button in that page could destroy every
configured credential in one mis-click.

```bash
php bin/spora settings:reset           # lists every row, then prompts
php bin/spora settings:reset --force   # non-interactive; skips the prompt
```

It deletes **every** row in the `settings` table, including rows whose key the registry no longer
declares — which is precisely the row that would otherwise survive a reset. Nothing is archived. The
resolution order is unchanged; only the database layer is dropped, so every setting falls back to
`config.php` / `.env` / its declared default and the instance boots. Re-enter each credential
afterwards at **Settings → Runtime settings**.

## API Authentication

Session-based authentication via `delight-im/auth` (`Delight\Auth\Auth`). The session is PHP's native session, started by Symfony's `Request`; the cookie name follows PHP defaults and is not set explicitly by Spora.

State-changing requests (POST/PUT/PATCH/DELETE) must include a CSRF token in the `X-CSRF-Token` request header. The token is generated by `Spora\Security\CsrfTokenService` (`app/Security/CsrfTokenService.php`), stored in the `csrf_token` session key, and issued to the client as the `data.csrf_token` field of `POST /api/v1/auth/login` and `GET /api/v1/auth/me` responses. The middleware that enforces it is `Spora\Http\Middleware\CsrfMiddleware` (`app/Http/Middleware/CsrfMiddleware.php:30`).

| Method | Endpoint              | Description                              |
| ------ | --------------------- | ---------------------------------------- |
| POST   | `/api/v1/auth/login`  | Authenticate (issues `data.csrf_token`)  |
| POST   | `/api/v1/auth/logout` | End session (requires `X-CSRF-Token`)    |
| GET    | `/api/v1/auth/me`     | Current user (returns `data.csrf_token`) |

Additional auth endpoints (registration, password change, email verification, etc.) are listed in the [API reference](/reference/api) and registered in `app/Core/routes.php:44-55`.

**CSRF-exempt endpoints** — the following auth endpoints are exempt from the CSRF check, because they authorize via in-URL credentials (selector/token) or run before a session is established: `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/email/confirm`, `/auth/verification/resend`, `/auth/verify/{selector}`. `/api/health` and `/api/v1/config` are also unauthenticated.

`/auth/verify/{selector}` is also state-agnostic: the endpoint authorizes via selector+token and works whether or not the caller is logged in. The bundled admin UI calls it for both initial signup verification (`kind: signup`) and email-change confirmation (`kind: change`); see [API reference → Verify endpoint response](/reference/api#verify-endpoint-response-api-v1-auth-verify-selector).

### The Agent API

The session above covers the admin UI. External tools use a different mechanism: a per-agent bearer key sent as `Authorization: Bearer spk_<id>_<secret>`, scoped to one agent's chats and media. That surface accepts no session cookie and no CSRF token — the key is the only credential — so it is exempt from the CSRF check by construction rather than by exemption. It is not mounted at all unless the **Agent API** setting is enabled and the instance runs a server-side worker.

Four properties of it are worth stating here rather than only in the integration guide.

**Secret storage.** A key is `spk_<id>_<secret>`. Only a SHA-256 hex digest of the secret is stored (`agent_api_keys.secret_hash`); the plaintext is returned exactly once, by the mint endpoint, and no endpoint can return it again. SHA-256 rather than bcrypt/argon is deliberate — the input is 32 bytes of CSPRNG output, so there is no dictionary to attack and no slow-KDF benefit to buy with request-path latency. A lost key is replaced, not recovered. The `id` half is 16 bytes of CSPRNG and is the row's primary key, so verification is one indexed lookup rather than a scan, and key ids cannot be walked.

**Callback signing.** `callback_url` deliveries carry `X-Spora-Signature: hex(hmac_sha256(timestamp + "." + rawBody, key_digest))`. The HMAC is keyed on the **stored digest**, not the plaintext secret, so a receiver holding only the secret it was issued can verify while Spora never holds that secret again. Rotating a key rotates its signing key with it. Receivers must enforce a freshness window — the 5-minute window in the integration guide is a receiver-side requirement, not something Spora enforces.

**Outbound URL safety.** A caller-supplied `callback_url` is a URL the server will POST to, so it is screened before the chat is queued: https only, at most 2048 characters, no loopback or link-local host, and every address the hostname resolves to — v4 and v6 — must sit outside RFC1918, loopback, link-local, unique-local and carrier-grade-NAT ranges. The screen runs once, on the URL as supplied, and redirects are never followed, so a `3xx` is treated as a failed delivery. The resolve-then-fetch sequence still has a DNS-rebinding window: the guard raises the cost of a pivot rather than making it impossible. Treat a callback URL as a credential and do not accept one from an untrusted caller.

**Rate limiting.** Per key, not per IP — see [below](#rate-limiting).

## Rate Limiting

Spora's rate limiter is a simple in-memory IP-based sliding window (`Spora\Services\RateLimiter`, `app/Services/RateLimiter.php`). The limit is applied on **all** auth-related endpoints, not only login:

| Endpoint Type                                                  | Limit        | Source                                                               |
| -------------------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| Authentication (`/api/v1/auth/login`, `/api/v1/auth/register`) | 5 req / 60 s | `AuthController::RATE_LIMIT_*` (`app/Http/AuthController.php:26-27`) |
| Password reset (`/api/v1/auth/forgot-password`)                | 5 req / 60 s | same constants                                                       |
| Verification resend (`/api/v1/auth/verification/resend`)       | 5 req / 60 s | same constants                                                       |

The [Agent API](/reference/agent-api#errors-and-rate-limits) is limited separately, and per
**key** rather than per IP: `SPORA_AGENT_API_RATE_LIMIT_MAX` requests per minute (default 60)
against `Spora\Services\DbRateLimiter`, a database-backed rolling window keyed on the key id. A
shared NAT therefore does not throttle an integrator, and one integration cannot exhaust another's
budget. The counter is only consulted **after** the secret verifies, so a wrong secret can never
return `429` — otherwise `429`-vs-`401` would reveal whether a key id exists.

Other endpoints are not currently rate-limited.

## Plugin Risks

Plugins are not sandboxed — they run as ordinary PHP code with full access to the application, the database, the file system, and any decrypted credentials. The plugin trust model and lifecycle are documented on the [Plugin system](/reference/concepts/plugins-system) page under [Security](/reference/concepts/plugins-system#security).

## Trusted Proxies & `X-Forwarded-*` Headers

Spora does **not** read `X-Forwarded-Host`, `X-Forwarded-Proto`, or `X-Forwarded-Port` when resolving the public base URL used in transactional email links (verification, password reset). Those headers are spoofable by any direct client, and Spora has no trusted-proxy allowlist at the application layer — trusting them would let a remote attacker poison verification-link hostnames.

**Operators behind a reverse proxy that rewrites `Host` MUST set `SPORA_APP_URL` in `.env`** to the public origin (e.g. `https://spora.example.com`) — or, for shared hosting, set `'app_url' => 'https://spora.example.com'` in `config.php`. The default `SPORA_APP_PREFIX` is `/spora` (matches the packaged admin UI and plugin URLs). Operators mounting Spora at the host root — e.g. when developing their own frontend — MUST set `SPORA_APP_PREFIX=""` to opt out. See [Environment variables](/start/operators/env-vars#application) for the full reference.

Detection chain, first wins (`app/Core/RequestOrigin.php`, called with the merged `config` array):

1. `config.php` `app_url` (operator-pinned, shared-host friendly)
2. `SPORA_APP_URL` env var
3. Web-server `HTTP_HOST` (request-supplied, may include `:port`)
4. Web-server `SERVER_NAME` (Apache `ServerName` directive — set at server bootstrap, trusted because the operator controls it)
5. `http://localhost` (CLI / worker / console / tests)

Path-prefix default: `/spora` (the packaged admin UI lives at `public/spora/`; plugins live at `public/plugins/<name>/`). Set `SPORA_APP_PREFIX=""` to mount Spora at the host root.

Do not run Spora behind a reverse proxy that does **not** rewrite `Host` to the public origin — without that rewrite, `HTTP_HOST` carries the internal hostname and verification links will not work.

## Tool → user_id Trust Boundary

Tools never receive a session-derived user id. `Orchestrator::safeExecute()` (in `app/Agents/Orchestrator.php`) reads the calling Agent's row, resolves it into a `PrincipalContext`, and passes that into `ToolInterface::execute()` — where ownership is read as `$context->ownerUserId`. Tools therefore see **the owner of the agent that issued the call**, not "whoever is signed in" — a structural guarantee that no client code can bypass.

This matters most for:

- **Async contexts** — Worker mode, scheduled runs, and sub-agent hops all read the same agent row, so the trust boundary holds when no session exists.
- **Multi-agent setups** — a sub-agent created via `create_agent` + `configure_tools` inherits its owner from `configure_tools(agent_id: N, ...)`; cross-user ids are refused.
- **Audit trails** — tool dispatch logs (`Orchestrator`'s `DEBUG` `Tool dispatch` record) carry the resolved `user_id`, which is the only `user_id` a tool can ever see.

## Mercure `data` Projection Allowlist

`SubAgentService::publishParentState()` (`app/Services/SubAgentService.php`) projects a parent task's `data` JSON column into the Mercure live-stream payload. To keep the SSE topic a non-leaky surface, only three keys are forwarded; everything else in `data` is dropped:

| Key                        | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `spawned_sub_task_ids`     | Live ids of sub-agent children; the dashboard needs to render progress. |
| `sub_agent_expected_count` | Expected sibling count for the multi-child resume gate.                 |
| `run_id`                   | Correlation id for the sub-agent hop.                                   |

The allowlist is intentionally narrow because the parent task's `data` column is a free-form JSON blob that may contain secrets the agent appended (api keys, intermediate reasoning, custom payloads). Operators auditing the SSE payload for PII/secrets need to know which keys are intentionally projected and why the projection is narrow — anything not on the allowlist is dropped, even if it would be useful to the SPA. If a future UI surface needs an additional `data` key, extend `SubAgentService::PARENT_STATE_DATA_ALLOWLIST` and audit the key for sensitive contents first.

## Principal-scoped authorisation

Spora-core PR #209 re-keyed ownership from `user_id` to `principal_id` (see [Concepts → Architecture → Principal ownership model](/reference/concepts/architecture#principal-ownership-model)). The principal is the auth axis for every ownership-touching endpoint. The contracts that operators auditing the API need to know:

- **`PrincipalResolver::visiblePrincipalIds($userId)`** is the single source of truth for "who can this caller act as?". Every endpoint that accepts a `principal_id` argument intersects it with this set.

- **`POST /api/v1/agents` — `principal_id` body field.** Authorisation is gated by `AgentPrincipalService::callerControlsPrincipal($userId, $principalId)`. The caller must be a global admin OR control the target principal (owner / admin of the group for a group-principal; trivially true for the caller's own user-principal). When the caller doesn't control the value, the controller falls back to the caller's own user-principal — the requested `principal_id` is never silently honoured, and no error is raised. This means an attacker who guesses a principal id sees no different response than they would have seen without supplying the field.

- **`GET /api/v1/agents?principal_id=`** — repeatable filter. Out-of-scope principal ids are silently dropped (existence-hiding). An empty filter returns every visible agent; a fully out-of-scope filter returns an empty list.

- **`POST /api/v1/agents/{id}/transfer`** — re-keys `agents.principal_id`. Caller must control BOTH source and target (admin/owner of source AND admin/owner of target, OR owner of target when the target is the caller's own user-principal). Admins skip the source-side gate. `403 FORBIDDEN` on `UnauthorizedTransferException`. `404 NOT_FOUND` if either side is missing.

- **`DELETE /api/v1/groups/{id}`** — refuses with `409 GROUP_HAS_AGENTS` (carrying `agent_ids` and `reassign_endpoint`) if any agent still references the group's principal. The operator must transfer or delete the dependents first. The `agents.principal_id` FK uses `ON DELETE RESTRICT` — there is no cascade-delete from principal to agent.

- **Tool execution is principal-scoped, not user-scoped.** `Orchestrator::safeExecute()` now resolves a `PrincipalContext` from the calling agent's row and passes it to every tool. The `$userId` parameter plugins see is `PrincipalResolver::ownerUserId($principalId)` — the user that originally created the principal. A tool enabled on an agent owned by a group principal will see the group's creator as its `$userId`, NOT a random group member.
