---
title: Team Graph
description: A directed graph of the spawning relationships between a principal's agents, rendered as Mermaid in the admin panel.
---

# Team Graph Plugin for Spora

Adds a per-principal graph of agent spawning relationships to the [Spora](https://github.com/spora-ai/Spora) admin panel. The endpoint `GET /api/v1/plugins/team-graph/graph?principal_id=<id>` returns the principal's agents as **nodes** and their `sub_agent` connections as **edges**; the panel renders the edges as a Mermaid flowchart and the nodes as real DOM cards at `/apps/team-graph`.

The plugin is **read-only** — no LLM-callable tools, no migrations, no agent templates. It adds one route and one admin panel.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-team-graph
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

The panel itself ships as a **second package**. The PHP package does not `require` the frontend half, so the app has to require it too:

```bash
composer require spora-ai/spora-plugin-team-graph-frontend
```

That package is of type `spora-plugin-frontend`; `SporaPluginFrontendInstaller` drops its built bundle into `public/plugins/team-graph/`. Without it the panel entry appears in the sidebar and the page 404s on the bundle.

## Configuration

The plugin declares **no settings** and reads no credentials. Everything it shows comes from the host's own agent and task tables.

One thing does shape the graph: the `allowed_target_agents` allowlist on each agent's `SubAgentTool` configuration. Edges are read through the same `ToolConfigServiceInterface::getEffectiveSettings()` cascade the tool itself checks at runtime, so the graph shows the connections an agent is **configured** to make — including ones that have never fired — and drops cross-principal targets the way `SubAgentTool::sharePrincipal()` would.

## The endpoint

|            |                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Route      | `GET /api/v1/plugins/team-graph/graph?principal_id=<id>`                                               |
| Middleware | `AuthMiddleware`, `CsrfMiddleware`                                                                     |
| Success    | `200` with a `data` envelope                                                                           |
| Errors     | `401` unauthenticated, `403` the principal is not visible, `422` a missing or malformed `principal_id` |

The route is registered through `RoutesRegisteringEvent`; its path and middleware live in `routes/team-graph.php`, which sits outside PSR-4's `src/` and is therefore loaded through Composer's `autoload.files`.

### Who can open which graph

The endpoint is gated on **visibility, not control** — the same rule `GET /api/v1/principals/me` applies, so the panel's own principal picker can never offer a principal the endpoint then refuses. A caller may read:

- their own user-principal, and
- the group-principal of **every** group they belong to, at any role, `member` included — a member can already list and open every agent in the group, so the graph shows them nothing they could not see anyway.

Anything else is a `403`. Group `owner`/`admin` is the tier the _write_ paths use — agent transfer, group settings — and is deliberately not required for a read panel.

## What it returns

```json
{
  "principal": { "id": 12, "type": "group", "name": "Marketing", "is_current_user_owned": false },
  "nodes": [
    {
      "id": 7,
      "name": "Marketing Lead",
      "role": null,
      "picture_url": null,
      "profile_picture": { "palette_key": "…", "bg_color": "…", "fg_color": "…" },
      "status": "RUNNING",
      "active_chats": 2,
      "recent_chats_24h": 5
    }
  ],
  "edges": [
    {
      "id": "7->8",
      "source": 7,
      "target": 8,
      "op": "sub_agent",
      "configured": true,
      "count_24h": 3,
      "last_invoked_at": "2026-10-21T09:00:00+00:00"
    }
  ],
  "generated_at": "2026-10-21T12:00:00+00:00"
}
```

Nodes are the principal's agents, aggregated in one SQL pass — active chats, chats from the last 24 hours, the latest in-flight status, and the `AgentPictureService` wire shape resolved inline so there is no N+1 against `agent_pictures` or `media_assets`.

Edges are **one per `(source, target)` pair** in each source agent's configured allowlist. The `sub_agent` tool calls are read only to enrich those edges with `count_24h` (24-hour window) and `last_invoked_at` (7-day window) — never to add or remove one. `count_24h: 0` on a `configured: true` edge is therefore a connection that exists but has never fired.

## The panel

The host SPA loads the bundle from `/plugins/team-graph/main.js` — `TeamGraphApp::entry()` has to match the frontend package's `build.lib.fileName()`. The bundle installs a mount/unmount contract on `window.SporaAppTeamGraph`:

```ts
window.SporaAppTeamGraph = {
  mount: (target: HTMLElement, hostContext: PluginHostContext) => void | Promise<void>,
  unmount: (target: HTMLElement) => void,
}
```

`hostContext` carries the host's `api`, `pinia`, `theme`, `route` and `router`; the panel installs its own Pinia for plugin-local state and branches the host client in through its own `api/client.ts`.

The page has three regions: a toolbar with the title, the agent and edge counts, the freshness indicator and a refresh button; a row of principal pills ("My Agents" plus every group the operator belongs to) that switches the canvas; and the canvas itself with a detail sidebar for the selected agent. The graph polls every 30 seconds.

### The detail panel has no hierarchy chain

The detail panel used to walk **inbound** edges upward and draw a "root → … → this agent" chain, capped at three hops. That section is **gone** — it walked edges that do not say what it claimed they said.

An edge means "agent A invoked sub-agent B". It is not a reporting line and it is not ownership, so the chain asserted a parent tree the payload never carries. An agent nobody invoked has no parent at all, which made the chain either empty or an accidental ordering of whoever happened to call whom — and its "Root — no parent in this team" branch was the common case by a wide margin. The inbound edges are still listed below the Activity count under their own heading, so the chain was a second rendering of the same data rather than information the section list did not already carry.

Removing the section orphaned two catalogue keys in the panel's own `src/locales/`, so those went with it. `tests/components/AgentDetailPanelChats.spec.ts` covers the replacement: a payload with a real spawn chain renders no hierarchy section, and no orphaned ancestor pill is left behind.

## Translations

The plugin ships a German catalogue at `locales/de.json`, declared through `TeamGraphPlugin::translationsPaths()`. The catalogue key is the **English source string**:

```json
{ "Team Graph": "Team-Graph" }
```

Only operator-facing copy is translated — the admin app's `displayName()` and `description()`, and the plugin description. Strings the model reads (`#[Tool].description`, `#[ToolParameter].description`, `#[ToolSetting].label` and its option labels) stay English, in the operator's view too: a German tool description degrades the model's tool selection, and a translated label that also reaches the model puts German into its prompt.

The plugin ships no tool, so it has no `#[Tool]`-derived string to leave untranslated.

Editing the English orphans the translation — the key changes and the old entry is dead — so re-translate in the same commit. The gate is the plugin's own `tests/Unit/LocaleCatalogTest.php`: it fails on an empty translation, on a translation identical to its key, and on a key the source no longer produces.

Requires `spora-core >= 0.31.0`; on older cores the catalogue is ignored.

### The panel's own catalogue

The frontend package ships a **separate** catalogue (`src/locales/de.json`) built from its own `vue-i18n` instance — the host does not publish its instance, because that would couple every plugin to the host's catalogue lifetime. Its key is the English source string too, so `npm run i18n:extract` regenerates `en.json` and `npm run i18n:check` is the gate.

Four kinds of string stay English on purpose: agent names (they are data the operator chose, and translating them would rename somebody's agent), `Principal` / `Principals` (the house term, kept untranslated in the host's own catalogue), the `sub_agent` edge slug (it names the tool that produced the edge), and the `MY` / `G` pill codes (there is no room for a translated word in a two-letter badge).

## Development

```bash
composer install
./vendor/bin/pest                                  # Pest
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan, php-cs-fixer dry-run, a coverage job and a SonarCloud scan (project key `spora-ai_spora-plugin-team-graph`).

The frontend package has its own CI: ESLint, `vue-tsc`, Vitest, the catalogue gate, the build, a smoke check on the IIFE global and the CSS scope, a bundle-size budget and SonarCloud.

---

**Repo:** [spora-ai/spora-plugin-team-graph](https://github.com/spora-ai/spora-plugin-team-graph) · **Frontend:** [spora-ai/spora-plugin-team-graph-frontend](https://github.com/spora-ai/spora-plugin-team-graph-frontend) · **MIT**
