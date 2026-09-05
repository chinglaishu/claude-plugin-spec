// tools/reporter-blobs.test.mjs — THE HARVEST LANDS AS BLOBS (the data home, 2026-09-05/06).
//
// No file is copied into `spec/<screen>/evidence/` any more: every landed field is a content address
// in the project's data home, so an unchanged frame costs nothing on a re-harvest and a dropped one
// is collected by reference at the fold. And the entry says WHICH TEST filed it (the human's C2
// ruling), so a composed flow that proves another screen's requirement is a second row rather than a
// silent overwrite of the home screen's harvest.
//
// The second thing this holds is the 2026-09-04 trap: a value moment whose SKELETON did not land is
// a photograph with nothing to gate it against, and the fold's own carry hid that so well that
// `npm run proof mirror` read the screen green. Every value moment must carry its layout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { withReplicaAttrs } from './replica-gate.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const box = () => mkdtempSync(join(tmpdir(), 'kgrep-'))

const replica = pin => withReplicaAttrs('<div class="rep r0" data-replica-kit="replica-1" data-replica-region="0 0 100 100">x</div>', { layout: pin, gaps: [] })

const layout = (over = {}) => JSON.stringify({ w: 1440, h: 900, els: [], ring: { x: 1, y: 2, w: 3, h: 4 }, ...over })

async function harvestOnce (home) {
  process.env.SPECBOARD_HOME = home
  const { harvestEvidence } = await import('../spec/_results-reporter.mjs?home=' + encodeURIComponent(home))
  const src = box()
  const f = (n, body) => { const p = join(src, n); writeFileSync(p, body); return p }
  const harvest = {
    'spec/board/test.spec.ts board:R1': {
      latestKey: '_novideo',
      fonts: [{ hash: 'abc', ext: 'woff2', src: f('x.woff2', 'FONT'), url: 'https://cdn/x.woff2', family: 'X' }],
      fontFaceRules: [{ cssText: '@font-face{font-family:X;src:url(https://cdn/x.woff2)}', urls: ['https://cdn/x.woff2'] }],
      testFile: 'spec/board/test.spec.ts',
      testTitle: 'the board proves R1',
      caps: {
        _novideo: {
          srcVideo: null,
          order: [1],
          beats: {
            1: {
              before: f('b.png', 'PNGB'),
              after: f('a.png', 'PNGA'),
              layoutBefore: f('lb.json', layout()),
              layoutAfter: f('la.json', layout()),
              replicaExpectedBefore: f('rb.html', replica('deadbeef')),
              replicaExpectedAfter: f('ra.html', replica('deadbeef')),
              window: { from: 0, to: 10 },
              values: { 1: { frame: f('v1.png', 'PNGV'), layout: f('v1.json', layout({ at: 120, label: 'the count' })), replicaExpected: f('v1.html', replica('deadbeef')) } }
            }
          }
        }
      }
    }
  }
  return { out: await harvestEvidence(harvest, Date.now()), home }
}

test('every landed file is a blob in the data home, and nothing is written under spec/', async () => {
  const home = box()
  const { out } = await harvestOnce(home)
  const { isBlobRel } = await import('./store.mjs')
  const key = 'spec/board/test.spec.ts board:R1'
  const e = out[key]
  assert.ok(e, 'the entry landed under its TEST and its requirement (C2)')
  assert.equal(e.testFile, 'spec/board/test.spec.ts')
  assert.equal(e.testTitle, 'the board proves R1')
  for (const k of ['before', 'after']) assert.equal(isBlobRel(e[k]), true, k)
  const b = e.beats[0]
  for (const k of ['before', 'after', 'layoutBefore', 'layoutAfter', 'replicaExpectedBefore', 'replicaExpectedAfter']) {
    assert.equal(isBlobRel(b[k]), true, k)
  }
  assert.equal(isBlobRel(e.fonts[0].path), true, 'the face')
  assert.equal(isBlobRel(e.fontFaces), true, 'the sheet that declares it')
  assert.match(e.fontFaces, /\.css$/)
  // …and NOTHING the entry names is a repo path any more: every picture in it is a content address
  const srcs = []
  const walk = v => { if (typeof v === 'string') srcs.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk) }
  walk({ ...e, testFile: null, testTitle: null, at: null })
  assert.deepEqual(srcs.filter(x => x.startsWith('spec/')), [], 'nothing under spec/ is named by the fold any more')
  // the bytes are in THIS project's data home (SPECBOARD_HOME/<projectId>/blobs) and nowhere else
  const { DATA_HOME } = await import('./spec-store.mjs')
  assert.equal(DATA_HOME.startsWith(home + '/'), true, 'the reporter landed them under the test’s own home')
  assert.ok(readdirSync(join(DATA_HOME, 'blobs')).length, 'the bytes are in the data home')
})

test('a value moment carries its SKELETON beside its photograph — the 2026-09-04 trap, held here', async () => {
  const { out } = await harvestOnce(box())
  const { isBlobRel } = await import('./store.mjs')
  const v = out['spec/board/test.spec.ts board:R1'].beats[0].values[0]
  assert.ok(v, 'the value moment survived the fold')
  assert.equal(isBlobRel(v.frame), true, 'its photograph')
  assert.equal(isBlobRel(v.layout), true, 'AND its skeleton — a frame with no skeleton can never be gated')
  assert.equal(isBlobRel(v.replicaExpected), true, 'and its Expected')
  assert.equal(v.at, 120, 'the offset read back off the skeleton')
  assert.equal(v.label, 'the count', 'and the name of the moment')
})

test('the beat records the gate’s verdict on the replica that just landed, and the beat keeps its camera', async () => {
  const { out } = await harvestOnce(box())
  const b = out['spec/board/test.spec.ts board:R1'].beats[0]
  assert.equal(b.gate.gated, true, 'the in-page gate stamped it, and the fold read that back')
  assert.equal(b.gate.pin, 'deadbeef')
  assert.deepEqual(b.focus, { x: 1, y: 2, w: 3, h: 4, vw: 1440, vh: 900 }, 'the union of the beat’s rings')
})

test('the same bytes harvested twice are ONE blob — a re-harvest of an unchanged frame costs nothing', async () => {
  const home = box()
  const a = await harvestOnce(home)
  const b = await harvestOnce(home)
  const key = 'spec/board/test.spec.ts board:R1'
  assert.equal(a.out[key].beats[0].before, b.out[key].beats[0].before, 'same content, same address')
})
