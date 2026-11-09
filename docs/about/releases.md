---
title: Release notes
description: What shipped in each Spora release, in plain language — for operators, plugin authors and contributors.
---

# Release notes

Spora ships as a set: the framework (`spora-core`), the admin UI (`spora-frontend`), the plugins,
and the `spora` skeleton that pulls them together. Each note below covers the whole set — what an
operator gets, and what a plugin author has to do about it.

Versions are `0.x.y` until 1.0. Under the pre-1.0 policy a **minor** bump may carry breaking
changes, so read the breaking-change section before you upgrade. The [roadmap](/about/roadmap#versioning)
explains the policy.

## Unreleased

Spora's LLM drivers can now say **how hard the model should think**, and OpenAI's reasoning models
can finally **think and call tools in the same turn**. Two changes ship together: a per-message
reasoning effort, and a new driver for OpenAI's Responses API.

### Reasoning effort you can set per message

Every provider that has a reasoning control names it differently and accepts a different subset of
levels. Spora now has one vocabulary of its own — `none`, `minimal`, `low`, `medium`, `high`,
`xhigh`, `max` — and each driver maps it onto its provider's own parameter.

**A default on the LLM configuration.** The OpenAI-compatible, Anthropic-compatible and OpenAI
Responses drivers carry a new **Effort** setting. Its first entry is _Model default_, which is the
default: nothing is sent, and the provider applies whatever it would have applied anyway. Pick a
level and every task on that configuration starts there.

**An override per message in the chat.** The composer carries a picker, and so does the follow-up
row, so a single message can think harder or cheaper than the rest of the conversation. The picker
offers the levels the agent's driver can express and starts on the configuration's default.

The resolution order is: the message's own effort when it carries one, then the configuration's
default, then nothing sent.

**The operator configures, the provider validates.** There is no table of levels per model — a
driver describes the protocol, the model describes the capability. A level the model does not
accept fails at the provider, with the provider's own error naming the offending value.

### A new "OpenAI Responses" driver

Over OpenAI's Chat Completions API, a reasoning model cannot do two things at once. From GPT-5.4
onward, Chat Completions does not support tool calling with any `reasoning_effort` value other than
`none` — and because the model's own default is `medium`, sending nothing is a `400` as well. An
agent could run, but the model would never think, which is what those models are bought for.

The new **OpenAI Responses** driver speaks `/v1/responses`, the endpoint where a reasoning model
can reason _and_ call tools in the same turn. Its effort level travels nested (`reasoning.effort`)
rather than flat, and it counts output tokens with `max_output_tokens`.

**Moving the level mid-chat is free on GPT-6 and later.** There the driver changes the effort with
a `configuration_update` item rather than by rewriting the request, so the cached prompt prefix
survives. On an earlier model the same change is a prefix edit, and it costs the cache.

**Your price rows still apply.** The driver is metered under the same provider tag as the Chat
Completions driver, so the price rows you already have for a model keep matching when you point an
agent at it.

**Retention is off by default.** The Responses API stores a conversation for at least 30 days unless
it is told not to, so Spora sends `store: false` unless the operator turns on the driver's **Store
responses** setting. A self-hosted platform has no business keeping its operators' conversations on
somebody else's servers.

Choose this driver for OpenAI's own reasoning models. Everything else — vLLM, Ollama, LM Studio,
Groq, Mistral, DeepSeek — stays on the Chat Completions driver, and their `/v1/responses`
implementations differ per provider.

### Anthropic moves to the 2026-10-21 API

The Anthropic driver now sends `anthropic-version: 2026-10-21`. That version removed the sampling
parameters, which costs two settings.

**`temperature` is gone.** A request that sends it answers `400` on every model, so the setting
leaves the configuration form and the driver never sends it. The cost is precise: **Claude 4.7 and
later are unaffected** — those models only accept the default, so Spora's `0.7` was never in
effect — while on **Sonnet 4.6 and earlier** the sample moves from `0.7` to the API default of
`1.0`, so the output becomes slightly more varied. For an agent loop that is neutral-to-positive,
and those models are a generation behind. `effort` is the replacement control: Anthropic's own
guidance is that effort shapes the whole response, tool calls included.

**`thinking_budget` is gone, and `effort` replaces it.** The two are the same knob in two
generations of the API. A manual budget is a `400` on Claude 4.7 and later, so keeping it would
have been a knob that breaks the request the moment the operator upgrades the model. The cost is
narrow but real: **Sonnet 4.5 and Haiku 4.5 have no `effort`**, so **manual extended thinking is
no longer configurable on those two models at all**. On every other model `effort` takes over, and
the reasoning you see in the chat keeps showing — Spora asks for the summarised thinking
explicitly, because the API's own default stopped returning it.

A stored `temperature` or `thinking_budget` is pruned the next time that configuration is saved.
There is no data migration to run.

### One breaking change, for plugin authors

`Spora\Services\TaskServiceInterface::startTask()` and `continueTask()` change signature — each
takes the reasoning effort for the task, as a plain optional `?string $effort = null`.

**If you run an operator's Spora install: nothing to do.** No shipped plugin implements the
interface.

**If you write a plugin and implement `TaskServiceInterface`: your class will not load.** PHP makes
an unimplemented interface method fatal at class-load, so the interface and every implementor have
to move together. A plugin that only _calls_ the service is unaffected.

### What else changed

- **Anthropic's default model** — the driver now defaults to a current Claude generation. The
  Claude 3.x generation it defaulted to is retired and answers an error on every request.
- **Image input** — the built-in drivers' image heuristics now cover the current model families
  (the current Claude ids, `gpt-4.1`, `gpt-5`, `gpt-6`). A configuration that never set the
  _Allow images_ toggle starts sending images where it previously did not. Set the toggle
  explicitly if your provider rejects image blocks.

### Upgrading

```bash
composer update spora-ai/spora-core spora-ai/spora-frontend
```

**Run the migration before the worker starts.** This release adds a `tasks.effort` column. The web
path installs the schema itself on the next request, but **the CLI worker does not** — it opens the
database without running migrations. A worker that fires before the migration has run writes a task
against a table without the column, and the run fails with a log line and nothing more. So:

```bash
composer update spora-ai/spora-core
php bin/spora spora:install
```

...before any worker starts.

## v0.15 — 27 October 2026

The headline is **Spora speaks German**, end to end. Underneath that sit two new subsystems an
operator has been asking for — settings you can change without a shell, and a per-agent HTTP API —
and a chat that compacts its history instead of losing it.

### A language setting that follows the account

The admin UI and the framework now ship a German catalogue alongside English, and every plugin
joined in. Pick a language on the **account** page and the choice is written to the server — not
just remembered by the browser — so it follows you to another machine and survives a cleared
`localStorage`.

The picker only offers languages the **server** has a catalogue for. If your instance carries extra
catalogues, they appear in the picker; if a locale is missing, it is not offered rather than
offered and broken.

Framework strings, the admin UI, and each plugin's own copy — tool names, setting descriptions,
plugin descriptions — are translated. Anything the _model_ reads stays English, on purpose: the
model and the operator are looking at different text.

### Settings you can change without editing a file

**Settings → Runtime settings** is a new page that holds Spora's runtime configuration, and it is
where the values live from now on. It has five tabs: General, Mail & Realtime, Worker &
Performance, Media & Plugins, and System.

The page saves to the database, and the database is the layer that wins:

```text
registry default  <  config.php  <  .env / OS environment  <  database
```

That ordering surprises people, so the page says so when it happens: **a value you save here
overrides one you set in `.env` months ago and forgot about.** On a shared host where you cannot
reach a shell, it is the only layer you can write to.

Sixteen keys stay file-only — the `SPORA_DB_*` family and the other `bootOnly` ones are read
before the database opens, so they cannot live in it. They are listed read-only on the **System**
tab, each with the reason it is read where it is.

Full details: [Global settings](/start/operators/global-settings).

### A per-agent HTTP API

Spora can expose an HTTP API scoped to one agent, for talking to it from outside the admin UI —
a script, another service, a phone. It is **off by default**; turn it on with the
`SPORA_AGENT_API` setting, and manage each agent's keys from that agent's tab in the UI.

The API has its own reference, including the chat, media and callback endpoints:
[Agent API](/reference/agent-api).

### Chat that compacts instead of forgetting

Long conversations used to run into the model's context limit and stop. Now Spora **compacts**:
it summarises the older turns, keeps the summary in the transcript, and carries on.

Three things changed with it. You can read above the newest message and see exactly where the
compaction happened, marked in place. The notice about it lives in the transcript rather than
floating in the composer. And you can compact by hand, when you want to, instead of waiting for
the model to need it.

### Sub-agents that hand over in the background

A sub-agent call can now run **auto-approved** — the `sub_agent` operation no longer waits for a
human to approve it. When the child finishes it can hand the work back in the background, and a
`sub_agent_continue` operation picks it up. The UI shows a card for the child so you can see what
it did.

Two related fixes: a missing argument no longer reports itself as approved, and the expected
child count now tracks the list of spawned ids rather than drifting from it.

### The `ask` operation now ships enabled

The `ask` tool is on by default. It was available before and had to be switched on per agent.

### Plugins speak German too

Every plugin in the set ships a German catalogue: the 19 plugins and the 5 plugin frontends all
did, in the same release. A German install reads your tool names, your setting descriptions and
your plugin description in German, with no i18n code on your side.

If you write a plugin and want the same, the pattern is a `locales/` directory and one hook:
[Plugin author guide — Translations](/develop/plugins/author-guide/translations).

### One breaking change, for plugin authors

`Spora\Core\Database::__construct()` now takes a `Spora\Core\Config` instead of an array, and the
keys it reads are named `SPORA_DB_DRIVER` and `SPORA_DB_PATH` rather than `db_driver` and
`db_path`.

**If you run an operator's Spora install: nothing to do.** No plugin's production code builds a
`Database`, so this changes nothing you can see.

**If you write a plugin and boot a database in your tests: one line.** Where you had

```php
$db = new Database(['db_driver' => 'sqlite', 'db_path' => $tmpDb]);
```

write

```php
$db = new Database(new Config(['SPORA_DB_DRIVER' => 'sqlite', 'SPORA_DB_PATH' => $tmpDb]));
```

`Config::getString()` returns the caller's default for a key that is absent, so those two keys are
all a SQLite connection needs.

### What else changed

- **openai-image** — image variations now go to the edits endpoint, a single variation is allowed,
  the multipart upload is repaired, and the input image the plugin stages on disk is capped.
- **typst** — the skill now declares the tools it uses, and the SonarCloud test-execution report
  is read at the property the PHPUnit sensor actually reads.
- **muse** — this repository is scanned by its own CI rather than relying on automatic analysis.
- **word** — the build fails when SonarCloud stored no analysis, instead of going green having
  measured nothing.
- **custom-skills frontend** — the file size cap is measured in bytes, not characters.
- **memories frontend** — a route segment that is not a number yields `null`, not `0`.
- **team-graph frontend** — the agent detail panel drops the Hierarchy chain.
- **scaffolder (`spora-maker`)** — scaffolds the four-parameter `ToolInterface::execute()`, stops
  naming hooks that were removed in 1.0, prints the complete App subscriber for controller route
  wiring, and names the resource rather than the PHP class in the route.
- **installer** — a `.gitignore` tidy for the scratch directory.
- **skeleton** — Renovate now keeps the Docker base images current. The runtime tag stays pinned to
  an exact release, because a floating `frankenphp` tag moved to a new Caddy and Mercure hub
  under a running deployment once already and broke every boot.

### Versions in this release

| Package                                        | Version |
| ---------------------------------------------- | ------- |
| `spora-ai/spora-core`                          | v0.31.0 |
| `spora-ai/spora-frontend`                      | v0.26.0 |
| `spora-ai/installer`                           | v1.6.1  |
| `spora-ai/spora-maker`                         | v0.1.5  |
| `spora-ai/spora-plugin-calendar`               | v0.9.0  |
| `spora-ai/spora-plugin-custom-skills`          | v0.2.1  |
| `spora-ai/spora-plugin-custom-skills-frontend` | v0.4.0  |
| `spora-ai/spora-plugin-email`                  | v0.7.0  |
| `spora-ai/spora-plugin-media-archive`          | v0.7.1  |
| `spora-ai/spora-plugin-media-archive-frontend` | v0.7.0  |
| `spora-ai/spora-plugin-memories`               | v0.8.1  |
| `spora-ai/spora-plugin-memories-frontend`      | v0.3.0  |
| `spora-ai/spora-plugin-minimax`                | v0.17.0 |
| `spora-ai/spora-plugin-muse`                   | v0.3.0  |
| `spora-ai/spora-plugin-openai-image`           | v0.7.0  |
| `spora-ai/spora-plugin-semantic-scholar`       | v0.6.0  |
| `spora-ai/spora-plugin-serper`                 | v0.7.0  |
| `spora-ai/spora-plugin-skeleton`               | v0.4.0  |
| `spora-ai/spora-plugin-staan`                  | v0.3.0  |
| `spora-ai/spora-plugin-tavily`                 | v0.6.0  |
| `spora-ai/spora-plugin-team-graph`             | v0.2.0  |
| `spora-ai/spora-plugin-team-graph-frontend`    | v0.2.0  |
| `spora-ai/spora-plugin-typst`                  | v0.6.1  |
| `spora-ai/spora-plugin-typst-frontend`         | v0.3.0  |
| `spora-ai/spora-plugin-weather`                | v0.7.0  |
| `spora-ai/spora-plugin-word`                   | v0.2.0  |
| `spora-ai/spora-plugin-worldnews`              | v0.7.0  |
| `spora-ai/spora-plugin-zernio`                 | v0.6.0  |

The `spora` skeleton is v0.15.0, with v0.15.1 picking up the installer and scaffolder patches.

### Upgrading

```bash
composer update spora-ai/spora-core spora-ai/spora-frontend
```

The frontend ships as a prebuilt asset on a GitHub Release, so the update pulls the new bundle;
there is nothing to build. The language selector appears on the account page once the framework and
the UI are both on v0.15.

## v0.14 — 22 October 2026

The release that made skills first-class.

- **Skills** — a provider seam for skills, a read-only skill tool, and agent self-configuration. A
  skill can read a per-file sidecar, and a grammar for `allowed-tools` puts the declared tool
  names on the wire. The bundled skills are MIT, and the two agent skills became distinct.
- **Media** — `markdown_content` was replaced by markdown derivatives, a `create_media` operation
  and a document embed arrived, and a MIME-refiner seam was added. Control characters are stripped
  from download filenames.
- **Breaking** — the inert legacy `$userId` was dropped from `ToolInterface::execute()`, and core
  no longer ships a skill search provider.
- **Admin UI** — the command palette finally calls `GET /search`, a skill can declare a tool the
  agent does not have, and the spora-file-card download got a style.

| Package                   | Version |
| ------------------------- | ------- |
| `spora-ai/spora-core`     | v0.30.0 |
| `spora-ai/spora-frontend` | v0.25.0 |

## Where to look next

- [Global settings](/start/operators/global-settings) — the runtime settings registry
- [Agent API](/reference/agent-api) — the per-agent HTTP API
- [Plugin author guide — Translations](/develop/plugins/author-guide/translations) — shipping a
  German catalogue with your plugin
- [Roadmap](/about/roadmap) — what is being built next
