# Two modes: document an existing app, or design a new one

**Date:** 2026-07-27
**Status:** approved (design), pending spec review

## The problem

The board's model is greenfield-shaped: it assumes you draw a wireframe and then build to it.
Confirm in `readScreen` — with no `draft.html`, both the screen and E2E columns report `waiting`, so
the board *forces* a wireframe before a screen can have a screenshot or a test. For an existing,
finished app that is circular busywork: the screen already exists, so wireframing it and then
"building" it proves nothing. The crawl already captures the real screenshot, but it is parked in
`crawl.png` and never counts as column 3.

## The two modes

**Mode is per-screen, signalled by whether a `draft.html` exists.** No global flag. But a *no-draft*
screen that has not been populated yet must still behave exactly as greenfield does today — so the
distinction is three-way, not two:

| Cell | Design mode — has `draft.html` | Document mode — no draft, **populated** (has a test/shot) | Greenfield — no draft, **empty** |
|---|---|---|---|
| 1 · PRD | `ok` (or a guess) | `ok`, or a **guess** with an Accept action | `ok` / `missing` |
| 2 · Draft | the wireframe + **Gate A** | *"existing screen · no wireframe · Add a wireframe to redesign"* — non-blocking | `missing` |
| 3 · Screen | screenshot + **Gate B** | **`current`** — the shot, proven by the test; no gate | `waiting` |
| 4 · E2E | pass / fail / ranstale / unrun | same (normal) | `waiting` |

"Populated" = the screen has a `test.spec.ts` or a `screen.png`. A no-draft screen with neither is
greenfield and reads as it does today (`draft: missing`, `screen: waiting`, `e2e: waiting`). This is
the single rule that keeps *"a greenfield screen behaves exactly as before"* true while *"no draft no
longer forces waiting"* becomes true for a populated one.

### Design mode — unchanged

PRD → the user creates a wireframe → builds the screen → writes the E2E test. **Gate A** =
draft-vs-PRD ("is this what I meant?"). **Gate B** = screen-vs-draft ("did you build it?"). Every
existing state, pin and test stays exactly as it is.

### Document mode — new

An existing/finished screen, "keep it maintainable." Populated directly by `kg-init` from a crawl: a
guessed PRD, the screen as it looks now (column 3), and an E2E test that proves the PRD (column 4).

- **No hash-pinning gate on the PRD.** This is the CEO's "no gate": document mode does *not* get
  design-mode's Gate A staleness apparatus (no `prdApprovedAgainst…` pin that goes stale when the PRD
  moves). The PRD is the source of truth as soon as it stops being a guess.
- **The only human action is Accept.** A crawled PRD starts `guess: true`. The document-mode verdict
  bar offers one button — **"Accept these requirements"** — which strips the `guess: true` line from
  `prd.md` and nothing else. No pin, no staleness. This is the CEO's Q2 choice ("approve auto-strips
  guess"). Editing the line out by hand still works, exactly as today; Accept is the one-click path.
- **No Gate B, ever.** There is no wireframe to compare a build against, so column 3 carries no status
  of its own — its truth *is* the passing test in column 4. It renders the current shot under a
  neutral `current` chip.
- **Maintenance needs no new machinery.** Editing `prd.md` bumps its mtime, and the existing
  `ranBeforeEdit` logic (`run.ranAt < newestSource(dir)`, and `newestSource` already includes
  `prd.md`) flips column 4 to `ranstale` — *"passed, then you edited — run it again."* Correcting the
  guessed PRD to say behaviour should differ, then re-running, makes a real failure a real bug
  surfaced. That is the point.

### Flipping between modes

Adding a `draft.html` to a document-mode screen flips it to design mode: `hasDraft` becomes true, so
the screen/E2E cells switch to design-mode logic, Gate A appears (draft-vs-PRD), and the existing
screenshot becomes the artifact Gate B judges against the new design. The board offers an **"Add a
wireframe to redesign"** affordance on document-mode rows to start this. Removing the draft would flip
it back — no special handling needed, the mode is always derived.

## The invariant: column 3 is always a test byproduct

Document mode does **not** copy `crawl.png` to `screen.png`. `crawl.png` stays evidence, shown only in
the Init found-table and used to author the PRD/test. `screen.png` is produced by the authored test,
in both modes, so columns 3 and 4 are always born together.

## Component changes

### 1. `tools/spec-store.mjs` — `readScreen`

The cell state machine, reshaped for three cases. Design-mode branches are byte-for-byte what they are
today; only the `!hasDraft` branches change.

```
const populated = hasTest || hasShot   // document mode vs greenfield, among no-draft screens

screen =
  hasDraft
    ? (!hasShot ? 'missing' : !state.screenApprovedAgainstDraft ? 'review'
        : state.screenApprovedAgainstDraft !== draftHash ? 'stale' : 'ok')   // design — unchanged
    : hasShot ? 'current'                                                     // document
      : 'waiting'                                                             // greenfield — unchanged

e2e =
  !hasTest ? (hasDraft || populated ? 'missing' : 'waiting')                  // (see note)
    : !run ? 'unrun' : run.failed ? 'fail' : ranBeforeEdit ? 'ranstale' : 'pass'
```

Note on E2E: today design mode reads `!hasDraft ? 'waiting' : !hasTest ? 'missing' : …`. Since a
design-mode screen always has a draft, dropping the guard changes nothing there. A greenfield screen
(no draft, no test, no shot) still reads `waiting`. A document-mode screen with a test reads the normal
run states.

`draft` cell gains a document-mode value (call it **`nodraft`**) for the non-blocking "existing screen
· no wireframe" state, returned when `!hasDraft && populated`. Greenfield keeps `missing`.

`isWaiting` needs no change in spirit: a guess is still waiting-on-you; `current` and `nodraft` are not
in `['review','stale']`, so an accepted document-mode screen is correctly *not* waiting. Verify this
holds and adjust only if a case leaks through.

### 2. `tools/serve-board.mjs` — `applyGate`

- **Gate B applies only when a wireframe exists.** `gate === 'screen'` is refused with a clear error
  when `!hasDraft` — there is nothing to compare a build against.
- **New `gate === 'prd'`, `act === 'accept'`** — strips the `guess:` line from `spec/<screen>/prd.md`
  and rebuilds. This is the *only* place the server touches a `prd.md`, and it touches *only* the
  frontmatter flag, never a requirement's prose (requirement meaning stays the CEO's). Reject the
  action if the screen has no `guess`.
- Design-mode `gate === 'draft'` and `gate === 'screen'` are unchanged.

Pins continue to follow the existing hash-staleness pattern for design mode; document mode adds no
pins.

### 3. `tools/build-board.mjs` — render both modes

- Document-mode row: column 2 shows *"existing screen · no wireframe · Add a wireframe to redesign"*
  (an affordance that scaffolds a `draft.html`, flipping the screen to design mode). Column 3 shows the
  shot under a `current` chip, no Gate B bar. The verdict bar shows **Accept these requirements** when
  the PRD is a guess, and nothing (or a quiet "requirements accepted — edit the PRD to change
  behaviour") once accepted.
- `CHIP` map gains `nodraft` and `current` entries (each with a mark, per the design system — hue
  never carries state alone).
- Design-mode rows are unchanged.
- **Wireframe-column toggle:** column 2 is shown by default; a header control hides/shows it
  board-wide; the choice persists in `localStorage`. Pure presentation — hiding the column changes no
  state and no cell derivation.

### 4. `kg-init` brownfield flow — `serve-board.mjs` crawl job

The crawl job gains two phases after the existing two, so a crawled row lands as PRD(guess) + current
screen + passing test, wireframe empty:

1. browser crawl → `crawl.png` per route *(exists)*
2. Claude drafts a guessed `prd.md` per new route *(exists)*
3. **new:** Claude authors a `test.spec.ts` per new route (using the `kg-e2e` skill) that navigates the
   real route on the configured app, asserts the guessed PRD, and shoots `screen.png`
4. **new:** run those new screens' tests, folding results into `_results-index.json`

Modelled on the existing drafter phase: a detached, cancellable Claude job, outside the deterministic
suite, that names an expired login rather than failing silently. The characterization test locks in
current behaviour as the baseline; the guessed PRD gives it meaning.

### 5. `skills/kg-e2e/SKILL.md` — reconstructed

Authors a `test.spec.ts` against an approved (or guessed, for brownfield) requirement, **failing-first**,
wired so `screen.png` is the test's byproduct (`page.screenshot({ path: 'spec/<screen>/screen.png' })`).
Used by brownfield `kg-init` and standalone. Reconstructed for *this* board's model (PRD blocks +
`spec/<screen>/` layout + the design-vs-document distinction), not v1's.

### 6. `skills/kg-init/SKILL.md` — both flows

Describe: existing app → document mode (crawl → PRD + screen + test, no wireframe); new project →
design mode (PRD → wireframe → build → test); and how adding a wireframe redesigns an existing screen.
Correct in place, with the reason attached, anything the two-mode model makes false.

## Testing strategy

Every new behaviour gets a **failing-first** test in a `spec/<screen>/test.spec.ts`, watched red before
the code.

- **State machine (both modes):** a test constructs a *temporary* document-mode fixture screen under
  `spec/` (a PRD + a `screen.png` + a `test.spec.ts`, no draft), rebuilds the board, and asserts
  `readScreen`'s cells (`draft: nodraft`, `screen: current`, not `waiting`, verdict bar = Accept) and
  the rendered row. The state guard removes any directory that did not exist before the run, so the
  fixture leaves nothing behind.
- **Flip to design mode:** the same fixture, with a `draft.html` added, asserts Gate A + Gate B appear
  and the existing gate tests still pass.
- **Greenfield unchanged:** asserted against a no-draft/no-test fixture (and the existing screens,
  which are all design mode).
- **`applyGate`:** a test drives `gate: 'prd', act: 'accept'` and asserts `guess: true` is gone and no
  pin was written; and that `gate: 'screen'` is refused when there is no draft.

`npm run e2e` must be green three times from a dirty state. The board's own six screens stay
`ok/ok/ok/pass`; any requirement the mode change legitimately re-states is corrected in its `prd.md`
in place with the reason, and its meaning re-approved by the CEO.

## Out of scope

No enforcing hook. No change to design-system tokens. No unrelated features.

## Constraints carried from CLAUDE.md

Staff, not CEO: new/changed/deleted requirements and picking a conflict's canonical side are the CEO's
— propose, don't decide. Failing test first; never weaken/skip/delete a test to go green; never fake a
green (unbuilt columns stay honestly empty); never approve a gate on the CEO's behalf. Column 3 stays a
test byproduct. Stage files explicitly, never `git add -A`. Do not push. Commit messages end
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
