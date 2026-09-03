// tools/replica.test.mjs — the ACTUAL REPLICA's capture (spec/_replica.mjs), on a stub DOM, exactly
// the way tools/layout-walk.test.mjs pins the layout skeleton's walk. The replica is the app's own
// DOM with its computed styles diffed against per-tag defaults, sanitised and capped — the thing the
// board will later render beside the photograph as "Actual" (the human's 2026-09-03 decision: the
// picture beside a proof is a real HTML replica of the app's component, not a house-style drawing).
//
// Every rule of the capture is asserted here rather than hoped for in a browser: what the scene root
// is, what a class is made of, what is thrown away, and — the acceptance the plan names — that a
// fixture carrying a <script>, an onclick, a javascript: href and an external image yields none of
// them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureReplica, REPLICA_PROPS } from '../spec/_replica.mjs'

// ── a tiny DOM: enough of Node / Element / CSSStyleDeclaration for the capture to read ──────────
const txt = s => ({ nodeType: 3, textContent: String(s) })
function style (map) {
  const m = Object.assign({}, map)
  return { getPropertyValue: p => (m[p] == null ? '' : String(m[p])) }
}
function el (tag, rect, opts = {}) {
  const kids = opts.text != null ? [txt(opts.text), ...(opts.children || [])] : (opts.children || [])
  const attrs = Object.assign({}, opts.attrs || {})
  const node = {
    nodeType: 1,
    id: opts.id || '',
    tagName: tag.toUpperCase(),
    namespaceURI: opts.ns || 'http://www.w3.org/1999/xhtml',
    childNodes: kids,
    children: kids.filter(k => k.nodeType === 1),
    parentElement: null,
    shadowRoot: opts.shadowRoot || null,
    value: opts.value,
    placeholder: opts.placeholder,
    selectedOptions: opts.selectedOptions,
    cs: style(opts.cs || {}),
    pseudo: { '::before': style(opts.before || {}), '::after': style(opts.after || {}) },
    getBoundingClientRect: () => ({
      left: rect[0], top: rect[1], width: rect[2], height: rect[3],
      right: rect[0] + rect[2], bottom: rect[1] + rect[3], x: rect[0], y: rect[1]
    }),
    getAttribute: n => (n in attrs ? String(attrs[n]) : null),
    hasAttribute: n => n in attrs,
    getAttributeNames: () => Object.keys(attrs)
  }
  for (const k of node.children) k.parentElement = node
  if (opts.shadowRoot) for (const k of opts.shadowRoot.childNodes || []) if (k.nodeType === 1) k.parentElement = node
  return node
}
// every prop the capture asks for is "not the default" unless a test says otherwise, so a class is
// exactly the declarations a fixture asked for
const DEFAULTS = {}
function env (body, opts = {}) {
  return {
    window: { innerWidth: 1440, innerHeight: 900 },
    document: {
      body,
      baseURI: opts.baseURI || 'https://app.example/board',
      elementsFromPoint: opts.hits ? () => opts.hits : undefined,
      styleSheets: opts.sheets || []
    },
    getComputedStyle: (node, pseudo) => (pseudo ? (node.pseudo || {})[pseudo] || style({}) : node.cs || style({})),
    defaultsFor: (tag) => (DEFAULTS[tag] || {})
  }
}
const cap = (body, o = {}) => captureReplica({
  target: o.target || null, ring: o.ring || null, caps: o.caps, props: REPLICA_PROPS, env: env(body, o)
})

// ── 1. the scene root ───────────────────────────────────────────────────────────────────────────
test('the scene root is the smallest ancestor at least 3x the ring and no bigger than the viewport', () => {
  const word = el('span', [520, 100, 60, 20], { text: 'Draft', cs: { color: 'rgb(1,1,1)' } })
  const btn = el('button', [500, 92, 120, 36], { children: [word], cs: { border: '1px solid' } })
  const bar = el('div', [400, 88, 640, 44], { children: [btn], cs: { display: 'flex' } })      // 28160 ≥ 3×4320
  const page = el('main', [0, 0, 1440, 900], { children: [bar] })
  const body = el('body', [0, 0, 1440, 900], { children: [page] })
  const r = cap(body, { target: btn, ring: { x: 500, y: 92, width: 120, height: 36 } })
  assert.deepEqual(r.region, { x: 400, y: 88, w: 640, h: 44 }, 'the toolbar row is the scene, not the whole page')
  assert.deepEqual(r.ring, { x: 500, y: 92, w: 120, h: 36 })
  assert.ok(r.html.includes('data-ring="1"'), 'the ringed element is marked')
  assert.ok(r.html.includes('Draft'), 'and the words inside it come with it')
})

test('with no ancestor big enough the scene root is the body', () => {
  const btn = el('button', [0, 0, 1440, 900], { text: 'huge' })
  const body = el('body', [0, 0, 1440, 900], { children: [btn] })
  const r = cap(body, { target: btn, ring: { x: 0, y: 0, width: 1440, height: 900 } })
  assert.deepEqual(r.region, { x: 0, y: 0, w: 1440, h: 900 })
})

test('with no target the ringed element is found under the ring centre, as the skeleton walk does', () => {
  const word = el('span', [520, 100, 60, 20], { text: 'Live' })
  const btn = el('button', [500, 92, 120, 36], { children: [word] })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const r = cap(body, { ring: { x: 500, y: 92, width: 120, height: 36 }, hits: [btn, bar, body] })
  assert.deepEqual(r.region, { x: 400, y: 88, w: 640, h: 44 })
  assert.ok(r.html.includes('data-ring="1"'))
})

test('the ring is where the handed-over element is NOW — its own box beats the painted one', () => {
  const btn = el('button', [640, 92, 100, 36], { text: 'Activate' })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const r = cap(body, { target: btn, ring: { x: 500, y: 92, width: 120, height: 36 } })
  assert.deepEqual(r.ring, { x: 640, y: 92, w: 100, h: 36 }, 'the stale painted box is not what is recorded')
})

test('nothing to capture yields null, never an empty replica', () => {
  assert.equal(captureReplica({ target: null, ring: null, props: REPLICA_PROPS, env: env(null) }), null)
  assert.equal(captureReplica(null), null)
})

// ── 2. style diffing ────────────────────────────────────────────────────────────────────────────
test('a class is the declarations that differ from the tag default, and identical sets share one class', () => {
  const a = el('span', [10, 10, 40, 16], { text: 'one', cs: { color: 'rgb(2, 8, 23)', 'font-size': '13px' } })
  const b = el('span', [60, 10, 40, 16], { text: 'two', cs: { color: 'rgb(2, 8, 23)', 'font-size': '13px' } })
  const c = el('span', [110, 10, 40, 16], { text: 'three', cs: { color: 'rgb(180, 0, 0)', 'font-size': '13px' } })
  const row = el('div', [0, 0, 400, 40], { children: [a, b, c] })
  const body = el('body', [0, 0, 1440, 900], { children: [row] })
  const r = cap(body, { target: a, ring: { x: 10, y: 10, width: 40, height: 16 } })
  assert.ok(r.html.startsWith('<style>'), 'the css leads the body')
  assert.ok(/\.rep \.r\d+\{[^}]*color:rgb\(2, 8, 23\)/.test(r.html), 'the declaration is in the sheet, not on the node')
  const classesOf = s => (s.match(/class="([^"]*)"/g) || []).map(m => m.slice(7, -1))
  const cls = classesOf(r.html)
  const spanCls = cls.filter(c0 => !c0.startsWith('rep'))
  assert.equal(spanCls[0], spanCls[1], 'the two identical siblings share one class')
  assert.notEqual(spanCls[0], spanCls[2], 'the differently-coloured one does not')
  const diffed = new Set(cls.flatMap(c0 => c0.split(' ')).filter(c0 => /^r\d+$/.test(c0)))
  assert.equal(r.classes, diffed.size, 'the count is the number of DIFFED classes ("rep" is ours, not the app\'s)')
})

test('a prop the page does not answer for is never declared, and no app style reaches the node itself', () => {
  const one = el('div', [0, 0, 200, 40], { text: 'x', cs: { color: '' } })
  const body = el('body', [0, 0, 1440, 900], { children: [one] })
  const r = cap(body, { target: one, ring: { x: 0, y: 0, width: 200, height: 40 } })
  assert.ok(!/color:;/.test(r.html), 'an empty computed value is not a declaration')
  assert.ok(!/<div class="[^"]*" style=/.test(r.html.replace(/<div class="rep[^>]*>/, '')), 'only the root carries an inline style')
})

// ── 3. sanitising ───────────────────────────────────────────────────────────────────────────────
test('the plan\'s acceptance: a script, an onclick, a javascript: href and an external image all vanish', () => {
  const evil = el('script', [0, 0, 0, 0], { text: 'alert(1)' })
  const clicky = el('div', [0, 0, 100, 20], { text: 'click me', attrs: { onclick: 'x()' } })
  const link = el('a', [0, 20, 100, 20], { text: 'go', attrs: { href: 'javascript:void(0)' } })
  const img = el('img', [0, 40, 100, 60], { attrs: { src: 'https://evil/x.png', alt: 'ad' } })
  const root = el('div', [0, 0, 400, 200], { children: [evil, clicky, link, img] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: clicky, ring: { x: 0, y: 0, width: 100, height: 20 } })
  assert.ok(!r.html.includes('<script'), 'no script tag')
  assert.ok(!r.html.includes('onclick'), 'no handler attribute')
  assert.ok(!r.html.includes('javascript:'), 'no javascript: url')
  assert.ok(!r.html.includes('https://'), 'no external url')
  assert.ok(!r.html.includes('alert(1)'), 'and not the script body either')
  assert.ok(r.html.includes('data-plate="img"'), 'the external image is a plate the size of its box')
  assert.ok(r.html.includes('click me') && r.html.includes('>go<'), 'the page\'s own words survive')
})

test('style, link, template, noscript, object, embed, meta, head and title are dropped with their subtrees', () => {
  const kids = ['style', 'link', 'template', 'noscript', 'object', 'embed', 'meta', 'head', 'title']
    .map((t, i) => el(t, [0, i * 10, 50, 10], { text: 'GONE' + t }))
  const keep = el('p', [0, 200, 100, 20], { text: 'kept' })
  const root = el('div', [0, 0, 400, 300], { children: [...kids, keep] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: keep, ring: { x: 0, y: 200, width: 100, height: 20 } })
  assert.ok(!/GONE/.test(r.html), 'nothing from any of them: ' + r.html)
  assert.ok(r.html.includes('kept'))
})

test('an img with a data: src keeps it; an iframe, a video and an uncapturable canvas become plates', () => {
  const good = el('img', [0, 0, 40, 40], { attrs: { src: 'data:image/png;base64,AAAA', alt: 'logo' } })
  const frame = el('iframe', [0, 40, 300, 200], { attrs: { src: 'https://x/y' } })
  const vid = el('video', [0, 240, 300, 200], {})
  const canv = el('canvas', [0, 440, 100, 100], {})
  const root = el('div', [0, 0, 400, 600], { children: [good, frame, vid, canv] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: good, ring: { x: 0, y: 0, width: 40, height: 40 } })
  assert.ok(r.html.includes('src="data:image/png;base64,AAAA"'), 'the inline image is the component and stays')
  assert.ok(r.html.includes('alt="logo"'))
  assert.ok(r.html.includes('data-plate="iframe"'))
  assert.ok(r.html.includes('data-plate="video"'))
  assert.ok(r.html.includes('data-plate="canvas"'))
  assert.ok(!r.html.includes('<iframe'), 'never the element itself')
})

test('a canvas that can snapshot itself becomes an img of its own pixels', () => {
  const canv = el('canvas', [0, 0, 100, 100], {})
  canv.toDataURL = () => 'data:image/png;base64,CANVAS'
  const root = el('div', [0, 0, 400, 200], { children: [canv] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: canv, ring: { x: 0, y: 0, width: 100, height: 100 } })
  assert.ok(r.html.includes('src="data:image/png;base64,CANVAS"'))
  assert.ok(!r.html.includes('data-plate="canvas"'))
})

test('a form control becomes a span carrying the value the assertion reads', () => {
  const input = el('input', [0, 0, 200, 32], { value: 'Nakameguro', attrs: { placeholder: 'Search…' } })
  const empty = el('input', [0, 40, 200, 32], { value: '', attrs: { placeholder: 'Add a task…' } })
  const area = el('textarea', [0, 80, 200, 60], { value: 'notes here' })
  const sel = el('select', [0, 150, 200, 32], { value: 'fy2026', selectedOptions: [{ textContent: 'FY 2026' }] })
  const btn = el('button', [0, 190, 100, 32], { text: 'Save' })
  const root = el('div', [0, 0, 400, 240], { children: [input, empty, area, sel, btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: input, ring: { x: 0, y: 0, width: 200, height: 32 } })
  assert.ok(/<span [^>]*data-control="input"[^>]*>Nakameguro<\/span>/.test(r.html), r.html)
  assert.ok(/data-control="input"[^>]*data-ph="1"[^>]*>Add a task…</.test(r.html), 'an empty field shows its placeholder, marked as one')
  assert.ok(/data-control="textarea"[^>]*>notes here</.test(r.html))
  assert.ok(/data-control="select"[^>]*>FY 2026</.test(r.html), 'a select shows its selected option')
  assert.ok(r.html.includes('<button'), 'a button stays a button')
  assert.ok(r.html.includes('Save'))
  assert.ok(!r.html.includes('<input'), 'no live control is ever emitted')
})

test('a shadow root is walked into the light tree, in place', () => {
  const inner = el('span', [10, 10, 60, 16], { text: 'shadowed' })
  const host = el('my-chip', [0, 0, 100, 30], { shadowRoot: { childNodes: [inner] } })
  const root = el('div', [0, 0, 400, 60], { children: [host] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: host, ring: { x: 0, y: 0, width: 100, height: 30 } })
  assert.ok(r.html.includes('shadowed'), 'what the page shows is in the replica: ' + r.html)
})

test('a ::before / ::after whose content is a quoted string is materialised as a span', () => {
  const tick = el('span', [0, 0, 20, 20], {
    text: '', before: { content: '"✓"' }, after: { content: 'none' }
  })
  const label = el('span', [24, 0, 80, 20], { text: 'Done', after: { content: '" ·"' } })
  const root = el('div', [0, 0, 200, 40], { children: [tick, label] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: tick, ring: { x: 0, y: 0, width: 20, height: 20 } })
  assert.ok(r.html.includes('data-pseudo="before"'), 'the tick the app draws with CSS is in the picture')
  assert.ok(r.html.includes('✓'))
  assert.ok(/data-pseudo="after"[^>]*> ·</.test(r.html), 'and a trailing one lands after its element')
  assert.ok(!/data-pseudo="after"[^>]*><\/span>/.test(r.html), 'a `content:none` makes no span')
})

test('what the page does not show is not in the replica — display:none, visibility:hidden, opacity 0', () => {
  const gone = el('div', [0, 0, 100, 20], { text: 'DISPLAYNONE', cs: { display: 'none' } })
  const hid = el('div', [0, 20, 100, 20], { text: 'HIDDEN', cs: { visibility: 'hidden' } })
  const faded = el('div', [0, 40, 100, 20], { text: 'FADED', cs: { opacity: '0.01' } })
  const kid = el('span', [0, 0, 50, 10], { text: 'CHILDOFNONE' })
  gone.childNodes = [txt('DISPLAYNONE'), kid]; gone.children = [kid]
  const keep = el('div', [0, 60, 100, 20], { text: 'shown' })
  const root = el('div', [0, 0, 200, 100], { children: [gone, hid, faded, keep] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: keep, ring: { x: 0, y: 60, width: 100, height: 20 } })
  for (const s of ['DISPLAYNONE', 'HIDDEN', 'FADED', 'CHILDOFNONE']) {
    assert.ok(!r.html.includes(s), s + ' is not in the replica')
  }
  assert.ok(r.html.includes('shown'))
})

// ── 4. caps ─────────────────────────────────────────────────────────────────────────────────────
test('the node cap stops the walk, says so on the root, and keeps the file under 200 KB', () => {
  const kids = []
  for (let i = 0; i < 4000; i++) {
    kids.push(el('div', [0, i, 300, 18], { text: 'row ' + i + ' — a long enough label to add bytes fast', cs: { color: 'rgb(2, 8, 23)', 'font-size': '13px', padding: '4px 8px' } }))
  }
  const root = el('div', [0, 0, 400, 8000], { children: kids })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: kids[0], ring: { x: 0, y: 0, width: 300, height: 18 } })
  assert.equal(r.truncated, true)
  assert.ok(r.html.includes('data-replica-truncated="1"'))
  assert.ok(r.nodes <= 1500, 'the node cap held: ' + r.nodes)
  assert.ok(r.bytes <= 200000, 'and the byte cap: ' + r.bytes)
  assert.equal(r.bytes, r.html.length)
})

test('the caps are the caller\'s to tighten', () => {
  const kids = []
  for (let i = 0; i < 50; i++) kids.push(el('div', [0, i, 300, 18], { text: 'row ' + i }))
  const root = el('div', [0, 0, 400, 100], { children: kids })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: kids[0], ring: { x: 0, y: 0, width: 300, height: 18 }, caps: { nodes: 5 } })
  assert.equal(r.truncated, true)
  assert.ok(r.nodes <= 5, r.nodes)
  const wide = cap(body, { target: kids[0], ring: { x: 0, y: 0, width: 300, height: 18 } })
  assert.equal(wide.truncated, false, 'a small page truncates nothing')
})

// ── 6. the root ─────────────────────────────────────────────────────────────────────────────────
test('the root says what kit drew it, where it stood and where the ring was — and nothing more yet', () => {
  const btn = el('button', [500, 92, 120, 36], { text: 'Version 3', cs: { border: '1px solid rgb(1,1,1)' } })
  const bar = el('div', [400, 88, 640, 44], { children: [btn], cs: { display: 'flex', gap: '8px' } })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const r = cap(body, { target: btn, ring: { x: 500, y: 92, width: 120, height: 36 } })
  assert.equal(r.kit, 'replica-1')
  const open = /<div class="rep([^"]*)"([^>]*)>/.exec(r.html)
  assert.ok(open, 'the root is a div.rep: ' + r.html.slice(0, 400))
  assert.ok(/^ r\d+$/.test(open[1]), 'carrying the scene root\'s own diffed class: ' + open[1])
  assert.ok(open[2].includes('data-replica-kit="replica-1"'))
  assert.ok(open[2].includes('data-replica-region="400 88 640 44"'))
  assert.ok(open[2].includes('data-ring-box="500 92 120 36"'))
  assert.ok(/style="position:relative"/.test(open[2]), 'the root\'s inline style is the one thing the board needs')
  assert.ok(!r.html.includes('data-replica-layout'), 'the layout pin is phase 2, never invented here')
  assert.ok(!r.html.includes('data-claims'), 'and the claims are phase 3')
  assert.ok(/\.rep\.r\d+\{/.test(r.html), 'the root\'s own class is addressable as the root, not only as a descendant')
})

// ── B. the probe's toolbar, round-tripped ───────────────────────────────────────────────────────
test('the probe\'s toolbar shape round-trips: the ringed button, its words, its chevron\'s path', () => {
  const path = el('path', [604, 104, 10, 6], { ns: 'http://www.w3.org/2000/svg', attrs: { d: 'M6 9l6 6 6-6', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' } })
  const svg = el('svg', [602, 102, 14, 14], { ns: 'http://www.w3.org/2000/svg', children: [path], attrs: { viewBox: '0 0 24 24' } })
  const label = el('span', [510, 100, 50, 20], { text: 'Version', cs: { color: 'rgb(100, 116, 139)', 'font-size': '12px' } })
  const track = el('span', [566, 100, 34, 20], { text: 'Draft', cs: { color: 'rgb(100, 116, 139)', 'font-size': '12px' } })
  const btn = el('button', [500, 92, 130, 36], { children: [label, track, svg], cs: { border: '1px solid rgb(226, 232, 240)', 'border-radius': '6px' }, attrs: { type: 'button', 'aria-label': 'Version picker' } })
  const other = el('button', [640, 92, 100, 36], { text: 'House view', cs: { border: '1px solid rgb(226, 232, 240)', 'border-radius': '6px' } })
  const bar = el('div', [400, 88, 640, 44], { children: [btn, other], cs: { display: 'flex', gap: '8px' } })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const r = cap(body, { target: btn, ring: { x: 500, y: 92, width: 130, height: 36 } })
  assert.ok(/<button [^>]*data-ring="1"/.test(r.html), 'the ringed button is the button, marked: ' + r.html)
  assert.ok(r.html.includes('Version') && r.html.includes('Draft'), 'both words of the picker')
  assert.ok(r.html.includes('<svg') && r.html.includes('viewBox="0 0 24 24"'), 'its own inline svg is the component and stays')
  assert.ok(r.html.includes('d="M6 9l6 6 6-6"'), 'with the chevron\'s path data')
  assert.ok(r.html.includes('aria-label="Version picker"'), 'and the accessible name')
  assert.ok(!r.html.includes('type="button"'), 'but nothing outside the allowlist')
  const spanCls = (r.html.match(/<span class="(r\d+)"/g) || [])
  assert.equal(spanCls[0], spanCls[1], 'the two identically-styled words share one class')
})

// ── the fonts the region needs ──────────────────────────────────────────────────────────────────
test('the same-origin @font-face urls for a family the region actually uses ride out with the replica', () => {
  const word = el('span', [10, 10, 60, 16], { text: 'Draft', cs: { 'font-family': '"Inter Tight", system-ui, sans-serif' } })
  const root = el('div', [0, 0, 400, 40], { children: [word] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const sheets = [
    { cssRules: [
      { cssText: '@font-face { font-family: "Inter Tight"; src: url("https://app.example/f/inter.woff2") format("woff2"); }', style: style({ 'font-family': '"Inter Tight"', src: 'url("https://app.example/f/inter.woff2") format("woff2")' }) },
      { cssText: '@font-face { font-family: "Never Used"; src: url("https://app.example/f/nope.woff2"); }', style: style({ 'font-family': '"Never Used"', src: 'url("https://app.example/f/nope.woff2")' }) },
      { cssText: '.x{color:red}', style: style({}) }
    ] },
    { get cssRules () { throw new Error('cross-origin') } }
  ]
  const r = captureReplica({ target: word, ring: { x: 10, y: 10, width: 60, height: 16 }, props: REPLICA_PROPS, env: env(body, { sheets }) })
  assert.deepEqual(r.fonts, [{ family: 'Inter Tight', url: 'https://app.example/f/inter.woff2' }],
    'only the family the region uses, and the cross-origin sheet was skipped rather than thrown on')
})

// FIX ROUND 1, F1: the CSSOM hands back a font src EXACTLY as it was authored, and an app's own
// stylesheet almost always writes it RELATIVE ("../fonts/inter.woff2"). The absolute-only test threw
// away precisely the same-origin case the rule exists to catch — so every self-hosted face was
// silently dropped and the replica fell back to a system stack. Resolve against the document's base
// first, then keep everything that can be FETCHED over http(s) — every origin, per the controller's
// ruling: the human's default is "web fonts embedded once per screen" and a CDN face is the common
// case, and the Node-side fetch (with its caps) plus the local commit under _fonts/ is what bounds it.
test('a RELATIVE @font-face src resolves against the document base; a CDN one is listed too', () => {
  const word = el('span', [10, 10, 60, 16], { text: 'Draft', cs: { 'font-family': 'Inter Tight, sans-serif' } })
  const root = el('div', [0, 0, 400, 40], { children: [word] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const sheets = [{ cssRules: [
    { cssText: '@font-face { font-family: Inter Tight; src: url(../fonts/inter.woff2) format("woff2"); }', style: style({ 'font-family': 'Inter Tight', src: 'url(../fonts/inter.woff2) format("woff2")' }) }
  ] }]
  const r = captureReplica({ target: word, ring: { x: 10, y: 10, width: 60, height: 16 }, props: REPLICA_PROPS, env: env(body, { sheets, baseURI: 'https://app.example/app/board' }) })
  assert.deepEqual(r.fonts, [{ family: 'Inter Tight', url: 'https://app.example/fonts/inter.woff2' }],
    'the relative src became the page\'s own absolute url')

  // …and a CDN face is LISTED (the controller's ruling, fix round 1 follow-up: the human's default is
  // "web fonts embedded once per screen", and a CDN face is the common case). The Node-side fetch is
  // what bounds it — 8 per pass, 2 MB, 3 s, 6 s for the lot — and it lands under _fonts/ like any
  // other, so the served replica loads it from 'self'.
  const foreign = [{ cssRules: [
    { cssText: '@font-face { font-family: Inter Tight; src: url(https://fonts.gstatic.com/s/inter.woff2); }', style: style({ 'font-family': 'Inter Tight', src: 'url(https://fonts.gstatic.com/s/inter.woff2)' }) }
  ] }]
  const r2 = captureReplica({ target: word, ring: { x: 10, y: 10, width: 60, height: 16 }, props: REPLICA_PROPS, env: env(body, { sheets: foreign, baseURI: 'https://app.example/app/board' }) })
  assert.deepEqual(r2.fonts, [{ family: 'Inter Tight', url: 'https://fonts.gstatic.com/s/inter.woff2' }],
    'another origin\'s face is fetched Node-side and committed locally, so it is listed')

  // …but only what actually resolves to something fetchable over http(s): an inline face needs no
  // fetching, and neither of the other two is a url this harness will ever hand to page.request.
  const junk = [{ cssRules: [
    { cssText: '@font-face { font-family: Inter Tight; src: url(data:font/woff2;base64,AAAA); }', style: style({ 'font-family': 'Inter Tight', src: 'url(data:font/woff2;base64,AAAA)' }) },
    { cssText: '@font-face { font-family: Inter Tight; src: url(blob:https://app.example/9f2); }', style: style({ 'font-family': 'Inter Tight', src: 'url(blob:https://app.example/9f2)' }) },
    { cssText: '@font-face { font-family: Inter Tight; src: url(javascript:void(0)); }', style: style({ 'font-family': 'Inter Tight', src: 'url(javascript:void(0))' }) }
  ] }]
  const r3 = captureReplica({ target: word, ring: { x: 10, y: 10, width: 60, height: 16 }, props: REPLICA_PROPS, env: env(body, { sheets: junk, baseURI: 'https://app.example/app/board' }) })
  assert.deepEqual(r3.fonts, [], 'data:, blob: and javascript: are not faces to fetch')
})

// FIX ROUND 1, F2: the narration overlay is OURS, painted into the page under test — the ring, the
// veil and the callout card. The layout walk has refused to measure it since it existed; the replica
// had no such guard, so any capture whose scene root reached <body> would have serialised our own
// chrome as the app's DOM.
test('the narration overlay is never in the replica — it is ours, not the app\'s', () => {
  const card = el('div', [400, 700, 360, 90], { text: 'OVERLAYCARD' })
  const overlay = el('div', [0, 0, 1440, 900], { id: '__specboard-focus', children: [card] })
  const real = el('p', [0, 0, 200, 20], { text: 'the app\'s own words' })
  const body = el('body', [0, 0, 1440, 900], { children: [real, overlay] })
  const r = cap(body)
  assert.ok(r.html.includes('the app'), 'the page is captured')
  assert.ok(!r.html.includes('OVERLAYCARD'), 'and our callout is not, nor anything under it: ' + r.html)
  assert.ok(!r.html.includes('__specboard-focus'))
})

// FIX ROUND 1, F3: `border` is a shorthand, and getComputedStyle serialises a shorthand to "" as soon
// as its edges disagree — which is every table row, every ruled list and every bottom-ruled toolbar.
// The four longhands each serialise in full.
test('a bottom-ruled row keeps its rule: the four border edges are diffed, not the shorthand', () => {
  const row = el('div', [0, 0, 400, 40], {
    text: 'ruled',
    // exactly what a bottom-ruled row computes: the shorthand goes empty, the edges do not
    cs: { border: '', 'border-bottom': '1px solid rgb(226, 232, 240)', 'border-top': '0px none rgb(2, 8, 23)' }
  })
  const body = el('body', [0, 0, 1440, 900], { children: [row] })
  const r = cap(body, { target: row, ring: { x: 0, y: 0, width: 400, height: 40 } })
  assert.ok(r.html.includes('border-bottom:1px solid rgb(226, 232, 240)'), 'the rule the reader can see: ' + r.html.slice(0, 300))
})

// FIX ROUND 1, F4: the BYTE cap, and the data: image that could carry a file straight past it. A
// single inline image can be megabytes; it rides only while the budget can afford it, and never at
// all above DATA_MAX.
test('the byte cap stops a text-heavy scene, and the file is still under 200 KB', () => {
  const long = 'x'.repeat(2000)
  const kids = []
  for (let i = 0; i < 400; i++) kids.push(el('p', [0, i * 20, 900, 18], { text: long + ' ' + i, cs: { color: 'rgb(2, 8, 23)' } }))
  const root = el('div', [0, 0, 900, 8000], { children: kids })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: kids[0], ring: { x: 0, y: 0, width: 900, height: 18 } })
  assert.equal(r.truncated, true)
  assert.ok(r.html.includes('data-replica-truncated="1"'))
  assert.ok(r.bytes <= 200000, 'the promise is about the FILE, not the walk: ' + r.bytes)
  assert.equal(r.bytes, r.html.length)
  assert.ok(r.nodes < 1500, 'and it was the BYTE cap that stopped it, not the node cap: ' + r.nodes)
})

test('an oversized data: image is a plate — one inline picture may not carry the file past its cap', () => {
  const huge = 'data:image/png;base64,' + 'A'.repeat(40000)
  const img = el('img', [0, 0, 200, 120], { attrs: { src: huge } })
  const root = el('div', [0, 0, 400, 200], { children: [img] })
  const body = el('body', [0, 0, 1440, 900], { children: [root] })
  const r = cap(body, { target: img, ring: { x: 0, y: 0, width: 200, height: 120 } })
  assert.ok(r.html.includes('data-plate="img"'), 'shown as the box it occupies')
  assert.ok(!r.html.includes('AAAA'), 'and not a byte of its payload')
  assert.ok(r.bytes < 5000, r.bytes)
})

test('REPLICA_PROPS is one list, and it carries what the diff needs', () => {
  assert.ok(Array.isArray(REPLICA_PROPS) && REPLICA_PROPS.length > 20)
  for (const p of ['display', 'background-color', 'color', 'font-size', 'text-align',
    'letter-spacing', 'text-transform', 'font-style', 'visibility', 'outline', 'z-index', 'transform',
    'fill', 'stroke', 'stroke-width',
    // FOUR EDGES, never the shorthand (fix round 1, F3): `border` serialises to "" the moment the
    // edges differ, so a bottom-ruled row lost its rule entirely
    'border-top', 'border-right', 'border-bottom', 'border-left',
    // …and the geometry a modern layout is actually built from
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow',
    'column-gap', 'row-gap', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self']) {
    assert.ok(REPLICA_PROPS.includes(p), p + ' is diffed')
  }
  assert.ok(!REPLICA_PROPS.includes('border'), 'the shorthand is gone — it goes empty when the edges differ')
  assert.equal(new Set(REPLICA_PROPS).size, REPLICA_PROPS.length, 'no prop is asked for twice')
})
