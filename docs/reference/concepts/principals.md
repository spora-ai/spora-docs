---
title: Principals and groups
description: Who can see which principal — the group authorisation model, the existence-hiding rules, and what happens when a caller asks for a principal it cannot see.
---

# Principals and groups

Spora's ownership model is principal-scoped: an agent, an LLM-driver preference and a group all hang off a row in `principals`, not off a user. A person is a `user-principal` and may simultaneously act as the `group-principal` of every group they belong to. The [schema reference](/reference/concepts/schema) describes the tables; this page describes who may read and write what.

## Group authorisation

A group's settings surface is split by two predicates.

**Reading** requires membership. A caller who is not a member of the group gets `404 GROUP_NOT_FOUND` — not `403`. The distinction is deliberate: a `403` confirms the group exists, so answering `404` to a non-member is what keeps the group's existence itself a secret. A global admin without membership is treated as a non-member here; admins manage members through the admin-panel overlay instead.

**Writing** requires the right role, and for a global admin no membership at all. A member with role `owner` or `admin` may write; a member with a lesser role gets `403 FORBIDDEN` — the group is known to them, so hiding its existence would buy nothing. A global admin may write any group, member or not, because the admin panel edits groups it does not belong to; the write used to be guarded by the route's `AdminMiddleware`, which a group's own owner could not pass. A caller who is neither a member nor a global admin gets `404 GROUP_NOT_FOUND`, so an outsider learns nothing about a group that exists.

| Caller                          | Read  | Write |
| ------------------------------- | ----- | ----- |
| Member, role `owner` or `admin` | yes   | yes   |
| Member, any other role          | yes   | `403` |
| Global admin, not a member      | `404` | yes   |
| Global admin and a member       | yes   | yes   |
| Not a member                    | `404` | `404` |

The asymmetry in the third row is the point of having two predicates. Reading is what keeps a group's existence from outsiders; writing is what lets the operator's own admin panel reach a group it manages. Hiding the group from the admin would break the panel, and letting outsiders read it would undo the hiding.

**The table describes the group row** — `PATCH /api/v1/groups/{id}`, the route that carries the name, the description, the information block and the avatar. The routes _under_ `/api/v1/groups/{id}/` are not one surface, and they do not all gate the same way:

- **Membership-gated, a global admin included** — the group's agents (`/agents`), its locations (`/locations`), its tool settings (`/tools`), its LLM configs (`/llm-configs`) and its preferences (`/preferences`). These belong to the people who run the group, so a global admin that is not a member gets `404 GROUP_NOT_FOUND` on every one of them.
- **Open to a global admin that is not a member** — the member routes (`/members`) and the picture routes (`/picture/image`). A global admin may read a group's membership, add and remove members, and upload or clear the group's avatar without belonging to it. These two carry an explicit global-admin bypass; every other route under `/api/v1/groups/{id}/` resolves the caller through `callerCanSeeGroup()`, which is membership-only.

## Group information and locations

A group owns more than a name. Its **description** is the short blurb a group list shows; its **information** is the rich, Markdown-formatted block that says how to reach the organisation — an address, a switchboard, a note about which entrance to use. Its **locations** are the addresses a tool can send something to.

All three are reachable by the agent, and the agent reaches them through the principal: `principal_info` answers with the group's own name, description, information and locations, not with the profile of whoever happens to own the group.

`groups.information` is part of the group payload on both routes — the list (`GET /api/v1/groups`) and the detail (`GET /api/v1/groups/{id}`) — because the two are documented as byte-identical. It is written through the group update route:

```http
PATCH /api/v1/groups/{id}
```

```json
{ "name": "Acme Corp", "description": "We build things", "information": "## Address\n…" }
```

→ `200` `{ "data": { "group": { …, "information": "## Address\n…" } } }`

An empty `information` clears the block rather than storing an empty string; a key that is not mentioned at all leaves the stored block untouched.

Locations have their own routes, all keyed on the group's principal — the same place a person's locations live, on their user-principal:

| Method   | Path                                         | Success                                    |
| -------- | -------------------------------------------- | ------------------------------------------ |
| `GET`    | `/api/v1/groups/{id}/locations`              | `200` `{ "data": { "locations": [ … ] } }` |
| `POST`   | `/api/v1/groups/{id}/locations`              | `201` `{ "data": { "location": { … } } }`  |
| `PATCH`  | `/api/v1/groups/{id}/locations/{locationId}` | `200` `{ "data": { "location": { … } } }`  |
| `DELETE` | `/api/v1/groups/{id}/locations/{locationId}` | `200` `{ "data": { "deleted": true } }`    |

A location is `{ "id": 1, "name": "HQ", "address": "…", "is_default": true }`. `POST` and `PATCH` take `{ "name": string, "address": string, "is_default": boolean }`; on `POST` the name and the address are required and must not be empty, and on `PATCH` only the keys that are present are checked. Marking a location as the default clears the flag on the others of the same principal — there is one default per principal, not one per group and not one per person.

Error semantics on the group routes:

| Situation                                       | Response               |
| ----------------------------------------------- | ---------------------- |
| Not authenticated                               | `401`                  |
| Group missing, or caller is not a member        | `404 GROUP_NOT_FOUND`  |
| Member whose role is below `admin`              | `403 FORBIDDEN`        |
| Empty `name` / `address`                        | `422 VALIDATION_ERROR` |
| Location id not owned by this group's principal | `404 NOT_FOUND`        |

A location id that belongs to another principal answers `404`, never `403`: the row is not the caller's to ask about, and a `403` would confirm that it exists.

The membership `404` is the whole of the gate on these four routes — a global admin that is not a member gets `404` here too, because they are the group's settings rather than its row. The write gate a global admin _does_ pass is the one on `PATCH /api/v1/groups/{id}`, described in the authorisation table above; the member and picture routes are the other two that carry an admin bypass.

### The same locations, for a person

The same rows answer for a person. `GET /api/v1/me/locations` and its three siblings keep the wire contract they have always had — same paths, same envelopes, same status codes — but the storage behind them is now the caller's **user-principal** rather than the user row. A person and a group are two principals with the same kind of locations, and the tool reads whichever one it is asked about.

## Writes always land on the group

The `tools` and `preferences` upserts write to the **group's** group-principal, never to a principal named in the request body. The `principal_id` field is ignored on the LLM-config `POST` for the same reason: honouring it would let a caller who may write to group 12 redirect the write to a different principal they happen to know the id of. The target principal is a property of the route, not of the body.

## Filtering agents by principal

`GET /api/v1/agents` takes a repeatable `?principal_id=` parameter, in any of the three spellings PHP accepts — `?principal_id=1`, `?principal_id=1&principal_id=2`, or `?principal_id[]=1&principal_id[]=2`.

The requested ids are **intersected** with `PrincipalResolver::visiblePrincipalIds()` — the set of principals the caller may act as. An id outside that set is dropped silently rather than rejected. A `403` or a `404` would tell the caller that the id exists but is not theirs, which is exactly the probe the intersection prevents: an outsider learns nothing about a principal they cannot see, and the response is indistinguishable from a request for an id that does not exist.

Omitting the filter is the legacy behaviour and returns every agent the caller can see across all of their visible principals.

## Creating an agent under a principal

`POST /api/v1/agents` accepts an optional `principal_id` in the body. The caller must be a global admin **or** control the target principal — `AgentPrincipalService::callerControlsPrincipal()` is the check.

When the field is omitted, or when the caller does not control the principal they named, the agent lands on the caller's own user-principal, which is materialised on demand. The agent is never left unowned, and a caller cannot smuggle an agent into a principal they merely know the id of. A principal that still has dependents cannot be deleted — the controller answers a structured `409` carrying the `agent_ids`, so the operator transfers or deletes them first through `POST /api/v1/agents/{id}/transfer`.

## What's next

- [Schema](/reference/concepts/schema) — the `principals`, `groups` and `agents` tables
- [Architecture](/reference/concepts/architecture) — where principal scoping meets the orchestrator
- [Tool system → `principal_info`](/reference/concepts/tools#principal-info-—-principalinfotool) — what the agent reads about the principal it belongs to
- [API reference](/reference/api/groups) — every group endpoint with its status codes
