// THE PROVED PHRASE — the words half of design C (the human, 2026-09-02/03: "every text once").
// A beat's sentence is written once, in the row's words cell; the moment being walked underlines
// the PART of it the current claim proves, so a reader's eye is taken to the phrase rather than
// being handed a second copy of it in a chip. The rule is pure and lives in tools/board/words.js
// (registered on globalThis.SBWords, inlined verbatim into board.html exactly like stepper.js), so
// the board runs THESE bytes and node --test can reach them.
//
// The rule, in order: the claim's own `expected` where it occurs in the sentence; else the longest
// run of 3+ words of the claim's LABEL that occurs there; else nothing — never a guessed phrase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../tools/board/words.js'

const { provedPhrase } = globalThis.SBWords
const cut = (t, r) => (r ? t.slice(r[0], r[1]) : null)

test('the claim’s expected value, where the sentence says it', () => {
  const t = 'it states that version’s track as a plain word — Draft for an editable draft'
  const r = provedPhrase(t, { expected: 'Draft', got: 'Draft', ok: true })
  assert.deepEqual(cut(t, r), 'Draft')
  assert.equal(t.slice(0, r[0]).includes('Draft'), false)   // the FIRST occurrence, at a word edge
})

test('a value that only appears inside a longer word is not a match', () => {
  const t = 'the picker states the version’s track beside its month'
  assert.equal(provedPhrase(t, { expected: 'ick', got: 'ick', ok: true }), null)
})

test('case-insensitive, but the range is the sentence’s own characters', () => {
  const t = 'the row reads Published for the live baseline'
  const r = provedPhrase(t, { expected: 'published', got: 'Draft', ok: false })
  assert.deepEqual(cut(t, r), 'Published')
})

test('no expected in the sentence → the label’s longest 3+-word run', () => {
  const t = 'it states that version’s track as a plain word beside the version’s month'
  const r = provedPhrase(t, { expected: 'Draft', got: 'Draft', ok: true, label: 'the version states its track as a plain word' })
  assert.deepEqual(cut(t, r), 'track as a plain word')
})

test('a label that shares only two words with the sentence underlines nothing', () => {
  const t = 'the picker states the version’s track beside its month'
  assert.equal(provedPhrase(t, { expected: 'Draft', got: 'Draft', ok: true, label: 'the picker names a month' }), null)
})

test('no claim, no text, an empty expected — nothing, never a guess', () => {
  assert.equal(provedPhrase('some words here', null), null)
  assert.equal(provedPhrase('', { expected: 'x' }), null)
  assert.equal(provedPhrase('some words here', { expected: '   ' }), null)
  assert.equal(provedPhrase('some words here', { expected: 'a' }), null)   // one character is noise
})

test('a (missing) got still underlines what was EXPECTED — the sentence is the truth', () => {
  const t = 'an Undo link appears beside the row'
  const r = provedPhrase(t, { expected: 'Undo', got: '', ok: false, missing: true })
  assert.deepEqual(cut(t, r), 'Undo')
})

test('regex metacharacters in a value are matched literally', () => {
  const t = 'the total reads $1,024.00 (net) after the change'
  const r = provedPhrase(t, { expected: '$1,024.00 (net)', got: '$0.00', ok: false })
  assert.deepEqual(cut(t, r), '$1,024.00 (net)')
})
