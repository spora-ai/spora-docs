#!/usr/bin/env node

// Validate the *published* plugin.json schema against the manifests that
// actually exist in the tree.
//
// `docs/.vuepress/public/schemas/plugin.schema.json` is what every plugin
// author gets in their editor: manifests carry
// `"$schema": "https://docs.spora-ai.com/schemas/plugin.schema.json"`, so
// VSCode / JetBrains / ajv fetch this file and flag anything it rejects. That
// makes an over-narrow schema a real defect, not a cosmetic one — the previous
// revision was `additionalProperties: false` while every shipped manifest
// carried `$schema`, `name`, and sometimes `autoload`, so editors flagged
// errors on valid plugins.
//
// `scripts/sync-schemas.mjs` guards a different failure: that the *public copy*
// matches its spora-core source. It cannot catch the schema being wrong at the
// source, so it passed while the published contract rejected real manifests.
// This script closes that gap by checking the schema against reality.
//
// Three checks, all fatal:
//
//   1. ajv validation — every discovered manifest must validate against the
//      published schema. Catches `required` / `type` / `pattern` / `enum`
//      drift, not just unknown keys.
//   2. Unknown-key drift (the bug that shipped) — a key present in a real
//      manifest that the schema does not permit. Under
//      `additionalProperties: false` the loader silently ignores such a key at
//      boot, so this is exactly the case where the schema would be lying.
//   3. Reverse drift — a key the schema permits that *no* manifest uses and
//      that is not listed in FORWARD_COMPAT_ALLOWANCE below. Without this the
//      schema rots in the other direction by accumulating plausible fields
//      nothing uses.
//
// Manifest discovery, in priority order:
//
//   1. SPORA_PLUGIN_SCHEMA_DIRS — explicit override, `:`-separated.
//   2. ./spora-core             — CI layout (see ci-docs.yml `Checkout spora-core`).
//   3. ../spora-core            — sibling checkout used by local dev.
//   4. ../spora-plugin-*        — sibling plugin repos, the real shipped manifests.
//
// CI checks out spora-core only, so the job validates spora-core's committed
// manifest fixtures — between them they exercise the full key surface, which
// is why the check is meaningful there and not a vacuous pass. It also fails
// outright when zero manifests are found, so a discovery regression cannot
// turn this into a green no-op. The job prints how many manifests it saw and
// from where.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SCHEMA_PATH = resolve(ROOT, 'docs/.vuepress/public/schemas/plugin.schema.json')

// Permitted top-level keys that no in-tree manifest uses yet. Each entry needs a
// reason, because an entry without one is indistinguishable from schema rot —
// which is what check 3 exists to prevent. Remove an entry once a manifest
// ships the key; the check will then hold the key to real usage.
const FORWARD_COMPAT_ALLOWANCE = new Map([
  [
    'frontendEntry',
    'read by AppsController::resolveFrontendEntry() as the fallback path for a ' +
      'JSON-only plugin shipping a UI; declared so such a plugin is not rejected ' +
      'as an unknown key',
  ],
])

// Directories that cannot hold a real manifest (VCS metadata, dependency
// trees, local worktrees). Skipped silently but counted, so the run still shows
// that the walk was not trivial.
const STRUCTURAL_IGNORES = new Set(['node_modules', 'vendor', '.git', '.worktrees', '.claude'])

// Directories whose manifests are excluded on purpose, each listed in the run
// output by name. `plugins_invalid_manifest` is the load-bearing one: spora-core
// deliberately commits manifests that violate this schema (missing `class`,
// missing `slug`, bad slug) so PluginLoader's boot-time rejection has something
// to reject. Validating them would make the check permanently red. This is
// reported per-file rather than counted, because silently skipping
// valid-looking manifests is exactly what must stay visible.
const DECLARED_EXCLUSIONS = new Set(['plugins_invalid_manifest'])

function searchRoots() {
  if (process.env.SPORA_PLUGIN_SCHEMA_DIRS) {
    return {
      roots: process.env.SPORA_PLUGIN_SCHEMA_DIRS.split(':').filter(Boolean).map((d) => resolve(d)),
      source: 'SPORA_PLUGIN_SCHEMA_DIRS',
    }
  }
  const roots = [resolve(ROOT, 'spora-core'), resolve(ROOT, '..', 'spora-core')]
  // Sibling plugin repos — the manifests that actually ship. Sorted so the
  // output order is stable between runs.
  const sibling = resolve(ROOT, '..')
  for (const entry of existsSync(sibling) ? readdirSync(sibling).sort() : []) {
    if (!entry.startsWith('spora-plugin-') || entry.includes('worktree')) continue
    const dir = resolve(sibling, entry)
    try {
      if (statSync(dir).isDirectory()) roots.push(dir)
    } catch {
      // Dangling symlink or unreadable entry — nothing to collect from it.
    }
  }
  return { roots, source: 'auto-discovery' }
}

function countManifests(dir) {
  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(join(current, entry.name))
      else if (entry.name === 'plugin.json') total += 1
    }
  }
  return total
}

function walkManifests(root) {
  const found = []
  const excluded = []
  let structuralSkips = 0
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (STRUCTURAL_IGNORES.has(entry.name)) {
          structuralSkips += 1
          continue
        }
        if (DECLARED_EXCLUSIONS.has(entry.name)) {
          // Quantified, not just named — the reader should see what the
          // exclusion costs in coverage, not have to go count it.
          excluded.push({
            dir: displayPath(full),
            reason: `${countManifests(full)} manifest(s) omitted — ${entry.name} commits deliberately invalid manifests for PluginLoader's boot-time rejection tests`,
          })
          continue
        }
        stack.push(full)
        continue
      }
      if (entry.name !== 'plugin.json') continue
      found.push(full)
    }
  }
  return { found, excluded, structuralSkips }
}

// Paths outside this checkout (an explicit SPORA_PLUGIN_SCHEMA_DIRS pointing
// elsewhere) render as an unreadable ../../.. chain, so fall back to absolute.
function displayPath(file) {
  const rel = relative(ROOT, file)
  return rel === '' || rel.startsWith('..') ? file : rel
}

function isPermitted(key, schema) {
  if (schema.properties && Object.hasOwn(schema.properties, key)) return true
  for (const pattern of Object.keys(schema.patternProperties ?? {})) {
    if (new RegExp(pattern, 'u').test(key)) return true
  }
  return schema.additionalProperties !== false
}

function main() {
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`Missing schema at ${relative(ROOT, SCHEMA_PATH)}.`)
    process.exit(1)
  }

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  const { roots, source } = searchRoots()

  const manifests = []
  const excluded = []
  const present = []
  let structuralSkips = 0
  for (const root of roots) {
    if (!existsSync(root)) {
      console.log(`Search root absent, skipped: ${relative(ROOT, root) || root}`)
      continue
    }
    present.push(root)
    const walk = walkManifests(root)
    for (const file of walk.found) manifests.push({ file, root })
    for (const entry of walk.excluded) excluded.push(entry)
    structuralSkips += walk.structuralSkips
  }

  console.log(`plugin.schema.json validated against real manifests (${source}).`)
  const withManifests = present.filter((root) => manifests.some((m) => m.root === root))
  for (const root of withManifests) {
    const count = manifests.filter((m) => m.root === root).length
    console.log(`  - ${relative(ROOT, root) || root}: ${count} manifest(s)`)
  }
  const empty = present.length - withManifests.length
  if (empty > 0) {
    console.log(`  - ${empty} present search root(s) held no plugin.json`)
  }
  for (const entry of excluded) {
    console.log(`  - excluded ${entry.dir} (${entry.reason})`)
  }
  if (structuralSkips > 0) {
    console.log(`  - skipped ${structuralSkips} dependency/VCS directories`)
  }

  // A check that passes on zero manifests looks like coverage and is not.
  // Fail loudly instead, naming the roots that were searched.
  if (manifests.length === 0) {
    console.error(
      `\nNo plugin.json manifests found — refusing to pass vacuously.\n` +
        `Searched:\n` +
        roots.map((r) => `  - ${r}`).join('\n') +
        `\nSet SPORA_PLUGIN_SCHEMA_DIRS to the checkouts holding the manifests, or run ` +
        `from a docs checkout that sits beside spora-core / spora-plugin-*.`,
    )
    process.exit(1)
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)

  const invalid = []
  const unknownKeys = []
  const observed = new Set()

  for (const { file, root } of manifests) {
    const rel = displayPath(file)
    let doc
    try {
      doc = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      invalid.push({ file: rel, detail: `unparseable JSON: ${err.message}` })
      continue
    }

    // Keys are collected even when ajv validation failed: an
    // `additionalProperties` error does not name the offending key, and the
    // whole point of this check is that the failure log says which key to go
    // look at. Skipping collection on failure would hide exactly that.
    if (!validate(doc)) {
      for (const err of validate.errors ?? []) {
        const at = err.instancePath === '' ? '(root)' : err.instancePath
        // ajv reports the key for additionalProperties errors in params, not in
        // the message — surface it or the report is unactionable.
        // Only additionalProperty needs appending — ajv's own message already
        // names the property for required/missingProperty.
        const key = err.params?.additionalProperty
        invalid.push({
          file: rel,
          detail: `${at} ${err.message}${key === undefined ? '' : ` "${key}"`}`,
        })
      }
    }

    for (const key of Object.keys(doc)) {
      observed.add(key)
      if (!isPermitted(key, schema)) {
        unknownKeys.push({ file: rel, key })
      }
    }
  }

  const permitted = Object.keys(schema.properties ?? {})
  const unusedPermitted = permitted.filter(
    (key) => !observed.has(key) && !FORWARD_COMPAT_ALLOWANCE.has(key),
  )

  const failures = []

  if (invalid.length > 0) {
    failures.push(
      `Manifests that do not validate against the published schema:\n` +
        invalid.map((f) => `  - ${f.file}: ${f.detail}`).join('\n'),
    )
  }

  if (unknownKeys.length > 0) {
    failures.push(
      `Schema rejects keys that real manifests ship. The PluginLoader silently ` +
        `ignores unknown manifest keys, so this is a false rejection rather than a ` +
        `harmless extra.\n` +
        unknownKeys.map((f) => `  - ${f.file}: "${f.key}" is not in schema.properties`).join('\n') +
        `\nFix: add the key to docs/.vuepress/public/schemas/plugin.schema.json with a ` +
        `description, or (if it should never have shipped) fix the manifests.`,
    )
  }

  if (unusedPermitted.length > 0) {
    failures.push(
      `Schema permits keys no manifest uses and that are not a documented ` +
        `forward-compatibility allowance. Remove them, or add a reason to ` +
        `FORWARD_COMPAT_ALLOWANCE in scripts/check-plugin-schema.mjs.\n` +
        unusedPermitted.map((key) => `  - "${key}"`).join('\n'),
    )
  }

  if (failures.length > 0) {
    console.error(`\nplugin.schema.json does not match reality.\n`)
    for (const failure of failures) console.error(`${failure}\n`)
    process.exit(1)
  }

  const allowanceNote = [...FORWARD_COMPAT_ALLOWANCE.keys()]
    .filter((key) => !observed.has(key))
    .map((key) => `${key} (allowed: ${FORWARD_COMPAT_ALLOWANCE.get(key)})`)
  console.log(
    `\n${manifests.length} manifest(s) validate. Keys in use: ` +
      `${[...observed].sort().join(', ')}.`,
  )
  for (const note of allowanceNote) console.log(`Permitted but unused: ${note}`)
  console.log('plugin.schema.json matches the manifests in the tree.')
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
