# Me

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/me/locations` — GetLocations UserProfile

**Tags:** Me

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/me/locations` — PostLocation UserProfile

**Tags:** Me

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/me/locations/{id}` — PutLocation UserProfile

**Tags:** Me

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/me/locations/{id}` — DeleteLocation UserProfile

**Tags:** Me

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/me/profile` — GetProfile UserProfile

**Tags:** Me

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/me/profile` — PutProfile UserProfile

**Tags:** Me

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
