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

**Keep `SKILL.md` under the soft cap of ~500 lines / ~5000 tokens.** The agentskills.io spec recommends splitting long content into `references/` sidecar files. Spora emits a `SKILL_BODY_OVERSIZE` warning above the cap; the skill is never rejected for this.

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
- 50 KB hard cap per file (returns `SKILL_FILE_TOO_LARGE` over).

The conventional subdirectories are `scripts/` (executable code), `references/` (additional docs), `assets/` (static resources), but any layout is accepted — the listing reflects the actual filesystem.

## Per-agent activation

Operators don't activate skills directly. They activate the **Skill tool** on an Agent and pick which skills are available via the tool's `allowed_skills` multi-select. That's it — no per-skill config, no per-skill onboarding. The skill is either available to the Agent or not.

The Skill tool is shipped with `spora-core`; you don't need to ship a separate tool class. The framework's `SkillController` powers the admin UI dropdown.

## Validation surface

The `SkillScanner` calls `SkillValidator` on every `SKILL.md` it finds. Errors and warnings surface on the skill's summary, surfaced to operators in the admin UI:

| Code                        | Severity | When                                                       |
| --------------------------- | -------- | ---------------------------------------------------------- |
| `EMPTY_FRONTMATTER`         | error    | SKILL.md has no YAML frontmatter block.                    |
| `SKILL_FRONTMATTER_MISSING` | error    | The frontmatter delimiter (`---`) is missing or malformed. |
| `NAME_REQUIRED`             | error    | `name` is missing.                                         |
| `NAME_PATTERN`              | error    | `name` doesn't match the slug pattern.                     |
| `NAME_CONSECUTIVE_HYPHEN`   | error    | `name` contains `--`.                                      |
| `NAME_DIR_MISMATCH`         | error    | `name` doesn't equal the parent directory name.            |
| `DESCRIPTION_REQUIRED`      | error    | `description` is missing.                                  |
| `DESCRIPTION_TOO_LONG`      | error    | `description` exceeds 1024 chars.                          |
| `SKILL_NAME_CONFLICT`       | error    | Two scan roots supply the same `(source, slug)` pair.      |
| `SKILL_BODY_OVERSIZE`       | warning  | `SKILL.md` body exceeds 500 lines or 50 KB.                |

Errors block the skill from being used; warnings are advisory.

## Source priority

The scanner tags each skill with a `source` label:

- `project` — operator's `<base>/skills/`.
- `core` — the framework's `<spora-core>/skills/`.
- `<plugin-slug>` — your plugin's `skills/` directory.

Two skills with the same `name` from DIFFERENT sources are distinct entries (the project can ship `git` and a plugin can ship its own `git` without collision). Two skills with the same `name` from the SAME source raise `SKILL_NAME_CONFLICT`.

## The `allowed-tools` frontmatter (spec-experimental, MVP: ignored)

The agentskills.io spec defines an `allowed-tools` field — a space-separated list of pre-approved tools the skill may invoke. Spora parses and surfaces it on the skill summary, but does **not** enforce it in MVP. Enforcing context-dependent tool approval requires a new mechanism (per-skill activation records in the Task context) tracked in `spora-workspace/backlog/skills-allowed-tools-enforcement.md`.

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
