# Visual Requirements Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn specboard's requirement display from a prose wall into behavior-grid requirements proven by harvested run evidence, across three views (Focus / Grid / Flow), and remove the last of the acceptance gate (the `guess:` flag) — all on the board that dogfoods itself, kept green at every step.

**Architecture:** Pure, unit-tested derivation (`tools/*.mjs`) feeds a single rendering pass (`tools/build-board.mjs` + `tools/board/client.js`). The redesign changes what the derivation exposes (behavior blocks, a richer status vocabulary, per-requirement evidence) and then rewrites the rendering *once* to consume it. Because the board proves its own requirements, requirement/test/code/doc changes move together.

**Tech stack:** Node ESM (`.mjs`, `node --test`), Playwright (`spec/**/test.spec.ts`, `playwright.board.ts`), vanilla JS board client, ffmpeg (already vendored by the narrate pipeline) for gif cuts.

**Spec:** `docs/superpowers/specs/2026-08-17-visual-requirements-design.md`. **Visual contract:** `scratchpad/mockup/specboard-mockup.html` (served on :4317).

## Global Constraints

- **Rule 1 — failing test first.** Every behavior change writes its test first and watches it go red before code. Exempt: pure refactors. (CLAUDE.md)
- **Rule 2 — assert something that can fail.** A test that passes with the requirement deleted is not a test.
- **Never fake a green.** Never weaken/skip/delete a test to go green. Unproven reads honestly ungreen.
- **The board dogfoods itself.** `spec/board/test.spec.ts` and `spec/init/test.spec.ts` prove the board's own requirements. The **suite must be green at the end of every task** (`npm run e2e`), and the **pure unit tests** (`npm run test:tools`) green at the end of every foundation task.
- **The first run after editing `spec/board/test.spec.ts` lags one run** (its own coverage folds at that run's end) — expect it, don't chase it.
- **Design system is non-negotiable** (`spec/_design.css`): no raw hex, no off-scale size/radius, every hue also carries a mark, WCAG AA (4.5:1). Exactly one inverted element per screen.
- **Server must not import the builder** — `build()` runs as a child process; editing `spec-store.mjs`/`serve-board.mjs` needs a fresh plain `node` server (the Playwright webServer); `npm run board` self-restarts under `--watch`.
- **Stage files explicitly** — never `git add -A` (another agent may be working here).
- **`build()` guards its own output** — it parses every emitted `<script>` with `new Function()` and refuses to write a broken board. Keep that guard.
- **Commit message footer:** end commits with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Decomposition — a sequence of shippable plans

This spec is too large for one plan. It is split into five plans, each leaving the suite green and the product usable. **`build-board.mjs` and the narrated walkthrough are rewritten exactly once, in Plan 3**, after every input it needs (behavior blocks, status vocabulary, evidence) already exists and is unit-tested. Plans 1–2 and 4 are purely additive `tools/` capability the old board ignores; Plan 3 is the single coordinated rendering rewrite + dogfood-test rewrite + gate removal; Plan 5 migrates the board's own PRDs and the skills/docs.

| Plan | Scope | Touches `build-board.mjs`? |
|---|---|---|
| **1 (this doc, full detail)** | Behavior-block parser + richer status vocabulary — pure, additive | No |
| 2 (roadmap) | Evidence harvesting: frames + step timestamps + gif cuts, folded per-requirement, CLI runs too | No (reporter/store only) |
| 3 (roadmap) | The board rewrite: Focus proof panel, Grid replaces List, Flow player, status vocab in rendering, **gate removal**, prompt-handoff authoring UI, coordinated dogfood-test rewrite | **Yes — the one touch** |
| 4 (roadmap) | The `Changed` drift state (content-hash of requirement text at last pass) | No (reporter/store; Plan 3 already renders the state) |
| 5 (roadmap) | Migrate board's 4 PRDs to behavior blocks; update kg-init/kg-deep/kg-e2e, CLAUDE.md design system, README; drop demo `guess:true` | No |

Write Plans 2–5 in full detail at the start of each, once Plan 1's concrete output and the then-current code are in hand — several of their steps (the walkthrough Act 2 rewrite, the frame-capture code) must quote real code that this plan's output changes.

---

## Plan 1 — Foundation: behavior blocks + status vocabulary (pure, additive)

Two pure `tools/` capabilities the current board does not yet consume, each unit-tested with `node --test`. Nothing the board renders changes; `npm run e2e` and `npm run test:tools` stay green throughout. This de-risks Plan 3 (the rewrite reads these) and is independently valuable (the derivation is the one thing the product cannot get wrong).

### Task 1: Behavior-block parser

A requirement body may lead with a `- **Given** / **When** / **Then**` triple (the behavior grid's face); the prose follows. Parse that triple, tolerant of its absence (prose-only requirements stay valid).

**Files:**
- Create: `tools/behavior.mjs`
- Test: `tools/behavior.test.mjs`

**Interfaces:**
- Consumes: nothing (pure string in).
- Produces: `parseBehavior(body: string) => { given: string, when: string, then: string } | null` — the three trimmed clauses when all three labeled lines are present, else `null`. Sub-clauses after a `·` in Given are preserved verbatim (rendering splits them, not the parser).

- [ ] **Step 1: Write the failing test**

```js
// tools/behavior.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBehavior } from './behavior.mjs'

test('parses a Given/When/Then triple from a requirement body', () => {
  const body = [
    '- **Given** edit mode · value ≠ house view',
    '- **When** edit the value',
    '- **Then** the cell marks an override; the HV base is kept',
    '',
    'Prose follows here.'
  ].join('\n')
  assert.deepEqual(parseBehavior(body), {
    given: 'edit mode · value ≠ house view',
    when: 'edit the value',
    then: 'the cell marks an override; the HV base is kept'
  })
})

test('returns null when the triple is absent — prose-only requirements stay valid', () => {
  assert.equal(parseBehavior('Just prose, no behavior block.'), null)
})

test('returns null when only some of the three labels are present', () => {
  assert.equal(parseBehavior('- **Given** a state\n- **When** an action'), null)
})

test('is tolerant of extra spaces and a trailing period on the label', () => {
  const body = '-   **Given**  a\n- **When** b\n- **Then** c'
  assert.deepEqual(parseBehavior(body), { given: 'a', when: 'b', then: 'c' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/behavior.test.mjs`
Expected: FAIL — `Cannot find module './behavior.mjs'` / `parseBehavior is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// tools/behavior.mjs
// The behavior grid's face: a requirement may lead with a Given/When/Then triple. Pure and tiny —
// the PRD format is still a decision we are testing, so the parser has no opinions beyond the three
// labels. Absent or partial → null, and the requirement renders prose-only (unchanged behavior).
const LABEL = k => new RegExp('^\\s*-\\s*\\*\\*' + k + '\\*\\*\\s+(.+?)\\s*$', 'm')

export function parseBehavior (body) {
  const g = String(body || '').match(LABEL('Given'))
  const w = String(body || '').match(LABEL('When'))
  const t = String(body || '').match(LABEL('Then'))
  if (!g || !w || !t) return null
  return { given: g[1].trim(), when: w[1].trim(), then: t[1].trim() }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/behavior.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Confirm the suite still derives (nothing rendered yet)**

Run: `npm run test:tools`
Expected: PASS — the new file's tests plus all existing tool tests. `build-board.mjs` does not import `behavior.mjs` yet, so the board is unchanged.

- [ ] **Step 6: Commit**

```bash
git add tools/behavior.mjs tools/behavior.test.mjs
git commit -m "feat(behavior): pure Given/When/Then parser, tolerant of absence

The behavior grid's face — a requirement may lead with a G/W/T triple.
Pure and unit-tested; prose-only requirements parse to null and stay
valid. Not yet rendered (Plan 3 consumes it).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: Richer status vocabulary (additive derivation)

The board's status words become Passed / Failed / Untested / Not reached (Changed arrives in Plan 4). Add a pure derivation over a requirement's folded coverage — **fail-wins** so a real failure is never masked by a second passing test (spec Open Decision 3). Leave the existing `deriveReqState` (`proven`/`unproven`) in place; Plan 3 switches rendering to the new function so nothing breaks now.

**Files:**
- Modify: `tools/coverage.mjs` (append a function; touch nothing existing)
- Test: `tools/coverage.test.mjs` (append tests)

**Interfaces:**
- Consumes: `aggregateCoverage(index)[qualifiedId]` — the array `[{ status: 'pass'|'fail'|'not-reached', ok, ranAt, title, screen }, …]` that `aggregateCoverage` already produces (may be `undefined` when no test covers the requirement).
- Produces: `deriveReqStatus(entries: Array | undefined) => 'passed' | 'failed' | 'not-reached' | 'untested'`. Precedence: any `fail` → `failed`; else any `pass` → `passed`; else any `not-reached` → `not-reached`; else `untested`.

- [ ] **Step 1: Write the failing test**

```js
// append to tools/coverage.test.mjs
// (extend the existing import line to include deriveReqStatus)
test('deriveReqStatus: no covering test at all reads untested', () => {
  assert.equal(deriveReqStatus(undefined), 'untested')
  assert.equal(deriveReqStatus([]), 'untested')
})

test('deriveReqStatus: a single passing test reads passed', () => {
  assert.equal(deriveReqStatus([{ status: 'pass' }]), 'passed')
})

test('deriveReqStatus: fail wins over a second passing test — no masking', () => {
  assert.equal(deriveReqStatus([{ status: 'pass' }, { status: 'fail' }]), 'failed')
})

test('deriveReqStatus: only a not-reached declaration reads not-reached, not untested', () => {
  assert.equal(deriveReqStatus([{ status: 'not-reached' }]), 'not-reached')
})

test('deriveReqStatus: a pass outranks a not-reached from another flow', () => {
  assert.equal(deriveReqStatus([{ status: 'not-reached' }, { status: 'pass' }]), 'passed')
})
```

Also change the test file's import line:

```js
import { coverageFromTest, aggregateCoverage, deriveReqState, deriveReqStatus, qualify } from './coverage.mjs'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/coverage.test.mjs`
Expected: FAIL — `deriveReqStatus is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// append to tools/coverage.mjs
// The board's status words derive from folded coverage. FAIL WINS: a requirement covered by two
// tests, one failing, reads failed — a real failure is never masked by a second green test. No
// covering test at all is untested; a flow that declared it but stopped short is not-reached.
// (`Changed` — a proof that predates a requirement edit — is added in the drift-state plan.)
export function deriveReqStatus (entries) {
  const list = entries || []
  if (list.some(e => e.status === 'fail')) return 'failed'
  if (list.some(e => e.status === 'pass')) return 'passed'
  if (list.some(e => e.status === 'not-reached')) return 'not-reached'
  return 'untested'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/coverage.test.mjs`
Expected: PASS — the 5 new tests plus every existing coverage test (the existing `deriveReqState` and its tests are untouched).

- [ ] **Step 5: Confirm nothing rendered changed**

Run: `npm run test:tools && npm run board:build`
Expected: both PASS; `board.html` rebuilds with the same requirement count as before (the board still calls `deriveReqState`, not the new function).

- [ ] **Step 6: Commit**

```bash
git add tools/coverage.mjs tools/coverage.test.mjs
git commit -m "feat(coverage): deriveReqStatus — Passed/Failed/Untested/Not reached, fail-wins

Additive pure derivation over folded coverage; fail wins so a real
failure is never masked by a second passing test (spec decision 3).
deriveReqState (proven/unproven) is left in place — Plan 3 switches the
board's rendering onto deriveReqStatus.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Plan 1 done — verification gate

- [ ] `npm run test:tools` green (behavior + coverage + all existing).
- [ ] `npm run e2e` green (board rendering unchanged — this is the dogfood safety check).
- [ ] `git log --oneline -2` shows the two commits.
- [ ] Push: `git push`.

---

## Plan 2 — Evidence harvesting (additive; tools + reporter, not the board)

The per-run record already carries each `proves <id>` step with `t` (ms offset from recording start) and `d` (duration) — see `spec/_results-reporter.mjs` `flattenSteps` — and the board records a `.webm`. Plan 2 turns those into per-requirement clip windows + ffmpeg cut args (pure, unit-tested), then wires a before/after frame capture. The board renders none of it until Plan 3.

### Task 3: Evidence clip derivation (pure)

**Files:**
- Create: `tools/evidence.mjs`
- Test: `tools/evidence.test.mjs`

**Interfaces:**
- Consumes: a test's flattened `steps` array — objects shaped `{ label, cat, depth, ok, t, d }` (from `flattenSteps`); the `proves <id>` step has `label === 'proves ' + id`.
- Produces:
  - `clipWindow(steps, id) => { from: number, to: number } | null` — the `[t, t+d]` window (ms) of the `proves <id>` step (matches the bare id after the last `:` too, so a qualified `board:R5` step or a bare `R5` step both resolve for `id='R5'`); `null` if absent or the step has no `t`.
  - `ffmpegClipArgs(srcRel, { from, to }, outRel) => string[]` — args to cut a short muted animated webp from the recording: seek `from/1000`s, duration `max(0.4,(to-from)/1000)`s, scale to 640 wide keeping aspect, 12fps, loop forever. Pure array; the caller runs ffmpeg (auto-detected like piper; frame-pair fallback when absent — that fallback is a Plan-2 integration task, not this one).

- [ ] **Step 1: Write the failing test**

```js
// tools/evidence.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipWindow, ffmpegClipArgs } from './evidence.mjs'

const steps = [
  { label: 'Open /todo.html', cat: 'pw:api', t: 0, d: 400 },
  { label: 'proves R5', cat: 'test.step', t: 1200, d: 800 },
  { label: 'proves board:R6', cat: 'test.step', t: 3000, d: 500 }
]

test('clipWindow finds the proves-step window by bare id', () => {
  assert.deepEqual(clipWindow(steps, 'R5'), { from: 1200, to: 2000 })
})
test('clipWindow matches a qualified step by its bare id', () => {
  assert.deepEqual(clipWindow(steps, 'R6'), { from: 3000, to: 3500 })
})
test('clipWindow returns null when the requirement was not reached (no step)', () => {
  assert.equal(clipWindow(steps, 'R9'), null)
})
test('clipWindow returns null when the step has no timestamp', () => {
  assert.equal(clipWindow([{ label: 'proves R1', cat: 'test.step' }], 'R1'), null)
})
test('ffmpegClipArgs seeks, clamps a minimum duration, scales and loops', () => {
  const args = ffmpegClipArgs('runs/x/video.webm', { from: 1200, to: 2000 }, 'runs/x/R5.webp')
  assert.deepEqual(args, [
    '-y', '-ss', '1.2', '-t', '0.8', '-i', 'runs/x/video.webm',
    '-an', '-vf', 'scale=640:-2:flags=lanczos,fps=12', '-loop', '0', 'runs/x/R5.webp'
  ])
})
test('ffmpegClipArgs clamps a sub-0.4s window up to 0.4s', () => {
  const args = ffmpegClipArgs('v.webm', { from: 100, to: 200 }, 'o.webp')
  assert.equal(args[args.indexOf('-t') + 1], '0.4')
})
```

- [ ] **Step 2: Run to verify it fails** — `node --test tools/evidence.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement**

```js
// tools/evidence.mjs
// The recording already exists (a board run's .webm) and each `proves <id>` step already carries
// its offset+duration (spec/_results-reporter.mjs flattenSteps: t, d). This turns those into a
// per-requirement clip window and the ffmpeg args to cut a short looping webp — the requirement's
// gif face (visual-requirements redesign). Pure; the caller runs ffmpeg (frame-pair fallback when
// it is absent is a separate integration task). Nothing renders this yet.
const bare = id => String(id).slice(String(id).lastIndexOf(':') + 1)

export function clipWindow (steps, id) {
  const want = bare(id)
  for (const s of steps || []) {
    if (String(s.label || '') !== 'proves ' + want && bare(String(s.label || '').replace(/^proves /, '')) !== want) continue
    if (typeof s.t !== 'number') return null
    return { from: s.t, to: s.t + (typeof s.d === 'number' ? s.d : 0) }
  }
  return null
}

export function ffmpegClipArgs (srcRel, { from, to }, outRel) {
  const secs = n => String(Math.round(n) / 1000)
  const dur = Math.max(0.4, (to - from) / 1000)
  return [
    '-y', '-ss', secs(from), '-t', String(dur), '-i', srcRel,
    '-an', '-vf', 'scale=640:-2:flags=lanczos,fps=12', '-loop', '0', outRel
  ]
}
```

- [ ] **Step 4: Run to verify it passes** — `node --test tools/evidence.test.mjs` → PASS (6).
- [ ] **Step 5: Confirm nothing rendered changed** — `npm run test:tools` green; `npm run board:build` succeeds (no importer yet).
- [ ] **Step 6: Commit** — `feat(evidence): per-requirement clip window + ffmpeg cut args (pure)` with the Fable footer; stage only the two files.

### Task 4 (roadmap, integration): capture before/after frames + fold evidence per requirement
`spec/_base.ts` — under `BOARD_RECORD`, screenshot before the `proves` body runs and after it settles, save to the record dir as `<id>-before.png`/`<id>-after.png`. `spec/_results-reporter.mjs` — per requirement, attach `evidence: { frames: [before, after], clip }` (clip from `clipWindow`) into the per-run record's `reqs`, folded, and for **CLI runs too**. Optionally cut the webp via `ffmpegClipArgs` when ffmpeg is present (frame-pair fallback otherwise). Verified by the dogfood board suite staying green; a `tools/evidence.test.mjs` addition asserts the reporter's per-req evidence shape from a synthetic record. Detail at task start.

---

## Roadmap — Plans 3–5 (detail each at its start)

Written concise here; expand to full test-first tasks when reached (several steps must quote code Plan 1 / earlier plans produce).

### Plan 2 — Evidence harvesting (additive; reporter + store, not the board)

**Goal:** each `proves <id>` step carries visual evidence, folded per-requirement, recorded by CLI runs too.
**Files:** `spec/_base.ts` (record a before/after screenshot + start/end timestamp around each `checkReq`), `spec/_results-reporter.mjs` (fold `{ frames: [before, after], clip: {from, to}, run }` into `_results-index.json` per requirement — **folded, never replaced**, and for **CLI runs too**, not board-started only), `tools/spec-store.mjs` (expose it on each req's `tests[]`), a new `tools/evidence.mjs` (pure: given a recording path + `{from,to}`, the ffmpeg args to cut a short animated webp; ffmpeg auto-detected like piper, frame-pair fallback when absent), `tools/evidence.test.mjs` (pure: assert the arg construction + the fold shape).
**Interfaces produced:** `req.tests[i].evidence = { frames: [beforePng, afterPng], clip: { from, to }, run }`; `cutClip(recordingPath, {from,to}) => string[] /* ffmpeg args */`.
**Green gate:** unit tests + `npm run e2e`; the board still ignores `evidence`.
**Traps:** screenshots were board-run-only — this deliberately amends that (evidence is product now); per-case records fold, never replace (blanks every other screen otherwise); the state guard removes files a run created.

### Plan 3 — The board rewrite (THE single `build-board.mjs` touch)

**Goal:** Focus proof panel + Grid (replaces List) + Flow player, status vocabulary in rendering, gate removal, prompt-handoff authoring — matching `scratchpad/mockup/specboard-mockup.html`.
**Order within the plan (each sub-task failing-test-first against `spec/board/test.spec.ts` / `spec/init/test.spec.ts`):**
1. **Switch rendering to `deriveReqStatus`** + the status chips (Passed/Failed/Untested/Not reached). Rewrite the board R-test(s) that assert `proven`/`unproven` wording to the new words — red first.
2. **Grid replaces List** — behavior rows (`parseBehavior`), `+ Add test` + row-expand evidence; the header toggle reads Focus / Grid / Flow.
3. **Focus proof panel** — coverage tags, evidence (gif via Plan 2 / cover-frame / not-reached placeholder), Steps/Logs popups + Run/Run-in-background ⋯ menu, the **proven-by selector** for overlapping coverage (fail-wins aggregate already in Plan 1).
4. **Flow player** — chapters cut at proves-step timestamps, stops at the failing beat.
5. **Gate removal (coordinated):** rewrite `spec/init/test.spec.ts` R3 and `spec/board/test.spec.ts` **R11** (the walkthrough Act 2) to the no-guess model — **red first** — then delete `init` **R3** (requirement), strip from `spec-store.mjs` (`isWaiting`, the `guess` frontmatter parse), `build-board.mjs` (guess chip, `yourTurn`, waiting indices, the "nothing waiting" banner, flow-diagram gate `g1`, **rewrite walkthrough Act 2** to "review the behaviors, run the tests"), and `tools/board/client.js` (waiting handling, the `mine`/`a guess` labels). Repurpose the home banner to drift ("N need a look · X failed · Y changed").
6. **Prompt-handoff authoring UI** — the requirement ⋯ menu (Reword / Add / Remove) and the test ⋯ menu (Edit / Remove / Add), each opening the prompt modal (mockup's `buildPrompt`). Board renders the prompt; it never edits prd.md/tests itself.
**Keep the `new Function()` guard; server needs a fresh plain-node restart for `spec-store.mjs`/`serve-board.mjs` edits.**
**Green gate:** full `npm run e2e` green; remember the one-run lag after editing `board/test.spec.ts`.

### Plan 4 — The `Changed` drift state

**Goal:** a requirement proven before but whose text changed since reads **Changed** (indigo, re-verify).
**Files:** `spec/_base.ts`/reporter records a content hash of the requirement's authored text at the moment a test passes on it; `tools/coverage.mjs` `deriveReqStatus` gains a `changed` branch (pass exists but the stored hash ≠ the current requirement's hash); `tools/spec-store.mjs` passes the current hash in. Unit-tested in `coverage.test.mjs`. Plan 3 already renders `changed` (chip + stale evidence), so this only lights it up.
**Design system:** indigo — freed by the gate removal in Plan 3 — is assigned to `Changed`.

### Plan 5 — Migrate the board's own PRDs + skills + docs

**Goal:** the board's four screens lead with behavior blocks; the method's docs match the no-gate, canon-when-written model.
**Files:** `spec/{board,init,conflicts,dispatch}/prd.md` — add `- **Given/When/Then**` leads (requirement wording — the human's, screen by screen); `skills/kg-init/SKILL.md` + `skills/kg-deep/SKILL.md` (drop "draft for the human's gate" / guess-flag; deep-drafted requirements are canon, editable later; behavior-block authoring), `skills/kg-e2e/SKILL.md` (behavior-row authoring guidance); `CLAUDE.md` (retire "indigo = your turn" → indigo is `Changed`; state the canon-when-written model; drop the `guess:` frontmatter mention); `README.md`; `demo/todo/spec/todo/prd.md` (drop `guess: true`). Then `npm run board:build` + `npm run e2e` green; **release + `kg-update`**, then dojostack.

---

## Self-review (Plan 1)

- **Spec coverage (Plan 1 scope):** behavior-block format → Task 1; status vocabulary (Passed/Failed/Untested/Not reached) → Task 2. `Changed`, evidence, views, gate removal, authoring, migration → Plans 2–5 (roadmap), each mapped in the decomposition table. No Plan-1 gap.
- **Placeholder scan:** Tasks 1–2 carry real code, real commands, real expected output. Roadmap entries are deliberately not tasks (they name files + interfaces, to be expanded at their start) — not placeholder-tasks in an executable plan.
- **Type consistency:** `parseBehavior(body) → {given,when,then}|null` used identically in Task 1 and referenced in Plan 3.1/3.2. `deriveReqStatus(entries) → 'passed'|'failed'|'not-reached'|'untested'` defined in Task 2, consumed in Plan 3.1 and extended (`changed`) in Plan 4 — names match. `aggregateCoverage` shape quoted from the real current `tools/coverage.mjs`.
