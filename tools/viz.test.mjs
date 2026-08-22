// tools/viz.test.mjs — the drawn schematic (requirement schematics spec 2026-08-18, task 4).
// Pure red-first units: a behavior chain maps DETERMINISTICALLY to an archetype and from there to a
// house-style animated SVG — no model, no fs, no browser. The no-match → null contract is the
// honesty rule: a requirement the kit cannot draw stays text-only, never a wrong picture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vizHash, vizStale, matchArchetype, deriveSchematic } from './viz.mjs'
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
