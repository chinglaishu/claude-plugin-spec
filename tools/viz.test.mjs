// tools/viz.test.mjs — the drawn schematic (requirement schematics spec 2026-08-18, task 4).
// Pure red-first units: a behavior chain maps DETERMINISTICALLY to an archetype and from there to a
// house-style animated SVG — no model, no fs, no browser. The no-match → null contract is the
// honesty rule: a requirement the kit cannot draw stays text-only, never a wrong picture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vizHash, vizStale, matchArchetype, deriveSchematic, renderWireframe, layoutHash, framedRegion } from './viz.mjs'
import { reqHash, behaviorText } from './reqhash.mjs'
import { renderSchematic } from './build-board.mjs'

// ── fixtures: the board's OWN behavior blocks (dogfood) + kit exemplars ────
const b = (given, ...wt) => ({
  given,
  beats: Array.from({ length: wt.length / 2 }, (_, i) => ({ when: wt[2 * i], then: wt[2 * i + 1] }))
})

// board R3 — open + unfolds
const OPEN = b('a requirement showing only its title',
  'you open it',
  'its full, formatted description unfolds — a List row opens into the Focus body in place')
// board R9 — search + only-matching-stay
const FILTER = b('screens grouped into named areas',
  'you search a term',
  'only cards matching a name, route, or requirement stay, and a group with no match hides')
// board R13 — toggle named views (must NOT be mistaken for toggle-and-recount: no count in the Then)
const VIEWS = b("a screen's requirements",
  'you toggle Focus / List / Flow',
  'the same requirements render in that view, storing nothing new')
// board R15 — pick from a menu + a prompt opens
const MENU = b('a requirement or a test',
  'you pick an action from its ⋯ menu',
  'a ready Claude prompt opens and is copied — the board writes no file')
// the tick/recount exemplar (the schematics mockup's R4/R5 family)
const TICK = b('a container with three open sub-tasks',
  'you tick a sub-task', 'the remaining count drops to 2',
  'you tick another', 'the remaining count drops to 1')
// the press/clear + restore exemplar (the _modes probe fixture's very text)
const CLEAR = b('a list with two items',
  'you press Clear', 'the list shows zero items',
  'you press Undo', 'the two items return')
// move-between-lists
const MOVE = b('an item sitting in the first list',
  'you drag it to the second list',
  'it leaves the first list and appears in the second')
// board R2 — scroll: deliberately OUTSIDE the kit (honest text-only)
const SCROLL = b('a requirement and its proof shown together',
  'you scroll the proof',
  'the reading stays still, and neither region scrolls the page')
// board R16 — render-on-load: outside the kit too
const RENDERS = b("the board's home with no dismissal preference set",
  'it renders',
  'a feature strip of six cards sits above the areas, each opening the live example of itself on this board')

// ── the hash pin: thin wrappers over reqhash (the ONE text-hash authority) ──
test('vizHash is reqHash over behaviorText — the same pin authority everything else uses', () => {
  assert.equal(vizHash(CLEAR), reqHash(behaviorText(CLEAR)))
  assert.equal(vizHash(CLEAR), vizHash(b(CLEAR.given, ...CLEAR.beats.flatMap(x => [x.when, x.then]))))
  // one moved word moves the pin
  const moved = b(CLEAR.given, 'you press Clear', 'the list shows ONE item', 'you press Undo', 'the two items return')
  assert.notEqual(vizHash(moved), vizHash(CLEAR))
})

test('vizStale — a matching stamp is fresh; moved text (or text gone prose-only) reads stale', () => {
  assert.equal(vizStale(vizHash(CLEAR), CLEAR), false)
  const moved = b(CLEAR.given, 'you press Clear', 'the list shows ONE item', 'you press Undo', 'the two items return')
  assert.equal(vizStale(vizHash(CLEAR), moved), true)
  // a drawing left behind after the behavior block was removed entirely is stale, never silently kept
  assert.equal(vizStale(vizHash(CLEAR), null), true)
})

// ── archetype mapping: deterministic, keyword-driven, honest null ──────────
test('each kit archetype matches its exemplar — including the board dogfood texts', () => {
  assert.equal(matchArchetype(TICK), 'toggle-and-recount')
  assert.equal(matchArchetype(CLEAR), 'press-and-clear')
  assert.equal(matchArchetype(MOVE), 'move-between-lists')
  assert.equal(matchArchetype(FILTER), 'type-and-filter')
  assert.equal(matchArchetype(VIEWS), 'switch-views')
  assert.equal(matchArchetype(OPEN), 'open-and-reveal')
  assert.equal(matchArchetype(MENU), 'open-and-reveal')
})

test('no archetype fits — null, so the requirement stays honestly text-only', () => {
  assert.equal(matchArchetype(SCROLL), null)   // board R2: scroll independence has no template
  assert.equal(matchArchetype(RENDERS), null)  // board R16: render-on-load has no action to draw
  assert.equal(matchArchetype(null), null)     // prose-only requirement: no behavior, no drawing
})

test('a views-toggle with no count is never mistaken for toggle-and-recount', () => {
  // "toggle" appears in R13's When, but its Then names a view, not a count — the recount archetype
  // requires the counted outcome, so the more specific rule cannot shadow the right one.
  assert.equal(matchArchetype(VIEWS), 'switch-views')
})

// ── deriveSchematic: the drawn contract ────────────────────────────────────
test('deriveSchematic — null in, null out; no-match in, null out', () => {
  assert.equal(deriveSchematic(null), null)
  assert.equal(deriveSchematic(SCROLL), null)
})

test('deriveSchematic returns one drawing + one still phase per scene (given + each beat)', () => {
  for (const [fix, beats] of [[OPEN, 1], [CLEAR, 2], [TICK, 2], [MOVE, 1], [FILTER, 1], [VIEWS, 1]]) {
    const d = deriveSchematic(fix)
    assert.ok(d, 'derives for ' + JSON.stringify(fix.beats[0]))
    assert.equal(d.archetype, matchArchetype(fix))
    assert.equal(d.phases.length, beats + 1, 'phases = given + one per beat')
    assert.ok(d.phases.every(p => typeof p === 'number' && p < 0), 'phases are negative animation-delays')
    assert.ok(d.svg.trimStart().startsWith('<svg'), 'a complete inline SVG')
    assert.ok(d.svg.trimEnd().endsWith('</svg>'))
  }
})

test('the SVG is house-style and safe: tokens only, no ids, no script, no backtick', () => {
  const d = deriveSchematic(TICK)
  assert.ok(!/#[0-9a-fA-F]{3}/.test(d.svg), 'no raw hex colour — the dye tokens carry every colour')
  assert.ok(/var\(--/.test(d.svg), 'colours come from the design system variables')
  assert.ok(!/<script/i.test(d.svg), 'never a script')
  assert.ok(!/\sid="/.test(d.svg), 'class-scoped, no ids — copies (stills) may not collide')
  assert.ok(!d.svg.includes('`'), 'no backtick — safe wherever the builder interpolates it')
  assert.ok(/aria-label="/.test(d.svg) && /role="img"/.test(d.svg), 'readable: role + aria-label')
  assert.ok(/prefers-reduced-motion/.test(d.svg) === false, 'reduced-motion is the page CSS’s job, not per-file')
})

test('the SVG carries its own pin: data-viz-hash, archetype, beats and phases stamped on the root', () => {
  const d = deriveSchematic(CLEAR)
  assert.ok(d.svg.includes('data-viz-hash="' + vizHash(CLEAR) + '"'), 'stamped with the behavior-text hash')
  assert.ok(d.svg.includes('data-viz-archetype="press-and-clear"'))
  assert.ok(d.svg.includes('data-viz-beats="2"'))
  assert.ok(d.svg.includes('data-viz-phases="' + d.phases.join(' ') + '"'))
})

test('derivation is deterministic — same text, byte-identical drawing (rot-proof re-derive)', () => {
  assert.equal(deriveSchematic(TICK).svg, deriveSchematic(TICK).svg)
  assert.deepEqual(deriveSchematic(TICK).phases, deriveSchematic(TICK).phases)
})

test('two different texts never share keyframe names — the loop and stills of MANY reqs coexist', () => {
  const a = deriveSchematic(OPEN); const c = deriveSchematic(MENU)
  // both are open-and-reveal, but each scopes its animation to its own hash-suffixed class
  const cls = s => (s.match(/class="(vz[0-9a-f]+)"/) || [])[1]
  assert.ok(cls(a.svg) && cls(c.svg))
  assert.notEqual(cls(a.svg), cls(c.svg))
})

test('beats past what an archetype can draw honestly refuse — null, not a wrong loop', () => {
  const three = b('a list', 'you press Clear', 'zero items remain',
    'you press Undo', 'the items return', 'you press Clear', 'zero again')
  assert.equal(deriveSchematic(three), null)   // press-and-clear draws 1 act + 1 restore, no more
  const four = b('a checklist',
    'you tick one', 'count 4', 'you tick one', 'count 3', 'you tick one', 'count 2', 'you tick one', 'count 1')
  assert.equal(deriveSchematic(four), null)    // the recount template draws at most three ticks
})

test('untrusted text is escaped before it reaches the aria-label', () => {
  const hostile = b('a "quoted" <given> & more', 'you open it', 'it unfolds and shows all')
  const d = deriveSchematic(hostile)
  assert.ok(d, 'still derives — the text is data, not structure')
  assert.ok(!/<given>/.test(d.svg), 'angle brackets never land raw')
  assert.ok(d.svg.includes('&quot;quoted&quot;'), 'quotes are escaped inside the attribute')
})

// ── renderSchematic (build-board): the baked figure contract ───────────────
test('renderSchematic — the empty-string contract, exactly like renderBehavior(null)', () => {
  assert.equal(renderSchematic({ viz: null }), '')
  assert.equal(renderSchematic({}), '')
})

test('renderSchematic bakes the figure: svg inside, phases + hashes as data, stale marked', () => {
  const d = deriveSchematic(CLEAR)
  const fresh = renderSchematic({ viz: { svg: d.svg, phases: d.phases, hash: vizHash(CLEAR), textHash: vizHash(CLEAR), at: '2026-08-22', stale: false } })
  assert.ok(fresh.startsWith('<figure class="schematic"'))
  assert.ok(fresh.includes(d.svg))
  assert.ok(fresh.includes('data-phases="' + d.phases.join(' ') + '"'))
  assert.ok(fresh.includes('data-vizhash="' + vizHash(CLEAR) + '"'))
  assert.ok(fresh.includes('data-vizat="2026-08-22"'))
  assert.ok(!fresh.includes('data-stale'), 'fresh carries no stale mark')
  const stale = renderSchematic({ viz: { svg: d.svg, phases: d.phases, hash: 'deadbeefdeadbeef', textHash: vizHash(CLEAR), at: '2026-08-22', stale: true } })
  assert.ok(stale.includes('data-stale="1"'), 'stale is baked so the client renders the quiet grey')
  assert.ok(stale.includes('data-texthash="' + vizHash(CLEAR) + '"'), 'both hashes ride along for the ≠ note')
})

test('renderSchematic refuses anything that is not a plain committed SVG', () => {
  // defense in depth: the viz file is committed content, but the builder still never inlines a
  // script or a non-svg payload into board.html
  assert.equal(renderSchematic({ viz: { svg: '<script>alert(1)</script>', phases: [], hash: 'x', textHash: 'x', stale: false } }), '')
  assert.equal(renderSchematic({ viz: { svg: '<svg><script>x</script></svg>', phases: [], hash: 'x', textHash: 'x', stale: false } }), '')
  assert.equal(renderSchematic({ viz: { svg: 'plain text', phases: [], hash: 'x', textHash: 'x', stale: false } }), '')
})

test('renderSchematic refuses on*= event handlers and javascript:/data: hrefs (task 4 review M1)', () => {
  // The comment above renderSchematic states the contract plainly: "board.html must never gain
  // executable content this way." The <script> refusal above does not cover an inline handler
  // attribute or a javascript:/data: URI hiding in an href — both execute once the SVG is inlined
  // into the live DOM (and again via innerHTML in client.js buildSchematic). The SVGs on disk today
  // are self-authored and clean, so this is contract-hardening rather than an active hole — but the
  // filter should actually do what its comment says.
  const mk = svg => ({ viz: { svg, phases: [], hash: 'x', textHash: 'x', stale: false } })
  assert.equal(renderSchematic(mk('<svg onload="alert(1)"></svg>')), '', 'onload attribute refused')
  assert.equal(renderSchematic(mk('<svg><rect onclick="alert(1)"/></svg>')), '', 'onclick attribute refused')
  assert.equal(renderSchematic(mk('<svg><a href="javascript:alert(1)"><rect/></a></svg>')), '', 'javascript: href refused')
  assert.equal(renderSchematic(mk('<svg><a href="data:text/html,<script>alert(1)</script>"><rect/></a></svg>')), '', 'data: href refused')
  assert.equal(renderSchematic(mk('<svg><a xlink:href="javascript:alert(1)"><rect/></a></svg>')), '', 'javascript: xlink:href refused')
  // a plain, clean drawing (no handlers, no javascript:/data: href) must still render — the
  // hardening must not over-refuse ordinary committed content.
  const clean = renderSchematic(mk('<svg><rect fill="var(--wash)"/></svg>'))
  assert.ok(clean.includes('<svg><rect fill="var(--wash)"/></svg>'), 'a clean svg with no handlers/hrefs is unaffected')
})

// ── Task 7 (2026-08-22): the three archetypes the beats draft named, against the REAL prd texts ──
// The draft's analysis (beats-draft.json) proposed derive-a-word / fold-into-rows / type-and-append
// and listed which ids each serves; the same pass marked 13 requirements text-only ON PURPOSE
// (absences, streaming, a one-slot fight, an in-place edit, a reload) — those must STILL fall to
// null, read from the prd files so the pin is against the signed text, never a paraphrase.
import { readFileSync } from 'node:fs'
import { parsePrd } from './spec-store.mjs'
import { parseBehavior } from './behavior.mjs'

const PRD = (root, screen) => parsePrd(readFileSync(new URL(`../${root}/${screen}/prd.md`, import.meta.url), 'utf8')).reqs
const real = (() => {
  const out = {}
  for (const s of ['board', 'dispatch', 'init', 'conflicts']) for (const r of PRD('spec', s)) out[`${s}:${r.id}`] = parseBehavior(r.body)
  for (const r of PRD('demo/todo/spec', 'todo')) out[`todo:${r.id}`] = parseBehavior(r.body)
  return out
})()
const SERVES = {
  'derive-a-word': ['board:R4', 'board:R6', 'board:R12', 'dispatch:R3', 'dispatch:R7', 'todo:R7'],
  'fold-into-rows': ['dispatch:R8', 'init:R5', 'conflicts:R5'],
  'type-and-append': ['todo:R1', 'todo:R3']
}
// the draft's deliberate text-only set — 13 ids — plus init:R6, which the draft listed under
// type-and-append but whose SECOND beat (a missing piper/ffmpeg disables the switch) no typed
// append can draw honestly: a chain an archetype cannot draw in full falls to null (the 2026-08-18
// honesty rule), so it stays text-only rather than wearing a picture of only half its beats.
const TEXT_ONLY = ['board:R7', 'board:R8', 'board:R10', 'board:R11', 'board:R14',
  'dispatch:R2', 'dispatch:R4', 'dispatch:R5', 'init:R3', 'conflicts:R1', 'conflicts:R3',
  'todo:R2', 'todo:R8', 'init:R6',
  // Task 7 review A1-b/c (the controller, 2026-08-22 — the drawing, not the requirement): init R2's
  // "it BECOMES a row" is a row appearing, which fold-into-rows (a landing on rows already there)
  // cannot draw; init R1's "stores … reads them back" names no row and no count, so type-and-append
  // would invent a list and a TOTAL for it. Both fall to null rather than draw a neighbouring idea.
  'init:R1', 'init:R2']

test('the three task-7 archetypes fit their listed ids\' REAL beats (read from the prd files) and draw', () => {
  for (const [arch, ids] of Object.entries(SERVES)) {
    for (const id of ids) {
      assert.ok(real[id], `${id} has a behavior block`)
      assert.equal(matchArchetype(real[id]), arch, `${id} → ${arch}`)
      const d = deriveSchematic(real[id])
      assert.ok(d && d.svg.startsWith('<svg'), `${id} draws`)
      assert.equal(d.phases.length, real[id].beats.length + 1)
      assert.ok(!/#[0-9a-fA-F]{3}/.test(d.svg) && !/\sid="/.test(d.svg) && !d.svg.includes('`'), `${id}: house style`)
    }
  }
})

test('the draft\'s deliberate text-only set (+ init:R6) still falls to null — never a wrong picture', () => {
  for (const id of TEXT_ONLY) {
    assert.ok(real[id], `${id} has a behavior block`)
    assert.equal(matchArchetype(real[id]), null, `${id} stays text-only`)
    assert.equal(deriveSchematic(real[id]), null)
  }
})

test('the six older archetypes keep their real fits — the new rules shadow none of them', () => {
  const keep = {
    'board:R1': 'open-and-reveal', 'board:R3': 'open-and-reveal', 'board:R5': 'open-and-reveal', 'board:R15': 'open-and-reveal',
    'board:R9': 'type-and-filter', 'board:R13': 'switch-views',
    'dispatch:R1': 'open-and-reveal', 'dispatch:R6': 'open-and-reveal',
    'init:R4': 'open-and-reveal', 'conflicts:R2': 'open-and-reveal', 'conflicts:R4': 'press-and-clear',
    'todo:R4': 'toggle-and-recount', 'todo:R5': 'toggle-and-recount', 'todo:R6': 'switch-views',
    'board:R2': null, 'board:R16': null
  }
  for (const [id, arch] of Object.entries(keep)) assert.equal(matchArchetype(real[id]), arch, id)
})

test('derive-a-word: nothing is typed — the cursor is absent, and the chip flips its word per beat', () => {
  const d = deriveSchematic(real['board:R4'])
  assert.equal(d.archetype, 'derive-a-word')
  assert.ok(!d.svg.includes('class="cur"'), 'no cursor: the state is computed, never typed')
  // the three words R4's beats name, drawn on the chip in beat order
  for (const w of ['Passed', 'Failed', 'Untested']) assert.ok(d.svg.includes('>' + w + '<'), 'chip word ' + w)
  // a Then that names no word still flips the chip — an abstract bar, never an invented word
  const d2 = deriveSchematic(real['dispatch:R7'])
  assert.equal(d2.archetype, 'derive-a-word')
  assert.ok(!/>[A-Z][a-z]+</.test(d2.svg), 'no word invented for R7')
})

test('derive-a-word refuses a user act — "you …" in a When is somebody typing, not a derivation', () => {
  const typed = b('a requirement', 'you type Passed into its state', 'it reads Passed')
  assert.notEqual(matchArchetype(typed), 'derive-a-word')
})

test('fold-into-rows: one row lights per beat, the others are drawn unchanged; more than three beats refuse', () => {
  const d = deriveSchematic(real['dispatch:R8'])
  assert.equal(d.archetype, 'fold-into-rows')
  assert.equal((d.svg.match(/class="hit\d"/g) || []).length, 3, 'three landings, one per beat')
  const four = b('records', 'a run covers case A', 'that record updates, the rest keep theirs',
    'a run covers case B', 'the record updates', 'a run covers C', 'the record updates', 'a run covers D', 'the record updates')
  assert.equal(deriveSchematic(four), null)
})

test('type-and-append: the typed bar, a row sliding in at the foot, the count stepping up', () => {
  const d = deriveSchematic(real['todo:R1'])
  assert.equal(d.archetype, 'type-and-append')
  assert.ok(d.svg.includes('class="typed"'), 'something is typed')
  assert.ok(d.svg.includes('class="new0"'), 'the appended row')
  assert.ok(d.svg.includes('>3<') && d.svg.includes('>2<'), 'the count steps 2 → 3')
  assert.ok(d.svg.includes('class="cur"'), 'the cursor types it — a user act')
})

// Task 7 review A1-a: conflicts R5's idea is that a rescan lands and the settled row STAYS — the
// drawing held the landed row lit to the end (the picture of "updates", the opposite). The "stays"
// variant flashes the landing and returns the row to rest; a chain whose Then says updates/marked
// new (dispatch R8, init R5) still holds the tint.
test('fold-into-rows "stays": a Then that only stays/keeps flashes the landed row, never holds it lit', () => {
  const d = deriveSchematic(real['conflicts:R5'])
  assert.equal(d.archetype, 'fold-into-rows')
  assert.ok(d.svg.includes('data-variant="stays"'), 'the stays variant is stamped')
  // the held tint is a keyframe pair "opacity:.22 … opacity:.22" up to the hold; the flash is one
  // short window. Pin it by the hit0 keyframes: no stop at the hold carries the lit opacity.
  const kf = d.svg.match(/@keyframes \S*hit0\{((?:[^{}]*\{[^{}]*\})*)\}/)[1]
  const litStops = [...kf.matchAll(/([\d.]+)%\{opacity:\.22\}/g)].map(m => Number(m[1]))
  assert.ok(litStops.length >= 1, 'the landing flashes')
  assert.ok(Math.max(...litStops) - Math.min(...litStops) <= 4, 'the flash is brief — not held to the hold: ' + litStops)
  const upd = deriveSchematic(real['dispatch:R8'])
  assert.ok(!upd.svg.includes('data-variant="stays"'), 'R8 updates — the landed row holds its tint')
  const mk = deriveSchematic(real['init:R5'])
  assert.ok(!mk.svg.includes('data-variant="stays"'), 'R5 marks a route new — an update, held')
})

test('type-and-append refuses a Then that names no row and no count (init R1: stores … reads back)', () => {
  const saved = b('Setup', 'you enter the URL and save', 'the config stores exactly that and Setup reads it back')
  assert.equal(matchArchetype(saved), null)
})

test('fold-into-rows refuses a Then where something BECOMES a row (init R2) — a landing cannot draw a row appearing', () => {
  const grows = b('an app being inventoried', 'the crawl visits a route', 'it becomes a row with its screenshot')
  assert.equal(matchArchetype(grows), null)
})

// ── Task 11: play speed — the whole drawing retimes off ONE wrapper var ────
// Every animation-duration is emitted as calc(<X>s / var(--spd, 1)), so setting --spd on the
// schematic wrapper retimes loop playback (1 / 1.5 / 2). The still PHASES stay plain negative
// numbers: the client CSS divides the parked delay by the SAME var, so the fraction
// |delay|/duration — the frame a still shows — is preserved exactly at every speed.
test('T11: every animation shorthand carries calc(<X>s / var(--spd, 1)) — no unscaled duration survives', () => {
  for (const fix of [OPEN, CLEAR, TICK, MOVE, FILTER, VIEWS, MENU]) {
    const d = deriveSchematic(fix)
    const shorthands = d.svg.match(/animation:[^;}]*/g) || []
    assert.ok(shorthands.length > 0, 'the drawing animates')
    for (const a of shorthands) {
      assert.match(a, /calc\(\d+(\.\d+)?s \/ var\(--spd, 1\)\)/, 'scaled duration in: ' + a)
      assert.ok(!/ \d+(\.\d+)?s /.test(a), 'no bare duration left in: ' + a)
    }
  }
})
test('T11: the still phases are untouched — plain negative seconds for --ph, never a calc string', () => {
  const d = deriveSchematic(TICK)
  assert.ok(d.phases.every(p => typeof p === 'number' && p < 0))
  assert.ok(d.svg.includes('data-viz-phases="' + d.phases.join(' ') + '"'))
})

// ── the UI MIRROR (the human, 2026-08-28): a schematic drawn from the REAL screen ──────────────
// The archetype kit draws the idea; the complaint that bought this pass is that the idea's "2
// TOTAL → 3 TOTAL" chip is so unlike the app's own counter that nobody could map one onto the
// other. Where a run harvested the page's layout skeleton around the assertion, the drawing is a
// wireframe of THAT: the same boxes in the same places, the asserted element ringed, the value it
// actually read spelled out. Still a drawing — house shapes and dye tokens, never a screenshot.
const LAY_BEFORE = {
  w: 1440,
  h: 900,
  ring: null,
  els: [
    { x: 0, y: 0, w: 1440, h: 64, kind: 'container' },
    { x: 24, y: 16, w: 220, h: 32, kind: 'heading', text: 'Today · to do' },
    { x: 24, y: 96, w: 600, h: 44, kind: 'input', text: 'What needs doing?' },
    { x: 660, y: 96, w: 90, h: 36, kind: 'button', text: 'Add' },
    { x: 24, y: 160, w: 600, h: 40, kind: 'row' },
    { x: 1180, y: 96, w: 120, h: 48, kind: 'text', text: '2 to do' }
  ]
}
const LAY_AFTER = {
  ...LAY_BEFORE,
  ring: { x: 1180, y: 96, w: 120, h: 48 },
  els: [
    ...LAY_BEFORE.els.slice(0, 5),
    { x: 24, y: 208, w: 600, h: 40, kind: 'row' },
    { x: 1180, y: 96, w: 120, h: 48, kind: 'text', text: '3 to do', focus: true }
  ]
}
const COUNT = b('a list with two items', 'you add one', 'the counter reads 3 to do')

test('renderWireframe draws the real layout — the asserted value, in the app\'s own words', () => {
  const d = renderWireframe(LAY_BEFORE, LAY_AFTER, { behavior: COUNT })
  assert.ok(d, 'a harvested layout always draws — no archetype has to fit')
  assert.equal(d.archetype, 'ui-mirror')
  assert.equal(d.kind, 'wireframe')
  assert.ok(d.svg.includes('>3 to do<'), 'the value the assertion read is on the drawing')
  assert.ok(d.svg.includes('>2 to do<'), 'and the same place one moment earlier, so it reads as a change')
  assert.ok(d.svg.includes('data-viz-kind="wireframe"'))
  assert.ok(d.svg.includes('data-viz-layout="' + layoutHash(LAY_BEFORE, LAY_AFTER) + '"'), 'the geometry pin')
  assert.ok(d.svg.includes('data-viz-hash="' + vizHash(COUNT) + '"'), 'and the TEXT pin the board reads for staleness')
})

test('the mirror is house-style and safe, exactly like the archetype drawings', () => {
  const d = renderWireframe(LAY_BEFORE, LAY_AFTER, { behavior: COUNT })
  assert.ok(!/#[0-9a-fA-F]{3}/.test(d.svg), 'no raw hex — the app\'s own colours never reach the drawing')
  assert.ok(/var\(--/.test(d.svg), 'dye tokens carry every colour')
  assert.ok(!/<script/i.test(d.svg))
  assert.ok(!/\sid="/.test(d.svg), 'class-scoped, no ids')
  assert.ok(!d.svg.includes('`'), 'no backtick')
  assert.ok(/role="img"/.test(d.svg) && /aria-label="/.test(d.svg))
  assert.ok(d.svg.trimStart().startsWith('<svg') && d.svg.trimEnd().endsWith('</svg>'))
  // the same speed contract as the kit (Task 11): one wrapper var retimes the whole drawing
  for (const a of d.svg.match(/animation:[^;}]*/g) || []) {
    assert.match(a, /calc\(\d+(\.\d+)?s \/ var\(--spd, 1\)\)/, 'scaled duration in: ' + a)
  }
})

test('the mirror pairs with the storyboard: one phase per scene, and it is deterministic', () => {
  const d = renderWireframe(LAY_BEFORE, LAY_AFTER, { behavior: COUNT })
  assert.equal(d.phases.length, COUNT.beats.length + 1, 'phases = given + one per beat')
  assert.ok(d.phases.every(p => typeof p === 'number' && p < 0), 'phases are negative animation-delays')
  assert.equal(renderWireframe(LAY_BEFORE, LAY_AFTER, { behavior: COUNT }).svg, d.svg, 'same input, byte-identical')
  // TWO frames were harvested, so a longer chain parks every later beat at the SAME after frame
  // rather than inventing motion nobody measured
  const three = b('g', 'a', 'b', 'c', 'd', 'e', 'f')
  const d3 = renderWireframe(LAY_BEFORE, LAY_AFTER, { behavior: three })
  assert.equal(d3.phases.length, 4)
  assert.equal(d3.phases[1], d3.phases[3])
})

test('a requirement with NO behavior block still mirrors — the drawing comes from the screen', () => {
  const d = renderWireframe(LAY_BEFORE, LAY_AFTER, {})
  assert.ok(d && d.phases.length === 2)
  // …and two such drawings must not collide: with no text there is only one text hash, so the
  // scope class carries the LAYOUT pin too
  const other = renderWireframe(LAY_AFTER, LAY_BEFORE, {})
  const cls = s => (s.match(/class="(vz[0-9a-f]+)"/) || [])[1]
  assert.ok(cls(d.svg) && cls(other.svg))
  assert.notEqual(cls(d.svg), cls(other.svg))
})

test('no usable layout → null, so the requirement falls back to the archetype kit', () => {
  assert.equal(renderWireframe(null, null, {}), null)
  assert.equal(renderWireframe({ w: 0, h: 0, els: [] }, null, {}), null)
  assert.equal(renderWireframe({ w: 1440, h: 900, els: [] }, { w: 1440, h: 900, els: [] }, {}), null)
})

test('harvested text is data: escaped, and never able to make the builder refuse the figure', () => {
  const hostile = {
    w: 400,
    h: 300,
    els: [{ x: 0, y: 0, w: 380, h: 40, kind: 'heading', text: '<img src=x onerror="alert(1)"> & "q"' }]
  }
  const d = renderWireframe(hostile, hostile, {})
  assert.ok(d, 'still draws — the text is data, not structure')
  assert.ok(!/<img/.test(d.svg), 'angle brackets never land raw')
  // renderSchematic refuses any svg carrying an on*= handler or a javascript:/data: href. An
  // ESCAPED label can still contain the literal substring ` onerror=`, which would drop the whole
  // figure — the drawing defuses it rather than losing itself to its own app's copy.
  assert.ok(!/\son\w+\s*=/i.test(d.svg), 'no on*= substring survives')
  assert.ok(renderSchematic({ viz: { svg: d.svg, phases: d.phases, hash: 'x', textHash: 'x', stale: false } }) !== '',
    'so the builder bakes it')
})

test('layoutHash pins the geometry — same layouts, same hash; a moved box moves it', () => {
  assert.equal(layoutHash(LAY_BEFORE, LAY_AFTER), layoutHash(LAY_BEFORE, LAY_AFTER))
  assert.notEqual(layoutHash(LAY_BEFORE, LAY_AFTER), layoutHash(LAY_AFTER, LAY_BEFORE))
  const moved = { ...LAY_AFTER, els: LAY_AFTER.els.map(e => ({ ...e, x: e.x + 8 })) }
  assert.notEqual(layoutHash(LAY_BEFORE, LAY_AFTER), layoutHash(LAY_BEFORE, moved))
})

// ── PER BEAT (2026-08-28): the board is becoming per-beat rows — Given, then one row per When→Then
// — so the harvest is per beat and the mirror draws ONE FRAME PER SCENE: the Given frame is beat
// 1's before, each beat's frame is that beat's after. A row and a frame are then the same thing.
const layAt = (n, text, focus) => ({
  w: 1440,
  h: 900,
  ring: focus ? { x: 1180, y: 96, w: 120, h: 48 } : null,
  els: [
    ...LAY_BEFORE.els.slice(0, 5),
    { x: 1180, y: 96, w: 120, h: 48, kind: 'text', text, ...(focus ? { focus: true } : {}) },
    { x: 24, y: 160 + 48 * n, w: 600, h: 40, kind: 'row' }
  ]
})
const TWO = b('a list with two items',
  'you add "Walk the dog"', 'the counter reads 3 to do',
  'you tick it off', 'the counter reads 2 to do')
const PAIRS = [
  { before: layAt(1, '2 to do', false), after: layAt(1, '3 to do', true) },
  { before: layAt(2, '3 to do', false), after: layAt(2, '2 to do', true) }
]

test('per-beat: one frame per scene — the given, then each beat\'s own after', () => {
  const d = renderWireframe(PAIRS, { behavior: TWO })
  assert.ok(d)
  assert.ok(d.svg.includes('data-viz-frames="3"'), 'given + two beats = three frames')
  assert.equal(d.phases.length, 3, 'and one phase per scene, so the storyboard pairs row-for-row')
  assert.equal(new Set(d.phases).size, 3, 'each scene parks on its OWN frame')
  for (const cls of ['class="wf0"', 'class="wf1"', 'class="wf2"']) assert.ok(d.svg.includes(cls), cls)
  // each beat's asserted value is drawn on its own frame — beat 1 ends at 3, beat 2 at 2
  assert.ok(d.svg.includes('>3 to do<') && d.svg.includes('>2 to do<'))
})

test('per-beat: a harvest that covered fewer beats than the prd lists parks the rest on the last measured frame', () => {
  // honest: two frames were measured, so beat 3 shows what beat 2 showed rather than inventing one
  const three = b('g', 'a', 'b', 'c', 'd', 'e', 'f')
  const d = renderWireframe(PAIRS, { behavior: three })
  assert.equal(d.phases.length, 4, 'the storyboard still pairs (given + three beats)')
  assert.equal(d.phases[2], d.phases[3], 'the unmeasured beat parks on the last measured frame')
  assert.notEqual(d.phases[1], d.phases[2])
})

test('per-beat: the layout pin covers every beat — a moved box in beat 2 moves the drawing', () => {
  const moved = [PAIRS[0], { before: PAIRS[1].before, after: layAt(2, '9 to do', true) }]
  assert.notEqual(layoutHash(PAIRS), layoutHash(moved))
  assert.notEqual(renderWireframe(PAIRS, { behavior: TWO }).svg, renderWireframe(moved, { behavior: TWO }).svg)
  assert.equal(renderWireframe(PAIRS, { behavior: TWO }).svg, renderWireframe(PAIRS, { behavior: TWO }).svg)
})

test('per-beat: a beat with nothing usable is skipped, and an empty harvest is still null', () => {
  assert.equal(renderWireframe([], { behavior: TWO }), null)
  assert.equal(renderWireframe([{ before: null, after: null }], { behavior: TWO }), null)
  const one = renderWireframe([{ before: null, after: layAt(1, '3 to do', true) }], { behavior: TWO })
  assert.ok(one && one.svg.includes('data-viz-frames="2"'), 'a beat with only its after still draws')
})

// ── THE BURN-IN'S OWN LANGUAGE (the human, 2026-08-28): a beat row shows the schematic cell beside
// the proof cell, and the two must read as ONE thing. The proof frame is a photograph of the app
// wearing the narration overlay (spec/_base.ts renderOverlay): a light dim, a ring on the proven
// element, and a tour card carrying the requirement's own When → Then. So the mirror's beat frames
// wear the same overlay, drawn: the same structure, the same wording, the same dye tokens.
const nest = (count, focus) => ({
  w: 1440,
  h: 900,
  ring: focus ? { x: 1150, y: 92, w: 150, h: 52 } : null,
  els: [
    ...LAY_BEFORE.els.slice(0, 5),
    // the counter AND the digit span inside it — the capture marks both, which once drew two value
    // pills stacked on one another ("6" over "6 to do") at the board's zoom
    { x: 1150, y: 92, w: 150, h: 52, kind: 'text', text: count + ' to do', ...(focus ? { focus: true } : {}) },
    { x: 1160, y: 104, w: 34, h: 28, kind: 'text', text: String(count), ...(focus ? { focus: true } : {}) }
  ]
})
const NESTED = [
  { before: nest(2, false), after: nest(3, true) },
  { before: nest(3, false), after: nest(2, true) }
]
const CARD = { behavior: TWO, id: 'R5', title: 'The remaining counter recounts', pass: true }
const frameOf = (svg, n) => {
  const i = svg.indexOf('<g class="wf' + n + '">')
  return i < 0 ? '' : svg.slice(i, svg.indexOf('</g>', i))
}

test('each beat frame wears the dim, the ring and the tour callout — in THAT beat\'s own words', () => {
  const d = renderWireframe(NESTED, CARD)
  const f1 = frameOf(d.svg, 1); const f2 = frameOf(d.svg, 2)
  for (const [f, n] of [[f1, 1], [f2, 2]]) {
    assert.ok(/fill="var\(--ink\)" opacity="0\.12"/.test(f), `frame ${n} dims the page around the proof`)
    assert.ok(/stroke="var\(--ai\)"/.test(f), `frame ${n} rings the proven element in indigo`)
    assert.ok(f.includes('>R5<'), `frame ${n} carries the R-id chip`)
    assert.ok(f.includes('>WHEN<') && f.includes('>THEN<'), `frame ${n} labels the beat like the burn-in`)
    assert.ok(/The remaining counter/.test(f), `frame ${n} carries the requirement title`)
  }
  // each frame says ITS OWN beat, exactly as the recording's callout did at that moment
  assert.ok(f1.includes('you add') && !f1.includes('you tick'), 'beat 1\'s When')
  assert.ok(f2.includes('you tick') && !f2.includes('you add'), 'beat 2\'s When')
  // the Then wraps across the card's lines, so pin the VALUE each beat settles on instead
  assert.ok(f1.includes('3 to do') && !f1.includes('2 to do'), 'beat 1 settles on 3')
  assert.ok(f2.includes('2 to do') && !f2.includes('3 to do'), 'beat 2 settles back on 2')
})

test('the given frame stays clean — no dim, no ring, no callout, because nothing was asserted yet', () => {
  const f0 = frameOf(renderWireframe(NESTED, CARD).svg, 0)
  assert.ok(!/opacity="0\.12"/.test(f0), 'no dim')
  assert.ok(!/stroke="var\(--ai\)"/.test(f0), 'no ring')
  assert.ok(!f0.includes('>WHEN<') && !f0.includes('>THEN<'), 'no callout')
  assert.ok(f0.includes('>2 to do<'), 'just the state it opens on, readable')
})

test('a counter and the span inside it draw ONE value, not two stacked (the overlap defect)', () => {
  const d = renderWireframe(NESTED, CARD)
  const f1 = frameOf(d.svg, 1)
  // the value PILL is the mono one; the card's Then says the same words in sans, which is not a
  // duplicate but the requirement quoting the app
  const pills = t => (t.match(/var\(--mono\)"[^>]*>[^<]*to do</g) || []).length
  assert.equal(pills(f1), 1, 'the ringed counter gets ONE pill, not one per nested element')
  assert.ok(!/>3</.test(f1), 'and its inner digit span is not drawn a second time on top')
  // the RING's own box decides which of the nest is the reading — not the tightest child
  assert.ok(/>3 to do</.test(f1), 'and the reading is the counter, not the bare digit inside it')
  assert.equal(pills(frameOf(d.svg, 0)), 1, 'the same pick runs on the given frame\'s ghosts')
})

test('the ✓ is drawn (never typed) and only when the requirement reads passed at derive time', () => {
  const pass = renderWireframe(NESTED, CARD)
  const plain = renderWireframe(NESTED, { ...CARD, pass: false })
  assert.ok(pass.svg.includes('stroke="var(--ok)"'), 'a passing requirement gets the koke check')
  assert.ok(!plain.svg.includes('stroke="var(--ok)"'), 'an unproven one gets no mark — never a fake green')
  assert.ok(!pass.svg.includes('✓'), 'drawn as a path: a missing glyph must never tofu the one unambiguous mark')
})

test('callout text is bounded: two lines a section, ellipsis rather than overflow', () => {
  const long = b('a screen',
    'you do something with a very long sentence that would run off the end of any callout card ever drawn here and keep going for a while yet',
    'it settles into a state described at equally exhausting length, well past anything a small card could ever hold on two lines of type')
  const d = renderWireframe(NESTED, { behavior: long, id: 'R1', title: 'A very long requirement title that cannot fit', pass: false })
  const f1 = frameOf(d.svg, 1)
  assert.ok(f1.includes('…'), 'the overrun is elided')
  // WHEN + THEN, at most two lines each, plus the label runs and the chip/title
  const whenish = (f1.match(/font-family="var\(--sans\)"/g) || []).length
  assert.ok(whenish <= 14, 'the card never grows extra lines to fit its text: ' + whenish)
})

test('the mirror stamps its renderer pin, so a kit change is legible on disk', () => {
  assert.ok(renderWireframe(NESTED, CARD).svg.includes('data-viz-kit="mirror-4"'))
})

// ── THE CAMERA (the human, 2026-08-28): the drawn callout was being CLIPPED. A beat cell does not
// show the whole drawing — it zooms onto the beat's focus rect by tools/board/stepper.js's
// cameraView, so the only thing that counts as "on screen" is that framed region. R5's counter sits
// at the page's right edge, the region is the right third of the page, and the card had been placed
// to the LEFT of it: cut mid-word. renderWireframe now computes the same region and refuses any
// placement — card OR notch — that falls outside it.
test('framedRegion is the cell\'s own region: padded, COVER-fit, centred, clamped, capped', () => {
  // a small target mid-page: the 2.75 pad wants far more magnification than the cap allows, so the
  // region is the frame divided by 2.2, centred on the focus
  const mid = framedRegion({ x: 280, y: 160, w: 40, h: 20 }, 600, 375)
  assert.equal(Math.round(mid.w), Math.round(600 / 2.2))
  assert.equal(Math.round(mid.h), Math.round(375 / 2.2))
  assert.ok(Math.abs((mid.x + mid.w / 2) - 300) < 0.01, 'centred on the focus')
  // …and it never leaves the frame: a target at the right edge pans, it never shows void
  const edge = framedRegion({ x: 540, y: 20, w: 55, h: 20 }, 600, 375)
  assert.ok(edge.x >= 0 && edge.x + edge.w <= 600.01 && edge.y >= 0 && edge.y + edge.h <= 375.01)
  assert.equal(Math.round(edge.x + edge.w), 600, 'clamped hard against the edge it sits on')
  // nothing to magnify → the whole frame, the camera's honest no-zoom answer
  assert.deepEqual(framedRegion({ x: 0, y: 0, w: 600, h: 375 }, 600, 375), { x: 0, y: 0, w: 600, h: 375 })
})

test('framedRegion COVERS: a wide short row zooms rather than refusing — and is no longer side-cropped', () => {
  // 820×48 of a 1440×900 page, in drawing units — the padded rect is wider than the frame, so a
  // contain-fit camera would have refused (scale 1, the whole page) and the row would have stayed a
  // hairline. Cover-fit takes the bigger ratio, which is what the cell does — and what the drawing
  // must place its callout inside.
  //
  // The EXPECTED NUMBER MOVED on 2026-08-29 (rule 4 — the code is the right side here). Cover used to
  // run to the 2.2 cap and crop this row's sides; the camera now also refuses to zoom past the scale
  // that still shows the whole FOCUS, because a beat's focus is the union of its rings and cropping
  // it hides a whole scene of the beat (the demo's R1 lost the typed Add box off the top). The
  // human's 2026-08-28 complaint was a camera that gave up and showed the full page — that is still
  // fixed: this row zooms 1.76×. What it no longer does is cut the ringed thing itself.
  const S = 600 / 1440
  const f = { x: 300 * S, y: 400 * S, w: 820 * S, h: 48 * S }
  const wide = framedRegion(f, 600, 375)
  assert.ok(wide.w < 600, 'it really does zoom: ' + wide.w)
  assert.equal(Math.round(wide.w), Math.round(f.w * 1.12), 'capped where the whole row still fits, with its margin')
  assert.ok(wide.w >= f.w - 0.01, 'the ringed row is never cut: ' + JSON.stringify(wide))
  assert.ok(wide.x >= 0 && wide.x + wide.w <= 600.01, 'and the region stays inside the frame')
})

// the R5 shape: the counter hard against the right edge, high up — the corner that left the card
// nowhere to go inside the framed region
const EDGE = focus => ({
  w: 1440,
  h: 900,
  ring: focus ? { x: 1290, y: 96, w: 130, h: 46 } : null,
  els: [
    ...LAY_BEFORE.els.slice(0, 5),
    { x: 1290, y: 96, w: 130, h: 46, kind: 'text', text: '3 to do', ...(focus ? { focus: true } : {}) }
  ]
})

test('the callout and its notch land INSIDE the framed region, even at the page\'s edge (R5)', () => {
  const d = renderWireframe([{ before: EDGE(false), after: EDGE(true) }], CARD)
  const f1 = frameOf(d.svg, 1)
  const S = 600 / 1440
  const H = Math.round(600 * (900 / 1440))
  const reg = framedRegion({ x: 1290 * S, y: 96 * S, w: 130 * S, h: 46 * S }, 600, H)
  assert.ok(reg.w < 600, 'the cell really is zoomed in on this one')
  const inside = (x, y) => x >= reg.x - 0.02 && x <= reg.x + reg.w + 0.02 &&
    y >= reg.y - 0.02 && y <= reg.y + reg.h + 0.02
  // the card: the one paper rect with the hairline border (the chip is fill:none, a hot pill is --ai)
  const cards = [...f1.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="[\d.]+" fill="var\(--paper\)" stroke="var\(--line2\)"/g)]
  assert.equal(cards.length, 1, 'one card is drawn')
  const [x, y, w, h] = cards[0].slice(1).map(Number)
  assert.ok(inside(x, y) && inside(x + w, y + h), `the whole card is framed: ${x},${y} ${w}x${h} in ${JSON.stringify(reg)}`)
  // …and the notch, whose tip reaches PAST the card edge toward the ring
  const tri = [...f1.matchAll(/<path d="M([-\d.]+) ([-\d.]+) L([-\d.]+) ([-\d.]+) L([-\d.]+) ([-\d.]+) Z"/g)]
  assert.equal(tri.length, 1, 'the notch is drawn — the card is attached, not floating')
  const p = tri[0].slice(1).map(Number)
  assert.ok(inside(p[0], p[1]) && inside(p[2], p[3]) && inside(p[4], p[5]), 'every corner of the notch is framed too')
})

// ── THE BURN-IN'S OWN PAGE GEOMETRY (the human, 2026-08-28). The drawn callout and the
// photographed one must be the SAME PICTURE. So the card is renderOverlay's 300 page pixels wide,
// converted by the ONE ratio the drawing already uses for every box it copies (drawingW ÷ page
// width) — never sized against the drawing, the focus rect or the camera. Both cells cover-fit at
// the same scale, so the two callouts then land at the same apparent size.
test('the card is the burn-in\'s 300 page pixels, scaled only by the page-to-drawing ratio', () => {
  const S = 600 / 1440
  const cardOf = svg => [...frameOf(svg, 1).matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="([\d.]+)" fill="var\(--paper\)" stroke="var\(--line2\)"/g)].map(m => m.slice(1).map(Number))[0]
  const edge = cardOf(renderWireframe([{ before: EDGE(false), after: EDGE(true) }], CARD).svg)
  assert.ok(Math.abs(edge[2] - 300 * S) < 0.15, `300px card at scale S: ${edge[2]} vs ${300 * S}`)
  assert.ok(Math.abs(edge[4] - 11 * S) < 0.15, `11px radius at scale S: ${edge[4]}`)
  // …and the SAME width whatever the focus rect is: a wide row's card is not a wider card
  const nested = cardOf(renderWireframe(NESTED, CARD).svg)
  assert.ok(Math.abs(nested[2] - edge[2]) < 0.15, 'the card never resizes itself to its target')
})

test('the card holds its true size wherever the region allows, and shrinks ONLY when it cannot fit', () => {
  const S = 600 / 1440
  const H = Math.round(600 * (900 / 1440))
  const card = svg => Number(/<rect x="[-\d.]+" y="[-\d.]+" width="([-\d.]+)"[^>]*fill="var\(--paper\)" stroke="var\(--line2\)"/.exec(frameOf(svg, 1))[1])
  assert.ok(Math.abs(card(renderWireframe([{ before: EDGE(false), after: EDGE(true) }], CARD).svg) - 300 * S) < 0.15,
    'the corner case still gets the full card')
  // a viewport so narrow that the framed region cannot hold 300px: the card shrinks rather than
  // hanging off the cell — an edge the owner takes over a clipped card
  const narrow = n => ({
    w: 420, h: 900, ring: n ? { x: 40, y: 300, w: 60, h: 30 } : null,
    els: [{ x: 0, y: 0, w: 420, h: 80, kind: 'container', text: '' },
      { x: 40, y: 300, w: 60, h: 30, kind: 'text', text: '3 to do', ...(n ? { focus: true } : {}) }]
  })
  const small = renderWireframe([{ before: narrow(false), after: narrow(true) }], CARD)
  const reg = framedRegion({ x: 40 * (600 / 420), y: 300 * (600 / 420), w: 60 * (600 / 420), h: 30 * (600 / 420) }, 600, Math.round(600 * (900 / 420)))
  const w = card(small.svg)
  assert.ok(w <= reg.w + 0.01, `the card fits the crop it has to live in: ${w} vs ${reg.w}`)
  assert.ok(w < 300 * (600 / 420), 'which means it shrank below the burn-in\'s own size')
})

test('the value is drawn INSIDE the ringed box when it reads there — a pill only when it cannot', () => {
  // the counter case: the app draws its value inside the counter, so the mirror does too
  const wide = renderWireframe([{ before: EDGE(false), after: EDGE(true) }], CARD)
  const f1 = frameOf(wide.svg, 1)
  assert.ok(/var\(--mono\)"[^>]*>3 to do</.test(f1), 'the value is drawn')
  assert.ok(!/rx="[\d.]+" fill="var\(--paper\)" stroke="var\(--ai\)"/.test(f1),
    'and needs no pill of its own — it sits inside the ring, like the screen it mirrors')
  // a box too small to read the value inside falls back to the pill rather than shrinking to dust
  const tiny = n => ({
    w: 1440,
    h: 900,
    ring: n ? { x: 700, y: 400, w: 26, h: 26 } : null,
    els: [...LAY_BEFORE.els.slice(0, 5), { x: 700, y: 400, w: 26, h: 26, kind: 'text', text: 'Overdue by 4 days', ...(n ? { focus: true } : {}) }]
  })
  const small = frameOf(renderWireframe([{ before: tiny(false), after: tiny(true) }], CARD).svg, 1)
  assert.ok(/rx="[\d.]+" fill="var\(--paper\)" stroke="var\(--ai\)"/.test(small), 'a pill carries what the box cannot')
})

// ── THE ENACTED BEAT (the human, 2026-08-29) ──────────────────────────────────────────────────
// A beat's drawing used to be ONE frame: the result. So the WHEN — "you type 'Water the plants' and
// press Add" — was nowhere in the picture, exactly as it was nowhere in the proof beside it (a box
// carrying what was typed is empty before the beat and cleared again after it). proveVisible now
// photographs and MEASURES every value it rings, so a beat arrives as scenes: the values it proved,
// in order, then its result. The drawing plays the same scenes, so the two halves of a row tell one
// story — and publishes its park points per beat (data-viz-subphases) so the board can step the
// drawing in lock-step with the proof's own loop.
const typedLay = (value, focus) => ({
  w: 1440,
  h: 900,
  ring: focus ? { x: 24, y: 96, w: 600, h: 44 } : null,
  els: [
    ...LAY_BEFORE.els.slice(0, 2),
    { x: 24, y: 96, w: 600, h: 44, kind: 'input', text: value, ...(focus ? { focus: true } : {}) },
    { x: 660, y: 96, w: 90, h: 36, kind: 'button', text: 'Add' },
    { x: 24, y: 160, w: 600, h: 40, kind: 'row' }
  ]
})
const rowLay = (title, focus) => ({
  w: 1440,
  h: 900,
  ring: focus ? { x: 24, y: 208, w: 600, h: 40 } : null,
  els: [
    ...LAY_BEFORE.els.slice(0, 2),
    { x: 24, y: 96, w: 600, h: 44, kind: 'input', text: 'What needs doing?' },
    { x: 660, y: 96, w: 90, h: 36, kind: 'button', text: 'Add' },
    { x: 24, y: 160, w: 600, h: 40, kind: 'row' },
    { x: 24, y: 208, w: 600, h: 40, kind: 'text', text: title, ...(focus ? { focus: true } : {}) }
  ]
})
const ADD = b('the list, the Add box empty',
  'you type "Water the plants" and press Add',
  'a new row appears at the bottom, stamped added just now')
const ENACTED = [{
  before: typedLay('What needs doing?', false),
  values: [typedLay('Water the plants', true), rowLay('Water the plants', true)],
  after: rowLay('added just now', true)
}]

test('enacted: a beat draws one frame per scene it proved — the When is IN the picture', () => {
  const d = renderWireframe(ENACTED, { behavior: ADD, id: 'R1', title: 'Adding a task' })
  assert.ok(d)
  // given + two proved values + the result
  assert.ok(d.svg.includes('data-viz-frames="4"'), 'four scenes were measured: ' + d.svg.slice(0, 400))
  assert.equal(d.phases.length, 2, 'the storyboard still pairs one park point per BEAT (given + 1)')
  const typed = frameOf(d.svg, 1)
  assert.ok(typed.includes('Water the plants'), 'the box carrying what was typed is drawn, with its own text')
})

test('enacted: the beat publishes its park points, one per scene, so the proof can drive it', () => {
  const d = renderWireframe(ENACTED, { behavior: ADD })
  const m = /data-viz-subphases="([^"]*)"/.exec(d.svg)
  assert.ok(m, 'the drawing says where each of its scenes parks')
  const groups = m[1].split('|').map(g => g.trim().split(/\s+/).map(Number))
  assert.equal(groups.length, 1, 'one group per beat')
  assert.equal(groups[0].length, 4, 'the beat opens where it started, then each value, then its result')
  assert.equal(groups[0][0], d.phases[0], 'it opens on the Given scene')
  assert.equal(groups[0][3], d.phases[1], 'and closes exactly where the beat parks')
})

test('enacted: an intermediate scene says the WHEN alone — the Then has not happened yet', () => {
  const d = renderWireframe(ENACTED, { behavior: ADD, id: 'R1', title: 'Adding a task', pass: true })
  const mid = frameOf(d.svg, 1); const last = frameOf(d.svg, 3)
  assert.ok(mid.includes('>WHEN<'), 'the action is called out')
  assert.ok(!mid.includes('>THEN<'), 'but not its result — nothing has been proven at this moment')
  assert.ok(last.includes('>WHEN<') && last.includes('>THEN<'), 'the beat\'s own frame carries both')
})

test('enacted: a beat with no values draws exactly as it did before — one frame, one scene', () => {
  const plain = renderWireframe(PAIRS, { behavior: TWO })
  const withEmpty = renderWireframe(PAIRS.map(p => ({ ...p, values: [] })), { behavior: TWO })
  assert.equal(withEmpty.svg, plain.svg, 'an empty value list changes nothing')
})

test('enacted: the timing stamp the harvest rides on is NOT part of the layout pin', () => {
  // `at` is a wall-clock offset that never repeats; hashing it would redraw every schematic on
  // every run and call the geometry changed when nothing moved
  const timed = ENACTED.map(p => ({ ...p, values: p.values.map((v, i) => ({ ...v, at: 400 + i * 111 })) }))
  assert.equal(layoutHash(timed), layoutHash(ENACTED))
  assert.equal(renderWireframe(timed, { behavior: ADD }).svg, renderWireframe(ENACTED, { behavior: ADD }).svg)
})

test('enacted: a ringed element with no text of its own falls back to the beat\'s own quoted words', () => {
  // the honest fallback: the requirement's OWN When names the string, so the drawing may say it —
  // in the quiet ink, because it was authored, not measured
  const blank = {
    w: 1440,
    h: 900,
    ring: { x: 24, y: 96, w: 600, h: 44 },
    els: [...LAY_BEFORE.els.slice(0, 2), { x: 24, y: 96, w: 600, h: 44, kind: 'input', text: '', focus: true }]
  }
  const d = renderWireframe([{ before: typedLay('', false), values: [blank], after: rowLay('added just now', true) }],
    { behavior: ADD })
  // the VALUE, in the mono the kit draws every read value in — not merely the words of the callout
  assert.match(frameOf(d.svg, 1), /var\(--mono\)"[^>]*>Water the plants</,
    'the quoted string from the When carries the scene')
})

// ── A TARGET TOO BIG TO PAD STILL ZOOMS (the human, 2026-08-29: "hard to read") ────────────────
// A beat's camera frames the UNION of its rings now, so the row can show the value the When typed
// AND the value the Then produced. The demo's R1 union is 39% of the page wide and 73% tall; padded
// 2.75× that exceeds the frame on both axes, and the pad rule then surrendered to the WHOLE page —
// two 0.39× screenshots of a 1440px app side by side, which is precisely the unreadable row this
// work exists to fix. A target too big to pad keeps a margin instead of the whole frame.
test('framedRegion: a big target keeps a margin rather than surrendering to the whole page', () => {
  const W = 600; const H = 375
  const S = W / 1440
  const union = { x: 312 * S, y: 126 * S, w: 562 * S, h: 655 * (H / 900) }
  const reg = framedRegion(union, W, H)
  assert.ok(reg.w < W * 0.85, 'it still zooms: ' + JSON.stringify(reg))
  assert.ok(reg.w >= union.w * 0.99, 'and the target still fits across it: ' + JSON.stringify(reg))
  // a SMALL target is untouched — the generous 2.75 pad is what makes a 30px chip readable in context
  const small = framedRegion({ x: 280, y: 160, w: 40, h: 20 }, W, H)
  assert.ok(Math.abs(small.w - W / 2.2) < 0.01, 'the cap still governs a small target: ' + JSON.stringify(small))
})

// the SAME rule on the board's side of the mirror — tools/board/stepper.js cameraView and this
// module's framedRegion are two implementations of one camera, and a row is only a comparison while
// they agree. (Nothing unit-tested cameraView before; a divergence here is invisible until a reader
// shows two different crops.)
test('cameraView agrees with framedRegion — the same region, in cell pixels', async () => {
  await import('./board/stepper.js')
  const cam = globalThis.SBStepper
  const focus = { x: 312, y: 126, w: 562, h: 655, vw: 1440, vh: 900 }
  const cell = { w: 560, h: 350 }
  const view = cam.cameraView(focus, cell, { maxScale: 2.2, minFrac: 0.38 })
  assert.ok(view.ok && view.scale > 1.2, 'the board zooms the big union too: ' + JSON.stringify(view))
  // framedRegion, in page units, must frame the same width the board's transform shows
  const reg = framedRegion(focus, 1440, 900)
  assert.ok(Math.abs(reg.w - (1440 / view.scale)) < 1,
    'same framed width: ' + reg.w + ' vs ' + (1440 / view.scale))
})

// ── NEVER CROP THE THING YOU ARE POINTING AT (the human, 2026-08-29) ──────────────────────────
// Cover-fit magnifies on whichever axis needs it and crops the other — the right rule for a small
// target read in context (their 2026-08-28 call, kept). But a beat's camera now frames the UNION of
// its rings, and covering a union taller than the cell crops the beat's FIRST scene straight out of
// the row: for the demo's R1 the typed Add box sat above the crop, so "the When is visible in both
// cells" was still false at the zoom. Cover, then cap at the largest scale that still shows the
// whole focus. Small targets are unaffected — maxScale bites long before this does.
test('framedRegion never crops the focus it frames', () => {
  const W = 600; const H = 375
  const union = { x: 130, y: 52, w: 234, h: 273 }        // R1's union, in drawing units
  const reg = framedRegion(union, W, H)
  assert.ok(reg.h >= union.h - 0.01, 'the whole beat is in frame: ' + JSON.stringify(reg))
  assert.ok(reg.w >= union.w - 0.01)
  assert.ok(reg.w < W, 'and it still zooms')
  // a small chip is governed by the cap, exactly as before
  const chip = framedRegion({ x: 280, y: 160, w: 40, h: 20 }, W, H)
  assert.ok(Math.abs(chip.w - W / 2.2) < 0.01, JSON.stringify(chip))
})

test('cameraView never crops the focus either — one camera, one rule', async () => {
  await import('./board/stepper.js')
  const cam = globalThis.SBStepper
  const focus = { x: 312, y: 126, w: 562, h: 655, vw: 1440, vh: 900 }
  const cell = { w: 570, h: 390 }
  const v = cam.cameraView(focus, cell, { maxScale: 2.2, minFrac: 0.38 })
  assert.ok(v.ok && v.scale > 1, 'it zooms: ' + JSON.stringify(v))
  // the framed page rectangle, back out of the transform: everything of the focus must be inside it
  const r = cell.w / focus.vw
  const fw = cell.w / (r * v.scale); const fh = cell.h / (r * v.scale)
  assert.ok(fw >= focus.w - 0.5 && fh >= focus.h - 0.5,
    'the whole focus fits the framed region: ' + fw + '×' + fh + ' vs ' + focus.w + '×' + focus.h)
})

// ── THE VALUE SITS WHERE THE PAGE PUTS IT (the human, 2026-08-29) ─────────────────────────────
// "not perfectly comparable — the input box of add task is in a different place." Measured, the
// BOXES already agree: the drawn ring and the photographed one land within 0.3% of the cell on
// every requirement of the demo board. What did not agree was the one thing inside the box the
// reader is being asked to compare — the ASSERTED VALUE. The kit typed it centred, at a size taken
// from the ring box's own HEIGHT (h·0.62), which is right for a text leaf (its box IS its line) and
// wrong for a FIELD: a 47px-tall Add input drew "Water the plants" mid-box at ~2.5× the type the
// app renders, while every other text in the same drawing sat left-aligned at the app's own size.
// So the harvest now measures the ringed element's own type — font-size, alignment and the text's
// inset — and the drawing uses it. Nothing here is guessed: a skeleton that carries no measurement
// keeps the old centred fallback, which is all an older harvest can honestly support.
const FIELD = focus => ({
  w: 1440,
  h: 900,
  ring: focus ? { x: 312, y: 126, w: 452, h: 47 } : null,
  els: [
    { x: 0, y: 0, w: 1440, h: 64, kind: 'container' },
    { x: 270, y: 125, w: 740, h: 49, kind: 'container' },
    {
      x: 312, y: 126, w: 452, h: 47, kind: 'input', text: 'Water the plants',
      fs: 15, ta: 'l', pl: 13, ...(focus ? { focus: true } : {})
    }
  ]
})
const S1440 = 600 / 1440
const valueOf = (svg, n, txt) => {
  const f = frameOf(svg, n)
  const re = new RegExp('<text x="([-\\d.]+)" y="([-\\d.]+)" font-size="([\\d.]+)"[^>]*>' + txt + '<')
  const m = re.exec(f)
  return m ? { x: +m[1], y: +m[2], fs: +m[3], anchored: /text-anchor="middle"/.test(re.exec(f) ? f.slice(f.indexOf(m[0]), f.indexOf(m[0]) + m[0].length) : '') } : null
}

test('the asserted value is drawn at the PAGE\'s own type — measured size, measured alignment', () => {
  const d = renderWireframe(FIELD(false), FIELD(true), { behavior: b('the Add box empty', 'you type "Water the plants"', 'the box carries it') })
  const v = valueOf(d.svg, 1, 'Water the plants')
  assert.ok(v, 'the value the assertion read is on the drawing')
  // the app draws it at 15px, inset 13px from the field's left edge — one uniform scale converts both
  assert.ok(Math.abs(v.fs - 15 * S1440) < 0.11, 'the app\'s own type size, not the box\'s height: ' + v.fs)
  assert.ok(Math.abs(v.x - (312 + 13) * S1440) < 0.11, 'left-aligned where the field starts its text: ' + v.x)
  assert.ok(!v.anchored, 'a left-aligned field is never centred')
})

test('a centred element stays centred, and an unmeasured harvest keeps the old fallback', () => {
  const centred = JSON.parse(JSON.stringify(FIELD(true)))
  centred.els[2].ta = 'c'
  const dc = renderWireframe(FIELD(false), centred, {})
  const vc = valueOf(dc.svg, 1, 'Water the plants')
  assert.ok(vc && Math.abs(vc.x - (312 + 452 / 2) * S1440) < 0.11, 'centred means the box\'s middle: ' + (vc && vc.x))
  assert.ok(vc.anchored, 'and it carries the middle anchor')
  // an OLD skeleton measured no type at all — it must still draw, exactly as it did before
  const bare = JSON.parse(JSON.stringify(FIELD(true)))
  delete bare.els[2].fs; delete bare.els[2].ta; delete bare.els[2].pl
  const db = renderWireframe(FIELD(false), bare, {})
  const vb = valueOf(db.svg, 1, 'Water the plants')
  assert.ok(vb && vb.anchored, 'no measurement, no invention: the old centred mark stands')
})

test('every measured box lands at its measured fraction of the page — the drawing IS the layout', () => {
  const d = renderWireframe(FIELD(false), FIELD(true), {})
  const f1 = frameOf(d.svg, 1)
  // the ring the burn-in paints: inset 4 + half its 2px stroke around the measured box
  const m = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="[\d.]+" fill="none" stroke="var\(--ai\)" stroke-width="([\d.]+)"\/>/g
  const rings = [...f1.matchAll(m)]
  assert.ok(rings.length, 'the proven element is ringed')
  const inner = rings[rings.length - 1]
  const o = 5 * S1440
  assert.ok(Math.abs((+inner[1] + o) / 600 - 312 / 1440) < 0.002, 'x holds its fraction of the page')
  assert.ok(Math.abs((+inner[3] - 2 * o) / 600 - 452 / 1440) < 0.002, 'and so does the width')
})

test('a small measured chip keeps its value INSIDE its box — the pill is the last resort, not the first', () => {
  // R7's overdue chip: 66×23 with 10px of padding each side, its type 11.5px. Measured type must not
  // push a value that the PAGE fits comfortably out into a pill beside the box — that is exactly the
  // value "in a different place" this pass exists to stop. (Caught by re-auditing the demo board
  // after the first cut of the fix: R7 alone jumped, because the room calculation was subtracting a
  // breathing margin the page itself does not reserve.)
  const chip = focus => ({
    w: 1440,
    h: 900,
    ring: focus ? { x: 808, y: 504, w: 66, h: 23 } : null,
    els: [
      { x: 0, y: 0, w: 1440, h: 64, kind: 'container' },
      { x: 270, y: 480, w: 740, h: 70, kind: 'row' },
      { x: 808, y: 504, w: 66, h: 23, kind: 'text', text: 'overdue', fs: 11.5, ta: 'l', pl: 10, pr: 10, ...(focus ? { focus: true } : {}) }
    ]
  })
  const f1 = frameOf(renderWireframe(chip(false), chip(true), {}).svg, 1)
  const m = /<text x="([-\d.]+)" y="[-\d.]+" font-size="([\d.]+)"[^>]*>overdue</.exec(f1)
  assert.ok(m, 'the chip\'s value is drawn')
  const S = 600 / 1440
  assert.ok(+m[1] >= (808 + 10) * S - 0.2 && +m[1] <= (808 + 10) * S + 0.2,
    'it starts where the page starts it, inside the chip: ' + m[1])
  // the pill is a rounded plate with its own paper fill — a value that fits its box never gets one
  assert.ok(!/rx="[\d.]+" fill="var\(--paper\)" stroke="var\(--ai\)"/.test(f1), 'no pill: the value sits in the chip')
  assert.ok(+m[2] >= 4, 'and it is still legible: ' + m[2])
})
