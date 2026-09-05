// tools/store.test.mjs — THE DATA HOME and THE STORE (the human, 2026-09-05: "we only store things in
// codebase if it's necessary, otherwise find a way to store somewhere else"; the final shape, 2026-09-06:
// "like Langfuse hosted locally" + "test records into local db / remote db — team = remote db url +
// cloud blob url"). Derived data lives in ~/.specboard/<projectId>/ — rows in a db behind the
// sqlite/pg switch, bytes behind the fs/s3 switch — and every door into it is ASYNC from day one, so
// the pg driver fits later with no signature change. Nothing here writes inside a repository.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  dataHomeRoot, projectId, dataHome, blobName, isBlobRel, isBlobSrc, blobPath,
  putBlob, getBlob, removeBlob, listBlobs, openStore, SCHEMA_VERSION
} from './store.mjs'

const box = () => mkdtempSync(join(tmpdir(), 'kgstore-'))
const sha = b => createHash('sha256').update(b).digest('hex')

test('the data home root is SPECBOARD_HOME, else ~/.specboard', () => {
  assert.equal(dataHomeRoot({ SPECBOARD_HOME: '/x/y' }, '/home/u'), '/x/y')
  assert.equal(dataHomeRoot({}, '/home/u'), join('/home/u', '.specboard'))
})

test('a manifest projectId names the project; without one the id is basename + a path hash', () => {
  assert.equal(projectId('/a/b/app', { projectId: 'tsumiki-3f9a1c' }), 'tsumiki-3f9a1c')
  assert.equal(projectId('/a/b/app', { id: 'tsumiki-3f9a1c' }), 'tsumiki-3f9a1c')   // the earlier field name
  const fallback = projectId('/a/b/app', null)
  assert.match(fallback, /^app-[0-9a-f]{8}$/)
  assert.equal(fallback, projectId('/a/b/app', { projectId: 'Not Valid!' }))   // an invalid id is no id
  assert.notEqual(fallback, projectId('/a/c/app', null))                       // a different checkout, a different home
})

test('dataHome is root + projectId', () => {
  assert.equal(dataHome('/a/app', { projectId: 'p1' }, { SPECBOARD_HOME: '/h' }, '/u'), join('/h', 'p1'))
})

test('a blob is named by its sha256 and its extension; a src is a blob rel OR a url', () => {
  const b = Buffer.from('hello')
  assert.equal(blobName(b, 'png'), `${sha(b)}.png`)
  assert.equal(blobName(b, '.HTML'), `${sha(b)}.html`)
  assert.equal(isBlobRel('blob/' + sha(b) + '.png'), true)
  assert.equal(isBlobRel('spec/board/evidence/R1.b1.before.png'), false)
  assert.equal(isBlobRel('blob/../etc/passwd'), false)
  assert.equal(isBlobSrc('blob/' + sha(b) + '.png'), true)
  assert.equal(isBlobSrc('https://media.example.com/' + sha(b) + '.png'), true)
  assert.equal(isBlobSrc('http://media.example.com/x.png'), false)   // only https is a src
  assert.equal(isBlobSrc('spec/board/evidence/R1.png'), false)
})

test('putBlob writes once, returns the rel, and getBlob reads it back — and the doors are async', async () => {
  const home = box()
  const b = Buffer.from('frame bytes')
  const p = putBlob(home, b, 'png')
  assert.ok(p instanceof Promise, 'putBlob is async from day one')
  const rel = await p
  assert.equal(rel, 'blob/' + sha(b) + '.png')
  const abs = blobPath(home, rel)
  assert.equal(abs, join(home, 'blobs', sha(b) + '.png'))
  assert.equal(readFileSync(abs).toString(), 'frame bytes')
  assert.equal((await getBlob(home, rel)).toString(), 'frame bytes')
  const m1 = statSync(abs).mtimeMs
  assert.equal(await putBlob(home, b, 'png'), rel)      // the same bytes are the same blob
  assert.equal(statSync(abs).mtimeMs, m1)               // …and are not rewritten
  assert.equal(blobPath(home, 'spec/x/y.png'), null)    // a repo path is not a blob
  assert.deepEqual(await listBlobs(home), [rel])
  assert.equal(await removeBlob(home, rel), true)
  assert.equal(existsSync(abs), false)
})

test('a cloud mode with no credentials throws loudly — never a silent local fallback', async () => {
  const home = box()
  await assert.rejects(
    () => putBlob(home, Buffer.from('x'), 'png', { media: 'cloud', bucket: { endpoint: 'https://s3.example.com', name: 'b' }, env: {} }),
    /SPECBOARD_S3_KEY/
  )
  await assert.rejects(
    () => openStore({ root: '/a/app', home, manifest: { projectId: 'p1', db: 'remote' }, env: {} }),
    /SPECBOARD_DB_URL/
  )
})

test('the store keeps a screen fold — its counts, its source pins, its tests and their coverage', async () => {
  const home = box()
  const store = await openStore({ root: '/a/app', home, manifest: { projectId: 'p1' }, env: {} })
  assert.equal(store.dbDriver, 'sqlite')
  assert.equal(store.blobDriver, 'fs')
  assert.equal(existsSync(join(home, 'board.db')), true)
  assert.equal(await store.getMeta('schemaVersion'), String(SCHEMA_VERSION))
  await store.putScreen('board', {
    total: 2, failed: 1, ranAt: 1700, srcHashes: { board: 'aaa' }, provenHashes: { R1: 'bbb' },
    tests: [
      { title: 'Home lists every screen as a card', file: 'spec/board/test.spec.ts', ok: true, ms: 2935, error: null, line: 39, reqs: { 'board:R1': 'pass' } },
      { title: 'A flow across screens', file: 'spec/init/test.spec.ts', ok: false, ms: 12, error: 'boom', line: 7, reqs: { 'board:R1': 'fail', 'init:R2': 'not-reached' } }
    ]
  })
  const got = await store.getScreen('board')
  assert.equal(got.total, 2)
  assert.equal(got.failed, 1)
  assert.equal(got.ranAt, 1700)
  assert.deepEqual(got.srcHashes, { board: 'aaa' })
  assert.deepEqual(got.provenHashes, { R1: 'bbb' })
  assert.equal(got.tests.length, 2)
  assert.deepEqual(got.tests[0].reqs, { 'board:R1': 'pass' })
  assert.equal(got.tests[1].error, 'boom')
  assert.deepEqual(await store.listScreens(), ['board'])
  // a re-fold of the same screen REPLACES that screen's tests, and touches no other screen
  await store.putScreen('init', { total: 1, failed: 0, ranAt: 1800, tests: [{ title: 't', file: 'spec/init/test.spec.ts', ok: true, ms: 1, error: null, line: 2, reqs: {} }] })
  await store.putScreen('board', { total: 1, failed: 0, ranAt: 1900, tests: [{ title: 'only me', file: 'spec/board/test.spec.ts', ok: true, ms: 1, error: null, line: 2, reqs: { 'board:R1': 'pass' } }] })
  assert.deepEqual((await store.getScreen('board')).tests.map(t => t.title), ['only me'])
  assert.equal((await store.getScreen('init')).total, 1)
  assert.equal(await store.getScreen('nope'), null)
  await store.close()
})

test('evidence is keyed by the covering TEST (C2), so a flow can never overwrite the home screen\'s harvest', async () => {
  const home = box()
  const store = await openStore({ root: '/a/app', home, manifest: { projectId: 'p1' }, env: {} })
  const png = await store.putBlob(Buffer.from('home frame'), 'png')
  const png2 = await store.putBlob(Buffer.from('flow frame'), 'png')
  await store.putEvidence({ testFile: 'spec/board/test.spec.ts', screen: 'board', reqId: 'R1', testTitle: 'Home lists every screen', runId: '77', at: '2026-09-05T00:00:00.000Z', entry: { beats: [{ n: 1, before: png, values: [] }] } })
  await store.putEvidence({ testFile: 'spec/init/test.spec.ts', screen: 'board', reqId: 'R1', testTitle: 'the init flow', runId: '78', at: '2026-09-05T01:00:00.000Z', entry: { beats: [{ n: 1, before: png2, values: [] }] } })
  const mine = await store.getEvidence({ testFile: 'spec/board/test.spec.ts', screen: 'board', reqId: 'R1' })
  assert.equal(mine.entry.beats[0].before, png, 'the home screen\'s own harvest is untouched by the flow')
  assert.equal(mine.runId, '77')
  const both = await store.listEvidence({ screen: 'board', reqId: 'R1' })
  assert.deepEqual(both.map(r => r.testFile).sort(), ['spec/board/test.spec.ts', 'spec/init/test.spec.ts'])
  assert.deepEqual((await store.listEvidence({ testFile: 'spec/init/test.spec.ts' })).map(r => r.reqId), ['R1'])
  // a re-harvest by the SAME test replaces its own row
  await store.putEvidence({ testFile: 'spec/board/test.spec.ts', screen: 'board', reqId: 'R1', runId: '79', at: 'z', entry: { beats: [] } })
  assert.equal((await store.listEvidence({ screen: 'board', reqId: 'R1' })).length, 2)
  assert.equal((await store.getEvidence({ testFile: 'spec/board/test.spec.ts', screen: 'board', reqId: 'R1' })).runId, '79')
  assert.equal(await store.deleteEvidence({ testFile: 'spec/init/test.spec.ts', screen: 'board', reqId: 'R1' }), true)
  assert.equal((await store.listEvidence({ screen: 'board', reqId: 'R1' })).length, 1)
  await store.close()
})

test('the store keeps run records and the raw report, newest run first', async () => {
  const home = box()
  const store = await openStore({ root: '/a/app', home, manifest: { projectId: 'p1' }, env: {} })
  await store.putRun({ runId: '77', at: '2026-09-05T00:00:00.000Z', screen: 'all', ms: 10, total: 2, failed: 0, ok: true, shotsByTest: { t: { shots: [], video: null } } })
  await store.putRun({ runId: '78', at: '2026-09-05T02:00:00.000Z', screen: 'board', ms: 20, total: 1, failed: 1, ok: false, shotsByTest: {} })
  const runs = await store.listRuns()
  assert.deepEqual(runs.map(r => r.runId), ['78', '77'])
  assert.equal(runs[0].ok, false)
  assert.deepEqual((await store.getRun('77')).shotsByTest.t.shots, [])
  assert.deepEqual((await store.listRuns({ limit: 1 })).map(r => r.runId), ['78'])
  await store.putReport('78', { suites: [{ title: 'x' }] }, '2026-09-05T02:00:00.000Z')
  assert.deepEqual((await store.getReport('78')).suites[0].title, 'x')
  assert.equal(await store.getReport('nope'), null)
  assert.equal(await store.deleteRun('77'), true)
  assert.deepEqual((await store.listRuns()).map(r => r.runId), ['78'])
  await store.close()
})

// ─── T2: gc by reference ────────────────────────────────────────────────────────────────────────
import { referencedBlobs, gcBlobs } from './store.mjs'

test('referencedBlobs collects every src anywhere in the records — both shapes, nothing else', () => {
  const b1 = 'blob/' + 'a'.repeat(64) + '.png'
  const b2 = 'blob/' + 'b'.repeat(64) + '.html'
  const b3 = 'https://media.example.com/' + 'c'.repeat(64) + '.webm'
  const index = { board: { evidence: { R1: { before: b1, beats: [{ n: 1, values: [{ frame: b2, layout: 'spec/x.json' }] }] } } } }
  const runs = [{ runId: '1', shotsByTest: { t: { video: b3, shots: [b1], log: 'opened https://localhost:4199/#/board' } } }]
  assert.deepEqual([...referencedBlobs(index, runs)].sort(), [b1, b2, b3].sort())
  assert.deepEqual([...referencedBlobs(null, undefined, 'blob/short.png')], [])
  // a url that is not content-addressed is somebody else's url, not our blob — a font's cdn source,
  // a page the log mentions. Only a <sha256>.<ext> name is a src, in either shape.
  assert.equal(isBlobSrc('https://cdn.example.com/fonts/inter.woff2'), false)
  assert.deepEqual([...referencedBlobs({ fonts: [{ url: 'https://cdn.example.com/fonts/inter.woff2' }] })], [])
})

test('gcBlobs deletes what nothing names and keeps the rest', async () => {
  const home = box()
  const keep = await putBlob(home, Buffer.from('keep me'), 'png')
  const drop = await putBlob(home, Buffer.from('drop me'), 'png')
  assert.deepEqual(await gcBlobs(home, new Set([keep])), { deleted: 1, kept: 1 })
  assert.equal(existsSync(blobPath(home, keep)), true)
  assert.equal(existsSync(blobPath(home, drop)), false)
  assert.deepEqual(await gcBlobs(box(), new Set()), { deleted: 0, kept: 0 })   // no blobs dir yet: nothing to do
})

test('a blob two records name survives the pruning of one of them; an orphan does not', async () => {
  const home = box()
  const store = await openStore({ root: '/a/app', home, manifest: { projectId: 'p1' }, env: {} })
  const shared = await store.putBlob(Buffer.from('the shared base'), 'html')
  const onlyMine = await store.putBlob(Buffer.from('the flow frame'), 'png')
  const orphan = await store.putBlob(Buffer.from('nothing names me'), 'png')
  await store.putEvidence({ testFile: 'spec/board/test.spec.ts', screen: 'board', reqId: 'R1', entry: { beats: [{ n: 1, base: shared, values: [] }] } })
  await store.putEvidence({ testFile: 'spec/init/test.spec.ts', screen: 'board', reqId: 'R1', entry: { beats: [{ n: 1, base: shared, before: onlyMine, values: [] }] } })
  await store.putRun({ runId: '77', at: 'z', ok: true, shotsByTest: {} })
  assert.deepEqual([...await store.referencedBlobs()].sort(), [shared, onlyMine].sort())
  assert.deepEqual(await store.gcBlobs(), { deleted: 1, kept: 2 }, 'the orphan goes, the two named blobs stay')
  assert.equal(existsSync(blobPath(home, orphan)), false)
  await store.deleteEvidence({ testFile: 'spec/init/test.spec.ts', screen: 'board', reqId: 'R1' })
  assert.deepEqual(await store.gcBlobs(), { deleted: 1, kept: 1 })
  assert.equal(existsSync(blobPath(home, shared)), true, 'the base the other test still names survives')
  assert.equal(existsSync(blobPath(home, onlyMine)), false, 'the frame only the pruned record named is collected')
  await store.close()
})
