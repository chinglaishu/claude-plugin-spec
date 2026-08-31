// THE CALLOUT'S WORDS — ONE SOURCE, BOTH SIDES OF THE COMPARISON.
//
// A beat row is a comparison: the drawn schematic and the photographed proof, framed by one camera
// on one region (board R19). tools/overlay-geometry.mjs already made the ring and the card's
// PLACEMENT one source, because two copies of the numbers drifted. This module is the same fix for
// the card's WORDS, which drifted the same way: the drawing said the When alone mid-beat while the
// burn-in already claimed the Then — one scene before that Then existed.
//
// The human, 2026-08-30: "only have to include the text for current small step (as less text as
// possible) — and both the schematic and proof need to have exact same text."
//
// So a callout carries a tiny id chip and ONE SENTENCE: the line the scene in front of you is
// proving. A scene showing the When's action says the WHEN; the scene the beat comes to rest on
// says the THEN. Never the requirement title, never both lines stacked — the card floats over the
// app being proven, and a paragraph there hides the very thing it points at.
//
//   · spec/_base.ts renderOverlay — the BURN-IN. It is painted live, so it asks with `done` = the
//     beat's verdict having landed (BEHAVIOR.state !== 'active').
//   · tools/viz.mjs cardFor — the DRAWING. It asks per FRAME, with `done` = sceneDone(j, scenes).
//
// The one thing that is NOT shared: a failing burn-in appends the got value it read off the page.
// The drawing has no got — nothing measures one at derive time — so it draws the sentence alone.
// The SENTENCE is identical; the failure's affix is burn-only, and says so here rather than being
// discovered as a disagreement later.
//
// Pure: no DOM, no fs. tools/callout-text.test.mjs pins the rule; tools/viz.test.mjs pins that the
// drawing obeys it, and spec/board/test.spec.ts (board R10/R19) that the burn-in does.

// THE ONE LINE'S TYPE, in page pixels, exactly as renderOverlay writes it — stated here so the
// drawing converts these by its single ratio instead of keeping a second opinion (the mirror
// contract tools/overlay-geometry.mjs established). `maxLines` is the wrap cap both sides honour:
// past two lines a card stops being a callout and becomes a paragraph.
export const CALLOUT_TYPE = {
  id: 10,        // the id chip's mono
  lab: 10,       // the WHEN / THEN mono label
  line: 14,      // the sentence itself
  lh: 1.4,       // its line-height
  tagGap: 8,     // chip row → sentence
  maxLines: 2
}

import { CARD } from './overlay-geometry.mjs'

// THE CARD'S HEIGHT, in page pixels — the ONE height both cells frame their region around (the
// human, 2026-08-30: never crop the card, and both cells frame the same box). It is the burn-in's
// own card arithmetic: padY, the id chip, the tag gap, `lines` of sentence, padY. A caller that
// knows the sentence's true line count passes it; the camera-region callers pass the wrap cap, so
// the region is sized for the tallest a one-sentence card can ever be and never crops a real one.
export function calloutBoxHeight (lines = CALLOUT_TYPE.maxLines) {
  const t = CALLOUT_TYPE
  const chipH = t.id * 1.2 + 4
  const bodyH = Math.max(1, lines) * t.line * t.lh
  return CARD.padY + chipH + t.tagGap + bodyH + CARD.padY
}

const raw = s => String(s == null ? '' : s).trim()

// WHICH SCENE IS THE RESULT. A beat's proof loop is before → each asserted value → after, and the
// drawing parks on that same list, one point per scene (board R19/R20). Only the LAST of them is
// the beat at rest; everything before it is the action still happening.
export function sceneDone (j, count) {
  return count > 0 && j === count - 1
}

// THE RULE. `done` names the scene: false while the action is being shown, true on the scene the
// beat rests on. The card takes the matching sentence — and, where that half is empty, the half
// that exists, because a blank card is worse than the only line there is (rule 3). The `label` is
// always the one belonging to the text actually returned, so the two can never disagree.
export function calloutText ({ id = '', when = '', then = '', done = false } = {}) {
  const w = raw(when)
  const t = raw(then)
  const order = done ? [['Then', t], ['When', w]] : [['When', w], ['Then', t]]
  const hit = order.find(([, s]) => s)
  return {
    id: raw(id),
    label: hit ? hit[0] : (done ? 'Then' : 'When'),
    text: hit ? hit[1] : '',
    empty: !hit
  }
}
