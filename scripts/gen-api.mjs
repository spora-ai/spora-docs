#!/usr/bin/env node

// Generates `docs/reference/api.md` from `docs/.vuepress/openapi.json`, injecting the
// rendered endpoint catalogue between `<!-- API:GENERATED:START -->` and
// `<!-- API:GENERATED:END -->` markers. The hand-written intro / Envelope /
// Auth stack / Versioning / What's next sections are preserved verbatim.
//
// Usage:
//   node scripts/gen-api.mjs                 # write through the markers
//   node scripts/gen-api.mjs --check        # exit 1 if the page would change
//
// Output is run through `prettier --parser markdown` so the result passes
// `npm run format:check` without a separate step.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SPEC = resolve(ROOT, "docs/.vuepress/openapi.json");
const TARGET = resolve(ROOT, "docs/reference/api.md");
const MARKER_START = "<!-- API:GENERATED:START -->";
const MARKER_END = "<!-- API:GENERATED:END -->";

const checkOnly = process.argv.includes("--check");

/**
 * @param {Record<string, any>} spec
 * @param {Record<string, Record<string, any>>} spec.paths
 * @param {Record<string, any>} spec.components?.securitySchemes
 */
function renderCatalogue(spec) {
  const lines = [];
  const title = spec.info?.title ?? "REST API";
  lines.push(`## ${title} — endpoint catalogue`, "");
  lines.push("> This table is generated from `docs/.vuepress/openapi.json`. To refresh, run `npm run gen:api`.", "");

  const securitySchemes = spec.components?.securitySchemes ?? {};
  if (Object.keys(securitySchemes).length > 0) {
    lines.push("### Security schemes", "");
    lines.push("| Scheme | Where | Key | Description |");
    lines.push("| ------ | ----- | --- | ----------- |");
    for (const [name, def] of Object.entries(securitySchemes)) {
      const where = def.in ?? def.type;
      const key = def.name ?? "(scheme-level)";
      lines.push(`| \`${name}\` | ${where} | \`${key}\` | ${def.description ?? ""} |`);
    }
    lines.push("");
  }

  lines.push("### Endpoints", "");
  lines.push("| Method | Path | Auth | Purpose | Tags |");
  lines.push("| ------ | ---- | ---- | ------- | ---- |");

  const paths = Object.keys(spec.paths ?? {}).sort();
  for (const path of paths) {
    const item = spec.paths[path];
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "trace"]) {
      const op = item[method];
      if (!op) continue;
      const auth = summariseSecurity(op.security, securitySchemes);
      const purpose = (op.summary ?? "").replace(/\|/g, "\\|");
      const tags = (op.tags ?? []).join(", ");
      lines.push(`| \`${method.toUpperCase()}\` | \`${path}\` | ${auth} | ${purpose} | ${tags} |`);
    }
  }

  lines.push("", "### Per-endpoint detail", "");
  for (const path of paths) {
    const item = spec.paths[path];
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "trace"]) {
      const op = item[method];
      if (!op) continue;
      const heading = op.summary
        ? `#### \`${method.toUpperCase()} ${path}\` — ${op.summary}`
        : `#### \`${method.toUpperCase()} ${path}\``;
      lines.push(heading, "");
      if (op.description) lines.push(op.description, "");
      if (op.tags?.length) lines.push(`**Tags:** ${op.tags.join(", ")}`);

      const pathParams = (op.parameters ?? []).filter((p) => p.in === "path");
      const queryParams = (op.parameters ?? []).filter((p) => p.in === "query");
      if (pathParams.length > 0) {
        lines.push("##### Path parameters", "", renderParamTable(pathParams));
      }
      if (queryParams.length > 0) {
        lines.push("##### Query parameters", "", renderParamTable(queryParams));
      }

      const responses = op.responses ?? {};
      if (Object.keys(responses).length > 0) {
        lines.push("##### Responses", "", "| Status | Description |", "| ------ | ----------- |");
        for (const [status, resp] of Object.entries(responses)) {
          const desc = (resp.description ?? "").replace(/\|/g, "\\|");
          lines.push(`| \`${status}\` | ${desc} |`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function summariseSecurity(securityList, schemes) {
  if (!securityList || securityList.length === 0) return "—";
  // Empty `{}` after a scheme name signals the scheme applies; collapse to the scheme name.
  const names = securityList.flatMap((entry) => Object.keys(entry));
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

async function main() {
  const target = readFileSync(TARGET, "utf8");
  const start = target.indexOf(MARKER_START);
  const end = target.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Markers ${MARKER_START} / ${MARKER_END} not found or out of order in ${TARGET}. ` +
        `The gen script writes only between them; both must be present in the page.`,
    );
  }

  const spec = JSON.parse(readFileSync(SPEC, "utf8"));
  const rendered = renderCatalogue(spec);
  const formatted = await prettier.format(rendered, {
    parser: "markdown",
    proseWrap: "preserve",
    printWidth: 120,
  });

  const updated =
    target.slice(0, start + MARKER_START.length) +
    "\n\n" +
    formatted.trim() +
    "\n\n" +
    target.slice(end);

  if (checkOnly) {
    if (updated !== target) {
      console.error(
        `docs/reference/api.md is out of date. Regenerate with \`npm run gen:api\`.`,
      );
      process.exit(1);
    }
    console.log("docs/reference/api.md is up to date.");
    return;
  }

  writeFileSync(TARGET, updated);
  console.log("Wrote docs/reference/api.md.");
}

if (!existsSync(SPEC)) {
  console.error(`Missing OpenAPI spec at ${SPEC}.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
