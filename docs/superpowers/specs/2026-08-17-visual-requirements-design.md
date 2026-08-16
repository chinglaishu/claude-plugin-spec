# Visual requirements — behavior grid, harvested gif evidence, unit/flow views

**Date:** 2026-08-17 · **Status:** design agreed with the human, awaiting spec review
**Mockup:** scratchpad `mockup/specboard-mockup.html` (served on :4317) — Tsumiki-based, all three
views functional; the mockup is the visual contract for this spec.

## Problem

Requirements render as prose walls nobody reads (board R3's collapse is an admission, not a fix).
The human's direction: requirements should be *seen* — the same way the app shows them — and tests
split into unit and flow kinds, reviewed visually.

## Decisions already made (the human's, logged)

1. **No live components in the board.** Embedding the host app's components (ag-grid etc.) to
   demonstrate behavior is stored drift and re-imports the deleted wireframe (R7). Evidence is
   **harvested from real runs** instead. *(Agreed 2026-08-17.)*
2. **R6 amended (commit 9fa2c57):** unit and flow tests are both first-class. Unit proves one
   screen/component displaying and acting right; flow crosses screens along a chosen path and reads
   as the units it connects. The tag+assertion guard is unchanged.
3. **Flows are authored, never runtime-composed** — a board-side flow composer would be a test
   generator and fights the deterministic suite and the single job slot.
4. **Requirements get a shape:** (Given state, When action, Then outcome) — the "behavior row". The
   authored prose stays as the requirement's body, one click away. A row exists **only where an
   assertion could fail** — no rows for no-ops or navigation; that rule bounds the grid.
5. **Flow view is a player, not a node map** — the flow's recording cut into chapters at
   proves-step timestamps; playhead stops where the flow stopped; auto-play on by default with a
   manual toggle. *(Agreed 2026-08-17 after the node-map draft was rejected.)*

## The three views of a screen (replacing Focus / List / Columns's List)

- **Focus** (default, unchanged skeleton): requirement card left — id, computed state chip, title,
  **Given/When/Then block**, prose expander; proof card right — covered-by line, **gif clip** with
  provenance (`gif · proves R4 · 0:41 · run <id>`), replay, failing beat when red, link into the
  full recording at the step's timestamp. Pagination + arrow keys for one-by-one review.
- **Grid** (proposed replacement for List — open decision 3): the behavior grid — one row per requirement: Given · When · Then ·
  Proof (mark + test + timestamp). Row click expands inline evidence (same gif) + open-in-Focus.
- **Flow**: per authored flow, a player — one stage playing chapters in order, chapter strip with
  still thumbnails, stage names, requirement chips (chips link to Focus). Manual mode: paused start
  + per-chapter "play next". A failing chapter stops playback with the beat named; everything after
  renders not-reached. Multi-screen apps: chapter = screen; single-screen: chapter = step group.

Evidence states stay honest everywhere: ✓ proven · ✗ failing (with beat) · ○ unproven · ◌ not
reached; an unproven/not-reached requirement shows a deliberate empty-evidence placeholder, never a
stale or borrowed frame.

## Mechanism

### Authored: PRD format (the human accepts each migration)

Under each `## Rn — title`, an optional structured lead:

```markdown
- **Given** edit mode · value ≠ house view
- **When** edit the value
- **Then** the cell marks an override; the HV base is kept
```

followed by the existing prose. Parser lives with the PRD render (pure, unit-tested). A requirement
without the block renders as today — migration is per-screen and gated on the human (requirement
wording is theirs; `guess:` rules apply unchanged).

### Measured: evidence capture (rides the run, folded, never replaced)

- `checkReq(id, fn)` captures a **before** screenshot as the proves-step starts and an **after** at
  the assertion; the reporter records both plus the step's start/end video timestamps into the
  per-test record, folded into `_results-index.json` per requirement.
- **CLI runs record evidence too.** This deliberately amends the old "screenshots stay board-only"
  rule — evidence frames are now product, and a grid that blanks after `npm run e2e` repeats the
  documented per-case-record trap. Fold, never replace, board-wide (qualified tags).
- **Gif cuts:** a post-run step cuts the recording between the step's timestamps into a short
  animated clip (animated webp preferred; ffmpeg auto-detected like piper in the narrate pipeline,
  same install-helper pattern). No ffmpeg → frame pair only; the video link still works. Flow player
  needs **no cutting at all** — it is the existing recording plus a derived seek index.

### Derived: test kind and chapters (no new stored state, no status fields)

- **Kind is derived, not declared:** a test that tags another screen's requirement or navigates
  across screens is a *flow*; otherwise it is a *unit*. No annotation API.
- **Chapters are derived** from the run's step structure (`test.step` names + timestamps +
  proves-steps grouped per screen, or per top-level step on a single screen).

### Board

`build-board.mjs` renders the three views (markup/CSS only); `tools/board/client.js` carries the
behavior (grid expand, player, pagination, auto-play toggle). The Focus reader's
**close-fold-reopen** contract with `loadRuns` must be preserved (see CLAUDE.md trap). The player
respects the existing "reader borrows a node" rules — it reads folded records, it does not move
test nodes.

## Test plan (rule 1: failing test first, per slice)

- `tools/*.test.mjs`: G/W/T parser; evidence fold (frames/timestamps per requirement, folded not
  replaced, CLI + board runs); chapter derivation; kind derivation.
- `spec/board/test.spec.ts`: amend R3 (behavior block renders), R6 (both kinds surface), R13 views;
  new assertions for grid view and player honesty (failing chapter stops; not-reached placeholder).
  The board dogfoods: first run after editing its own spec lags one run.
- Cross-checks the mockup encodes: asserted values visible in evidence; player cannot end green on
  a failed flow.

## Rollout

1. Specboard's own board first (dogfood): mechanism + its 4 screens' PRDs reshaped — each PRD
   migration goes to the human for acceptance.
2. Release + `kg-update`; skills updated where behavior changes (kg-e2e/kg-deep authoring guidance
   for behavior rows — philosophy lines already swept in 9fa2c57).
3. dojostack via kg-update, then its screens' PRDs migrated screen-by-screen (verify on real data
   before releasing further).

## Open decisions (the human's)

1. **Confirm the PRD behavior-block format above** — it is requirement wording, so the shape and
   each screen's migration are yours to accept.
2. **Rollout order confirmed?** Dogfood-first as listed, or dojostack earlier.
3. **Grid replaces List, or joins it as a fourth view?** Recommendation: replace — List's
   title-rows are the prose wall this redesign exists to retire; Columns already covers the
   old two-pane reading.
