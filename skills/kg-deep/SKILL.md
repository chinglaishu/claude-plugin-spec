---
name: kg-deep
description: Use to take ONE screen from a bare row (or no row) to deep, human-owned requirements proven by unit and flow E2E tests. The depth pass of the specboard method — study the real screen, seed deterministic golden data, draft the PRD (canon on write — the human edits or removes it freely, there is no gate), then author checkReq-tagged unit and flow tests with exact-number assertions and safe cross-page round trips. Run it screen by screen, most important screen first; the Init crawl only inventories rows, this is what makes a row TRUE.
---

# kg-deep — one screen, made deep

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
