// The requirement framework's card layer (the human 2026-09-07): the fixed-five buckets, the four
// example slots, each rule card's derived state, and the screen counter. Pure — unit-tested directly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUCKETS, bucketGroups, filledSlots, cardGaps, cardState, conflictReqIds, screenCounter } from './cards.mjs'

const rule = (id, o = {}) => ({ id, kind: 'rule', bucket: o.bucket ?? null, family: o.family ?? null,
  status: o.status ?? 'passed', slots: { filled: o.filled ?? ['happy'] }, notNeeded: o.notNeeded ?? {} })

test('BUCKETS is the fixed five in order with tool-owned names', () => {
  assert.deepEqual(BUCKETS.map(b => b.key), ['①', '②', '③', '④', '⑤'])
  assert.equal(BUCKETS[0].name, "The main thing's life")
  assert.equal(BUCKETS[4].name, 'The mistake path')
})

test('bucketGroups always returns five buckets in order; an empty bucket is flagged', () => {
  const s = { reqs: [rule('R1', { bucket: '①' }), rule('R2', { bucket: '③' })], families: [], buckets: [] }
  const g = bucketGroups(s)
  assert.deepEqual(g.buckets.map(b => b.bucket.key), ['①', '②', '③', '④', '⑤'])
  assert.equal(g.buckets[0].empty, false)
  assert.equal(g.buckets[1].empty, true)   // ② has no cards
  assert.equal(g.unbucketed.has, false)
})

test('bucketGroups surfaces unbucketed reqs and a bucket-line gloss override', () => {
  const s = { reqs: [rule('R1'), rule('R2', { bucket: '①' })], families: [], buckets: [{ key: '①', gloss: 'my gloss' }] }
  const g = bucketGroups(s)
  assert.equal(g.unbucketed.has, true)
  assert.deepEqual(g.unbucketed.loose.map(r => r.id), ['R1'])
  assert.equal(g.buckets[0].bucket.gloss, 'my gloss')
})

test('bucketGroups nests a family inside its bucket, loose reqs beside it', () => {
  const fam = { n: '1', name: 'Sub', gloss: '', heading: '1 · Sub', bucket: '①', ids: ['R2'] }
  const s = { reqs: [rule('R1', { bucket: '①' }), rule('R2', { bucket: '①', family: '1' })], families: [fam], buckets: [] }
  const b0 = bucketGroups(s).buckets[0]
  assert.deepEqual(b0.loose.map(r => r.id), ['R1'])
  assert.deepEqual(b0.families.map(fg => [fg.family.name, fg.reqs.map(r => r.id)]), [['Sub', ['R2']]])
})

test('filledSlots unions beat tags with not-needed; cardGaps is the remainder', () => {
  const r = rule('R1', { filled: ['happy', 'absence'], notNeeded: { mistake: 'by design' } })
  assert.deepEqual(filledSlots(r).sort(), ['absence', 'happy', 'mistake'])
  assert.deepEqual(cardGaps(r), ['boundary'])
  assert.deepEqual(cardGaps({ ...r, kind: 'question' }), [])
})

test('conflictReqIds finds a req named as a side of an open finding on this screen', () => {
  const open = [{ a: { source: 'spec/board/prd.md · R2' }, b: { source: 'spec/init/prd.md · R2' } }]
  assert.deepEqual([...conflictReqIds(open, 'board')], ['R2'])
  assert.deepEqual([...conflictReqIds(open, 'init')], ['R2'])
  assert.deepEqual([...conflictReqIds(open, 'todo')], [])
})

test('cardState: conflict > mismatch > agreed; questions are question', () => {
  assert.equal(cardState({ id: 'Q1', kind: 'question' }, new Set()), 'question')
  assert.equal(cardState(rule('R1', { status: 'failed' }), new Set()), 'mismatch')
  assert.equal(cardState(rule('R1', { status: 'not-reached' }), new Set()), 'mismatch')
  assert.equal(cardState(rule('R1', { status: 'passed' }), new Set(['R1'])), 'conflict')  // conflict wins over agreed
  assert.equal(cardState(rule('R1', { status: 'failed' }), new Set(['R1'])), 'conflict')  // conflict wins over mismatch
  assert.equal(cardState(rule('R1', { status: 'passed' }), new Set()), 'agreed')
})

test('screenCounter counts rule cards by state and sums gap slots', () => {
  const s = { name: 'todo', reqs: [
    rule('R1', { status: 'passed', filled: ['happy'] }),                                     // agreed, 3 gaps
    rule('R2', { status: 'failed', filled: ['happy', 'boundary', 'absence', 'mistake'] }),   // mismatch, 0 gaps
    { id: 'Q1', kind: 'question' }                                                            // not counted
  ], families: [], buckets: [] }
  assert.deepEqual(screenCounter(s, []), { conflicts: 0, gaps: 3, mismatches: 1, agreed: 1 })
})
