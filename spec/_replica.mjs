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
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow',
  'width', 'height', 'min-width', 'max-width', 'padding', 'margin',
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

  // ── the style diff ────────────────────────────────────────────────────────────────────────────
  // Each element's computed values against a PROBE of the same tag+namespace — so what rides out is
  // only what the app's own stylesheets actually say. Identical declaration sets share one class, and
  // the css is one <style> the file carries with it (no external URL is reachable from a sandboxed
  // iframe anyway, and a page that could fetch one would not be sanitised).
  const defaults = {}
  const defaultsOf = (tag, ns) => {
    const key = (ns || HTML_NS) + '|' + tag
    if (defaults[key]) return defaults[key]
    let d = {}
    if (defaultsFor) {
      try { d = defaultsFor(tag, ns || HTML_NS) || {} } catch { d = {} }
    } else if (doc.createElementNS && doc.body && doc.body.appendChild) {
      try {
        const probe = doc.createElementNS(ns || HTML_NS, tag)
        doc.body.appendChild(probe)
        const cs = styleOf(probe)
        for (const p of PROPS) d[p] = gp(cs, p)
        probe.remove()
      } catch { d = {} }
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
  const classOf = (cs, tag, ns) => {
    if (!cs || !PROPS.length) return ''
    const d = defaultsOf(tag, ns)
    const out = []
    for (const p of PROPS) {
      const v = gp(cs, p)
      if (!v) continue                                  // a value the page will not answer for is not a declaration
      if (v === String(d[p] == null ? '' : d[p])) continue
      out.push(p + ':' + v)
    }
    if (!out.length) return ''
    const decl = out.join(';')
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
  const pseudo = (node, which) => {
    const cs = styleOf(node, '::' + which)
    if (!cs) return null
    const raw = gp(cs, 'content').trim()
    const m = /^"([\s\S]*)"$|^'([\s\S]*)'$/.exec(raw)
    const text = m ? (m[1] != null ? m[1] : m[2]) : ''
    if (!text) return null
    const cls = classOf(cs, 'span', HTML_NS)
    const attrs = [['class', cls || null], ['data-pseudo', which]]
    const kids = [T(text)]
    bytes += esc(text).length + costOf('span', attrs, kids)
    return E('span', attrs, kids)
  }

  // LIVE DOM ELEMENT → its node in OUR tree (fix round 2) — every element `serialise` actually
  // walked, not only the ringed one. A rebuild needs it to turn an anchor found by
  // `document.elementsFromPoint` (a real element) back into something in the tree it can mark and
  // insert beside.
  const outputOf = new Map()

  const serialise = (node, isRoot) => {
    if (!node || node.nodeType !== 1) return null
    // OUR OWN CHROME IS NOT THE APP'S DOM (fix round 1, F2). The narration overlay — the ring, the
    // veil and the callout card — is painted INTO the page under test, so a capture whose scene root
    // reaches <body> would serialise it as part of the component. spec/_layout-walk.mjs has refused
    // to measure it since it existed; this is the same refusal, subtree included.
    if (node.id === OVERLAY) return null
    const tag = String(node.tagName || '').toLowerCase()
    if (!tag || has(DROP, tag)) return null
    const cs = styleOf(node)
    // WHAT THE PAGE DOES NOT SHOW IS NOT IN THE REPLICA — the same reading the skeleton walk makes,
    // so the two pictures of one moment agree about what was on screen.
    if (cs) {
      if (gp(cs, 'display') === 'none') return null
      const vis = gp(cs, 'visibility')
      if (vis === 'hidden' || vis === 'collapse') return null
      const op = parseFloat(gp(cs, 'opacity'))
      if (Number.isFinite(op) && op <= 0.02) return null
    }
    if (capped()) { truncated = true; return null }
    nodes++
    const fam = gp(cs, 'font-family')
    if (fam) for (const f of fam.split(',')) families.add(f.trim().replace(/^["']|["']$/g, '').toLowerCase())
    const r = rectOf(node)
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
    }

    const cls = classOf(cs, emit, emit === tag ? ns : HTML_NS)
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
      const before = pseudo(node, 'before')
      if (before) out.push(before)
      // a shadow root REPLACES the light children in the picture, because that is what the browser
      // paints; slotted content is a known gap of this phase, noted rather than guessed at
      const src = node.shadowRoot && node.shadowRoot.childNodes && node.shadowRoot.childNodes.length
        ? node.shadowRoot.childNodes
        : (node.childNodes || [])
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
          }
          continue
        }
        if (k.nodeType !== 1) continue
        const child = serialise(k, false)
        if (child) out.push(child)
      }
      const after = pseudo(node, 'after')
      if (after) out.push(after)
      kids = out
    }
    bytes += costOf(emit, attrs, kids)
    const made = E(emit, attrs, kids)
    outputOf.set(node, made)
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
  const delAttr = (n, k) => { n.attrs = n.attrs.filter(a => a[0] !== k) }
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
  const isMark = (n, ...kinds) => {
    if (isText(n)) return false
    const a = n.attrs.find(x => x[0] === 'data-claim')
    return !!a && kinds.indexOf(a[1]) >= 0
  }
  // insert AFTER the ring, and after anything a PRIOR claim on this same base already inserted there
  // (fix round 1, I1) — never nearer the ring than something the beat put there before it, which is
  // what read an Undo ahead of the task it belonged to.
  const insertBeside = (rootNode, ringNode, made) => {
    const parent = ringNode === rootNode ? null : parents.get(ringNode)
    const siblings = parent ? parent.kids : rootNode.kids
    const at = parent ? siblings.indexOf(ringNode) : -1
    let ins = at + 1
    while (ins < siblings.length && isMark(siblings[ins], 'new', 'restored')) ins++
    siblings.splice(ins, 0, made)
    parents.set(made, parent || rootNode)
    link(made)
  }
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
      if (found) { setAttr(found.leaf, 'data-claim', 'ok'); for (const [k, v] of claimOf) setAttr(found.leaf, k, v) }
      return
    }
    if (c.missing === true) {
      // rules 3/4: the element the app did not show. The base ALREADY HAS it — that is the entire
      // reason a base was chosen — so a restore never clones or inserts, only MARKS the row it finds,
      // climbed to the nearest thing that reads as a row (fix round 1, C2/I2: no splicing). Nothing
      // found at all means the app never had it: a marked placeholder, beside the ring, after
      // anything the beat already put there.
      const src = findByText(rootNode, want)
      if (src) {
        const row = climbToRow(src, rootNode)
        setAttr(row, 'data-claim', 'restored')
        for (const [k, v] of claimOf) setAttr(row, k, v)
        return
      }
      const ringNode = findRing(rootNode) || rootNode
      const made = E('span', [['data-claim', 'new'], ...claimOf], [T(want)])
      insertBeside(rootNode, ringNode, made)
      return
    }
    // rule 2: the wrong value takes the requirement's word, on the leaf inside the ring box that
    // carries it (or, failing that, wherever in the tree it can be found — never a silent no-op), and
    // on every worded wrapper up to that ring (a row whose own text reads "To do 4" around a leaf
    // reading "4" must not be left saying both numbers).
    const found = got ? scopedLeaf(rootNode, x => clean(textOf(x)).indexOf(got) >= 0) : null
    if (found) {
      const { leaf, ringNode } = found
      swapLeaf(leaf, got, want)
      const bound = ringNode || rootNode
      if (leaf !== bound) {
        // …bounded at the tree root too — the whole-tree fallback can find `got` on a leaf whose
        // stale ring sits in an unrelated branch, and climbing must still stop somewhere sane
        for (let a = parents.get(leaf); a; a = parents.get(a)) { swapDirect(a, got, want); if (a === bound || a === rootNode) break }
      }
      setAttr(leaf, 'data-claim', 'fixed')
      setAttr(leaf, 'data-claim-got', got)
      for (const [k, v] of claimOf) setAttr(leaf, k, v)
      // the base's ring is stale the moment a fix lands somewhere else — RE-POINT it here, so the
      // NEXT claim's scoped search starts from where this one actually landed, not from where the
      // beat began (fix round 1, C1: a replay could never do this, because it never knew which claim
      // was "current").
      if (ringNode && ringNode !== leaf) delAttr(ringNode, 'data-ring')
      if (ringNode !== leaf) setAttr(leaf, 'data-ring', '1')
      return
    }
    const ringNode = findRing(rootNode) || rootNode
    const leaves = elemsIn(ringNode).filter(isLeaf)
    const tl = firstMatch(leaves, x => clean(textOf(x)) !== '')
    if (tl) {
      tl.kids = [T(want)]
      setAttr(tl, 'data-claim', 'fixed')
      if (got) setAttr(tl, 'data-claim-got', got)
      for (const [k, v] of claimOf) setAttr(tl, k, v)
    } else {
      const span = E('span', [['data-claim', 'fixed'], ...claimOf], [T(want)])
      ringNode.kids.push(span)
      parents.set(span, ringNode)
    }
  }

  // ── a BASE, parsed back into nodes and re-minted into THIS capture's own sheet ───────────────────
  // In the page an inert <template> does the parsing (it never runs, loads or paints what it holds);
  // a node test hands in `env.parseHtml`. What comes back is re-sanitised on the way in — it is our
  // own output, but a second wall costs nothing. `data-ring` and `data-claim*` ARE imported now (fix
  // round 1) — the whole point of handing in a base is that its ring and its earlier marks are
  // exactly what the next claim needs to find and build on.
  const IMPORT_ATTRS = ATTRS.concat(['class', 'data-control', 'data-plate', 'data-ph', 'data-pseudo',
    'data-ring', 'data-claim', 'data-claim-got', 'data-claim-of'])
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

  // ── FIX ROUND 2: THE REBUILD — an earlier claim's fix, carried across a region that grew ─────────
  // Triggers only when a base was chosen (something has failed) but that base's OWN region does not
  // contain the CURRENT ring — root cause 2 (task-2-review.md): the counter and the row are never in
  // the SAME captured scene, so patching the row-scoped base in place cannot show the counter at all,
  // and the old bounded fallback patched whatever leaf the ring HAPPENED to be nearest, which was the
  // just-restored title. The rebuild starts over from THIS moment's own (grown, rule 1) Actual, and
  // puts every EARLIER FAILED claim's fix back — not by searching text again (that is what a replay
  // is), but by ANCHOR: the live element under that claim's OWN ring centre, resolved against the
  // CURRENT DOM, the only thing that can say where "the spot" is once the page has moved on.
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
  // insert BEFORE the anchor (fix round 2) — the opposite edge from `insertBeside`'s "after the
  // ring" (fix round 1, I1): an anchor is the spot's CURRENT occupant (the next row that moved up
  // into a deleted row's place), and several claims re-inserted in claim order each go immediately
  // before it, so they read in the order the beat made them, ending right where the anchor begins.
  const insertBeforeAnchor = (rootNode, anchorNode, made) => {
    const parent = anchorNode === rootNode ? null : parents.get(anchorNode)
    const siblings = parent ? parent.kids : rootNode.kids
    const at = parent ? siblings.indexOf(anchorNode) : siblings.length
    siblings.splice(Math.max(0, at), 0, made)
    parents.set(made, parent || rootNode)
    link(made)
  }

  const built = serialise(root, true)
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
  const unanchored = new Set()
  let expectedKids
  const baseParsed = parseBase(BASE)
  const inPlace = !!baseParsed && (!rb || regionContains(baseParsed.region, rb))
  if (inPlace) {
    expectedKids = baseParsed.kids
    for (const k of expectedKids) remapClasses(k, baseParsed.cssMap)
  } else if (BASE) {
    // REBUILD (fix round 2). `cloneMap` links each node of THIS capture's own walk (`built`, keyed
    // by the live DOM element via `outputOf`) to its counterpart in the fresh clone the Expected is
    // built from, so an anchor found in the live page can be turned into something in THIS tree.
    const cloneMap = new Map()
    const cloneTracked = (n) => {
      if (isText(n)) { const c = T(n.text); cloneMap.set(n, c); return c }
      const c = E(n.tag, n.attrs.map(a => [a[0], a[1]]), n.kids.map(cloneTracked))
      cloneMap.set(n, c)
      return c
    }
    expectedKids = built.kids.map(cloneTracked)
    const anchorFor = (ringBox) => {
      if (!ringBox || typeof doc.elementsFromPoint !== 'function') return null
      const w = ringBox.width != null ? ringBox.width : ringBox.w
      const h = ringBox.height != null ? ringBox.height : ringBox.h
      if (!(w >= 0) || !(h >= 0)) return null
      const cx = ringBox.x + w / 2
      const cy = ringBox.y + h / 2
      let hits = []
      try { hits = doc.elementsFromPoint(cx, cy) || [] } catch { hits = [] }
      for (const h2 of hits) {
        if (!h2 || h2.id === OVERLAY || (h2.closest && h2.closest('#' + OVERLAY))) continue
        const orig = outputOf.get(h2)
        if (orig && cloneMap.has(orig)) return cloneMap.get(orig)
      }
      return null
    }
    // needs a `parents` map over the FRESH tree before anything is marked or inserted into it
    const rebuiltRoot = E('_root', [], expectedKids)
    link(rebuiltRoot)
    // strips a STALE `data-ring` off a grafted clone and its descendants — a "restored"/"new"
    // element carries whatever it had at the moment it was marked (its own base's ring, long since
    // moved on), and the rebuilt tree already has exactly one CURRENT ring, marked fresh by THIS
    // moment's own walk; two would make `findRing` (used by the current claim, applied last) pick
    // whichever happens to come first in the tree instead of where the beat actually is now.
    const stripRing = (n) => {
      if (isText(n)) return
      n.attrs = n.attrs.filter(a => a[0] !== 'data-ring')
      for (const k of n.kids) stripRing(k)
    }
    const markAnchor = (node, idx) => {
      const existing = node.attrs.find(a => a[0] === 'data-claim-anchor')
      if (existing) existing[1] = existing[1] + ' ' + idx
      else node.attrs.push(['data-claim-anchor', String(idx)])
    }
    // iterate by the claim's OWN index in the FULL `CLAIMS` list — `data-claim-of` was stamped
    // with that same index, so a local (filtered) index here would look up the wrong element
    const priorCount = CLAIM ? CLAIMS.length - 1 : CLAIMS.length
    for (let idx = 0; idx < priorCount; idx++) {
      const c = CLAIMS[idx]
      if (!c || c.ok === true) continue
      const anchor = anchorFor(c.ring)
      if (!anchor) { unanchored.add(idx); continue }
      markAnchor(anchor, idx)
      const want = String(c.expected == null ? '' : c.expected)
      const got = String(c.got == null ? '' : c.got)
      if (c.missing === true) {
        // the fix ALREADY EXISTS, marked, in the OLD base (round 1 put it there) — clone it out by
        // its `data-claim-of` index rather than re-deriving it, and put it back BEFORE the anchor
        // (the spot's current occupant), so several read in claim order, ending at the anchor.
        const src = baseParsed && findByClaimOf(baseParsed.kids, idx)
        const made = src ? cloneNode(src) : E('span', [['data-claim', 'new'], ['data-claim-of', String(idx)]], [T(want)])
        stripRing(made)
        if (src && baseParsed) remapClasses(made, baseParsed.cssMap)
        insertBeforeAnchor(rebuiltRoot, anchor, made)
      } else if (got || want) {
        // wrong value: the anchor's OWN leaf carrying `got`, else its first worded leaf, takes the
        // requirement's word — scoped to the anchor's subtree only, never the whole page.
        const leaves = elemsIn(anchor).filter(isLeaf)
        let target = got ? firstMatch(leaves, x => clean(textOf(x)).indexOf(got) >= 0) : null
        if (!target) target = firstMatch(leaves, x => clean(textOf(x)) !== '')
        if (target) {
          swapLeaf(target, got, want)
          if (target !== anchor) {
            for (let a = parents.get(target); a; a = parents.get(a)) { swapDirect(a, got, want); if (a === anchor) break }
          }
          setAttr(target, 'data-claim', 'fixed')
          if (got) setAttr(target, 'data-claim-got', got)
          setAttr(target, 'data-claim-of', String(idx))
        } else {
          const span = E('span', [['data-claim', 'fixed'], ['data-claim-of', String(idx)]], [T(want)])
          anchor.kids.push(span)
          parents.set(span, anchor)
        }
      }
    }
  } else {
    // base === null: nothing has failed — the Expected starts from THIS moment's own Actual
    expectedKids = built.kids.map(cloneNode)
  }
  const claimRoot = E('div',
    [...rootAttrs, ['data-replica-side', 'expected'], ['data-claims', '[]'], ['style', 'position:relative']],
    expectedKids)
  link(claimRoot)
  if (CLAIM) applyOneClaim(claimRoot, CLAIM, CLAIMS.length ? CLAIMS.length - 1 : null)
  // `data-claims` is EVERY claim of the beat so far, in order — informational only, for the board to
  // read. It is never applied to anything by text search; `unanchored` (fix round 2) is the ONLY
  // other thing that can happen to a claim here, and it means exactly what it says — no anchor
  // inside the grown region, so nothing was touched for it, honestly, rather than a bounded fallback
  // guessing at a leaf that has nothing to do with it.
  const claimList = CLAIMS.map((c, idx) => ({
    label: String((c && c.label) == null ? '' : c.label),
    expected: String((c && c.expected) == null ? '' : c.expected),
    got: String((c && c.got) == null ? '' : c.got),
    ok: !!(c && c.ok === true),
    ...(c && c.missing === true ? { missing: true } : {}),
    ...(unanchored.has(idx) ? { unanchored: true } : {})
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
  const fonts = []
  const base = String((doc && doc.baseURI) || (win && win.location && win.location.href) || '')
  const sheets = (doc.styleSheets && doc.styleSheets.length != null) ? doc.styleSheets : []
  for (let i = 0; i < sheets.length && fonts.length < 8; i++) {
    let rules = null
    try { rules = sheets[i] && sheets[i].cssRules } catch { rules = null }
    if (!rules) continue
    for (let j = 0; j < rules.length && fonts.length < 8; j++) {
      const rule = rules[j]
      if (!rule || !rule.style) continue
      if (!/^\s*@font-face/i.test(String(rule.cssText || ''))) continue
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
    fonts
  }
}
