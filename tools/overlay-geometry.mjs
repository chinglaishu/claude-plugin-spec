// THE OVERLAY'S GEOMETRY — ONE SOURCE, BOTH HALVES OF A BEAT ROW.
//
// A beat row is a comparison: the drawn schematic on one side, the photographed proof on the other,
// framed by one camera on one region (board R19). The comparison is only honest while the two are
// the SAME PICTURE — "identical except mock vs real" (the human, 2026-08-28). They were not: each
// side carried its own copy of the overlay's numbers, and an audit of the demo's R1 beat cells
// found the drawn ring reading ~12 page px out from the element box where the burned one reads ~5.
// On a thin target — a row title, an "added just now" stamp — that is a drawn ring twice the height
// of the photographed one, side by side, claiming to be the same thing.
//
// So the numbers live here, once, in PAGE PIXELS, and both sides import them:
//   · spec/_base.ts renderOverlay — the BURN-IN, which is the reference. It is what the photograph
//     actually shows, so this module states its rules; it never states new ones.
//   · tools/viz.mjs — the DRAWING, which converts every number by the one ratio it already uses
//     (S = drawing width / page width) and must land at the same apparent geometry.
//
// Pure: no DOM, no fs, no scale. tools/overlay-geometry.test.mjs pins it against the burn-in's own
// CSS arithmetic.

// THE RING, exactly as renderOverlay writes it:
//   left/top   = box - 4          (inset)
//   width/height = box + 8        (2 · inset)
//   border     = 2px solid        (a CSS border sits OUTSIDE that box)
//   border-radius = 6px
//   box-shadow = 0 0 0 3px paper  (the halo, spreading from the border box)
// `glow` is the burn-in's second shadow (0 0 16px at .30) — a BLUR, not an edge. It is named here
// so nothing has to guess at it, but it has no geometry: a drawing that renders it as a hard band
// is what produced the ~12px ring the audit measured, so viz.mjs draws no band for it.
export const RING = { inset: 4, stroke: 2, radius: 6, halo: 3, glow: 16 }

// THE CALLOUT, exactly as renderOverlay writes it: a 300px card, 11px radius, 12/15 padding, held
// `margin` off the viewport edge, `gap` off the target, with a 12px square rotated 45° for a notch.
// `sideNudge` is the 6px the beside-placements lift the card by; `notchInset` keeps the notch off
// the card's own corner. `reach` is the rotated square's visible half-base and tip reach.
export const CARD = {
  width: 300,
  radius: 11,
  padX: 15,
  padY: 12,
  gap: 12,
  margin: 12,
  notch: 12,
  reach: 12 / Math.SQRT2,
  sideNudge: 6,
  notchInset: 16
}

// a box measured by Playwright (width/height) and one recorded in a layout skeleton (w/h) are the
// same box; accept either spelling so neither side has to translate before asking a question
const norm = b => ({
  x: Number(b.x) || 0,
  y: Number(b.y) || 0,
  w: Number(b.w != null ? b.w : b.width) || 0,
  h: Number(b.h != null ? b.h : b.height) || 0
})

// The ring ELEMENT's own box — what renderOverlay sets left/top/width/height to.
export function ringBox (box) {
  const b = norm(box)
  return { x: b.x - RING.inset, y: b.y - RING.inset, w: b.w + 2 * RING.inset, h: b.h + 2 * RING.inset }
}

// Where the ring's STROKE is actually drawn: the border's centreline. A CSS border lies outside the
// element box, so this is `inset + stroke/2` out from the target — the rect a drawing must stroke to
// land on the photographed ring.
export function ringRect (box) {
  const b = norm(box)
  const o = RING.inset + RING.stroke / 2
  return { x: b.x - o, y: b.y - o, w: b.w + 2 * o, h: b.h + 2 * o }
}

// The LAST HARD MARK of the ring: the paper halo's outer edge. Everything past this is the blurred
// glow, which has no edge to match. This is the rect a callout treats as the obstacle it must clear.
export function ringOuter (box) {
  const b = norm(box)
  const o = RING.inset + RING.stroke + RING.halo
  return { x: b.x - o, y: b.y - o, w: b.w + 2 * o, h: b.h + 2 * o }
}

// THE UNION of two boxes — the smallest rect containing both. A scene's camera must show its ring
// AND its callout card, so the region is aimed at, and sized to contain, the union of the two.
export function unionRect (a, b) {
  if (!a) return b || null
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

// THE CALLOUT'S FULL RECT — where calloutSpot puts the card, at cw × ch. So both halves of a beat
// row (the burn-in's camera and the drawing's region) can ask "does the card fall in frame?" of ONE
// geometry (the human, 2026-08-30: never crop the explaining text box), and the camera can be
// widened to keep it there. `ch` is the card's height in the same page units; a caller with no
// measured height passes the shared max-line estimate so both cells frame the identical box.
export function calloutRect ({ box, vw, vh, cw = CARD.width, ch = 0 }) {
  const spot = calloutSpot({ box, vw, vh, cw, ch })
  return { x: spot.left, y: spot.top, w: cw, h: ch, side: spot.side }
}

// WHERE THE CALLOUT GOES (renderOverlay's rule, stated once).
//
// The card must read as ATTACHED to the ring, and must never cover it (the 2026-08-27 defect: on a
// small progress ring inside a wide row, "prefer right" put the card straight over that row's own
// title — the callout hid the very context the value is read in). So: BELOW the target first
// (pointer up), then ABOVE (pointer down), then beside it — each aligned to the target's centre and
// clamped to the viewport, and each candidate REJECTED if it overlaps the target box at all. Only
// when every placement would overlap or fall out of view does the card take the side with the most
// free room, clamped into view, with side 'none' so its notch is dropped rather than drawn pointing
// at nothing.
//
// `ch` is the card's measured height — the one input neither side can derive: the burn-in reads it
// off the DOM, the drawing estimates it from its own wrapped lines. Everything else is arithmetic.
export function calloutSpot ({ box, vw, vh, cw = CARD.width, ch = 0 }) {
  const b = norm(box)
  const pad = CARD.margin
  const gap = CARD.gap
  const cx = b.x + b.w / 2
  const clampX = v => Math.max(pad, Math.min(v, Math.max(pad, vw - cw - pad)))
  const clampY = v => Math.max(pad, Math.min(v, Math.max(pad, vh - ch - pad)))
  const cands = [
    { side: 'below', left: clampX(cx - cw / 2), top: b.y + b.h + gap },
    { side: 'above', left: clampX(cx - cw / 2), top: b.y - gap - ch },
    { side: 'right', left: b.x + b.w + gap, top: clampY(b.y - CARD.sideNudge) },
    { side: 'leftof', left: b.x - gap - cw, top: clampY(b.y - CARD.sideNudge) }
  ]
  const inView = c => c.left >= pad && c.left + cw <= vw - pad && c.top >= pad && c.top + ch <= vh - pad
  const covers = c => !(c.left + cw <= b.x || c.left >= b.x + b.w ||
    c.top + ch <= b.y || c.top >= b.y + b.h)
  const hit = cands.find(c => inView(c) && !covers(c))
  if (hit) return { side: hit.side, left: hit.left, top: hit.top }
  const room = [
    { side: 'below', v: vh - (b.y + b.h) - gap - pad },
    { side: 'above', v: b.y - gap - pad },
    { side: 'right', v: vw - (b.x + b.w) - gap - pad },
    { side: 'leftof', v: b.x - gap - pad }
  ].sort((a, z) => z.v - a.v)[0]
  const c = cands.find(x => x.side === room.side)
  return { side: 'none', left: clampX(c.left), top: clampY(c.top) }
}
