// tools/recap-moment.test.mjs — THE TRAILING RECAP IS GONE (the human, 2026-09-06: "The last small
// step (for show the list is meaningless) for expected and actual, please remove it").
//
// Every strip used to end on the beat's RESULT moment: one photograph of the state the beat left,
// captioned with the whole Then, carrying a chip that listed every claim the beat had made — on the
// demo's R1 that was six chips piled on the Add button, moment 7 of 7. Since soft claims made every
// fact of a Then its own filmed moment (phase 6), that segment re-says what the six moments before it
// already showed, ringing whatever the beat happened to ring last. The film ends on its last fact
// moment instead.
//
// NOTHING IS DELETED FROM THE HARVEST. The after frame is still captured, still folded, still the
// base every derived state is drawn from, and `momentsOf` still counts it for the gates. This is a
// DISPLAY rule about which moments the row walks — the same shape as the 2026-08-30 rule that took
// the before frame out of a beat that films its own values.
//
// The one rule this pins, lifted out of the shipped bytes (tools/lift-client.mjs):
//   a beat FILMS ITS RESULT only when it photographed no facts of its own — there the result is the
//   only proof of what happened, and dropping it would leave the beat with nothing to show.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lift } from './lift-client.mjs'

const SRC = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
// eslint-disable-next-line no-new-func
const { showsResult } = new Function(lift(SRC, 'showsResult') + '; return { showsResult }')()

const val = n => Array.from({ length: n }, (_, k) => ({ frame: 'f' + k }))

test('a beat that photographed its facts ENDS ON THE LAST OF THEM — no recap segment', () => {
  assert.equal(showsResult({ after: 'after.png' }, val(6)), false,
    'R1 filmed six facts; a seventh moment re-listing all six is the segment the human removed')
  assert.equal(showsResult({ after: 'after.png' }, val(1)), false,
    'even one filmed fact is the beat\'s ending — the recap would say it twice')
})

test('a beat that photographed NOTHING still shows its result — it is the only proof it has', () => {
  assert.equal(showsResult({ after: 'after.png' }, []), true)
})

test('…and a beat whose run never landed an after frame shows none — nothing is invented', () => {
  assert.equal(showsResult({ after: '' }, []), false)
  assert.equal(showsResult(null, []), false)
  assert.equal(showsResult({}, undefined), false)
})
