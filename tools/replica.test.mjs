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
  // corrected 2026-09-03 (rule 6): the phase numbers were the wrong way round — the CLAIMS landed in
  // phase 2 and the layout pin is phase 3. Both assertions stand unchanged, because neither belongs
  // on the ACTUAL root: the photograph's half asserted nothing, so it carries no claim json, and no
  // pin is written until something checks it.
  assert.ok(!r.html.includes('data-replica-layout'), 'the layout pin is phase 3, never invented here')
  assert.ok(!r.html.includes('data-claims'), 'and the claims ride the EXPECTED root, never this one')
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


// ════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 2, FIX ROUND 1 (2026-09-03) — THE EXPECTED REPLICA: ONE CLAIM, APPLIED TO ITS BASE.
//
// The controller's ruling REPLACED the 0.43.1 contract entirely (the reviewer's C1/C2/I1/I2/I3 — see
// .superpowers/sdd/expected-view-plan-2026-09-03/task-2-review.md). The old contract took a `claims`
// ARRAY and REPLAYED every claim of the beat against whatever the CURRENT moment's scene happened to
// be — which put a stale claim's fix on an unrelated leaf once the ring moved (C1/I3), and built a
// FAILED beat's after-picture from the scene the app got WRONG rather than the scene it last got
// RIGHT (C2), so a restored row landed wherever the wrong scene happened to have room for it.
//
// The new contract takes exactly ONE claim (`claim`) and a BASE (`base`, an html string or null — the
// caller, spec/_base.ts, decides which): `base === null` → the Expected is the CURRENT scene, an `ok`
// claim only tinting the leaf it read; `base` given → the Expected IS that base's own tree, parsed
// back, with ONLY this one claim applied to it in place. `claims` (plural) still travels in — but only
// for the `data-claims` JSON attribute the board reads; nothing here ever loops over it. There is no
// code path left that can replay a claim, because there is no array-loop left to do it with.
// ════════════════════════════════════════════════════════════════════════════════════════════════

// A MINIMAL PARSER for the markup the capture itself emits (quoted attributes, escaped text, no
// comments) — what `env.parseHtml` stands in for. In the page the capture parses a base with an inert
// <template>; a node test has no parser at all, so it hands one in, exactly the way `env` already
// hands in a window, a document and a getComputedStyle.
function parseHtml (html) {
  const VOIDT = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'track'])
  const mk = (tag, attrs) => ({
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    getAttributeNames: () => Object.keys(attrs),
    getAttribute: n => (n in attrs ? attrs[n] : null)
  })
  const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const root = mk('template', {})
  const stack = [root]
  const push = n => stack[stack.length - 1].childNodes.push(n)
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) { if (i < html.length) push({ nodeType: 3, textContent: unesc(html.slice(i)) }); break }
    if (lt > i) push({ nodeType: 3, textContent: unesc(html.slice(i, lt)) })
    const gt = html.indexOf('>', lt)
    if (gt < 0) break
    const raw = html.slice(lt + 1, gt)
    i = gt + 1
    if (raw.charAt(0) === '/') { if (stack.length > 1) stack.pop(); continue }
    const m = /^([a-zA-Z0-9:-]+)/.exec(raw)
    if (!m) continue
    const tag = m[1].toLowerCase()
    const attrs = {}
    const re = /([a-zA-Z0-9_:-]+)="([^"]*)"/g
    let a
    while ((a = re.exec(raw))) attrs[a[1]] = unesc(a[2])
    const node = mk(tag, attrs)
    push(node)
    if (!raw.endsWith('/') && !VOIDT.has(tag)) stack.push(node)
  }
  return root
}
const capC = (body, o = {}) => captureReplica({
  target: o.target || null,
  ring: o.ring || null,
  caps: o.caps,
  props: REPLICA_PROPS,
  claim: o.claim === undefined ? null : o.claim,
  claims: o.claims || [],
  base: o.base === undefined ? null : o.base,
  minRegion: o.minRegion === undefined ? null : o.minRegion,
  env: { ...env(body, o), parseHtml }
})

// ── base === null: nothing has failed yet — the Expected is the CURRENT scene ───────────────────
test('base=null: an ok claim only TINTS the leaf it read — no text moves, no base is even parsed', () => {
  const word = el('span', [520, 100, 60, 20], { text: 'Draft', cs: { color: 'rgb(1,1,1)' } })
  const btn = el('button', [500, 92, 130, 36], { children: [word] })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const r = capC(body, {
    target: btn,
    ring: { x: 500, y: 92, width: 130, height: 36 },
    claim: { label: 'the track word', expected: 'Draft', got: 'Draft', ok: true }
    // no base at all — this is a beat where nothing has failed
  })
  assert.ok(/data-claim="ok"[^>]*>Draft</.test(r.expected), 'the leaf is marked, not rewritten: ' + r.expected)
  assert.ok(!r.html.includes('data-claim'), 'the Actual carries no claim mark at all')
})

test('base=null with no claim at all: the Expected is the current Actual, bar the side it names', () => {
  const word = el('span', [520, 100, 60, 20], { text: 'Draft' })
  const btn = el('button', [500, 92, 130, 36], { children: [word] })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const r = capC(body, { target: btn, ring: { x: 500, y: 92, width: 130, height: 36 } })
  assert.equal(r.expected.replace('data-replica-side="expected"', 'data-replica-side="actual"').replace(/ data-claims="[^"]*"/, ''), r.html,
    'nothing was claimed, so nothing differs')
})


// ── base given: the Expected IS the base, with ONLY this one claim applied to it ────────────────
// FIX ROUND 3 (2026-09-03) — LOCATE BY GEOMETRY, NEVER BY TEXT. The controller's ruling: a base is
// a scene that was RIGHT, so it never shows a wrong value's `got` at all — searching a base's text
// for `got` (rounds 1/2's `scopedLeaf`) was always going to fail there, and the bounded fallback
// that caught the failure rewrote whatever leaf the stale ring happened to be nearest, which is
// what corrupted a just-restored title twice over (task-2-report.md, fix rounds 1 and 2). Every
// capture now records `data-b="x,y,w,h"` on every text leaf (and every data-ring/plate/control
// node); a wrong-value claim is located in ANY tree — a base or the current Actual — by whichever
// text leaf's OWN box lies ≥60% inside the claim's OWN ring box (carried on the claim itself,
// `arg.claims[].ring`), never by searching for `got`. The bounded fallback that used to rewrite
// "the ring's first leaf" is DELETED FOR GOOD: a claim with no leaf inside its ring box is flagged
// `unlocated: true` and left unapplied, never guessed at elsewhere.
test('a wrong-value claim locates its leaf by the claim\'s OWN ring box — not a look-alike elsewhere in the scene', () => {
  // the base: a status track reading "Draft" INSIDE the ring, and an unrelated nav tab that also
  // reads "Draft" OUTSIDE it — proving the search is ring-box-scoped, not "first match anywhere"
  const track = el('span', [566, 100, 34, 20], { text: 'Draft', cs: { color: 'rgb(2, 8, 23)' } })
  const btn = el('button', [500, 92, 130, 36], { children: [track] })
  const navTab = el('span', [410, 90, 40, 16], { text: 'Draft' })   // a look-alike, in the SAME scene but outside the ring
  const bar = el('div', [400, 88, 640, 44], { children: [navTab, btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const before = capC(body, { target: btn, ring: { x: 500, y: 92, width: 130, height: 36 } }).html

  const ring = { x: 500, y: 92, width: 130, height: 36 }
  const r = capC(body, {
    target: btn,
    ring,
    claim: { label: 'the version track', expected: 'Published', got: 'Draft', ok: false, ring },
    base: before
  })
  assert.ok(/data-claim="fixed"[^>]*data-claim-got="Draft"[^>]*>Published</.test(r.expected), r.expected)
  assert.ok(/<span[^>]*>Draft<\/span>/.test(r.expected), 'the OUTSIDE look-alike is untouched, still reading Draft: ' + r.expected)
  assert.equal((r.expected.match(/>Published</g) || []).length, 1, 'only the ringed one was ever a candidate')
  assert.ok(r.html.includes('>Draft<') && !r.html.includes('Published'), 'the Actual is the app\'s own half, untouched')
})

test('the worded wrapper swaps too, on a base: an ancestor whose own text carries the value', () => {
  const n = el('b', [60, 0, 12, 20], { text: '4' })
  const counter = el('div', [0, 0, 120, 24], { children: [n] })
  counter.childNodes = [{ nodeType: 3, textContent: 'To do 4 — ' }, n]
  const head = el('div', [0, 0, 500, 40], { children: [counter] })
  const body = el('body', [0, 0, 1440, 900], { children: [head] })
  const before = capC(body, { target: counter, ring: { x: 0, y: 0, width: 120, height: 24 } }).html
  const ring = { x: 0, y: 0, width: 120, height: 24 }
  const r = capC(body, {
    target: counter, ring,
    claim: { label: 'the open count', expected: '5', got: '4', ok: false, ring },
    base: before
  })
  assert.ok(r.expected.includes('To do 5 — '), 'the wrapper\'s own words say the intended value: ' + r.expected)
  assert.ok(/data-claim="fixed"[^>]*>5</.test(r.expected))
  assert.ok(r.html.includes('To do 4 — '), 'the Actual keeps what the app rendered')
})

// ── fix round 3, rule 2, case (b): the base already shows the requirement's word ─────────────────
test('fix round 3: the base already shows the requirement\'s word — marked fixed, nothing rewritten, an earlier restore stays untouched', () => {
  const cb = el('button', [4, 4, 18, 18], {})
  const ttl = el('span', [30, 5, 200, 18], { text: 'Pay the electricity bill' })
  const row = el('li', [0, 0, 300, 28], { children: [cb, ttl] })
  const nextRow = el('li', [0, 28, 300, 28], { children: [el('span', [30, 33, 200, 18], { text: 'Call the dentist' })] })
  const ul = el('ul', [0, 0, 300, 56], { children: [row, nextRow] })
  const counter = el('div', [500, 0, 80, 24], { text: 'To do 5', cs: { color: 'rgb(180, 0, 0)' } })
  const head = el('div', [0, 0, 700, 40], { children: [counter] })
  const main = el('div', [0, 0, 700, 400], { children: [head, ul] })
  const bodyRow = el('body', [0, 0, 1440, 900], { children: [main] })
  const before = capC(bodyRow, { target: row, ring: { x: 0, y: 0, width: 300, height: 28 } }).html

  const claim0 = { label: 'still listed', expected: 'Pay the electricity bill', got: '(missing)', ok: false, missing: true,
    ring: { x: 0, y: 0, width: 300, height: 28 } }
  const r1 = capC(bodyRow, {
    target: row, ring: { x: 0, y: 0, width: 300, height: 28 },
    claim: claim0, claims: [claim0], base: before
  })
  assert.ok(/data-claim="restored"/.test(r1.expected), r1.expected)

  const claim1 = { label: 'the open count', expected: 'To do 5', got: 'To do 4', ok: false,
    ring: { x: 500, y: 0, width: 80, height: 24 } }
  const r2 = capC(bodyRow, {
    target: counter, ring: { x: 500, y: 0, width: 80, height: 24 },
    claim: claim1, claims: [claim0, claim1], base: r1.expected
  })
  assert.ok(/data-claim="fixed"[^>]*data-claim-of="1"[^>]*>To do 5</.test(r2.expected), r2.expected)
  assert.ok(!/data-claim-got/.test(r2.expected), 'nothing was REWRITTEN — the base already said it: ' + r2.expected)
  assert.ok(/data-claim="restored"[^>]*>[\s\S]*Pay the electricity bill/.test(r2.expected), 'the restored title is untouched: ' + r2.expected)
  const rendered1 = r2.expected.replace(/ data-claims="[^"]*"/, '')
  assert.equal((rendered1.match(/To do 5/g) || []).length, 1, 'no duplicate text was inserted: ' + rendered1)
})

// ── fix round 3, rule 2: a ring box over no leaf at all ───────────────────────────────────────────
test('fix round 3: a ring box over no leaf is flagged unlocated — the tree is unchanged, never a guess elsewhere', () => {
  const label = el('span', [510, 100, 50, 20], { text: 'Version' })
  const btn = el('button', [500, 92, 130, 36], { children: [label] })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const before = capC(body, { target: btn, ring: { x: 500, y: 92, width: 130, height: 36 } }).html
  // the CURRENT claim's own ring is over EMPTY space — nowhere near any leaf at all
  const ring = { x: 900, y: 400, width: 50, height: 20 }
  const claim = { label: 'the track word', expected: 'Published', got: 'Draft', ok: false, ring }
  const r = capC(body, {
    target: btn, ring: { x: 500, y: 92, width: 130, height: 36 },
    claim, claims: [claim],
    base: before
  })
  const rendered = r.expected.replace(/ data-claims="[^"]*"/, '')
  assert.ok(!rendered.includes('Published'), 'nothing was rewritten anywhere: ' + rendered)
  assert.ok(rendered.includes('Version'), 'the base is completely unchanged: ' + rendered)
  const json = JSON.parse(/data-claims="([^"]*)"/.exec(r.expected)[1].replace(/&quot;/g, '"'))
  assert.equal(json[0].unlocated, true, 'flagged, honestly: ' + JSON.stringify(json))
})

test('fix round 3: a ring over an icon with no text at all is ALSO unlocated — no placeholder appended inside it', () => {
  const path = el('path', [604, 104, 10, 6], { ns: 'http://www.w3.org/2000/svg', attrs: { d: 'M6 9l6 6 6-6' } })
  const svg = el('svg', [602, 102, 14, 14], { ns: 'http://www.w3.org/2000/svg', children: [path] })
  const btn = el('button', [600, 100, 20, 20], { children: [svg] })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const before = capC(body, { target: btn, ring: { x: 600, y: 100, width: 20, height: 20 } }).html
  const ring = { x: 600, y: 100, width: 20, height: 20 }
  const claim = { label: 'the state', expected: 'Published', got: '', ok: false, ring }
  const r = capC(body, {
    target: btn, ring,
    claim, claims: [claim],
    base: before
  })
  const rendered3 = r.expected.replace(/ data-claims="[^"]*"/, '')
  assert.ok(!rendered3.includes('Published'), 'the deleted bounded fallback used to append it inside the ring — not any more: ' + rendered3)
  assert.ok(r.html.includes('d="M6 9l6 6 6-6"'), 'and the icon is still the component')
  const json = JSON.parse(/data-claims="([^"]*)"/.exec(r.expected)[1].replace(/&quot;/g, '"'))
  assert.equal(json[0].unlocated, true)
})

// ── the Tsumiki shape, REAL: a checkbox + a title span + an archive button whose OWN text differs
// from the title — the fixture I2 asked for, so a green here means the climb rule actually works,
// not that the fixture happened to have nothing else for it to find.
const TASKS = ['Buy milk', 'Water the plants', 'Call the dentist']
function tsumikiRow (title, y) {
  const cb = el('button', [4, y + 4, 18, 18], { attrs: { 'aria-label': 'complete' } })
  const ttl = el('span', [30, y + 5, 200, 18], { text: title, cs: { color: 'rgb(2, 8, 23)', 'font-size': '14px' } })
  const archive = el('button', [240, y, 40, 24], { text: 'Archive', cs: { color: 'rgb(120,20,20)' } })
  return el('li', [0, y, 300, 28], {
    children: [cb, ttl, archive],
    cs: { 'border-bottom': '1px solid rgb(226, 232, 240)', padding: '4px 0px' }
  })
}
// no target/ring: root falls back to the body, so the base carries BOTH the list and the header's
// counter in one scene — the real app's `#left` counter and `#list` sit in separate subtrees (the
// sidebar and the main column), so a per-row capture would normally scope to just the list; a
// whole-body base is what a beat's chained claims (missing/restore, which never ring-scope their
// search) actually need here, and is what lets THIS fixture prove the counter rides along unmodified.
function tsumikiBefore () {
  const rows = TASKS.map((t, i) => tsumikiRow(t, i * 30))
  const ul = el('ul', [0, 0, 300, 90], { children: rows })
  const counter = el('div', [400, 0, 80, 24], { text: 'To do 5', cs: { color: 'rgb(180, 0, 0)', 'font-weight': '650' } })
  const head = el('div', [0, 0, 500, 40], { children: [counter], cs: { display: 'flex' } })
  const main = el('main', [0, 0, 600, 400], { children: [head, ul] })
  const body = el('body', [0, 0, 1440, 900], { children: [main] })
  return capC(body, {}).html
}

test('a removed row is RESTORED IN PLACE — climbed to the <li>, never cloned or spliced (fix round 1, C2/I2)', () => {
  const before = tsumikiBefore()
  // the CURRENT (wrong) scene: the row is gone, the counter reads one too few — deliberately a
  // DIFFERENT, smaller scene from the base, exactly what a real archive click leaves behind
  const counter2 = el('div', [400, 0, 80, 24], { text: 'To do 4', cs: { color: 'rgb(180, 0, 0)', 'font-weight': '650' } })
  const head2 = el('div', [0, 0, 500, 40], { children: [counter2], cs: { display: 'flex' } })
  const body2 = el('body', [0, 0, 1440, 900], { children: [head2] })
  const r = capC(body2, {
    target: counter2, ring: { x: 400, y: 0, width: 80, height: 24 },
    claim: { label: 'still listed', expected: 'Water the plants', got: '(missing)', ok: false, missing: true },
    base: before
  })
  assert.ok(r.expected.includes('To do 5'), 'the base\'s OWN count is already right — nothing spliced: ' + r.expected)
  assert.ok(!r.expected.includes('To do 4'), 'the wrong (current) count never rides into the Expected at all')
  assert.ok(/<li[^>]*data-claim="restored"[^>]*>[\s\S]*Water the plants/.test(r.expected),
    'the row is marked IN PLACE, climbed past the checkbox and the archive button to the <li>: ' + r.expected)
  assert.equal((r.expected.match(/data-claim="restored"/g) || []).length, 1, 'exactly one element carries the mark')
  assert.ok(r.expected.includes('Buy milk') && r.expected.includes('Call the dentist'),
    'the OTHER rows are simply still there too — nothing was cloned in, the whole base rides along')
  assert.ok(r.html.includes('To do 4') && !r.html.includes('Water the plants'), 'the Actual is still the app\'s own (wrong) picture')
})

test('the climb rule finds the title\'s SMALLEST exact match, not the archive button beside it', () => {
  const before = tsumikiBefore()
  const body2 = el('body', [0, 0, 1440, 900], { children: [] })
  const r = capC(body2, {
    target: null, ring: null,
    claim: { label: 'still listed', expected: 'Water the plants', got: '(missing)', ok: false, missing: true },
    base: before
  })
  // the archive button's OWN words ("Archive") never satisfied "Water the plants" — only the title did
  assert.ok(!/data-claim="restored"[^>]*>\s*<button[^>]*>Archive/.test(r.expected), r.expected)
  assert.ok(r.expected.includes('Water the plants'))
})

test('with nothing in the base to restore, the same claim is drawn as a marked placeholder, never silently dropped', () => {
  const before = tsumikiBefore()
  const r = capC(el('body', [0, 0, 1440, 900], { children: [] }), {
    claim: { label: 'still listed', expected: 'A task never in this beat at all', got: '(missing)', ok: false, missing: true },
    base: before
  })
  assert.ok(r.expected.includes('<span data-claim="new">A task never in this beat at all</span>'), r.expected)
})

// ── two placeholders in ONE beat: order must read claim order, not nearest-to-ring (fix round 1, I1) ─
test('two never-there placeholders read in CLAIM order, not nearest-first (fix round 1, I1 — R9\'s own shape)', () => {
  const cb = el('button', [4, 4, 18, 18], {})
  const ttl = el('span', [30, 5, 200, 18], { text: 'Pay the electricity bill' })
  const archive = el('button', [240, 0, 40, 24], { text: 'Archive' })
  const row = el('li', [0, 0, 300, 28], { children: [cb, ttl, archive] })
  const ul = el('ul', [0, 0, 300, 30], { children: [row] })
  const body = el('body', [0, 0, 1440, 900], { children: [ul] })
  const before = capC(body, { target: row, ring: { x: 0, y: 0, width: 300, height: 28 } }).html

  // claim 1 (this beat's first fact): the row is still listed — FOUND in the base, restored in place
  const r1 = capC(body, {
    target: row, ring: { x: 0, y: 0, width: 300, height: 28 },
    claim: { label: 'still listed', expected: 'Pay the electricity bill', got: '(missing)', ok: false, missing: true },
    base: before
  })
  // claim 2: an Undo appears — the app never had one, so it is DRAWN, beside the ring
  const r2 = capC(body, {
    target: row, ring: { x: 0, y: 0, width: 300, height: 28 },
    claim: { label: 'an Undo appears', expected: 'Undo', got: '(missing)', ok: false, missing: true },
    base: r1.expected
  })
  // claim 3: a second never-there placeholder, so the ORDER of two actual insertions is provable
  const r3 = capC(body, {
    target: row, ring: { x: 0, y: 0, width: 300, height: 28 },
    claim: { label: 'a due chip appears', expected: 'Overdue by 2 days', got: '(missing)', ok: false, missing: true },
    base: r2.expected
  })
  const iUndo = r3.expected.indexOf('>Undo<')
  const iDue = r3.expected.indexOf('>Overdue by 2 days<')
  assert.ok(iUndo >= 0 && iDue >= 0, r3.expected)
  assert.ok(iUndo < iDue, 'the FIRST inserted claim still reads before the SECOND: ' + r3.expected)
  // and the restored row (claim 1) is still marked in place, ahead of both — never displaced
  const iRow = r3.expected.indexOf('data-claim="restored"')
  assert.ok(iRow >= 0 && iRow < iUndo, 'the restored row is not pushed behind what was inserted after it')
})

// ── no replay: a claim never touches a leaf it was never made on, even later in the same beat ────
test('fix round 1 (C1): a claim never rewrites a leaf it was never made on — there is no claims-array loop left to replay one', () => {
  const track = el('span', [10, 10, 60, 20], { text: 'Draft' })
  const btn = el('button', [0, 0, 100, 40], { children: [track] })
  const due = el('span', [120, 10, 60, 20], { text: 'Overdue' })
  const card = el('div', [110, 0, 100, 40], { children: [due] })
  const wrap = el('div', [0, 0, 400, 60], { children: [btn, card] })
  const body = el('body', [0, 0, 1440, 900], { children: [wrap] })
  const before = capC(body, { target: wrap, ring: { x: 0, y: 0, width: 400, height: 60 } }).html

  // v1: the ring is on the button — a wrong-value claim about the version track
  const ring1 = { x: 0, y: 0, width: 100, height: 40 }
  const r1 = capC(body, {
    target: btn, ring: ring1,
    claim: { label: 'the track', expected: 'Published', got: 'Draft', ok: false, ring: ring1 },
    base: before
  })
  assert.ok(/data-claim="fixed"[^>]*data-claim-got="Draft"[^>]*>Published</.test(r1.expected))

  // v2: the ring has MOVED to the due-date card — an UNRELATED wrong-value claim
  const ring2 = { x: 110, y: 0, width: 100, height: 40 }
  const r2 = capC(body, {
    target: card, ring: ring2,
    claim: { label: 'the due state', expected: 'Due today', got: 'Overdue', ok: false, ring: ring2 },
    base: r1.expected
  })
  assert.ok(r2.expected.includes('Due today') && r2.expected.includes('data-claim-got="Overdue"'), r2.expected)
  // v1's own fix is EXACTLY as v1 left it — nothing replayed a second pass over it
  assert.ok(r2.expected.includes('Published') && r2.expected.includes('data-claim-got="Draft"'),
    'v1\'s fix survives untouched: ' + r2.expected)
  assert.ok(!/>Draft</.test(r2.expected) && !/>Overdue</.test(r2.expected), 'neither wrong value still reads')
  assert.equal((r2.expected.match(/data-claim-got="Draft"/g) || []).length, 1, 'v1 was never re-applied')
  assert.equal((r2.expected.match(/data-claim-got="Overdue"/g) || []).length, 1, 'v2 was applied exactly once')
})

// ── data-claims: informational, never applied ──────────────────────────────────────────────────
test('data-claims lists EVERY claim of the beat so far — but nothing here ever loops over that list', () => {
  const word = el('span', [520, 100, 60, 20], { text: 'Draft' })
  const btn = el('button', [500, 92, 130, 36], { children: [word] })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const before = capC(body, { target: btn, ring: { x: 500, y: 92, width: 130, height: 36 } }).html
  const ring = { x: 500, y: 92, width: 130, height: 36 }
  const claims = [
    { label: 'a fact from two moments ago', expected: 'Renamed', got: 'Old name', ok: false, ring: { x: 900, y: 400, width: 20, height: 20 } },
    { label: 'this moment', expected: 'Published', got: 'Draft', ok: false, ring }
  ]
  const r = capC(body, {
    target: btn, ring,
    claim: claims[1],
    claims,
    base: before
  })
  const json = /data-claims="([^"]*)"/.exec(r.expected)
  assert.ok(json, 'the Expected carries the WHOLE list: ' + r.expected.slice(0, 300))
  // data-claims carries the board's own canonical shape (label/expected/got/ok/missing?/unlocated?)
  // — `ring` is an internal targeting detail (fix round 3), never meant to leak into it
  assert.deepEqual(JSON.parse(json[1].replace(/&quot;/g, '"')),
    claims.map(({ label, expected, got, ok }) => ({ label, expected, got, ok })))
  // the FIRST claim in that list ("Renamed") was never applied — nowhere in the html, because it
  // was never handed in as THIS capture's `claim`
  // "Renamed" legitimately appears once — inside the data-claims JSON, informational only. It must
  // never appear as RENDERED content: a claim only listed, never passed as `claim`, is never applied.
  const rendered = r.expected.replace(/ data-claims="[^"]*"/, '')
  assert.ok(!rendered.includes('Renamed'), 'a claim only listed, never handed in as `claim`, is never applied: ' + rendered)
  assert.ok(r.html.includes('data-replica-side="actual"') && !r.html.includes('data-claims'), 'the Actual carries no claim json at all')
})

test('a claim with neither an expected nor a got is skipped, and never marks anything', () => {
  const word = el('span', [10, 10, 60, 20], { text: 'Draft' })
  const bar = el('div', [0, 0, 400, 40], { children: [word] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const before = capC(body, { target: bar, ring: { x: 0, y: 0, width: 400, height: 40 } }).html
  const r = capC(body, {
    target: bar, ring: { x: 0, y: 0, width: 400, height: 40 },
    claim: { label: 'nothing', expected: '', got: '', ok: false },
    base: before
  })
  assert.ok(!r.expected.includes('data-claim='), 'nothing to apply, nothing applied: ' + r.expected)
})

// ── the two roots say which side they are ───────────────────────────────────────────────────────
test('each root names its side, and only the Expected carries data-claims', () => {
  const word = el('span', [520, 100, 60, 20], { text: 'Draft' })
  const btn = el('button', [500, 92, 130, 36], { children: [word] })
  const bar = el('div', [400, 88, 640, 44], { children: [btn] })
  const body = el('body', [0, 0, 1440, 900], { children: [bar] })
  const r = capC(body, { target: btn, ring: { x: 500, y: 92, width: 130, height: 36 } })
  assert.ok(r.html.includes('data-replica-side="actual"'), 'the photograph\'s half says so')
  assert.ok(!r.html.includes('data-claims'), 'and carries no claim json — it asserted nothing')
  assert.ok(r.expected.includes('data-replica-side="expected"'))
  assert.ok(r.expected.startsWith('<style>'), 'and it is the same shape as the Actual — sheet, then root')
})

test('the borrowed base is styled by the sheet it arrives with, re-minted, not by a class that means something else', () => {
  const before = tsumikiBefore()
  const body2 = el('body', [0, 0, 1440, 900], { children: [] })
  const r = capC(body2, {
    claim: { label: 'still listed', expected: 'Water the plants', got: '(missing)', ok: false, missing: true },
    base: before
  })
  const cls = /<li class="(r\d+)"[^>]*data-claim="restored"/.exec(r.expected)
  assert.ok(cls, 'the restored row keeps a class: ' + r.expected)
  assert.ok(r.expected.includes('.rep .' + cls[1] + '{padding:4px 0px;border-bottom:1px solid rgb(226, 232, 240)}'),
    'declared in the EXPECTED\'s own sheet, with the declarations it was captured in: ' + r.expected)
  assert.ok(!r.html.includes('border-bottom'), 'none of which reached the ACTUAL sheet')
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIX ROUND 2 (2026-09-03) — THE REBUILD: root cause 2, made a non-issue by construction.
//
// task-2-review.md's root cause 2: the counter and the task row are never in one captured scene, so
// no single base could carry both "still listed" and "To do 5". The controller's ruling: the region
// GROWS MONOTONICALLY (`arg.minRegion`, the union of every ring box the beat has rung), so a later
// moment's own Actual always has room for everything earlier moments rang too; a claim is only ever
// patched into a base IN PLACE when that base's OWN region already contains the current ring
// (`data-replica-region`, read back by `parseBase`); when it does not, `spec/_replica.mjs` REBUILDS
// from the current (grown) Actual and re-applies every earlier FAILED claim, geometrically (fix
// round 3), never by searching text again.
// ════════════════════════════════════════════════════════════════════════════════════════════════

test('fix round 2, rule 1: minRegion forces the scene root to contain it too — the region grows, never shrinks', () => {
  const ring = el('span', [10, 10, 20, 20], { text: 'x' })
  const near = el('div', [0, 0, 100, 100], { children: [ring] })       // area 10000 ≥ 3×400 — qualifies alone
  const far = el('div', [500, 500, 30, 30], {})                        // stands in for an earlier moment's ring
  const big = el('div', [0, 0, 600, 600], { children: [near, far] })
  const body = el('body', [0, 0, 1440, 900], { children: [big] })

  const withoutMin = capC(body, { target: ring, ring: { x: 10, y: 10, width: 20, height: 20 } })
  assert.deepEqual(withoutMin.region, { x: 0, y: 0, w: 100, h: 100 },
    'without minRegion, `near` qualifies alone: ' + JSON.stringify(withoutMin.region))

  const withMin = capC(body, {
    target: ring, ring: { x: 10, y: 10, width: 20, height: 20 },
    minRegion: { x: 500, y: 500, w: 30, h: 30 }
  })
  assert.deepEqual(withMin.region, { x: 0, y: 0, w: 600, h: 600 },
    '`near` no longer contains the grown region, so the walk continues to `big`: ' + JSON.stringify(withMin.region))
})

test('fix round 2, rule 2: a base whose region does not contain the current ring is never patched in place', () => {
  const btn = el('button', [10, 10, 40, 20], { text: 'Draft' })
  const smallScene = el('div', [0, 0, 60, 40], { children: [btn] })
  const bodyA = el('body', [0, 0, 1440, 900], { children: [smallScene] })
  const before = capC(bodyA, { target: btn, ring: { x: 10, y: 10, width: 40, height: 20 } })
  assert.deepEqual(before.region, { x: 0, y: 0, w: 60, h: 40 }, 'the base region is small: ' + JSON.stringify(before.region))

  // a SECOND, unrelated element far away — what the CURRENT ring targets, well outside the base's
  // own region
  const other = el('span', [500, 500, 30, 20], { text: 'Overdue' })
  const bodyB = el('body', [0, 0, 1440, 900], { children: [other] })
  const ring = { x: 500, y: 500, width: 30, height: 20 }
  const r = capC(bodyB, {
    target: other, ring,
    claim: { label: 'the due state', expected: 'Due today', got: 'Overdue', ok: false, ring },
    base: before.html
  })
  // NOT patched in place: the base's own content never rides into an Expected it cannot cover
  assert.ok(!r.expected.includes('Draft'), 'the base was never patched in place: ' + r.expected)
  // the CURRENT claim still applies, on the current (rebuilt) scene
  assert.ok(r.expected.includes('Due today') && !/>Overdue</.test(r.expected), r.expected)
})

// ── the full shape: a restored row AND an inserted placeholder, both re-applied by geometry, then
// the current claim — the exact R9 sequence (still listed → an Undo → the counter), on a stub DOM ─
test('fix round 3 on a rebuild: a restored row and an inserted placeholder both come back in claim order, the current claim applied last, all by geometry', () => {
  // the row's own (small) scene: row -> ul -> wrap qualifies as scene root (ul alone is too small)
  const cb = el('button', [4, 4, 18, 18], {})
  const ttl = el('span', [30, 5, 200, 18], { text: 'Pay the electricity bill' })
  const row = el('li', [0, 0, 300, 28], { children: [cb, ttl] })
  const nextRow = el('li', [0, 28, 300, 28], { children: [el('span', [30, 33, 200, 18], { text: 'Call the dentist' })] })
  const ul = el('ul', [0, 0, 300, 56], { children: [row, nextRow] })
  const wrap = el('div', [0, 0, 300, 120], { children: [ul] })
  const bodyRow = el('body', [0, 0, 1440, 900], { children: [wrap] })

  const before = capC(bodyRow, { target: row, ring: { x: 0, y: 0, width: 300, height: 28 } })
  assert.deepEqual(before.region, { x: 0, y: 0, w: 300, h: 120 }, 'the row\'s own scene is small: ' + JSON.stringify(before.region))

  const rowRing = { x: 0, y: 0, width: 300, height: 28 }
  const claim0 = { label: 'still listed', expected: 'Pay the electricity bill', got: '(missing)', ok: false, missing: true, ring: rowRing }
  // v1: missing claim, ring unchanged (the deleted row's own locator no longer resolves) — still
  // inside the base's own region → applied IN PLACE, restored (fix round 1's own mechanism)
  const r1 = capC(bodyRow, {
    target: row, ring: rowRing,
    claim: claim0, claims: [claim0], base: before.html
  })
  assert.ok(/<li[^>]*data-claim="restored"[^>]*data-claim-of="0"[^>]*>[\s\S]*Pay the electricity bill/.test(r1.expected), r1.expected)

  const claim1 = { label: 'an Undo appears', expected: 'Undo', got: '(missing)', ok: false, missing: true, ring: rowRing }
  // v2: a SECOND missing claim, same ring — still in place, inserted after the restored row
  const r2 = capC(bodyRow, {
    target: row, ring: rowRing,
    claim: claim1, claims: [claim0, claim1], base: r1.expected
  })
  assert.ok(/data-claim="restored"[\s\S]*<span data-claim="new" data-claim-of="1">Undo<\/span>/.test(r2.expected), r2.expected)

  // v3: the CURRENT claim rings a DIFFERENT, distant element — a counter — well outside r2's own
  // (row-scoped) region. minRegion carries the row's box forward, so THIS moment's own Actual scene
  // grows to cover both the row's old position and the counter.
  const counter = el('div', [500, 0, 80, 24], { text: 'To do 4' })
  const header = el('div', [500, 0, 200, 40], { children: [counter] })
  // the LIVE page now: the row is gone, "Call the dentist" has shifted up into its old slot
  const shifted = el('li', [0, 0, 300, 28], { children: [el('span', [30, 5, 200, 18], { text: 'Call the dentist' })] })
  const ulC = el('ul', [0, 0, 300, 28], { children: [shifted] })
  const page = el('div', [0, 0, 700, 400], { children: [ulC, header] })
  const bodyC = el('body', [0, 0, 1440, 900], { children: [page] })

  const counterRing = { x: 500, y: 0, width: 80, height: 24 }
  const claim2 = { label: 'the open count', expected: 'To do 5', got: 'To do 4', ok: false, ring: counterRing }
  const r3 = capC(bodyC, {
    target: counter, ring: counterRing,
    claim: claim2, claims: [claim0, claim1, claim2], base: r2.expected,
    minRegion: { x: 0, y: 0, w: 300, h: 28 }
  })
  // the current claim applied: the counter now reads the requirement's word
  assert.ok(r3.expected.includes('To do 5') && !/>To do 4</.test(r3.expected), r3.expected)
  // BOTH earlier failed claims re-applied, in CLAIM ORDER, before the spot's current occupant (the
  // row that shifted up to occupy the deleted row's old slot) — the restored title, THEN Undo, THEN
  // "Call the dentist"
  const iTitle = r3.expected.indexOf('Pay the electricity bill')
  const iUndo = r3.expected.indexOf('>Undo<')
  const iDentist = r3.expected.indexOf('Call the dentist')
  assert.ok(iTitle >= 0 && iUndo >= 0 && iDentist >= 0, r3.expected)
  assert.ok(iTitle < iUndo && iUndo < iDentist,
    'restored row, then Undo, then the row that moved up — claim order: ' + r3.expected)
  assert.ok(/data-claim="restored"[^>]*data-claim-of="0"/.test(r3.expected), 'the restore keeps its own claim index')
  assert.ok(/data-claim="new"[^>]*data-claim-of="1"/.test(r3.expected), 'so does the placeholder')
  // and the Actual is untouched by any of it — the app's own (still wrong) picture
  assert.ok(r3.html.includes('To do 4') && !r3.html.includes('Pay the electricity bill') && !r3.html.includes('Undo'), r3.html)
})

test('fix round 3 on a rebuild: an earlier claim with no leaf inside its OWN ring box anywhere is flagged unlocated', () => {
  const btn = el('button', [10, 10, 40, 20], { text: 'Draft' })
  const smallScene = el('div', [0, 0, 60, 40], { children: [btn] })
  const bodyA = el('body', [0, 0, 1440, 900], { children: [smallScene] })
  const ring0 = { x: 10, y: 10, width: 40, height: 20 }
  const claim0 = { label: 'the track', expected: 'Published', got: 'Draft', ok: false, ring: ring0 }
  const before = capC(bodyA, { target: btn, ring: ring0 })
  const r1 = capC(bodyA, {
    target: btn, ring: ring0,
    claim: claim0, claims: [claim0], base: before.html
  })
  assert.ok(r1.expected.includes('Published') && r1.expected.includes('data-claim-of="0"'), r1.expected)

  // v2: a totally different scene — claim0's OWN ring box (10,10,40,20) now covers empty space,
  // nothing this capture walked lies there at all
  const other = el('span', [500, 500, 30, 20], { text: 'Overdue' })
  const bodyB = el('body', [0, 0, 1440, 900], { children: [other] })
  const ring1 = { x: 500, y: 500, width: 30, height: 20 }
  const claim1 = { label: 'the due state', expected: 'Due today', got: 'Overdue', ok: false, ring: ring1 }
  const r2 = capC(bodyB, {
    target: other, ring: ring1,
    claim: claim1, claims: [claim0, claim1], base: r1.expected,
    minRegion: ring0
  })
  assert.ok(r2.expected.includes('Due today'), 'the current claim still applies: ' + r2.expected)
  const rendered2 = r2.expected.replace(/ data-claims="[^"]*"/, '')
  assert.ok(!rendered2.includes('Published'), 'the unlocated claim was never applied — no guess, no fallback: ' + rendered2)
  const json = JSON.parse(/data-claims="([^"]*)"/.exec(r2.expected)[1].replace(/&quot;/g, '"'))
  assert.equal(json[0].unlocated, true, 'flagged, honestly: ' + JSON.stringify(json))
  assert.ok(!json[1].unlocated, 'the current claim itself is never "unlocated" — it just applies')
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIX ROUND 3 (2026-09-03) — the full R9 shape, exactly the sequence that broke fix round 2: an OK
// claim on the counter FIRST (the beat's Given), then the row deleted, restored, an Undo inserted,
// and finally the counter's OWN wrong-value claim. Round 2 failed here because minRegion grew so
// early (from the counter's own OK ring) that every later base's region trivially contained the
// counter too, so the wrong-value fix was patched IN PLACE against a frozen pre-click tree that
// never showed "4" anywhere — falling to the (now deleted) bounded fallback and overwriting the
// restored title. Locating by the CLAIM'S OWN ring box, not by searching for `got`, makes that
// impossible: wherever the base's region puts the search, the counter's own ring box finds the
// counter's own leaf, never the row's.
// ════════════════════════════════════════════════════════════════════════════════════════════════
test('fix round 3: the R9-shaped sequence — ok counter, delete the row, missing restored, Undo new, counter wrong value — ends with all three present and marked', () => {
  const cb = el('button', [4, 4, 18, 18], {})
  const ttl = el('span', [30, 5, 200, 18], { text: 'Pay the electricity bill' })
  const row = el('li', [0, 0, 300, 28], { children: [cb, ttl] })
  const nextRow = el('li', [0, 28, 300, 28], { children: [el('span', [30, 33, 200, 18], { text: 'Call the dentist' })] })
  const ul = el('ul', [0, 0, 300, 56], { children: [row, nextRow] })
  const wrap = el('div', [0, 0, 300, 120], { children: [ul] })
  const counter = el('div', [500, 0, 80, 24], { text: 'To do 5', cs: { color: 'rgb(180,0,0)' } })
  const head = el('div', [500, 0, 200, 40], { children: [counter] })
  const bodyBoth = el('body', [0, 0, 1440, 900], { children: [wrap, head] })

  // moment 1 (the beat's Given): the OK claim on the counter — FIRST, exactly R9's own order
  const counterRing = { x: 500, y: 0, width: 80, height: 24 }
  const claimA = { label: 'five open', expected: '5', got: '5', ok: true, ring: counterRing }
  const rA = capC(bodyBoth, { target: counter, ring: counterRing, claim: claimA, claims: [claimA] })
  assert.deepEqual(rA.region, { x: 500, y: 0, w: 200, h: 40 }, 'the counter\'s own small scene: ' + JSON.stringify(rA.region))

  // moment 2: the row itself, still OK (before the delete) — minRegion now carries the counter's box
  const rowRing = { x: 0, y: 0, width: 300, height: 28 }
  const claimB = { label: 'the task about to go', expected: 'Pay the electricity bill', got: 'Pay the electricity bill', ok: true, ring: rowRing }
  const rB = capC(bodyBoth, {
    target: row, ring: rowRing,
    claim: claimB, claims: [claimA, claimB],
    minRegion: counterRing
  })
  const before = rB.html

  // moment 3: the row is deleted — a missing claim, FAILS. base = rB's own Actual (lastRight)
  const shiftedList = el('div', [0, 0, 300, 120], { children: [el('ul', [0, 0, 300, 28], { children: [
    el('li', [0, 0, 300, 28], { children: [el('span', [30, 5, 200, 18], { text: 'Call the dentist' })] })
  ] })] })
  const shiftedBody = el('body', [0, 0, 1440, 900], { children: [shiftedList, head] })
  const claimC = { label: 'still listed', expected: 'Pay the electricity bill', got: '(missing)', ok: false, missing: true, ring: rowRing }
  const rC = capC(shiftedBody, {
    target: row, ring: rowRing,
    claim: claimC, claims: [claimA, claimB, claimC],
    minRegion: counterRing,
    base: before
  })
  assert.ok(/data-claim="restored"/.test(rC.expected), rC.expected)

  // moment 4: Undo — missing, not found, inserted
  const claimD = { label: 'an Undo appears', expected: 'Undo', got: '(missing)', ok: false, missing: true, ring: rowRing }
  const rD = capC(shiftedBody, {
    target: row, ring: rowRing,
    claim: claimD, claims: [claimA, claimB, claimC, claimD],
    minRegion: counterRing,
    base: rC.expected
  })
  assert.ok(/data-claim="new"[^>]*>Undo</.test(rD.expected), rD.expected)

  // moment 5: the counter, wrong value — the app's OWN live "4" vs the required "5". Its ring is
  // DISTANT from the row's, exactly R9's shape — and the base (rD.expected) has never shown "4"
  // anywhere, since it descends from the pre-click snapshot where the counter correctly read "5".
  const counter2 = el('div', [500, 0, 80, 24], { text: 'To do 4', cs: { color: 'rgb(180,0,0)' } })
  const head2 = el('div', [500, 0, 200, 40], { children: [counter2] })
  const bodyE = el('body', [0, 0, 1440, 900], { children: [head2] })
  const claimE = { label: 'the open count', expected: 'To do 5', got: 'To do 4', ok: false, ring: counterRing }
  const rE = capC(bodyE, {
    target: counter2, ring: counterRing,
    claim: claimE, claims: [claimA, claimB, claimC, claimD, claimE],
    minRegion: rowRing,
    base: rD.expected
  })
  assert.ok(/data-claim="restored"[^>]*>[\s\S]*Pay the electricity bill/.test(rE.expected), 'the restored row survives: ' + rE.expected)
  assert.ok(/data-claim="new"[^>]*>Undo</.test(rE.expected), 'so does Undo: ' + rE.expected)
  // the base this claim locates in (rD.expected) descends from moment 2's snapshot — BEFORE the
  // click, when the counter genuinely, still, read "5" — so the leaf found at the counter's OWN
  // ring box ALREADY says the requirement's word: rule 2's case (b), marked fixed, nothing rewritten
  assert.ok(/data-claim="fixed"[^>]*data-claim-of="4"[^>]*>To do 5</.test(rE.expected),
    'and the counter is fixed, found at its OWN ring box (case b — already right, nothing rewritten): ' + rE.expected)
  assert.ok(!/data-claim-got/.test(rE.expected.replace(/ data-claims="[^"]*"/, '')),
    'nothing anywhere needed rewriting — every fact this base ever carried for this ring box was already correct')
  assert.ok(rE.html.includes('To do 4') && !rE.html.includes('Pay the electricity bill'), 'the Actual is still the app\'s own wrong picture')
})
