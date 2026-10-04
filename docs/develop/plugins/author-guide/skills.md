---
title: Plugin author guide — Skills
description: Ship Skills with your plugin. Documents the skillPaths() hook, the on-disk SKILL.md format, the warning-code surface, and the per-agent allowlist UX.
---

# Skills

Skills are versionable, file-backed bundles of operator knowledge the Agent can pull on demand. They live as directories under your plugin's `skills/` folder, are auto-discovered at boot, and surface to operators as cards in the Agent settings form (via the Skill tool's `allowed_skills` multi-select).

Spora follows the open [agentskills.io](https://agentskills.io/specification) format — the on-disk layout, frontmatter fields, and progressive-disclosure model are spec-conformant.

## Scaffolding

The fastest way to create the SKILL.md + examples.md stub is the `make:skill` command from [spora-maker](https://github.com/spora-ai/spora-maker):

```bash
php bin/spora make:skill <slug>
```

The slug is validated against the agentskills.io name pattern (1-64 lowercase alphanumeric + hyphens, no leading/trailing hyphen, no consecutive hyphens). The command writes:

- `skills/<slug>/SKILL.md` — frontmatter stub + body TODO blocks
- `skills/<slug>/examples.md` — sidecar stub

For **plugin-bundled** skills, write the files by hand instead — spora-maker scaffolds the project-level `skills/` directory, not plugin directories.

## Directory layout

```text
your-plugin/
├── plugin.json
└── skills/
    └── my-skill/
        ├── SKILL.md          # required: YAML frontmatter + Markdown body
        ├── examples.md       # optional sidecar files
        ├── scripts/          # optional (convention)
        └── references/       # optional (convention)
```

`SKILL.md` is the entry point. Optional sidecar files (e.g. `examples.md`, `references/REFERENCE.md`) are listed by the Skill tool's `files` operation and read on demand by `read`.

## Declaring the path

Override `skillPaths()` on your plugin entry point. The framework looks at `<plugin>/skills/` by convention; for a custom layout, point at the directory depth-1 that holds your skill roots:

```php
final class YourPlugin extends AbstractPlugin
{
    public function skillPaths(): array
    {
        return [__DIR__ . '/../skills'];
    }
}
```

If your plugin ships no skills, simply delete the `skillPaths()` override — the base class default returns `[]`.

The framework's `SkillScanner` walks each returned directory depth-1 and treats immediate children as skill roots. A child counts as a skill only if it contains a `SKILL.md`.

## SKILL.md frontmatter

```yaml
---
name: my-skill
description: 'What the skill does and when to use it. Include trigger keywords.'
license: Apache-2.0
compatibility: Requires git 2.30+
metadata:
  author: your-team
  version: '1.0'
---
```

| Field           | Required | Constraints                                                                                                              |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`          | Yes      | 1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen, no `--`. Must equal the parent directory name. |
| `description`   | Yes      | 1-1024 chars. What + when to use. Include trigger keywords.                                                              |
| `license`       | No       | Informational.                                                                                                           |
| `compatibility` | No       | ≤ 500 chars.                                                                                                             |
| `metadata`      | No       | Free-form `map<string,string>`.                                                                                          |
| `allowed-tools` | No       | Spec-experimental. Parsed but not enforced in MVP.                                                                       |

## SKILL.md body

Markdown, no format restrictions. The body is what the Agent reads when it calls `skill(action: "read", name: "<slug>", filename: "SKILL.md")`. Frontmatter is stripped on read.

**Keep `SKILL.md` under the soft cap of 500 lines / 50 KB.** The agentskills.io spec recommends splitting long content into `references/` sidecar files. Spora emits a `SKILL_BODY_OVERSIZE` warning above the cap; the skill is never rejected for this.

```markdown
# When to use this skill

Trigger on any of:

- "..."
- "..."

# Steps

1. ...
2. ...

# Edge cases

- ...
```

## Sidecar files

Anything in the skill directory except `SKILL.md` is a sidecar. The Skill tool's `files` operation lists them as relative paths:

```text
SKILL.md
examples.md
references/REFERENCE.md
scripts/extract.py
```

`skill(action: "read", name: "<slug>", filename: "<file>")` reads them on demand:

- `filename` must be a relative path within the skill.
- `SKILL.md` is special-cased: frontmatter is stripped on read.
- 50 KB hard cap per file (the tool returns a `ToolResult(false, "...capped at 50000 bytes.")` over; no error code on the result payload today).

The conventional subdirectories are `scripts/` (executable code), `references/` (additional docs), `assets/` (static resources), but any layout is accepted — the listing reflects the actual filesystem.

## Tool reference style

When a SKILL.md body describes a tool call, write the call shape the LLM actually sees in its function-calling schema — not the human-friendly shortcut. The LLM schema is synthesised from `#[Tool]` and `#[ToolOperation]` attributes; the discriminator is the operation's `discriminatorKey` (default `action`) and lives next to the tool's other parameters. For example, the bundled `skill` tool exposes:

```json
{
  "type": "object",
  "properties": {
    "action": { "type": "string", "enum": ["read", "files"] },
    "name": { "type": "string" },
    "filename": { "type": "string", "default": "SKILL.md" }
  },
  "required": ["action", "name"]
}
```

So the SKILL.md body should reference this tool as `skill(action: "read", name: "<slug>", filename: "examples.md")` — never `skill_read` (no such tool exists in the LLM schema) and never `skill.read(filename: "...")` (the dot is a useful prose shortcut, but parameter lists shaped like method calls confuse the LLM).

The same rule applies to every multi-operation tool — these tools declare an `action` discriminator field because they ship more than one `#[ToolOperation]`: `time` (`now`, `format`) — both ops return a `weekday` (long English name, ISO 8601 Monday-based), `skill` (`read`, `files`), `agent` (`create_agent`, `configure_tools`, `read_agent`, `update_agent`, `list_agents`, `get_available_tools`, `read_notes`, `write_notes`, `write_notes_overwrite`), `user_info` (`get_health_data`, `get_locations`, …), `media` (`upload`, `retrieve`, `list`, …). The prose shortcut `<tool>.<operation>` is fine in headings for readability, but worked examples in code blocks must show the JSON-call shape (`tool(action: "op", param: "value")`).

Single-operation tools (one `#[ToolOperation]`) — for example `calculator` with its single `calculate` op — do **not** expose an `action` discriminator. Their call shape is parameter-only: `calculator(expression: "100 * 2.5 + 50")`, not `calculator(action: "calculate", expression: "…")`. The `action:` dance is a multi-op-only pattern; using it on a single-op tool produces an unexpected-argument validation error from the runtime schema validator.

This is a real trap — see the time-arithmetic skill's v2.0 revision for an example of fixing skill prose that referenced `current_time.now()` (a tool that doesn't exist) and `skill_read` (the synthetic discriminator name, not a real tool). The same trap recurs whenever an LLM tool name follows a `<verb>_<noun>` convention — only the discriminator-action shape works.

## Per-agent activation

Operators don't activate skills directly. They activate the **Skill tool** on an Agent and pick which skills are available via the tool's `allowed_skills` multi-select. That's it — no per-skill config, no per-skill onboarding. The skill is either available to the Agent or not.

The Skill tool is shipped with `spora-core`; you don't need to ship a separate tool class. The framework's `SkillController` powers the admin UI dropdown.

## Directory or provider?

Pick one. `skillPaths()` and `skillProviders()` are not two ways to do the same job.

|                     | `skillPaths()` — ship a directory                | `skillProviders()` — ship a provider              |
| ------------------- | ------------------------------------------------ | ------------------------------------------------- |
| The content is…     | a static part of your release                    | per-user, per-tenant, or synthesised at runtime   |
| It lives in…        | a directory under your plugin, with a `SKILL.md` | your database, an API, anywhere                   |
| Registration        | return the directory from `skillPaths()`         | return the provider class from `skillProviders()` |
| Implementation work | write Markdown                                   | implement five methods, honour the principal      |
| Shipped by          | the release                                      | the admin panel or an agent tool                  |

**If your skill is the same for every user on the instance, ship a directory.** A provider for static content is strictly more work: you synthesise the `SKILL.md` from columns, re-implement containment checks, and you have opted into a principal you may not need. `spora-plugin-custom-skills` is the worked example of the _other_ column — user-authored, tenant-scoped, database-backed.

The `SpellingRulebook` — a plugin that ships a `spelling/SKILL.md` any user of the instance should get — is the case for a directory, not a provider.

## Shipping a provider, not a directory

`skillProviders()` is a **data hook** on `SporaExtensionInterface`, mirroring `speechToTextProviders()`. It returns class names; the container resolves them and builds one `SkillProviderRegistry` in a fixed order — core's `FilesystemSkillProvider` first, then your plugin's. See [Plugin system → Why `skillProviders()` is a data hook](/reference/concepts/plugins-system#why-skillproviders-is-a-data-hook-and-not-an-event) for why this is not a PSR-14 event.

```php
namespace Acme\TenantSkills;

use Spora\Plugins\AbstractPlugin;
use Spora\Skills\SkillProviderInterface;

final class AcmePlugin extends AbstractPlugin
{
    /** @return list<class-string<SkillProviderInterface>> */
    public function skillProviders(): array
    {
        return [TenantSkillProvider::class];
    }
}
```

### The interface contract

```php
namespace Spora\Skills;

interface SkillProviderInterface
{
    public const MAX_FILE_BYTES = 50_000;

    public function source(): string;
    public function getSkills(?int $principalId): array;                       // list<SkillSummary>
    public function getSkillDetails(string $name, ?int $principalId): ?SkillDescriptor;
    public function getSkillFiles(string $name, ?int $principalId): ?array;    // list<array{path, bytes}>|null
    public function getSkillFile(string $name, string $path, ?int $principalId): ?string;
}
```

**Two wire types, on purpose.** `SkillSummary` is the list shape (`name`, `description`, `license`, `source`, `slug`, `fileCount`, `hasWarnings`); `SkillDescriptor` is the detail shape (a `SkillSummary` plus `body`, `compatibility`, `allowedTools`, `metadata`, `files`, `warnings`). Neither carries `body` on the list path: the `allowed_skills` multi-select loads every visible skill at once, and a body on the list type is 50 KB per dropdown row. Never return a descriptor from `getSkills()`.

**`source()` is a label, not a lookup key.** It is a bucket for operators and the UI. Each skill's own `SkillSummary::source` is what wins in the response and what the SPA groups by — a single provider serving mixed content must not have its `source()` overwrite that.

**Identity is the frontmatter `name`.** Every lookup keys on it, matching `ToolConfigService`'s name→skill map and the name-keyed route. `slug` is a storage column and a URL segment, nothing more.

### Four rules the registry depends on

These are not style preferences. Each one is load-bearing for a caller that cannot defend itself.

1. **`null` and `[]` are different answers.** `getSkillFiles()` returns `null` for an unknown _or invisible_ skill and `[]` for a known skill with no files. Collapsing them turns "no such skill" into "a skill with nothing in it".
2. **An empty string is a legal body, not a "not found" signal.** `getSkillFile()` returns `null` only when `$path` is not a member of the skill. A zero-byte sidecar must come back as `''`.
3. **Fail closed on the principal.** A principal-scoped provider returns `[]` for `$principalId === null` and for any unresolvable id (`<= 0`, or an id whose row is gone). Callers pass `null` on operator-default and strict-mode paths; widening there would leak one tenant's skills into another's view.
4. **`getSkillFile()` re-validates, independently of the caller.** Do not normalise or resolve `$name` / `$path`, do not pass them to a filesystem API, and enforce `MAX_FILE_BYTES` **before** materialising content — checking after the read has already paid the memory the cap exists to avoid. The two-call `getSkillFiles()` → `getSkillFile()` flow is why: it opens a window a single-pass implementation does not have. `SkillTool` checks the listing before reading, and re-asserts the cap on whatever comes back, but a check the caller cannot enforce on the callee is not a check. Cover it with a test that returns content for a path the provider does not list.

### Precedence

`SkillProviderRegistry` dedupes **first-provider-wins across providers**; a provider's own duplicate names both pass through. Core's `FilesystemSkillProvider` is first in the static class list, so **installing your plugin can never shadow a shipped skill** — a custom skill named `typst` loses to a shipped `typst` rather than replacing it. Surface that at write time by rejecting a colliding name outright, so a user is not invited to author a skill the model could never resolve.

### Version floor

Pin `spora-ai/spora-core` to the release that first ships `SkillProviderInterface`, and put the guard in your **constructor** — the one moment the loader calls your code directly:

```php
final class AcmePlugin extends AbstractPlugin
{
    public function __construct()
    {
        if (!interface_exists(SkillProviderInterface::class)) {
            throw new PluginLoadFailedException(
                'skillProviders() needs a spora-core that ships Spora\\Skills\\SkillProviderInterface. '
                . 'Upgrade the host or disable this plugin.',
            );
        }
    }
}
```

This is not belt-and-braces. On a core that predates the provider seam, nothing warns you: the CRUD routes register, the admin panel lists the skills the user just wrote, and the agent can never see one. Fail loudly instead — but read the trade first.

**The constructor is the only place a guard actually runs.** `PluginLoader` instantiates the entry point with a bare `new $fqcn()` and calls the ten data hooks, but it never calls a `boot()` method — that hook was removed in 1.0 and replaced by [`BootingEvent`](/develop/plugins/author-guide/foundations#lifecycle-is-events-not-hooks). The obvious-looking `public function boot(): void` guard would therefore never execute. The alternative, a `BootingEvent` listener, is worse: the dispatch runs inside `PluginLoader::dispatchWithTolerance()`, which catches `Throwable` and writes only to `error_log()`. Your exception disappears into the PHP error log, the boot carries on, and you are back to the silent failure. (`dispatchWithTolerance()` is also private — it is an implementation detail of the loader, not a contract to build against.)

**What a throwing constructor costs you.** `PluginLoader::boot()` has no per-plugin tolerance around `new $fqcn()`. `Kernel` catches the `PluginLoadFailedException` and skips plugin boot, which means the discovery loop aborts: your plugin _and every plugin the loader had not yet reached_ stay unloaded for that boot, and the operator gets a single `warning` in the Spora log rather than a broken request. State that trade in the exception message so whoever hits it knows the blast radius. `spora-plugin-custom-skills` is the shipped example — read its constructor for the shape the framework expects.

## Validation surface

The `SkillScanner` calls `SkillValidator` on every `SKILL.md` it finds. Errors and warnings surface on the skill's summary, surfaced to operators in the admin UI.

### Reusing `SkillValidator` from a provider

A provider that stores a skill as rows has no `SKILL.md` to hand the scanner, so it calls the validator itself — on the in-memory frontmatter array, which is all the validator ever read:

```php
public function validate(array $frontmatter, ?string $body = null, ?string $parentDirName = null): ValidationResult
```

**That signature is frozen and plugin-facing.** A provider that validates user-authored content should reuse it rather than reimplement the rules, so a skill written in the admin panel is held to exactly the same standard as one shipped in a release. `ValidationResult` is the return type: `errors()` (the skill cannot be used), `warnings()` (advisory), `isValid()` (errors only — a warning never makes a result invalid), and `toArray()` for the wire.

Two adjustments make it fit a provider:

- Map your tool/route parameter `allowed_tools` to the **hyphenated** `allowed-tools` key first. `ALLOWED_TOP_KEYS` expects the spec form and raises `UNKNOWN_TOP_LEVEL_KEY` — a hard error — on the snake_case spelling.
- Strip `files` before validating. `SkillValidator` has no `files` concept and would reject it as an unknown top-level key. Your sidecar set is validated by your own caps.

`$parentDirName` is the filesystem-only third argument: it is what raises `NAME_DIR_MISMATCH` when a `SKILL.md`'s `name` differs from its parent directory. A database row has no directory, so pass `null` — and enforce the equivalent invariant yourself. `spora-plugin-custom-skills` forces `name === slug` at write time for exactly this reason.

Enforce hard caps as **errors** on the write path. `BODY_SOFT_BYTE_LIMIT` emits a warning, and `isValid()` checks errors only, so a validator call alone leaves a user-authored body unbounded.

### SkillValidator (frontmatter rules)

| Code                      | Severity | When                                                     |
| ------------------------- | -------- | -------------------------------------------------------- |
| `EMPTY_FRONTMATTER`       | error    | SKILL.md has no YAML frontmatter block.                  |
| `UNKNOWN_TOP_LEVEL_KEY`   | error    | Frontmatter contains a key not in the allowed list.      |
| `NAME_REQUIRED`           | error    | `name` is missing.                                       |
| `NAME_INVALID`            | error    | `name` is not a non-empty string.                        |
| `NAME_CONSECUTIVE_HYPHEN` | error    | `name` contains `--`.                                    |
| `NAME_PATTERN`            | error    | `name` doesn't match the slug pattern.                   |
| `NAME_DIR_MISMATCH`       | error    | `name` doesn't equal the parent directory name.          |
| `DESCRIPTION_REQUIRED`    | error    | `description` is missing.                                |
| `DESCRIPTION_INVALID`     | error    | `description` is not a non-empty string.                 |
| `DESCRIPTION_TOO_LONG`    | error    | `description` exceeds 1024 chars.                        |
| `LICENSE_INVALID`         | error    | `license` is set but not a string.                       |
| `COMPATIBILITY_INVALID`   | error    | `compatibility` is set but not a string.                 |
| `COMPATIBILITY_TOO_LONG`  | error    | `compatibility` exceeds 500 chars.                       |
| `METADATA_INVALID`        | error    | `metadata` is set but not an object.                     |
| `METADATA_VALUE_INVALID`  | error    | `metadata` contains a non-string key or value.           |
| `ALLOWED_TOOLS_INVALID`   | error    | `allowed-tools` is set but not a space-separated string. |
| `SKILL_BODY_OVERSIZE`     | warning  | `SKILL.md` body exceeds 500 lines or 50 KB.              |

### SkillScanner (discovery rules)

| Code                        | Severity | When                                                       |
| --------------------------- | -------- | ---------------------------------------------------------- |
| `SKILL_MD_UNREADABLE`       | error    | `file_get_contents` failed on `SKILL.md`.                  |
| `SKILL_FRONTMATTER_MISSING` | error    | The frontmatter delimiter (`---`) is missing or malformed. |
| `SKILL_NAME_CONFLICT`       | error    | Two scan roots supply the same `(source, slug)` pair.      |

Errors block the skill from being used; warnings are advisory.

## Source priority

The scanner tags each skill with a `source` label:

- `project` — operator's `<base>/skills/`.
- `core` — the framework's `<spora-core>/skills/`.
- `<plugin-slug>` — your plugin's `skills/` directory.

Two skills with the same `name` from DIFFERENT sources are distinct entries (the project can ship `git` and a plugin can ship its own `git` without collision). Two skills with the same `name` from the SAME source raise `SKILL_NAME_CONFLICT`.

## The `allowed-tools` frontmatter (spec-experimental, MVP: ignored)

The agentskills.io spec defines an `allowed-tools` field — a space-separated list of pre-approved tools the skill may invoke. Spora parses and surfaces it on the skill summary, but does **not** enforce it in MVP. Enforcing context-dependent tool approval requires a new mechanism (per-skill activation records in the Task context) — tracked in the spora-workspace backlog (file lives outside this docs repo).

## Chat-UI affordance

When an Agent calls `skill(action: "read", name: "<slug>", filename: "SKILL.md")` (the default filename), the chat transcript replaces the standard tool-call card with a compact `Loaded skill: <slug>` badge. The same op against a sidecar file, and `skill(action: "files", …)` listings, keep the standard card. Plugin authors don't configure this — it's driven by the spora-frontend renderer (matching on `tool_name` + `action` + `filename`); no backend change.

## Validation

When your plugin's tool declares `#[Tool(recommendsSkills: [...])]`, the framework's strict-mode contract kicks in: `GET /api/v1/tools` returns HTTP 500 `TOOLS_RECOMMENDS_SKILLS_MISSING` for the entire operator instance if any declared slug is not on disk under the scanner roots. **spora-core's build-time gate only validates CORE tools** — `tests/Unit/Tools/ToolRecommendsSkillsValidationCoreTest` (in [spora-core](https://github.com/spora-ai/spora-core/blob/main/tests/Unit/Tools/ToolRecommendsSkillsValidationCoreTest.php)) walks every framework tool class against the framework's bundled skills. Each plugin must validate its own tool/skill pair, because the framework cannot enumerate your tool classes for you.

The recommended pattern mirrors the framework test — construct the three pieces over your own inputs and assert the validator returns an empty list:

```php
use Psr\Log\NullLogger;
use Spora\Services\ToolConfigNameResolver;
use Spora\Services\ToolsRecommendsSkillsValidator;
use Spora\Skills\SkillScanner;
use Spora\Plugins\YourPlugin\Tools\YourTool;

it('declares only recommendsSkills slugs that exist on disk', function (): void {
    $scanner = new SkillScanner([
        ['path' => __DIR__ . '/../skills', 'source' => 'your-plugin'],
    ]);
    $resolver = new ToolConfigNameResolver(new NullLogger(), [YourTool::class]);
    $validator = new ToolsRecommendsSkillsValidator($resolver, $scanner);

    expect($validator->validate())->toBe([]);
});
```

This catches the failure mode at PR time on your plugin's own CI instead of at runtime on the operator's instance. The validator short-circuits with HTTP 500 only because the framework is the source of truth for the rule; the test is where you prove your plugin complies.

## End-to-end example

A minimal plugin that ships one skill:

```text
spora-plugin-your-plugin/
├── plugin.json
├── src/
│   └── Plugin.php
└── skills/
    └── my-skill/
        ├── SKILL.md
        └── examples.md
```

`SKILL.md`:

```yaml
---
name: my-skill
description: 'Does X. Use when the user asks for X or mentions X.'
---
# When to use this skill
...
# Steps

1. ...
```

`src/Plugin.php`:

```php
final class YourPlugin extends AbstractPlugin
{
    public function getName(): string
    {
        return 'Your Plugin';
    }

    public function skillPaths(): array
    {
        return [__DIR__ . '/../skills'];
    }
}
```

Run `composer test` after building — the framework's `SkillScannerTest` discovers your skill automatically. Operators see it in the Agent settings form as soon as your plugin is installed.

## See also

- [Concepts → Skills](/reference/concepts/skills) — the operator view: discovery, the `allowed_skills` allowlist, and custom skills
- [Plugin system](/reference/concepts/plugins-system#why-skillproviders-is-a-data-hook-and-not-an-event) — the hook table and why `skillProviders()` is data, not an event
- [`spora-plugin-custom-skills`](https://github.com/spora-ai/spora-plugin-custom-skills) — a shipped provider: database-backed, principal-scoped, with a `manage_skill` write tool
- [`agentskills.io`](https://agentskills.io/specification) — the open on-disk format Spora follows
