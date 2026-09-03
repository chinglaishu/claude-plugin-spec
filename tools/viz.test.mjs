// tools/viz.test.mjs — the drawn schematic (requirement schematics spec 2026-08-18, task 4).
// Pure red-first units: a behavior chain maps DETERMINISTICALLY to an archetype and from there to a
// house-style animated SVG — no model, no fs, no browser. The no-match → null contract is the
// honesty rule: a requirement the kit cannot draw stays text-only, never a wrong picture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vizHash, vizStale, matchArchetype, deriveSchematic, renderWireframe, layoutHash, framedRegion, mirrorGaps, gapSummary, pictureFor } from './viz.mjs'
// the ONE overlay geometry — the drawing has to agree with the burn-in, so the pins ask the module
// both of them read rather than restating numbers here
import { RING, CARD as GEO, ringRect, ringOuter, calloutSpot } from './overlay-geometry.mjs'
import { calloutText, sceneDone, calloutLines } from './callout-text.mjs'
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
import { existsSync, readFileSync } from 'node:fs'
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
  // …and the builder refuses it — but for a reason that has nothing to do with the text (2026-09-03,
  // rule 4). This leg used to assert `renderSchematic(...) !== ''`, i.e. that an escaped label does
  // not cost the figure its place on the board. The human's Expected View decision retired the drawn
  // ui-mirror: no WIREFRAME is baked any more, whatever it carries, so the old leg was asserting a
  // behaviour the decision removed. The claim it was really making — an escaped label is data, never
  // structure — is proven by the three assertions above and, below, on the picture the board DOES
  // bake: an archetype sketch carrying the same hostile text.
  assert.equal(renderSchematic({ viz: { svg: d.svg, phases: d.phases, hash: 'x', textHash: 'x', stale: false } }), '',
    'a wireframe is never baked — the Expected picture is the replica now (board R18)')
  const sketch = deriveSchematic({
    given: 'a page with <img src=x onerror="alert(1)"> & "q" on it',
    beats: [{ when: 'you open it', then: 'the label reads <img src=x onerror="alert(1)"> & "q"' }]
  })
  if (sketch) {
    assert.ok(!/<img/.test(sketch.svg), 'the sketch escapes it too')
    assert.ok(!/\son\w+\s*=/i.test(sketch.svg), '…and defuses the on*= substring')
    assert.ok(renderSchematic({ viz: { svg: sketch.svg, phases: sketch.phases, hash: 'x', textHash: 'x', stale: false } }) !== '',
      'so the builder still bakes the picture it does bake')
  }
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
// …balanced, since mirror-8: a measured opacity (a disabled control, a faded done row) draws its
// element inside its own <g>, so slicing at the FIRST </g> would cut the frame off mid-page.
const frameOf = (svg, n) => {
  const i = svg.indexOf('<g class="wf' + n + '">')
  if (i < 0) return ''
  const re = /<g\b|<\/g>/g
  re.lastIndex = i
  let depth = 0; let m
  while ((m = re.exec(svg))) {
    depth += m[0] === '</g>' ? -1 : 1
    if (depth === 0) return svg.slice(i, m.index)
  }
  return svg.slice(i)
}

// REWRITTEN 2026-08-30 (rule 4 — the human decided the card, so this test was the wrong side): a
// callout is the id chip and ONE SENTENCE, the line the scene proves. These two frames are each
// their beat's RESTING scene (NESTED harvests no mid-beat values), so each says its own THEN alone —
// no title, no When stacked under it.
test('each beat frame wears the dim, the ring and the tour callout — in THAT beat\'s own words', () => {
  const d = renderWireframe(NESTED, CARD)
  const f1 = frameOf(d.svg, 1); const f2 = frameOf(d.svg, 2)
  for (const [f, n] of [[f1, 1], [f2, 2]]) {
    assert.ok(/fill="var\(--ink\)" opacity="0\.12"/.test(f), `frame ${n} dims the page around the proof`)
    assert.ok(/stroke="var\(--ai\)"/.test(f), `frame ${n} rings the proven element in indigo`)
    assert.ok(f.includes('>R5<'), `frame ${n} carries the R-id chip`)
    assert.ok(f.includes('>THEN<'), `frame ${n} is the beat at rest, so it says the Then`)
    assert.ok(!f.includes('>WHEN<'), `frame ${n} never stacks the other line under it`)
    assert.ok(!/The remaining counter/.test(f), `frame ${n} carries no requirement title — the chip is the tag`)
  }
  // each frame says ITS OWN beat, exactly as the recording's callout did at that moment
  assert.ok(!f1.includes('you add') && !f1.includes('you tick'), 'a resting scene carries no When at all')
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

// ── THE DRAWN CARD SHOWS THE SAME FULL SENTENCE AS THE BURN (the human, 2026-08-30/31) ────────────
// The drawing capped its callout at two lines with an ellipsis while the burn-in wrapped the whole
// sentence — demo R2's THEN read "…its stamp flips to…" on the schematic and three full lines on the
// proof. The wrap is now one shared rule (tools/callout-text.mjs calloutLines) that BOTH sides
// consume, so the drawing must render exactly its lines, uncut. Red-first: the old two-line cap never
// reaches "edited just now".
const LONG_THEN = 'the same row reads the new text in place and its stamp flips to edited just now'
const LONG_LAY = focus => ({
  w: 1440, h: 900,
  ring: focus ? { x: 321, y: 300, w: 553, h: 22 } : null,   // a wide row mid-page: the card has room below
  els: [
    { x: 0, y: 0, w: 1440, h: 64, kind: 'container' },
    { x: 321, y: 300, w: 553, h: 22, kind: 'text', text: 'edited just now', ...(focus ? { focus: true } : {}) }
  ]
})
test('the drawn callout renders the WHOLE sentence, wrapped by the shared rule — no two-line ellipsis', () => {
  const meta = { behavior: b('a task row stamped added', 'you double-click its title, retype it and press Enter', LONG_THEN), id: 'R2', pass: true }
  const d = renderWireframe([{ before: LONG_LAY(false), after: LONG_LAY(true) }], meta)
  const f1 = frameOf(d.svg, 1)
  const lines = calloutLines(LONG_THEN)
  assert.ok(lines.length >= 3, 'the fixture Then really does wrap past two lines: ' + lines.length)
  // every shared line is drawn, verbatim — the card is not truncated to two
  for (const ln of lines) assert.ok(f1.includes('>' + ln + '<'), 'the drawn card shows line "' + ln + '"')
  // …and the tell-tale of the old cap is gone: the last words are reached, with no ellipsis in the card
  assert.ok(f1.includes('>edited just now<'), 'the sentence reaches its end, uncut')
  assert.ok(!f1.includes('…'), 'no ellipsis — the drawing shows the same words the burn does')
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

// REWRITTEN 2026-08-31 (rule 4/6 — the human removed the two-line ellipsis cap, so THIS test was the
// outdated side). The card no longer truncates: it wraps the WHOLE sentence to as many lines as it
// needs, by the shared calloutLines the burn-in uses too, and the camera frames the union of the
// ring and the taller card. So a long Then grows PAST two lines, loses no word, and shows no ellipsis
// — the drawn card says exactly what the burned one says.
test('callout text is not truncated: the whole sentence wraps to as many lines as it needs', () => {
  const longThen = 'it settles into a state described at equally exhausting length well past anything a small card could ever hold on two lines of type'
  const long = b('a screen',
    'you do something with a very long sentence that would run off the end of any callout card ever drawn here and keep going for a while yet',
    longThen)
  const d = renderWireframe(NESTED, { behavior: long, id: 'R1', title: 'A very long requirement title that cannot fit', pass: false })
  const f1 = frameOf(d.svg, 1)                              // a resting scene → the THEN
  const lines = calloutLines(longThen)
  assert.ok(lines.length > 2, 'a long Then grows past two lines: ' + lines.length)
  for (const ln of lines) assert.ok(f1.includes('>' + ln + '<'), 'the whole sentence is drawn — line "' + ln + '"')
  assert.ok(!f1.includes('…'), 'no ellipsis — the drawing shows every word, like the burn')
})

test('the mirror stamps its renderer pin, so a kit change is legible on disk', () => {
  // Updated 2026-09-02 (rule 4 — the RENDERER moved, so this pin was correctly broken by it):
  // mirror-12 is THE INTENT ON A FAILED SCENE — the ringed value drawn as the requirement's own
  // expected one where the app failed it, so the drawing stays the truth the human can disagree
  // with. mirror-11 was THE SHAPE'S OWN COLOUR and A TICK YOU CAN SEE; mirror-10 was THE ICON — a small
  // inline svg drawn as its own shapes, and no plate under the wordless unpainted button holding
  // it. mirror-9 was the RINGED THING ITSELF, mirror-8 COLOUR AND STATE, mirror-7 the page's own
  // TYPE, mirror-6 the card as one sentence, mirror-5 the shared geometry.
  assert.ok(renderWireframe(NESTED, CARD).svg.includes('data-viz-kit="mirror-13"'))
})

// ── THE CAMERA (the human, 2026-08-28): the drawn callout was being CLIPPED. A beat cell does not
// show the whole drawing — it zooms onto the beat's focus rect by tools/board/stepper.js's
// cameraView, so the only thing that counts as "on screen" is that framed region. R5's counter sits
// at the page's right edge, the region is the right third of the page, and the card had been placed
// to the LEFT of it: cut mid-word. renderWireframe now computes the same region and refuses any
// placement — card OR notch — that falls outside it.
test('framedRegion is the cell\'s own region: padded, COVER-fit, centred, clamped, capped', () => {
  // a small target mid-page: covering the cell with it wants far more magnification than the cap
  // allows, so the region is the frame divided by the cap, centred on the focus. (Rule 4,
  // 2026-08-31: the cap moved 2.2 → 3.2 on the human's "more aggressive zoom" — the number is the
  // decision, not the maths.)
  const mid = framedRegion({ x: 280, y: 160, w: 40, h: 20 }, 600, 375)
  assert.equal(Math.round(mid.w), Math.round(600 / 3.2))
  assert.equal(Math.round(mid.h), Math.round(375 / 3.2))
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
// photographed one must be the SAME PICTURE. So the card is renderOverlay's CARD.width page pixels wide,
// converted by the ONE ratio the drawing already uses for every box it copies (drawingW ÷ page
// width) — never sized against the drawing, the focus rect or the camera. Both cells cover-fit at
// the same scale, so the two callouts then land at the same apparent size.
test('the card is the burn-in\'s CARD.width page pixels, scaled only by the page-to-drawing ratio', () => {
  const S = 600 / 1440
  const cardOf = svg => [...frameOf(svg, 1).matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="([\d.]+)" fill="var\(--paper\)" stroke="var\(--line2\)"/g)].map(m => m.slice(1).map(Number))[0]
  const edge = cardOf(renderWireframe([{ before: EDGE(false), after: EDGE(true) }], CARD).svg)
  assert.ok(Math.abs(edge[2] - GEO.width * S) < 0.15, `${GEO.width}px card at scale S: ${edge[2]} vs ${GEO.width * S}`)
  assert.ok(Math.abs(edge[4] - GEO.radius * S) < 0.15, `${GEO.radius}px radius at scale S: ${edge[4]}`)
  // …and the SAME width whatever the focus rect is: a wide row's card is not a wider card
  const nested = cardOf(renderWireframe(NESTED, CARD).svg)
  assert.ok(Math.abs(nested[2] - edge[2]) < 0.15, 'the card never resizes itself to its target')
})

// ── ONE GEOMETRY, NOT TWO COPIES OF IT (2026-08-30) ──────────────────────────────────────────
// The audit that bought this: for the demo's R1 beat cells the DRAWN ring measured ~12 page px out
// from the element box where the BURNED one is ~5 — the drawing rendered the burn-in's blurred
// `0 0 16px` glow as a hard 8px band centred 11.5px out, and on a thin target (a row title, an
// "added just now" stamp) that band read as a ring twice the photographed one's height. The ring's
// inset and the callout's placement now come from tools/overlay-geometry.mjs, which is what
// renderOverlay reads them from too, so the two can only ever agree.
test('the drawn ring IS the burn-in\'s ring: box + the shared inset, and no hard mark past the halo', () => {
  const S = 600 / 1440
  const box = { x: 1150, y: 92, w: 150, h: 52 }              // nest()'s ringed counter
  const f1 = frameOf(renderWireframe(NESTED, CARD).svg, 1)
  const rects = [...f1.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"([^>]*)\/>/g)]
    .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], attr: m[5] }))
  const ai = rects.filter(r => /stroke="var\(--ai\)"/.test(r.attr) && /fill="none"/.test(r.attr))
  assert.equal(ai.length, 1, 'exactly ONE indigo ring stroke per ringed box — no second band beyond it')
  // …and it is drawn on ringRect: the border's centreline, box ± (inset + stroke/2)
  const want = ringRect(box)
  for (const k of ['x', 'y', 'w', 'h']) {
    const got = ai[0][k]
    assert.ok(Math.abs(got - want[k] * S) < 0.11, `ring ${k}: ${got} vs box+inset ${want[k] * S}`)
  }
  assert.ok(Math.abs(Number(/stroke-width="([\d.]+)"/.exec(ai[0].attr)[1]) - RING.stroke * S) < 0.06,
    'and at the burn-in\'s own 2px stroke')
  // the last hard mark is the paper halo, exactly where the box-shadow's 3px spread ends
  const halo = rects.filter(r => /stroke="var\(--paper\)"/.test(r.attr) && /fill="none"/.test(r.attr))[0]
  const out = ringOuter(box)
  const hw = Number(/stroke-width="([\d.]+)"/.exec(halo.attr)[1])
  assert.ok(Math.abs((halo.x - hw / 2) - out.x * S) < 0.11, `halo outer edge: ${halo.x - hw / 2} vs ${out.x * S}`)
  // nothing the overlay draws reaches past it — the band the audit measured is gone for good
  const edge = out.x * S - 0.12
  for (const r of ai.concat([halo])) assert.ok(r.x - hw / 2 >= edge, 'no overlay mark outside the halo')
})

// The placement rule is the SAME rule now — calloutSpot, the one renderOverlay places by — with one
// refusal layered on that the burn-in does not need: a candidate must also lie inside the camera's
// framed region, because that is all a beat cell shows. So the drawn card takes calloutSpot's side
// whenever the region allows it, and otherwise falls back through calloutSpot's own order rather
// than a parallel one. (The input that can still part them is the card's HEIGHT: the burn-in
// measures its DOM card, the drawing estimates from its wrapped lines and says the When alone
// mid-beat. Where the two heights change which candidate fits the VIEWPORT, only the region refusal
// keeps the sides together — the honest cure is harvesting the burn-in's card rect, which changes
// what a run records.)
test('the drawn callout takes the side calloutSpot names, and falls back through its order when the cell cannot hold it', () => {
  const S = 600 / 1440
  const sideOf = (svg, box, n = 1) => {
    const f = frameOf(svg, n)
    const c = [...f.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="[\d.]+" fill="var\(--paper\)" stroke="var\(--line2\)"/g)]
      .map(m => m.slice(1).map(Number)).pop()
    const [x, y, w, h] = c
    if (y >= (box.y + box.h) * S) return 'below'
    if (y + h <= box.y * S) return 'above'
    return x >= (box.x + box.w) * S ? 'right' : 'leftof'
  }
  const cardH = (svg, n = 1) => Number([...frameOf(svg, n).matchAll(/<rect x="[-\d.]+" y="[-\d.]+" width="[-\d.]+" height="([-\d.]+)" rx="[\d.]+" fill="var\(--paper\)" stroke="var\(--line2\)"/g)].pop()[1])
  for (const [name, box, layouts] of [
    ['the counter, high on the page', { x: 1150, y: 92, w: 150, h: 52 }, NESTED],
    ['the counter hard against the edge', { x: 1290, y: 96, w: 130, h: 46 }, [{ before: EDGE(false), after: EDGE(true) }]]
  ]) {
    const svg = renderWireframe(layouts, CARD).svg
    const want = calloutSpot({ box, vw: 1440, vh: 900, cw: GEO.width, ch: cardH(svg) / S })
    assert.equal(sideOf(svg, box), want.side === 'left' ? 'leftof' : want.side,
      name + ': the drawn card must sit where the burn-in put it')
  }
  // …and the demo R1 shape that used to force the fallback: a row near the foot of a long page,
  // proved after a box typed at the top of it.
  //
  // (Rule 4, 2026-08-31 — the CODE is the right side here. This leg used to expect ABOVE: the beat's
  // camera framed the UNION of its rings, the region's bottom edge fell above the page's own foot,
  // and the drawing had to refuse calloutSpot's BELOW. The camera is now aimed at the SCENE, so the
  // region is centred on this very ring and there is room under it — the drawing and the burn-in
  // agree, which is what this test wants whenever it can be had. The refusal itself is unchanged and
  // still proven where it still fires: a region too NARROW to hold the card, below.)
  const foot = n => ({
    w: 1440,
    h: 900,
    ring: n ? { x: 321, y: 764, w: 553, h: 17 } : null,
    els: [...LAY_BEFORE.els.slice(0, 5),
      { x: 321, y: 764, w: 553, h: 17, kind: 'text', text: 'added just now', ...(n ? { focus: true } : {}) }]
  })
  // the beat's camera is the UNION of its rings, so a beat that proved the Add box at the top and
  // the new row at the foot frames nearly the whole page — and the card cannot go below the foot row
  const top = n => ({
    w: 1440,
    h: 900,
    ring: n ? { x: 312, y: 126, w: 452, h: 46 } : null,
    els: [...LAY_BEFORE.els.slice(0, 5),
      { x: 312, y: 126, w: 452, h: 46, kind: 'input', text: 'Water the plants', ...(n ? { focus: true } : {}) }]
  })
  const low = renderWireframe([{ before: foot(false), after: foot(true), values: [top(true), foot(true)] }], CARD).svg
  const lbox = { x: 321, y: 764, w: 553, h: 17 }
  assert.equal(calloutSpot({ box: lbox, vw: 1440, vh: 900, cw: GEO.width, ch: cardH(low, 3) / S }).side, 'below',
    'the burn-in rule, given this short a card, would go below')
  assert.equal(sideOf(low, lbox, 3), 'below',
    'and the scene-aimed cell can hold it there, so the drawing says the same')
  // …and wherever it lands, it lands INSIDE the region the cell shows — the refusal's real contract
  const H375 = Math.round(600 * (900 / 1440))
  const reg = framedRegion(
    { x: 312 * S, y: 126 * S, w: 562 * S, h: 655 * S }, 600, H375,
    { aim: { x: lbox.x * S, y: lbox.y * S, w: lbox.w * S, h: lbox.h * S } })
  const c3 = [...frameOf(low, 3).matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="[\d.]+" fill="var\(--paper\)" stroke="var\(--line2\)"/g)]
    .map(m => m.slice(1).map(Number)).pop()
  assert.ok(c3[0] >= reg.x - 0.02 && c3[1] >= reg.y - 0.02 &&
    c3[0] + c3[2] <= reg.x + reg.w + 0.02 && c3[1] + c3[3] <= reg.y + reg.h + 0.02,
  'the whole card is inside the framed region: ' + JSON.stringify(c3) + ' in ' + JSON.stringify(reg))
})

// REWRITTEN 2026-09-01 (rule 4 — the human's decision is the reason): the region no longer crops
// the card down to the RING's own tight crop. Since the camera frames the union of the ring and its
// CARD (the human, 2026-08-30: never crop the explaining text box), the region EXPANDS to hold the
// full-size card wherever the frame can afford it — the old "shrink to fit the ring's region" was
// exactly the behaviour that clipped, and is gone. The card now shrinks ONLY when the whole FRAME is
// narrower than the card (CARD.width), which is the one case the region cannot widen its way out of.
test('the card holds its true size wherever the region allows, and shrinks ONLY when the frame itself cannot hold it', () => {
  const S = 600 / 1440
  const card = svg => Number(/<rect x="[-\d.]+" y="[-\d.]+" width="([-\d.]+)"[^>]*fill="var\(--paper\)" stroke="var\(--line2\)"/.exec(frameOf(svg, 1))[1])
  assert.ok(Math.abs(card(renderWireframe([{ before: EDGE(false), after: EDGE(true) }], CARD).svg) - GEO.width * S) < 0.15,
    'the corner case still gets the full card')
  // a SMALL ring in a roomy page: the tight ring-only crop used to shrink the card; now the region
  // widens to hold it, so it stays the burn-in's own 300 page pixels — never clipped, never shrunk
  const roomy = n => ({
    w: 1440, h: 900, ring: n ? { x: 620, y: 420, w: 60, h: 30 } : null,
    els: [{ x: 0, y: 0, w: 1440, h: 80, kind: 'container', text: '' },
      { x: 620, y: 420, w: 60, h: 30, kind: 'text', text: '3 to do', ...(n ? { focus: true } : {}) }]
  })
  const big = renderWireframe([{ before: roomy(false), after: roomy(true) }], CARD)
  assert.ok(Math.abs(card(big.svg) - GEO.width * S) < 0.15,
    'a small ring no longer forces the card to shrink — the region holds it at full size: ' + card(big.svg))
  // a viewport NARROWER than the CARD.width card itself: no region can widen past the frame, so here the
  // card shrinks rather than hanging off the cell — an edge the owner takes over a clipped card
  const narrow = n => ({
    w: 250, h: 900, ring: n ? { x: 40, y: 300, w: 60, h: 30 } : null,
    els: [{ x: 0, y: 0, w: 250, h: 80, kind: 'container', text: '' },
      { x: 40, y: 300, w: 60, h: 30, kind: 'text', text: '3 to do', ...(n ? { focus: true } : {}) }]
  })
  const small = renderWireframe([{ before: narrow(false), after: narrow(true) }], CARD)
  const w = card(small.svg)
  assert.ok(w < 250 * (600 / 250), 'a frame narrower than the card shrinks it below the burn-in size: ' + w)
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

// THE FIRST SCENE IS THE WHEN, NOT THE GIVEN (the human, 2026-08-31: "first screen in when/then
// should already have the 'when' action started — instead of just same as given, it will be
// redundant"). A beat that PROVED values opens on the first of them: the opening state it shares
// with the Given row above (or with the previous beat's result) is dropped from the shown sequence.
// A beat that proved none keeps [opening, result] — there the opening is the only motion it has.
// Rule 4: the numbers below moved because the DECISION moved; the harvest still captures the
// opening frame and the drawing still draws it, this is what the row SHOWS.
test('enacted: the beat publishes its park points, one per scene, so the proof can drive it', () => {
  const d = renderWireframe(ENACTED, { behavior: ADD })
  const m = /data-viz-subphases="([^"]*)"/.exec(d.svg)
  assert.ok(m, 'the drawing says where each of its scenes parks')
  const groups = m[1].split('|').map(g => g.trim().split(/\s+/).map(Number))
  assert.equal(groups.length, 1, 'one group per beat')
  assert.equal(groups[0].length, 3, 'each value it proved, then its result — the opening is the Given')
  const all = (/data-viz-phases="([^"]*)"/.exec(d.svg) || ['', ''])[1].split(/\s+/).map(Number)
  assert.ok(groups[0][0] !== d.phases[0], 'it does NOT open on the Given scene any more')
  assert.equal(groups[0][2], d.phases[1], 'and closes exactly where the beat parks')
  assert.equal(all.length, 2, 'the per-beat park points are untouched — this is the scene list alone')
})

test('enacted: a beat with nothing proved between its ends still shows both of them', () => {
  const d = renderWireframe(PAIRS, { behavior: TWO })
  const m = /data-viz-subphases="([^"]*)"/.exec(d.svg)
  const groups = m[1].split('|').map(g => g.trim().split(/\s+/).map(Number))
  for (const g of groups) assert.equal(g.length, 2, 'before → after: the opening IS the motion here')
})

test('enacted: an intermediate scene says the WHEN alone — the Then has not happened yet', () => {
  const d = renderWireframe(ENACTED, { behavior: ADD, id: 'R1', title: 'Adding a task', pass: true })
  const mid = frameOf(d.svg, 1); const last = frameOf(d.svg, 3)
  assert.ok(mid.includes('>WHEN<'), 'the action is called out')
  assert.ok(!mid.includes('>THEN<'), 'but not its result — nothing has been proven at this moment')
  // …and the beat's RESTING scene says the Then alone (amended 2026-08-30, rule 4: the human made
  // the card one sentence — "as less text as possible" — so the last frame no longer carries both)
  assert.ok(last.includes('>THEN<'), 'the beat\'s own frame carries its Then')
  assert.ok(!last.includes('>WHEN<'), '…and only that: one sentence, the current small step')
  // no title anywhere on either scene — the R-id chip is the whole tag now
  assert.ok(!mid.includes('Adding a task') && !last.includes('Adding a task'), 'no requirement title on the card')
})

// THE ONE RULE, ASKED ONCE (2026-08-30). The drawn card must not merely LOOK like a single
// sentence — it must be the sentence tools/callout-text.mjs names for that scene, because the
// burn-in paints that same call. A private copy here is exactly how the two drifted before.
test('the drawn card says what the SHARED rule says, scene by scene', () => {
  const d = renderWireframe(ENACTED, { behavior: ADD, id: 'R1', title: 'Adding a task', pass: true })
  const scenes = [
    { frame: 1, want: calloutText({ id: 'R1', when: ADD.beats[0].when, then: ADD.beats[0].then, done: sceneDone(0, 3) }) },
    { frame: 3, want: calloutText({ id: 'R1', when: ADD.beats[0].when, then: ADD.beats[0].then, done: sceneDone(2, 3) }) }
  ]
  for (const sc of scenes) {
    const f = frameOf(d.svg, sc.frame)
    assert.ok(f.includes('>' + sc.want.label.toUpperCase() + '<'),
      'frame ' + sc.frame + ' wears the label the rule chose (' + sc.want.label + ')')
    // the sentence wraps AND the drawing xml-escapes it, so pin its opening plain words
    const head = sc.want.text.split(/["“]/)[0].split(/\s+/).slice(0, 3).join(' ').trim()
    assert.ok(f.includes(head), 'frame ' + sc.frame + ' opens on the rule\'s own sentence: ' + head)
  }
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
  // a SMALL target is governed by the CAP — the one thing that stops a 30px chip filling the cell
  // alone with none of the row it sits in
  const small = framedRegion({ x: 280, y: 160, w: 40, h: 20 }, W, H)
  assert.ok(Math.abs(small.w - W / 3.2) < 0.01, 'the cap still governs a small target: ' + JSON.stringify(small))
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
  const view = cam.cameraView(focus, cell, CAMOPTS)
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
  assert.ok(Math.abs(chip.w - W / 3.2) < 0.01, JSON.stringify(chip))
})

test('cameraView never crops the focus either — one camera, one rule', async () => {
  await import('./board/stepper.js')
  const cam = globalThis.SBStepper
  const focus = { x: 312, y: 126, w: 562, h: 655, vw: 1440, vh: 900 }
  const cell = { w: 570, h: 390 }
  const v = cam.cameraView(focus, cell, CAMOPTS)
  assert.ok(v.ok && v.scale > 1, 'it zooms: ' + JSON.stringify(v))
  // the framed page rectangle, back out of the transform: everything of the focus must be inside it
  const r = cell.w / focus.vw
  const fw = cell.w / (r * v.scale); const fh = cell.h / (r * v.scale)
  assert.ok(fw >= focus.w - 0.5 && fh >= focus.h - 0.5,
    'the whole focus fits the framed region: ' + fw + '×' + fh + ' vs ' + focus.w + '×' + focus.h)
})

// ── AGGRESSIVE ZOOM, AND A CAMERA THAT AIMS AT THE SCENE (the human, 2026-08-31) ──────────────
// "Do more aggressive zoom in on the area it's focusing (leave the general option to let user see
// full screen for both schematic and proof)." Two changes, one camera:
//   · the pad shrinks to a BREATHING MARGIN (×1.2) and the cap rises to 3.2, so the thing being
//     proven fills the cell instead of floating in a third of it;
//   · the beat still sets the ZOOM (one magnification per row, never a pump mid-beat), but each
//     SCENE sets the AIM — otherwise a beat whose rings are 600px apart down the page can only be
//     framed by zooming back out until both fit, which is the under-zoom being complained about.
// Both halves of a row take the same two rects through the same maths, so the row stays one camera.
const CAMOPTS = { maxScale: 3.2, minFrac: 0.3 }
test('the camera frames the focus TIGHT: the ring plus its margin, not a third of the page', () => {
  const S = 600 / 1440
  const ring = { x: 312 * S, y: 126 * S, w: 452 * S, h: 46.5 * S }     // the demo R1 Add box
  const reg = framedRegion(ring, 600, 375)
  assert.ok(Math.abs(reg.w - ring.w * 1.12) < 0.01,
    'the framed region is the ring plus its margin: ' + JSON.stringify(reg))
  assert.ok(ring.w / reg.w > 0.8, 'so the ringed thing fills the cell: ' + (ring.w / reg.w))
})

test('the camera AIMS at the scene while the BEAT sets the zoom', () => {
  const S = 600 / 1440
  // the demo's R1: the typed Add box high on the page, the two rows it produced 600px below it
  const union = { x: 312 * S, y: 126 * S, w: 562 * S, h: 655.25 * S }
  const scene1 = { x: 312 * S, y: 126 * S, w: 452.27 * S, h: 46.5 * S }
  const scene2 = { x: 321 * S, y: 739.5 * S, w: 553 * S, h: 22.5 * S }
  const a = framedRegion(union, 600, 375, { aim: scene1 })
  const b = framedRegion(union, 600, 375, { aim: scene2 })
  assert.ok(Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01,
    'ONE magnification for the whole beat — the row never pumps: ' + a.w + ' vs ' + b.w)
  const holds = (reg, f) => f.x >= reg.x - 0.02 && f.y >= reg.y - 0.02 &&
    f.x + f.w <= reg.x + reg.w + 0.02 && f.y + f.h <= reg.y + reg.h + 0.02
  assert.ok(holds(a, scene1), 'scene 1 is framed whole: ' + JSON.stringify(a))
  assert.ok(holds(b, scene2), 'scene 2 is framed whole: ' + JSON.stringify(b))
  assert.ok(scene1.w / a.w > 0.55,
    'and it is framed TIGHT — well over half the cell: ' + (scene1.w / a.w))
  // the old union-only camera had to zoom out until the whole 655px union fitted; this does not
  assert.ok(a.w < framedRegion(union, 600, 375).w * 0.85, 'tighter than framing the whole union')
})

test('cameraView aims at the scene too — the same region, in cell pixels', async () => {
  await import('./board/stepper.js')
  const cam = globalThis.SBStepper
  const focus = { x: 312, y: 126, w: 562, h: 655.25, vw: 1440, vh: 900 }
  const aim = { x: 312, y: 126, w: 452.27, h: 46.5 }
  const cell = { w: 560, h: 350 }                                    // the reader's 16:10 cell
  const view = cam.cameraView(focus, cell, { ...CAMOPTS, aim })
  assert.ok(view.ok, 'it zooms: ' + JSON.stringify(view))
  const S = 600 / 1440
  const reg = framedRegion(
    { x: focus.x * S, y: focus.y * S, w: focus.w * S, h: focus.h * S }, 600, 375,
    { aim: { x: aim.x * S, y: aim.y * S, w: aim.w * S, h: aim.h * S }, maxScale: CAMOPTS.maxScale })
  // both sides, expressed as a FRACTION of the page they frame — that is what a row compares
  const r = cell.w / focus.vw
  const got = { x: -view.tx / (view.scale * cell.w), y: -view.ty / (view.scale * cell.w * focus.vh / focus.vw),
    w: cell.w / (r * view.scale) / focus.vw, h: cell.h / (r * view.scale) / focus.vh }
  const want = { x: reg.x / 600, y: reg.y / 375, w: reg.w / 600, h: reg.h / 375 }
  for (const k of ['x', 'y', 'w', 'h']) {
    assert.ok(Math.abs(got[k] - want[k]) < 0.005,
      'the drawing and the proof frame the same region (' + k + '): ' + got[k] + ' vs ' + want[k])
  }
})

// ── THE CAMERA FRAMES THE CARD TOO (the human, 2026-08-30: never crop the explaining text box) ──
// The scene's region is the union of its ring and its callout card. On the current tightest camera a
// tall card hanging below a small ring falls outside the ring-only crop and is clipped at the cell
// edge — the very thing complained about. framedRegion and cameraView both take `opts.card` and widen
// the region to contain it, aimed at the pair. Red-first: the ring-only region below FAILS to hold
// the card, and the card-aware one holds it.
test('framedRegion contains the callout card — the region is the union of the ring and its card', async () => {
  const { calloutRect, calloutBoxHeight } = { ...await import('./overlay-geometry.mjs'), ...await import('./callout-text.mjs') }
  const S = 600 / 1440
  const ring = { x: 620, y: 300, w: 60, h: 30 }                      // a small ring: a tight zoom
  const card = calloutRect({ box: ring, vw: 1440, vh: 900, cw: 300, ch: calloutBoxHeight(4) })  // a tall card below it
  const toD = b => ({ x: b.x * S, y: b.y * S, w: b.w * S, h: b.h * S })
  const rD = toD(ring); const cD = toD(card)
  const inside = (b, r) => b.x >= r.x - 0.02 && b.y >= r.y - 0.02 &&
    b.x + b.w <= r.x + r.w + 0.02 && b.y + b.h <= r.y + r.h + 0.02
  const ringOnly = framedRegion(rD, 600, 375, { aim: rD, maxScale: 3.2 })
  assert.ok(!inside(cD, ringOnly), 'RED-FIRST: the ring-only camera clips the card — ' + JSON.stringify(cD) + ' outside ' + JSON.stringify(ringOnly))
  const withCard = framedRegion(rD, 600, 375, { aim: rD, card: cD, maxScale: 3.2 })
  assert.ok(inside(cD, withCard), 'the card-aware camera frames the whole card: ' + JSON.stringify(cD) + ' in ' + JSON.stringify(withCard))
})

test('cameraView contains the callout card too — the proof cell frames the same union, in cell pixels', async () => {
  await import('./board/stepper.js')
  const cam = globalThis.SBStepper
  const { calloutRect, calloutBoxHeight } = { ...await import('./overlay-geometry.mjs'), ...await import('./callout-text.mjs') }
  const focus = { x: 620, y: 300, w: 60, h: 30, vw: 1440, vh: 900 }
  const aim = { x: 620, y: 300, w: 60, h: 30 }
  const card = calloutRect({ box: aim, vw: 1440, vh: 900, cw: 300, ch: calloutBoxHeight(4) })
  const cell = { w: 560, h: 350 }
  // the framed region a view implies, as a page-pixel rect
  const regionOf = view => {
    const r = cell.w / focus.vw
    return { x: -view.tx / (view.scale * r), y: -view.ty / (view.scale * r),
      w: cell.w / (r * view.scale), h: cell.h / (r * view.scale) }
  }
  const inside = (b, r) => b.x >= r.x - 0.3 && b.y >= r.y - 0.3 &&
    b.x + b.w <= r.x + r.w + 0.3 && b.y + b.h <= r.y + r.h + 0.3
  const ringOnly = regionOf(cam.cameraView(focus, cell, { ...CAMOPTS, aim }))
  assert.ok(!inside(card, ringOnly), 'RED-FIRST: the ring-only proof camera clips the card')
  const withCard = regionOf(cam.cameraView(focus, cell, { ...CAMOPTS, aim, card }))
  assert.ok(inside(card, withCard), 'the card-aware proof camera frames the whole card')
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

// ── mirror-8 (2026-09-02): THE DRAWING IS COLOURED ──────────────────────────
// The human's complaint: the schematic "looks like a skeleton". It was — snapLayout measured only
// geometry and text, so the chips, the primary button, the ticked box and the struck-through done
// row all came out as the same grey bars. The harvest now records what the page is COLOURED (bg /
// fg / bd as plain "r,g,b", plus rd / fw / td / op / dis and a `check` kind that knows whether it is
// ticked), and the drawing maps every one of those to the nearest DESIGN TOKEN (tools/viz.mjs
// dyeOf, pinned in tools/dye.test.mjs). The rule that does not move: **no raw colour reaches the
// SVG** — the captured rgb lives in the layout JSON, which is data.
const DYED = focus => ({
  w: 1200,
  h: 800,
  ring: focus ? { x: 24, y: 180, w: 20, h: 20 } : null,
  els: [
    { x: 0, y: 0, w: 1200, h: 72, kind: 'container', bg: '253,252,249', bd: '226,221,209' },
    { x: 24, y: 100, w: 600, h: 44, kind: 'input', text: 'Water the plants', fs: 15, ta: 'l', pl: 12, pr: 12, bg: '255,255,255', bd: '47,111,237', rd: 8 },
    { x: 660, y: 100, w: 96, h: 44, kind: 'button', text: 'Add', fs: 14, ta: 'c', bg: '108,92,231', fg: '255,255,255', fw: 1, rd: 22 },
    { x: 24, y: 180, w: 20, h: 20, kind: 'check', on: 1, rd: 4, ...(focus ? { focus: true } : {}) },
    { x: 56, y: 178, w: 300, h: 24, kind: 'text', text: 'Buy milk', fs: 14, fg: '108,117,125', td: 1, op: 0.6 },
    { x: 900, y: 120, w: 120, h: 26, kind: 'text', text: 'overdue', fs: 12, ta: 'c', bg: '254,226,226', fg: '231,76,60', rd: 13 },
    { x: 24, y: 240, w: 96, h: 32, kind: 'button', text: 'Clear', fs: 13, ta: 'c', bg: '234,236,225', dis: 1, rd: 6 }
  ]
})
const DYEDB = b('a list with one done task', 'you add one', 'the overdue chip appears')

test('mirror-8: the captured colours are drawn — as design tokens, never as the app\'s own', () => {
  const d = renderWireframe(DYED(false), DYED(true), { behavior: DYEDB })
  const f0 = frameOf(d.svg, 0)
  const S = 600 / 1200
  // the primary button: an indigo FILL (the one dye allowed to fill solid), its own radius, and its
  // label in paper at the weight the page renders it
  assert.match(f0, new RegExp('<rect x="' + 660 * S + '" y="' + 100 * S + '" width="' + 96 * S +
    '" height="' + 44 * S + '" rx="' + 22 * S + '" fill="var\\(--ai\\)"'), 'the Add button is filled ai at its own radius')
  assert.match(f0, /fill="var\(--paper\)"[^>]*font-weight="600"[^>]*>Add</, 'its label is paper, bold')
  // the field keeps its own border colour, mapped to the indigo hairline
  assert.match(f0, /<rect x="12" y="50" width="300" height="22" rx="4" fill="var\(--paper\)" stroke="var\(--ai-line\)"/,
    'the input takes its measured radius and its own border dye')
  // the ticked checkbox: a rounded square, filled moss, with the drawn mark ON it (never --ok on --koke)
  assert.match(f0, /<rect x="12" y="90" width="10" height="10" rx="[\d.]+" fill="var\(--koke\)"/, 'a ticked box is filled')
  assert.match(f0, /stroke="var\(--paper\)" stroke-width="[\d.]+" stroke-linecap="round"/, 'and its ✓ is drawn in paper, so it reads on the fill')
  // the done row: struck through, at the opacity the page gives it
  assert.match(f0, /<g opacity="0\.6">/, 'the measured opacity rides the whole element')
  assert.match(f0, /<line [^>]*stroke="var\(--ink-4\)"/, 'and the line-through is drawn, in the text\'s own dye')
  assert.ok(f0.includes('>Buy milk<'), 'with the text still readable')
  // the overdue chip: a tinted plate with its own text colour
  assert.match(f0, /rx="[\d.]+" fill="var\(--bengara-tint\)"/, 'the chip carries its tint')
  assert.match(f0, /fill="var\(--bengara\)"[^>]*>overdue</, 'and its word the family solid')
  // a disabled control is dimmed, exactly as the page dims it
  assert.match(f0, /<g opacity="0\.5">[\s\S]*?>Clear</, 'the disabled button is at half')
})

test('mirror-8: not one raw colour survives into the drawing — tokens only, still', () => {
  const d = renderWireframe(DYED(false), DYED(true), { behavior: DYEDB })
  assert.ok(!/#[0-9a-fA-F]{3}/.test(d.svg), 'no hex')
  assert.ok(!/rgba?\(/.test(d.svg), 'no rgb()/rgba()')
  for (const m of d.svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
    assert.ok(m[1] === 'none' || /^var\(--[a-z0-9-]+\)$/.test(m[1]), 'every paint is a token: ' + m[1])
  }
})

test('mirror-8: an old harvest (no colour fields) still draws exactly as it did', () => {
  // every new field is optional — a skeleton folded before this pass keeps the grey house defaults
  const f1 = frameOf(renderWireframe(LAY_BEFORE, LAY_AFTER, { behavior: COUNT }).svg, 0)
  assert.match(f1, /fill="var\(--wash\)" stroke="var\(--line2\)"/, 'the button keeps the default plate')
  assert.match(f1, /fill="var\(--paper\)" stroke="var\(--ai-line\)"/, 'and the field its default hairline')
})

// ── THE CROSSFADE HAS NO DIP (the human, 2026-09-02: "the scene move is not smooth") ─────────────
// wfFade used to fade frame k OUT while k+1 faded IN, so at the midpoint of every transition BOTH
// were at ~0.5 and identical content dipped to a visible blink (and text ghosted double). Frames are
// painted in order, so the fix is to keep k fully opaque until k+1 has finished arriving ON TOP of
// it — which needs every frame group to open with an OPAQUE page rect, or k+1 would be a transparent
// sheet over k rather than a replacement for it.
const fadeCurves = svg => {
  const n = Number(/data-viz-frames="(\d+)"/.exec(svg)[1])
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)[1]
  return Array.from({ length: n }, (_, k) => {
    const m = new RegExp('@keyframes\\s+\\w+f' + k + '\\{((?:[\\d.]+%\\{[^}]*\\})+)\\}').exec(css)
    assert.ok(m, 'frame ' + k + ' has a fade')
    const stops = [...m[1].matchAll(/([\d.]+)%\{opacity:([\d.]+)\}/g)].map(s => [Number(s[1]), Number(s[2])])
    assert.ok(stops.length, 'frame ' + k + ' fades on opacity alone')
    return t => {
      if (t <= stops[0][0]) return stops[0][1]
      for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
          const [p0, v0] = stops[i - 1]; const [p1, v1] = stops[i]
          return p1 === p0 ? v1 : v0 + (v1 - v0) * ((t - p0) / (p1 - p0))
        }
      }
      return stops[stops.length - 1][1]
    }
  })
}

test('the crossfade never dims: at every instant of the loop SOME frame is fully opaque', () => {
  for (const [lays, meta] of [[ENACTED, { behavior: ADD }], [PAIRS, { behavior: TWO }], [NESTED, CARD]]) {
    const svg = renderWireframe(lays, meta).svg
    const fs = fadeCurves(svg)
    for (let t = 0; t <= 100; t += 0.25) {
      const top = Math.max(...fs.map(f => f(t)))
      assert.ok(top >= 0.999, `t=${t}%: the brightest frame is only ${top} — that is the blink`)
    }
  }
})

test('the crossfade is a REPLACEMENT: while k+1 arrives, k is held at full', () => {
  const svg = renderWireframe(ENACTED, { behavior: ADD }).svg
  const fs = fadeCurves(svg)
  for (let k = 0; k + 1 < fs.length; k++) {
    for (let t = 0; t <= 100; t += 0.25) {
      const inc = fs[k + 1](t)
      const arriving = inc > 0.001 && inc < 0.999 && fs[k + 1](t + 0.05) > inc
      if (arriving) assert.equal(fs[k](t), 1, `frame ${k} must hold while frame ${k + 1} arrives (t=${t}%)`)
    }
  }
})

test('every frame opens with an opaque page — an incoming frame REPLACES the one under it', () => {
  const svg = renderWireframe(ENACTED, { behavior: ADD }).svg
  const n = Number(/data-viz-frames="(\d+)"/.exec(svg)[1])
  for (let k = 0; k < n; k++) {
    const f = frameOf(svg, k)
    assert.match(f.slice(0, 140), /^<g class="wf\d+"><rect x="1" y="1" width="\d+" height="\d+" rx="[\d.]+" fill="var\(--paper\)"\/>/,
      'frame ' + k + ' starts with its own opaque page')
  }
})

// ── the visual pass of 2026-09-02 (the lead's headless review of the re-harvested demo) ──────────
// (1) "All tasks" in a 96px box at 26px bold was drawn as "All t…": fitText assumed 0.55em per
// character, but a LEAF's box is the text's own measured width, so its words always fit — the
// truncation was the estimate's, not the page's. A label whose estimate overflows its room is
// SQUEEZED to the room (SVG textLength) rather than cut; only a gross overflow still truncates.
test('a text leaf is never truncated inside its own measured box — squeezed, not cut', () => {
  const L = { w: 1440, h: 900, ring: null, els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    { x: 270, y: 42, w: 96, h: 39, kind: 'heading', text: 'All tasks', fs: 26, ta: 'l', fw: 1 },
    { x: 700, y: 42, w: 30, h: 20, kind: 'text', text: 'to do', fs: 11, ta: 'r' }
  ] }
  const out = renderWireframe([{ before: L, after: L, values: [] }], { id: 'R1' }).svg
  assert.match(out, />All tasks</, 'the heading keeps its whole word')
  assert.doesNotMatch(out, />All t…</)
  assert.match(out, />to do</, 'a small right-aligned leaf keeps its words too')
  // a genuinely overflowing label (a 10-character word in a 20px box) is still cut, never spilled
  const L2 = { ...L, els: [L.els[0], { x: 10, y: 10, w: 20, h: 16, kind: 'text', text: 'Supercalifragilistic', fs: 12, ta: 'l' }] }
  const out2 = renderWireframe([{ before: L2, after: L2, values: [] }], { id: 'R1' }).svg
  assert.match(out2, /…</, 'a gross overflow is truncated')
})

// (2) the sidebar's nav buttons drew a grey placeholder BAR across the words: the <button> carries
// no text of its own (its label is a child leaf), so the kit filed it as "no measured text" and
// drew the bar OVER the leaf it contains. A box that holds a text-bearing element is not empty.
test('no placeholder bar is drawn on a box whose words live in a nested leaf', () => {
  const L = { w: 1440, h: 900, ring: null, els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    { x: 16, y: 124, w: 197, h: 37, kind: 'button', rd: 9 },
    { x: 54, y: 132, w: 131, h: 21, kind: 'text', text: 'All tasks', fs: 14, ta: 'l', fw: 1 },
    { x: 16, y: 300, w: 197, h: 37, kind: 'button', rd: 9 }          // a truly empty button keeps its bar
  ] }
  const out = renderWireframe([{ before: L, after: L, values: [] }], { id: 'R1' }).svg
  const frame0 = out.slice(out.indexOf('<g class="wf0">'), out.indexOf('</g>'))
  const bars = (frame0.match(/fill="var\(--line3\)"/g) || []).length
  assert.equal(bars, 1, 'one bar for the empty button, none over the labelled one')
  assert.match(frame0, />All tasks</)
})

// ── mirror-9 (2026-09-02): THE RINGED THING IS DRAWN, NOT SUMMARISED ─────────────────────────────
// The human, looking at demo/todo's R1 scene 3: "schematic still looks like skeleton … all styling,
// component should be same (like currently even missing tickbox, and the 'just added now' is totally
// unacceptable)". Three separate defects met in that one row, and each is pinned below:
//   1. the ringed row's CHILDREN were not drawn at all — frameBody skipped every focus element and
//      pickFocus then typed the row's concatenated innerText ("Water the plants added just now") as
//      one mono line, losing the tick box, the title, the stamp and the chevron;
//   2. the row's hover-only edit/delete buttons carry opacity 0, but their child icons carry none,
//      so three wash squares were drawn where the photograph shows one chevron;
//   3. a 21×21 wordless <button> (Tsumiki's tick box) got the "no measured text" placeholder bar,
//      which reads as a dot inside a circle.
// The fixture is the real harvest's shape (demo/todo/spec/todo/evidence/R1.b1.v3.layout.json).
// page px → the drawing's own units, rounded the way the kit rounds (r1) — so a pin can name the
// element it means by the box the page measured
const r = v => Math.round(v * (600 / 1440) * 10) / 10
//
// THE CAPTURE SIDE HAS NO UNIT HERE, and cannot: snapLayout's measurement is a closure serialised
// into a real browser (spec/_base.ts), so there is nothing to import. What it must produce is pinned
// by the fixtures below (they are the shape of a real harvest) and checked BY HAND on the next run:
//   · an `opacity:0` control and everything inside it is ABSENT from the layout JSON, not present
//     with op:0 — grep a fresh spec/<screen>/evidence/*.layout.json for `"op":0`, there should be none;
//   · a hand-rolled tick box (a wordless square <button> with no children) comes back kind:"check";
//   · every text-bearing record carries ff, and a placeholder-only field carries ph:1;
//   · an uppercased label carries tt:"u" with its text in the page's own casing;
//   · a small inline <svg> comes back with an `icon` — {vb, sw, shapes:[{t:'path', d, s:1}, …]} —
//     and the wordless <button> holding it carries no bg and no bd (mirror-10). Grep a fresh
//     evidence/*.layout.json for `"icon"`; a row's chevron must be one of them.
const ROW_ADDED = focus => {
  const f = focus ? { focus: true } : {}
  return {
    w: 1440,
    h: 900,
    ring: focus ? { x: 271, y: 725.5, w: 738, h: 69.75 } : null,
    els: [
      { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
      { x: 270, y: 105, w: 740, h: 70, kind: 'container', bg: '255,255,255', bd: '236,238,242', rd: 14 },
      // the ringed row: two nesting wrappers, each carrying the CONCATENATED innerText the capture
      // takes for a focused box, then the leaves that actually hold the words
      { x: 270, y: 725, w: 740, h: 72, kind: 'container', text: 'Water the plants added just now', fs: 15, ta: 'l', pl: 1, pr: 1, fg: '30,35,48', bg: '255,255,255', bd: '236,238,242', rd: 14, ...f },
      { x: 271, y: 726, w: 738, h: 70, kind: 'container', text: 'Water the plants added just now', fs: 15, ta: 'l', pl: 16, pr: 16, fg: '30,35,48', ...f },
      { x: 287, y: 750, w: 21, h: 21, kind: 'button', bg: '255,255,255', bd: '223,226,233', rd: 7, ...f },
      { x: 321, y: 740, w: 553, h: 23, kind: 'text', text: 'Water the plants', fs: 15, ta: 'l', ff: 'sans', fg: '30,35,48', ...f },
      { x: 321, y: 764, w: 553, h: 17, kind: 'text', text: 'added just now', fs: 11.5, ta: 'l', ff: 'sans', fg: '174,180,194', ...f },
      // hover-only: the button is faded to nothing, its icon inherits that and carries no op of its own
      { x: 887, y: 746, w: 28, h: 28, kind: 'button', rd: 8, op: 0, ...f },
      { x: 893, y: 752, w: 16, h: 16, kind: 'text', text: 'delete', fs: 11, ta: 'c', ...f },
      // …and the one control the photograph really does show
      { x: 928, y: 748, w: 24, h: 24, kind: 'button', ...f },
      { x: 934, y: 753, w: 12, h: 15, kind: 'image', ...f }
    ]
  }
}
const ROWB = b('a list with two tasks', 'you add another', 'the new row appears at the end')

test('mirror-9: a ringed ROW draws its own children — never one concatenated line', () => {
  const d = renderWireframe([{ before: ROW_ADDED(false), after: ROW_ADDED(true) }], { behavior: ROWB, id: 'R1' })
  const f1 = frameOf(d.svg, 1)
  assert.match(f1, /<text[^>]*>Water the plants</, 'the title leaf is typed on its own')
  assert.match(f1, /<text[^>]*>added just now</, 'and so is the stamp the human called out by name')
  assert.ok(!f1.includes('Water the plants added just now'),
    'the row\'s concatenated innerText is never drawn as a line')
  // the tick box is a real component again: its own plate, at its own radius and border dye
  assert.match(f1, new RegExp('x="' + r(287) + '" y="' + r(750) + '" width="' + r(21) + '" height="' + r(21) + '"'),
    'the tick box is drawn')
  assert.ok(/stroke="var\(--ai\)"/.test(f1), 'the ring is still painted')
  assert.ok(/fill="var\(--ink\)" opacity="0\.12"/.test(f1), 'and the dim wash with it')
})

test('mirror-9: an element the page has faded to nothing is not drawn, nor anything inside it', () => {
  const d = renderWireframe([{ before: ROW_ADDED(false), after: ROW_ADDED(true) }], { behavior: ROWB, id: 'R1' })
  for (const k of [0, 1]) {
    const f = frameOf(d.svg, k)
    assert.ok(!f.includes('>delete<'), `frame ${k}: a child of an opacity-0 control is not drawn either`)
    assert.ok(!new RegExp('x="' + r(887) + '" y="' + r(746) + '"').test(f),
      `frame ${k}: the opacity-0 control itself is not drawn`)
  }
  // the visible chevron beside it survives — this is a fade rule, not a "drop the icons" rule.
  // Asked at the ICON's box since mirror-10 (rule 4 — the assertion was correctly broken by a good
  // change): a wordless button the page paints nothing on no longer invents a plate of its own, so
  // what proves the control is still drawn is the picture inside it, which is all the screen shows.
  assert.match(frameOf(d.svg, 0), new RegExp('x="' + r(934) + '" y="' + r(753) + '"'), 'the visible control stays')
  assert.ok(!new RegExp('x="' + r(928) + '" y="' + r(748) + '"').test(frameOf(d.svg, 0)),
    'and it is the icon alone — no plate the page does not paint')
})

test('mirror-9: a small wordless control is its plate alone — no placeholder bar', () => {
  const L = { w: 1440, h: 900, ring: null, els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    { x: 287, y: 750, w: 21, h: 21, kind: 'button', bg: '255,255,255', bd: '223,226,233', rd: 7 },
    { x: 400, y: 750, w: 197, h: 37, kind: 'button', rd: 9 }        // a real, roomy empty button keeps its bar
  ] }
  const f0 = frameOf(renderWireframe([{ before: L, after: L, values: [] }], { id: 'R1' }).svg, 0)
  assert.equal((f0.match(/fill="var\(--line3\)"/g) || []).length, 1,
    'the 21×21 tick box gets no bar; the 197×37 button still does')
})

test('mirror-9: text is drawn in the page\'s own family — sans unless the harvest measured mono', () => {
  const lay = ff => ({ w: 1440, h: 900, ring: null, els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    { x: 312, y: 37, w: 452, h: 47, kind: 'input', text: 'Water the plants', fs: 15, ta: 'l', pl: 13, ...(ff ? { ff } : {}) }
  ] })
  const sans = frameOf(renderWireframe([{ before: lay(null), after: lay(null), values: [] }], { id: 'R1' }).svg, 0)
  assert.match(sans, /font-family="var\(--sans\)"[^>]*>Water the plants</,
    'an unmeasured family is the app\'s sans, not the old forced mono')
  const mono = frameOf(renderWireframe([{ before: lay('mono'), after: lay('mono'), values: [] }], { id: 'R1' }).svg, 0)
  assert.match(mono, /font-family="var\(--mono\)"[^>]*>Water the plants</, 'a measured mono field stays mono')
  // the design system has --sans and --mono only: a serif page maps to sans rather than inventing a token
  const serif = renderWireframe([{ before: lay('serif'), after: lay('serif'), values: [] }], { id: 'R1' }).svg
  assert.ok(!/var\(--serif\)/.test(serif), 'no third family token is ever emitted')
  assert.match(frameOf(serif, 0), /font-family="var\(--sans\)"[^>]*>Water the plants</)
})

test('mirror-9: an uppercased label is drawn uppercased, and a placeholder in the quiet ink', () => {
  const L = { w: 1440, h: 900, ring: null, els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    { x: 325, y: 189, w: 69, h: 17, kind: 'text', text: 'Sub-tasks', fs: 11, ta: 'l', tt: 'u', fg: '174,180,194' },
    { x: 312, y: 37, w: 452, h: 47, kind: 'input', text: 'Add a task and press Enter…', fs: 15, ta: 'l', pl: 13, ph: 1, fg: '0,0,0' }
  ] }
  const f0 = frameOf(renderWireframe([{ before: L, after: L, values: [] }], { id: 'R1' }).svg, 0)
  assert.match(f0, />SUB-TASKS</, 'text-transform:uppercase is what the page shows, so it is what the mirror draws')
  assert.ok(!f0.includes('>Sub-tasks<'), 'and the un-transformed casing is not drawn beside it')
  assert.match(f0, /fill="var\(--ink-4\)"[^>]*>Add a task and press Enter…</,
    'a placeholder is the field\'s empty state, never its measured text colour')
})

// ── THE MIRROR CANNOT SILENTLY DRIFT FROM THE PROOF (the human, 2026-09-02) ───────────────────────
// "make sure the gap between schematic and proof will not exist again." Twice now a renderer change
// quietly stopped drawing something the harvest had measured — the tick box, the row's own leaves —
// and nothing on the board said so; it took the human's eye on a beat row. mirrorGaps is the derived
// guard: it reads the frame that was drawn and asks, against the SAME reading of the skeleton the
// frame drew from, whether every measured word, plate and ring actually landed. Zero gaps is the
// contract; a gap is named, with the box to find it in, in the page's own units.
const GUARD = focus => {
  const f = focus ? { focus: true } : {}
  return {
    w: 1440,
    h: 900,
    ring: focus ? { x: 271, y: 725.5, w: 738, h: 69.75 } : null,
    els: [
      { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
      // a field carrying its typed value, and the button beside it
      { x: 312, y: 37, w: 452, h: 47, kind: 'input', text: 'Water the plants', fs: 15, ta: 'l', pl: 13, bg: '255,255,255', bd: '79,70,229', rd: 12 },
      { x: 780, y: 37, w: 96, h: 47, kind: 'button', text: 'Add', fs: 15, bg: '79,70,229', fg: '255,255,255', rd: 12 },
      // an uppercased section label, and a tick box in each state
      { x: 325, y: 189, w: 69, h: 17, kind: 'text', text: 'Sub-tasks', fs: 11, ta: 'l', tt: 'u', fg: '174,180,194' },
      { x: 287, y: 640, w: 21, h: 21, kind: 'check', on: true, bg: '22,101,52', rd: 7 },
      { x: 287, y: 690, w: 21, h: 21, kind: 'check', bg: '255,255,255', bd: '223,226,233', rd: 7 },
      // the ringed row and the two leaves that hold its words
      { x: 270, y: 725, w: 740, h: 72, kind: 'container', text: 'Water the plants added just now', fs: 15, ta: 'l', pl: 1, pr: 1, fg: '30,35,48', bg: '255,255,255', bd: '236,238,242', rd: 14, ...f },
      { x: 321, y: 740, w: 553, h: 23, kind: 'text', text: 'Water the plants', fs: 15, ta: 'l', ff: 'sans', fg: '30,35,48', ...f },
      { x: 321, y: 764, w: 553, h: 17, kind: 'text', text: 'added just now', fs: 11.5, ta: 'l', ff: 'sans', fg: '174,180,194', ...f },
      // hover-only, faded to nothing, with a child that carries no opacity of its own
      { x: 887, y: 746, w: 28, h: 28, kind: 'button', rd: 8, op: 0, ...f },
      { x: 893, y: 752, w: 16, h: 16, kind: 'text', text: 'delete', fs: 11, ta: 'c', ...f },
      // a smudge: below the kit's 4×2.5 floor, deliberately not drawn — and so never a gap
      { x: 1200, y: 860, w: 6, h: 4, kind: 'text', text: 'x', fs: 3 }
    ]
  }
}
const GUARDB = b('a list with two tasks', 'you add another', 'the new row appears at the end')
const guardFrame = n => frameOf(renderWireframe([{ before: GUARD(false), after: GUARD(true) }],
  { behavior: GUARDB, id: 'R1', pass: true }).svg, n)

test('mirrorGaps: a hand-made skeleton — a ringed row, a tick box, a faded control — draws with no gaps', () => {
  assert.deepEqual(mirrorGaps(GUARD(true), guardFrame(1), { focus: true }), [],
    'every measured word, plate and ring the kit claims to draw is in the ringed frame')
  assert.deepEqual(mirrorGaps(GUARD(false), guardFrame(0), { focus: false, anchors: [{ x: 271, y: 725.5, w: 738, h: 69.75 }] }), [],
    'and in the given frame, whose ghost stands in for the box it is drawn over')
})

test('mirrorGaps names a word the drawing dropped — the guard can actually fail', () => {
  const f = guardFrame(1)
  const cut = f.replace(/<text[^>]*>added just now<\/text>/, '')
  const gaps = mirrorGaps(GUARD(true), cut, { focus: true })
  assert.equal(gaps.length, 1, gapSummary(gaps))
  assert.equal(gaps[0].kind, 'missing-text')
  assert.match(gaps[0].what, /added just now/)
  assert.deepEqual({ x: gaps[0].x, y: gaps[0].y, w: gaps[0].w, h: gaps[0].h }, { x: 321, y: 764, w: 553, h: 17 },
    'the box is in PAGE units — where to find it on the real screen')
})

test('mirrorGaps names a plate the drawing dropped — the tick box the human missed by eye', () => {
  const f = guardFrame(1)
  const cut = f.replace(new RegExp('<rect x="' + r(287) + '" y="' + r(690) + '"[^>]*/>'), '')
  const gaps = mirrorGaps(GUARD(true), cut, { focus: true })
  assert.equal(gaps.length, 1, gapSummary(gaps))
  assert.equal(gaps[0].kind, 'missing-box')
  assert.deepEqual({ x: gaps[0].x, y: gaps[0].y }, { x: 287, y: 690 })
})

test('mirrorGaps catches a box the page faded to nothing that the frame painted anyway', () => {
  const painted = guardFrame(1) +
    `<rect x="${r(887)}" y="${r(746)}" width="${r(28)}" height="${r(28)}" fill="var(--wash)"/>`
  const gaps = mirrorGaps(GUARD(true), painted, { focus: true })
  assert.equal(gaps.length, 1, gapSummary(gaps))
  assert.equal(gaps[0].kind, 'hidden-drawn')
  assert.deepEqual({ x: gaps[0].x, y: gaps[0].y }, { x: 887, y: 746 })
})

test('mirrorGaps catches a ringed scene that lost its ring', () => {
  const noring = guardFrame(1).replace(/stroke="var\(--ai\)"/g, 'stroke="var(--line2)"')
  const gaps = mirrorGaps(GUARD(true), noring, { focus: true })
  assert.ok(gaps.some(g => g.kind === 'ring-missing'), gapSummary(gaps))
  assert.deepEqual({ x: gaps[0].x, y: gaps[0].y, w: gaps[0].w, h: gaps[0].h },
    { x: 271, y: 725.5, w: 738, h: 69.8 }, 'the ring the assertion pointed at, in page units (one decimal: a locator, not a measurement)')
})

test('gapSummary counts a run of gaps by kind, for the derive line', () => {
  assert.equal(gapSummary([]), '')
  assert.equal(gapSummary([{ kind: 'missing-text' }, { kind: 'hidden-drawn' }, { kind: 'missing-text' }]),
    'missing-text 2, hidden-drawn 1')
})

// THE REAL HARVEST, NOT A FIXTURE (the lead's rule: verify on real data). The demo project's own
// committed skeletons — a 1440×900 Tsumiki page, 100+ elements, three asserted values and both ends
// — are the shape the renderer actually meets. A gap here is a real omission in the kit, never a
// fixture that flatters it.
const DEMO_EV = new URL('../demo/todo/spec/todo/evidence/', import.meta.url)
const demoLayout = n => JSON.parse(readFileSync(new URL(`R1.b1.${n}.layout.json`, DEMO_EV), 'utf8'))

test('mirrorGaps: the demo\'s real harvest draws everything it measured — zero gaps, every frame', () => {
  const beat = { before: demoLayout('before'), after: demoLayout('after'), values: ['v1', 'v2', 'v3'].map(demoLayout) }
  const d = renderWireframe([beat], { behavior: GUARDB, id: 'R1', pass: true })
  assert.equal(d.gaps.length, 5, 'one report per drawn frame: the given, three asserted values, the result')
  for (const g of d.gaps) {
    assert.deepEqual(g.gaps, [], `frame ${g.frame} — ${gapSummary(g.gaps)}`)
  }
})

// ── mirror-10: AN ICON IS ITS OWN LINES, NOT A PLATE ────────────────────────────────────────────
// The human, 2026-09-02, on the demo's R1 scene 3: "there's a weird extra circle on each row's
// right side in the schematic". The row's chevron is a wordless 28×28 <button class="caret">
// holding a 24-unit stroked <svg>. The button got the wash plate at rx≈7 and the svg got the image
// plate with a hair stroke — a filled lozenge with a square on it, where the photograph shows a
// thin grey "›". So a small inline svg now rides the skeleton as the few shapes it is made of, and
// the drawing draws THOSE; a button the page paints nothing on is its icon and nothing else.
const CHEV = { vb: [0, 0, 24, 24], sw: 2, fg: '174,180,194', shapes: [{ t: 'path', d: 'M9 6l6 6-6 6', s: 1 }] }
const ICONLAY = icon => ({
  w: 1440,
  h: 900,
  ring: null,
  els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    // the row's chevron: no text, no worded child, no paint of its own
    { x: 960, y: 740, w: 28, h: 28, kind: 'button' },
    { x: 962, y: 742, w: 24, h: 24, kind: 'image', icon: icon === undefined ? CHEV : icon },
    // …and a button the page DOES paint, which keeps its plate exactly as before
    { x: 780, y: 37, w: 96, h: 47, kind: 'button', text: 'Add', fs: 15, bg: '79,70,229', fg: '255,255,255', rd: 12 }
  ]
})
const iconFrame = lay => frameOf(renderWireframe([{ before: lay, after: lay }], { id: 'R1' }).svg, 0)

test('mirror-10: the chevron is drawn as its own path, and the plateless button draws nothing', () => {
  const f = iconFrame(ICONLAY())
  assert.match(f, /<g transform="translate\([-\d.]+ [-\d.]+\) scale\([-\d.]+ [-\d.]+\)"[^>]*><path d="M9 6l6 6-6 6"/,
    'the icon rides in at its own viewBox scale, drawn as the line the page draws')
  assert.ok(!/<rect x="400" y="308.3"/.test(f), 'the wordless unpainted button has no plate of its own')
  assert.ok(!/<rect x="400.8" y="309.2"/.test(f), 'and the icon has no wash square behind it')
  assert.ok(!/#[0-9a-fA-F]{3}/.test(f) && !/rgb\(/.test(f), 'no app colour reaches the icon')
  assert.match(f, /<path d="M9 6l6 6-6 6"[^>]* stroke="var\(--[a-z0-9-]+\)"/, 'the ink is a dye token')
})

test('mirror-10: a painted button keeps its plate — the stand-down is only for an unpainted one', () => {
  const f = iconFrame(ICONLAY())
  assert.match(f, /<rect x="325" y="15.4" width="40" height="19.6"/, 'the Add button is painted, so it is drawn')
})

test('mirror-10: a hostile path is dropped whole — the image falls back to the plate it always had', () => {
  const f = iconFrame(ICONLAY({ ...CHEV, shapes: [{ t: 'path', d: 'M0 0 <script>', s: 1 }] }))
  assert.ok(!/<script/i.test(f), 'harvested data is never markup')
  assert.ok(!/<g transform="translate/.test(f), 'and nothing of the icon reaches the drawing')
  assert.match(f, /<rect x="400.8" y="309.2" width="10" height="10" rx="3" fill="var\(--wash\)"/,
    'the image is drawn exactly as it was before this pass')
})

test('mirror-10: mirrorGaps is zero over an icon button and a painted one — and still catches a dropped icon', () => {
  assert.deepEqual(mirrorGaps(ICONLAY(), iconFrame(ICONLAY()), { focus: false }), [],
    'a plateless icon button is not a missing box; the icon counts as drawn at its own place')
  const cut = iconFrame(ICONLAY()).replace(/<g transform="translate[\s\S]*?<\/g>/, '')
  const gaps = mirrorGaps(ICONLAY(), cut, { focus: false })
  assert.equal(gaps.length, 1, gapSummary(gaps))
  assert.equal(gaps[0].kind, 'missing-box')
  assert.deepEqual({ x: gaps[0].x, y: gaps[0].y }, { x: 962, y: 742 }, 'named at the box the page measured')
})

// ── mirror-11: A SHAPE'S OWN COLOUR, AND A TICK YOU CAN SEE ─────────────────────────────────────
// The lead's visual review of the re-harvested demo (demo/todo, the R3 and R6 scenes), 2026-09-02.
// Two differences were left against the photograph, and each is pinned below.
//
//   1. A MULTI-COLOUR ICON DREW IN ONE DYE. Tsumiki's container ring is a single <svg> holding a
//      pale TRACK circle and an indigo PROGRESS arc. mirror-10 carried ONE `fg` for the whole icon —
//      the svg's computed `color`, which here is the button's own ink — so the ring drew as a heavy
//      black circle where the photograph shows a light track under an indigo arc. Now every SHAPE
//      carries the stroke and fill the page actually computes for it (`sc` / `fc`), its own
//      stroke-width, and its own opacity; the icon's `fg` is only the fallback for a shape that
//      measured neither. Every one of those still goes through dyeOf, so the drawing can still emit
//      nothing but var(--token).
//   2. THE TICK ON A DONE CHECKBOX WAS INVISIBLE. A ticked box drew a koke square with a hairline
//      paper ✓ on it; at an 18px page box the mark vanished and the control read as a solid dark
//      square. The tick is drawn heavy (≥1.6 drawing units) and spans its square — and where the
//      APP draws its own tick as an svg inside the control, that icon is the ONLY tick: the house
//      one over it would be two ✓ on one box.
const RING_ICON = {
  vb: [0, 0, 26, 26],
  sw: 1.5,
  fg: '0,0,0',                                                            // the svg's own `color`: ink
  shapes: [
    { t: 'circle', cx: 13, cy: 13, r: 9, s: 1, sc: '223,226,233', sw: 3 },  // the track
    { t: 'circle', cx: 13, cy: 13, r: 9, s: 1, sc: '79,70,229', sw: 3 },    // the progress arc
    { t: 'path', d: 'M9 13l3 3 5-6', f: 1, fc: '18,160,106', op: 0.8 }      // and a filled mark on it
  ]
}
const RINGLAY = icon => ({
  w: 1440,
  h: 900,
  ring: null,
  els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    { x: 287, y: 127, w: 26, h: 26, kind: 'button' },                       // the unpainted .ring button
    { x: 287, y: 127, w: 26, h: 26, kind: 'image', icon }
  ]
})
const iconBody = f => {
  const m = /<g transform="translate\([^"]*\) scale\([^"]*\)"[^>]*>([\s\S]*?)<\/g>/.exec(f)
  return m ? m[1] : ''
}
const tokensOnly = f => {
  for (const m of f.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
    assert.ok(m[1] === 'none' || /^var\(--[a-z0-9-]+\)$/.test(m[1]), 'every paint is a token: ' + m[1])
  }
}

test('mirror-11: each shape draws its OWN measured stroke and fill — the icon dye is only a fallback', () => {
  const f = iconFrame(RINGLAY(RING_ICON))
  const body = iconBody(f)
  assert.ok(body, 'the icon is drawn as one scaled group')
  assert.match(body, /<circle[^>]*stroke="var\(--ink-4\)" stroke-width="3"/,
    'the track keeps its own pale dye, at its own 3-unit stroke')
  assert.match(body, /<circle[^>]*stroke="var\(--ai\)" stroke-width="3"/,
    'and the progress arc the indigo the page paints it')
  assert.match(body, /<path[^>]*fill="var\(--koke\)"/, 'a shape that measured a FILL is filled in its own dye')
  assert.match(body, /<path[^>]*opacity="0\.8"/, 'and drawn at the opacity the page gives it')
  assert.ok(!/var\(--ink\)/.test(body), 'nothing falls back to the svg\'s own colour while it measured its own')
  assert.ok(!/#[0-9a-fA-F]{3}/.test(f) && !/rgba?\(/.test(f), 'no app colour reaches the drawing')
  tokensOnly(f)
  assert.deepEqual(mirrorGaps(RINGLAY(RING_ICON), f, { focus: false }), [], 'and the guard still reads it as drawn')
})

test('mirror-11: a malformed shape colour is dropped — that shape falls back to the icon dye', () => {
  for (const bad of ['#zzz', '1,2', '1,2,3,4', 'url(#grad)', 'currentColor', '', 42, null, {}]) {
    const lay = RINGLAY({
      vb: [0, 0, 26, 26],
      sw: 3,
      fg: '0,0,0',
      shapes: [
        { t: 'circle', cx: 13, cy: 13, r: 9, s: 1, f: 1, sc: bad, fc: bad },
        { t: 'line', x1: 2, y1: 2, x2: 24, y2: 24, s: 1, sc: '79,70,229' }   // a sound sibling, unharmed
      ]
    })
    const f = iconFrame(lay)
    const body = iconBody(f)
    assert.match(body, /<circle[^>]*fill="var\(--ink\)" stroke="var\(--ink\)"/,
      `${JSON.stringify(bad)} is not a colour — the shape wears the icon's own dye`)
    assert.match(body, /<line[^>]*stroke="var\(--ai\)"/,
      'and one bad colour does not cost the shape beside it its own')
    tokensOnly(f)
  }
})

test('mirror-11: a done tick is drawn heavy enough to read on the fill, and spans its square', () => {
  const S = 600 / 1440
  const side = 18 * S                       // the demo's own 18px tick box, in drawing units
  const want = Math.max(1.6, side * 0.16)
  const L = {
    w: 1440,
    h: 900,
    ring: null,
    els: [
      { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
      { x: 325, y: 312, w: 18, h: 18, kind: 'check', on: 1, bg: '18,160,106', bd: '18,160,106', rd: 6 }
    ]
  }
  const f = frameOf(renderWireframe([{ before: L, after: L, values: [] }], { id: 'R1' }).svg, 0)
  const m = /<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)"[^>]*stroke="var\(--paper\)" stroke-width="([\d.]+)"/.exec(f)
  assert.ok(m, 'the tick is drawn on the filled box')
  assert.ok(Number(m[7]) >= 1.6, `a stroke a reader can actually see: ${m[7]}`)
  assert.ok(Math.abs(Number(m[7]) - want) <= 0.06, `at max(1.6, side × 0.16) = ${want}, not ${m[7]}`)
  const x0 = 325 * S; const y0 = 312 * S
  const at = (v, base) => (Number(v) - base) / side
  const near = (v, base, wantF) => Math.abs(at(v, base) - wantF) <= 0.02
  assert.ok(near(m[1], x0, 0.24) && near(m[3], x0, 0.46) && near(m[5], x0, 0.76),
    `the mark spans the square: ${[m[1], m[3], m[5]].map(v => at(v, x0).toFixed(2))}`)
  assert.ok(at(m[4], y0) > at(m[2], y0) && at(m[2], y0) > at(m[6], y0), 'down to the elbow, then up')
  assert.match(f, /stroke-linecap="round"/, 'with round caps, like the app\'s own')
})

test('mirror-11: where the app draws its own tick inside the control, that is the only tick', () => {
  const APP_TICK = { vb: [0, 0, 24, 24], sw: 3, fg: '255,255,255', shapes: [{ t: 'path', d: 'M5 12l5 5 9-10', s: 1 }] }
  const lay = own => ({
    w: 1440,
    h: 900,
    ring: null,
    els: [
      { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
      { x: 325, y: 312, w: 18, h: 18, kind: 'check', on: 1, bg: '18,160,106', bd: '18,160,106', rd: 6 },
      ...(own ? [{ x: 328, y: 315, w: 12, h: 12, kind: 'image', icon: APP_TICK }] : [])
    ]
  })
  const draw = own => frameOf(renderWireframe([{ before: lay(own), after: lay(own), values: [] }], { id: 'R1' }).svg, 0)
  const house = draw(false); const app = draw(true)
  const ticks = s => (s.match(/<path[^>]*stroke="var\(--paper\)"/g) || []).length
  assert.equal(ticks(house), 1, 'with nothing inside it, the house draws the tick')
  assert.equal(ticks(app), 1, 'and with the app\'s own tick icon inside it, still exactly one')
  assert.match(app, /<path d="M5 12l5 5 9-10"/, 'and it is the app\'s own — the house stands down')
  assert.ok(!/<path d="M[\d.]+ [\d.]+L/.test(app), 'the house tick is not drawn over it')
  assert.deepEqual(mirrorGaps(lay(true), app, { focus: false }), [], 'the box and its icon are both still drawn')
})

test('mirror-11: the demo\'s real harvest is unmoved — zero gaps, the same rings and veils', () => {
  // (rule 4, 2026-09-02: this pin used to count EVERY `stroke="var(--ai)"` in the whole drawing and
  // call the total "the rings". mirror-10 made an icon draw its own lines, so a sidebar icon whose
  // measured ink lands on indigo legitimately adds strokes carrying that token — the count went
  // 14 → 71 on a re-harvest that had moved no ring at all. A ring is asked for by its OWN signature
  // instead: the paper halo ringSVG paints outside every indigo ring.)
  // (rule 4 again, 2026-09-04: the demo was re-harvested for phase 4b, and R1's halo count moved
  // 4 → 6 with ZERO new gaps. The halo is drawn per RINGED SHAPE, not per ringed scene: since the
  // capture began measuring the ring target and its subtree FIRST (2026-09-03), two of R1's scenes
  // ring a wrapper AND the leaf inside it, so one scene draws two halos. The VEIL is the per-scene
  // signature — one wash per ringed scene — so the two are pinned as the different numbers they are
  // rather than being asserted equal. The harvest moved; the pin moves with it.)
  for (const [id, vals, rings, veils] of [['R1', ['v1', 'v2', 'v3'], 6, 4], ['R3', ['v1', 'v2'], 3, 3]]) {
    const L = n => JSON.parse(readFileSync(new URL(`${id}.b1.${n}.layout.json`, DEMO_EV), 'utf8'))
    const beat = { before: L('before'), after: L('after'), values: vals.map(L) }
    const d = renderWireframe([beat], { behavior: GUARDB, id, pass: true })
    assert.equal(d.gaps.length, vals.length + 2, `${id}: a gap report per frame`)
    for (const g of d.gaps) assert.deepEqual(g.gaps, [], `${id} frame ${g.frame} — ${gapSummary(g.gaps)}`)
    assert.equal((d.svg.match(/<rect[^>]*stroke="var\(--paper\)"[^>]*opacity="0\.92"/g) || []).length, rings,
      `${id}: every ring the harvest asked for`)
    assert.equal((d.svg.match(/opacity="0\.12"/g) || []).length, veils, `${id}: and one veil per ringed scene`)
    assert.equal(veils, [beat.before, ...beat.values, beat.after].filter(l => l && l.ring).length,
      `${id}: the veil count IS the harvest's own ringed-scene count`)
    tokensOnly(d.svg)
  }
})

test('mirror-11: the demo\'s own container ring, measured per shape, draws track and arc apart', () => {
  // The real R3 harvest, with the two circles' colours filled in as the mirror-11 capture records
  // them (the committed files are a mirror-10 harvest and carry only the icon-level `fg` — black).
  const paint = L => ({
    ...L,
    els: L.els.map(e => (e.icon && e.icon.vb && e.icon.vb[2] === 26 && e.icon.shapes.length === 2
      ? { ...e, icon: { ...e.icon, shapes: [
          { ...e.icon.shapes[0], sc: '223,226,233', sw: 3 },
          { ...e.icon.shapes[1], sc: '79,70,229', sw: 3 }
        ] } }
      : e))
  })
  const L = n => paint(JSON.parse(readFileSync(new URL(`R3.b1.${n}.layout.json`, DEMO_EV), 'utf8')))
  const d = renderWireframe([{ before: L('before'), after: L('after'), values: ['v1', 'v2'].map(L) }],
    { behavior: GUARDB, id: 'R3', pass: true })
  for (const g of d.gaps) assert.deepEqual(g.gaps, [], `frame ${g.frame} — ${gapSummary(g.gaps)}`)
  assert.match(d.svg, /<circle cx="13" cy="13" r="9" fill="none" stroke="var\(--ink-4\)" stroke-width="3"/,
    'the track is the pale neutral the page paints it')
  assert.match(d.svg, /<circle cx="13" cy="13" r="9" fill="none" stroke="var\(--ai\)" stroke-width="3"/,
    'and the progress arc is indigo — not the black the svg\'s own colour would have made both')
  tokensOnly(d.svg)
})

// ── STALE BY LAYOUT, NOT ONLY BY TEXT (the human, 2026-09-02) ────────────────────────────────────
// A drawing can stop being true two ways: the requirement is reworded (data-stale, the text pin), or
// the APP MOVES and the harvest beside it is newer than the drawing (this). Both are baked onto the
// same figure, both are said by the one storyline banner, and both can be true at once.
test('renderSchematic bakes the layout-stale mark beside the text-stale one', () => {
  const d = deriveSchematic(CLEAR)
  const viz = { svg: d.svg, phases: d.phases, hash: vizHash(CLEAR), textHash: vizHash(CLEAR), at: '2026-09-02', stale: false }
  assert.ok(!/data-viz-layout-stale/.test(renderSchematic({ viz })), 'a current drawing carries no layout mark')
  const moved = renderSchematic({ viz }, true)
  assert.match(moved, /data-viz-layout-stale="1"/, 'the harvest has moved past this drawing')
  assert.ok(!/ data-stale="1"/.test(moved), 'and that is not the same fact as the text having moved')
  const both = renderSchematic({ viz: { ...viz, stale: true } }, true)
  assert.match(both, / data-stale="1"/)
  assert.match(both, /data-viz-layout-stale="1"/)
})

// ── mirror-12: ON A FAILED BEAT THE DRAWING SHOWS THE INTENT ────────────────────────────────────
// The human, 2026-09-02, on Tsumiki's R9 (the demo's deliberately failing requirement): "for the
// failed test case, schematic should be correct (schematic and behaviour are truth — otherwise user
// should disagree this truth and update it). But now even the schematic is wrong as well, please
// update." Until now the mirror drew the ringed element's MEASURED text on every scene, pass or
// fail — so a beat that expected "5" and read "4" drew 4, agreeing with the photograph and leaving
// nothing on the row that says what the requirement asks for. The two cells are not two copies of
// one fact: the DRAWING is the authored intent, the PHOTOGRAPH is what the app did, and the row is
// the comparison. So on a scene whose claim failed, the ringed value is drawn as the EXPECTED one —
// in the same asserted ink as any measured value, with the callout unchanged (the "got 4 ✕" is the
// burn-in's, and stays the burn-in's alone).
// The demo's harvest is the REAL thing and moves: since 2026-09-02 R9 also photographs the task
// about to be deleted and the list where it stood (v2, v3), and every value frame carries its own
// claim. These tests are about the RULE, not the demo's current shape — so they take the first value
// and the LAST one (the counter check, the one that fails) and strip the on-disk claims first, then
// inject exactly the claim each case is about.
const R9L = n => JSON.parse(readFileSync(new URL(`R9.b1.${n}.layout.json`, DEMO_EV), 'utf8'))
const stripClaim = L => { const { claim, ...rest } = L; return rest }
const r9Last = () => { let k = 1; while (existsSync(new URL(`R9.b1.v${k + 1}.layout.json`, DEMO_EV))) k++; return k }
const R9BEH = b('five open leaves and a delete', 'you delete one', 'To do still reads 5 — a delete is only an archive')
const r9Beat = claim => ({
  before: stripClaim(R9L('before')),
  after: stripClaim(R9L('after')),
  values: [stripClaim(R9L('v1')), claim ? { ...stripClaim(R9L('v' + r9Last())), claim } : stripClaim(R9L('v' + r9Last()))]
})
const drawR9 = claim => renderWireframe([r9Beat(claim)], { behavior: R9BEH, id: 'R9', pass: !claim || claim.ok !== false })
// the counter's own value, wherever the overlay typed it: the NUMBER standing at the drawn
// counter's x — the one box this beat rings and reads (its "to do" label stands at the same x)
const valuesAt = (frame, x) => [...String(frame).matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)]
  .filter(m => new RegExp('x="' + x + '"').test(m[1])).map(m => m[2]).filter(t => /^\d+$/.test(t))
const COUNTER_X = '420.9'
const FAILED = { expected: '5', got: '4', ok: false }

test('mirror-12: a failed claim draws the EXPECTED value on the ringed element, not the measured one', () => {
  const f = frameOf(drawR9(FAILED).svg, 2)                      // the beat's second asserted value: the failing one
  assert.deepEqual(valuesAt(f, COUNTER_X), ['5'],
    'the drawing shows what the requirement asks for — the photograph beside it keeps the 4 it read')
  assert.match(f, new RegExp('<text x="' + COUNTER_X + '"[^>]*fill="var\\(--ai\\)"[^>]*>5</text>'),
    'and in the same asserted ink as any measured value — the intent is not a second kind of mark')
  assert.ok(!/got/.test(f), 'the callout stays the sentence the burn-in chose; “got 4 ✕” is the photograph’s')
})

test('mirror-12: the beat\'s AFTER frame carries the same intent — it is the intended end state', () => {
  const d = drawR9(FAILED)
  assert.deepEqual(valuesAt(frameOf(d.svg, 3), COUNTER_X), ['5'],
    'the after frame has no claim of its own, so it takes the beat\'s last failed one')
  assert.deepEqual(valuesAt(frameOf(d.svg, 1), COUNTER_X), ['5'],
    'the earlier value passed and is drawn exactly as it was measured')
})

test('mirror-12: a claim that PASSED changes nothing — the mirror still draws what was measured', () => {
  const d = drawR9({ expected: '4', got: '4', ok: true })
  assert.deepEqual(valuesAt(frameOf(d.svg, 2), COUNTER_X), ['4'])
  assert.deepEqual(valuesAt(frameOf(d.svg, 3), COUNTER_X), ['4'])
})

test('mirror-12: the guard reads the SUBSTITUTED value as the truth — a missing 5 is the gap now', () => {
  const d = drawR9(FAILED)
  for (const g of d.gaps) assert.deepEqual(g.gaps, [], `frame ${g.frame} — ${gapSummary(g.gaps)}`)
  // …and the gate's own path (tools/proof-integrity.mjs checkMirrors): the frame re-read against the
  // skeleton the report says it was drawn from, which must carry the intent with it
  for (const fr of d.gaps) {
    assert.deepEqual(mirrorGaps(fr.layout, frameOf(d.svg, fr.frame), { focus: fr.focus, anchors: fr.anchors, h: fr.h }), [],
      `frame ${fr.frame} re-checked from its own input`)
  }
  const fr = d.gaps[2]
  const cut = frameOf(d.svg, 2).replace(new RegExp('<text x="' + COUNTER_X + '"[^>]*>5</text>'), '')
  const gaps = mirrorGaps(fr.layout, cut, { focus: true, h: fr.h })
  assert.equal(gaps.length, 1, gapSummary(gaps))
  assert.match(gaps[0].what, /5/, 'the intended value is what the frame owes — never the measured 4')
})

test('mirror-12: the real R9 harvest, claimless as it is on disk, draws exactly as it did', () => {
  const d = drawR9(null)
  assert.equal(d.gaps.length, 4, 'the given, two asserted values, the result')
  for (const g of d.gaps) assert.deepEqual(g.gaps, [], `frame ${g.frame} — ${gapSummary(g.gaps)}`)
  assert.deepEqual(valuesAt(frameOf(d.svg, 2), COUNTER_X), ['4'], 'no claim, no intent — the measurement stands')
  const rings = s => (s.match(/stroke="var\(--ai\)"/g) || []).length
  const dims = s => (s.match(/opacity="0\.12"/g) || []).length
  const withClaim = drawR9(FAILED).svg
  assert.equal(rings(withClaim), rings(d.svg), 'the intent moves a value, never the overlay')
  assert.equal(dims(withClaim), dims(d.svg))
  tokensOnly(withClaim)
})

// ── MIRROR-13: A FAILED SCENE IS DRAWN FROM THE LAST STATE THE APP GOT RIGHT (2026-09-02) ────────
// The human, on the demo's deliberately failing R9, one kit after mirror-12 put the expected value
// on the ringed element: "the failed test case is so fucking wrong, the schematic should be correct,
// only the proof should be wrong." The rest of a failed scene was still the app's wrong picture —
// the task drawn already gone, no Undo anywhere. Now the scene borrows the beat's last passing
// skeleton and puts every failed claim's expected value where it belongs: a removed element found
// by its expected text, a wrong value by the ring's box, a never-there one drawn beside the ring.
const PAGE13 = (count, titles, ring, focusOn, claim) => {
  const els = [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container', text: '' },
    { x: 1290, y: 96, w: 60, h: 40, kind: 'text', text: count, fs: 24, ...(focusOn === 'count' ? { focus: true } : {}) }
  ]
  titles.forEach((t, i) => {
    const y = 200 + i * 60
    els.push({ x: 300, y, w: 800, h: 48, kind: 'container', text: t })
    els.push({ x: 320, y: y + 12, w: 400, h: 24, kind: 'text', text: t, fs: 16, ...(focusOn === t ? { focus: true } : {}) })
  })
  return { w: 1440, h: 900, ring, els, ...(claim ? { claim } : {}) }
}
const THREE = ['Plan the team offsite', 'Pay the electricity bill', 'Renew passport']
const TWO13 = ['Plan the team offsite', 'Renew passport']
const PAY_BOX = { x: 320, y: 272, w: 400, h: 24 }          // the Pay row's title — and, after the delete, the place it stood
const COUNT_BOX = { x: 1290, y: 96, w: 60, h: 40 }
const R9_13 = [{
  before: PAGE13('5', THREE, null, null, null),
  values: [
    PAGE13('5', THREE, PAY_BOX, 'Pay the electricity bill', { expected: 'Pay the electricity bill', got: 'Pay the electricity bill', ok: true }),
    PAGE13('4', TWO13, PAY_BOX, null, { expected: 'Pay the electricity bill', got: '(missing)', ok: false, missing: true }),
    PAGE13('4', TWO13, PAY_BOX, null, { expected: 'Undo', got: '(missing)', ok: false, missing: true }),
    PAGE13('4', TWO13, COUNT_BOX, 'count', { expected: '5', got: '4', ok: false })
  ],
  after: PAGE13('4', TWO13, COUNT_BOX, 'count', null)
}]
const META13 = { behavior: b('the seeded list, with "To do" reading 5', 'you delete an open task', 'the delete is a soft archive — an Undo appears and "To do" still reads 5'), id: 'R9', title: 'A deleted task is reversible', pass: false }
const has = (frame, txt) => new RegExp('>' + txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<').test(frame)

test('mirror-13: a removed element is drawn where it was — from the last scene the app got right', () => {
  const d = renderWireframe(R9_13, META13)
  assert.match(d.svg, /data-viz-kit="mirror-13"/)
  const f1 = frameOf(d.svg, 1); const f2 = frameOf(d.svg, 2)
  assert.ok(has(f1, 'Pay the electricity bill') && has(f1, 'Renew passport'), 'the passing scene draws its own skeleton')
  // the failed scene: the app's skeleton has two rows and a 4; the drawing shows three rows and the 5
  assert.ok(has(f2, 'Pay the electricity bill'), 'the task the requirement says is only archived is still drawn')
  assert.ok(has(f2, 'Plan the team offsite') && has(f2, 'Renew passport'), 'the other rows too — the whole last right state')
  assert.ok(has(f2, '5') && !has(f2, '4'), 'the counter still reads what it read when the app was right')
  // …and the ring is on the archived task, where the claim points
  const S = 600 / 1440
  const rings = [...f2.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="[\d.]+" fill="none" stroke="var\(--ai\)" stroke-width="[\d.]+"\/>/g)]
  assert.ok(rings.some(r => Math.abs(Number(r[2]) - (PAY_BOX.y - RING.inset - RING.stroke / 2) * S) < 0.5), 'the ring strokes the archived task\'s own box: ' + rings.map(r => r[2]).join(','))
})

test('mirror-13: a never-there element is drawn beside the ring the beat last stood on, and claims accumulate', () => {
  const d = renderWireframe(R9_13, META13)
  const f3 = frameOf(d.svg, 3)
  assert.ok(has(f3, 'Undo'), 'the Undo the requirement asks for is drawn, though nothing measured one')
  assert.ok(has(f3, 'Pay the electricity bill'), 'and the archived task from the claim before it is still there')
  // beside the task's title, on its row
  const undo = /<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>Undo<\/text>/.exec(f3)
  assert.ok(undo, 'the Undo is typed as text')
  const S = 600 / 1440
  const words = 'Pay the electricity bill'.length * 16 * 0.58        // the title's words end well before its box does
  assert.ok(Number(undo[1]) > (PAY_BOX.x + words) * S - 1 && Number(undo[1]) < (PAY_BOX.x + PAY_BOX.w) * S, 'right after the title\'s words, inside its row: x=' + undo[1])
  assert.ok(Math.abs(Number(undo[2]) - (PAY_BOX.y + PAY_BOX.h / 2) * S) < 12 * S + 2, 'on the same row: y=' + undo[2])
})

test('mirror-13: a wrong value on a present element takes the expected one, and the after frame is the intended rest', () => {
  const d = renderWireframe(R9_13, META13)
  const f4 = frameOf(d.svg, 4); const f5 = frameOf(d.svg, 5)
  for (const [n, f] of [[4, f4], [5, f5]]) {
    assert.ok(has(f, '5') && !has(f, '4'), `frame ${n}: the counter reads the expected 5, never the measured 4`)
    assert.ok(has(f, 'Pay the electricity bill'), `frame ${n}: the archived task is still listed`)
    assert.ok(has(f, 'Undo'), `frame ${n}: with its Undo`)
  }
  // …and the guard agrees with every frame it drew — the derived skeleton IS the frame's input
  for (const g of d.gaps) assert.deepEqual(g.gaps, [], `frame ${g.frame} has no mirror gap`)
  assert.equal(d.gaps.length, 6, 'given + four scenes + the rest')
  // the pin is still the harvest's — deriving the intent moves no drawing on its own
  assert.equal(/data-viz-layout="([^"]*)"/.exec(d.svg)[1], layoutHash(R9_13))
})

test('mirror-13: a beat that passed is drawn from its own skeletons, untouched', () => {
  const ok = [{ before: PAGE13('5', THREE, null, null, null), values: [PAGE13('5', THREE, PAY_BOX, 'Pay the electricity bill', { expected: 'Pay the electricity bill', got: 'Pay the electricity bill', ok: true })], after: PAGE13('4', TWO13, COUNT_BOX, 'count', null) }]
  const d = renderWireframe(ok, META13)
  const f2 = frameOf(d.svg, 2)
  assert.ok(!has(f2, 'Pay the electricity bill') && has(f2, '4'), 'the after frame is what the app showed — nothing failed, nothing is borrowed')
})

test('mirrorGaps: a ringed scene whose skeleton never measured the ringed element is a gap of its own (missing-focus)', () => {
  // 2026-09-03 (the human, on dojostack's House View): both value frames rang EMPTY SPACE in the
  // drawing — the capture had spent its element budget in document order and never reached the
  // ringed cell, so no element carried `focus` and the mirror drew the ring around nothing while the
  // photograph showed "4.00%". The scene still passed every word/plate rule, because those only ask
  // about what WAS measured. So the guard asks the one question the drawing cannot answer for
  // itself: does a ringed scene carry the element it rings?
  const L = GUARD(true)
  const unfocused = { ...L, els: L.els.map(e => { const c = { ...e }; delete c.focus; return c }) }
  const frame = frameOf(renderWireframe([{ before: GUARD(false), after: unfocused }], { behavior: GUARDB, id: 'R1', pass: true }).svg, 1)
  const gaps = mirrorGaps(unfocused, frame, { focus: true })
  assert.ok(gaps.some(g => g.kind === 'missing-focus'), 'a ringed scene with no focused element is named: ' + gapSummary(gaps))
  assert.ok(/missing-focus/.test(gapSummary(gaps)), 'and the summary a person reads says so')
  // …while the same skeleton WITH its ringed element is not a gap (the guard can pass)
  assert.ok(!mirrorGaps(GUARD(true), guardFrame(1), { focus: true }).some(g => g.kind === 'missing-focus'))
  // …and a scene with NO ring asks nothing of the kind
  assert.ok(!mirrorGaps(GUARD(false), guardFrame(0), { focus: false, anchors: [{ x: 271, y: 725.5, w: 738, h: 69.75 }] }).some(g => g.kind === 'missing-focus'))
})

// ── 2026-09-03, House View R1/R3/R7 on the fresh 0.42.0 capture: every REAL skeleton carried its ringed
// element, yet the three failed scenes still reported missing-focus. Their scenes are DERIVED
// (intendedLayout): the base — a ringless BEFORE frame, captured in document order — was already at
// the 360-element cap, intendedLayout APPENDED the intended leaf as element 361, and normLayout's own
// first-come draw cap cut exactly that one. The expected value was not drawn at all.
const FULL_BASE = (() => {
  // 360 painted boxes, none of them the header picker (the ringless before frame never reached it)
  const els = [{ x: 0, y: 0, w: 1440, h: 900, kind: 'container', text: '' }]
  for (let i = 0; els.length < 360; i++) {
    const y = 100 + (i % 40) * 18; const x = 260 + Math.floor(i / 40) * 110
    els.push({ x, y, w: 100, h: 16, kind: 'text', text: 'cell ' + i, fs: 11, bd: '226,232,240' })
  }
  return { w: 1440, h: 900, ring: null, els }
})()
const PICKER_BOX = { x: 1113, y: 6, w: 126, h: 28 }
// the VALUE frame: the same page, ring-first captured, so the picker IS there — reading "Live"
const PICKER_VALUE = (claim) => ({
  w: 1440, h: 900, ring: PICKER_BOX, claim,
  els: [
    ...FULL_BASE.els.slice(0, 300),
    { x: 1112, y: 6, w: 224, h: 28, kind: 'container', text: '', bg: '255,255,255', bd: '203,213,225', rd: 8 },
    { ...PICKER_BOX, kind: 'button', text: 'Version Live · May 2031', focus: true, fs: 11, ta: 'c' },
    { x: 1121, y: 1, w: 43, h: 10, kind: 'text', text: 'Version', fs: 10 },
    { x: 1131, y: 12, w: 22, h: 16, kind: 'text', text: 'Live', focus: true, fs: 11, fw: 1 }
  ]
})
const PICKER_META = { behavior: b('a live House View version', 'you read the header version picker', 'it states the version\'s track as a plain word — Published'), id: 'R3', title: 'The picker states the track', pass: false }

test('the draw cap never drops the ringed element — a failed scene on a full base still types its expected value', () => {
  const failed = PICKER_VALUE({ expected: 'Published', got: 'Live', ok: false })
  const d = renderWireframe([{ before: FULL_BASE, values: [failed], after: PICKER_VALUE(null) }], PICKER_META)
  const f1 = frameOf(d.svg, 1)
  assert.ok(has(f1, 'Published'), 'the expected word is drawn in the failed scene')
  const g1 = d.gaps[1]
  assert.ok(g1.layout.els.some(e => e.focus), 'the frame\'s own reported skeleton carries its ringed element')
  assert.deepEqual(g1.gaps.filter(g => g.kind === 'missing-focus'), [], 'and the guard has no missing-focus to raise: ' + gapSummary(g1.gaps))
  assert.ok(g1.layout.els.length <= 360 || g1.layout.els.some(e => e.focus), 'past the cap, what goes is never the ringed element')
})

test('a present element the ringless base never measured is BORROWED from the value skeleton, not invented beside the ring', () => {
  const failed = PICKER_VALUE({ expected: 'Published', got: 'Live', ok: false })
  const d = renderWireframe([{ before: FULL_BASE, values: [failed], after: PICKER_VALUE(null) }], PICKER_META)
  const L1 = d.gaps[1].layout
  const picker = L1.els.find(e => e.kind === 'button' && Math.abs(e.x - PICKER_BOX.x) < 1 && Math.abs(e.w - PICKER_BOX.w) < 1)
  assert.ok(picker, 'the picker button stands in the intended scene where the app has it (from the value skeleton)')
  assert.ok(/Published/.test(picker.text) && !/Live/.test(picker.text), 'and it reads the expected track, not the measured one: ' + picker.text)
  assert.ok(!L1.els.some(e => e.synthetic && e.text === 'Published'), 'no synthetic leaf is placed beside the ring — the element exists')
  const f1 = frameOf(d.svg, 1)
  assert.ok(has(f1, 'Published') && !has(f1, 'Live'), 'the drawing shows Published where Live was measured')
})

test('a wrong value on a present element: the leaf INSIDE the ringed box that reads the measured value takes the expected one — never a leaf invented beside it', () => {
  // 2026-09-03, House View R3 on the board after 0.42.2: the base now HAD the picker (a button whose
  // box the ring is around, holding a small "Live" leaf and a "Version" label), but the area-ratio
  // rule rejected the small leaf, borrowing found nothing new, and "Published" was typed as a new leaf
  // BESIDE the picker — in the Month box — and ringed there.
  const withPicker = (claim, ring) => ({
    w: 1440, h: 900, ring, claim,
    els: [
      { x: 0, y: 0, w: 1440, h: 900, kind: 'container', text: '' },
      { x: 1112, y: 6, w: 224, h: 28, kind: 'container', text: '', bg: '255,255,255', bd: '203,213,225', rd: 8 },
      { ...PICKER_BOX, kind: 'button', text: 'Version Live · May 2031', fs: 11, ta: 'c', ...(ring ? { focus: true } : {}) },
      { x: 1121, y: 1, w: 43, h: 10, kind: 'text', text: 'Version', fs: 10 },
      { x: 1131, y: 12, w: 22, h: 16, kind: 'text', text: 'Live', fs: 11, fw: 1, ...(ring ? { focus: true } : {}) },
      { x: 1247, y: 6, w: 90, h: 28, kind: 'button', text: 'May 2031', fs: 11 }        // the Month picker beside it
    ]
  })
  const base = withPicker(null, null)
  const failed = withPicker({ expected: 'Published', got: 'VersionLive·May 2031', ok: false }, PICKER_BOX)
  const d = renderWireframe([{ before: base, values: [failed], after: withPicker(null, PICKER_BOX) }], PICKER_META)
  const L1 = d.gaps[1].layout
  const live = L1.els.find(e => e.x === 1131 && e.w === 22)
  assert.equal(live && live.text, 'Published', 'the leaf the check read now says the expected word')
  assert.ok(!L1.els.some(e => e.synthetic), 'nothing is invented beside the picker')
  assert.equal(L1.els.find(e => e.x === 1247 && e.w === 90).text, 'May 2031', 'the Month picker beside it is untouched')
  assert.ok(L1.ring && L1.ring.x >= PICKER_BOX.x && L1.ring.x + L1.ring.w <= PICKER_BOX.x + PICKER_BOX.w + 1, 'the ring stays within the picker: ' + JSON.stringify(L1.ring))
  const f1 = frameOf(d.svg, 1)
  assert.ok(has(f1, 'Published') && !has(f1, 'Live'))
})

// ── WHICH PICTURE A REQUIREMENT GETS (2026-09-04, the review's I2) ──────────────────────────────
// The human's Expected View decision retired the drawn ui-mirror, and tools/build-board.mjs now
// refuses to bake ANY wireframe, whatever produced it. The derive pass still had a mirror branch
// gated on "has a replica on disk", so a requirement harvested WITH skeletons but whose replica
// capture failed still had a wireframe derived, committed, and gated by `npm run proof mirror` — a
// file that is written at every fold, can redden the gate, and can never be displayed. The choice is
// stated once, here, where it can be pinned.
test('pictureFor: a requirement the run HARVESTED gets no drawing at all — its picture is the replica', () => {
  assert.deepEqual(pictureFor({ harvested: true, replicated: true, hasBehavior: true }), { draw: null, retire: true })
  // …and that is true even where the replica capture failed: a wireframe nothing bakes is a file
  // nobody can see, and a gap in it reddens the gate for a picture that does not exist
  assert.deepEqual(pictureFor({ harvested: true, replicated: false, hasBehavior: true }), { draw: null, retire: true })
})
test('pictureFor: a requirement with NO harvest keeps its sketch — the no-UI case the kit was always right for', () => {
  assert.deepEqual(pictureFor({ harvested: false, replicated: false, hasBehavior: true }), { draw: 'archetype', retire: true })
})
test('pictureFor: no harvest and no behavior shape is honestly no picture, never a guess', () => {
  assert.deepEqual(pictureFor({ harvested: false, replicated: false, hasBehavior: false }), { draw: null, retire: true })
})
test('pictureFor: a committed WIREFRAME is retired in every case — nothing bakes one any more', () => {
  for (const h of [true, false]) {
    for (const r of [true, false]) {
      for (const b of [true, false]) {
        assert.equal(pictureFor({ harvested: h, replicated: r, hasBehavior: b }).retire, true,
          JSON.stringify({ h, r, b }))
      }
    }
  }
})
