// The home card / List renders the five FIXED buckets in order (the human 2026-09-07): an empty
// bucket is a visible hole, families nest inside, unbucketed reqs sit under their own strip. The row
// PLAN is pure and unit-tested here; the DOM is proven by the board dogfood (spec/board/test.spec.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketCardRows } from './build-board.mjs'

const rule = (id, bucket, family = null) => ({ id, title: 't' + id, kind: 'rule', bucket, family,
  status: 'passed', slots: { filled: ['happy'] }, notNeeded: {} })

test('bucketCardRows: five bucket headers in order, empty holes flagged, cards under their bucket', () => {
  const s = { reqs: [rule('R1', '①'), rule('R2', '③')], families: [], buckets: [] }
  const rows = bucketCardRows(s)
  const shape = rows.map(x =>
    x.kind === 'bucket' ? 'B:' + x.b.bucket.key + (x.b.empty ? ':empty' : '')
      : x.kind === 'req' ? x.r.id : x.kind)
  assert.deepEqual(shape, ['B:①', 'R1', 'B:②:empty', 'B:③', 'R2', 'B:④:empty', 'B:⑤:empty'])
})

test('bucketCardRows: a leading unbucketed strip when reqs precede the first bucket line', () => {
  const s = { reqs: [rule('R0', null), rule('R1', '①')], families: [], buckets: [{ key: '①', gloss: '' }] }
  const rows = bucketCardRows(s)
  assert.equal(rows[0].kind, 'unbucketed')
  assert.equal(rows[1].kind, 'req')
  assert.equal(rows[1].r.id, 'R0')
  assert.ok(rows.some(x => x.kind === 'bucket' && x.b.bucket.key === '①'))
})

test('bucketCardRows: a family nests as a sub-header inside its bucket', () => {
  const fam = { n: '1', name: 'Sub', gloss: '', heading: '1 · Sub', bucket: '①', ids: ['R2'] }
  const s = { reqs: [rule('R1', '①'), rule('R2', '①', '1')], families: [fam], buckets: [] }
  const rows = bucketCardRows(s)
  const shape = rows.filter(x => ['bucket', 'fam', 'req'].includes(x.kind)).map(x =>
    x.kind === 'bucket' ? 'B:' + x.b.bucket.key : x.kind === 'fam' ? 'F:' + x.f.name : x.r.id)
  // bucket ①, its loose R1, then family Sub with R2
  assert.deepEqual(shape.slice(0, 4), ['B:①', 'R1', 'F:Sub', 'R2'])
})
