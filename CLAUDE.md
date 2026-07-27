# specboard — a visualised spec-driven development board

One HTML page shows every screen in a project as a **row of four columns**, left to right in the
order you work them:

| 1 · PRD | 2 · Draft | 3 · Screen | 4 · E2E |
|---|---|---|---|
| the requirements — the source of truth | a hi-fi, clickable wireframe | a screenshot of what got built | the test that proves it |

The product is about **staleness**. Edit the PRD and the draft goes stale; change the draft and the
screenshot goes stale; edit anything and a green test result goes stale. **There is no status field
anywhere** — every cell is *derived* by comparing a stored approval hash against the current content
hash. Two human gates: **gate A** (PRD vs draft — "is this what I meant?") and **gate B** (draft vs
screenshot — "did you build it?"). The tool **dogfoods itself**: its own six screens are the rows on
its own board.

## You are staff. The human is the CEO.

The CEO approves requirement **meaning**; you do everything else, and you do not ask permission to
work. When a decision is genuinely theirs — a new requirement, changed requirement text, a deleted
requirement, or picking a canonical side in a conflict — stop and ask. Otherwise decide and move.
Hand the CEO an **artifact or a diagram plus a recommendation**, never a paragraph of requirement
prose ([they prefer visual over text]). Be critical and honest: say what is broken and what you did
not do. Never take control away from the user (no auto-advancing after a verdict).

## The rules

1. **Write the failing test first** for any new or changed behaviour, and **watch it go red**.
   *Exempt:* pure refactors, spikes. A test written after the code can only confirm it.
2. **Assert something that can fail.** If a test would still pass with the feature deleted, it is
   not a test.
3. **Never fake a green.** Columns 3 and 4 are honestly empty for unbuilt screens — keep them that
   way rather than making the board look finished. Never weaken, skip, or delete a test to go green.
4. **When a test breaks after a change, find which of the two is wrong before editing either.**
   Several tests here were *correctly* broken by good changes and needed their assertions fixed;
   several others were genuinely wrong.
5. **Requirement *semantics* need CEO approval**: a new REQ, changed REQ text, a deleted REQ, or
   choosing a canonical side. You edit prose; the CEO owns meaning.
6. **Correct docs in place, with the reason attached.** When the code teaches you a requirement was
   wrong, fix the requirement and say why inline — conforming a doc silently to the code is how a
   requirement quietly becomes false. (Example: `spec/board/prd.md` R4, corrected from "four
   states" to five.)
7. **Fix your own defects in the turn you find them.** Do not log them as future work, do not ask.

## Architecture

```
spec/<screen>/prd.md         requirements + frontmatter (screen, area, title, route[, guess])
spec/<screen>/draft.html     hi-fi clickable wireframe, authored at exactly 1280px wide
spec/<screen>/screen.png     written BY the test, never by hand
spec/<screen>/test.spec.ts   Playwright spec for that screen — it produces screen.png
spec/<screen>/state.json     approval pins + rejection history (the only mutable per-screen state)
spec/_design.css             ONE design system, linked by drafts, inlined into board.html
spec/_results-index.json     per-screen test results, folded across runs (the E2E column reads this)
spec/_conflict-decisions.json  the CEO's adjudicated conflicts, keyed by content

tools/spec-store.mjs         reads/derives everything. THE authority on cell state.
tools/build-board.mjs        renders board.html. Draws only — no reading logic.
tools/serve-board.mjs        server: static allowlist, gates, runs, dispatch, scan, crawl, SSE, watch
tools/crawl.mjs              the Init crawler (a real browser + Claude job, outside the suite)
playwright.board.ts          testDir ./spec, testMatch */test.spec.ts, workers:1
board.html                   generated artifact — never edit by hand
```

Commands:

```bash
npm run board          # serve on 4173
npm run e2e            # the suite
npm run board:build    # rebuild board.html only
```

`BOARD_URL=http://host:port` drives an already-running site and starts/stops nothing. `BOARD_PORT`
moves the board's own port.

## The design system is non-negotiable

`spec/_design.css` is the single source — traditional Japanese dye colours at low saturation on
unbleached paper. **Never** introduce a raw hex colour, a font size outside the scale, or a radius
outside the tokens, in a draft or in the board. Hue names a state but never carries it alone (every
chip also has a mark). Exactly **one** inverted element per screen. An action wears the colour of the
state it produces. Every text/background pair must pass **WCAG AA (4.5:1)** — re-measure after any
colour change. A draft links `../_design.css`, is authored at exactly **1280px** wide, and is
genuinely interactive (every control does something visible).

## Traps that have already cost hours — do not rediscover them

- **`board.html`'s script is emitted inside a JS template literal.** An unescaped `\n` or a backtick
  becomes literal whitespace and silently breaks every listener while the page still renders.
  `build()` parses the emitted script with `new Function()` and refuses to write a broken board —
  **keep that guard**, and write `\\n` and avoid backticks in emitted strings.
- **The server must not import the builder.** `build()` runs as a **child process**; Node's module
  cache would otherwise overwrite fresh output with stale code. Editing `tools/spec-store.mjs` or
  `serve-board.mjs` still needs a server restart; editing `build-board.mjs` does not.
- **The static server is an allowlist, not a traversal guard** — only `board.html` and `spec/**` are
  reachable. This plugin runs inside other people's repos; it once served `.git/config`. Keep it so.
- **Same-document hash navigation does not reload.** Going from `/` to `#/board` fires `hashchange`,
  not a load. When verifying by hand, force `location.reload()` or you will screenshot a stale page.
- **Live streaming is on under automation; only page self-reload is held back.** The SSE run stream
  drives the panel even under `navigator.webdriver`; the reloads that would abort a Playwright
  navigation are the only thing suppressed.
- **A per-screen run writes a report covering only that screen.** It is *folded* into
  `_results-index.json`, never replaced — replacing blanks every other screen's E2E column. The fold
  is a Playwright reporter (`spec/_results-reporter.mjs`), because Playwright writes its report only
  *after* globalTeardown.
- **The state guard snapshots per process** (`_state-snapshot.<pid>.json`) and also records the set
  of screen directories, so a test that runs a nested run, seeds a conflict, or crawls a row leaves
  nothing behind. A file that did not exist before the run is removed after it.
- **Agent jobs (dispatch, scan, rewrite, crawl) need a valid `claude` login and take minutes.** They
  run detached so Cancel can kill the whole process group. They are real and live **outside** the
  deterministic suite — `diagnose()` names an expired login rather than reporting a silent no-op.
- **Another agent may be working in this repo.** Stage files explicitly — `git add -A` has swept
  someone else's in-flight work into an unrelated commit before.

## Authored vs measured

**Authored** facts are what behaviour *should* be — a human wrote them, they live in `spec/*/prd.md`,
they are the SSoT. **Measured** facts are what *is* — cell states, counts, results — derived from the
tree on every build. **Do not restate a measured fact in a doc**; a copy rots. If it changes when the
code changes it is measured and belongs in the board, not here. Keep this file rules-and-pointers only.
