# Mail-templates

> Generated from `docs/.vuepress/openapi.json`. Refresh with `npm run gen:api`. [Back to overview](/reference/api).

## `GET /api/v1/mail-templates` — Index MailTemplate

**Tags:** Mail-templates

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `POST /api/v1/mail-templates` — Store MailTemplate

**Tags:** Mail-templates

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/mail-templates/{id}` — Show MailTemplate

**Tags:** Mail-templates

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `PUT /api/v1/mail-templates/{id}` — Update MailTemplate

**Tags:** Mail-templates

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `DELETE /api/v1/mail-templates/{id}` — Destroy MailTemplate

**Tags:** Mail-templates

### Path parameters

| Name | Type    | Required | Description |
| ---- | ------- | -------- | ----------- |
| `id` | integer | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |

## `GET /api/v1/mail-templates/{name}/preview` — Preview MailTemplate

**Tags:** Mail-templates

### Path parameters

| Name   | Type   | Required | Description |
| ------ | ------ | -------- | ----------- |
| `name` | string | yes      |             |

### Responses

| Status    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `default` | JSON envelope: `{data: ...}` on success, `{error: {code, message}}` on error. |
