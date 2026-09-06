---
name: kg-deep
description: Use to take ONE screen from a bare row (or no row) to deep, human-owned requirements proven by unit and flow E2E tests. The depth pass of the specboard method — study the real screen, seed deterministic golden data, draft the PRD (canon on write — the human edits or removes it freely, there is no gate), then author checkReq-tagged unit and flow tests with exact-number assertions and safe cross-page round trips. Run it screen by screen, most important screen first; the Init crawl only inventories rows, this is what makes a row TRUE.
---

# kg-deep — one screen, made deep

> **Where the board lives.** THE RULE (the human, 2026-09-05: "we only store things in codebase if it's
> necessary, otherwise find a way to store somewhere else"): a project's board is the folder
> **`specboard/` inside the app repo, COMMITTED — authored files only**: `spec/<screen>/prd.md`,
> `test.spec.ts`, `steps.ts`, `narration.json`, `spec/_conflict-decisions.json`, `spec/_specboard.json`.
> The vendored `tools/`, `board.html` and `node_modules` sit in the same folder, but the folder's own
> `.gitignore` keeps them out (a byte copy of the plugin is not a second thing to commit), and
> `spec/_config.json` stays out too — it is per machine and its sign-in script may carry a credential.
> **Everything a run DERIVES lives in `~/.specboard/<projectId>/`** — the fold, the run log and the raw
> report as rows in `board.db`, and every frame, replica, skeleton, font and video as
> `blobs/<sha256>.<ext>`, gc'd by reference at each fold. Out of every git by location, not by a
> `.gitignore` line. Nothing derived is ever committed anywhere. From the app repo, **`cd specboard`**
> for every command below. (Supersedes the 2026-09-04 whole-folder ignore: that rule existed to keep
> the harvest out of the app repo, and the harvest is no longer there. A project scaffolded before this
> may still have a `/specboard/` line in the app's `.gitignore` — removing it is the owner's call, and
> an update never edits an app repo's ignore file.)
> Two exceptions you may meet: a one-line `.specboard` file naming a board kept elsewhere (cd there
> instead), or an old flat project with `spec/` at the root (stay put). `update.mjs` and `scaffold.mjs`
> find the board themselves either way.

The crawl gives you the **map**: a row per screen, honestly uncovered. This skill is the
**territory**: it takes one screen to requirements the human owns and tests that would fail if the app
stopped honouring them. Depth does not batch — run this per screen, most important first. Expect a real
session per complex screen; that cost is the point, not a defect.

You are staff (kg-staff's rules apply throughout): you do everything, the human owns **meaning**. There
is **no acceptance gate and no guess flag** — a requirement is canon the moment you write it; you draft
it, and the human edits or removes it as freely as a test. Never invent or change what a requirement
means on their behalf; when you draft or change one, **show them**.

## Phase 0 — Governance: read before you touch

```bash
node tools/staff.mjs <screen>     # what governs it, what is proven, what is waiting
```

- No row yet? Create `spec/<screen>/` yourself — entity-scoped routes (`/thing/[id]/…`) are
  invisible to the crawl, so your most important screens often start here.
- An open contradiction the human has not settled → stop and ask (kg-staff's stops). Otherwise proceed.

## Phase 1 — Study: ground the requirements in reality

Read, in this order, whatever exists: the screen's **source** (harvest `data-testid`s, stores, save
paths), any **contract/spec docs**, any **existing tests** (their names are requirement candidates),
and the running screen itself. Write down every write path you find (save, publish, revert,
discard) — phase 4 treats each one as guilty until proven safe.

## Phase 2 — Fixture + golden capture: numbers you can name

A deep test asserts **exact values**, and exact values need deterministic data.

- **Seed a dedicated golden fixture** through the project's own seed lineage (`spec/_seed.ts` or
  `npm run seed:e2e` → the backend's migrations/seeders). Idempotent, stable ids, self-contained
  org/tenant. If a needed state is missing (e.g. a published/locked version to prove a read-only
  surface), extend the seed — as its own guarded, idempotent migration — never fake the state.
- **Capture `golden.json`** by driving the seeded screen once and reading the values off the real
  surfaces (grid APIs, chart series — not rounded on-canvas labels). Re-capture in a second fresh
  browser context; commit only when byte-identical. Record identities too (row ids, unit ids), not
  just values — cross-page tests will need them.

## Phase 3 — Draft the PRD (canon on write, the human steers)

> **A test case is a short film of one promise** — one page state → one user action → facts a camera
> can check. If you cannot film it, you cannot prove it: rewrite the promise until you can. *(The
> human's 2026-09-06 method ruling — `docs/testcase-method-2026-09-06.html`, worked end to end on the
> todolist demo's real R1–R9. Steps 1–2 of that method are this phase; steps 3–4 are kg-e2e.)*

### 3a — Which requirements exist: walk five buckets, in this order

Do not brainstorm. Walk the screen's main noun through five buckets and write **one requirement per
promise**; the todolist demo's own nine fall out of them exactly:

| # | bucket | what to look for | the todolist's |
|---|---|---|---|
| ① | **The main thing's life** | create it, change it, finish it, remove it — the lifecycle of the screen's main noun (there: a task) | R1 add · R2 edit + stamp · R9 delete, reversibly |
| ② | **Every derived number** | anything the app *computes* — counts, rings, roll-ups — proven with exact numbers on the seeded data | R3 ring 1/3→1/4 · R4 roll-up both ways · R5 "To do" counts leaves |
| ③ | **Every view & chip** | each filter/view shows the right rows and its badge agrees; time-derived chips under the frozen clock | R6 views + badges · R7 overdue/today chips |
| ④ | **Survival** | the state that must outlive a reload (or sign-out, or navigation) comes back byte-for-byte | R8 reload |
| ⑤ | **The mistake path** | the user's slip is safe: undo, confirm, nothing lost. Often the best film on the board | R9 undo window |

Bucket ② is where a board earns its keep — five of the todolist's nine read a value the app DERIVES,
the kind that drifts silently when the code changes. A save/delete-only screen teaches nothing.

**The include / exclude test**, applied to every candidate before it gets a card:

- **A requirement earns its card only if deleting the feature would make its test fail.** Styling with
  no behaviour gets no card.
- **One requirement = one promise a user could say aloud.**
- **If two requirements would be proven by the same assertion, they are one requirement.**

### 3b — Write the Given / When → Then

Write `spec/<screen>/prd.md`: one `## R<n>` per requirement, each grounded in what phase 1/2 found,
each annotated with the selector/testid its test will use. **Lead a requirement with a Given / When /
Then behaviour triple when it describes a testable state→action→outcome** — the board renders that
triple as the requirement's shape — and keep prose alone for a principle, where there is no action to
name:

```markdown
## R3 — the cell marks an override, keeping the house-view base
- **Given** edit mode, and a value that differs from the house view
- **When** you edit the value
- **Then** the cell marks an override, and the house-view base is kept

<the authored prose follows, one click away in the reader>
```

How it usually gets written — and why every line of it is unprovable:

```markdown
- **Given** a task            ← which one? not reproducible
- **When** you edit it        ← no hand could film that. What is pressed?
- **Then** it updates correctly   ← not a fact. A camera cannot check "correctly"
```

Nothing there can fail *specifically*, so nothing is proven. The todolist's real R2 is the shape to
copy: **Given** a task row stamped "added" · **When** you double-click its title, retype it and press
Enter · **Then** the same row reads the new text in place and its stamp flips to "edited just now".
Six rules make the difference:

1. **Exact words, exact numbers.** "its stamp flips to *edited just now*", "the ring reads *1/4*" —
   never "updates", never "correctly", never "as expected". The Then's words are what the board's
   EXPECTED chip carries verbatim, so a vague Then has nothing to print.
2. **Every noun in a Then must be visible on screen.** If a Then names something no screen shows,
   either surface it in the UI or let the test declare the gap (`intentGap`) — a **visible debt,
   never a quiet pass**. A Then no camera can reach is a requirement you cannot prove.
3. **Say absences out loud.** R3's Then ends "…**and the parent still has no checkbox**"; R4's says
   "**nobody ticked the parent**". An absence is a claim like any other and the board films it in
   plain words — but only if someone wrote it. **Reject a Then that leaves its absences implicit**
   ("only that view's tasks show" hides "no done task appears in Active").
4. **One When = one action.** Two actions are two beats: R4 carries two When→Then beats (tick, then
   untick) and each is its own film. A When that lists four clicks is four requirements wearing one
   card, or one requirement whose film no reader can follow.
5. **The Given comes from the golden seed, under the frozen clock** (phase 2). R5's "seven open
   leaves" and R7's "due two days ago" only mean anything because the seed never moves — name the
   exact state, never "some tasks, some done".
6. **Count the trap, not just the happy number.** R5's best line is "To do reads 4 — **down by two,
   not three**: the container is never a unit of work". Name the wrong answer the design forbids,
   where naming it teaches.

**Where this bites, and it is on purpose.** Exact numbers are brittle: change the seed and half the
Thens go red. That is the design — the seed is golden and frozen — but it makes **a seed change a
requirement change**, to be treated with the same care (and the same stop-and-ask) as editing a Then.

**Families (board R17).** Once a screen carries more than a handful of requirements, group them
under `### <n> · <family> — <gloss>` lines placed *between* `## R<n>` sections: a heading opens a
family that owns every requirement that follows it until the next heading, so move whole sections
under their family rather than renumbering anything. `###` is therefore RESERVED for family lines: a
`###` inside a requirement's body would open a family there, so use `####` or bold for sub-headings
within a body. Families are structure, not meaning — a
requirement's id, text and proof are untouched by where it sits, a family carries no state of its own
(its marks are its requirements' marks), and a prd with no headings renders exactly as before. Name a
family by what the requirements *share* ("Containers and roll-up", "Persistence"), number them in
reading order, and keep the gloss to a few words; three to five requirements per family is the
natural size. A family grouping is a meaning decision too — the human signs the family names and
which ids sit under each, like any other requirement text.

There is **no flag and no acceptance step** — the requirement is canon the moment you write it, so
rebuild and **show the human**: they correct wording, edit, or remove any requirement as freely as a
test, because the meaning is theirs. Requirement ids are stable forever — later passes append, never
renumber.

## Phase 4 — Tests: unit and flow, checkReq-tagged

**Every exact value a flow asserts must be VISIBLE in the recording** (kg-e2e rule 5). A deep test's
whole point is a video a human can trust, so do not read a number off a grid API and assert it while
the recording shows only a summary or an average — bring the real UI showing that value on screen
(switch Summary→Details, scroll/reveal the cell), read it OFF the visible cell, and hold, walking each
item (year by year, row by row). `proveVisible(locator, expected, label)` from `_base` does it in one
call. The API read is for PRECISION behind the on-screen proof, never a substitute for it. And the
ACTION itself, not only its number: a When that deletes, ticks or moves something rings that thing
before acting and the place it changed after — never only the counter (the human, 2026-09-02; kg-e2e's
watchable-beat rule). Finishing check: with the sound off, can you SEE every number the flow claims,
and every action it says it took?

**Every fact of a Then is a soft claim** (kg-e2e rule 6). The lint cuts the Then at every seam
(` — `, `; `, `, and `, ` and `, `, `) whose two sides each carry three words or more — "the row
stays listed" and "the count reads 4" are two facts, and so are the halves of any comma that reads
that way; only a short apposition ("a name, route, or requirement") stays inside one fact. Give each
fact its own
`proveVisible(target, expected, label, { soft: true })`, so the beat photographs all of them and
fails once at its end with the whole list. `npm run proof lint` refuses a Then fact no claim covers,
so run it before you call a screen done. A fact that names a thing that is NOT THERE is claimed like any other —
`proveVisible(locator, MISSING, label, { soft: true })` passes exactly while the thing is gone, and
claiming a neighbour's positive fact instead is a green you wrote yourself. A fact with no screen
surface at all (an API-only beat, a geometry, what the CLI gate refuses, a fragment naming no thing)
is DECLARED in the beat with `intentGap('<why>')`, which the lint prints as a visible debt rather
than a pass — one declaration per fact, unless the beat opens NO PAGE at all (the lint reads that off
the block's own source — `page.`, `locator(`, `getBy…`, `proveVisible(`, `reveal(`, `click(` — never
from "it made no claims", which an author satisfies by writing none: `declared-on-an-open-page`).
Where a requirement is proven by several blocks, the row is scored on the LAST one in source order —
the block whose harvest lands on it. Never invent a claim, and never reword the Then to fit the test
(the human owns meaning).

**Author each unit beat as an exported step function** in `spec/<screen>/steps.ts` (fn · proves ·
name · needs/gives) with its `checkReq` kept around the call — kg-e2e's beat-function convention —
so the board's composer can chain it into a flow with no model involved.

Coverage is many-to-many at assertion granularity, and tests come in two kinds, both first-class
(board R6, amended 2026-08-17 — this previously said "a FEW flows that each prove MANY"): **unit**
tests prove this screen's own behaviours — each state that matters, each action's outcome — and
**flow** tests cross screens along a chosen path. The human reviews tests, the board still derives
every requirement's state:

```ts
test('Reading the screen — every surface holds its exact golden numbers', async ({ page }) => {
  await coverReqs('R2', 'R3', 'R4')      // declared up front → an early failure reads not-reached
  …
  await checkReq('R3', async () => { /* an assertion that fails without R3 */ })
})
```

The shape that works — four flows, in this order:

1. **Read flow** — every surface renders its exact golden values; cross-page READ consistency
   (another page showing the same source field must show the same number).
2. **Modelling flow** — drive the primary lever end-to-end in one session: edit → in-cell effect →
   staleness gate → run/recompute → **exact before → after numbers** → revert discards. All
   in-memory; nothing persisted.
3. **Versions/permissions flow** — locked/read-only surfaces refuse what the editable surface
   allows (pair the probes: the same editor-open probe that SUCCEEDS on the draft must be REFUSED
   on the locked version — a refusal alone can be vacuous).
4. **Round-trip write flow — ALWAYS LAST.** The only test that persists. Edit → run → **check the
   projected numbers** → save → verify on the other page → then write BACK to baseline through the
   other page's own editor and verify on the first page. The reverse leg is simultaneously the
   reverse-direction proof and the fixture restore: **the flow ends at baseline by construction.**
  Open it with a **self-healing guard**: if a crashed prior run left the mutated value, restore via
  the same editor first; any OTHER value fails loudly as unknown state.

Hard-won rules — each of these cost a real afternoon somewhere:

- **Discovery before any write.** Run every save/publish path once in a throwaway probe and inspect
  what it really persists *before* asserting around it. Saves can re-materialise server state that
  no source-row delete reverses — if a write cannot be undone through the app's own paths, do NOT
  ship a test that performs it; cover the read side and document the gap in the PRD honestly.
- **Prefer a throwaway entity** (a new draft/scenario you create and delete) over mutating the
  golden fixture, whenever the feature offers one.
- **Real user paths only for edits that must register**: grids track dblclick→type→Enter through
  their editor; a programmatic `setDataValue` can move data while leaving Save disabled. Editable
  cells may live on collapsed column groups, virtualised out of the viewport, or on a parent row —
  scroll and expand before reaching for the cell.
- **Exactness or nothing**: `toEqual(golden.…)` on metrics, per-year series compared value by
  value. "There are rows" proves nothing (kg-e2e's rules all apply here).
- Watch each NEW behaviour's assertion fail before making it pass; a characterization assertion
  must still be one that would fail if the behaviour were removed.

## Phase 5 — Settle + review

Run the screen via the board (its port, never specboard's own 4173) so results fold and recordings
land. Then close the loop and REPORT:

```bash
node tools/staff.mjs <screen>     # every requirement must read proven (or honestly unproven, with why)
node tools/staff.mjs --stale      # clear every item your work caused
```

Present the human a review table — requirement · flow that proves it · what the assertion pins ·
verdict — plus the honest caveats and the not-covered list. The requirements are already canon (you
wrote them); the human edits or removes any that read wrong. What stays unproven stays visibly
unproven. Never silence a red to finish the pass.
