---
title: Browsing the Media Archive
description: Filter and download media assets in the Media Archive admin app — type and kind pills, a folder tree, search, dashboard-style scope chips, and the per-asset detail drawer.
---

# Browsing the Media Archive

The **Media Archive** plugin (one of the built-in apps in the operator panel) surfaces rows from `media_assets` as a filterable grid in the admin UI. This page is for **operators and end users** who consume the panel; for plugin-author docs see [Plugin author guide → Admin UI](/develop/plugins/author-guide/admin-ui).

## What's in the grid

- Every `media_assets` row the caller is allowed to see (filtered by `PrincipalResolver::visiblePrincipalIds()` server-side).
- Type pill (`All` / `Images` / `Audio` / `Video` / `Documents`) plus a search input.
- A kind chip row (`All` / `Asset` / `Template` / `Example`) under the type pills (see [Kind mark](#kind-mark)).
- A folder tree above the search field (see [Folder tree](#folder-tree)).
- A dashboard-style scope chip row above the search field (see [Scope chips](#scope-chips--all--my-media--group-x)).
- A folder badge on every card that is filed in a folder, carrying the folder's name.
- A click-through detail drawer with metadata (dimensions, duration, mime type, source URL), the asset's folder and its editable kind.
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

## Folder tree

A **folder** is a named container in the Media Archive, scoped to one principal. The filter bar carries a tree of them above the search field, built on the client from the flat `parent_id` list the server returns. The tree and the rules behind it are in [Concepts → Media folders](/reference/concepts/media-folders).

- The root button, **All media**, is the whole library. Picking it clears the folder filter.
- Every folder below it is one row, indented by its depth, carrying the folder's name and the number of assets filed **directly** in it — a subfolder's assets are counted in the subfolder, not in its parent.
- In the **All** scope, and only when more than one principal in scope owns folders, each row also names the principal that owns it: two principals may each hold a folder called `Corporate`.
- Picking a folder sends the scalar `?folder_id=<uuid>` — one folder at a time. The server accepts the bracket form but honours only the first id, and a multi-folder filter that silently returns one folder's rows is worse than none.
- The tree shows the folders of the principals **in scope**. A folder of a principal outside the scope would filter the listing down to nothing, so it is not offered, and changing the scope drops a folder selection the new scope cannot filter by.
- The upload dialog has a folder picker of its own, offering only the folders of the principal the upload is filed under; changing that principal drops the picked folder.

The tree and the kind chip row are offered only when the host's core carries the folders release. The panel probes `GET /api/v1/media/folders`, and a **404** means the core has no folders endpoint at all — so the panel offers neither filter rather than offering one the server ignores.

## Kind mark

Every asset carries a **kind** — the advisory mark `asset`, `template` or `example`, `asset` by default. The filter bar carries a chip row for it: `All` / `Asset` / `Template` / `Example`. Picking one sends `?kind=<value>`.

The mark is a label and the operator owns it:

- The detail drawer shows the asset's kind as a select, and changing it PATCHes `{"kind": …}`.
- The mark never refuses an asset — a theme filed as a plain `asset` still renders, and a file marked `template` is still whatever its bytes are.
- A value **outside** the three is refused on write: the upload endpoint answers **400** `INVALID_KIND`, and the panel's `PATCH /api/v1/media/{id}` answers **422** `INVALID_KIND`.
- The listing filter is lenient where the write path is not: `?kind=bogus` is dropped and the listing comes back unfiltered rather than failing.

## Wire shape: `?principal_id[]=…`

The frontend sends the request as repeated `?principal_id[]=…` keys. The **array-bracket form** is required — the plain repeated scalar form (`?principal_id=…&principal_id=…`) is collapsed to the LAST value by PHP's `parse_str`, which silently dropped everything except the last group-principal when the chip row sent every visible id. The `[principal_id]` parameter is defined in the OpenAPI spec — see the auto-generated [Media API reference](/reference/api/media#query-parameters).

## The search box and the plugin filter only work now

The panel used to send `?search=` and `?plugin=`, while core read `?q=` and `?plugin_slug=` — two spellings for the same two filters. Neither reached the server, so the search box filtered nothing at all.

Core now accepts either spelling and the panel sends core's canonical ones, so the box filters the grid for the first time: a case-insensitive substring match on the asset's **prompt**, **filename**, stored URL, source URL and id. The plugin filter is the same fix on the panel's side — the request carries it, but the panel exposes no control for it, so nothing on screen changes.

## Keyboard / a11y notes

- Each chip is a real `<button type="button">` with `aria-pressed` reflecting selection state.
- Active chips are styled with `bg-primary` / `text-primary-foreground`; inactive chips use muted text.
- The chip row is wrapped in a `<fieldset>` + `<legend>` group so assistive tech announces it as a single-select "Scope" group.

## Temporary files

The grid hides temp rows by default — they crowd out the permanent grid with a stream of short-lived voice transcripts and other auto-uploaded artefacts. Three UI surfaces let operators opt back in:

- **"Include temporary files" toggle** in `MediaFilters`. State persists in `localStorage` (`spora.media.showTemporary.v1`, default off). When off, the listing query sends `?include_temporary=false` and the filter happens server-side. Flipping the toggle reloads the grid.
- **"Temporary" corner badge** on `MediaCard`. Renders only when the toggle is on and the asset is temp; otherwise the row is filtered out before it reaches the grid.
- **"Keep file" button** on `MediaDetailPage` for temp assets. Calls `POST /api/v1/media/{id}/keep` to pin the row as permanent so the per-(user, agent) retention sweep leaves it alone. Idempotent — calling on a non-temp row returns 200 without re-saving. A toast confirms the pin; the detail payload refreshes with `is_temporary: false`.

Keep-file auth: global admin OR the asset's `user_id == currentUserId`. Non-owners receive 403; missing rows 404.

The retention sweep itself runs server-side (`media:gc --temporary [--older-than-hours N]`, default 24 h). Per-agent retention is governed by `agents.voice_message_retention_count` (default 5; 0 disables auto-purge — operators must then run the GC manually or hit `/keep` per row). The ceiling is a per-(user, agent) count of temp rows, and it is what the upload controller enforces: when a multipart upload sets `is_temporary` _and_ names an `agent_id`, `MediaArchiveService::enforceTempRetention()` trims that pair's temp set back under the agent's ceiling. The value is a `0`–`100` integer, range-checked server-side and answered with a `422` when it is not. See the Media API reference for the full lifecycle: `POST /api/v1/media` (temp opt-in via `is_temporary`), `GET /api/v1/media?include_temporary=true`, `POST /api/v1/media/{id}/keep`, and the `media:gc` CLI.

## What lands in the archive

What ends up in the grid is decided by five settings on the **Media & Plugins** tab of
**Settings → Runtime settings**. They are ordinary settings — the same four-layer chain as every
other field, so a value saved there wins over one set in `.env`. See
[Config keys](/reference/config-keys) for the `config.php` and env-var spellings.

| Setting                                   | Default           | What it decides                                                                                |
| ----------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `SPORA_MEDIA_ARCHIVE_PROMOTE_EXTERNAL`    | `true`            | When on, a URL an agent was given is downloaded and stored. Turn it off to keep only the link. |
| `SPORA_MEDIA_ARCHIVE_FETCH_TIMEOUT`       | `30`              | Seconds allowed for the remote media fetch.                                                    |
| `SPORA_MEDIA_ARCHIVE_MAX_PROMOTE_BYTES`   | `104857600`       | 100 MiB. A larger response is recorded as external rather than downloaded.                     |
| `SPORA_MEDIA_ARCHIVE_FFPROBE_ENABLED`     | `false`           | Extracts the duration with `ffprobe`. Needs ffprobe on `PATH`, and is slower to ingest.        |
| `SPORA_MEDIA_ARCHIVE_ALLOWED_IMAGE_TYPES` | `png, jpeg, webp` | The image formats offered as attachments. SVG is always rejected and cannot be enabled here.   |

An asset recorded as **external** — because promotion is off, or because the response was over the
ceiling — still appears in the grid, with the source URL in the detail drawer instead of a stored
copy. There are no bytes on this side to hand out, so the download route answers
`404 asset_not_found` for it.

## Where the data comes from

| Endpoint                                       | Used for                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/media?principal_id[]=…`           | The grid itself — paginated, filtered, scoped (`?folder_id=`, `?kind=`). Returns `{ data: { assets, page, perPage, total, lastPage } }`. |
| `GET /api/v1/media/folders?principal_id=…`     | The folder tree — one flat list per principal, each folder with its `asset_count`.                                                       |
| `POST /api/v1/media`                           | The upload. Takes the file plus `principal_id`, `folder_id` and `kind`; a `kind` outside the vocabulary is a **400**.                    |
| `GET /api/v1/principals/me`                    | The list of visible principals (typed: `user` vs `group`). Drives the chip row shape.                                                    |
| `GET /api/v1/groups`                           | Friendly group names keyed by `principal_id`. The chip row falls back to `Group #N` if this endpoint is unavailable.                     |
| `GET /api/v1/media/{id}`                       | Detail drawer payload.                                                                                                                   |
| `GET /api/v1/assets/{filename}`                | One-click download — streams the file through `AssetController::show()` (token + ownership checks).                                      |
| `PATCH /api/v1/media/{id}`                     | Edit filename, tags, metadata, prompt, public sharing — and now `folder_id` and `kind`. Validators are in `MediaArchiveUpdateValidator`. |
| `POST /api/v1/media/{id}/public-token/refresh` | Rotate the public-access token for a shared asset.                                                                                       |
| `POST /api/v1/media/{id}/keep`                 | Pin a temp row as permanent so the retention sweep leaves it alone. Idempotent; admin-or-owner auth.                                     |

## Related

- [Concepts → Media assets](/reference/concepts/media-assets) — plugin-author guide for embedding media in tool results (AssetStore, MediaEmbed, StoresBinaryAssets trait).
- [Concepts → Media folders](/reference/concepts/media-folders) — the folder tree, the two uniqueness rules and the advisory `kind` mark behind the two filters above.
- [Concepts → Architecture → Tool ownership is principal-scoped](/reference/concepts/architecture#tool-ownership-is-principal-scoped) — migration 0067 introduced the principal_id column that drives the new ownership union.
- [Media API reference](/reference/api/media) — auto-generated from `openapi.json`; refresh with `npm run gen:api`.
