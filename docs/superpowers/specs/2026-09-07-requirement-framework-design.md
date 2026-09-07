# The requirement framework on the board — design

**Date** 2026-09-07 · **Status** the grouping decision is the human's (accepted today: "yes, agree"); the rest is the design that follows from it, for the human's review · **Worked examples** `docs/requirement-framework-2026-09-07.html` (todolist), `docs/compare-player/` and dojostack's `dojo-blanket-opgrowth-*.html` (blanket Operation Growth)

## 1 · The decision of record

**The five buckets are the fixed grouping of every screen's requirements** (the human, 2026-09-07). In this order, always all five, on every screen:

| # | bucket | what belongs there |
|---|---|---|
| ① | The main thing's life | create it, change it, finish it, remove it — the screen's main noun |
| ② | Every derived number | anything the app computes: counts, rings, roll-ups, effective rates |
| ③ | Every view & chip | each view shows the right rows, every badge and chip agrees |
| ④ | Survival | what outlives a reload, a sign-out, a publish, a navigation |
| ⑤ | The mistake path | the slip is safe: undo, confirm, refuse, nothing lost |

An **empty bucket is a visible hole**, not an absence — the reason for fixing them (Example Mapping's rule with no examples). Today's author-named families (board R17) become **optional sub-groups inside a bucket**, for a bucket that grows past about five cards. A family carries no state; neither does a bucket.

This amends board **R17** (a meaning change the human has now accepted): "every requirement sits under its bucket, and under its family within the bucket where the prd names one; the five buckets render on every screen in their fixed order, an empty one visibly empty."

## 2 · Why — the flow this serves

The human's re-thought flow (2026-09-07): a page is hard to debug → the plugin captures what the DOC and the CODE each imply, applies the framework so the user sees what the feature really requires, shows the Actual, and lists conflicts → the human decides conflicts → what still mismatches is a bug or a wrong rule → the Expected picture where words fail.

Two worked passes showed the shape holds. The todolist, seven of nine rules agreed, still carried 14 things nobody had asked the human. The dojostack blanket grid, "buggy, messy", resolved into 5 decisions, 7 code-versus-code defects, 2 mismatches and 12 gaps — none of them where the user was looking.

## 3 · The framework in one card

A screen is five buckets. A bucket holds **rule cards** and **question cards**.

A **rule card** is a requirement (`## R<n>`), with:

- **Source stamps** — DOC · CODE · SPEC · PROVEN. SPEC is implicit (the card exists). PROVEN is measured (coverage, as today). DOC and CODE are **authored** and render as authored, never as a measured green.
- **Example slots** — happy · boundary · absence · mistake. Each beat fills the slots it is tagged with; a slot the rule needs and nobody filled shows yellow; a slot explicitly declared not needed shows as such.
- **A derived state**, in the order the human works them: **agreed** (nothing to confirm) → **conflict** (this card is a side in an open conflict — pick a side) → **gap** (a slot the rule needs that no beat fills and nobody declared not needed) → **mismatch** (the existing failed/unproven proof: bug, or wrong rule).

A **question card** (`## Q<n>`) is a behaviour one source has and no requirement owns — a code-only `fold()`, a doc rule no test films. It is not a requirement, carries no flag and gates nothing (init R3 stands); it asks the human one question, "is this a requirement?", and is resolved by being rewritten into an `## R` (a fresh id) or deleted. `Q` ids are never reused, like `R` ids.

**Conflicts** stay on the Conflicts page (its R1: one fact stated two incompatible ways, never a gap). A rule card's *conflict* state is derived from that page's open findings naming it as a side. Nothing new is stored on the card.

## 4 · The prd grammar

Backward compatible: a prd with no bucket lines parses byte-identically (the family tests keep passing) and renders under a visible "not yet bucketed" strip plus the five empty buckets — honest, and the cue to walk the screen.

```markdown
### ① The main thing's life                ← a BUCKET line: `###` + one of ①②③④⑤; the tool owns the name, trailing words are a gloss
## R1 — Adding a task puts it in the list
- **Given** …
- **When** you type "Water the plants" and press Add {happy}      ← a beat's slot tag(s); untagged = happy
- **Then** …
- **Sources** doc: app/requirements.html · R1 — code: todo.html addTask()    ← authored stamps (optional)
- **Not needed** mistake — an add cannot be undone here by design            ← fills a slot on purpose (optional)

### 1 · Sub-tasks — the container                  ← a FAMILY line (any other `###`): a sub-group INSIDE the bucket above it
## R3 — …

## Q1 — Collapse / expand a container             ← a QUESTION card, in the bucket it sits under
- **Source** code: todo.html fold() — saved, so it also survives a reload
- **Ask** is this a requirement?
```

Rules: `###` stays reserved for bucket and family lines (kg-deep already says so). A family line before any bucket line is unbucketed. A `## Q` section is parsed like a requirement but is never a coverage target — `checkReq('Q1')` is a lint error. Slot tags are one or more of `{happy}`, `{boundary}`, `{absence}`, `{mistake}` at the end of a **When** line; a `**Not needed**` line names a slot and a reason.

## 5 · What is derived, what is authored

| fact | kind | where it comes from |
|---|---|---|
| a requirement's bucket and family | authored | the prd's heading lines |
| PROVEN stamp, mismatch state | measured | coverage, as today |
| DOC and CODE stamps | authored | the `**Sources**` line, written by the capture (kg-deep) or the human |
| filled slots | authored + measured | beat tags (authored); an `absence` slot also counts as filled by a beat whose Then carries a `MISSING` claim (measured) |
| gap state | derived | an empty slot a rule needs (all four are needed unless declared not needed) |
| conflict state | derived | an open finding on the Conflicts page naming the card as a side |
| a bucket's or family's state | derived | its cards' states, never stored |

No new status field anywhere. Nothing here waits on the human: a question card blocks nothing, a gap is a yellow slot, the prd is canon on write.

## 6 · The Conflicts page — part B (extends, does not replace)

The existing page already is step 3 of the flow (its R1–R5). Four changes, in order:

1. **Sides carry a kind.** A finding's sides become a list: `{ kind: 'spec'|'doc'|'code'|'actual', source, date?, quote, claim?: { locator, expected } }`. Two sides is the floor. Existing `a`/`b` findings migrate as two spec sides; settled keys are content-keyed already (R5) and survive.
2. **The scan is bounded per screen.** Its comparison surface is the screen's prd, the docs the prd's grounding notes cite, and the code files they cite. Still a claude job, still "leave it out if unsure", still stamped as authored.
3. **A side can be a picture.** Where a side carries a `claim` and the screen has a harvested base replica, the card renders that side as the base with the claim applied — one Expected column per side, the Actual recording beside them, on the reader's one stepper with its three modes. A side with no claim stays a quote. This retires the hand-drawn `compare-player` mock grids; it kept only the row shape.
4. **Resolve follows the loser's kind.** spec → the existing rewrite; doc → recorded as a note for the doc's owner, no rewrite outside the board; code → recorded, the rule card reads mismatch until a red-first test and a fix land; actual → never rewritten (if a written side wins over the actual, the row is red; if the actual wins, the written side loses).

## 7 · The capture (kg-deep phase 1)

Before drafting, the capture reads the DOC and the CODE the screen cites into candidate cards per bucket: what every source agrees on is written as `## R` with its `**Sources**` line; what one source alone has is a `## Q`; what two sources state incompatibly is a finding for the Conflicts page. The prd is still canon on write. The skills (kg-deep, kg-e2e) and CLAUDE.md say so; the five-bucket walk in kg-deep 3a becomes "write the bucket lines, then the cards under them".

## 8 · Rendering

- **Home card and List**: five bucket rows in fixed order, each with its count and its worst state as a mark and a hue (never hue alone); an empty bucket reads "— nothing here yet" in the muted ink. Families as sub-headings inside.
- **A rule card**: the stamp strip (DOC · CODE · SPEC · PROVEN, filled / red when it is a conflict side / dashed when silent), the four slots, the state badge. Question cards yellow, with their one question.
- **The counter** on the screen's head: conflicts · gaps · mismatches · agreed, each linking into its bucket.
- Design system unchanged: indigo stays Changed; yellow (yamabuki) marks gap and question — the sign-off of a new status colour is the human's, requested here; conflict and mismatch use the existing red family with marks.

## 9 · Dogfooding and tests

- Pure: `parsePrd` gains buckets, questions, slot tags and sources — extended in `tools/prd-families.test.mjs` and a new `tools/prd-buckets.test.mjs`; the state derivation (`tools/coverage.mjs` or a new `tools/cards.mjs`) unit-tested; the conflicts side migration unit-tested.
- Board: `spec/board/prd.md` gets its own bucket lines (dogfood), R17 amended; new board requirements written red-first: an empty bucket is visible; a question card renders and is not a coverage target; a rule card's conflict state comes from the Conflicts page; a stamp is never green by authoring.
- Real data: `demo/todo` walked first (its cards and questions are already listed in the todolist page), then dojostack's blanket screen.

## 10 · Scope and order

Two plans. **A — the screen side** (sections 4, 5, 7, 8, 9): buckets, stamps, slots, question cards, kg-deep. **B — the Conflicts page** (section 6). A first: B needs A's cards to point its conflict state at, and B's picture side needs nothing that A does not already ship. The `compare-player` sketch is parked; its row shape is what B's card becomes.

## 11 · Out of scope

Non-functional requirements (performance, accessibility). Reading a project's docs and code without a grounding note (the scan stays bounded). An automatic rewrite of a doc that lives in the app repo.
