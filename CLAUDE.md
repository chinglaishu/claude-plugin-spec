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
   not a test — and it cannot make that requirement *proven*. **And every fact the Then names is a
   soft claim** (phase 6, 2026-09-04): `proveVisible(target, expected, label, { soft: true })`, so
   the beat reaches and photographs each of them and fails once at its end with the whole list —
   `npm run proof lint` refuses a Then fact no claim covers (`lintIntent`, tools/proof-integrity.mjs).
   An ABSENCE is claimed like any other fact (`proveVisible(locator, MISSING, …)` passes exactly while
   the thing is gone); a fact with NO screen surface — an API-only beat, a geometry, what the CLI gate
   reads — is DECLARED in the beat with `intentGap('<why>')`, which the lint prints as a **visible
   debt, never a pass**. Never a claim invented to close a row, and never a Then reworded to fit the
   test.
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
8. **Show it, never only say it** *(the human, 2026-09-02 — the demo's failing R9 "totally not really
   delete a subtask; please show it out in visual, not just text; keep it in the rule")*. A When that
   acts on a thing — delete a task, tick a box, move a card — rings that thing **before** the action
   and the place it changed **after** it, and only then the number the requirement counts. A beat
   whose only frames ring a counter says the action happened without ever showing it. The same rule
   governs what you hand the human: a finding or a proposal comes with a picture (a screenshot, a
   mock on real data, a diagram), never as prose alone.

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
spec/<screen>/evidence/      the harvest (the before/after frame pair + its window, ONE `.expected.html` REPLICA per moment — the Actual half is the photograph beside it (the human, 2026-09-04) — and the screen's `_fonts/`) — COMMITTED here and in scaffolded projects (D2 2026-08-22); deterministic paths overwrite in place, superseded files pruned at the fold (tools/evidence.mjs), which also sweeps the retired `.actual.html` half
spec/<screen>/viz/*.svg      SKETCHES ONLY — the house-style drawing of a requirement that has NOT been harvested yet.
                             Derived by tools/viz-derive.mjs, which since phase 4a also DELETES the committed drawing of
                             any requirement that now has a replica: the picture beside a proof is the app's own markup
spec/<screen>/state.json     pre-redesign relic (old accept pin, approvedPrdText) — unused since the gate was removed (board R8, 2026-07-30); still on disk, not yet deleted
spec/_design.css             ONE design system, inlined into board.html
spec/_base.ts                checkReq(id, fn) / coverReqs(...) — how a test tags the requirements it proves
spec/_replica.mjs            the REPLICA's capture (2026-09-03), one self-contained function Playwright serialises into
                             the page: the ringed element's SCENE ROOT as the app's own DOM, computed styles diffed against
                             per-tag defaults into shared classes, sanitised (no script/handler/external URL, live controls
                             become spans carrying the value the assertion read) and capped — REPLICA_PROPS is the one prop
                             list and travels in through the arg. It returns BOTH halves of the row: `html` the ACTUAL (what
                             the app rendered) and `expected` the same tree cloned with the beat's `claims` applied — a wrong
                             value taking the requirement's word, a removed element restored from `lastRight`, a never-there
                             one drawn as a marked placeholder; unit-tested in tools/replica.test.mjs on a stub DOM.
                             It pays only for what a reader can see (phase 3): inherited properties are diffed against the
                             PARENT and the tag defaults are probed in a hidden about:blank frame — the environment the
                             file is READ in, not the app whose own reset would otherwise be diffed away — an edge that
                             paints nothing where the tag draws none is not a declaration, and anything the picture does
                             not draw (faded, hidden, outside the scene root) becomes a placeholder that HOLDS ITS SPACE,
                             subtree dropped, so nothing after it slides. A scrolled box's scroll is baked into the flow.
spec/_layout-walk.mjs        the layout skeleton's WALK, one self-contained function Playwright serialises into the page
                             (snapLayout hands it the ring + the ringed element); unit-tested in tools/layout-walk.test.mjs
                             on a stub DOM — the ringed element first, the rest nearest the ring, no slot for an unpainted wrapper
spec/_moment.mjs             ONE MOMENT, ONE INSTANT (2026-09-04): composes the walk, the replica capture AND the gate's
                             own walk-back (`gateInPage`) into the single expression the page evaluates, so the three
                             readings a likeness gate compares can never be three different instants of the app — and
                             carries the walk's own answers across (the ringed element it MEASURED, the boxes it dropped
                             as occluded) so the halves cannot disagree about what they are looking at
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
tools/viz-derive.mjs         the viz pass's shell: derives/commits spec/<screen>/viz/*.svg. RUN AT EVERY FOLD
                             by spec/_results-reporter.mjs (deriveSchematics) — a drawing is a by-product of
                             the harvest it is drawn from; the command stays for a by-hand pass
tools/replica-gate.mjs       pure: THE REPLICA'S GUARD (phase 3, 2026-09-03) — replicaGaps (the live skeleton against the
                             rendered replica's own skeleton, 1.5 px), claimGaps (a failed claim's value must be IN the
                             Expected), replicaAttrs/withReplicaAttrs/textOf/replicaNote. Read by BOTH the in-page gate at
                             capture time (spec/_base.ts) and `npm run proof mirror` (tools/proof-integrity.mjs checkReplicas)
tools/flow.mjs               pure: a recorded test's steps → its kind (unit/flow) and chapters for the Flow player
tools/evidence.mjs           pure: the proves-step window, ffmpeg args (frame · downscale), evidence paths, the fold
tools/board/stepper.js       pure: the gif-mode frame-stepper's timing math (holds off the window + frame anchors) —
                             inlined verbatim like client.js, unit-tested via globalThis.SBStepper
tools/board/words.js         pure: the PROVED PHRASE rule (which words of a beat's sentence the moment on show is
                             proving) — a third file inlined verbatim into board.html, unit-tested via globalThis.SBWords
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

**THE LAYOUT RULE — a project's board lives in `specboard/` INSIDE its app repo, ignored wholesale by
the app's git, LOCAL-ONLY and single-user** (the human, 2026-09-04, in three steps: "put all specboard
related file and image out of the dojostack_main repo … and make it still work"; then "stay everything in
a specboard folder in the dojostack_main, gitignore the entire folder, and apply it on any project later
on as a rule"; then, declining a git repo of its own for the folder: "now, store everything in local
(specboard folder) with gitignore — so only work in local for single user; next step, store everything in
cloud for user (so it share across team)"). The accepted trade-off, stated once: the PRDs, tests and
harvest exist on one disk until the cloud step. The tools resolve their root to the directory they live
in, so nothing in the fold cares where that is; the layout adds only how the two directories find each
other, all of it pure in `tools/_skeleton.mjs` (tests: `tools/sidecar.test.mjs`): `resolveProject(dir)` —
the manifest here, else the one-line `.specboard` pointer (a board kept anywhere else), else
`dir/specboard/` (the rule) — followed by `update.mjs`, `scaffold.mjs` and every skill's "Where the board
lives" note, so `update.mjs <appRepo>` lands on the board and never re-vendors into the app; and the
manifest's `app` path (`appRoot` → `APP_ROOT` in spec-store, carried across updates like `project`; the
capabilities list reads the app repo's `.claude/` through it, and a project's own `spec/_app.ts`-style
helpers should too). `scaffold.mjs [appRepo]` creates the nested board and appends `/specboard/` to the
app's .gitignore — it does NOT `git init` the folder; `--dir <boardDir>` and `--flat` are the escapes.
**Next step (not built): the board's files stored in the cloud so a team shares one board** — the tiers
are laid out in docs/sidecar-qa-2026-09-04.html §3 (the harvest blobs and run records to a private
bucket via the existing `storage`/`shipToBucket` path, the fold index beside them, a read-only hosted
board). dojostack is the first: `~/workspace/dojostack/dojostack_main/specboard` (board on :4174). This
repo and demo/todo stay flat (they ARE the board).

Commands:

```bash
npm run board          # serve on 4173
npm run e2e            # the suite
npm run board:build    # rebuild board.html only
npm run test:tools     # the pure-function unit tests (coverage, prd-render, update, …)
npm run staff          # the kg-staff briefing for a screen
npm run proof          # proof-integrity check (`lint` = existence + authored intent, `mirror` = the pictures,
                       # `perturb` = the assertions still fail when the thing they prove is broken)
node tools/viz-derive.mjs [screen…]   # derive the SKETCHES by hand (the reporter runs it at every fold). It writes a
                                      # drawing only for a requirement with NO replica, and DELETES the committed
                                      # drawing of one that has gained a harvest — the picture beside a proof has been
                                      # the app's own markup since 2026-09-03, so a drawing there would be a second,
                                      # drifting answer. It reports NO mirror gaps any more: the replica's own gate does
                                      # that (tools/replica-gate.mjs), in the page, at capture time.
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
  reporter folds the pair plus the proves-step's WINDOW (its span in the recording) into
  `spec/<screen>/evidence/` and the index, from CLI runs too. Since the per-beat storyline redesign
  (33049fb/3fbbaec, 2026-08-28) the Focus reader is per-beat ROWS: each beat's proof is a
  `proofCell` (`client.js`) that ALWAYS loops before → each asserted-value frame → after — no
  stills·gif·video toolbar exists any more (board R20 asserts `.pcmodes` is absent), only a
  per-cell zoom toggle (`.pczoom`) — paced by `tools/board/stepper.js` off the window + the record
  frames' `t` (equal holds when an old harvest has no usable timing). The **asserted-value frames
  are real since 2026-08-29** (the human: the When must be visible in the proof, not only the Then —
  a box carrying what was typed is empty in the before frame and cleared again by the after one):
  every `proveVisible` inside a `checkReq` photographs the page with its ring on, files the frame
  and its layout skeleton as `evidence|layout <id>#<beat> v<k>`, and stamps `at` — its offset from
  the beat's `proves` step — into the skeleton, which the reporter turns into the frame's anchor
  inside the beat's window. `proveVisible` reads an input's/textarea's/select's **value** (rendered
  text for everything else), which is what makes that assertion writable at all. A beat's focus rect
  is now the **union** of its rings (`focusFromLayouts`), so one camera (board R19) frames the whole
  beat instead of cropping its earlier scenes away. The drawing draws the same scenes from the same
  skeletons and publishes their park points as `data-viz-subphases`, and the row's proof loop
  **steps the drawing** (`_onFrame` → `frameCell._drive`, marked `data-driven`), so both halves of a
  row are always on the same moment of the same beat. **ONE STEPPER PER ROW, over the two pictures
  (2026-09-02, the human: "schematic and proof should share same stepper (as their steps must be
  same???)").** A beat is one ordered list of MOMENTS — every value it proved, then its result — and
  the two cells are renderings of that one list, so a row has exactly one `.mstrip` (`momentStrip`),
  spanning `.pics`, one `.mseg` per moment NAMED by the assertion the run recorded (`snapValue` puts
  the CLAIM's label on the value's layout skeleton → `valueMeta` at the fold → `values[].label` in
  `data-ev-beats`), the last segment the beat's Then. The `‹ n / N ›` that sat in the words' gutter
  (`sceneRail`/`.tourstep`, 2026-09-01) is GONE with the two clocks it read from — and a drawing whose
  park points do not match the harvest's moment count no longer free-runs: it PARKS and the storyline's
  stale banner says "behind the harvest". A row with no proof loop at all still walks (or scrubs) its
  drawing — nothing is beside it to disagree with. The words are sentence-first (`.sbmark` numeral +
  `.sbwhen`/`.sbthen`/`.sbgiven` with the keyword as the sentence's `.lead`); `.sbstep`/`.sbk`/`.sbeye`
  are gone, and NO keyboard hint lives in the reader at all — not per row and not in its footer
  either (corrected 2026-09-02, rule 6: the pager's `.fpk` legend went with the human's "remove the
  short cut key hint in this page, only mention in the setting page"; the keys are listed once in
  #howview's Keyboard section, `.howkeys`). The reader's type is ONE ladder with NO RUNG MORE THAN ONE
  STEP FROM ITS NEIGHBOUR IN THE SAME ROW, and since 2026-09-04 (the human: "the font-size difference
  between Given and When/Then is too much, it looks weird") **the three sentences are one size** —
  `.sbgiven`/`.sbwhen`/`.sbthen` all --t-lg, told apart by weight and ink rather than by size (the
  When keeps 500 and full --ink; each keyword lead keeps its own colour). `.fttl` --t-xl/600 is the
  reader's ONLY head and the only --t-xl in it; nothing in the words cell is larger than --t-lg.
  Under them: the strip's `‹ ›` `.mnav` --t-lg, `.sbno`/`.msegl`/`.mpos`/`.mtip .tv`/`.pchip .pcvr`
  --t-md, the column names `.sbhc` + `.mkind`/`.mtip .tk`/`.pchip .pcl`/`.mdiff .mdv` + the stale
  banner's head --t-sm, and `.mdiff .mdk`/`.sbprov`/`.pcnone`/`.noschem` + the banner's body --t-xs.
  (Corrected 2026-09-04, rule 6: this said `.sbwhen` was --t-xl/500 and the smallest reader rung
  --t-micro. The When came down a step on the human's instruction above; `.mnav`'s raw 17px and
  `.mkind`'s two-step drop to --t-xs were found by the same audit and put on the scale.) A segment
  name is ONE ellipsised line — every strip is one height — with the full name AND both values
  (`expected …` / `actual …`) in a styled hover/focus tooltip `.mtip`, never the native title (the
  human 2026-09-02; the values added 2026-09-04). The chip over each picture is a real `<button>` so
  a keyboard can open its tooltip too. And the words cell centres itself in a tall row while the mark
  column still spans it. `buildMedia` now renders only
  the whole-REQUIREMENT proof band (failed-run filmstrip · the committed video · the Changed
  watermark). The speed control is ONE reader-wide 0.25×–4× dropdown (`.pspd`), broadcast to every
  pane via `onSpd`/`PLAY_SPD` (loops scale their holds; video maps it to playbackRate; the
  schematic to --spd) — the old per-pane dropdowns are gone with the toolbar. *(This paragraph
  previously described the pre-storyline pane — stills·gif·video toggle + per-pane dropdowns —
  corrected 2026-08-29, rule 6.)* The webp clip and Task 11's 1.5×/2× variants are RETIRED
  (2026-08-24) — once the stepper played the frames nothing rendered them; a legacy entry's clip
  files are pruned at its next fold. This moots **D1**, the human's 2026-08-22
  keep-the-clip-across-CLI-folds decision — there is no clip left to keep; the human's stepper
  choice of 2026-08-24 supersedes it, and carryClip went with the cut. The ring's CALLOUT is sized in ONE place for both
  pictures — `CARD` (tools/overlay-geometry.mjs) and `CALLOUT_TYPE` (tools/callout-text.mjs), read by
  the burn-in AND the drawing — so "make the explaining box bigger" (the human, 2026-09-02: 300px/14px
  → 360px/17px) is two numbers there and a re-harvest, never a per-side edit. Frames are downscaled to
  1280px at the fold when ffmpeg is present (640px originally, final review M4; raised to 1280 by
  Task 16 #2, the human's 2026-08-24 sign-off — 640 was visibly soft in the wider panes). **The ring and the
  callout paint on EVERY run, recording or not (2026-09-02)** — they were recording-gated, so a plain
  `npm run e2e` harvested RINGLESS frames and ringless layout skeletons and the fold wrote them over
  the board's ringed harvest: the reader lost its zoom, ring and callout, and the drawing beside it
  (drawn from the same skeleton) lost them too — the second root cause of "the focus effect is gone".
  Only the video and the narration holds (`recordHold`) stay recording-only.
- **Staleness is CONTENT-aware; mtime alone calls a clean checkout stale.** A pass counts only
  while current, but "the source moved" was measured purely by mtime — and a fresh clone stamps
  every file with checkout time, so the GitHub Actions gate read every requirement untested on a
  tree byte-identical to the fold that proved it (board R4 lost its "some proven rows exist"
  precondition; R12 derived a different next action). Since 2026-08-30 the fold pins the sources'
  CONTENT beside the run — `srcHashes` per screen in `_results-index.json`, written by
  `foldByScreen` — and `passStale`/`runStale` (`tools/spec-store.mjs`, pure, unit-tested in
  `tools/stale-proof.test.mjs`) demand BOTH gates: newer than the run AND a fingerprint that no
  longer matches. Keep both. Dropping the mtime gate would miss an edit made since the last fold
  (a PRD edit must read unproven immediately, with no run in between); dropping the hash brings the
  false positive back. A record with no `srcHashes` (a fold from before this) keeps the old
  mtime-only answer — no evidence about the content is not evidence of sameness (rule 3) — so a
  fixture that simulates staleness must move the fingerprints too, not just `ranAt`.
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
- **A STRING handed to `page.evaluate` is EVALUATED, never CALLED** (2026-09-04, task 3b). Playwright
  1.62 ignores the arg for a string expression and returns the expression's own value — a function,
  which serialises to `undefined`. The composed moment shipped that way for one round: every harvest
  filed a photograph with NO skeleton beside it, and the fold's layout carry hid it so well that
  `npm run proof mirror` still read that screen's whole census green. `tools/prove-input.test.mjs` — a real Playwright
  run — is what caught it, on an attachment that was missing. Build the function in Node
  (`spec/_moment.mjs` `momentFunction`, `new Function`) and hand a FUNCTION over; and when a capture
  changes, check an attachment actually landed rather than trusting a green census.
- **The static server is an allowlist, not a traversal guard** — only `board.html` and `spec/**` are
  reachable. This plugin runs inside other people's repos; it once served `.git/config`. Keep it so.
- **Same-document hash navigation does not reload.** Going from `/` to `#/board` fires `hashchange`,
  not a load. When verifying by hand, force `location.reload()` or you will screenshot a stale page.
- **Live streaming is on under automation; only page self-reload is held back.** The SSE run stream
  drives the panel even under `navigator.webdriver`; the reloads that would abort a Playwright
  navigation are the only thing suppressed.
- **A per-screen run writes a report covering only that screen.** It is *folded* into
  `_results-index.json`, never replaced — replacing blanks every other screen's proof.
  **…and a cross-screen flow may not repaint a beat the requirement's HOME screen harvested** (final
  review I5, 2026-09-04). Evidence is keyed by REQUIREMENT and its paths are deterministic, so
  `spec/init`'s composed flow — which tags `board:R1` — rewrote `spec/board/evidence/R1.b1.*` from
  the init page when run ALONE, pruned what the board's own run had put there, and turned the next
  board run red on four tests. Per-screen runs are a documented normal workflow, so the rule is
  precedence: the home screen's own file owns its beats, a flow fills only the beats it left empty,
  and nothing a flow brings replaces or prunes them (the reporter marks the beat `foreign` and does
  not even copy the bytes; `foldEvidence` keeps the old entry). Coverage is untouched — the flow
  still PROVES the requirement. Keying evidence by TEST rather than by requirement would remove the
  collision outright and is the honest next step; this is the rule until then. The fold
  is a Playwright reporter (`spec/_results-reporter.mjs`), because Playwright writes its report only
  *after* globalTeardown.
- **The picture is guarded, so the gap between it and the proof cannot open again** (the human,
  2026-09-02; the drawn mirror it was written for was retired at phase 4a, 2026-09-03). Twice the
  drawn kit quietly stopped drawing something the harvest had measured, and only a person's eye on a
  beat row caught it. The drawing is gone — `tools/viz.mjs` `mirrorGaps` and `renderWireframe` still
  exist for the SKETCH, `tools/viz-derive.mjs` no longer calls either and instead DELETES the
  committed drawing of any requirement that has gained a replica, and
  `tools/proof-integrity.mjs checkMirrors` returns nothing ("no committed wireframe drawings —
  replicas gated instead"). What stands in its place is `checkReplicas`, and the rule is the same:
  in the SAME page pass as the capture (`spec/_moment.mjs` `gateInPage`, final review C1, 2026-09-04
  — it used to be a THIRD `page.evaluate` fired from Node after the screenshot, so the gate compared
  two readings of a page that had been given three chances to settle), the app's own UNEDITED tree is
  rendered back in a hidden `<iframe srcdoc>` at the region's own coordinates and walked with the
  SAME `snapLayoutWalk` that measured the live page, and every box and word the live skeleton
  recorded inside the scene root must come back (`replicaGaps`, tools/replica-gate.mjs, 1.5 px on
  each edge). **ONE HTML PER MOMENT** (the human, 2026-09-04: "why does the Expected also need a
  replica — the Actual is the screenshot"): the file that lands is the EXPECTED, and the gate's
  verdict on that unedited tree is stamped on ITS root as `data-replica-layout` /
  `data-replica-gaps`. The fold prints every gapped moment and sweeps the retired `.actual.html`
  half; `npm run proof mirror` refuses a replica that is gapped, ungated, truncated, whose pin no
  longer hashes the skeleton beside it, whose WORDS are not the skeleton's, or that does not carry a
  failed claim's own value — the word rule exempting what a claim moved (a live element inside a
  claim's ring, or one whose text is that claim's `got`), because applying the claim is exactly what
  takes that text out of the picture. **When a real harvest shows a gap, fix the CAPTURE — never the
  tolerance and never the guard.** **The capture spends its budget on the ring
  first, never in document order (2026-09-03, the human, on dojostack's House View: "the schematic is
  useless — off focus, the versioning component not shown").** The walk had one global 360-slot cap
  filled in DOM order — sidebar, header, wrapper divs — so on any page bigger than the cap the ringed
  element was measured only if the DOM happened to reach it in time; on dojostack it never was (0
  focused elements in every House View frame, 146 of 360 slots on invisible wrappers), and the mirror
  guard passed because every rule asked only about what WAS measured. Now `spec/_layout-walk.mjs`
  measures the ringed element (handed over as an element handle, else found under the ring's centre)
  and its whole subtree FIRST under its own reserve, then walks the rest with each level's children
  ordered nearest-the-ring-first, and gives no slot to an unpainted wrapper (no bg, no border, no
  words, no icon) — it is still descended. And `mirrorGaps` has the one rule the drawing could not
  answer for itself: a ringed scene whose skeleton has no `focus` element is a `missing-focus` gap, so
  a capture that misses its ring fails `npm run proof mirror` instead of shipping an empty ring. The
  gate caught two more the same day (0.42.1): **a zero-sized box is not a hidden box** — the House View
  picker sits under a `min-w-0` flex `main` that measures 0 wide, and "zero rect ⇒ display:none, drop
  the subtree" had dropped the whole header on every harvest (only `display:none` prunes now; a
  sizeless element takes no slot but is descended); and **the ring is where the element is at capture
  time** — R7's button re-laid out between the ring paint and the frame, so the walk takes the ring
  from the handed-over element's current box and `snapValue` re-paints the overlay there first. And
  two on the DRAW side (0.42.2), found when every real skeleton carried its ring yet the three FAILED
  House View scenes still read missing-focus: their scenes are derived (`intendedLayout`) from a
  ringless before frame that was already at the cap, the intended leaf was appended as element 361,
  and `normLayout`'s own first-come draw cap cut exactly that one — so past the cap what goes is now
  the last UNFOCUSED boxes, never a focused or intended element; and a present element the base never
  measured is BORROWED from the value skeleton (its focused element and leaves, the focused leaf
  taking the expected value, a worded wrapper swapping the old words) instead of a bare leaf invented
  beside an empty ring. And one more on the board itself (0.42.3): with the picker now IN the base, the
  area-ratio rule still rejected its small "Live" leaf and "Published" was invented in the Month box
  beside it — so a worded leaf NESTED in the ringed box is a candidate whatever its size, the one whose
  words the measured `got` contains first (that is the value the check read), then the focused one. **On a FAILED assertion the drawing shows the
  INTENDED state, not the app's** (the human, 2026-09-02: "schematic and behaviour are truth — otherwise
  the user should disagree this truth and update it"; and, one kit later, "the schematic should be
  correct, only the proof should be wrong"): each value frame's skeleton carries the claim (`expected ·
  got · ok`, plus `missing` when the check found nothing to read), the fold lifts it to
  `values[].claim`, and a FAILED scene — and the after frame of a failed beat — is drawn from the LAST
  SKELETON THE APP GOT RIGHT (the beat's latest passing scene, else its before frame) with every failed
  claim applied (`intendedLayout`, kit mirror-13): a wrong value on a present element is found by the
  ring's box and takes the expected text; an element the app REMOVED is found in the base by its expected
  text (the base still has it); something the app NEVER had (an Undo that should appear) is drawn as a
  new leaf beside the ring the beat last stood on. Claims accumulate down the beat. The derived skeleton
  is registered as the frame's input, so the mirror guard checks the drawing against the picture it was
  asked to draw. The photograph keeps the measured state and its red verdict — a missing element rings
  red where it last stood, "got (missing) ✕". **Since 2026-09-03 that same intended state is also
  carried in the app's OWN MARKUP, by the EXPECTED replica** (`.expected.html`, spec/_replica.mjs
  applyClaims) — the human's decision that day replaced the drawn schematic with a real HTML replica of
  the component, so the intent is now restated on the real markup by the same three rules: the leaf
  inside the ring that read the wrong value takes the expected word (with every worded wrapper up to
  the ring), a removed element is restored from the beat's last all-ok replica, one the app never had
  is a marked placeholder beside the ring. Claims accumulate down the beat here too, and a failed
  beat's after moment writes the beat's LAST Expected rather than deriving one from the scene the app
  got wrong. **A Then with several facts uses SOFT claims**
  (`proveVisible(…, { soft: true })`): the beat reaches and photographs every fact and the `proves` step
  fails once at its end with the whole list — never a green, never a beat cut off at its first red.
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
