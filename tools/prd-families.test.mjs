// Requirement FAMILIES (board R17, the human 2026-08-23): a `### <n> · <family> — <gloss>` line
// between `## Rn` sections opens a family that owns every following requirement until the next
// `###`. Pure parser facts, proven without a board:
//   - a `###` line is NEVER part of a requirement body (a trailing one once moved 9 hashes);
//   - families parse in order with their ids; requirements before the first heading sit under null;
//   - a prd with no headings parses byte-identically to before — no families, same bodies.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePrd } from './spec-store.mjs'
import { meaningText, reqHash } from './reqhash.mjs'

const R = (id, body) => `## ${id} — title ${id}\n\n${body}\n`
const fam = (n, name, gloss) => `### ${n} · ${name} — ${gloss}\n`

test('a trailing ### family line is never absorbed into the previous body (hash unchanged)', () => {
  const plain = R('R1', 'body one') + '\n' + R('R2', 'body two')
  const withFam = R('R1', 'body one') + '\n' + fam(2, 'Second', 'the rest') + '\n' + R('R2', 'body two')
  const a = parsePrd(plain).reqs, b = parsePrd(withFam).reqs
  assert.equal(a.length, 2); assert.equal(b.length, 2)
  assert.equal(b[0].body, 'body one', 'R1 body must not carry the ### line')
  assert.equal(reqHash(meaningText(a[0].body)), reqHash(meaningText(b[0].body)))
  assert.equal(reqHash(meaningText(a[1].body)), reqHash(meaningText(b[1].body)))
})

test('families parse in prd order, each owning the ids that follow it until the next ###', () => {
  const text = R('R1', 'a') + '\n' + fam(1, 'Shape', 'one page') + '\n' + R('R2', 'b') + '\n' + R('R5', 'c') +
    '\n' + fam(2, 'Proof', 'two ends') + '\n' + R('R3', 'd')
  const { reqs, families } = parsePrd(text)
  assert.deepEqual(families.map(f => ({ n: f.n, name: f.name, gloss: f.gloss, ids: f.ids })), [
    { n: '1', name: 'Shape', gloss: 'one page', ids: ['R2', 'R5'] },
    { n: '2', name: 'Proof', gloss: 'two ends', ids: ['R3'] }
  ])
  assert.deepEqual(reqs.map(r => [r.id, r.family]), [['R1', null], ['R2', '1'], ['R5', '1'], ['R3', '2']])
  assert.equal(families[0].heading, '1 · Shape — one page', 'the heading text is kept verbatim')
})

test('a heading without a gloss or number still opens a family', () => {
  const { families } = parsePrd('### Bare\n\n' + R('R1', 'x'))
  assert.equal(families.length, 1)
  assert.equal(families[0].name, 'Bare'); assert.equal(families[0].n, null); assert.equal(families[0].gloss, '')
  assert.deepEqual(families[0].ids, ['R1'])
})

test('a prd with no ### headings parses exactly as before — no families, bodies untouched', () => {
  const text = '---\nscreen: x\n---\n' + R('R1', 'first\n\n- **Given** g\n- **When** w\n- **Then** t\n\nprose') + '\n' + R('R2', 'second')
  const out = parsePrd(text)
  assert.deepEqual(out.families, [])
  assert.deepEqual(out.reqs.map(r => r.family), [null, null])
  assert.deepEqual(out.reqs.map(r => ({ id: r.id, title: r.title, body: r.body })), [
    { id: 'R1', title: 'title R1', body: 'first\n\n- **Given** g\n- **When** w\n- **Then** t\n\nprose' },
    { id: 'R2', title: 'title R2', body: 'second' }
  ])
})
