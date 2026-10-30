---
title: Media folders
description: Folders in the Media Archive — the tree, the two uniqueness rules, the advisory kind mark, and the themes and templates that live in them.
---

# Media folders

A **folder** is a named container in the [Media Archive](/reference/concepts/media-assets). It holds assets, it nests, and it belongs to exactly one principal. Folders are how an operator curates a library that has outgrown one flat list — a `Branding` folder for the assets every document uses, a `2026` folder under it for this year's drafts.

The operator creates, renames, moves and deletes folders. The assistant may file an asset into one and search within one; it may not reorganise the tree.

## What a folder is

`media_folders` (migration `0097`) is a principal-scoped tree:

| Column         |                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`           | UUID, the primary key                                                                                                   |
| `principal_id` | the tenant boundary — `ON DELETE RESTRICT`, the same shape `media_assets.principal_id` uses                             |
| `parent_id`    | the enclosing folder, null for a top-level one — `ON DELETE CASCADE`, so deleting a folder takes its subfolders with it |
| `name`         | the folder's own name: one path segment, at most 255 characters                                                         |
| `path`         | the path from the tenant root — `/Corporate`, `/Corporate/2026` — at most 512 characters                                |

`media_assets` gains two columns and one index:

- `folder_id` — the folder the asset is filed in, `NULL` for the root. Deleting a folder leaves its assets in the root rather than deleting them.
- `kind` — the advisory mark: `asset`, `template` or `example`, defaulting to `asset`.
- `UNIQUE (folder_id, filename)` — filenames are unique within a folder.

## The two uniqueness rules

**Sibling folder names are unique** per principal. `UNIQUE (principal_id, path)` is what enforces it: two siblings with one name produce one path and collide, while the same name under two different parents does not. The check lives in the service, so a create or a rename that would land on a taken path is refused with a **422** and never reaches the caller as a database exception.

**Filenames are unique within a folder.** The root is not constrained: an asset with no folder has a `NULL` folder, and a SQL unique index does not compare `NULL`s — so two assets in the root may share a filename.

A folder's **name is one path segment**. A name with a `/` in it is refused with a **400**, because the library reads a theme's name as a name and never as a path.

## The kind mark

`kind` is **advisory**. It is a filter hint for the operator's UI, and nothing in the read or the write path refuses an asset because of it: a theme filed as a plain `asset` still renders, and a template marked `example` is still a template. The mark is a label, and the operator changes it whenever they like.

The three values are a closed set **for the filter only**: `GET /api/v1/media?kind=bogus` drops the unknown value and returns the unfiltered listing rather than an error.

## The API

| Route                               |                                                                  |
| ----------------------------------- | ---------------------------------------------------------------- |
| `GET /api/v1/media/folders`         | the principal's folders, flat                                    |
| `POST /api/v1/media/folders`        | create — `name`, optional `parent_id`                            |
| `PATCH /api/v1/media/folders/{id}`  | rename (`name`) and/or move (`parent_id`)                        |
| `DELETE /api/v1/media/folders/{id}` | delete — subfolders go with it, the assets fall back to the root |

Auth and CSRF are enforced by the route's middleware. A folder that belongs to another principal is a **404**, not a 403: the caller has no business knowing that it exists.

One folder on the wire:

```json
{
  "id": "6f1c…",
  "name": "Corporate",
  "path": "/Corporate",
  "parent_id": null,
  "asset_count": 4
}
```

`asset_count` counts the assets filed directly in that folder; a subfolder's assets are counted in the subfolder. The listing arrives as `{"data": {"folders": [...]}}`.

A rename or a move rewrites the folder's path **and the paths of every descendant** — they are recomputed from the names under the new root, so a stale segment cannot survive a move. A folder cannot be moved inside itself (**400**).

## Filtering the library

`GET /api/v1/media` takes two filters for the two new columns:

- `?folder_id=<uuid>` — the assets filed in that folder. A folder of another principal yields no rows rather than somebody else's.
- `?kind=asset|template|example` — the assets carrying that mark.

Every asset in the listing carries `folder_id` and `kind`, so a client does not have to ask twice.

## What the assistant may do

The `media_folders` tool carries the folder surface for the agent:

| Operation       |                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `list_folders`  | the principal's folders: `id`, `name`, `path`, `parent_id`, `asset_count`                              |
| `file_asset`    | file an asset into a folder (`asset_id` + `folder_id`); omit `folder_id` to move it back into the root |
| `search_assets` | the assets inside one folder (`folder_id`)                                                             |

There is no `create_folder`: the tree is the operator's. `file_asset` fails when the folder already holds a file with that name, and every operation is scoped to the calling principal — an asset or a folder of another principal is reported as missing.

## Themes and templates

A **theme** is a media-library folder. Its name is the theme's name, and its files are the library's own:

```text
Corporate/                     ← the folder; "Corporate" is the theme's name
  theme.yml                    ← the manifest
  styles.yml                   ← the Word style slots
  layouts.yml                  ← the slides' layout roles
  text-styles.yml              ← the slides' named text styles
  template.pptx                ← the slides' master (optional)
```

- The folder is **top-level**. The library treats a `/` in a theme name as a path, so a theme's name is one segment and the folder's full path is never used as a name.
- The folder's **UUID resolves as well as its name**, so a document can pin a theme by a value that does not change when the operator renames the folder.
- The manifest is the **slides** manifest, which is a strict superset of the Word one: `name`, `description`, `author`, and — for a deck — `dark`, `colors`, `fonts`, `style`. The Word half refuses a key it does not know, so it is served a **projection** of the manifest: `name`, `description` and `author`, which is the whole of what it reads. That projection is the one lossy step in the arrangement, and it loses nothing the Word half uses — the Word half's colours come from `styles.yml`, not from the manifest.
- A media theme **shadows a built-in theme of the same name**: the library asks the media library first and falls back to the themes that ship with the package.
- A folder that lists a `template.pptx` the library cannot serve is refused by name (`MarkdownPresentation\Exception\UnservedTemplate`) rather than drawn without.

The `kind` mark says what a file is **for**; it never says what it **is**. A theme whose files are marked `asset` is still a theme, and a file marked `template` is still whatever its bytes are.

The [Office plugin](/develop/plugins/reference/office) is what reads these folders.
