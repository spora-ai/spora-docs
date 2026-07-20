# Notifications

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/notifications` — Index Notification

**Tags:** Notifications

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/notifications` — DestroyAll Notification

**Tags:** Notifications

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/notifications/read-all` — MarkAllRead Notification

**Tags:** Notifications

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/notifications/{id}` — Destroy Notification

**Tags:** Notifications

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/notifications/{id}/read` — MarkRead Notification

**Tags:** Notifications

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
