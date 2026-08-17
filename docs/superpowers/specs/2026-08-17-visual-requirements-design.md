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

## Removed: the guess flag / draft / human gate (the human, 2026-08-17)

The last remnant of the acceptance gate — the `guess:` frontmatter flag and its "your turn" /
indigo treatment — is **removed**. New model: **a requirement is canon the moment it is written;
you edit or remove it as freely as a test.** No draft status, no acceptance, nothing waiting on a
person for requirement meaning. Rationale: it makes a screen easy to start (no ceremony), and the
human still owns meaning by editing/removing requirements directly. This goes one step past board R8
(which removed the *gate* but kept the *flag* for crawled/deep-drafted PRDs).

This is coordinated, not a doc edit — the board dogfoods itself, so all of the following change
together (requirement → failing test → code → docs), or the board contradicts its own suite:

- **Requirements:** `spec/init/prd.md` **R3** ("A drafted PRD is marked as a guess until the human
  accepts it") is deleted. Any board requirement that renders the guess chip / your-turn is reworded.
- **Dogfood tests:** `spec/init/test.spec.ts` R3 and `spec/board/test.spec.ts` **R11** (the
  walkthrough Act 2 asserts the guess flag animates and *drops*, and "you confirm the meaning") must
  be rewritten to the new model *first, failing*, then the code changed.
- **Board code:** `tools/spec-store.mjs` (`isWaiting`, the `guess` frontmatter parse — drop or
  ignore), `tools/build-board.mjs` (guess chip, `yourTurn` count, waiting indices, the "nothing is
  waiting" banner, the flow-diagram gate `g1`, the walkthrough **Act 2** — a real rewrite), and
  `tools/board/client.js` (waiting handling, the `mine`/`a guess` state labels).
- **Skills:** `kg-init` and `kg-deep` lose "draft the PRD for the human's gate" / "drop the flag";
  the crawl is already inventory-only, so deep-drafted requirements are simply canon, editable later.
- **Design system (CLAUDE.md):** the rule "**indigo means one thing only — your turn**" is retired;
  indigo is freed (candidate: the **Changed** drift state introduced by this redesign).
- **`guess:` demo data:** `demo/todo/spec/todo/prd.md` frontmatter drops `guess: true`.
- **Queue banner** is repurposed from "your turn" to honest **drift** — "N need a look · X failed ·
  Y changed since their proof" — or "all clear".

Because these are the same files this redesign already rewrites (`build-board.mjs`, the walkthrough,
the board/init tests), the gate removal is **folded into this redesign's implementation** — doing it
standalone now would touch the riskiest files twice.

## Rollout

1. Specboard's own board first (dogfood): mechanism + the gate removal above + its 4 screens' PRDs
   reshaped — each PRD migration goes to the human.
2. Release + `kg-update`; skills updated where behavior changes (kg-e2e/kg-deep authoring guidance
   for behavior rows — philosophy lines already swept in 9fa2c57).
3. dojostack via kg-update, then its screens' PRDs migrated screen-by-screen (verify on real data
   before releasing further).

## Decided (the human, 2026-08-17)

- **PRD behavior-block format** (Given/When/Then + prose) — agreed.
- **Views: Focus / Grid / Flow** — three, not four. Grid replaces List; Columns dropped (its
  requirement↔test link is folded into Focus's "proven by" selector).
- **Guess flag / draft / human gate removed** — see the section above.
- **Status vocabulary:** Passed / Failed / Untested / Not reached / Changed (drift).
- **Test-authoring is prompt-handoff:** the board never writes/edits tests or requirements silently;
  every add/edit/remove (test *and* requirement) hands the human a ready prompt for Claude.

## Open decisions (the human's)

1. **Rollout order?** Dogfood-first as listed, or dojostack earlier.
2. **`Changed` needs a definition** to implement: a content hash of the requirement text captured
   when a test last passed, compared to the current text. Confirm that's the trigger.
3. **Overlap aggregate:** a requirement covered by two tests reads **Failed if any covering test
   fails** (fail-wins), so a real failure can't be masked by a second green test — confirm.
