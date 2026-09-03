// tools/replica-gate.mjs — THE REPLICA GATE, pure (phase 3, 2026-09-03).
//
// The human's decision of 2026-09-03 made the picture beside a proof a real HTML replica of the
// app's own component. A replica is a CLAIM — "this is what the app rendered" — and the drawn kit
// taught us (twice, CLAUDE.md's "the mirror is guarded") that a claim nobody measures quietly stops
// being true. So the same guard the drawing has, on the replica: right after the capture, in the
// app's own page, the replica is rendered back in a hidden iframe and walked with the SAME
// spec/_layout-walk.mjs walk that measured the live page, and every box and word the live skeleton
// recorded inside the scene root must be found again. A miss is a REPLICA GAP, recorded on the
// harvest and refused by `npm run proof mirror`.
//
// Everything that DECIDES is here, pure and unit-tested (tools/replica-gate.test.mjs), exactly like
// tools/viz.mjs mirrorGaps for the drawing: the in-page half (spec/_base.ts snapReplica) only mounts
// the frame and walks it, and the gate's shell (tools/proof-integrity.mjs checkReplicas) only reads
// files. One authority, one reading — a guard that re-states the rules drifts from them.
//
// WHICH SIDE IS GEOMETRY-GATED (the deferred question of task-2-rereview4.md, decided here):
// only the ACTUAL. An Expected replica's root carries THIS moment's `data-replica-region` while its
// content can be a BASE's tree — an older layout, whose `data-b` boxes are that older moment's. Two
// frames in one file cannot be measured against one live skeleton, and inventing a third rule to
// reconcile them would be a guess. So: the Actual is measured against the live skeleton (it is a
// photograph's twin and must match it box for box), and the Expected is gated TEXTUALLY — every
// failed claim's expected value must actually appear in it (claimGaps below, and rule 5 of
// checkReplicas). That is what the Expected is FOR, and it is checkable without a frame at all.
//
// TOLERANCE. The plan says "within 1 px". Two renderings of the same font at the same size land
// half a pixel apart often enough that an exact 1 px test flaps — sub-pixel layout, a scrollbar
// gutter, a rounded border. 1.5 px on each of x, y, w, h is tight enough that a real drift (a
// wrong padding, a dropped rule, a re-flowed row) is caught and loose enough that the same page
// twice is not a gap.
export const GATE_TOL = 1.5

// the walk's own size floor (spec/_layout-walk.mjs MIN): below this an element is a divider or an
// icon fleck, and demanding it back would gate on noise. Read from the walk, restated here because
// this module must stay importable by both the harness and the CLI without dragging the walk in.
const MIN = 12

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= GATE_TOL
const sameBox = (a, b) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h)

// inside the scene root, inclusively and with the same tolerance the boxes are compared at — the
// region is the captured root's own rect, so its edge elements are exactly on the boundary
const inRegion = (e, region) => !region || (
  e.x >= region.x - GATE_TOL && e.y >= region.y - GATE_TOL &&
  e.x + e.w <= region.x + region.w + GATE_TOL && e.y + e.h <= region.y + region.h + GATE_TOL)

// A live element the photograph SHOWS: it carries words, or the page paints it (a background, a
// border, an icon), or it is not a bare container. An unpainted wordless wrapper is invisible in the
// photograph — the skeleton walk already refuses it a slot for exactly that reason — so demanding it
// back out of the replica would gate on nothing a reader can see.
const painted = (e) => !!(e.bg || e.bd || e.icon)

/**
 * replicaGaps(live, replica, region, opts) → [{ kind, what, x, y, w, h }]
 *
 * `live` and `replica` are two skeletons in snapLayoutWalk's output shape, BOTH in viewport px (the
 * replica is rendered at the region's own coordinates in a frame pinned to the viewport's origin, so
 * there is no offset to undo). `region` is the replica's scene root, `{x,y,w,h}`.
 *
 * One gap per live element, the first rule that fails — a dropped row would otherwise report its
 * word, its box and its ring as three separate defects. A replica element may answer for several
 * live ones: duplicated words are legal, and two live elements can share a box (a leaf and the
 * wrapper that fits it exactly).
 */
export function replicaGaps (live, replica, region, opts = {}) {
  const max = Number.isFinite(Number(opts.max)) ? Number(opts.max) : 40
  const out = []
  const liveEls = (live && Array.isArray(live.els) ? live.els : [])
  const repEls = (replica && Array.isArray(replica.els) ? replica.els : [])
  const repText = repEls.map(e => ({ e, t: clean(e.text) })).filter(x => x.t)
  const add = (g) => { if (out.length < max) out.push(g) }
  for (const e of liveEls) {
    if (out.length >= max) break
    if (!inRegion(e, region)) continue
    if (e.w < MIN || e.h < MIN) continue                 // the walk's own floor: a fleck is not a gap
    const at = { x: e.x, y: e.y, w: e.w, h: e.h }
    // 1. THE RING. It is the whole reason the frame exists: a replica that came back without it is
    //    a picture of the page, not of the thing the beat is about.
    if (e.focus) {
      if (!repEls.some(r => r.focus && sameBox(r, e))) { add({ kind: 'missing-focus', what: 'ring', ...at }); continue }
    }
    const t = clean(e.text)
    if (t) {
      // 2. THE WORDS. Equal text at the same box is the plain case; CONTAINING it at the same box is
      //    the honest one — a replica materialises a ::before/::after's quoted content as a real
      //    span, so the element that carries "Add" on the live page reads "+ Add" in the replica at
      //    the very same box. Same position, same words, more of them: not a gap.
      const here = repText.some(x => sameBox(x.e, e) && (x.t === t || x.t.indexOf(t) >= 0))
      if (here) continue
      const anywhere = repText.some(x => x.t === t || x.t.indexOf(t) >= 0)
      add({ kind: anywhere ? 'moved-text' : 'missing-text', what: t, ...at })
      continue
    }
    // 3. A PAINTED BOX with no words of its own — a rule, a chip, a plate. `what` is the skeleton's
    //    own word for the element (its `kind`); the skeleton records no tag name.
    if (painted(e)) {
      if (!repEls.some(r => sameBox(r, e))) add({ kind: 'missing-box', what: String(e.kind || 'box'), ...at })
    }
  }
  return out
}

/**
 * claimGaps(expectedText, claims) → [{ kind: 'missing-claim', what, x, y, w, h }]
 *
 * The Expected replica's own gate (see the header): every claim the run FAILED asked for a value,
 * and the Expected half exists to show that value. A failed claim whose expected words are nowhere
 * in the Expected's text is a picture that does not say what the requirement says — the exact defect
 * fix rounds 1–3 of phase 2 chased three times (a bounded fallback rewriting the wrong leaf, a
 * restore that never landed). A PASSING claim carries no expectation to check: the app already
 * showed it.
 */
export function claimGaps (expectedText, claims) {
  const text = clean(expectedText)
  const out = []
  for (const c of (Array.isArray(claims) ? claims : [])) {
    if (!c || c.ok === true) continue
    const want = clean(c.expected)
    if (!want) continue
    if (text.indexOf(want) >= 0) continue
    const r = c.ring && typeof c.ring === 'object' ? c.ring : null
    out.push({
      kind: 'missing-claim',
      what: want,
      x: r ? Math.round(Number(r.x) || 0) : 0,
      y: r ? Math.round(Number(r.y) || 0) : 0,
      w: r ? Math.round(Number(r.w != null ? r.w : r.width) || 0) : 0,
      h: r ? Math.round(Number(r.h != null ? r.h : r.height) || 0) : 0
    })
  }
  return out
}

// ── the replica file's own root attributes ───────────────────────────────────────────────────────
// A replica file is one <style> and one root element (spec/_replica.mjs), so its attributes are read
// with a regex over the FIRST `<div class="rep"` tag rather than by parsing html we already know the
// shape of. Every value the capture writes is escaped with escAttr (& < > "), so the decode below is
// the exact inverse; `&#39;` is decoded too because a claim's text may arrive from elsewhere.
const decode = (s) => String(s == null ? '' : s)
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')                    // last: an escaped entity must not decode twice
const ROOT_TAG = /<div class="rep(?:[^"]*)"[^>]*>/
const attrOf = (tag, name) => {
  const m = new RegExp(' ' + name + '="([^"]*)"').exec(tag)
  return m ? decode(m[1]) : ''
}
const jsonOf = (raw) => {
  if (!raw) return []
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}

export function replicaAttrs (html) {
  const m = ROOT_TAG.exec(String(html || ''))
  const tag = m ? m[0] : ''
  const reg = attrOf(tag, 'data-replica-region').trim().split(/\s+/).map(Number)
  return {
    kit: attrOf(tag, 'data-replica-kit'),
    region: reg.length === 4 && reg.every(n => Number.isFinite(n)) ? { x: reg[0], y: reg[1], w: reg[2], h: reg[3] } : null,
    layout: attrOf(tag, 'data-replica-layout'),
    gaps: jsonOf(attrOf(tag, 'data-replica-gaps')),
    claims: jsonOf(attrOf(tag, 'data-claims')),
    side: attrOf(tag, 'data-replica-side'),
    truncated: / data-replica-truncated="/.test(tag)
  }
}

const escAttr = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// the pin and the gaps, written onto the root — replacing whatever stood there, so a re-gate of an
// already-gated file (a fold that re-reads its own output) can never double an attribute
export function withReplicaAttrs (html, attrs) {
  const src = String(html || '')
  const m = ROOT_TAG.exec(src)
  if (!m) return src
  let tag = m[0]
    .replace(/ data-replica-layout="[^"]*"/g, '')
    .replace(/ data-replica-gaps="[^"]*"/g, '')
  const add = ' data-replica-layout="' + escAttr((attrs && attrs.layout) || '') +
    '" data-replica-gaps="' + escAttr(JSON.stringify((attrs && attrs.gaps) || [])) + '"'
  tag = tag.slice(0, -1) + add + '>'
  return src.slice(0, m.index) + tag + src.slice(m.index + m[0].length)
}

// the WORDS a replica file shows — its own <style> block and its html comment header dropped, every
// tag (and with it every attribute, `data-claims` included) stripped, entities decoded, whitespace
// collapsed. That an attribute's text does NOT count is the whole point: the Expected's claim gate
// asks whether a reader would SEE the value, not whether the file mentions it.
export function textOf (html) {
  return clean(decode(String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')))
}

// WHAT THE FOLD RECORDS ABOUT ONE LANDED REPLICA. The reporter puts this on the moment
// (`beats[n].replica`, `values[k].replica`) so the board — and a person reading the index — can see
// at a glance whether the row's picture was checked and what the check found. A TRUNCATED capture
// counts as a gap of its own: a file that ran out of bytes is a picture of part of a component, and
// no likeness gate can pass one (the dojostack finding of 2026-09-03, section F).
export function replicaNote (html) {
  const a = replicaAttrs(html)
  const list = a.truncated
    ? [{ kind: 'truncated', what: 'the capture ran out of bytes', x: 0, y: 0, w: 0, h: 0 }, ...a.gaps]
    : a.gaps
  return { gaps: list.length, gated: !!a.layout, list }
}
