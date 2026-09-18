---
title: Speech providers
description: How Spora picks which speech-to-text plugin transcribes a recording — the cascade, the configuration table, MIME negotiation, and the operator-facing configuration surface.
---

# Speech providers

A speech provider is a class that turns recorded audio bytes into a text transcript. Spora's composer recording button and the `/api/v1/speech/transcribe` endpoint both call into the same [`SpeechToTextRegistry`](https://github.com/spora-ai/spora-core/blob/main/app/Speech/SpeechToTextRegistry.php), which picks one provider per request via a four-tier preference cascade (the historical fifth "first-registered-wins" tier was removed in spora-core PR #253 — tier 4 now returns `[null, null, null]` so the SPA capability badge stops claiming a working provider when none is configured). Providers are contributed by spora-core (the built-in OpenAI-compatible transcriber) and by plugins (e.g. [spora-plugin-minimax](/develop/plugins/reference/minimax), which contributes MiniMax's `asr-1.0`).

This page is the operator / agent-developer view: how the cascade works, what each preference row means, and how to read the capability endpoint's `effective_*` fields. The plugin-author contract lives in [Plugin author guide → Speech providers](/develop/plugins/author-guide/speech-providers). The auto-generated REST surface is in [API reference → Speech](/reference/api/speech).

## The components

```text
                          ┌──────────────────────────────────────┐
                          │ SpeechToTextRegistry                 │
                          │  • list of providers (core + plugin) │
                          │  • SpeechToTextCascadeResolver       │
                          │  • configuredProvider(userId, agent) │
                          └──────────┬───────────────────────────┘
                                     │
                                     ▼ one provider per request
┌─────────────────┐    ┌────────────────────────────────────────────┐
│ providers[]     │    │ transcribe(bytes, mime, language?, agent?)│
│  ┌───────────┐  │    │                                            │
│  │OpenAI-Com │◄─┼────┤  → POST {base_url}/audio/transcriptions   │
│  ├───────────┤  │    │                                            │
│  │MiniMax    │◄─┼────┤  → POST {base_url}/v1/speech_to_text      │
│  ├───────────┤  │    │                                            │
│  │Muse      │◄─┼────┤  → bespoke multipart + ffmpeg pipeline    │
│  └───────────┘  │    └────────────────────────────────────────────┘
└─────────────────┘
```

| Layer               | Lives in                                                                                                                     | Role                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Provider classes    | `Spora\Speech\SpeechToTextProviderInterface`                                                                                 | One per vendor / wire shape. Sync-only.                                                                |
| Registry            | [`SpeechToTextRegistry`](https://github.com/spora-ai/spora-core/blob/main/app/Speech/SpeechToTextRegistry.php)               | Discovers providers (core + plugins), binds the resolved config's settings, gates on `isConfigured()`. |
| Cascade resolver    | [`SpeechToTextCascadeResolver`](https://github.com/spora-ai/spora-core/blob/main/app/Speech/SpeechToTextCascadeResolver.php) | Walks the four preference tiers and returns `(class, source, config_id)`.                              |
| Configuration table | `speech_provider_configurations` + `principal_preferences.preferred_speech_config_id` + `agents.speech_driver_config_id`     | Operator-managed rows that drive tiers 1-3.                                                            |
| REST surface        | [`/api/v1/speech/*`](/reference/api/speech)                                                                                  | 10 endpoints for CRUD, defaults, capability, transcribe.                                               |

## The cascade

The cascade answers one question: _which provider class should this call go to?_ It runs on every capability probe and every transcribe call — both paths share the resolver so the recording button and the actual transcription can never disagree.

For a per-agent request (`agent_id > 0`), the resolver walks 4 tiers against the **agent's principal** (not the caller's):

```text
1. Agent override         agents.speech_driver_config_id → speech_provider_configurations.provider_class
2. Principal preference   principal_preferences.preferred_speech_config_id for the AGENT's principal
                           (user-principal or group-principal, depending on agents.principal_id)
3. Global default         speech_provider_configurations WHERE is_global = true AND is_default = true
                           ORDER BY updated_at DESC, id DESC
4. No config → null       if tiers 1–3 resolved nothing, the cascade returns [null, null, null]
```

For a caller-scoped request (the composer recording button has no agent context), the resolver walks 4 tiers against the caller:

```text
1. User preference        principal_preferences.preferred_speech_config_id for the caller's user-principal
2. Group preference       every group_memberships row for the caller, ordered by joined_at ASC
                           first match wins
3. Global default         same as above
4. No config → null       same as above — tier returns [null, null, null]
```

Both paths walk the same four-tier shape; per-agent requests use the agent's principal for tier 2, caller-scoped requests split user + group preferences into tiers 1 and 2.

Every tier validates that the resolved `provider_class` is currently registered. If the operator deletes a plugin without first clearing the FK references, the resolver treats the row as unset and falls through to the next tier — never to a class the registry doesn't have.

> The "agent's principal" pin in tier 2 is the critical subtlety operators miss. A group-owned agent must consult its **group's** preference, not the caller's user-principal. Otherwise the badge in the recording button would say "user default" when the agent's principal is actually a group — see the [`SpeechToTextCascadeResolver` rank-1 source](https://github.com/spora-ai/spora-core/blob/main/app/Speech/SpeechToTextCascadeResolver.php) for the principal lookup.

## Configuration rows

Every tier (except tier 4, which returns null when nothing resolved) reads from the `speech_provider_configurations` table:

| Column           | Type               | Purpose                                                                                                                                                                                                                                                |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `provider_class` | string (FQCN)      | Stable identity of the implementation — `Spora\Speech\OpenAiCompatibleTranscriber`, `Spora\Plugins\MiniMax\MiniMaxTranscribeProvider`, etc.                                                                                                            |
| `display_name`   | string             | Operator-facing label. When bound to a row, the registry calls `bindLabel()` so `getDisplayName()` returns this rather than the class-level default.                                                                                                   |
| `settings`       | encrypted JSON     | Decoded at request time and pushed into the provider via `bindSettings()`. Password fields are per-row encrypted via `SecurityManager`; the wire response masks them as `'***'`.                                                                       |
| `is_global`      | boolean            | Global rows are admin-managed and visible to every principal. XOR with `principal_id` — enforced in [`SpeechProviderConfiguration::validateGlobalXor()`](https://github.com/spora-ai/spora-core/blob/main/app/Models/SpeechProviderConfiguration.php). |
| `is_default`     | boolean            | Only meaningful when `is_global = true`. Multiple rows can be global; at most one is the default. The `POST /api/v1/speech/provider-configs/{id}/set-default` endpoint demotes the previous default inside a `lockForUpdate` transaction.              |
| `principal_id`   | FK → principals.id | Set when the row is principal-scoped (user or group). The `scope` field on the wire response is derived from the principal's type.                                                                                                                     |

The CRUD surface is in [`/api/v1/speech/provider-configs`](/reference/api/speech#post-apiv1speechprovider-configs). Schema-level validation (required keys, regex) walks the provider's `#[ToolSetting]` attributes via [`SpeechProviderConfigValidator::assertSettingsAgainstSchema()`](https://github.com/spora-ai/spora-core/blob/main/app/Services/SpeechProviderConfigValidator.php), so adding a new field to the attribute list automatically widens the dynamic form the SPA renders.

## Reading the capability endpoint

`GET /api/v1/speech/capability` returns one row per registered provider, plus the resolved-class / source / config-id triple the cascade produced. The SPA reads this to decide whether to render the recording button at all and which `preferred_audio_mimes[]` to feed the MIME picker:

```json
{
  "data": {
    "available": true,
    "configured": true,
    "providers": [
      {
        "name": "minimax",
        "class": "Spora\\Plugins\\MiniMax\\MiniMaxTranscribeProvider",
        "display_name": "MiniMax (prod)",
        "configured": true,
        "effective_class": "Spora\\Plugins\\MiniMax\\MiniMaxTranscribeProvider",
        "effective_source": "agent",
        "effective_config_id": 17,
        "preferred_audio_mimes": ["audio/ogg;codecs=opus", "audio/mp4", "audio/webm;codecs=opus"]
      }
    ]
  }
}
```

`name` is the stable key the provider's `getName()` returns — MiniMax hardcodes `'minimax'`, OpenAI-compatible returns the bound label. `display_name` is what the SPA shows next to the dropdown; it's the operator's per-config `display_name` setting when bound, otherwise the class-level default. The fields operators care about:

| Field                   | Meaning                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `available`             | At least one provider class is loaded. `false` means every plugin that contributed a provider has been removed or disabled.                                                                                                                                              |
| `configured`            | The cascade resolved a provider AND that provider's `isConfigured()` returned `true` (its bound `api_key` is non-empty in v2-cascade mode). When `false`, the recording button hides itself — the transcribe endpoint would otherwise return 503.                        |
| `class`                 | This row's provider FQCN. Used by the SPA to pick the matching `preferred_audio_mimes[]` for the resolved row. Distinct from `effective_class` below.                                                                                                                    |
| `effective_class`       | The cascade-resolved class (per principal / agent). Identical across every row in the response — same answer, different vantage points.                                                                                                                                  |
| `effective_source`      | Which cascade tier produced the answer. See the table below.                                                                                                                                                                                                             |
| `effective_config_id`   | The configuration row that backed the choice. `null` when no FK config exists at any tier (cascade returned `[null, null, null]`).                                                                                                                                       |
| `preferred_audio_mimes` | The MIMEs the SPA should offer the browser in order. Provider-declared via [`#[AcceptedAudioMime]`](https://github.com/spora-ai/spora-core/blob/main/app/Speech/Attributes/AcceptedAudioMime.php); falls back to the common-superset default when the provider opts out. |

### `effective_source` values

The string is the tier label the cascade resolver emitted. Each maps to one row in the cascade:

| Value              | Source tier                                                                | Configurable by                                                                    |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `agent`            | Per-agent tier 1 — agent override                                          | Agent editor (per-agent `speech_driver_config_id`).                                |
| `user_preference`  | Per-agent tier 2 (agent's principal is a user-principal) or caller tier 1  | Per-user speech preferences.                                                       |
| `group_preference` | Per-agent tier 2 (agent's principal is a group-principal) or caller tier 2 | Per-group speech preferences.                                                      |
| `global_default`   | Tier 3 — global default                                                    | Admin (Settings → Speech, or `POST .../set-default`).                              |
| `null` (no source) | Tier 4 — no config resolved                                                | Cascade returns `[null, null, null]`; SPA renders "No speech provider configured". |

`null` only when **no** provider class is registered at all — the SPA treats that as "install a speech provider" rather than "configure one".

## MIME negotiation

The browser's `MediaRecorder` produces whatever its codec table says it can. Spora can't dictate the wire — it can only steer the picker. Each provider declares the MIMEs it accepts via `#[AcceptedAudioMime]` attributes, in preference order:

```php
// MiniMax rejects the Matroska container (HTTP 502 / error 2013) even
// though the underlying Opus codec is identical to OGG-over-Opus. We
// steer Chrome ≥ 105 onto audio/ogg;codecs=opus first.
#[AcceptedAudioMime('audio/ogg;codecs=opus')]
#[AcceptedAudioMime('audio/mp4')]
#[AcceptedAudioMime('audio/webm;codecs=opus')]
final class MiniMaxTranscribeProvider implements SpeechToTextProviderInterface {}
```

The SPA walks the resolved row's `preferred_audio_mimes[]` and picks the first one whose `MediaRecorder.isTypeSupported()` returns `true`. When the provider doesn't declare any (or doesn't exist), the registry falls back to the common-superset default:

```php
private const DEFAULT_PREFERRED_AUDIO_MIMES = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/webm',
    'audio/wav',
];
```

The full mime → container mapping the providers themselves must support lives in [`MediaAllowedTypesService::AUDIO_MIME_TYPES`](https://github.com/spora-ai/spora-core/blob/main/app/Services/MediaArchive/MediaAllowedTypesService.php) (upload allow-list) and `OpenAiCompatibleTranscriber::extensionFor()` (multipart filename mapping). The two deliberately include `video/webm` and `video/mp4` to cover Safari's MediaRecorder quirk of labelling audio-only recordings with the video container type — the byte sniffer can't tell them apart.

## How the registry calls a provider

When the transcribe endpoint runs, the flow is:

1. **Decode body** — `{ media_id, language?, agent_id? }`. The controller validates the `media_id` is a non-empty UUID; `language` is a BCP-47 hint or null; `agent_id` is optional and the controller validates ownership.
2. **Resolve provider** — `SpeechToTextRegistry::configuredProvider($userId, $agentId)` walks the cascade, picks a class, binds the resolved `SpeechProviderConfiguration` row's label and settings into the provider via `bindLabel()` and `bindSettings()`, and gates on `isConfigured()`. A `null` return → HTTP 503 `SPEECH_PROVIDER_UNAVAILABLE`.
3. **Read asset bytes** — `MediaAssetReader::readAsset()`. `data_url` / `local` rows return bytes; `external` rows (just a `source_url` pointer) → 422 `INVALID_AUDIO`; missing / unauthorized / legacy storage mode → 404 `MEDIA_NOT_FOUND`.
4. **Transcribe** — `$provider->transcribe($bytes, $mime, $language, $agentId=0, $userId)`. `InvalidAudioException` → 422; `SpeechToTextException` (provider-side failure) → 502 with the sanitised message. **API keys MUST NOT appear in the message** — both `SpeechToTextException` and the provider's `classifyTransportFailure()`/`classifyHttpFailure()` helpers enforce this.
5. **Cache** — write `text` / `language` back to `media_assets.transcript` / `media_assets.transcript_language` so chat re-renders re-use the cached value without re-billing. (Duration is not persisted.)

The `$agentId` argument the controller passes to `transcribe()` is **always 0**. The cascade resolves the class from agent preferences (so the badge next to the dropdown reflects the agent's tier), but the provider reads user / group / global settings from the resolved `SpeechProviderConfiguration` directly. Per-agent STT overrides via `agent_tool_settings` are out of scope.

## Error model

| Status | Code                          | When                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 200    | —                             | Success. Body includes `text`, `language?`, `duration_ms?`.                                                                                                                                                                                                              |
| 401    | `UNAUTHORIZED`                | No session bound to the request.                                                                                                                                                                                                                                         |
| 404    | `MEDIA_NOT_FOUND`             | `media_id` not visible to the caller (missing, unauthorized, or legacy storage mode). No existence leak between reasons.                                                                                                                                                 |
| 422    | `INVALID_AUDIO`               | Asset is `storage_mode=external` (URL only, no bytes) **or** the provider rejected the MIME.                                                                                                                                                                             |
| 422    | `VALIDATION_ERROR`            | Malformed body, or `agent_id` was supplied but doesn't belong to the caller.                                                                                                                                                                                             |
| 502    | `SPEECH_PROVIDER_FAILED`      | Provider raised `SpeechToTextException` — transport, HTTP 4xx/5xx, empty transcript. The full message is logged server-side; the wire message is sanitised.                                                                                                              |
| 503    | `SPEECH_PROVIDER_UNAVAILABLE` | The cascade found no provider, **or** the resolved provider's `isConfigured()` returned `false`. The 503 message lists the remediation: "Add an API key in Settings → Tools for OpenAI-compatible STT (Mistral, OpenAI Whisper, Groq, etc.) or install a speech plugin." |

The `/provider-configs/*` endpoints use their own error codes — `SPEECH_PROVIDER_CONFIG_NOT_FOUND` (404), `SPEECH_PROVIDER_CONFIG_FORBIDDEN` (403), `SPEECH_PROVIDER_CONFIG_INVALID` (422).

## Operator lifecycle

The expected operator flow when adding a second vendor:

1. **Install the plugin** (or add a second `SpeechProviderConfiguration` row for a built-in provider like OpenAI-compatible). The capability endpoint now lists two rows.
2. **Create a configuration** via `POST /api/v1/speech/provider-configs` with `{provider_class, display_name, is_global: true, settings: {...}}`. Admins only for global rows; users can create principal-scoped rows under a principal they own.
3. **Bind a preference** — either `PUT /api/v1/speech/preference` (the caller's user-principal) or `PATCH /api/v1/agents/{id}` setting `speech_driver_config_id` (per-agent override).
4. **Mark a default** for global rows via `POST /api/v1/speech/provider-configs/{id}/set-default` (admin only; demotes the previous default in a `lockForUpdate` transaction).

Deleting a configuration detaches every FK reference first — `agents.speech_driver_config_id` is nulled and `principal_preferences.preferred_speech_config_id` is nulled (the preference row itself stays put, but with no FK behind it). A stale reference can never resolve to a deleted row, and `SpeechProviderConfigPersistence::detachConfigurationReferencesStatic()` is a belt-and-braces pass on top of the `ON DELETE SET NULL` FK semantics on the agent column.

## What's next

- [API reference → Speech](/reference/api/speech) — every `/api/v1/speech/*` endpoint, auto-generated.
- [Plugin author guide → Speech providers](/develop/plugins/author-guide/speech-providers) — the `SpeechToTextProviderInterface` contract, the `#[AcceptedAudioMime]` attribute, and a walk-through adding a new STT plugin.
- [Plugin reference → MiniMax](/develop/plugins/reference/minimax) — the production example: OGG-first MIME preference, 20-language BCP-47 hint handling, `$trace_id` surfaced in metadata.
