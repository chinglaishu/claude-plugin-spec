// The gif-mode frame-stepper's PURE timing math (Task 13). The board's gif mode plays a
// requirement's harvested frames — before → each asserted-value frame → after — as a JS-driven
// stepper (the human's choice, 2026-08-24: a webp exposes no current frame, so exact dots and a
// 0.25×–4× speed need the frames held by script). This file computes only the HOLDS; the DOM
// player lives in client.js (buildMedia). Authored like client.js as a real, verbatim-inlined
// script — build-board.mjs reads it into its own <script> before the client — and it registers on
// globalThis so node --test reaches the SAME bytes (tools/stepper.test.mjs).
(function () {
  'use strict'

  // Each frame's hold, from its timing ANCHOR — its offset in ms into the run's recording. The
  // before frame anchors at the evidence window's `from`, each asserted-value frame at its own
  // recorded `t`, the after frame at `to`. holds[i] is the TRUE relative duration anchor[i+1] −
  // anchor[i], clamped into [min, max] so a sub-perceptual assert body stays readable and one slow
  // beat cannot park the loop; the LAST frame — the payoff — gets a fixed readable `dwell` before
  // the loop restarts (no later anchor exists to derive it from). `timed` says the truth was
  // available: anchors are honest only when every one is a number and they strictly increase —
  // an old harvest (null window, frames without t) or anchors mixed from two different recordings
  // fail that and fall back to EQUAL holds, never an invented pace.
  function stepperHolds (anchors, opts) {
    var o = opts || {}
    var min = o.min != null ? o.min : 350
    var max = o.max != null ? o.max : 6000
    var dwell = o.dwell != null ? o.dwell : 1600
    var equal = o.equal != null ? o.equal : 1200
    var n = anchors ? anchors.length : 0
    if (!n) return { holds: [], timed: false }
    if (n === 1) return { holds: [dwell], timed: false }
    var ok = true
    for (var i = 0; i < n; i++) {
      var a = anchors[i]
      if (typeof a !== 'number' || !isFinite(a) || (i > 0 && a <= anchors[i - 1])) { ok = false; break }
    }
    var holds = []
    for (var j = 0; j < n; j++) {
      if (!ok) holds.push(equal)
      else if (j === n - 1) holds.push(dwell)
      else holds.push(Math.min(max, Math.max(min, Math.round(anchors[j + 1] - anchors[j]))))
    }
    return { holds: holds, timed: ok }
  }

  // A hold at the chosen speed: 4× compresses, 0.25× stretches. Floored at 40ms so a maxed-out
  // speed can never busy-loop the timer; a broken speed (0, negative, undefined) reads as 1×.
  function scaleHold (ms, speed) {
    var s = (typeof speed === 'number' && speed > 0) ? speed : 1
    if (s === 1) return ms
    return Math.max(40, Math.round(ms / s))
  }

  // THE BEAT ROW'S CAMERA (the human, 2026-08-28). A row's two visual cells show the FOCUSED
  // component, not the whole screen: the harvest records the ringed target's box and the viewport it
  // was measured in (`focus:{x,y,w,h,vw,vh}`), and both cells frame that box like a camera — the
  // media scaled and translated under a fixed window. The whole screenshot stays one toggle away, so
  // this is a VIEW, not a claim about the evidence.
  //
  // The maths, once, here — because the drawing, the stepper's frames and the stills must be framed
  // IDENTICALLY, or the row stops being a comparison and the view jumps as a cell changes mode.
  //   · pad the rect by `pad` (a breathing ×1.2) about its centre, so the component is read with a
  //     little of its surroundings rather than cropped to its own edges;
  //   · COVER the cell with that rect (max, not min) — see below;
  //   · cap the magnification (maxScale / minFrac, and the scale at which the AIM stops fitting);
  //   · never scale below 1 — a "zoom" that zooms out is a lie;
  //   · centre the framed region on the SCENE being shown and clamp it inside the frame — a target
  //     near an edge pans, it never shows void.
  //
  // TIGHT, AND AIMED AT THE SCENE (the human, 2026-08-31: "do more aggressive zoom in on the area
  // it's focusing"). Two changes, mirrored verbatim in tools/viz.mjs framedRegion:
  //   · the pad drops 2.75 → 1.2 and the cap rises 2.2 → 3.2, so the ringed thing FILLS the cell
  //     instead of reading at a third of it;
  //   · `opts.aim` — the ring of the scene currently on show — sets the CENTRE, while the beat's
  //     focus rect still sets the zoom. A beat's rings can be 600px apart down the page (the demo's
  //     R1 types at the top and proves two rows near the bottom); one camera that had to hold all of
  //     them at once could only do it by zooming back out, which is exactly the under-zoom being
  //     complained about. One magnification per beat (no pump), one aim per scene. With no aim this
  //     is byte-for-byte the old camera.
  //
  // COVER, NOT CONTAIN (the human, 2026-08-28 — the second miss). Fitting the padded rect INSIDE the
  // cell meant a wide, short target — a whole task row, ~800px of a 1280px page — computed a
  // horizontal scale of 1, gave up, and showed the full screenshot, while the drawing beside it was
  // zoomed. Two cells, two different regions: exactly the incomparability the camera exists to
  // remove. Covering instead zooms on whichever axis needs it and crops the other, so a wide-short
  // target is magnified vertically with its sides cropped, still centred. Only a target that really
  // does span the page (scale ≤ 1 even under cover) may honestly show full-frame.
  //
  // Returns the transform for a media element laid out at width = cell.w (its height following the
  // frame's own aspect), with transform-origin 0 0: translate(tx, ty) scale(scale), in cell pixels.
  function cameraView (focus, cell, opts) {
    var o = opts || {}
    var pad = o.pad != null ? o.pad : 1.2
    // TWO FLOORS ON THE ZOOM, both spending spare magnification on surroundings rather than pixels,
    // and both keeping the focus centred:
    //   maxScale — a hard cap. A DRAWING zoomed as hard as a screenshot blows its strokes into
    //     unreadable curves, and a screenshot zoomed onto a 30px checkbox fills the cell with a
    //     checkbox and loses the row it sits in (the human, 2026-08-28).
    //   minFrac — the framed region never narrower than this fraction of the frame's own width. It
    //     is the same cap said in the units that actually matter: a target's size varies wildly, the
    //     amount of PAGE you can still see is what makes the frame readable. Expressed as a scale
    //     (framed width = vw / scale) it simply joins maxScale, and the stricter of the two wins.
    var maxScale = o.maxScale != null ? +o.maxScale : Infinity
    var minFrac = o.minFrac != null ? +o.minFrac : 0
    if (minFrac > 0 && minFrac <= 1) maxScale = Math.min(maxScale, 1 / minFrac)
    var none = { scale: 1, tx: 0, ty: 0, ok: false }
    if (!focus || !cell) return none
    var vw = +focus.vw; var vh = +focus.vh
    var cw = +cell.w; var ch = +cell.h
    var x = +focus.x; var y = +focus.y; var w = +focus.w; var h = +focus.h
    var nums = [vw, vh, cw, ch, x, y, w, h]
    for (var i = 0; i < nums.length; i++) if (typeof nums[i] !== 'number' || !isFinite(nums[i])) return none
    if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0 || w <= 0 || h <= 0) return none
    // the padded rect, clamped into the frame — and where the pad does NOT fit, a MARGIN instead of
    // the whole frame (2026-08-29). A beat's camera frames the union of its rings now, so a target
    // can be a third of the page; clamping that to the frame gave up the zoom altogether and the row
    // became two 0.39× screenshots of a 1440px app. Mirrored verbatim in tools/viz.mjs framedRegion.
    var MARGIN = 1.12
    var padOne = function (size, frame) {
      var want = size * pad
      return want <= frame ? want : Math.min(frame, size * MARGIN)
    }
    var pw = padOne(w, vw); var ph = padOne(h, vh)
    // THE AIM — the ring of the scene on show, in the same page units as the focus. It moves the
    // camera; it never changes its zoom. Anything unusable falls back to the focus itself, which is
    // the pre-2026-08-31 camera exactly.
    var a = o.aim
    var aok = !!(a && isFinite(+a.x) && isFinite(+a.y) && +a.w > 0 && +a.h > 0)
    var ax = aok ? +a.x : x; var ay = aok ? +a.y : y
    var aw = aok ? +a.w : w; var ah = aok ? +a.h : h
    // the media renders at cell width, so one source pixel is r cell pixels, and the media's own
    // rendered height at scale 1 follows the frame's aspect
    var r = cw / vw
    var mh = cw * vh / vw
    // …and NEVER past the scale at which the AIM ITSELF stops fitting (2026-08-29). Cover is the
    // right rule for a small target read in context, but covering a rect taller than the cell crops
    // the very scene the row is showing — the demo's R1 put the typed Add box above the crop, so
    // "the When is visible in both cells" was still false at the zoom. A small target never reaches
    // this: maxScale bites long before it does. Mirrored in tools/viz.mjs framedRegion.
    var cap = Math.min(maxScale, Math.min(cw / (aw * MARGIN * r), ch / (ah * MARGIN * r)))
    var scale = Math.min(cap, Math.max(cw / (pw * r), ch / (ph * r)))
    if (!(scale > 1)) return none          // nothing to magnify — show the frame whole, honestly
    // the framed region, in page units — then centred on the AIM and clamped inside the frame, so a
    // scene at the page's edge pans instead of showing blank ground beside the evidence
    var rw = cw / (r * scale); var rh = ch / (r * scale)
    var rx = Math.min(Math.max(0, ax + aw / 2 - rw / 2), Math.max(0, vw - rw))
    var ry = Math.min(Math.max(0, ay + ah / 2 - rh / 2), Math.max(0, vh - rh))
    var tx = -rx * r * scale
    var ty = -ry * r * scale
    // hold the scaled media over the cell: an aspect the cell does not share could still leave the
    // crop short on one axis, and blank ground beside the evidence is never the honest answer.
    var mw = cw * scale; var mhs = mh * scale
    tx = mw >= cw ? Math.min(0, Math.max(cw - mw, tx)) : (cw - mw) / 2
    ty = mhs >= ch ? Math.min(0, Math.max(ch - mhs, ty)) : (ch - mhs) / 2
    return { scale: scale, tx: tx, ty: ty, ok: true }
  }

  // The CSS the camera view becomes — one string, so every mode in a cell is transformed by the
  // same code path (a second hand-written transform is how stills and video drift apart).
  function cameraCss (view) {
    if (!view || !view.ok) return 'none'
    return 'translate(' + round2(view.tx) + 'px, ' + round2(view.ty) + 'px) scale(' + round3(view.scale) + ')'
  }
  function round2 (n) { return Math.round(n * 100) / 100 }
  function round3 (n) { return Math.round(n * 1000) / 1000 }

  globalThis.SBStepper = {
    stepperHolds: stepperHolds,
    scaleHold: scaleHold,
    cameraView: cameraView,
    cameraCss: cameraCss
  }
})()
