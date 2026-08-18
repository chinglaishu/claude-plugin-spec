// tools/behavior.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBehavior, stripBehaviorLead } from './behavior.mjs'

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

// stripBehaviorLead is parseBehavior's complement: renderBehavior draws the triple as the shape, so
// the prose renderer must NOT draw those same three lines again as a bullet list below it. Strip the
// triple lines, keep the prose that follows.
test('stripBehaviorLead removes the triple lines and keeps the prose that follows', () => {
  const body = [
    '- **Given** a list with two items',
    '- **When** you press Clear',
    '- **Then** the list shows zero items',
    '',
    'Supporting prose under the shape.'
  ].join('\n')
  const out = stripBehaviorLead(body)
  assert.equal(out, 'Supporting prose under the shape.')
  assert.doesNotMatch(out, /\*\*Given\*\*|\*\*When\*\*|\*\*Then\*\*/)  // no triple line survives to be re-rendered
})

test('stripBehaviorLead is a no-op for a prose-only body — the fallback path stays byte-identical', () => {
  assert.equal(stripBehaviorLead('Only prose here, no triple.'), 'Only prose here, no triple.')
})

test('stripBehaviorLead of a body that is only the triple returns the empty string — no stray prose block', () => {
  assert.equal(stripBehaviorLead('- **Given** g\n- **When** w\n- **Then** t'), '')
})
