# Walkthrough story-rebuild implementation plan (staged)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> **Execution contract (differs from a normal plan):** ONE stage at a time. After each stage's task review passes, the orchestrator STOPS, shows the human the live board, and WAITS for their verdict (continue / adjust / stop). Never auto-continue to the next stage. Stages 2–4 below are outlines; each is detailed into full task steps ONLY after the previous checkpoint passes.

**Goal:** Rebuild the #howitworks walkthrough around the manager/staff story (design Revision 3): Without the tool → With the tool → See it work → Do it on your app.

**Architecture:** Same as the shipped walkthrough — `WALKTHROUGH` data baked to static DOM in `tools/build-board.mjs`, tiny client stepper, tests in `spec/board/test.spec.ts` tagging R11/R12. Each stage is one revertable commit.

**Spec:** `docs/superpowers/specs/2026-08-05-onboarding-and-skill-eval-design.md` (Revision 3).

## Global constraints

- Read CLAUDE.md; `node tools/staff.mjs board` first. All prior traps hold: generated board.html; backtick-free `\\n`-escaped emitted strings; `new Function()` guard; tokens only; marks not hue alone; indigo = your-turn only; one inverted element per view at rest; WCAG AA; TDD red-first; never weaken an assertion; suite on a free port (never 4173, never `-g`); board's own coverage lags one run; stage explicit paths only; run artifacts unstaged.
- Board copy says "you / the human / manager" — never the swept three-letter title. "Done, boss!" is allowed (staff's voice).
- The analogy carries voice; every beat cashes out in a concrete artifact. A beat that can't point at a real artifact gets cut, not decorated.
- R11 text lands verbatim as drafted below, `guess:` retained — wording is the human's gate.

---

### Stage 1 / Task 1: Acts 1–2 become Without / With (static; the taste test)

**Files:**
- Modify: `tools/build-board.mjs` (WALKTHROUGH acts 1–2 data + `moment`/`mirror` step kinds in the act renderer + minimal CSS)
- Modify: `spec/board/prd.md` (revise R11 draft in place)
- Modify: `spec/board/test.spec.ts` (rewrite the R11 content test; stepping + R12 tests untouched)

**Interfaces:**
- Acts keep `data-act="1..4"` and the per-act stepper contract (`.wstep[data-wact][data-step]`, `.wnav`, first step `.on`). Act titles become: `Without the tool` / `With the tool` / `See it work` / `Do it on your app` (pips derive from titles).
- New step kinds rendered inside the existing `wAct` switch: `moment` → `.wstep` containing `.wmoment` (a `.wm-label` caption + body text); `mirror` → a full-width closing note frame `.wmirror`. Act 1's closing `proof` step reuses the existing `proof` kind (chip ok / chip bad) unchanged.
- Acts 3–4 data, renderers, goldens, CTA, `#fullmethod`: UNTOUCHED this stage.

- [ ] **Step 1: Staff briefing** — `node tools/staff.mjs board`; read the `WALKTHROUGH` object and `wAct` renderer region of `tools/build-board.mjs`, and the current R11 test in `spec/board/test.spec.ts`.

- [ ] **Step 2: Revise the R11 draft** in `spec/board/prd.md` — replace the R11 block with (verbatim):

```markdown
## R11 — The guide is the manager's story: without the tool, then with it

#howitworks opens on two situations with the SAME three moments — assigning work, reviewing it, two
weeks later. Without the tool: the task lives in a chat scroll ("Done, boss!"), review is a wall of
code you approve blindly, and the same bug returns — closing on a green assertion shown beside the
screen it fails to prove. With the tool: the task is a written requirement whose meaning you confirm,
the work arrives as a recording where every asserted number is visible, and the moment a proof stops
holding the requirement flips to unproven — proven is computed from the tests, never stored. Then the
walkthrough shows it working for real (a labelled illustration asserting exact golden values held on
screen) and ends on this project's own derived next action. Click-to-advance; the mirror is the
argument; the proof is demonstrated, never described.

*Drafted 2026-08-05 transcribing design revision 3 (the manager/staff rebuild) — wording awaits the
human; reword freely, the test asserts content not phrasing.*
```

- [ ] **Step 3: Rewrite the R11 content test** (replace the existing "four-act walkthrough" test body; keep the stepping test and R12 test as they are):

```ts
test('The guide opens as manager and staff — without, then with', async ({ page }) => {
  await coverReqs('R11')
  await page.goto('/#howitworks')
  await page.waitForSelector('#howview:not([hidden])')
  await checkReq('R11', async () => {
    const wt = page.locator('#walkthrough')
    await expect(wt.locator('.act')).toHaveCount(4)
    const w1 = wt.locator('.act[data-act="1"]'), w2 = wt.locator('.act[data-act="2"]')
    // the same three moments, told twice — the mirror IS the argument
    for (const a of [w1, w2]) {
      await expect(a.locator('.wmoment')).toHaveCount(3)
      await expect(a).toContainText('Assigning work')
      await expect(a).toContainText('Two weeks later')
    }
    await expect(w1).toContainText('Done, boss')
    // without ends on the falsifiable proof: a green test beside the screen it fails to prove
    await expect(w1.locator('.chip.ok')).toContainText('test green')
    await expect(w1.locator('.chip.bad')).toContainText('stale')
    // with names the mechanism once, only after the mirror
    await expect(w2).toContainText('computed')
    await expect(w2).toContainText('unproven')
    // the surviving acts still carry the goldens, the illustration label, and the reference
    const demo = wt.locator('.wdemo')
    await expect(demo.locator('.wpin')).toContainText(/illustration/i)
    await expect(demo).toContainText('2,400,000')
    await expect(demo).toContainText('2,671,006.87')
    await expect(page.locator('#fullmethod')).toHaveCount(1)
  })
})
```

- [ ] **Step 4: See it fail** — `npx playwright test spec/board --config=playwright.board.ts`. Expected: the rewritten R11 test FAILS (`.wmoment` count 0, "Done, boss" absent); stepping + R12 tests still pass.

- [ ] **Step 5: Replace acts 1–2 in `WALKTHROUGH`** (verbatim; act 1's `proof` step keeps the existing kind):

```js
{ n: 1, title: 'Without the tool', sub: 'a brilliant, fast hire whose work you cannot review',
  steps: [
    { kind: 'moment', label: 'Assigning work', body: '"Build the rent-edit feature." — "Done, boss!" The task now lives only in a chat scroll. Nothing is written down.' },
    { kind: 'moment', label: 'Reviewing', body: '"Does it work?" You get a wall of code and "all 40 tests pass." You cannot check any of it without reading everything — so you approve blindly.' },
    { kind: 'moment', label: 'Two weeks later', body: 'The feature breaks. Staff — no memory of the old decision — fixes it by changing what it was supposed to do. Same bug, third time.' },
    { kind: 'proof', green: 'test green', wrong: 'screen shows rent = 100 (stale)',
      note: 'The assertion passed. Nobody looked at the screen. A green you cannot see is trust, not review.' }
  ] },
{ n: 2, title: 'With the tool', sub: 'the same hire, plus a system that makes work reviewable',
  steps: [
    { kind: 'moment', label: 'Assigning work', body: 'The task becomes a written requirement — one shared document. Staff drafts it; you confirm the meaning. That is your only gate.' },
    { kind: 'moment', label: 'Reviewing', body: 'The work arrives as a recording where every asserted number is visible on screen. You review by watching, not by reading code.' },
    { kind: 'moment', label: 'Two weeks later', body: 'The moment a proof stops holding, the requirement flips to unproven — you see drift when it happens, not two weeks after. Proven is computed from the tests, never stored.' },
    { kind: 'mirror', note: 'Same hire, same speed. The difference is a system: work arrives reviewable by watching, and a written discipline makes the classic mistakes hard.' }
  ] }
```

- [ ] **Step 6: Render the new kinds.** In the act renderer: `moment` → `.wstep` with `.wmoment` (`.wm-label` small-caps caption via existing token classes + a body line); `mirror` → `.wmirror` quiet full-width note (wash tint, hairline border, a mark). CSS additions layout-only, tokens only. No new client JS; the stepper already handles arbitrary step counts. Act 2's old `inversion`/`beforeafter` steps are removed with their data (renderer branches may stay if other acts use them — delete only if now unreferenced, with a one-line reason).

- [ ] **Step 7: Rebuild + green** — `npm run board:build` (guard passes), `npx playwright test spec/board --config=playwright.board.ts`, then full `npm run e2e` on a free port. Expected: all pass.

- [ ] **Step 8: Commit** (explicit paths):

```bash
git add spec/board/prd.md spec/board/test.spec.ts tools/build-board.mjs board.html
git commit -m "feat(board): the guide opens as the manager's story — without the tool, then with it, the same three moments mirrored (R11 redrafted, awaiting the human; stage 1 of the story rebuild)"
```

**CHECKPOINT 1 (orchestrator):** task review → serve on a free port → show the human Acts 1–2 live → WAIT. Continue to Stage 2 only on their word.

---

### Stage 2 (outline — detail after checkpoint 1): voice + chrome
Re-voice Act 3 sub ("what reviewable staff work looks like") and Act 4 sub/flow-chain captions ("your gate" / "staff's discipline") in `WALKTHROUGH` data; add the size contract line to the walkthrough header ("4 acts · ~2 min"); upgrade the pip nav to a done/current/remaining tracker (client: mark pips done as their act's last step is reached — small emitted-script change, backtick rules apply). Tests: extend the stepping test for pip states; content asserts for the re-voiced subs.

### Stage 3 (outline — detail after checkpoint 2): the live drift beat
In Act 2's "Two weeks later" moment: an interactive mini-frame — a requirement chip shown proven beside its assertion; clicking "delete the assertion" flips the chip to unproven (pure client state on baked DOM, no timers, reversible via a reset control); the caption names "computed, never stored" only after the flip. Emitted-literal risk is the whole stage: plain-quote concatenation, guard-checked, test-first (assert flip on click, assert no auto-flip after 1200ms).

### Stage 4 (outline, optional — detail after checkpoint 3): spine + harder cases
The named Write → Tag → Run → Fold → Derive strip threaded above the acts (current act lights its stage), and a "harder cases" section after Act 3: not-reached, then the coverage shape redrawn three times (1 req←1 test → 1 req←2 tests → 1 test→2 reqs via a qualified tag).

### Release gate (unchanged)
Held for the human's explicit go: R11/R12 wording (guess flags), version bump 0.21.0, push, dojostack kg-update.

---

## Stage 1R (added after checkpoint 1): Acts 1–2 become WATCHABLE SCENES

**Checkpoint-1 verdict:** the human rejected the prose-step form ("no one will watch — I expect real
visualization"). The approved direction (mock taste-locked 2026-08-05): every step is a drawn,
animated mock-app scene — things move, numbers land, chips flip. Acts 1–2 first, checkpoint after.

**Scene grammar (from the approved mock):**
- A scene = a small drawn mock (HTML/CSS or inline SVG) baked into the step's DOM; its animation
  PLAYS when the step is revealed and ENDS IN A HELD STATE (animation-fill-mode: forwards; no
  loops, no timers advancing steps — the stepper stays click-driven).
- The `.wstep` show/hide is display-based, so CSS animations restart naturally each time a step is
  entered — no new client JS.
- `prefers-reduced-motion: reduce` shows end-states with no motion.
- Tokens only; bengara = failure beats, koke = ok beats, indigo ONLY on the you-confirm beat (it is
  your-turn); every state carries a mark; WCAG AA; captions shrink to ≤1 line under each scene.

**The eight scenes:**
- A1 S1 *Assigning work*: chat mock — manager bubble "Build the rent-edit feature.", staff bubble
  "Done, boss!" pops instantly, then the thread scrolls up and fades (the task lost in scroll); a
  ghosted empty-document icon lands: nothing written down.
- A1 S2 *Reviewing*: a wall of greeked code lines + a green "40 tests passing" badge; nothing else
  to look at — the caption's "you approve blindly" is the only readable thing.
- A1 S3 *Two weeks later*: a calendar flips ×2; a feature card cracks to bengara; a "fix" visibly
  REWRITES the requirement label instead of the code; counter: same bug · 3rd time.
- A1 S4 *the proof*: split scene — left a green assertion chip (`toBeVisible ✓`), right a mock
  screen with rent = 100 highlighted stale; "NOBODY LOOKED" between them. (Evolves the existing
  proof step into a drawn scene.)
- A2 S1 *Assigning work*: the chat bubble transforms into a written requirement card; a `guess:`
  flag chip on it; the flag drops when "you confirm the meaning" (indigo beat) — the one thing
  waiting on you.
- A2 S2 *Reviewing*: staff hands over a recording player mock — inside it, a miniature of the
  golden scene (table cell → chart values visible) plays once; "you review by watching."
- A2 S3 *Two weeks later*: a code line mutates; the board-mock's chip flips proven → unproven the
  same instant; "you see drift when it happens."
- A2 S4 *mirror*: the two summaries drawn side-by-side — same hire, same speed; left column's
  beats in bengara marks, right column's in koke; one line: the difference is a system.

**Task contract:** same files as Stage 1 (build-board.mjs, spec/board/test.spec.ts; prd.md only if
R11 needs a scene-truthful clause — propose, don't decide). TDD: R11 test gains falsifiable
scene assertions (presence + end-state content: "Done, boss" bubble, 40-passing badge, stale 100,
the guess-flag element, the proven→unproven flip pair) — RED first. Suite green on a free port;
build guard passes; sequenced AFTER the doctrine pass lands (same-file).
**CHECKPOINT 1R:** live board to the human; wait. Acts 3–4 scenes are a later slice, same grammar.
