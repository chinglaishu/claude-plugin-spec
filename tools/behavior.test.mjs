// tools/behavior.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBehavior } from './behavior.mjs'

test('parses a Given/When/Then triple from a requirement body', () => {
  const body = [
    '- **Given** edit mode · value ≠ house view',
    '- **When** edit the value',
    '- **Then** the cell marks an override; the HV base is kept',
    '',
    'Prose follows here.'
  ].join('\n')
  assert.deepEqual(parseBehavior(body), {
    given: 'edit mode · value ≠ house view',
    when: 'edit the value',
    then: 'the cell marks an override; the HV base is kept'
  })
})

test('returns null when the triple is absent — prose-only requirements stay valid', () => {
  assert.equal(parseBehavior('Just prose, no behavior block.'), null)
})

test('returns null when only some of the three labels are present', () => {
  assert.equal(parseBehavior('- **Given** a state\n- **When** an action'), null)
})

test('is tolerant of extra spaces and a trailing period on the label', () => {
  const body = '-   **Given**  a\n- **When** b\n- **Then** c'
  assert.deepEqual(parseBehavior(body), { given: 'a', when: 'b', then: 'c' })
})
