// tools/absence-words.test.mjs — AN ABSENCE IS SAID IN THE CLAIM'S OWN WORDS (the human, 2026-09-06).
//
// "The 'nothing there' is weird" — said of the demo's R1 moment 3, whose chips read
// EXPECTED “nothing here — this element must be absent” · ACTUAL “✓ nothing was there” for a claim
// whose own name was "The new row's checkbox — empty, nothing ticked". One generic sentence stood in
// for every absence on the board, so the one thing a reader wanted to know — WHAT was not there —
// was the one thing the chip did not say, while the words for it were already recorded beside the
// moment.
//
// The rule these pin:
//   • the EXPECTED side speaks the claim's own LABEL (the requirement's words for this moment),
//   • the ACTUAL side speaks the author's short PHRASE for what the emptiness looks like ("empty"),
//   • and the two generic sentences remain, as the FALLBACK for a harvest that carries neither —
//     never removed, because an old harvest has no label to speak with.
// A FAILED absence is unchanged: the app did show something, and a wrong value is quoted like any
// other wrong value.
//
// …and an EMPTY VALUE reads as an absence too (same ruling, R1's new fact: "the Add box is empty
// again"). An input's value is readable and its emptiness is a real fact, but `EXPECTED “”` is the
// same jargon in a different costume — so a claim whose expected and got are both empty is worded
// like the absence it is.
//
// Lifted out of the shipped bytes (tools/lift-client.mjs), never restated: the board is the only
// place these strings exist and a second copy here would be free to drift from it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lift } from './lift-client.mjs'

const SRC = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
const words = (() => {
  const consts = ['NOTHING', 'MUST_BE_ABSENT', 'WAS_ABSENT'].map(n => {
    const at = SRC.indexOf('const ' + n + ' = ')
    assert.ok(at >= 0, 'no const ' + n + ' in client.js — the absence wording moved')
    const nl = SRC.indexOf('\n', at)
    return SRC.slice(at, nl)
  }).join('\n')
  const body = [consts, lift(SRC, 'quoteVal'), lift(SRC, 'wantsNothing'),
    lift(SRC, 'expectedWords'), lift(SRC, 'actualWords')].join('\n')
  // eslint-disable-next-line no-new-func
  return new Function(body + '; return { NOTHING, MUST_BE_ABSENT, WAS_ABSENT, wantsNothing, expectedWords, actualWords }')()
})()

const NOTHING = words.NOTHING

test('an absence names ITSELF on the Expected side — the claim\'s own label when it has no phrase, not one generic sentence', () => {
  const c = { expected: NOTHING, got: NOTHING, ok: true, missing: true,
    label: 'The new row\'s checkbox — empty, nothing ticked' }
  assert.equal(words.expectedWords(c), 'The new row\'s checkbox — empty, nothing ticked')
  assert.notEqual(words.expectedWords(c), words.MUST_BE_ABSENT,
    'the generic sentence is the fallback, never what a named claim shows')
})

// THE TWO SIDES SAY THE SAME WORDS (the human, 2026-09-07: "The actual and expected should use same
// copy write, otherwise it's not comparable"). Until then the Expected spoke the claim's LABEL and
// the Actual the author's PHRASE — "EXPECTED The new row's checkbox — empty, nothing ticked" beside
// "ACTUAL ✓ empty" — two sentences for one fact, and two chips of different heights landing in
// different places. Where the author gave a phrase, BOTH sides speak it. (Rule 4: the test above
// used to pin the label on a claim that carried a phrase; the human decided that away.)
test('…and where the author gave a phrase, BOTH sides speak it — the same copy, comparable', () => {
  const c = { expected: NOTHING, got: NOTHING, ok: true, missing: true,
    label: 'The new row\'s checkbox — empty, nothing ticked', phrase: 'empty' }
  assert.equal(words.expectedWords(c), 'empty')
  assert.equal(words.actualWords(c), 'empty')
})

test('the two generic sentences remain — an old harvest carries no label and no phrase', () => {
  const bare = { expected: NOTHING, got: NOTHING, ok: true, missing: true }
  assert.equal(words.expectedWords(bare), words.MUST_BE_ABSENT)
  assert.equal(words.actualWords(bare), words.WAS_ABSENT)
})

test('a FAILED absence is quoted like any other wrong value — the app DID show something', () => {
  const c = { expected: NOTHING, got: 'checked', ok: false, label: 'The new row\'s checkbox — empty', phrase: 'empty' }
  assert.equal(words.actualWords(c), '“checked”', 'what the app showed, verbatim')
  assert.equal(words.expectedWords(c), 'empty',
    'the requirement still says what it asked for — the same word the passing side would show')
})

test('an ordinary value is untouched — the label never replaces the value a Then names', () => {
  const c = { expected: 'added just now', got: 'added just now', ok: true, label: 'The new row\'s stamp' }
  assert.equal(words.expectedWords(c), '“added just now”')
  assert.equal(words.actualWords(c), '“added just now”')
})

test('an EMPTY value reads as the absence it is — never EXPECTED “”', () => {
  const c = { expected: '', got: '', ok: true, label: 'The Add box — empty again', phrase: 'empty' }
  assert.equal(words.wantsNothing(c), true, 'nothing expected and nothing read is an absence')
  assert.equal(words.expectedWords(c), 'empty')
  assert.equal(words.actualWords(c), 'empty')
})

test('an empty EXPECTED against a value the app DID show is a failure, quoted', () => {
  const c = { expected: '', got: 'Water the plants', ok: false, label: 'The Add box — empty again', phrase: 'empty' }
  assert.equal(words.wantsNothing(c), false, 'the app showed something — this is not an absence')
  assert.equal(words.actualWords(c), '“Water the plants”')
})
