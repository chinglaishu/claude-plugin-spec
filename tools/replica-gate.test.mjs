// tools/replica-gate.test.mjs — THE REPLICA GATE's pure half (tools/replica-gate.mjs), on two plain
// skeletons exactly the way tools/layout-walk.test.mjs pins the walk that produces them.
//
// Phase 3's whole claim is "the replica LOOKS like the app" — and a claim nobody measures is a
// decoration. The measurement is: render the captured replica back, walk it with the SAME walk that
// measured the live page, and demand every box and word the live skeleton recorded inside the scene
// root be found again. What that demand actually means is decided here, on fixtures, not in a
// browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GATE_TOL, replicaGaps, claimGaps, replicaAttrs, withReplicaAttrs, textOf } from './replica-gate.mjs'

// ── the fixture the brief names: six elements, one of them outside the region ────────────────────
// (a header word · a button with the focus · two row words · a painted divider · a leaf outside)
const REGION = { x: 100, y: 100, w: 600, h: 300 }
const LIVE = () => ({
  w: 1440,
  h: 900,
  ring: { x: 120, y: 150, w: 90, h: 30 },
  els: [
    { x: 110, y: 110, w: 200, h: 24, kind: 'heading', text: 'All tasks' },
    { x: 120, y: 150, w: 90, h: 30, kind: 'button', text: 'Archive', focus: true },
    { x: 120, y: 200, w: 300, h: 20, kind: 'text', text: 'Pay the electricity bill' },
    { x: 120, y: 240, w: 300, h: 20, kind: 'text', text: 'Renew passport' },
    { x: 110, y: 280, w: 560, h: 14, kind: 'container', bd: '220,220,220' },
    { x: 900, y: 600, w: 200, h: 20, kind: 'text', text: 'Far away, outside the scene' }
  ]
})
// the replica, walked back in the SAME viewport frame — a faithful one is the live skeleton again
const REP = () => ({ w: 1440, h: 900, ring: { x: 120, y: 150, w: 90, h: 30 }, els: LIVE().els.map(e => ({ ...e })) })

test('an identical replica has no gaps at all', () => {
  assert.deepEqual(replicaGaps(LIVE(), REP(), REGION), [])
})

test('a row word the replica dropped is one missing-text gap, and only one', () => {
  const rep = REP()
  rep.els = rep.els.filter(e => e.text !== 'Renew passport')
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1, 'one gap per live element, no cascade')
  assert.equal(gaps[0].kind, 'missing-text')
  assert.equal(gaps[0].what, 'Renew passport')
  assert.deepEqual([gaps[0].x, gaps[0].y, gaps[0].w, gaps[0].h], [120, 240, 300, 20], 'named where the app had it')
})

test('a row word the replica put somewhere else is moved-text, never missing', () => {
  const rep = REP()
  rep.els[3] = { ...rep.els[3], y: 243 }
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'moved-text')
  assert.equal(gaps[0].what, 'Renew passport')
})

test('the ring must come back as the ring — a replica that lost the focus is missing-focus', () => {
  const rep = REP()
  rep.els[1] = { ...rep.els[1], focus: undefined }
  delete rep.els[1].focus
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'missing-focus')
  assert.equal(gaps[0].what, 'ring')
})

test('half-pixel rounding between two renderings of the same font is not a gap — 1.4 px is inside GATE_TOL', () => {
  assert.equal(GATE_TOL, 1.5)
  const rep = REP()
  rep.els[2] = { ...rep.els[2], x: 121.4, y: 201.4 }
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [], 'a sub-pixel shift is the same box')
  const far = REP()
  far.els[2] = { ...far.els[2], x: 122, y: 202 }
  assert.equal(replicaGaps(LIVE(), far, REGION)[0].kind, 'moved-text', '2 px is not')
})

test('a painted box with no words must come back too — else missing-box, named by its kind', () => {
  const rep = REP()
  rep.els = rep.els.filter(e => e.kind !== 'container')
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'missing-box')
  assert.equal(gaps[0].what, 'container')
})

test('an UNPAINTED wordless box is not a gap — the photograph does not show it either', () => {
  const live = LIVE()
  live.els.push({ x: 130, y: 300, w: 100, h: 40, kind: 'container' })   // no bg, no border, no words
  assert.deepEqual(replicaGaps(live, REP(), REGION), [])
})

test('what lies outside the scene root is not the replica\'s business', () => {
  const rep = REP()
  rep.els = rep.els.filter(e => e.x < 800)          // the far leaf is not in the replica at all
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [])
})

test('a fleck below the walk\'s own size floor is not gated', () => {
  const live = LIVE()
  live.els.push({ x: 130, y: 300, w: 8, h: 8, kind: 'container', bg: '0,0,0' })
  assert.deepEqual(replicaGaps(live, REP(), REGION), [])
})

test('the gap list is bounded — opts.max, defaulting to 40', () => {
  const live = LIVE()
  for (let i = 0; i < 60; i++) live.els.push({ x: 120, y: 100 + i, w: 40, h: 16, kind: 'text', text: 'w' + i })
  assert.equal(replicaGaps(live, REP(), REGION).length, 40)
  assert.equal(replicaGaps(live, REP(), REGION, { max: 5 }).length, 5)
})

test('one replica element may answer for two live elements — duplicated words are legal', () => {
  const live = LIVE()
  live.els.push({ x: 120, y: 200, w: 300, h: 20, kind: 'text', text: 'Pay the electricity bill' })
  assert.deepEqual(replicaGaps(live, REP(), REGION), [])
})

test('the replica\'s own extra words are never a gap — the gate reads live → replica only', () => {
  const rep = REP()
  rep.els.push({ x: 300, y: 320, w: 60, h: 18, kind: 'text', text: 'Undo' })
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [])
})

// ── the claim gate: the Expected must actually CARRY what the requirement asked for ──────────────
test('claimGaps names every failed claim whose expected value the Expected replica does not carry', () => {
  const claims = [
    { label: 'the counter', expected: '5', got: '4', ok: false },
    { label: 'the row', expected: 'Pay the electricity bill', got: '', ok: false, missing: true },
    { label: 'the title', expected: 'All tasks', got: 'All tasks', ok: true }
  ]
  const gaps = claimGaps('All tasks 5 Renew passport', claims)
  assert.equal(gaps.length, 1, 'the carried one and the passing one are not gaps')
  assert.equal(gaps[0].kind, 'missing-claim')
  assert.equal(gaps[0].what, 'Pay the electricity bill')
})

test('claimGaps reads collapsed text on both sides, and an empty expectation claims nothing', () => {
  assert.deepEqual(claimGaps('a  b\n c', [{ expected: 'a b c', got: '', ok: false }]), [])
  assert.deepEqual(claimGaps('', [{ expected: '', got: 'x', ok: false }]), [])
  assert.deepEqual(claimGaps('', []), [])
  assert.deepEqual(claimGaps('', null), [])
})

// ── the root's data attributes: read, written, and read back ─────────────────────────────────────
const ROOT = '<style>.rep .r0{color:red}</style>\n<div class="rep r0" data-replica-kit="replica-1" ' +
  'data-replica-region="100 100 600 300" data-replica-side="expected" ' +
  'data-claims="[{&quot;expected&quot;:&quot;Tom &amp; Jerry&quot;,&quot;got&quot;:&quot;&quot;,&quot;ok&quot;:false}]" ' +
  'style="position:relative"><span class="r1">Tom &amp; Jerry</span></div>'

test('replicaAttrs reads the root\'s data attributes, entities decoded', () => {
  const a = replicaAttrs(ROOT)
  assert.equal(a.kit, 'replica-1')
  assert.deepEqual(a.region, { x: 100, y: 100, w: 600, h: 300 })
  assert.equal(a.side, 'expected')
  assert.equal(a.layout, '')
  assert.deepEqual(a.gaps, [])
  assert.equal(a.truncated, false)
  assert.equal(a.claims.length, 1)
  assert.equal(a.claims[0].expected, 'Tom & Jerry', 'the quotes and the ampersand survive the round trip')
})

test('withReplicaAttrs writes the pin and the gaps, and replaces them rather than doubling them', () => {
  const gaps = [{ kind: 'missing-text', what: 'a "quoted" & <angled> word', x: 1, y: 2, w: 3, h: 4 }]
  const once = withReplicaAttrs(ROOT, { layout: 'abc123', gaps })
  const back = replicaAttrs(once)
  assert.equal(back.layout, 'abc123')
  assert.deepEqual(back.gaps, gaps)
  assert.equal(back.kit, 'replica-1', 'the attributes it did not write are untouched')
  const twice = withReplicaAttrs(once, { layout: 'def456', gaps: [] })
  assert.equal((twice.match(/data-replica-layout=/g) || []).length, 1)
  assert.equal((twice.match(/data-replica-gaps=/g) || []).length, 1)
  assert.equal(replicaAttrs(twice).layout, 'def456')
  assert.deepEqual(replicaAttrs(twice).gaps, [])
})

test('a truncated replica says so, and replicaAttrs reads it', () => {
  const t = ROOT.replace('data-replica-kit', 'data-replica-truncated="1" data-replica-kit')
  assert.equal(replicaAttrs(t).truncated, true)
})

test('replicaAttrs on markup with no replica root is empty rather than a throw', () => {
  const a = replicaAttrs('<div>not a replica</div>')
  assert.equal(a.kit, '')
  assert.equal(a.region, null)
  assert.deepEqual(a.gaps, [])
})

test('textOf is the body\'s words only — the style block, the comment and every attribute are gone', () => {
  const html = '<!-- specboard replica-1 · todo:R9 b1 after · Expected -->\n' + ROOT
  const t = textOf(html)
  assert.equal(t, 'Tom & Jerry')
  assert.ok(!/color:red/.test(t), 'the sheet is not text')
  assert.ok(!/data-claims/.test(t), 'nor is an attribute — which is what makes the claim gate mean something')
  assert.ok(!/specboard/.test(t), 'nor the file\'s own comment header')
})
