---
title: Plugin author guide — LLM drivers
description: Adding a new LLM driver — a rare authoring surface; most plugins should add tools, not drivers.
---

# LLM drivers

Drivers work the same way as tools: a class in `src/Drivers/`, referenced by FQCN from the plugin's `drivers()` hook. Drivers implement `Spora\Drivers\LLMDriverInterface` and are picked up by the driver factory alongside the built-in OpenAI and Anthropic drivers.

Driver registration contracts (config keys, `LLMDriverConfigInterface`, environment overrides) are documented in [Concepts → LLM drivers](/reference/concepts/drivers). Plugin drivers follow the same rules — return the FQCN from `drivers()` and the plugin loader registers it under the declared id.

```php
/** @return array<string, class-string<\Spora\Drivers\LLMDriverInterface>> */
public function drivers(): array
{
    return [
        'acme-anthropic-compatible' => AcmeAnthropicDriver::class,
    ];
}
```

## When to add a driver (rarely)

For most plugins, **adding tools is more useful than adding a new driver** — drivers require parallel API-compat implementations across the Anthropic / OpenAI / Gemini surface, while a tool just needs an HTTP endpoint to call. Reach for a new driver only when:

- The provider has a non-OpenAI-compatible API contract (no other plugin can call it).
- The provider requires a streaming or function-calling semantics that the existing drivers cannot approximate.
- The user explicitly asked for a custom driver and you have a use case the built-in OpenAI/Anthropic drivers cannot satisfy.

In all other cases, the OpenAI-compatible driver can point at the new provider with just a `base_url` and an API key — no plugin code needed.

## What's next

- [Migrations](/develop/plugins/author-guide/migrations)
- [Admin UI](/develop/plugins/author-guide/admin-ui)
