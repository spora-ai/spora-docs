---
title: Browsing the Media Archive
description: Filter and download media assets in the Media Archive admin app — a folder rail with a scope dropdown, type and kind dropdowns, search, and the per-asset detail drawer.
---

# Browsing the Media Archive

The **Media Archive** plugin (one of the built-in apps in the operator panel) surfaces rows from `media_assets` as a filterable grid in the admin UI. This page is for **operators and end users** who consume the panel; for plugin-author docs see [Plugin author guide → Admin UI](/develop/plugins/author-guide/admin-ui).

## The panel's shape

The panel is a **folder rail** on the left and the **grid** on the right.

- The rail carries the **scope dropdown** at its top — above the "Folders" heading — and the folder tree below it. The scope governs the whole panel: the folders in the tree _and_ the assets in the grid (see [The scope dropdown](#the-scope-dropdown)).
- The toolbar above the grid carries the search box, the file-type dropdown, the kind dropdown, the **Upload** button and the "Include temporary files" toggle.
- Below `lg` the rail is a **drawer**: it slides in from the left over the grid, with a backdrop and a close button. Escape closes an open dropdown first and the drawer on the next Escape, and picking a folder closes the drawer too. The toolbar carries a compact copy of the scope dropdown, so the panel still says whose media it is showing while the drawer is closed.

## What's in the grid

- Every `media_assets` row the caller is allowed to see (filtered by `PrincipalResolver::visiblePrincipalIds()` server-side).
- A toolbar above the grid: a search box, a **file-type dropdown** (`All file types` / `Images` / `Audio` / `Video` / `Documents`), a **kind dropdown** (`All kinds` / `Asset` / `Template` / `Example`), the **Upload** button and the "Include temporary files" toggle (see [Kind mark](#kind-mark)).
- The folder rail beside it, holding the scope dropdown and the folder tree (see [The folder rail](#the-folder-rail)).
- A folder badge on every card that is filed in a folder, carrying the folder's name.
- A click-through detail drawer with metadata (dimensions, duration, mime type, source URL), the asset's folder and its kind — **both editable**: a picker beside each other, one that files the asset into a folder and one that changes its mark. The folder picker offers the folders of the asset's own principal; a folder of another principal is refused by the server, so offering it would be offering a refusal.
- One-click download via the existing `AssetController::show()` route.
- An empty state that names the case: **"This folder is empty."** when a folder is selected, and **"No media yet — generate something with a companion plugin to see it here."** when the whole library is shown. Both offer an upload button.

## The scope dropdown

The scope dropdown at the top of the rail decides **whose media the panel shows**. It is not a filter: a filter narrows a list, a scope says "everything below this belongs to what I picked" — the folders in the tree _and_ the assets in the grid. It is a bordered control with a chevron that opens a menu, the same control the Custom Skills panel uses.

Its options are **All principals**, the caller's own user-principal (**My Media**) and every group the caller belongs to. Each row carries the principal's kind: **Personal** for the user-principal, **Group** for a group.

| Option           | Wire shape                              | What it shows                                                                                                                                          |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `All principals` | `principal_id[]=<every visible id>`     | The caller's user-principal plus every group-principal they belong to. Surfaces direct uploads + every group's media.                                  |
| `My Media`       | `principal_id[]=<user-principal id>`    | Direct uploads by the caller plus media attached to agents owned by the caller. Direct uploads surface only because the user-principal is in the list. |
| `Group A`        | `principal_id[]=<group-A principal id>` | Media attached to agents owned by group A. The caller's direct uploads are intentionally excluded so a group scope never leaks user uploads.           |

Each option's label comes from `GET /principals/me` (which carries the `type: 'user' | 'group'` discriminator) plus `GET /groups` for friendly group names; a group whose name is not available is listed as `Group #N`. If `/principals/me` resolves with the caller belonging to zero principals, the dropdown offers only **All principals** and the grid falls back to the legacy ownership union (`agentOwnerUserId`) — the **Upload** button is disabled and the **New folder** button is hidden, because there is no principal to upload to or file under.

On a narrow screen the rail is a drawer, so the toolbar carries a **compact copy** of the same dropdown — the same control in one line, not a second control. Picking a principal in one copy moves the other.

### Out-of-scope ids are silently dropped

The server intersects the request values with the caller's `visiblePrincipalIds()`. A typo (e.g. `?principal_id[]=abc`), an id the caller doesn't own, or an id from a different tenancy is silently dropped — the listing endpoint never surfaces filter-syntax errors so an authenticated UI never breaks on a stale id.

### Empty intersection

If the caller asks for a filter that intersects with **nothing** they can see (e.g. asking for a foreign group after they've been removed from it), the controller clears the principal-id filter and the service falls back to the legacy `agentOwnerUserId`-based ownership union. That union is also empty when the caller is unauthenticated, so the safe default holds.

## The folder rail

A **folder** is a named container in the Media Archive, scoped to one principal. The tree of them lives in the rail on the left of the grid, built on the client from the flat `parent_id` list the server returns. The tree and the rules behind it are in [Concepts → Media folders](/reference/concepts/media-folders).

- The rail's root button, **All media**, is the whole library. Picking it clears the folder filter.
- Under it, **All media without a folder** is the pile that belongs to no folder yet. It is a filter of its own — `?unfiled=true` — and not a folder: a library that has just been given folders holds most of its assets outside them, and "show me what is not filed yet" is the first question an operator asks while sorting. The two filters are exclusive on the wire: a `folder_id` is the more specific one, so the server ignores `unfiled` when a folder is named.
- Every folder below it is one row, indented by its depth, carrying the folder's name and the number of assets filed **directly** in it — a subfolder's assets are counted in the subfolder, not in its parent.
- In one principal's scope the tree is that principal's folders. In the **All principals** scope the tree is **grouped**: each principal is a heading carrying the number of folders it owns, and its folders hang under it. Two principals may each hold a folder called `Corporate`, so the grouping is what tells them apart. A principal with no folders shows **No folders**.
- A principal's heading is a button: clicking it switches the scope to that principal.
- **A card can be dragged onto a folder.** Drag it out of the grid and drop it on a folder row — the row lights up under the pointer — and the asset is filed there. Dropping it on **All media** takes it out of its folder. The write is the same one the detail page's picker makes; the server scopes it by the asset's principal, so a folder of another principal is refused. Dragging needs a mouse; on a touch screen the detail page's picker is the way.
- Picking a folder sends the scalar `?folder_id=<uuid>` — one folder at a time. The server accepts the bracket form but honours only the first id, and a multi-folder filter that silently returns one folder's rows is worse than none.
- The tree shows the folders of the principals **in scope**. A folder of a principal outside the scope would filter the listing down to nothing, so it is not offered, and changing the scope drops a folder selection the new scope cannot filter by.
- The upload dialog has a folder picker of its own, offering only the folders of the principal the upload is filed under; changing that principal drops the picked folder. It opens on the folder the panel is scoped to, when the upload's principal owns it — the operator is looking at that folder, so that is where the file belongs.

### Picking a folder

Both places that file an asset into a folder — the detail page and the upload dialog — pick it from the same **folder picker**, and the picker draws the tree rather than a flat list. A flat list cannot say whether a folder called `2026` sits under `Corporate` or under `Templates`, and filing an asset in the wrong one is a mistake nobody notices until the library is a mess.

- The control shows the chosen folder's **whole path** (`Corporate/2026`), so the tree is still readable once the menu is closed.
- The menu lists the folders of one principal, indented by their depth, each with the number of assets filed in it, and a tick on the chosen one.
- The top row, **No folder**, takes the asset out of its folder.
- An asset filed in a folder the panel cannot resolve — because the folder belongs to a principal outside the operator's scope — is shown as **Unknown folder** rather than as an empty picker: the asset _is_ filed somewhere, and saying otherwise would be a false claim.

The write is the same in both places: `PATCH /api/v1/media/{id}` with a `folder_id`. The server scopes it by the asset's principal, so a folder of another principal is refused with a **422**.

The tree and the kind dropdown are offered only when the host's core carries the folders release. The panel probes `GET /api/v1/media/folders`, and a **404** means the core has no folders endpoint at all — so the panel offers neither filter rather than offering one the server ignores. On such a core the rail is not drawn at all, and the scope dropdown stays in the toolbar.

### Selecting several assets

The grid can act on more than one asset at a time. The toolbar's **Select** button turns the selection mode on: every card grows a tick, and a click now adds or removes the asset instead of opening its detail page. The bar under the toolbar counts the selection and offers what can be done with it.

- **Select all** takes every loaded row — the panel holds one page at a time, so this is the page, not the whole library.
- **Move to folder** opens a dialog with the folder picker (see above). It files the selected assets into the chosen folder, one `PATCH /api/v1/media/{id}` per asset.
- **Delete** asks first. The confirmation names the number of assets, and nothing is deleted until it is confirmed.
- The **X** leaves the selection mode and drops the selection.

A folder belongs to one principal, and the server scopes a folder write by the asset's principal — filing an asset of another principal into a folder is refused with a **422**. So a selection that spans principals cannot be filed into one folder as a whole: the move dialog asks which principal's folders to use, and the assets of the others stay where they are. The dialog says how many those are, and the toast after the move says what happened: how many were filed, how many stayed, and how many the server refused — a filename already taken in the target folder (`FOLDER_FILENAME_TAKEN`) is the usual reason.

Deleting is per asset as well, one `DELETE /api/v1/media/{id}` each. An asset that is not the caller's to delete is refused with a **403**; the rest are deleted, and the toast counts both.

### Creating a folder

The rail's **New folder** button opens an overlay — the upload dialog's shape, because both are the operator's dialog. It asks for three answers:

- the **name**,
- the **principal** the folder belongs to — a folder always belongs to exactly one, so the all-principals scope has to pick one. The overlay opens on the principal in scope; in the all-principals scope it opens on the principal that owns the folder currently selected, and without one, on the first principal in the list,
- the **parent** it sits under, chosen from a **tree picker** rather than a `<select>`: a select cannot show the tree, and the tree is the thing being chosen between. Changing the principal clears the picked parent, because a parent and the folder under it belong to the same principal.

The overlay opens on the folder currently selected. A path preview shows what the folder will be called — the parent's path plus the name — before it is called.

The create call is `POST /api/v1/media/folders`. A **duplicate sibling name** is refused by the server with a **422** `NOT_UNIQUE`, and the overlay says so in the operator's words. The new folder joins the tree and becomes the selected folder.

## Kind mark

Every asset carries a **kind** — the advisory mark `asset`, `template` or `example`, `asset` by default. The toolbar carries a dropdown for it: `All kinds` / `Asset` / `Template` / `Example`. Picking one sends `?kind=<value>`.

The mark is a label and the operator owns it:

- The detail drawer shows the asset's kind as a select, and changing it PATCHes `{"kind": …}`.
- The mark never refuses an asset — a theme filed as a plain `asset` still renders, and a file marked `template` is still whatever its bytes are.
- A value **outside** the three is refused on write: the upload endpoint answers **400** `INVALID_KIND`, and the panel's `PATCH /api/v1/media/{id}` answers **422** `INVALID_KIND`.
- The listing filter is lenient where the write path is not: `?kind=bogus` is dropped and the listing comes back unfiltered rather than failing.

## Wire shape: `?principal_id[]=…`

The frontend sends the request as repeated `?principal_id[]=…` keys. The **array-bracket form** is required — the plain repeated scalar form (`?principal_id=…&principal_id=…`) is collapsed to the LAST value by PHP's `parse_str`, which silently dropped everything except the last group-principal when the all-principals scope sent every visible id. The `[principal_id]` parameter is defined in the OpenAPI spec — see the auto-generated [Media API reference](/reference/api/media#query-parameters).

## The search box and the plugin filter only work now

The panel used to send `?search=` and `?plugin=`, while core read `?q=` and `?plugin_slug=` — two spellings for the same two filters. Neither reached the server, so the search box filtered nothing at all.

Core now accepts either spelling and the panel sends core's canonical ones, so the box filters the grid for the first time: a case-insensitive substring match on the asset's **prompt**, **filename**, stored URL, source URL and id. The plugin filter is the same fix on the panel's side — the request carries it, but the panel exposes no control for it, so nothing on screen changes.

## Keyboard / a11y notes

- The three dropdowns — scope, file type, kind — open a menu marked `role="menu"`. Each row in it is a `role="menuitemradio"` button carrying `aria-checked` on the chosen one, and the trigger carries `aria-haspopup="true"` and `aria-expanded`.
- Each dropdown closes on an outside click and on Escape.
- The tree's rows — the **All media** root and every folder — are buttons with `aria-pressed` marking the selected folder.
- The rail's close button is a real button with an accessible name, so the drawer can be dismissed from the keyboard.

## Temporary files

The grid hides temp rows by default — they crowd out the permanent grid with a stream of short-lived voice transcripts and other auto-uploaded artefacts. Three UI surfaces let operators opt back in:

- **"Include temporary files" toggle** in the panel's toolbar, beside the **Upload** button. State persists in `localStorage` (`spora.media.showTemporary.v1`, default off). When off, the listing query sends `?include_temporary=false` and the filter happens server-side. Flipping the toggle reloads the grid.
- **"Temporary" corner badge** on `MediaCard`. Renders only when the toggle is on and the asset is temp; otherwise the row is filtered out before it reaches the grid.
- **"Keep file" button** on `MediaDetailPage` for temp assets. Calls `POST /api/v1/media/{id}/keep` to pin the row as permanent so the per-(user, agent) retention sweep leaves it alone. Idempotent — calling on a non-temp row returns 200 without re-saving. A toast confirms the pin; the detail payload refreshes with `is_temporary: false`.

Keep-file auth: global admin OR the asset's `user_id == currentUserId`. Non-owners receive 403; missing rows 404.

The retention sweep itself runs server-side (`media:gc --temporary [--older-than-hours N]`, default 24 h). Per-agent retention is governed by `agents.voice_message_retention_count` (default 5; 0 disables auto-purge — operators must then run the GC manually or hit `/keep` per row). The ceiling is a per-(user, agent) count of temp rows, and it is what the upload controller enforces: when a multipart upload sets `is_temporary` _and_ names an `agent_id`, `MediaArchiveService::enforceTempRetention()` trims that pair's temp set back under the agent's ceiling. The value is a `0`–`100` integer, range-checked server-side and answered with a `422` when it is not. See the Media API reference for the full lifecycle: `POST /api/v1/media` (temp opt-in via `is_temporary`), `GET /api/v1/media?include_temporary=true`, `POST /api/v1/media/{id}/keep`, and the `media:gc` CLI.

## What lands in the archive

What ends up in the grid is decided by the settings on the **Media** tab of
**Settings → Runtime settings**. They are ordinary settings — the same four-layer chain as every
other field, so a value saved there wins over one set in `.env`. See
[Config keys](/reference/config-keys) for the `config.php` and env-var spellings.

| Setting                                   | Default           | What it decides                                                                                           |
| ----------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `SPORA_MEDIA_ARCHIVE_PROMOTE_EXTERNAL`    | `true`            | When on, a URL an agent was given is downloaded and stored. Turn it off to keep only the link.            |
| `SPORA_MEDIA_ARCHIVE_FETCH_TIMEOUT`       | `30`              | Seconds allowed for the remote media fetch.                                                               |
| `SPORA_MEDIA_ARCHIVE_MAX_PROMOTE_BYTES`   | `104857600`       | 100 MiB. A larger response is recorded as external rather than downloaded.                                |
| `SPORA_MEDIA_ARCHIVE_FFPROBE_ENABLED`     | `false`           | Extracts the duration with `ffprobe`. Needs ffprobe on `PATH`, and is slower to ingest.                   |
| `SPORA_MEDIA_ARCHIVE_ALLOWED_IMAGE_TYPES` | `png, jpeg, webp` | The raster image formats offered as attachments. SVG is not a raster format — see the two settings below. |
| `SPORA_MEDIA_ARCHIVE_ALLOW_ACTIVE_TYPES`  | `false`           | Permits HTML and SVG assets to be created and embedded.                                                   |
| `SPORA_MEDIA_ARCHIVE_ALLOW_EMBED_SCRIPTS` | `false`           | Lets embedded HTML and SVG run their own scripts.                                                         |

An asset recorded as **external** — because promotion is off, or because the response was over the
ceiling — still appears in the grid, with the source URL in the detail drawer instead of a stored
copy. There are no bytes on this side to hand out, so the download route answers
`404 asset_not_found` for it.

### HTML and SVG

HTML and SVG are the two formats that can carry script. They are off by default and are
enabled with `SPORA_MEDIA_ARCHIVE_ALLOW_ACTIVE_TYPES`. (The serving boundary also covers
XHTML, which is the XML flavour of HTML — the toggle offers HTML and SVG, not XHTML.)

Two settings, because two different questions are being answered:

- **May these formats exist at all?** `SPORA_MEDIA_ARCHIVE_ALLOW_ACTIVE_TYPES` decides it.
  With it off, an agent cannot create an HTML or SVG asset and one cannot be uploaded.
- **May an embedded copy run its scripts?** `SPORA_MEDIA_ARCHIVE_ALLOW_EMBED_SCRIPTS`
  decides it, and only applies to the embed — the framed preview in the chat and on the
  detail page. With it off, an embedded HTML or SVG still renders; its scripts just do not
  run.

Whatever the settings say, a script-capable asset served as a plain download or opened
directly in a browser **never** runs its script. The serving layer puts every such
response in a sandbox, so the document renders but cannot reach your session, your data,
or your dashboard. The embed is the only place script can run, and only if you say so.

Where you see it depends on where you are looking. On the **detail page** the frame is the
preview — the live asset, with a **Download** button beside it. In the **chat**, the frame
sits in the tool call that produced the asset, next to its download card; and when the agent
asks for it — by linking the asset's embed route — the frame renders in the agent's message
too, in place, as a block. That is the difference between a download button and a widget in
the conversation: the agent has to ask, and whether the frame may run script is still your
call. An SVG in the message is static — a browser does not run an SVG's script inside an
image — while the framed copy runs it, if you allowed scripts.

Enabling either setting is a decision about who can author content in your installation.
An agent that can write HTML can put anything in it.

## Where the data comes from

| Endpoint                                       | Used for                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/media?principal_id[]=…`           | The grid itself — paginated, filtered, scoped (`?folder_id=`, `?kind=`). Returns `{ data: { assets, page, perPage, total, lastPage } }`.                                                                                                                                                     |
| `GET /api/v1/media/folders?principal_id=…`     | The rail's folder tree — one flat list per principal, each folder with its `asset_count`.                                                                                                                                                                                                    |
| `POST /api/v1/media/folders`                   | Create a folder — `name`, `parent_id`, `principal_id`. A duplicate sibling name is a **422** `NOT_UNIQUE`.                                                                                                                                                                                   |
| `POST /api/v1/media`                           | The upload. Takes the file plus `principal_id`, `folder_id` and `kind`; a `kind` outside the vocabulary is a **400**, a `folder_id` that does not exist is a **404**, and a filename the folder already holds is a **422** `FOLDER_FILENAME_TAKEN`.                                          |
| `GET /api/v1/principals/me`                    | The list of visible principals (typed: `user` vs `group`). Drives the scope dropdown's options and labels.                                                                                                                                                                                   |
| `GET /api/v1/groups`                           | Friendly group names keyed by `principal_id`. The scope dropdown falls back to `Group #N` if this endpoint is unavailable.                                                                                                                                                                   |
| `GET /api/v1/media/{id}`                       | Detail drawer payload.                                                                                                                                                                                                                                                                       |
| `GET /api/v1/assets/{filename}`                | One-click download — streams the file through `AssetController::show()` (token + ownership checks).                                                                                                                                                                                          |
| `GET /api/v1/media/{id}/embed`                 | The live embed — the framed preview of a script-capable asset. Signed-in callers only (a public share token does not unlock it), and only while `SPORA_MEDIA_ARCHIVE_ALLOW_ACTIVE_TYPES` is on. Served sandboxed; scripts run only when `SPORA_MEDIA_ARCHIVE_ALLOW_EMBED_SCRIPTS` is on too. |
| `PATCH /api/v1/media/{id}`                     | Edit filename, tags, metadata, prompt, public sharing — and now `folder_id` and `kind`. Validators are in `MediaArchiveUpdateValidator`.                                                                                                                                                     |
| `POST /api/v1/media/{id}/public-token/refresh` | Rotate the public-access token for a shared asset.                                                                                                                                                                                                                                           |
| `POST /api/v1/media/{id}/keep`                 | Pin a temp row as permanent so the retention sweep leaves it alone. Idempotent; admin-or-owner auth.                                                                                                                                                                                         |

## Related

- [Concepts → Media assets](/reference/concepts/media-assets) — plugin-author guide for embedding media in tool results (AssetStore, MediaEmbed, StoresBinaryAssets trait).
- [Concepts → Media folders](/reference/concepts/media-folders) — the folder model, the two uniqueness rules and the advisory `kind` mark behind the folder tree and the kind dropdown.
- [Concepts → Architecture → Tool ownership is principal-scoped](/reference/concepts/architecture#tool-ownership-is-principal-scoped) — migration 0067 introduced the principal_id column that drives the new ownership union.
- [Media API reference](/reference/api/media) — auto-generated from `openapi.json`; refresh with `npm run gen:api`.
