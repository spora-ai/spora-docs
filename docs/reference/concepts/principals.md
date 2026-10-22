---
title: Principals and groups
description: Who can see which principal — the group authorisation model, the existence-hiding rules, and what happens when a caller asks for a principal it cannot see.
---

# Principals and groups

Spora's ownership model is principal-scoped: an agent, an LLM-driver preference and a group all hang off a row in `principals`, not off a user. A person is a `user-principal` and may simultaneously act as the `group-principal` of every group they belong to. The [schema reference](/reference/concepts/schema) describes the tables; this page describes who may read and write what.

## Group authorisation

A group's settings surface is split by two predicates.

**Reading** requires membership. A caller who is not a member of the group gets `404 GROUP_NOT_FOUND` — not `403`. The distinction is deliberate: a `403` confirms the group exists, so answering `404` to a non-member is what keeps the group's existence itself a secret. A global admin without membership is treated as a non-member here; admins manage members through the admin-panel overlay instead.

**Writing** requires membership _and_ the right role. `owner` and `admin` may write, as may a global admin. A member with a lesser role gets `403 FORBIDDEN` — the group is known to them, so hiding its existence would buy nothing.

| Caller                          | Read  | Write |
| ------------------------------- | ----- | ----- |
| Member, role `owner` or `admin` | yes   | yes   |
| Member, any other role          | yes   | `403` |
| Global admin, not a member      | `404` | `404` |
| Global admin and a member       | yes   | yes   |
| Not a member                    | `404` | `404` |

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
- [API reference](/reference/api/groups) — every group endpoint with its status codes
