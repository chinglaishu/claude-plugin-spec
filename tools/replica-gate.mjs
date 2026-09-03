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
// EXPORTED (fix round 1, M1) so tools/proof-integrity.mjs asks this module rather than restating
// 1.5 and 12 as literals of its own — that restating is exactly the drift this file's header warns
// about, and a guard that drifts from the rule it guards is worse than no guard.
export const GATE_MIN = 12
const MIN = GATE_MIN

// THE LIVE TEXT MUST OCCUR AS ITS OWN WORD RUN (fix round 1, I1). The words rule accepts a replica
// element whose text CONTAINS the live element's, because a ::before materialised as a span makes
// the element reading `Add` on the live page read `+ Add` at the very same box. Plain containment,
// though, is weakest exactly where requirements live: a live `5` was satisfied by a replica `15` at
// the same box — a wrong asserted value passing the likeness gate — and on the CLI side, where the
// haystack is the whole file's text with no box at all, a live `5`, `ok` or `R1` could essentially
// never fail. So the run must be bounded by the ends of the string or by a character that is not a
// letter, a digit or an underscore.
const WORDY = /[\p{L}\p{N}_]/u

// spec/_layout-walk.mjs's own `clean()` hard-slices every measured text to this many characters
// (fix round 2, item 1). A needle that comes back at EXACTLY this length may have been cut mid-word
// — "Search across requirement text, grouped into are" is "…areas" with its last two letters sliced
// off — and the run rule's right-boundary check then rejects the replica's own, uncut word, because
// both the cut edge ('e') and what follows it in the replica ('a') are wordy. Below the cap a needle
// is never a truncation, so both ends stay bounded exactly as before; only a needle AT the cap gets
// its right edge relaxed, and only its right edge — the LEFT edge still has to be a real boundary, or
// a live "...into are" glued onto some unrelated "...somewhere48ischarslong" would pass by accident.
export const TEXT_CAP = 48
export function containsRun (hay, needle) {
  const h = String(hay == null ? '' : hay)
  const n = String(needle == null ? '' : needle)
  if (!n) return true
  if (h === n) return true
  const capped = n.length === TEXT_CAP
  // a needle that starts or ends on a non-word character is already bounded on that side
  for (let i = h.indexOf(n); i >= 0; i = h.indexOf(n, i + 1)) {
    const before = i > 0 ? h[i - 1] : ''
    const after = i + n.length < h.length ? h[i + n.length] : ''
    const okL = !before || !WORDY.test(before) || !WORDY.test(n[0])
    const okR = capped || !after || !WORDY.test(after) || !WORDY.test(n[n.length - 1])
    if (okL && okR) return true
  }
  return false
}

// A LIVE ELEMENT WHOSE OWN TAG NEVER PAINTS A READER-VISIBLE WORD (fix round 2, item 2). Every
// record now carries its measured `tag` (spec/_layout-walk.mjs), lowercased — an older skeleton
// with no such field simply has `e.tag === undefined`, which matches nothing here and changes
// nothing about how it was gated before. `style`/`script` are already refused a slot by the walk's
// own skipTag, so this exists for whatever still slips a `text` through despite that (an svg's own
// metadata children; belt and suspenders alongside the walk's own SVG-textContent fix), and for a
// skeleton from a release older than fix round 2 that has not been re-harvested yet.
export const NO_TEXT_TAGS = ['style', 'script', 'title', 'desc', 'metadata']
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

// …and the other direction (fix round 1, C2). The gate used to ask only live → replica, so a box the
// APP NEVER HAD was invisible to it — which is how the capture's own probe frame ended up drawn as a
// 200x200 empty plate in eighteen committed replicas with every row reading `ok`. A replica box that
// is PAINTED, big enough for a reader to see (EXTRA_MIN on both sides), inside the region, and that
// no live element stands on is a picture of something that was not on screen.
//
// Two bounds keep it honest rather than noisy: the size floor, and the live walk's own CAP — a
// skeleton that filled its 360 slots did not measure everything it saw, so its silence about a box
// is not evidence the box was absent.
const EXTRA_MIN = 40
const WALK_CAP = 360

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
    // a tag that never paints a reader-visible word (fix round 2, item 2) carries no text demand,
    // whatever ended up in `e.text` — a skeleton from before the walk's own SVG-textContent fix
    // (or one this module cannot fully trust) still gates cleanly rather than chasing a value no
    // honest replica could ever show
    const t = NO_TEXT_TAGS.indexOf(e.tag) >= 0 ? '' : clean(e.text)
    if (t) {
      // 2. THE WORDS. Equal text at the same box is the plain case; CONTAINING it at the same box is
      //    the honest one — a replica materialises a ::before/::after's quoted content as a real
      //    span, so the element that carries "Add" on the live page reads "+ Add" in the replica at
      //    the very same box. Same position, same words, more of them: not a gap.
      const here = repText.some(x => sameBox(x.e, e) && containsRun(x.t, t))
      if (here) continue
      const anywhere = repText.some(x => containsRun(x.t, t))
      add({ kind: anywhere ? 'moved-text' : 'missing-text', what: t, ...at })
      continue
    }
    // 3. A PAINTED BOX with no words of its own — a rule, a chip, a plate. `what` is the skeleton's
    //    own word for the element (its `kind`); the skeleton records no tag name.
    if (painted(e)) {
      if (!repEls.some(r => sameBox(r, e))) add({ kind: 'missing-box', what: String(e.kind || 'box'), ...at })
    }
  }
  // …and now the other way round (see EXTRA_MIN above)
  if (liveEls.length < WALK_CAP) {
    for (const r of repEls) {
      if (out.length >= max) break
      if (!painted(r) || r.w < EXTRA_MIN || r.h < EXTRA_MIN) continue
      if (!inRegion(r, region)) continue
      // …and the SCENE ROOT is not an extra box: it is the box the file is a picture OF, and the
      // walk that produced the live skeleton starts at doc.body's CHILDREN, so a body-rooted scene's
      // own root is in no skeleton, ever (caught on the first harvest after this rule landed —
      // every body-rooted replica reported `container at 0,0 1440x1890`, its own root).
      if (region && sameBox(r, region)) continue
      if (liveEls.some(e => sameBox(e, r))) continue
      out.push({ kind: 'extra-box', what: String(r.kind || 'box'), x: r.x, y: r.y, w: r.w, h: r.h })
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
