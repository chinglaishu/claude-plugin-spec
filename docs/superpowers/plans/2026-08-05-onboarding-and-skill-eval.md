# Onboarding & skill-eval implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved onboarding design (problem-first story + reading-a-test anatomy on `#howitworks`, a derived getting-started rail on home) and the first two skill-eval layers (proof-integrity tool, escape log), then release 0.21.0.

**Architecture:** All board content is baked by `tools/build-board.mjs` (draws only); all reading/derivation lives in `tools/spec-store.mjs` or new pure modules unit-tested via `npm run test:tools`. The rail's journey state is derived from the tree on every build — never stored. The proof-integrity tool is a vendored CLI with pure, unit-tested internals.

**Tech Stack:** Node ESM (`tools/*.mjs`), Playwright (`spec/*/test.spec.ts` via `playwright.board.ts`), `node --test` for unit tests, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-05-onboarding-and-skill-eval-design.md`

## Global constraints

- **Read CLAUDE.md first.** Every trap listed there is real and has cost hours. Run `node tools/staff.mjs board` before touching the board screen.
- **`board.html` is generated — never edit it by hand.** Edit `tools/build-board.mjs`, then `npm run board:build`.
- **The board's client script is emitted inside a JS template literal**: write `\\n` (never a raw `\n`) and NO backticks in emitted strings. `build()` parses the output with `new Function()` and refuses to write a broken board — keep that guard passing.
- **Design system is non-negotiable**: tokens from `spec/_design.css` only — no raw hex, no off-scale font size or radius. Indigo means "your turn" only. Every chip carries a mark, not just a hue. WCAG AA 4.5:1.
- **Test-first (rule 1)**: write the failing assertion, run it, SEE red, then implement. Never weaken an assertion to go green.
- **Suite runs**: red-check with `npx playwright test spec/board --config=playwright.board.ts`; final verification is the FULL `npm run e2e`. NEVER set `BOARD_URL` to the live board (4173), never use `-g` filters (they have clobbered the results index before).
- **Board coverage lags one run** after editing `spec/board/test.spec.ts` — its own coverage folds at that run's end. Run the suite, and if board coverage looks stale, run it once more before judging.
- **Requirement semantics are the human's (rule 5)**: R11/R12 texts below are drafts transcribed from the human-approved spec. Land them verbatim with the inline draft note; do NOT invent, merge, or reword requirements beyond them.
- **Stage explicitly** — never `git add -A`. Do NOT stage run artifacts (`spec/_results.json`, `spec/_results-index.json`, `spec/_runs.json`, `spec/*/screen.png`); the release commit sweeps those at the end.
- New unit-test files are auto-picked-up: `test:tools` runs `node --test tools/*.test.mjs`.

---

### Task 1: R11 — the guide opens with the problem (story chapter + reading-a-test anatomy)

**Files:**
- Modify: `spec/board/prd.md` (append R11 draft)
- Modify: `spec/board/test.spec.ts` (new test tagging R11)
- Modify: `tools/build-board.mjs` (baked story + anatomy sections in `howView()`'s `#howoverview`, plus their CSS)

**Interfaces:**
- Produces: two section ids inside `#howoverview` — `id="how-problem"` (first child, before the current `.intro`) and `id="how-anatomy"` (after the spine section). Task 4's rail links to `#howitworks` (plain; the ids exist for future deep-links).
- Produces: `spec/board/prd.md` R11 (Task 4 appends R12 after it).

- [ ] **Step 1: Staff briefing** — run `node tools/staff.mjs board`; read the how-view region of `tools/build-board.mjs` (roughly lines 189–620: `WORKFLOW`, `howView()`, and the `how does it work` CSS block near line 1058).

- [ ] **Step 2: Append the R11 draft to `spec/board/prd.md`** (verbatim, including the note):

```markdown
## R11 — The guide opens with the problem, and teaches reading a test

#howitworks opens with why the tool exists before how it works — four beats: the loop
(fix one bug, another returns), why it happens (nobody knows the code anymore; slop tests
prove nothing), what a real test is, and the fix (requirements ↔ proof kept in sync on every
change). The "real test" beat is a worked storyboard with exact golden numbers — change a
value, run, watch the chart assert IY1 2,400,000 … IY5 2,671,006.87 exactly, save, and see
the other page reflect it — every asserted value visible on screen. A "reading a test"
chapter shows the anatomy of the two-column detail: requirement chip states (proven /
unproven / not-reached), a test's named beats and their marks, the recording, and the
many-to-many coverage tags.

*Drafted 2026-08-05 transcribing the approved onboarding design
(docs/superpowers/specs/2026-08-05-onboarding-and-skill-eval-design.md) — wording awaits the
human; reword freely, the test asserts content not phrasing.*
```

- [ ] **Step 3: Write the failing test** — append to `spec/board/test.spec.ts`:

```ts
test('The guide opens with the problem, and teaches reading a test', async ({ page }) => {
  await coverReqs('R11')
  await page.goto('/#howitworks')
  await page.waitForSelector('#howview:not([hidden])')
  await checkReq('R11', async () => {
    // the problem story is the FIRST thing in the overview — before the method
    const story = page.locator('#how-problem')
    await expect(story).toBeVisible()
    expect(await page.locator('#howoverview > :first-child').getAttribute('id')).toBe('how-problem')
    await expect(story.locator('.beat')).toHaveCount(4)
    // the worked storyboard carries EXACT golden values, not vibes
    await expect(story).toContainText('2,400,000')
    await expect(story).toContainText('2,671,006.87')
    await expect(story).toContainText('200 psf')
    // and the anatomy chapter teaches how to read a test
    const anatomy = page.locator('#how-anatomy')
    await expect(anatomy).toBeVisible()
    await expect(anatomy).toContainText('not-reached')
    await expect(anatomy.locator('.ana-call')).not.toHaveCount(0)
  })
})
```

- [ ] **Step 4: See it fail** — `npx playwright test spec/board --config=playwright.board.ts`. Expected: the new test FAILS (`#how-problem` not found); every existing board test still passes.

- [ ] **Step 5: Bake the story chapter.** In `tools/build-board.mjs`, add module-level data + a renderer near `WORKFLOW`, and interpolate `${howProblem()}` as the first child of `#howoverview` (before `<div class="intro">`):

```js
const HOW_PROBLEM = {
  beats: [
    { h: 'The loop', p: 'Fix one bug, another returns. The feature that worked last week quietly breaks under the next one.' },
    { h: 'Why', p: 'At AI speed nobody knows the code anymore — and AI-slop tests (one button, an assertion no human can see) prove nothing.' },
    { h: 'A real test', p: 'Exact golden numbers, visible on screen, checked across pages. Not "the box exists" — the number is RIGHT.' },
    { h: 'The fix', p: 'Requirements on one end, the tests that prove them on the other — kept in sync on every change, so drift shows the moment it happens.' }
  ],
  frames: [
    { k: '1 · change', t: 'Market rent, unit 33A', v: '100 → 200 psf' },
    { k: '2 · run', t: 'The chart asserts exact values', v: 'IY1 2,400,000 ✓ · IY5 2,671,006.87 ✓' },
    { k: '3 · save', t: 'Held on screen so a person can watch it happen', v: '' },
    { k: '4 · cross-page', t: 'Tenancy schedule reflects it', v: '33A · 200 psf ✓' }
  ]
}
const howProblem = () => `<div class="sect" id="how-problem">
  <div class="sect-head"><span class="lbl">the problem</span>
    <h2>Why this tool exists</h2><span class="rule"></span></div>
  <div class="beats">${HOW_PROBLEM.beats.map(b =>
    `<div class="beat"><h3>${esc(b.h)}</h3><p>${esc(b.p)}</p></div>`).join('')}</div>
  <div class="frames">${HOW_PROBLEM.frames.map(f =>
    `<div class="frame"><span class="fk">${esc(f.k)}</span><p>${esc(f.t)}</p>${f.v ? `<div class="fv mono">${esc(f.v)}</div>` : ''}</div>`).join('')}</div>
  <p class="frames-cap">Every asserted value must be visible in the recording — you can watch it be true.</p>
</div>`
```

- [ ] **Step 6: Bake the anatomy chapter** — `id="how-anatomy"`, placed directly after the spine `.sect`. Same pattern: a `.sect` containing a small annotated mock of one requirement row and one test row (plain divs styled with existing chip/mark classes), each annotation a `.ana-call` div. It must name: proven / unproven / **not-reached** chip states, the test's named beats and marks, the recording, and coverage tags (neutral, indigo on hover). Reuse existing classes (`chip ok`, `chip stale`, `mk`) — no new colours. Add CSS for `.beats`, `.frames`, `.frame`, `.fv`, `.ana-call` in the how-does-it-work CSS block using only `var(--*)` tokens (grid like `.skill-summaries`, mono via `var(--mono)`).

- [ ] **Step 7: Rebuild + green** — `npm run board:build` (must not throw — the `new Function()` guard), then `npx playwright test spec/board --config=playwright.board.ts`. Expected: all pass.

- [ ] **Step 8: Full suite** — `npm run e2e`. Expected: all screens pass.

- [ ] **Step 9: Commit** (explicit paths only):

```bash
git add spec/board/prd.md spec/board/test.spec.ts tools/build-board.mjs board.html
git commit -m "feat(board): the guide opens with the problem — four beats, a worked storyboard with exact goldens, and a reading-a-test anatomy (R11 draft awaiting the human)"
```

---

### Task 2: Conform CLAUDE.md to the no-gate model (R4/R8, 2026-07-30)

**Files:**
- Modify: `CLAUDE.md`

The acceptance gate was removed by the human on 2026-07-30 (`spec/board/prd.md` R8, R4-narrowed) but CLAUDE.md still teaches it. Conform CLAUDE.md to the PRDs and code AS THEY ARE — with the reason attached inline (rule 6). Do not change any code; where CODE still carries gate-era leftovers, list them in your report instead.

- [ ] **Step 1: Verify present-tense truth before editing.** Read `spec/board/prd.md` R4 + R8, `spec/init/prd.md` R3, and confirm in `tools/coverage.mjs` / `tools/spec-store.mjs` which states actually exist now (grep for `reworded`, `approvedPrdText`, `readState`). The tests no longer touch `state.json`; `spec/*/state.json` still exists on disk holding a pre-redesign `approvedPrdText` — that is a relic. Report (do not delete) it.

- [ ] **Step 2: Fix these drift points, each with a one-line reason attached** (wording yours, meaning fixed):
  - Intro: "reword the requirement and it reads **reworded** (awaiting the human)" and "**There is no status field anywhere** — … derived from the stored accept pin" → states are **proven / unproven** (plus **not-reached** within a run); derivation is from folded coverage against the current tree only. "**One human gate: accept the requirements**" → there is **no gate** (board R8): a drafted PRD carries `guess: true`, and dropping the flag is the acceptance (init R3) — the one thing waiting on a person.
  - "You are staff" + rule 5: "the one gate is accepting the requirements — never accept them on the human's behalf" → "never drop a `guess:` flag on the human's behalf".
  - Architecture table: `state.json` line — no longer the accept pin; mark it as a pre-redesign relic pending removal.
  - "How a test proves a requirement" + tools lines: "proven / reworded / unproven" → "proven / unproven".
  - Dogfood trap bullet: "R4 and R8 transiently write **and restore** `spec/board/state.json` to prove the accept transition … Never **accept board's requirements yourself**" → rewrite to the current truth (tests no longer write state.json; the standing rule becomes: never drop a board PRD's guess flag or edit requirement meaning to go green).
  - Attach the reason once, near the intro change: *(gate removed by the human 2026-07-30 — see board R8; a decision that is always yes is ceremony, not a gate).*

- [ ] **Step 3: Re-read the edited CLAUDE.md** end-to-end for leftover mentions of accept/pin/reworded (grep `accept pin\|approvedPrdText\|reworded`). Expected: none outside historical notes.

- [ ] **Step 4: Commit:**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md catches up with the no-gate model — proven/unproven only, guess-flag acceptance (board R8, 2026-07-30)"
```

---

### Task 3: Proof-integrity tool + escape log + kg-staff discipline

**Files:**
- Create: `tools/proof-integrity.mjs`
- Create: `tools/proof-integrity.test.mjs`
- Create: `spec/_escapes.md`
- Modify: `tools/_skeleton.mjs` (add both new files to the vendored list, matching its existing entry format)
- Modify: `package.json` (script `"proof": "node tools/proof-integrity.mjs"`; mirror into the skeleton's SCRIPTS if that is where vendored scripts live)
- Modify: `skills/kg-staff/SKILL.md` (escape discipline in section 4)

**Interfaces:**
- Produces (pure, unit-tested): `extractCheckReqBlocks(src) → [{id, body, line}]`, `hasValueAssertion(body) → boolean`, `lintSource(src) → [{id, line, ok}]`, `perturbNumbers(value) → {value, changes: [{path, from, to}]}`.
- CLI: `node tools/proof-integrity.mjs lint` (all screens; exit 1 if any existence-only proof) · `node tools/proof-integrity.mjs perturb <screen>` (golden perturbation run).

- [ ] **Step 1: Write the failing unit tests** — `tools/proof-integrity.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCheckReqBlocks, hasValueAssertion, lintSource, perturbNumbers } from './proof-integrity.mjs'

const SRC = `
await checkReq('R5', async () => {
  await expect(page.locator('.iy1')).toHaveText('2,400,000')
})
await checkReq('x:R3', async () => {
  await expect(page.locator('.panel')).toBeVisible()
})`

test('extracts every checkReq block with its id and body', () => {
  const blocks = extractCheckReqBlocks(SRC)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].id, 'R5')
  assert.match(blocks[0].body, /toHaveText/)
  assert.equal(blocks[1].id, 'x:R3')
})

test('a value assertion counts; existence alone does not', () => {
  assert.equal(hasValueAssertion("expect(x).toHaveText('2,400,000')"), true)
  assert.equal(hasValueAssertion('expect(n).toBe(42)'), true)
  assert.equal(hasValueAssertion('expect(rows).toHaveCount(3)'), true)
  assert.equal(hasValueAssertion('expect(el).toBeVisible()'), false)
  assert.equal(hasValueAssertion('expect(el).toBeAttached()'), false)
  assert.equal(hasValueAssertion('expect(rows).toHaveCount(0)'), false)
})

test('lintSource flags only the existence-only proof', () => {
  const rows = lintSource(SRC)
  assert.deepEqual(rows.map(r => r.ok), [true, false])
})

test('perturbNumbers nudges every numeric leaf and records the path', () => {
  const { value, changes } = perturbNumbers({ a: 100, b: { c: 2396129.0322580645 }, s: 'keep', n: [1, 2] })
  assert.equal(value.a, 101)                          // integer: +1
  assert.ok(Math.abs(value.b.c - 2396129.0322580645 * 1.01) < 1e-6)  // float: ×1.01
  assert.equal(value.s, 'keep')
  assert.deepEqual(value.n, [2, 3])
  assert.equal(changes.length, 4)
  assert.ok(changes.some(ch => ch.path === 'b.c'))
})
```

- [ ] **Step 2: See them fail** — `npm run test:tools`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `tools/proof-integrity.mjs`.** Pure part: `extractCheckReqBlocks` finds `checkReq('<id>'` then brace-balances from the first `{` after `=>` to capture the body (authored specs only — no need to parse arbitrary JS); `hasValueAssertion` is a regex over `toHaveText|toContainText|toHaveValue|toHaveAttribute|toHaveCount\(\s*[1-9]|toBe\(|toEqual\(|toMatch|toBeCloseTo|toBeGreaterThan|toBeLessThan`; `perturbNumbers` deep-walks (objects/arrays), integers `+1`, floats `×1.01`, records dotted paths. CLI part (thin, not unit-tested): `lint` reads every `spec/*/test.spec.ts`, prints one table row per proof (`screen · id · line · ok/EXISTENCE-ONLY`), exits 1 on any flag; `perturb <screen>` requires `spec/<screen>/golden.json` (absent → print `no-golden` and exit 2), backs it up beside itself as `golden.json.pi-bak`, writes the perturbed copy, runs `npx playwright test spec/<screen> --config=playwright.board.ts --reporter=json` capturing stdout to a scratch file, then in a `finally` restores the golden from backup and deletes the backup. Parse the JSON report's steps for `proves <id>`: a proves-step that PASSED under perturbation and whose block has numeric assertions is printed `SUSPECT — proof survived a perturbed golden`. **The `--reporter=json` override is load-bearing**: it replaces the config's `spec/_results-reporter.mjs`, so a perturbed run can never fold into `spec/_results-index.json`. Verify that with a dry read of `playwright.board.ts` before running anything.

- [ ] **Step 4: Green** — `npm run test:tools`. Expected: all pass, including every pre-existing tools test.

- [ ] **Step 5: Real-data lint** — run `node tools/proof-integrity.mjs lint` in THIS repo and report its full output (specboard's own proofs are the first honesty check). Do NOT run `perturb` here (no golden.json in this repo) and do NOT run it against any live board.

- [ ] **Step 6: Seed `spec/_escapes.md`:**

```markdown
# Escapes — bugs the green board missed

An **escape** is a bug a human found while the board was green. Every entry must end with the
assertion that was strengthened and the skill file that got the lesson — an escape that only
gets logged is a bug report; an escape that hardens a proof and a skill is why this file exists.

| date | screen | what broke | requirement that should have caught it | assertion strengthened | lesson baked into |
|------|--------|------------|----------------------------------------|------------------------|-------------------|
```

- [ ] **Step 7: Wire the vendoring.** Add `tools/proof-integrity.mjs` and `spec/_escapes.md` to `tools/_skeleton.mjs` following its existing FILES format exactly; add the `proof` script to `package.json` and to the skeleton's vendored scripts list if scripts are vendored there (read `_skeleton.mjs` to see). Then `npm run test:tools` again — `update.test.mjs` and the manifest hashing must still pass.

- [ ] **Step 8: Teach kg-staff the discipline.** In `skills/kg-staff/SKILL.md` section 4 (close the loop), append:

```markdown
- **A bug found while the board was green is an escape.** Log it in `spec/_escapes.md`,
  strengthen the assertion that should have caught it in the same turn, and bake the lesson
  into the skill that authored the weak proof. When in doubt whether a proof is real, run
  `npm run proof lint` — and `node tools/proof-integrity.mjs perturb <screen>` to demand the
  golden numbers actually bite.
```

- [ ] **Step 9: Commit:**

```bash
git add tools/proof-integrity.mjs tools/proof-integrity.test.mjs spec/_escapes.md tools/_skeleton.mjs package.json skills/kg-staff/SKILL.md
git commit -m "feat(tools): proof integrity — a fake green cannot survive a perturbed golden; escapes get logged, proofs get hardened"
```

---

### Task 4: R12 — the derived getting-started rail (AFTER Task 1 lands; same files)

**Files:**
- Create: `tools/journey.mjs`
- Create: `tools/journey.test.mjs`
- Modify: `spec/board/prd.md` (append R12 after R11)
- Modify: `spec/board/test.spec.ts` (new test tagging R12)
- Modify: `tools/build-board.mjs` (rail + topbar chip + CSS + client toggle)

**Interfaces:**
- Consumes: Task 1's R11 already in `spec/board/prd.md`; topbar button `id="howbtn"` at `tools/build-board.mjs:1288` (chip sits beside it).
- Produces: `deriveJourney(facts) → {steps, folded}` with `facts = {configSaved: boolean, crawledAt: string|null, screens: [{guess, reqs: [{state}]}]}` and each step `{id, title, fact, done, current?, cmd?}`; `journey() → same, facts gathered from spec-store` (`existsSync(CONFIG)`, `readCrawl().crawledAt`, `allScreens()`). DOM: `#jchip` (topbar), `#jrail` with six `.jstep` (state class `done`/`cur`), each holding a `.jfact` mono caption.

- [ ] **Step 1: Failing unit tests** — `tools/journey.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveJourney } from './journey.mjs'

const S = (guess, states) => ({ guess, reqs: states.map(state => ({ state })) })

test('fresh scaffold: nothing saved → point-at-your-app is current', () => {
  const { steps, folded } = deriveJourney({ configSaved: false, crawledAt: null, screens: [] })
  assert.equal(steps.length, 6)
  assert.equal(steps[0].done, true)                 // you are looking at the board
  assert.equal(steps[1].current, true)
  assert.equal(folded, false)
})

test('crawled but nothing deep → deepen is current and names kg-deep', () => {
  const { steps } = deriveJourney({ configSaved: true, crawledAt: '2026-08-05', screens: [] })
  assert.equal(steps[2].done, true)
  assert.equal(steps[3].current, true)
  assert.match(steps[3].cmd, /kg-deep/)
})

test('a confirmed prd with nothing proven → watch-the-proof is current', () => {
  const { steps, folded } = deriveJourney({ configSaved: true, crawledAt: null, screens: [S(false, ['unproven'])] })
  assert.equal(steps[4].done, true)
  assert.equal(steps[5].current, true)
  assert.equal(folded, false)
})

test('a guess still flagged → confirm-the-draft is current', () => {
  const { steps } = deriveJourney({ configSaved: true, crawledAt: '2026-08-05', screens: [S(true, ['unproven'])] })
  assert.equal(steps[3].done, true)
  assert.equal(steps[4].current, true)
})

test('the rail is a map, not a turnstile: a later fact holds regardless', () => {
  const { steps } = deriveJourney({ configSaved: false, crawledAt: null, screens: [S(false, ['proven'])] })
  assert.equal(steps[1].current, true)              // config still first incomplete
  assert.equal(steps[5].done, true)
})

test('anything proven folds the rail', () => {
  const { folded } = deriveJourney({ configSaved: true, crawledAt: null, screens: [S(false, ['proven'])] })
  assert.equal(folded, true)
})
```

- [ ] **Step 2: See them fail** — `npm run test:tools`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `tools/journey.mjs`:**

```js
// The getting-started journey — DERIVED from the tree on every build, never stored.
// Pure derivation here (unit-tested); journey() gathers the three facts from spec-store.
import { existsSync } from 'node:fs'
import { CONFIG, readCrawl, allScreens } from './spec-store.mjs'

export function deriveJourney ({ configSaved, crawledAt, screens }) {
  const anyPrd = screens.length > 0
  const proven = screens.some(s => s.reqs.some(r => r.state === 'proven'))
  const steps = [
    { id: 'install', title: 'Install the board', fact: 'board is serving', done: true },
    { id: 'config', title: 'Point it at your app', fact: '_config.json saved', done: !!configSaved },
    { id: 'crawl', title: 'Inventory the app', fact: 'crawl ran, or rows exist', done: !!crawledAt || anyPrd },
    { id: 'deepen', title: 'Deepen one screen', fact: 'a prd.md exists', done: anyPrd, cmd: '/kg-deep <screen>' },
    { id: 'confirm', title: 'Confirm the draft', fact: 'a prd.md without guess', done: screens.some(s => !s.guess) },
    { id: 'prove', title: 'Watch the proof', fact: 'a requirement is proven', done: proven }
  ]
  const cur = steps.find(s => !s.done)
  if (cur) cur.current = true
  return { steps, folded: proven }
}

export const journey = () => deriveJourney({
  configSaved: existsSync(CONFIG),
  crawledAt: readCrawl().crawledAt,
  screens: allScreens()
})
```

- [ ] **Step 4: Unit green** — `npm run test:tools`. Expected: all pass.

- [ ] **Step 5: Append the R12 draft to `spec/board/prd.md`** (verbatim, after R11):

```markdown
## R12 — A getting-started rail derives the journey, never stores it

The home carries a six-step rail — install the board, point it at your app, inventory the
app, deepen one screen, confirm the draft, watch the proof — and every step's state is
derived from the tree on each build (config saved, crawl ran or rows exist, a prd.md exists,
a prd.md without `guess`, a requirement proven). Nothing is stored. The current step is the
first incomplete one and shows the one next action; a later step whose fact already holds
reads done — the rail is a map, not a turnstile. Once any requirement is proven the rail
folds to a chip beside "How does it work", which reopens it.

*Drafted 2026-08-05 transcribing the approved onboarding design
(docs/superpowers/specs/2026-08-05-onboarding-and-skill-eval-design.md) — wording awaits the
human; reword freely, the test asserts behaviour not phrasing.*
```

- [ ] **Step 6: Write the failing E2E test** — append to `spec/board/test.spec.ts`:

```ts
test('The getting-started rail derives, folds, and reopens', async ({ page }) => {
  await coverReqs('R12')
  await checkReq('R12', async () => {
    // this repo's own journey is complete (requirements are proven), so the rail ships FOLDED
    const rail = page.locator('#jrail')
    const chip = page.locator('#jchip')
    await expect(rail).toBeHidden()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(rail).toBeVisible()
    await expect(rail.locator('.jstep')).toHaveCount(6)
    await expect(rail.locator('.jstep.done')).toHaveCount(6)      // every derived fact holds here
    await expect(rail.locator('.jstep .jfact').first()).toContainText('board is serving')
    await chip.click()
    await expect(rail).toBeHidden()
  })
})
```

- [ ] **Step 7: See it fail** — `npx playwright test spec/board --config=playwright.board.ts`. Expected: the new test FAILS (`#jchip` not found); everything else passes.

- [ ] **Step 8: Render the rail.** In `tools/build-board.mjs`: import `journey` from `./journey.mjs`; in `build()` call it once; emit the chip next to `id="howbtn"` (line ~1288) as `<button class="btn sm" id="jchip">Journey<span class="jdone">6/6</span></button>` (count = done steps) and the rail at the top of `#home` as `<div id="jrail"${j.folded ? ' hidden' : ''}>` holding six `.jstep` divs (`done`/`cur` class from the step), each: a mark, the number+title, the `.jfact` mono caption, and — only on the current step — the action line (`.jact` showing `step.cmd` or the matching button name). CSS in the main style block, tokens only: the rail is a quiet strip (surface + hairline border); `cur` uses the indigo "your turn" treatment (it IS your turn) with a mark, `done` the ok treatment; AA contrast throughout. Client toggle in the emitted script (REMEMBER: `\\n`, no backticks): `jchip` click toggles `jrail.hidden`. The rail lives inside `#home`, so detail views cover it naturally.

- [ ] **Step 9: Rebuild + E2E green** — `npm run board:build` then `npx playwright test spec/board --config=playwright.board.ts`. Expected: all pass.

- [ ] **Step 10: Full suite** — `npm run e2e`; if board coverage reads stale (own-coverage lag), run once more.

- [ ] **Step 11: Commit:**

```bash
git add spec/board/prd.md spec/board/test.spec.ts tools/journey.mjs tools/journey.test.mjs tools/build-board.mjs board.html
git commit -m "feat(board): a getting-started rail that derives the journey and never stores it (R12 draft awaiting the human)"
```

---

### Task 5: Release 0.21.0 + downstream (orchestrator-run, after 1–4)

- [ ] **Step 1:** `npm run test:tools` and `npm run e2e` from a clean tree — both green (suite on its own port, never 4173).
- [ ] **Step 2:** Bump `.claude-plugin/plugin.json` version `0.20.0 → 0.21.0`; `npm run board:build`.
- [ ] **Step 3:** Release commit sweeping the suite's final run artifacts, staged explicitly (`spec/_results.json spec/_results-index.json spec/_runs.json spec/*/screen.png .claude-plugin/plugin.json board.html` — check nothing foreign slipped into the tree first), message in house style: `release: specboard 0.21.0 — the board teaches its own journey; a fake green cannot survive a perturbed golden`. Push.
- [ ] **Step 4:** Downstream per standing rules: update the installed plugin, run kg-update in dojostack, restart its vendored board detached on ITS port (4190), verify the served version. Surface the R11/R12 draft wording to the human for their confirmation.

---

## Self-review notes

- Spec coverage: Design A → Task 1; CLAUDE.md drift → Task 2; Layer 1 + Layer 2 → Task 3; Design B → Task 4; release/downstream → Task 5. Layer 3 (trap benchmark) is deliberately not planned — phase 2 spec.
- The rail's "why this step?" deep-link is v1-plain (`#howitworks`); `how-problem`/`how-anatomy` ids exist for a future router extension. The spec's anchor requirement is satisfied by the ids.
- Type consistency: `deriveJourney` facts/step shapes match between journey.mjs, its tests, and the build-board consumption; `#jchip`/`#jrail`/`.jstep`/`.jfact` match between Step 8 and the E2E test.
- Perturbation attribution is per-proves-step with no per-field mapping — exactly the v1 precision the spec fixed.
