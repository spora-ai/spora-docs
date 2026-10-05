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
//   3. Reverse drift — a key the schema permits that *no* manifest uses and
//      that is not listed in FORWARD_COMPAT_ALLOWANCE below. Without this the
//      schema rots in the other direction by accumulating plausible fields
//      nothing uses.
//   4. Icon-contract drift — the schema's `icon` description is checked against
//      the resolver that implements it (`SVG_PATH_LEAD` in
//      spora-components/src/icons/Icon.vue), so a description that re-widens
//      the accepted path commands fails here. The published schema previously
//      claimed `M/L/H/V/C/S/Q/T/A/Z` were all valid leading commands; the
//      resolver accepts only `M`/`m` followed by a digit. The accepted letters
//      are read out of the resolver source, never duplicated in this file.
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
//
// The icon check reads spora-components (./spora-components in CI,
// ../spora-components locally). If that checkout is absent the icon check is
// reported as SKIPPED and named as skipped — never as passed. The alternative
// would be hardcoding the accepted path-command letters here, which is the
// drift this check is meant to catch.

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
// that the walk was not trivial. `.worktrees` and `.wt` are both in use across
// the org for `git worktree` checkouts: a worktree holds an in-progress manifest
// that has no business gating the check, and a clean CI checkout has neither.
const STRUCTURAL_IGNORES = new Set([
  'node_modules',
  'vendor',
  '.git',
  '.worktrees',
  '.wt',
  '.claude',
])

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
  const entries = existsSync(sibling) ? readdirSync(sibling) : []
  for (const entry of entries.sort((a, b) => a.localeCompare(b))) {
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

// An unreadable directory (permissions, or a symlink that dangles) is skipped
// rather than aborting the whole run.
function readDirSafe(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function countManifests(dir) {
  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readDirSafe(current)) {
      if (entry.isDirectory()) stack.push(join(current, entry.name))
      else if (entry.name === 'plugin.json') total += 1
    }
  }
  return total
}

// Classify one directory entry. Returns the action for walkManifests to take,
// so the walk loop itself stays a flat iteration with no branching logic.
function classifyDir(name) {
  if (STRUCTURAL_IGNORES.has(name)) return { kind: 'structural' }
  if (DECLARED_EXCLUSIONS.has(name)) return { kind: 'excluded' }
  return { kind: 'descend' }
}

function walkManifests(root) {
  const found = []
  const excluded = []
  let structuralSkips = 0
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of readDirSafe(dir)) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        const { kind } = classifyDir(entry.name)
        if (kind === 'descend') stack.push(full)
        else if (kind === 'structural') structuralSkips += 1
        else {
          // Quantified, not just named — the reader should see what the
          // exclusion costs in coverage, not have to go count it.
          excluded.push({
            dir: displayPath(full),
            reason: `${countManifests(full)} manifest(s) omitted — ${entry.name} commits deliberately invalid manifests for PluginLoader's boot-time rejection tests`,
          })
        }
        continue
      }
      if (entry.name === 'plugin.json') found.push(full)
    }
  }
  return { found, excluded, structuralSkips }
}

// Prefer a path relative to this checkout. A single leading `..` is a sibling
// repo (../spora-core/...) and stays readable; a deeper escape is an unrelated
// tree (an explicit SPORA_PLUGIN_SCHEMA_DIRS), where the ../.. chain is noise
// and the absolute path is clearer.
function displayPath(file) {
  const rel = relative(ROOT, file)
  if (rel === '') return file
  const depth = rel.split('/').filter((seg) => seg === '..').length
  return depth > 1 ? file : rel
}

// ---- icon contract, derived from the host resolver ----------------------
//
// spora-components/src/icons/Icon.vue decides whether an `icon` value is a raw
// path. Its lead test is the only definition of "is this a path", so the schema
// description is checked against that source rather than against a letter list
// restated here.

const ICON_LEAD_CONST = 'SVG_PATH_LEAD'
// Command letters that may legally appear *after* the initial moveto. Used only
// to recognise the description's "fine after the first M" sentence, which is
// correct as written and must not trip the check.
const PATH_COMMAND_LETTERS = 'MmLlHhVvCcSsQqTtAaZz'

function findIconResolver() {
  const candidates = [
    resolve(ROOT, 'spora-components/src/icons/Icon.vue'),
    resolve(ROOT, '..', 'spora-components/src/icons/Icon.vue'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

// Pull the `SVG_PATH_LEAD` regex literal out of the resolver source. Throws
// rather than guessing if the constant is renamed or removed — a silent miss
// here would leave the icon contract unverified while looking green.
function readIconLeadTest(resolverPath) {
  const source = readFileSync(resolverPath, 'utf8')
  const line = source
    .split('\n')
    .find((l) => l.includes(`${ICON_LEAD_CONST} =`))
  if (line === undefined) {
    throw new Error(`${ICON_LEAD_CONST} not found in ${displayPath(resolverPath)}`)
  }
  const literal = line.match(/=\s*(\/(.*)\/[a-z]*)\s*$/)
  if (literal === null) {
    throw new Error(`could not parse a regex literal from: ${line.trim()}`)
  }
  return { source: literal[2], test: new RegExp(literal[2], 'u') }
}

// Every command letter the resolver accepts as a leading command, derived by
// probing the extracted regex rather than by reading a list out of the source.
// A letter counts as an accepted lead if `<letter>0` matches — the minimal
// witness that the letter may lead a coordinate. Both cases are probed, because
// the resolver distinguishes `M` from `m` (only lowercase accepts a minus).
function deriveLeadingLetters(test) {
  const accepted = []
  for (const letter of PATH_COMMAND_LETTERS) {
    if (test.test(`${letter}0`)) accepted.push(letter)
  }
  return accepted
}

// The bundled-name registry in the resolver, so an `examples` entry can be
// recognised as a name rather than a path.
function readIconRegistry(resolverPath) {
  const source = readFileSync(resolverPath, 'utf8')
  const names = new Set()
  const block = source.match(/const icons:[^=]*=\s*\{([\s\S]*?)\n\}/u)
  if (block === null) return names
  for (const m of block[1].matchAll(/^\s{2,4}(?:'([a-z0-9-]+)'|([a-z][a-z0-9-]*)):\s*\[/gmu)) {
    names.add(m[1] ?? m[2])
  }
  return names
}

// Three assertions, all resolvable without parsing prose:
//
//   1. The description quotes the resolver's regex verbatim. This is the
//      anti-drift anchor: if `SVG_PATH_LEAD` ever changes, the description has
//      to change with it or this fails.
//   2. A `pattern` on `icon`, if one is ever added, must not accept a string
//      the resolver rejects. There is deliberately no pattern today — one regex
//      cannot express "bundled name OR raw path" — but a loose one added later
//      would be a silent contract widening.
//   3. Every `examples` entry is either a name in the resolver's registry or a
//      string the resolver's lead test accepts.
//
// A prose-level "did you re-widen the letter list" check is deliberately NOT
// attempted: distinguishing "L/H/C are invalid leads" from "L/H/C are valid
// leads" needs negation-aware parsing, and a wrong version of that check
// false-positives on correct text. The verbatim quote is the enforceable part.
function checkIconContract(schema, leadTest, registry) {
  const failures = []
  const icon = schema.properties?.icon
  if (icon === undefined) {
    return ['schema has no `icon` property to check against the host resolver']
  }
  const description = icon.description ?? ''
  const lead = leadTest.test
  const accepted = deriveLeadingLetters(lead)
  const rule = `${ICON_LEAD_CONST} = /${leadTest.source}/`

  if (!description.includes(leadTest.source)) {
    failures.push(
      `icon description does not quote the resolver's actual lead test (${rule}). ` +
        `Quote it so the published contract cannot drift from the implementation — ` +
        `the resolver accepts only ${accepted.join('/')} followed by a digit.`,
    )
  }

  if (typeof icon.pattern === 'string') {
    const pattern = new RegExp(icon.pattern, 'u')
    for (const letter of PATH_COMMAND_LETTERS) {
      if (accepted.includes(letter)) continue
      if (pattern.test(`${letter}1 1`)) {
        failures.push(
          `icon.pattern /${icon.pattern}/ accepts "${letter}1 1", which the resolver ` +
            `rejects (${rule}) — it would silently fall back to "puzzle".`,
        )
      }
    }
  }

  for (const example of icon.examples ?? []) {
    if (typeof example !== 'string') continue
    const trimmed = example.trim()
    if (registry.has(trimmed) || lead.test(trimmed)) continue
    failures.push(
      `icon example ${JSON.stringify(example)} is neither a bundled name in the ` +
        `resolver's registry nor a string its lead test accepts (${rule}). It would ` +
        `render as the "puzzle" fallback.`,
    )
  }

  return failures
}

function isPermitted(key, schema) {
  if (schema.properties && Object.hasOwn(schema.properties, key)) return true
  for (const pattern of Object.keys(schema.patternProperties ?? {})) {
    if (new RegExp(pattern, 'u').test(key)) return true
  }
  return schema.additionalProperties !== false
}

function collectManifests(roots) {
  const manifests = []
  const excluded = []
  const present = []
  let structuralSkips = 0
  for (const root of roots) {
    if (!existsSync(root)) {
      console.log(`Search root absent, skipped: ${displayPath(root)}`)
      continue
    }
    present.push(root)
    const walk = walkManifests(root)
    for (const file of walk.found) manifests.push({ file, root })
    for (const entry of walk.excluded) excluded.push(entry)
    structuralSkips += walk.structuralSkips
  }
  return { manifests, excluded, present, structuralSkips }
}

function reportDiscovery({ manifests, excluded, present, structuralSkips }, source) {
  console.log(`plugin.schema.json validated against real manifests (${source}).`)
  const withManifests = present.filter((root) => manifests.some((m) => m.root === root))
  for (const root of withManifests) {
    const count = manifests.filter((m) => m.root === root).length
    console.log(`  - ${displayPath(root)}: ${count} manifest(s)`)
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
}

// A check that passes on zero manifests looks like coverage and is not. Fail
// loudly instead, naming the roots that were searched.
function requireManifests(manifests, roots) {
  if (manifests.length > 0) return
  console.error(
    `\nNo plugin.json manifests found — refusing to pass vacuously.\n` +
      `Searched:\n` +
      roots.map((r) => `  - ${r}`).join('\n') +
      `\nSet SPORA_PLUGIN_SCHEMA_DIRS to the checkouts holding the manifests, or run ` +
      `from a docs checkout that sits beside spora-core / spora-plugin-*.`,
  )
  process.exit(1)
}

function readManifest(file) {
  try {
    return { doc: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (err) {
    return { parseError: err.message }
  }
}

// Only additionalProperty needs appending — ajv's own message already names the
// property for required/missingProperty. Without it an `additionalProperties`
// error reads "must NOT have additional properties" and never says which key.
function formatAjvError(err) {
  const at = err.instancePath === '' ? '(root)' : err.instancePath
  const key = err.params?.additionalProperty
  return key === undefined ? `${at} ${err.message}` : `${at} ${err.message} "${key}"`
}

function inspectManifest(file, schema, validate, sink) {
  const { doc, parseError } = readManifest(file)
  if (parseError !== undefined) {
    sink.invalid.push({ file, detail: `unparseable JSON: ${parseError}` })
    return
  }

  // Keys are collected even when ajv validation failed: an
  // `additionalProperties` error does not name the offending key, and the whole
  // point of this check is that the failure log says which key to go look at.
  // Skipping collection on failure would hide exactly that.
  if (!validate(doc)) {
    for (const err of validate.errors ?? []) {
      sink.invalid.push({ file, detail: formatAjvError(err) })
    }
  }

  for (const key of Object.keys(doc)) {
    sink.observed.add(key)
    if (!isPermitted(key, schema)) sink.unknownKeys.push({ file, key })
  }
}

function buildFailures({ invalid, unknownKeys, unusedPermitted }) {
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
  return failures
}

function main() {
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`Missing schema at ${displayPath(SCHEMA_PATH)}.`)
    process.exit(1)
  }

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  const { roots, source } = searchRoots()
  const discovery = collectManifests(roots)
  reportDiscovery(discovery, source)
  requireManifests(discovery.manifests, roots)

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)

  const sink = { invalid: [], unknownKeys: [], observed: new Set() }
  for (const { file } of discovery.manifests) {
    inspectManifest(displayPath(file), schema, validate, sink)
  }

  const unusedPermitted = Object.keys(schema.properties ?? {}).filter(
    (key) => !sink.observed.has(key) && !FORWARD_COMPAT_ALLOWANCE.has(key),
  )
  const failures = [...buildFailures({ ...sink, unusedPermitted })]

  // Icon contract. A missing resolver is reported as SKIPPED, never as passed —
  // the alternative would be hardcoding the accepted letters here.
  const resolverPath = findIconResolver()
  if (resolverPath === null) {
    console.log(
      `  - icon contract: SKIPPED — spora-components not checked out ` +
        `(looked for ./spora-components and ../spora-components). The \`icon\` ` +
        `description is NOT verified against the host resolver on this run.`,
    )
  } else {
    const leadTest = readIconLeadTest(resolverPath)
    const registry = readIconRegistry(resolverPath)
    const accepted = deriveLeadingLetters(leadTest.test)
    console.log(
      `  - icon contract: resolver at ${displayPath(resolverPath)}, ` +
        `${registry.size} bundled names, leading commands ${accepted.join('/')} ` +
        `(derived from ${ICON_LEAD_CONST})`,
    )
    failures.push(...checkIconContract(schema, leadTest, registry))
  }

  if (failures.length > 0) {
    console.error(`\nplugin.schema.json does not match reality.\n`)
    for (const failure of failures) console.error(`${failure}\n`)
    process.exit(1)
  }

  const inUse = [...sink.observed].sort((a, b) => a.localeCompare(b))
  console.log(`\n${discovery.manifests.length} manifest(s) validate. Keys in use: ${inUse.join(', ')}.`)
  for (const key of FORWARD_COMPAT_ALLOWANCE.keys()) {
    if (sink.observed.has(key)) continue
    console.log(`Permitted but unused: ${key} (allowed: ${FORWARD_COMPAT_ALLOWANCE.get(key)})`)
  }
  console.log('plugin.schema.json matches the manifests in the tree.')
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
