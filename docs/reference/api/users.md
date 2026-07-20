# Users

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/users` — Index User

**Tags:** Users

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/users` — Store User

**Tags:** Users

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/users/{id}` — Show User

**Tags:** Users

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/users/{id}` — Update User

**Tags:** Users

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PATCH /api/v1/users/{id}` — Update User

**Tags:** Users

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/users/{id}` — Destroy User

**Tags:** Users

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/users/{id}/roles` — ListRoles User

**Tags:** Users

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/users/{id}/roles` — GrantRole User

**Tags:** Users

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/users/{id}/roles/{role}` — RevokeRole User

**Tags:** Users

### Path parameters

| Name   | Type    | Required | Description |
| ------ | ------- | -------- | ----------- |
| `id`   | integer | yes      |             |
| `role` | string  | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
