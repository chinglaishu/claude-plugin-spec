---
name: kg-e2e
description: Use to author the E2E test that proves a specboard screen's requirements — the proof half of the board (requirements on one end, the tests that prove them on the other). The test TAGS each requirement it covers with checkReq/coverReqs and asserts something that would fail without it. Write the failing assertion first and watch it go red. Used standalone when a screen needs its test, and by kg-init to characterize an existing screen.
---

# Authoring the test that proves a screen

> **Where the board lives.** THE RULE: a project's board — `spec/`, the vendored `tools/`, `board.html`,
> `playwright.board.ts`, `node_modules` — lives in **`specboard/` inside the app repo**, a folder the app's
> git ignores wholesale (`/specboard/`). It is **local-only and single-user** for now (not a git repo of
> its own — the human's decision; team sharing is the coming cloud step). So from the app repo, **`cd
> specboard` before every command below** — nothing specboard-related is ever committed to the app.
> Two exceptions you may meet: a one-line `.specboard` file naming a board kept elsewhere (cd there
> instead), or an old flat project with `spec/` at the root (stay put). `update.mjs` and `scaffold.mjs`
> find the board themselves either way.

specboard is two ends: the **requirements** (the source of truth) and the **tests that prove them**
against the real app. This skill is the second end. The test lives next to the screen it proves —
`spec/<screen>/test.spec.ts` — and its whole job is to make a requirement's state *earned*: a
requirement reads **proven** only when a current, passing, assertion-backed test tags it. No test, or
a test that only paints, and the requirement is **unproven** — honestly, with no status field to fake.

A test does not carry a screenshot column anymore. It still writes `spec/<screen>/screen.png`, but
only as the **fallback cover** for a run that has no video (a headless CLI run, or a pruned
recording) — the run's **recording** is the primary evidence, and there is no "did you build it"
gate to satisfy. Write the screenshot once, at the end; it is a cover frame, not a deliverable.

## How a test proves a requirement — tag it, then assert it

The link between a requirement and its proof lives in the **test**, which tags the requirement ids it
covers. Two helpers, both imported from `'../_base'`:

- **`checkReq(id, fn)`** runs `fn` inside a `proves <id>` step. The step's pass/fail **is** the
  requirement's proof — and it doubles as human-readable evidence in the test's step list. Put an
  assertion inside `fn` that would fail if that requirement were deleted from the app.
- **`coverReqs(...ids)`** declares, up front, the full set of requirements the flow *intends* to
  reach. A flow that fails partway leaves the ids it never got to recorded **not-reached** — neither
  green nor red — instead of silently absent. `"0 of 0 passing"` reads green; not-reached must not.

**Families do not change how you tag.** A prd may group its `## R<n>` sections under `### <n> ·
<family> — <gloss>` headings (board R17); a test still tags the requirement *id* (`checkReq('R5', …)`),
never a family — a family has no state, and the board derives its marks from the requirements under
it. What families *do* change is how you choose what a flow covers: a flow that walks one family end to
end ("Containers and roll-up": R3 → R4 → R5) reads on the board as that family going green together,
which is the most legible proof a screen can show; declare that set with `coverReqs` so a flow that
stops early leaves the rest of the family honestly not-reached. Do not split a family across two
shallow tests to make its header fill in — the jump-map (the Focus pager's dots, grouped under their
family labels) shows each requirement's own mark, so a half-proven family reads exactly as half-proven.

`checkReq` also **narrates the recording**: it paints a topbar into the page under test naming the
requirement being proven (id + title from the PRD), turning red on a failing check — so the video
explains itself. Two optional helpers put the *numbers* on that bar, from `'../_base'` too:
**`hudCheck(label, expected, actual)`** paints the current check's expected vs actual values on the bar
AND **asserts** them — it is a check, not a caption, so it throws on a mismatch. **Use it AS the
assertion for every value you show**; do not pair it with a separate `expect()` on the same value. The
trap it prevents: a display-only check plus a divergent `expect()` let a red run's bar show a
passing-looking "expected 9% · got 9%" while some *other* `expect()` was the real failure — so the bar
lied about why it broke. With `hudCheck` asserting, the bar always shows the check that actually failed.
**`hudNote(text)`** shows a freeform sentence (no assertion). Never paint your own captions or overlays
into the page — one consistent topbar, always in the same place, is the contract.

That yields the three states the board derives per requirement: **pass** (a `proves` step ran and did
not error), **fail** (it ran and errored), **not-reached** (declared in `coverReqs` but its step
never ran). The reporter folds these per-requirement into `spec/_results-index.json`, and
`spec-store` turns them into each requirement's state: **proven / unproven** — proven when a current
passing assertion covers it, unproven otherwise. There is no acceptance gate; the board's status
word adds **changed** (board R4, indigo) for a requirement proved before whose text has since moved
past its proof — it reads unproven until re-run, never green.

**Ids are many-to-many and can be qualified.** One test can prove several requirements; one
requirement can be proven by several tests. A bare id (`R4`) means *this test's own screen*; a
qualified id (`asset-plan:R5`) names another screen's requirement. So a flow that edits on one screen
and checks the effect on a second can prove requirements on **both** — the flow's *file* lives in the
screen it **starts** on, but its coverage lands wherever it tags. This is exactly the comprehensive
cross-screen flow the board wants (edit here → assert there), and it is why a test's title should name
the **flow**, not a single requirement.

**`spec/board/test.spec.ts` is the worked example** — the board proves its own requirements this
way. Read it before writing your first one.

## The rules that make it a test and not a decoration

1. **Write the failing assertion first, and watch it go red.** A test written after the code can only
   confirm what the code already does. Run it, see it fail for the reason you expect, then make it
   pass. If you cannot make it fail, you have not yet written a test.
2. **Assert something that can fail.** If the `proves` step would still pass with the requirement
   deleted from the app, it is a smoke alarm with the battery out. Assert the *behaviour the
   requirement names* — the text that must appear, the control that must work, the number that must
   change — not that "the page loaded."
3. **Assert on DATA, not chrome.** A real app's frame — nav, headings, an empty table — paints
   instantly, so a test that checks a heading passes *before the list has loaded*. Push the assertion
   onto content that only exists once the API resolved: a real table row, a grid cell, an API-derived
   number. Wait for it first with `waitForContent(locator)` from `_base`, then assert. This is the
   single most common way a guessed characterization test becomes a false green — the screen "passes"
   without its data ever arriving.
4. **Assert that something DID happen — and beware occlusion.** `toBeVisible()` checks only that an
   element is not `display:none`; it does NOT check whether a modal or overlay covers it. So a test
   built from presence/absence checks can pass while the page is stuck behind a popup. Dismiss
   transient notices first (click their close, then assert they are gone), and prefer proving a real
   OUTCOME — a lever moves a number, a search narrows a list, a save shows up elsewhere — an effect a
   frozen page cannot fake. Ask of every assertion: "would this still pass if the page were frozen
   behind an overlay?" If yes, it is not proving anything happened.
5. **SHOW every asserted value in the recording — the human must SEE it, not just the topbar.** The
   recording is the proof a person actually checks; a value fetched with `page.request`/an API call is
   precise but **invisible** to a watcher, and the burned-in topbar is narration, not the value. So for
   every number a `checkReq` claims, bring the real app UI showing it into view: switch to the view
   that displays it (a **Summary → Details** toggle, a tab), **scroll or reveal** the cell, **read it
   off the visible cell** to assert (so the proof IS what is shown), and **hold** long enough to read —
   walking across **each** item (year by year, row by row). A summary or an average is **not** proof of
   the per-item values; showing only the endpoints is not showing the series. `reveal(locator)` centres
   a cell and holds; `proveVisible(locator, expected, label)` does the whole thing — centre, read the
   on-screen value (an input's or textarea's own `value`, anything else's rendered text), assert it
   equals `expected`, announce it, and hold. Prefer those over asserting a
   value you only read from the API. **The finishing check for the whole test: with the sound off, can
   you SEE every number the test claims? If not, it is not done** — this is the single most common way a
   green test still fails its one job (a recording a human can trust).

   **Prove the WHEN, not only the Then** *(2026-08-29 — the human, on the Tsumiki demo's R1)*. A beat's
   proof on the board plays `before → each value you proved → after`, and **`proveVisible` is what takes
   those middle frames**: every value it rings is photographed and measured where it stands, and the
   requirement's Expected picture beside it is the app's own markup for the same moments. So a beat that asserts
   only its outcome has an **invisible action** — the box you typed into is empty in the before frame and
   cleared again by the after one, and the When the requirement names is nowhere in the row, on either
   side. Assert the action's own visible value first — `await proveVisible(page.locator('#new-task'),
   'Water the plants', 'The task typed into the box')` **before** the click that submits it — and the
   typed string is ringed, held, photographed and drawn. The value you PROVE should be the value a
   reader SEES happening, not only the one it left behind.

   **A watchable beat: every named control on screen, every named state visible, no scene wasted**
   *(2026-08-30 — the human, on the Tsumiki demo's R1)*. The row's one camera frames the **union of the
   beat's rings**, and each `proveVisible` is a **distinct scene** in the loop, so what you ring is
   literally what the reader can watch. Three failures make a beat unpleasant to watch — author against
   all three:
   - **Ring every control the When/Then NAMES, so the camera keeps it in frame.** If the When says
     "press **Add**", ring the Add button (`await proveVisible(page.locator('.go'), 'Add', 'The Add
     button, now enabled')`) — not only the field you typed into. An un-ringed control is outside the
     union, so the tight camera crops it away and the recording shows an action with no visible actor —
     "it says press Add but there is no Add button." The actor of every clause belongs in the frame.
   - **Make the asserted STATE visibly different, not just true in the DOM.** If the Then says an
     "**unchecked** row", ring the row's checkbox so its empty state is on screen (and prefer a frame
     that also catches a checked row nearby, so *unchecked* reads as a contrast, not a claim). A state
     the requirement names but the picture cannot distinguish — checked vs unchecked, enabled vs
     disabled, selected vs not — is an assertion the watcher must take on faith, which is the whole
     thing this board refuses.
   - **Every scene must ADVANCE the story — no two scenes that show the same thing.** Scene count is
     `proveVisible` count; two assertions that ring the same string in two places (the text you typed,
     then the same text in the new row) play as two near-identical frames and read as padding. Prove
     each *distinct* fact once — the action (filled input + live control), then the outcome (the new
     row, its state, its stamp) — and let one camera hold the related rings together rather than
     spending a separate scene on each. Fewer, distinct scenes beat more, repeated ones.
   - **Show the action on its SUBJECT, never only in words** *(2026-09-02 — the human, on the demo's
     deliberately failing R9: "the failed test case totally not really delete a subtask — please show
     it out in visual, not just text; keep it in the rule")*. A When that acts on a thing — delete a
     task, tick a box, drag a card — is proven by ringing that thing **before** the action (`await
     proveVisible(row('k2').locator('.ttl'), 'Pay the electricity bill', 'The open task about to be
     deleted')`) and then the place it changed **after** it (the row that now stands where it was, the
     empty slot, the moved card), and only then the number the requirement counts. A beat whose only
     frames ring a counter says the action happened without ever showing it — the reader has to
     believe the words, and on a FAILED beat (where the Expected shows the intended value and the
     photograph the measured one) the missing picture is exactly the thing they came to see.

   The finishing check, extended: with the sound off, does each scene show something the last one did
   not, is every control the words name actually on screen, and can you SEE every state the words claim?
   If not, the beat is authored, not yet watchable.
6. **Every fact the Then names is a SOFT claim.** Write each of them as
   `proveVisible(target, expected, label, { soft: true })`: the beat then reaches and photographs
   **every** fact and fails ONCE at its end with the whole list, instead of stopping at the first red
   with the rest of the requirement never shown (the human, 2026-09-02, on the demo's failing R9:
   "the Expected should be correct, only the proof should be wrong"). A Then that names three things
   proven by one claim is a third of a requirement wearing the requirement's whole green — and since
   the **Expected** picture is built from the beat's claims, a fact no claim covers is also a fact no
   picture can ever show. `npm run proof lint` refuses one: it splits each Then into its facts —
   at ` — `, `; `, `, and `, ` and ` and a bare `, `, wherever the seam's two sides each carry three
   words or more (there is no verb test: over-splitting is safe, because a fragment is then either
   claimed or declared, while under-splitting hides a fact behind a green row) — and reads the beat's
   claims back out of the `checkReq` block and the step functions it calls. Fewer claims than facts, a hard claim in a multi-fact beat, or a beat with no claim at all is
   an **INTENT-GAP**. Five things it cannot do for you:
   - **Claim on the surface a person reads.** A claim on a hidden node — a baked source row, a folded
     pane — rings nothing, so the frame is the whole page and the picture proves nothing. If a fact
     is only true on a hidden surface, say so; do not photograph a page and call it a proof.
   - **An ABSENCE is claimed, not declared:** `proveVisible(locator, MISSING, label, { soft: true })`
     passes exactly while the thing is gone and fails, with the app's own text as `got`, the moment it
     is back. "no toolbar", "no control to change it", "no chip at all" — each of them names a thing,
     and the claim is what photographs it not being there. Keep the `toHaveCount(0)` beside it. (What
     you may NOT do is claim a neighbour's positive fact instead and call the absence covered: the
     lint counts claims, it cannot ask what they are about, so that is a green you wrote yourself.)
     A fragment that names no thing — "not a truncated snippet", "never a gap" — has nothing whose
     absence could be photographed: that one is declared, below.
   - **A fact with NO screen surface is DECLARED, never silent:** one line in the beat,
     `intentGap('<why this fact has no screen surface>')` — a beat that drives the server with no page
     open, a geometry, what the CLI gate refuses, a surface that lives only on a hidden pane. The lint
     prints it as `DECLARED` with your reason and does not fail on it: **a visible debt, never a pass**.
     It is REFUSED where the Then names a thing that is not there and the beat photographs something
     else instead — that one is claimable with `MISSING`, above. On a beat that opens NO PAGE at all
     one declaration answers for every fact, none of them having a surface — a beat driving the
     server through `request` with no browser. **The test for that is the block's own source, not
     "it made no claims"** (final review I3, 2026-09-04): a block that touches `page.`, `locator(`,
     `getBy…`, `proveVisible(`, `reveal(` or `click(` has a page open, and there a declaration covers
     ONE fact — the rest still need their claims, or one declaration each. The lint names that
     shortfall `declared-on-an-open-page`, because the fix is not "one more claim" but claiming
     these facts at all, or declaring every one of them.
   - **One block per beat, in the beats' order.** `checkReq`'s cursor files the k-th call in a test
     under beat k, so an extra block hands its pictures to a sentence it is not about; a requirement
     whose blocks do not walk its beats is a failing `BEAT-MISMATCH` row. Two tests may each prove
     the same requirement — a unit and a flow — as long as they walk the SAME beats, and every one
     of them must cover the beat it harvests: **the row is scored on the block whose harvest lands —
     the LAST one in source order.** `workers:1` runs blocks in declaration order, so the last block
     to run is the last to write `<id>.b<n>.*`, and its pictures are the ones the board shows on that
     row; scoring anything else grades one block while displaying another. (Worst-of was considered
     and rejected: it would demand every flow that re-proves a requirement repeat every claim of the
     unit that owns it, which the many-to-many coverage model does not ask for.)
   - **Never edit the Then to fit the test** (CLAUDE.md rule 5 — meaning is the human's), and never
     invent a claim for a fact the screen cannot show.
7. **Assert a design token, never its resolved pixels.** A style assertion that pins a literal
   (`fontSize >= 19` because the title token happens to be 19px today) is really asserting the
   design system's *current arithmetic*, and it breaks the day the system rescales while the
   behaviour — "the title wears the card-title token" — never moved (specboard's ×0.8 scale broke
   exactly this pin, 2026-08-24). Resolve the token in the page (a probe element with
   `font-size:var(--t-xl)`, then compare computed styles) and assert *equality with the token*, or
   assert the relationship the requirement actually names (fits / visible / larger-than / collapses
   before overflow). Same for fixtures: one built to overflow at today's sizes silently stops
   exercising its contract when the chrome tightens — derive the fixture's bulk from the contract
   ("tall enough to overflow"), not from the pixels of the day.

Never weaken, skip, or delete an assertion to go green (CLAUDE.md rule 3) — neither a unit nor a
flow test can buy a false green: every requirement still needs a real assertion that would fail
without it. When a test
breaks after a change, first find which of the two — the test or the code — is wrong, before editing
either.

## The shape

```ts
import { test, expect, checkReq, coverReqs, waitForContent } from '../_base'

// A FEW comprehensive flows, each proving several requirements. Name the test by the FLOW it runs
// (what it does), NOT by a single requirement — under many-to-many the tags carry the requirement
// link, and one flow covers several ids.
test('editing a line item recomputes the total and carries it to the schedule', async ({ page }) => {
  // Declare the full set this flow intends to reach, up front. If it fails early, the ids it never
  // got to are recorded NOT-REACHED — honestly unproven, not green and not red.
  await coverReqs('R3', 'R4', 'tenancy-schedule:R5')

  await page.goto('/<route>')                       // see "which URL" below

  // Each checkReq runs its assertion inside a `proves <id>` step; that step's pass/fail IS the proof.
  // Assert on DATA that only exists once the app really worked.
  await checkReq('R3', async () => {
    await waitForContent(page.getByTestId('lineitem-row'))
    await expect(page.getByTestId('lineitem-row')).toHaveCount(3)
  })

  await checkReq('R4', async () => {
    const amount = page.getByTestId('lineitem-amount').first()
    await amount.click(); await amount.pressSequentially('13100')   // TYPE, never fill() (see traps)
    await expect(page.getByTestId('schedule-total')).toHaveText('£13,100')  // the EFFECT, not the control
  })

  // A QUALIFIED id proves another screen's requirement. The flow started here, so its file lives
  // here — but this coverage lands under tenancy-schedule:R5.
  await checkReq('tenancy-schedule:R5', async () => {
    await page.goto('/tenancy-schedule')
    await expect(page.getByTestId('carried-total')).toHaveText('£13,100')
  })

  // The fallback COVER for a run with no video. The recording is the primary evidence; this is not a
  // gate and not a column of its own. One screenshot per screen, at the end, is enough.
  await page.screenshot({ path: 'spec/<screen>/screen.png', fullPage: false })
})
```

- Import `{ test, expect, checkReq, coverReqs }` (and `waitForContent`) from `'../_base'` — never from
  `@playwright/test` directly; `_base` carries `checkReq`/`coverReqs` and the one-window behaviour a
  watched run needs.
- `spec/<screen>/screen.png` is written by exactly one test (usually the last), with
  `page.screenshot({ path: ..., fullPage: false })`. Do not capture it separately.

## The beat-function convention — write each beat as an exported step function (default)

*(Added 2026-08-22, Task 5 — the human's 2026-08-21 deterministic-first decision. Lessons go into the
skill, not just memory.)* A unit beat authored as an **exported step function** is *composable*: the
board's flow composer can chain it with other proven beats into a flow file **with no model
involved**, and that composed flow is valid by its beats' standing red-first proofs plus its own first
run passing (CLAUDE.md rule 1's addendum). An inline beat — an assertion body written straight into
`test(…)` — still proves its requirement exactly as before, but a flow that uses it can only be
written by Claude. **Author new unit beats function-shaped by default**; every other discipline in
this skill (red-first, real assertion, visible values, golden data) applies to the function body
unchanged.

Beats live in **`spec/<screen>/steps.ts` beside `test.spec.ts`** — the file is NOT a test (Playwright
matches `*/test.spec.ts` only), and the board reads its metadata statically, never executing it:

```ts
// spec/<screen>/steps.ts
import { expect } from '../_base'
import type { Page } from '@playwright/test'
export type FlowState = Record<string, any>        // (or import it from a sibling steps.ts)

// THE FIXTURE — the Given, set ONCE per flow. Seeds the golden data and returns the numbers every
// beat computes its exact Then from. `gives` names the joint tokens the fixture provides.
export const GIVEN = { fn: 'openSeededList', text: 'frozen clock · storage cleared · 3 seeded items', gives: ['seeded'] }
export async function openSeededList (page: Page): Promise<FlowState> {
  await page.goto('/tasks?seed=golden')
  await expect(page.getByTestId('task-row')).toHaveCount(3)
  return { rows: 3, open: 3 }                        // the golden numbers, threaded from here on
}

// ONE ENTRY PER EXPORTED BEAT — fn · proves (bare id = this screen) · name (the flow chapter's
// sentence) · needs/gives (joint tokens: beat N's Then must satisfy beat N+1's Given)
export const BEATS = [
  { fn: 'addTask', proves: 'R1', name: 'add a task — the count moves', needs: ['seeded'], gives: ['task'] },
  { fn: 'tickLastOpen', proves: 'R4', name: 'tick the last open sub-task — the container rolls up', needs: ['task'], gives: ['done'] }
]
// Two gotchas the parser (tools/compose.mjs parseBeats) enforces SILENTLY: an entry missing fn,
// proves or name — or whose proves is qualified ('x:R3'; it must be a bare R<n>, the beat lives in
// the screen it proves) — is skipped, never guessed at. And a beat composes deterministically only
// while its requirement reads PASSED on the board: changed, failed, or stale-by-source (the file
// moved since the fold — every compose does that to its start screen) needs a run first.
// A beat that WAITS — on a nested run, a long poll — declares its wall-clock budget: `ms: 230000`.
// The emitter sums the chain's budgets (an undeclared beat counts the harness's 60 s default, the
// fixture the same) into ONE test.setTimeout at the top of the composed test — without it the first
// cross-screen compose that chained a nested board run died at the default (Task 7, 2026-08-22).

// A BEAT: perform its When, assert its Then with EXACT numbers computed from `state`, update `state`.
// It never calls checkReq itself — the caller wraps it — and it never re-hardcodes a number a
// previous beat already gave it.
export async function addTask (page: Page, state: FlowState): Promise<void> {
  await page.getByTestId('new-task').pressSequentially('Water the plants')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('task-row')).toHaveCount(state.rows + 1)   // the EFFECT, exact
  state.rows += 1; state.open += 1
}
```

The unit test in `test.spec.ts` keeps its `checkReq` **around** the call — the proof's power is
unchanged, only the body moved:

```ts
import { openSeededList, addTask } from './steps'
test('adding a task moves the count', async ({ page }) => {
  await coverReqs('R1')
  const state = await openSeededList(page)
  await checkReq('R1', async () => { await addTask(page, state) })
})
```

The rules that keep a beat composable:
- **needs/gives are the joints.** Name what a beat relies on (`needs`) and what it leaves true
  (`gives`) as short tokens; the composer's gap check is only as honest as these. A beat with no
  needs is chainable anywhere after the Given.
- **Exact numbers come from `state`, never from the screen.** Reading a value off the page and
  asserting the page shows it is a tautology; the golden number comes from the fixture (or a
  previous beat's arithmetic) and the page is held to it.
- **One beat, one requirement.** `proves` is a single id; a beat that proves two things is two beats.
- **A cross-screen beat lives in ITS screen's `steps.ts`** (`spec/other/steps.ts`, proving that
  screen's `R…`); a flow that starts elsewhere imports it as `../other/steps` and tags it qualified.
- **Refactoring an inline beat into a step function is a pure refactor** (rule 1 exempt) — the
  assertion body moves verbatim, the test's checkReq stays, and the suite must stay green
  throughout. Do it while you are there: it makes the next flow composable with no model at all.
- **A composed flow that fails its first run is a composition defect** (a wrong joint, a missing
  token), never a reason to weaken a beat.

## Which URL a test navigates to

- **specboard's own screens** run against the board on `/`.
- **A project's own screen** — whether you are writing its test fresh, or characterizing an existing
  screen that kg-init crawled — navigates the **real running app** at its route, taken from
  `spec/_config.json` (`baseUrl` + the screen's `route`). The recording is then the app as it
  actually is, and the assertions lock in its current behaviour as the baseline. The drafted PRD gives
  that baseline meaning: when the human edits the PRD to say the behaviour *should* differ, you
  update the test to the corrected PRD — and its failing against the current app is then a real bug
  surfaced, which is the point.

## Authenticating (against a real app)

A real app is usually behind a login, and a characterization test must reach screens that require it.
You do **not** log in inside each test. Instead, put a `signIn` script in `spec/_config.json` (Setup →
sign-in), and the harness runs it **once** in a `setup` project (`spec/_auth.setup.ts`) that saves the
session; every screen test then runs in the `screens` project already authenticated
(`dependencies:['setup']`, reusing the saved `storageState`). So the test just navigates to its route
and asserts — it starts logged in.

Two things that will cost you an afternoon otherwise:

- **The signIn script must TYPE, never `page.fill()`.** Controlled React inputs (react-hook-form and
  most component libraries) ignore `fill()`'s programmatic value and submit an **empty** form with no
  error — you sit on `/login` wondering why. Use `pressSequentially`, or click the field then `type`.
- **The login screen itself is bespoke.** Once signed in, `/login` redirects away, so the crawl can
  never reach it and it can't be a characterized screen. Write its PRD and test by hand.

## Comprehensive, not shallow — depth over count

A screen's test proves the screen works, not that it painted. One "the heading is visible" case per
requirement is the shallow trap that makes a board look finished while proving almost nothing. The
board's model rewards depth in both of its test kinds (R6, amended 2026-08-17): **unit** tests that
prove this screen's own behaviours, and **flow** tests that cross screens along a chosen path. Write
deep tests, whichever the kind:

- **The surface renders REAL data** — every metric/tile carries a value (a digit, money, a %), the
  grid/list is populated with rows, the chart is present, the controls exist. Wait for the data (see
  traps) before asserting.
- **A core interaction changes an outcome** — drive the primary lever/toggle and assert its *effect*,
  not merely that the control exists.
- **A cross-page effect**, where the screen has one — a change here shows up there. Tag both screens'
  requirements with qualified ids.

Two or three flows that exercise the screen's real behaviour beat ten that each check a label — but
each requirement a flow tags still needs an assertion that would fail without it (rule 2). Depth is
the point; count follows from it.

## Deterministic golden data — assert EXACT values, not live ones

A data-driven screen invites the worst false green of all: a test that reads *whatever data is live*.
"The first row's total is 12,340" passes today and goes red the moment anyone edits that row — the
number drifted, nothing broke — and "there are some rows" (rule 2) proves almost nothing. The fix is
to make the data itself deterministic, so the test can name the exact values it expects:

- **Seed a dedicated golden fixture — never target "the first entity."** Add a known entity with
  FIXED inputs (a stable id/name, e.g. `e2e-golden`) through the *project's own* migration/seeder — its
  factories know the invariants raw SQL would miss. Target that entity **by its stable id**, so the
  test is pinned to data it controls, not to whatever happens to sort first.
- **Record the expected values in `spec/<screen>/golden.json`, and assert them.** A per-screen file of
  expected observable values, keyed **per state** — per selected filter/period/tab: which items/rows
  are shown, and the exact number each tile/cell holds. Generate it *once* by driving the seeded app
  and reading the values off; commit it; assert it thereafter. Now a change in the app's computation
  fails the test with a concrete diff (`expected 12,340, got 12,900`) — exactly the signal you want.
- **Idempotent seed, draft-scoped mutation.** The seed must be safe to run on every suite (upsert by
  the stable id; seeding twice == once) and touch ONLY the golden fixture. For a mutating flow (edit →
  run → apply), act on a **throwaway draft/scenario** and reset by re-seeding or discarding the draft —
  never mutate the canonical golden inputs to go green (rule 3; it also makes the next run's "before"
  value a lie).

### Where the seed runs

Put the seed where the vendored harness runs it once, before any test:

- **`spec/_seed.ts`** — an idempotent default-export function; `globalSetup` imports and calls it
  before the suite (Playwright's own loader runs the TypeScript). The scaffold ships it as an inert
  no-op stub, so a project with no golden data is unaffected.
- **or a `seed:e2e` npm script**, which *takes precedence* over `_seed.ts` — use it when your seed
  lives in another toolchain (a backend seeder, another language). The harness runs `npm run seed:e2e`
  before the suite and **fails setup** if it errors (a suite asserting golden values against an
  unseeded app is worse than an honest red at the gate).

A rough `golden.json` shape — states as keys, each naming the items shown and the numbers to assert;
for a mutating flow, record BOTH sides of the change you drive:

```jsonc
{
  "filterA": { "items": ["Alpha", "Bravo", "Charlie"], "total": 12340 },
  "filterB": { "items": ["Alpha", "Delta"],            "total":  8060 },
  "afterEdit": { "changed": "Bravo", "total_before": 12340, "total_after": 13100 }
}
```

The test reads `golden.json`, drives the seeded screen, and — inside its `checkReq` steps — asserts
each state's exact items and numbers, including the *before → after* of the interaction, so the run
PROVES the computation, not merely that the grid has rows.

## Traps against a real running app

Each of these has produced a false green or lost an afternoon — handle them by default:

- **Wait for DATA, not the shell — generously.** The frame paints instantly; the numbers arrive after
  an API call, and a heavy app can take 20–30s on a cold run. Gate each screen on a real value (a
  metric containing a digit or money) and a populated list BEFORE asserting anything else.
- **Controlled inputs must be TYPED, and VERIFIED.** `fill()` races react-hook-form/controlled state
  and drops the leading keystrokes — a wrong value, silently. Use `pressSequentially`, then read the
  value back and retype if it came up short. (The same trap as sign-in; it also bites search boxes.)
- **Virtualized grids:** rows often carry `role=row` with NO `role=grid` ancestor, so
  `getByRole('row')` finds none — target the attribute, `locator('[data-testid=grid] [role=row]')`.
  And do NOT assert the row-node count falls on a filter: virtualization keeps nodes, so that is a
  flaky claim.
- **Accessible names can include hidden helper text.** A control showing a short visible label may
  have an accessible name that also contains a tooltip or description, so `{name:'<label>',
  exact:true}` finds nothing — match the distinctive visible text instead.
- **Read-only surfaces intercept clicks.** A locked/read-only form group swallows a scripted click;
  assert presence there, and prove the interaction on the editable surface.
- **Prefer `data-testid`.** Real apps are usually instrumented with testids; they are the most stable
  selectors — harvest the app's own testids while exploring and use them over text/role.

## Stateful and cross-page flows (edit → run → apply → verify elsewhere)

The most valuable tests span pages — edit here, apply, verify the effect there — and under
many-to-many coverage one such flow can prove several requirements across several screens with
qualified ids. But "apply" usually PERSISTS: a test that applies on every run mutates real data
non-idempotently. The only safe repeatable shape is **create a throwaway draft/scenario → act →
verify → discard** (or a reset). If no discard path exists, do NOT write a test that corrupts data on
every run — document the gap in the PRD and cover what you safely can. A test that mutates production
state to go green is worse than an honest unproven requirement.

## Run it and read the result

```bash
npm run e2e                         # the whole suite
npx playwright test --config playwright.board.ts spec/<screen>/test.spec.ts   # just this screen
```

Never add `--reporter=…` to either command. The fold that records proof, evidence and the run log
(`spec/_results-reporter.mjs`) is a CONFIG reporter, and Playwright's CLI flag REPLACES the config's
reporter list — the run looks normal, prints its lines, and nothing lands on the board. Whole files
only, never `-g` (a scoped run clobbers the index).

A per-screen run folds its per-requirement coverage into `spec/_results-index.json` without blanking
any other screen's — so running one screen to prove it is safe. Watch the new assertion fail first;
then make it pass; then confirm on the board that the requirement now reads **proven** and the test's
recording shows the end state it proved.
