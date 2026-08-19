// tools/behavior.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBehavior, stripBehaviorLead } from './behavior.mjs'

test('parses a Given/When/Then triple from a requirement body as a 1-beat chain', () => {
  // (shape migrated with D1, spec 2026-08-20: the triple is now the 1-beat case of {given, beats})
  const body = [
    '- **Given** edit mode · value ≠ house view',
    '- **When** edit the value',
    '- **Then** the cell marks an override; the HV base is kept',
    '',
    'Prose follows here.'
  ].join('\n')
  assert.deepEqual(parseBehavior(body), {
    given: 'edit mode · value ≠ house view',
    beats: [{
      when: 'edit the value',
      then: 'the cell marks an override; the HV base is kept'
    }]
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
  assert.deepEqual(parseBehavior(body), { given: 'a', beats: [{ when: 'b', then: 'c' }] })
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

// ── beats (D1, spec 2026-08-20): Given + 1..N (When → Then) ─────────────────
// The grammar is a strict superset — a triple is a 1-beat chain — and the parser is strict about
// document order: exactly one Given first, then When, Then, When, Then… with ≥1 complete pair.
// Any violation is null (prose-only fallback), the same honesty as the old partial→null.

test('parses Given + two When→Then beats in document order', () => {
  const body = [
    '- **Given** an operation-cost table in edit mode',
    '- **When** the value is edited',
    '- **Then** the cell marks an override',
    '- **When** Reset is pressed',
    '- **Then** the override clears back to the house view',
    '',
    'Prose follows.'
  ].join('\n')
  assert.deepEqual(parseBehavior(body), {
    given: 'an operation-cost table in edit mode',
    beats: [
      { when: 'the value is edited', then: 'the cell marks an override' },
      { when: 'Reset is pressed', then: 'the override clears back to the house view' }
    ]
  })
})

test('a second Given is a second requirement, never a beat — null (D1 bounding rule 1)', () => {
  const body = '- **Given** a\n- **When** b\n- **Then** c\n- **Given** d\n- **When** e\n- **Then** f'
  assert.equal(parseBehavior(body), null)
})

test('a When without its Then is an incomplete beat — null', () => {
  const body = '- **Given** a\n- **When** b\n- **Then** c\n- **When** dangling'
  assert.equal(parseBehavior(body), null)
})

test('a Then before any When is out of order — null', () => {
  const body = '- **Given** a\n- **Then** premature\n- **When** b\n- **Then** c'
  assert.equal(parseBehavior(body), null)
})

test('a Given that is not the first label line is out of order — null', () => {
  assert.equal(parseBehavior('- **When** w\n- **Given** g\n- **Then** t'), null)
})

test('stripBehaviorLead strips ALL beat lines of a multi-beat block, keeping the prose', () => {
  const body = [
    '- **Given** g',
    '- **When** w1',
    '- **Then** t1',
    '- **When** w2',
    '- **Then** t2',
    '',
    'Prose under the beats.'
  ].join('\n')
  assert.equal(stripBehaviorLead(body), 'Prose under the beats.')
})
