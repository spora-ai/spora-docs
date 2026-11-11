// Tests for the plugin-manifest checks.
//
// The bug these guard: `spora-plugin-usage` shipped `"icon": "chart"`,
// which is not one of the host's bundled icon names. The host falls back to
// the generic "puzzle" for a name it does not know, so the tile rendered
// with the wrong glyph and nothing said why — the schema accepted it, the
// manifest validated, and the CI was green.
//
// The check therefore runs the manifest's icon against the same two rules
// the resolver uses: the bundled-name registry, and the lead test for a raw
// SVG path.
//
// The tests use a fixture registry rather than the real one in
// spora-components — that lives in another repository, and a test that needs
// it would only run where that checkout exists.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { checkManifestIcons } from './check-plugin-schema.mjs'

// The resolver's own lead test, copied from spora-components' Icon.vue:
// a path may lead with M or m, then optional whitespace, then a digit.
const LEAD = /^(?:(?:M\s*\d)|(?:m\s*-?\d))/

const REGISTRY = new Set(['puzzle', 'zap', 'chart-bar', 'file-text', 'pilcrow'])

const RULE = 'SVG_PATH_LEAD = /^(?:(?:M\\s*\\d)|(?:m\\s*-?\\d))/'

function iconsFor(icon) {
  return checkManifestIcons([{ file: 'plugin.json', doc: { icon } }], LEAD, REGISTRY, RULE)
}

describe('checkManifestIcons', () => {
  it('accepts a bundled icon name', () => {
    assert.deepEqual(iconsFor('zap'), [])
    assert.deepEqual(iconsFor('file-text'), [])
  })

  it('accepts a raw SVG path', () => {
    assert.deepEqual(iconsFor('M12 2a10 10 0 100 20 10 10 0 100-20z'), [])
    assert.deepEqual(iconsFor('m-3 6'), [])
  })

  it('rejects a name the resolver does not ship', () => {
    // The bug: `chart` is not a bundled name, so it renders as "puzzle".
    const failures = iconsFor('chart')

    assert.equal(failures.length, 1)
    assert.match(failures[0], /"chart"/)
    assert.match(failures[0], /puzzle/)
  })

  it('rejects a name that only looks like a kebab-case identifier', () => {
    assert.equal(iconsFor('usage-meter').length, 1)
  })

  it('ignores a manifest with no icon', () => {
    assert.deepEqual(
      checkManifestIcons([{ file: 'plugin.json', doc: {} }], LEAD, REGISTRY, RULE),
      [],
    )
  })

  it('ignores a manifest whose icon is not a string', () => {
    assert.deepEqual(
      checkManifestIcons([{ file: 'plugin.json', doc: { icon: 42 } }], LEAD, REGISTRY, RULE),
      [],
    )
  })

  it('names the file that carries the icon', () => {
    const failures = checkManifestIcons(
      [{ file: 'spora-plugin-usage/plugin.json', doc: { icon: 'chart' } }],
      LEAD,
      REGISTRY,
      RULE,
    )

    assert.match(failures[0], /spora-plugin-usage\/plugin\.json/)
  })
})
