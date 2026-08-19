// tools/reqhash.test.mjs — the shared requirement-text hash (two scopes, notes excluded)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, stripNotes, meaningText, behaviorText, reqHash, isStale, isChanged } from './reqhash.mjs'

// -- normalize ---------------------------------------------------------------

test('normalize collapses newlines, tabs and space runs to single spaces and trims', () => {
  assert.equal(normalize('  a\n\nb\t\tc   d\n'), 'a b c d')
})

test('normalize returns the empty string for nullish or empty input', () => {
  assert.equal(normalize(null), '')
  assert.equal(normalize(undefined), '')
  assert.equal(normalize(''), '')
})

// -- stripNotes --------------------------------------------------------------

test('stripNotes removes a multi-line fully-italic dated note but keeps the G/W/T lines and prose', () => {
  const body = [
    '- **Given** a list with two items',
    '- **When** you press Clear',
    '- **Then** the list shows zero items',
    '',
    'Supporting prose under the shape.',
    '',
    '*Amended 2026-08-17 (the human\'s decision): the note spans',
    'multiple lines inside one italic block, so the paragraph,',
    'not the line, is the unit.*'
  ].join('\n')
  const out = stripNotes(body)
  assert.equal(out, [
    '- **Given** a list with two items',
    '- **When** you press Clear',
    '- **Then** the list shows zero items',
    '',
    'Supporting prose under the shape.'
  ].join('\n'))
})

test('stripNotes drops every dated-note shape from the real PRDs', () => {
  const body = [
    'Prose stays.',
    '',
    '*Narrowed 2026-07-30: tightened to the visible viewport.*',
    '',
    '*Reworded 2026-08-19 (the human): plain words now.*'
  ].join('\n')
  assert.equal(stripNotes(body), 'Prose stays.')
})

test('stripNotes does NOT remove a paragraph containing **bold** or an inline *word*', () => {
  const body = [
    '**Bold-led** paragraph survives even though it starts with an asterisk pair.',
    '',
    'A line with an inline *emphasis* mid-sentence survives too.',
    '',
    '*Amended 2026-08-19 (the human): only this one goes.*'
  ].join('\n')
  assert.equal(stripNotes(body), [
    '**Bold-led** paragraph survives even though it starts with an asterisk pair.',
    '',
    'A line with an inline *emphasis* mid-sentence survives too.'
  ].join('\n'))
})

test('stripNotes is a no-op on a body with no notes', () => {
  const body = 'Just prose.\n\nAnd a second paragraph.'
  assert.equal(stripNotes(body), body)
})

// -- behaviorText ------------------------------------------------------------

test('behaviorText normalizes the parsed triple into one line', () => {
  const parsed = { given: 'edit  mode', when: 'edit\nthe value', then: 'the cell\tmarks an override' }
  assert.equal(behaviorText(parsed), 'edit mode edit the value the cell marks an override')
})

test('behaviorText(null) is the empty string — prose-only requirements have no picture-pin', () => {
  assert.equal(behaviorText(null), '')
})

// beats (D1, spec 2026-08-20): given + every beat in document order, single-space joined.
test('behaviorText serializes given + every When/Then beat in order', () => {
  const parsed = {
    given: 'edit mode',
    beats: [
      { when: 'edit the value', then: 'the cell marks an override' },
      { when: 'press Reset', then: 'the override clears' }
    ]
  }
  assert.equal(behaviorText(parsed), 'edit mode edit the value the cell marks an override press Reset the override clears')
})

// The byte-identity pin (task 12): no schematic pin is committed yet, but the guarantee is free —
// a 1-beat block serializes EXACTLY as the old flat given-when-then form did, so any future
// behaviorText hash stamped today never moves when the grammar did. The legacy flat shape maps to
// one beat, so old fixtures/tests keep meaning what they said.
test('PIN: a 1-beat block is byte-identical to the old flat given-when-then serialization', () => {
  const oldForm = 'edit mode edit the value the cell marks an override'  // pre-beats output, verbatim
  const oneBeat = { given: 'edit mode', beats: [{ when: 'edit the value', then: 'the cell marks an override' }] }
  const legacy = { given: 'edit mode', when: 'edit the value', then: 'the cell marks an override' }
  assert.equal(behaviorText(oneBeat), oldForm)
  assert.equal(behaviorText(legacy), oldForm)
})

// -- reqHash / isStale -------------------------------------------------------

test('reqHash is deterministic and 16 lowercase hex chars; different inputs differ', () => {
  const a = reqHash('some requirement text')
  assert.equal(a, reqHash('some requirement text'))
  assert.match(a, /^[0-9a-f]{16}$/)
  assert.notEqual(a, reqHash('some OTHER requirement text'))
})

test('reqHash of the empty string is a fixed non-empty digest', () => {
  assert.match(reqHash(''), /^[0-9a-f]{16}$/)
})

test('isStale is false against the text\'s own hash, true against a stale stamp', () => {
  const t = 'the requirement as written'
  assert.equal(isStale(reqHash(t), t), false)
  assert.equal(isStale('deadbeefdeadbeef', t), true)
})

// -- isChanged (Changed-drift — board R4's fifth word, 2026-08-19) -----------

test('isChanged: a Passed requirement whose pin no longer matches the text is Changed', () => {
  const body = 'The requirement as it reads today.'
  assert.equal(isChanged('passed', 'deadbeefdeadbeef', body), true)
})

test('isChanged: a Passed requirement whose pin still matches is NOT Changed', () => {
  const body = 'The requirement as it reads today.'
  assert.equal(isChanged('passed', reqHash(meaningText(body)), body), false)
})

test('isChanged is a modifier on Passed ONLY — failed / not-reached / untested keep their word', () => {
  for (const status of ['failed', 'not-reached', 'untested']) {
    assert.equal(isChanged(status, 'deadbeefdeadbeef', 'moved text'), false, status)
  }
})

test('isChanged: no pin → false — a requirement never proven cannot be Changed', () => {
  assert.equal(isChanged('passed', null, 'any text'), false)
  assert.equal(isChanged('passed', undefined, 'any text'), false)
})

test('isChanged: appending a dated author-note does not flip it — meaningText drops notes', () => {
  const before = 'Prose that is the meaning.'
  const pin = reqHash(meaningText(before))
  const after = before + '\n\n*Amended 2026-08-19 (the human): provenance note only, meaning untouched.*'
  assert.equal(isChanged('passed', pin, after), false)
})

// -- the two design-point tests ---------------------------------------------

test('PROSE-ONLY EDIT: the picture-pin (behavior hash) survives, the proof-pin (meaning hash) moves', () => {
  const triple = [
    '- **Given** a portfolio with three assets',
    '- **When** one asset is sold',
    '- **Then** the total row recomputes to the remaining two'
  ].join('\n')
  const body1 = triple + '\n\nThe total must never lag a sale.'
  const body2 = triple + '\n\nA sale is reflected in the total immediately, never lagging.'
  // parsed behavior objects built by hand — this test never imports behavior.mjs
  const parse1 = {
    given: 'a portfolio with three assets',
    when: 'one asset is sold',
    then: 'the total row recomputes to the remaining two'
  }
  const parse2 = { ...parse1 }
  assert.equal(reqHash(behaviorText(parse1)), reqHash(behaviorText(parse2)))       // schematic survives
  assert.notEqual(reqHash(meaningText(body1)), reqHash(meaningText(body2)))        // proof-pin moved
})

test('ADDING A DATED NOTE changes NOTHING — a provenance edit never flips Changed', () => {
  const withoutNote = [
    '- **Given** g',
    '- **When** w',
    '- **Then** t',
    '',
    'Prose beneath.'
  ].join('\n')
  const withNote = withoutNote + '\n\n*Amended 2026-08-19 (the human): note appended, meaning untouched.*'
  assert.equal(reqHash(meaningText(withNote)), reqHash(meaningText(withoutNote)))
})
