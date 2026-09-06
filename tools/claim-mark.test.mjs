// tools/claim-mark.test.mjs — THE CLAIM MARK MAY NOT MOVE THE APP'S OWN MARKUP (2026-09-06).
//
// The Expected cell renders the app's own markup inside an `<iframe srcdoc>` whose sheet is written
// by `repSrcdoc` (tools/board/client.js). That sheet has to reach INTO the replica to draw the claim
// tint — an outline and a ✓/✎/↺/+ glyph on the element the assertion read — and the replica's own
// sheet declares its properties as `.rep .rN` (two classes) and sits LATER in the document, so the
// tint rules are written with the attribute repeated (`[data-claim][data-claim][data-claim]`) to win
// that tie. That is right for PAINT. It was also being done for `position:relative`, the containing
// block the ✓ glyph is pinned to — and position is LAYOUT.
//
// Measured on the demo board (Tsumiki, demo/todo): todo R3 and R4 ring the sub-task counter, a
// `<span>` the app positions `absolute; inset:0` inside its 26×26 button. Forced to `relative` by the
// sheet above it, the span fell back into the button's flow, below the ring's own `<svg>` — the ring
// sat 29 px above the thing it marks in EVERY moment of both requirements, while the photograph
// beside it showed the number inside the ring. `npm run proof mirror` reads green on exactly these
// files, because the in-page gate walks the replica with no board sheet over it: this drift exists
// only where a reader looks at it, which is why it needs a test of its own.
//
// The rule these pin: the sheet may out-specify the replica for what it PAINTS and never for where
// the app put something. `position` is emitted at plain `[data-claim]` — the replica declares
// `position` only when it differs from the tag default (spec/_replica.mjs; `position:static` is
// therefore never in a replica sheet), so a declared position wins on source order and is already a
// containing block for the glyph, and an element with none takes `relative` and gets one.
//
// Like tools/repbody.test.mjs this lifts the REAL bytes out of client.js rather than restating them,
// and — because the claim is about layout, not about a string — renders them in a REAL browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { lift } from './lift-client.mjs'

const SRC = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
const PAPER = { paper: '#fdfcf9', ring: '#2f4a63', ringFail: '#8f3f34', halo: 'rgba(255,255,255,.8)',
  veil: 'rgba(28,27,24,.12)', plate: '#eee', hair: '#ddd', ink3: '#666', tintOk: '#4a6741', tintFixed: '#8f3f34' }
const RINGG = { inset: 4, stroke: 2, radius: 6, halo: 3 }
// eslint-disable-next-line no-new-func
const repSrcdoc = new Function('PAPER', 'RINGG',
  lift(SRC, 'repSrcdoc') + '; return repSrcdoc')(PAPER, RINGG)

// A REPLICA IN MINIATURE, shaped exactly like the one the demo harvests: a row the app lays out at
// (271,195), a 26×26 button inside it, and the counter the assertion read positioned `absolute;
// inset:0` over that button — the ring's own box, which is what the cell draws its ring at.
const RING = { x: 287, y: 217, w: 26, h: 26 }
const ROW = '{display:flex;align-items:center;width:738px;height:70px;padding:14px 16px;box-sizing:border-box}'
const REPLICA =
  // both forms for the root, exactly as spec/_replica.mjs emits them (`.rep .rN` for a descendant,
  // `.rep.rN` for the root itself, which has no `.rep` ancestor to match the first)
  '<style>.rep .rA0' + ROW + '\n.rep.rA0' + ROW + '\n' +
  '.rep .rA1{display:block;position:relative;flex:0 0 auto;width:26px;height:26px;padding:0px;border:0px none}\n' +
  '.rep .rA2{display:block;width:26px;height:26px}\n' +
  '.rep .rA3{display:flex;position:absolute;top:0px;left:0px;right:0px;bottom:0px;align-items:center;' +
  'justify-content:center;width:26px;height:26px;font-size:9px}\n' +
  '.rep .rA4{flex:1 1 0%;width:511px;height:42px}</style>' +
  '<div class="rep rA0" data-replica-path="0/1" data-replica-region="271 195 738 70" ' +
  'data-ring-box="287 217 26 26" data-replica-side="expected" style="position:relative">' +
  '<button class="rA1"><span class="rA2"></span>' +
  '<span class="rA3" data-ring="1" data-claim="ok" data-claim-of="0">1/3</span></button>' +
  '<div class="rA4">Plan the team offsite</div></div>'

// the same row with NO position of its own on the claimed element — the case the `relative` is for
const REPLICA_STATIC = REPLICA.replace(
  '.rep .rA3{display:flex;position:absolute;top:0px;left:0px;right:0px;bottom:0px;align-items:center;',
  '.rep .rA3{display:flex;align-items:center;')

async function measure (replica) {
  const doc = repSrcdoc({ body: replica, faces: '', plates: [],
    region: { x: 271, y: 195, w: 738, h: 70 }, ring: RING, ok: true, vw: 1440, vh: 900 })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.setContent('<body style="margin:0"></body>')
    return await page.evaluate(function (srcdoc) {
      const f = document.createElement('iframe')
      f.style.cssText = 'width:1440px;height:900px;border:0;position:absolute;left:0;top:0'
      f.srcdoc = srcdoc
      document.body.appendChild(f)
      return new Promise(function (res) {
        f.onload = function () {
          const d = f.contentDocument
          const el = d.querySelector('[data-ring="1"]')
          const r = el.getBoundingClientRect()
          const cs = d.defaultView.getComputedStyle(el)
          res({ x: r.x, y: r.y, w: r.width, h: r.height, position: cs.position,
            outline: cs.outlineStyle + ' ' + cs.outlineWidth })
        }
      })
    }, doc)
  } finally { await browser.close() }
}

test('a claimed element the app positioned ABSOLUTELY stays where the app put it', async () => {
  const m = await measure(REPLICA)
  // red before the fix: `position` reads `relative`, so the span leaves its absolute placement, drops
  // into the button's flow under its sibling and lands a whole sibling below the ring the cell draws
  // at this file's own `data-ring-box` (29 px on the real demo harvest this row is shaped from).
  assert.equal(m.position, 'absolute',
    'the srcdoc sheet overrode the position the app declared — the claim mark is moving the markup')
  assert.ok(Math.abs(m.y - RING.y) <= 1, 'the claimed element must render AT its ring: ring y ' +
    RING.y + ', element y ' + m.y)
  assert.ok(Math.abs(m.x - RING.x) <= 1, 'ring x ' + RING.x + ', element x ' + m.x)
})

test('…and one with no position of its own still gets the containing block the ✓ glyph needs', async () => {
  const m = await measure(REPLICA_STATIC)
  assert.equal(m.position, 'relative', 'a statically positioned claimed element must still be pinned')
})

test('the claim tint still WINS over the replica sheet — paint may out-specify, layout may not', async () => {
  const m = await measure(REPLICA)
  assert.equal(m.outline, 'solid 2px', 'the ✓ outline lost its tie with the replica\'s own sheet')
})
