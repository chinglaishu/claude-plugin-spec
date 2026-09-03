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
//              caps?: { nodes?, bytes? }, claims?: Claim[], lastRight?: string|null, env? }
// Shape out: null when there is nothing to capture, else
//   { kit, html, expected, region: {x,y,w,h}, ring: {x,y,w,h}|null, nodes, classes, bytes, truncated, fonts }
// `html` is the whole file body bar its comment header: one <style> of diffed classes, then one root
// element. No script, no handler, no external URL — the second wall behind the iframe sandbox.
//
// ── PHASE 2: `expected` — THE SAME MARKUP WITH THE BEAT'S CLAIMS APPLIED (2026-09-03) ────────────
// A requirement is the truth and the app is what happened, so the row's two pictures are the same
// component twice: `html` is the ACTUAL (what the app rendered) and `expected` is what it should
// have rendered — the wrong value corrected to the requirement's own word, the element the app
// removed put back from the beat's last right replica, the element it never had drawn in as a
// marked placeholder. That is tools/viz.mjs `intendedLayout` (kit mirror-13, the human 2026-09-02:
// "the schematic should be correct, only the proof should be wrong") restated on real markup.
// `claims` is every claim the beat has made SO FAR, in order, the current moment's last — they
// accumulate down the beat — and `lastRight` is the html body of its most recent all-ok Actual (its
// before replica to begin with), which is the only place a restore may take an element from.
//
// The claims are applied to a CLONE of the output tree, never to the Actual: the photograph's own
// half must stay the app's picture, whatever the requirement asked for.
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
  // THE BEAT'S CLAIMS, and the last replica the app got right (phase 2 — see the header). A caller
  // that passes neither gets an `expected` that is the Actual bar the side it names, which is
  // exactly right for a beat's BEFORE moment: nothing has been claimed yet.
  const CLAIMS = (arg && Array.isArray(arg.claims)) ? arg.claims : []
  const LAST_RIGHT = (arg && typeof arg.lastRight === 'string' && arg.lastRight) ? arg.lastRight : ''
  // …and how `lastRight` is turned back into nodes: an inert <template> in the page (it parses but
  // never runs, loads or paints), a stub env's own parser in a node test.
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
      if (area >= rArea * 3 && area <= vArea) { root = a; break }
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

  // the ringed element's node in OUR tree — what a claim searches inside, and what a restored row
  // is put beside. Set as the walk reaches it.
  let focusNode = null

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
    if (node === focusEl) focusNode = made
    if (isRoot) made.cls = cls
    return made
  }

  // ── THE CLAIM MACHINERY (phase 2) ─────────────────────────────────────────────────────────────
  // Everything below reads and edits OUR tree only. `clean` is the skeleton walk's rule (collapse
  // whitespace, trim), so what a claim matches against is the words a reader sees.
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
  const insertBeside = (rootNode, ringNode, made) => {
    const parent = ringNode === rootNode ? null : parents.get(ringNode)
    if (parent) {
      const at = parent.kids.indexOf(ringNode)
      parent.kids.splice(at < 0 ? parent.kids.length : at + 1, 0, made)
      parents.set(made, parent)
    } else {
      rootNode.kids.push(made)
      parents.set(made, rootNode)
    }
    link(made)
  }

  // ── the beat's LAST RIGHT replica, as nodes ────────────────────────────────────────────────────
  // Parsed once, lazily, and only when a restore actually asks for it. In the page an inert
  // <template> does the parsing (it never runs, loads or paints what it holds); a node test hands in
  // `env.parseHtml`. What comes back is re-sanitised on the way in — it is our own output, but a
  // second wall costs nothing and a restored node must NEVER carry a second `data-ring` or a stale
  // `data-claim` from the moment it was captured in.
  const IMPORT_ATTRS = ATTRS.concat(['class', 'data-control', 'data-plate', 'data-ph', 'data-pseudo'])
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
  let lastTree                                   // undefined = not parsed yet; null = nothing usable
  let lastCss = {}
  const lastRightTree = () => {
    if (lastTree !== undefined) return lastTree
    lastTree = null
    if (!LAST_RIGHT) return lastTree
    let domRoot = null
    if (parseHtmlEnv) { try { domRoot = parseHtmlEnv(LAST_RIGHT) } catch { domRoot = null } }
    else if (doc.createElement) {
      try {
        const t = doc.createElement('template')
        t.innerHTML = LAST_RIGHT
        domRoot = t.content || t
      } catch { domRoot = null }
    }
    if (!domRoot) return lastTree
    // …and the SHEET it arrived with. A class name is minted per capture, in walk order, so `r3` in
    // the before replica and `r3` in this one are two different declarations — a restored row that
    // kept its name would be painted as whatever this moment happens to call r3. Its declarations
    // are read out of its own <style> and re-minted here (deduped like any other), so the row comes
    // back looking the way the app drew it.
    lastCss = {}
    const re = /\.rep\s*\.(r\d+)\s*\{([^}]*)\}/g
    let m
    while ((m = re.exec(LAST_RIGHT))) if (!lastCss[m[1]]) lastCss[m[1]] = m[2]
    const kids = []
    for (const k of (domRoot.childNodes || [])) { const v = fromDom(k); if (v) kids.push(v) }
    lastTree = kids.length ? E('_root', [], kids) : null
    return lastTree
  }
  const remapClasses = (n) => {
    if (isText(n)) return
    for (const a of n.attrs) {
      if (a[0] !== 'class') continue
      const out = []
      for (const tok of String(a[1]).split(/\s+/)) {
        if (!/^r\d+$/.test(tok)) continue                 // `rep` means nothing on a borrowed node
        const decl = lastCss[tok]
        if (!decl) continue
        let cls = seen.get(decl)
        if (!cls) { cls = 'r' + seen.size; seen.set(decl, cls); RULES.push({ cls, decl }) }
        out.push(cls)
      }
      a[1] = out.join(' ')
    }
    n.attrs = n.attrs.filter(a => !(a[0] === 'class' && !a[1]))
    for (const k of n.kids) remapClasses(k)
  }
  // the element in the last right replica that IS the thing the claim names. Its clean text equals
  // the expected words; failing that, the SMALLEST element that still contains them — the brief's
  // "first in document order" is always the outermost one, i.e. the whole scene, which would restore
  // the entire page beside the ring.
  const findRestorable = (want) => {
    const tree = lastRightTree()
    if (!tree) return null
    const all = elemsIn(tree).slice(1)
    const wanted = clean(want)
    if (!wanted) return null
    for (const e of all) if (clean(textOf(e)) === wanted) return e
    let best = null; let bestN = Infinity
    for (const e of all) {
      if (clean(textOf(e)).indexOf(wanted) < 0) continue
      const n = elemsIn(e).length
      if (n <= bestN) { best = e; bestN = n }
    }
    return best
  }

  function applyClaims (rootNode) {
    link(rootNode)
    const out = []
    for (const c of CLAIMS) {
      if (!c || typeof c !== 'object') continue
      const want = String(c.expected == null ? '' : c.expected)
      const got = String(c.got == null ? '' : c.got)
      if (!want && !got) continue                         // nothing was claimed, nothing to apply
      const ringNode = findRing(rootNode) || rootNode
      const leaves = elemsIn(ringNode).filter(isLeaf)
      const firstLeaf = (pred) => { for (const l of leaves) if (pred(l)) return l; return null }
      if (c.ok === true) {
        // 1. the leaf the check read, marked — the board tints it, nothing is rewritten
        const l = got ? firstLeaf(x => clean(textOf(x)).indexOf(got) >= 0) : null
        if (l) setAttr(l, 'data-claim', 'ok')
      } else if (c.missing === true) {
        // 3 / 4. the element the app did not show: put back from the last right replica if it is
        // there, else drawn as a placeholder beside the ring
        const src = findRestorable(want)
        let made = null
        if (src) {
          const copy = cloneNode(src)
          // one restored element may not carry the file past its cap — above it, the honest
          // placeholder says the same thing in a few bytes
          if (bytes + ser(copy).length <= BYTE_CAP) {
            remapClasses(copy)
            setAttr(copy, 'data-claim', 'restored')
            made = copy
          }
        }
        if (!made) made = E('span', [['data-claim', 'new']], [T(want)])
        insertBeside(rootNode, ringNode, made)
      } else {
        // 2. the wrong value takes the requirement's word
        const l = got ? firstLeaf(x => clean(textOf(x)).indexOf(got) >= 0) : null
        if (l) {
          swapLeaf(l, got, want)
          if (l !== ringNode) {
            for (let a = parents.get(l); a; a = parents.get(a)) { swapDirect(a, got, want); if (a === ringNode) break }
          }
          setAttr(l, 'data-claim', 'fixed')
          setAttr(l, 'data-claim-got', got)
        } else {
          const tl = firstLeaf(x => clean(textOf(x)) !== '')
          if (tl) {
            tl.kids = [T(want)]
            setAttr(tl, 'data-claim', 'fixed')
            if (got) setAttr(tl, 'data-claim-got', got)
          } else {
            const span = E('span', [['data-claim', 'fixed']], [T(want)])
            ringNode.kids.push(span)
            parents.set(span, ringNode)
          }
        }
      }
      out.push({
        label: String(c.label == null ? '' : c.label),
        expected: want,
        got,
        ok: c.ok === true,
        ...(c.missing === true ? { missing: true } : {})
      })
    }
    return out
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

  // ── THE EXPECTED HALF: the claims applied to a CLONE of the same tree ──────────────────────────
  // tools/viz.mjs intendedLayout (kit mirror-13) restated on real markup. In claim order, cumulative:
  //   1. an OK claim MARKS the leaf inside the ring that the check read — no text changes; the board
  //      tints it, so a reader can see which words the assertion actually stood on.
  //   2. a WRONG VALUE takes the requirement's word in place of the app's, on the first leaf inside
  //      the ring that carries it, and on every worded wrapper up to the ring (a row whose own text
  //      reads "To do 4" around a leaf reading "4" must not be left saying both numbers).
  //   3. an element the app REMOVED (`missing`) is put back FROM THE BEAT'S LAST RIGHT REPLICA — the
  //      app's own markup for it, never an invention — beside the ring, marked `restored`.
  //   4. an element the app NEVER HAD is a marked placeholder beside the ring: drawn because the
  //      requirement says it is there, and honestly labelled as the one thing nothing measured.
  // Every fallback is BOUNDED and visible: a claim never silently fails to apply, because a claim
  // that quietly did nothing is a picture saying the app was right.
  const claimRoot = E('div',
    [...rootAttrs, ['data-replica-side', 'expected'], ['data-claims', '[]'], ['style', 'position:relative']],
    built.kids.map(cloneNode))
  const applied = applyClaims(claimRoot)
  for (const a of claimRoot.attrs) if (a[0] === 'data-claims') a[1] = JSON.stringify(applied)
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
