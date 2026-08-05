# Onboarding & skill-eval design — 2026-08-05

## Problem

Two gaps keep specboard from being useful to a zero-context user:

1. **Nothing presents the problem it solves, and nothing guides the first session.** The
   `#howitworks` page starts at the solution (spine, lanes, five flowcharts). A user who has never
   felt "fix one bug, another returns / last week's feature quietly broke" has no reason to care,
   and a static reference page can never answer *what do I do now, in my project*. Nothing teaches
   how to visually read a test (beats, marks, the recording, coverage tags).
2. **No way to know whether the agent skills work.** kg-deep and kg-staff produce artifacts and
   discipline, but there is no measurement of whether the proofs they author are real or whether
   the discipline is followed.

## Decisions (the human, 2026-08-05)

- Onboarding: **both surfaces, story first** — the guide page carries the story; the board home
  carries the next action.
- Evals: **proof integrity + escape log now**; the trap benchmark is phase 2.

## Design A — the guide page opens with the problem

A new first chapter on `#howitworks`, baked at build time like everything else there
(`tools/build-board.mjs`, WORKFLOW-style data + renderers):

- **Four beats**: *the loop* (fix one bug, another returns) → *why* (nobody knows the code anymore;
  AI-slop tests prove nothing — one-button tests, assertions no human can see) → *a real test*
  (exact golden numbers, visible on screen, checked across pages) → *the fix* (requirements ↔ proof,
  kept in sync by the change discipline on every change, so drift shows the moment it happens).
- **One worked storyboard** — the market-rent example, four frames with mono values:
  golden change (unit 33A, 100 → 200 psf) → run (chart asserts IY1–IY5 exactly, e.g.
  IY1 2,400,000) → save (held on screen so a person can watch it) → cross-page (tenancy schedule
  shows 200 psf). Caption: *every asserted value must be visible in the recording*.
- **A "reading a test" chapter**: an annotated anatomy of the two-column detail — the requirement
  chip states (proven / unproven, and not-reached on a flow that stopped early — board R4), the
  test's named beats and their marks, the recording, and the coverage tags (many-to-many, neutral,
  indigo only on hover — board R5).
- The existing intro / spine / lanes / skill flowcharts stay below, gaining only section anchors so
  the rail (Design B) can deep-link "why this step?".

**Failure mode designed against:** the chapter bloating into marketing prose. It is capped at four
beats plus one storyboard; anything longer goes in prose *outside* the tool, or nowhere.

## Design B — a derived getting-started rail on the board home

A rail at the top of home. Every state is **derived from the tree on every build — never stored**
(the same law as everything else on the board):

| # | Step | Derived from |
|---|------|--------------|
| 1 | Install the board | trivially true when the board is serving |
| 2 | Point it at your app | `spec/_config.json` carries the app command/URL |
| 3 | Crawl the app | ≥ 1 screen row exists (`crawl.png` / screen dirs) |
| 4 | Deepen one screen | ≥ 1 `prd.md` exists |
| 5 | Confirm the draft | ≥ 1 `prd.md` **without** `guess: true` — dropping the flag *is* the acceptance (init R3); there is no other gate (board R8) |
| 6 | Watch the proof | ≥ 1 requirement proven (from `_results-index.json`) |

- **Current step** = the first incomplete one. A later step whose fact already holds shows done
  regardless (the rail is a map, not a turnstile — a project that skipped the crawl is not blocked).
- The current step shows the one next action: a copyable command (`/kg-deep <screen>`) or the button
  that does it (Set up, Crawl, Run), plus "why this step?" linking to the Design A anchor.
- The rail **folds to a top-bar chip once step 6 holds**; the chip reopens it. This is the answer to
  "clutter for a settled board".
- **Requirement semantics**: this is new behaviour on the board screen — new REQ text drafted for
  the human's confirmation (rule 5), never confirmed on their behalf.
- **Test-first** (rule 1): `spec/board/test.spec.ts` gains checkReq-tagged assertions — fixture
  tree states → expected step states and current step; folded state when a proven requirement
  exists. Watch them go red first.

**Failure modes designed against:** stored step state rots into lies (everything derived); wrong
"current" when steps are skipped (later-done facts still show done); noise when done (folds away).

## Design C — skill evals: proof integrity + escape log now, trap benchmark next

### Layer 1 — proof integrity (mechanical, now)

A vendored tool (`tools/proof-integrity.mjs`, added to `_skeleton`), two checks:

- **Assertion lint**: every `checkReq` body must assert a *value*; flag existence-only proofs
  (`toBeVisible`/`toBeAttached` with no value expectation). Pure function, unit-tested in
  `npm run test:tools`.
- **Golden perturbation**: copy the screen's golden data, perturb every numeric value (+1 / ×1.01),
  run that screen's spec on a scratch port, then demand red. v1 is honest about precision:
  perturbation is **screen-level**, the report is **per proves-step** — a `proves <id>` step that
  still passes under perturbation *and* contains numeric assertions is reported suspect for review.
  No per-field attribution in v1. Everything restored afterwards (state-guard pattern); never
  against a live board port; sampled / nightly, never per-commit (each batch costs a suite run).

Metric: **% of proven requirements that fail honestly under perturbation.** A fake green cannot
survive this — it is rule 2, made mechanical.

Verification: on real data (dojostack), not clean stubs, before release.

### Layer 2 — escape log (a discipline, now)

- `spec/_escapes.md` — an **authored** log (a human observed it; it is not derivable): date ·
  screen · what broke · which requirement should have caught it · the assertion strengthened ·
  which skill file got the lesson.
- The discipline goes into `kg-staff` SKILL.md's close-the-loop section: *a bug found while the
  board was green is an escape — log it, strengthen the assertion, bake the lesson into the skill.*
- Metric: escapes per week, trending down.

### Layer 3 — trap benchmark (phase 2, separate spec)

A small fixture app with seeded traps (occluded element, silent-fail save, off-screen value);
run kg-deep cold and score PRD coverage against a frozen golden PRD plus trap catch-rate when each
trap is flipped. Scripted kg-staff scenarios for the three stop cases, with change-order verified
from git history and the run journal. Not designed further here.

**Failure modes designed against:** perturbation cost (sampled, nightly); LLM-judge noise (no judge
in v1 — mechanical layers first; the judge appears only in phase 2, scored against a frozen golden).

## Out of scope

- Coach-mark overlays on the live board — annoying and hard to test; the anatomy chapter teaches
  reading instead.
- Stored onboarding state of any kind.
- LLM-judge scoring of PRD quality in v1.
- The trap benchmark build (phase 2).

## Doc drift noticed (to fix in place, rule 6)

`CLAUDE.md` still describes the removed acceptance gate — the accept pin (`state.json` /
`approvedPrdText`), the **reworded** state, "one human gate: accept the requirements". Board R4/R8
narrowed all of this on 2026-07-30: no gate, proven/unproven only, a drafted PRD's `guess` flag is
the one thing waiting on a person. Correct `CLAUDE.md` with the reason attached as part of this
work — flagged here because it is the human's top-level doc.

## Build order

1. Design A: story chapter + reading-a-test anatomy (static bake; `board:build` only).
2. `CLAUDE.md` gate-model correction, reason attached.
3. Design B: REQ drafts → human confirms wording → failing tests → derive + render → green.
4. Layer 1 tool, test-first (unit tests for the lint and the perturbation planner), then verified
   on dojostack's real data.
5. Layer 2: `spec/_escapes.md` + the kg-staff skill addition.
6. Release, then `kg-update` downstream and restart the vendored boards (standing rules).
