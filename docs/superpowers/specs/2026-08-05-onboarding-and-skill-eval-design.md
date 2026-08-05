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

---

# Revision 2 — the guided walkthrough (2026-08-05, after user feedback + reference research)

## Why revised

The human tried the shipped Design A (problem-first chapter on `#howitworks`) and Design B (the derived
getting-started rail) and reported both "help nothing": neither presents **problem → solution → user
flow** to a zero-context user in an easy-to-follow way. A reference page explains mechanics you only
value *after* you understand the tool; a checklist rail lists clicks you only value *after* you've
bought in. Both are backwards for onboarding.

## What the reference research found (3 parallel digests, all fetched real pages)

`research-methods.md`, `research-flows.md`, `research-problem.md` in the SDD workspace. The three
converge on one principle:

> **specboard's thesis is "you can see the proof." So the onboarding must *be* a proof you can see —
> not a description of one.** The same show-don't-tell grammar works at every level: the problem (a
> green test beside a wrong screen — Kent C. Dodds), the idea (a card that looks proven beside the same
> card computed as drifted — Turborepo before/after, mabl inversion), the flow (an exact number
> rendered on a chart, held, then mirrored on another page with a checkmark — Playwright Trace Viewer,
> Learn Git Branching).

Delivery pattern shared by every strong flow-explainer: **one self-contained page, click-to-advance
(never scroll-jacked, never auto-playing — matches the "never auto-advance after a verdict" rule), one
sticky panel, one value highlighted per step.** Opening shape from Stripe's idempotency post (feel the
pain → taxonomy of fake greens → name the concept only once wanted → worked example → real code),
first sentence in the reader's own voice (Shape Up).

## Decisions (the human, 2026-08-05)

- **Scope = replace both.** The walkthrough becomes the `#howitworks` landing. The five method
  flowcharts (`HOW_FLOWS`) demote to a collapsed "full method" reference reached at the end. The
  six-step home rail (`#jrail`/`#jchip`) is **cut**; its one useful job (your next concrete action)
  becomes the walkthrough's closing CTA.
- **Demo = interactive, market-rent illustration.** Click-to-advance with real client JS; Act 3 is a
  clearly-labeled **illustration** using the real golden numbers from a real project (dojostack
  asset-plan), because specboard's own four screens are meta UI. Honest per authored-vs-measured: it is
  labeled teaching content, never dressed as live board state.

## The four acts

1. **Feel it** — 3–4 symptom lines in the reader's voice ("You fix the bug. Two features later, it's
   back."), then one falsifiable proof: a green assertion beside the screen showing the wrong value.
2. **Get it** — "Don't write tests — prove requirements." One before/after: a card as a trusted stored
   flag vs computed live as drifted. **"drift, computed never stored" is named here, once, on first
   use.** (The old "reading a test" anatomy folds in here and in Act 3.)
3. **See it work** — the golden-number demo, click-to-advance, one sticky mock panel: change market
   rent 100 → 200 psf → Run → chart prints IY1 2,400,000 … IY5 2,671,006.87 directly on the marks and
   holds them pinned → Save → Tenancy schedule shows 200, checkmarked against Page A (two panels
   becoming one picture). Illustration banner names the source project.
4. **Do it on your app** — the flow as verb-phrase steps (kg-init → kg-deep per screen → you confirm
   the meaning → tests prove it), the five flowcharts as a collapsed "full method" below, and the single
   derived next-action (`/kg-deep <screen>`, from `journey()`) as the closing CTA.

## Architecture (lowest-risk interactive build)

Follow the existing `HOW_FLOWS` precedent — **bake the heavy content, keep the client JS tiny**:

- A module-level `WALKTHROUGH` data structure (acts → steps) in `tools/build-board.mjs`, rendered to
  **static stacked DOM at build time** (every step's markup baked, one `data-act`/`data-step` per node).
- A small client controller (~15 lines) shows one step at a time and advances on Next/Prev + arrow keys;
  a reached numeric state gets a visible **pinned** affordance and **never auto-advances**. All emitted
  strings stay backtick-free with `\\n` escapes; `build()`'s `new Function()` guard must keep passing
  (it bit three times this session — twice inside CSS comments in the emitted literal).
- `journey.mjs` (derivation), its skeleton vendoring, and the multi-line import guard **survive** from
  the paused rail work; only the rail *UI* is removed. `journey()` feeds Act 4's CTA.
- The current `#howitworks` overview/flowchart pages are **re-sequenced, not deleted** — reachable as
  the collapsed "full method" reference.

## Requirements (both remain `guess:` — the human's wording gate)

- **R11 revised** — from "the guide opens with the problem" to "the guide is a four-act walkthrough
  (feel it → get it → see it work → do it), click-to-advance, that demonstrates the proof rather than
  describing it; Act 3 is a labeled illustration asserting exact golden values held on screen and
  mirrored across a page."
- **R12 repurposed** — from "a six-step getting-started rail" to "the guide ends with the single derived
  next action (`journey()`), so a returning user gets their next concrete step without a stored
  checklist." The rail UI is gone; the derivation remains.

Tests assert **behaviour/content, not phrasing** (rule 2), so the human can reword freely at the gate.

## Superseded / cut

- Design A's standalone story chapter + anatomy sections → folded into the walkthrough Acts.
- Design B's six-step rail UI (`#jrail`, `#jchip`) → removed; next-action absorbed into Act 4.
- Nothing from Design C (proof-integrity + escape log, Tasks 2–3, already committed) changes.

## Build order

1. Walkthrough data + static baked DOM (all four acts stacked), routed as the `#howitworks` landing;
   five flowcharts demoted to collapsed reference. Test-first (R11 revised). Fold in Design A's content.
2. The client stepper controller (Next/Prev/arrows, pinned, no auto-advance), Playwright-driven.
3. Cut the rail UI; repurpose R12 to the derived closing CTA fed by `journey()`; update the board's own
   R12 test.
4. Human wording-gate on R11/R12; then release 0.21.0 + `kg-update` downstream + restart vendored boards.

---

# Revision 3 — the manager/staff story rebuild (2026-08-05, staged)

The human wants the walkthrough rebuilt around a real-world frame that is ALREADY the product's own
doctrine ("You are staff. The human decides meaning."): **the human is a manager; the AI is a
brilliant, fast staff member with no memory who says "done!" without evidence.** The tool is a
management system: it makes staff's work reviewable-by-watching, and gives staff a written
discipline so wrongness is structurally hard.

**Shape:** two situations, the SAME three moments each — assigning work, reviewing, two weeks later —
first without the tool (unreviewable work, blind trust, the same bug back a third time, closing on a
green assertion beside the screen it fails to prove), then with it (a written requirement you
confirm; work arriving as a recording with every asserted number visible; drift flipping the
requirement to unproven the moment a proof stops holding). The mirror is the argument. Analogy
carries the voice; every beat still cashes out in a concrete artifact (rule: if a beat cannot point
at a real artifact, cut it). Board copy says "you / the human / manager" — never the swept title.

**Staged delivery (human checkpoint after every stage; each stage = one revertable commit):**
1. Acts 1–2 become Without/With, static; Acts 3–4 untouched; R11 redrafted (guess stays).
2. Acts 3–4 re-voiced into the frame + size contract + done/current/remaining progress tracker.
3. The live drift beat in "With": delete-the-assertion → chip flips → THEN "computed, never stored".
4. (Optional) the named Write→Tag→Run→Fold→Derive spine + "harder cases" (not-reached, many-to-many).

Stages 2–4 are detailed just-in-time after the prior checkpoint passes — deliberately, so no
planning is sunk into stages the human may cancel.
