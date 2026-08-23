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

// ── the home card's fold keeps families intact (board R17) ─────────────────────────────────────
import { familyGroups, cardRows } from './build-board.mjs'
const Q = (id, family) => ({ id, title: 't ' + id, status: 'passed', family })
test('familyGroups: loose requirements first under no family, then each family in prd order', () => {
  const s = {
    reqs: [Q('R1', null), Q('R2', '1'), Q('R3', '1'), Q('R4', '2')],
    families: [{ n: '1', name: 'A', gloss: 'g', heading: '1 · A — g', ids: ['R2', 'R3'] }, { n: '2', name: 'B', gloss: '', heading: '2 · B', ids: ['R4'] }]
  }
  assert.deepEqual(familyGroups(s).map(g => [g.family && g.family.name, g.reqs.map(r => r.id)]),
    [[null, ['R1']], ['A', ['R2', 'R3']], ['B', ['R4']]])
  assert.deepEqual(familyGroups({ reqs: [Q('R1', null)], families: [] }).map(g => [g.family, g.reqs.length]), [[null, 1]])
  assert.deepEqual(familyGroups({ reqs: [], families: [] }), [])
})
test('cardRows: no families → the first five rows and "… N more", exactly as before', () => {
  const reqs = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'].map(id => Q(id, null))
  const rows = cardRows({ reqs, families: [] })
  assert.deepEqual(rows.map(x => x.kind === 'req' ? x.r.id : x.kind + ':' + x.n), ['R1', 'R2', 'R3', 'R4', 'R5', 'more:2'])
  assert.equal(cardRows({ reqs: reqs.slice(0, 5), families: [] }).filter(x => x.kind === 'more').length, 0)
})
test('cardRows: the fold cuts only at a family boundary — a family the cap lands inside is shown whole', () => {
  const fams = [
    { n: '1', name: 'A', gloss: '', heading: '1 · A', ids: ['R1', 'R2', 'R3'] },
    { n: '2', name: 'B', gloss: '', heading: '2 · B', ids: ['R4', 'R5', 'R6'] },
    { n: '3', name: 'C', gloss: '', heading: '3 · C', ids: ['R7'] }
  ]
  const reqs = fams.flatMap(f => f.ids.map(id => Q(id, f.n)))
  const rows = cardRows({ reqs, families: fams })
  assert.deepEqual(rows.map(x => x.kind === 'req' ? x.r.id : x.kind === 'fam' ? 'fam:' + x.f.name : x.kind + ':' + x.n),
    ['fam:A', 'R1', 'R2', 'R3', 'fam:B', 'R4', 'R5', 'R6', 'more:1'])
})
