# Plugins

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/plugins` — Index Plugins

**Tags:** Plugins

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/plugins` — Store Plugins

**Tags:** Plugins

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/plugins/catalog` — Catalog Plugins

**Tags:** Plugins

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PATCH /api/v1/plugins/{package}` — Update Plugins

**Tags:** Plugins

### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `package` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/plugins/{package}` — Destroy Plugins

**Tags:** Plugins

### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `package` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
