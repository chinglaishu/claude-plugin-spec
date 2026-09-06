// THE GRAFT (phase 8, 2026-09-05). The Expected of a moment is the screen's BASE replica — its
// Given, one body-rooted capture shared by every beat that starts from that state — with this
// moment's PATCH, the scene root the capture re-measured, standing where the same element stands in
// the base. Everything off the path from the base's root down to the graft point is marked
// `data-ctx`, which the reader's srcdoc CSS fades: the context is there so a reader can see WHERE
// the component sits, and faded so nobody mistakes it for a second reading of the same instant.
//
// Pure over a DOM-like node shape (`children`, `parentElement`, `setAttribute`, `replaceWith`), so
// it is unit-tested in node (tools/graft.test.mjs) and inlined verbatim into board.html beside
// stepper.js and words.js — real JavaScript, no template-literal escaping traps.
;(function (root) {
  // walk the element-child path the patch recorded (`data-replica-path`, phase 8 A2) down from the
  // base's own root. Element children only, exactly as the capture counted them.
  function walk (base, path) {
    if (!path) return base
    let n = base
    for (const s of String(path).split('/')) {
      const i = Number(s)
      const kids = (n && n.children) || []
      if (!Number.isInteger(i) || i < 0 || i >= kids.length) return null
      n = kids[i]
    }
    return n
  }
  function graft (base, patch, path) {
    // A BODY-ROOTED MOMENT IS THE BASE (the beat's own Given): there is nothing to stand anywhere
    // and nothing to fade — the whole page IS the moment.
    if (!path) return { ok: true, why: 'whole page' }
    if (!base || !patch) return { ok: false, why: 'no base to graft onto' }
    const at = walk(base, path)
    if (!at) return { ok: false, why: 'no element at ' + path + ' in the base' }
    // the ancestors of the graft point keep full ink: they are the frame the component sits in, and
    // fading them would fade the patch's own surroundings down to nothing legible.
    const keep = new Set()
    for (let n = at; n && n !== base; n = n.parentElement) keep.add(n)
    keep.add(base)
    // ONE FADE PER BRANCH (2026-09-06). The srcdoc sheet fades `data-ctx` with `opacity:.4`, and
    // CSS opacity COMPOUNDS through nesting — so marking a branch's descendants as well as its top
    // renders a leaf N levels down at .4^N. This walk marked every off-path element it could reach,
    // and on demo/todo R2 b1 that was 135 of 154 elements, the worst chain six deep: opacity .004,
    // an Expected cell that read as blank paper beside an Actual showing the whole task list. Only
    // the TOPMOST off-path element of each branch is marked now — its subtree fades with it, once —
    // so the recursion descends through KEPT nodes only.
    ;(function mark (n) {
      for (const k of ((n && n.children) || [])) {
        if (k === at) continue
        if (keep.has(k)) mark(k)
        else k.setAttribute('data-ctx', '1')
      }
    })(base)
    at.replaceWith(patch)
    return { ok: true, why: '' }
  }
  // WHERE THE PAGE STANDS IN THE FRAME (2026-09-06). The Expected cell is one srcdoc whose
  // coordinates the ring, the camera and the chips all speak: the VIEWPORT of the moment on show.
  // The markup standing in it does not necessarily speak the same frame —
  //   · a BODY-ROOTED replica (every base, and every whole-page moment) lays out in DOCUMENT
  //     coordinates. The window's scroll is not baked into its flow — the capture bakes only a
  //     scrolled BOX's own scrollTop (spec/_replica.mjs) — so document y 0 sits at viewport
  //     y = -scroll, and the wrapper stands at MINUS the moment's scroll.
  //   · a CROPPED scene stands where its own root stood: its region, carried across whatever the
  //     page scrolled between its capture and the moment on show (0 for every lone patch, which IS
  //     its own moment).
  // This is the defect the fix closes: the moment's scroll was recorded NOWHERE, so the reader
  // could not convert. It stood a base at the page origin — right only at scroll 0 — and before
  // that at the base's own region.y, right only when the two scrolls happened to agree; on
  // demo/todo the ring sat a whole row above the thing it marks. `data-replica-scroll` records it
  // at capture. A harvest from before that carries no scroll and gets exactly today's answer: a
  // scroll nobody measured is never invented (rule 3).
  //
  // stand({ whole, region, scroll, moment }) → { x, y, w, h } | null
  //   region  the replica's own `data-replica-region` — its scene root's rect at ITS capture
  //   whole   is that replica the whole page (`data-replica-path` === '')?
  //   scroll  the page scroll that replica was captured at, or null
  //   moment  the page scroll of the moment the row is showing (the patch's own), or null
  function stand (o) {
    var reg = o && o.region
    if (!reg || !isFinite(reg.w) || !isFinite(reg.h)) return null
    var mv = num(o.moment)
    // `|| 0` also folds the -0 an unscrolled page would otherwise carry into a style attribute
    if (o.whole) return { x: mv ? (-mv.x || 0) : 0, y: mv ? (-mv.y || 0) : 0, w: reg.w, h: reg.h }
    var own = num(o.scroll)
    var dx = (mv && own) ? own.x - mv.x : 0
    var dy = (mv && own) ? own.y - mv.y : 0
    return { x: reg.x + dx, y: reg.y + dy, w: reg.w, h: reg.h }
  }
  // a scroll is a pair of finite numbers or it is nothing — the values come out of a committed file
  function num (s) {
    if (!s) return null
    var x = Number(s.x); var y = Number(s.y)
    return (isFinite(x) && isFinite(y)) ? { x: x, y: y } : null
  }
  // ── THE RING MARKS THE ELEMENT (the human, 2026-09-06) ──────────────────────────────────────────
  // `stand` puts the composed page in the moment's frame by SCROLL alone, which is right exactly
  // while the base's flow and the moment's flow agree. They do not always: the base is the beat's
  // OPENING state, so a When that filters, collapses or adds rows re-lays the page out under the
  // graft point, and the patch — which is spliced into the base's own flow — lands wherever that
  // flow puts it rather than at the coordinates its own capture recorded. The ring, the camera and
  // the chips all speak the moment's viewport, so the ring then sits on whatever the base happens to
  // have at those coordinates. Measured on this repo's own board before the fix: board R9 b1 rang a
  // card 520 px above the one it names, board R1 b1 one 571 px below it.
  //
  // The rule: the composed page is STOOD so the moment's own ringed element renders where the moment
  // recorded it. It is a rigid translation of the whole page, so nothing inside it is re-laid out —
  // and it is what board R19 already asks for in words ("the grafted patch stands at its own page
  // coordinates, so the ring lands on it"), enforced now instead of hoped for. The ring itself does
  // not move: after the shift the recorded box IS the element's box, which keeps ONE camera over the
  // two cells (R19's other half) rather than aiming the Expected somewhere the Actual is not.
  //
  // ringTarget(root) — the element this replica rang, `data-ring="1"` (spec/_replica.mjs), found at
  // the root itself or the first one under it. DOM-shaped, so it is exercised on a stub in node.
  function ringTarget (root) {
    if (!root) return null
    if (root.getAttribute && root.getAttribute('data-ring')) return root
    for (var i = 0, kids = (root.children || []); i < kids.length; i++) {
      var found = ringTarget(kids[i])
      if (found) return found
    }
    return null
  }
  // alignTo(at, measured, recorded) → where the wrapper stands so `measured` lands on `recorded`.
  // NEVER INVENTS (rule 3): with nothing measured, nothing recorded, or a number that is not one, the
  // page keeps exactly the place `stand` gave it — the answer this had before the fix. A shift under
  // A shift of half a pixel or less is no shift at all, so every already-aligned moment (the demo's
  // worst measured drift IS 0.5 px) is returned untouched rather than nudged by rounding.
  function alignTo (at, measured, recorded) {
    if (!at) return null
    if (!measured || !recorded) return at
    var dx = Number(recorded.x) - Number(measured.x)
    var dy = Number(recorded.y) - Number(measured.y)
    if (!isFinite(dx) || !isFinite(dy)) return at
    if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) return at
    return { x: at.x + dx, y: at.y + dy, w: at.w, h: at.h }
  }
  root.SBGraft = { graft: graft, walk: walk, stand: stand, ringTarget: ringTarget, alignTo: alignTo }
})(typeof globalThis !== 'undefined' ? globalThis : this)
