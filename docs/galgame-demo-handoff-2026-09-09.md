# Handoff — gal-game Conflicts demo (three options, real sprites)

You are working in `/Users/laishuching/workspace/claude-plugin-spec` (specboard). Read `CLAUDE.md` first. Another Claude session shares this working tree: stage files explicitly, never `git add -A`, never create worktrees.

## Why this exists

The human wants gamification in specboard, in the register of a Japanese gal game (visual-novel / dating-sim dialogue, anime heroines). The natural beat is the Conflicts page: one fact stated N incompatible ways by N sources, and the human picks which side is canon (conflicts R3 — "the tool never picks"). That choice IS a dialogue-choice screen. Beyond that one screen, the human wants gal-game elements throughout the product.

Decisions already made by the human (do not reopen):
- Purpose: ALL THREE — delight, behaviour change (get the queue cleared), and onboarding/teaching.
- They could NOT decide the visual register and want to decide by looking at a demo. Build all three options below, side by side, on the same real data.
- NO hand-drawn SVG characters. They said it "will look like shit". Every sprite is generated with the image API below.
- The demo is a self-contained local HTML file with every asset inlined (data URIs), opened with `open -a "Google Chrome"`. NEVER a dev server, a preview pane, or an artifact link alone.
- Prose is not a deliverable. The human prefers a picture plus a recommendation. State the failure mode of each option before recommending one.

## Read these before building

- `docs/part-b-conflicts-scope-2026-09-08.html` — the Conflicts page scope (N kinded sides: spec / doc / code / actual; picture sides; resolve-by-kind). Reuse its mock markup and its `:root` tokens; it already renders the exact finding you will stage.
- `spec/conflicts/prd.md` — R1–R5. R3: picking a side records nothing until Resolve is pressed. R4: resolving dispatches the rewrite of the losing side. Keep both true in the demo flow.
- `spec/_design.css` — the design system (traditional Japanese dye colours at low saturation on unbleached paper; indigo / koke / bengara / yamabuki; type scale `--t-xs` … `--t-xxl`; radius `--r`; ONE inverted element per screen). Option A must obey it fully.
- `docs/superpowers/mockups/` — prior mocks, for the naming convention `<date>-<topic>.html`.

## The real data to stage (identical across all three options)

Board R2 conflict from the Part B doc. One fact, three sides:

| kind | source | says |
|---|---|---|
| SPEC | `spec/board/prd.md` · R2 | "one card that scrolls inside itself, its canvas the full 960px reading width" |
| CODE | `tools/build-board.mjs:844` | canvas width 720px (a claim → renders as a picture on the base replica) |
| ACTUAL | harvested · run cc60b52 | rendered 720px (a recording/still) |

Finding title: "How wide is the requirement card's canvas?" Resolve-by-kind consequences (Part B change 4): spec loses → rewrite the prd; code loses → recorded, card reads mismatch until a red-first fix; actual is never rewritten.

## The cast — four heroines, one per source kind

Each side of a conflict is SPOKEN by the character of its kind, so "pick canon" becomes "whose word do you take". Names are placeholders the human can rename.

| kind | name | dye | role / voice | speaks in the R2 scene |
|---|---|---|---|---|
| SPEC | Shiori (栞) | indigo | the archivist; quotes the written requirement verbatim, calm, certain | the prd quote, 960px |
| CODE | Rin | ink / grey | the engineer; cites file:line, dry, a little smug | "build-board.mjs line 844. 720." |
| ACTUAL | Hana | koke (green) | the app itself; shows rather than tells, cheerful, never argues, can't be rewritten | "This is what I drew. 720." + the picture |
| DOC | Yui | yamabuki | the note-taker; owns the side docs, asks the question cards | not in R2 (used in the "throughout" strip) |

Personality is a STATE FACE, not a nag: characters react, they never interrupt, block, or auto-advance (CLAUDE.md: never take control from the user). Provide a visible "quiet mode" toggle that hides the cast and leaves the plain board.

## Sprite generation — Atlas Cloud, gpt-image-2

Key (the human pasted it in chat and said not to care about that):

    export ATLAS_CLOUD_API_KEY=apikey-e82aafe420f84c459f69631a59af883a

API (verified from Atlas Cloud's model pages 2026-09-09):

    POST https://api.atlascloud.ai/api/v1/model/generateImage
    Authorization: Bearer $ATLAS_CLOUD_API_KEY
    Content-Type: application/json

    text-to-image body: { "model": "openai/gpt-image-2/text-to-image", "prompt": "...", "size": "1024x1536", "quality": "medium", "enable_base64_output": true }
    edit body:          { "model": "openai/gpt-image-2/edit", "prompt": "...", "image": ["<url or data URI of the base sprite>"], "size": "1024x1536", "quality": "medium", "enable_base64_output": true }
    response: { id, status: created|processing|completed|failed, outputs: [ ... ], ... }
    poll:     GET https://api.atlascloud.ai/api/v1/model/prediction/{id}   until status is completed (or pass "enable_sync_mode": true and check whether it blocks)

Verify the request shape with ONE cheap call before generating the sheet; if a field name differs, fix it and carry on. If `enable_base64_output` is unsupported, download the output URL.

Pipeline (write it as `docs/superpowers/mockups/sprites/gen.mjs`, plain Node 20+, no deps, idempotent — skip a file that exists):
1. One BASE bust per character via text-to-image (4 calls). Prompt for consistent identity: anime visual-novel heroine bust (head to mid-torso), front three-quarter view, clean line art, flat cel shading, plain solid background, no text, no watermark. Give each a distinct hair shape + the kind's colour as her accent (hair ribbon / collar / eyes): Shiori indigo, Rin charcoal grey, Hana moss green, Yui ochre yellow.
2. Five EXPRESSIONS per character via edit, base image as reference, "same character, same outfit, same framing, only the expression changes": neutral · happy · worried · confident · sulk (20 calls). Consistency of face across the sheet matters more than beauty; if edit drifts, regenerate that one.
3. Two palettes are needed because Option A must live inside the dye system: generate the sheet ONCE with a plain flat `#f4f1ea` background (the paper token, easy to key out or leave in place), then for Option A apply a CSS `filter: saturate(.55) contrast(.95)` and a mix-blend or duotone overlay in the dye tokens so the art sits on paper. Do NOT generate a separate "muted" sheet unless the CSS treatment clearly fails; if it fails, say so and generate one with "muted traditional Japanese dye palette, ink line art on unbleached paper" in the prompt.
4. Save `sprites/<name>-<expr>.png` (downscale to ≤ 512px tall with sips or a canvas step so the inlined HTML stays under a few MB) and a `sprites/cast-sheet.html` grid the human can look at.

Budget: ~24 images at $0.008 each. If a call fails three times, stop that branch, note it, and continue with what exists — never fake a sprite with drawn SVG.

## The three options to build — one file, three tabs

File: `docs/superpowers/mockups/2026-09-09-galgame-conflicts.html`. Everything inlined. Tabs at the top: `A · in-palette` · `B · scene layer` · `C · full skin`. Each tab stages the same R2 conflict end to end:

1. The finding card as the Part B mock draws it (topbar with the open count, three side cards, the play-mode picker) — kept, not replaced.
2. Under it (A) or over it (B, C): the DIALOGUE. Shiori speaks the prd quote; Rin cites the line; Hana shows the 720px still. Typewriter text with a ▼ continue cue; click or space advances; nothing auto-advances past a choice.
3. The CHOICE: "Whose word is canon?" — one option per side, phrased as the character ("Take Shiori's word — the prd, 960px" …). Picking highlights that side card (`.win`) and ENABLES Resolve. Nothing is recorded yet (R3).
4. The REACTION: the losers respond in character according to resolve-by-kind (Shiori loses: "Then I'll rewrite the prd." Rin loses: "Mismatch until a red-first fix lands." Hana can never lose to a written side without the row going red — show that honestly).
5. RESOLVE pressed: toast names it, Open count ticks down, Settled ticks up, you stay on Open (R4). Undo available in a Settled tab.

Option A — in-palette. The dialogue box is the board's own card language (paper, `--line`, `--r`, mono name tag in the kind's dye chip). Sprites are treated with the CSS filter to sit on paper. Faces two-tone-ish. One inverted element per screen (the Resolve button, nothing else). WCAG AA on every text pair. Failure mode to show in the decide panel: may read "tasteful" rather than gal game.

Option B — scene layer. The choice moment opens a full-bleed visual-novel scene over the dimmed board: full-colour sprites (no filter), VN name plate, VN dialogue box, centred choice menu, scene background = the board blurred. After Resolve, the scene closes back to the unchanged paper board. Failure mode: two visual worlds; sprite quality must carry it.

Option C — full skin. The whole Conflicts page IS the visual novel: dark VN chrome, sides as a route menu, board counters as VN HUD, sprites always on stage. Failure mode: retires the design-system rule; largest build; every other screen must follow.

## The "throughout the product" strip (one row under the tabs, shared)

Four small panels showing where the cast lives outside Conflicts. Every number is DERIVED, never stored (CLAUDE.md rule: no status field, never fake a green):
- Home greeter: Hana's mood follows the proven count (27/27 → happy; anything unproven → neutral, never angry). Caption says "derived from the fold".
- Unproven row: Shiori, worried, "R12 has no proof yet" — a state face on the row, no popup.
- Question card Q1: Yui asks "is this a requirement?" with the existing Yes / No / Not yet.
- Proven toast: Hana happy when a run turns a row green.
Do NOT add points, streaks, XP, affection meters or leaderboards. The research below says counters on judgment calls get gamed and public ranking backfires; the only scalar this product has is proven/unproven and it stays the only one.

## The decide panel (bottom of the file)

A three-column table: what you see · what it costs · failure mode, one column per option, then ONE recommended option with the reason, and a short list of the references below so the human can see the field. Also save a screenshot PNG of each tab (`2026-09-09-galgame-A.png` etc.) beside the html via headless Chromium (Playwright is installed in this repo; do not run the e2e suite, do not touch port 4173).

References to cite (verified 2026-09-09):
- Character inside a workflow decision: Clippy (mandatory + interruptive = the canonical backfire); Notion AI face (a state indicator only: eyebrows while thinking, face falls apart on error) — the pattern to copy.
- Companions that ask nothing win: vscode-pets; those that demand care get gamed: code-tamagotchi (+XP per deleted line).
- Visual-novel × real engineering: Code Romantic (VN + real C# puzzles), paiza's コードガールこれくしょん (heroine + gacha over coding drills), TwilioQuest (RPG missions over your real terminal), Zachtronics TIS-100 / SHENZHEN I/O.
- Honest scalars that work: Stryker mutation score (killed mutants = proven/unproven's cousin), Codewars kyu (rank ≠ activity), Advent of Code stars — and AoC REMOVED its global leaderboard after abuse.
- Backfires: GitHub YOLO/Pull Shark badges reward skipping review; Stack Overflow reputation grew voting rings; the "Achievement Unlocked" DevOps badge study (arXiv 2208.05860) — the testing badge cut commits; novelty effect drops after ~4 weeks (Rodrigues 2022).
- No dev tool with a real dialogue-choice UI for decisions was found. This is new ground; say so on the panel.

## Boundaries

- Mock only. Do not touch `tools/`, `spec/`, `build-board.mjs`, `board.html`, or any test. Do not start the board.
- Do not invent requirement text; the human owns meaning. Character lines paraphrase what the sides already say.
- Stage explicitly and commit: `git add docs/superpowers/mockups/2026-09-09-galgame-* docs/superpowers/mockups/sprites` then commit `docs(mock): gal-game Conflicts demo — three options on board R2, generated cast` and push.
- Finish by opening the html in Chrome and reporting: what was built, which sprites failed or drifted, the WCAG result for A, and your recommendation with its failure mode. If anything could not be verified, lead with that.
