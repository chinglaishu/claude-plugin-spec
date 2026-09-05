// tools/store-paths.test.mjs — spec-store reads THE STORE (the data home, 2026-09-05/06), never a
// committed file. The fold, the run log and the raw report are rows in `~/.specboard/<projectId>/`
// and every picture is a src with two shapes (`blob/<sha>.<ext>` or an https url).
//
// The module resolves its data home at IMPORT, so each test imports it fresh under its own
// SPECBOARD_HOME (the `?home=` query is only a module-cache buster).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

const box = () => mkdtempSync(join(tmpdir(), 'kgsp-'))
const fresh = async home => {
  process.env.SPECBOARD_HOME = home
  return import('./spec-store.mjs?home=' + encodeURIComponent(home))
}

test('the data home is where everything derived lives — nothing under spec/ any more', async () => {
  const home = box()
  const s = await fresh(home)
  assert.equal(s.DATA_HOME.startsWith(home + sep), true)
  assert.equal(s.RUNDIR, join(s.DATA_HOME, 'runs'))
  assert.equal(s.DATA_HOME.includes(`${sep}spec${sep}`), false)
  // the file constants are GONE with the files they named (the fold is rows now)
  assert.equal(s.RESULTS_INDEX, undefined)
  assert.equal(s.RUNS, undefined)
})

test('resolveRel: a blob to the blob dir, a repo path under ROOT, nothing that escapes, and a cloud src is not a file', async () => {
  const s = await fresh(box())
  const b = 'blob/' + 'c'.repeat(64) + '.png'
  assert.equal(s.resolveRel(b), join(s.DATA_HOME, 'blobs', 'c'.repeat(64) + '.png'))
  assert.equal(s.resolveRel('spec/board/prd.md'), join(s.ROOT, 'spec', 'board', 'prd.md'))
  assert.equal(s.resolveRel('../etc/passwd'), null)
  assert.equal(s.resolveRel('/etc/passwd'), null)
  // the cloud shape names bytes in a bucket, not a file on this disk: it has no path, and the one
  // door for its bytes is readSrc (the store's own get), never a path this could invent
  assert.equal(s.resolveRel('https://cdn.example.com/' + 'd'.repeat(64) + '.html'), null)
})

test('readSrc reads either shape — a blob off the disk, and refuses to invent bytes for a src that is gone', async () => {
  const home = box()
  const s = await fresh(home)
  const { putBlob } = await import('./store.mjs')
  const src = await putBlob(s.DATA_HOME, Buffer.from('<div>hi</div>'), 'html')
  assert.equal((await s.readSrc(src)).toString(), '<div>hi</div>')
  assert.equal(s.readSrcSync(src).toString(), '<div>hi</div>')
  assert.equal(s.readSrcSync('blob/' + '0'.repeat(64) + '.html'), null)
  assert.equal(await s.readSrc('blob/' + '0'.repeat(64) + '.html'), null)
})

test('momentsOf lists every moment triple of an entry, values included, the before moment from base when there is one', async () => {
  const s = await fresh(box())
  const e = { beats: [{ n: 1, before: 'b', after: 'a', layoutBefore: 'lb', layoutAfter: 'la', replicaExpectedBefore: 'rb', replicaExpectedAfter: 'ra', values: [{ k: 1, frame: 'f', layout: 'l', replicaExpected: 'r' }] }] }
  assert.deepEqual(s.momentsOf(e), [
    { phase: 'before', frame: 'b', layout: 'lb', replica: 'rb', kind: 'moment' },
    { phase: 'value', frame: 'f', layout: 'l', replica: 'r', kind: 'moment' },
    { phase: 'after', frame: 'a', layout: 'la', replica: 'ra', kind: 'moment' }
  ])
  const base = 'blob/' + 'e'.repeat(64) + '.html'
  const withBase = { beats: [{ n: 1, before: 'b', layoutBefore: 'lb', base, values: [] }] }
  assert.deepEqual(s.momentsOf(withBase)[0], { phase: 'before', frame: 'b', layout: 'lb', replica: base, kind: 'base' })
  assert.deepEqual(s.momentsOf(null), [])
})

// C2 (the human, 2026-09-06): evidence is keyed by the covering TEST, so a flow that proves another
// screen's requirement is a SECOND ROW, never a replacement. What a reader wants is still one
// picture per requirement — so the rows are merged with the requirement's HOME screen's own test
// headlining, and every covering test named beneath.
test('mergeEvidenceRows: the home screen’s own test headlines, a foreign flow fills only what it left empty, and both are named', async () => {
  const s = await fresh(box())
  const home = { testFile: 'spec/board/test.spec.ts', testTitle: 'the board', runId: '2', at: 'b', entry: { before: 'H', beats: [{ n: 1, before: 'h1' }] } }
  const flow = { testFile: 'spec/init/test.spec.ts', testTitle: 'the init flow', runId: '1', at: 'a', entry: { before: 'F', beats: [{ n: 1, before: 'f1' }, { n: 2, before: 'f2' }] } }
  const merged = s.mergeEvidenceRows([flow, home], 'board')
  assert.equal(merged.before, 'H', 'the home screen’s own test is the headline')
  assert.equal(merged.beats[0].before, 'h1')
  assert.equal(merged.beats[1].before, 'f2', 'a beat the home file never harvested is filled by a covering flow')
  assert.deepEqual(merged.sources.map(x => x.testFile), ['spec/board/test.spec.ts', 'spec/init/test.spec.ts'])
  // with no home-screen row at all, the single covering test IS the picture
  const only = s.mergeEvidenceRows([flow], 'board')
  assert.equal(only.before, 'F')
  assert.deepEqual(only.sources.map(x => x.testFile), ['spec/init/test.spec.ts'])
  assert.equal(s.mergeEvidenceRows([], 'board'), null)
})

test('readResults materialises the index the board reads out of the store’s rows', async () => {
  const home = box()
  const s = await fresh(home)
  const { openStore } = await import('./store.mjs')
  const store = await openStore({ root: s.ROOT, home: s.DATA_HOME })
  await store.putScreen('board', { total: 1, failed: 0, ranAt: 7, srcHashes: { board: 'h' }, provenHashes: { R1: 'p' }, tests: [{ title: 't', ok: true, ms: 5, reqs: { 'board:R1': 'pass' } }] })
  await store.putEvidence({ testFile: 'spec/board/test.spec.ts', screen: 'board', reqId: 'R1', testTitle: 't', runId: '9', at: 'now', entry: { before: 'blob/' + 'a'.repeat(64) + '.png', beats: [] } })
  await store.putRun({ runId: '9', at: 'now', screen: 'board', ms: 1, total: 1, failed: 0, ok: true })
  await store.close()
  const idx = s.readResults()
  assert.equal(idx.board.total, 1)
  assert.equal(idx.board.ranAt, 7)
  assert.deepEqual(idx.board.srcHashes, { board: 'h' })
  assert.deepEqual(idx.board.provenHashes, { R1: 'p' })
  assert.equal(idx.board.tests[0].reqs['board:R1'], 'pass')
  assert.equal(idx.board.evidence.R1.before, 'blob/' + 'a'.repeat(64) + '.png')
  assert.equal(idx.board.evidence.R1.runId, '9')
  assert.equal(s.readRuns()[0].runId, '9')
})

test('a data home with no store yet reads as an empty board, not a crash', async () => {
  const s = await fresh(box())
  assert.deepEqual(s.readResults(), {})
  assert.deepEqual(s.readRuns(), [])
})
