# Requirement beats — the multi-step grammar, the Focus split, media policy, and the flow composer

**Date:** 2026-08-20 · **Status:** design agreed with the human (all four decisions taken via the
decision queue, 2026-08-20); build slots into the running visual-requirements sequence.
**Brief (visual):** https://claude.ai/code/artifact/08757463-770a-4a7a-8746-a83d9fc18487
**Builds on:** [2026-08-17-visual-requirements-design.md](2026-08-17-visual-requirements-design.md)
(behavior blocks, evidence, views) and
[2026-08-18-requirement-schematics-design.md](2026-08-18-requirement-schematics-design.md)
(the drawn schematic, hash-pinned). **Amends both** — see "Amendments" below.
**Reference the human supplied:** dojostack
`design-mockups/operation-growth-cell-overlay-taxonomy.html#gwt` — its scenario cards (esp. S2: one
Given, two When→Then pairs, each with a before/after mini-table) are the target reading experience.

## The one idea

The behavior block gains a repeatable unit — the **beat**, a When→Then pair. One grammar answers all
three of the human's questions at once, because every consumer reads the same `beats[]`:

```
Given  →  (When → Then) × 1..N
```

- **PRD render** — the G/W/T block draws N beat rows (the dojostack "built table" look).
- **Schematic** (`viz.mjs`) — each beat is one animation beat of the drawn SVG.
- **Proof media** (`evidence.mjs`) — each beat maps to a frame pair / filmstrip cell; the clip
  window spans first→last beat.
- **Flow composer** (new, mockup-first) — a node *is* a beat with an identity; a flow is a path of
  beats whose Thens feed the next Given.

## Decisions (the human's, 2026-08-20)

### D1 — the beat grammar (adopted)

One **Given** per requirement, then **1..N When→Then beats**. Three bounding rules:

1. **One Given.** A second Given means a second requirement (or a second node). The
   multiple-Given variant was considered and rejected — it blurs one-requirement-one-state.
2. **A beat exists only where an assertion could fail** (carries forward 2026-08-17 decision #4).
   Setup actions that assert nothing fold into the When sentence ("open the multi-select and tick
   Base Amount"), and become a second beat only when the intermediate state is itself worth
   asserting.
3. **Beat N's Then is beat N+1's context** — no restating state between beats.

**Migration cost: zero.** The grammar is a strict superset — today's triple parses as a 1-beat
chain, so the five existing board blocks stay valid unchanged, `meaningText` hashes the raw text
(unchanged), and no `behaviorText` schematic pin is committed yet. This is the cheapest moment the
grammar will ever be.

**Contract ripples (pure tools, red-first):**
- `parseBehavior(body)` → `{ given, beats: [{when, then}, …] } | null` (was a flat triple).
  `stripBehaviorLead` strips all beat lines. PRD syntax: the extra beats are simply further
  `- **When** …` / `- **Then** …` lines under the same lead.
- `renderBehavior` draws N beat rows; Grid's behavior cell likewise.
- `reqhash.behaviorText(parsed)` serializes given + every beat in order. Its output for a
  single-beat block should stay byte-identical to today's serialization if achievable cheaply —
  but this is not load-bearing, because no schematic pin exists yet; `meaningText` (the proof pin)
  is untouched by construction.

### D2 — proof media policy (derived default + toolbar override)

Every format is a **view over the one artifact the run already produces** (webm recording +
per-step timestamps + before/after frames) — "which do we store?" never arises, only "which do we
show first?". The default derives from **status × beat count**; a `frames · clip · video` toolbar
overrides it. The override is a client-side view preference (beside the existing Auto-play
toggle), **never stored state**.

| status | default shown | toolbar |
|---|---|---|
| Passed · 1 beat | before/after frame pair | frames · clip · video |
| Passed · N beats / flow | filmstrip — one cell per beat (given + each Then); clip spans first→last beat | frames · clip · video |
| Failed | the failing beat's red frame + the assertion's expected-vs-actual (decided 2026-08-18) | frames · video@fail |
| Changed | pinned-era evidence, watermarked "proof predates this text" + re-verify (rides the proof pin, as decided) | frames · clip · video |
| Untested | no media — "no proof yet · ＋ write the failing test" | — |
| Not reached | no media — "the flow stopped before here", linking the failing chapter | — |

Rejected: "offer everything, user picks every time" (a hundred requirements become a hundred
decisions; review speed dies) and "clip everywhere" (a wall of looping motion; heavy for long
flows). Choice stays — as an override, not a prerequisite. Standing rule unchanged: asserted
values must be visible in the frames/recording.

### D3 — the Focus split: authored left, measured right (mockup first)

Focus mode becomes a walk through requirements, one at a time (pagination/arrow keys unchanged):

- **Left, top** — the requirement: id, computed state chip, title, the **beats block**, and the
  authored prose behind the existing collapsed expander (collapsed by default).
- **Left, bottom** — the **schematic**: the drawn, house-style animated SVG
  (before-action → after-action), loop by default, a beat-stepper (dots) when N > 1, stepped form
  under reduced-motion, greyed **stale** when the text moves past its `viz@hash`.
- **Right** — the **proof**: proven-by line, the media pane per D2's table with its toolbar,
  Run / ⋯ (steps, logs, authoring prompts) unchanged.

**The load-bearing boundary:** left is **authored** (what should be — text and a drawn picture,
hash-pinned), right is **measured** (what is — harvested from runs, folded never replaced).
**Captured media never crosses to the authored side** — real screenshots/gif on the left would
rebuild the golden/expected-vs-current diff explicitly dropped 2026-08-18. The left pane's only
media choice is loop-vs-step of the same drawn schematic.

Build order: update the **visual-contract mockup**
(`2026-08-17-visual-requirements.mockup.html`) first; the human judges the layout there before any
board code moves.

### D4 — the flow composer: a prompt-handoff authoring aid (mockup after the Focus work)

Two logged decisions sit on this path and **stand**: *flows are authored, never runtime-composed*
(2026-08-17 #3) and *the Flow view is a player, not a node map* (2026-08-17 #5). The composer
respects both by living in the **R15 prompt-handoff family**:

- A **node** = a beat with an identity: **element archetype** (list item, toggle, method picker —
  the same kit `viz.mjs` draws from) × **state signature** (two identical unchecked items are one
  node; a checked one is another) × **structure signature** (an item with sub-items is a different
  node — structure changes what a beat can assert).
- The node **library** may fan out like a graph; an authored **flow is one path** through it.
  Connecting nodes validates the handoff: beat N's Then must satisfy node N+1's Given.
- **Output = a ready kg-e2e prompt** (flow name, `coverReqs(…)`, the beat table, the target file —
  a flow's file lives in the screen it starts on). The board **writes nothing, runs nothing,
  stores no graph as truth** — the authored flow test remains the only flow that exists; the Flow
  view remains the player.
- **The line it must not cross:** the moment the board composes *runnable* tests at runtime it
  becomes the test generator the human rejected. The prompt-handoff frame is what keeps it legal.

Deliverable now: a **standalone HTML mockup** (like the schematics one), sequenced **after** the
Focus work — it depends on the beat grammar and shares the archetype kit with `viz.mjs`. Whether
the node library is derived (crawl/PRDs) or authored is exactly what the mockup explores; no
storage decision before the human has seen it.

## Amendments to prior specs (with reasons — rule 6)

1. **Schematics decision #1** ("add only this; no layout change", 2026-08-18) — **amended
   2026-08-20**: the schematic is promoted to Focus's lower-left pane (D3). Reason: the human's
   focus-mode walkthrough needs a visual anchor on the authored side, and the pane placement is
   what separates the media vocabularies cleanly.
2. **The Untested evidence slot** (2026-08-18 "YES": the G/W/T shape occupies the evidence slot) —
   **amended 2026-08-20**: with beats + schematic permanently on the left, repeating the shape on
   the right is noise; the Untested proof pane simplifies to "no proof yet · ＋ write the failing
   test".
3. **2026-08-17 decisions #3/#5 (flows authored; player not node map)** — **upheld**, not amended;
   D4 is deliberately framed so the composer never touches them.

## Sequence (slots into the running plan; step 0 unchanged)

0. **Land the Changed-drift dogfood fold** (the blocked task — needs the suite alone) including
   the standing `shotHash` mtime→content-hash fix.
1. **Beats grammar in the tools** — `behavior.mjs` / `renderBehavior` / `reqhash.behaviorText`
   multi-beat (superset; red-first; small).
2. **Update the visual-contract mockup** to the D3 Focus split + D2 toolbar — human judges there.
3. **Evidence rendering build** (Plan 3 tail) against that mockup, per D2's table; harvest frames/
   clips (CLI runs too, folded never replaced).
4. **Schematics** (`viz.mjs` phases 0–2) targeting the lower-left pane; beats drive animation
   beats; stale = quiet grey.
5. **Flow-composer mockup** (D4) — mockup only, then decide.
6. **Behavior blocks for init/conflicts/dispatch** (selective, human signs off each) ·
   **dojostack kg-update + release** (verify on real data).

## Testing (rule 1 applies per step)

- Beats: `behavior.test.mjs` (multi-beat parse, 1-beat back-compat, partial → null),
  `behavior-render.test.mjs` (N beat rows, escaping), `reqhash.test.mjs` (multi-beat
  serialization; prose-only edit still moves meaningHash not behaviorHash).
- Evidence: per-beat frame mapping + filmstrip derivation pure-tested; fold shape asserted from a
  synthetic record; CLI-run fold covered (the documented trap).
- Focus split: board dogfood assertions against the new panes only after the mockup is approved —
  the view anatomy is board R13/R2 territory, so any requirement-text touch goes to the human
  first (rule 5).
- Composer: none yet — it is a mockup.
