# compare-player — a comparison row that PLAYS

One Given / When → Then beat, drawn once per **source** — what the SPEC says, what the DOC and the CODE
say, what the app ACTUALLY did — with every panel on **one stepper**, the same rule the board's Focus
reader keeps for its Expected and Actual. Three play modes, the board's: **auto** plays each moment
(LEAD · FILM · REST) once and advances the row; **semi-auto** replays the moment on show and waits;
**step** is still. A typed When is performed one character at a time at the harness's pace (55 ms).

Built 2026-09-07 for the human's ask on the blanket Operation Growth decisions: "apply the whole
given/when/then with auto/semi-auto/step for each comparison … and build some general html to handle
it, instead of one whole html per decision row".

```
compare-player.js       the component: SBCompare.mount(el, decision) / mountAll — no dependencies
compare-player.css      its sheet (house palette; mock-grid faces: inherited · overlay · read-only · typed · redundant · ring)
page.template.html      the self-contained page shell build.mjs fills
build.mjs               node build.mjs <decisions.js> <images.json|-> <out.html> [title]  → ONE file, everything inlined
index.html              dev page: loads the three files by <script> (open from a static server or file://)
decisions-opgrowth.js   the five dojostack decisions (D1 · D2 · D3a/b/c · D4 · D5) as DATA
images-opgrowth.js/json the crops of today's photographs the decisions refer to as IMG.<name>
```

A decision is data — see the header comment in `compare-player.js` for the shape. A scene is a mock
grid (`kind:'grid'`: columns, one row of cells with a face and an optional ring, a House View chip, a
flag line, a dialog, and the `when` gesture that leads INTO the moment), a photograph with ring boxes
(`kind:'img'`), an honest empty (`kind:'empty'`) or raw html. Sources are aligned by moment index; a
source with fewer scenes holds its last.

Output for dojostack: `dojostack_main/dojo-blanket-opgrowth-player-2026-09-07.html`.
