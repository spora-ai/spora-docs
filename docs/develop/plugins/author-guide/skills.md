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

Markdown, no format restrictions. The body is what the Agent reads when it calls `skill_read` against `SKILL.md`. Frontmatter is stripped on read.

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

`skill_read` reads them on demand:

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
    "name":   { "type": "string" },
    "filename": { "type": "string", "default": "SKILL.md" }
  },
  "required": ["action", "name"]
}
```

So the SKILL.md body should reference this tool as `skill(action: "read", name: "<slug>", filename: "examples.md")` — never `skill_read` (no such tool exists in the LLM schema) and never `skill.read(filename: "...")` (the dot is a useful prose shortcut, but parameter lists shaped like method calls confuse the LLM).

The same rule applies to every other multi-operation tool: `time`, `calculator`, `agent`, `user_info`, `media`. The prose shortcut `<tool>.<operation>` is fine in headings for readability, but worked examples in code blocks must show the JSON-call shape (`tool(action: "op", param: "value")`).

This is a real trap — see the time-arithmetic skill's v2.0 revision for an example of fixing skill prose that referenced `current_time.now()` (a tool that doesn't exist) and `skill_read` (the synthetic discriminator name, not a real tool).

## Per-agent activation

Operators don't activate skills directly. They activate the **Skill tool** on an Agent and pick which skills are available via the tool's `allowed_skills` multi-select. That's it — no per-skill config, no per-skill onboarding. The skill is either available to the Agent or not.

The Skill tool is shipped with `spora-core`; you don't need to ship a separate tool class. The framework's `SkillController` powers the admin UI dropdown.

## Validation surface

The `SkillScanner` calls `SkillValidator` on every `SKILL.md` it finds. Errors and warnings surface on the skill's summary, surfaced to operators in the admin UI.

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

When an Agent calls `skill_read` against `SKILL.md` (the default filename), the chat transcript replaces the standard tool-call card with a compact `Loaded skill: <slug>` badge. `skill_read` of any sidecar file and `skill_files` keep the standard card. Plugin authors don't configure this — it's driven by the spora-frontend renderer (matching on `tool_name` + `action` + `filename`); no backend change.

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
