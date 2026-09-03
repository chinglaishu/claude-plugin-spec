// tools/layout-walk.test.mjs — the layout skeleton's walk (spec/_layout-walk.mjs), pinned where it
// went wrong on 2026-09-03 (the human, on dojostack's House View screen: "the schematic is useless —
// screenshot 1 is off focus, screenshot 2 is supposed to have a versioning component but nothing is
// shown"). Both skeletons had hit the element cap in DOCUMENT ORDER — sidebar, nav, wrapper divs —
// and never measured the ringed element, so the drawing rang empty space beside a photograph of a
// value. The walk now runs on a stub DOM here, so what it must always capture is asserted, not hoped.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapLayoutWalk } from '../spec/_layout-walk.mjs'

// ── a tiny DOM: enough of Element / CSSStyleDeclaration for the walk to read ────────────────────
function el (tag, rect, opts = {}) {
  const kids = opts.children || []
  const node = {
    tagName: tag.toUpperCase(),
    id: opts.id || '',
    className: opts.className || '',
    children: kids,
    childElementCount: kids.length,
    textContent: opts.text != null ? opts.text : kids.map(k => k.textContent).join(''),
    innerText: opts.text != null ? opts.text : kids.map(k => k.innerText).join(' '),
    cs: Object.assign({ opacity: '1', visibility: 'visible', color: 'rgb(2, 8, 23)', fontSize: '12px', textAlign: 'left',
      backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px',
      borderLeftWidth: '0px', borderTopLeftRadius: '0px', paddingLeft: '0px', paddingRight: '0px', fontWeight: '400',
      fontFamily: 'Inter, sans-serif', textTransform: 'none', fontStyle: 'normal', textDecorationLine: 'none',
      direction: 'ltr', content: 'none' }, opts.cs || {}),
    getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3],
      right: rect[0] + rect[2], bottom: rect[1] + rect[3], x: rect[0], y: rect[1] }),
    getAttribute: n => (opts.attrs && n in opts.attrs) ? opts.attrs[n] : null,
    hasAttribute: n => !!(opts.attrs && n in opts.attrs)
  }
  // real DOM semantics, needed by the occlusion check (fix round 2, item 3): `contains` walks the
  // ancestor chain from a candidate node up to (and including) itself; `closest` walks THIS node's
  // own ancestor chain looking for an id selector — the only form the walk's own OVERLAY lookup uses.
  node.contains = (other) => { let n = other; while (n) { if (n === node) return true; n = n.parentElement }; return false }
  node.closest = (sel) => {
    const id = sel.charAt(0) === '#' ? sel.slice(1) : null
    let n = node
    while (n) { if (id != null && n.id === id) return n; n = n.parentElement }
    return null
  }
  for (const k of kids) k.parentElement = node
  return node
}
const painted = { backgroundColor: 'rgb(255, 255, 255)', borderTopWidth: '1px', borderTopColor: 'rgb(226, 232, 240)' }
function env (body, hits = null, point = null) {
  return {
    window: { innerWidth: 1440, innerHeight: 900 },
    document: { body, elementsFromPoint: hits ? () => hits : undefined, elementFromPoint: point || undefined },
    getComputedStyle: node => node.cs || {}
  }
}
const walk = (body, ring, target = null, hits = null, point = null) =>
  snapLayoutWalk({ ring, target, env: env(body, hits, point) })

// A page shaped like the failing one: a deep sidebar + header of MANY nested wrapper boxes first in
// document order, then a data grid whose ringed cell sits deep and late. `n` wrappers stand before it.
function bigPage (n, { ringCell = true } = {}) {
  const wrappers = []
  for (let i = 0; i < n; i++) {
    // each a painted, sized box so the OLD walk records it — the budget-eaters the real page had
    wrappers.push(el('div', [0, 40 + (i % 40) * 20, 240, 18], { cs: painted }))
  }
  const sidebar = el('nav', [0, 0, 240, 900], { children: wrappers, cs: painted })
  const far = el('div', [1300, 100, 100, 30], { text: 'far label', cs: painted })
  const valueSpan = el('span', [744, 656, 106, 16], { text: '4.00%' })
  const cellWrap = el('div', [732, 648, 130, 32], { children: [valueSpan] })
  const cell = el('div', [732, 648, 130, 32], { children: [cellWrap], cs: painted, attrs: { role: 'gridcell' } })
  const nextCell = el('div', [862, 648, 100, 32], { children: [el('span', [874, 656, 76, 16], { text: '4.00%' })], cs: painted })
  const rowLabel = el('div', [504, 648, 200, 32], { children: [el('span', [510, 656, 60, 16], { text: 'Input' })], cs: painted })
  const row = el('div', [262, 648, 1156, 32], { children: [rowLabel, cell, nextCell], attrs: { role: 'row' } })
  // fifteen more grid rows ABOVE the ringed one, each with three painted cells, so the grid alone is big
  const rows = []
  for (let i = 0; i < 15; i++) {
    const y = 300 + i * 22
    rows.push(el('div', [262, y, 1156, 20], { attrs: { role: 'row' }, children: [
      el('div', [504, y, 200, 20], { children: [el('span', [510, y + 2, 60, 14], { text: 'Row ' + i })], cs: painted }),
      el('div', [732, y, 130, 20], { children: [el('span', [744, y + 2, 100, 14], { text: (2 + i * 0.1).toFixed(2) + '%' })], cs: painted }),
      el('div', [862, y, 100, 20], { children: [el('span', [874, y + 2, 76, 14], { text: '2.18%' })], cs: painted })
    ] }))
  }
  // eight levels of UNPAINTED wrappers between the main region and the grid, as ag-grid + app shells stack
  let grid = el('div', [262, 264, 1156, 610], { children: [...rows, row] })
  for (let d = 0; d < 8; d++) grid = el('div', [260 + d, 100 + d, 1160 - 2 * d, 776 - 2 * d], { children: [grid] })
  const main = el('main', [240, 0, 1200, 900], { children: [far, grid] })
  const body = el('body', [0, 0, 1440, 900], { children: [sidebar, main] })
  return { body, cell, valueSpan, ring: ringCell ? { x: 732, y: 648, width: 130, height: 32 } : null }
}

test('the ringed element and its words are captured even when the page has more boxes than the cap', () => {
  const p = bigPage(500)
  const L = walk(p.body, p.ring)
  const focus = L.els.filter(e => e.focus)
  assert.ok(focus.length >= 1, 'the ringed element is in the skeleton (it was measured last, past the cap, before)')
  assert.ok(focus.some(e => e.text === '4.00%'), 'and the value the ring is around is its text: ' + JSON.stringify(focus))
})

test('the ring is found from the element itself when the caller hands it over, not only from geometry', () => {
  const p = bigPage(500)
  const L = walk(p.body, p.ring, p.cell)
  assert.ok(L.els.some(e => e.focus && e.x === 732 && e.w === 130), 'the handed-over cell is the focused box')
  assert.ok(L.els.some(e => e.text === '4.00%' && e.x === 744), 'its own leaf rides in with it')
})

test('the rest of the budget is spent nearest the ring first — the ringed row\'s neighbours beat the far sidebar', () => {
  const p = bigPage(500)
  const L = walk(p.body, p.ring)
  assert.ok(L.els.some(e => e.text === 'Input'), 'the row label two cells left of the ring is captured')
  assert.ok(L.els.some(e => e.text === '4.00%' && e.x === 874), 'so is the next cell in the row')
  assert.ok(L.els.some(e => e.text === 'Row 14'), 'and the row just above it')
  const sidebarBoxes = L.els.filter(e => e.x === 0 && e.w === 240 && e.h === 18).length
  assert.ok(sidebarBoxes < 300, 'the sidebar no longer takes the whole budget (' + sidebarBoxes + ' of its 500 boxes, under 300)')
  assert.ok(L.els.length <= 360, 'the cap still holds: ' + L.els.length)
})

test('an unpainted wrapper — no background, no border, no words — is not recorded; what it wraps is', () => {
  const p = bigPage(10)
  const L = walk(p.body, p.ring)
  const wrappers = L.els.filter(e => e.kind === 'container' && !e.bg && !e.bd && !e.text && !e.focus)
  assert.deepEqual(wrappers, [], 'no invisible wrapper takes a slot the drawing never paints')
  assert.ok(L.els.some(e => e.text === 'far label'), 'a painted, worded box far from the ring is still there when the budget allows')
  assert.ok(L.els.some(e => e.kind === 'row'), 'rows keep their own kind and are recorded')
})

test('without a ring the walk still measures the page in order, painted boxes and words only', () => {
  const p = bigPage(20, { ringCell: false })
  const L = walk(p.body, null)
  assert.equal(L.ring, null)
  assert.ok(L.els.every(e => !e.focus))
  assert.ok(L.els.some(e => e.text === 'Row 3'))
})

// ── the second miss the House View harvest showed (2026-09-03, after the ring-first pass shipped) ──
// The version picker sits under a `main` whose OWN box measures zero width (a min-w-0 flex region
// whose children overflow it) — and a zero-sized box was read as display:none, its whole subtree
// dropped. The captured "header" was a sibling bar. A box with no size is not a hidden box.
function zeroWidthPage () {
  const label = el('span', [1120, 12, 60, 16], { text: 'Version' })
  const value = el('span', [1180, 12, 56, 16], { text: 'Live · Nov 2030' })
  const picker = el('button', [1115, 5, 124, 28], { children: [label, value], cs: painted, attrs: { 'aria-label': 'Version' } })
  const bar = el('div', [900, 0, 340, 40], { children: [picker], cs: painted })
  const mainZero = el('main', [48, 0, 0, 95], { children: [bar] })              // width 0, children overflow it
  const hiddenMenu = el('div', [0, 0, 0, 0], { cs: { display: 'none' }, children: [el('span', [0, 0, 80, 20], { text: 'never shown' })] })
  const other = el('div', [240, 0, 1200, 40], { children: [el('span', [1352, 6, 28, 28], { text: '⟳', cs: painted })], cs: painted })
  const body = el('body', [0, 0, 1440, 900], { children: [other, mainZero, hiddenMenu] })
  return { body, picker, ring: { x: 1115, y: 5, width: 124, height: 28 } }
}

test('a zero-sized ancestor (a 0-width main whose children overflow it) is descended, not dropped as hidden', () => {
  const p = zeroWidthPage()
  const L = walk(p.body, p.ring)
  assert.ok(L.els.some(e => e.focus && e.text && /Nov 2030/.test(e.text)), 'the picker under the 0-width main is captured and focused: ' + JSON.stringify(L.els))
  assert.ok(!L.els.some(e => e.w === 0), 'and the zero-sized box itself takes no slot')
})

test('the same when the caller hands the element over — a zero-sized ancestor does not veto its ring', () => {
  const p = zeroWidthPage()
  const L = walk(p.body, p.ring, p.picker)
  assert.ok(L.els.some(e => e.focus && e.x === 1115 && e.w === 124), 'the picker is recorded with focus')
})

test('display:none still prunes the whole subtree — a hidden menu\'s words never appear', () => {
  const p = zeroWidthPage()
  const L = walk(p.body, p.ring)
  assert.ok(!L.els.some(e => e.text === 'never shown'))
})

test('the ring in the skeleton is the element\'s CURRENT box when the element is handed over', () => {
  // R7 on House View: the ring was painted on "Publishing…", the button then re-laid out to "Activate",
  // and the skeleton carried the stale ring beside an element measured somewhere else
  const p = bigPage(10)
  const stale = { x: 600, y: 400, width: 111, height: 34 }
  const L = walk(p.body, stale, p.cell)
  assert.deepEqual(L.ring, { x: 732, y: 648, w: 130, h: 32 }, 'the skeleton rings where the element IS')
  assert.ok(L.els.some(e => e.focus && e.x === 732))
})

// ── FIX ROUND 2, item 2: A FOCUSED SVG'S text() FALLBACK MUST NOT LEAK ITS <style>'S RAW CSS ──────
// board R18's census gap: a big (488×305) inline <svg> — the board's own drawn schematic, embedded
// with a scoped <style> of animation rules — was the ring target of a beat with no OTHER text, so
// the "the asserted value is the whole point of the mirror" fallback ran `el.innerText ||
// el.textContent`. SVGElement has no innerText, and textContent walks EVERY descendant text node
// regardless of element type — including the raw CSS sitting inside <style>, which a replica rightly
// never serialises (spec/_replica.mjs's DROP list). Every record now also carries its own `tag`
// (lowercase), so the gate can name what it is refusing to demand text from.
test('every recorded element carries its own tag, lowercased', () => {
  const label = el('span', [100, 100, 60, 16], { text: 'Total' })
  const body = el('body', [0, 0, 1440, 900], { children: [label] })
  const L = walk(body, null)
  const rec = L.els.find(e => e.text === 'Total')
  assert.equal(rec.tag, 'span')
})

// FIX ROUND 3 (2026-09-03, board R18/R10) — found by re-rendering a gapped `.actual.html` back
// through this same walk (the in-page gate's own read). A replica materialises a ::before/::after
// as a real `<span data-pseudo="…">` child (spec/_replica.mjs's `pseudo()`) so a reader sees "▶ Run"
// instead of an empty box where the app drew a tick with CSS — but that span makes
// `childElementCount` nonzero on the button it decorates, so the walk's OLD leaf rule ("no child
// elements") stopped recognising "Run" and every requirement chip's "R18" as a leaf and dropped
// their text entirely: box exactly right, word gone, one `missing-text` gap per chip plus the Run
// button, on every board screen that button and those chips appear on.
test('a leaf with only a data-pseudo child is still read as a leaf — its own text, none of the pseudo span\'s', () => {
  const pseudo = el('span', [10, 10, 10, 14], { text: '▶', attrs: { 'data-pseudo': 'before' } })
  const btn = el('button', [10, 10, 60, 24], { children: [pseudo] })
  btn.childNodes = [pseudo, { nodeType: 3, textContent: 'Run' }]
  const body = el('body', [0, 0, 1440, 900], { children: [btn] })
  const L = walk(body, null)
  const rec = L.els.find(e => e.tag === 'button')
  assert.ok(rec, 'the button is recorded: ' + JSON.stringify(L.els))
  assert.equal(rec.text, 'Run', 'the pseudo glyph is not glued onto the button\'s own text')
})

test('a data-pseudo AFTER span carrying a long tooltip never leaks into the leaf\'s own word', () => {
  const tip = el('span', [0, 0, 1, 1],
    { text: 'R18 — Three views of a screen\'s requirements: Focus, List, Flow · passed', attrs: { 'data-pseudo': 'after' } })
  const chip = el('button', [759, 856, 30, 30], { children: [tip] })
  chip.childNodes = [{ nodeType: 3, textContent: 'R18' }, tip]
  const body = el('body', [0, 0, 1440, 900], { children: [chip] })
  const L = walk(body, null)
  const rec = L.els.find(e => e.tag === 'button')
  assert.equal(rec.text, 'R18', 'the tooltip text never rides as the chip\'s own word: ' + JSON.stringify(rec))
})

test('a real (non-pseudo) child element still disqualifies an element from the leaf rule, as before', () => {
  const real = el('span', [10, 10, 20, 14], { text: 'Draft' })
  const wrap = el('button', [10, 10, 60, 24], { children: [real] })
  wrap.childNodes = [real]
  const body = el('body', [0, 0, 1440, 900], { children: [wrap] })
  const L = walk(body, null)
  const rec = L.els.find(e => e.tag === 'button')
  assert.ok(rec, JSON.stringify(L.els))
  assert.ok(!rec.text, 'a button wrapping a real element is still not a leaf, unchanged: ' + JSON.stringify(rec))
})

test('a focused SVG\'s embedded <style> text never becomes the element\'s "text" — the walk never descends into an svg\'s children, so nothing else could supply one either', () => {
  const styleNode = el('style', [0, 0, 0, 0], { text: '.vzabc .wf0{animation:vabc123f0 3s linear infinite}' })
  // real SVGElement.textContent concatenates every descendant text node, <style> included — the stub's
  // default textContent (kids.map(k => k.textContent).join('')) reproduces exactly that behaviour
  const schematic = el('svg', [387, 187, 488, 305], { children: [styleNode] })
  const body = el('body', [0, 0, 1440, 900], { children: [schematic] })
  const ring = { x: 387, y: 187, width: 488, height: 305 }
  const L = walk(body, ring, schematic)
  const rec = L.els.find(e => e.focus)
  assert.ok(rec, 'the focused svg is still recorded: ' + JSON.stringify(L.els))
  assert.equal(rec.tag, 'svg')
  assert.ok(!rec.text || !/animation/.test(rec.text), 'the style block\'s CSS never rides as this element\'s text: ' + JSON.stringify(rec))
})

// ── FIX ROUND 3 (the re-review's own finding on fix round 2, item 4): a focused ANCESTOR of a big
// svg still ran the unmodified innerText fallback, so a plain `div` wrapping the board's own drawn
// schematic aggregated the diagram's rendered `<text>` labels into 48 characters no honest replica
// could ever contain (spec/_replica.mjs plates that same svg to an empty box). The fix above excluded
// only the svg ITSELF; this excludes any focused element whose SUBTREE contains one — same threshold
// (`ICON_MAX`, pinned equal to spec/_replica.mjs's `SVG_ICON_MAX` in tools/replica.test.mjs, since
// neither self-contained file may import the other) plus `iframe`/`video`/`canvas`, plated regardless
// of size.
test('a focused ANCESTOR wrapping a big (platable) svg never aggregates the diagram\'s own rendered labels either', () => {
  const label1 = el('text', [400, 200, 50, 14], { text: 'Total tasks' })
  const label2 = el('text', [400, 220, 50, 14], { text: '24' })
  const bigSvg = el('svg', [387, 187, 488, 305], { children: [label1, label2] })
  const wrapper = el('div', [387, 187, 488, 305], { children: [bigSvg] })
  const body = el('body', [0, 0, 1440, 900], { children: [wrapper] })
  const ring = { x: 387, y: 187, width: 488, height: 305 }
  const L = walk(body, ring, wrapper)
  const rec = L.els.find(e => e.tag === 'div' && e.focus)
  assert.ok(rec, 'the wrapper div is recorded and focused: ' + JSON.stringify(L.els))
  assert.ok(!rec.text, 'the diagram\'s own rendered labels never become the wrapper\'s "text": ' + JSON.stringify(rec))
})

test('a focused ancestor wrapping a SMALL icon-sized svg still gets its aggregate fallback text — an icon rides verbatim, unaffected', () => {
  const label = el('span', [10, 10, 20, 14], { text: 'Draft' })
  const icon = el('svg', [4, 4, 16, 16], { children: [] })
  const wrapper = el('div', [0, 0, 60, 24], { children: [icon, label] })
  const body = el('body', [0, 0, 1440, 900], { children: [wrapper] })
  const ring = { x: 0, y: 0, width: 60, height: 24 }
  const L = walk(body, ring, wrapper)
  const rec = L.els.find(e => e.tag === 'div' && e.focus)
  assert.equal(rec.text, 'Draft', 'a small (icon-sized) svg does not block the fallback: ' + JSON.stringify(rec))
})

// FIX ROUND 3 (continued) — found by `npm run proof mirror`'s OWN independent node-text check
// (tools/proof-integrity.mjs `checkReplicas`, not the in-page gate) after the plated-media fix above
// landed and re-harvested: a reader toolbar wrapper (Play / auto-step / speed buttons) and a
// storyline pager wrapper (its counter plus several requirement chips) both got `focus:true` from a
// beat's ring union and still aggregated every sibling control's own separately-recorded text into
// one 48-char blob no single replica element could ever match.
test('a focused wrapper spanning TWO OR MORE separate text-bearing controls does not aggregate them — each is already recorded on its own', () => {
  const play = el('button', [10, 10, 40, 20], { text: 'Play' })
  const speed = el('button', [60, 10, 40, 20], { text: '1×' })
  const toolbar = el('div', [0, 0, 200, 40], { children: [play, speed] })
  const body = el('body', [0, 0, 1440, 900], { children: [toolbar] })
  const ring = { x: 0, y: 0, width: 200, height: 40 }
  const L = walk(body, ring, toolbar)
  const rec = L.els.find(e => e.tag === 'div' && e.focus)
  assert.ok(rec, JSON.stringify(L.els))
  assert.ok(!rec.text, 'two sibling controls never fuse into one aggregate string: ' + JSON.stringify(rec))
  // and each control is still separately recorded, exactly as an honest replica would render it
  assert.ok(L.els.some(e => e.text === 'Play'))
  assert.ok(L.els.some(e => e.text === '1×'))
})

test('a focused wrapper with exactly ONE text-bearing leaf still gets its fallback text — a single value nested a level deep', () => {
  const icon = el('svg', [4, 4, 12, 12], { children: [] })     // small, decorative, no text of its own
  const valueSpan = el('span', [20, 4, 30, 12], { text: '24' })
  const wrapper = el('div', [0, 0, 60, 20], { children: [icon, valueSpan] })
  const body = el('body', [0, 0, 1440, 900], { children: [wrapper] })
  const ring = { x: 0, y: 0, width: 60, height: 20 }
  const L = walk(body, ring, wrapper)
  const rec = L.els.find(e => e.tag === 'div' && e.focus)
  assert.equal(rec.text, '24', 'exactly one real value nested inside still falls back: ' + JSON.stringify(rec))
})

test('a focused wrapper with NO text-bearing leaf at all stays textless, as before', () => {
  const icon = el('svg', [4, 4, 12, 12], { children: [] })
  const wrapper = el('div', [0, 0, 20, 20], { children: [icon] })
  const body = el('body', [0, 0, 1440, 900], { children: [wrapper] })
  const ring = { x: 0, y: 0, width: 20, height: 20 }
  const L = walk(body, ring, wrapper)
  const rec = L.els.find(e => e.tag === 'div' && e.focus)
  assert.ok(!rec.text, JSON.stringify(rec))
})

test('an iframe/video/canvas anywhere in a focused subtree blocks the aggregate fallback the same way — plated regardless of size', () => {
  for (const tag of ['iframe', 'video', 'canvas']) {
    // fallback content a real browser can expose via innerText/textContent (a <video>'s child text
    // node, an <iframe title>'s document, a <canvas>'s accessible fallback) — exactly what would leak
    // without the exclusion; an empty media element would pass even unfixed, proving nothing
    const media = el(tag, [10, 10, 40, 30], { text: 'fallback content the plate will drop' })
    const wrapper = el('div', [0, 0, 60, 60], { children: [media] })
    const body = el('body', [0, 0, 1440, 900], { children: [wrapper] })
    const ring = { x: 0, y: 0, width: 60, height: 60 }
    const L = walk(body, ring, wrapper)
    const rec = L.els.find(e => e.tag === 'div' && e.focus)
    assert.ok(!rec.text, tag + ': ' + JSON.stringify(rec))
  }
})

// ── FIX ROUND 2, item 3: CONTENT BEHIND A FULL-VIEWPORT OVERLAY IS NOT SHOWN EITHER ───────────────
// board R18's census: `missing-box container 1318×480` plus rows of missing/moved text underneath —
// all of it the "Board" screen's own requirement list, which tools/board/client.js's `show`/
// `closeAll` never hides when a detail view opens (only body SCROLL is locked; a scratch Playwright
// page against the served board, this fix's own investigation, found the list still mounted as a
// `.wrap` sibling of the detail's `SECTION.dt`, `display:block`/`visibility:visible`, simply painted
// UNDER the detail's `position:fixed` panel). Stacking, not a property, is what says it is not shown.
function occludedPage () {
  const bgLeaf = el('div', [100, 300, 300, 40], { text: 'Home page content, still mounted', cs: painted })
  const bg = el('section', [100, 300, 300, 40], { children: [bgLeaf], cs: painted })
  const modalLeaf = el('div', [10, 10, 50, 20], { text: 'Modal content', cs: painted })
  const modal = el('section', [0, 0, 1440, 900], { children: [modalLeaf], cs: painted })
  const body = el('body', [0, 0, 1440, 900], { children: [bg, modal] })
  const point = () => modal            // the stub's hit test: the modal covers the whole viewport
  return { body, bg, bgLeaf, modal, modalLeaf, point }
}

test('an element behind a full-viewport overlay is occluded — its whole subtree is skipped like display:none', () => {
  const p = occludedPage()
  const L = walk(p.body, null, null, null, p.point)
  assert.ok(!L.els.some(e => /Home page content/.test(e.text || '')), 'the occluded leaf never appears: ' + JSON.stringify(L.els))
  assert.ok(!L.els.some(e => e.x === 100 && e.y === 300 && e.w === 300 && e.h === 40), 'nor its occluded container box')
  assert.ok(L.els.some(e => /Modal content/.test(e.text || '')), 'the element actually on top is unaffected')
})

test('without an elementFromPoint (an older/stub environment) nothing is treated as occluded', () => {
  const p = occludedPage()
  const L = walk(p.body, null)                       // no point fn — occlusion check never runs
  assert.ok(L.els.some(e => /Home page content/.test(e.text || '')), 'never blocks on a capability the environment does not have')
})

test('a pointer-events:none element is exempt from the occlusion check — click-through is not covered', () => {
  const iconEl = el('div', [10, 10, 50, 20], { text: 'Icon label', cs: Object.assign({}, painted, { pointerEvents: 'none' }) })
  const modalLeaf = el('div', [500, 500, 50, 20], { text: 'Unrelated', cs: painted })
  const point = () => modalLeaf
  const body = el('body', [0, 0, 1440, 900], { children: [iconEl] })
  const L = walk(body, null, null, null, point)
  assert.ok(L.els.some(e => e.text === 'Icon label'), 'a click-through element is not mistaken for a covered one')
})

test('a hit inside the walk\'s own narration overlay never counts as occlusion', () => {
  const overlayLeaf = el('div', [10, 10, 50, 20], { id: '__specboard-focus', text: 'ring chrome' })
  const appEl = el('div', [100, 300, 300, 40], { text: 'Real content', cs: painted })
  const point = () => overlayLeaf
  const body = el('body', [0, 0, 1440, 900], { children: [appEl] })
  const L = walk(body, null, null, null, point)
  assert.ok(L.els.some(e => e.text === 'Real content'), 'the overlay is the walk\'s own instrument, not something the app drew on top')
})

// ── FIX ROUND 3 — the re-review's own scrutiny on fix round 2, item 3: "does this risk hiding
// content under a translucent veil the user can still see?" `elementFromPoint` answers stacking
// order only, with no idea whether the frontmost element is opaque, half-see-through, or paints
// nothing at all — so a translucent scrim the APP itself draws (a modal backdrop, a loading veil —
// the same `rgba(…, .4)` pattern this codebase's own dim overlay uses, just not inside
// `#__specboard-focus`) or an invisible click-catcher (used purely to close a dropdown on an outside
// click) would occlude everything under it just the same, though a human viewer sees it dimmed or
// sees straight through it. An occluder must now actually PAINT: an opaque background (alpha ≥ 0.98)
// or be an image/video/canvas.
test('a TRANSLUCENT scrim drawn by the app does not occlude — dimmed is not gone', () => {
  const bgLeaf = el('div', [100, 300, 300, 40], { text: 'Real content under the scrim', cs: painted })
  const scrim = el('div', [0, 0, 1440, 900], { cs: { backgroundColor: 'rgba(28, 27, 24, 0.4)' } })
  const body = el('body', [0, 0, 1440, 900], { children: [bgLeaf, scrim] })
  const point = () => scrim
  const L = walk(body, null, null, null, point)
  assert.ok(L.els.some(e => e.text === 'Real content under the scrim'), 'a translucent hit never blocks what a viewer still sees through it: ' + JSON.stringify(L.els))
})

test('an INVISIBLE click-catcher (no background at all) does not occlude', () => {
  const bgLeaf = el('div', [100, 300, 300, 40], { text: 'Real content under the catcher', cs: painted })
  const catcher = el('div', [0, 0, 1440, 900], { cs: { backgroundColor: 'rgba(0, 0, 0, 0)' } })
  const body = el('body', [0, 0, 1440, 900], { children: [bgLeaf, catcher] })
  const point = () => catcher
  const L = walk(body, null, null, null, point)
  assert.ok(L.els.some(e => e.text === 'Real content under the catcher'), 'a transparent hit blocks nothing: ' + JSON.stringify(L.els))
})

test('an OPAQUE scrim still occludes — the paint requirement narrows the check, it does not remove it', () => {
  const p = occludedPage()   // its `modal` carries `painted`: an opaque rgb(255,255,255) background
  const L = walk(p.body, null, null, null, p.point)
  assert.ok(!L.els.some(e => /Home page content/.test(e.text || '')), 'a truly opaque hit still occludes: ' + JSON.stringify(L.els))
})

test('an <img>/<video>/<canvas> occludes even with no background-color declared — it paints by being what it is', () => {
  for (const tag of ['img', 'video', 'canvas']) {
    const bgLeaf = el('div', [100, 300, 300, 40], { text: 'Real content under the ' + tag, cs: painted })
    const media = el(tag, [0, 0, 1440, 900], { cs: {} })
    const body = el('body', [0, 0, 1440, 900], { children: [bgLeaf, media] })
    const point = () => media
    const L = walk(body, null, null, null, point)
    assert.ok(!L.els.some(e => /Real content under the/.test(e.text || '')), tag + ': ' + JSON.stringify(L.els))
  }
})

// ── THE WALK'S DECISIONS, REPORTED (task 3b, items 2 and 3 — 2026-09-04) ───────────────────────
// The walk and the replica capture used to answer two questions apart from each other, and disagree:
// WHAT the ring is on, and WHAT an opaque overlay covers. They run in one page pass now
// (spec/_moment.mjs), so the walk's own answers travel to the capture as element references —
// `arg.report` is where it puts them. Nothing here restates a rule; it pins that the decisions the
// walk already makes are the ones that come out.
test('the walk reports the ringed element it actually measured', () => {
  const p = bigPage(40)
  const report = {}
  snapLayoutWalk({ ring: { x: 732, y: 648, width: 130, height: 32 }, target: p.cell, env: env(p.body), report })
  assert.equal(report.ringEl, p.cell, 'the element handed over, because the page is showing it')
})

// board R22's own shape: a home card the locator still matches, and a dialog panel drawn over the
// very box the ring was painted on.
function coveredRingPage () {
  const cardLeaf = el('div', [100, 300, 300, 40], { text: 'Home card, still mounted', cs: painted })
  const card = el('section', [100, 300, 300, 40], { children: [cardLeaf], cs: painted })
  const panelLeaf = el('div', [110, 305, 280, 30], { text: 'Assigning work', cs: painted })
  const panel = el('div', [90, 290, 320, 60], { children: [panelLeaf], cs: painted })
  const dialog = el('section', [0, 0, 1440, 900], { children: [panel], cs: painted })
  const body = el('body', [0, 0, 1440, 900], { children: [card, dialog] })
  return { body, card, cardLeaf, panel, panelLeaf, dialog, point: () => dialog, hits: [panelLeaf, panel, dialog, card] }
}

test('the ringed element the picture is OF is the one on screen — a covered target hands over to the ring centre', () => {
  // board R22: a locator still matched a home card sitting BEHIND an opened dialog, so the walk
  // dropped the card as occluded and measured the dialog, while the capture rooted its scene on the
  // card and pictured the page behind the modal. Same ring, two different pictures.
  const p = coveredRingPage()
  const report = {}
  const ring = { x: 100, y: 300, width: 300, height: 40 }
  const L = snapLayoutWalk({ ring, target: p.card, env: env(p.body, p.hits, p.point), report })
  assert.ok(report.ringEl && report.ringEl !== p.card, 'the covered target is not what the moment is a picture of')
  assert.ok(p.dialog.contains(report.ringEl), 'what the page shows under the ring is: ' + String(report.ringEl && report.ringEl.tagName))
  assert.ok(L.els.some(e => /Assigning work/.test(e.text || '')), 'and the skeleton is the visible page')
  assert.ok(!L.els.some(e => /Home card/.test(e.text || '')), 'never the one behind it')
  assert.deepEqual(L.ring, { x: 100, y: 300, w: 300, h: 40 }, 'the ring box stays where the overlay painted it — that is where the photograph rings')
})

test('every box the walk drops as occluded is reported, so the capture can plate the same ones', () => {
  const p = occludedPage()
  const report = {}
  snapLayoutWalk({ ring: null, target: null, env: env(p.body, null, p.point), report })
  assert.ok(report.occluded.includes(p.bg), 'the covered section is named: ' + report.occluded.length)
  assert.ok(!report.occluded.includes(p.modal), 'the thing on top is not')
})
