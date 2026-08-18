# Requirement schematics — a drawn animation of the idea, beside each requirement

**Date:** 2026-08-18 · **Status:** design agreed with the human; scoped additive-only; **build not
yet started** (the human chose "just plan it for now" while another agent builds the board).
**Mockup:** `docs/superpowers/specs/2026-08-18-requirement-schematics.mockup.html` (served on :4317) —
three requirements, each with a looping house-style schematic and a live text→stale demo; the mockup
is the visual contract for this spec.
**Builds on:** [2026-08-17-visual-requirements-design.md](2026-08-17-visual-requirements-design.md)
(the behavior grid + `parseBehavior`/`renderBehavior`, now shipped).

## Problem

Requirements read as prose walls (board R3's collapse is an admission, not a fix). The human wants
one more way to grasp a requirement: **a small looping visual of the idea of its behaviour, shown
beside the text**, for readers who don't want to parse prose — the way articles pair a short gif with
their text.

## Decisions already made (the human's, logged)

1. **Add only this; no layout change.** The current board stands. The schematic is a one-call
   insertion beside `renderBehavior` in the requirement `.body`; no new columns, no restructure.
   *(2026-08-18.)*
2. **The schematic is decoupled from the app and abstract** — generic shapes in one house style, NOT
   a copy of the real UI. This is deliberate: it sidesteps rebuilding host components (ag-grid), which
   remains forbidden ([2026-08-17 decision #1](2026-08-17-visual-requirements-design.md); board R7).
   *(2026-08-18.)*
3. **It explains the idea; it is never proof.** Status/proof stay with the test. The schematic is an
   authored reading aid, not evidence, not a captured golden. The bigger "expected-vs-current captured
   diff" explored on the way here is **dropped**. *(2026-08-18.)*
4. **Held honest by a text-hash, not by matching the app.** Because it is pinned to the requirement
   *text*, its only drift axis is text↔picture; the board computes that (hash mismatch) and shows
   `stale`, never a wrong picture passing for right — the same drift-is-computed-never-hidden rule as
   the rest of the board. *(2026-08-18.)*

## Design

**Format.** Self-contained **animated inline SVG** — loops like a gif via a `<style>` inside the SVG,
no external libs, no binary, diffable text (matches specboard's inline-everything rule). Pauses under
`prefers-reduced-motion`.

**House vocabulary.** One kit of abstract primitives in the dye palette — field, row, checkbox,
list/section, button, count chip, cursor — plus motion conventions. Every schematic composes these, so
the board reads as one system, not 100 styles. Defined once in the design system.

**Archetype-first derivation (the key engineering decision).** Most schematics are *derived*, not
model-drawn:

- A small kit of **interaction archetypes** — `move-between-lists`, `toggle-and-recount`,
  `press-and-clear` (extend later: `type-and-submit`, `open-a-dialog`, …). Each is a parameterised
  template (labels, list names, counts) over the vocabulary.
- `tools/behavior.mjs` already parses `Given / When / Then`. A structured triple maps
  **deterministically** to an archetype → a pure `behavior → archetype → SVG`: no model call, no
  `claude` login, unit-testable, rot-proof (computed from the text, like everything else on the board).
- Requirements that fit **no** archetype fall back to a **model draw** (a detached job, like
  scan/crawl/rewrite). The exception, not the rule. Until then they are text-only — honest.

**Storage + honesty.** The SVG is committed at `spec/<screen>/viz/<id>.svg`, stamped with a **hash of
the requirement text** it was drawn from (`spec/**` is already server-allowlisted → reachable). On
build, current text-hash ≠ stamp → the board shows `stale — redraw pending` (greyed). For a derived
archetype, redraw is instant and free (re-derive); for the model fallback, staff redraws on the next
viz pass. The human owns the text/meaning; staff owns keeping the picture in sync.

**Rendering.** A new pure `renderSchematic(r)` returns the inline SVG, or `''` when there is no viz —
byte-for-byte-unchanged contract, exactly like `renderBehavior(null)`. Inserted beside `renderBehavior`
in the `.body` template ([build-board.mjs:184](../../../tools/build-board.mjs)); rendered as a compact
**figure** inside the existing single-column body (block or right-float via CSS), captioned
`schematic · the idea, not the real UI`.

## Architecture / file map

**New (zero collision with the board work):**
- `tools/viz.mjs` — pure: `deriveSchematic(behavior) → {archetype, svg} | null`; the archetype kit;
  `vizHash(text)`; `vizStale(storedHash, text)`.
- `tools/viz.test.mjs` — TDD: each archetype from a triple; the no-match→null contract; hash stability;
  staleness.
- `spec/<screen>/viz/<id>.svg` — the committed schematic assets (derived, then hand-checked).
- `tools/viz-run.mjs` — (phase 3) the detached model fallback.

**Touched (small, appended — the coordination surface, all owned by the board agent too):**
- `tools/build-board.mjs` — one `import`, one `${renderSchematic(r)}` at line ~184 (optionally the Grid
  row ~243); define `renderSchematic` beside `renderBehavior`.
- `enrichReqs` (wherever `r.behavior` is attached) — attach `r.viz = {svg, stale}`.
- `spec/_design.css` — an appended `.schematic` figure + vocabulary/archetype block + reduced-motion;
  no edits to existing rules.
- `tools/spec-store.mjs` — only if enrichReqs/viz-state lives there.

## Testing

- `tools/viz.test.mjs` (pure, `npm run test:tools`): archetype mapping, null contract, hash, staleness.
- A `renderSchematic` render test mirroring `tools/behavior-render.test.mjs` (empty-string contract,
  HTML escaping, the figure wrapper).
- Dogfood: give the board's own R-set schematics where they fit an archetype.

## Multi-agent coordination

Another agent is actively building the board (recent commits: behavior grid, Grid view, `flow.mjs`).
Phases 0–1 are isolated (new files only) and safe anytime. Phase 2 is ~3 lines in hot files
(`build-board.mjs`, `_design.css`, enrichReqs) — land it as one commit **staged by explicit path**
(never `git add -A`), on a clean tree, or hand the board agent the `renderSchematic` insertion point.

## Phased plan

- **Phase 0** — `tools/viz.mjs` (vocabulary + 3 archetypes + hash/staleness) + `tools/viz.test.mjs`,
  test-first. *Isolated.*
- **Phase 1** — derive + commit `spec/<screen>/viz/*.svg` for archetype-fitting requirements; record
  which don't (text-only until phase 3). *Isolated.*
- **Phase 2** — integrate: `renderSchematic` + `.body` insertion + `_design.css` + enrichReqs `r.viz`;
  rebuild board. *Small shared touch — coordinate.*
- **Phase 3** — `tools/viz-run.mjs` model fallback; teach the authoring skills (kg-deep, …) to draw and
  refresh the viz; bake the principle into the skills.

## Open questions / risks

- **Archetype coverage.** 3 archetypes won't fit every requirement; the rest are text-only until the
  model fallback. Acceptable and honest.
- **Model-fallback variance** (phase 3) — constrained by the vocabulary + a validator, but
  non-deterministic. Keep it the exception.
- **Deterministic derivation needs a well-formed Given/When/Then.** Requirements without one get no
  derived schematic — a gentle nudge toward structuring behaviour, consistent with the behavior grid.
