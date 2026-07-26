---
title: Skills
description: How Spora's Skill system lets operators ship versionable, file-backed bundles of agent knowledge. Mirrors the open agentskills.io format and is auto-discovered from three sources.
---

# Skills

A **Skill** is a versionable, file-backed bundle of operator knowledge an Agent can pull on demand. Skills are auto-discovered from three sources (project, framework, plugin), packaged as one normal Tool (`SkillTool`) the operator activates on an Agent, and gated per-Agent via a `multi-select` ToolSetting (mirrors `HandoverTool`'s `allowed_target_agents`).

The Agent sees a small, curated list of skill _summaries_ (name + short description) and can pull bodies / sidecar files on demand.

The on-disk format follows the open [agentskills.io](https://agentskills.io/specification) spec. Spora adds the Tool wrapper, per-agent allowlist, and chat-UI affordances on top.

## When to use a skill vs. an agent template

Agent templates bundle an Agent's _identity_ (system prompt, tool activations). Skills bundle _procedural knowledge_ the Agent reads on demand. Use:

- An **agent template** for: "here's a fully-configured Agent you can spin up".
- A **skill** for: "here's a chunk of expertise my existing Agent should know about".

The two are complementary — a template can reference a skill by name, and a skill can be re-used across many templates.

## Discovery

Skills are discovered from three sources, scanned in priority order:

1. The project-level `<base>/skills/` directory (if it exists).
2. The framework's bundled `<spora-core>/skills/` directory. The framework ships `time-arithmetic/` as a worked example.
3. Every directory returned by any loaded plugin's `skillPaths()` hook.

The scanner walks each directory depth-1, picks up every subdirectory that contains a `SKILL.md`, and validates the frontmatter. Project-level skills win on name conflict; same-priority conflicts surface a `SKILL_NAME_CONFLICT` warning rather than silent drops.

Operators can ship skills with a plugin by overriding the hook:

```php
public function skillPaths(): array
{
    return [__DIR__ . '/../skills'];
}
```

## On-disk format

```text
your-plugin/
└── skills/
    └── my-skill/
        ├── SKILL.md          # required: YAML frontmatter + Markdown body
        ├── examples.md       # optional sidecar files
        ├── scripts/          # optional
        └── references/       # optional
```

`SKILL.md` carries YAML frontmatter + a Markdown body. Optional sidecar files (e.g. `examples.md`, `references/REFERENCE.md`) are listed by the Skill tool's `files` operation and read on demand by `read`. The full schema is at [`skill.schema.json`](https://spora.dev/skill.schema.json) (mirrored in `spora-core/skill.schema.json`).

### Frontmatter

| Field           | Required | Constraints                                                                                                              |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`          | Yes      | 1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen, no `--`. Must match the parent directory name. |
| `description`   | Yes      | 1-1024 chars. Surface what the skill does AND when to use it; include trigger keywords.                                  |
| `license`       | No       | Short string (license name or filename). Informational.                                                                  |
| `compatibility` | No       | ≤ 500 chars. Env requirements.                                                                                           |
| `metadata`      | No       | Free-form `map<string,string>`.                                                                                          |
| `allowed-tools` | No       | (Spec-experimental) Parsed but not enforced. Tracked in `backlog/skills-allowed-tools-enforcement.md`.                   |

### Body

Markdown, no format restrictions. Spec recommends step-by-step instructions, examples, and edge cases. Keep `SKILL.md` under 500 lines / ~5000 tokens — Spora emits a soft `SKILL_BODY_OVERSIZE` warning above that, but never hard-rejects. Move long content to `references/` sidecar files.

## The Skill tool

When the operator activates the Skill tool on an Agent, the Agent gets two operations:

- `skill_read` (action `read`) — read one file from a skill. Default `filename` is `SKILL.md`; the frontmatter is stripped from that file. Sidecar files (e.g. `examples.md`) are returned verbatim. 50 KB hard cap.
- `skill_files` (action `files`) — list every file under the skill directory as `[{path, bytes}]`. Paths are relative to the skill root; subdirectories (`scripts/`, `references/`) are visible so the Agent can dive in.

### Per-agent allowlist

The Skill tool's only setting is `allowed_skills: multi-select`. Operators pick which skills are available to that Agent via the standard agent settings form. The list of skills shown in the dropdown comes from `GET /api/v1/skills` (powered by the skill scanner).

### LLM exposure

The `allowed_skills` setting has `exposeToLlm: true`. The LLM sees a list of `{name, description}` pairs (description truncated to ~80 chars) appended to the tool's description in the system message — Stage 1 of the [agentskills.io progressive disclosure](https://agentskills.io/specification#progressive-disclosure) model. The skill body is read on demand via `skill_read` (Stage 2); sidecar files are loaded as the Agent needs them (Stage 3).

### Security

- `name` must be in the Agent's `allowed_skills` (re-validated server-side).
- `filename` is path-traversal-hardened (no `..`, no leading `/`, no null bytes, realpath-containment check against the resolved skill root).
- The resolved skill is the first-wins match across the three sources.

## HTTP surface

| Method | Path                    | Purpose                                                                                                               |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/skills`        | List → `[{name, description, source, license, files_count, has_warnings}]`. Powers the `allowed_skills` multi-select. |
| `GET`  | `/api/v1/skills/{slug}` | One skill, full `files` listing + raw `SKILL.md` body.                                                                |

## Worked example: `time-arithmetic`

The framework ships a `time-arithmetic` skill at `<spora-core>/skills/time-arithmetic/`. It uses only `CurrentTimeTool` + `CalculatorTool` and is the canonical reference for plugin authors writing their first skill.

## See also

- [Plugin author guide: Skills](/develop/plugins/author-guide/skills)
- [agentskills.io specification](https://agentskills.io/specification) (the open format Spora follows)
- [Agent templates](/reference/concepts/agent-templates) (complementary mechanism for Agent identity)
- Backlog: [skills-allowed-tools-enforcement](/backlog/skills-allowed-tools-enforcement) (future enforcement of the spec-experimental `allowed-tools` field)
