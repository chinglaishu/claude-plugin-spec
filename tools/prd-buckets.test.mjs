// The requirement framework's prd GRAMMAR (the human 2026-09-07): bucket lines, question cards, slot
// tags, source stamps and not-needed lines — all parsed additively so a prd with no bucket lines
// still parses byte-for-byte as before (tools/prd-families.test.mjs proves that half).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBehavior, stripSlotTags } from './behavior.mjs'
import { parsePrd } from './spec-store.mjs'

// ── slot tags on a When line ───────────────────────────────────────────────────────────────────
test('stripSlotTags removes only a trailing run of slot tokens', () => {
  assert.equal(stripSlotTags('press Add {happy}'), 'press Add')
  assert.equal(stripSlotTags('type nothing {boundary} {mistake}'), 'type nothing')
  assert.equal(stripSlotTags('a {curly} phrase mid-sentence'), 'a {curly} phrase mid-sentence')
  assert.equal(stripSlotTags('no tags here'), 'no tags here')
})

test('parseBehavior carries each beat\'s slot tags and keeps them out of the sentence', () => {
  const body = [
    '- **Given** a list',
    '- **When** you press Add {happy}',
    '- **Then** a row appears',
    '- **When** you press Add empty {boundary} {mistake}',
    '- **Then** nothing is added'
  ].join('\n')
  const b = parseBehavior(body)
  assert.equal(b.beats[0].when, 'you press Add')
  assert.deepEqual(b.beats[0].slots, ['happy'])
  assert.equal(b.beats[1].when, 'you press Add empty')
  assert.deepEqual(b.beats[1].slots, ['boundary', 'mistake'])
})

// ── buckets, questions, sources, not-needed in parsePrd ────────────────────────────────────────
const BUCKET = k => `### ${k} bucket gloss here\n`
const R = (id, body) => `## ${id} — title ${id}\n\n${body}\n`

test('a ### line starting with a bucket symbol is a bucket, not a family', () => {
  const text = BUCKET('①') + R('R1', 'body') + '\n### 1 · Fam — g\n' + R('R2', 'body2')
  const { reqs, families, buckets } = parsePrd(text)
  assert.deepEqual(buckets, [{ key: '①', gloss: 'bucket gloss here' }])
  assert.equal(reqs.find(r => r.id === 'R1').bucket, '①')
  assert.equal(reqs.find(r => r.id === 'R2').bucket, '①')       // family under the bucket
  assert.deepEqual(families.map(f => [f.name, f.bucket]), [['Fam', '①']])
})

test('a family line before any bucket is unbucketed (bucket null)', () => {
  const { reqs, families } = parsePrd('### 1 · Fam — g\n' + R('R1', 'x'))
  assert.equal(families[0].bucket, null)
  assert.equal(reqs[0].bucket, null)
})

test('## Q<n> is a question card, parsed like a req but kind=question', () => {
  const text = BUCKET('⑤') + R('R1', 'x') + '\n## Q1 — Is delete reversible?\n\n- **Ask** is this a requirement?\n'
  const { reqs } = parsePrd(text)
  const q = reqs.find(r => r.id === 'Q1')
  assert.equal(q.kind, 'question')
  assert.equal(q.bucket, '⑤')
  assert.equal(reqs.find(r => r.id === 'R1').kind, 'rule')
})

test('**Sources** and **Not needed** lines are read into authored stamps/slots', () => {
  const body = [
    '- **Given** g', '- **When** w {happy}', '- **Then** t',
    '- **Sources** doc: app/requirements.html · R1 — code: todo.html addTask()',
    '- **Not needed** mistake — an add cannot be undone here by design'
  ].join('\n')
  const { reqs } = parsePrd(R('R1', body))
  const r = reqs[0]
  assert.equal(r.sources.doc, 'app/requirements.html · R1')
  assert.equal(r.sources.code, 'todo.html addTask()')
  assert.equal(r.notNeeded.mistake, 'an add cannot be undone here by design')
  assert.deepEqual(r.slots.filled, ['happy'])
})
