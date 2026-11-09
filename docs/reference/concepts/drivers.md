---
title: LLM drivers
description: LLM driver system — LLMDriverConfigInterface, LLMDriverConfiguration model, DriverFactory, and the reasoning-effort levels each driver can express.
---

# LLM Drivers

Spora's LLM layer is built around `LLMDriverConfigInterface`. Drivers are resolved per-request by `DriverFactory`, which delegates tier resolution to `LLMConfigPreferences::getEffectiveConfigForAgent()`. Effective config is the `LLMDriverConfiguration` that tier resolution selects — the agent's own `llm_driver_config_id` FK if set, otherwise the principal's preferred config, otherwise the global default.

## `LLMDriverConfigInterface`

**File:** `app/Drivers/LLMDriverConfigInterface.php`

Every driver must implement (all methods are `static`):

- `getName(): string` — snake_case identifier, e.g. `openai_compatible`
- `getDisplayName(): string` — human-readable, e.g. `OpenAI Compatible`
- `getDefaultTools(): array` — default tool list for this driver

The settings schema is **not** a method on the interface. It is discovered at runtime by `LLMConfigSchemaInspector::buildSchemaFromClass()` (`app/Services/LLMConfigSchemaInspector.php:55-70`) by collecting the driver class's `#[ToolSetting(key: ..., type: ...)]` PHP attributes through `ToolSettingSchema::collect()`. Driver classes therefore declare their UI fields as attributes — no hardcoded field lists.

Driver classes are listed in the PHP-DI container under the `'llm_driver_classes'` array key, which is a **static list** of `OpenAICompatibleDriver`, `AnthropicCompatibleDriver` and `OpenAIResponsesDriver` (`app/Core/ContainerDefinitions.php`). There is no extension hook on this key: the plugin/App `drivers()` hook was removed in 1.0, and `PluginLoader` has no driver-collection method. The `'llm_driver_classes_merged'` alias is kept alongside it for back-compatibility, but it is now identical to the static list (`app/Core/ContainerDefinitions.php`), and `LLMConfigService` is handed the merged entry via constructor injection. `spora-core/tests/Unit/Core/ContainerDefinitionsTest.php` pins this: the merged view equals the core list, with no plugin or App contributions. To add a driver, add the class to the `llm_driver_classes` list in `app/Core/ContainerDefinitions.php` and point an `llm_driver_configurations.driver_class` row at it.

## `LLMDriverConfiguration` (Model)

**File:** `app/Models/LLMDriverConfiguration.php`
**Table:** `llm_driver_configurations`

| Column                      | Type                   | Description                                                                                                      |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`                        | bigInt                 | Primary key                                                                                                      |
| `principal_id`              | bigInt FK (nullable)   | Owning principal. `NULL` marks the global config — `LLMDriverConfiguration::validateGlobalXor` enforces the XOR. |
| `name`                      | varchar(100)           | User's friendly name: "Production GPT-4"                                                                         |
| `driver_class`              | varchar(200)           | FQCN implementing `LLMDriverConfigInterface`                                                                     |
| `settings`                  | text (JSON)            | Driver-specific settings. Password fields are per-field encrypted (see below).                                   |
| `context_window`            | unsignedInt (nullable) | Total context window for the model (input + output)                                                              |
| `max_tokens_output`         | unsignedInt (nullable) | Max output tokens (output buffer)                                                                                |
| `is_default`                | boolean                | Global default flag. Default is set only on `is_global=true` rows.                                               |
| `is_global`                 | boolean                | Admin-shared config visible to all users                                                                         |
| `created_at` / `updated_at` | timestamp              |                                                                                                                  |

Ownership is principal-scoped, not user-scoped: migration `0067_introduce_principals_and_groups` replaced `user_id` with a nullable `principal_id` FK to `principals.id`, and left it nullable on this table alone so the global config row can keep `principal_id = NULL`. A group principal can own its own configs. See [Schema](/reference/concepts/schema) for the full `principals` picture.

Password-typed settings (per the `#[ToolSetting]` schema) are encrypted at rest using `SecurityManager` (`app/Core/SecurityManager.php`) — only `type: 'password'` fields are encrypted; the rest of the settings JSON is stored as plain text. The UI always receives masked values (`***`) for password fields, applied by `LLMConfigService::maskForApi()`.

## Effort levels

Every provider that has a reasoning control names it differently, exposes a different subset of levels, and rejects the control outright on models that do not support it. Spora therefore has its own vocabulary, and each driver maps it onto its provider's wire shape.

### The canonical scale

`Spora\Drivers\EffortLevel` is a backed enum of seven levels, ascending:

| Level     | Value     |
| --------- | --------- |
| `None`    | `none`    |
| `Minimal` | `minimal` |
| `Low`     | `low`     |
| `Medium`  | `medium`  |
| `High`    | `high`    |
| `XHigh`   | `xhigh`   |
| `Max`     | `max`     |

A driver declares the levels it can express in `Spora\Drivers\EffortAwareDriverInterface`:

```php
interface EffortAwareDriverInterface
{
    /**
     * The canonical effort levels this driver can express, mapped to the
     * value the provider expects.
     *
     * @return array<string, string> canonical level value => provider wire value
     */
    public function effortLevels(): array;
}
```

The key is the canonical level, the value is what goes on the wire. For every driver today the two are the same string; the indirection is the seam for a provider that renames a level.

`LLMDriverInterface` does **not** carry the method — it is a published contract, and adding to it breaks every implementor. `AbstractCompatibleDriver` implements the interface returning `[]`, which means the driver cannot express effort and sends no effort parameter at all; `OpenAICompatibleDriver`, `AnthropicCompatibleDriver` and `OpenAIResponsesDriver` override it.

**The operator configures, the provider validates.** There is no per-model level table: a driver describes the protocol, the model describes the capability, and a level the model does not accept is the provider's own `400`, naming the offending value. The option keys of a driver's `effort` setting and the keys of its `effortLevels()` are the same set — a test keeps the two in step.

### The wire shapes

| Driver                 | Parameter              | Shape                              |
| ---------------------- | ---------------------- | ---------------------------------- |
| `openai_compatible`    | `reasoning_effort`     | flat, top level                    |
| `anthropic_compatible` | `output_config.effort` | a top-level `output_config` object |
| `openai_responses`     | `reasoning.effort`     | a nested `reasoning` object        |

`max_tokens` and the flat `reasoning_effort` are absent from the Responses schema and are never sent there; `max_output_tokens` is Responses-only.

The Responses row is the request-level shape. On a model that supports `configuration_update` — GPT-6 and later — the driver sends no request-level `reasoning` at all and carries the level on an input item instead; see [Changing the effort mid-conversation](#changing-the-effort-mid-conversation).

### The default and the per-message override

`effort` is a driver setting (`type: 'select'`). Its default is the empty string, which means **the model's own default**: no level is asked for, and the provider applies whatever it would have applied anyway. Anthropic's option list omits `none` and `minimal`; the other two drivers offer the full scale.

**A level the driver does not declare resolves to no level at all.** The Anthropic driver declares neither `none` nor `minimal`, so a request that names one of them falls back to the model's own default rather than reaching the provider.

**One driver asks for a level anyway.** On a GPT-5.4-or-later reasoning model the OpenAI-compatible driver sends `reasoning_effort: "none"` when the agent uses tools and no level resolves, because silence is not a working configuration on the models that default to `medium`. See [Tools and effort on Chat Completions](#tools-and-effort-on-chat-completions).

A request may carry its own `effort`, and the resolution order is:

```text
request effort (authoritative when the key is present)
  → the config default (the `effort` setting on the LLM config)
  → no level asked for (the model's own default)
```

The three request values mean three different things:

| Request body     | Meaning                                                 |
| ---------------- | ------------------------------------------------------- |
| key absent       | fall back to the config default                         |
| `effort: ""`     | explicitly the model's own default — no level asked for |
| `effort: "high"` | that level                                              |

The resolved value lands on the task row: `NULL` means no level was resolved — the model's own default — and the database never stores an empty string.

The driver never reads the settings blob for effort. The resolution happens outside the driver (`LlmConfigResolver` → `TickPhaseRunner` → `LLMRequest::$effort`), and the driver only emits what it is handed. `LLMRequest::$effort` carries the **canonical** level value; the driver maps it.

The chat overrides the default per message, and learns the vocabulary from `GET /api/v1/agents/{id}/effort` — see the [REST API reference](/reference/api).

## `OpenAICompatibleDriver`

**File:** `app/Drivers/OpenAICompatibleDriver.php`
**Driver name:** `openai_compatible`

- Calls `POST {base_url}/chat/completions` using the standard OpenAI chat completions format.
- `base_url` defaults to `https://api.openai.com/v1`; can be overridden for Ollama, Groq, LM Studio, Azure, etc.
- Reads settings from `LLMDriverConfiguration.settings` (decrypted per-field via `LLMConfigService::decodeSettings()`).
- Dispatches on `finish_reason: tool_calls`; otherwise returns the text content.
- Sends the effort level as a flat `reasoning_effort` — see [Effort levels](#effort-levels).

Settings schema (`#[ToolSetting]` attributes on `app/Drivers/OpenAICompatibleDriver.php`): `api_key` (password), `base_url` (text), `model` (text), `temperature` (text), `effort` (select), `timeout` (text), plus the inherited `supports_image_input` (toggle) that `AbstractCompatibleDriver` declares. `context_window` and `max_tokens_output` are not settings-schema fields — they are columns on the `llm_driver_configurations` row.

### Reasoning models

A model id is an OpenAI reasoning model when it matches

```text
^gpt-(5|6)(\.\d+)?-     gpt-5, gpt-5.1, gpt-6, gpt-6.1, …
^gpt-(5|6)(\.\d+)?$     bare gpt-5, gpt-6
^o(1|3|4)(-|$)          o1, o1-mini, o3, o3-mini, o4-mini
```

and does not contain `-chat-` (`gpt-5-chat-latest` and friends are ChatGPT Instant models, not reasoning models) and is not `gpt-oss`. A `provider/` prefix is stripped first, so OpenRouter's `openai/gpt-5.5` is classified the same way.

On a reasoning model the driver sends `max_completion_tokens` instead of `max_tokens`, omits `temperature`, and uses `role: "developer"` instead of `role: "system"`. `max_tokens` is rejected by every current reasoning model, and `temperature` is rejected with any effort other than `none`.

### Tools and effort on Chat Completions

**On GPT-5.4 and later, Chat Completions does not support tool calling with `reasoning_effort` values other than `none`.** The API's documented default for the parameter is `medium`, and from GPT-5.5 on that is the model's own default too — so a request that sends tools and no effort value sits at `medium`, where tool calling is a `400`. (GPT-5.4 and GPT-5.2 default to `none`.) Silence is not a configuration to rely on, so **the driver sends `reasoning_effort: "none"` explicitly whenever the agent uses tools and no level resolves.**

| Tools present | Level resolved | Sent                                                                              |
| ------------- | -------------- | --------------------------------------------------------------------------------- |
| yes           | no             | `reasoning_effort: "none"`                                                        |
| yes           | yes            | the resolved level — `none` is accepted; the levels the model rejects are a `400` |
| no            | no             | nothing                                                                           |
| no            | yes            | the resolved level                                                                |

**An explicit level is never silently overridden.** If the operator chose one, Spora sends it and the provider's own error names the fix — OpenAI's message says to use `/v1/responses` or to set `reasoning_effort` to `none`. For an agent with no tools enabled the level works normally.

**An explicit `none` is not a `400`.** On the models that take tools over Chat Completions, `none` is the one level they accept, and Spora sends it unchanged. The `400` belongs to the explicit levels the model rejects — on those models, every level above `none`. The models that reject `none` itself are the other half of the GPT-6 generation; see [The two GPT-6 families](#the-two-gpt-6-families).

To reason _and_ call tools on a current OpenAI model, use the [`OpenAIResponsesDriver`](#openairesponsesdriver).

### The two GPT-6 families

**"GPT-5.4 and later" is one rule for the driver, but the GPT-6 generation splits in two** — and the advice differs.

| Family                                           | Tools on Chat Completions | `none`                                         |
| ------------------------------------------------ | ------------------------- | ---------------------------------------------- |
| GPT-5.4, GPT-5.5, GPT-5.6, GPT-6 Sol, GPT-6 Luna | accepted at `none` only   | accepted — the driver sends it, the agent runs |
| GPT-6.1 Terra                                    | **not supported at all**  | accepted, but it cannot call tools either      |
| GPT-6 Astra, GPT-6.1 Sol                         | **not supported at all**  | rejected — a `400`                             |

OpenAI's own documentation draws the line: _"GPT-6 Astra, GPT-6.1 Sol, and GPT-6.1 Terra support Chat Completions, but tool calling requires Responses. GPT-6 Sol and GPT-6 Luna support function calling in Chat Completions only with `reasoning_effort: "none"`."_

**On GPT-6 Astra, GPT-6.1 Sol and GPT-6.1 Terra the Responses driver is the only way to run an agent.** Chat Completions cannot call tools on those models at all, whatever the effort, and the `none` escape hatch does not rescue them: `none` is a `400` on GPT-6 Astra, and GPT-6.1 Sol rejects `none` and `minimal` as well. The driver sends `none` across the whole GPT-5.4+ range, so on those three the request fails at the provider instead of running the agent. That holds even when the operator does not want the model to reason — the choice there is the endpoint, not the level.

**On GPT-6 Sol and GPT-6 Luna the `none` workaround works exactly as it does on GPT-5.4.** The agent runs, the model does not reason, and the Responses driver is the way to have both.

## `AnthropicCompatibleDriver`

**File:** `app/Drivers/AnthropicCompatibleDriver.php`
**Driver name:** `anthropic_compatible`

- Calls `POST {base_url}/v1/messages` using Anthropic's `messages` API. Default `base_url` is `https://api.anthropic.com` (the driver appends `/v1/messages`).
- Uses Anthropic's request format: `system` prompt is a top-level field; `tools` array uses the Anthropic schema (not OpenAI schema).
- Dispatches on `stop_reason: tool_use`; otherwise returns text content blocks.
- Sends `anthropic-version: 2026-10-21` header and `x-api-key` for auth.
- Sends the effort level as `output_config: {effort: "<level>"}` — see [Effort levels](#effort-levels).

Settings schema (`#[ToolSetting]` attributes on `app/Drivers/AnthropicCompatibleDriver.php`): `api_key` (password), `base_url` (text), `model` (text), `enable_prompt_caching` (toggle), `effort` (select), `timeout` (text), plus the inherited `supports_image_input` (toggle) that `AbstractCompatibleDriver` declares. As with the OpenAI driver, `context_window` and `max_tokens_output` are table columns rather than settings-schema fields.

### What the 2026-10-21 API version changed

**`temperature` is no longer sent, and the setting is gone.** That API version removed the sampling parameters: a request that sends any of them answers `400` on every model.

The cost, precisely: **Claude 4.7 and later are unaffected** — those models only accept the default, so Spora's `0.7` was never in effect. On **Sonnet 4.6 and earlier** the sample moves from `0.7` to the API default of `1.0`, so the output becomes slightly more varied. For an agent loop that is neutral-to-positive — less repetitive output from step to step — and the models concerned are a generation behind. `effort` is the replacement control: Anthropic's own guidance is that effort shapes the whole response, tool calls included.

**`thinking_budget` is gone, and `effort` replaces it.** The two are the same knob in two generations of the API, and their coverage barely overlaps: `budget_tokens` is a hard `400` on Claude 4.7 and later, and the models that still take it — Opus 4.5, Sonnet 4.5, Haiku 4.5, and (deprecated) Opus 4.6 and Sonnet 4.6 — are covered by `effort` except **Sonnet 4.5 and Haiku 4.5**, which have no `effort` at all.

**Opus 4.5, Sonnet 4.5 and Haiku 4.5 lose manual extended thinking entirely**: on them Spora sends no `thinking` field at all. Sonnet 4.5 and Haiku 4.5 have no `effort` to fall back on. Opus 4.5 has `effort`, but adaptive thinking arrived with the 4.6 generation and is a `400` below it — so there is no thinking mode left to turn on there either, and `effort` shapes the response without a thinking block to show.

A stored `thinking_budget` is pruned the next time that configuration is saved — `LLMConfigPersistence::encodeSettings()` drops the keys that are not in the driver's schema — so no data migration is needed.

### The `thinking` field

| Model family    | Effort configured | `thinking` field                                |
| --------------- | ----------------- | ----------------------------------------------- |
| 4.6 and later   | yes               | `{"type": "adaptive", "display": "summarized"}` |
| 4.6 and later   | no                | omitted                                         |
| 4.5 and earlier | any               | omitted                                         |

**Effort turns on adaptive thinking wherever adaptive thinking exists; below 4.6 there is no thinking mode, so effort shapes the response only.** Claude 3.x has no thinking mode at all.

`display: "summarized"` is sent only with `type: "adaptive"`, because that is where the default flipped to `"omitted"` — without it the model would return an empty reasoning block and the chat would show no reasoning at all. Neither `thinking: {"type": "disabled"}` nor `thinking: {"type": "enabled", "budget_tokens": N}` is ever sent.

## `OpenAIResponsesDriver`

**File:** `app/Drivers/Responses/OpenAIResponsesDriver.php`
**Driver name:** `openai_responses`
**Display name:** `OpenAI Responses`

- Calls `POST {base_url}/responses` — OpenAI's Responses API, not Chat Completions.
- The system prompt is the top-level `instructions` field, not a `system` message.
- The conversation is a list of `input` items: messages, function calls, function-call outputs.
- Tool definitions are flat — `{"type": "function", "name": …}` — not nested under a `function` object.
- The token cap is `max_output_tokens`; `max_tokens` is not in the schema and is never sent.
- The effort level travels nested: `reasoning: {"effort": "<level>"}`.

Settings schema (`#[ToolSetting]` attributes on `app/Drivers/Responses/OpenAIResponsesDriver.php`): `api_key` (password), `base_url` (text), `model` (text), `effort` (select), `store` (toggle), `timeout` (text), plus the inherited `supports_image_input` (toggle) that `AbstractCompatibleDriver` declares.

**It is priced like the Chat Completions driver.** `getProviderName()` returns `openai_compatible` — the tag the Chat Completions driver already uses, not a new one — so the price rows an operator already has for a model keep matching when an agent is pointed at this driver. A model with no price row is unpriced: the call is metered as free. The protocol identifier is the separate `openai_responses`; the usage panel reads `openai`, which is the tag both OpenAI protocols report.

Plugin tool names are sanitised for this driver: a plugin tool's name carries a colon, which the API's function-name grammar forbids, so every character outside `[A-Za-z0-9_-]` is replaced with a hyphen and the name the model echoes is mapped back — the tool still resolves. The name is built the same way for every driver, so no other driver is affected.

### `store`

The **`store`** setting — labelled _Store responses_ — is a toggle, and it is **off** by default. It decides whether the provider keeps the response as a retrievable conversation object on its own servers: the Responses API stores one for at least 30 days unless it is told not to, so Spora sends `store: false` until an operator asks otherwise. A self-hosted platform has no business keeping its operators' conversations on somebody else's servers.

**`store: false` is not a promise that the provider retains nothing.** It means the response is not stored as a retrievable conversation object. Prompts and responses still go into the provider's **abuse-monitoring logs**, which are retained for up to 30 days by default. Excluding customer content from those logs needs an approved **Zero Data Retention** or **Modified Abuse Monitoring** control — granted by OpenAI per organisation or project, subject to prior approval and to the limitations of each — see [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data). An operator whose conversations carry data they cannot hand to a third party has to arrange that with OpenAI; the toggle does not do it.

The toggle changes what **Spora** has to replay, not only what the provider retains. **With it off**, the reasoning item comes back carrying its `encrypted_content` — the opaque blob the provider decrypts to restore the chain of thought — and Spora replays that blob itself; the provider keeps no stored response to replay from. **With it on**, the provider keeps the reasoning item and Spora replays it by its id instead.

> The `store: true` path is the one the shipped driver does not claim to have verified: replaying by id is the API's documented shape, but no live call has exercised it.

### Changing the effort mid-conversation

The chat can change the effort between messages, and the Responses API has a way of doing that which does not cost the prompt cache:

```json
{ "type": "configuration_update", "reasoning": { "effort": "high" } }
```

It is an **input item**, not a request-level parameter, so it changes the effort for the responses that follow it without rewriting the request body — and the cached prompt prefix survives. On a model that supports it the request-level `reasoning` is **not sent at all**: the override rides on the item, as the last input item, so it applies to the response generated after it.

**GPT-6 and later support it.** On an earlier model the same change is a request-level `reasoning.effort`, which is a prefix edit — **it invalidates the prompt cache**. An operator on a pre-GPT-6 model should know that moving the level mid-chat costs the cache.

### The reasoning item

A reasoning item is **opaque** and must be replayed **in position**. OpenAI's own reference is explicit: when function calling with a reasoning model on the Responses API, pass the reasoning items returned with the function calls back along with the tool outputs — that is what keeps the reasoning continuous across the call.

Reasoning is scoped to the model family, so switching families silently drops it.

**What the chat shows is a summary, not the chain of thought.** The API returns a summary of the model's reasoning, and that summary is what the driver stores as the block's text. The chat renders it in the same bubble Anthropic's `thinking` block uses — one bubble, whatever the provider — and a turn that came back with no summary shows no reasoning at all.

### When to choose it

**Choose the Responses driver** when you want an OpenAI reasoning model to _think and call tools in the same turn_. Over Chat Completions the two are mutually exclusive on GPT-5.4 and later: the model accepts tools only at `none`, so the agent runs but the model does not reason. On GPT-6 Astra, GPT-6.1 Sol and GPT-6.1 Terra it is more than mutual exclusion — Chat Completions cannot call tools on those models at all, so the Responses driver is the only option there, even for an operator who does not want the model to reason. The Responses API is the only OpenAI endpoint where a reasoning model can do both — the same combination Anthropic gives through adaptive thinking.

**Keep the Chat Completions driver** for everything else. vLLM, Ollama, LM Studio, Groq, Mistral and DeepSeek implement `/v1/chat/completions`, and their `/v1/responses` implementations differ per provider — some ignore unsupported parameters, some reject `store: true`, some have no statefulness at all.

## `DriverFactory`

**File:** `app/Drivers/DriverFactory.php`

- Calls `LLMConfigPreferences::getEffectiveConfigForAgent($agent)`, which performs three-tier resolution: agent-specific (`agent.llm_driver_config_id`) → principal preferred (`principal_preferences.preferred_llm_config_id`) → global default (`is_global = true AND is_default = true`). See `app/Services/LLMConfigPreferences.php:75-98`. Preference writes are principal-scoped: `setPrincipalPreferredConfig()` only accepts a global config or one owned by that same principal, and an agent resolves tier 2 through `agent.principal_id` (`app/Services/LLMConfigPreferences.php:100-145`).
- Instantiates the `driver_class` column's FQCN with the decrypted settings plus an HTTP client, logger, and timeout. `timeout` is read from the per-config setting when present, otherwise it falls back to the container-wide `llm_timeout` (`app/Drivers/DriverFactory.php:82-85`).
- `AnthropicCompatibleDriver` is constructed with an `AnthropicDriverOptions` value object carrying `supports_image_input` and `enable_prompt_caching` rather than loose scalars. A driver that needs more than the abstract driver's seven constructor arguments implements `Spora\Drivers\DriverOptionsAwareInterface` and is built from the decoded settings itself — `AnthropicCompatibleDriver` and `OpenAIResponsesDriver` do. The factory asks the capability rather than comparing class names.
- If no config resolves, it **throws** `LlmConfigurationMissingException` (`app/Drivers/DriverFactory.php:55-61`). There is no silent fallback driver: the previous empty-key `OpenAICompatibleDriver` punted the request to `api.openai.com` and surfaced as an upstream 401, hiding the operator-visible "no LLM configured" error. `ErrorClassifier` turns the exception into a `NO_LLM_CONFIGURATION` message on the task row.
- The factory does not merge plugin drivers — there is no such hook. Adding a driver means adding the class to the `llm_driver_classes` list in `app/Core/ContainerDefinitions.php` and referencing it from `llm_driver_configurations.driver_class`.

## Dependencies

- `symfony/http-client ^8.0` — HTTP transport for all driver requests (`composer.json:21`).

## Tests

- `tests/Unit/Drivers/LLMDriverConfigInterfaceTest.php` — Interface contract for built-in drivers
- `tests/Unit/Drivers/LLMConfigServiceTest.php` — Encryption, getDrivers, schema reflection
- `tests/Unit/Drivers/LLMConfigServicePreferenceTest.php` — Principal-preferred config resolution (exercises `LLMConfigPreferences` and `PrincipalPreference`)
- `tests/Unit/Drivers/DriverFactoryTest.php`
- `tests/Unit/Drivers/OpenAICompatibleDriverTest.php`
- `tests/Unit/Drivers/AnthropicCompatibleDriverTest.php`
- `tests/Unit/Drivers/LLMProviderExceptionTest.php`

Both driver test suites use `Symfony\Component\HttpClient\MockHttpClient` and cover: tool call parsing, text response parsing, error handling, and rate-limit exception propagation.

The wire contract has its own suite: one test per driver and per mode pins the **exact** set of top-level keys the request body carries — no more, no fewer. A JSON-Schema check would not catch the mistakes that matter here, because the providers' request schemas do not forbid extra properties; the key-set assertion does, and it fails on a missing field as well as an extra one.
