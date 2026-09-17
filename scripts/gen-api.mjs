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

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
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
 * Flatten the spec into one record per (path, method). Tag is the first tag
 * declared on the operation; "" if none. Routes are sorted by path so the
 * summary table and per-tag pages both read in stable order.
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

function renderEndpointDetail({ path, method, op }) {
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
 * Group endpoints by tag and render each group's per-endpoint detail.
 * Returns a Map<slug, { displayTag, body: string }>.
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

  // Group endpoints by tag for the link list, sorted by route count desc
  // so the largest surfaces come first.
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

async function main() {
  const spec = JSON.parse(readFileSync(SPEC, 'utf8'))
  const schemes = spec.components?.securitySchemes ?? {}
  const endpoints = collectEndpoints(spec)

  const overview = renderOverviewBody(spec, endpoints, schemes)
  const perTag = renderPerTagPages(endpoints)

  // Build the api.md content by splicing the generated body between markers.
  const target = readFileSync(TARGET, 'utf8')
  const start = target.indexOf(MARKER_START)
  const end = target.indexOf(MARKER_END)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Markers ${MARKER_START} / ${MARKER_END} not found or out of order in ${TARGET}. ` +
        `The gen script writes only between them; both must be present in the page.`,
    )
  }
  const newApiMd =
    target.slice(0, start + MARKER_START.length) +
    '\n\n' +
    (await format(overview)).trim() +
    '\n\n' +
    target.slice(end)

  // Build the per-tag files.
  const tagFiles = new Map()
  for (const [slug, body] of perTag) {
    tagFiles.set(`${API_DIR}/${slug}.md`, await format(body))
  }

  // Sidebar manifest: { overview, items } for docs/.vuepress/config.ts to import.
  // Items ordered by route count desc, alphabetical on ties.
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
  const sidebarBody = JSON.stringify(sidebarManifest, null, 2) + '\n'

  if (checkOnly) {
    // Per-tag files under docs/reference/api/ are gitignored and regenerated
    // on every `npm run gen:api` (called by predev/prebuild hooks and by the
    // build CI job). The drift check therefore only validates the committed
    // artifacts: api.md shell + api-sidebar.json manifest. If a per-tag page
    // renders incorrectly, the build job fails — that's the safety net.
    const drift = []
    if (newApiMd !== target) {
      drift.push('docs/reference/api.md')
    }
    const sidebarOnDisk = existsSync(SIDEBAR) ? readFileSync(SIDEBAR, 'utf8') : null
    if (sidebarOnDisk !== sidebarBody) {
      drift.push(SIDEBAR)
    }
    if (drift.length > 0) {
      console.error(
        `API reference is out of date. Regenerate with \`npm run gen:api\`.\n` +
          `Out of date:\n` +
          drift.map((p) => `  - ${p}`).join('\n'),
      )
      process.exit(1)
    }
    console.log('API reference is up to date.')
    return
  }

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

if (!existsSync(SPEC)) {
  console.error(`Missing OpenAPI spec at ${SPEC}.`)
  process.exit(1)
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
