#!/usr/bin/env node

// Generates the spora-docs API reference from `docs/.vuepress/openapi.json`.
// Writes:
//   - docs/reference/api.md         — overview + summary table + per-tag link list.
//                                     Everything outside the API:GENERATED markers
//                                     is hand-written and preserved verbatim.
//   - docs/reference/api/{slug}.md  — one file per tag, each holding the per-endpoint
//                                     detail (path params, query params, responses).
//
// `gen:api:check` validates the committed artifacts only — api.md and
// api-sidebar.json.
//
// `--spec <path>` points the renderer at a different OpenAPI spec. The
// default is `docs/.vuepress/openapi.json`; the CI drift check uses the
// flag to compare the committed reference against a second spec — one
// generated from a spora-core ref other than main.
//
// Tag → slug: lowercased tag, with hyphens preserved (Agent-templates →
// agent-templates). Untagged endpoints land on the "health" page.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve, basename, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import prettier from 'prettier'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SPEC = resolve(ROOT, 'docs/.vuepress/openapi.json')
const TARGET = resolve(ROOT, 'docs/reference/api.md')
const API_DIR = resolve(ROOT, 'docs/reference/api')
const SIDEBAR = resolve(ROOT, 'docs/.vuepress/api-sidebar.json')
const MARKER_START = '<!-- API:GENERATED:START -->'
const MARKER_END = '<!-- API:GENERATED:END -->'

const checkOnly = process.argv.includes('--check')

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']

/**
 * The spec a `--spec` flag names, or null when there is none.
 *
 * The path is resolved against the working directory, the way every other
 * command-line path is.
 */
export function specPathFromArgs(argv) {
  const index = argv.indexOf('--spec')
  if (index === -1) {
    return null
  }

  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error('--spec needs the path of an OpenAPI spec.')
  }

  return resolve(process.cwd(), value)
}

/**
 * A path as it reads in a message: repo-relative when it is inside the
 * repo, absolute otherwise.
 */
function displayPath(path) {
  const rel = relative(ROOT, path)
  return rel.startsWith('..') ? path : rel
}

// Markdown pipe-escape used in table cells — String.raw avoids the double-escape
// the regex form needs in a JS string literal.
const PIPE = String.raw`\|`

function tagSlug(tag) {
  return tag === '' ? 'health' : tag.toLowerCase()
}

function summariseSecurity(securityList, schemes) {
  if (!securityList || securityList.length === 0) return '—'
  const names = securityList.flatMap((entry) => Object.keys(entry))
  if (names.length === 0) return '—'
  return names.map((n) => `\`${n}\``).join(' + ')
}

function renderParamTable(params) {
  const rows = [
    '| Name | Type | Required | Description |',
    '| ---- | ---- | -------- | ----------- |',
  ]
  const body = params.map((p) => {
    const type = p.schema?.type ?? p.type ?? '(unspecified)'
    const required = p.required ? 'yes' : 'no'
    const desc = (p.description ?? '').replaceAll('|', PIPE)
    return `| \`${p.name}\` | ${type} | ${required} | ${desc} |`
  })
  return [...rows, ...body, ''].join('\n')
}

/**
 * A schema's type as it reads in a table cell.
 *
 * Spelled out rather than written as `array<string>`: angle brackets are
 * HTML-ish, and a cell that renders as an empty gap teaches a reader nothing.
 */
function baseType(schema) {
  if (!schema) return '(unspecified)'
  if (schema.type === 'array') {
    return schema.items ? `array of ${baseType(schema.items)}` : 'array'
  }
  if (schema.type === 'string') {
    if (schema.format === 'binary') return 'binary'
    return schema.format ? `string (${schema.format})` : 'string'
  }
  if (schema.type === 'object' || schema.properties) return 'object'
  return schema.type ?? '(unspecified)'
}

function renderType(schema) {
  const base = baseType(schema)
  return schema?.nullable ? `${base} ${PIPE} null` : base
}

function pluralItems(count) {
  return count === 1 ? 'item' : 'items'
}

/**
 * One enum value as it reads in a table cell.
 *
 * Every value keeps its backticks — except the empty string, which would
 * otherwise render as an empty code span: nothing at all, where the reader
 * sees a dangling comma and no option. `""` says what the value is.
 */
function renderEnumValue(value) {
  return value === '' ? '`""`' : `\`${value}\``
}

/**
 * The property's description, plus the constraints the schema carries and the
 * prose does not: the enum, the length and item bounds.
 */
function renderFieldDescription(schema) {
  const bits = []
  if (schema.description) bits.push(schema.description)
  if (schema.enum?.length) {
    const values = schema.enum.map(renderEnumValue).join(', ')
    bits.push(`One of ${values}.`)
  }
  if (schema.minLength !== undefined) bits.push(`At least ${schema.minLength} characters.`)
  if (schema.maxLength !== undefined) bits.push(`At most ${schema.maxLength} characters.`)
  if (schema.minItems !== undefined) bits.push(`At least ${schema.minItems} ${pluralItems(schema.minItems)}.`)
  if (schema.maxItems !== undefined) bits.push(`At most ${schema.maxItems} ${pluralItems(schema.maxItems)}.`)
  if (schema.format === 'binary') bits.push('File part.')
  return bits.join(' ').replaceAll('|', PIPE)
}

/**
 * The body's fields as flat rows, nested objects flattened into
 * `parent[].child` paths.
 *
 * A nested object gets a row of its own *and* rows for its own fields: a row
 * that says only "object" tells a caller nothing about what to put in it.
 */
function schemaFields(schema, prefix = '') {
  const rows = []
  const required = new Set(schema.required ?? [])

  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name
    rows.push({ name: path, schema: prop, required: required.has(name) })

    const isArray = prop.type === 'array'
    const child = isArray ? prop.items : prop
    if (child?.type === 'object' && child.properties) {
      rows.push(...schemaFields(child, isArray ? `${path}[]` : path))
    }
  }

  return rows
}

/**
 * The request body as a field table, one table per content type.
 *
 * A body the spec does not describe field-by-field still gets its content
 * type stated, so the section is never silently empty.
 */
function renderRequestBody(requestBody) {
  const parts = ['### Request body', '']

  for (const [contentType, def] of Object.entries(requestBody.content ?? {})) {
    parts.push(`\`${contentType}\` — ${requestBody.required ? 'required' : 'optional'}`, '')

    const fields = schemaFields(def.schema ?? {})
    if (fields.length === 0) continue

    parts.push('| Field | Type | Required | Description |', '| ----- | ---- | -------- | ----------- |')
    for (const row of fields) {
      parts.push(
        `| \`${row.name}\` | ${renderType(row.schema)} | ${row.required ? 'yes' : 'no'} | ${renderFieldDescription(row.schema)} |`,
      )
    }
    parts.push('')
  }

  return parts.join('\n')
}

/**
 * Flatten the spec into one record per (path, method). Tag is the first tag
 * declared on the operation; "" if none. Sorted by path, so the summary table
 * and the per-tag pages both read in a stable order.
 */
function collectEndpoints(spec) {
  const paths = Object.keys(spec.paths ?? {}).sort((a, b) => a.localeCompare(b))
  const out = []
  for (const path of paths) {
    const item = spec.paths[path]
    for (const method of METHODS) {
      const op = item[method]
      if (!op) continue
      const tag = (op.tags ?? [])[0] ?? ''
      out.push({ path, method, tag, op })
    }
  }
  return out
}

function renderSecuritySchemesTable(spec) {
  const schemes = spec.components?.securitySchemes ?? {}
  const entries = Object.entries(schemes)
  if (entries.length === 0) return ''
  const header = [
    '### Security schemes',
    '',
    '| Scheme | Where | Key | Description |',
    '| ------ | ----- | --- | ----------- |',
  ]
  const rows = entries.map(([name, def]) => {
    const where = def.in ?? def.type
    const key = def.name ?? '(scheme-level)'
    const desc = (def.description ?? '').replaceAll('|', PIPE)
    return `| \`${name}\` | ${where} | \`${key}\` | ${desc} |`
  })
  return [...header, ...rows, ''].join('\n')
}

function renderSummaryTable(endpoints, schemes) {
  const header = [
    '### Endpoints',
    '',
    '| Method | Path | Auth | Purpose | Tags |',
    '| ------ | ---- | ---- | ------- | ---- |',
  ]
  const rows = endpoints.map(({ path, method, tag, op }) => {
    const auth = summariseSecurity(op.security, schemes)
    const purpose = (op.summary ?? '').replaceAll('|', PIPE)
    return `| \`${method.toUpperCase()}\` | \`${path}\` | ${auth} | ${purpose} | ${tag} |`
  })
  return [...header, ...rows, ''].join('\n')
}

export function renderEndpointDetail({ path, method, op }) {
  const heading = op.summary
    ? `## \`${method.toUpperCase()} ${path}\` — ${op.summary}`
    : `## \`${method.toUpperCase()} ${path}\``
  const parts = [heading, '']
  if (op.description) parts.push(op.description, '')
  if (op.tags?.length) parts.push(`**Tags:** ${op.tags.join(', ')}`, '')

  const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path')
  const queryParams = (op.parameters ?? []).filter((p) => p.in === 'query')
  if (pathParams.length > 0) {
    parts.push('### Path parameters', '', renderParamTable(pathParams))
  }
  if (queryParams.length > 0) {
    parts.push('### Query parameters', '', renderParamTable(queryParams))
  }
  if (op.requestBody) {
    parts.push(renderRequestBody(op.requestBody))
  }

  const responses = op.responses ?? {}
  if (Object.keys(responses).length > 0) {
    const respHeader = ['### Responses', '', '| Status | Description |', '| ------ | ----------- |']
    const respRows = Object.entries(responses).map(([status, resp]) => {
      const desc = (resp.description ?? '').replaceAll('|', PIPE)
      return `| \`${status}\` | ${desc} |`
    })
    parts.push(...respHeader, ...respRows, '')
  }
  return parts.join('\n')
}

/**
 * One rendered page per tag. Returns a Map<slug, body: string>.
 */
function renderPerTagPages(endpoints) {
  const groups = new Map()
  for (const ep of endpoints) {
    const slug = tagSlug(ep.tag)
    if (!groups.has(slug)) groups.set(slug, { displayTag: ep.tag || 'Health', items: [] })
    groups.get(slug).items.push(ep)
  }

  const pages = new Map()
  for (const [slug, { displayTag, items }] of groups) {
    const header = [
      `# ${displayTag}`,
      '',
      '> Generated from `docs/.vuepress/openapi.json`. ' +
        'Refresh with `npm run gen:api`. [Back to overview](/reference/api).',
      '',
    ]
    const bodies = items.map(renderEndpointDetail)
    pages.set(slug, [...header, ...bodies].join('\n'))
  }
  return pages
}

function renderOverviewBody(spec, endpoints, schemes) {
  const intro = [
    '## Spora API — endpoint catalogue',
    '',
    '> This overview is generated from `docs/.vuepress/openapi.json`. `npm run gen:api` ' +
      'regenerates the per-resource pages listed below in lockstep.',
    '',
  ]

  // Group endpoints by tag for the link list, sorted by route count desc so the
  // largest surfaces come first.
  const byTag = new Map()
  for (const ep of endpoints) {
    const slug = tagSlug(ep.tag)
    if (!byTag.has(slug)) byTag.set(slug, { displayTag: ep.tag || 'Health', count: 0 })
    byTag.get(slug).count++
  }
  const sortedTags = [...byTag.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count
    return a[1].displayTag.localeCompare(b[1].displayTag)
  })

  const linkList = ['### Browse by resource', '']
  for (const [slug, { displayTag, count }] of sortedTags) {
    linkList.push(
      `- [${displayTag}](/reference/api/${slug}) — ${count} ${count === 1 ? 'route' : 'routes'}`,
    )
  }
  linkList.push('')

  return [
    ...intro,
    ...linkList,
    renderSecuritySchemesTable(spec),
    renderSummaryTable(endpoints, schemes),
  ].join('\n')
}

async function format(body) {
  return await prettier.format(body, {
    parser: 'markdown',
    proseWrap: 'preserve',
    printWidth: 200,
  })
}

/**
 * The sidebar manifest: { overview, items } for docs/.vuepress/config.ts to
 * import. Items ordered by route count desc, alphabetical on ties.
 */
function renderSidebar(perTag, endpoints) {
  const sidebarItems = [...perTag.entries()].map(([slug]) => {
    const displayTag = perTag.get(slug).match(/^# (.+)$/m)?.[1] ?? slug
    const count = endpoints.filter((ep) => tagSlug(ep.tag) === slug).length
    return { text: displayTag, link: `/reference/api/${slug}`, routes: count }
  })
  sidebarItems.sort((a, b) =>
    b.routes !== a.routes ? b.routes - a.routes : a.text.localeCompare(b.text),
  )
  const sidebarManifest = {
    overview: { text: 'Overview', link: '/reference/api' },
    items: sidebarItems.map(({ text, link }) => ({ text, link })),
  }
  return JSON.stringify(sidebarManifest, null, 2) + '\n'
}

/**
 * The reference as one spec renders it: the api.md the markers surround,
 * the per-tag pages, and the sidebar manifest.
 */
export async function renderReference(spec, targetPath = TARGET) {
  const schemes = spec.components?.securitySchemes ?? {}
  const endpoints = collectEndpoints(spec)

  const overview = renderOverviewBody(spec, endpoints, schemes)
  const perTag = renderPerTagPages(endpoints)

  const target = readFileSync(targetPath, 'utf8')
  const start = target.indexOf(MARKER_START)
  const end = target.indexOf(MARKER_END)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Markers ${MARKER_START} / ${MARKER_END} not found or out of order in ${targetPath}. ` +
        `The gen script writes only between them; both must be present in the page.`,
    )
  }
  const newApiMd =
    target.slice(0, start + MARKER_START.length) +
    '\n\n' +
    (await format(overview)).trim() +
    '\n\n' +
    target.slice(end)

  const tagFiles = new Map()
  for (const [slug, body] of perTag) {
    tagFiles.set(`${API_DIR}/${slug}.md`, await format(body))
  }

  return { newApiMd, tagFiles, sidebarBody: renderSidebar(perTag, endpoints) }
}

/**
 * The committed artefacts that do not match the given spec.
 *
 * The per-tag pages are gitignored and regenerated on every `npm run gen:api`
 * (called by predev/prebuild hooks and by the build CI job), so they cannot
 * be drift-checked. A per-tag page with a dead link fails the build instead
 * — that is the safety net for them.
 */
export async function checkDrift({ specPath = SPEC, targetPath = TARGET, sidebarPath = SIDEBAR } = {}) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'))
  const { newApiMd, sidebarBody } = await renderReference(spec, targetPath)

  const target = readFileSync(targetPath, 'utf8')
  const sidebarOnDisk = existsSync(sidebarPath) ? readFileSync(sidebarPath, 'utf8') : null

  const drift = []
  if (newApiMd !== target) {
    drift.push(displayPath(targetPath))
  }
  if (sidebarOnDisk !== sidebarBody) {
    drift.push(displayPath(sidebarPath))
  }

  return { drift, specPath }
}

/**
 * What a failed check says.
 *
 * The spec is named because the CI compares the reference against two of
 * them — spora-core@main and the ref the docs repo declares — and a reader
 * must never have to guess which one the block was compared against.
 */
export function driftMessage({ drift, specPath }) {
  return (
    `API reference is out of date. Regenerate with \`npm run gen:api\`.\n` +
    `Compared against: ${displayPath(specPath)}\n` +
    `Out of date:\n` +
    drift.map((p) => `  - ${p}`).join('\n')
  )
}

async function main(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'))
  const { newApiMd, tagFiles, sidebarBody } = await renderReference(spec, TARGET)

  writeFileSync(TARGET, newApiMd)
  console.log(`Wrote ${basename(TARGET)}.`)

  const { mkdirSync } = await import('node:fs')
  mkdirSync(API_DIR, { recursive: true })
  for (const [path, body] of tagFiles) {
    writeFileSync(path, body)
    console.log(`Wrote ${path.slice(ROOT.length + 1)}.`)
  }

  mkdirSync(dirname(SIDEBAR), { recursive: true })
  writeFileSync(SIDEBAR, sidebarBody)
  console.log(`Wrote ${SIDEBAR.slice(ROOT.length + 1)}.`)
}

// The renderer is imported by scripts/gen-api.test.mjs, so the CLI only runs
// when this file is the entry point — importing it must not write anything.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let specPath
  try {
    specPath = specPathFromArgs(process.argv.slice(2)) ?? SPEC
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  if (!existsSync(specPath)) {
    console.error(`Missing OpenAPI spec at ${displayPath(specPath)}.`)
    process.exit(1)
  }

  try {
    if (checkOnly) {
      const { drift, specPath: compared } = await checkDrift({ specPath })
      if (drift.length > 0) {
        console.error(driftMessage({ drift, specPath: compared }))
        process.exit(1)
      }
      console.log(`API reference is up to date (compared against ${displayPath(compared)}).`)
    } else {
      await main(specPath)
    }
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
