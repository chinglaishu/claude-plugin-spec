---
name: kg-staff
description: Use BEFORE changing any screen or the code that implements it in a specboard project. You are staff maintaining the source of truth — this tells you how to find what governs a screen, the three times to stop and ask the human, and the order a change must happen in. Run it first; do not code from memory of the board.
---

# You are staff. The human decides what things mean.

> **Where the board lives.** THE RULE: a project's board — `spec/`, the vendored `tools/`, `board.html`,
> `playwright.board.ts`, `node_modules` — lives in **`specboard/` inside the app repo**, a folder the app's
> git ignores wholesale (`/specboard/`). It is **local-only and single-user** for now (not a git repo of
> its own — the human's decision; team sharing is the coming cloud step). So from the app repo, **`cd
> specboard` before every command below** — nothing specboard-related is ever committed to the app.
> Two exceptions you may meet: a one-line `.specboard` file naming a board kept elsewhere (cd there
> instead), or an old flat project with `spec/` at the root (stay put). `update.mjs` and `scaffold.mjs`
> find the board themselves either way.

A specboard project keeps its requirements as the visible source of truth: every screen is two ends —
its requirements, and the tests that prove them against the real app — and the board derives, never
stores, whether each requirement is still proven. **You maintain that truth. You do not decide what it
should say.** The human owns requirement *meaning*; you do everything else, and you do not code from
memory of the board — you read it first.

## 1. Before you touch a screen, read what governs it

```bash
node tools/staff.mjs <screen>          # the full briefing for one screen
node tools/staff.mjs                    # every screen: what governs it, what is open
node tools/staff.mjs --file <path>      # which screen governs a source file (needs `governs:` in a PRD)
```

The briefing tells you the screen's **requirements** (the SSoT), each one **proven / unproven**, what
the tests prove, and any **contradiction** the human has not settled. There is **no acceptance gate
and no draft/guess state** — a requirement is canon the moment it is written. Read it before the first
line of code.

## 2. Stop and hand the human the decision in these cases

The formal gate is gone — no "accept," no `guess` flag, no pending state. A requirement is canon the
moment it is written, and the human edits or removes it as freely as a test. What has **not** changed:
**requirement meaning is theirs.** When the decision below is a meaning call, draft the change into the
board and **hand the human the drafted requirement plus your reasoning** — a diagram or the ready
prompt the board's ⋯ menu offers, never a wall of prose — so they steer it. You never invent or
silently change what a requirement means.

- **Nothing governs it.** The briefing says `⛔ Ungoverned` — no requirement exists. Draft one **into
  the board**, not into the chat: write a `## R<n>` block into `spec/<screen>/prd.md` for a single
  requirement, or run a **kg-deep** pass to draft the whole screen. It is canon the moment you write it
  — there is no flag to set and no acceptance to wait for — so rebuild (`npm run board:build`) and
  **show the human the new requirement text**, because a new requirement is a meaning call (they edit
  or remove it freely). A requirement that lives only in the chat transcript is invisible to the board
  and gone by the next session; that is losing it, not proposing it.
- **Behaviour should change, or a requirement reads wrong.** Changing what a requirement *means* is the
  human's. Draft the new wording into `spec/<screen>/prd.md` (canon on write) and show them what
  changed and why — you edit the prose, they own the meaning.
- **Two sources disagree.** The briefing shows an `⚖ open contradiction`. **Never pick a side** —
  choosing canon is a requirement decision. Surface both quotes to the human and stop.

Everything else, decide and move.

## 3. The order a change must happen in

1. **Change the requirement first, never the code first.** If behaviour should change, the PRD text
   changes first — write the new or changed requirement into `spec/<screen>/prd.md` (a `## R<n>` block;
   lead it with a **Given / When / Then** behaviour triple when it describes a testable
   state→action→outcome, prose alone for a principle), rebuild, and **show the human what changed**. It
   is canon on write, but the *meaning* is theirs to steer — never leave the change only in chat. You
   edit the prose; they own the meaning.
2. **Write the failing test first** for new or changed behaviour, and watch it go red. A test written
   after the code can only confirm it, never contradict it.
3. **Make it pass without weakening the test.** Never skip, delete, or loosen an assertion to go
   green — and it must TAG the requirement (`checkReq`) so the proof is assertion-backed. Never invent
   or change a requirement's meaning on the human's behalf.
4. **Correct the doc in place, with the reason attached.** When the code teaches you a requirement was
   wrong, fix the requirement and say why — conforming a doc silently to the code is how a requirement
   quietly becomes false.
5. **If the screen has golden data, its expected values are part of the change.** A data-driven screen
   whose test asserts exact seeded values (`spec/<screen>/golden.json`; see kg-e2e) will usually go red
   when the feature changes those numbers — that red *is* the change being noticed, not a chore to
   silence. Decide which is wrong, the test or the code (never just re-baseline to go green). If the new
   numbers are intended: update the seed (`spec/_seed.ts`) when the inputs changed, re-capture
   `golden.json` against the re-seeded app, and update the values the PRD names. Because those named
   numbers are requirement *meaning*, that update is the human's to decide — propose it, don't
   self-approve it.

## 4. After the change, close the loop — your edit rippled

A change to one screen is never local. It can leave a sibling's PRD contradicting the one you just
edited, or a sibling's test still asserting the behaviour you just changed — a false green the board
cannot catch on its own. Before you call the work done:

1. **Run the changed screen's test to green — then run the whole suite.** `npm run e2e`. A change to
   shared behaviour breaks a *sibling's* test, and only running everything catches it; a green on the
   one screen you touched says nothing about the ones you did not.
2. **Re-run the conflict scan.** Your new requirement text may now contradict another feature's PRD.
   Trigger it from the board's **Scan** action (`POST /api/scan`) — it re-reads every PRD and surfaces
   any new contradiction for the human to settle. (It is an agent job: it needs a valid `claude` login
   and takes minutes.)
3. **Run the stale worklist and clear every item your edit caused.**
   ```bash
   node tools/staff.mjs --stale     # every screen no longer settled and proven, with the reason
   ```
   A stale test still asserting the old behaviour is a false green — do not leave it. Re-run the test
   until nothing on the list traces back to your change.
4. **If clearing an item needs a requirement decision, stop and escalate.** Picking the canonical side
   of a conflict, or changing what a requirement *means*, are the human's — never decide one to make the
   list go quiet. These are the same stops as section 2; they do not stop applying just because you are
   nearly done.
- **A bug found while the board was green is an escape.** Log it in `spec/_escapes.md`,
  strengthen the assertion that should have caught it in the same turn, and bake the lesson
  into the skill that authored the weak proof. When in doubt whether a proof is real, run
  `npm run proof lint` — and `node tools/proof-integrity.mjs perturb <screen>` to demand the
  golden numbers actually bite.

## Why this exists

A board nobody consults before coding is an expensive lint. The board makes the truth *visible*; this
skill is what makes you *maintain* it — so the next session, and the one after, build to the same
requirement instead of each guessing a different one silently.
