---
title: Skills
description: How Spora's Skill system lets operators ship versionable, file-backed bundles of agent knowledge. Mirrors the open agentskills.io format and is auto-discovered from three sources.
---

# Skills

A **Skill** is a versionable, file-backed bundle of operator knowledge an Agent can pull on demand. Skills are auto-discovered from three sources (project, framework, plugin), packaged as one normal Tool (`SkillTool`) the operator activates on an Agent, and gated per-Agent via a `multi-select` ToolSetting (mirrors `SubAgentTool`'s `allowed_target_agents`).

The Agent sees a small, curated list of skill _summaries_ (name + short description) and can pull bodies / sidecar files on demand.

The on-disk format follows the open [agentskills.io](https://agentskills.io/specification) spec. Spora adds the Tool wrapper, per-agent allowlist, and chat-UI affordances on top.

## When to use a skill vs. an agent template

Agent templates bundle an Agent's _identity_ (system prompt, tool activations). Skills bundle _procedural knowledge_ the Agent reads on demand. Use:

- An **agent template** for: "here's a fully-configured Agent you can spin up".
- A **skill** for: "here's a chunk of expertise my existing Agent should know about".

The two are complementary — a template can reference a skill by name, and a skill can be re-used across many templates.

## Discovery

Skills are discovered from three **on-disk** sources, scanned in priority order:

1. The project-level `<base>/skills/` directory (if it exists).
2. The framework's bundled `<spora-core>/skills/` directory. The framework ships `time-arithmetic/` as a worked example.
3. Every directory returned by any loaded plugin's `skillPaths()` hook.

The scanner walks each directory depth-1, picks up every subdirectory that contains a `SKILL.md`, and validates the frontmatter. Project-level skills win on name conflict; same-priority conflicts surface a `SKILL_NAME_CONFLICT` error rather than silent drops.

Operators can ship skills with a plugin by overriding the hook:

```php
public function skillPaths(): array
{
    return [__DIR__ . '/../skills'];
}
```

A fourth source — a `skillProviders()` hook — covers skills with no directory at all. All four are read through one `SkillProviderRegistry`, with core's filesystem provider first. See [Custom skills](#custom-skills).

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

`SKILL.md` carries YAML frontmatter + a Markdown body. Optional sidecar files (e.g. `examples.md`, `references/REFERENCE.md`) are listed by the Skill tool's `files` operation and read on demand by `read`. The frontmatter field table above is the canonical reference for the on-disk format (Spora follows the open [agentskills.io](https://agentskills.io/specification) spec).

### Frontmatter

| Field           | Required | Constraints                                                                                                              |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`          | Yes      | 1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen, no `--`. Must match the parent directory name. |
| `description`   | Yes      | 1-1024 chars. Surface what the skill does AND when to use it; include trigger keywords.                                  |
| `license`       | No       | Short string (license name or filename). Informational.                                                                  |
| `compatibility` | No       | ≤ 500 chars. Env requirements.                                                                                           |
| `metadata`      | No       | Free-form `map<string,string>`.                                                                                          |
| `allowed-tools` | No       | (Spec-experimental) Parsed but not enforced. Tracked in the spora-workspace backlog.                                     |

### Body

Markdown, no format restrictions. Spec recommends step-by-step instructions, examples, and edge cases. Keep `SKILL.md` under 500 lines / 50 KB — Spora emits a soft `SKILL_BODY_OVERSIZE` warning above that, but never hard-rejects. Move long content to `references/` sidecar files.

## The Skill tool

When the operator activates the Skill tool on an Agent, the Agent gets two operations:

- `skill(action: "read", …)` — read one file from a skill. Default `filename` is `SKILL.md`; the frontmatter is stripped from that file. Sidecar files (e.g. `examples.md`) are returned verbatim. 50 KB hard cap.
- `skill(action: "files", …)` — list every file under the skill directory as `[{path, bytes}]`. Paths are relative to the skill root; subdirectories (`scripts/`, `references/`) are visible so the Agent can dive in.

### Per-agent allowlist

The Skill tool's only setting is `allowed_skills: multi-select`. Operators pick which skills are available to that Agent on the agent's **Tools** tab (`/agents/:id/tools`). The list of skills shown in the dropdown comes from `GET /api/v1/skills` (powered by the skill registry), narrowed by `?principal_id=`. Shipped and custom skills appear in the same list.

The allowlist is a **names** list, not a capability grant. An allowlisted name still has to resolve for the execution's principal, so a personal custom skill on a group agent's allowlist does not become readable by the group — see [Visibility](#visibility).

### Bundled skills on the agent tools UI

A tool can declare that it depends on one or more skills via `#[Tool(recommendsSkills: [...])]` on the PHP attribute — see [Concepts → Tool system → Bundled skills](/reference/concepts/tools#bundled-skills) for the authoring side. On the agent's **Tools** tab, every slug from `recommendsSkills` gets its own row inside the tool card (in declaration order) once the parent tool is on, so operators can flip each skill on or off independently rather than engaging with the whole bundle at once. Each row shows the title-cased skill name on top (`media-library` → `Media Library`) with the raw slug underneath in a monospaced subtitle so the operator can copy it; the row's Toggle mirrors the small switch used for tool enables and per-operation auto-approve. Rows are disabled with a **Skill not installed** tooltip when `SkillTool` is not registered in the tool registry — the strict-mode 500 from `GET /api/v1/tools` usually keeps this from happening in production, but the UI defends anyway. Tools that do not declare any `recommendsSkills` skip the affordance entirely.

There are three flows:

- **Per-skill ON.** Flipping a single slug to ON first auto-enables `SkillTool` (no-op if it is already on), then writes that one slug into the SkillTool `allowed_skills` allowlist for this Agent. After the write, `SkillTool`'s status is re-fetched so any **Missing config** / **credentials to configure** badge clears — the per-agent override just written satisfies the required `allowed_skills` setting.
- **Per-skill OFF.** Flipping a single slug to OFF removes only that one slug from the allowlist; `SkillTool` stays enabled because other bundled skills (this tool's, or sibling tools') may still need it. `SkillTool`'s status is re-fetched so the **Missing config** badge re-appears if the operator toggled off the last remaining slug. There is no confirm dialog — the toggle is the request.
- **Parent-tool disable.** Flipping the parent tool's main switch off strips the **unique** recommended slugs (slugs no other enabled tool also recommends) from the allowlist in the same request flow. Shared slugs are kept — the sibling tool that still owns them may be on. `SkillTool` itself stays enabled: it is a shared resource, an empty allowlist is a valid "ready" state, and the UI prefers leaving it on to guessing at the operator's intent. The per-skill rows vanish with the parent tool because the section only renders while the tool is on. Again, no confirm dialog.

The uniqueness rule means two tools that both recommend the same skill do not cascade the cleanup when only one of them is disabled — the slug stays on the allowlist because the sibling tool still owns it. Shared slugs disappear automatically the moment no tool recommends them.

The wire shape the UI relies on:

- `GET /api/v1/agents/{id}/tools/skill/override?raw=true` returns the flat `{ settings: { allowed_skills: "[…]" } }` shape — the `?raw=true` query skips the controller's `{value, source}` annotation wrapper so the multi-select JSON can be parsed directly. Writes go to the same path via `PUT` with `{ settings: { allowed_skills: "[…]" } }`. See `useBundledSkills` (`spora-frontend/src/composables/useBundledSkills.ts`) for the canonical shape.

Plugin authors should declare their bundled skills so operators do not have to wire them up by hand. See [Plugin author guide → Skills → Validation](/develop/plugins/author-guide/skills#validation) for the build-time check that keeps the bundled-skill list honest, and the [API error contract](/reference/concepts/tools#errors) when the declaration drifts from the on-disk scanner.

### LLM exposure

The `allowed_skills` setting has `exposeToLlm: true`. The LLM sees a list of `{name, description}` pairs (description truncated to ~80 chars) appended to the tool's description in the system message — Stage 1 of the [agentskills.io progressive disclosure](https://agentskills.io/specification#progressive-disclosure) model. The skill body is read on demand via `skill(action: "read", …)` (Stage 2); sidecar files are loaded as the Agent needs them (Stage 3).

### Security

Two gates, in this order — the order is the point:

1. `name` must be in the Agent's `allowed_skills` (re-validated server-side).
2. The skill must be visible to the **execution's principal**, not just to whoever is signed in. A skill allowlisted on a group agent whose provider scopes by principal fails this gate, which is what stops one tenant's `allowed_skills` from becoming a cross-tenant read primitive.

Then, on the read itself:

- `filename` is path-traversal-hardened (no `..`, no leading `/`, no null bytes), and the file must appear in the provider's **own** listing before a read is attempted. The provider re-validates containment independently — the tool's filter is the cheap first pass, not the defence — and both the provider and the tool re-assert the 50 KB cap.
- The resolved skill is the first-wins match across the sources, with core's filesystem provider first.

### Custom skills

A **custom skill** is a skill that has no directory. Everything above — `skillPaths()`, the scanner, the `SKILL.md` on disk — is the _shipped_ case, where the content is a static part of a release. Custom skills are authored by a person or written by an agent, stored in a database, and scoped to one principal.

They arrive through a fourth source: the `skillProviders()` hook on [`SporaExtensionInterface`](https://github.com/spora-ai/spora-core/blob/main/app/Extensions/SporaExtensionInterface.php). The container builds one `SkillProviderRegistry` from core's `FilesystemSkillProvider` plus every plugin's provider classes, in that order, and the `skill` tool, `SkillController`, and the `allowed_skills` projection all read through it. The tool is unchanged — a custom skill is read with the same `skill(action: "read", …)` call as a shipped one.

|               | Shipped skill                          | Custom skill                                                        |
| ------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Lives in      | A directory with a `SKILL.md`          | A `custom_skills` row (+ sidecar rows)                              |
| Registered by | `skillPaths()`                         | `skillProviders()`                                                  |
| Visible to    | Everyone                               | One principal (see the rules below)                                 |
| Authored by   | The plugin / operator, at release time | A person in the admin UI, or the agent via `manage_skill`           |
| Deleted by    | Removing the file                      | `DELETE` on the plugin's own route, which also scrubs the allowlist |

The first plugin to ship custom skills is [`spora-ai/spora-plugin-custom-skills`](https://github.com/spora-ai/spora-plugin-custom-skills), which contributes the **Custom Skills** admin panel at `/apps/custom-skills` and the `manage_skill` tool. Read and write are deliberately different tools — `skill` is core, read-only, and gated by `allowed_skills`; `manage_skill` is the plugin's, principal-scoped and approval-gated. See [Tool system → Reading vs writing skills](/reference/concepts/tools#reading-vs-writing-skills).

#### Visibility

Custom skills are scoped per principal, and the read and write gates are deliberately asymmetric:

| Caller's relation to the principal | Read       | Write      |
| ---------------------------------- | ---------- | ---------- |
| Own user-principal                 | ✅         | ✅         |
| Group they belong to, **any role** | ✅         | ❌         |
| Group owner or admin               | ✅         | ✅         |
| Unrelated principal                | ❌ (`404`) | ❌ (`403`) |

Reading a group's custom skills needs only **membership**. Writing into a group's instruction set needs **owner or admin** (`callerControlsPrincipal`). A member can read a group's skills but cannot author into them — a skill is instructions the model will follow, not shared notes, so the write gate is the stronger of the two. A principal the caller cannot see is a `404` rather than a `403` on reads: a `403` would confirm the skill exists, which is a cross-tenant existence oracle.

Shipped skills are outside this entirely. Core's `FilesystemSkillProvider` ignores `$principalId` — operator-authored content is identical for everyone, and scoping it per principal would mean a copy per user of a file the operator already controls.

#### Identity, precedence, and collisions

Identity is the frontmatter `name`, not a directory slug — the allowlist stores names, the tool lowercases and trims what the model sends, and the route is name-keyed. Custom skills force `name === slug` at write time so the two cannot diverge, because they are the same column on the same row.

Precedence is **first provider wins, and core is first**: `SkillProviderRegistry` dedupes names claimed by an _earlier_ provider, so a custom skill named `typst` is shadowed by a shipped `typst` rather than replacing it. Within a single provider, duplicate names pass through — a provider surfacing one name twice is reporting a defect in itself, and hiding it would discard the evidence. A write that collides with a shipped name is rejected up front (`409 SKILL_NAME_RESERVED`) rather than creating a row the model could never resolve.

`source` is a bucket label, not a lookup key. Each skill reports its own `source` (`project`, `core`, `<plugin-slug>`, `custom-skills`) and the SPA groups by it; the provider-level `source()` never overwrites it.

#### Lifecycle, caps, and deletion

There is **no draft/published workflow**. A `manage_skill` write goes live when it is approved — the per-call approval card _is_ the review step, and a second `draft` → `published` gate would be redundant. What is kept instead:

- `provenance` (`human` | `agent`) so the UI can say "Last edited by agent · 14:02".
- `previous_snapshot` (frontmatter + body + files), written on every update, for a one-step restore. Restoring re-snapshots the current state first, so restore is itself undoable.

Caps are enforced as **errors** with named codes, not warnings — 25 skills per principal, 20 sidecar files per skill, 200 KB total per skill, 50 KB per file, `description` ≤ 1024 chars. The reasoning is that `SkillValidator` emits a soft `SKILL_BODY_OVERSIZE` _warning_ and `ValidationResult::isValid()` checks errors only, so without hard caps a user-authored body is unbounded.

Deleting a custom skill also **scrubs its name from every `allowed_skills` array for that principal**, in the same transaction, and the response names the agents it touched. Without that, a deleted skill is silently dropped from the tool definition and every agent that used it loses a capability with no signal. Only principal-owned custom skills are deletable through the plugin, so a shipped skill can never be scrubbed from an agent's config.

## HTTP surface

| Method | Path                    | Purpose                                                                                                               |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/skills`        | List → `[{name, description, source, license, files_count, has_warnings}]`. Powers the `allowed_skills` multi-select. |
| `GET`  | `/api/v1/skills/{slug}` | One skill, full `files` listing + raw `SKILL.md` body.                                                                |

`?principal_id=N` narrows the listing to one principal — the SPA already sends it and derives it per editor mode (agent / group / personal), so honouring it is what stops a group admin's personal skills appearing in the group's picker. An id the caller cannot see is discarded before it reaches a provider, so a hand-crafted `?principal_id=` cannot read another tenant's skills, bodies included.

This is the **read** surface and it covers both kinds of skill. Custom-skill CRUD is not here: those routes are the plugin's own, under `/api/v1/custom-skills*`, and the frontend must not re-fetch shipped skills from the plugin.

## Worked example: `time-arithmetic`

The framework ships a `time-arithmetic` skill at `<spora-core>/skills/time-arithmetic/`. It uses only the `time` tool (with the `now` and `format` operations — both ops also return a `weekday` field, long English name on an ISO 8601 Monday-based week) and the `calculator` tool, and is the canonical reference for plugin authors writing their first skill. The skill's v2.0 revision also doubles as a worked example of how to [reference tools correctly in skill prose](/develop/plugins/author-guide/skills#tool-reference-style) — earlier versions referenced tool names that don't exist in the LLM schema (`current_time.now()`, `skill_read`).

## See also

- [Plugin author guide: Skills](/develop/plugins/author-guide/skills) — shipping a directory, or writing a `SkillProviderInterface` provider
- [Tool system → Reading vs writing skills](/reference/concepts/tools#reading-vs-writing-skills) — `skill` vs. `manage_skill`
- [REST API reference](/reference/api) — the HTTP surface
- [agentskills.io specification](https://agentskills.io/specification) (the open format Spora follows)
- [Agent templates](/reference/concepts/agent-templates) (complementary mechanism for Agent identity)
- **Chat-UI rendering**: when the Agent calls `skill(action: "read", …)` on `SKILL.md`, the chat UI renders a compact `Loaded skill: <slug>` badge in place of the standard tool-call card. `skill(action: "read", …)` of any sidecar file and `skill(action: "files", …)` keep the standard tool-call card. The badge is driven by `tool_name` + `action` + `filename` matching in `TaskChatMessageList.vue`; no backend change.
- **Future work**: enforcement of the spec-experimental `allowed-tools` field is tracked in the spora-workspace backlog (file lives outside this docs repo).
