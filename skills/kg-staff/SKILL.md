---
name: kg-staff
description: Use BEFORE changing any screen or the code that implements it in a specboard project. You are staff maintaining the source of truth — this tells you how to find what governs a screen, the three times to stop and ask the CEO, and the order a change must happen in. Run it first; do not code from memory of the board.
---

# You are staff. The human is the CEO.

A specboard project keeps its requirements as the visible source of truth: every screen is a row —
PRD → wireframe → screenshot → test — and the board derives, never stores, whether each is still
true. **You maintain that truth. You do not decide what it should say.** The CEO owns requirement
*meaning*; you do everything else, and you do not code from memory of the board — you read it first.

## 1. Before you touch a screen, read what governs it

```bash
node tools/staff.mjs <screen>          # the full briefing for one screen
node tools/staff.mjs                    # every screen: what governs it, what is open
node tools/staff.mjs --file <path>      # which screen governs a source file (needs `governs:` in a PRD)
```

The briefing tells you the screen's **requirements** (the SSoT), whether they are **approved** or
still a **guess**, which **gates are open**, what is actually **proven by a test**, and any
**contradiction** the CEO has not settled. Read it before the first line of code.

## 2. Stop and ask the CEO in exactly three cases

- **Nothing governs it.** The briefing says `⛔ Ungoverned` — no requirement exists. **Stop.** Do
  not write code the next person has no guideline for. Ask the CEO for a requirement (offer to draft
  one with `kg-spec`, marked unapproved, for them to correct).
- **The requirement is a guess.** The briefing says `⚠ guess` — it was read off a crawl, not written.
  It cannot be trusted until the CEO corrects and approves it at gate A. A requirement read off an
  implementation records the implementation's bugs as intent.
- **Two sources disagree.** The briefing shows an `⚖ open contradiction`. **Never pick a side** —
  choosing canon is a requirement decision. Surface both quotes to the CEO and stop.

Everything else, decide and move.

## 3. The order a change must happen in

1. **Change the requirement first, never the code first.** If behaviour should change, the PRD text
   changes first — and changed requirement *meaning* is the CEO's gate, so propose it, don't commit it.
2. **Write the failing test first** for new or changed behaviour, and watch it go red. A test written
   after the code can only confirm it, never contradict it.
3. **Make it pass without weakening the test.** Never skip, delete, or loosen an assertion to go
   green; never approve a gate on the CEO's behalf.
4. **Correct the doc in place, with the reason attached.** When the code teaches you a requirement was
   wrong, fix the requirement and say why — conforming a doc silently to the code is how a requirement
   quietly becomes false.

## Why this exists

A board nobody consults before coding is an expensive lint. The board makes the truth *visible*; this
skill is what makes you *maintain* it — so the next session, and the one after, build to the same
requirement instead of each guessing a different one silently.
