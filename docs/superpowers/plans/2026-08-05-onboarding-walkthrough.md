# Onboarding walkthrough implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the `#howitworks` reference page and the six-step home rail with a four-act, click-to-advance guided walkthrough that *demonstrates* specboard's proof rather than describing it.

**Architecture:** Follow the existing `HOW_FLOWS` precedent in `tools/build-board.mjs` — bake heavy content from a module-level data structure at build time, keep client JS tiny. A `WALKTHROUGH` data object renders to stacked static DOM (one node per step, `data-act`/`data-step`); a ~15-line client controller shows one step at a time. `board.html` is regenerated; nothing is hand-edited.

**Tech Stack:** Node ESM builder, Playwright board spec, `node --test` units. No new deps.

**Spec:** `docs/superpowers/specs/2026-08-05-onboarding-and-skill-eval-design.md` (Revision 2).

## Global constraints

- **Read CLAUDE.md first; run `node tools/staff.mjs board`** before touching the board screen.
- `board.html` is generated — never hand-edit; `npm run board:build` after builder edits.
- **The client script is emitted inside a JS template literal.** Every emitted string uses `\\n` (never raw `\n`) and **no backticks**. The client controller must be written with plain quotes / string concatenation — no template literals in emitted JS. `build()` parses the emitted script with `new Function()` and refuses to write a broken board — keep that guard passing (it bit three times already this session, twice inside CSS comments in the emitted literal).
- Design system: tokens from `spec/_design.css` only — no raw hex, no off-scale size/radius; every chip/step carries a mark, not hue alone; indigo means "your turn" only (Act 4's CTA and the "you confirm" step qualify — nothing else); exactly one inverted element per view; WCAG AA 4.5:1, re-measured after any colour change.
- **Act 3 is a labeled illustration, not live board state** (authored-vs-measured). It must carry a visible banner naming the source (a real project's asset-plan flow); never render it as if it were derived from this repo.
- **Test-first (rule 1):** write the failing assertion, run it, SEE red, then implement. Never weaken an assertion to go green (rule 3).
- Red-check: `npx playwright test spec/board --config=playwright.board.ts`. Final: full `npm run e2e` on a FREE port (never 4173, never `BOARD_URL`, never `-g`). Board coverage lags one run after editing its own test file — if it reads stale after green, run once more.
- R11/R12 are `guess:` drafts transcribed from the approved Revision-2 spec. Land them verbatim with their draft notes; requirement *meaning* is the human's — do not drop the guess flag, and tests assert behaviour/content, not phrasing.
- Stage explicitly (never `git add -A`); do not stage `spec/_results*.json`, `spec/_runs.json`, or `spec/*/screen.png` (the release sweeps those). Another agent may share the tree — on an index.lock, wait 2s and retry.

---

### Task 1: The walkthrough — data + static baked DOM as the `#howitworks` landing

**Files:**
- Modify: `tools/build-board.mjs` (add `WALKTHROUGH` data + `walkthrough()` renderer + CSS; route it as the `#howitworks` landing; demote the current overview/flowcharts to a collapsed "full method" reference; remove the standalone `#how-problem`/`#how-anatomy` one-off sections — their content moves into the acts)
- Modify: `spec/board/prd.md` (revise the R11 draft in place)
- Modify: `spec/board/test.spec.ts` (rewrite the R11 test for the walkthrough)

**Interfaces:**
- Produces DOM: `#walkthrough` (the landing) containing four `.act[data-act="1..4"]`, each with `.wstep[data-act][data-step]` nodes; Act 3's demo panel `.wdemo` carries `.wpin` (illustration banner) and prints the exact goldens; a collapsed `#fullmethod` reference wraps the pre-existing overview/flowchart markup. `walkthrough()` returns the baked HTML string; `build()` interpolates it in `howView()`.
- Consumes: nothing from later tasks. Task 2 adds the client controller over this DOM; Task 3 fills Act 4's CTA.

- [ ] **Step 1: Staff + read.** Run `node tools/staff.mjs board`. Read `howView()` and the `HOW_FLOWS`/`howFlowcharts()`/`howProblem()`/`howAnatomy()` region of `tools/build-board.mjs`, and the `#howitworks` branch of the client router (search `#howitworks`). Note where `#howoverview` and the flowchart pages are emitted — they become `#fullmethod`.

- [ ] **Step 2: Revise the R11 draft** in `spec/board/prd.md` — replace the existing R11 block with (verbatim):

```markdown
## R11 — The guide is a walkthrough that demonstrates the proof

#howitworks is a four-act, click-to-advance walkthrough, not a reference page: **feel it** (symptom
lines in the reader's own words, then one green assertion shown beside the screen it fails to prove),
**get it** (one before/after — a requirement that looks proven as a stored flag vs computed live as
drifted — where "drift, computed never stored" is named once), **see it work** (a labeled illustration
of a real flow: change a value → Run → a chart asserts exact golden values held on screen — IY1
2,400,000 … IY5 2,671,006.87 — → Save → another page shows the value carried over, checked against the
first), and **do it on your app** (the flow as verb-phrase steps, the full method available as a
collapsed reference, and the single next action to take). The walkthrough shows the proof rather than
describing it; the old method flowcharts survive as reference, reached from the end.

*Drafted 2026-08-05 transcribing the approved onboarding walkthrough (design revision 2) — wording
awaits the human; reword freely, the test asserts content not phrasing.*
```

- [ ] **Step 3: Write the failing test** — replace the existing R11 test in `spec/board/test.spec.ts` with:

```ts
test('The guide is a four-act walkthrough that shows the proof', async ({ page }) => {
  await coverReqs('R11')
  await page.goto('/#howitworks')
  await page.waitForSelector('#howview:not([hidden])')
  await checkReq('R11', async () => {
    const wt = page.locator('#walkthrough')
    await expect(wt).toBeVisible()
    // the walkthrough IS the landing — first thing in the view, before the full-method reference
    expect(await page.locator('#howview .dtscroll >> #walkthrough, #howview #walkthrough').first().isVisible()).toBeTruthy()
    await expect(wt.locator('.act')).toHaveCount(4)
    // Act 1 feel-it carries symptom lines and a green-beside-wrong proof
    await expect(wt.locator('[data-act="1"]')).toContainText('back')
    // Act 2 names the concept once
    await expect(wt.locator('[data-act="2"]')).toContainText('computed')
    // Act 3 is a LABELLED illustration with the exact goldens held on screen
    const demo = wt.locator('.wdemo')
    await expect(demo.locator('.wpin')).toContainText(/illustration/i)
    await expect(demo).toContainText('2,400,000')
    await expect(demo).toContainText('2,671,006.87')
    await expect(demo).toContainText('200 psf')
    // Act 4 shows the flow and the full method survives as a collapsed reference
    await expect(wt.locator('[data-act="4"]')).toContainText('kg-deep')
    await expect(page.locator('#fullmethod')).toHaveCount(1)
  })
})
```

- [ ] **Step 4: See it fail** — `npx playwright test spec/board --config=playwright.board.ts`. Expected: the new R11 test FAILS (`#walkthrough` not found); other board tests still pass (the R12/rail test still passes for now — Task 3 changes it).

- [ ] **Step 5: Add the `WALKTHROUGH` data** near `WORKFLOW`/`HOW_FLOWS` in `tools/build-board.mjs` (module-level literal; fold in the existing `howProblem` copy for Act 1). Use this exact content:

```js
const WALKTHROUGH = {
  acts: [
    { n: 1, title: 'Feel it', sub: 'recognition, then one proof you cannot argue with',
      steps: [
        { kind: 'symptoms', lines: [
          'You fix the bug. Two features later, it is back.',
          'A feature that worked yesterday is broken today, and nothing you touched explains why.',
          'You ask the AI for tests. It writes 40. None of them would have caught this.'] },
        { kind: 'proof', green: 'test green', wrong: 'screen shows rent = 100 (stale)',
          note: 'The assertion passed. Nobody looked at the screen. A green you cannot see is a guess you pay for later.' }
      ] },
    { n: 2, title: 'Get it', sub: 'the reframe — named once, only now that you want it',
      steps: [
        { kind: 'inversion', head: 'Do not write tests. Prove requirements.' },
        { kind: 'beforeafter', before: 'stored status: proven — looks fine',
          after: 'computed live: drifted — the text moved, the proof did not',
          note: 'Nothing changed except that we stopped trusting a field you can lie to. This is drift, computed never stored.' }
      ] },
    { n: 3, title: 'See it work', sub: 'a real flow, held on screen, checked across pages',
      illustration: 'Illustration — a real asset-plan flow from a real project',
      steps: [
        { kind: 'demo', step: '1', body: 'Change market rent, unit 33A: 100 to 200 psf' },
        { kind: 'demo', step: '2', body: 'Click Run. The chart asserts exact values, and holds them:',
          rows: ['IY1  2,400,000', 'IY3  2,630,687.10', 'IY5  2,671,006.87'] },
        { kind: 'demo', step: '3', body: 'Click Save, then open the Tenancy schedule' },
        { kind: 'crosspage', a: 'Page A after Save: 200', b: 'Page B on load: 200',
          note: 'Every asserted value is visible in the recording. The carry-over is two panels becoming one picture, not a sentence.' }
      ] },
    { n: 4, title: 'Do it on your app', sub: 'the flow, and the full method underneath',
      steps: [
        { kind: 'flow', chain: ['kg-init', 'kg-deep · per screen', 'you confirm the meaning', 'tests prove it'] },
        { kind: 'cta', lead: 'Next on your board:', action: '/kg-deep <screen>' }
      ] }
  ]
}
```

- [ ] **Step 6: Add the `walkthrough()` renderer.** Emit `#walkthrough` with four `.act[data-act]`, each rendering its steps as `.wstep[data-act][data-step]` nodes; render every step (visibility is Task 2's job — for now all are present). Act 1's `proof` uses existing `chip ok`/`chip bad` + marks; Act 2's `beforeafter` uses `chip ok` and `chip stale`; Act 3's `demo`/`crosspage` render inside `.wdemo` with the `.wpin` illustration banner (from `illustration`) and the goldens as mono rows; Act 4's `cta` renders `action` in the "your turn" indigo treatment (with a mark) and `lead` beside it. Keep all emitted strings backtick-free with `\\n`. Reuse existing classes where they fit; add only layout CSS (`.act`, `.wstep`, `.wdemo`, `.wpin`, `.wcta`, symptom/beforeafter/crosspage helpers) in the how-does-it-work CSS block, tokens only.

- [ ] **Step 7: Route it as the landing + demote the reference.** In `howView()`, emit `${walkthrough()}` as the first child of the scroll container, before the current content. Wrap the pre-existing overview + flowchart markup in `<div id="fullmethod" hidden>` reached by a "See the full method" control at the end of Act 4 (a button that unhides `#fullmethod`, or reuses the existing `#howitworks/<skillId>` deep pages — either is fine; the test only needs `#fullmethod` to exist). Remove the standalone `#how-problem` and `#how-anatomy` sections added in the earlier story-chapter work — their content now lives in Acts 1–3. Confirm the client router still resolves `#howitworks` (the walkthrough is visible when the view opens).

- [ ] **Step 8: Rebuild + green** — `npm run board:build` (must not throw — the `new Function()` guard), then `npx playwright test spec/board --config=playwright.board.ts`. Expected: R11 passes; all other board tests still pass.

- [ ] **Step 9: Full suite** — `npm run e2e` on a free port. Expected: all screens pass.

- [ ] **Step 10: Commit:**

```bash
git add spec/board/prd.md spec/board/test.spec.ts tools/build-board.mjs board.html
git commit -m "feat(board): the guide becomes a four-act walkthrough that shows the proof — feel it, get it, see it work, do it (R11 revised, awaiting the human); method demoted to reference"
```

---

### Task 2: The client stepper — click-to-advance, pinned, never auto-advancing

**Files:**
- Modify: `tools/build-board.mjs` (per-act Prev/Next controls + a small client controller in the emitted script)
- Modify: `spec/board/test.spec.ts` (extend the R11 test, or add a focused R11 stepping test, tagging R11)

**Interfaces:**
- Consumes: Task 1's `.act[data-act]` / `.wstep[data-act][data-step]` DOM.
- Produces: each `.act` gets `.wnav` with `[data-wprev]`/`[data-wnext]` buttons and a `.wcount` ("2 / N"); the active step carries `.on`; a numeric reveal (Act 3 step 2) carries a visible `.wpinned` badge once shown. No auto-advance, no timers.

- [ ] **Step 1: Write the failing stepping test** — add to `spec/board/test.spec.ts` (tags R11 via a `proves` step so it strengthens the same requirement):

```ts
test('The walkthrough steps on click and holds — never auto-advances', async ({ page }) => {
  await coverReqs('R11')
  await page.goto('/#howitworks')
  await page.waitForSelector('#walkthrough .act[data-act="3"]')
  await checkReq('R11', async () => {
    const act = page.locator('.act[data-act="3"]')
    const steps = act.locator('.wstep')
    // only the first step of the act is shown initially
    await expect(act.locator('.wstep.on')).toHaveCount(1)
    await expect(steps.first()).toHaveClass(/\bon\b/)
    // Next advances exactly one step
    await act.locator('[data-wnext]').click()
    await expect(steps.nth(1)).toHaveClass(/\bon\b/)
    await expect(steps.first()).not.toHaveClass(/\bon\b/)
    // the golden-number reveal pins and STAYS — no auto-advance after a verdict
    await expect(act.locator('.wpinned')).toBeVisible()
    const shown = await act.locator('.wstep.on').getAttribute('data-step')
    await page.waitForTimeout(1200)
    await expect(act.locator('.wstep.on')).toHaveAttribute('data-step', shown)  // unchanged
    // Prev goes back
    await act.locator('[data-wprev]').click()
    await expect(steps.first()).toHaveClass(/\bon\b/)
  })
})
```

- [ ] **Step 2: See it fail** — `npx playwright test spec/board --config=playwright.board.ts`. Expected: FAIL (`.wstep.on` / `[data-wnext]` absent).

- [ ] **Step 3: Emit the nav + controller.** In `walkthrough()`, add a `.wnav` (Prev / count / Next) per act and give each act's first step `class="wstep on"`. In the emitted client `<script>` add a controller written **with plain quotes only, no backticks, `\\n` for newlines** — for each `.act`, track an index, show only the `.on` step, wire `[data-wnext]`/`[data-wprev]` and ArrowRight/ArrowLeft when that act is in view, clamp at ends, update `.wcount`, and add `.wpinned` visible when a step with a numeric reveal (mark it in the data, e.g. `pinned: true` on Act 3 step 2) becomes active. No `setTimeout`/`setInterval` anywhere — advancing is user-driven only. Keep arrow-key handling from hijacking typing in the search box (ignore when `document.activeElement` is an input).

- [ ] **Step 4: Rebuild + guard** — `npm run board:build`. It MUST NOT throw; if it does, the emitted script has a stray backtick or bad escape — fix before proceeding.

- [ ] **Step 5: Green** — `npx playwright test spec/board --config=playwright.board.ts`, then full `npm run e2e` on a free port. Expected: all pass.

- [ ] **Step 6: Commit:**

```bash
git add spec/board/test.spec.ts tools/build-board.mjs board.html
git commit -m "feat(board): the walkthrough steps on click and pins the verdict — user-driven, never auto-advancing"
```

---

### Task 3: Cut the rail — repurpose R12 to the derived closing next-action

**Files:**
- Modify: `tools/build-board.mjs` (remove `#jrail` from `#home` and `#jchip` from the topbar and its toggle; keep the `journey` import; feed `journey()` into Act 4's CTA)
- Modify: `spec/board/prd.md` (repurpose the R12 draft)
- Modify: `spec/board/test.spec.ts` (rewrite the R12 test for the CTA; assert the rail is gone)

**Interfaces:**
- Consumes: `journey()` from `tools/journey.mjs` (unchanged — its derivation and skeleton vendoring survive); Task 1's Act 4 `.wcta`.
- Produces: Act 4's CTA action reflects the derived next step — when a screen is waiting on a `kg-deep`, the CTA names it; otherwise the derived next action. `#jrail` and `#jchip` no longer exist in the DOM.

- [ ] **Step 1: Repurpose the R12 draft** in `spec/board/prd.md` — replace the existing R12 block with (verbatim):

```markdown
## R12 — The guide ends with the one next action, derived not stored

The walkthrough closes on a single next action for this project, derived from the tree on each build
(config saved, rows exist, a prd.md drafted, a prd.md without `guess`, a requirement proven) — the same
`journey()` derivation, with no six-step rail and nothing stored. A returning user opens the guide and
sees their next concrete step (for example `/kg-deep <screen>`); when everything derivable is done, the
CTA says so. There is no home-screen checklist.

*Drafted 2026-08-05 transcribing the approved onboarding walkthrough (design revision 2) — the earlier
six-step rail was cut at the human's direction; wording awaits the human, the test asserts behaviour.*
```

- [ ] **Step 2: Write the failing R12 test** — replace the existing R12 (rail) test in `spec/board/test.spec.ts` with:

```ts
test('The guide ends with the derived next action, and there is no rail', async ({ page }) => {
  await coverReqs('R12')
  await checkReq('R12', async () => {
    // the six-step home rail is gone
    await page.goto('/')
    await page.waitForSelector('.card')
    await expect(page.locator('#jrail')).toHaveCount(0)
    await expect(page.locator('#jchip')).toHaveCount(0)
    // the walkthrough closes on a single derived next action
    await page.goto('/#howitworks')
    await page.waitForSelector('#walkthrough .act[data-act="4"]')
    const cta = page.locator('.act[data-act="4"] .wcta')
    await expect(cta).toHaveCount(1)
    await expect(cta).not.toBeEmpty()
    // it is a real action, not a stored status — derived from the same journey facts
    await expect(cta).toContainText(/kg-deep|proven|crawl|set up/i)
  })
})
```

- [ ] **Step 3: See it fail** — `npx playwright test spec/board --config=playwright.board.ts`. Expected: FAIL — `#jrail`/`#jchip` still exist (count > 0) and/or `.wcta` not yet derived.

- [ ] **Step 4: Remove the rail, wire the CTA.** Delete the `#jrail` emission from `#home` and the `#jchip` button + its toggle listener from the topbar/script (keep the `#howbtn` handling intact). Keep `import { journey } from './journey.mjs'`. In `walkthrough()` (Act 4's `cta`), compute the action from `journey()` — the first not-done step's action (`/kg-deep <screen>` when a screen is the next to deepen, else the derived next action; when `folded`, say everything derivable is done). Render it in the indigo "your turn" treatment with a mark (unchanged from Task 1's `.wcta`, now fed real data).

- [ ] **Step 5: Rebuild + green** — `npm run board:build`, then `npx playwright test spec/board --config=playwright.board.ts`. Expected: R12 passes; R11 + stepping tests still pass.

- [ ] **Step 6: Confirm the guard test still holds** — `npm run test:tools`. `journey.mjs` must still be vendored (`tools/_skeleton.mjs`) and imported; the multi-line import guard must stay green. Expected: all tools tests pass.

- [ ] **Step 7: Full suite** — `npm run e2e` on a free port; if board coverage reads stale (own-coverage lag), run once more. Expected: all pass.

- [ ] **Step 8: Commit:**

```bash
git add spec/board/prd.md spec/board/test.spec.ts tools/build-board.mjs board.html
git commit -m "feat(board): the rail is cut; the guide ends with one derived next action, still journey()-derived (R12 repurposed, awaiting the human)"
```

---

### Task 4: Human wording-gate + release 0.21.0 + downstream (orchestrator)

- [ ] **Step 1:** Present the revised R11 and repurposed R12 wording (and R11's earlier not-reached clause) to the human as a diagram/artifact for their gate. The `guess:` flags stay until they accept; do not drop them.
- [ ] **Step 2:** With a clean tree, `npm run test:tools` and `npm run e2e` both green (free port, never 4173).
- [ ] **Step 3:** Bump `.claude-plugin/plugin.json` `0.20.0 → 0.21.0`; `npm run board:build`.
- [ ] **Step 4:** Release commit, staged explicitly (`.claude-plugin/plugin.json board.html spec/_results.json spec/_results-index.json spec/_runs.json spec/*/screen.png` — verify nothing foreign slipped in): `release: specboard 0.21.0 — the guide is a walkthrough that shows the proof; a fake green cannot survive a perturbed golden`. Push.
- [ ] **Step 5:** Downstream per standing rules: update the installed plugin, `kg-update` in dojostack, restart its vendored board detached on port 4190, verify the served version.

## Self-review notes

- Spec coverage: walkthrough (four acts, illustration honesty) → Task 1; stepper (click-to-advance, pinned, no auto-advance) → Task 2; rail cut + derived CTA (R12) → Task 3; wording-gate + release → Task 4. Design C (proof-integrity, escapes) already shipped in commits 175fad3/60d3fd9 — unchanged.
- Type/DOM consistency: `#walkthrough`, `.act[data-act]`, `.wstep[data-act][data-step]`, `.wdemo`, `.wpin`, `.wpinned`, `.wcta`, `#fullmethod`, `[data-wnext]`/`[data-wprev]` are used identically across the three tasks' render steps and tests.
- Emitted-literal risk is isolated to Task 2's controller (Task 1 is static DOM); both tasks rebuild through the `new Function()` guard before their tests.
- Act 3's illustration label is asserted (`.wpin` contains "illustration") so the honesty requirement is proven, not just intended.
