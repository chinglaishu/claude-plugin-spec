import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page, Locator } from '@playwright/test'
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBehavior } from '../tools/behavior.mjs'
// THE OVERLAY'S GEOMETRY, SHARED (2026-08-30). The ring's inset and the callout's placement are ONE
// rule now, stated in tools/overlay-geometry.mjs and imported by both this burn-in and the drawn
// schematic that mirrors it (tools/viz.mjs). They used to keep private copies of the same numbers
// and drifted: an audit of the demo's R1 beat cells found the drawn ring ~12 page px out from the
// element box where this one is ~5. This file is the REFERENCE — the module states its rules, it
// never invents new ones, and nothing about what the burn-in paints changes.
import { RING, CARD, ringBox, calloutSpot } from '../tools/overlay-geometry.mjs'
// …and the callout's WORDS from the module that owns them (2026-08-30), so the burned card and the
// drawn one say the same sentence for the same scene of the same beat.
import { calloutText, CALLOUT_TYPE, calloutLines, calloutLabelWidth } from '../tools/callout-text.mjs'

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
    BEAT_IDX = 0; BEAT_CURSOR = {}; LAST_BOX = null; CUR_CHECK = null
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
let CLAIM: { label: string, expected: string, got: string, ok: boolean } | null = null
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
// Vestigial since the narration stopped rendering a "proving R5" line and the id strip (2026-08-27):
// the verdict now rides on BEHAVIOR.state. Kept only because checkReq still assigns it and the
// per-test reset clears it; to be removed with the chip strip in the follow-up pass.
let PROVING: { state: 'active' | 'pass' | 'fail', text: string } | null = null
// THE CHECK CURRENTLY RUNNING (2026-08-29) — which requirement, which beat, and the wall-clock the
// beat's `proves` step started on. proveVisible needs it to file its asserted-value frame under the
// right beat and to say WHEN in that beat the frame was taken (the board paces the beat's loop off
// the step's own window, so the offset is measured from the same origin). Saved and restored around
// each checkReq so a nested one cannot strand the outer beat's identity.
type CurCheck = { id: string, beat: number, seq: number, t0: number, k: number }
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
async function renderOverlay (box: Box | null, failed: boolean): Promise<void> {
  const page = CURRENT_PAGE
  if (!page || !process.env.BOARD_RECORD) return
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
      veil.style.cssText = 'position:fixed;inset:0;background:rgba(28,27,24,.12);transition:opacity .18s ease'
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
      ring.style.boxShadow = '0 0 0 ' + ringCss.halo + 'px rgba(253,252,249,.92),0 0 ' + ringCss.glow + 'px ' +
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
      notch: CARD.notch, cardRadius: CARD.radius, padX: CARD.padX, padY: CARD.padY
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
  if (!page || !process.env.BOARD_RECORD) return
  const box = await target.first().boundingBox().catch(() => null)
  if (!box) return
  LAST_BOX = box
  await renderOverlay(box, !!opts.failed)
}
// Hide the overlay so a NEW step starts clean — the ring and callout reappear only once the step
// reveals a value to prove, never lingering on the previous step's cell.
async function hideFocus (): Promise<void> {
  const page = CURRENT_PAGE
  if (!page || !process.env.BOARD_RECORD) return
  LAST_BOX = null
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
export async function hudCheck (label: string, expected: unknown, actual: unknown, opts: { assert?: boolean } = {}): Promise<void> {
  const ok = String(expected) === String(actual)
  CLAIM = { label: String(label), expected: String(expected), got: String(actual), ok }
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
async function shownText (target: Locator): Promise<string> {
  const el = target.first()
  const v = await el.evaluate((n: any) => {
    const tag = String(n.tagName || '').toUpperCase()
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return String(n.value == null ? '' : n.value)
    return String(n.textContent == null ? '' : n.textContent)
  }).catch(() => null)
  if (v != null) return String(v).trim()
  return ((await el.textContent().catch(() => '')) || '').trim()
}

export async function proveVisible (
  target: Locator,
  expected: string,
  label: string,
  opts: { match?: (shown: string) => boolean } = {}
): Promise<void> {
  await reveal(target, { hold: 0 })                         // centre it now, ring it in ink; the readable hold comes after we read
  const shown = await shownText(target)
  await hudCheck(label, expected, shown, { assert: false }) // paint the CLAIM now, but DON'T throw yet — assert LAST, below
  const ok = opts.match ? !!opts.match(shown) : shown === expected
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
  if (opts.match) expect(ok, `${label}: on-screen "${shown}" vs expected "${expected}"`).toBe(true)
  else expect(shown, `${label} — the value read off the screen`).toBe(expected)
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
async function snapEvidence (id: string, beat: number, seq: number, phase: Phase): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  try {
    const info = test.info()
    // seq (which check of this id) keys the FILE, not the attachment: two checks clamped onto the
    // same beat must not share a path, or the second's screenshot silently overwrites the first's
    // and the reporter's first-wins fold picks an already-clobbered file.
    const file = info.outputPath(`evidence-${safeId(id)}-b${beat}-c${seq}-${phase}.png`)
    await page.screenshot({ path: file, timeout: 2500 })
    info.attachments.push({ name: `evidence ${id}#${beat} ${phase}`, path: file, contentType: 'image/png' })
  } catch { /* evidence is a by-product — the proof is the assertion, never the photo */ }
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
// Beside each evidence frame, a cheap measurement of WHERE the page's boxes are — the viewport
// size, the ring target, and up to 150 visible, meaningfully-sized elements, each with a rough
// kind (heading / text / input / button / row / container / image), its text where it is a leaf
// (or the ringed element itself), and `focus` on whatever the ring is actually around.
// tools/viz.mjs renderWireframe draws the requirement's schematic FROM this pair, so the picture
// beside the requirement is the app's own layout rather than an abstract archetype nobody could
// map onto it. Attached as `layout <id> before|after`, mirroring the frames, and folded by the
// reporter to spec/<screen>/evidence/<id>.<phase>.layout.json.
//
// A by-product exactly like the frames: bounded (a walk budget in the page, a deadline outside
// it), every failure swallowed. It measures and never touches the page, so it cannot change what
// the assertion then reads.
async function snapLayout (id: string, beat: number, seq: number, phase: Phase, at: number | null = null): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  try {
    const info = test.info()
    const data: any = await raceTimeout(page.evaluate((ring: Box | null) => {
      const OVERLAY = '__specboard-focus'
      const CAP = 150            // enough boxes to recognise a screen, few enough to draw
      const MAXD = 14            // depth cap — a deep component tree adds wrappers, not information
      const MIN = 12             // px: below this an element is a divider or an icon fleck
      const BUDGET = 6000        // nodes visited, so a huge app costs a bounded walk
      const vw = window.innerWidth || 0
      const vh = window.innerHeight || 0
      const rb = ring ? { x: ring.x, y: ring.y, w: ring.width, h: ring.height } : null
      const rArea = rb ? Math.max(1, rb.w * rb.h) : 0
      const els: any[] = []
      let visited = 0
      const clean = (s: any) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 48)
      const kindOf = (el: any, tag: string, leaf: boolean, text: string) => {
        const role = (el.getAttribute && el.getAttribute('role')) || ''
        if (/^H[1-6]$/.test(tag) || role === 'heading') return 'heading'
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'input'
        if (tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'link' || role === 'tab') return 'button'
        if (tag === 'IMG' || tag === 'SVG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'PICTURE') return 'image'
        if (tag === 'LI' || tag === 'TR' || role === 'row' || role === 'listitem') return 'row'
        if (leaf && text) return 'text'
        return 'container'
      }
      const walk = (node: any, depth: number) => {
        if (depth > MAXD) return
        const kids = node.children || []
        for (let i = 0; i < kids.length; i++) {
          if (els.length >= CAP || visited >= BUDGET) return
          const el = kids[i]
          visited++
          if (el.id === OVERLAY) continue                 // never measure our own narration overlay
          const tag = String(el.tagName || '').toUpperCase()
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE' ||
            tag === 'LINK' || tag === 'META') continue
          const r = el.getBoundingClientRect()
          if (!r || r.width < 1 || r.height < 1) continue                 // display:none, and its subtree
          if (r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh) continue   // off-screen
          if (r.width >= MIN && r.height >= MIN) {
            const leaf = el.childElementCount === 0
            let text = leaf ? clean(el.textContent) : ''
            if (tag === 'INPUT') text = clean(el.value || el.getAttribute('placeholder') || '')
            let focus = false
            if (rb) {
              const ox = Math.max(0, Math.min(r.right, rb.x + rb.w) - Math.max(r.left, rb.x))
              const oy = Math.max(0, Math.min(r.bottom, rb.y + rb.h) - Math.max(r.top, rb.y))
              const area = Math.max(1, r.width * r.height)
              // the RINGED element, not every ancestor containing it: most of the element must lie
              // inside the ring, and it may not be far larger than the ring itself
              focus = (ox * oy) / area >= 0.6 && area <= rArea * 4
            }
            // the asserted value is the whole point of the mirror — take it however it is nested
            if (focus && !text) text = clean(el.innerText || el.textContent)
            const rec: any = {
              x: Math.round(r.left), y: Math.round(r.top),
              w: Math.round(r.width), h: Math.round(r.height),
              kind: kindOf(el, tag, leaf, text)
            }
            if (text) rec.text = text
            if (focus) rec.focus = true
            // THE ELEMENT'S OWN TYPE (2026-08-29, the human: "the input box of add task is in a
            // different place"). The boxes already matched; what did not was the text INSIDE the
            // ringed box — the drawing typed the asserted value centred, at a size taken from the
            // box's height, which is right for a text leaf and wrong for a field. So measure what
            // the page actually does with that text: its font size, its alignment, and the inset
            // its text starts from (padding + border). Only for elements that carry text — the kit
            // types nothing else — so this costs one getComputedStyle per drawn label, never per node.
            if (text) {
              try {
                const cs = getComputedStyle(el)
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
              } catch { /* an element that will not compute simply has no measured type */ }
            }
            els.push(rec)
          }
          if (tag !== 'SVG') walk(el, depth + 1)     // an inline svg is ONE picture, not a shape tree
        }
      }
      if (document.body) walk(document.body, 0)
      return { w: vw, h: vh, ring: rb, els }
    }, LAST_BOX), 2500)
    if (!data || !Array.isArray(data.els) || !data.els.length) return
    const file = info.outputPath(`layout-${safeId(id)}-b${beat}-c${seq}-${phase}.json`)  // seq keys the file only — see snapEvidence
    // `at` — this frame's offset in ms from the moment the beat's `proves` step started, so the
    // board can anchor it inside the beat's own window and play the loop at the run's true relative
    // pace. It rides the skeleton because the skeleton is already a per-phase file; it is deliberately
    // NOT part of the drawing's layout pin (tools/viz.mjs layoutHash strips it — a timestamp that
    // never repeats would redraw every schematic on every run).
    writeFileSync(file, JSON.stringify(at == null ? data : { ...data, at }))
    info.attachments.push({ name: `layout ${id}#${beat} ${phase}`, path: file, contentType: 'application/json' })
  } catch { /* the drawing is a by-product too — a page that would not measure simply has none */ }
}

// The pair a phase leaves behind, keyed by the BEAT it proves (2026-08-28 — the board is becoming
// per-beat rows, so every artefact is per beat too): the frame a person looks at, and the geometry
// the schematic is drawn from. The layout also carries the RING (the after phase's `ring` is the
// focus rect the board zooms the media onto — tools/evidence.mjs focusFromLayout lifts it into the
// index), so there is one measurement and one source of truth. Photograph FIRST — the picture is
// the evidence; the measurement rides after it.
async function snapPhase (id: string, beat: number, seq: number, phase: Phase, at: number | null = null): Promise<void> {
  await snapEvidence(id, beat, seq, phase)
  await snapLayout(id, beat, seq, phase, at)
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
  if (process.env.BOARD_RECORD) await CURRENT_PAGE.waitForTimeout(OVERLAY_SETTLE_MS).catch(() => {})
  await snapPhase(c.id, c.beat, c.seq, 'v' + c.k, Math.max(0, Date.now() - c.t0))
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
  await snapPhase(id, beatNo, cursor + 1, 'before')
    // the beat is now OPEN: every value proveVisible rings inside fn files itself under it, timed
    // from here — the same origin the reporter's window uses (the `proves` step starts next)
    const outer = CUR_CHECK
    CUR_CHECK = { id, beat: beatNo, seq: cursor + 1, t0: Date.now(), k: 0 }
    try {
      await test.step('proves ' + id, async () => { await fn() })
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
      CUR_CHECK = outer                                // the beat closes before its after-frame
      // the AFTER frame lands pass or fail — a failed proof's pair shows the state it broke in
      await snapPhase(id, beatNo, cursor + 1, 'after')
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
  await snapPhase(id, beatNo, cursor + 1, 'before')
  const outerTop = CUR_CHECK                           // same beat window as the nested path above
  CUR_CHECK = { id, beat: beatNo, seq: cursor + 1, t0: Date.now(), k: 0 }
  try {
    await test.step('proves ' + id, async () => { await fn() })
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
    CUR_CHECK = outerTop
    // the AFTER frame lands pass or fail — here after the verdict paint, so a failed proof's
    // after-frame carries the red bar a renderer would want to show
    await snapPhase(id, beatNo, cursor + 1, 'after')
  }
}
export function coverReqs (...ids: string[]): void {
  test.info().annotations.push({ type: 'covers', description: ids.join(' ') })
  // Seed the chip strip in DECLARED order, so the topbar shows the full set the flow intends to
  // prove — pending chips included — from the very first paint.
  for (const id of ids) if (!REQ_CHIPS.some(c => c.id === id)) REQ_CHIPS.push({ id, state: 'pending' })
}
