// spec/_replica.mjs — THE ACTUAL REPLICA's capture, as ONE self-contained function (2026-09-03).
//
// The human's decision of 2026-09-03: the picture beside a proof is a REAL HTML REPLICA of the app's
// own component, not a house-style drawing of it. So at every harvested moment — a beat's before,
// each asserted value, its after — the harness takes, beside the photograph and the layout skeleton,
// the app's own DOM around the ringed element with its computed styles diffed against per-tag
// defaults, sanitised and capped. That file is the "Actual" half of the row; phases 2–3 add the
// layout pin and the claims, phase 4 renders it (in an <iframe sandbox srcdoc>, never inline).
//
// Playwright serialises this function by its SOURCE (page.evaluate(fn, arg)), exactly like
// spec/_layout-walk.mjs, so it must stay SELF-CONTAINED: no imports referenced inside it, no closure
// over module state — REPLICA_PROPS below is the ONE list, and it travels IN through `arg.props`
// rather than being read off the module (a module reference is simply undefined inside the page).
// `arg.env` lets a node test hand it a stub window/document/getComputedStyle (+ `defaultsFor`, which
// replaces appending a probe element to a real body).
//
// Shape in:  { target: Element|null, ring: {x,y,width,height}|null, props?: string[],
//              caps?: { nodes?, bytes? }, claim?: Claim|null, claims?: Claim[], base?: string|null, env? }
// Shape out: null when there is nothing to capture, else
//   { kit, html, expected, region: {x,y,w,h}, ring: {x,y,w,h}|null, nodes, classes, bytes, truncated, fonts }
// `html` is the whole file body bar its comment header: one <style> of diffed classes, then one root
// element. No script, no handler, no external URL — the second wall behind the iframe sandbox.
//
// ── PHASE 2 (fix round 1, 2026-09-03): `expected` — ONE CLAIM, NEVER A REPLAY ────────────────────
// A requirement is the truth and the app is what happened, so the row's two pictures are the same
// component twice: `html` is the ACTUAL (what the app rendered) and `expected` is what it should
// have rendered — the wrong value corrected to the requirement's own word, the element the app
// removed put back, the element it never had drawn in as a marked placeholder. That is tools/viz.mjs
// `intendedLayout` (kit mirror-13, the human 2026-09-02: "the schematic should be correct, only the
// proof should be wrong") restated on real markup.
//
// The controller's fix-round-1 ruling REPLACED the phase-2 design that shipped in 0.43.1. That design
// replayed every claim the beat had made so far against the CURRENT moment's scene on every capture —
// which is wrong twice over (the reviewer's C1/C2/I3): a stale claim's `got` can match an unrelated
// leaf once the ring has moved (a false `data-claim="fixed"` naming a value nothing in this scene ever
// read), and — worse — a FAILED beat's Expected was built from the scene the app got WRONG instead of
// the scene it last got RIGHT, so a restored row landed on top of whatever the wrong scene happened to
// contain (mirror-13's own mistake, shipped in a new place).
//
// So this capture takes exactly ONE claim — `arg.claim`, this moment's, or null — and a BASE:
//   `arg.base === null` → nothing has failed in this beat yet (or nothing failed before AND this
//     claim itself did not fail): the Expected is the CURRENT ACTUAL tree, with an `ok` claim only
//     TINTING the leaf inside the CURRENT ring that carries `got` — no text ever changes here.
//   `arg.base` given (an html string, either the beat's `lastExpected` or its `lastRight`, decided by
//     the caller — see spec/_base.ts) → the Expected is that base's OWN TREE, parsed back and
//     re-minted into this capture's own class sheet, with ONLY the current claim applied to it, IN
//     PLACE. A restore never clones or inserts: the row the app removed is already sitting in the
//     base (it was there before the app went wrong), so `missing` MARKS it, never splices a copy.
// `arg.claims` is every claim of the beat so far, in order — informational ONLY, carried into the
// Expected root's `data-claims` for the board to read; it is never applied to anything. There is no
// code path left that loops a claims array against a tree — a claim cannot be replayed because there
// is nothing here that replays one.
//
// The claim is applied to the BASE tree (or a clone of the current tree), never to the Actual: the
// photograph's own half must stay the app's picture, whatever the requirement asked for.
//
// COORDINATES: `region` and `ring` are both VIEWPORT px, the same frame spec/_layout-walk.mjs
// records its ring in. The plan's note said "page px (viewport coords + scroll)"; putting the two in
// different frames would make the board's placement of the replica disagree with the skeleton's ring
// by the scroll offset, so both are viewport-relative and the pair is directly comparable.

// The ONE property list the diff asks each element for — the probe's list
// (docs/expected-view-capture-probe-2026-09-03.cjs) plus what the probe's toolbar could not say:
// how text is set (align, tracking, casing, slant), whether the element is visible at all, and the
// three that decide where a box actually lands (outline, z-index, transform).
//
// NO SHORTHAND THAT CAN GO EMPTY (fix round 1, F3). `border` was here, and getComputedStyle
// serialises a shorthand to "" the moment its edges disagree — so every bottom-ruled row, ruled list
// and toolbar rule was diffed as "no value" and thrown away by the "an empty value is not a
// declaration" rule. The four longhands each serialise in full, whatever the other three say. Grid
// geometry was missing outright, so any grid-laid component collapsed to a stack of blocks.
// `cursor` and `overflow-x/y` are still not needed for a picture; `background-image` stays
// deliberately absent (an external url() may never enter the file — see the header).
export const REPLICA_PROPS = [
  'display', 'position', 'top', 'left', 'right', 'bottom',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'justify-content', 'gap', 'column-gap', 'row-gap',
  // …AND WHAT PLACES THE TRACKS THEMSELVES (fix round 1, found by the gate on the board's own
  // harvest). The board's beat row is `display:grid; align-items:start; grid-template-rows:45.7px`
  // inside a 327 px cell, CENTRED by `align-content` — which was not on this list, so the row went
  // to the top of the box in the replica and every word in the cell rendered 119 px high. 1489 gaps
  // from one missing declaration. `order` places a flex item; `min-height`/`max-height` are the
  // constraint half of the `min-width`/`max-width` already here, and a clamped box is taller
  // without them.
  'align-content', 'justify-items', 'justify-self', 'order',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'padding', 'margin',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'outline', 'background-color', 'color',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'text-overflow',
  'white-space', 'overflow', 'box-shadow', 'opacity', 'visibility',
  'vertical-align', 'box-sizing', 'z-index', 'transform',
  'fill', 'stroke', 'stroke-width'
]

export function captureReplica (arg) {
  const target = (arg && arg.target) || null
  const ring = (arg && arg.ring) || null
  const env = (arg && arg.env) || null
  const caps = (arg && arg.caps) || {}
  const win = env && env.window ? env.window : (typeof window !== 'undefined' ? window : null)
  const doc = env && env.document ? env.document : (typeof document !== 'undefined' ? document : null)
  if (!doc) return null
  const getComputedStyle = env && env.getComputedStyle
    ? env.getComputedStyle
    : (win && win.getComputedStyle ? win.getComputedStyle.bind(win) : null)
  const defaultsFor = env && typeof env.defaultsFor === 'function' ? env.defaultsFor : null
  // THIS MOMENT'S ONE CLAIM, the beat's claims-so-far (informational only, see the header), and the
  // BASE the caller wants the Expected built from (fix round 1 — see the header). A caller that
  // passes none of the three gets an `expected` that is the Actual bar the side it names, which is
  // exactly right for a beat's BEFORE moment: nothing has been claimed yet.
  const CLAIM = (arg && arg.claim && typeof arg.claim === 'object') ? arg.claim : null
  const CLAIMS = (arg && Array.isArray(arg.claims)) ? arg.claims : []
  const BASE = (arg && typeof arg.base === 'string' && arg.base) ? arg.base : ''
  // …and how a base html string is turned back into nodes: an inert <template> in the page (it
  // parses but never runs, loads or paints), a stub env's own parser in a node test.
  const parseHtmlEnv = env && typeof env.parseHtml === 'function' ? env.parseHtml : null
  // the ONE list, handed in (see the header). A caller that forgets it gets structure with no paint
  // rather than a thrown capture — the harness always passes it.
  const PROPS = (arg && Array.isArray(arg.props) && arg.props.length) ? arg.props.map(String) : []
  // ── PHASE 3, SECTION F (2026-09-03): AN INHERITED PROPERTY IS DIFFED AGAINST THE PARENT ────────
  // Found on real data: vendored 0.43.0 harvested 45 replicas in dojostack and NINE hit the 200 KB
  // cap at 197-198 KB, every one of them a whole-viewport region — and a truncated replica can never
  // pass a likeness gate. The bytes were going almost entirely into repeating the app's own type on
  // every element: the probe a tag default is measured with is appended to the app's body, so it
  // answers with whatever the app sets THERE, and any app that sets its font on a wrapper (Tailwind's
  // `font-sans` on a shell div, a themed `#root`) made every one of its 1200 descendants declare the
  // whole stack again. What a reader can see is only what an element CHANGES about its inherited
  // type, so that is what is written; the value the browser resolves is unchanged, because each
  // level either declares its own or inherits its parent's, inductively, from the root down.
  const INHERITED = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color',
    'letter-spacing', 'text-align', 'text-transform', 'white-space', 'visibility']
  // the four borders and the outline: `<width> <style> <color>` / `<color> <style> <width>` — either
  // way, nothing is drawn when the style is `none`/`hidden` or the width is zero
  const EDGE = ['border-top', 'border-right', 'border-bottom', 'border-left', 'outline']
  const drawsNothing = (v) => {
    const t = String(v || '').trim()
    if (!t) return true
    if (/(^|\s)(none|hidden)(\s|$)/.test(t)) return true
    const w = /(^|\s)(-?[\d.]+)px(\s|$)/.exec(t)
    return !!w && Number(w[2]) === 0
  }
  const NODE_CAP = Number.isFinite(Number(caps.nodes)) ? Number(caps.nodes) : 1500
  const BYTE_CAP = Number.isFinite(Number(caps.bytes)) ? Number(caps.bytes) : 200000
  const HTML_NS = 'http://www.w3.org/1999/xhtml'

  // ── what is thrown away, and what may stay ────────────────────────────────────────────────────
  // dropped with their subtrees: everything that can execute, style, fetch or is document chrome
  const DROP = ['script', 'style', 'link', 'template', 'noscript', 'object', 'embed', 'meta', 'head', 'title']
  // the attribute allowlist: the svg geometry an icon is drawn from, the accessible name, our own
  // marks, and the two urls that can be safe (a data: src, an in-page #href). Everything else —
  // every on* handler, every id, every framework hook — is simply not copied.
  const ATTRS = ['viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points',
    'transform', 'opacity', 'fill-rule', 'clip-rule', 'alt', 'role', 'aria-label']
  const VOID = ['br', 'hr', 'img', 'area', 'base', 'col', 'source', 'track', 'wbr', 'input', 'link', 'meta']
  const has = (list, v) => list.indexOf(v) >= 0

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const escAttr = (s) => esc(s).replace(/"/g, '&quot;')
  const gp = (cs, p) => {
    try { return cs && typeof cs.getPropertyValue === 'function' ? String(cs.getPropertyValue(p) || '') : '' } catch { return '' }
  }
  const styleOf = (node, pseudo) => {
    if (!getComputedStyle) return null
    try { return pseudo ? getComputedStyle(node, pseudo) : getComputedStyle(node) } catch { return null }
  }
  const rectOf = (node) => {
    try {
      const r = node && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null
      return r || null
    } catch { return null }
  }

  // ── the ring, and the ringed element ──────────────────────────────────────────────────────────
  // THE RING IS WHERE THE ELEMENT IS NOW, the same rule spec/_layout-walk.mjs follows: a box painted
  // on a button reading "Publishing…" is stale the moment the button re-lays out to "Activate".
  let rb = ring ? { x: ring.x, y: ring.y, w: ring.width, h: ring.height } : null
  let focusEl = target || null
  if (focusEl) {
    const tr = rectOf(focusEl)
    if (tr && tr.width >= 1 && tr.height >= 1) rb = { x: tr.left, y: tr.top, w: tr.width, h: tr.height }
  }
  const OVERLAY = '__specboard-focus'
  // …and the capture's OWN INSTRUMENT (fix round 1, C2): the tag-default probe frame below is
  // appended to the app's body, and `serialise` walks a LIVE childNodes list — so on a body-rooted
  // capture it arrived as an extra last child and was written into the file as a 200x200 empty box,
  // in all 18 of this repo's init replicas. It is refused by id, exactly like the overlay.
  const PROBE = '__specboard-probe'
  if (!focusEl && rb && typeof doc.elementsFromPoint === 'function') {
    const cx = rb.x + rb.w / 2
    const cy = rb.y + rb.h / 2
    const rArea = Math.max(1, rb.w * rb.h)
    let hits = []
    try { hits = doc.elementsFromPoint(cx, cy) || [] } catch { hits = [] }
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i]
      if (!h || h.id === OVERLAY || (h.closest && h.closest('#' + OVERLAY))) continue
      const r = rectOf(h)
      if (!r) continue
      const ox = Math.max(0, Math.min(r.right, rb.x + rb.w) - Math.max(r.left, rb.x))
      const oy = Math.max(0, Math.min(r.bottom, rb.y + rb.h) - Math.max(r.top, rb.y))
      const area = Math.max(1, r.width * r.height)
      if ((ox * oy) / area >= 0.6 && area <= rArea * 4) { focusEl = h; break }
    }
  }

  // ── the SCENE ROOT ────────────────────────────────────────────────────────────────────────────
  // The smallest ANCESTOR of the ringed element whose box is at least 3× the ring (so the component
  // is shown in its own context, not cropped to the thing that was clicked) and no bigger than the
  // viewport (so a whole app shell is never the scene). Nothing qualifies — or nothing was ringed —
  // and the scene is the body, under the caps below.
  //
  // FIX ROUND 2, rule 1 (2026-09-03) — THE REGION GROWS MONOTONICALLY within a beat. `arg.minRegion`
  // is the union of every ring box the beat has rung so far (spec/_base.ts keeps it on CUR_CHECK);
  // the ancestor must ALSO CONTAIN that union, so a later moment's scene never shrinks back below
  // ground an earlier moment already covered — the reviewer's root cause 2 (task-2-review.md: "the
  // counter and the list are never in one scene"), made a non-issue by construction: once a beat has
  // rung both, every later moment's own Actual spans both too, so a rebuild (see below) always has
  // a big enough CURRENT scene to graft an earlier claim's fix back into.
  const MIN_REGION = (() => {
    const mr = arg && arg.minRegion
    if (!mr && !rb) return null
    if (!mr) return { x: rb.x, y: rb.y, w: rb.w, h: rb.h }
    if (!rb) return { x: mr.x, y: mr.y, w: mr.w, h: mr.h }
    const x0 = Math.min(mr.x, rb.x); const y0 = Math.min(mr.y, rb.y)
    const x1 = Math.max(mr.x + mr.w, rb.x + rb.w); const y1 = Math.max(mr.y + mr.h, rb.y + rb.h)
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  })()
  const containsRegion = (r, box) => !box || (
    r.left <= box.x + 0.5 && r.top <= box.y + 0.5 &&
    r.right >= box.x + box.w - 0.5 && r.bottom >= box.y + box.h - 0.5)
  const vw = (win && win.innerWidth) || 0
  const vh = (win && win.innerHeight) || 0
  const vArea = vw > 0 && vh > 0 ? vw * vh : Infinity
  let root = null
  if (focusEl) {
    const rArea = rb ? Math.max(1, rb.w * rb.h) : 0
    for (let a = focusEl.parentElement; a; a = a.parentElement) {
      const r = rectOf(a)
      if (!r) continue
      const area = r.width * r.height
      if (area >= rArea * 3 && area <= vArea && containsRegion(r, MIN_REGION)) { root = a; break }
    }
  }
  if (!root) root = doc.body || null
  if (!root) return null
  const rootRect = rectOf(root)
  // WHAT IS BEING PICTURED (phase 3, section F; corrected in fix round 1, I3/C3): the scene root's
  // box CLIPPED TO THE VIEWPORT, and then given 2 px of slack on each side.
  //
  // The plan's scene root is "no bigger than the viewport" and the photograph beside the replica
  // shows the viewport only, so a body-rooted scene 3000 px tall was carrying two thirds of a
  // document nobody can see. The first attempt at this clip was reverted because it dropped a row's
  // `<span class="id">R1</span>` — it begins at y=900.45 on a 900 px viewport — and its two visible
  // siblings then slid 33 px left, their flex row having lost its first item. Two things make the
  // clip safe now: the 2 px tolerance keeps exactly that hairline case, and everything skipped
  // leaves a PLACEHOLDER that holds its space, so the flow of what IS in view cannot move.
  //
  // (The comment this replaces claimed the skip covered "everything below the fold of a body-rooted
  // scene". It did not — `VIS` was the root's own rect, so on this repo, where every init region is
  // `0 0 1440 1890`, nothing below the fold was outside it and nothing was skipped. Rule 6: the
  // comment was describing an intention, not the code. The 30 KB the init files did lose came from
  // the parent-diffed inherited properties and the invisible-edge rule, not from this.)
  const VIS_PAD = 2
  const VIS = (() => {
    if (!rootRect) return null
    const box = { x: rootRect.left, y: rootRect.top, w: rootRect.width, h: rootRect.height }
    let out = box
    if (vw > 0 && vh > 0) {
      const x0 = Math.max(box.x, 0); const y0 = Math.max(box.y, 0)
      const x1 = Math.min(box.x + box.w, vw); const y1 = Math.min(box.y + box.h, vh)
      if (x1 > x0 && y1 > y0) out = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    }
    return { x: out.x - VIS_PAD, y: out.y - VIS_PAD, w: out.w + VIS_PAD * 2, h: out.h + VIS_PAD * 2 }
  })()

  // ── the style diff ────────────────────────────────────────────────────────────────────────────
  // Each element's computed values against a PROBE of the same tag+namespace — so what rides out is
  // only what the app's own stylesheets actually say. Identical declaration sets share one class, and
  // the css is one <style> the file carries with it (no external URL is reachable from a sandboxed
  // iframe anyway, and a page that could fetch one would not be sanitised).
  //
  // THE PROBE LIVES WHERE THE REPLICA WILL BE READ (phase 3, 2026-09-03 — found by the gate itself,
  // on this repo's own init page: every replica's topbar came back 90 px tall against the live 61,
  // and every word under it was 15 px low). The probe used to be appended to the APP'S OWN BODY, so
  // it inherited the app's global rules — and a value the app sets on EVERY element (`*{box-sizing:
  // border-box}`, a reset's `margin:0`, Tailwind's `border-width:0`) is then identical on the probe
  // and on the element, diffed away as "the default", and simply absent from the file. In the empty
  // iframe the replica is actually rendered in there is no such reset, so every padded or bordered
  // box grew by its own padding and border and pushed the page down. The diff is only meaningful
  // against the environment the file will be read in, so the probes live in a hidden about:blank
  // iframe — a document with the UA's stylesheet and nothing else, exactly like the frame the gate
  // and the board mount. A page that will not give us one (a CSP that forbids frames) falls back to
  // the old in-page probe: fewer declarations, but never a thrown capture.
  const defaults = {}
  let probeFrame = null
  let probeDoc = null
  let probeStyle = null
  let probeTried = false
  const probeEnv = () => {
    if (probeTried) return probeDoc
    probeTried = true
    try {
      const f = doc.createElement('iframe')
      f.id = PROBE                                   // …and never serialised (fix round 1, C2)
      f.setAttribute('aria-hidden', 'true')
      f.setAttribute('tabindex', '-1')
      f.setAttribute('style', 'position:fixed;left:-99999px;top:0;width:200px;height:200px;border:0;opacity:0;pointer-events:none;z-index:-1')
      doc.body.appendChild(f)
      const d = f.contentDocument
      const w = f.contentWindow
      if (d && d.body && w && typeof w.getComputedStyle === 'function') {
        probeFrame = f
        probeDoc = d
        probeStyle = (node) => { try { return w.getComputedStyle(node) } catch { return null } }
      } else { f.remove() }
    } catch { probeDoc = null }
    return probeDoc
  }
  const dropProbe = () => {
    if (probeFrame) { try { probeFrame.remove() } catch { /* already gone */ } }
    probeFrame = null
    probeDoc = null
  }
  const defaultsOf = (tag, ns) => {
    const key = (ns || HTML_NS) + '|' + tag
    if (defaults[key]) return defaults[key]
    let d = {}
    if (defaultsFor) {
      try { d = defaultsFor(tag, ns || HTML_NS) || {} } catch { d = {} }
    } else {
      const pd = probeEnv()
      const host = pd || doc
      const read = pd ? probeStyle : styleOf
      if (host.createElementNS && host.body && host.body.appendChild) {
        try {
          const probe = host.createElementNS(ns || HTML_NS, tag)
          host.body.appendChild(probe)
          const cs = read(probe)
          for (const p of PROPS) d[p] = gp(cs, p)
          probe.remove()
        } catch { d = {} }
      }
    }
    defaults[key] = d
    return d
  }
  const seen = new Map()          // declaration text → class name
  const RULES = []                // the sheet, in the order the classes were minted
  // ── the walk's budget ─────────────────────────────────────────────────────────────────────────
  // `bytes` is what the FILE will cost, counted as it is spent: every class's rule, every text node,
  // and each element's own markup (its inner is counted by the children that produced it, never
  // twice). MARGIN keeps the last element from carrying the total past the cap — the file the caller
  // is promised is "≤ caps.bytes", not "≤ caps.bytes plus whatever the last node happened to weigh".
  let nodes = 0
  let bytes = 0
  let truncated = false
  const families = new Set()
  const MARGIN = 4000
  const TEXT_MAX = 2000           // one text node's share: a picture of a component, not a document
  const capped = () => truncated || nodes >= NODE_CAP || bytes >= BYTE_CAP - MARGIN
  const spend = (s) => { bytes += s.length; return s }
  // AN INLINE PICTURE RIDES ONLY WHILE THE BUDGET CAN AFFORD IT (fix round 1, F4). A `data:` src is
  // unbounded — one screenshot pasted into a page is megabytes — and it is emitted as ONE attribute,
  // so the walk's per-element check could not stop it carrying the finished file past caps.bytes.
  // Above DATA_MAX, or with too little budget left, the element becomes the plate of its own box:
  // an honest "a picture is here", exactly what an uncapturable canvas already gets.
  const DATA_MAX = 32000
  const affordable = (url) => String(url).slice(0, 5) === 'data:' &&
    String(url).length <= DATA_MAX && bytes + String(url).length <= BYTE_CAP - MARGIN
  // AN ICON VS A PICTURE (fix round 2, item 4) — matches spec/_layout-walk.mjs's own ICON_MAX, so
  // the skeleton and the replica agree on where "the app's own inline icon" ends and "a diagram" —
  // never something specboard's own capture unrolls shape by shape — begins. See the svg branch
  // below, in `serialise`.
  const SVG_ICON_MAX = 64
  const classOf = (cs, tag, ns, parentCs, isRoot, extra) => {
    if (!cs || !PROPS.length) return ''
    const d = defaultsOf(tag, ns)
    const out = []
    for (const p of PROPS) {
      const v = gp(cs, p)
      if (!v) continue                                  // a value the page will not answer for is not a declaration
      const inh = has(INHERITED, p)
      // AN EDGE THAT PAINTS NOTHING IS NOT A DECLARATION (phase 3, section F). With the probes in an
      // about:blank frame every class of a reset-styled app carries four `border-<side>:0px none
      // rgb(…)` and an `outline:… none 3px` — ~190 bytes per class for something no reader can see.
      // A zero-width or `none`-styled edge draws nothing, so where the TAG's own default draws
      // nothing either the declaration changes no pixel. Where it DOES — a UA-bordered <input> the
      // app has reset to 0 — it stays, or the replica would sprout a border the app removed.
      if (EDGE.indexOf(p) >= 0 && drawsNothing(v) && drawsNothing(String(d[p] == null ? '' : d[p]))) continue
      // THE SCENE ROOT CARRIES ITS WHOLE INHERITED SET (section F). It is read in an EMPTY iframe —
      // the board's, and the gate's — where nothing sets the app's type, and its own tag default was
      // measured with a probe INSIDE the app, which already inherits it. Diffing there would drop
      // precisely the app's own font and leave the file dependent on a page it will never be in.
      if (inh && isRoot) { out.push(p + ':' + v); continue }
      const against = inh && parentCs ? gp(parentCs, p) : String(d[p] == null ? '' : d[p])
      if (v === against) continue
      out.push(p + ':' + v)
    }
    // …and whatever the caller has to say about this element that its own computed style cannot —
    // today only a scrolled parent's offset (see `serialise`), appended last so it wins over the
    // `margin` shorthand above and so the declaration SET still keys the shared class correctly.
    for (const e of (extra || [])) if (e) out.push(e)
    return classFor(out)
  }
  // …and the ONE place a class is minted, whatever the declarations were derived from: the style
  // diff above, or the synthetic set a placeholder is made of (below).
  const classFor = (decls) => {
    const list = (decls || []).filter(Boolean)
    if (!list.length) return ''
    const decl = list.join(';')
    let cls = seen.get(decl)
    if (!cls) {
      cls = 'r' + seen.size
      seen.set(decl, cls)
      RULES.push({ cls, decl })
      bytes += decl.length + cls.length + 8              // `.rep .rN{…}\n`
    }
    return cls
  }

  // one element's opening tag from an allowlisted attribute set
  const open = (tag, attrs) => {
    let s = '<' + tag
    for (const [k, v] of attrs) if (v != null) s += ' ' + k + '="' + escAttr(v) + '"'
    return s + '>'
  }
  const wrap = (tag, attrs, inner) => has(VOID, tag) && !inner
    ? open(tag, attrs).slice(0, -1) + '/>'
    : open(tag, attrs) + inner + '</' + tag + '>'

  // ── THE OUTPUT TREE ───────────────────────────────────────────────────────────────────────────
  // The walk builds a DETACHED TREE OF OUR OWN NODES and serialises it at the end, rather than
  // concatenating markup as it goes (which is what phase 1 did). Phase 2 needs a tree: the Expected
  // half is this same tree CLONED and edited — a leaf's words swapped, a row put back beside the
  // ring — and string surgery on finished markup is how a sanitiser quietly gets re-opened.
  //
  // The nodes are PLAIN OBJECTS, not DOM ones. The brief said "cloneNode(true) in the page; the stub
  // DOM needs a cloneNode"; a plain-object tree needs no document to build at all, clones as a pure
  // function in the page and in a node test alike, and — the reason that matters — keeps every text
  // RAW until serialisation, so a claim matches `got` against the words a reader actually sees
  // rather than against escaped markup.
  const T = (text) => ({ text: String(text) })
  const E = (tag, attrs, kids) => ({ tag, attrs, kids })
  const isText = (n) => !!n && typeof n.text === 'string'
  // AN INTER-ELEMENT WHITESPACE TEXT NODE STILL SEPARATES TWO WORDS (fix round 3, board R18/R10,
  // 2026-09-03 — the gate's own catch, found by re-rendering a gapped `.actual.html` back through
  // the same walk it is measured with). "<span>When</span> <span>you open…</span>" in the live DOM
  // carries a real space between the two spans; the walk below only kept a text node whose trimmed
  // content was non-empty, so a WHITESPACE-ONLY node — exactly this one — was dropped outright and
  // the replica serialised as "<span>When</span><span>you open…</span>", glued with no gap at all.
  // Glued, "When" and "you" run together for line-wrapping purposes, so the sentence wraps one word
  // earlier than the live page did and its rendered bounding box comes out narrower — a `moved-text`
  // gap with the right text at the wrong box, on every beat sentence (`.lead` + its text) the board
  // draws. Only relevant between two elements that actually FLOW INLINE with each other — dropping
  // it between two `display:block` siblings changes nothing a reader could see (inline whitespace
  // never renders a gap there), so it stays a no-op, no added bytes, for the common block-nested case.
  const isInlineFlow = (n) => {
    if (!n || n.nodeType !== 1 || !getComputedStyle) return false
    try {
      const cs = getComputedStyle(n)
      const d = cs && typeof cs.getPropertyValue === 'function' ? String(cs.getPropertyValue('display') || '') : ''
      return /^(inline|inline-block|inline-flex|inline-grid|inline-table)$/.test(d)
    } catch { return false }
  }
  const ser = (n) => isText(n) ? esc(n.text) : wrap(n.tag, n.attrs, n.kids.map(ser).join(''))
  const cloneNode = (n) => isText(n) ? T(n.text) : E(n.tag, n.attrs.map(a => [a[0], a[1]]), n.kids.map(cloneNode))
  // what an element's OWN markup costs, counted once as the node is made (its inner is counted by
  // the children that produced it) — byte for byte what the string walk used to add
  const costOf = (tag, attrs, kids) => has(VOID, tag) && !kids.length
    ? open(tag, attrs).length + 1
    : open(tag, attrs).length + tag.length + 3

  // the two pseudo-elements a page draws its ticks, bullets and separators with: materialised as a
  // span carrying the quoted string, with its own diffed class, so the picture shows what a reader
  // sees rather than an empty box where the CSS drew a ✓
  const pseudo = (node, which, hostCs) => {
    const cs = styleOf(node, '::' + which)
    if (!cs) return null
    const raw = gp(cs, 'content').trim()
    const m = /^"([\s\S]*)"$|^'([\s\S]*)'$/.exec(raw)
    const text = m ? (m[1] != null ? m[1] : m[2]) : ''
    if (!text) return null
    // a pseudo-element inherits from the element it is drawn on, so that is what it is diffed against
    const cls = classOf(cs, 'span', HTML_NS, hostCs, false)
    const attrs = [['class', cls || null], ['data-pseudo', which]]
    const kids = [T(text)]
    bytes += esc(text).length + costOf('span', attrs, kids)
    return E('span', attrs, kids)
  }

  // A BOX THAT HOLDS SPACE AND PAINTS NOTHING — what an element the picture does not show is worth
  // (see the note in `serialise`). Its declarations are SYNTHETIC, not diffed: the element's own
  // display (an inline one blockified so a size means anything), its measured border box, and its
  // margins, so the flow after it is unchanged. Nothing about its paint travels, and its subtree is
  // dropped — which is the whole saving.
  const placeholder = (node, cs, shift, r0) => {
    const r = r0 || rectOf(node)
    if (!r || (r.width < 1 && r.height < 1)) return null
    if (capped()) { truncated = true; return null }
    nodes++
    let dsp = (cs && gp(cs, 'display')) || 'block'
    if (dsp === 'inline' || dsp === 'contents' || !dsp) dsp = 'inline-block'
    const mt = (cs && parseFloat(gp(cs, 'margin-top'))) || 0
    const ml = (cs && parseFloat(gp(cs, 'margin-left'))) || 0
    const decls = [
      'display:' + dsp,
      'box-sizing:border-box',
      'width:' + Math.round(r.width) + 'px',
      'height:' + Math.round(r.height) + 'px',
      'margin:' + ((shift && shift.top ? mt - shift.top : mt)) + 'px ' +
        ((cs && parseFloat(gp(cs, 'margin-right'))) || 0) + 'px ' +
        ((cs && parseFloat(gp(cs, 'margin-bottom'))) || 0) + 'px ' +
        ((shift && shift.left ? ml - shift.left : ml)) + 'px'
    ]
    const attrs = [['class', classFor(decls) || null], ['data-plate', 'space']]
    bytes += costOf('div', attrs, [])
    return E('div', attrs, [])
  }

  const serialise = (node, isRoot, parentCs, shift) => {
    if (!node || node.nodeType !== 1) return null
    // OUR OWN CHROME IS NOT THE APP'S DOM (fix round 1, F2). The narration overlay — the ring, the
    // veil and the callout card — is painted INTO the page under test, so a capture whose scene root
    // reaches <body> would serialise it as part of the component. spec/_layout-walk.mjs has refused
    // to measure it since it existed; this is the same refusal, subtree included.
    if (node.id === OVERLAY || node.id === PROBE) return null
    const tag = String(node.tagName || '').toLowerCase()
    if (!tag || has(DROP, tag)) return null
    const cs = styleOf(node)
    // WHAT THE PAGE DOES NOT SHOW IS NOT IN THE REPLICA — the same reading the skeleton walk makes,
    // so the two pictures of one moment agree about what was on screen.
    //
    // …BUT IT STILL HOLDS ITS SPACE (phase 3, 2026-09-03). `display:none` takes none, so it goes
    // whole. Everything else here — faded to nothing, `visibility:hidden`, and the off-region skip
    // below — is laid out exactly as if it were visible, and dropping it slides every sibling after
    // it: Tsumiki's row buttons are `opacity:0` until hover, and this repo's own init page has a row
    // whose first span begins half a pixel below the fold. So they are emitted as a PLACEHOLDER —
    // one empty box of the same size, in the same flow, painting nothing, its subtree (the expensive
    // part) dropped. `placeholder` is below `serialise`'s own helpers, so it is defined by the time
    // this runs.
    if (cs) {
      if (gp(cs, 'display') === 'none') return null
      const vis = gp(cs, 'visibility')
      if (vis === 'hidden' || vis === 'collapse') return placeholder(node, cs, shift)
      const op = parseFloat(gp(cs, 'opacity'))
      if (Number.isFinite(op) && op <= 0.02) return placeholder(node, cs, shift)
    }
    const r = rectOf(node)
    // AN ELEMENT NOBODY CAN SEE COSTS NOTHING (phase 3, section F). A virtualised grid's off-screen
    // rows, a collapsed drawer's content, everything below the fold of a body-rooted scene: the live
    // skeleton the gate compares against never measured any of it (the walk drops what is off-screen),
    // the photograph beside it does not show it, and on dojostack it was most of a 197 KB file. So an
    // element with a SIZE that does not intersect what is being pictured is skipped with its subtree.
    // A ZERO-SIZED box is still descended — 0.42.1's rule: a `min-w-0` flex wrapper measures 0 wide
    // and its children are exactly what the scene is of.
    if (!isRoot && r && r.width >= 1 && r.height >= 1 && VIS &&
      !(r.right > VIS.x && r.left < VIS.x + VIS.w && r.bottom > VIS.y && r.top < VIS.y + VIS.h)) {
      return placeholder(node, cs, shift, r)
    }
    if (capped()) { truncated = true; return null }
    nodes++
    const fam = gp(cs, 'font-family')
    if (fam) for (const f of fam.split(',')) families.add(f.trim().replace(/^["']|["']$/g, '').toLowerCase())
    const ns = node.namespaceURI || HTML_NS

    // what tag this element is EMITTED as — the diff is taken against that tag's defaults, so a
    // plate div or a control span is styled as the div or the span it will actually be rendered as
    let emit = tag
    let kids = null                                    // non-null: the children are already decided
    const extra = []                                   // our own marks, after the allowlisted attrs
    const box = r ? [['width', Math.round(r.width) + 'px'], ['height', Math.round(r.height) + 'px']] : []

    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      // THE VALUE THE ASSERTION READ (spec/_base.ts shownText reads exactly this), as text: a live
      // control is never emitted, and an empty one shows its placeholder marked as one so a reader
      // cannot mistake the hint for something a person typed.
      emit = 'span'
      let v = ''
      if (tag === 'select') {
        const sel = node.selectedOptions && node.selectedOptions[0]
        v = sel ? String(sel.textContent == null ? '' : sel.textContent) : ''
      } else {
        v = node.value == null ? '' : String(node.value)
      }
      extra.push(['data-control', tag])
      if (!v) {
        const ph = (node.getAttribute && node.getAttribute('placeholder')) || node.placeholder || ''
        if (ph) { v = String(ph); extra.push(['data-ph', '1']) }
      }
      const shown = v.replace(/\s+/g, ' ').trim()
      bytes += esc(shown).length
      kids = shown ? [T(shown)] : []
    } else if (tag === 'canvas') {
      // a canvas that can hand over its own pixels is shown as those pixels; one that cannot (tainted,
      // webgl, a stub) is a plate the size of its box — never a blank element pretending to be the art
      let url = ''
      try { url = typeof node.toDataURL === 'function' ? String(node.toDataURL() || '') : '' } catch { url = '' }
      if (affordable(url)) { emit = 'img'; extra.push(['src', url]) } else { emit = 'div'; extra.push(['data-plate', 'canvas'], ...box) }
      kids = []
    } else if (tag === 'iframe' || tag === 'video') {
      emit = 'div'; extra.push(['data-plate', tag], ...box); kids = []
    } else if (tag === 'img') {
      const src = String((node.getAttribute && node.getAttribute('src')) || '')
      if (affordable(src)) { extra.push(['src', src]) } else { emit = 'div'; extra.push(['data-plate', 'img'], ...box) }
      kids = []
    } else if (tag === 'svg' && (!r || r.width > SVG_ICON_MAX || r.height > SVG_ICON_MAX)) {
      // "NOTHING SPECBOARD DRAWS MAY BE SVG. The app's own inline <svg> icons inside a replica are
      // the component and stay" (constraints.md) — but an ICON is small, and the census's byte hog
      // was not one: the board's own drawn schematic, embedded in its Focus reader for R18–R22's
      // dogfooding, is a 488×305 diagram with 400+ rect/text/path shapes — one ring, 80 KB of style
      // rules and 124 KB of markup, on its own (fix round 2, item 4). SVG_ICON_MAX matches the
      // layout skeleton's own icon/picture boundary (spec/_layout-walk.mjs ICON_MAX) so both halves
      // draw the line in the same place. Plated exactly like an uncapturable canvas — the box it
      // occupies, nothing more: honest ("a picture is here" is true of a diagram too) and bounded
      // (a chart's byte cost no longer depends on how many shapes it happens to have).
      emit = 'div'; extra.push(['data-plate', 'svg'], ...box); kids = []
    }

    // A SCROLLED CONTAINER KEEPS ITS SCROLL (phase 3, 2026-09-03 — the gate's second catch, on this
    // repo's own init page: the setup drawer's panel sits 234 px down its own scroll, so the live
    // skeleton measured every word in it 234 px above where the replica rendered them — 24 gaps in
    // one file, all the same offset). A replica has no script and no scrollbar to restore, so the
    // scroll is baked into the FLOW: the first child of a scrolled box starts at its own margin
    // minus the scroll, which is exactly where the browser draws it. The children after it follow,
    // in normal flow and in a column flex alike. A scrolled GRID is a known limit — its items are
    // placed by track, not by the margin of the one before them — and the gate will say so rather
    // than the file quietly lying.
    const xdecl = []
    if (shift && (shift.top || shift.left)) {
      if (shift.top) xdecl.push('margin-top:' + ((parseFloat(gp(cs, 'margin-top')) || 0) - shift.top) + 'px')
      if (shift.left) xdecl.push('margin-left:' + ((parseFloat(gp(cs, 'margin-left')) || 0) - shift.left) + 'px')
    }
    const cls = classOf(cs, emit, emit === tag ? ns : HTML_NS, parentCs, !!isRoot, xdecl)
    // the allowlisted attributes of the ORIGINAL element, only where the element still is itself
    const attrs = [['class', cls || null]]
    if (emit === tag && node.getAttributeNames) {
      let names = []
      try { names = node.getAttributeNames() || [] } catch { names = [] }
      for (const n of names) {
        if (!has(ATTRS, n)) continue
        const v = node.getAttribute(n)
        if (v == null) continue
        const s = String(v)
        // no url ever travels except a data: one, and no handler ever does
        if (/^\s*javascript:/i.test(s) || /https?:\/\//i.test(s) || /^\s*\/\//.test(s)) continue
        attrs.push([n, s])
      }
      // an in-page href is the one link that can stay; anything else is dropped with the attribute
      if (tag === 'a' && node.getAttribute) {
        const href = String(node.getAttribute('href') || '')
        if (href.charAt(0) === '#') attrs.push(['href', href])
      }
    }
    for (const e of extra) attrs.push(e)
    if (node === focusEl) attrs.push(['data-ring', '1'])

    if (kids == null) {
      const out = []
      const before = pseudo(node, 'before', cs)
      if (before) out.push(before)
      // a shadow root REPLACES the light children in the picture, because that is what the browser
      // paints; slotted content is a known gap of this phase, noted rather than guessed at
      const src = node.shadowRoot && node.shadowRoot.childNodes && node.shadowRoot.childNodes.length
        ? node.shadowRoot.childNodes
        : (node.childNodes || [])
      // this element's own scroll, handed to the FIRST child it serialises (see the note above)
      const sTop = Math.round(Number(node.scrollTop) || 0)
      const sLeft = Math.round(Number(node.scrollLeft) || 0)
      let toShift = (sTop || sLeft) ? { top: sTop, left: sLeft } : null
      // a materialised ::before is always inline content, so a whitespace node right after it can
      // still separate it from the first real child (see `isInlineFlow` above)
      let prevWasInline = !!before
      let pendingSpace = false
      for (let i = 0; i < src.length; i++) {
        if (capped()) { truncated = true; break }
        const k = src[i]
        if (!k) continue
        if (k.nodeType === 3) {
          const t = String(k.textContent == null ? '' : k.textContent)
          if (t.trim()) {
            const kept = t.replace(/\s+/g, ' ').slice(0, TEXT_MAX)
            bytes += esc(kept).length
            out.push(T(kept))
            prevWasInline = true
            pendingSpace = false
          } else if (t.length && out.length) {
            // resolved once the NEXT node is seen — a text node is always inline, an element only if
            // it flows inline too (see `isInlineFlow`)
            pendingSpace = prevWasInline
          }
          continue
        }
        if (k.nodeType !== 1) continue
        const inlineNow = isInlineFlow(k)
        if (pendingSpace && inlineNow) { bytes += 1; out.push(T(' ')) }
        pendingSpace = false
        const child = serialise(k, false, cs, toShift)
        if (child) { out.push(child); if (child.tag) toShift = null }
        prevWasInline = inlineNow
      }
      const after = pseudo(node, 'after', cs)
      if (after) out.push(after)
      kids = out
    }
    // FIX ROUND 3 — every TEXT LEAF, and every data-ring/plate/control node, carries its own box
    // compactly: `data-b="x,y,w,h"` (viewport px, integers), counted like any other attribute
    // against the byte cap. This is what makes a claim locatable by GEOMETRY rather than by text —
    // a base is a scene that was RIGHT, so it never shows a wrong value's `got` text at all; only
    // its POSITION is trustworthy across a chain of captures (the controller, fix round 3).
    const isTextLeaf = kids.length > 0 && kids.every(isText)
    const marked = attrs.some(a => a[0] === 'data-ring' || a[0] === 'data-plate' || a[0] === 'data-control')
    if ((isTextLeaf || marked) && r) {
      attrs.push(['data-b', Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + ',' + Math.round(r.height)])
    }
    bytes += costOf(emit, attrs, kids)
    const made = E(emit, attrs, kids)
    if (isRoot) made.cls = cls
    return made
  }

  // ── THE CLAIM MACHINERY (fix round 1) ─────────────────────────────────────────────────────────
  // Everything below reads and edits a TREE — a clone of the tree this capture just built, or a BASE
  // tree parsed back from an earlier moment's html (see below). `clean` is the skeleton walk's rule
  // (collapse whitespace, trim), so what a claim matches against is the words a reader sees.
  const clean = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim()
  const textOf = (n) => isText(n) ? n.text : n.kids.map(textOf).join('')
  const elemsIn = (n) => { const out = []; const walk = (x) => { if (isText(x)) return; out.push(x); for (const k of x.kids) walk(k) }; walk(n); return out }
  const isLeaf = (n) => !n.kids.some(k => !isText(k))
  const setAttr = (n, k, v) => { for (const a of n.attrs) if (a[0] === k) { a[1] = v; return } n.attrs.push([k, v]) }
  const parents = new Map()
  const link = (n) => { if (isText(n)) return; for (const k of n.kids) { parents.set(k, n); link(k) } }
  const findRing = (n) => {
    for (const e of elemsIn(n)) for (const a of e.attrs) if (a[0] === 'data-ring' && a[1] === '1') return e
    return null
  }
  const firstMatch = (list, pred) => { for (const l of list) if (pred(l)) return l; return null }
  // the leaf a claim's `got` names: scoped by the tree's OWN data-ring marker first (a base tree
  // carries no boxes — the mark IS its "ring box" now) and, failing that, anywhere in the tree.
  const scopedLeaf = (rootNode, pred) => {
    const ringNode = findRing(rootNode)
    if (ringNode) {
      const l = firstMatch(elemsIn(ringNode).filter(isLeaf), pred)
      if (l) return { leaf: l, ringNode }
    }
    const l2 = firstMatch(elemsIn(rootNode).filter(isLeaf), pred)
    return l2 ? { leaf: l2, ringNode } : null
  }
  // the intended value takes the app's, in place: the whole text when the claim read the whole text,
  // else the substring, else — the words ran across several nodes — the leaf simply says the
  // intended value. Never a silent no-op.
  const swapLeaf = (n, got, want) => {
    if (got && clean(textOf(n)) !== got) {
      for (const k of n.kids) if (isText(k) && k.text.indexOf(got) >= 0) { k.text = k.text.replace(got, want); return }
    }
    n.kids = [T(want)]
  }
  const swapDirect = (n, got, want) => { for (const k of n.kids) if (isText(k) && k.text.indexOf(got) >= 0) k.text = k.text.replace(got, want) }
  const ROW_TAGS = ['li', 'tr', 'option']
  const ROW_ROLES = ['row', 'listitem', 'option', 'gridcell']
  // the nearest ancestor that reads as ONE ROW — else the element itself (fix round 1, I2: the
  // stub's own `<li>` fixture used to be the only shape this could ever pass on).
  const climbToRow = (n, rootNode) => {
    for (let a = parents.get(n); a && a !== rootNode; a = parents.get(a)) {
      if (ROW_TAGS.indexOf(a.tag) >= 0) return a
      const role = a.attrs.find(x => x[0] === 'role')
      if (role && ROW_ROLES.indexOf(role[1]) >= 0) return a
    }
    return n
  }
  // the element that IS the thing a `missing` claim names: its clean text equals the expected words;
  // failing that, the SMALLEST element that still contains them (the brief's "first in document
  // order" is always the outermost one — the whole scene).
  const findByText = (rootNode, want) => {
    const wanted = clean(want)
    if (!wanted) return null
    const all = elemsIn(rootNode).filter(e => e !== rootNode)
    for (const e of all) if (clean(textOf(e)) === wanted) return e
    let best = null; let bestN = Infinity
    for (const e of all) {
      if (clean(textOf(e)).indexOf(wanted) < 0) continue
      const n = elemsIn(e).length
      if (n < bestN) { best = e; bestN = n }          // fix round 1, M3: '<' keeps the FIRST of a tie
    }
    return best
  }

  // ── FIX ROUND 3: LOCATE BY GEOMETRY, NEVER BY TEXT ────────────────────────────────────────────
  // A base is a scene that was RIGHT, so it never shows a wrong value's `got` at all — searching a
  // base's text for `got` (round 1/2's `scopedLeaf`) was always going to fail there, and the bounded
  // fallback that caught the failure rewrote whatever leaf the stale ring happened to be nearest,
  // which is what corrupted a just-restored title twice over (task-2-report.md, fix rounds 1 and 2).
  // What a base CAN be trusted to have right is POSITION — `data-b`, recorded on every text leaf and
  // every data-ring/plate/control node at capture time (see `serialise`) — so a wrong-value claim is
  // now found by where its OWN ring box was, in ANY tree (a base or the current Actual), never by
  // what the text says.
  const unlocated = new Set()
  const attrBox = (n) => {
    if (!n || isText(n)) return null
    const a = n.attrs.find(x => x[0] === 'data-b')
    if (!a) return null
    const p = String(a[1]).split(',').map(Number)
    if (p.length !== 4 || p.some(x => !Number.isFinite(x))) return null
    return { x: p[0], y: p[1], w: p[2], h: p[3] }
  }
  const ringBoxOf = (ring) => {
    if (!ring || ring.x == null || ring.y == null) return null
    const w = ring.width != null ? ring.width : ring.w
    const h = ring.height != null ? ring.height : ring.h
    if (!(w >= 0) || !(h >= 0)) return null
    return { x: ring.x, y: ring.y, w, h }
  }
  // the fraction of the LEAF's OWN area that lies inside the ring box — a leaf counts once ≥60% of
  // itself is covered, so a ring drawn slightly loose around a small leaf still finds it.
  const overlapFrac = (leafBox, ringBox) => {
    const ix0 = Math.max(leafBox.x, ringBox.x); const iy0 = Math.max(leafBox.y, ringBox.y)
    const ix1 = Math.min(leafBox.x + leafBox.w, ringBox.x + ringBox.w)
    const iy1 = Math.min(leafBox.y + leafBox.h, ringBox.y + ringBox.h)
    const iw = Math.max(0, ix1 - ix0); const ih = Math.max(0, iy1 - iy0)
    const leafArea = Math.max(1, leafBox.w * leafBox.h)
    return (iw * ih) / leafArea
  }
  // candidates: TEXT LEAVES — an element whose children are all text and whose words are not empty —
  // whose `data-b` lies ≥60% inside `ringBox`. A `data-control`/`data-plate` node carries a box too
  // (the board places it by that box), but it is not something a claim's words can be read off, so it
  // is never a candidate (fix round 4, N2). Pick (a) one whose clean text contains `got`, else (b) one
  // whose clean text ALREADY contains `expected` (nothing to change — mark it and stop). There is no
  // (c): FIX ROUND 4 (N2) DELETED THE LARGEST-OVERLAP FALLBACK. A base's `data-b` boxes are an OLDER
  // layout — delete a row and every row under it moves up, so the claim's own ring box lands on the
  // base's PREVIOUS occupant — and rewriting that leaf with the requirement's word overwrites the very
  // row the requirement says must still be listed (task-2-rereview.md, NEW-2). `null` — nothing under
  // the ring carries `got` or `expected` — is the caller's cue to flag the claim `unlocated`: a false
  // Expected is worse than an honest gap.
  // (named apart from `serialise`'s own local `isTextLeaf` boolean — same rule, a predicate here)
  const isWordedLeaf = (n) => !isText(n) && n.kids.length > 0 && n.kids.every(isText) && !!clean(textOf(n))
  const locateByBox = (rootNode, ringBox, got, want) => {
    if (!ringBox) return null
    const candidates = []
    for (const e of elemsIn(rootNode)) {
      if (!isWordedLeaf(e)) continue
      const b = attrBox(e)
      if (!b) continue
      const f = overlapFrac(b, ringBox)
      if (f >= 0.6) candidates.push({ node: e, frac: f })
    }
    if (!candidates.length) return null
    if (got) {
      const byGot = firstMatch(candidates, c => clean(textOf(c.node)).indexOf(got) >= 0)
      if (byGot) return { node: byGot.node, already: false }
    }
    if (want) {
      const byWant = firstMatch(candidates, c => clean(textOf(c.node)).indexOf(want) >= 0)
      if (byWant) return { node: byWant.node, already: true }
    }
    return null
  }
  // is `n` (or an ancestor of it, short of `rootNode`) already marked by SOME claim? A row this
  // same beat already touched is not "the spot's current occupant" — it is the thing a later
  // insertion needs to land AFTER, never something to be spliced in front of.
  const hasClaimedAncestor = (n, rootNode) => {
    for (let a = n; a && a !== rootNode; a = parents.get(a)) {
      if (!isText(a) && a.attrs.some(x => x[0] === 'data-claim')) return true
    }
    return false
  }
  // rule 3's new insertion point: the element whose `data-b` box is NEAREST BELOW the ring box's
  // top, inside this tree (the spot's current occupant — the row that moved up to fill a deleted
  // row's place, found here by geometry alone, no live page needed). Candidates are bounded to the
  // ring's own COLUMN (their box must overlap the ring box's x-range) — without it, a header far to
  // the side at the same y as a shifted row would out-rank the row it is actually looking for, just
  // because "nearest" compared only one axis. EXCLUDES anything this same beat has already marked
  // (the ring's own element still sitting there is not "the spot's current occupant" — it is the
  // thing a later insertion lands AFTER, never something to splice in front of), and the raw leaf
  // found is climbed to its own row (`climbToRow`) so a clone lands BESIDE a row, never nested
  // inside an unrelated one — else the tree's own end.
  const insertNearestBelow = (rootNode, ringBox, made) => {
    let target = null
    if (ringBox) {
      let bestTop = Infinity
      for (const e of elemsIn(rootNode)) {
        if (e === rootNode) continue
        const b = attrBox(e)
        if (!b || b.y < ringBox.y - 0.5) continue
        const xOverlap = Math.max(b.x, ringBox.x) < Math.min(b.x + b.w, ringBox.x + ringBox.w)
        if (!xOverlap) continue
        if (hasClaimedAncestor(e, rootNode)) continue
        if (b.y < bestTop) { bestTop = b.y; target = e }
      }
      if (target) target = climbToRow(target, rootNode)
    }
    const parent = (!target || target === rootNode) ? null : parents.get(target)
    const siblings = parent ? parent.kids : rootNode.kids
    const at = target ? (parent ? siblings.indexOf(target) : siblings.length) : siblings.length
    siblings.splice(Math.max(0, at), 0, made)
    parents.set(made, parent || rootNode)
    link(made)
  }

  // ONE CLAIM, applied to ONE tree, IN PLACE — never a loop over a claims array. That loop is what
  // replayed a stale claim against a scene it was never made on (fix round 1, C1/C2/I3); deleting it
  // is what makes a replay impossible BY CONSTRUCTION, not a rule asking the code not to do it — there
  // is no `claims` here for this function to iterate, only the one `c` it was handed.
  //
  // `idx` is this claim's own position in the beat's `arg.claims` (fix round 2) — stamped as
  // `data-claim-of` on every mark this makes, so a LATER rebuild (root cause 2: the ring has moved
  // somewhere this base's own region does not cover) can find and clone it back out of THIS Expected
  // when it becomes an earlier moment's `arg.base`.
  function applyOneClaim (rootNode, c, idx) {
    const want = String(c.expected == null ? '' : c.expected)
    const got = String(c.got == null ? '' : c.got)
    if (!want && !got) return                            // nothing was claimed, nothing to apply
    const claimOf = idx == null ? [] : [['data-claim-of', String(idx)]]
    if (c.ok === true) {
      // rule 1: the leaf the check read, marked — the board tints it, nothing is rewritten
      const found = got ? scopedLeaf(rootNode, x => clean(textOf(x)).indexOf(got) >= 0) : null
      if (!found) return null
      setAttr(found.leaf, 'data-claim', 'ok')
      for (const [k, v] of claimOf) setAttr(found.leaf, k, v)
      return found.leaf
    }
    if (c.missing === true) {
      // rules 3/4: the element the app did not show. The base ALREADY HAS it — that is the entire
      // reason a base was chosen — so a restore never clones or inserts, only MARKS the row it finds,
      // climbed to the nearest thing that reads as a row (fix round 1, C2/I2: no splicing). Nothing
      // found at all means the app never had it: a marked placeholder, inserted at the spot's
      // current occupant — nearest below the ring box's top (fix round 3, rule 3) — never simply
      // "beside the ring", which a moved ring could put anywhere.
      const src = findByText(rootNode, want)
      if (src) {
        const row = climbToRow(src, rootNode)
        setAttr(row, 'data-claim', 'restored')
        for (const [k, v] of claimOf) setAttr(row, k, v)
        return row
      }
      const made = E('span', [['data-claim', 'new'], ...claimOf], [T(want)])
      insertNearestBelow(rootNode, ringBoxOf(c.ring), made)
      return made
    }
    // rule 2 (fix round 3): the wrong value is located by GEOMETRY — the claim's OWN ring box —
    // never by searching the tree for `got`: a base is a scene that was RIGHT, so it never shows the
    // wrong value's text at all. The bounded fallback that used to rewrite "the ring's first leaf"
    // when nothing matched is GONE — a claim with no leaf inside its own ring box is flagged
    // `unlocated`, in `data-claims`, and never applied anywhere else.
    const loc = locateByBox(rootNode, ringBoxOf(c.ring), got, want)
    if (!loc) { if (idx != null) unlocated.add(idx); return null }
    if (loc.already) {
      // case (b): the leaf ALREADY reads the requirement's word — mark it, change nothing
      setAttr(loc.node, 'data-claim', 'fixed')
      for (const [k, v] of claimOf) setAttr(loc.node, k, v)
      return loc.node
    }
    swapLeaf(loc.node, got, want)
    // …and on every worded wrapper up to the tree root (a row whose own text reads "To do 4" around
    // a leaf reading "4" must not be left saying both numbers).
    for (let a = parents.get(loc.node); a; a = parents.get(a)) { swapDirect(a, got, want); if (a === rootNode) break }
    setAttr(loc.node, 'data-claim', 'fixed')
    setAttr(loc.node, 'data-claim-got', got)
    for (const [k, v] of claimOf) setAttr(loc.node, k, v)
    return loc.node
  }

  // ── FIX ROUND 4 (N1): THE EXPECTED'S RING IS THE CURRENT MOMENT'S RING, ON EVERY PATH ──────────
  // The in-place branch takes a BASE's own children wholesale and `data-ring` rides in with them
  // (IMPORT_ATTRS — round 1 needed the base's ring to scope its text search), so the Expected rang
  // whatever the base rang while the root's `data-ring-box` and the Actual rang THIS moment's
  // element: on the demo's own harvest 6 of 33 pairs pointed their two halves at different things
  // (task-2-rereview.md, NEW-1), and phase 4 draws ONE ring over BOTH pictures. So after the claim is
  // applied the ring is re-pointed by GEOMETRY, the same `data-b` boxes rule 2 locates a claim with:
  // the node whose own box matches the current ring box ≥60% BOTH ways (the ring around the node AND
  // the node inside the ring — a one-way test would drill into a small word inside a wide button).
  // Failing that, the leaf the claim itself landed on (a `missing` claim locates by text, so it can
  // have a leaf where no box matches). Failing THAT, no `data-ring` at all and `ring: 'none'` on this
  // moment's `data-claims` entry — an honest gap, never a ring on something this moment never rang.
  const mutualFrac = (a, b) => {
    const ix0 = Math.max(a.x, b.x); const iy0 = Math.max(a.y, b.y)
    const ix1 = Math.min(a.x + a.w, b.x + b.w); const iy1 = Math.min(a.y + a.h, b.y + b.h)
    const inter = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0)
    return Math.min(inter / Math.max(1, a.w * a.h), inter / Math.max(1, b.w * b.h))
  }
  // every OTHER `data-ring` goes; the keeper's own attribute is left exactly where it already sat, so
  // a tree that already rings the right element serialises byte-for-byte as it did before
  const clearRingExcept = (n, keep) => {
    if (isText(n)) return
    if (n !== keep) n.attrs = n.attrs.filter(a => a[0] !== 'data-ring')
    for (const k of n.kids) clearRingExcept(k, keep)
  }
  // returns 'none' when the Expected honestly carries no ring, else null
  const retargetRing = (rootNode, ringBox, claimNode, rootIsRing) => {
    let best = rootIsRing ? rootNode : null      // the scene root IS this moment's ringed element
    // this moment rang NOTHING (a capture with no target and no ring): the Actual carries no
    // `data-ring` either, so a base's stale one goes and the two halves still agree — that is not a
    // gap to report, it is a moment with no ring
    if (!best && !ringBox) { clearRingExcept(rootNode, null); return null }
    if (!best) {
      let bestF = 0
      for (const e of elemsIn(rootNode)) {
        if (e === rootNode) continue
        const b = attrBox(e)
        if (!b) continue
        const f = mutualFrac(b, ringBox)
        if (f >= 0.6 && f > bestF) { best = e; bestF = f }
      }
    }
    if (!best && claimNode && !isText(claimNode)) best = claimNode
    clearRingExcept(rootNode, best)
    if (!best) return 'none'
    setAttr(best, 'data-ring', '1')
    return null
  }

  // ── a BASE, parsed back into nodes and re-minted into THIS capture's own sheet ───────────────────
  // In the page an inert <template> does the parsing (it never runs, loads or paints what it holds);
  // a node test hands in `env.parseHtml`. What comes back is re-sanitised on the way in — it is our
  // own output, but a second wall costs nothing. `data-ring` and `data-claim*` ARE imported (fix
  // round 1) — the whole point of handing in a base is that its ring and its earlier marks are
  // exactly what the next claim needs to find and build on — and so is `data-b` (fix round 3): a
  // base's own leaf boxes are the ONLY thing about it a wrong-value claim can still trust.
  const IMPORT_ATTRS = ATTRS.concat(['class', 'data-control', 'data-plate', 'data-ph', 'data-pseudo',
    'data-ring', 'data-claim', 'data-claim-got', 'data-claim-of', 'data-b'])
  const fromDom = (n) => {
    if (!n) return null
    if (n.nodeType === 3) { const t = String(n.textContent == null ? '' : n.textContent); return t ? T(t) : null }
    if (n.nodeType !== 1) return null
    const tag = String(n.tagName || '').toLowerCase()
    if (!tag || has(DROP, tag)) return null
    const attrs = []
    let names = []
    try { names = n.getAttributeNames ? (n.getAttributeNames() || []) : [] } catch { names = [] }
    for (const k of names) {
      if (!has(IMPORT_ATTRS, k) && k !== 'src' && k !== 'href') continue
      const v = n.getAttribute(k)
      if (v == null) continue
      const t = String(v)
      if (/^\s*javascript:/i.test(t) || /https?:\/\//i.test(t) || /^\s*\/\//.test(t)) continue
      if (k === 'src' && t.slice(0, 5) !== 'data:') continue
      if (k === 'href' && t.charAt(0) !== '#') continue
      attrs.push([k, t])
    }
    const kids = []
    for (const k of (n.childNodes || [])) { const c = fromDom(k); if (c) kids.push(c) }
    return E(tag, attrs, kids)
  }
  // parses a base html string ONCE into { kids, cssMap, region } — the base ROOT's own children
  // (its root wrapper is never reused; the caller supplies its OWN root attrs), the sheet those
  // children's borrowed class tokens resolve against, and (fix round 2) the REGION the base's own
  // root was captured with — `null` when there is nothing usable.
  const parseBase = (htmlStr) => {
    if (!htmlStr) return null
    let domRoot = null
    if (parseHtmlEnv) { try { domRoot = parseHtmlEnv(htmlStr) } catch { domRoot = null } }
    else if (doc.createElement) {
      try {
        const t = doc.createElement('template')
        t.innerHTML = htmlStr
        domRoot = t.content || t
      } catch { domRoot = null }
    }
    if (!domRoot) return null
    // …and the SHEET it arrived with. A class name is minted per capture, in walk order, so `r3` in
    // one moment's html and `r3` in this one are two different declarations — a base that kept its
    // names would be painted as whatever THIS moment happens to call r3. Its declarations are read
    // out of its own <style> and re-minted here (deduped like any other), so it comes back looking
    // the way it was captured.
    const cssMap = {}
    const re = /\.rep\s*\.(r\d+)\s*\{([^}]*)\}/g
    let m
    while ((m = re.exec(htmlStr))) if (!cssMap[m[1]]) cssMap[m[1]] = m[2]
    // the base's own REGION (fix round 2, rule 2) — read straight off the raw DOM root's attribute,
    // never through `fromDom`'s allowlist (a root-only mark, never needed on a child).
    let rawRoot = null
    for (const k of (domRoot.childNodes || [])) {
      if (k && k.nodeType === 1 && String(k.tagName || '').toLowerCase() !== 'style') { rawRoot = k; break }
    }
    if (!rawRoot) return null
    let region = null
    try {
      const rs = rawRoot.getAttribute && rawRoot.getAttribute('data-replica-region')
      if (rs) {
        const parts = String(rs).trim().split(/\s+/).map(Number)
        if (parts.length === 4 && parts.every(Number.isFinite)) region = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
      }
    } catch { region = null }
    const rootEl = fromDom(rawRoot)
    if (!rootEl) return null
    return { kids: rootEl.kids, cssMap, region }
  }
  // does the base's own region CONTAIN the box a claim is about (fix round 2, rule 2)? A base
  // captured before the beat's region grew to cover where the ring is NOW cannot be patched in
  // place — patching it anyway is the bounded fallback that overwrote a just-restored title with a
  // stray "5" (task-2-report.md's fix-round-1 finding). `null` on either side contains nothing.
  const regionContains = (region, box) => !!region && !!box &&
    region.x <= box.x + 0.5 && region.y <= box.y + 0.5 &&
    region.x + region.w >= box.x + box.w - 0.5 && region.y + region.h >= box.y + box.h - 0.5
  const remapClasses = (n, cssMap) => {
    if (isText(n)) return
    for (const a of n.attrs) {
      if (a[0] !== 'class') continue
      const out = []
      for (const tok of String(a[1]).split(/\s+/)) {
        if (!/^r\d+$/.test(tok)) continue                 // `rep` means nothing on a borrowed node
        const decl = cssMap[tok]
        if (!decl) continue
        let cls = seen.get(decl)
        if (!cls) { cls = 'r' + seen.size; seen.set(decl, cls); RULES.push({ cls, decl }) }
        out.push(cls)
      }
      a[1] = out.join(' ')
    }
    n.attrs = n.attrs.filter(a => !(a[0] === 'class' && !a[1]))
    for (const k of n.kids) remapClasses(k, cssMap)
  }

  // ── FIX ROUND 2/3: THE REBUILD — an earlier claim's fix, carried across a region that grew ──────
  // Triggers only when a base was chosen (something has failed) but that base's OWN region does not
  // contain the CURRENT ring — root cause 2 (task-2-review.md): the counter and the row are never in
  // the SAME captured scene, so patching the row-scoped base in place cannot show the counter at all.
  // The rebuild starts over from THIS moment's own (grown, rule 1) Actual, and puts every EARLIER
  // FAILED claim's fix back by its OWN ring box (fix round 3's geometry — rule 2/3 below), never by
  // searching text again (that is what a replay is, and what a base's own frozen content could
  // never answer for a wrong value it was never wrong about).
  const findByClaimOf = (list, idx) => {
    const want = String(idx)
    for (const k of list) {
      if (isText(k)) continue
      const a = k.attrs.find(x => x[0] === 'data-claim-of')
      if (a && a[1] === want) return k
      const found = findByClaimOf(k.kids, idx)
      if (found) return found
    }
    return null
  }
  const built = serialise(root, true)
  dropProbe()                                   // the page is left exactly as it was found
  if (!built) return null

  // ── the file body ─────────────────────────────────────────────────────────────────────────────
  // The root says what kit drew it, where the scene stood, where the ring was, and WHICH SIDE it is
  // — `actual` (what the app rendered) or `expected` (what the requirement says it should have).
  // Its inline style carries ONLY position:relative (the board positions the frame).
  // data-replica-layout belongs to phase 3 and is deliberately absent — a pin nobody computed would
  // be a claim nobody checked.
  const reg = rootRect
    ? { x: Math.round(rootRect.left), y: Math.round(rootRect.top), w: Math.round(rootRect.width), h: Math.round(rootRect.height) }
    : { x: 0, y: 0, w: vw, h: vh }
  const rootAttrs = [['class', ('rep' + (built.cls ? ' ' + built.cls : ''))],
    ['data-replica-kit', 'replica-1'],
    ['data-replica-region', reg.x + ' ' + reg.y + ' ' + reg.w + ' ' + reg.h]]
  if (rb) rootAttrs.push(['data-ring-box', Math.round(rb.x) + ' ' + Math.round(rb.y) + ' ' + Math.round(rb.w) + ' ' + Math.round(rb.h)])
  if (truncated) rootAttrs.push(['data-replica-truncated', '1'])
  // the scene root is normally an ANCESTOR of the ringed element, but a body-rooted capture can be
  // the ringed element itself — the mark must survive the root's own attribute set being replaced
  if (built.attrs.some(a => a[0] === 'data-ring')) rootAttrs.push(['data-ring', '1'])
  // the sheet, up to a given rule — the Actual is written from the rules the WALK minted, the
  // Expected from those plus whatever a restored element brought with it (see remapClasses)
  const sheet = (upTo) => {
    let css = ''
    for (let i = 0; i < upTo; i++) {
      const rule = RULES[i]
      css += '.rep .' + rule.cls + '{' + rule.decl + '}\n'
      // the scene root wears its own class, and a descendant selector cannot reach it
      if (built.cls === rule.cls) css += '.rep.' + rule.cls + '{' + rule.decl + '}\n'
    }
    return css
  }
  const walkRules = RULES.length
  const actualRoot = E('div', [...rootAttrs, ['data-replica-side', 'actual'], ['style', 'position:relative']], built.kids)
  const html = '<style>' + sheet(walkRules) + '</style>\n' + ser(actualRoot)

  // ── THE EXPECTED HALF: ONE claim, applied to its BASE, never a replay ────────────────────────
  // tools/viz.mjs intendedLayout (kit mirror-13) restated on real markup — see the header for the
  // controller's ruling in full. `arg.base === null` (nothing has failed yet, or nothing failed
  // before AND this claim itself did not fail): the Expected is the CURRENT ACTUAL tree, and an `ok`
  // claim only TINTS the leaf inside the CURRENT ring — no text ever moves here. `arg.base` given
  // AND its own region contains the current ring: the Expected IS that base's own tree, parsed back
  // and re-minted, with ONLY this moment's claim applied to it in place (fix round 1). `arg.base`
  // given but its region does NOT contain the current ring (fix round 2 — root cause 2): a REBUILD —
  // the Expected starts from THIS moment's own (grown) Actual, every EARLIER FAILED claim is put
  // back by ANCHOR (never by searching text again — that would be a replay), and only then is the
  // CURRENT claim applied, exactly as round 1 would.
  let expectedKids
  const baseParsed = parseBase(BASE)
  const inPlace = !!baseParsed && (!rb || regionContains(baseParsed.region, rb))
  if (inPlace) {
    expectedKids = baseParsed.kids
    for (const k of expectedKids) remapClasses(k, baseParsed.cssMap)
  } else if (BASE) {
    // REBUILD (fix round 2, geometry per fix round 3). The Expected starts from THIS moment's own
    // (grown) Actual — a plain clone, `built` already carries `data-b` on everything from its own
    // walk, so no live-DOM anchor lookup is needed any more (fix round 4's rule: `elementsFromPoint`
    // MAY still exist for other purposes, but is not needed here — every claim now locates by the
    // SAME `data-b` geometry rule 2 uses, on THIS tree or a base alike). Every earlier FAILED claim
    // is put back by its OWN ring box (never by searching text again — that would be a replay).
    expectedKids = built.kids.map(cloneNode)
    const rebuiltRoot = E('_root', [], expectedKids)
    link(rebuiltRoot)
    // strips a STALE `data-ring` off a grafted clone and its descendants — a "restored"/"new"
    // element carries whatever it had at the moment it was marked (its own base's ring, long since
    // moved on), and the rebuilt tree already has exactly one CURRENT ring, marked fresh by THIS
    // moment's own walk.
    const stripRing = (n) => {
      if (isText(n)) return
      n.attrs = n.attrs.filter(a => a[0] !== 'data-ring')
      for (const k of n.kids) stripRing(k)
    }
    // iterate by the claim's OWN index in the FULL `CLAIMS` list — `data-claim-of` was stamped
    // with that same index, so a local (filtered) index here would look up the wrong element
    const priorCount = CLAIM ? CLAIMS.length - 1 : CLAIMS.length
    for (let idx = 0; idx < priorCount; idx++) {
      const c = CLAIMS[idx]
      if (!c || c.ok === true) continue
      const want = String(c.expected == null ? '' : c.expected)
      const got = String(c.got == null ? '' : c.got)
      const ringBox = ringBoxOf(c.ring)
      if (c.missing === true) {
        // the fix ALREADY EXISTS, marked, in the OLD base (round 1 put it there) — clone it out by
        // its `data-claim-of` index rather than re-deriving it, and put it back at the spot's
        // current occupant (fix round 3, rule 3 — nearest below the ring box's top), so several
        // read in claim order.
        const src = baseParsed && findByClaimOf(baseParsed.kids, idx)
        const made = src ? cloneNode(src) : E('span', [['data-claim', 'new'], ['data-claim-of', String(idx)]], [T(want)])
        stripRing(made)
        if (src && baseParsed) remapClasses(made, baseParsed.cssMap)
        insertNearestBelow(rebuiltRoot, ringBox, made)
        continue
      }
      if (!got && !want) continue
      // wrong value (fix round 3, rule 2 on the REBUILT tree — the boxes are there now): located by
      // the claim's OWN ring box, never by searching for `got`.
      const loc = locateByBox(rebuiltRoot, ringBox, got, want)
      if (!loc) { unlocated.add(idx); continue }
      if (loc.already) {
        setAttr(loc.node, 'data-claim', 'fixed')
        setAttr(loc.node, 'data-claim-of', String(idx))
        continue
      }
      swapLeaf(loc.node, got, want)
      for (let a = parents.get(loc.node); a; a = parents.get(a)) { swapDirect(a, got, want); if (a === rebuiltRoot) break }
      setAttr(loc.node, 'data-claim', 'fixed')
      setAttr(loc.node, 'data-claim-got', got)
      setAttr(loc.node, 'data-claim-of', String(idx))
    }
  } else {
    // base === null: nothing has failed — the Expected starts from THIS moment's own Actual
    expectedKids = built.kids.map(cloneNode)
  }
  const claimRoot = E('div',
    [...rootAttrs, ['data-replica-side', 'expected'], ['data-claims', '[]'], ['style', 'position:relative']],
    expectedKids)
  link(claimRoot)
  const curIdx = CLAIM ? (CLAIMS.length ? CLAIMS.length - 1 : null) : null
  const claimNode = CLAIM ? applyOneClaim(claimRoot, CLAIM, curIdx) : null
  // …and only now is the ring re-pointed at THIS moment's element (fix round 4, N1)
  const ringNote = retargetRing(claimRoot, rb, claimNode, built.attrs.some(a => a[0] === 'data-ring'))
  // `data-claims` is EVERY claim of the beat so far, in order — informational only, for the board to
  // read. It is never applied to anything by text search; `unlocated` (fix round 3) is the ONLY
  // other thing that can happen to a wrong-value claim here, and it means exactly what it says — no
  // leaf lies inside the claim's own ring box, so nothing was touched for it, honestly, rather than
  // the deleted bounded fallback guessing at a leaf that has nothing to do with it.
  const claimList = CLAIMS.map((c, idx) => ({
    label: String((c && c.label) == null ? '' : c.label),
    expected: String((c && c.expected) == null ? '' : c.expected),
    got: String((c && c.got) == null ? '' : c.got),
    ok: !!(c && c.ok === true),
    ...(c && c.missing === true ? { missing: true } : {}),
    ...(unlocated.has(idx) ? { unlocated: true } : {}),
    // fix round 4 (N1): this moment's Expected could not carry the ring at all — said, never hidden
    ...(ringNote && curIdx === idx ? { ring: ringNote } : {})
  }))
  for (const a of claimRoot.attrs) if (a[0] === 'data-claims') a[1] = JSON.stringify(claimList)
  const expected = '<style>' + sheet(RULES.length) + '</style>\n' + ser(claimRoot)

  // ── the fonts the region needs ────────────────────────────────────────────────────────────────
  // Every @font-face the page's OWN (same-origin, readable) stylesheets declare for a family the
  // captured region actually uses. A cross-origin sheet throws on .cssRules — skipped, never thrown
  // on. The urls are FETCHED outside the page (spec/_base.ts, with page.request) so nothing here
  // touches the network, and the replica itself never carries an external URL.
  //
  // RESOLVED AGAINST THE DOCUMENT BASE FIRST (fix round 1, F1). The CSSOM hands a src back exactly
  // as it was authored, and a self-hosted face is almost always written RELATIVE
  // (`url(../fonts/x.woff2)`) — so the absolute-only test threw away precisely the same-origin case
  // this rule exists to catch, and every self-hosting app fell back to a system stack.
  //
  // EVERY origin, not only ours (the controller's ruling, 2026-09-03): the human's default is "web
  // fonts embedded once per screen", and a CDN face is the common case — a target set in a
  // gstatic.com face would otherwise render in a fallback stack, which is a picture of a different
  // app. Listing it is not fetching it: spec/_base.ts fetches Node-side under its own caps (8 per
  // pass, 2 MB, 3 s each, 6 s for the lot) and the fold commits the bytes under `_fonts/`, so the
  // served replica loads every face from 'self' and the file itself still carries no external URL.
  // What is listed is only what can actually be fetched over http(s): a `data:` face needs no
  // fetching, and `blob:` / `javascript:` are not urls this harness would ever hand to page.request.
  //
  // …and, beside them, the RULES THEMSELVES (`fontFaces`, phase 3): the in-page gate mounts this
  // replica in a hidden iframe and walks it with the same walk that measured the live page, and a
  // frame set in a fallback stack lays every word out at a different width — every text box would
  // drift and the gate would report a page of false gaps. The rules are handed to that frame's own
  // srcdoc and NEVER written into the replica file, so the file still carries no external URL.
  // Bounded like everything here: 64 rules, 64 KB, an unreadable sheet skipped.
  const fonts = []
  const fontFaces = []
  let faceBytes = 0
  const base = String((doc && doc.baseURI) || (win && win.location && win.location.href) || '')
  const sheets = (doc.styleSheets && doc.styleSheets.length != null) ? doc.styleSheets : []
  for (let i = 0; i < sheets.length; i++) {
    let rules = null
    try { rules = sheets[i] && sheets[i].cssRules } catch { rules = null }
    if (!rules) continue
    for (let j = 0; j < rules.length; j++) {
      // both budgets full: nothing left to learn from this sheet or any other (fix round 1, M7)
      if (fonts.length >= 8 && (fontFaces.length >= 64 || faceBytes >= 64000)) break
      const rule = rules[j]
      if (!rule || !rule.style) continue
      // CSSFontFaceRule is type 5. Asking the TYPE first means a Tailwind-sized sheet is not
      // serialised rule by rule on every capture just to find its handful of faces; a CSSOM that
      // will not answer (an older engine, a stub) falls back to reading the text, as before.
      if (typeof rule.type === 'number' && rule.type !== 5) continue
      const faceText = String(rule.cssText || '')
      if (!/^\s*@font-face/i.test(faceText)) continue
      if (fontFaces.length < 64 && faceBytes + faceText.length <= 64000) {
        fontFaces.push(faceText)
        faceBytes += faceText.length
      }
      if (fonts.length >= 8) continue
      const family = gp(rule.style, 'font-family').trim().replace(/^["']|["']$/g, '')
      if (!family || !families.has(family.toLowerCase())) continue
      const src = gp(rule.style, 'src')
      const urls = String(src).match(/url\(\s*["']?([^"')]+)["']?\s*\)/gi) || []
      for (const u of urls) {
        const m = /url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(u)
        if (!m) continue
        const raw = m[1].trim()
        if (!raw) continue
        let url = ''
        try {
          const abs = new URL(raw, base)
          // http(s) only — that also drops data: (nothing to fetch), blob: and javascript:
          if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue
          url = abs.href
        } catch { continue }                                    // an src that will not resolve is not a url
        if (!fonts.some(f => f.url === url)) fonts.push({ family, url })
        break                                   // one file per family per rule — the first format wins
      }
    }
  }

  return {
    kit: 'replica-1',
    html,
    expected,
    region: reg,
    ring: rb ? { x: Math.round(rb.x), y: Math.round(rb.y), w: Math.round(rb.w), h: Math.round(rb.h) } : null,
    nodes,
    classes: walkRules,
    bytes: html.length,
    truncated,
    fonts,
    fontFaces
  }
}
