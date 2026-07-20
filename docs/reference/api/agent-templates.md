# Agent-templates

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/agent-templates` — Index AgentTemplate

**Tags:** Agent-templates

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agent-templates/import` — Import AgentTemplate

**Tags:** Agent-templates

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agent-templates/validate` — ValidatePayload AgentTemplate

**Tags:** Agent-templates

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agent-templates/{id}` — Show AgentTemplate

**Tags:** Agent-templates

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
