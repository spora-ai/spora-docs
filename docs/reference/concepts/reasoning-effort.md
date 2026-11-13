---
title: Reasoning effort
description: The configurable reasoning-effort levels — which levels a configuration offers, which level a run uses by default, and where each of the two is resolved.
---

# Reasoning effort

Two different things are called "effort", and they are resolved in two different places.

- **The capability** — which levels _may_ be offered. A property of the LLM configuration.
- **The default** — which level a run uses when nobody names one. A property of the agent, falling back to the configuration.

Keeping them apart is what lets one agent run at a different depth than its siblings without a second LLM configuration, and it is why a configuration can offer one set of levels and default to a different one.

## The level set

The **level set** is the list of level names a configuration offers. It belongs to the LLM configuration — the `effort_levels` setting on the driver — and it is not a fixed list Spora ships.

**The operator's list wins outright.** A configuration that names its levels offers exactly those, whatever the model would take on its own. The operator knows what their endpoint accepts; Spora has no business second-guessing them, and a proxy in front of an Anthropic-compatible API may well accept a vocabulary no model id could imply.

**An empty list means the driver's own set applies** — the levels the driver derives on its own, which for the Anthropic driver are the ones the model takes and for the two OpenAI drivers the whole canonical scale. That is what every configuration did before the setting existed, so those rows keep working untouched.

The precedence, in the driver that owns it:

```text
supports_effort off     → no levels at all
an effort_levels list   → that list, in the order it was written
an empty effort_levels  → the driver's own set
```

**What a driver offers on its own.** The Anthropic driver reads the model id and answers with the levels that model takes — `low`, `medium`, `high`, `xhigh` and `max` for the current generation, fewer for an older one, and none at all for a model with no effort. The two OpenAI drivers do not narrow: they declare the whole canonical scale whatever the model takes, so a level the model refuses is one Spora still offers, and the request fails at the provider rather than quietly running at the model's default.

The order of the list is the picker's order, so write the levels in the order you want them offered.

## The default chain

A run's effort is resolved by walking a chain, and the first link that names a level wins:

```text
the message's effort
  → the agent's default_effort
    → the effective configuration's effort
      → the model default (null)
```

The **model default** is not a level. It is the absence of one: no effort parameter reaches the provider, and the provider applies whatever it would have applied anyway.

`EffortService::defaultFor()` owns the whole chain and is the only place that walks it. `LlmConfigResolver::resolveEffortDefault()` delegates to it, so the runtime and the endpoint that reports the default cannot drift apart.

**The agent's own default** is `agents.default_effort` — a nullable name on the agent row. It exists because the configuration's default belongs to the configuration, and one configuration is shared by every agent that resolves to it: without a link of its own, an agent cannot differ from its siblings.

**A level is only used when the level set contains it.** An agent default orphaned by a configuration change — the configuration's list narrowed and the agent's level is no longer in it — falls back to the configuration's default rather than to a level the endpoint would refuse. The same reconciliation the chat picker performs on the client.

**The message's effort** has three states, and all three survive to the write:

| Request body     | Meaning                                           |
| ---------------- | ------------------------------------------------- |
| key absent       | walk the chain from the agent's default           |
| `effort: ""`     | explicitly the model default — no level asked for |
| `effort: "high"` | that level, whatever the chain would have said    |

The resolved value lands on the task row. `NULL` means no level was resolved, and the database never stores an empty string.

## `supports_effort`

`supports_effort` is the toggle for an endpoint with **no reasoning-effort parameter at all** — not a model that takes fewer levels, but an endpoint that takes none. It is the mirror of the `supports_image_input` toggle already on the same drivers.

Off, the driver offers no levels: the agent gets no effort picker, and any effort sent is refused with `422 EFFORT_LEVEL_UNSUPPORTED`. The chat simply sends no `effort`, which is the model default.

The toggle is **tri-state on the wire and boolean in effect**. A configuration saved before the setting existed never stored the key, and that row keeps working: an absent value behaves as enabled. Only an explicit `false` disables the capability.

## Where a level name may be written

The level set is a **per-configuration** property. The default chain reaches further, and every link of it accepts the same kind of value — a level name, or nothing.

| Where                   | Field             | Empty means                              |
| ----------------------- | ----------------- | ---------------------------------------- |
| The LLM configuration   | `effort_levels`   | the driver's own set applies             |
| The LLM configuration   | `effort`          | the model default                        |
| The agent               | `default_effort`  | inherit the configuration's default      |
| A saved prompt template | `effort`          | inherit                                  |
| A scheduled run         | `effort_override` | inherit the template's, then the agent's |
| A chat or task body     | `effort`          | the model default                        |

The two empty meanings are deliberately different. A **message** that names no level asks for the model's own default, because the message is the last word on the turn it belongs to. A **template, a run or an agent default** that names no level inherits, because they are defaults and a default that overrode the thing it defaults to would be a loop.

**A level is checked against the level set where it is written.** A configuration's `effort` is refused at save time when the configuration does not offer it, with a message naming the levels it does offer, and narrowing the list under a saved default is refused too — the operator fixes both in the same submission rather than losing the default silently. A template's `effort` and a run's `effort_override` are refused the same way, with `422 EFFORT_LEVEL_UNSUPPORTED`, and an agent's `default_effort` is refused on write too.

**The same name is what the API, the database and the UI carry.** There is no translation layer: the name an operator writes in `effort_levels` is the name the API accepts on a chat body, the name the `tasks.effort` column holds, and the name the picker shows. The driver's own `name => wire` map is the one place a translation could live, and it is the identity today.

## The wire value

The wire value is the **level name verbatim**. `EffortLevelSet::map()` returns `name => name`.

Every provider Spora talks to sends the name unchanged — `reasoning_effort` on Chat Completions, `reasoning.effort` on the Responses API, `output_config.effort` on Anthropic's messages API — and the gateways normalise for us. The indirection exists so a provider that renames a level can be mapped later without a migration: the column holds the name, and the driver translates.

## The bounds, and why they exist

A level name is **at most 16 characters**, and a configuration offers **at most 32 names**. Each name matches `/^[A-Za-z0-9_.-]+$/`.

These are a **security and a storage decision**, not a preference.

The name travels into a JSON body that goes to a third-party endpoint, and into a `string(16)` column — `tasks.effort` is already `string(16)`, and `agents.default_effort`, `agent_prompt_templates.effort` and `scheduled_runs.effort_override` follow it. Widening that column is a full table rebuild on SQLite, Spora's default engine, on a table that grows without bound.

The character pattern keeps a name from carrying anything that could corrupt the wire body. Every real name in the wild fits: `none`, `minimal`, `xhigh`, `default`, `ultra`, `x-high`, `max_thinking`, `high_reasoning`.

## The names are not an enum any more

`Spora\Drivers\EffortLevel` used to be the vocabulary: seven cases, and a name outside them was refused at the request boundary. It is now the **default vocabulary plus the label map** — the seven canonical names, and a label for each.

A provider's own vocabulary is expressible. Groq's `default` is not a name Spora shipped, and any fixed list is incomplete the moment a provider ships another; both are now ordinary configuration. `EffortLevel::labelFor()` answers with the pretty label for a canonical name — `Low`, `XHigh` — and with the name itself for anything else, so an operator's own name reads as themselves.

The **canonical seven** are still what the two OpenAI drivers offer when nothing else is configured: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

## An unknown model id keeps the driver's own set

On the Anthropic driver, a model id Spora cannot identify — anything that is not a `claude-` id, and a `claude-` id that carries no version — keeps the **full five Anthropic levels**.

That is a deliberate rule. Narrowing an unidentifiable model to no levels would strip the effort picker from every existing Anthropic-compatible proxy — Kimi, MiniMax, Zhipu — until each operator configured a list by hand. The provider has the last word there: a level the model rejects comes back as the provider's own error, not as a silent fall back to the model's default.

An operator who knows better says so, and the operator's list replaces the driver's own.

## Where the level set is read

The level set is computed on the server, from the agent's effective LLM configuration — the agent's own configuration, the principal's preferred one, then the global default. A client never re-implements that resolution.

The endpoints that report it are listed in the API reference: the session-authenticated
`GET /api/v1/agents/{id}/effort` on the [REST API reference](/reference/api), and one per
bearer-key surface — [`GET /api/v1/agent-api/effort`](/reference/agent-api),
[`GET /api/v1/group-api/agents/{agentId}/effort`](/reference/group-api) and
[`GET /api/v1/global-api/agents/{agentId}/effort`](/reference/global-api).

## What's next

- [Concepts → LLM drivers](/reference/concepts/drivers) — the drivers, the wire shapes, and how each one derives its own level set
- [Concepts → Error handling](/reference/concepts/error-handling) — the error-code registry, and the two codes an unusable effort answers with
- [Concepts → Schema](/reference/concepts/schema) — the columns the effort lives in
