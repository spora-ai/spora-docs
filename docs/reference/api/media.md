# Media

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/media` — Index MediaArchive

**Tags:** Media

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/media` — Store MediaUpload

**Tags:** Media

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/media/allowed-types` — Index MediaAllowedTypes

**Tags:** Media

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/media/{id}` — Show MediaArchive

**Tags:** Media

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PATCH /api/v1/media/{id}` — Update MediaArchive

**Tags:** Media

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/media/{id}` — Destroy MediaArchive

**Tags:** Media

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/media/{id}/public-token/refresh` — RefreshPublicToken MediaArchive

**Tags:** Media

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
