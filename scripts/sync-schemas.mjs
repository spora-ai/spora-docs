#!/usr/bin/env node

// Mirror the public Spora JSON Schemas into docs/.vuepress/public/schemas/.
//
// `spora-core` is the source of truth for the schema files. The docs site
// serves them at https://docs.spora-ai.com/schemas/*.schema.json so editors
// (VSCode json-language-service, JetBrains, ajv) can fetch the schema when
// validating $schema-referencing JSON files.
//
// EXCEPTION — plugin.schema.json is owned by this repo, not mirrored. Its
// canonical URL (`$id`, and the `$schema` every plugin manifest points at) is
// docs.spora-ai.com, and it is the only one of the two editors actually fetch.
// The copy in spora-core's repo root is stale: still `additionalProperties:
// false`, and permitting neither `$schema`, `name` nor `autoload`, which every
// shipped manifest carries — so it rejects every real plugin. Mirroring cannot
// fix that: `prebuild` runs this script, so mirroring would overwrite the
// corrected file on every local build and in the `build` CI job.
//
// The corrected schema is guarded by `npm run check:plugin-schema`, which
// validates it against the manifests in the tree. TO RE-MIRROR: land the same
// fix in spora-core's plugin.schema.json, then re-add it to SCHEMAS below and
// delete the entry from DOCS_OWNED_SCHEMAS.
//
// CI checks spora-core out into `./spora-core` (see .github/workflows/
// ci-docs.yml). The script skips when spora-core is absent, so `npm run build`
// completes on a fresh docs clone — the schemas then keep whatever was last
// committed.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "docs/.vuepress/public/schemas");
// Search paths, in priority order:
//   1. SPORA_CORE_PATH env var (explicit override).
//   2. ./spora-core inside this checkout — CI layout (see ci-docs.yml +
//      deploy-docs.yml `Checkout spora-core` steps, both with `path: spora-core`).
//   3. ../spora-core — sibling-checkout layout used by local dev.
const CANDIDATE_CORE_DIRS = process.env.SPORA_CORE_PATH
  ? [resolve(process.env.SPORA_CORE_PATH)]
  : [resolve(ROOT, "spora-core"), resolve(ROOT, "..", "spora-core")];

const checkOnly = process.argv.includes("--check");

const SCHEMAS = [
  { source: "agent-template.schema.json", dest: "agent-template.schema.json" },
];

// Published from this repo, NOT mirrored from spora-core — see the header note.
// Printed on every run so the exclusion stays visible; the list is not itself
// an enforcement point.
const DOCS_OWNED_SCHEMAS = ["plugin.schema.json"];

function copySchema({ source, dest }, coreDir) {
  const src = resolve(coreDir, source);
  const dst = resolve(PUBLIC_DIR, dest);

  if (!existsSync(src)) {
    return { source, dest, status: "missing-source" };
  }
  const srcBody = readFileSync(src, "utf8");
  if (checkOnly) {
    const dstBody = existsSync(dst) ? readFileSync(dst, "utf8") : null;
    if (dstBody === null) {
      return { source, dest, status: "missing-dest" };
    }
    if (dstBody !== srcBody) {
      return { source, dest, status: "drift" };
    }
    return { source, dest, status: "ok" };
  }

  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(dst, srcBody);
  return { source, dest, status: "wrote" };
}

function resolveCoreDir() {
  for (const dir of CANDIDATE_CORE_DIRS) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

// Stated on every run, in both modes. A schema that is silently not mirrored
// reads as "covered" to anyone auditing this script later, so the exclusion is
// printed.
function reportDocsOwned() {
  console.log(
    `Not mirrored from spora-core (owned by this repo, guarded by \`npm run check:plugin-schema\`):\n` +
      DOCS_OWNED_SCHEMAS.map((name) => `  - ${name}`).join("\n"),
  );
}

function main() {
  const coreDir = resolveCoreDir();
  if (coreDir === null) {
    if (checkOnly) {
      // A missing spora-core is a hard fail in --check mode, so CI catches
      // env-config regressions, but a silent skip in default mode — devs without
      // a sibling checkout still get a working site.
      console.error(
        `spora-core checkout not found. Searched:\n` +
          CANDIDATE_CORE_DIRS.map((d) => `  - ${d}`).join("\n"),
      );
      console.error(
        `Set SPORA_CORE_PATH to the spora-core checkout, or run from a directory containing ./spora-core.`,
      );
      process.exit(1);
    }
    console.log(
      `spora-core checkout not found; searched:\n` +
        CANDIDATE_CORE_DIRS.map((d) => `  - ${d}`).join("\n") +
        `\nSkipping schema sync.`,
    );
    return;
  }

  const results = SCHEMAS.map((schema) => copySchema(schema, coreDir));

  if (checkOnly) {
    const drift = results.filter((r) => r.status !== "ok");
    if (drift.length > 0) {
      console.error(
        `Public schemas are out of date. Run \`npm run sync:schemas\`.\n` +
          `Out of date:\n` +
          drift
            .map((r) => `  - ${r.status}: ${r.source} -> ${r.dest}`)
            .join("\n"),
      );
      process.exit(1);
    }
    console.log("Public schemas are up to date.");
    reportDocsOwned();
    return;
  }

  for (const r of results) {
    if (r.status === "missing-source") {
      console.warn(`Skipped ${r.source}: not found in ${coreDir}.`);
    } else if (r.status === "wrote") {
      console.log(`Wrote docs/.vuepress/public/schemas/${r.dest}.`);
    }
  }
  reportDocsOwned();
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}