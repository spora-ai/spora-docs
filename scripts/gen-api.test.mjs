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

import { renderEndpointDetail } from './gen-api.mjs'

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
