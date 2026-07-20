# Tasks

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/tasks` — Index Task

**Tags:** Tasks

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/tasks` — Store Task

**Tags:** Tasks

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/tasks/{taskId}` — Show Task

**Tags:** Tasks

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/tasks/{taskId}` — Destroy Task

**Tags:** Tasks

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/tasks/{taskId}/approve` — Approve Task

**Tags:** Tasks

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/tasks/{taskId}/continue` — Continue Task

**Tags:** Tasks

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/tasks/{taskId}/reject` — Reject Task

**Tags:** Tasks

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/tasks/{taskId}/retry` — Retry Task

**Tags:** Tasks

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/tasks/{taskId}/retry-chain` — CancelRetryChain Task

**Tags:** Tasks

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `taskId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
