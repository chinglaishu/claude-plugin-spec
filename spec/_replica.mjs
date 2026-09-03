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
//              caps?: { nodes?, bytes? }, env? }
// Shape out: null when there is nothing to capture, else
//   { kit, html, region: {x,y,w,h}, ring: {x,y,w,h}|null, nodes, classes, bytes, truncated, fonts }
// `html` is the whole file body bar its comment header: one <style> of diffed classes, then one root
// element. No script, no handler, no external URL — the second wall behind the iframe sandbox.
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

  // the two pseudo-elements a page draws its ticks, bullets and separators with: materialised as a
  // span carrying the quoted string, with its own diffed class, so the picture shows what a reader
  // sees rather than an empty box where the CSS drew a ✓
  const pseudo = (node, which) => {
    const cs = styleOf(node, '::' + which)
    if (!cs) return ''
    const raw = gp(cs, 'content').trim()
    const m = /^"([\s\S]*)"$|^'([\s\S]*)'$/.exec(raw)
    const text = m ? (m[1] != null ? m[1] : m[2]) : ''
    if (!text) return ''
    const cls = classOf(cs, 'span', HTML_NS)
    return spend(wrap('span', [['class', cls || null], ['data-pseudo', which]], esc(text)))
  }

  const serialise = (node, isRoot) => {
    if (!node || node.nodeType !== 1) return ''
    // OUR OWN CHROME IS NOT THE APP'S DOM (fix round 1, F2). The narration overlay — the ring, the
    // veil and the callout card — is painted INTO the page under test, so a capture whose scene root
    // reaches <body> would serialise it as part of the component. spec/_layout-walk.mjs has refused
    // to measure it since it existed; this is the same refusal, subtree included.
    if (node.id === OVERLAY) return ''
    const tag = String(node.tagName || '').toLowerCase()
    if (!tag || has(DROP, tag)) return ''
    const cs = styleOf(node)
    // WHAT THE PAGE DOES NOT SHOW IS NOT IN THE REPLICA — the same reading the skeleton walk makes,
    // so the two pictures of one moment agree about what was on screen.
    if (cs) {
      if (gp(cs, 'display') === 'none') return ''
      const vis = gp(cs, 'visibility')
      if (vis === 'hidden' || vis === 'collapse') return ''
      const op = parseFloat(gp(cs, 'opacity'))
      if (Number.isFinite(op) && op <= 0.02) return ''
    }
    if (capped()) { truncated = true; return '' }
    nodes++
    const fam = gp(cs, 'font-family')
    if (fam) for (const f of fam.split(',')) families.add(f.trim().replace(/^["']|["']$/g, '').toLowerCase())
    const r = rectOf(node)
    const ns = node.namespaceURI || HTML_NS

    // what tag this element is EMITTED as — the diff is taken against that tag's defaults, so a
    // plate div or a control span is styled as the div or the span it will actually be rendered as
    let emit = tag
    let inner = null                                   // non-null: the children are already decided
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
      inner = spend(esc(v.replace(/\s+/g, ' ').trim()))
    } else if (tag === 'canvas') {
      // a canvas that can hand over its own pixels is shown as those pixels; one that cannot (tainted,
      // webgl, a stub) is a plate the size of its box — never a blank element pretending to be the art
      let url = ''
      try { url = typeof node.toDataURL === 'function' ? String(node.toDataURL() || '') : '' } catch { url = '' }
      if (affordable(url)) { emit = 'img'; extra.push(['src', url]); inner = '' } else { emit = 'div'; extra.push(['data-plate', 'canvas'], ...box); inner = '' }
    } else if (tag === 'iframe' || tag === 'video') {
      emit = 'div'; extra.push(['data-plate', tag], ...box); inner = ''
    } else if (tag === 'img') {
      const src = String((node.getAttribute && node.getAttribute('src')) || '')
      if (affordable(src)) { extra.push(['src', src]) } else { emit = 'div'; extra.push(['data-plate', 'img'], ...box) }
      inner = ''
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

    if (inner == null) {
      let out = pseudo(node, 'before')
      // a shadow root REPLACES the light children in the picture, because that is what the browser
      // paints; slotted content is a known gap of this phase, noted rather than guessed at
      const kids = node.shadowRoot && node.shadowRoot.childNodes && node.shadowRoot.childNodes.length
        ? node.shadowRoot.childNodes
        : (node.childNodes || [])
      for (let i = 0; i < kids.length; i++) {
        if (capped()) { truncated = true; break }
        const k = kids[i]
        if (!k) continue
        if (k.nodeType === 3) {
          const t = String(k.textContent == null ? '' : k.textContent)
          if (t.trim()) out += spend(esc(t.replace(/\s+/g, ' ').slice(0, TEXT_MAX)))
          continue
        }
        if (k.nodeType !== 1) continue
        out += serialise(k, false)
      }
      out += pseudo(node, 'after')
      inner = out
    }
    if (isRoot) return { tag: emit, attrs, inner, cls }
    const out = wrap(emit, attrs, inner)
    bytes += out.length - inner.length          // this element's own markup; its inner is already spent
    return out
  }

  const built = serialise(root, true)
  if (!built || typeof built === 'string') return null

  // ── the file body ─────────────────────────────────────────────────────────────────────────────
  // The root says what kit drew it, where the scene stood and where the ring was; its inline style
  // carries ONLY position:relative (the board positions the frame). data-replica-layout and
  // data-claims belong to phases 2–3 and are deliberately absent — a pin nobody computed would be a
  // claim nobody checked.
  const reg = rootRect
    ? { x: Math.round(rootRect.left), y: Math.round(rootRect.top), w: Math.round(rootRect.width), h: Math.round(rootRect.height) }
    : { x: 0, y: 0, w: vw, h: vh }
  const rootAttrs = [['class', ('rep' + (built.cls ? ' ' + built.cls : ''))],
    ['data-replica-kit', 'replica-1'],
    ['data-replica-region', reg.x + ' ' + reg.y + ' ' + reg.w + ' ' + reg.h]]
  if (rb) rootAttrs.push(['data-ring-box', Math.round(rb.x) + ' ' + Math.round(rb.y) + ' ' + Math.round(rb.w) + ' ' + Math.round(rb.h)])
  if (truncated) rootAttrs.push(['data-replica-truncated', '1'])
  rootAttrs.push(['style', 'position:relative'])
  let css = ''
  for (const rule of RULES) {
    css += '.rep .' + rule.cls + '{' + rule.decl + '}\n'
    // the scene root wears its own class, and a descendant selector cannot reach it
    if (built.cls === rule.cls) css += '.rep.' + rule.cls + '{' + rule.decl + '}\n'
  }
  const html = '<style>' + css + '</style>\n' + wrap('div', rootAttrs, built.inner)

  // ── the fonts the region needs ────────────────────────────────────────────────────────────────
  // Every @font-face the page's OWN (same-origin, readable) stylesheets declare for a family the
  // captured region actually uses. A cross-origin sheet throws on .cssRules — skipped, never thrown
  // on. The urls are FETCHED outside the page (spec/_base.ts, with page.request) so nothing here
  // touches the network, and the replica itself never carries an external URL.
  //
  // RESOLVED AGAINST THE DOCUMENT BASE FIRST (fix round 1, F1). The CSSOM hands a src back exactly
  // as it was authored, and a self-hosted face is almost always written RELATIVE
  // (`url(../fonts/x.woff2)`) — so the absolute-only test threw away precisely the same-origin case
  // this rule exists to catch, and every self-hosting app fell back to a system stack. Resolve, then
  // ask whether the origin is ours: same-origin is what the served replica's `font-src 'self' data:`
  // will actually load, and a face from another origin is not the page's to carry.
  const fonts = []
  const base = String((doc && doc.baseURI) || (win && win.location && win.location.href) || '')
  let ourOrigin = null
  try { ourOrigin = base ? new URL(base).origin : null } catch { ourOrigin = null }
  const sheets = (ourOrigin && doc.styleSheets && doc.styleSheets.length != null) ? doc.styleSheets : []
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
        if (!raw || raw.slice(0, 5) === 'data:') continue      // an inline face needs no fetching
        let url = ''
        try {
          const abs = new URL(raw, base)
          if (abs.origin !== ourOrigin) continue                // another origin's face is not ours to carry
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
    region: reg,
    ring: rb ? { x: Math.round(rb.x), y: Math.round(rb.y), w: Math.round(rb.w), h: Math.round(rb.h) } : null,
    nodes,
    classes: RULES.length,
    bytes: html.length,
    truncated,
    fonts
  }
}
