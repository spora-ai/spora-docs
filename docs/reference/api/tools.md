# Tools

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/tools` — Index Tool

**Tags:** Tools

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/tools/{toolId}/settings` — GetSettings Tool

**Tags:** Tools

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/tools/{toolId}/settings` — PutSettings Tool

**Tags:** Tools

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/tools/{toolId}/settings` — DeleteSettings Tool

**Tags:** Tools

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/tools/{toolId}/user-settings` — GetUserSettings Tool

**Tags:** Tools

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/tools/{toolId}/user-settings` — PutUserSettings Tool

**Tags:** Tools

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/tools/{toolId}/user-settings` — DeleteUserSettings Tool

**Tags:** Tools

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
