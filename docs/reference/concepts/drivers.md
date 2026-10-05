---
title: LLM drivers
description: LLM driver system — LLMDriverConfigInterface, LLMDriverConfiguration model, DriverFactory.
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

Driver classes are listed in the PHP-DI container under the `'llm_driver_classes'` array key, which is a **static two-entry list** of `OpenAICompatibleDriver` and `AnthropicCompatibleDriver` (`app/Core/ContainerDefinitions.php:801-804`). There is no extension hook on this key: the plugin/App `drivers()` hook was removed in 1.0, and `PluginLoader` has no driver-collection method. The `'llm_driver_classes_merged'` alias is kept alongside it for back-compatibility, but it is now identical to the static list (`app/Core/ContainerDefinitions.php:806-812`), and `LLMConfigService` is handed the merged entry via constructor injection. `spora-core/tests/Unit/Core/ContainerDefinitionsTest.php:769` pins this: the merged view equals the core list, with no plugin or App contributions. To add a driver, add the class to the `llm_driver_classes` list in `app/Core/ContainerDefinitions.php` and point an `llm_driver_configurations.driver_class` row at it.

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

## `OpenAICompatibleDriver`

**File:** `app/Drivers/OpenAICompatibleDriver.php`
**Driver name:** `openai_compatible`

- Calls `POST {base_url}/chat/completions` using the standard OpenAI chat completions format.
- `base_url` defaults to `https://api.openai.com/v1`; can be overridden for Ollama, Groq, LM Studio, Azure, etc.
- Reads settings from `LLMDriverConfiguration.settings` (decrypted per-field via `LLMConfigService::decodeSettings()`).
- Dispatches on `finish_reason: tool_calls`; otherwise returns the text content.

Settings schema (`#[ToolSetting]` attributes on `app/Drivers/OpenAICompatibleDriver.php:21-25`): `api_key` (password), `base_url` (text), `model` (text), `temperature` (text), `timeout` (text). `context_window` and `max_tokens_output` are not settings-schema fields — they are columns on the `llm_driver_configurations` row.

## `AnthropicCompatibleDriver`

**File:** `app/Drivers/AnthropicCompatibleDriver.php`
**Driver name:** `anthropic_compatible`

- Calls `POST {base_url}/v1/messages` using Anthropic's `messages` API. Default `base_url` is `https://api.anthropic.com` (the driver appends `/v1/messages`).
- Uses Anthropic's request format: `system` prompt is a top-level field; `tools` array uses the Anthropic schema (not OpenAI schema).
- Dispatches on `stop_reason: tool_use`; otherwise returns text content blocks.
- Sends `anthropic-version: 2023-06-01` header and `x-api-key` for auth.

Settings schema (`#[ToolSetting]` attributes on `app/Drivers/AnthropicCompatibleDriver.php:19-25`): `api_key` (password), `base_url` (text), `model` (text), `enable_prompt_caching` (toggle), `temperature` (text), `thinking_budget` (text), `timeout` (text). As with the OpenAI driver, `context_window` and `max_tokens_output` are table columns rather than settings-schema fields.

## `DriverFactory`

**File:** `app/Drivers/DriverFactory.php`

- Calls `LLMConfigPreferences::getEffectiveConfigForAgent($agent)`, which performs three-tier resolution: agent-specific (`agent.llm_driver_config_id`) → principal preferred (`principal_preferences.preferred_llm_config_id`) → global default (`is_global = true AND is_default = true`). See `app/Services/LLMConfigPreferences.php:75-98`. Preference writes are principal-scoped: `setPrincipalPreferredConfig()` only accepts a global config or one owned by that same principal, and an agent resolves tier 2 through `agent.principal_id` (`app/Services/LLMConfigPreferences.php:100-145`).
- Instantiates the `driver_class` column's FQCN with the decrypted settings plus an HTTP client, logger, and timeout. `timeout` is read from the per-config setting when present, otherwise it falls back to the container-wide `llm_timeout` (`app/Drivers/DriverFactory.php:82-85`).
- `AnthropicCompatibleDriver` is constructed with an `AnthropicDriverOptions` value object carrying `thinking_budget`, `supports_image_input`, and `enable_prompt_caching` rather than loose scalars (`app/Drivers/DriverFactory.php:99-112`).
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
