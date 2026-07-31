# Design notes — keep the AI aligned to the design you already have

*Feature spec · 2026-07-31 · status: for human review*

## One line

Give each screen a short, durable list of **design notes** — statements of design intent the AI reads
on every build — and a **one-action "correct"** that fires a fix prompt built from them, so the human
stops re-typing "how it should look" and "what's wrong" every review round.

## The problem (why this exists)

specboard promises *no drift*: requirements are the source of truth, tests prove them against the real
app. But tests prove **behaviour and structure**, never **visual fidelity**. That hole already cost us:
when the board was rebuilt from an approved mockup, the AI drifted and shipped ~6 visual defects a human
caught by hand — the mockup had been deleted, the tests only checked structure, and there was no check.

Reframed to the human's own words, the pain is **two typing taxes paid every review round**:

- **"How it should align"** — the design intent. Re-typed because *the AI has no memory of it* (the
  design lives in Figma / HTML / the human's head; specboard rightly doesn't hold it). A **memory** tax.
- **"What's wrong"** — this round's specific drift. Re-typed because describing which element and why,
  in prose, is verbose. An **input** tax.

## Non-goals (explicit — we walked back to here on purpose)

specboard does **not**, in this feature or any part of it:

- store, version, render, or link a **wireframe** or design artifact of any kind;
- **point at / read the live DOM** of the build (no iframe harness, no click-the-element capture, no
  same-origin dependency — that was prototyped, found to be precision gold-plating, and cut);
- **gate** anything, or add a human approval step;
- **assert pixels** or claim to *prove* visual fidelity — that stays human-judged. Design notes are an
  **alignment aid**, not proof.

Everything below is strictly *smaller* than "requirements ↔ tests" already is. It adds one lightweight
per-screen text artifact and one prompt-composer. Nothing renders a design.

## The solution

### 1. Design notes — durable intent, per screen

- A screen keeps a short list of **design notes** in `spec/<screen>/design-notes.md` (plain text, one
  intent per line/bullet; optional trailing `— <date>`). Example:
  ```
  - The column headers use tracked uppercase caps with a hairline underline, not body text.
  - Cards are hairline-bordered on unbleached paper — no shadow, no fill.
  - Indigo is reserved for "your turn"; coverage tags are neutral until hover.
  ```
- Notes are **human-editable and prunable** and are shown on the board in the screen's detail (a small
  collapsible "Design notes" block — auxiliary to the two columns, it does **not** become a third
  column, so board R2 still holds). A screen with none shows an invite, never a gate.
- Notes are **distinct from requirements**: requirements are behaviour the human owns and tests prove;
  design notes are visual intent the AI reads to stay aligned, accumulated as you correct it. They are
  never auto-promoted into requirement *meaning* (that would launder a staff correction into the human's
  source of truth).

### 2. The "correct" action — the terse delta, wrapped

- On a screen, a **Correct** affordance opens a one-field box: you type only the terse delta
  ("header underline missing").
- specboard **composes** the prompt from: the screen + route, the screen's **current design notes**
  (the durable intent), your delta, and the anti-drift guardrails
  (*correct only what drifted; do not weaken, skip, or delete any test; if a test breaks find which of
  the two is wrong before editing either* — from CLAUDE.md's rules).
- **Copy** → clipboard (zero backend, zero login — ships first). **Send** → reuses `runJob`
  ([serve-board.mjs:104](../../../tools/serve-board.mjs)) to spawn `claude -p`, stream in the run panel,
  and **verify the file changed** ("ask the disk, not the exit code").
- After a correction you may **keep the delta as a new design note** (explicit, so notes don't
  auto-bloat) — this is the "corrections stick" decision: say it once, remembered forever.

### 3. How alignment actually holds

specboard cannot inject into *your* separate Claude sessions. Alignment works one way only, and we state
it honestly: **the notes are durable text in the screen's spec, and the AI reads them because it reads
the spec.** Concretely —

- **specboard's own Send** always includes them (trivial).
- **Your own sessions** get them because specboard's workflow already makes you read a screen's spec
  before changing it — the `kg-staff` briefing (`tools/staff.mjs`) surfaces a screen's design notes, so a
  session following specboard's rules is handed them automatically.
- **Honest limit:** this keeps the AI aligned *only when the AI reads the spec.* A session that edits the
  app ignoring the spec won't see them — the same contract every requirement already has. We do not
  pretend it is enforced.

## Requirement changes (native PRD — human owns meaning)

### R7 amendment (board) — human's gate, proposed wording

> ## R7 — specboard owns no wireframe or design artifact — only design *notes* it reads to the AI
>
> specboard still does not render, store, version, gate, or link a wireframe or a design of any kind —
> you make those wherever you like, and specboard never sees them. What it does keep is **design notes**:
> short, durable, human-editable statements of design intent for a screen, accumulated as you correct the
> AI's drift. They are plain text the AI reads through the same spec / staff path as every requirement,
> so it stays aligned to your design without you re-explaining it each round. Design notes are an
> alignment aid, not a wireframe and not a source of truth — they never gate anything, never change a
> requirement's proven / unproven state, and never assert pixels (visual fidelity stays human-judged). A
> screen may have none.
>
> *Reworded 2026-07-31: R7 previously admitted no design affordance at all ("no design field"). Rebuilding
> the board from a since-deleted mockup drifted and shipped visual defects caught by hand; re-storing the
> design would only recreate a thing to drift from. The fix is to remember the corrections as durable
> intent the AI reads — design notes — not to own the design. Keeps the prior narrowing (no wireframe
> subsystem) and adds only the lightweight notes.*

### Two new board requirements (proposed) — or a dedicated screen (open decision below)

> ## R11 — A screen carries editable design notes, read by the AI
>
> Each screen keeps a short list of design notes — durable statements of design intent — shown in its
> detail and editable and prunable there. They are plain text in the screen's spec, surfaced in the staff
> briefing, so any AI session that reads the screen before building it is aligned to the design without
> the human re-explaining it. A screen may have none; notes never gate and never change requirement state.

> ## R12 — "Correct against the design notes" composes the prompt; you never hand-type it
>
> From a screen you type only the terse drift ("header underline missing"); specboard wraps it with the
> screen's design notes, its route, and the anti-drift guardrails into a fix prompt — Copy (clipboard) or
> Send (spawns `claude -p`, streams in the run panel, verifies the file changed). A correction may be kept
> as a new design note so the same drift is never explained twice.

## Architecture (files touched — draws only, no new subsystem)

| File | Change |
|---|---|
| `spec/<screen>/design-notes.md` | **new** — the durable notes (human-edited: add / edit / prune) |
| `tools/serve-board.mjs` | `POST /api/design-note` (add/edit/delete a note); `POST /api/correct` → `runJob({kind:'correct', prompt, changed})`. Static allowlist unchanged (only `board.html` + `spec/**`). |
| `tools/spec-store.mjs` | read a screen's design notes into the board data |
| `tools/build-board.mjs` | render the "Design notes" block + the Correct box in the detail (mind the emitted-template-literal `\n`/backtick guard) |
| `tools/staff.mjs` | include a screen's design notes in the briefing (this is what makes the AI read them) |
| `spec/board/prd.md` | R7 amendment + R11/R12 (or a new screen) |

**Reuses, does not rebuild:** the `runJob` spawn-and-verify path, the run panel, the SSE stream.

## Test plan (how we prove it, honestly)

- **Pure unit** (`tools/*.test.mjs`, `npm run test:tools`):
  - prompt composition: `(screen, route, notes[], delta) → exact prompt string` (a pure function — this
    is what makes the correction prompt itself non-drifting);
  - design-notes read/serialize round-trip.
- **E2E** (`checkReq`): a screen's design notes render in its detail; add / edit / prune a note works;
  `staff.mjs` output includes the notes; Correct composes the expected prompt and **Copy puts the exact
  text on the clipboard**; **Send POSTs the exact prompt and enqueues** (stubbed — a live `claude -p`
  edit stays outside the deterministic suite, per CLAUDE.md).
- **Honest limit stated in the PRD:** tests prove the *mechanics* (notes stored, surfaced, composed,
  fired). Visual fidelity remains human-judged — by design, not a gap.

## Stale cleanup (folded in / flagged to human)

- **"How does it work" page** (`WORKFLOW` / `HOW_FLOWS` / `#howview` in `build-board.mjs`) still draws
  the removed Gate A / Gate B / draw-the-wireframe method — now doubly stale. Rewrite to
  requirements ↔ tests (two columns, no gate) **and** the new design-notes/correct loop.
- **`spec/init/prd.md` R3** still names the removed acceptance gate ("gate A", "gate A and no gate B",
  "Awaiting your accept on the board"). Correct in place, with the reason.
- **Stale conflict** — "the width a wireframe is authored at" (`board 1280` vs `init 1152`). Board's side
  of that text **no longer exists** in the PRD (cached from a pre-narrowing version); `init` still carries
  the 1152 wireframe text. Both reference the removed wireframe concept. **Human decides canon** (per
  kg-staff I won't) — the natural resolution is deleting the stale wireframe-width references. Resolve
  before we build.
- **`spec/_fixture.ts`** — dead `makeUnbuiltScreen` POSTing the removed `/api/gate` endpoint. Delete.

## Open decisions for the human

1. **R7 wording** — accept the proposed amendment above, or edit the meaning.
2. **Home of the requirements** — fold into `board` as R11/R12 (recommended: no new card, minimal), or a
   dedicated new screen `spec/design-notes` (cleaner isolation, but a 5th card). *Recommend fold-in.*
3. **Note file format** — `design-notes.md` (human-friendly, recommended) vs `design-notes.json`
   (structured: text + date + optional source). *Recommend `.md`; add structure only if we need it.*

## Build order (after spec approval)

Per kg-staff + TDD: change the requirement text first (R7/R11/R12 — your gate), write the failing test
first and watch it go red, make it pass without weakening it, then close the loop (`npm run e2e` twice —
board dogfoods itself — `npm run test:tools`, re-scan for conflicts, clear the stale worklist).
