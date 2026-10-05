---
title: Plugin author guide — LLM drivers (removed)
description: The drivers() hook was removed in Spora 1.0. A plugin no longer contributes LLM providers; here is what to do instead.
---

# LLM drivers (removed)

> **This chapter is a tombstone.** The `drivers()` hook it used to teach was **removed in Spora 1.0** and is no longer part of `Spora\Extensions\SporaExtensionInterface`. There is no code to copy here, because there is no code to call.

## What changed

`Spora\Extensions\SporaExtensionInterface` declares exactly ten methods, and `drivers()` is not one of them. The hook had no callers in the boot sequence, so an implementation of it was silently ignored — a plugin that "registered a driver" this way shipped a class the driver factory never loaded.

The drivers are now a flat, positional list in the container: `Spora\Core\ContainerDefinitions::llmDefinitions()` hard-codes exactly `OpenAICompatibleDriver` and `AnthropicCompatibleDriver` under `llm_driver_classes`, with no id key in the entry. Each driver's id lives on the class itself, in a private `PROVIDER_KEY` const surfaced through its static `getName()` — `openai_compatible` and `anthropic_compatible` respectively. The old `llm_driver_classes_merged` entry survives only as an `array_values(array_unique(...))` copy of that same static list so `LLMConfigService` can inject it without a rewrite; it merges nothing from plugins.

If you are porting a pre-1.0 plugin, delete the `drivers()` method and the class it referenced. Nothing else in the plugin needs to change.

## What to do instead

**Almost always: configure the existing OpenAI driver.** Both built-in drivers expose a `base_url` setting, so any OpenAI-shaped vendor works with no plugin code at all — set `base_url` to the vendor's endpoint and paste an API key. The same `base_url` override is what makes Ollama, Groq, LM Studio, Azure, and friends work. The full contract — the config keys, `LLMDriverConfigInterface`, the `LLMDriverConfiguration` model, per-field password encryption, and how the factory resolves the effective config for an agent — is in [Concepts → LLM drivers](/reference/concepts/drivers).

A new driver class is only worth building if the vendor's API is genuinely not OpenAI- or Anthropic-shaped: a different streaming protocol, a tool-calling dialect the existing drivers cannot express, or a request/response contract that `base_url` plus a key cannot reach. Note that a class you write still has to be registered in the container's `llm_driver_classes` entry by the host — a plugin cannot do that for you.

## The plugin seams that do exist

If what you actually wanted to extend was a provider-shaped surface, these are the real hooks:

- **[Speech providers](/develop/plugins/author-guide/speech-providers)** — `speechToTextProviders()` contributes `Spora\Speech\SpeechToTextProviderInterface` implementations. Same shape as the old idea, and genuinely wired: plugins returning a non-empty list join the `SpeechToTextRegistry`, where the first configured provider wins per request. Here too, the built-in `OpenAiCompatibleTranscriber` covers the whole OpenAI-multipart family through configuration alone, so a vendor-specific provider is rarely justified.
- **[Skills](/develop/plugins/author-guide/skills)** — `skillPaths()` ships `SKILL.md` directories; `skillProviders()` generates skills that have no directory.
- **[Agent templates](/develop/plugins/author-guide/agent-templates)** — `agentTemplatePaths()` ships curated one-click Agents.
- **[Tools](/develop/plugins/author-guide/tools)** — the canonical surface, and what most plugins ship instead.

The full ten-hook table is in [Foundations → Available hooks](/develop/plugins/author-guide/foundations#available-hooks).

## What's next

- [Foundations](/develop/plugins/author-guide/foundations) — the ten hooks that actually exist
- [Tools](/develop/plugins/author-guide/tools) — the canonical plugin surface
