---
title: Memories
description: Persistent memory storage for agents and users. Ships the Memories admin panel plus the `memory` and `global_memory` tools.
---

# Memories Plugin for Spora

Gives [Spora](https://github.com/spora-ai/spora) agents a persistent, typed memory store. Two tools, one per scope: `memory` is private to the calling agent, `global_memory` is shared across every agent the calling principal owns. Each memory is a named markdown document tagged with a document type, and a Vue admin panel lets operators read, write, reorder, and surgically patch the same rows by hand.

Nothing to authenticate against. Memories are local rows in the host's own database, so the plugin has no settings, no API key, and no third-party service.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-memories
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, two tools are exposed — `memory` and `global_memory`, both in Spora's `productivity` category (visible in `php bin/spora plugin:list` and the agent UI under Tools). The **Memories** tile also appears in the admin panel's Apps dropdown at `/apps/memories`.

### The frontend package

The panel is a pre-built Vue SPA shipped as a **separate** Composer package, [`spora-ai/spora-plugin-memories-frontend`](https://github.com/spora-ai/spora-plugin-memories-frontend) (type `spora-plugin-frontend`). The PHP package's `require` block pulls it in transitively, so there is nothing extra to install — but the split is real, and it is why the tools work on a backend-only checkout: the host just never finds the bundle to mount.

## Configuration

The plugin ships **no tool settings**. There is no Settings → Tools entry for Memories, nothing to encrypt at rest, and no `ToolConfigService` round-trip. The operator-facing configuration is entirely in the panel:

| What the operator picks | Where                                                                                               | Default                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- |
| Acting principal        | The panel's `PrincipalChipRow` — the caller's user-principal, or any group-principal they belong to | The caller's own user-principal |
| Scope                   | The `Global` / `Agent: <name>` mode row                                                             | `Global`                        |
| Document type           | The type-filter chips over the Documents list                                                       | `All`                           |

The principal selection rides on **every** request as `?principal_id=N`. Omit it and the call falls back to the caller's user-principal, so a client that has never heard of the parameter still works; supply an id the caller cannot see and the request is rejected as a `403` rather than silently reading or writing under the wrong principal.

`type` and the document set are compile-time, not configuration. `MemoryTypes::DOCUMENT_TYPES` is the single source of truth for both the tool's enum and the `memories.type` column.

## Per-tool parameters

The plugin ships **two** tools, `memory` (agent-scoped) and `global_memory` (principal-scoped). Both extend one abstract base, so they expose **identical** operations and parameters and differ in exactly one respect: `memory` keys rows by `agent_id`, `global_memory` by `principal_id`.

Every tool returns `ToolResult::ok` (formatted text) or `ToolResult::fail` (a message). Neither throws — a single bad call cannot kill the agent loop.

Operations are dispatched through a single `action` parameter, synthesized from the `#[ToolOperation]` declarations:

| Operation | Enabled by default | Approval | Purpose                                                               |
| --------- | ------------------ | -------- | --------------------------------------------------------------------- |
| `list`    | yes                | no       | List all memories with their summaries, optionally filtered by `type` |
| `get`     | yes                | no       | Fetch one memory's full body                                          |
| `save`    | yes                | no       | Create or update a memory. Upsert keyed on `name` + `type`            |
| `replace` | yes                | no       | Replace one unique substring inside a body                            |
| `delete`  | yes                | **yes**  | Delete a memory                                                       |

`delete` is the only operation that requires approval out of the box. Note that the bundled agent template narrows the gate further — see [Agent template](#agent-template).

### Parameters

| Parameter  | Type    | Required for                                            | Default                                            | Notes                                                                                                                       |
| ---------- | ------- | ------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `action`   | string  | —                                                       | `list` (the first declared operation)              | Operation discriminator. An unrecognised value returns `Invalid action. Must be list, get, save, replace, or delete.`       |
| `name`     | string  | `get`, `save`, `delete`, `replace`                      | —                                                  | The memory's unique name within its scope, e.g. `user_preferences`, `project_context`. Paired with `type` to address a row. |
| `type`     | string  | `get`, `save`, `delete`, `replace` (optional on `list`) | —                                                  | One of `plan`, `documentation`, `examples`, `context`. Validated against that enum on `save`. On `list` it is a filter.     |
| `content`  | string  | `save`                                                  | —                                                  | The body, as markdown.                                                                                                      |
| `summary`  | string  | —                                                       | first 200 characters of the tag-stripped `content` | One-line summary shown in the `list` output. Only overwritten when supplied.                                                |
| `order`    | integer | —                                                       | `0`                                                | Sort position. The panel's drag-to-reorder writes it; `list` orders by `order`, then `name`.                                |
| `find`     | string  | `replace`                                               | —                                                  | Exact substring to replace. Must be **unique** within the body.                                                             |
| `new_text` | string  | `replace`                                               | —                                                  | The replacement text.                                                                                                       |

`get`, `delete`, and `replace` all resolve their row through the same `name` + `type` pair, so a memory is only addressable once you know both. `save` is an upsert on that same pair: a matching row is updated in place (`Updated memory …`), anything else is inserted (`Created memory …`).

The `type` requirement is not a schema nicety. The v2 schema keys uniqueness on a generated `scope_key` that folds in scope, principal, agent, type, and name — so two memories differing only by `type` are two distinct rows, and the type is what tells them apart.

## What it returns

All five operations return a single text block. The literal scope word in each message is `agent` or `global`.

`list`:

```text
Found 3 memory(ies) in global scope:
- [user_preferences] [context] — Always answer in British English
- [release_checklist] [plan] — Steps to cut a release
- [pdf_export] [documentation]
```

An empty scope returns `No memories found in global scope.`

`get`:

```text
# user_preferences (context)
*Summary: Always answer in British English*

<the full markdown body>
```

`save` returns `Created memory [user_preferences] (type=context) in global scope.` or `Updated memory …` for an existing row.

`replace` returns `Replaced 1 occurrence in [user_preferences] (type=context).` It is deliberately strict — a **unique** anchor or nothing:

```text
find matches 0 occurrences.
find matches 3 > 1 occurrences; provide a unique substring.
```

`delete` returns `Deleted memory [user_preferences] (type=context) from global scope.`

Two failure modes are worth knowing because they are not bad arguments. A missing row yields `Memory [name] (type=…) not found in <scope> scope.` And if no `PrincipalContext` was supplied at all, the tool returns `Cannot scope a memory: no PrincipalContext was supplied. This is a plugin integration error, not a bad argument.` Both scopes fail closed on that — agent scope included, because the runner's user id is not the owner and `users.id` can coincide with another tenant's `principals.id`.

For the approval UI, `describeAction()` renders `Memory <op>: <name>` — the specific row an approval card is about, never the body.

## The Memories admin panel

`/apps/memories` is a sidebar-and-detail view over the same rows the tools read and write.

- **Scope bar** — `PrincipalChipRow` switches between the caller's user-principal and any group-principals they belong to. The active principal scopes every read and write.
- **Mode row** — a segmented `Global` / `Agent: <name>` control. In global mode the agent pill routes to the first visible agent; in agent mode it opens a dropdown.
- **Documents panel** — type-filter chips (`All` / `Plans` / `Docs` / `Examples` / `Context`) sit next to the list they filter. Drag-to-reorder persists through the `reorder` endpoints.
- **Memory editor** — a markdown body editor, edit-only by default, with a preview toggle. **Attach media** opens the host's media picker and inserts `![](<asset_url>)` at the cursor; preview output is sanitised.

Agent-scoped memories deliberately survive a principal transfer, because the `agent_id` foreign key never changes. Global memories do not — they belong to the principal.

## Agent template

The plugin ships one bundled agent template, `agent-templates/assistant.json`:

| Field                      | Value                                |
| -------------------------- | ------------------------------------ |
| `id`                       | `memories/assistant`                 |
| `name`                     | Spora Memories Assistant             |
| `version`                  | `2.0.0`                              |
| `metadata.category`        | `general`                            |
| `required_plugins`         | `["spora-ai/spora-plugin-memories"]` |
| `agent.max_steps`          | `10`                                 |
| `agent.allow_continuation` | `true`                               |

Its system prompt is the point of the template: it spells out when to reach for `memory` versus `global_memory` (agent-specific knowledge versus instructions that should follow the user everywhere), what each document type is for, and that `type` must be supplied explicitly on every operation that takes it. Both tools are wired in with all five operations enabled.

The template is stricter than the tools' own defaults: it sets `auto_approve: false` on `replace` for **both** tools, where the tool classes default `replace` to no approval. A surgical in-place edit is a write the operator should see. See [Agent templates](/develop/plugins/author-guide/agent-templates).

## Schema and migrations

`schemaVersion()` is **2**, and two migrations ship under `database/migrations/`:

| File                                                   | What it does                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memories_000001_create_memories_table.php`            | Creates the `memories` table. Guarded by a `hasTable()` check, so hosts that shipped the table from an older core (or an uninstall/reinstall cycle) skip it cleanly. |
| `memories_000002_introduce_principals_types_uuids.php` | The v2 schema swap: principals model, `type` enum, UUIDv7 ids.                                                                                                       |

Version 2 is four breaking changes at once: `user_id` → `principal_id`, auto-increment `BIGINT` ids → `UUIDv7 CHAR(36)`, an implicit single type → an explicit `type` enum, and a new `replace` operation plus its `POST …/replace` endpoint. Uniqueness collapses from five orthogonal nullable axes into one non-null generated column, `scope_key` — MySQL treats `NULL` as distinct in a unique index, so `(scope, principal_id, agent_id, type, name)` could not be indexed directly.

Ids are minted as UUIDv7 by `Memory::newUniqueId()`, not the `HasUuids` trait's default v4, so newly-created memories stay adjacent in the B-tree and in API listing order. That ordering is what the editorial workflows depend on.

> **Note:** the v2 migration is **forward-only** — its `down()` is an empty body, and it refuses to run at all if any agent-scoped row survives in the legacy table. Back up and clear those rows before upgrading, or restore from a pre-upgrade backup to roll back.

## Admin API surface

14 routes appear under `/api/v1/memories*` — seven operations mirrored across two prefixes, all behind `AuthMiddleware` + `CsrfMiddleware`:

|         | Global (principal-scoped)                  | Agent-scoped                                                |
| ------- | ------------------------------------------ | ----------------------------------------------------------- |
| List    | `GET /api/v1/memories` (optional `?type=`) | `GET /api/v1/agents/{agentId}/memories`                     |
| Create  | `POST /api/v1/memories`                    | `POST /api/v1/agents/{agentId}/memories`                    |
| Reorder | `PATCH /api/v1/memories/reorder`           | `PATCH /api/v1/agents/{agentId}/memories/reorder`           |
| Read    | `GET /api/v1/memories/{id}`                | `GET /api/v1/agents/{agentId}/memories/{memoryId}`          |
| Update  | `PUT /api/v1/memories/{id}`                | `PUT /api/v1/agents/{agentId}/memories/{memoryId}`          |
| Replace | `POST /api/v1/memories/{id}/replace`       | `POST /api/v1/agents/{agentId}/memories/{memoryId}/replace` |
| Delete  | `DELETE /api/v1/memories/{id}`             | `DELETE /api/v1/agents/{agentId}/memories/{memoryId}`       |

Reorder takes `{order: [memoryId, …]}` and rewrites `order` as the 1-based array position. Replace takes `{find, new_text}` and enforces the same unique-anchor rule as the tool. Update accepts partial fields (`name`, `summary`, `content`, `order`, `type`).

`composer remove spora-ai/spora-plugin-memories` drops the routes and the panel tile but **preserves** the `memories` table, so a reinstall is a no-op on the schema. Authored content is not disposable.

## The canonical event subscriber

This plugin is the worked example the docs cite for the [lifecycle events](/reference/concepts/plugins-system#lifecycle-events), and the starting point [Author guide → Distribution](/develop/plugins/author-guide/distribution) points plugin authors at.

`MemoriesPlugin` implements `Symfony\Component\EventDispatcher\EventSubscriberInterface` and subscribes to the two boot-time events:

```php
public static function getSubscribedEvents(): array
{
    return [
        ContainerBuildingEvent::class => 'onContainerBuilding',
        RoutesRegisteringEvent::class  => 'onRoutesRegistering',
    ];
}
```

`onContainerBuilding` fires once per process, before the container exists, and adds the plugin's interface and controller bindings so PHP-DI can autowire them at request-dispatch time. Without it, resolving either controller fails with `EntryNotFoundException` — the host `App` knows nothing about the plugin's memory interfaces. It also re-lists `PrincipalService`, which core already registers, so the plugin's container resolves standalone in tests that skip the host boot path.

`onRoutesRegistering` fires per request, after the host's own routes, and adds the 14 routes behind Auth + CSRF.

> **Note:** the interface is `Symfony\Component\EventDispatcher\EventSubscriberInterface`. Some docblocks in the plugin's history name a `Contracts\` variant that does not exist; the working FQCN is the `Symfony\Component\` one, and `symfony/event-dispatcher` is a declared Composer dependency for exactly this reason.

The v2 split registers two narrow interfaces — `MemoryQueryInterface` and `MemoryCommandInterface` — so the read and write sides stay separately injectable, and each controller depends only on the side it calls.

## Development

```bash
composer install
composer test:parallel   # Pest — 279 tests
composer analyse         # PHPStan
composer lint           # php-cs-fixer dry-run
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, a `static-analysis` job, and a `code-style` job. A separate `coverage` job runs Pest with xdebug and uploads `coverage.xml` as a clover report; the `sonar` job depends on it and uploads to SonarCloud (project key `spora-ai_spora-plugin-memories`, from `sonar-project.properties`), so `new_coverage` is measurable per PR. Requires the `SONAR_TOKEN` secret on the repo. CI also installs `spora-core` from a branch-pinned ref via an env var, so cross-PR dependencies land together.

MIT license.

---

**Repo:** [spora-ai/spora-plugin-memories](https://github.com/spora-ai/spora-plugin-memories) · **MIT**
