#!/usr/bin/env node

// Mirror the public Spora JSON Schemas into docs/.vuepress/public/schemas/.
//
// `spora-core` is the source of truth for the schema files. The docs site
// serves them via GitHub Pages at https://docs.spora-ai.com/schemas/*.schema.json
// so editors (VSCode json-language-service, JetBrains, ajv) can fetch the
// schema when validating $schema-referencing JSON files.
//
// `spora-core` is checked out into `./spora-core` by CI (see
// .github/workflows/ci-docs.yml); locally, the developer can use a sibling
// checkout by setting SPORA_CORE_PATH (default: ../spora-core). The script
// silently no-ops in environments where spora-core is absent, which lets
// `npm run build` complete on a fresh docs clone without a sibling repo
// (the schemas just won't be regenerated in that case — they'll pick up
// whatever was last committed to docs/.vuepress/public/schemas/).
//
// Two modes:
//   - default     : copy each schema file from spora-core to the public dir,
//                   creating it if missing.
//   - --check     : exit non-zero if any public schema is missing, stale, or
//                   differs from the source. Wired into CI as a separate
//                   `lint-schemas` job in ci-docs.yml.

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
  { source: "plugin.schema.json", dest: "plugin.schema.json" },
];

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

function main() {
  const coreDir = resolveCoreDir();
  if (coreDir === null) {
    if (checkOnly) {
      // In --check mode we want a hard fail if spora-core is missing, so CI
      // catches accidental env-config regressions. In default mode we silently
      // skip — devs without a sibling checkout still get a working site.
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
    return;
  }

  for (const r of results) {
    if (r.status === "missing-source") {
      console.warn(`Skipped ${r.source}: not found in ${coreDir}.`);
    } else if (r.status === "wrote") {
      console.log(`Wrote docs/.vuepress/public/schemas/${r.dest}.`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}