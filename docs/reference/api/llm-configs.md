# Llm-configs

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/llm-configs` — Index LLMConfig

**Tags:** Llm-configs

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/llm-configs` — Store LLMConfig

**Tags:** Llm-configs

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/llm-configs/global` — GlobalConfigs LLMConfig

**Tags:** Llm-configs

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/llm-configs/{id}` — Show LLMConfig

**Tags:** Llm-configs

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/llm-configs/{id}` — Update LLMConfig

**Tags:** Llm-configs

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/llm-configs/{id}` — Destroy LLMConfig

**Tags:** Llm-configs

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/llm-configs/{id}/set-default` — SetDefault LLMConfig

**Tags:** Llm-configs

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
