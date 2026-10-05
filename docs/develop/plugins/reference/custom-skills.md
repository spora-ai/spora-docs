---
title: Custom skills
description: Principal-scoped custom skills. Author skills by hand or ask the agent to, and serve them through core's `skill` tool alongside the shipped ones.
---

# Custom Skills Plugin for Spora

Lets a person — or an agent — author skills that no release shipped, and hands them to the same reader every shipped skill uses. A custom skill appears in the same `allowed_skills` multi-select as a filesystem one, and the agent reads it with the same `skill` call. What the plugin adds is the **write** side, which core deliberately has no opinion about, plus the admin panel to do it by hand.

This is the only implementer of the `skillProviders()` hook in the org, which makes it the production instance of the contract the author guide states in the abstract — the guide's worked example is a stub, this is the shipped one.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-custom-skills
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, one tool is exposed — `manage_skill`, in Spora's `agent` category — and the **Custom Skills** tile appears in the admin panel's Apps dropdown at `/apps/custom-skills`.

> **Warning:** `Spora\Skills\SkillProviderInterface` is **not in any tagged release yet.** It landed on core's `main` on 2026-10-03 (PR #279), after the `v0.29.0` tag of 2026-09-30 — whose `app/Skills/` carries only `Skill`, `SkillScanner`, `SkillValidator`, `ValidationResult` and `Exceptions/SkillNotFoundException.php`. The declared floor in `composer.json` is `">=0.29.0 <2.0.0 || @dev"`, so Composer resolves it happily on a real 0.29.0 install; the failure surfaces later, when `CustomSkillsPlugin::__construct()` throws `PluginLoadFailedException` because the interface is missing.
>
> That guard is load-bearing: without it, an old core would serve the CRUD routes and the panel while no agent could ever see a custom skill. Its cost is that `PluginLoader::boot()` has no per-plugin tolerance around `new $fqcn()` — `Kernel` catches the exception and skips plugin boot for the whole request, so this plugin takes **every** installed plugin down with it. The condition is not "an incompatible core" but the only core there is to install from a tag: no release carries the seam, so an operator on a tagged host must run a `dev` core or disable the plugin. That is what the exception message says.

### The frontend package

The panel is a pre-built Vue SPA shipped as a **separate** Composer package, [`spora-ai/spora-plugin-custom-skills-frontend`](https://github.com/spora-ai/spora-plugin-custom-skills-frontend) (type `spora-plugin-frontend`). The PHP package's `require` block pulls it in transitively, so there is nothing extra to install.

The two-package split lets the bundle ship on its own release cadence and lets a backend-only checkout use the `manage_skill` tool without the panel. The frontend package's `extra.spora-plugin-slug` must equal `plugin.json#slug`; the installer refuses to install when it does not.

## Configuration

The plugin ships **no tool settings**. There is no Settings → Tools entry, and nothing is encrypted at rest. Configuration is who the skills belong to:

| What the operator picks | Where                                                                          | Effect                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Acting principal        | `?principal_id=N` on every request, driven by the panel's sticky principal bar | Which principal's skills the call reads or writes. Omitted → the caller's own user-principal. |

Read and write gate the target principal **differently**, and the asymmetry is the design, not an oversight — a custom skill is instructions the model will follow, so reading a group's skills needs only membership while authoring into a group's instruction set needs ownership.

| Caller's relation to the principal | Read                  | Write           |
| ---------------------------------- | --------------------- | --------------- |
| Own user-principal                 | ✅                    | ✅              |
| Group they belong to, any role     | ✅                    | ❌              |
| Group owner or admin               | ✅                    | ✅              |
| Unrelated principal                | `404 SKILL_NOT_FOUND` | `403 FORBIDDEN` |

An unreadable principal returns an empty list on the index route and a `404` elsewhere — never a `403`, which would confirm the principal exists. Writes can safely say `403`, because there the caller already knows the target.

Shipped skills sit outside this entirely: core's `FilesystemSkillProvider` ignores the principal, since operator-authored content is identical for everyone.

## Per-tool parameters

The plugin ships **one** tool, `manage_skill`, with three operations. It is **write-only by design** — reads are already served by core's `skill` tool under the `allowed_skills` gate, and a second read tool is one more way for a model to see something it was not granted. The tool description says so explicitly and points the model at `skill` for reads.

| Operation | Enabled by default | Approval | Purpose                                                                                                      |
| --------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `create`  | yes                | **yes**  | Create a new skill on this principal. Fails if the name is taken.                                            |
| `update`  | yes                | **yes**  | Replace an existing skill. Fails if the name is unknown, and **refuses to rename**.                          |
| `delete`  | **no**             | **yes**  | Delete the skill, its files, its previous version, and every `allowed_skills` reference to it. Irreversible. |

Every operation is approval-gated, and an approved write goes live — there is no draft/published workflow, because the approval card _is_ the review step. `delete` is additionally off by default: the destructive path does not ride on the safe default.

### Parameters

| Parameter       | Type   | Required for                   | Notes                                                                                                                                                                                                                                               |
| --------------- | ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`        | string | all three, but **synthesised** | Operation discriminator, emitted by the schema builder from the `#[ToolOperation]` declarations. An unrecognised value returns `Invalid action '<value>'. Must be create, update, or delete.`                                                       |
| `name`          | string | `create`, `update`, `delete`   | Lowercase alphanumeric and hyphens, 1–64 chars, no leading, trailing, or consecutive hyphen. **Immutable once created** — `update` refuses a rename, because the name is the key every agent's `allowed_skills` refers to. Delete + create instead. |
| `description`   | string | `create`, `update`             | One line, at most 1024 characters. This is the text the agent sees when choosing a skill, so it should say _when_ to reach for it.                                                                                                                  |
| `body`          | string | `create`, `update`             | The skill itself, as markdown. Loaded into context in full, so be specific rather than exhaustive.                                                                                                                                                  |
| `license`       | string | —                              | License identifier, e.g. `MIT`.                                                                                                                                                                                                                     |
| `compatibility` | string | —                              | Version constraint the skill applies to, e.g. `spora>=0.29`.                                                                                                                                                                                        |
| `metadata`      | object | —                              | Extra frontmatter as scalar key/value pairs. Booleans are stored as `true` / `false`, not `1` / `""`.                                                                                                                                               |
| `files`         | object | —                              | Sidecar files as `path => content`. **Replaces the entire existing set**, so include the files that should survive. `SKILL.md` cannot be supplied here — it is generated.                                                                           |

`action` is listed as required because the schema builder puts every synthesised discriminator into the JSON-Schema `required` array — but it carries **no `default` key**, so nothing in the schema tells the model what to send. `HasOperations::getOperationName()` therefore falls back to the first declared operation (`create`) when the key is absent or empty, which is what makes a driver that drops the field survivable. Do not hand-declare `#[ToolParameter(name: 'action')]` to "fix" the schema: the builder owns that property and throws `ToolParameterSchemaException` on the collision.

Two arguments are read off the payload before it reaches the writer: `action` is a discriminator, not content, and `principal_id` is **never honoured** — the principal always comes from the resolved `PrincipalContext`, never from the model.

The tool also **rejects an unresolvable principal** rather than writing to a plausible-looking id: `<= 0` and a dangling non-zero id that names no `principals` row both fail with a `VALIDATION_ERROR`, instead of turning into an uncaught foreign-key `QueryException` and a `500` from inside a tool call.

The `name` pattern is not enforced by this plugin's own code — it comes from core's `SkillValidator`, which the writer reuses so a hand-authored skill is held to exactly the same standard as a shipped one. See [Author guide → Reusing `SkillValidator`](/develop/plugins/author-guide/skills#reusing-skillvalidator-from-a-provider).

## What it returns

All three operations return a single text block via `ToolResult::ok`, or `Error (<CODE>): <message>` via `ToolResult::fail`. Nothing throws.

`create`:

```text
Created skill [invoice-drafting]. Add it to an agent's `allowed_skills` before the agent can load it — authoring it does not grant it.
```

That second sentence is the point. The provider lists a custom skill the same way it lists a shipped one, but the `allowed_skills` allowlist is still the gate — writing a skill and granting it are two different acts.

`update` returns `Updated skill [invoice-drafting]. The previous version is restorable from the admin panel.`

`delete` returns `Deleted skill [invoice-drafting].` plus the blast radius:

```text
Deleted skill [invoice-drafting]. Removed from the allowed_skills of: Researcher (#12), Archivist (#19).
```

or `Deleted skill [invoice-drafting]. No agent allowlists referenced it.`

The scrub happens in the **same transaction** as the delete. Without it, a deleted skill is silently dropped from the tool definition and every agent that used it loses a capability with no signal at all. The scrub is scoped to principal-owned custom skills only — a shipped skill is not deletable through this plugin, so a shipped name can never be removed from an agent's config.

For the approval UI, `describeAction()` deliberately shows a **byte count instead of the body** — 200 KB of markdown does not fit a prompt — and reads `Skill <op>: <name> (<bytes>B body[, <n> file(s)])`. For `delete` it reads `Skill delete: <name> — also removes it from the allowed_skills of any agent that references it`. It never counts the affected agents: only the model's arguments reach it, and that count would be a cross-tenant disclosure. `GET /api/v1/custom-skills/{name}/allowlist` carries the radius instead.

## Provider, not directory

This is the part worth stealing.

A skill that is the same for everyone on the instance should ship as a **directory** via `skillPaths()` — a `SKILL.md` under your plugin, no database, no principal. A provider is for content that has **no directory at all**: user-authored, tenant-scoped, or synthesised at runtime. `CustomSkillsPlugin` picks the second column, and skips `skillPaths()` entirely because the skills scan roots have no principal dimension.

Registration is one hook, returning class names. The container resolves them and builds one `SkillProviderRegistry` in a fixed order, core's `FilesystemSkillProvider` first:

```php
/** @return list<class-string<SkillProviderInterface>> */
public function skillProviders(): array
{
    return [CustomSkillProvider::class];
}
```

The concrete reasons the author guide lays out are all visible in this plugin's source:

- **A row has no directory, and core needs one.** `SkillScanner` does a `realpath()` containment check against a real path, and `Skill`'s value object is bound to a directory. A database row cannot satisfy that contract, so it arrives through the provider seam instead.
- **`SKILL.md` is synthesised on read.** `SkillComposer::compose()` dumps the frontmatter columns with `Yaml::dump()` and appends `$skill->body` verbatim, so only the frontmatter goes through `symfony/yaml` — the same parser `SkillScanner` reads with. The frontmatter is already normalised into columns, so storing a second copy would only let the two disagree.
- **Identity is the frontmatter `name`,** and the writer forces `name === slug` at write time because on a custom skill they are the same column on the same row. `SkillSummary::slug` is set from `name` for exactly that reason.
- **`source()` is a label, not a lookup key.** The provider reports `custom-skills`, and each skill's own summary reports it too — that is what the admin panel groups by.
- **Every method fails closed on the principal.** Of the four principal-taking methods, `getSkills()` returns `[]` for `null` and for any id `<= 0`; the other three return `null`. Core calls these with `null` on operator-default and strict-mode paths, and widening there would leak one tenant's skills into another's view.
- **`getSkillFile()` re-validates independently.** `CustomSkillProvider::isSafePath()` rejects absolute paths, `.` and `..` segments, empty segments, backslashes, and control characters before the path ever reaches a lookup.
- **Precedence is first-provider-wins across providers,** with core's filesystem provider first — so installing this plugin can **never** shadow a shipped skill. A write that collides with a shipped name is rejected up front with `SKILL_NAME_RESERVED` rather than creating a row the model could never resolve.

The full contract, the four rules the registry depends on, and the version-floor guard are in [Author guide → Shipping a provider, not a directory](/develop/plugins/author-guide/skills#shipping-a-provider-not-a-directory). The reader side is [Concepts → Skills](/reference/concepts/skills) — the on-disk format, the `allowed_skills` allowlist, and the read/write split.

## The Custom Skills admin panel

`/apps/custom-skills` is a two-pane desk. Five routes, one subject each:

| Route            | Page                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| `/`              | Home — what this principal owns                                          |
| `/new`           | Create — a name, then the desk                                           |
| `/skills/:name`  | Desk — write, with full CRUD and one-step restore                        |
| `/library`       | Catalogue — every shipped skill, read-only, with _Duplicate_ to fork one |
| `/library/:name` | Viewer — read a shipped skill                                            |

Shipped skills are **not** re-exposed by the plugin; they come from the host's `GET /api/v1/skills`. A shipped skill is a global read-only resource and a custom one is principal-scoped and writable, so they get separate URLs rather than one route with a `?view=` flag.

Affordances worth naming: inline `ValidationResult` errors, a warnings banner, a "last edited by agent" line, one-step **restore** of the previous version, _Duplicate_ from any shipped card, a sticky bar that always shows the acting principal, and a delete confirmation that **names the agents** whose allowlists will be scrubbed.

The principal deliberately does not live in the URL — it sits in the panel's own store, and changing scope navigates home. A URL reading `/skills/invoice-drafting` says nothing about whose skill it is, which is the worst ambiguity to leave open mid-edit.

## Caps

Enforced as **errors** with named codes, not warnings. Core's `SkillValidator` emits a soft `SKILL_BODY_OVERSIZE` warning, and `isValid()` checks errors only — so validator reuse alone would leave a user-authored body unbounded, which on a per-principal store is a denial-of-service surface.

| Cap                                                               | Limit      | Error code             |
| ----------------------------------------------------------------- | ---------- | ---------------------- |
| Skills per principal                                              | 25         | `SKILL_LIMIT_REACHED`  |
| Sidecar files per skill                                           | 20         | `TOO_MANY_FILES`       |
| Total bytes per skill (body + synthesised frontmatter + sidecars) | 200 000    | `TOTAL_SIZE_EXCEEDED`  |
| Bytes per file                                                    | 50 000     | `FILE_TOO_LARGE`       |
| `description` length                                              | 1024 chars | `DESCRIPTION_TOO_LONG` |

The 50 000-byte per-file cap is core's `SkillProviderInterface::MAX_FILE_BYTES`, and it is enforced on the **write** side by this plugin — not by the provider. Sidecars are checked as they are validated, and the synthesised `SKILL.md` is checked by composing it, because that file is built from columns and so never passes through the sidecar loop. Without that second check a body between the two caps saves cleanly and is then unreadable: listed, enabled, and refused on read.

`update` snapshots the current state into `previous_snapshot` before overwriting, and `restore` re-snapshots the live state first — so restore is itself undoable. There is exactly one previous version. That makes it a two-state toggle, not a history.

## Schema and migrations

`schemaVersion()` is **1**, and one migration ships: `database/migrations/custom-skills_000001_create_custom_skills_tables.php`, guarded by `hasTable()` checks on both tables.

| Table                | Holds                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `custom_skills`      | One row per skill, `unique(principal_id, name)`. Frontmatter columns, the `body`, `provenance`, `previous_snapshot`, plus `created_by_user_id` / `updated_by_user_id`. |
| `custom_skill_files` | Sidecars, one row per path, cascading on delete. `unique(custom_skill_id, path)`.                                                                                      |

Three details in that migration are easy to trip over:

- The filename prefix is the manifest slug **verbatim, hyphen included** — `custom-skills_`. The schema installer validates migration filenames against the slug and throws otherwise. It reads as unusual next to every other plugin, whose slugs have no hyphen.
- There is **no `status` column.** `manage_skill` writes go live on approval, so a draft/published gate would put a second approval in front of the first.
- `allowed_tools` is **writable**: `POST` / `PUT` accept it and `CustomSkillResource` echoes it, so the field round-trips through the REST surface. The string is stored **verbatim** — no trimming, no whitespace collapsing — and `SkillComposer` renames it to the hyphenated `allowed-tools` on the way into the synthesised `SKILL.md`. An empty string reads as unset, as it does for `license` and `compatibility`. Judgement is core's: a value its grammar cannot read (a non-string, a comma, a fully-qualified class name) is refused with `ALLOWED_TOOLS_INVALID` before it reaches the column, and a legal name no installed tool answers to is a warning in `warnings[]`. A `PUT` that omits the key leaves the column alone; an explicit `null` revokes it. `restore()` deliberately does **not** roll the column back — a rollback restores content, not permissions. `manage_skill` still exposes no `allowed_tools` parameter, so the agent-facing write path cannot set the field.

`composer remove spora-ai/spora-plugin-custom-skills` drops the routes and the panel tile but **preserves** both tables, so a reinstall is a no-op on the schema.

> **Note:** after uninstalling, a leftover custom skill becomes unresolvable. `allowed_skills` entries pointing at one are reported as `(unavailable: <name>)` in the tool definition rather than silently dropped.

## Admin API surface

9 routes appear under `/api/v1/custom-skills*`, all behind `AuthMiddleware` + `CsrfMiddleware`, each resolving its own principal from `?principal_id=`:

| Route                                           | Purpose                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/custom-skills`                     | List the acting principal's custom skills, ordered by name              |
| `GET /api/v1/custom-skills/{name}`              | One skill, full resource shape                                          |
| `GET /api/v1/custom-skills/{name}/files`        | File listing, `SKILL.md` first                                          |
| `GET /api/v1/custom-skills/{name}/files/{path}` | One file's content, path percent-encoded                                |
| `GET /api/v1/custom-skills/{name}/allowlist`    | Which agents resolve this skill — the blast-radius preview              |
| `POST /api/v1/custom-skills`                    | Create                                                                  |
| `PUT /api/v1/custom-skills/{name}`              | Update; a rename is rejected, `files` fully replaces the sidecar set    |
| `POST /api/v1/custom-skills/{name}/restore`     | Restore `previous_snapshot` in one step (itself undoable)               |
| `DELETE /api/v1/custom-skills/{name}`           | Delete, and scrub the allowlist; the response names the affected agents |

Failures use one envelope, `{"error":{"code":…,"message":…}}`, with the codes the tool surface also renders. The two name-collision codes are deliberately distinct because the fix differs: `SKILL_NAME_TAKEN` means pick another name, `SKILL_NAME_RESERVED` means you picked a shipped skill's.

## Development

```bash
composer install
composer test:parallel   # Pest — 120 tests
composer analyse         # PHPStan
composer lint           # php-cs-fixer dry-run
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, plus `static-analysis` and `code-style` jobs. A `coverage` job runs Pest with xdebug in parallel and uploads a clover `coverage.xml`; the `sonar` job depends on it and uploads to SonarCloud (project key `spora-ai_spora-plugin-custom-skills`, from `sonar-project.properties`), so `new_coverage` is measurable per PR. Requires the `SONAR_TOKEN` secret on the repo. MIT license.

The plugin ships **no agent template** — `agent-templates/` is empty. An agent that should be able to author skills needs `manage_skill` activated on it by hand.

---

**Repo:** [spora-ai/spora-plugin-custom-skills](https://github.com/spora-ai/spora-plugin-custom-skills) · **MIT**
