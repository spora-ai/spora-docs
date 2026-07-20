# Assets

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/assets/{filename}` — Show Asset

**Tags:** Assets

### Path parameters

| Name       | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `filename` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
