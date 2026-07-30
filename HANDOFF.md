# Handoff — finish the spec board

You are taking over a working tool mid-build. **Read this whole file before touching anything.**
It is written to save you from the traps that already cost the previous session hours.

Repo: `/Users/laishuching/workspace/claude-plugin-spec`
Branch: `main`. Everything new is **untracked** (`spec/`, `tools/`, `playwright.board.ts`,
`board.html`). Nothing has been committed yet — commit early so you can bisect your own mistakes.

---

## 1. What this product is

A **visualised spec-driven development** board, shipped as a Claude Code plugin. One HTML page
shows every screen in a project as a row with four columns:

| 1 · PRD | 2 · Draft | 3 · Screen | 4 · E2E |
|---|---|---|---|
| requirements — the source of truth | a hi-fi clickable wireframe | a screenshot of what got built | the test that proves it |

The point is **staleness**: edit the PRD and the draft goes stale; change the draft and the
screenshot goes stale; edit anything and a green test result goes stale. There is **no status
field anywhere** — every cell is derived by comparing a stored approval hash against the current
content hash. Two human gates: **gate A** (PRD vs draft — "is this what I meant?") and **gate B**
(draft vs screenshot — "did you build it?").

The tool **dogfoods itself**: its own six screens are the rows on its own board.

The human decides what things mean. They approve requirement *meaning*; you do everything else. Do not ask
permission to work. When a decision is genuinely theirs (new requirement, changed requirement,
picking a canonical side in a conflict), stop and ask — otherwise decide and move.

**The human's stated preferences** (learned the hard way this session):
- Visual over prose. Show a screenshot or a diagram, not paragraphs.
- Be critical and honest. Say what is broken and what you did not do.
- Never take control away from the user (no auto-advancing after a verdict, etc).
- **Always open pages in their real Chrome** via the `claude-in-chrome` MCP tools, never the
  Claude Browser preview pane. `file://` URLs fail — serve over http and navigate to localhost.

---

## 2. Current state — verified, not claimed

**16/16 Playwright tests pass, idempotently, from a dirty starting state.**

```
screen                1·PRD    2·draft   3·screen  4·e2e
board                 ok       ok        ok        pass      ← complete
gate-draft-review     ok       ok        ok        pass      ← complete
gate-screen-review    ok       ok        ok        pass      ← complete
conflicts             ok       review    missing   missing   ← draft only
dispatch              ok       ok        missing   missing   ← draft only
init                  ok       ok        missing   missing   ← draft only
```

### Built and working
- The board grid: areas, collapsible groups, three filters, search with match count, live
  wireframe thumbnails (capped 280px with a "continues" marker), computed cell states.
- Detail view per screen at `#/<screen>` — **four independently scrolling panels**
  (PRD / draft / screenshot / E2E), a real PRD **diff** when the draft is stale (approving
  snapshots `approvedPrdText`, so gate A can show what moved), and a sticky verdict footer.
- Gate A and gate B, both writing pins to `spec/<screen>/state.json`.
- Rejection with a mandatory reason, kept as a **list** (`draftRejections`) so every round of
  feedback survives into the next redraft.
- **Run bridge**: run all tests or one screen's tests from the HTML, streaming output into a run
  panel, plus watch mode, background mode, and a capped 20-entry run history in `spec/_runs.json`.
- **Dispatch bridge**: `POST /api/dispatch {screen}` spawns `claude -p --permission-mode
  acceptEdits` to redraft a wireframe from its PRD + every rejection sentence. **Proven working**:
  a rejection asking for Undo controls produced a redraft with 3 working Undo buttons.
- Lightbox on every screenshot (Actual size / Fit, `esc`).
- Tests live at `spec/<screen>/test.spec.ts` and **produce `spec/<screen>/screen.png` themselves** —
  column 3 is a byproduct of column 4, never a separate capture step.
- A **state guard** (`spec/_state-guard.ts`) snapshots and restores every `state.json` around a
  test run, because the specs drive real gates and were silently approving screens.

### NOT built
- **Conflict scanner.** No `spec/_conflicts.json` has ever existed. The two conflicts in
  `spec/conflicts/draft.html` are hand-written fakes.
- **Conflicts page in the board.** The *draft* has a `Conflicts 2` header button; the *build* has
  no such control. You cannot reach a conflicts view from the board at all.
- **Init page in the board**, and no crawler.
- Screenshots and tests for `conflicts`, `dispatch`, `init`.

### ⚠️ There is a half-finished edit you must resolve first
`tools/serve-board.mjs` was mid-edit when the session ended. It **parses**, but:
- `runJob()`, `readConflicts()`, `scanPrompt()`, `startScan()` were just added and are **not
  wired to any endpoint** (`/api/scan` does not exist).
- `startDispatch()` still contains its own older copy of the spawn/diagnose logic that `runJob()`
  now generalises. **Refactor `startDispatch` to call `runJob`** and delete the duplication.
- `readConflicts` is `export`ed from a server entry file, which is odd. Move the conflicts store
  into `tools/spec-store.mjs` where the other readers live.

---

## 3. Architecture

```
spec/<screen>/prd.md         requirements + frontmatter (screen, area, title, route)
spec/<screen>/draft.html     hi-fi clickable wireframe, authored at exactly 1280px wide
spec/<screen>/screen.png     written BY the test, never by hand
spec/<screen>/test.spec.ts   Playwright spec for that screen
spec/<screen>/state.json     approval pins + rejection history (the only mutable state)
spec/_design.css             ONE design system, linked by drafts, inlined into board.html
spec/_results.json           Playwright JSON report (last run only)
spec/_runs.json              capped run history

tools/spec-store.mjs         reads/derives everything. THE authority on cell state.
tools/build-board.mjs        renders board.html. Draws only — no reading logic.
tools/serve-board.mjs        server: static allowlist, gates, runs, dispatch, SSE, watch
playwright.board.ts          testDir ./spec, testMatch */test.spec.ts, workers:1
board.html                   generated artifact
```

Commands: `npm run board` (serve on 4173), `npm run e2e`, `npm run board:build`.
`BOARD_URL=http://host:port` drives an already-running site and starts/stops nothing.
`BOARD_PORT` moves the board's own port.

---

## 4. Design system — non-negotiable

`spec/_design.css` is the single source. **Never** introduce a raw hex colour, a font size outside
the scale, or a radius outside the tokens — in a draft or in the board.

Traditional Japanese dye colours at low saturation on unbleached paper:

| token | role |
|---|---|
| 墨 `--ink` `#1c1b18` | text, rules |
| 生成り `--paper` / `--canvas` | warm off-white surfaces, never pure white |
| 藍 `--ai` `#2f4a63` | **your turn** — needs review, attention |
| 弁柄 `--bengara` `#8d4a38` | sent back, PRD moved, a re-look |
| 苔 `--koke` `#4d5c37` | approved, settled, passing |
| 山吹 `--yamabuki` `#8a6412` | running / in flight |

Rules that were learned by getting them wrong:
- **Hue names a state; it never carries it alone.** Every chip also has a 6px `.mark` (filled /
  half / hollow / dash) so status survives greyscale and low vision.
- **Exactly ONE inverted element per screen** — the `waiting on you` count. Making every
  "needs review" chip a solid fill produced a dozen competing dark blocks and destroyed all
  hierarchy. All status chips are tints.
- **An action wears the colour of the state it produces.** "Looks right" is moss green because
  approved is moss green. "Send it back" is an iron-red outline, not a filled red button.
- Radius by how much you touch a thing: `--r-sm` 4px chips → `--r` 6px controls → `--r-md` 10px
  cards → `--r-lg` 14px sheets. Zero only where something meets the viewport edge.
- Shadow only for things that genuinely float (modals, the run panel) plus a hover lift on
  clickable rows. Never on in-flow cards.
- **Every text/background pair must pass WCAG AA (4.5:1).** This was measured and failed at 2.18:1
  once. Re-measure after any colour change — there is a probe snippet in §7.

### What a draft must be
- Links `../_design.css`. Authored at **exactly 1280px** wide, kept under ~940px tall so it
  thumbnails whole.
- **Hi-fi and genuinely interactive** — fake data, no backend, but every button, toggle, tab and
  field must do something visible. A static picture cannot answer "is this what I meant" about a
  click. 35 of 54 controls were once dead; do not regress that.
- No network requests, no external images or scripts.

---

## 5. Traps that have already bitten — do not rediscover these

1. **`board.html`'s script is emitted inside a JS template literal.** An unescaped `\n` or a
   backtick becomes literal whitespace and silently breaks the whole script — the page renders
   perfectly with every listener dead. This shipped twice. `build()` now parses the emitted script
   with `new Function()` and refuses to write a broken board. **Keep that guard.** Write `\\n`.
2. **`.dt[hidden]` needs an explicit `display:none`.** An author `display:flex` beats the `hidden`
   attribute, so all six detail views rendered stacked and you saw the last one — it looked exactly
   like the router picking the wrong screen.
3. **A layout measurement must never be able to disarm the page.** `fit()` read
   `doc.documentElement.scrollHeight` on an unparsed srcdoc iframe, threw on first run, and killed
   every listener registered after it. It is wrapped in `safeFit()` now.
4. **The server must not import the builder.** Node caches modules, so a long-running server kept
   rebuilding with stale code and silently overwrote fresh output. `build()` runs as a **child
   process**. Editing `tools/spec-store.mjs` or `serve-board.mjs` still needs a server restart.
5. **Live reload fights Playwright.** A gate POST notifies the page, which reloads mid-test and
   aborts the navigation (`ERR_ABORTED`). Live reload is off when `navigator.webdriver` is true.
   The trade is explicit: live reload is not covered by the suite.
6. **The static server is an allowlist, not a traversal guard.** It once served `.git/config`.
   Only `board.html` and `spec/**` are reachable. Keep it that way — this plugin runs inside other
   people's repos.
7. **Same-document hash navigation does not reload.** Going from `/` to `/#/board` fires
   `hashchange`, not a load. Both `popstate` and `hashchange` are handled. When verifying by hand,
   force `location.reload()` or you will screenshot a stale page and chase a phantom bug. **This
   happened four times.**
8. **Tests must establish their own preconditions.** Three specs asserted inherited global state
   and passed only on a second run. Never assert a board-wide tally; drive the transition.
9. **A rejection with no reason is refused** by both the UI and the API. It clears an approval and
   says nothing about what to change, which is worse than not rejecting.
10. **`claude -p` needs a valid login.** If a job reports "nothing changed", check `transcript` for
    a 401 before you go debugging the prompt. `diagnose()` already names this.
11. A redraft takes **~4 minutes**. Anything crawling multiple routes will take much longer —
    use the background mode, and never block a request on it.

---

## 6. The work remaining, in order

### A · Wire the scanner (finish the half-done edit)
- Resolve §2's ⚠️ first: refactor `startDispatch` onto `runJob`, move the conflicts store into
  `spec-store.mjs`.
- Add `POST /api/scan` → `startScan()`. It spawns Claude with every `prd.md` and asks it to write
  `spec/_conflicts.json`. The prompt is already written (`scanPrompt()`) and is deliberately
  strict: a contradiction is **one fact stated two incompatible ways**, never a gap or a TODO, and
  an empty `findings: []` is a valid, useful answer. Noise is what makes a list stop being opened.
- Verify it produces valid JSON and that the findings are *real* — read them yourself and say
  honestly whether they are contradictions or noise. Measure precision; do not assume it.

### B · The Conflicts page
- A tool-level view, not a screen. **Route: `#conflicts` (no slash).** `#/<screen>` is taken by
  screen details — do not collide.
- Add the header button the design already specifies (`spec/board/draft.html` has `Conflicts 2`).
  Show the open count. This drift — design has it, build does not — is exactly what gate B would
  have caught if the row had a screenshot; it only surfaced because the human asked.
- Render each finding: subject, both positions quoted in full with their source, blast radius,
  a radio to pick canon, and a note field. Follow `spec/conflicts/draft.html` — it is the
  approved-then-redrafted design and includes per-row **Undo** on settled items.
- **The tool never picks a side.** Choosing canon is a requirement decision. Store decisions keyed
  by the *content* of the conflict (not list position) so a rescan cannot resurrect a settled one.
- Resolving dispatches a `runJob` that rewrites the losing PRD, after which every screen
  downstream goes stale on its own via the existing hash logic.

### C · The Init page
- Route `#init`. Form: how to start the app, its base URL, which routes matter, optional sign-in
  script. Persist to `spec/_config.json`.
- **The human explicitly asked that this let you point at an already-running dev server** by port /
  URL rather than always starting one. `playwright.board.ts` already honours `BOARD_URL` and
  `BOARD_PORT`; surface the same choice here and write it into the config.
- Crawl: visit each route with Playwright, screenshot it, then a `runJob` drafts a `prd.md` per
  route. **A crawled PRD is a guess, must be visibly marked as one, and must never be canon** —
  the draft and screen cells stay unapproved so the loop still starts at gate A.
- Re-running finds new routes without touching screens that already have decisions.
- Nothing found is the greenfield case: same flow, no rows, a prompt to write the first PRD.

### D · Screenshots and tests for the last three rows
- `spec/dispatch/test.spec.ts` — the run panel **is** the built dispatch screen. Test: start a
  run, assert the panel streams, assert a second concurrent run is refused (409), assert cancel,
  screenshot.
- `spec/conflicts/test.spec.ts` and `spec/init/test.spec.ts` once B and C exist.
- Each spec writes its own `spec/<screen>/screen.png`.
- Then approve gate A and gate B for those rows so all six read `ok / ok / ok / pass`.

### E · Finish
- `npm run e2e` green **three times in a row from a dirty state**.
- Then the human's standing request: run the whole tool end to end, clicking every control, three
  times over — flow, then debugging, then design/layout — being critical and honest each pass.
- Delete v1: `src/` (13k lines), `viewer.template.html`, `knowledge-graph/`, `fixtures/`,
  `scripts/`, `hooks/`, and 7 of the 8 `skills/` (keep the `kg-init` name). Archive
  `docs/superpowers/specs/2026-07-17-founding-design.md` — it holds real MCP-Apps research.
  **`hooks/hooks.json` currently fires a `⛔ STOP — nothing governs this path` briefing on every
  single write, including to the PRD files themselves. It is noise now; it goes with v1.**
- Rewrite `CLAUDE.md` for this product. It still describes v1's knowledge graph.
- Reconsider the plugin name (`plugin-spec` reads as "a spec for plugins"); still cheap to change
  while unpublished.

---

## 7. How to verify anything

```bash
npm run board                 # serve on 4173
npm run e2e                   # full suite
node tools/build-board.mjs    # rebuild only
```

Open in the human's **real Chrome**, never the preview pane, and force a reload after a hash change.

Contrast probe — run in the page console after any colour change; it must return `[]`:

```js
const lum=c=>{const[r,g,b]=c.match(/\d+/g).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b}
const ratio=(f,b)=>{const a=lum(f),x=lum(b);return(Math.max(a,x)+.05)/(Math.min(a,x)+.05)}
const bg=el=>{let e=el;while(e){const c=getComputedStyle(e).backgroundColor;if(c&&c!=='rgba(0, 0, 0, 0)')return c;e=e.parentElement}return'rgb(255,255,255)'}
[...document.querySelectorAll('.chip,.btn,.gbn,.lbl,.stat,.nm,.meta,.reqs li,.blank .b2')]
  .filter(e=>e.textContent.trim()&&ratio(getComputedStyle(e).color,bg(e))<4.5)
  .map(e=>e.textContent.trim().slice(0,24))
```

Also worth re-running per change: every draft loads at 1280px with no overflow, every control
responds to a click, and no draft throws.

---

## 8. The standard to hold

- **Never fake a green.** A test that would pass with the feature deleted is not a test. Column 3
  and 4 are honestly empty for unbuilt screens — keep them that way rather than making the board
  look finished.
- **Write the failing test first** for new behaviour, and watch it go red.
- **Never weaken a test to go green.** If a test breaks after a change, work out which of the two
  is wrong before you edit either. Several tests in this repo were *correctly* broken by good
  changes and needed their assertions fixed; several others were genuinely wrong.
- **Correct docs in place with the reason attached.** When the code teaches you a requirement was
  wrong, fix the requirement and say why inline — there is an example of this in
  `spec/board/prd.md` R4, which was corrected from "four states" to five.
- Report honestly: if something is not done, say so plainly and say what it needs.
