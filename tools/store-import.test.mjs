// tools/store-import.test.mjs — THE ONE-TIME MOVE of a committed harvest into the store. No project
// loses its last fold when the storage rule changes under it — and the requirement-keyed evidence of
// the old index is re-keyed onto the TEST that covered it (the human's C2 ruling, 2026-09-06), using
// the attribution the index already carries in every test's `reqs`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { importHarvest } from './store-import.mjs'
import { isBlobRel, blobPath, openStore } from './store.mjs'

const box = () => mkdtempSync(join(tmpdir(), 'kgimp-'))
const w = (root, rel, body) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body) }

function legacyTree () {
  const root = box()
  w(root, 'spec/board/evidence/R1.b1.before.png', 'PNG-1')
  w(root, 'spec/board/evidence/R1.b1.before.layout.json', '{"w":1}')
  w(root, 'spec/board/evidence/R5.b1.before.png', 'PNG-5')
  w(root, 'spec/board/evidence/_fonts/abc.woff2', 'FONT')
  w(root, 'spec/_runs/77/case/video.webm', 'WEBM')
  w(root, 'spec/_results-index.json', JSON.stringify({
    board: {
      total: 2, failed: 0, ranAt: 1700, srcHashes: { board: 'aaa' }, provenHashes: { R1: 'bbb' },
      tests: [
        { title: 'Home lists every screen as a card', ok: true, ms: 10, error: null, line: 39, reqs: { 'board:R1': 'pass' } },
        { title: 'The board proves its own R5', ok: true, ms: 11, error: null, line: 50, reqs: { 'board:R5': 'pass' } }
      ],
      evidence: {
        R1: {
          runId: '77', at: '2026-09-05T00:00:00.000Z',
          before: 'spec/board/evidence/R1.b1.before.png', after: 'spec/board/evidence/R1.gone.png',
          fonts: [{ hash: 'abc', ext: 'woff2', path: 'spec/board/evidence/_fonts/abc.woff2' }],
          beats: [{ n: 1, before: 'spec/board/evidence/R1.b1.before.png', layoutBefore: 'spec/board/evidence/R1.b1.before.layout.json', values: [] }]
        },
        R5: { runId: '77', at: '2026-09-05T00:00:00.000Z', beats: [{ n: 1, before: 'spec/board/evidence/R5.b1.before.png', values: [] }] }
      }
    },
    init: {
      total: 1, failed: 0, ranAt: 1701,
      // a FLOW that starts on init and tags the board's R5 — the very collision C2 retires
      tests: [{ title: 'the init flow reaches the board', ok: true, ms: 12, error: null, line: 7, reqs: { 'init:R2': 'pass', 'board:R5': 'pass' } }],
      evidence: {}
    }
  }))
  w(root, 'spec/_runs.json', JSON.stringify([{ runId: '77', at: '2026-09-05T00:00:00.000Z', screen: 'all', ok: true, ms: 5, total: 2, failed: 0, shotsByTest: { t: { shots: [], video: 'spec/_runs/77/case/video.webm' } } }]))
  w(root, 'spec/_results.json', JSON.stringify({ suites: [{ title: 'board' }] }))
  return root
}

test('every existing file the harvest names becomes a blob; a missing one is reported, not invented', async () => {
  const root = legacyTree(); const home = box()
  const r = await importHarvest({ root, home })
  assert.equal(r.blobs, 5)   // 2 pngs, the layout json, the font, the video — the png named twice is stored once
  assert.deepEqual(r.missing, ['spec/board/evidence/R1.gone.png'])
  const store = await openStore({ root, home, manifest: { projectId: r.projectId }, env: {} })
  const e = await store.getEvidence({ testFile: 'spec/board/test.spec.ts', screen: 'board', reqId: 'R1' })
  assert.ok(e, 'the entry landed')
  assert.equal(isBlobRel(e.entry.before), true)
  assert.equal(e.entry.before, e.entry.beats[0].before)
  assert.equal(readFileSync(blobPath(home, e.entry.beats[0].layoutBefore), 'utf8'), '{"w":1}')
  assert.match(e.entry.fonts[0].path, /^blob\/[0-9a-f]{64}\.woff2$/)
  assert.equal(e.entry.after, 'spec/board/evidence/R1.gone.png')   // left as it was — honesty over a guess
  assert.equal(e.runId, '77')
  assert.equal(existsSync(join(root, 'spec/board/evidence/R1.b1.before.png')), true, 'the repo is never touched')
  await store.close()
})

test('the old requirement-keyed evidence is re-keyed onto the test that covers it (C2)', async () => {
  const root = legacyTree(); const home = box()
  const r = await importHarvest({ root, home })
  const store = await openStore({ root, home, manifest: { projectId: r.projectId }, env: {} })
  const rows = await store.listEvidence({ screen: 'board' })
  assert.deepEqual(rows.map(x => [x.reqId, x.testFile]).sort(), [
    ['R1', 'spec/board/test.spec.ts'],
    ['R5', 'spec/board/test.spec.ts']
  ])
  assert.equal(rows.find(x => x.reqId === 'R1').testTitle, 'Home lists every screen as a card')
  // R5 is covered by the board's own test AND by init's flow: the committed bytes belong to the home
  // screen's file (the I5 precedence rule the old key needed), and the second cover is REPORTED.
  assert.deepEqual(r.ambiguous, [{ screen: 'board', reqId: 'R5', chose: 'spec/board/test.spec.ts', alsoCoveredBy: ['spec/init/test.spec.ts'] }])
  await store.close()
})

test('the fold, the run log and the raw report land as rows', async () => {
  const root = legacyTree(); const home = box()
  const r = await importHarvest({ root, home })
  const store = await openStore({ root, home, manifest: { projectId: r.projectId }, env: {} })
  assert.deepEqual(await store.listScreens(), ['board', 'init'])
  const board = await store.getScreen('board')
  assert.equal(board.total, 2)
  assert.deepEqual(board.srcHashes, { board: 'aaa' })
  assert.deepEqual(board.tests[0].reqs, { 'board:R1': 'pass' })
  assert.equal(board.tests[0].file, 'spec/board/test.spec.ts')
  const run = await store.getRun('77')
  assert.equal(isBlobRel(run.shotsByTest.t.video), true, 'a run record\'s files are blobs too — gc\'d like any other')
  assert.equal(readFileSync(blobPath(home, run.shotsByTest.t.video), 'utf8'), 'WEBM')
  assert.deepEqual((await store.getReport('77')).suites[0].title, 'board')
  await store.close()
})

test('importing twice changes nothing', async () => {
  const root = legacyTree(); const home = box()
  await importHarvest({ root, home })
  const r2 = await importHarvest({ root, home })
  assert.equal(r2.blobs, 0)
  const store = await openStore({ root, home, manifest: { projectId: r2.projectId }, env: {} })
  assert.equal((await store.listEvidence({})).length, 2)
  assert.equal((await store.listRuns()).length, 1)
  await store.close()
})

test('a tree with no harvest imports nothing and does not throw', async () => {
  const r = await importHarvest({ root: box(), home: box() })
  assert.equal(r.blobs, 0)
  assert.equal(r.rewritten, 0)
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.screens, [])
})
