import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page, Locator } from '@playwright/test'
import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBehavior } from '../tools/behavior.mjs'
// THE OVERLAY'S GEOMETRY, SHARED (2026-08-30). The ring's inset and the callout's placement are ONE
// rule now, stated in tools/overlay-geometry.mjs and imported by both this burn-in and the drawn
// schematic that mirrors it (tools/viz.mjs). They used to keep private copies of the same numbers
// and drifted: an audit of the demo's R1 beat cells found the drawn ring ~12 page px out from the
// element box where this one is ~5. This file is the REFERENCE — the module states its rules, it
// never invents new ones, and nothing about what the burn-in paints changes.
import { RING, CARD, WASH, ringBox, calloutSpot } from '../tools/overlay-geometry.mjs'
// …and the callout's WORDS from the module that owns them (2026-08-30), so the burned card and the
// drawn one say the same sentence for the same scene of the same beat.
import { calloutText, CALLOUT_TYPE, calloutLines, calloutLabelWidth } from '../tools/callout-text.mjs'
// the layout skeleton's walk — ONE self-contained function Playwright serialises into the page
// (2026-09-03: moved out of snapLayout's inline closure so tools/layout-walk.test.mjs can pin what
// it must always capture — see the module's header)
// @ts-ignore — a plain .mjs beside the spec; Playwright's loader takes it, tsc never sees this file
import { snapLayoutWalk } from './_layout-walk.mjs'
// …and the ACTUAL REPLICA's capture beside it (2026-09-03, the human's decision that day: the
// picture beside a proof is a REAL HTML replica of the app's own component, not a drawing of it).
// Self-contained for the same reason and serialised the same way; REPLICA_PROPS is the ONE property
// list and travels IN through the arg, because a module reference is undefined inside the page.
// @ts-ignore — a plain .mjs beside the spec; Playwright's loader takes it, tsc never sees this file
import { captureReplica, REPLICA_PROPS } from './_replica.mjs'
// …and the two of them COMPOSED INTO ONE PAGE EXPRESSION (task 3b, item 1, 2026-09-04): the
// skeleton and the replica are two readings of one moment, and taking them in two evaluates gave an
// SPA several hundred ms to settle a view change between them — the gate then read every difference
// as a replica gap (board R3/R5/R11 came and went across runs with nothing aimed at them). See
// spec/_moment.mjs: one pass, no yield, and the walk's own answers (the ringed element it actually
// measured, the boxes it dropped as occluded) handed straight to the capture.
import { momentFunction } from './_moment.mjs'
// THE REPLICA'S GATE (phase 3, 2026-09-03). What "the replica looks like the app" MEANS lives in one
// pure module, read here at capture time and by `npm run proof mirror` alike; `layoutHash` is the
// same pin the drawing is stamped with, so a replica and a drawing of one moment agree about which
// harvest they came from.
import { replicaGaps, claimGaps, textOf, withReplicaAttrs, GATE_BYTE_RESERVE } from '../tools/replica-gate.mjs'
import { layoutHash } from '../tools/viz.mjs'

export { expect }

const SPEC_DIR = dirname(fileURLToPath(import.meta.url))

// Wait for DATA, not just the shell. A real app's chrome (nav, headers, empty table) paints instantly;
// the rows, the chart, the numbers arrive after an API call. A test that asserts the page "loaded"
// passes BEFORE that data exists — the smoke-alarm-with-the-battery-out this project warns about, and
// exactly what a guessed characterization test falls into by default. Await a real content locator (a
// table row, a grid cell, an API-derived value) before asserting on it, so the test proves the screen
// actually works rather than that it merely rendered its frame. kg-e2e says to assert on THIS, not the
// chrome. Example:  await waitForContent(page.getByRole('row'));  await expect(page.getByRole('row')).toHaveCount(...)
export async function waitForContent (locator: Locator, opts: { timeout?: number } = {}) {
  await expect(locator.first()).toBeVisible({ timeout: opts.timeout ?? 15000 })
}

// One browser window, held OPEN for the whole run, when the board asks to watch it
// (BOARD_ONE_WINDOW).
//
// Playwright gives each test its own context and page, and in a headed browser that means a window
// opening and closing around every test. Two things were tried and rejected: sharing only the
// context still let the per-test page close, and closing the last page of a context closes its
// window; sharing the page itself broke tests that were written to start from a fresh one.
//
// So: a worker-scoped context, and a worker-scoped KEEPALIVE page that opens once and never
// closes. The keepalive holds the window open for the whole run, while each test still gets its
// own fresh page (a tab) in that same window — full per-test isolation, one window that never
// blinks out. Only for watching; the deterministic suite never sets BOARD_ONE_WINDOW.
const windowed = process.env.BOARD_ONE_WINDOW
  ? base.extend<{ page: Page }, { _sharedContext: BrowserContext, _keepalive: Page }>({
      _sharedContext: [async ({ browser }, use) => {
        // A HAND-MADE context does NOT inherit playwright.board.ts's `use` options — Playwright only
        // applies those to the context IT builds, which one-window mode replaces. So the viewport and
        // (critically) the video recording must be passed here by hand, or a WATCHED run silently
        // records nothing (page.video() is null) and shrinks the app to the 1280×720 default — the
        // recording a person just watched comes back blank/unplayable. Match the config exactly:
        // full-size viewport, and video only under a board recording (BOARD_RECORD).
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          ...(process.env.BOARD_RECORD
            ? { recordVideo: { dir: process.env.BOARD_RECORD, size: { width: 1440, height: 900 } } }
            : {})
        })
        await use(context)
        await context.close()
      }, { scope: 'worker' }],
      // a single page that stays open the whole run, so the window always has at least one tab and
      // therefore never closes between tests
      _keepalive: [async ({ _sharedContext }, use) => {
        const page = await _sharedContext.newPage()
        await use(page)
      }, { scope: 'worker' }],
      // each test still gets its own page in the shared window — isolation kept, window kept
      page: async ({ _sharedContext, _keepalive }, use) => {
        const page = await _sharedContext.newPage()
        await use(page)
        await page.close()
      }
    })
  : base

// The page of the test currently running, stashed so checkReq and the HUD can paint into it
// without every call site threading `page` through. Safe because the suite runs ONE worker
// (playwright.board.ts workers:1) — one test, one page, at a time.
let CURRENT_PAGE: Page | null = null
export const test = windowed.extend<{ page: Page, _failAggregate: void }>({
  page: async ({ page }, use, testInfo) => {
    CURRENT_PAGE = page
    FLOW_N = 0
    FLOW_DEPTH = 0
    FAILED_PAINTED = false
    STEP_FAILURES = []
    REQ_CHIPS = []
    PROVING = null; CLAIM = null; NOTE = ''; BEHAVIOR = null
    BEAT_IDX = 0; BEAT_CURSOR = {}; LAST_BOX = null; LAST_TARGET = null; CUR_CHECK = null
    LAST_LAYOUT = null; LAST_PIN = ''
    // The intro line has no beat — it plays from the start of the video (≈ this fixture running,
    // which is when the recording context opens). Reserving it here makes the FIRST beat wait it
    // out like any other line, so the opening narration finishes before the bar starts moving.
    NARRATE_UNTIL = paceRules()?.introMs ? Date.now() + paceRules()!.introMs : 0
    try {
      await use(page)
    } finally {
      CURRENT_PAGE = null
      // Attach this page's recording OURSELVES exactly when Playwright won't — otherwise the board's
      // reporter finds no .webm and the run comes back unplayable. A page's video only FINALISES when
      // the page closes, so close it here, then saveAs() into the test's output dir and attach it.
      // Two cases we must handle ourselves:
      //   • ONE-WINDOW (a WATCHED run): the shared context is hand-made, so Playwright auto-attaches
      //     NOTHING — pass or fail — and every watched run would otherwise have no video at all.
      //   • a FAILED default run: closing the page here FINALISES the recording before we save it, so
      //     the failed run's video is complete and playable (board R10; release 0.16.1). We write it
      //     to the same outputPath Playwright uses, so this is a finalised copy, not a duplicate file.
      // A PASSING default run is left alone: Playwright auto-attaches its finalised video at context
      // teardown, so touching it here would only add a redundant reference. The built-in page teardown
      // that follows closes an already-closed page harmlessly. Best-effort, and only under a recording.
      const oneWindow = !!process.env.BOARD_ONE_WINDOW
      const failed = !!(testInfo.status && testInfo.status !== testInfo.expectedStatus)
      if (process.env.BOARD_RECORD && (oneWindow || failed)) {
        try {
          const v = page.video && page.video()
          if (v) {
            await page.close().catch(() => {})            // finalise the recording
            const dest = testInfo.outputPath('video.webm')
            await v.saveAs(dest)
            if (!testInfo.attachments.some(a => a.contentType === 'video/webm')) {
              testInfo.attachments.push({ name: 'video', path: dest, contentType: 'video/webm' })
            }
          }
        } catch { /* the recording just could not be saved — nothing more to do */ }
      }
    }
  },
  // A flow ran every step and collected its failures rather than dying at the first (board R10).
  // Now close the loop: paint ONE final red summary — so the recording's cover frame shows the
  // failure (not a later green step) and names every part that broke — then FAIL the test with all
  // of them.
  //
  // An AUTO FIXTURE, not test.afterEach (moved 2026-08-21; the human ratified exit honesty): a
  // module-scope afterEach in this shared, worker-cached module registered only for the FIRST spec
  // file loaded per worker (spec/_modes, since '_' < 'b'), so under workers:1 every later file
  // (board, conflicts, dispatch, init) ran with NO aggregate at all — checkReq's continue-on-
  // failure path pushed to STEP_FAILURES and nothing ever threw. The test reported "passed" and
  // `npm run e2e` exited 0 over failed proves-steps; only the index stayed honest (coverage reads
  // the steps' own errors). A fixture on the extended `test` object travels WITH the object into
  // every importing file, whatever the load order or module caching. It depends on `page` so its
  // teardown runs BEFORE the page fixture's (reverse setup order): CURRENT_PAGE is still live for
  // the red summary paint, and the throw lands before the page teardown reads testInfo.status for
  // the failed-run video finalisation — the exact ordering the afterEach had.
  _failAggregate: [async ({ page }, use, testInfo) => {
    void page                       // dependency only — ordering, see above
    await use()
    if (!STEP_FAILURES.length) return
    const f = STEP_FAILURES
    if (CURRENT_PAGE) {
      // titles only, no ordinals — beside a strip of R-chips, a "✗ 2." reads like a requirement
      // number and the whole point of the card is to be unmistakable. The failed list goes on the
      // note line; the claim is cleared so a stale got/expected doesn't front the summary.
      CLAIM = null
      NOTE = f.map(s => '✗ ' + s.title).slice(0, 6).join('\n')
      await paintHud({
        head: '✗ ' + f.length + ' of this test’s steps failed',
        failed: true
      }).catch(() => {})
      await CURRENT_PAGE.waitForTimeout(1400).catch(() => {})
      // Playwright's automatic screenshot fires BEFORE this teardown, so on its own the run's cover
      // shows the last step's paint — a green frame fronting a failed run. Shoot the red summary
      // and attach it as a file (the reporter keeps only the LAST .png attachment as the cover).
      try {
        const cover = testInfo.outputPath('failure-cover.png')
        await CURRENT_PAGE.screenshot({ path: cover })
        await testInfo.attach('failure-cover', { path: cover, contentType: 'image/png' })
      } catch { /* a closed page loses the cover, never the failure below */ }
    }
    const lines = f.map(s => '  ✗ ' + (s.n ? 'step ' + s.n + ' ' : '') + '"' + s.title + '": ' +
      String(s.message).split('\n')[0]).join('\n')
    throw new Error(f.length + ' step(s) failed:\n' + lines)
  }, { auto: true }]
})

// The BEAT LOG — the run's own timeline, for cutting a voice-over or subtitle track against the
// recording. When BOARD_BEAT_LOG names a file, every flowStep, checkReq and narration line appends
// one JSONL row `{t, kind, label}` with its wall-clock time. Off (the default) it costs nothing.
// Append-only and best-effort: a beat that cannot be written must never fail a step.
function beat (kind: string, label: string): void {
  const file = process.env.BOARD_BEAT_LOG
  if (!file) return
  try { appendFileSync(file, JSON.stringify({ t: Date.now(), kind, label }) + '\n') } catch { /* timeline only */ }
}

// THE PACE GATE — the topbar must never outrun the voice. A narrated recording synthesizes its
// lines BEFORE the run (the screen's narration pack, tools/narrate-run.mjs), so every line's
// duration is known; BOARD_NARRATION_PACE names a JSON file of {on, match, ms} rules and this gate
// holds each new beat until the previous line has finished speaking. Sync by construction — the
// subtitle can never still be explaining R1 while the bar has moved on. Off (no env) it costs
// nothing, so a plain suite run and an unnarrated recording are exactly as fast as before.
let PACE: { gap: number, introMs: number, rules: { on: string, re: RegExp, ms: number }[] } | null | undefined
function paceRules () {
  if (PACE !== undefined) return PACE
  const file = process.env.BOARD_NARRATION_PACE
  if (!file) return (PACE = null)
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    PACE = {
      gap: Number(j.gap ?? 250),
      introMs: Number(j.introMs) || 0,
      rules: (j.cues || []).map((c: any) => ({ on: String(c.on), re: new RegExp(String(c.match)), ms: Number(c.ms) || 0 }))
    }
  } catch { PACE = null }
  return PACE
}
let NARRATE_UNTIL = 0
// wait=true (a beat that STARTS something): first wait out the line still speaking, then reserve
// this beat's own line. wait=false (a done-beat): the ✗/✓ paint must land immediately — only
// reserve its line so the NEXT beat waits it out.
async function paceGate (kind: string, label: string, wait = true): Promise<void> {
  const p = paceRules()
  if (!p) return
  if (wait) {
    const hold = NARRATE_UNTIL - Date.now()
    if (hold > 0 && CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(hold).catch(() => {})
  }
  const rule = p.rules.find(r => r.on === kind && r.re.test(label))
  if (rule) NARRATE_UNTIL = Math.max(Date.now(), NARRATE_UNTIL) + rule.ms + p.gap
}

// Per-test narration state: the story-step counter, whether we are inside a flowStep (a nested
// checkReq must not steal the narrative headline), and whether the red failure frame has already
// been painted (an inner failure bubbles — paint once, at the most specific point).
let FLOW_N = 0
let FLOW_DEPTH = 0
let FAILED_PAINTED = false
// Every step that failed THIS test. A flow does NOT abort at the first failure — it records each
// one here and keeps going, so the recording reaches every step (incl. the ones that scroll a
// table into view) and the board can show WHICH parts failed, not just the first (board R10). The
// _failAggregate fixture paints a final red summary and fails the test if this is non-empty.
let STEP_FAILURES: { n: number, title: string, message: string }[] = []

// The REQUIREMENT CHIP STRIP — one chip per id the flow covers, painted into the topbar so a watcher
// always knows WHICH requirement the recording is proving and how far the proof has come. States
// advance pending → active (its checkReq is running) → passed / failed, and per the design rule hue
// never carries the state alone: active wears ▸, passed ✓, failed ✕. Seeded by coverReqs (the
// declared set), grown by checkReq for any id proven without a declaration. Per-test, like the HUD.
let REQ_CHIPS: { id: string, state: 'pending' | 'active' | 'pass' | 'fail' }[] = []
function setChip (id: string, state: 'pending' | 'active' | 'pass' | 'fail'): void {
  const chip = REQ_CHIPS.find(c => c.id === id)
  // A requirement proven by SEVERAL checks is proven only if every one passes — so a fail is
  // terminal for the chip: once red, a later passing check of the same id cannot turn it green
  // again (nor flip it back to ▸ active). The aggregate fixture still fails the test regardless;
  // this only keeps the strip honest when one id is checked more than once.
  if (chip) { if (chip.state === 'fail') return; chip.state = state }
  else REQ_CHIPS.push({ id, state })
}

// A requirement id in words: parse the screen's prd.md heading (`## R5 — Title`) once per screen.
// A bare id belongs to the running spec file's own screen; a qualified one (`asset-plan:R5`) names
// its screen. Missing file or id → empty string, and the HUD falls back to the bare id.
const TITLE_CACHE: Record<string, Record<string, string>> = {}
function reqTitle (qid: string): string {
  const i = qid.indexOf(':')
  const scr = i > -1 ? qid.slice(0, i) : basename(dirname(String(test.info().file || '')))
  const rid = i > -1 ? qid.slice(i + 1) : qid
  if (!(scr in TITLE_CACHE)) {
    const map: Record<string, string> = {}
    try {
      const md = readFileSync(join(SPEC_DIR, scr, 'prd.md'), 'utf8')
      for (const m of md.matchAll(/^##\s+(R\d+)\s+—\s+(.+)$/gm)) map[m[1]] = m[2].trim()
    } catch { /* not every screen has a PRD yet — the HUD then shows the id alone */ }
    TITLE_CACHE[scr] = map
  }
  return TITLE_CACHE[scr][rid] || ''
}

// A requirement's BEHAVIOUR in words — its Given + When→Then beats — parsed from the SAME prd block
// the board's storyboard renders (tools/behavior.mjs), so the recording narrates a requirement in the
// exact words the left shows. Slice each `## R# — Title` heading's body (up to the next heading) and
// run the shared parser; a prose-only requirement (no beat block) yields null and the bar falls back
// to the bare requirement tag. Cached per screen like the titles.
const BEHAVIOR_CACHE: Record<string, Record<string, { given: string, beats: { when: string, then: string }[] } | null>> = {}
function reqBehavior (qid: string): { given: string, beats: { when: string, then: string }[] } | null {
  const i = qid.indexOf(':')
  const scr = i > -1 ? qid.slice(0, i) : basename(dirname(String(test.info().file || '')))
  const rid = i > -1 ? qid.slice(i + 1) : qid
  if (!(scr in BEHAVIOR_CACHE)) {
    const map: Record<string, { given: string, beats: { when: string, then: string }[] } | null> = {}
    try {
      const md = readFileSync(join(SPEC_DIR, scr, 'prd.md'), 'utf8')
      const heads = [...md.matchAll(/^##\s+(R\d+)\s+—\s+.+$/gm)]
      for (let j = 0; j < heads.length; j++) {
        const start = (heads[j].index || 0) + heads[j][0].length
        const end = j + 1 < heads.length ? (heads[j + 1].index || md.length) : md.length
        map[heads[j][1]] = parseBehavior(md.slice(start, end))
      }
    } catch { /* not every screen has a PRD yet — the bar then shows the id alone */ }
    BEHAVIOR_CACHE[scr] = map
  }
  return BEHAVIOR_CACHE[scr][rid] || null
}

// The in-video NARRATION, painted INTO the page under test so it is burned into the recording and
// its cover. Not a top banner (retired 2026-08-27 — it dumped the whole requirement up top,
// disconnected from the thing being proven, and shoved the app halfway down the frame). Instead a
// product-tour CALLOUT anchored to the element the check rings — the Arcade / Driver.js pattern: a
// light dim over the app, a ring on the proven element, and a small card beside it carrying the
// CURRENT beat in the requirement's own words (When → Then), the SAME words the board's storyboard
// shows on the left, so the two ends read as one language. pointer-events:none so it never swallows
// a click; inline styles (the design tokens) because it renders inside apps that know nothing of
// _design.css.
const HUD = { head: '' }
// The latest check's got vs expected — surfaced in the callout only on a FAILURE (a passing check's
// value is already named by the Then it proves). The full text still goes to the board as a `note:`
// step (emitNote); `ok` is kept so a caller can redden before the assertion throws.
let CLAIM: { label: string, expected: string, got: string, ok: boolean, missing?: boolean } | null = null
// One freeform line (hudNote), or the aggregate failure summary (multi-line, pre-wrapped).
let NOTE = ''
// The ACTIVE requirement as its Given / When → Then behaviour (parsed from the prd by reqBehavior —
// the same source the storyboard renders), plus its verdict: ▸ active while the checkReq runs, ✓
// proven, ✕ failed. BEAT_IDX is which When→Then the callout is on (a requirement proven by several
// checks advances through its beats — BEAT_CURSOR counts checkReq calls per id). Per-test.
type HudBeat = { when: string, then: string }
// (no `title` any more — the callout dropped the requirement title on 2026-08-30, and a field
// nothing reads is a field that quietly goes wrong)
let BEHAVIOR: { id: string, given: string, beats: HudBeat[], state: 'active' | 'pass' | 'fail' } | null = null
let BEAT_IDX = 0
let BEAT_CURSOR: Record<string, number> = {}
// The last ringed element's box, so a state change (the verdict flipping to ✓, a nav repaint) can
// re-render the callout in place without a fresh target. Cleared when a step starts clean.
type Box = { x: number, y: number, width: number, height: number }
let LAST_BOX: Box | null = null
// …and the Locator the ring is around (2026-09-03): snapLayout hands the element itself to the
// skeleton walk, so the ringed element is measured FIRST — never left to document order and the cap
let LAST_TARGET: Locator | null = null
// THE SKELETON THIS MOMENT WAS MEASURED WITH, and the pin of the very object that landed on disk
// (phase 3, 2026-09-03). The replica captured a moment later is gated against THIS reading — never a
// second walk of the live page, which would measure a page that has moved on — and stamped with this
// pin, so `npm run proof mirror` can tell a replica whose harvest has been re-taken since.
let LAST_LAYOUT: any = null
let LAST_PIN = ''
let LAST_FAILED = false
// Vestigial since the narration stopped rendering a "proving R5" line and the id strip (2026-08-27):
// the verdict now rides on BEHAVIOR.state. Kept only because checkReq still assigns it and the
// per-test reset clears it; to be removed with the chip strip in the follow-up pass.
let PROVING: { state: 'active' | 'pass' | 'fail', text: string } | null = null
// THE CHECK CURRENTLY RUNNING (2026-08-29) — which requirement, which beat, and the wall-clock the
// beat's `proves` step started on. proveVisible needs it to file its asserted-value frame under the
// right beat and to say WHEN in that beat the frame was taken (the board paces the beat's loop off
// the step's own window, so the offset is measured from the same origin). Saved and restored around
// each checkReq so a nested one cannot strand the outer beat's identity.
// …and since phase 2 of the Expected View plan (2026-09-03) the beat also carries its CLAIMS and the
// two replicas they are applied against: `claims` is every claim the beat has made so far, in order
// (snapValue pushes each one as it photographs it), `lastRight` the html of the most recent Actual
// replica whose claims were ALL ok — the beat's before replica to begin with, and the only place a
// removed element may be restored from — and `lastExpected` the last Expected the beat produced, so
// a FAILED beat's after moment can show the intended state it reached rather than one derived from
// a scene the app got wrong.
type CurCheck = { id: string, beat: number, seq: number, t0: number, k: number, soft: string[],   // soft: the beat's collected soft-claim failures (proveVisible `soft`)
  claims: Claim[], lastRight: string | null, lastExpected: string | null,
  // the UNION of every ring box the beat has rung so far (fix round 2, rule 1) — grows
  // monotonically, never shrinks; spec/_replica.mjs's scene-root walk must contain it, so a later
  // moment's own Actual always has room to graft an earlier moment's claim back into by anchor.
  minRegion: { x: number, y: number, w: number, h: number } | null }
let CUR_CHECK: CurCheck | null = null
// The current beat the callout shows — as ONE SENTENCE, chosen by the shared rule (the human,
// 2026-08-30: "only have to include the text for current small step (as less text as possible) —
// and both the schematic and proof need to have exact same text"). While the assertion body is
// running, the scene on screen is the When being performed, so the card says the WHEN; once the
// verdict has landed the beat is at rest and it says the THEN. tools/callout-text.mjs owns that
// choice and tools/viz.mjs asks it the same question for the same scene, so the drawn card and the
// burned one can never say different things. The requirement TITLE is gone from the card entirely —
// the id chip is the whole tag.
function curBeat (): { id: string, label: string, text: string, state: 'active' | 'pass' | 'fail' } | null {
  if (!BEHAVIOR) return null
  const b = BEHAVIOR.beats[BEAT_IDX] || BEHAVIOR.beats[BEHAVIOR.beats.length - 1]
  const c = calloutText({
    id: BEHAVIOR.id,
    when: b ? b.when : '',
    then: b ? b.then : '',
    done: BEHAVIOR.state !== 'active'
  })
  return { id: c.id, label: c.label, text: c.text, state: BEHAVIOR.state }
}
// A goto WIPES the injected overlay — and real flows navigate mid-beat (a cross-page read). Repaint
// after every main-frame navigation so the narration is consistently on screen, not only until
// the first goto. One listener per page, installed lazily on first paint.
const HOOKED = new WeakSet<Page>()
function repaintOnNav (page: Page): void {
  if (HOOKED.has(page)) return
  HOOKED.add(page)
  page.on('framenavigated', f => {
    if (f !== page.mainFrame() || !(HUD.head || BEHAVIOR) || page !== CURRENT_PAGE) return
    // Repaint AFTER the new document is ready. Evaluating the instant `framenavigated`
    // fires races the execution-context teardown and REJECTS — the reject is caught, but
    // Playwright still records it as a failed "Run a script on the page" step, a spurious
    // red ✕ on a flow that actually passed. Waiting for domcontentloaded lets the repaint
    // land on a live context. Fully fire-and-forget: never awaited by the flow, and the
    // wait's own failure (page closed / superseded nav) is swallowed.
    void page.waitForLoadState('domcontentloaded')
      .then(() => { if ((HUD.head || BEHAVIOR) && page === CURRENT_PAGE) return paintHud({}) })
      .catch(() => {})
  })
}
async function paintHud (s: { head?: string, failed?: boolean }): Promise<void> {
  if (s.head !== undefined) HUD.head = s.head
  await renderOverlay(LAST_BOX, !!s.failed)
}

// THE OVERLAY (board R10 — the recording is the proof a human checks). A light dim over the app, a
// ring on the element the check reveals, and a CALLOUT beside it carrying the CURRENT beat's When →
// Then in the requirement's own words (the same words the storyboard shows). Injected INTO the page
// so it burns into the video and the live watch; gated on a board recording so a plain `npm run e2e`
// paints nothing and stays fast. pointer-events:none so it never swallows a click. Best-effort: a
// failed evaluate (page torn down mid-nav) is swallowed, leaving the previous frame's overlay standing.
// PAINTED ON EVERY RUN, NOT ONLY UNDER A RECORDING (the human, 2026-09-02: "make sure the gap between
// schematic and proof will not exist again"). The ring and the card used to be recording-gated, so a
// plain `npm run e2e` harvested RINGLESS frames and ringless layout skeletons — and the fold wrote
// them over the board's ringed harvest: the reader lost its zoom, its ring and its callout, and the
// drawing beside it (drawn from the same skeleton) lost them too. That was the second root cause of
// "the focus effect is gone". The overlay costs milliseconds and is pointer-events:none; only the
// VIDEO and the narration holds (recordHold) stay recording-only.
async function renderOverlay (box: Box | null, failed: boolean): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  repaintOnNav(page)
  // NO RING, NO OVERLAY (the human, 2026-08-28). A callout with no ringed target used to float at a
  // fallback position — so a beat's BEFORE frame photographed a card claiming the Then before the
  // When had happened, while the drawn given frame was clean: the two sides disagreed on the one
  // row that sets the scene. The overlay now exists only while an element is actually ringed; every
  // before/given frame is clean on BOTH sides and the loop reads as a reveal.
  if (!box) { await hideOverlay(page); return }
  // TWO EVALUATES, ONE PICTURE. The callout's placement rule needs the card's MEASURED height, and
  // the rule itself now lives in Node (tools/overlay-geometry.mjs) so the drawing can obey the very
  // same one. So: paint everything the placement does not depend on — the veil, the ring, the card's
  // words — and hand back the viewport and the card's height; then place the card and its notch.
  // A page torn down between the two leaves the card's POSITION one frame behind (it transitions in
  // .16s regardless) and nothing claiming a wrong beat; both calls stay best-effort.
  const paint = await page.evaluate(({ beat, lines, labW, claim, failed, box, ring0, ringCss, cardW, type }) => {
    const AI = '#2f4a63', BENG = '#8d4a38', KOKE = '#4d5c37', INK = '#1c1b18', INK3 = '#5f5d56', PAPER = '#fdfcf9', HAIR = '#cdc7b8'
    const FAIL = failed || (beat && beat.state === 'fail')
    let el = document.getElementById('__specboard-focus')
    if (!el) {
      el = document.createElement('div')
      el.id = '__specboard-focus'
      // OUTSIDE the body (on <html>): a fixed overlay kept out of the app's own stacking contexts is
      // the one that reliably sits on top of everything the app paints.
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:system-ui,sans-serif'
      document.documentElement.appendChild(el)
      const veil = document.createElement('div')
      veil.className = 'sb-veil'
      // a LIGHT wash — the surrounding state that PRODUCES the proven value stays readable, it just recedes
      veil.style.cssText = 'position:fixed;inset:0;background:' + ringCss.veil + ';transition:opacity .18s ease'
      const ring = document.createElement('div')
      ring.className = 'sb-ring'
      ring.style.cssText = 'position:fixed;border-radius:' + ringCss.radius + 'px;transition:all .16s ease;display:none'
      const ptr = document.createElement('div')
      ptr.className = 'sb-ptr'
      ptr.style.cssText = 'position:fixed;width:' + ringCss.notch + 'px;height:' + ringCss.notch + 'px;background:' + PAPER + ';display:none'
      const call = document.createElement('div')
      call.className = 'sb-call'
      call.style.cssText = 'position:fixed;width:' + cardW + 'px;box-sizing:border-box;background:' + PAPER + ';border:1px solid ' + HAIR +
        ';border-radius:' + ringCss.cardRadius + 'px;box-shadow:0 10px 30px rgba(28,27,24,.24);padding:' +
        ringCss.padY + 'px ' + ringCss.padX + 'px;transition:all .16s ease;display:none'
      el.append(veil, ring, ptr, call)
    }
    el.style.display = ''
    const ring = el.querySelector('.sb-ring') as HTMLElement
    const call = el.querySelector('.sb-call') as HTMLElement
    const ptr = el.querySelector('.sb-ptr') as HTMLElement
    // the ring on the proven element — its rect comes from the shared geometry (ringBox), so the
    // drawn mirror can stroke the very same rect instead of a private copy of these numbers
    if (box) {
      ring.style.display = ''
      ring.style.left = ring0.x + 'px'
      ring.style.top = ring0.y + 'px'
      ring.style.width = ring0.w + 'px'
      ring.style.height = ring0.h + 'px'
      ring.style.border = ringCss.stroke + 'px solid ' + (FAIL ? BENG : AI)
      ring.style.boxShadow = '0 0 0 ' + ringCss.halo + 'px ' + ringCss.haloInk + ',0 0 ' + ringCss.glow + 'px ' +
        (FAIL ? 'rgba(141,74,56,.35)' : 'rgba(47,74,99,.30)')
    } else ring.style.display = 'none'
    // THE CALLOUT — the current small step, and nothing else (the human, 2026-08-30). A tiny id chip,
    // then ONE sentence: the line this scene is proving, chosen by tools/callout-text.mjs, the same
    // rule tools/viz.mjs draws by. The requirement TITLE and the second stacked line are gone — a
    // paragraph floating over the app hides the very thing the ring is pointing at.
    if (!beat) { call.style.display = 'none'; ptr.style.display = 'none'; return null }
    call.style.display = ''
    call.style.borderColor = FAIL ? BENG : HAIR
    call.innerHTML = ''
    const mk = (t: string, txt: string, css: string) => { const s = document.createElement(t); if (txt) s.textContent = txt; s.style.cssText = css; return s }
    const MONO = 'font:600 ' + type.lab + 'px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;'
    // the tag row is the id chip alone
    const tagRow = mk('div', '', 'display:flex;align-items:baseline;color:' + INK3 + ';margin-bottom:' + type.tagGap + 'px')
    tagRow.append(
      mk('span', beat.id, 'font:600 ' + type.id + 'px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;border:1px solid ' +
        (FAIL ? 'rgba(141,74,56,.4)' : HAIR) + ';border-radius:4px;padding:1px 5px;color:' + (FAIL ? BENG : INK3))
    )
    call.append(tagRow)
    // …and the ONE line, labelled with the half it actually is. The label's hue names which half
    // (indigo for the Then, quiet ink for the When) but never carries it alone — the word says it.
    // A requirement written as PROSE has no beat to say: the chip stands alone rather than the card
    // inventing a sentence, and the verdict still rides it.
    //
    // PRE-WRAPPED by the SHARED rule (tools/callout-text.mjs calloutLines, passed in as `lines`), so
    // the burned card breaks at the EXACT same points as the drawn one — same column width, same line
    // count, same words (the human, 2026-08-30/31: both cells show the same text, never truncated).
    // Rendered as explicit line divs so the browser cannot re-wrap them differently: a label gutter
    // holds WHEN/THEN and every line sits in the text column beside it (the hanging indent the drawing
    // draws too). The card grows to as many lines as the sentence needs; calloutSpot then keeps the
    // whole card on the page (flipping above a bottom-edge ring), so no line is ever burned off frame.
    const isThen = beat.label === 'Then'
    const t = mk('div', '', 'display:flex;align-items:baseline;font-size:' + type.line + 'px;font-weight:600;line-height:' + type.lh + ';color:' + INK)
    // the label's own text stays mixed-case; MONO's text-transform:uppercase draws it WHEN/THEN
    const labCell = mk('span', beat.text ? beat.label : '', MONO + 'flex:0 0 ' + labW + 'px;color:' + (isThen ? AI : INK3))
    const col = mk('div', '', 'flex:1 1 auto;min-width:0')
    const rows = (lines && lines.length ? lines : ['']) as string[]
    rows.forEach((ln, i) => {
      const row = mk('div', ln, '')
      // the got value is BURN-ONLY (the drawing measures none): the sentence is identical on both
      // sides, and a failure adds what the page actually read, in bengara, after the last line
      if (i === rows.length - 1) {
        if (FAIL) {
          if (claim) row.append(mk('span', ' — got ' + claim.got, 'color:' + BENG + ';font-weight:700'))
          row.append(mk('span', ' ✕', 'color:' + BENG + ';font-weight:700'))
        } else if (beat.state === 'pass') {
          row.append(mk('span', ' ✓', 'color:' + KOKE + ';font-weight:700'))
        }
      }
      col.append(row)
    })
    t.append(labCell, col)
    call.append(t)
    // …and the ONE thing the placement rule cannot know without a browser: how tall the words made
    // the card. It goes back to Node, where calloutSpot decides where the card belongs.
    return { vw: window.innerWidth, vh: window.innerHeight, ch: Math.ceil(call.getBoundingClientRect().height) }
  }, {
    beat: curBeat(),
    // the SHARED wrap (tools/callout-text.mjs) — the same lines the drawn card breaks at, computed in
    // Node so the browser renders exactly them, and the label gutter both cards reserve
    lines: (b => b ? calloutLines(b.text) : [])(curBeat()),
    labW: calloutLabelWidth(),
    claim: CLAIM ? { ...CLAIM } : null,
    failed,
    box,
    ring0: ringBox(box),
    ringCss: {
      stroke: RING.stroke, halo: RING.halo, glow: RING.glow, radius: RING.radius,
      notch: CARD.notch, cardRadius: CARD.radius, padX: CARD.padX, padY: CARD.padY,
      // …and the two washes, from the same module (the review's I3): the board's replica page paints
      // the identical ring and dim, so a change here must move both pictures of a row at once
      veil: WASH.veil, haloInk: WASH.halo
    },
    cardW: CARD.width,
    // the ONE line's type, from the module the drawing converts it out of too
    type: { id: CALLOUT_TYPE.id, lab: CALLOUT_TYPE.lab, line: CALLOUT_TYPE.line, lh: CALLOUT_TYPE.lh, tagGap: CALLOUT_TYPE.tagGap }
  }).catch(() => null)
  // no card to place (no beat yet, or the page went away mid-paint) — the ring is already painted
  if (!paint) return
  // POSITION — the shared rule (tools/overlay-geometry.mjs calloutSpot), so the drawn mirror places
  // its card by the very same candidate order: BELOW the target first, then ABOVE, then beside it,
  // each clamped to the viewport and each refused if it would cover the target at all.
  const spot = calloutSpot({ box, vw: paint.vw, vh: paint.vh, cw: CARD.width, ch: paint.ch })
  await page.evaluate(({ spot, box, cw, ch, fail, half, inset }) => {
    const BENG = '#8d4a38', HAIR = '#cdc7b8'
    const el = document.getElementById('__specboard-focus')
    if (!el) return
    const call = el.querySelector('.sb-call') as HTMLElement
    const ptr = el.querySelector('.sb-ptr') as HTMLElement
    if (!call || !ptr) return
    const left = spot.left, top = spot.top, side = spot.side
    call.style.left = left + 'px'
    call.style.top = top + 'px'
    // the notch, pointing back at the ring. A square rotated 45° shows the corner whose two edges
    // carry a border: top+left → the TOP corner (points up), bottom+right → down, left+bottom →
    // left, right+top → right. Every border is set explicitly so a re-render never keeps the
    // previous placement's arrow. side 'none' means nothing fit cleanly — an honest float beats a
    // notch aimed at a box the card is sitting on.
    if (side !== 'none') {
      ptr.style.display = ''
      const bc = fail ? BENG : HAIR
      const on = '1px solid ' + bc
      ptr.style.transform = 'rotate(45deg)'
      ptr.style.borderTop = 'none'; ptr.style.borderRight = 'none'
      ptr.style.borderBottom = 'none'; ptr.style.borderLeft = 'none'
      if (side === 'below' || side === 'above') {
        // sit the notch under the target's centre, but never off the card's own edge
        const px = Math.max(left + inset, Math.min(box.x + box.width / 2, left + cw - inset))
        ptr.style.left = (px - half) + 'px'
        if (side === 'below') { ptr.style.top = (top - half) + 'px'; ptr.style.borderTop = on; ptr.style.borderLeft = on }
        else { ptr.style.top = (top + ch - half) + 'px'; ptr.style.borderBottom = on; ptr.style.borderRight = on }
      } else {
        const py = Math.max(top + inset, Math.min(box.y + box.height / 2, top + ch - inset))
        ptr.style.top = (py - half) + 'px'
        if (side === 'right') { ptr.style.left = (left - half) + 'px'; ptr.style.borderLeft = on; ptr.style.borderBottom = on }
        else { ptr.style.left = (left + cw - half) + 'px'; ptr.style.borderRight = on; ptr.style.borderTop = on }
      }
    } else ptr.style.display = 'none'
  }, {
    spot,
    box,
    cw: CARD.width,
    ch: paint.ch,
    fail: failed || (curBeat() || { state: '' }).state === 'fail',
    half: CARD.notch / 2,
    inset: CARD.notchInset
  }).catch(() => {})
}

// Ring an element and anchor the callout to it (board R10 — the recording is the proof a human
// checks). A dense table names a value but not WHERE it is; this paints the eye onto the exact cell
// reveal() centres, and the callout beside it says what is being proven there. Measures the target's
// box (no page transform now — the app is never shifted), remembers it as LAST_BOX so a later
// verdict repaint lands in the same place, and hands it to renderOverlay. A detached / off-screen
// target (no box) leaves the previous frame's overlay standing.
async function paintFocus (target: Locator, opts: { failed?: boolean } = {}): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return                      // every run paints (2026-09-02) — see renderOverlay
  // count() first: boundingBox() on an element that is not there AUTO-WAITS for it — the whole test
  // timeout — so a claim on a missing element hung the beat instead of reading "(missing)"
  const present = (await target.first().count().catch(() => 0)) > 0
  const box = present ? await target.first().boundingBox().catch(() => null) : null
  // a FAILED check on an element that is not there (2026-09-02): the ring reddens where the value
  // was last seen — the place the requirement says it should still be — rather than staying ink on
  // a target that no longer exists, which photographed a failure as a pass
  if (!box) { if (opts.failed && LAST_BOX) await renderOverlay(LAST_BOX, true); return }
  LAST_BOX = box
  LAST_TARGET = target
  LAST_FAILED = !!opts.failed
  await renderOverlay(box, !!opts.failed)
}
// Hide the overlay so a NEW step starts clean — the ring and callout reappear only once the step
// reveals a value to prove, never lingering on the previous step's cell.
async function hideFocus (): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  LAST_BOX = null
  LAST_TARGET = null
  await hideOverlay(page)
}
// The DOM half of hiding, shared with renderOverlay's no-ring branch (which must not clear LAST_BOX —
// a nav repaint with the box momentarily unmeasured should not forget where the ring was).
async function hideOverlay (page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('__specboard-focus')
    if (el) el.style.display = 'none'
  }).catch(() => {})
}

// A narration line is RECORDED as a `note: ` step so the board can show it as the step's expandable
// evidence, it feeds the beat log a `note` beat, and it pace-gates (a narrated run holds on it). The
// VISUAL is painted separately by the caller (the CLAIM for a check, the NOTE line for a sentence),
// so the burn-in stays glanceable while the board keeps the full text (board R10).
async function emitNote (text: string): Promise<void> {
  await paceGate('note', text)
  beat('note', text)
  await test.step('note: ' + text, async () => {})
}
// Announce the got vs expected values of the current check — as the structured CLAIM (two prominent
// values) on the bar, and the full got/expected line as board evidence.
// hudCheck paints a got-vs-expected CLAIM on the recording's topbar AND asserts it. It is a CHECK, not
// a caption: the value you show is the value you prove, so a red run's bar can never display a
// passing-looking claim while some *separate* expect() elsewhere is the thing that actually broke (the
// confusing "expected 9% · got 9%" under a red banner). Assert LAST — after the paint — so the failing
// value is burned into the frame before the throw, and the enclosing checkReq/flowStep records it.
// `assert:false` paints and records the claim but does NOT throw — for a caller (proveVisible) that
// must paint MORE than the bar (its red ring) before the throw, and then asserts the SAME shown vs
// expected itself. Every other caller uses the default and asserts here, so the bar always names the
// check that broke (76714c5).
export async function hudCheck (label: string, expected: unknown, actual: unknown, opts: { assert?: boolean, missing?: boolean } = {}): Promise<void> {
  const ok = String(expected) === String(actual)
  // `missing` rides the claim (2026-09-02): the check found NOTHING to read — the element the
  // requirement names is not on the page — which the drawn mirror treats differently from a wrong
  // value on an element that is there (tools/viz.mjs intendedLayout).
  CLAIM = { label: String(label), expected: String(expected), got: String(actual), ok, ...(opts.missing ? { missing: true } : {}) }
  await emitNote(String(label) + ' — got ' + String(actual) + ' · expected ' + String(expected))
  await paintHud({})
  if (opts.assert !== false) expect(String(actual), String(label)).toBe(String(expected))
}
// Freeform variant, for a sentence the author wants on the bar (shown on the note line).
export async function hudNote (text: string): Promise<void> {
  NOTE = String(text)
  await emitNote(String(text))
  await paintHud({})
}

// How long a RECORDING holds on a narrated beat so the burned-in value is readable on playback. It
// is the SAME knob as a live watch's pace — the board's "Pace of a watchable run" (Setup) is passed
// to the run as BOARD_STEP_DELAY_MS, so the slider you set means the same thing whether you watch it
// live or watch the video back. Off a recording it is 0, so a plain `npm run e2e` stays fast; under a
// recording with no board value it falls back to `fallback` (the flows pass 2000). A flow's narration
// hold should be `recordHold()`, never a hard-coded millisecond count.
export function recordHold (fallback = 2000): number {
  if (!process.env.BOARD_RECORD) return 0
  const v = Number(process.env.BOARD_STEP_DELAY_MS)
  return Number.isFinite(v) && v > 0 ? v : fallback
}

// Scroll a target to the CENTRE of the viewport and HOLD, so the recording actually shows the value
// a step asserts on (board R10) rather than asking you to trust the topbar. Generic — it works
// across nested scroll containers via scrollIntoView; a virtualised cell (one an app renders only
// when its column is in view) must be brought into the DOM by the app's own API first, then
// revealed. The hold is the configured pace under a board recording (so the frame is readable on
// playback) and short otherwise (so a plain suite run stays fast).
export async function reveal (target: Locator, opts: { hold?: number } = {}): Promise<void> {
  const el = target.first()
  // Only centre a cell that is actually in the DOM. `scrollIntoViewIfNeeded({timeout})` on a
  // virtualised / off-screen / detached cell TIMES OUT, and a caught timeout still records a
  // failed action — a spurious red ✕ on a passing step. `count()` is a query (a number, never a
  // throw), so it never logs; the synchronous `scrollIntoView` then centres with no actionability
  // wait to time out. Its own throw (element detached mid-call) is swallowed and does not log
  // because `count()` just proved it present.
  if (await el.count().catch(() => 0)) {
    await el.evaluate(n => (n as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' })).catch(() => {})
  }
  // Point the recording at what this step proves — painted after the centre so it reads the settled
  // position. Ink here; proveVisible reddens it if the value it then reads is wrong.
  await paintFocus(target)
  const hold = opts.hold ?? (recordHold(1600) || 200)
  if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(hold).catch(() => {})
}

// Point the recording at a value WITHOUT scrolling to it — the ring + dim band alone. For cells a
// flow brings on screen through the APP's own navigation (an AG Grid keyboard walk across
// virtualised columns, a carousel, a stepper): there `reveal()`'s raw scrollIntoView would desync
// the app's scroller (see the horizontally-virtualised-grid trap in the specs that hit it), but the
// value still deserves the ring so a watcher knows which cell the step is reading. Same gating as
// the overlay itself: paints only under a board recording, never swallows a click.
export async function pointAt (target: Locator, opts: { failed?: boolean } = {}): Promise<void> {
  await paintFocus(target, opts)
}

// PROVE A VALUE ON SCREEN (kg-e2e rule 5 — the recording is the proof a human checks). Centre the
// cell in the recording, read its RENDERED text, assert it, announce got-vs-expected on the topbar,
// and hold so a person can read it. Use this instead of asserting a number you only fetched from the
// API: the proof is then on what the human SEES, not on a read they cannot. By default the cell's
// trimmed text must equal `expected`; pass `match` for a looser check (e.g. parse "$1,040,000" to a
// number). Walk it across EACH item (year by year, row by row) — a summary/average is not proof of
// the per-item values.
// WHAT THE SCREEN IS SHOWING, from the element's own kind (2026-08-29). A form control's value is
// not its textContent — an `<input>` carrying "Water the plants" has no text at all — so reading
// text alone made the natural When-assertion ("the box now holds what you typed") impossible to
// write, and the action a requirement names went unproven and unphotographed. Generic: any
// input/textarea/select reads its value, everything else reads its rendered text. A detached or
// unevaluable element falls back to textContent rather than throwing — proveVisible's own assert is
// what must fail, with the value it read in the message.
// …AND A TICK BOX READS ITS TICK (2026-09-04, phase 6). A checkbox's `value` is the string "on"
// whether or not it is checked, so `proveVisible(box, 'on', …)` would pass with the box empty — an
// assertion that cannot fail, which is the one thing rule 2 refuses. What such a control SHOWS is
// its state, so it reads `checked` / `unchecked`. Found completing init R6's claim ("Setup reads it
// back ticked"), the first requirement whose fact lives on a tick box.
async function shownText (target: Locator): Promise<string> {
  const el = target.first()
  const v = await el.evaluate((n: any) => {
    const tag = String(n.tagName || '').toUpperCase()
    const type = String(n.type || '').toLowerCase()
    if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) return n.checked ? 'checked' : 'unchecked'
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return String(n.value == null ? '' : n.value)
    return String(n.textContent == null ? '' : n.textContent)
  }).catch(() => null)
  if (v != null) return String(v).trim()
  return ((await el.textContent().catch(() => '')) || '').trim()
}

// WHAT A CHECK READS OFF AN ELEMENT THAT IS NOT THERE. A requirement can name a thing the app never
// shows (an Undo that should appear, a row that should still be listed): the check must still be
// writable, still photograph the place, and say plainly that nothing was there — never read "" and
// leave a reader guessing whether the element was empty or absent.
export const MISSING = '(missing)'

export async function proveVisible (
  target: Locator,
  expected: string,
  label: string,
  opts: { match?: (shown: string) => boolean, soft?: boolean } = {}
): Promise<void> {
  await reveal(target, { hold: 0 })                         // centre it now, ring it in ink; the readable hold comes after we read
  const present = (await target.first().count().catch(() => 0)) > 0
  const shown = present ? await shownText(target) : MISSING
  await hudCheck(label, expected, shown, { assert: false, missing: !present }) // paint the CLAIM now, but DON'T throw yet — assert LAST, below
  // AN ABSENCE IS A VALUE A REQUIREMENT CAN NAME (2026-09-04, the controller's fix-round ruling).
  // `MISSING` existed for the other direction — a thing the app should show and does not — and this
  // read `present &&`, so `proveVisible(x, MISSING, …)` could never pass: a Then that says "no chip
  // at all", "there is no control to change it", "no per-cell caption" had no claim it could make.
  // Now expected === MISSING passes exactly when the element is gone and fails, with the app's own
  // text as `got`, the moment it is back. There is nothing to ring, so the frame is the page — which
  // is the honest picture of nothing being there (paintFocus already leaves the overlay hidden).
  // AND A `match` CLAIM'S `expected` MUST BE TEXT THE APP RENDERS (final review I2, 2026-09-04).
  // With `match` the verdict was a predicate while `expected` stayed whatever string the author
  // passed — so `proveVisible(chip, 'passed or failed', …, { match: /^(passed|failed)$/ })` recorded
  // `{ expected: "passed or failed", got: "passed", ok: true }`, and the board printed
  // EXPECTED "passed or failed" over a picture reading "passed". A description of the app's text is
  // not the app's text; commit f9c290d removed the instances it found, this closes the hole. The
  // predicate still decides — an author who needs a parsed comparison (a trimmed stamp, a numeric
  // tolerance) keeps it — but the words shown to a reader must occur in what the app actually
  // showed, so `expected` has to be the rendered text and `match` only how it is compared.
  // Whitespace-collapsed on both sides, the way tools/replica-gate.mjs's own word gate reads a
  // replica: an element's rendered text wraps and indents, and a Then that names two words either
  // side of a line break is still naming what the app shows.
  const flat = (x: string) => String(x || '').replace(/\s+/g, ' ').trim()
  const ok = present
    ? (opts.match ? (!!opts.match(shown) && flat(shown).includes(flat(expected))) : shown === expected)
    : expected === MISSING
  // …AND THE CLAIM MUST SAY WHAT THE ASSERTION SAYS (fix round 4, found while verifying the Expected
  // on real data). `hudCheck` can only compare two strings, so a check carrying its OWN `match`
  // predicate — the demo's R8, "a completed stamp survived the reload", expected "done" against a
  // stamp reading "done 1d ago" — PASSED its assertion while recording `ok: false`. That false claim
  // is read by three things downstream: the layout skeleton's claim (so the drawn mirror invents an
  // "intended" scene for a check that was right), `chooseBase` (so a GREEN requirement's Expected is
  // built from a stale BASE instead of its own Actual), and `data-claims`. On the demo's R8 the
  // consequence was visible in the harvest: the Expected rang a different row of a different scene
  // from the Actual. The verdict belongs to the assertion, so it is written back here, before
  // anything photographs or files the claim.
  if (CLAIM && CLAIM.ok !== ok) { CLAIM.ok = ok; await paintHud({}) }
  // A wrong value turns the ring bengara BEFORE we throw, and we hold on that red frame, so the
  // recording shows exactly which cell failed rather than cutting away at the assertion. hudCheck
  // gained its own assert (76714c5); it must run with assert:false here or it would throw before this
  // reddening, leaving the ring ink on a failure — which is exactly what regressed.
  if (!ok) await paintFocus(target, { failed: true })
  // …and PHOTOGRAPH it (2026-08-29). The frame is taken with the ring on the value and the claim on
  // the bar — pass or fail — so the beat's proof plays every value it proved, in the order it proved
  // them, instead of only the two ends of the assertion body.
  await snapValue()
  if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(recordHold()).catch(() => {})
  // A SOFT CLAIM (2026-09-02, the human on the demo's R9: "the schematic should be correct, only the
  // proof should be wrong"). A Then with several facts — the row still listed, an Undo on it, the
  // count unchanged — must photograph EVERY one of them even when the first is wrong, or the beat's
  // proof stops at its first red moment and the rest of the requirement is never shown. So a soft
  // claim records its failure on the open checkReq and lets the beat run on; checkReq fails the
  // `proves` step with the whole list once the beat has reached its end. Never a green: the step,
  // the test and the requirement all read failed exactly as before — only the beat is complete.
  // Outside a checkReq there is nothing to collect on, so it throws like a hard one.
  if (!ok && opts.soft && CUR_CHECK) {
    CUR_CHECK.soft.push(`${label}: expected "${expected}", got "${shown}"`)
    return
  }
  if (opts.match) expect(ok, `${label}: on-screen "${shown}" vs expected "${expected}"`).toBe(true)
  else expect(shown, `${label} — the value read off the screen`).toBe(expected)
}

// A DECLARED INTENT GAP (2026-09-04, the controller's fix-round ruling). Some facts a Then names
// have NO screen surface at all: a beat that drives the server with no page open, a geometric
// relation between two cells, what `npm run proof mirror` refuses, a surface that lives only on the
// hidden baked pane. `npm run proof lint` refuses a Then fact no claim covers — and the honest
// answer for those is not a claim nobody can make, nor silence: it is a line IN THE BEAT saying why
// there is nothing to read. The lint reads it statically (like `checkReq`), prints the row as
// DECLARED with the reason, and does not fail the exit code for it — a visible debt, never a pass.
// It is REFUSED on a fact that names an ABSENCE ("there is no control", "carries no chip"): those
// are claimable with `proveVisible(locator, MISSING, …)` and must be claimed.
//
// A no-op at run time on purpose: it says something about the beat to a reader and to the lint, and
// nothing at all to the app.
export function intentGap (why: string): void {
  void why
}

// A STORY STEP (board R10): one numbered sentence of what a user does and what should happen —
// "Edit the draft — change Unit 01-02 Net Rent from 40,000 to 60,000". The board shows the flow as
// these steps; the topbar leads with the current one; checkReq calls nest INSIDE them so coverage
// still tags requirements while the narrative carries the story.
export async function flowStep (title: string, fn: () => Promise<void> | void): Promise<void> {
  const n = ++FLOW_N
  await paceGate('step', n + '. ' + title)
  beat('step', n + '. ' + title)
  PROVING = null; CLAIM = null; NOTE = ''; BEHAVIOR = null   // a new step starts clean — no stale callout
  // The head is the step's plain ACTION, unnumbered. Requirements (R#) are the only numbering a
  // watcher sees — on the chips and the proving line — because two number systems side by side is
  // how the first narrated cut got misread ("✗ 1." on the bar while the voice said "requirement
  // five"). The beat label keeps the numbered machine format for pack matching and the board.
  await paintHud({ head: title })
  await hideFocus()                                          // a new step starts clean — no ring until it reveals a value
  FLOW_DEPTH++
  try {
    // fn runs INSIDE a test.step, so a failure marks THAT step failed on the board. The catch is
    // OUTSIDE the step — the error has already left it (so Playwright records the step as failed) —
    // which lets the flow CONTINUE to the next step instead of aborting (board R10). The test is
    // still failed: _failAggregate throws the aggregate. The recording keeps rolling through every step.
    await test.step(title, async () => { await fn() })
    await paceGate('step-done', '✓ ' + n + '. ' + title, false)
    beat('step-done', '✓ ' + n + '. ' + title)
    await paintHud({ head: '✓ ' + title })
  } catch (err) {
    STEP_FAILURES.push({ n, title, message: String((err as Error).message || err) })
    await paceGate('step-done', '✗ ' + n + '. ' + title, false)
    beat('step-done', '✗ ' + n + '. ' + title)
    await paintHud({ head: '✗ Failed — ' + title, failed: true })
    // Hold the red frame long enough to READ: the CLAIM still shows the failing check's own
    // got-vs-expected, and under a recording the pause stretches by the watch pace so the failure
    // is a scene, not a flash. (A narrated run holds longer still — the pace gate keeps this frame
    // up until the fail line has been spoken.)
    if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(900 + recordHold(0)).catch(() => {})
    // deliberately NOT re-thrown — the flow runs on
  } finally {
    FLOW_DEPTH--
  }
}

// EVIDENCE FRAMES (Task 15; D2 — every proof medium is a view over the ONE run recording, and this
// is the raw material a renderer needs). Around every checkReq assertion body the page is
// photographed twice — the beat's BEFORE/AFTER phase pair — and the pair rides out of the run as
// attachments named `evidence <id> before|after`. The reporter (spec/_results-reporter.mjs) folds
// them, with the proves-step's clip window, into the results index. A live page.screenshot, so it
// works in a plain CLI run — no board, no video needed. Strictly a BY-PRODUCT, never a gate: any
// failure is swallowed and the shot itself is time-bounded, so a slow or dying page costs at most
// the bound and never fails the test.
// A phase is the beat's `before`, its `after`, or `v<k>` — the k-th asserted value proven inside
// it (2026-08-29). The value frames are what put the beat's WHEN in the proof at all: a box
// carrying what was typed into it is empty before the beat and cleared again after it.
type Phase = 'before' | 'after' | string
// THE SHOT'S OWN DEADLINE (task 3b, item 5, 2026-09-04). It was 2500 ms, and on a loaded machine it
// was reached: `page.screenshot` timed out inside the `try`, the value frame was never attached, and
// the fold — which kept a moment only if its photograph landed — dropped the moment whole and pruned
// its replica, which reddened four board beats that need a claimed specimen (task-4b, "what is red"
// #2). Two changes, neither of which can make a run red: a slightly larger bound, and a shot that
// asks the page for LESS — `animations: 'disabled'` stops Playwright waiting for a CSS transition to
// finish (this harness paints a ring and a card that transition on every beat), `caret: 'hide'`
// removes the other thing it waits on. And when it still does not land, the moment SAYS SO (the
// skeleton carries `dropped`, the fold keeps the moment and prints a line) rather than vanishing.
const SHOT_MS = 4000
async function snapEvidence (id: string, beat: number, seq: number, phase: Phase): Promise<boolean> {
  const page = CURRENT_PAGE
  if (!page) return false
  let took = -1
  try {
    const info = test.info()
    // seq (which check of this id) keys the FILE, not the attachment: two checks clamped onto the
    // same beat must not share a path, or the second's screenshot silently overwrites the first's
    // and the reporter's first-wins fold picks an already-clobbered file.
    const file = info.outputPath(`evidence-${safeId(id)}-b${beat}-c${seq}-${phase}.png`)
    // EVERY TEXT ONCE (design C, the human 2026-09-03). The STILLS keep the ring and the dim — both
    // pictures of a row wear them — but not the CALLOUT CARD: the board's own chips carry the
    // claim's words beside the two cells now, and a card burned into the photograph said the same
    // sentence a third time, right over the component it points at. The VIDEO keeps the card (it is
    // the only surface a recording has), so this hides it for the screenshot alone and puts it back.
    await page.evaluate(() => {
      const c = document.querySelector('#__specboard-focus .sb-call') as HTMLElement | null
      const p = document.querySelector('#__specboard-focus .sb-ptr') as HTMLElement | null
      if (c) { c.dataset.sbwas = c.style.display; c.style.display = 'none' }
      if (p) { p.dataset.sbwas = p.style.display; p.style.display = 'none' }
    }).catch(() => {})
    const t0 = Date.now()
    try {
      await page.screenshot({ path: file, timeout: SHOT_MS, animations: 'disabled', caret: 'hide' })
      took = Date.now() - t0
    } finally {
      await page.evaluate(() => {
        for (const sel of ['.sb-call', '.sb-ptr']) {
          const e = document.querySelector('#__specboard-focus ' + sel) as HTMLElement | null
          if (e && e.dataset.sbwas !== undefined) { e.style.display = e.dataset.sbwas; delete e.dataset.sbwas }
        }
      }).catch(() => {})
    }
    info.attachments.push({ name: `evidence ${id}#${beat} ${phase}`, path: file, contentType: 'image/png' })
    // …and what it cost, when a run asks (BOARD_SHOT_TIMING=1): the measurement that says whether
    // this bound is the right one, on a real harvest rather than on a hunch.
    if (process.env.BOARD_SHOT_TIMING) process.stderr.write(`shot · ${id}#${beat} ${phase} · ${took}ms\n`)
    return true
  } catch { /* evidence is a by-product — the proof is the assertion, never the photo */ }
  // …but a DROPPED one is said out loud (task 3b, item 5): never red, never silent. The caller
  // records it on the moment's own skeleton, so the fold keeps the moment and the index says which
  // picture is missing.
  process.stderr.write(`evidence frame dropped · ${id}#${beat} ${phase} · the page would not photograph inside ${SHOT_MS}ms\n`)
  return false
}
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_.-]+/g, '_')

// A promise with a deadline, resolving null when it runs out — the same "never a gate" contract
// snapEvidence's screenshot timeout gives the frames. The timer is unref'd so a bounded wait can
// never hold the process open.
function raceTimeout<T> (p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>(resolve => {
    const t: any = setTimeout(() => resolve(null), ms)
    if (t && typeof t.unref === 'function') t.unref()
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(null) })
  })
}

// THE LAYOUT SKELETON (2026-08-28, the human: the schematic must look like the real screen).
// Beside each evidence frame, a cheap measurement of WHERE the page's boxes are and HOW THEY LOOK —
// the viewport size, the ring target, and up to 150 visible, meaningfully-sized elements, each with
// a rough kind (heading / text / input / button / check / row / container / image), its text where
// it is a leaf (or the ringed element itself), `focus` on whatever the ring is actually around, and
// (mirror-8, 2026-09-02) its own paint and state: bg / fg / bd as "r,g,b", rd, fw, td, it, op, on,
// dis — and (mirror-9) the type it is set in: ff (sans / mono / serif), tt ('u' for an uppercased
// label) and ph (the text came from a field's placeholder, so the field is empty). All optional, and
// all documented at the call that measures them below. What the page does NOT show is not measured
// at all: an element faded to nothing, or `visibility:hidden`, is skipped with its whole subtree.
// tools/viz.mjs renderWireframe draws the requirement's schematic FROM this pair, so the picture
// beside the requirement is the app's own layout rather than an abstract archetype nobody could
// map onto it. Attached as `layout <id> before|after`, mirroring the frames, and folded by the
// reporter to spec/<screen>/evidence/<id>.<phase>.layout.json.
//
// A by-product exactly like the frames: bounded (a walk budget in the page, a deadline outside
// it), every failure swallowed. It measures and never touches the page, so it cannot change what
// the assertion then reads.
type Claim = { label: string, expected: string, got: string, ok: boolean, missing?: boolean,
  ring?: Box | null }   // the ring box THIS claim was made under (fix round 2) — an anchor's own
  // reference point when a later rebuild has to find where this claim's fix now belongs
async function snapLayout (id: string, beat: number, seq: number, phase: Phase, at: number | null = null, label: string | null = null, claim: Claim | null = null, data: any = null, dropped = false): Promise<void> {
  const page = CURRENT_PAGE
  // a moment whose walk does not land leaves NO reading behind: the replica taken next is then
  // written ungated, and the gate says so, rather than being checked against another moment's page
  LAST_LAYOUT = null
  LAST_PIN = ''
  if (!page) return
  try {
    const info = test.info()
    // `data` is the walk's own output, read by `captureMoment` in the SAME page pass as the replica
    // (task 3b, item 1 — see spec/_moment.mjs). This function no longer measures anything; it writes
    // what that one pass measured, so the skeleton and the replica beside it can never be two pages.
    if (!data || !Array.isArray(data.els) || !data.els.length) return
    const file = info.outputPath(`layout-${safeId(id)}-b${beat}-c${seq}-${phase}.json`)  // seq keys the file only — see snapEvidence
    // `at` — this frame's offset in ms from the moment the beat's `proves` step started, so the
    // board can anchor it inside the beat's own window and play the loop at the run's true relative
    // pace. It rides the skeleton because the skeleton is already a per-phase file; it is deliberately
    // NOT part of the drawing's layout pin (tools/viz.mjs layoutHash strips it — a timestamp that
    // never repeats would redraw every schematic on every run).
    //
    // `label` — WHAT THIS MOMENT IS (the human, 2026-09-02: "schematic and proof should share same
    // stepper (as their steps must be same???)"). A beat is one ordered list of moments, and the
    // board's single stepper names each segment by the assertion the run made — the current CLAIM's
    // own label, recorded at the instant the frame was taken. It rides here for the same reason `at`
    // does (one file per phase, already beside the frame) and is stripped from the layout pin with
    // it. Bounded and collapsed so a whole sentence cannot become a segment name.
    //
    // `claim` — WHAT THIS MOMENT ASKED FOR, beside what it got (the human, 2026-09-02, on the demo's
    // deliberately failing R9: "for the failed test case, schematic should be correct (schematic and
    // behaviour are truth …). But now even the schematic is wrong as well"). The drawn mirror shows
    // the EXPECTED value on the ringed element of a scene whose assertion failed — the drawing is the
    // authored intent, the photograph beside it is what the app did, and the row is the comparison —
    // so the intent has to ride out of the run with the measurement. Only a whole claim travels
    // (two strings and the verdict), collapsed and bounded like the label; the AFTER phase carries
    // none of its own — tools/viz.mjs derives the beat's end state from its last failed value rather
    // than this file inventing a claim for a frame that asserted nothing.
    const extra: Record<string, unknown> = {}
    if (at != null) extra.at = at
    // …and whether the PHOTOGRAPH of this moment landed (task 3b, item 5): a bounded by-product may
    // go missing, but it may not go missing quietly — the fold reads this back (tools/evidence.mjs
    // valueMeta) and keeps the moment, marked, instead of dropping it and pruning its replica.
    if (dropped) extra.dropped = true
    const one = (s: unknown) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 140)
    if (label) {
      const l = one(label)
      if (l) extra.label = l
    }
    if (claim && typeof claim.ok === 'boolean') {
      const expected = one(claim.expected); const got = one(claim.got)
      // …with `missing` when the check found nothing to read (2026-09-02): the drawn mirror finds a
      // removed element by its expected text, never by the ring's box — dropping the flag here drew
      // the demo's Undo over the task title it was meant to sit beside
      if (expected || got) extra.claim = { expected, got, ok: claim.ok, ...(claim.missing ? { missing: true } : {}) }
    }
    const rec = Object.keys(extra).length ? { ...data, ...extra } : data
    writeFileSync(file, JSON.stringify(rec))
    info.attachments.push({ name: `layout ${id}#${beat} ${phase}`, path: file, contentType: 'application/json' })
    // …and this is what the replica is gated against a moment later (phase 3): the object that just
    // landed, and its pin. `at` is normalised out of layoutHash, so the pin written on the replica
    // equals the one the CLI derives from the committed skeleton.
    LAST_LAYOUT = rec
    try { LAST_PIN = layoutHash(rec as any, null) } catch { LAST_PIN = '' }
  } catch { /* the drawing is a by-product too — a page that would not measure simply has none */ }
}

// THE ACTUAL REPLICA (2026-09-03 — the human: the picture beside a proof is a real HTML replica of
// the app's own component, "the schematic looks nothing like it" being the end of the drawn kit's
// road). Beside the photograph and the layout skeleton, the app's OWN DOM around the ringed element
// — its computed styles diffed against per-tag defaults, sanitised (no script, no handler, no
// external URL) and capped at 1500 elements / 200 KB. Attached as `replica-expected <id>#<n>
// <phase>`, mirroring the frame exactly, and folded by the reporter to
// spec/<screen>/evidence/<rid>.b<n>.<phase>.expected.html — ONE html per moment since 2026-09-04
// (the human: "why does the Expected also need a replica — the Actual is the screenshot"), whose
// root carries the gate's verdict on the app's own unedited tree. The board renders it inside an
// <iframe sandbox srcdoc>, which is the FIRST wall — the sanitising in spec/_replica.mjs is the
// second.
//
// A by-product exactly like the skeleton: bounded by the same 2500 ms deadline, every failure
// swallowed, and it only reads the page — never a gate, never a thing that can change what the
// assertion then reads.
// FIX ROUND 1 (2026-09-03) — the controller's ruling replaced the 0.43.1 contract that replayed
// EVERY claim of the beat against whatever the CURRENT moment happened to be (the reviewer's
// C1/C2/I3: a stale claim could land on a leaf it was never made on once the ring moved, and a
// FAILED beat's after picture was built from the scene the app got WRONG rather than the scene it
// last got RIGHT). spec/_replica.mjs now takes exactly ONE claim and a BASE; this function's only
// remaining job is choosing that base, per moment:
//   an EARLIER claim in this beat already failed  → base = the beat's lastExpected (it already
//     carries every earlier claim, applied once each, never replayed)
//   else the CURRENT claim itself fails            → base = the beat's lastRight (its last all-ok
//     Actual, the before replica to begin with — the only place a restore may find the row the app
//     removed, since a base built from the wrong scene is the C2 mistake all over again)
//   else (nothing has failed yet)                  → base = null (spec/_replica.mjs builds the
//     Expected from THIS moment's own Actual, at most tinting an `ok` claim's leaf)
// the running union of every ring box a beat has rung so far (fix round 2, rule 1) — grows
// monotonically; a box on either side missing just returns the other, never throws away geometry.
function unionBox (a: { x: number, y: number, w: number, h: number } | null, b: Box | null):
  { x: number, y: number, w: number, h: number } | null {
  if (!b) return a
  const bx = { x: b.x, y: b.y, w: b.width, h: b.height }
  if (!a) return bx
  const x0 = Math.min(a.x, bx.x); const y0 = Math.min(a.y, bx.y)
  const x1 = Math.max(a.x + a.w, bx.x + bx.w); const y1 = Math.max(a.y + a.h, bx.y + bx.h)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function chooseBase (c: CurCheck | null, claim: Claim | null): string | null {
  if (!c) return null
  // the CURRENT claim (if any) is already the last entry of c.claims — snapValue pushes it before
  // this runs — so "an earlier claim failed" means every entry BAR that last one.
  const prior = claim ? c.claims.slice(0, -1) : c.claims
  if (prior.some(x => x.ok !== true)) return c.lastExpected
  if (claim && claim.ok !== true) return c.lastRight
  return null
}

// ── THE GATE (phase 3, 2026-09-03; folded into the one pass, final review C1, 2026-09-04) ───────
// A replica is a CLAIM — "this is what the app rendered" — and the drawn kit taught us twice that a
// claim nobody measures quietly stops being true (CLAUDE.md, "the mirror is guarded"). So the replica
// is rendered BACK in a hidden iframe and walked with the SAME spec/_layout-walk.mjs walk that
// measured the live page, and every box and word the live skeleton recorded inside the scene root
// must come back (tools/replica-gate.mjs replicaGaps).
//
// That walk used to happen HERE, in a third `page.evaluate` fired from Node after the screenshot and
// after the moment pass had returned. It happens inside the moment pass now (spec/_moment.mjs
// `gateInPage`), on the html that pass has just built and against the skeleton it measured in the
// same instant — the two things the gate compares can no longer come from two different moments of
// the app. What is left in this file is what the gate MEANS, not how it is taken: the comparison
// (pure, tools/replica-gate.mjs) and where its verdict is written.
//
// ONE HTML PER MOMENT (the human, 2026-09-04: "why does the Expected also need a replica — the
// Actual is the screenshot"). The Actual half of a moment IS the photograph beside it, so no
// `.actual.html` is written any longer. The gate still runs on the UNEDITED tree — `rep.html`, in
// memory, before any claim is applied, which is the only tree a photograph's twin could be — and its
// verdict is stamped on the root of the file that does land, the Expected. The unedited tree stays
// in memory for the rest of the beat as `lastRight`, the base a later restore reaches back to.
const REPLICA_HOST = '__specboard-replica'
// spec/_replica.mjs's own default `caps.bytes` — restated here (never imported: captureReplica is
// serialised by source into the page and must stay self-contained) so the reserve subtracted below
// is legible as "the plan's 200 KB minus what the gate adds", not a bare number.
const REPLICA_CAPTURE_BYTE_CAP = 200000

async function snapReplica (id: string, beat: number, seq: number, phase: Phase, claim: Claim | null = null, rep: any = null, repSkel: any = null): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  // the BEAT being harvested — set for the whole of it, its before and after frames included
  // (checkReq opens it before the before-frame and closes it after the after-frame), because the
  // Expected half is a property of the beat, not of one assertion inside it.
  const c = CUR_CHECK
  try {
    const info = test.info()
    // `rep` is the capture's own output, taken by `captureMoment` in the SAME page pass as the
    // skeleton (task 3b, item 1 — see spec/_moment.mjs), handed the ringed element the walk
    // actually measured and the boxes it dropped as occluded. This function no longer captures
    // anything; it gates and writes what that one pass produced.
    if (!rep || typeof rep.html !== 'string' || !rep.html) return
    // NO PICTURE WHERE NOTHING WAS MEASURED (fix round 1, C3). `snapLayout` writes no skeleton when
    // its walk finds nothing — an API-only beat runs against a blank page (spec/dispatch R4/R5/R6) —
    // but `captureReplica` still returns a root <div> for an empty body, so a file landed that could
    // never be gated AND whose sibling .layout.json would never exist: a row `npm run proof mirror`
    // is permanently red about, through no fault of any harvest. A gate people learn to skip is
    // worth less than no gate. An empty replica of a blank page is not evidence of anything.
    if (!LAST_LAYOUT) return
    const i = id.indexOf(':')
    const scr = i > -1 ? id.slice(0, i) : basename(dirname(String(info.file || '')))
    // THE FILE BODY: a comment saying what this is, the sheet, the root. No doctype, no <html>,
    // no <head> — the board drops the whole body into an iframe's srcdoc.
    const head = (side: string) => `<!-- specboard replica-1 · ${scr}:${id} b${beat} ${phase} · ${side} · sanitised, no script -->\n`
    const file = info.outputPath(`replica-expected-${safeId(id)}-b${beat}-c${seq}-${phase}.html`)   // seq keys the file only — see snapEvidence
    // ── THE VERDICT (phase 3; one html per moment, final review C1, 2026-09-04) ─────────────────
    // The gate itself ran inside the moment pass (spec/_moment.mjs `gateInPage`) and handed back the
    // skeleton of the replica re-rendered in a hidden frame. What is decided HERE is what that walk
    // MEANS, with the pure comparison the CLI also uses (tools/replica-gate.mjs): every box and word
    // the live skeleton recorded inside the scene root must have come back.
    //
    // It is measured on the UNEDITED tree — `rep.html`, the app's own markup with no claim applied,
    // which is the only tree a photograph's twin could be — and written on the root of the file that
    // actually lands, the Expected. There is no `.actual.html` any more: the Actual half of a moment
    // is the photograph named beside it, and a second file saying the same thing was one more thing
    // to keep in step, serve, prune and disagree with.
    //
    // A replica the walk never came back for is written UNPINNED — honest, and refused by the CLI as
    // "not gated" rather than passing unseen. And a beat's own Expected is gated TEXTUALLY on top of
    // that (rule 5): every FAILED claim's value must actually be in it, which is what it is for.
    const walked: any = LAST_PIN ? repSkel : null
    // …AND A REPLICA THE GATE COULD SEE NOTHING IN IS NOT A PICTURE (final review C1(c), 2026-09-04).
    // The gate WALKED this file and found no element at all: the scene root's whole content was
    // something no replica can carry (an <iframe>, an oversized canvas — the capture plates those),
    // so what landed was an empty plate the size of the region. That is not a likeness of anything,
    // it can never be gated, and a committed one is a row `npm run proof mirror` is permanently red
    // about through no fault of any harvest — board R21's after moment, one 1.9 KB file holding a
    // single `data-plate="space"`. Nothing measured, so no picture: the beat's row says "no Expected
    // for this moment" out loud instead. A gate that could not RUN (`walked === null` — a timeout, a
    // frame that would not mount) still writes the file unpinned, which is honest and refused.
    // …AND IT SUPPRESSES THE FILE, NOT THE MOMENT (final re-review's minor 4, 2026-09-04). This was
    // an early `return`, so a moment with no picture also skipped the beat's CHAIN (`lastRight` /
    // `lastExpected`, below) and the face harvest — three things that are properties of the beat,
    // not of this file. The chain then stood one moment further back than the beat had reached, and
    // that moment's faces were never fetched: a coupling between "nothing to photograph here" and
    // "this moment did not happen", which is not what the harness means. Shape pinned in
    // tools/replica-chain.test.mjs.
    const noPicture = !!(walked && Array.isArray(walked.els) && !walked.els.length)
    const aPin = walked && Array.isArray(walked.els) && walked.els.length ? LAST_PIN : ''
    const aGaps = aPin ? replicaGaps(LAST_LAYOUT, walked, rep.region) : []
    const gate = (body: string, pin: string, gaps: any[]) => pin ? withReplicaAttrs(body, { layout: pin, gaps }) : body
    // ── THE ONE FILE ─────────────────────────────────────────────────────────────────────────────
    // At a BEFORE moment the beat has claimed nothing yet, so the Expected IS the unedited tree —
    // written all the same, because a moment with no file is a moment with no picture. At the AFTER
    // moment of a beat that FAILED it is the last intended state the beat reached (the human,
    // 2026-09-02: "the schematic should be correct, only the proof should be wrong") — KEPT
    // BYTE-FOR-BYTE as `lastExpected` rather than re-derived, even though a `base`-driven re-capture
    // with no claim of its own would land on the same tree: the after phase never passes a claim, so
    // `chooseBase` already resolved `base = lastExpected` for it, and this is the belt to that
    // braces — the file written is never in doubt about which string it is.
    const failed = !!c && c.claims.some(x => x.ok !== true)
    const keep = phase === 'after' && failed && c && c.lastExpected ? c.lastExpected : rep.expected
    if (!noPicture && typeof keep === 'string' && keep) {
      const xGaps = [...aGaps, ...claimGaps(textOf(keep), c ? c.claims : [])]
      writeFileSync(file, head('Expected') + gate(keep, aPin, xGaps) + '\n')
      info.attachments.push({ name: `replica-expected ${id}#${beat} ${phase}`, path: file, contentType: 'text/html' })
    }
    // …and what the NEXT moment of this beat will be built from. `lastRight` only moves while every
    // claim so far held: the moment the app goes wrong, a restore must reach back past it, or it
    // would put the row back together out of the very state the requirement says is broken.
    // `lastExpected` always advances to THIS moment's own Expected — which, once something has
    // failed, IS the previous lastExpected with only this one claim added (never a replay of the
    // rest), so the chain accumulates one claim per link, not one re-application per moment.
    if (c) {
      if (!failed) c.lastRight = rep.html
      if (typeof rep.expected === 'string' && rep.expected) c.lastExpected = rep.expected
    }
    // …and the RULES THEMSELVES, once per moment (phase 4a): the fold turns them into the screen's
    // one `_fonts/faces.css` with every url rewritten to the committed file, so the board can set
    // the replica in the app's own type inside an opaque-origin srcdoc iframe that may fetch no
    // external URL. JSON rather than a name, because a rule is text with spaces in it.
    if (Array.isArray(rep.fontFaces) && rep.fontFaces.length) {
      try {
        const ff = info.outputPath(`fontfaces-${safeId(id)}-b${beat}-c${seq}-${phase}.json`)
        writeFileSync(ff, JSON.stringify(rep.fontFaces.map((f: any) => ({
          cssText: String((f && f.cssText) || ''), urls: Array.isArray(f && f.urls) ? f.urls.map(String) : []
        }))))
        info.attachments.push({ name: `fontfaces ${id}#${beat} ${phase}`, path: ff, contentType: 'application/json' })
      } catch { /* a by-product of a by-product — never a gate */ }
    }
    await harvestFonts(page, info, rep.fonts)
  } catch { /* the replica is a by-product too — a page that would not serialise simply has none */ }
}

// THE FACES THE REPLICA IS SET IN, fetched ONCE per worker. A replica is only the app's own picture
// while it is set in the app's own type, and a sandboxed iframe may reach no external URL — so each
// @font-face file the captured region actually uses is fetched HERE, in Node (page.request, which
// carries the context's cookies and never runs in the page), and committed by the fold under
// spec/<screen>/evidence/_fonts/<hash>.<ext>. Bounded on every axis: at most 8 per call, 2 MB each,
// a 3 s deadline, and only the four font extensions a browser will load; every failure is skipped
// in silence, because a missing face costs a fallback stack and nothing else.
// A MAP, NOT A SET (phase 4a, the dojostack finding of 2026-09-03: the entity screen's harvest
// produced no `_fonts/` at all although houseview's did, in the SAME run). The dedupe key is the
// url and the store is per WORKER, but the fold commits per SCREEN — so the first test to fetch a
// face marked it done for the whole worker, and every later test on every later screen attached
// nothing. Its replicas then rendered in a fallback stack (the faces were on disk, under another
// screen) and `entry.fonts` was empty, which is exactly the missing `_fonts/` dir. So the cache now
// remembers WHAT it fetched and re-attaches it for every test that needs it; `null` remembers a url
// that would not fetch, so a dead face is still tried only once.
const FONTS_FETCHED = new Map<string, { hash: string, ext: string, path: string } | null>()
const FONT_TYPES: Record<string, string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' }
// THE WHOLE PASS IS BOUNDED, NOT ONLY EACH REQUEST (fix round 1, F5). Eight faces at 3.5 s each is
// 28 s inside a 60 s test timeout — a by-product that could eat half a test's budget and redden a run
// it has no business failing. FONT_PASS_MS bounds the pass at three levels, and the innermost is the
// one that matters (fix round 2): raceTimeout only stops WAITING, it cannot cancel an in-flight
// request — a fetch begun a moment before the deadline would go on running after harvestFonts
// returned, and its attachment would land after the step had closed, or be lost. So each request is
// given the REMAINING pass budget as its own timeout (never more than FONT_REQ_MS), which is a real
// cancellation; the loop then stops at the deadline, and raceTimeout is the outer ceiling. No request
// outlives the pass. A url the deadline cut is NOT marked fetched, so the next moment simply tries it
// again — the pass is per moment, and the faces of a screen are the same few every time.
const FONT_PASS_MS = 6000
const FONT_REQ_MS = 3000
async function harvestFonts (page: Page, info: any, fonts: { family?: string, url?: string }[] | undefined): Promise<void> {
  const until = Date.now() + FONT_PASS_MS
  const pass = (async () => {
    for (const f of (Array.isArray(fonts) ? fonts : []).slice(0, 8)) {
      const left = until - Date.now()
      if (left <= 0) return                      // out of time: the rest stay un-fetched, and retriable
      const url = String((f && f.url) || '')
      if (!url) continue
      const fam = String((f && f.family) || '').replace(/\s+/g, ' ').trim() || 'unnamed'
      if (FONTS_FETCHED.has(url)) {
        // already fetched by an earlier test in this worker: RE-ATTACH it, so this test's screen
        // commits the face too. The file lives in another test's output dir, which survives the whole
        // run (Playwright clears the output root once, at the start), and the reporter only reads it.
        const hit = FONTS_FETCHED.get(url)
        if (hit && existsSync(hit.path)) {
          info.attachments.push({ name: `font ${hit.hash} ${url} ${fam}`, path: hit.path, contentType: FONT_TYPES[hit.ext] })
        }
        continue
      }
      const m = /\.(woff2|woff|ttf|otf)(?:[?#]|$)/i.exec(url)
      if (!m) continue
      const ext = m[1].toLowerCase()
      FONTS_FETCHED.set(url, null)                // a face that will not fetch will not fetch — tried once
      try {
        // the request's OWN deadline is whatever is left of the pass, so it is cancelled rather
        // than merely stopped-waiting-on; the race outside it can then never be the thing that ends it
        const resp: any = await raceTimeout(page.request.get(url, { timeout: Math.min(FONT_REQ_MS, left) }) as any, left)
        if (!resp || !resp.ok()) continue
        const buf: Buffer = await resp.body()
        if (!buf || !buf.length || buf.length > 2 * 1024 * 1024) continue
        const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
        const file = info.outputPath(`font-${hash}.${ext}`)
        writeFileSync(file, buf)
        FONTS_FETCHED.set(url, { hash, ext, path: file })
        // the SOURCE URL rides in the name (phase 4a): deriveFacesCss rewrites each `url(...)` of a
        // committed @font-face rule to the file it became, and only the url can say which file that
        // is — a family is several files. The family stays last, because a family may carry spaces.
        info.attachments.push({ name: `font ${hash} ${url} ${String((f && f.family) || '').replace(/\s+/g, ' ').trim() || 'unnamed'}`, path: file, contentType: FONT_TYPES[ext] })
      } catch { /* a face that will not fetch is a fallback stack, never a failed run */ }
    }
  })()
  await raceTimeout(pass, FONT_PASS_MS)
}

// The pair a phase leaves behind, keyed by the BEAT it proves (2026-08-28 — the board is becoming
// per-beat rows, so every artefact is per beat too): the frame a person looks at, and the geometry
// the schematic is drawn from. The layout also carries the RING (the after phase's `ring` is the
// focus rect the board zooms the media onto — tools/evidence.mjs focusFromLayout lifts it into the
// index), so there is one measurement and one source of truth. Photograph FIRST — the picture is
// the evidence; the measurement rides after it.
// ONE MOMENT, ONE PASS (task 3b, item 1 — 2026-09-04). The skeleton and the replica used to be two
// `page.evaluate` calls with a handle resolve between them, on either side of a screenshot; an SPA
// settles a view change in that window, and the pair then described two different pages (board
// R3/R5/R11 came and went from the gate's census across runs with nothing aimed at them — the
// signature of a race, not of a capture defect). `spec/_moment.mjs` composes the two self-contained
// page functions into one expression: the walk runs, then the capture, with no await between them,
// so the page cannot move inside the pair. The ringed element and the ring box are resolved ONCE and
// handed to both — and the walk's own answers (the element it actually measured under the ring, the
// boxes it dropped as occluded) go straight across to the capture inside the page, which is what
// makes the two halves agree rather than merely be simultaneous.
// WHICH MOMENT (phase 8 A1, 2026-09-05): the one string that names this moment across the whole
// harvest — the screen, the requirement, the beat and the phase. It is hashed into the class prefix
// of the replica this moment captures, so the beat's BASE and this moment's PATCH can stand in one
// srcdoc without their two sheets restyling each other. The screen is derived exactly as
// `snapReplica` derives it (a qualified id names its own screen; otherwise the spec file's folder).
function momentKey (id: string, beat: number, phase: Phase): string {
  let scr = ''
  const i = id.indexOf(':')
  if (i > -1) scr = id.slice(0, i)
  else { try { scr = basename(dirname(String(test.info().file || ''))) } catch { scr = '' } }
  return `${scr}:${id}#b${beat}/${phase}`
}
const MOMENT_FN = momentFunction(String(snapLayoutWalk), String(captureReplica))
async function captureMoment (claim: Claim | null, key: string = ''): Promise<{ skel: any, rep: any, repSkel: any }> {
  const page = CURRENT_PAGE
  if (!page) return { skel: null, rep: null, repSkel: null }
  const c = CUR_CHECK
  try {
    // the ringed ELEMENT (2026-09-03): a handle resolved with a short bound — a target that has just
    // left the page is simply not handed over, and the walk falls back to the ring's own centre.
    // Disposed after the read; never a gate. ONE resolve for both halves now.
    let handle: any = null
    if (LAST_TARGET) handle = await raceTimeout(LAST_TARGET.first().elementHandle({ timeout: 300 }), 400).catch(() => null)
    // THE REGION GROWS MONOTONICALLY (fix round 2, rule 1) — folded in with THIS moment's own ring
    // before the capture runs, so the union handed to spec/_replica.mjs already covers everywhere
    // the beat has rung, this moment included, and a later moment's scene-root walk never has to
    // shrink back below ground an earlier one already claimed.
    if (c) c.minRegion = unionBox(c.minRegion, LAST_BOX)
    const out: any = await raceTimeout(page.evaluate(MOMENT_FN as any, {
      ring: LAST_BOX,
      target: handle,
      props: REPLICA_PROPS,
      // WHICH MOMENT THIS IS (phase 8 A1): every class this capture mints is prefixed by a hash of
      // this key, so the base and the patch can be rendered in ONE document without restyling each
      // other. Deterministic — a re-harvest of the same moment writes the same bytes.
      key,
      // THIS MOMENT'S ONE CLAIM, the beat's claims-so-far (each carrying the ring box it was made
      // under — informational for `data-claims`, and the anchor a rebuild needs for the ones that
      // failed), and the base spec/_replica.mjs builds the Expected from
      claim,
      claims: c ? c.claims.map(x => ({ ...x })) : [],
      base: chooseBase(c, claim),
      minRegion: c ? c.minRegion : null,
      // THE FILE'S CAP, NOT JUST THE WALK'S (fix round 2, item 4 — board R21's census gap: the
      // walk's own accounting landed rep.html under 200 KB, but the comment header written beside it
      // and the gate's own data-replica-layout/-gaps attributes (spliced in AFTER this call returns)
      // are not part of that budget at all, and 41 gaps' worth of JSON pushed the FINAL FILE to
      // 204,887 bytes. Reserving GATE_BYTE_RESERVE off the top makes the promise the plan actually
      // made — "≤ 200 KB, the file" — true regardless of how gapped a moment turns out.
      caps: { bytes: REPLICA_CAPTURE_BYTE_CAP - GATE_BYTE_RESERVE },
      // …and the id of the hidden frame the gate mounts and removes inside this same pass
      gateHost: REPLICA_HOST
    // …one deadline for the WHOLE moment — the walk, the capture and now the gate that used to have
    // 3400 ms of its own on top of this (final review C1). Bounded exactly like every other
    // by-product: a page that will not answer costs the bound and never fails the assertion.
    }), 7500)
    if (handle) { try { await handle.dispose() } catch { /* already gone */ } }
    return { skel: out ? out.skel : null, rep: out ? out.rep : null, repSkel: out ? out.repSkel : null }
  } catch { return { skel: null, rep: null, repSkel: null } }
}

async function snapPhase (id: string, beat: number, seq: number, phase: Phase, at: number | null = null, label: string | null = null, claim: Claim | null = null): Promise<void> {
  // LET THE CARD LAND FIRST, on the AFTER frame (2026-08-31). The beat's resting scene turns the card
  // over to its Then, which can WRAP TO MORE LINES than the When and therefore FLIP SIDES — a bottom-
  // edge ring's When card sits below, its taller Then card is placed above (calloutSpot). The card
  // slides there over the overlay's .16s CSS transition, so a frame taken the instant the verdict
  // paints catches it MID-SLIDE, hanging below where it will rest — which side-by-side disagrees with
  // the drawn cell that shows the settled position. The same settle snapValue already gives the value
  // frames (OVERLAY_SETTLE_MS) makes the after frame photograph the card where it comes to rest.
  if (phase === 'after' && CURRENT_PAGE) {          // every run paints the card now, so every run lets it land
    await CURRENT_PAGE.waitForTimeout(OVERLAY_SETTLE_MS).catch(() => {})
  }
  const shot = await snapEvidence(id, beat, seq, phase)
  // …and the app's own DOM of the same moment, measured and serialised in ONE page pass (task 3b,
  // item 1): the photograph is the evidence, and the measurement and the markup that ride after it
  // are now taken together, so nothing can settle between them. The writes stay in this order —
  // the skeleton first, then the replica the gate checks against it.
  const m = await captureMoment(claim, momentKey(id, beat, phase))
  await snapLayout(id, beat, seq, phase, at, label, claim, m.skel, !shot)
  await snapReplica(id, beat, seq, phase, claim, m.rep, m.repSkel)
}

// ONE ASSERTED VALUE, PHOTOGRAPHED (2026-08-29, the human: the When has to be visible in the proof,
// not only the Then). proveVisible calls this with the ring already painted and the claim already on
// the bar, so the frame shows exactly what the check is reading — and the skeleton beside it gives
// the schematic the same scene to draw, with the element's own text in it. Filed under the beat that
// is proving, numbered by the check inside it. Silent and bounded like every other harvest: outside
// a checkReq (a bare proveVisible in a helper) there is no beat to file under and nothing is taken.
async function snapValue (): Promise<void> {
  const c = CUR_CHECK
  if (!c || !CURRENT_PAGE) return
  c.k += 1
  // LET THE RING LAND FIRST. The overlay's ring and callout move to a new target over a .16s CSS
  // transition (renderOverlay), and these frames are taken moments after the paint rather than at
  // the far end of a beat — so the first cut of this harvest photographed the ring MID-FLIGHT,
  // hanging between the box it left and the value it was pointing at. A frame whose ring is on the
  // wrong element is worse than no frame: it is a picture that misreads itself.
  await CURRENT_PAGE.waitForTimeout(OVERLAY_SETTLE_MS).catch(() => {})   // every run paints the card (2026-09-02), so every run lets it settle
  // …AND RE-PAINT THE RING WHERE THE ELEMENT IS NOW (2026-09-03, House View R7): the ring was painted
  // on a button reading "Publishing…", the button then re-laid out to "Activate" a few px away, and
  // the frame photographed the ring beside its element. Bounded like every measurement here — a
  // target that has gone is left as painted (the failed-and-missing case wants exactly that ring).
  if (LAST_TARGET && LAST_BOX) {
    const now = await raceTimeout(LAST_TARGET.first().boundingBox(), 400).catch(() => null)
    if (now && (Math.abs(now.x - LAST_BOX.x) > 1 || Math.abs(now.y - LAST_BOX.y) > 1 ||
      Math.abs(now.width - LAST_BOX.width) > 1 || Math.abs(now.height - LAST_BOX.height) > 1)) {
      LAST_BOX = now
      await renderOverlay(now, LAST_FAILED)
      await CURRENT_PAGE.waitForTimeout(OVERLAY_SETTLE_MS).catch(() => {})
    }
  }
  // …and the NAME of what is being checked travels with it (the human, 2026-09-02): CLAIM is the
  // claim proveVisible/hudCheck just painted on the bar, so its label IS this moment's name — the
  // very words the row's one stepper puts under the segment. Set by the caller a line before this
  // runs; absent (a bare snapValue) simply leaves the moment unnamed and the board says so generically.
  // …and the CLAIM ITSELF with it (the human, 2026-09-02): expected, got and the verdict, so the
  // drawn mirror can show the INTENT on a scene the app failed instead of mirroring the wrong value
  // back at the reader. Same source, same instant — the claim proveVisible just painted on the bar.
  // …and the claim JOINS THE BEAT'S LIST before the moment is harvested (phase 2, 2026-09-03): the
  // Expected replica of this moment is the app's markup with every claim up to and including this
  // one applied, so it has to be on the list the capture is handed, not added after the fact. Its
  // OWN ring box rides along too (fix round 2) — LAST_BOX is already this moment's, the re-paint
  // above having settled it — so a later rebuild can find where THIS claim's fix belongs once the
  // ring has moved on to somewhere its old base's region does not cover, AND (fix round 3, found
  // while re-harvesting: the CURRENT claim's own wrong-value fix went `unlocated` on R9's counter
  // because this copy — the one `snapReplica` actually applies via `applyOneClaim` — never carried
  // `ring` at all, only the ARRAY entry `c.claims` got it) so `applyOneClaim`'s own geometric locate
  // has a box to work with for the moment it is CURRENTLY applying, not only for the ones a later
  // rebuild replays.
  const claimWithRing = CLAIM ? { ...CLAIM, ring: LAST_BOX ? { ...LAST_BOX } : null } : null
  if (claimWithRing) c.claims.push(claimWithRing)
  await snapPhase(c.id, c.beat, c.seq, 'v' + c.k, Math.max(0, Date.now() - c.t0),
    CLAIM ? CLAIM.label : null, claimWithRing)
}
// the overlay's own transition (.16s) plus a frame — the ring is where it says it is after this
const OVERLAY_SETTLE_MS = 220

// checkReq / coverReqs — how a test PROVES a requirement (R4/R5). A test tags the requirement ids it
// covers (qualified, e.g. `asset-plan:R5`, so a flow can prove another screen's requirement) and
// asserts each on something that would fail without it. `checkReq(id, fn)` runs one such assertion
// inside a `proves <id>` step — the step's pass/fail IS the requirement's proof, and it doubles as
// human-readable evidence. `coverReqs(...)` declares the full set a flow intends to reach, so a flow
// that stops early leaves the ones it never got to honestly NOT-REACHED (not green, not red) rather
// than silently absent. The reporter reads the steps and the annotation back out (tools/coverage.mjs).
// the soft claims a beat collected (proveVisible `soft`), thrown as ONE failure at the beat's end —
// inside the `proves` step, so the step, the test and the requirement all fail the same way a hard
// claim fails them, with every wrong value named
function failSoft (id: string): void {
  const c = CUR_CHECK
  if (!c || !c.soft.length) return
  const list = c.soft.slice()
  c.soft = []
  // ONE line: _failAggregate keeps only the first line of a step's message, so the list rides it
  throw new Error(`proves ${id} — ${list.length} claim${list.length === 1 ? '' : 's'} failed: ${list.join(' · ')}`)
}
export async function checkReq (id: string, fn: () => Promise<void> | void): Promise<void> {
  // the step NAME stays exactly `proves <id>` — tools/coverage.mjs derives requirement state from it.
  const title = reqTitle(id)
  const nested = FLOW_DEPTH > 0
  await paceGate('req', id + (title ? ' — ' + title : ''))
  setChip(id, 'active')
  beat('req', id + (title ? ' — ' + title : ''))
  PROVING = { state: 'active', text: '▸ proving ' + id + (title ? ' — ' + title : '') }
  // The callout now narrates the requirement in its OWN When → Then (from the prd — the same words
  // the board's storyboard shows), so left and right read as one language. A requirement proven by
  // several checks advances through its beats: the Nth checkReq(id) of this test shows the Nth beat
  // (clamped to the last), so R5's two checks narrate its two beats in turn. Verdict rides on state.
  const beh = reqBehavior(id)
  const cursor = BEAT_CURSOR[id] || 0
  BEAT_CURSOR[id] = cursor + 1
  BEAT_IDX = beh && beh.beats.length ? Math.min(cursor, beh.beats.length - 1) : 0
  BEHAVIOR = { id, given: beh ? beh.given : '', beats: beh ? beh.beats : [], state: 'active' }
  // …and the SAME cursor keys the harvest (2026-08-28): this check's frames, layout skeletons and
  // window are filed under the beat it proves, so the board's per-beat rows each carry their own
  // proof. Held in a local, because a nested checkReq inside fn would move the global on us.
  const beatNo = BEAT_IDX + 1
  if (nested) {
    // inside a flowStep: run the proof in its `proves` step and let a failure PROPAGATE — the
    // enclosing flowStep catches it, records it, paints the red frame and continues the flow. The
    // narration line names the requirement being proven (the chip alone is an id, not a meaning),
    // and the chip advances ▸ → ✓/✕ so the strip tracks the proof through the whole flow.
    await emitNote('▸ proving ' + id + (title ? ' — ' + title : ''))
    await paintHud({})
    await hideFocus()                                  // the previous beat's ring must not haunt this
    // beat's BEFORE frame — clean scene, the ring and callout appear only once the action reveals
    // a target (renderOverlay's no-ring rule)
    // THE BEAT OPENS BEFORE ITS OWN BEFORE-FRAME (2026-09-03, phase 2). It used to open after it —
    // and the before frame's replica is the beat's STARTING POINT, the `lastRight` a later restore
    // reaches back to, so it has to be filed on the beat it belongs to. `t0` is still stamped after
    // the frame, where it always was: the offsets a value carries are measured from the instant the
    // `proves` step starts, not from the photograph before it.
    const outer = CUR_CHECK
    CUR_CHECK = { id, beat: beatNo, seq: cursor + 1, t0: 0, k: 0, soft: [], claims: [], lastRight: null, lastExpected: null, minRegion: null }
    await snapPhase(id, beatNo, cursor + 1, 'before')
    CUR_CHECK.t0 = Date.now()
    try {
      await test.step('proves ' + id, async () => { await fn(); failSoft(id) })
      setChip(id, 'pass')
      PROVING = { state: 'pass', text: '✓ ' + id + ' proven' }
      if (BEHAVIOR && BEHAVIOR.id === id) BEHAVIOR.state = 'pass'
      await paceGate('req-done', id + ' pass', false)
      beat('req-done', id + ' pass')
      await paintHud({})
    } catch (err) {
      // the verdict stays on the bar through the step's red frame — the voice explaining WHY this
      // requirement failed must always have the requirement on screen, whatever the step head says
      setChip(id, 'fail')
      PROVING = { state: 'fail', text: '✕ ' + id + ' failed' + (title ? ' — ' + title : '') }
      if (BEHAVIOR && BEHAVIOR.id === id) BEHAVIOR.state = 'fail'
      await paceGate('req-done', id + ' fail', false)
      beat('req-done', id + ' fail')
      throw err
    } finally {
      // the AFTER frame lands pass or fail — a failed proof's pair shows the state it broke in.
      // The beat closes AFTER it (2026-09-03, phase 2): its Expected half is the last intended state
      // the beat reached, which only the beat's own claim list knows. It used to close first, when
      // nothing downstream of the frame read the beat at all.
      await snapPhase(id, beatNo, cursor + 1, 'after')
      CUR_CHECK = outer
    }
    return
  }
  // top-level (a requirement-enumeration test, e.g. the board's own suite): continue-on-failure
  // here too, so the test runs through EVERY requirement and the board shows each one's verdict,
  // not just the first that broke. The test still fails — _failAggregate throws the aggregate.
  CLAIM = null; NOTE = ''
  await paintHud({ head: 'proving ' + id + (title ? ' — ' + title : '') })
  await hideFocus()                                  // the previous beat's ring must not haunt this
  // beat's BEFORE frame — clean scene, the ring and callout appear only once the action reveals
  // a target (renderOverlay's no-ring rule)
  const outerTop = CUR_CHECK                           // same beat window as the nested path above
  CUR_CHECK = { id, beat: beatNo, seq: cursor + 1, t0: 0, k: 0, soft: [], claims: [], lastRight: null, lastExpected: null, minRegion: null }
  await snapPhase(id, beatNo, cursor + 1, 'before')
  CUR_CHECK.t0 = Date.now()
  try {
    await test.step('proves ' + id, async () => { await fn(); failSoft(id) })
    setChip(id, 'pass')
    PROVING = { state: 'pass', text: '✓ ' + id + ' proven' }
    if (BEHAVIOR && BEHAVIOR.id === id) BEHAVIOR.state = 'pass'
    await paceGate('req-done', id + ' pass', false)
    beat('req-done', id + ' pass')
    await paintHud({ head: '✓ ' + id + (title ? ' — ' + title : '') })
  } catch (err) {
    STEP_FAILURES.push({ n: 0, title: id + (title ? ' — ' + title : ''), message: String((err as Error).message || err) })
    setChip(id, 'fail')
    PROVING = { state: 'fail', text: '✕ ' + id + ' failed' + (title ? ' — ' + title : '') }
    if (BEHAVIOR && BEHAVIOR.id === id) BEHAVIOR.state = 'fail'
    await paceGate('req-done', id + ' fail', false)
    beat('req-done', id + ' fail')
    await paintHud({ head: '✗ FAILED — ' + id + (title ? ' · ' + title : ''), failed: true })
    if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(700 + recordHold(0)).catch(() => {})
  } finally {
    // the AFTER frame lands pass or fail — here after the verdict paint, so a failed proof's
    // after-frame carries the red bar a renderer would want to show. The beat closes after it, for
    // the reason the nested path above gives.
    await snapPhase(id, beatNo, cursor + 1, 'after')
    CUR_CHECK = outerTop
  }
}
export function coverReqs (...ids: string[]): void {
  test.info().annotations.push({ type: 'covers', description: ids.join(' ') })
  // Seed the chip strip in DECLARED order, so the topbar shows the full set the flow intends to
  // prove — pending chips included — from the very first paint.
  for (const id of ids) if (!REQ_CHIPS.some(c => c.id === id)) REQ_CHIPS.push({ id, state: 'pending' })
}
