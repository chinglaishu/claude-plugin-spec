import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page, Locator } from '@playwright/test'
import { readFileSync, appendFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

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
export const test = windowed.extend<{ page: Page }>({
  page: async ({ page }, use, testInfo) => {
    CURRENT_PAGE = page
    FLOW_N = 0
    FLOW_DEPTH = 0
    FAILED_PAINTED = false
    STEP_FAILURES = []
    REQ_CHIPS = []
    PROVING = null
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
  }
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
// afterEach hook paints a final red summary and fails the test if this is non-empty.
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
  // again (nor flip it back to ▸ active). The aggregate afterEach still fails the test regardless;
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

// The in-video narration TOPBAR (board R10). Painted INTO the page under test, so it is burned
// into the recording and its cover — one consistent bar fixed to the top, never a caption card
// mid-frame. pointer-events:none so it can never swallow a click the test meant for the app;
// inline styles because it renders inside arbitrary apps that know nothing of the board's design
// system (the values mirror the design tokens: ink, paper, and a deep bengara for failure).
// The bar is a designed, glanceable card (board R10): a bold title line for the current story
// step, the announced values stacked beneath — accumulating within a step the way a person would
// list them, capped so the bar cannot swallow the frame.
const HUD = { head: '', detail: '' }
const DETAIL_MAX_LINES = 3
// The band's fixed height under a recording. Fixed on purpose: the page below is shifted by
// exactly this much, and a bar that grew with its detail lines would bounce the whole app on
// every narration line.
const BAND_H = 142
// The PROVING line — steps and requirements are two different numbering systems (Step N = what the
// flow DOES, R# = what it PROVES, many-to-many), and a watcher hearing "requirement five" while the
// head says "Step 1" needs the bar itself to say which is which. While a checkReq runs, this
// dedicated line names the requirement under the step head — "▸ proving R5 — <its title>" — and it
// HOLDS the verdict ("✕ R5 failed — …") through the step's red frame, so the voice explaining the
// failure always has its R# on screen. Cleared when a new step starts.
let PROVING: { state: 'active' | 'pass' | 'fail', text: string } | null = null
// A goto WIPES the injected bar — and real flows navigate mid-beat (a cross-page read). Repaint
// after every main-frame navigation so the narration is consistently on screen, not only until
// the first goto. One listener per page, installed lazily on first paint.
const HOOKED = new WeakSet<Page>()
function repaintOnNav (page: Page): void {
  if (HOOKED.has(page)) return
  HOOKED.add(page)
  page.on('framenavigated', f => {
    if (f !== page.mainFrame() || !HUD.head || page !== CURRENT_PAGE) return
    // Repaint AFTER the new document is ready. Evaluating the instant `framenavigated`
    // fires races the execution-context teardown and REJECTS — the reject is caught, but
    // Playwright still records it as a failed "Run a script on the page" step, a spurious
    // red ✕ on a flow that actually passed. Waiting for domcontentloaded lets the repaint
    // land on a live context. Fully fire-and-forget: never awaited by the flow, and the
    // wait's own failure (page closed / superseded nav) is swallowed.
    void page.waitForLoadState('domcontentloaded')
      .then(() => { if (HUD.head && page === CURRENT_PAGE) return paintHud({}) })
      .catch(() => {})
  })
}
async function paintHud (s: { head?: string, detail?: string, appendDetail?: string, failed?: boolean }): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  repaintOnNav(page)
  if (s.head !== undefined) { HUD.head = s.head; HUD.detail = '' }   // a new step starts a fresh list
  if (s.detail !== undefined) HUD.detail = s.detail
  if (s.appendDetail !== undefined) {
    const lines = (HUD.detail ? HUD.detail.split('\n') : []).concat(String(s.appendDetail).split('\n'))
    HUD.detail = lines.slice(-DETAIL_MAX_LINES).join('\n')
  }
  await page.evaluate(({ head, detail, failed, chips, band, proving }) => {
    let el = document.getElementById('__specboard-hud')
    if (!el) {
      el = document.createElement('div')
      el.id = '__specboard-hud'
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;' +
        'display:flex;flex-direction:column;gap:4px;padding:12px 22px 10px;box-sizing:border-box;' +
        'font-family:system-ui,sans-serif;color:#f4f1ea;background:rgba(28,27,24,.94);' +
        'border-bottom:3px solid rgba(244,241,234,.30);box-shadow:0 2px 14px rgba(0,0,0,.30)'
      const row = document.createElement('div')
      row.id = '__specboard-hud-row'
      row.style.cssText = 'display:flex;align-items:flex-start;gap:18px'
      const h = document.createElement('div')
      h.id = '__specboard-hud-head'
      h.style.cssText = 'flex:1;font-weight:700;font-size:19px;line-height:1.25;letter-spacing:-.01em;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      const c = document.createElement('div')
      c.id = '__specboard-hud-reqs'
      c.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;padding-top:2px'
      row.append(h, c)
      const p = document.createElement('div')
      p.id = '__specboard-hud-proving'
      p.style.cssText = 'font-weight:600;font-size:15px;line-height:1.45;letter-spacing:.01em;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      const d = document.createElement('div')
      d.id = '__specboard-hud-detail'
      d.style.cssText = 'font-weight:400;font-size:14px;line-height:1.55;opacity:.92;white-space:pre-line'
      el.append(row, p, d)
      // Hang the bar off <html>, NOT <body>. Under a recording the body is transformed down by the
      // band height so the bar sits ABOVE the site instead of on top of it — nothing is ever
      // covered, and because a transformed body becomes the containing block for its fixed
      // descendants, the app's own fixed chrome (sidebars, sticky headers) shifts down too. The
      // bar itself must therefore live OUTSIDE the body, or it would shift with everything else.
      document.documentElement.appendChild(el)
    }
    if (band) {
      el.style.height = band + 'px'
      el.style.overflow = 'hidden'
      document.body.style.transform = 'translateY(' + band + 'px)'
    }
    el.style.background = failed ? 'rgba(122,47,29,.96)' : 'rgba(28,27,24,.94)'
    el.style.borderBottomColor = failed ? 'rgba(232,161,138,.65)' : 'rgba(244,241,234,.30)'
    const hd = document.getElementById('__specboard-hud-head')
    const dt = document.getElementById('__specboard-hud-detail')
    if (hd) hd.textContent = head
    if (dt) { dt.textContent = detail; dt.style.display = detail ? '' : 'none' }
    // the requirement being proven, labeled as such — paper while running, koke on proven,
    // bengara-tint on failed (every state also carries its mark, per the design rule)
    const pv = document.getElementById('__specboard-hud-proving')
    if (pv) {
      pv.style.display = proving ? '' : 'none'
      if (proving) {
        pv.textContent = proving.text
        pv.style.color = proving.state === 'fail' ? '#e8a18a' : proving.state === 'pass' ? '#bcc4a8' : '#f4f1ea'
      }
    }
    // The requirement chips — rebuilt each paint (a handful of spans; idempotent and cheap). Every
    // state wears a MARK as well as a colour: ▸ active, ✓ passed, ✕ failed, pending bare (design
    // rule: hue names a state but never carries it alone). The palette mirrors the design tokens the
    // HUD already uses — paper on ink, koke-line for a pass, bengara for a failure.
    const strip = document.getElementById('__specboard-hud-reqs')
    if (strip) {
      strip.innerHTML = ''
      strip.style.display = chips.length ? '' : 'none'
      const MARK: Record<string, string> = { pending: '', active: '▸ ', pass: '✓ ', fail: '✕ ' }
      const CSS: Record<string, string> = {
        pending: 'color:rgba(244,241,234,.72);border:1px solid rgba(244,241,234,.35);background:transparent',
        active: 'color:#1c1b18;border:1px solid #f4f1ea;background:#f4f1ea',
        pass: 'color:#bcc4a8;border:1px solid rgba(188,196,168,.55);background:transparent',
        fail: 'color:#f4f1ea;border:1px solid rgba(232,161,138,.65);background:rgba(122,47,29,.96)'
      }
      for (const chip of chips) {
        const s = document.createElement('span')
        s.setAttribute('data-req', chip.id)
        s.style.cssText = 'font-size:12px;font-weight:600;letter-spacing:.02em;white-space:nowrap;' +
          'padding:3px 10px;border-radius:999px;' + CSS[chip.state]
        s.textContent = MARK[chip.state] + chip.id
        strip.appendChild(s)
      }
    }
  }, {
    head: HUD.head,
    detail: HUD.detail,
    failed: !!s.failed,
    chips: REQ_CHIPS.map(c => ({ ...c })),
    // the band-and-shift layout only under a recording — a plain suite run must leave the page
    // geometry exactly alone (tests may assert on positions, and nobody is watching anyway)
    band: process.env.BOARD_RECORD ? BAND_H : 0,
    proving: PROVING ? { ...PROVING } : null
  }).catch(() => {})
}

// The FOCUS overlay (board R10 — the recording is the proof a human checks). A dense table's topbar
// names a value but not WHERE it is; this paints the eye onto the exact cell reveal() centres. Like
// the HUD it is injected INTO the page, so it is burned into the video and shown in the live watch: a
// full-width dim BAND that lights only the target's row (so the topbar's words tie to the row on the
// left), and a RING on the target itself — sumi ink normally, deep bengara on a failed check (the one
// place red belongs — it mirrors the topbar going red). Gated on a board recording, so a plain
// `npm run e2e` paints nothing and stays fast. pointer-events:none so it never swallows a click, and a
// z-index just BELOW the HUD so the narration always sits on top. Best-effort: an off-screen or
// detached target (no box) simply leaves the previous frame's overlay as it was.
async function paintFocus (target: Locator, opts: { failed?: boolean } = {}): Promise<void> {
  const page = CURRENT_PAGE
  if (!page || !process.env.BOARD_RECORD) return
  // Apply the band shift BEFORE measuring. A bare proveVisible with no flowStep in front would
  // otherwise measure the cell pre-shift, paint the ring, and then the first hudCheck's paint
  // would shift the page — leaving the ring BAND_H px above the cell it claims to point at.
  await page.evaluate((band) => { document.body.style.transform = 'translateY(' + band + 'px)' }, BAND_H).catch(() => {})
  const box = await target.first().boundingBox().catch(() => null)
  if (!box) return
  await page.evaluate(({ box, failed }) => {
    const RING = failed ? '#7a2f1d' : '#1c1b18'                       // bengara on failure, sumi ink on a pass
    const GLOW = failed ? 'rgba(122,47,29,.38)' : 'rgba(28,27,24,.28)'
    let el = document.getElementById('__specboard-focus')
    if (!el) {
      el = document.createElement('div')
      el.id = '__specboard-focus'
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none'
      // outside the (possibly transformed) body, like the HUD — a fixed overlay inside a
      // transformed body would be re-rooted and land BAND_H px below the cell it rings
      document.documentElement.appendChild(el)
      const veil = document.createElement('div')
      veil.className = 'sb-veil'
      // a transparent full-width band; its huge box-shadow dims everything ABOVE and BELOW it, so the
      // target's row stays lit while the rest of the table recedes.
      veil.style.cssText = 'position:fixed;left:0;width:100vw;box-shadow:0 0 0 100vmax rgba(28,27,24,.5);' +
        'transition:top .18s ease,height .18s ease'
      const ring = document.createElement('div')
      ring.className = 'sb-ring'
      ring.style.cssText = 'position:fixed;border-radius:5px;transition:all .18s ease'
      el.append(veil, ring)
    }
    el.style.display = ''
    const veil = el.querySelector('.sb-veil') as HTMLElement
    const ring = el.querySelector('.sb-ring') as HTMLElement
    veil.style.top = (box.y - 2) + 'px'
    veil.style.height = (box.height + 4) + 'px'
    ring.style.left = (box.x - 3) + 'px'
    ring.style.top = (box.y - 3) + 'px'
    ring.style.width = (box.width + 6) + 'px'
    ring.style.height = (box.height + 6) + 'px'
    ring.style.border = '2px solid ' + RING
    ring.style.boxShadow = '0 0 0 3px rgba(244,241,234,.7),0 0 12px ' + GLOW
  }, { box, failed: !!opts.failed }).catch(() => {})
}
// Hide the focus overlay so a NEW step starts clean — the ring reappears only once the step reveals a
// value to prove, never lingering on the previous step's cell.
async function hideFocus (): Promise<void> {
  const page = CURRENT_PAGE
  if (!page || !process.env.BOARD_RECORD) return
  await page.evaluate(() => {
    const el = document.getElementById('__specboard-focus')
    if (el) el.style.display = 'none'
  }).catch(() => {})
}

// A narration line does TWO things at once: it stacks onto the topbar (into the video), and it is
// RECORDED as a `note: ` step so the board can show it as the step's expandable detail — the same
// got/expected line in both places, from one call (board R10).
async function narrate (text: string): Promise<void> {
  await paceGate('note', text)
  beat('note', text)
  await test.step('note: ' + text, async () => {
    await paintHud({ appendDetail: text })
  })
}
// Announce the got vs expected values of the current check.
export async function hudCheck (label: string, expected: unknown, actual: unknown): Promise<void> {
  await narrate(String(label) + ' — got ' + String(actual) + ' · expected ' + String(expected))
}
// Freeform variant, for a sentence the author wants on the bar.
export async function hudNote (text: string): Promise<void> {
  await narrate(String(text))
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
export async function proveVisible (
  target: Locator,
  expected: string,
  label: string,
  opts: { match?: (shown: string) => boolean } = {}
): Promise<void> {
  await reveal(target, { hold: 0 })                         // centre it now, ring it in ink; the readable hold comes after we read
  const shown = ((await target.first().textContent()) || '').trim()
  await hudCheck(label, expected, shown)
  const ok = opts.match ? !!opts.match(shown) : shown === expected
  // A wrong value turns the ring bengara BEFORE we throw, and we hold on that red frame, so the
  // recording shows exactly which cell failed rather than cutting away at the assertion.
  if (!ok) await paintFocus(target, { failed: true })
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
  PROVING = null                                             // a new step starts with no requirement claimed
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
    // still failed: afterEach throws the aggregate. The recording keeps rolling through every step.
    await test.step(title, async () => { await fn() })
    await paceGate('step-done', '✓ ' + n + '. ' + title, false)
    beat('step-done', '✓ ' + n + '. ' + title)
    await paintHud({ head: '✓ ' + title, detail: HUD.detail })
  } catch (err) {
    STEP_FAILURES.push({ n, title, message: String((err as Error).message || err) })
    await paceGate('step-done', '✗ ' + n + '. ' + title, false)
    beat('step-done', '✗ ' + n + '. ' + title)
    await paintHud({ head: '✗ Failed — ' + title, detail: HUD.detail, failed: true })
    // Hold the red frame long enough to READ: the last detail line is the failing check's own
    // got-vs-expected, and under a recording the pause stretches by the watch pace so the failure
    // is a scene, not a flash. (A narrated run holds longer still — the pace gate keeps this frame
    // up until the fail line has been spoken.)
    if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(900 + recordHold(0)).catch(() => {})
    // deliberately NOT re-thrown — the flow runs on
  } finally {
    FLOW_DEPTH--
  }
}

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
  if (nested) {
    // inside a flowStep: run the proof in its `proves` step and let a failure PROPAGATE — the
    // enclosing flowStep catches it, records it, paints the red frame and continues the flow. The
    // narration line names the requirement being proven (the chip alone is an id, not a meaning),
    // and the chip advances ▸ → ✓/✕ so the strip tracks the proof through the whole flow.
    await narrate('▸ proving ' + id + (title ? ' — ' + title : ''))
    try {
      await test.step('proves ' + id, async () => { await fn() })
      setChip(id, 'pass')
      PROVING = { state: 'pass', text: '✓ ' + id + ' proven' }
      await paceGate('req-done', id + ' pass', false)
      beat('req-done', id + ' pass')
      await paintHud({})
    } catch (err) {
      // the verdict stays on the bar through the step's red frame — the voice explaining WHY this
      // requirement failed must always have its R# on screen, whatever the step head says
      setChip(id, 'fail')
      PROVING = { state: 'fail', text: '✕ ' + id + ' failed' + (title ? ' — ' + title : '') }
      await paceGate('req-done', id + ' fail', false)
      beat('req-done', id + ' fail')
      throw err
    }
    return
  }
  // top-level (a requirement-enumeration test, e.g. the board's own suite): continue-on-failure
  // here too, so the test runs through EVERY requirement and the board shows each one's verdict,
  // not just the first that broke. The test still fails — afterEach throws the aggregate.
  await paintHud({ head: 'proving ' + id + (title ? ' — ' + title : '') })
  try {
    await test.step('proves ' + id, async () => { await fn() })
    setChip(id, 'pass')
    PROVING = { state: 'pass', text: '✓ ' + id + ' proven' }
    await paceGate('req-done', id + ' pass', false)
    beat('req-done', id + ' pass')
    await paintHud({ head: '✓ ' + id + (title ? ' — ' + title : ''), detail: HUD.detail })
  } catch (err) {
    STEP_FAILURES.push({ n: 0, title: id + (title ? ' — ' + title : ''), message: String((err as Error).message || err) })
    setChip(id, 'fail')
    PROVING = { state: 'fail', text: '✕ ' + id + ' failed' + (title ? ' — ' + title : '') }
    await paceGate('req-done', id + ' fail', false)
    beat('req-done', id + ' fail')
    await paintHud({ head: '✗ FAILED — ' + id + (title ? ' · ' + title : ''), detail: HUD.detail, failed: true })
    if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(700 + recordHold(0)).catch(() => {})
  }
}
export function coverReqs (...ids: string[]): void {
  test.info().annotations.push({ type: 'covers', description: ids.join(' ') })
  // Seed the chip strip in DECLARED order, so the topbar shows the full set the flow intends to
  // prove — pending chips included — from the very first paint.
  for (const id of ids) if (!REQ_CHIPS.some(c => c.id === id)) REQ_CHIPS.push({ id, state: 'pending' })
}

// A flow ran every step and collected its failures rather than dying at the first (board R10). Now
// close the loop: paint ONE final red summary — so the recording's cover frame shows the failure
// (not a later green step) and names every part that broke — then FAIL the test with all of them.
test.afterEach(async ({}, testInfo) => {
  if (!STEP_FAILURES.length) return
  const f = STEP_FAILURES
  if (CURRENT_PAGE) {
    await paintHud({
      // titles only, no ordinals — beside a strip of R-chips, a "✗ 2." reads like a requirement
      // number and the whole point of the card is to be unmistakable
      head: '✗ ' + f.length + ' of this test’s steps failed',
      detail: f.map(s => '✗ ' + s.title).slice(0, 6).join('\n'),
      failed: true
    }).catch(() => {})
    await CURRENT_PAGE.waitForTimeout(1400).catch(() => {})
    // Playwright's automatic screenshot fires BEFORE this hook, so on its own the run's cover
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
})
