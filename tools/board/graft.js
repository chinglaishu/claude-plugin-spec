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
    ;(function mark (n) {
      for (const k of ((n && n.children) || [])) {
        if (k === at) continue
        if (!keep.has(k)) k.setAttribute('data-ctx', '1')
        mark(k)
      }
    })(base)
    at.replaceWith(patch)
    return { ok: true, why: '' }
  }
  root.SBGraft = { graft: graft, walk: walk }
})(typeof globalThis !== 'undefined' ? globalThis : this)
