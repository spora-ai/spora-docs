---
title: Plugin author guide — Speech providers
description: Implementing Spora\Speech\SpeechToTextProviderInterface — when to ship a plugin vs. configuring the built-in OpenAI-compatible transcriber, the interface contract, MIME declaration, and exception rules.
---

# Speech providers

A speech provider is a class that turns recorded audio bytes into a text transcript. Most plugins never need one — the built-in [`OpenAiCompatibleTranscriber`](https://github.com/spora-ai/spora-core/blob/main/app/Speech/OpenAiCompatibleTranscriber.php) covers the entire OpenAI-multipart family (OpenAI Whisper, Mistral Voxtral, Groq, Lemonfox, Fireworks, LocalAI, OpenRouter) through configuration alone. Ship a new provider class only when your vendor's wire shape is genuinely different.

The operator / agent-developer view — the cascade, the configuration table, and the capability endpoint — is in [Concepts → Speech providers](/reference/concepts/speech-providers). Read that first if you haven't.

## When to add a provider (rarely)

The OpenAI-compatible path is a configuration row, not a code change. Each operator instance can run multiple configs in parallel (one Mistral, one Groq, one self-hosted LocalAI), each with its own `display_name`. Reach for a new provider class only when:

- The vendor's STT endpoint is **not** `POST {base_url}/audio/transcriptions` with multipart `file` + `model` + optional `language` (e.g. Meta Muse's bespoke multipart + ffmpeg pipeline).
- The provider needs a non-multipart transport (gRPC, WebSocket streaming, vendor-specific signed URLs).
- The provider needs a wire-level transformation that no settings blob can express (chunked upload, timecoded alignment that the v1 result shape doesn't carry, etc.).

If you're trying to support a new OpenAI-multipart vendor, **don't ship a plugin** — document the `base_url` + `model` values and let operators add a row.

## The extension hook

Plugins contribute provider classes by returning their FQCNs from [`Spora\Extensions\SporaExtensionInterface::speechToTextProviders()`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/SporaExtensionInterface.php):

```php
final class YourPlugin extends AbstractPlugin
{
    public function speechToTextProviders(): array
    {
        return [YourTranscribeProvider::class];
    }
}
```

The registry discovers every loaded plugin's contribution at boot and walks the list in constructor order. Tier 5 of the cascade ("first-registered-wins fallback") picks the first provider in that order — order your plugin's `speechToTextProviders()` return value with that in mind.

## The interface contract

```php
namespace Spora\Speech;

interface SpeechToTextProviderInterface
{
    public function getName(): string;
    public function getDisplayName(): string;
    public function isConfigured(): bool;
    public function bindLabel(string $label): void;
    public function bindSettings(array $settings): void;
    public function transcribe(
        string $bytes,
        string $mimeType,
        ?string $languageHint = null,
        ?int $agentId = null,
        ?int $userId = null,
    ): TranscriptionResult;
}
```

`transcribe()` is the only method that does real work. Everything else is metadata the registry needs to render the capability endpoint, decide whether your provider is "configured", and surface the operator's per-config settings.

### Sync-only

Implementations MUST be synchronous. The interface is `transcribe(...)` returning a `TranscriptionResult`, not a `Promise` or an `AsyncIterable`. The v1 transcribe controller is request/response; SSE streaming is explicitly out of scope (`Sp​ora\Speech\SpeechToTextProviderInterface`'s plan locks this in). If your vendor's SDK is async, wrap it in a synchronous call.

### The `isConfigured()` gate

The registry calls `isConfigured()` on every `configuredProvider()` invocation, AFTER `bindSettings()`. Returning `false` filters your provider out so the cascade falls through to the next tier — and the transcribe endpoint returns 503 instead of throwing mid-call.

The v2-cascade pattern (the one used by `OpenAiCompatibleTranscriber` and `MiniMaxTranscribeProvider` after spora-core#238):

```php
public function isConfigured(): bool
{
    if ($this->boundSettings === null) {
        return true; // legacy v1 tool_user_settings path — optimistic default
    }
    $apiKey = $this->boundSettings['api_key'] ?? null;
    return is_string($apiKey) && trim($apiKey) !== '';
}
```

The optimistic `true` for the no-bound-settings branch keeps legacy operators working without a re-save. New providers can simplify by always returning `$this->boundSettings !== null` and trusting the registry to gate on the `api_key` field's presence.

### `bindLabel()` and `bindSettings()`

Both are transient. The registry rebinds them on every `configuredProvider()` and `describeWithConfig()` call so multi-tenant requests don't bleed labels or settings across calls.

The class-level PHP pattern for storing bound state without re-assigning readonly properties is `final` (not `final readonly`) plus a non-promoted mutable field:

```php
final class YourTranscribeProvider implements SpeechToTextProviderInterface
{
    private ?string $boundLabel = null;
    private ?array $boundSettings = null;

    public function bindLabel(string $label): void { $this->boundLabel = $label; }
    public function bindSettings(array $settings): void { $this->boundSettings = $settings; }

    public function getName(): string { return $this->boundLabel ?? 'your_provider'; }
    public function getDisplayName(): string { return $this->boundLabel ?? 'Your Provider'; }

    public function transcribe(string $bytes, string $mimeType, ?string $languageHint = null, ?int $agentId = null, ?int $userId = null): TranscriptionResult
    {
        $settings = $this->boundSettings
            ?? $this->configService->getEffectiveSettings(self::class, $agentId ?? 0, $userId);
        // ... use $settings['api_key'], $settings['model'], etc.
    }
}
```

Bound settings take priority over `ToolConfigService::getEffectiveSettings()`. The v2 cascade (`speech_provider_configurations` rows) is the single source of truth — the `ToolConfigService` fallback is only for legacy v1 operators who configured the key via `tool_user_settings`.

### `$agentId` is always 0

The controller passes `$agentId = 0` to `transcribe()` even when the request body carried an `agent_id`. The cascade resolves the class from agent preferences (so the badge is accurate), but the provider reads user / group / global settings from the resolved `SpeechProviderConfiguration` directly. Per-agent STT overrides via `agent_tool_settings` are intentionally out of scope.

The `$userId` argument is the **caller's** user id (always populated, never `null`). Use it for user-scoped rate-limit tracking, billing headers, etc. — never for tier resolution.

## MIME negotiation via `#[AcceptedAudioMime]`

Declare the MIMEs your provider accepts, in preference order, via class-level attributes. The SPA walks this list and picks the first `MediaRecorder.isTypeSupported()` match.

```php
use Spora\Speech\Attributes\AcceptedAudioMime;

#[AcceptedAudioMime('audio/ogg;codecs=opus')]
#[AcceptedAudioMime('audio/mp4')]
#[AcceptedAudioMime('audio/webm;codecs=opus')]
final class YourTranscribeProvider implements SpeechToTextProviderInterface {}
```

Order matters. The first matching MIME wins on the browser. If your vendor rejects a container (e.g. MiniMax rejecting `audio/webm;codecs=opus` because the Matroska wrapper trips its "matroska,webm" check), put a safer MIME ahead of the standard WebM order. The provider will silently fail with HTTP 502 if you don't — the attribute is the steering wheel.

When the provider doesn't declare any `#[AcceptedAudioMime]`, the registry falls back to the common-superset default:

```php
[
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/webm',
    'audio/wav',
]
```

Don't rely on the default unless your provider truly accepts all five.

## Settings via `#[ToolSetting]`

The dynamic create-config form is built from your provider's `#[ToolSetting]` attributes. The schema walker lives in [`SpeechProviderConfigValidator::collectSettingsSchema()`](https://github.com/spora-ai/spora-core/blob/main/app/Services/SpeechProviderConfigValidator.php). The OpenAI-compatible baseline:

| Field                  | Type       | Required                | Purpose                                                                                                                                 |
| ---------------------- | ---------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `api_key`              | `password` | yes                     | Bearer token. Encrypted at rest via `SecurityManager`; the wire response masks it as `'***'`.                                           |
| `display_name`         | `text`     | yes (OpenAI-compatible) | Operator-facing label. The registry calls `bindLabel()` with this on every request, so `getDisplayName()` returns it.                   |
| `base_url`             | `text`     | no                      | Vendor endpoint. Default the OpenAI URL for the OpenAI-multipart family.                                                                |
| `model`                | `text`     | no                      | Vendor model id.                                                                                                                        |
| `language`             | `text`     | no                      | Default BCP-47 hint; the per-request hint wins. (Not present on providers like MiniMax that always take the language from the request.) |
| `http_timeout_seconds` | `text`     | no                      | Per-request timeout. Regex `/^\d+$/`.                                                                                                   |

The full reference impl is `OpenAiCompatibleTranscriber` — read it before shipping a new provider that targets a vendor whose wire shape is even slightly different. MiniMax ships the same five-key set (`api_key` / `display_name` / `model` / `base_url` / `http_timeout_seconds`) without a `language` field, because its API takes the language from a per-request header rather than a per-config default.

`getName()` vs `getDisplayName()`: the registry populates both via `bindLabel()`, but providers differ in how they honour the bound value. `OpenAiCompatibleTranscriber::getName()` returns the bound label, then falls back to `'openai_compatible'`. `MiniMaxTranscribeProvider::getName()` always returns the literal `'minimax'` regardless of binding — `getDisplayName()` is the only one that reflects the operator's per-config override. Pick a consistent rule for your provider and document it; the SPA shows `display_name` next to the dropdown but uses `name` as the stable key for `preferred_audio_mimes` row matching.

## Exception rules

| Throw                   | When                                                                                                                              | Wire status                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `InvalidAudioException` | The provider cannot ingest the supplied MIME, the upstream returned an empty transcript, or the payload exceeds a documented cap. | 422 `INVALID_AUDIO`          |
| `SpeechToTextException` | Provider-side failure: transport error (DNS, TLS, timeout, connection reset), HTTP 4xx / 5xx, vendor returned an error envelope.  | 502 `SPEECH_PROVIDER_FAILED` |
| Anything else           | Don't — the controller treats unrecognised exceptions as 500 `INTERNAL_ERROR` and the operator sees a generic message.            | 500                          |

**API keys MUST NOT appear in exception messages.** The `SpeechToTextException` contract is enforced at the controller boundary; the registry and the controller log the raw message server-side but forward only a sanitised form to the API. To stay on the right side of this:

- Never interpolate `$apiKey` into the exception message. The base URL is safe to log (the controller's `classifyTransportFailure()` strips the host from the wire-facing message but preserves it in the operator log).
- When mapping an HTTP failure, take `error.message` from the JSON envelope verbatim but truncate to ≤ 200 chars. Don't include `WWW-Authenticate` headers or `request-id` cookies — some vendors echo the Bearer token in there.
- For transport failures, prefer the `(string) $e->getMessage()` of the underlying `TransportException`. Symfony's `HttpClient` already strips credentials from those.

`OpenAiCompatibleTranscriber::classifyTransportFailure()` and `::classifyHttpFailure()` are the canonical patterns — copy them, don't reinvent.

## Walk-through: a non-OpenAI-multipart plugin

A stripped-down version of `MiniMaxTranscribeProvider` — enough to show the shape, without the specific wire quirks:

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\YourVendor;

use Psr\Log\LoggerInterface;
use Spora\Services\ToolConfigService;
use Spora\Speech\Attributes\AcceptedAudioMime;
use Spora\Speech\InvalidAudioException;
use Spora\Speech\SpeechToTextException;
use Spora\Speech\SpeechToTextProviderInterface;
use Spora\Speech\TranscriptionResult;
use Spora\Tools\Attributes\ToolSetting;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface as HttpClientException;
use Symfony\Contracts\HttpClient\HttpClientInterface;

#[ToolSetting(
    key: 'api_key',
    label: 'YourVendor API Key',
    type: 'password',
    required: true,
)]
#[ToolSetting(
    key: 'display_name',
    label: 'Display name',
    type: 'text',
    default: 'YourVendor Speech-to-Text',
)]
#[ToolSetting(
    key: 'base_url',
    label: 'Base URL',
    type: 'text',
    default: 'https://api.yourvendor.io',
)]
#[AcceptedAudioMime('audio/ogg;codecs=opus')]
#[AcceptedAudioMime('audio/mp4')]
#[AcceptedAudioMime('audio/webm;codecs=opus')]
final class YourVendorTranscribeProvider implements SpeechToTextProviderInterface
{
    private ?string $boundLabel = null;
    private ?array $boundSettings = null;

    public function __construct(
        private HttpClientInterface $http,
        private ToolConfigService $configService,
        private ?LoggerInterface $logger = null,
    ) {}

    public function getName(): string { return 'yourvendor'; }
    public function getDisplayName(): string { return $this->boundLabel ?? 'YourVendor Speech-to-Text'; }

    public function bindLabel(string $label): void { $this->boundLabel = $label; }
    public function bindSettings(array $settings): void { $this->boundSettings = $settings; }

    public function isConfigured(): bool
    {
        if ($this->boundSettings === null) {
            return true;
        }
        $apiKey = $this->boundSettings['api_key'] ?? null;
        return is_string($apiKey) && trim($apiKey) !== '';
    }

    public function transcribe(
        string $bytes,
        string $mimeType,
        ?string $languageHint = null,
        ?int $agentId = null,
        ?int $userId = null,
    ): TranscriptionResult {
        $settings = $this->boundSettings
            ?? $this->configService->getEffectiveSettings(self::class, $agentId ?? 0, $userId);
        $apiKey = trim((string) ($settings['api_key'] ?? ''));
        if ($apiKey === '') {
            throw new SpeechToTextException('YourVendor API Key is not configured.');
        }

        try {
            $response = $this->http->request('POST', rtrim((string) ($settings['base_url'] ?? ''), '/') . '/v1/transcribe', [
                'headers' => [
                    'Authorization' => 'Bearer ' . $apiKey,
                    // The HTTP client flips to multipart/form-data when any
                    // `body` value is a stream resource. Mirror the
                    // OpenAiCompatibleTranscriber pattern: write bytes to a
                    // temp file, open it as a stream, use the handle.
                ],
                'body' => $this->buildMultipartBody($bytes, $mimeType, $languageHint),
            ]);
            $payload = $response->toArray();
        } catch (HttpClientException $e) {
            throw new SpeechToTextException('YourVendor STT request failed: ' . $e->getMessage(), 0, $e);
        } catch (\Throwable $e) {
            throw new SpeechToTextException('YourVendor STT request failed: ' . $e->getMessage(), 0, $e);
        }

        $text = is_string($payload['text'] ?? null) ? trim($payload['text']) : '';
        if ($text === '') {
            throw new InvalidAudioException('YourVendor STT returned no transcript.');
        }

        return new TranscriptionResult(text: $text, language: $languageHint, durationMs: null);
    }

    /**
     * Build a Symfony HttpClient `body` array whose file field is a
     * stream resource. Symfony's content-type detector reads the body
     * shape and flips to multipart/form-data automatically — see
     * OpenAiCompatibleTranscriber::sendTranscribeRequest() for the
     * canonical pattern.
     *
     * @return array<string, mixed>
     */
    private function buildMultipartBody(string $bytes, string $mimeType, ?string $languageHint): array
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'spora_yourvendor_stt_');
        if ($tempPath === false) {
            throw new SpeechToTextException('YourVendor STT request failed: failed to stage audio for upload.');
        }
        file_put_contents($tempPath, $bytes);

        $body = [
            'file' => fopen($tempPath, 'rb'),
            'response_format' => 'json',
        ];
        if ($languageHint !== null && trim($languageHint) !== '') {
            $body['language'] = trim($languageHint);
        }
        return $body;
    }
}
```

Wire the provider into your plugin's `speechToTextProviders()` hook and ship.

## Testing

The pattern in `OpenAiCompatibleTranscriberTest` and `MiniMaxTranscribeProviderTest`:

1. **Unit-test the dispatch** with a `MockHttpClient` that returns canned payloads. Assert on the URL, headers, and multipart shape.
2. **Test the bound-settings path** by calling `bindSettings(['api_key' => 'sk-test', ...])` then asserting `isConfigured()` and `transcribe()` read the bound value.
3. **Test the legacy fallback** by leaving `boundSettings = null` and asserting the `ToolConfigService` is consulted.
4. **Test exception mapping** — empty `text` → `InvalidAudioException`; HTTP 401 → `SpeechToTextException` with a sanitised message that does NOT contain the API key.

## What's next

- [Concepts → Speech providers](/reference/concepts/speech-providers) — the operator view of the cascade and the capability endpoint.
- [Migrations](/develop/plugins/author-guide/migrations) — only if your provider needs a new table (most don't; the v2 cascade lives in `speech_provider_configurations`, which spora-core owns).
- [Plugin reference → MiniMax](/develop/plugins/reference/minimax) — the production example: OGG-first MIME preference, 20-language BCP-47 hint, `$trace_id` surfaced in `TranscriptionResult::$metadata`.
