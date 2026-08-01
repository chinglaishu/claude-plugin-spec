---
name: kg-deep
description: Use to take ONE screen from a bare row (or no row) to deep, human-accepted requirements proven by a few comprehensive E2E flows. The depth pass of the specboard method — study the real screen, seed deterministic golden data, draft the PRD for the human's gate, then author checkReq-tagged flows with exact-number assertions and safe cross-page round trips. Run it screen by screen, most important screen first; the Init crawl only inventories rows, this is what makes a row TRUE.
---

# kg-deep — one screen, made deep

The crawl gives you the **map**: a row per screen, honestly uncovered. This skill is the
**territory**: it takes one screen to requirements the human has accepted and tests that would fail
if the app stopped honouring them. Depth does not batch — run this per screen, most important first.
Expect a real session per complex screen; that cost is the point, not a defect.

You are staff (kg-staff's rules apply throughout): you do everything, the human owns **meaning**.
The one gate is theirs — accepting the requirements. Never accept on their behalf.

## Phase 0 — Governance: read before you touch

```bash
node tools/staff.mjs <screen>     # what governs it, what is proven, what is waiting
```

- No row yet? Create `spec/<screen>/` yourself — entity-scoped routes (`/thing/[id]/…`) are
  invisible to the crawl, so your most important screens often start here.
- An open contradiction or an unapproved guess from earlier work → stop and ask (kg-staff's three
  stops). Otherwise proceed.

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

## Phase 3 — Draft the PRD → the human's gate

Write `spec/<screen>/prd.md`: one `## R<n>` per requirement, each grounded in what phase 1/2 found,
each annotated with the selector/testid its test will use. Mark the file `guess: true` — it is your
draft of their meaning. **Stop here for the human**: they correct the wording and drop the flag;
that acceptance is the whole gate. Requirement ids are stable forever — later passes append, never
renumber.

## Phase 4 — Flows: few, comprehensive, checkReq-tagged

Coverage is many-to-many at assertion granularity, so write a FEW flow tests that each prove MANY
requirements — the human reviews flows, the board still derives every requirement's state:

```ts
test('Reading the screen — every surface holds its exact golden numbers', async ({ page }) => {
  coverReqs('R2', 'R3', 'R4')            // declared up front → an early failure reads not-reached
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
verdict — plus the honest caveats and the not-covered list. What they accept is canon; what stays
unproven stays visibly unproven. Never silence a red to finish the pass.
