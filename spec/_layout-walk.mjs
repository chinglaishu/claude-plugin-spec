// spec/_layout-walk.mjs — THE LAYOUT SKELETON's walk, as ONE self-contained function (2026-09-03).
//
// It used to live inline inside spec/_base.ts snapLayout's page.evaluate closure, which made it the
// one piece of the harvest nothing could unit-test — and the 2026-09-03 finding ("the schematic is
// useless: the ringed cell is empty, the version picker is not there at all") was exactly the kind
// of defect a test would have pinned: the walk spent its whole element budget in document order,
// so a page with more boxes than the cap never measured the ringed element at all. Playwright
// serialises this function by its source (page.evaluate(fn, arg)), so it must stay SELF-CONTAINED:
// no imports referenced inside it, no closure over module state. `arg.env` lets a node test hand
// it a stub window/document/getComputedStyle; in the page it is absent and the globals are used.
//
// Shape in: { ring: { x, y, width, height } | null, target: Element | null, env? }
// Shape out: { w, h, ring: { x, y, w, h } | null, els: [...] }  — exactly what tools/viz.mjs
// normLayout reads (see the field list in the comment below).
export function snapLayoutWalk (arg) {
  const ring = (arg && arg.ring) || null
  const target = (arg && arg.target) || null
  const env = (arg && arg.env) || null
  // WHERE THE WALK'S OWN ANSWERS GO (task 3b, 2026-09-04). The replica capture used to decide two
  // things for itself that this walk had already decided — which element the ring is on, and what an
  // opaque overlay covers — and the two disagreed on any page where the answer was not obvious
  // (board R22, board R20). They run in ONE page pass now (spec/_moment.mjs), so the decisions can
  // travel as element references: `report.ringEl` is the element this walk actually measured under
  // the ring, `report.occluded` every element it dropped because something painted sits on top.
  // Optional and inert — a caller that passes none is walked exactly as before.
  const report = (arg && arg.report && typeof arg.report === 'object') ? arg.report : null
  if (report) { report.ringEl = null; report.occluded = [] }
  const win = env && env.window ? env.window : window
  const doc = env && env.document ? env.document : document
  const getComputedStyle = env && env.getComputedStyle ? env.getComputedStyle : win.getComputedStyle.bind(win)
  const OVERLAY = '__specboard-focus'
  const CAP = 360            // enough boxes to recognise a screen (a data grid alone is ~200 cells)
  // Depth cap. WAS 14 — which reached a sidebar link (depth ~11) but stopped 7–11 levels SHORT of
  // an AG-GRID cell VALUE (measured at depth 21–25 on dojostack: grid → viewport → clipper →
  // container → row → cell → wrapper → value-span). So the mirror drew every data grid as textless
  // grey boxes while the photograph beside it showed the real numbers — the drawing was useless to
  // compare (the human, 2026-09-03). A deep WRAPPER still adds no text (the leaf+text rule below
  // only lettered childless nodes) and no box below MIN, so raising this only reaches the values
  // that were being missed; CAP + BUDGET keep the walk bounded.
  const MAXD = 28
  const MIN = 12             // px: below this an element is a divider or an icon fleck
  const BUDGET = 9000        // nodes visited, so a huge app costs a bounded walk
  const vw = win.innerWidth || 0
  const vh = win.innerHeight || 0
  let rb = ring ? { x: ring.x, y: ring.y, w: ring.width, h: ring.height } : null
  // THE RING IS WHERE THE ELEMENT IS NOW (2026-09-03, House View R7): the ring was painted on a
  // button reading "Publishing…", the button re-laid out to "Activate", and the skeleton carried the
  // stale box beside an element measured somewhere else. When the caller hands the element over, its
  // current box is the ring — the photograph is re-painted to the same box before the frame.
  if (target && typeof target.getBoundingClientRect === 'function') {
    try {
      const tr = target.getBoundingClientRect()
      if (tr && tr.width >= 1 && tr.height >= 1) rb = { x: tr.left, y: tr.top, w: tr.width, h: tr.height }
    } catch { /* an element that will not measure keeps the painted ring */ }
  }
  const rArea = rb ? Math.max(1, rb.w * rb.h) : 0
  const els = []
  let visited = 0
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 48)
  // "rgb(r, g, b)" / "rgba(r, g, b, a)" → "r,g,b", or '' when it is fully transparent or
  // unreadable. The DRAWING never sees this string as a colour — tools/viz.mjs dyeOf maps it to
  // the nearest design token at derive time — so what rides the skeleton is measurement, not paint.
  const rgb = (v) => {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i.exec(String(v || ''))
    if (!m) return ''
    if (m[4] != null && Number(m[4]) <= 0.02) return ''
    return [1, 2, 3].map(i => Math.round(Number(m[i]))).join(',')
  }
  const has = (el, n) => !!(el.hasAttribute && el.hasAttribute(n))
  // AN OCCLUDER MUST ACTUALLY PAINT SOMETHING (fix round 3 — the re-review's own scrutiny on fix
  // round 2, item 3: "does this risk hiding content under a translucent veil the user can still
  // see?"). `elementFromPoint` answers stacking order only — it does not know or care whether the
  // frontmost element is opaque, half-see-through, or paints nothing at all. Treating ANY unrelated
  // hit as full occlusion would make a translucent scrim (this codebase's own dim overlay pattern,
  // `spec/_base.ts` `rgba(28,27,24,.12)` — or the same thing drawn by the APP itself, a modal
  // backdrop, a loading scrim) read as "gone" rather than "dimmed", and would make an invisible
  // click-catcher (`background:transparent`, used purely to close a dropdown on an outside click) eat
  // everything under it. Mirrors the walk's OWN existing rule for its budget ("no slot for an
  // unpainted wrapper — no bg, no border, no words, no icon"): an occluder needs an opaque background
  // (alpha ≥ 0.98) or to BE an image/video/canvas — nothing less blocks what a human still sees.
  const paints = (n) => {
    if (!n) return false
    const t = String(n.tagName || '').toUpperCase()
    if (t === 'IMG' || t === 'VIDEO' || t === 'CANVAS' || t === 'PICTURE') return true
    let hcs = null
    try { hcs = getComputedStyle(n) } catch { hcs = null }
    if (!hcs) return false
    const m = /^rgba?\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+(?:[,/\s]+([\d.]+))?/i.exec(String(hcs.backgroundColor || ''))
    if (!m) return false
    const alpha = m[1] != null ? Number(m[1]) : 1
    return Number.isFinite(alpha) && alpha >= 0.98
  }
  // A REPLICA MATERIALISES A ::before/::after AS A REAL CHILD SPAN (spec/_replica.mjs's `pseudo()`,
  // marked `data-pseudo`) so a reader sees "▶ Run" instead of an empty box where the app drew a tick
  // with CSS. That span makes `childElementCount` nonzero on the button it decorates, so this walk's
  // OWN leaf rule — "no child elements" — stopped recognising "Run" (or a requirement chip's "R18")
  // as a leaf and dropped its text outright when the walk read the REPLICA back for the in-page gate
  // (board R18/R10, 2026-09-03: every chip and the primary Run button came back `missing-text`, the
  // box exactly right, the word gone). A `data-pseudo` span never exists on the live page — only the
  // file the replica capture writes carries the attribute — so counting it out of the leaf test
  // changes nothing there; `ownWords` reads only this element's OWN direct text-node children, never
  // a descendant element's (pseudo or not), so the tooltip a `data-pseudo="after"` span carries can
  // never leak into the word it decorates.
  // `element.children` is an ELEMENTS-only collection by definition (real DOM and this stub alike),
  // so no nodeType check is needed here — only whether it carries the marker.
  const pseudoTag = (n) => !!(n && n.getAttribute && n.getAttribute('data-pseudo'))
  const nonPseudoChildren = (element) => {
    const kids = element.children
    if (!kids) return element.childElementCount || 0
    let n = 0
    for (let i = 0; i < kids.length; i++) if (!pseudoTag(kids[i])) n++
    return n
  }
  const ownWords = (element) => {
    const kids = element.childNodes
    if (!kids) return clean(element.textContent)   // no childNodes exposed — the old, whole-subtree read
    let s = ''
    for (let i = 0; i < kids.length; i++) { if (kids[i].nodeType === 3) s += (kids[i].textContent == null ? '' : kids[i].textContent) }
    return clean(s)
  }
  // A FOCUSED WRAPPER'S innerText FALLBACK MUST NOT AGGREGATE A DESCENDANT THE REPLICA WILL PLATE
  // (fix round 3, board R18–R21, the re-review's own finding: the SVG-text fix below excluded only
  // the svg ITSELF, never an ancestor div sharing its `focus`). A beat's focus is the UNION of every
  // ring it stood on, so several plain `div` ancestors wrapping a big, ring-focused schematic also
  // read `focus:true` — ordinary HTML elements, not svg, so the fallback two lines down still ran
  // for them, and `el.innerText` walks straight into the diagram's own rendered `<text>` shapes and
  // returns the whole thing's concatenated labels, truncated to 48 characters. spec/_replica.mjs
  // PLATES that same svg (bigger than its own `SVG_ICON_MAX`) to an empty box with no shapes and no
  // text at all — so an honest replica could never contain the word this walk just claimed. The two
  // constants are the SAME NUMBER by design (spec/_replica.mjs's own comment cross-references this
  // one; tools/replica.test.mjs pins them equal from source, since neither file may import the
  // other — both are serialised into a page by source and must stay self-contained). `iframe`,
  // `video` and a `canvas` are plated by `_replica.mjs` regardless of size, so any of those three
  // anywhere in the subtree is unsafe too.
  const PLATED_MEDIA = ['IFRAME', 'VIDEO', 'CANVAS']
  const hasPlatedMedia = (node, depth) => {
    if (!node || depth > 40) return false
    const t = String(node.tagName || '').toUpperCase()
    if (PLATED_MEDIA.indexOf(t) >= 0) return true
    if (t === 'SVG') {
      let r = null
      try { r = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null } catch { r = null }
      return !r || r.width > ICON_MAX || r.height > ICON_MAX
    }
    const kids = node.children
    if (!kids) return false
    for (let i = 0; i < kids.length; i++) { if (hasPlatedMedia(kids[i], depth + 1)) return true }
    return false
  }
  // A FOCUSED WRAPPER SPANNING MULTIPLE SEPARATE CONTROLS MUST NOT AGGREGATE THEIR TEXT EITHER (fix
  // round 3, board R18 — found by the CLI gate's OWN independent node-text check, not the in-page
  // gate, after the plated-media fix above landed: a reader toolbar wrapper (Play / auto-step / speed
  // buttons) and a storyline pager wrapper (its own counter plus several requirement chips) both get
  // `focus:true` from a beat's ring UNION and still ran the same innerText fallback, aggregating every
  // sibling control's own text into one unmatchable 48-char blob ("PLAY auto step PLAY SPEED 0.25×
  // 0.5× 1× ", "‹ 1 · THE BOARD'S SHAPE R1 R9 R16 R17 2 · READIN"). Each of those controls is ALREADY
  // separately recorded by this same walk with its own correct text — the aggregate adds nothing an
  // honest replica (which renders each control as its own element, never concatenated together) could
  // ever answer for. Safe only when the wrapper has AT MOST ONE text-bearing leaf anywhere in its
  // subtree — a single value nested a level or two deep (an icon beside its own label); two or more
  // means the wrapper is a GROUP of controls, not one value, and the fallback is skipped. Bounded like
  // `hasPlatedMedia`: depth-capped, and an early exit the moment a second leaf is found.
  const countTextLeaves = (node, depth, capAt) => {
    if (!node || depth > 40) return 0
    if (nonPseudoChildren(node) === 0) return ownWords(node) ? 1 : 0
    const kids = node.children
    if (!kids) return 0
    let n = 0
    for (let i = 0; i < kids.length; i++) {
      n += countTextLeaves(kids[i], depth + 1, capAt)
      if (n >= capAt) return n
    }
    return n
  }
  // THE ICON A WORDLESS CONTROL IS MADE OF (mirror-10, 2026-09-02, the human on the demo's R1
  // scene 3: "there's a weird extra circle on each row's right side in the schematic"). A row's
  // chevron is a 28×28 <button class="caret"> holding a 24-unit stroked <svg>; the button took
  // the drawing's button plate and the svg took its image plate, so the thin grey "›" in the
  // photograph came out a filled lozenge with a square on it. The fix is on both ends: here the
  // few SHAPES a small inline svg is actually made of are measured — its own path data, in its
  // own viewBox units — and tools/viz.mjs draws those lines instead of a plate.
  //
  // Bounded and untrusted like everything else on this skeleton: only an svg no bigger than
  // ICON_MAX, at most 12 shapes, at most 1500 serialised characters (900 before each shape
  // carried its own paint — mirror-11), at most 400 per `d`, and the
  // drawing re-validates every one of them (normIcon) before a character of it is emitted. An
  // svg with nothing capturable in it stays a plain image, which is the honest picture of "a
  // graphic is shown here". No colour travels raw — `fg` is a measurement, mapped to a dye at
  // derive time exactly like bg/fg/bd above.
  const ICON_MAX = 64          // page px: above this an inline svg is an illustration, not an icon
  const ICON_SKIP = ['defs', 'clippath', 'mask', 'symbol', 'style', 'title', 'desc', 'metadata', 'filter', 'pattern']
  const numAt = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
  }
  const iconOf = (svg, r, cs) => {
    let vb = [0, 0, Math.round(r.width), Math.round(r.height)]
    const vbA = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(numAt)
    if (vbA.length === 4 && vbA.every((n) => n != null) && vbA[2] > 0 && vbA[3] > 0) vb = vbA
    const swA = Number(svg.getAttribute('stroke-width'))
    const sw = Number.isFinite(swA) && swA > 0 ? Math.round(swA * 100) / 100 : 1.5
    const shapes = []
    // fill/stroke are INHERITED down the svg's own tree, so each shape is asked with what its
    // ancestors set — a `fill="none" stroke="currentColor"` root is what makes a feather-style
    // icon a line drawing rather than a solid one. Nothing set anywhere is SVG's own default:
    // filled, unstroked.
    const take = (node, pf, ps) => {
      const kids = node.children || []
      for (let i = 0; i < kids.length; i++) {
        if (shapes.length >= 12) return
        const c = kids[i]
        const t = String(c.tagName || '').toLowerCase()
        if (ICON_SKIP.indexOf(t) >= 0) continue
        const cf = c.getAttribute('fill') || pf
        const cst = c.getAttribute('stroke') || ps
        let sh = null
        if (t === 'path') {
          const d = String(c.getAttribute('d') || '').trim()
          if (d && d.length <= 400) sh = { t: 'path', d }
        } else if (t === 'circle') {
          const cx = numAt(c.getAttribute('cx')); const cy = numAt(c.getAttribute('cy')); const rr = numAt(c.getAttribute('r'))
          if (cx != null && cy != null && rr != null && rr > 0) sh = { t: 'circle', cx, cy, r: rr }
        } else if (t === 'line') {
          const x1 = numAt(c.getAttribute('x1')); const y1 = numAt(c.getAttribute('y1'))
          const x2 = numAt(c.getAttribute('x2')); const y2 = numAt(c.getAttribute('y2'))
          if (x1 != null && y1 != null && x2 != null && y2 != null) sh = { t: 'line', x1, y1, x2, y2 }
        } else if (t === 'rect') {
          const rx0 = numAt(c.getAttribute('x')); const ry0 = numAt(c.getAttribute('y'))
          const rw = numAt(c.getAttribute('width')); const rh = numAt(c.getAttribute('height'))
          const rr = numAt(c.getAttribute('rx'))
          if (rx0 != null && ry0 != null && rw != null && rw > 0 && rh != null && rh > 0) {
            sh = rr != null && rr > 0 ? { t: 'rect', x: rx0, y: ry0, w: rw, h: rh, rx: rr } : { t: 'rect', x: rx0, y: ry0, w: rw, h: rh }
          }
        } else if (t === 'polyline' || t === 'polygon') {
          const pts = String(c.getAttribute('points') || '').trim()
          if (pts && pts.length <= 400) sh = { t, points: pts }
        }
        if (sh) {
          // THE SHAPE'S OWN PAINT (mirror-11, 2026-09-02, the lead on the re-harvested demo's
          // R3/R6 scenes). Tsumiki's container ring is ONE svg holding a pale track circle and
          // an indigo progress arc; the icon-level `fg` below is the svg's computed `color`, so
          // both drew in the button's ink and the ring came out a heavy black circle. What the
          // page actually paints each shape is only readable off the COMPUTED style — the
          // colours here arrive through a stylesheet, not an attribute — so each shape is asked
          // once: at most 12 shapes, so the cost is bounded like everything else on this walk.
          //
          //   sc  "r,g,b"  computed stroke, when it is visible
          //   fc  "r,g,b"  computed fill, when it is visible
          //   sw  units    computed stroke-width, only when it differs from the icon's own
          //   op  0..1     computed opacity, only when the shape is faded
          //
          // No colour travels as paint: tools/viz.mjs maps every one through dyeOf at derive
          // time, exactly like bg/fg/bd, and drops a malformed one back to the icon's dye.
          let ccs = null
          try { ccs = getComputedStyle(c) } catch { /* a shape that will not compute keeps the icon's ink */ }
          if (ccs) {
            const scv = rgb(ccs.stroke)
            const fcv = rgb(ccs.fill)
            if (scv) { sh.s = 1; sh.sc = scv }
            if (fcv) { sh.f = 1; sh.fc = fcv }
            const csw = parseFloat(ccs.strokeWidth)
            if (sh.s && Number.isFinite(csw) && csw > 0 && Math.abs(csw - sw) > 0.01) sh.sw = Math.round(csw * 100) / 100
            const cop = parseFloat(ccs.opacity)
            if (Number.isFinite(cop) && cop < 1) sh.op = Math.round(cop * 100) / 100
          }
          // …and the ATTRIBUTE reading only rescues a shape the computed style could not answer
          // for at all (a gradient or pattern paint, a style that would not compute): it draws
          // in the icon's dye, as it did before this pass, rather than vanishing.
          if (!sh.f && !sh.s) {
            const fv = String(cf == null ? 'black' : cf).trim().toLowerCase()
            const sv = String(cst == null ? 'none' : cst).trim().toLowerCase()
            if (fv && fv !== 'none') sh.f = 1
            if (sv && sv !== 'none') sh.s = 1
          }
          if (sh.f || sh.s) {
            shapes.push(sh)
            // the serialised budget, raised from 900 with the per-shape paint (mirror-11): four
            // more small fields on each of at most 12 shapes, and a truncated icon is a drawing
            // of half a picture
            if (JSON.stringify(shapes).length > 1500) { shapes.pop(); return }
          }
        }
        if (t === 'g' || t === 'a' || t === 'svg') take(c, cf, cst)
      }
    }
    take(svg, svg.getAttribute('fill'), svg.getAttribute('stroke'))
    if (!shapes.length) return null
    // the icon's INK: currentColor, which is this element's own computed colour — unless the svg
    // names a literal colour in its own fill/stroke, in which case that is what a reader sees.
    let fg = cs ? rgb(cs.color) : ''
    const lit = (n) => {
      const a = String(svg.getAttribute(n) || '').trim().toLowerCase()
      return !!a && a !== 'none' && a !== 'currentcolor' && a !== 'inherit' && a.slice(0, 4) !== 'url('
    }
    if (cs) {
      if (lit('stroke')) fg = rgb(cs.stroke) || fg
      else if (lit('fill')) fg = rgb(cs.fill) || fg
    }
    const icon = { vb, sw, shapes }
    if (fg) icon.fg = fg
    return icon
  }
  const kindOf = (el, tag, leaf, text, r) => {
    const role = (el.getAttribute && el.getAttribute('role')) || ''
    const type = String((tag === 'INPUT' && el.type) || '').toLowerCase()
    if (/^H[1-6]$/.test(tag) || role === 'heading') return 'heading'
    // A TICK IS A STATE, NOT A FIELD (2026-09-02): a checkbox filed under `input` drew a text box,
    // so a done row and an open one were the same picture — the thing a to-do screen's beats
    // prove most often. Its own kind, and `on` below says which way it is set.
    if (type === 'checkbox' || type === 'radio' || role === 'checkbox' || role === 'radio' || role === 'switch') return 'check'
    // …and a CONTROL that says which way it is set is one too, however it is built (mirror-9):
    // aria-checked / aria-pressed, or the data-* flag a hand-rolled toggle carries. Only on a real
    // control — Tsumiki puts `data-done` on the task ROW as well, and a row is not a tick box.
    const ctl = tag === 'BUTTON' || tag === 'INPUT' || role === 'button' || role === 'switch'
    if (ctl && (has(el, 'aria-checked') || has(el, 'aria-pressed') || has(el, 'data-done') || has(el, 'data-checked'))) return 'check'
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'input'
    // …and so is a WORDLESS SQUARE control with nothing inside it, which is what a hand-rolled
    // tick box looks like from here (Tsumiki's is a 21×21 `<button class="cb">` whose only signal
    // is its own paint). Drawn as its own plate at its own radius, never as a text box with a
    // placeholder bar across it — the "missing tickbox" the human named.
    if ((tag === 'BUTTON' || role === 'button') && !text && el.childElementCount === 0 &&
      Math.abs(r.width - r.height) <= 3 && r.width <= 32) return 'check'
    if (tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'link' || role === 'tab') return 'button'
    if (tag === 'IMG' || tag === 'SVG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'PICTURE') return 'image'
    if (tag === 'LI' || tag === 'TR' || role === 'row' || role === 'listitem') return 'row'
    if (leaf && text) return 'text'
    return 'container'
  }
  // `pop` is the EFFECTIVE opacity the ancestors have already applied (mirror-9, 2026-09-02).
  // ── ONE ELEMENT'S READING (2026-09-03) ────────────────────────────────────────────────────
  // Everything the skeleton says about one element, factored out of the walk so the walk can decide
  // WHICH elements to spend its budget on. Returns null for an element the page does not show (and
  // whose subtree must not be entered), else { el, tag, eop, rec } — `rec` null when the element is
  // below the size floor. `forced` marks the element the caller KNOWS is ringed.
  // TITLE/DESC/METADATA join SCRIPT/STYLE (fix round 2, item 2): SVG's own accessibility/metadata
  // children, never painted, never something a reader sees — the same reason STYLE was already here.
  const skipTag = (tag) => tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE' ||
    tag === 'LINK' || tag === 'META' || tag === 'TITLE' || tag === 'DESC' || tag === 'METADATA'
  const measure = (el, pop, forced, r0) => {
    if (el.id === OVERLAY) return null                 // never measure our own narration overlay
    const tag = String(el.tagName || '').toUpperCase()
    if (skipTag(tag)) return null
    const r = r0 || el.getBoundingClientRect()
    if (!r) return null
    // A BOX WITH NO SIZE IS NOT A HIDDEN BOX (2026-09-03, the House View version picker). A `min-w-0`
    // flex `main` whose children overflow it measures 0 wide, and so does the wrapper around it — and
    // reading that as display:none dropped the header's whole subtree, picker included, on every
    // harvest. Only `display:none` prunes; a zero-sized element takes no slot but IS descended.
    const sized = r.width >= 1 && r.height >= 1
    if (sized && (r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh)) return null   // off-screen, and its subtree
    // WHAT THE PAGE DOES NOT SHOW, THE MIRROR MUST NOT MEASURE (mirror-9, 2026-09-02). Opacity
    // is inherited by PAINT, not by property: Tsumiki hides a row's edit/delete buttons with
    // `opacity:0` until hover, so the BUTTON came back at 0 and its 16×16 icon — which has no
    // opacity of its own — came back opaque and was drawn. Three wash squares where the
    // photograph shows one chevron. So the walk multiplies the ancestors' opacity down, and an
    // element the page has faded out (or hidden by `visibility`) is skipped whole: not
    // captured, not descended into. `display:none` is already gone, on its zero rect.
    let cs = null
    try { cs = getComputedStyle(el) } catch { /* an element that will not compute is measured as it is */ }
    let eop = pop
    if (cs) {
      if (String(cs.display || '') === 'none') return null          // display:none, and its subtree
      const vis = String(cs.visibility || '')
      if (vis === 'hidden' || vis === 'collapse') return null
      const ov = parseFloat(cs.opacity)
      eop = pop * (Number.isFinite(ov) ? ov : 1)
      if (eop < 0.05) return null
    }
    // AN ELEMENT BEHIND AN OPAQUE OVERLAY IS NOT SHOWN EITHER (fix round 2, item 3, tightened in fix
    // round 3 to require the overlay to actually PAINT — see `paints` above — board R18's
    // `missing-box container 1318×480` census gap). The board's own detail view is a full-viewport
    // `position:fixed` panel; opening it only locks the PAGE's scroll (tools/board/client.js `show`)
    // — the home page's requirement list underneath stays mounted, `display:block`, `visibility:
    // visible`, opacity 1, every check above reads "showing". Real DOM inspection (a scratch
    // Playwright page against the served board, this fix's own investigation) found it exactly there:
    // a `.wrap` sibling of the detail's own `SECTION.dt`, painted UNDER it. display/visibility/opacity
    // are PROPERTIES; what is actually on screen is a STACKING question, so a sized box is hit-tested
    // at its own centre — if the frontmost paint there is neither the element itself nor something
    // inside or containing it, an UNRELATED box sits on top of the whole thing and it is exactly as
    // invisible as `display:none`: skipped whole, subtree included, never a placeholder (nothing in
    // ITS OWN page's flow depends on the held space — whatever occludes it is a different stacking
    // context entirely, and the walk is not scoped to any one "scene"). Bounded and honest like every
    // other check here: no `elementFromPoint` (a stub environment, or a page that will not give one)
    // never blocks anything, a `pointer-events:none` element (a decorative icon under a click-through
    // parent) is not tested at all — being ignored by the cursor is not being covered by something
    // else — and a hit that lands inside the walk's OWN narration overlay is never occlusion: that
    // chrome is the walk's own instrument, not something the app drew on top of itself.
    if (sized && typeof doc.elementFromPoint === 'function' &&
      String((cs && cs.pointerEvents) || '') !== 'none') {
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), Math.max(vw - 1, 0))
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), Math.max(vh - 1, 0))
      let hit = null
      try { hit = doc.elementFromPoint(cx, cy) } catch { hit = null }
      if (hit && hit !== el) {
        const related = (el.contains && el.contains(hit)) || (hit.contains && hit.contains(el))
        const inOverlay = hit.id === OVERLAY || (hit.closest && hit.closest('#' + OVERLAY))
        if (!related && !inOverlay && paints(hit)) {
          // …and the replica capture is told, so it plates exactly what this walk refused to measure
          // (task 3b, item 2 — board R20's lightbox: the reader behind it came back as extra boxes)
          if (report) report.occluded.push(el)
          return null
        }
      }
    }
    const out = { el, tag, eop, rec: null }
    if (!sized) return out                          // no box to draw — but its children may have one
    const leafWords = nonPseudoChildren(el) === 0 && !!ownWords(el)
    const floor = leafWords ? 6 : MIN
    if (r.width >= floor && r.height >= floor) {
      const leaf = nonPseudoChildren(el) === 0
      let text = leaf ? ownWords(el) : ''
      // a field showing its PLACEHOLDER is empty, and the drawing has to say so in the quiet
      // ink rather than in the field's own text colour — otherwise "Add a task and press
      // Enter…" reads as something a person typed (mirror-9)
      let ph = false
      if (tag === 'INPUT') {
        const v = clean(el.value)
        text = v || clean(el.getAttribute('placeholder') || '')
        ph = !v && !!text
      }
      let focus = !!forced
      if (!focus && rb) {
        const ox = Math.max(0, Math.min(r.right, rb.x + rb.w) - Math.max(r.left, rb.x))
        const oy = Math.max(0, Math.min(r.bottom, rb.y + rb.h) - Math.max(r.top, rb.y))
        const area = Math.max(1, r.width * r.height)
        // the RINGED element, not every ancestor containing it: most of the element must lie
        // inside the ring, and it may not be far larger than the ring itself
        focus = (ox * oy) / area >= 0.6 && area <= rArea * 4
      }
      // the asserted value is the whole point of the mirror — take it however it is nested.
      // NEVER FOR AN SVG (fix round 2, item 2, board R18): SVGElement has no `innerText`, so this
      // fell back to `textContent`, which — unlike an HTML element's — walks every descendant TEXT
      // NODE regardless of the element it sits in, <style> included. A big inline svg (the board's
      // own drawn schematic) with a scoped <style> of animation rules and no other text became the
      // ring target of a beat with nothing else to show, and its "text" came back as raw CSS
      // (".vzabc .wf0{animation:...}") — which a replica rightly never serialises (spec/_replica.mjs
      // DROPs style/script), so the gate demanded a word back that no honest replica could ever
      // carry. The walk never descends into an svg's own children anyway (`if (m.tag !== 'SVG')
      // walk(...)`, below), so there is no OTHER path that could supply a truer value here — an
      // icon's own drawable content is read by `iconOf`, not by text.
      if (focus && !text && tag !== 'SVG' && !hasPlatedMedia(el, 0) && countTextLeaves(el, 0, 2) <= 1) text = clean(el.innerText || el.textContent)
      const rec = {
        x: Math.round(r.left), y: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        kind: kindOf(el, tag, leaf, text, r),
        tag: tag.toLowerCase()
      }
      if (text) rec.text = text
      if (ph) rec.ph = 1
      if (focus) rec.focus = true
      // THE ELEMENT'S OWN TYPE (2026-08-29, the human: "the input box of add task is in a
      // different place"). The boxes already matched; what did not was the text INSIDE the
      // ringed box — the drawing typed the asserted value centred, at a size taken from the
      // box's height, which is right for a text leaf and wrong for a field. So measure what
      // the page actually does with that text: its font size, its alignment, and the inset
      // its text starts from (padding + border).
      //
      // …AND ITS OWN PAINT AND STATE (mirror-8, 2026-09-02, the human: the schematic "looks
      // like a skeleton"). Everything below was being thrown away, and with it every chip, the
      // primary button, the ticked box and the struck-through done row — the drawing showed
      // one grey bar for all of them. THE FIELDS, all optional (an older skeleton simply has
      // none of them and draws exactly as it always did):
      //
      //   bg  "r,g,b"  background colour, when it is not transparent
      //   fg  "r,g,b"  text colour, for an element that carries text
      //   bd  "r,g,b"  border colour, when some border is actually drawn
      //   rd  px       border-radius (top-left), capped at 40
      //   fw  1        font-weight ≥ 600
      //   td  1        text-decoration-line contains line-through
      //   it  1        font-style italic
      //   op  0..1     EFFECTIVE opacity (ancestors multiplied in), only when faded
      //   on  1        a `check` that is ticked (checked / aria-checked / aria-pressed / data-*)
      //   dis 1        disabled / aria-disabled
      //   ff  sans|mono|serif   the family the text is set in (mirror-9)
      //   tt  'u'      text-transform:uppercase — the casing the page shows
      //   ph  1        the text came from a field's PLACEHOLDER, so the field is empty
      //
      // These are MEASUREMENTS, not paint: tools/viz.mjs dyeOf maps each colour to the nearest
      // design token at derive time and the SVG emits only var(--token) — no app colour has
      // ever reached, or may reach, the board.
      //
      // The style was already resolved ABOVE, once per VISITED on-screen element — the walk
      // needs each element's own opacity and visibility to carry the effective value down to
      // its children (mirror-9), so it can no longer be deferred to the ≤150 kept ones.
      // (Corrected 2026-09-02, rule 6: this comment used to say "one per kept element".) The
      // cost is bounded by the same BUDGET the walk already obeys, and every element that
      // reaches it has just been measured with getBoundingClientRect anyway.
      try {
        if (text && cs) {
          const fs = parseFloat(cs.fontSize)
          if (fs > 0) rec.fs = Math.round(fs * 10) / 10
          let ta = cs.textAlign
          const rtl = cs.direction === 'rtl'
          if (ta === 'start') ta = rtl ? 'right' : 'left'
          if (ta === 'end') ta = rtl ? 'left' : 'right'
          rec.ta = ta === 'center' ? 'c' : (ta === 'right' ? 'r' : 'l')
          const pl = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0)
          const pr = (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderRightWidth) || 0)
          if (pl > 0) rec.pl = Math.round(pl * 10) / 10
          if (pr > 0) rec.pr = Math.round(pr * 10) / 10
          const fg = rgb(cs.color)
          if (fg) rec.fg = fg
          if (parseInt(cs.fontWeight, 10) >= 600) rec.fw = 1
          if (/line-through/.test(String(cs.textDecorationLine || cs.textDecoration || ''))) rec.td = 1
          if (String(cs.fontStyle || '') === 'italic') rec.it = 1
          // THE FAMILY THE PAGE SETS IT IN (mirror-9). Everything typed was drawn sans except a
          // field's value, which was always mono — and the photograph shows the app's own sans
          // in both. `sans` unless the stack names a typewriter face; `serif` is recorded
          // honestly and the drawing maps it to sans, the only two families the board has.
          const fam = String(cs.fontFamily || '').toLowerCase()
          rec.ff = /mono|courier|menlo|consolas|monaco|sf ?mono/.test(fam)
            ? 'mono'
            : (!/sans/.test(fam) && /serif|georgia|times/.test(fam)) ? 'serif' : 'sans'
          // …and the casing it shows them in: a tracked uppercase section label is a different
          // component from a sentence, and drawing it in title case loses that
          if (String(cs.textTransform || '') === 'uppercase') rec.tt = 'u'
        }
        const bg = rgb(cs.backgroundColor)
        if (bg) rec.bg = bg
        const bw = Math.max(
          parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderRightWidth) || 0,
          parseFloat(cs.borderBottomWidth) || 0, parseFloat(cs.borderLeftWidth) || 0)
        if (bw > 0) {
          const bd = rgb(cs.borderTopColor) || rgb(cs.borderLeftColor)
          if (bd) rec.bd = bd
        }
        const rd = parseFloat(cs.borderTopLeftRadius) || 0
        if (rd > 0) rec.rd = Math.round(Math.min(rd, 40) * 10) / 10
      } catch { /* an element that will not compute simply has no measured type */ }
      // the EFFECTIVE opacity, ancestors included — anything under 0.05 never got this far.
      // Outside the try, because a page that will not compute a style still fades its subtree.
      if (eop < 1) rec.op = Math.round(eop * 100) / 100
      // …and the two facts the style cannot answer, straight off the element
      // TICKED? Every honest signal a control can carry (2026-09-02, the lead's review: the demo's
      // done boxes harvested as green squares with no tick — Tsumiki's tick is a CSS class `on`
      // and an ::after pseudo-element, which the attribute reads above could not see): the
      // native `checked`, aria-checked / aria-pressed, a data-* flag, a state CLASS the app
      // itself names (on / checked / done / completed / selected / active), or a pseudo-element
      // that actually draws something. Still never guessed from geometry or colour alone.
      if (rec.kind === 'check') {
        const cls = ' ' + String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className || '') + ' '
        const stateClass = /\s(on|checked|done|completed|complete|selected|active|is-checked|is-done)\s/i.test(cls)
        let pseudo = false
        try {
          for (const ps of ['::after', '::before']) {
            const c = getComputedStyle(el, ps).content
            if (c && c !== 'none' && c !== 'normal' && c !== '""' && c !== "''") { pseudo = true; break }
          }
        } catch { /* a control that will not compute has no pseudo tick */ }
        if (el.checked === true || el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' || el.getAttribute('data-checked') === 'true' ||
          el.getAttribute('data-done') === 'true' || stateClass || pseudo) rec.on = 1
      }
      if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') rec.dis = 1
      // …and the SHAPES a small inline svg is drawn from (mirror-10), so the mirror can draw
      // the chevron the photograph shows instead of a plate where it stands
      if (tag === 'SVG' && r.width <= ICON_MAX && r.height <= ICON_MAX) {
        try {
          const icon = iconOf(el, r, cs)
          if (icon) rec.icon = icon
        } catch { /* an svg that will not read is simply a plain image, as it always was */ }
      }
      out.rec = rec
    }
    return out
  }

  // ── WHAT EARNS A SLOT (2026-09-03) ────────────────────────────────────────────────────────
  // An UNPAINTED WRAPPER — no background, no border, no words, no icon, not the ringed element —
  // is invisible in the photograph and drawn as nothing but a hairline the photograph does not
  // have; on dojostack's House View 146 of the 360 slots went to such boxes while the ringed cell
  // got none. It is still DESCENDED (its children may be painted); it just takes no slot.
  const keep = (rec) => !!(rec.focus || rec.text || rec.bg || rec.bd || rec.icon || rec.kind !== 'container')
  const recorded = new Set()
  const record = (m) => {
    recorded.add(m.el)
    if (m.rec && keep(m.rec) && els.length < cap) els.push(m.rec)
  }

  // ── WHERE THE BUDGET GOES (2026-09-03, the human: "the schematic is useless — off focus, the
  // component not shown") ─────────────────────────────────────────────────────────────────────
  // The walk used to run in DOCUMENT ORDER against one global cap, so a page with more boxes than
  // the cap spent every slot on whatever came first — the sidebar, the nav, the top of a grid —
  // and the ringed element, the whole point of the frame, was measured only if the DOM happened
  // to reach it in time. On dojostack it never did: 0 focused elements in every House View frame.
  // Two rules replace that. FIRST the ringed element itself: its ancestors (for the boxes it sits
  // in), then its whole subtree, under a reserve of its own. THEN the rest of the page, each
  // level's children visited NEAREST THE RING FIRST, so the remaining slots land on the row, the
  // neighbouring cells and the region around the ring rather than on the far corner of the page.
  // Without a ring the walk is the plain document-order walk it always was.
  let cap = CAP
  const RING_RESERVE = 120   // slots the ringed element's own subtree may take before the rest of the page
  const cx = rb ? rb.x + rb.w / 2 : 0
  const cy = rb ? rb.y + rb.h / 2 : 0
  const distTo = (r) => {
    const dx = r.left > cx ? r.left - cx : (r.right < cx ? cx - r.right : 0)
    const dy = r.top > cy ? r.top - cy : (r.bottom < cy ? cy - r.bottom : 0)
    return dx * dx + dy * dy
  }
  const kidsOf = (node) => {
    const kids = Array.prototype.slice.call(node.children || [])
    if (!rb) return kids.map(k => ({ el: k, r: null }))
    const out = kids.map(k => { let r = null; try { r = k.getBoundingClientRect() } catch { /* measured again below */ } return { el: k, r, d: r ? distTo(r) : Infinity } })
    out.sort((a, b) => a.d - b.d)
    return out
  }
  const walk = (node, depth, pop) => {
    if (depth > MAXD) return
    for (const kid of kidsOf(node)) {
      if (els.length >= cap || visited >= BUDGET) return
      const el = kid.el
      visited++
      const m = measure(el, pop, el === focusEl, kid.r)
      if (!m) continue
      if (!recorded.has(el)) record(m)
      if (m.tag !== 'SVG') walk(el, depth + 1, m.eop)   // an inline svg is ONE picture, not a shape tree
    }
  }

  // the ringed element: the one the caller handed over, else the deepest element under the ring's
  // centre that satisfies the ring rule (most of it inside the ring, not far larger than it) — the
  // overlay's own boxes never count
  const pointFocus = () => {
    if (!rb || typeof doc.elementsFromPoint !== 'function') return null
    let hits = []
    try { hits = doc.elementsFromPoint(cx, cy) || [] } catch { hits = [] }
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i]
      if (!h || h.id === OVERLAY || (h.closest && h.closest('#' + OVERLAY))) continue
      const r = h.getBoundingClientRect()
      const ox = Math.max(0, Math.min(r.right, rb.x + rb.w) - Math.max(r.left, rb.x))
      const oy = Math.max(0, Math.min(r.bottom, rb.y + rb.h) - Math.max(r.top, rb.y))
      const area = Math.max(1, r.width * r.height)
      if ((ox * oy) / area >= 0.6 && area <= rArea * 4) return h
    }
    return null
  }
  // the ringed element's own pass: its ancestors (for the boxes it sits in), then its whole subtree
  // under a reserve of its own. Returns false when the page is NOT SHOWING it — hidden, faded, or
  // covered by something opaque — which is the one case the caller has an alternative for.
  const mountFocus = (fe) => {
    const chain = []
    for (let a = fe.parentElement; a && a !== doc.body && chain.length < MAXD; a = a.parentElement) chain.unshift(a)
    let pop = 1
    for (const a of chain) {
      visited++
      const m = measure(a, pop, false)
      if (!m) return false                     // a hidden ancestor hides the ring target too
      if (!recorded.has(a)) record(m)
      pop = m.eop
    }
    visited++
    const m = measure(fe, pop, true)
    if (!m) return false
    cap = Math.min(CAP, els.length + RING_RESERVE)
    record(m)
    if (m.tag !== 'SVG') walk(fe, chain.length + 1, m.eop)
    cap = CAP
    return true
  }
  // the ringed element: the one the caller handed over, else the deepest element under the ring's
  // centre that satisfies the ring rule (most of it inside the ring, not far larger than it) — the
  // overlay's own boxes never count.
  //
  // …AND WHEN THE ONE HANDED OVER IS NOT ON SCREEN, THE RING'S CENTRE DECIDES ANYWAY (task 3b, item
  // 3 — board R22, 2026-09-04). A locator can still match an element the page has stopped showing:
  // this board keeps its home page mounted behind an opened dialog, so `reveal()`'s target was a
  // card UNDER a modal. This walk correctly dropped that card as occluded and measured the dialog —
  // but the replica capture rooted its scene on the card and pictured the page behind the modal, and
  // the gate then read 13 missing rings and a page of missing text on a replica that was internally
  // perfect. The ringed element the moment is a PICTURE OF has to be one the page is showing; the
  // ring box stays where the overlay painted it, because that is where the photograph's ring is.
  let focusEl = target || null
  let mounted = false
  if (focusEl) mounted = mountFocus(focusEl)
  if (!mounted) {
    const alt = pointFocus()
    if (alt && alt !== focusEl && mountFocus(alt)) { focusEl = alt; mounted = true }
    else if (!target) focusEl = null
  }
  if (report) report.ringEl = mounted ? focusEl : null
  if (doc.body) walk(doc.body, 0, 1)
  return { w: vw, h: vh, ring: rb, els }
}
