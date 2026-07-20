# Public

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/public/media/{id}` — Show PublicMedia

**Tags:** Public

### Path parameters

| Name | Type   | Required | Description |
| ---- | ------ | -------- | ----------- |
| `id` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
