# specboard — a visualised spec-driven development board

One HTML page shows every screen in a project as two ends only — the requirements, and the tests
that prove them:

| 1 · Requirements | 2 · E2E tests |
|---|---|
| the source of truth | the proof, run against the real app |

The product is about **drift**, computed and never stored. A requirement is **proven** only while a
test that *tags* it passed on an assertion that would fail without it; with no passing assertion it
reads **unproven** — honestly ungreen (a flow that stops early also leaves a per-run **not-reached**
for whatever it never got to). **There is no status field anywhere** — every requirement's state is
*derived* solely from the folded test coverage against the current tree. **There is no acceptance
gate** *(removed by the human 2026-07-30 — see board R8; a decision that is always yes is ceremony,
not a gate)* **and no draft/guess state either** *(removed by the human 2026-08-17 — see init R3)*: a
requirement is canon the moment it is written, full stop — a PRD drafted on the human's behalf (a
kg-deep pass) is an ordinary starting point the human edits or removes freely, exactly like one they
wrote themselves, and nothing on the board waits on a person to confirm it. specboard owns **neither
the wireframe nor the design** — it tracks requirements and their proof, nothing else (no design
field, no external-artifact chip). The tool **dogfoods itself**: its own screens are the cards on
its own board.

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
   written after the code can only confirm it. *Addendum (the human, 2026-08-21):* a **composed
   flow** — the deterministic composition of function-shaped beats, each already proven red-first
   in its unit home — is exempt from flow-level watch-it-go-red; its validity is every composed
   beat's standing red-first proof plus the composed file passing its first full run. A composed
   flow that fails its first run is a composition defect, never a reason to weaken a beat.
2. **Assert something that can fail.** If a test would still pass with the requirement deleted, it is
   not a test — and it cannot make that requirement *proven*.
3. **Never fake a green.** A requirement with no passing assertion reads **unproven**; a flow that
   stops early leaves what it never reached **not-reached** — neither is green, and that honesty is
   the point. Never weaken, skip, or delete a test to go green.
4. **When a test breaks after a change, find which of the two is wrong before editing either.**
   Several tests here were *correctly* broken by good changes and needed their assertions fixed;
   several others were genuinely wrong.
5. **Requirement *semantics* wait on the human**: a new REQ, changed REQ text, a deleted REQ, or
   choosing a canonical side. You edit prose; the human owns meaning.
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
derive each requirement's **proven / unproven** state. Tests come in **two kinds, both first-class**
(board R6, the human 2026-08-17): a **unit** test proves one screen or component displaying and
acting right; a **flow** test crosses screens along a chosen path and reads as the units it
connects. Every requirement still needs a real assertion (rule 2), so neither kind can buy a false
green. A flow's *file* lives in the screen it **starts** on; a requirement lists every test that
covers it wherever that file lives.

## Architecture

```
spec/<screen>/prd.md         requirements + frontmatter (screen, area, title, route)
spec/<screen>/test.spec.ts   Playwright spec — tags requirements via checkReq (may also shoot screen.png as a fallback cover)
spec/<screen>/steps.ts       the screen's COMPOSABLE BEATS (the beat-function convention, kg-e2e): GIVEN + BEATS
                             metadata beside exported step functions — perform the When, assert the exact Then
                             from a threaded state, update it; the caller's checkReq wraps the call
spec/<screen>/evidence/      the harvest (frames + clip) — COMMITTED here and in scaffolded projects (D2 2026-08-22); retention rule in tools/evidence.mjs carryClip
spec/<screen>/viz/*.svg      the drawn schematics, derived by tools/viz-derive.mjs (stale-by-text-hash, never guessed)
spec/<screen>/state.json     pre-redesign relic (old accept pin, approvedPrdText) — unused since the gate was removed (board R8, 2026-07-30); still on disk, not yet deleted
spec/_design.css             ONE design system, inlined into board.html
spec/_base.ts                checkReq(id, fn) / coverReqs(...) — how a test tags the requirements it proves
spec/_results-index.json     per-screen results + per-requirement coverage, folded across runs — proof derives from this
spec/_conflict-decisions.json  the human's adjudicated conflicts, keyed by content

tools/coverage.mjs           pure: proves-steps + covers-tags → per-req pass/fail/not-reached, and proven/unproven
tools/spec-store.mjs         reads/derives everything. THE authority on requirement state.
tools/compose.mjs            pure, unit-tested: the flow composer — parseBeats (steps.ts, read statically),
                             deriveLibrary (nodes from behavior blocks + tests ONLY), the joint check, composeCheck,
                             emitFlow (chain → the composed flow file, no model) and composePrompt (the Claude path)
tools/build-board.mjs        renders board.html (home cards + the per-screen detail: Focus / List / Flow views and
                             the composer, over the hidden baked panes). Draws only — no reading logic.
tools/behavior.mjs           pure: parses a requirement's behavior block (Given + When→Then beats)
tools/reqhash.mjs            pure: the shared requirement-text hash (Changed-drift, evidence, schematics)
tools/viz.mjs                pure: behavior chain → archetype → the drawn schematic SVG (+ still phases)
tools/viz-derive.mjs         the viz pass's shell: derives/commits spec/<screen>/viz/*.svg (`node tools/viz-derive.mjs`)
tools/flow.mjs               pure: a recorded test's steps → its kind (unit/flow) and chapters for the Flow player
tools/evidence.mjs           pure: clip window, ffmpeg args (clip · frame · downscale), evidence paths, the fold
tools/board/client.js        the board's browser behaviour (routing, run panel, focus reader, …) as a REAL
                             .js file — read verbatim into board.html, fed a JSON island (window.__BOARD__).
                             Edit/lint it like normal JS; no template-literal escaping traps.
tools/serve-board.mjs        server: static allowlist, runs, scan, rewrite, compose (deterministic emit + the claude-path job), crawl, SSE, watch (no accept endpoint — the gate is gone, board R8)
tools/crawl.mjs              the Init crawler — INVENTORY ONLY (a real browser; rows + crawl.png, no drafting; outside the suite)
tools/staff.mjs              the kg-staff briefing — what governs a screen; run it before you change one
tools/narrate.mjs            pure, unit-tested: beats + a screen's narration pack → cues, timing map, SRT
tools/narrate-run.mjs        the shell: `pace` (synth pack lines → BOARD_NARRATION_PACE rules the run holds
                             beats to) and `render` (recording + beats + pack → subtitled/voiced mp4).
                             NO model at run time — packs are authored once per screen with pass AND
                             fail variants; piper synth is cached by voice+text
tools/_skeleton.mjs          the ONE list of what gets vendored into a project (FILES/SCRIPTS/DEV/SPEC_IGNORE/ROOT_IGNORE) + manifest hashing
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
npm run staff          # the kg-staff briefing for a screen
npm run proof          # proof-integrity check
node tools/viz-derive.mjs [screen…]   # derive the schematics (the only way a project gets them)
```

`BOARD_URL=http://host:port` drives an already-running site and starts/stops nothing. `BOARD_PORT`
moves the board's own port; `BOARD_HOST=<hostname>` names the one non-loopback hostname whose own origin the POST guard accepts.

## The design system is non-negotiable

`spec/_design.css` is the single source — traditional Japanese dye colours at low saturation on
unbleached paper. **Never** introduce a raw hex colour, a font size outside the scale, or a radius
outside the tokens, in the board. Hue names a state but never carries it alone (every chip also has a
mark). **Indigo is the `Changed` drift state** (board R4, the human 2026-08-19): a requirement proved
before whose text has moved past its proof, awaiting re-verify — the status this hue was long held for.
Before that it meant "your turn" (a screen whose PRD carried a `guess:` flag, waiting on the human's
correction), but that state was removed along with the gate itself (board R8, init R3; the human,
2026-08-17), and indigo stayed reserved for `Changed` until this claimed it. It also still tints on
hover for the many-to-many coverage link — since the Columns view retired (2026-08-18) that cue lives
on the Flow chapters' requirement chips (`.flreq`), not on row hover: the old `.req`/`.test` hover
cross-light wired rows that are now the hidden shared source, so the wire was removed with the view. A
*new* status colour still needs the human's sign-off before it is assigned. Exactly **one** inverted element per screen. An action wears the colour of the state it
produces. Every text/background pair must pass **WCAG AA (4.5:1)** — re-measure after any colour
change.

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
  the test I clicked has steps". A run's own screenshots stay board-only; steps, logs and coverage are
  always recorded — and so, since the D2 evidence harvest (Task 15, 2026-08-21), are each requirement's
  before/after EVIDENCE frames: `checkReq` photographs the page around every assertion body and the
  reporter folds the pair (plus the proves-step's clip window, plus a looping clip when ffmpeg and a
  recording exist) into `spec/<screen>/evidence/` and the index, from CLI runs too. The Focus media
  pane (`client.js` buildMedia) renders the pair (stills · gif · video); frames are downscaled to the
  clip's 640px width at the fold when ffmpeg is present (final review M4).
- **Per-requirement coverage rides on the run, and is folded, never replaced.** `checkReq` emits a
  `proves <id>` step and `coverReqs` a `covers` annotation; the reporter reads both back out
  (`tools/coverage.mjs`) into each test's `reqs`, folded into `_results-index.json` per screen. A
  qualified tag (`x:R3`) proves another screen's requirement, so the fold is board-wide, not per-file.
- **The board's CLIENT BEHAVIOUR now lives in `tools/board/client.js`** — real JavaScript, read in
  verbatim by `build-board.mjs` and paired with a JSON island (`window.__BOARD__`) that carries its
  build-time values (`screens`, `skillIds`, and `compose` — the composer's derived library). Because that code is no longer
  inside a template literal, backticks, `${}` and `\n` are ordinary characters there — edit it like
  any `.js` file, and lint/type-check it (`node --check` at minimum) to catch the logic errors the
  `new Function()` guard cannot. The MARKUP and CSS in `build-board.mjs` are **still** emitted inside
  a template literal, so the old caution still applies THERE: an unescaped `\n` or a backtick becomes
  literal whitespace and silently breaks the page while it still renders. `build()` parses every
  emitted `<script>` with `new Function()` and refuses to write a broken board — **keep that guard**,
  and in any string still emitted from the template write `\\n` and avoid backticks.
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
- **Agent jobs (scan, rewrite, the composer's Claude path) need a valid `claude` login and take minutes.** They run
  detached so Cancel can kill the whole process group. They are real and live **outside** the
  deterministic suite — `diagnose()` names an expired login rather than reporting a silent no-op.
  The crawl also runs detached and long, but it is **inventory-only** (a real browser, no claude):
  it screenshots routes into rows with no PRD. Depth is the per-screen **kg-deep** skill, drafting the
  PRD directly onto the board — canon the moment it is written, no confirmation step (init R3).
- **Another agent may be working in this repo.** Stage files explicitly — `git add -A` has swept
  someone else's in-flight work into an unrelated commit before.
- **The board dogfoods itself, so a green suite is not "board is settled".** `spec/board/test.spec.ts`
  tags its own requirements with `checkReq`; R4 and R8 now *assert the gate is gone* (no reworded state, no
  gate bar, no accept button) rather than transiently touching any file — the tests no longer write or
  restore `spec/board/state.json` (that file is a pre-redesign relic, see Architecture). Because the
  board proves itself, the *first* run after editing `board/test.spec.ts` can lag one run behind (its
  own coverage folds at that run's end). The standing rule survives the mechanism change: never edit a
  requirement's wording just to make its test go green — that is still the human's call, not yours.
- **A reader BORROWS real nodes out of `.testpane`, but `loadRuns` only folds `.testpane`.** Both
  reader kinds do it — the Focus overlay AND the List's open row (an open row IS the Focus body,
  board R13 2026-08-21) — and Focus opens the instant a screen loads, before `loadRuns`'s async
  fetch returns. A node that is out in a reader is SKIPPED by the fold and left stale — a fresh
  deep-link shows blank media until navigation. Fix, kept and GENERALIZED (Task 3a, 2026-08-22):
  `loadRuns` closes whichever reader is open (Focus reopened via its `ov._curId`, a List row via
  its `data-r`), folds every case, then reopens the same requirement; `closeFocus()` tears down
  both kinds so no view switch strands a borrowed node; `syncDerived` re-syncs each row's evidence
  data after a run so a reopened reader renders the fresh harvest, never a cache. Any code that
  opens a reader eagerly, or changes what `loadRuns` iterates, must preserve this close-fold-reopen
  for BOTH reader kinds. Symptom in tests: assertions on reader evidence pass alone but fail under
  `checkReq` (its paint/pace shifts them into the `loadRuns` window) — and a locator like
  `.feval .fpacts .runone` quietly matches the ⋯-menu's copy too (the dropdown nests inside
  `.fpacts`); scope to `> .runone`.

## Authored vs measured

**Authored** facts are what behaviour *should* be — a human wrote them, they live in `spec/*/prd.md`,
they are the SSoT. **Measured** facts are what *is* — requirement states, counts, results — derived
from the tree on every build. **Do not restate a measured fact in a doc**; a copy rots. If it changes
when the code changes it is measured and belongs in the board, not here. Keep this file
rules-and-pointers only.
