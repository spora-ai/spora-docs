# Agents

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/agents` — Index Agent

**Tags:** Agents

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agents` — Store Agent

**Tags:** Agents

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{agentId}/memories` — Index AgentMemory

**Tags:** Agents

### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `agentId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agents/{agentId}/memories` — Store AgentMemory

**Tags:** Agents

### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `agentId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PATCH /api/v1/agents/{agentId}/memories/reorder` — Reorder AgentMemory

**Tags:** Agents

### Path parameters

| Name      | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `agentId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{agentId}/memories/{memoryId}` — Show AgentMemory

**Tags:** Agents

### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `agentId`  | string | yes      |             |
| `memoryId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/agents/{agentId}/memories/{memoryId}` — Update AgentMemory

**Tags:** Agents

### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `agentId`  | string | yes      |             |
| `memoryId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/agents/{agentId}/memories/{memoryId}` — Destroy AgentMemory

**Tags:** Agents

### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `agentId`  | string | yes      |             |
| `memoryId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}` — Show Agent

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PATCH /api/v1/agents/{id}` — Update Agent

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/agents/{id}` — Destroy Agent

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/export` — ExportAgent AgentTemplate

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/scheduled-runs` — Index ScheduledRun

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agents/{id}/scheduled-runs` — Store ScheduledRun

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/scheduled-runs/{runId}` — Show ScheduledRun

**Tags:** Agents

### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/agents/{id}/scheduled-runs/{runId}` — Update ScheduledRun

**Tags:** Agents

### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/agents/{id}/scheduled-runs/{runId}` — Destroy ScheduledRun

**Tags:** Agents

### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agents/{id}/scheduled-runs/{runId}/trigger` — Trigger ScheduledRun

**Tags:** Agents

### Path parameters

| Name    | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| `id`    | string | yes      |             |
| `runId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/templates` — Index PromptTemplate

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agents/{id}/templates` — Store PromptTemplate

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/templates/{templateId}` — Show PromptTemplate

**Tags:** Agents

### Path parameters

| Name         | Type   | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `id`         | string | yes      |             |
| `templateId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/agents/{id}/templates/{templateId}` — Update PromptTemplate

**Tags:** Agents

### Path parameters

| Name         | Type   | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `id`         | string | yes      |             |
| `templateId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/agents/{id}/templates/{templateId}` — Destroy PromptTemplate

**Tags:** Agents

### Path parameters

| Name         | Type   | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `id`         | string | yes      |             |
| `templateId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/tools/operations` — GetToolsOperations AgentTool

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/tools/status` — GetToolsStatus AgentTool

**Tags:** Agents

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/agents/{id}/tools/{toolId}/enable` — EnableTool AgentTool

**Tags:** Agents

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/agents/{id}/tools/{toolId}/enable` — DisableTool AgentTool

**Tags:** Agents

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/tools/{toolId}/operations/{operation}` — GetOperationOverride AgentOverride

**Tags:** Agents

### Path parameters

| Name        | Type   | Required | Description |
| ----------- | ------ | -------- | ----------- |
| `id`        | string | yes      |             |
| `toolId`    | string | yes      |             |
| `operation` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PATCH /api/v1/agents/{id}/tools/{toolId}/operations/{operation}` — PatchOperationOverride AgentOverride

**Tags:** Agents

### Path parameters

| Name        | Type   | Required | Description |
| ----------- | ------ | -------- | ----------- |
| `id`        | string | yes      |             |
| `toolId`    | string | yes      |             |
| `operation` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/tools/{toolId}/override` — GetOverride AgentOverride

**Tags:** Agents

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/agents/{id}/tools/{toolId}/override` — PutOverride AgentOverride

**Tags:** Agents

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/agents/{id}/tools/{toolId}/override` — DeleteOverride AgentOverride

**Tags:** Agents

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/agents/{id}/tools/{toolId}/status` — GetToolStatus AgentTool

**Tags:** Agents

### Path parameters

| Name     | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `id`     | string | yes      |             |
| `toolId` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
