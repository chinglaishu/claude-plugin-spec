# specboard — a visualised spec-driven development board

One HTML page shows every screen in a project as two ends only — the requirements, and the tests
that prove them:

| 1 · Requirements | 2 · E2E tests |
|---|---|
| the source of truth | the proof, run against the real app |

The product is about **drift**, computed and never stored. A requirement is **proven** only while a
test that *tags* it passed on an assertion that would fail without it; reword the requirement and it
reads **reworded** (awaiting the human); with no passing assertion it reads **unproven** — honestly
ungreen. **There is no status field anywhere** — every requirement's state is *derived* from the
stored accept pin and the folded test coverage against the current tree. **One human gate: accept the
requirements** ("are these what I meant?"). specboard owns **neither the wireframe nor the design** —
it tracks requirements and their proof, nothing else (no design field, no external-artifact chip). The
tool **dogfoods itself**: its own four screens are the cards on its own board.

## You are staff. The human decides meaning.

The human accepts requirement **meaning**; you do everything else, and you do not ask permission to
work. When a decision is genuinely theirs — a new requirement, changed requirement text, a deleted
requirement, or picking a canonical side in a conflict — stop and ask. Otherwise decide and move.
Hand the human an **artifact or a diagram plus a recommendation**, never a paragraph of requirement
prose (they prefer visual over text). Be critical and honest: say what is broken and what you did
not do. Never take control away from the user (no auto-advancing after a verdict).

## The rules

1. **Write the failing test first** for any new or changed behaviour, **watch it go red**, and **tag
   the requirement it proves** with `checkReq(id, fn)`. *Exempt:* pure refactors, spikes. A test
   written after the code can only confirm it.
2. **Assert something that can fail.** If a test would still pass with the requirement deleted, it is
   not a test — and it cannot make that requirement *proven*.
3. **Never fake a green.** A requirement with no passing assertion reads **unproven**; a flow that
   stops early leaves what it never reached **not-reached** — neither is green, and that honesty is
   the point. Never weaken, skip, or delete a test to go green.
4. **When a test breaks after a change, find which of the two is wrong before editing either.**
   Several tests here were *correctly* broken by good changes and needed their assertions fixed;
   several others were genuinely wrong.
5. **Requirement *semantics* need the human's gate**: a new REQ, changed REQ text, a deleted REQ, or
   choosing a canonical side. You edit prose; the human owns meaning, and the one gate is accepting
   the requirements — never accept them on the human's behalf.
6. **Correct docs in place, with the reason attached.** When the code teaches you a requirement was
   wrong, fix the requirement and say why inline — conforming a doc silently to the code is how a
   requirement quietly becomes false.
7. **Fix your own defects in the turn you find them.** Do not log them as future work, do not ask.

## How a test proves a requirement

Coverage is **many-to-many, by tag, at assertion granularity**. A test tags the requirement ids it
covers — qualified (`asset-plan:R5`), so a flow can prove another screen's requirement.

- `checkReq('R5', async () => { /* an assertion that would fail without R5 */ })` runs the assertion
  inside a `proves R5` step — the step's pass/fail *is* the requirement's proof, and it doubles as
  human-readable evidence. A bare id (`R5`) means this screen; a qualified one (`x:R3`) another.
- `coverReqs('a:R5', 'b:R3')` declares up front the full set a flow intends to reach, so a flow that
  stops early leaves the ones it never got to **not-reached** rather than silently absent.

`spec/_results-reporter.mjs` folds each run's per-requirement pass/fail/not-reached into
`spec/_results-index.json`; `tools/coverage.mjs` (pure, unit-tested) and `tools/spec-store.mjs`
derive each requirement's **proven / reworded / unproven** state. Aim for **few comprehensive** tests
— one flow proving several requirements — but every requirement still needs a real assertion (rule
2), so "fewer tests" can never buy a false green. A flow's *file* lives in the screen it **starts**
on; a requirement lists every test that covers it wherever that file lives.

## Architecture

```
spec/<screen>/prd.md         requirements + frontmatter (screen, area, title, route[, guess])
spec/<screen>/test.spec.ts   Playwright spec — tags requirements via checkReq (may also shoot screen.png as a fallback cover)
spec/<screen>/state.json     the accept pin (approvedPrdText) — the only mutable per-screen state
spec/_design.css             ONE design system, inlined into board.html
spec/_base.ts                checkReq(id, fn) / coverReqs(...) — how a test tags the requirements it proves
spec/_results-index.json     per-screen results + per-requirement coverage, folded across runs — proof derives from this
spec/_conflict-decisions.json  the human's adjudicated conflicts, keyed by content

tools/coverage.mjs           pure: proves-steps + covers-tags → per-req pass/fail/not-reached, and proven/reworded/unproven
tools/spec-store.mjs         reads/derives everything. THE authority on requirement state.
tools/build-board.mjs        renders board.html (home cards + the two-column detail). Draws only — no reading logic.
tools/serve-board.mjs        server: static allowlist, the accept gate, runs, scan, rewrite, crawl, SSE, watch
tools/crawl.mjs              the Init crawler — INVENTORY ONLY (a real browser; rows + crawl.png, no drafting; outside the suite)
tools/staff.mjs              the kg-staff briefing — what governs a screen; run it before you change one
tools/_skeleton.mjs          the ONE list of what gets vendored into a project (FILES/SCRIPTS/DEV) + manifest hashing
tools/scaffold.mjs           vendors the skeleton into a project (kg-init) and writes spec/_specboard.json
tools/update.mjs             brings a scaffolded project to a new release (kg-update); test-first in tools/update.test.mjs
playwright.board.ts          testDir ./spec, testMatch */test.spec.ts, workers:1
board.html                   generated artifact — never edit by hand
```

A scaffolded project records its release in `spec/_specboard.json`. `kg-update` compares that
base against the project's current files and the new release, so an untouched file is updated but a
locally-edited one is kept and the new version dropped beside it as `<file>.new` to merge — never a
blind overwrite. `tools/update.test.mjs` (`npm run test:tools`) proves that decision table.

Commands:

```bash
npm run board          # serve on 4173
npm run e2e            # the suite
npm run board:build    # rebuild board.html only
npm run test:tools     # the pure-function unit tests (coverage, prd-render, update, …)
```

`BOARD_URL=http://host:port` drives an already-running site and starts/stops nothing. `BOARD_PORT`
moves the board's own port.

## The design system is non-negotiable

`spec/_design.css` is the single source — traditional Japanese dye colours at low saturation on
unbleached paper. **Never** introduce a raw hex colour, a font size outside the scale, or a radius
outside the tokens, in the board. Hue names a state but never carries it alone (every chip also has a
mark). **Indigo means one thing only — "your turn"** (a reworded requirement, the open gate); coverage
tags are **neutral** and tint indigo only on hover to show the many-to-many link. Exactly **one**
inverted element per screen. An action wears the colour of the state it produces. Every text/background
pair must pass **WCAG AA (4.5:1)** — re-measure after any colour change.

## Traps that have already cost hours — do not rediscover them

- **The job slot is global, and a spec that starts runs will wait for itself.** The board puts every
  run it starts in one slot, so `dispatch`'s own spec — which proves the panel *by* starting runs —
  hung at a blank browser window until a run could **nest** inside the run driving it. A nested run
  must NAME its parent runId (the page passes `?runid=`, the test reads it off `BOARD_RECORD`), so a
  person clicking Run twice is still refused, and nesting is bounded so a suite cannot recurse.
  For the same reason **cancel can name its target**: an unnamed cancel stops whatever holds the
  slot, which once made the suite kill the run that was executing it.
- **Per-case records must be recorded by CLI runs too, and folded, never replaced.** A record read
  out of "the newest run" blanks every case that run did not cover, and a reporter that only records
  when the BOARD started the run leaves `npm run e2e` contributing nothing — both showed up as "only
  the test I clicked has steps". Screenshots stay board-only; steps, logs and coverage are always recorded.
- **Per-requirement coverage rides on the run, and is folded, never replaced.** `checkReq` emits a
  `proves <id>` step and `coverReqs` a `covers` annotation; the reporter reads both back out
  (`tools/coverage.mjs`) into each test's `reqs`, folded into `_results-index.json` per screen. A
  qualified tag (`x:R3`) proves another screen's requirement, so the fold is board-wide, not per-file.
- **`board.html`'s script is emitted inside a JS template literal.** An unescaped `\n` or a backtick
  becomes literal whitespace and silently breaks every listener while the page still renders.
  `build()` parses the emitted script with `new Function()` and refuses to write a broken board —
  **keep that guard**, and write `\\n` and avoid backticks in emitted strings.
- **The server must not import the builder.** `build()` runs as a **child process**; Node's module
  cache would otherwise overwrite fresh output with stale code. Editing `tools/spec-store.mjs` or
  `serve-board.mjs` needs a fresh server process — but `npm run board` runs under `node --watch`, so it
  restarts itself on exactly those files; only a plain `node tools/serve-board.mjs` (e.g. the
  Playwright webServer) needs a manual restart. Editing `build-board.mjs` never does.
- **The static server is an allowlist, not a traversal guard** — only `board.html` and `spec/**` are
  reachable. This plugin runs inside other people's repos; it once served `.git/config`. Keep it so.
- **Same-document hash navigation does not reload.** Going from `/` to `#/board` fires `hashchange`,
  not a load. When verifying by hand, force `location.reload()` or you will screenshot a stale page.
- **Live streaming is on under automation; only page self-reload is held back.** The SSE run stream
  drives the panel even under `navigator.webdriver`; the reloads that would abort a Playwright
  navigation are the only thing suppressed.
- **A per-screen run writes a report covering only that screen.** It is *folded* into
  `_results-index.json`, never replaced — replacing blanks every other screen's proof. The fold
  is a Playwright reporter (`spec/_results-reporter.mjs`), because Playwright writes its report only
  *after* globalTeardown.
- **The state guard snapshots per process** (`_state-snapshot.<pid>.json`) and also records the set
  of screen directories, so a test that runs a nested run, seeds a conflict, or crawls a row leaves
  nothing behind. A file that did not exist before the run is removed after it.
- **Agent jobs (scan, rewrite) need a valid `claude` login and take minutes.** They run
  detached so Cancel can kill the whole process group. They are real and live **outside** the
  deterministic suite — `diagnose()` names an expired login rather than reporting a silent no-op.
  The crawl also runs detached and long, but it is **inventory-only** (a real browser, no claude):
  it screenshots routes into rows with no PRD. Depth is the per-screen **kg-deep** skill, human-gated.
- **Another agent may be working in this repo.** Stage files explicitly — `git add -A` has swept
  someone else's in-flight work into an unrelated commit before.
- **The board dogfoods itself, so a green suite is not "board is settled".** `spec/board/test.spec.ts`
  tags its own R1–R10 with `checkReq`; R4 and R8 transiently write **and restore** `spec/board/state.json`
  to prove the accept transition, and the state guard restores it at teardown too. So editing board's
  requirements passes the suite while the live board stays honestly **reworded** (awaiting acceptance)
  until the human accepts — and because the board proves itself, the *first* run after editing
  `board/test.spec.ts` can lag one run behind (its own coverage folds at that run's end). Never **accept
  board's requirements yourself** to make the live board green — that is the human's gate.

## Authored vs measured

**Authored** facts are what behaviour *should* be — a human wrote them, they live in `spec/*/prd.md`,
they are the SSoT. **Measured** facts are what *is* — requirement states, counts, results — derived
from the tree on every build. **Do not restate a measured fact in a doc**; a copy rots. If it changes
when the code changes it is measured and belongs in the board, not here. Keep this file
rules-and-pointers only.
