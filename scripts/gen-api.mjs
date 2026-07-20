#!/usr/bin/env node

// Generates the spora-docs API reference from `docs/.vuepress/openapi.json`.
// Writes:
//   - docs/reference/api.md         — overview + summary table + per-tag link list
//                                     (the hand-written frontmatter, intro, Envelope,
//                                     Auth stack, Health endpoint, Versioning, What's
//                                     next sections are preserved verbatim).
//   - docs/reference/api/{slug}.md  — one file per tag, each holding the per-endpoint
//                                     detail (path params, query params, responses).
//
// `gen:api:check` validates all generated files in one pass; any drift fails.
//
// Tag → slug: lowercased tag, with hyphens preserved (Agent-templates →
// agent-templates). Untagged endpoints (only /api/health today) land on the
// "health" page. New tags appear in a new file on next regen.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SPEC = resolve(ROOT, "docs/.vuepress/openapi.json");
const TARGET = resolve(ROOT, "docs/reference/api.md");
const API_DIR = resolve(ROOT, "docs/reference/api");
const SIDEBAR = resolve(ROOT, "docs/.vuepress/api-sidebar.json");
const MARKER_START = "<!-- API:GENERATED:START -->";
const MARKER_END = "<!-- API:GENERATED:END -->";

const checkOnly = process.argv.includes("--check");

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];

function tagSlug(tag) {
  return tag === "" ? "health" : tag.toLowerCase();
}

function summariseSecurity(securityList, schemes) {
  if (!securityList || securityList.length === 0) return "—";
  const names = securityList.flatMap((entry => Object.keys(entry)));
  if (names.length === 0) return "—";
  return names.map((n) => `\`${n}\``).join(" + ");
}

function renderParamTable(params) {
  const lines = ["| Name | Type | Required | Description |", "| ---- | ---- | -------- | ----------- |"];
  for (const p of params) {
    const type = p.schema?.type ?? p.type ?? "(unspecified)";
    const required = p.required ? "yes" : "no";
    const desc = (p.description ?? "").replace(/\|/g, "\\|");
    lines.push(`| \`${p.name}\` | ${type} | ${required} | ${desc} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Flatten the spec into one record per (path, method). Tag is the first tag
 * declared on the operation; "" if none. Routes are sorted by path so the
 * summary table and per-tag pages both read in stable order.
 */
function collectEndpoints(spec) {
  const out = [];
  for (const path of Object.keys(spec.paths ?? {}).sort()) {
    const item = spec.paths[path];
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const tag = (op.tags ?? [])[0] ?? "";
      out.push({ path, method, tag, op });
    }
  }
  return out;
}

function renderSecuritySchemesTable(spec) {
  const schemes = spec.components?.securitySchemes ?? {};
  const entries = Object.entries(schemes);
  if (entries.length === 0) return "";
  const lines = ["### Security schemes", ""];
  lines.push("| Scheme | Where | Key | Description |");
  lines.push("| ------ | ----- | --- | ----------- |");
  for (const [name, def] of entries) {
    const where = def.in ?? def.type;
    const key = def.name ?? "(scheme-level)";
    const desc = (def.description ?? "").replace(/\|/g, "\\|");
    lines.push(`| \`${name}\` | ${where} | \`${key}\` | ${desc} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderSummaryTable(endpoints, schemes) {
  const lines = ["### Endpoints", ""];
  lines.push("| Method | Path | Auth | Purpose | Tags |");
  lines.push("| ------ | ---- | ---- | ------- | ---- |");
  for (const { path, method, tag, op } of endpoints) {
    const auth = summariseSecurity(op.security, schemes);
    const purpose = (op.summary ?? "").replace(/\|/g, "\\|");
    lines.push(
      `| \`${method.toUpperCase()}\` | \`${path}\` | ${auth} | ${purpose} | ${tag} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderEndpointDetail({ path, method, op }) {
  const lines = [];
  const heading = op.summary
    ? `## \`${method.toUpperCase()} ${path}\` — ${op.summary}`
    : `## \`${method.toUpperCase()} ${path}\``;
  lines.push(heading, "");
  if (op.description) lines.push(op.description, "");
  if (op.tags?.length) lines.push(`**Tags:** ${op.tags.join(", ")}`, "");

  const pathParams = (op.parameters ?? []).filter((p) => p.in === "path");
  const queryParams = (op.parameters ?? []).filter((p) => p.in === "query");
  if (pathParams.length > 0) {
    lines.push("### Path parameters", "", renderParamTable(pathParams));
  }
  if (queryParams.length > 0) {
    lines.push("### Query parameters", "", renderParamTable(queryParams));
  }

  const responses = op.responses ?? {};
  if (Object.keys(responses).length > 0) {
    lines.push("### Responses", "", "| Status | Description |", "| ------ | ----------- |");
    for (const [status, resp] of Object.entries(responses)) {
      const desc = (resp.description ?? "").replace(/\|/g, "\\|");
      lines.push(`| \`${status}\` | ${desc} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Group endpoints by tag and render each group's per-endpoint detail.
 * Returns a Map<slug, { displayTag, body: string }>.
 */
function renderPerTagPages(endpoints) {
  const groups = new Map();
  for (const ep of endpoints) {
    const slug = tagSlug(ep.tag);
    if (!groups.has(slug)) groups.set(slug, { displayTag: ep.tag || "Health", items: [] });
    groups.get(slug).items.push(ep);
  }

  const pages = new Map();
  for (const [slug, { displayTag, items }] of groups) {
    const lines = [];
    lines.push(`# ${displayTag}`, "");
    lines.push(
      `> Generated from \`docs/.vuepress/openapi.json\`. ` +
        `Refresh with \`npm run gen:api\`. [Back to overview](/reference/api).`,
      "",
    );
    for (const ep of items) {
      lines.push(renderEndpointDetail(ep));
    }
    pages.set(slug, lines.join("\n"));
  }
  return pages;
}

function renderOverviewBody(spec, endpoints, schemes) {
  const lines = [];
  lines.push("## Spora API — endpoint catalogue", "");
  lines.push(
    "> This overview is generated from `docs/.vuepress/openapi.json`. `npm run gen:api` " +
      "regenerates the per-resource pages listed below in lockstep.",
    "",
  );

  // Group endpoints by tag for the link list, sorted by route count desc
  // so the largest surfaces come first.
  const byTag = new Map();
  for (const ep of endpoints) {
    const slug = tagSlug(ep.tag);
    if (!byTag.has(slug)) byTag.set(slug, { displayTag: ep.tag || "Health", count: 0 });
    byTag.get(slug).count++;
  }
  const sortedTags = [...byTag.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return a[1].displayTag.localeCompare(b[1].displayTag);
  });

  lines.push("### Browse by resource", "");
  for (const [slug, { displayTag, count }] of sortedTags) {
    lines.push(`- [${displayTag}](/reference/api/${slug}) — ${count} ${count === 1 ? "route" : "routes"}`);
  }
  lines.push("");

  lines.push(renderSecuritySchemesTable(spec));
  lines.push(renderSummaryTable(endpoints, schemes));

  return lines.join("\n");
}

async function format(body) {
  return await prettier.format(body, {
    parser: "markdown",
    proseWrap: "preserve",
    printWidth: 200,
  });
}

async function main() {
  const spec = JSON.parse(readFileSync(SPEC, "utf8"));
  const schemes = spec.components?.securitySchemes ?? {};
  const endpoints = collectEndpoints(spec);

  const overview = renderOverviewBody(spec, endpoints, schemes);
  const perTag = renderPerTagPages(endpoints);

  // Build the api.md content by splicing the generated body between markers.
  const target = readFileSync(TARGET, "utf8");
  const start = target.indexOf(MARKER_START);
  const end = target.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Markers ${MARKER_START} / ${MARKER_END} not found or out of order in ${TARGET}. ` +
        `The gen script writes only between them; both must be present in the page.`,
    );
  }
  const newApiMd =
    target.slice(0, start + MARKER_START.length) +
    "\n\n" +
    (await format(overview)).trim() +
    "\n\n" +
    target.slice(end);

  // Build the per-tag files.
  const tagFiles = new Map();
  for (const [slug, body] of perTag) {
    tagFiles.set(`${API_DIR}/${slug}.md`, await format(body));
  }

  // Sidebar manifest: { overview, items } for docs/.vuepress/config.ts to import.
  // Items ordered by route count desc, alphabetical on ties.
  const sidebarItems = [...perTag.entries()].map(([slug]) => {
    const displayTag = perTag.get(slug).match(/^# (.+)$/m)?.[1] ?? slug;
    const count = endpoints.filter((ep) => tagSlug(ep.tag) === slug).length;
    return { text: displayTag, link: `/reference/api/${slug}`, routes: count };
  });
  sidebarItems.sort((a, b) =>
    b.routes !== a.routes ? b.routes - a.routes : a.text.localeCompare(b.text),
  );
  const sidebarManifest = {
    overview: { text: "Overview", link: "/reference/api" },
    items: sidebarItems.map(({ text, link }) => ({ text, link })),
  };
  const sidebarBody = JSON.stringify(sidebarManifest, null, 2) + "\n";

  if (checkOnly) {
    const drift = [];
    if (newApiMd !== target) {
      drift.push("docs/reference/api.md");
    }
    for (const [path, body] of tagFiles) {
      const onDisk = existsSync(path) ? readFileSync(path, "utf8") : null;
      if (onDisk !== body) drift.push(path);
    }
    if (existsSync(API_DIR)) {
      for (const entry of readdirSync(API_DIR)) {
        if (!entry.endsWith(".md")) continue;
        if (!tagFiles.has(`${API_DIR}/${entry}`)) {
          drift.push(`${API_DIR}/${entry} (stale — no matching tag in spec)`);
        }
      }
    }
    const sidebarOnDisk = existsSync(SIDEBAR)
      ? readFileSync(SIDEBAR, "utf8")
      : null;
    if (sidebarOnDisk !== sidebarBody) {
      drift.push(SIDEBAR);
    }
    if (drift.length > 0) {
      console.error(
        `API reference is out of date. Regenerate with \`npm run gen:api\`.\n` +
          `Out of date:\n` +
          drift.map((p) => `  - ${p}`).join("\n"),
      );
      process.exit(1);
    }
    console.log("API reference is up to date.");
    return;
  }

  writeFileSync(TARGET, newApiMd);
  console.log(`Wrote ${basename(TARGET)}.`);

  const { mkdirSync } = await import("node:fs");
  mkdirSync(API_DIR, { recursive: true });
  for (const [path, body] of tagFiles) {
    writeFileSync(path, body);
    console.log(`Wrote ${path.slice(ROOT.length + 1)}.`);
  }

  mkdirSync(dirname(SIDEBAR), { recursive: true });
  writeFileSync(SIDEBAR, sidebarBody);
  console.log(`Wrote ${SIDEBAR.slice(ROOT.length + 1)}.`);
}

if (!existsSync(SPEC)) {
  console.error(`Missing OpenAPI spec at ${SPEC}.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});