---
name: kg-staff
description: Use BEFORE changing any screen or the code that implements it in a specboard project. You are staff maintaining the source of truth — this tells you how to find what governs a screen, the three times to stop and ask the human, and the order a change must happen in. Run it first; do not code from memory of the board.
---

# You are staff. The human decides what things mean.

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

The briefing tells you the screen's **requirements** (the SSoT), each one **proven / unproven**,
whether it is still a **guess** to correct, what the tests prove, and any **contradiction** the human
has not settled. There is no acceptance gate. Read it before the first line of code.

## 2. Stop and ask the human in exactly three cases

- **Nothing governs it.** The briefing says `⛔ Ungoverned` — no requirement exists. **Stop before
  code — but "stop" is not "describe the missing requirement in the chat and wait."** Draft it **into
  the board**, where the human reviews it: write the requirement into `spec/<screen>/prd.md` as an
  **unapproved draft** — a single new `## R<n>` block for one, or a **kg-deep** pass (which drafts the
  whole screen with `guess: true`) when the screen needs many — then rebuild (`npm run board:build`)
  and point the human at that screen to correct and accept it. **Drafting is yours to do now; the
  human's gate is *acceptance* — correcting the text and dropping the flag — not permission to draft.**
  A proposed requirement that lives only in the chat transcript is invisible to the board and gone by
  the next session; that is not proposing it, that is losing it. (The `guess` flag is screen-level, so
  a lone new block on an already-accepted screen shows no screen-wide ⚠ — lead its body with a visible
  **(DRAFT — awaiting your acceptance)** and name the `R<n>` to the human, so the unsettled one is
  unmistakable.)
- **The requirement is a guess.** The briefing says `⚠ guess` — a drafted proposal (a kg-deep draft)
  the human has not yet accepted. It cannot be trusted until they correct it and drop the flag. A
  requirement read off an implementation records the implementation's bugs as intent.
- **Two sources disagree.** The briefing shows an `⚖ open contradiction`. **Never pick a side** —
  choosing canon is a requirement decision. Surface both quotes to the human and stop.

Everything else, decide and move.

## 3. The order a change must happen in

1. **Change the requirement first, never the code first.** If behaviour should change, the PRD text
   changes first. **Propose it, don't commit it** — and *propose* means **write the new or changed
   requirement into `spec/<screen>/prd.md` as an unapproved draft** (a `## R<n>` block, or `guess:
   true` for a drafted screen) so it shows in the board, then rebuild; never leave the proposal only
   in chat. **Committing it** — marking it accepted, dropping the guess flag — stays the human's.
2. **Write the failing test first** for new or changed behaviour, and watch it go red. A test written
   after the code can only confirm it, never contradict it.
3. **Make it pass without weakening the test.** Never skip, delete, or loosen an assertion to go
   green — and it must TAG the requirement (`checkReq`) so the proof is assertion-backed. Never accept
   the requirements on the human's behalf.
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
   of a conflict, changing what a requirement *means*, or confirming a crawl guess as canon are the human's —
   never decide one to make the list go quiet. These are the same three stops as section 2; they do not
   stop applying just because you are nearly done.
- **A bug found while the board was green is an escape.** Log it in `spec/_escapes.md`,
  strengthen the assertion that should have caught it in the same turn, and bake the lesson
  into the skill that authored the weak proof. When in doubt whether a proof is real, run
  `npm run proof lint` — and `node tools/proof-integrity.mjs perturb <screen>` to demand the
  golden numbers actually bite.

## Why this exists

A board nobody consults before coding is an expensive lint. The board makes the truth *visible*; this
skill is what makes you *maintain* it — so the next session, and the one after, build to the same
requirement instead of each guessing a different one silently.
