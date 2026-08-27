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

  // THE PROOF CELL'S CAMERA (the human, 2026-08-28). A beat's proof cell shows the FOCUSED
  // component, not the whole screen: the harvest records the ringed target's box and the viewport it
  // was measured in (`focus:{x,y,w,h,vw,vh}`), and the cell frames that box like a camera — the media
  // is scaled and translated under a fixed-size window, never cropped. The full screenshot is always
  // one toggle away, so this is a VIEW, not a claim about the evidence.
  //
  // The maths, once, here — because stills, the stepper's frames and the video must all be framed
  // IDENTICALLY or the view jumps as the cell changes mode.
  //   · pad the rect by `pad` (≈2.75× its size) about its centre, so the component is read in
  //     context rather than cropped to its own edges;
  //   · clamp the padded rect inside the frame — a target near an edge pans, it never shows void;
  //   · fit that rect INSIDE the cell (min, not max): the whole padded rect is always visible, so a
  //     cell of any aspect shows more context rather than hiding part of the target;
  //   · never scale below 1 — a rect wider than the cell would otherwise shrink the evidence, and a
  //     "zoom" that zooms out is a lie.
  // Returns the transform for a media element laid out at width = cell.w (its height following the
  // frame's own aspect), with transform-origin 0 0: translate(tx, ty) scale(scale), in cell pixels.
  function cameraView (focus, cell, opts) {
    var o = opts || {}
    var pad = o.pad != null ? o.pad : 2.75
    // maxScale caps the magnification: a DRAWING (the wireframe schematic) zoomed as hard as a
    // screenshot blows its strokes into unreadable curves — the schematic cell passes a cap so the
    // camera frames the same region with more context instead of more pixels. The pad grows to
    // spend the spare magnification on surroundings, keeping the focus centred.
    var maxScale = o.maxScale != null ? +o.maxScale : Infinity
    var none = { scale: 1, tx: 0, ty: 0, ok: false }
    if (!focus || !cell) return none
    var vw = +focus.vw; var vh = +focus.vh
    var cw = +cell.w; var ch = +cell.h
    var x = +focus.x; var y = +focus.y; var w = +focus.w; var h = +focus.h
    var nums = [vw, vh, cw, ch, x, y, w, h]
    for (var i = 0; i < nums.length; i++) if (typeof nums[i] !== 'number' || !isFinite(nums[i])) return none
    if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0 || w <= 0 || h <= 0) return none
    // the padded rect, clamped into the frame
    var pw = Math.min(vw, w * pad); var ph = Math.min(vh, h * pad)
    var px = Math.min(Math.max(0, x + w / 2 - pw / 2), vw - pw)
    var py = Math.min(Math.max(0, y + h / 2 - ph / 2), vh - ph)
    // the media renders at cell width, so one source pixel is r cell pixels
    var r = cw / vw
    var scale = Math.min(cw / (pw * r), ch / (ph * r))
    if (scale > maxScale) {
      // re-frame at the cap: widen the padded rect so the capped zoom still fills the cell
      scale = maxScale
      pw = Math.min(vw, cw / (r * scale)); ph = Math.min(vh, ch / (r * scale))
      px = Math.min(Math.max(0, x + w / 2 - pw / 2), vw - pw)
      py = Math.min(Math.max(0, y + h / 2 - ph / 2), vh - ph)
    }
    if (!(scale > 1)) return none          // nothing to magnify — show the frame whole, honestly
    var tx = (cw - pw * r * scale) / 2 - px * r * scale
    var ty = (ch - ph * r * scale) / 2 - py * r * scale
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
