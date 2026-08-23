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

  globalThis.SBStepper = { stepperHolds: stepperHolds, scaleHold: scaleHold }
})()
