# Memories

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/memories` — Index Memory

**Tags:** Memories

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/memories` — Store Memory

**Tags:** Memories

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PATCH /api/v1/memories/reorder` — Reorder Memory

**Tags:** Memories

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/memories/{id}` — Show Memory

**Tags:** Memories

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/memories/{id}` — Update Memory

**Tags:** Memories

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/memories/{id}` — Destroy Memory

**Tags:** Memories

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
