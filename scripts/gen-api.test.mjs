// Tests for the API reference renderer.
//
// The bug these guard: `renderEndpointDetail` rendered path params, query
// params and responses, and silently dropped `requestBody` — so every
// endpoint that takes a body published its parameters and its responses but
// never its request schema. The spec was correct throughout; the renderer
// threw the body away.
//
// The tests below use a fixture spec rather than `docs/.vuepress/openapi.json`
// because that file is a CI artifact, gitignored, and absent from a fresh
// clone. A test that needs it would only run in one job.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkDrift,
  driftMessage,
  renderEndpointDetail,
  renderReference,
  specPathFromArgs,
} from './gen-api.mjs'

const SCRIPT = fileURLToPath(new URL('./gen-api.mjs', import.meta.url))
const ROOT = resolve(dirname(SCRIPT), '..')

function render(op, { path = '/api/v1/things', method = 'post' } = {}) {
  return renderEndpointDetail({ path, method, op })
}

const JSON_BODY = {
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', description: 'The user message.' },
            max_steps: { type: 'integer', nullable: true },
            scope: { type: 'string', enum: ['user', 'group'] },
            name: { type: 'string', maxLength: 100 },
          },
        },
      },
    },
  },
}

describe('request body rendering', () => {
  it('renders a request body section', () => {
    const out = render({ ...JSON_BODY, responses: {} })

    assert.match(out, /### Request body/)
    assert.match(out, /`application\/json` — required/)
  })

  it('renders every property as a row', () => {
    const out = render(JSON_BODY)

    assert.match(out, /\| `text` \|/)
    assert.match(out, /\| `max_steps` \|/)
    assert.match(out, /\| `scope` \|/)
    assert.match(out, /\| `name` \|/)
  })

  it('marks required properties and leaves the rest optional', () => {
    const out = render(JSON_BODY)

    assert.match(out, /\| `text` \|.*\| yes \|/)
    assert.match(out, /\| `max_steps` \|.*\| no \|/)
  })

  it('carries the property description into the table', () => {
    assert.match(render(JSON_BODY), /The user message\./)
  })

  it('renders the enum values, since a bare "string" does not say which', () => {
    assert.match(render(JSON_BODY), /One of `user`, `group`\./)
  })

  it('renders an empty enum value as a quoted empty string rather than as nothing', () => {
    const out = render({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                effort: { type: 'string', enum: ['none', 'low', ''] },
              },
            },
          },
        },
      },
    })

    assert.match(out, /One of `none`, `low`, `""`\./)
  })

  it('renders a nullable property as nullable', () => {
    assert.match(render(JSON_BODY), /\| `max_steps` \| integer \\\| null \|/)
  })

  it('renders the length bound the schema carries', () => {
    assert.match(render(JSON_BODY), /At most 100 characters\./)
  })

  it('says the body is optional when the spec does not require it', () => {
    const out = render({ requestBody: { content: { 'application/json': { schema: {} } } } })

    assert.match(out, /`application\/json` — optional/)
  })

  it('renders a multipart body under its own content type', () => {
    const out = render({
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
          },
        },
      },
    })

    assert.match(out, /`multipart\/form-data` — required/)
    assert.match(out, /\| `file` \| binary \|/)
  })

  it('flattens a nested object into `parent[].child` rows', () => {
    const out = render({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['decisions'],
              properties: {
                decisions: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    required: ['provider_call_id', 'decision'],
                    properties: {
                      provider_call_id: { type: 'string' },
                      decision: { type: 'string', enum: ['approve', 'reject'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    assert.match(out, /\| `decisions` \| array of object \| yes \|/)
    assert.match(out, /\| `decisions\[\]\.provider_call_id` \| string \| yes \|/)
    assert.match(out, /\| `decisions\[\]\.decision` \| string \| yes \| One of `approve`, `reject`\./)
  })

  it('renders the item bound of an array', () => {
    const out = render({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 64 },
              },
            },
          },
        },
      },
    })

    assert.match(out, /\| `ids` \| array of string \(uuid\) \|/)
    assert.match(out, /At most 64 items\./)
  })

  it('agrees with itself about the singular', () => {
    const out = render({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { decisions: { type: 'array', minItems: 1, items: { type: 'object' } } },
            },
          },
        },
      },
    })

    assert.match(out, /At least 1 item\./)
  })
})

describe('the drop that started this', () => {
  it('renders a body for every operation that declares one', () => {
    const operations = [
      { path: '/api/v1/a', method: 'post', op: JSON_BODY },
      {
        path: '/api/v1/b',
        method: 'post',
        op: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array' } } },
              },
            },
          },
        },
      },
    ]

    for (const { path, method, op } of operations) {
      const out = renderEndpointDetail({ path, method, op })

      assert.match(out, /### Request body/, `${method.toUpperCase()} ${path} lost its request body`)

      for (const name of Object.keys(op.requestBody.content['application/json'].schema.properties)) {
        assert.match(out, new RegExp(`\\| \`${name}\` \\|`), `${method.toUpperCase()} ${path} lost \`${name}\``)
      }
    }
  })
})

describe('the --spec flag', () => {
  it('names the spec it is given', () => {
    const path = specPathFromArgs(['--check', '--spec', 'docs/.vuepress/other.json'])

    assert.equal(path, resolve(process.cwd(), 'docs/.vuepress/other.json'))
  })

  it('is absent when the flag is not passed', () => {
    assert.equal(specPathFromArgs(['--check']), null)
  })

  it('refuses a flag without a path', () => {
    assert.throws(() => specPathFromArgs(['--spec']), /--spec needs the path/)
  })

  it('reads the joined form as well as the spaced one', () => {
    // `--spec=path` is what a person types, and a flag that reads one
    // spelling and ignores the other is a flag that can do nothing: the
    // check would fall back to the default spec and report the reference
    // as up to date.
    const spaced = specPathFromArgs(['--check', '--spec', 'docs/.vuepress/other.json'])
    const joined = specPathFromArgs(['--check', '--spec=docs/.vuepress/other.json'])

    assert.equal(joined, spaced)
  })

  it('refuses the joined form with no path', () => {
    assert.throws(() => specPathFromArgs(['--spec=']), /--spec needs the path/)
  })
})

describe('the drift check against a named spec', () => {
  // The CI compares the committed reference against two specs: the one
  // spora-core@main generates, and the one a declared core ref generates.
  // The flag is what tells the check which one it is looking at.

  const SPEC = {
    openapi: '3.0.0',
    info: { title: 'Spora API', version: '0.0.0' },
    paths: {
      '/api/v1/thing': {
        get: { summary: 'List things', tags: ['Things'], responses: { '200': { description: 'OK' } } },
      },
    },
  }

  const OTHER_SPEC = {
    openapi: '3.0.0',
    info: { title: 'Spora API', version: '0.0.0' },
    paths: {
      '/api/v1/other': {
        get: { summary: 'List others', tags: ['Others'], responses: { '200': { description: 'OK' } } },
      },
    },
  }

  const SHELL = [
    '---',
    'title: Fixture',
    '---',
    '',
    '# Fixture',
    '',
    '<!-- API:GENERATED:START -->',
    '<!-- API:GENERATED:END -->',
    '',
  ].join('\n')

  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'gen-api-'))
    const targetPath = join(dir, 'api.md')
    const sidebarPath = join(dir, 'api-sidebar.json')
    const specPath = join(dir, 'spec.json')
    const otherSpecPath = join(dir, 'other-spec.json')

    writeFileSync(targetPath, SHELL)
    writeFileSync(sidebarPath, '{}\n')
    writeFileSync(specPath, JSON.stringify(SPEC))
    writeFileSync(otherSpecPath, JSON.stringify(OTHER_SPEC))

    return { targetPath, sidebarPath, specPath, otherSpecPath }
  }

  it('compares against the spec it was given', async () => {
    const { targetPath, sidebarPath, specPath, otherSpecPath } = fixture()

    // The reference as the first spec renders it.
    const { newApiMd, sidebarBody } = await renderReference(SPEC, targetPath)
    writeFileSync(targetPath, newApiMd)
    writeFileSync(sidebarPath, sidebarBody)

    const againstItsOwn = await checkDrift({ specPath, targetPath, sidebarPath })
    assert.deepEqual(againstItsOwn.drift, [])

    // The same reference against a different spec: the check has to see the
    // difference, or the flag is not doing anything.
    const againstAnother = await checkDrift({ specPath: otherSpecPath, targetPath, sidebarPath })
    assert.deepEqual(againstAnother.drift, [targetPath, sidebarPath])
  })

  it('names the spec it compared against when the reference is out of date', async () => {
    const { targetPath, sidebarPath, otherSpecPath } = fixture()

    const { drift, specPath } = await checkDrift({ specPath: otherSpecPath, targetPath, sidebarPath })
    const message = driftMessage({ drift, specPath })

    assert.ok(drift.length > 0)
    assert.ok(
      message.includes(`Compared against: ${otherSpecPath}`),
      `the message does not name the spec it compared against: ${message}`,
    )
  })

  it('compares against the spec the joined form names, not the default', async () => {
    const { targetPath, sidebarPath, otherSpecPath } = fixture()

    // The reference as the first spec renders it.
    const { newApiMd, sidebarBody } = await renderReference(SPEC, targetPath)
    writeFileSync(targetPath, newApiMd)
    writeFileSync(sidebarPath, sidebarBody)

    // The joined form resolves to the other spec — and to nothing else.
    const named = specPathFromArgs([`--spec=${otherSpecPath}`])
    assert.equal(named, otherSpecPath)

    // The check against it has to see the difference. A silent fall back to
    // the default spec would find no drift and report the reference as up
    // to date, which is the whole thing the flag exists to prevent.
    const { drift, specPath } = await checkDrift({ specPath: named, targetPath, sidebarPath })

    assert.deepEqual(drift, [targetPath, sidebarPath])
    assert.equal(specPath, otherSpecPath)
  })

  it('compares against the spec the joined form names on the command line', () => {
    // The unit tests above cover the pieces; this one covers the wiring —
    // the CLI has to hand the spec the flag names to the check, or the
    // whole flag is decoration.
    const { otherSpecPath } = fixture()

    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--check', `--spec=${otherSpecPath}`],
      { cwd: ROOT, encoding: 'utf8' },
    )

    assert.notEqual(result.status, 0, 'the check should have found drift against the named spec')
    assert.ok(
      result.stderr.includes(`Compared against: ${otherSpecPath}`),
      `the check did not name the spec it compared against: ${result.stderr}`,
    )
  })
})
