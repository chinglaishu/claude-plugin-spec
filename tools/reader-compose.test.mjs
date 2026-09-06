// tools/reader-compose.test.mjs — THE READER MUST DRAW THE MOMENT WHERE THE HARVEST SAYS.
//
// `npm run proof mirror` proves each replica is faithful TO THE APP: the in-page gate walks the
// app's own unedited tree back in a hidden frame and every box the live skeleton measured must come
// back (tools/replica-gate.mjs). Nothing proved the other half — that the READER, which composes
// that file into an `<iframe srcdoc>` with a sheet of its own over it, renders the marked element
// where the capture recorded it. It does not have to: the board's sheet reaches INTO the app's
// markup to tint a claim, and a rule that out-specifies the replica's own is one line away from
// moving it.
//
// That is not hypothetical. It shipped: the pre-0.46.3 `[data-claim][data-claim][data-claim]
// {position:relative}` beat the replica's `.rep .rN{position:absolute}` on demo/todo R3 and R4, the
// ringed sub-task counter fell out of its absolute placement into its button's flow, and the ring
// sat 29 px above the number it marks in EVERY moment of both requirements — fully green on
// `proof mirror`, because that gate never composes what a reader composes.
//
// So this file pins the CLASS, not the instance: the same fixture is run through the reader's REAL
// bytes and through the same bytes with that one historical rule put back, and the pass must be
// green on the first and red on the second. Anything else and the gate is decoration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkReaderCompose, composeRows, classify, readerBundle, PLACE_TOL } from './reader-compose-check.mjs'

const CLIENT = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')

// THE ONE RULE, PUT BACK. `position` is emitted at plain `[data-claim]` since 0.46.3 precisely so
// the replica's own declaration wins on source order; tripling the attribute is the shipped defect.
const HISTORIC = (() => {
  const now = "A + '{position:relative}'"
  assert.ok(CLIENT.includes(now), 'the claim-mark position rule moved — this fixture must be re-aimed')
  return CLIENT.replace(now, "A + A + A + '{position:relative}'")
})()

// A REPLICA IN MINIATURE, shaped exactly like the demo harvest the defect was measured on (and like
// tools/claim-mark.test.mjs's, which pins the same rule one level down): a row the app lays out at
// (271,195), a 26×26 button in it, and the counter the assertion read positioned `absolute; inset:0`
// over that button — which is the box the capture recorded as `data-ring-box`.
const ROW = '{display:flex;align-items:center;width:738px;height:70px;padding:14px 16px;box-sizing:border-box}'
const REPLICA =
  '<!-- specboard replica -->' +
  '<style>.rep .rA0' + ROW + '\n.rep.rA0' + ROW + '\n' +
  '.rep .rA1{display:block;position:relative;flex:0 0 auto;width:26px;height:26px;padding:0px;border:0px none}\n' +
  '.rep .rA2{display:block;width:26px;height:26px}\n' +
  '.rep .rA3{display:flex;position:absolute;top:0px;left:0px;right:0px;bottom:0px;align-items:center;' +
  'justify-content:center;width:26px;height:26px;font-size:9px}\n' +
  '.rep .rA4{flex:1 1 0%;width:511px;height:42px}</style>' +
  '<div class="rep rA0" data-replica-kit="replica-1" data-replica-ns="A" data-replica-path="0/1" ' +
  'data-replica-region="271 195 738 70" data-replica-scroll="0 0" ' +
  'data-ring-box="287 217 26 26" data-replica-side="expected" style="position:relative">' +
  '<button class="rA1"><span class="rA2"></span>' +
  '<span class="rA3" data-ring="1" data-claim="ok" data-claim-of="0">1/3</span></button>' +
  '<div class="rA4">Plan the team offsite</div></div>'

// …and one whose ringed element is `position:fixed`: a rigid translation of the page cannot move it,
// so the reader VERIFIES its own shift, puts the page back, and says `refused`. That is the honest
// third answer — neither a silent pass nor a red row — and the gate must report it as a listed debt.
const FIXED = REPLICA
  .replace('.rep .rA3{display:flex;position:absolute;top:0px;left:0px;right:0px;bottom:0px;',
    '.rep .rA3{display:flex;position:fixed;top:400px;left:400px;')
  .replace('data-ring-box="287 217 26 26"', 'data-ring-box="287 217 26 26"')

const LAYOUT = JSON.stringify({ els: [], rootMarked: 1 })

const index = (rep) => ({
  demo: {
    evidence: {
      R3: {
        beats: [{
          n: 1,
          focus: { x: 271, y: 195, w: 738, h: 70, vw: 1440, vh: 900 },
          values: [{ k: 1, frame: 'frame.png', layout: 'lay.json', replicaExpected: rep, label: 'the sub-task count', claim: { expected: '1/3', got: '1/3', ok: true } }]
        }]
      }
    }
  }
})

const read = async (src) => ({ 'rep.html': REPLICA, 'fixed.html': FIXED, 'lay.json': LAYOUT })[src] || null

test('composeRows names every moment a reader would compose, with the viewport it stands on', () => {
  const rows = composeRows(index('rep.html'))
  assert.equal(rows.length, 1)
  assert.deepEqual({ screen: rows[0].screen, id: rows[0].id, beat: rows[0].beat, phase: rows[0].phase, rep: rows[0].rep },
    { screen: 'demo', id: 'R3', beat: 1, phase: 'value', rep: 'rep.html' })
  assert.deepEqual(rows[0].vp, { vw: 1440, vh: 900 },
    'the viewport is the beat\'s own, exactly as the reader\'s viewportOf reads it')
})

test('the bundle is the READER\'S bytes — every helper, and the caps declared beside them', () => {
  const graft = readFileSync(new URL('./board/graft.js', import.meta.url), 'utf8')
  const js = readerBundle(CLIENT, graft, { paper: '#fff' }, { inset: 4 })
  for (const n of ['repAttr', 'repRect', 'repScroll', 'repStand', 'repPlates', 'repBody', 'repSrcdoc', 'repAlignIn']) {
    assert.ok(js.includes(n + ': ' + n), n + ' is not published on the bundle')
  }
  // the plate caps are READ out of client.js, never copied — a copy is the drift this gate exists
  // to catch, and it would be a quiet one (a plate too many changes no verdict, only the picture)
  assert.match(js, /var PLATE_FRAC = 0\.05/)
  assert.match(js, /var PLATE_MAX = 12/)
  assert.ok(js.includes('root.SBGraft'), 'the graft module ships whole, as the board inlines it')
})

test('classify is the verdict, apart from the browser that measures it', () => {
  assert.equal(classify({ ring: { x: 1, y: 1 }, want: { x: 0, y: 0 }, got: { x: 0, y: 0 }, repalign: '0 0' }).status, 'ok')
  assert.equal(classify({ ring: { x: 1, y: 1 }, want: { x: 0, y: 0 }, got: { x: 0, y: PLACE_TOL + 1 }, repalign: '0 -3' }).status, 'off')
  assert.equal(classify({ ring: { x: 1, y: 1 }, want: { x: 0, y: 0 }, got: { x: 0, y: 99 }, repalign: 'refused' }).status, 'refused',
    'a refusal is a listed debt whatever the numbers under it — the reader could not place this one honestly')
  assert.equal(classify({ ring: null }).status, 'unringed')
  assert.equal(classify({ ring: { x: 1, y: 1 }, want: { x: 0, y: 0 }, got: null }).status, 'unplaceable')
})

test('the real reader bytes render the claimed element AT its ring', async () => {
  const rows = await checkReaderCompose(index('rep.html'), { read, clientSrc: CLIENT })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'ok', rows[0].why)
  assert.equal(rows[0].repalign, '0 0', 'a lone patch stands at its own region — nothing to nudge')
})

test('…and the shipped 29 px defect turns it RED: a sheet that out-specifies the replica\'s position', async () => {
  const rows = await checkReaderCompose(index('rep.html'), { read, clientSrc: HISTORIC })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'off',
    'the reader dropped the claimed element out of its absolute placement and the gate called it ok')
  assert.ok(Math.abs(rows[0].dy) > 5,
    'the drift the gate reports must be the real one: dy ' + rows[0].dy)
  assert.match(rows[0].why, /ring/)
})

test('an alignment the reader REFUSED is a listed debt, never a silent pass and never a red row', async () => {
  const rows = await checkReaderCompose(index('fixed.html'), { read, clientSrc: CLIENT })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'refused')
  assert.equal(rows[0].repalign, 'refused')
})
