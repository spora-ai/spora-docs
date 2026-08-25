---
title: Browsing the Media Archive
description: Filter and download media assets in the Media Archive admin app — type pills, search, dashboard-style scope chips, and the per-asset detail drawer.
---

# Browsing the Media Archive

The **Media Archive** plugin (one of the built-in apps in the operator panel) surfaces rows from `media_assets` as a filterable grid in the admin UI. This page is for **operators and end users** who consume the panel; for plugin-author docs see [Plugin author guide → Admin UI](/develop/plugins/author-guide/admin-ui).

## What's in the grid

- Every `media_assets` row the caller is allowed to see (filtered by `PrincipalResolver::visiblePrincipalIds()` server-side).
- Type pill (`All` / `Images` / `Audio` / `Video` / `Documents`) plus a search input.
- A dashboard-style scope chip row above the search field (see [Scope chips](#scope-chips--all--my-media--group-x)).
- A click-through detail drawer with metadata (dimensions, duration, mime type, source URL).
- One-click download via the existing `AssetController::show()` route.

## Scope chips — ALL / My Media / Group X

The chip row mirrors the dashboard's flag-chip pattern — single-select, click-the-active-chip-to-clear.

| Chip       | Wire shape                              | What it shows                                                                                                                                          |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `All`      | `principal_id[]=<every visible id>`     | The caller's user-principal plus every group-principal they belong to. Surfaces direct uploads + every group's media.                                  |
| `My Media` | `principal_id[]=<user-principal id>`    | Direct uploads by the caller plus media attached to agents owned by the caller. Direct uploads surface only because the user-principal is in the list. |
| `Group A`  | `principal_id[]=<group-A principal id>` | Media attached to agents owned by group A. The caller's direct uploads are intentionally excluded so a group chip never leaks user uploads.            |

Each chip's label comes from `GET /principals/me` (which carries the `type: 'user' | 'group'` discriminator) plus `GET /groups` for friendly group names. If `/principals/me` resolves with the caller belonging to zero principals, the chip row hides entirely — the grid falls back to the legacy ownership union (`agentOwnerUserId`).

### Out-of-scope ids are silently dropped

The server intersects the request values with the caller's `visiblePrincipalIds()`. A typo (e.g. `?principal_id[]=abc`), an id the caller doesn't own, or an id from a different tenancy is silently dropped — the listing endpoint never surfaces filter-syntax errors so an authenticated UI never breaks on a stale id.

### Empty intersection

If the caller asks for a filter that intersects with **nothing** they can see (e.g. asking for a foreign group after they've been removed from it), the controller clears the principal-id filter and the service falls back to the legacy `agentOwnerUserId`-based ownership union. That union is also empty when the caller is unauthenticated, so the safe default holds.

## Wire shape: `?principal_id[]=…`

The frontend sends the request as repeated `?principal_id[]=…` keys. The **array-bracket form** is required — the plain repeated scalar form (`?principal_id=…&principal_id=…`) is collapsed to the LAST value by PHP's `parse_str`, which silently dropped everything except the last group-principal when the chip row sent every visible id. The `[principal_id]` parameter is defined in the OpenAPI spec — see the auto-generated [Media API reference](/reference/api/media#query-parameters).

## Keyboard / a11y notes

- Each chip is a real `<button type="button">` with `aria-pressed` reflecting selection state.
- Active chips are styled with `bg-primary` / `text-primary-foreground`; inactive chips use muted text.
- The chip row is wrapped in a `<fieldset>` + `<legend>` group so assistive tech announces it as a single-select "Scope" group.

## Where the data comes from

| Endpoint                                       | Used for                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/media?principal_id[]=…`           | The grid itself — paginated, filtered, scoped. Returns `{ data: { assets, page, perPage, total, lastPage } }`.            |
| `GET /api/v1/principals/me`                    | The list of visible principals (typed: `user` vs `group`). Drives the chip row shape.                                     |
| `GET /api/v1/groups`                           | Friendly group names keyed by `principal_id`. The chip row falls back to `Group #N` if this endpoint is unavailable.      |
| `GET /api/v1/media/{id}`                       | Detail drawer payload.                                                                                                    |
| `GET /api/v1/assets/{filename}`                | One-click download — streams the file through `AssetController::show()` (token + ownership checks).                       |
| `PATCH /api/v1/media/{id}`                     | Edit filename, tags, metadata, prompt, markdown_content, public sharing. Validators are in `MediaArchiveUpdateValidator`. |
| `POST /api/v1/media/{id}/public-token/refresh` | Rotate the public-access token for a shared asset.                                                                        |

## Related

- [Concepts → Media assets](/reference/concepts/media-assets) — plugin-author guide for embedding media in tool results (AssetStore, MediaEmbed, StoresBinaryAssets trait).
- [Concepts → Architecture → Tool ownership is principal-scoped](/reference/concepts/architecture#tool-ownership-is-principal-scoped) — migration 0067 introduced the principal_id column that drives the new ownership union.
- [Media API reference](/reference/api/media) — auto-generated from `openapi.json`; refresh with `npm run gen:api`.
