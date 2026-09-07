// tools/chip-label.test.mjs — THE USER'S ACTION IS NAMED IN THE EXPLAINING BOX (the human, 2026-09-06:
// "It's not obvious enough when user action is, we need to either show it out (really edit it and
// shown to user) or mention in the explaining text box").
//
// A When-moment's picture shows a STATE — the box holding the retyped text — and nothing on it said a
// user had just ACTED. The chip over each picture now opens with the MOMENT'S OWN LABEL (the authored
// sentence fragment the run recorded beside the frame), above the EXPECTED / ACTUAL lines, on both
// cells, from one wording source. This is a deliberate exception to design C's "every text once" —
// the strip's segment caption says the same words — because the human ruled the action must be
// legible on the picture itself, not only in a caption under it.
//
// The two rules these pin:
//   • `chipLabel(m)` is the moment's name, whitespace-collapsed — and EMPTY for the phase names that
//     name no moment ("given", "before", "after…"), which would print a machine word over a picture;
//   • `chipRows(m, side)` is what the camera must reserve: the claim lines PLUS the label's own line,
//     so a chip that grew a line cannot hang out of the cell it labels.
// Lifted out of the shipped bytes (tools/lift-client.mjs), never restated.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lift } from './lift-client.mjs'

const SRC = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
const chip = (() => {
  const consts = ['NOTHING', 'MUST_BE_ABSENT', 'WAS_ABSENT', 'PHASE_CAPS'].map(n => {
    const at = SRC.indexOf('const ' + n + ' = ')
    assert.ok(at >= 0, 'no const ' + n + ' in client.js — the chip wording moved')
    const nl = SRC.indexOf('\n', at)
    return SRC.slice(at, nl)
  }).join('\n')
  const body = [consts, lift(SRC, 'quoteVal'), lift(SRC, 'wantsNothing'), lift(SRC, 'expectedWords'),
    lift(SRC, 'actualWords'), lift(SRC, 'chipLines'), lift(SRC, 'chipLabel'), lift(SRC, 'chipHead'),
    lift(SRC, 'chipRows')].join('\n')
  // eslint-disable-next-line no-new-func
  return new Function(body + '; return { chipLines, chipLabel, chipHead, chipRows }')()
})()

const moment = (cap, claim) => ({ cap, claim, aim: { x: 0, y: 0, w: 10, h: 10 } })
const CLAIM = { expected: 'Water the office plants', got: 'Water the office plants', ok: true,
  label: 'You retyped the title — the new text, still in the box' }

test('the chip opens with the MOMENT\'S OWN LABEL — what the user just did, over the picture', () => {
  const m = moment('You retyped the title — the new text, still in the box', CLAIM)
  assert.equal(chip.chipLabel(m), 'You retyped the title — the new text, still in the box')
})

test('…whitespace-collapsed, like every other name the reader prints', () => {
  const m = moment('You double-clicked —\n  the editor opened  on the old text', CLAIM)
  assert.equal(chip.chipLabel(m), 'You double-clicked — the editor opened on the old text')
})

test('a PHASE NAME is not a moment label — a machine word never lands on a picture', () => {
  for (const cap of ['given', 'before', 'after']) {
    assert.equal(chip.chipLabel(moment(cap, CLAIM)), '', cap + ' names a phase, not a moment')
  }
  assert.equal(chip.chipLabel(moment('after — the same row reads the new text', CLAIM)), '',
    'the result frame\'s generated "after — …" caption is a phase name too')
})

test('no moment, no label — and never a thrown error on a row with nothing harvested', () => {
  assert.equal(chip.chipLabel(null), '')
  assert.equal(chip.chipLabel({}), '')
})

test('the camera reserves the label\'s own line ON TOP of the claim lines', () => {
  const m = moment('You retyped the title — the new text, still in the box', CLAIM)
  assert.equal(chip.chipLines(m, 'expected').length, 1, 'one claim, one value line')
  assert.equal(chip.chipRows(m, 'expected'), 2, 'the value line plus the label line above it')
  assert.equal(chip.chipRows(m, 'actual'), 2)
})

test('a moment with a generic caption reserves only its claim lines', () => {
  assert.equal(chip.chipRows(moment('before', CLAIM), 'expected'), 1)
})

test('a moment that claimed nothing reserves nothing — no chip is drawn at all', () => {
  assert.equal(chip.chipRows(moment('You pressed Add', null), 'expected'), 0,
    'a chip with a name and nothing to say is chrome, not a label')
})

// NEVER THE SAME WORDS TWICE. An ABSENCE speaks its own label on the EXPECTED side — that IS what
// the requirement asks for (`expectedWords`) — so on that cell the leading line and the value line
// came back identical: "active — no done task is on screen / EXPECTED active — no done task is on
// screen". "Every text once" (the human, 2026-09-02) still holds inside one chip.
const ABSENT = { expected: '(missing)', got: '(missing)', ok: true, missing: true,
  label: 'active — no done task is on screen', phrase: 'not one done row in the list' }

// …UPDATED 2026-09-07 (the human: "The actual and expected should use same copy write, otherwise
// it's not comparable"): where the author gave a PHRASE, the Expected speaks it too, so the two
// chips carry the same two lines and stand the same height. The label-only case (a harvest that
// recorded no phrase) is still where the Expected's leading line would repeat, and is still dropped.
test('with a phrase, BOTH sides carry the label line and the same value line — the same copy', () => {
  const m = moment('active — no done task is on screen', ABSENT)
  assert.equal(chip.chipHead(m, 'expected'), 'active — no done task is on screen')
  assert.equal(chip.chipLines(m, 'expected')[0].text, 'not one done row in the list')
  assert.equal(chip.chipHead(m, 'actual'), 'active — no done task is on screen')
  assert.equal(chip.chipLines(m, 'actual')[0].text, 'not one done row in the list')
  assert.equal(chip.chipRows(m, 'expected'), chip.chipRows(m, 'actual'))
})

test('an absence with NO phrase does not say its own label twice — the EXPECTED side drops the leading line', () => {
  const bare = { expected: '(missing)', got: '(missing)', ok: true, missing: true, label: 'active — no done task is on screen' }
  const m = moment('active — no done task is on screen', bare)
  assert.equal(chip.chipHead(m, 'expected'), '', 'the value line already IS the label')
  assert.equal(chip.chipRows(m, 'expected'), 1)
})
