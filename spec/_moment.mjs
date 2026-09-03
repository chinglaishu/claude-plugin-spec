// spec/_moment.mjs — ONE MOMENT, ONE INSTANT (task 3b, item 1 — 2026-09-04).
//
// A beat's moment is TWO readings of one page: the layout skeleton (spec/_layout-walk.mjs, what the
// mirror is drawn from and what the gate compares against) and the replica (spec/_replica.mjs, the
// app's own markup, the picture the board shows as Actual). They were taken in two separate
// `page.evaluate` calls, with an element-handle resolve — and, before them, a screenshot — in
// between: several hundred milliseconds in which an SPA settles a view change. The pair then
// described two different pages, and the gate reported every difference as a replica gap. `board`
// R3, R5 and R11 came and went from the census across runs with nothing aimed at them, which is the
// signature of a race and not of a capture defect (task-4a-report.md's diagnosis, task-4b's
// evidence).
//
// Both halves are SELF-CONTAINED functions by construction (neither may import anything, because
// Playwright serialises each by its source). So the fix is not a settle, a retry or a signature
// check — it is to stop taking them apart: this composes the two sources into ONE expression that
// Playwright evaluates once. `page.evaluate` accepts a STRING whose value is a function and calls it
// with the arg, through the same mechanism it uses for a function, so nothing new is asked of the
// page. Inside it the walk runs, then the capture, with no `await` anywhere between them: the page
// cannot run a line of its own code in that window, so the two readings are of the same instant.
//
// It also makes the two halves AGREE about what they are looking at, which they could not do while
// they ran apart:
//   · THE RING (item 3 — board R22). Each side resolved the ringed element on its own. When the
//     element the harness handed over is not what the page is showing any more (a locator that
//     still matches a card sitting BEHIND an opened dialog), the walk drops it as occluded and
//     measures the dialog, while the capture rooted its scene on the card and pictured the page
//     behind the modal. Now the walk reports the element it actually measured and the capture is
//     handed THAT, so the two pictures are of one thing.
//   · THE OCCLUDED BOXES (item 2 — board R20's lightbox). The walk skips what an opaque overlay
//     covers; the capture had no such rule and serialised it. The rule is not restated here — the
//     walk's own decisions travel out as element references (this is one page, one pass, so a
//     reference is meaningful) and the capture plates exactly the elements the walk dropped.
//
// Pure and unit-tested in tools/moment-source.test.mjs: the composed source is built there from the
// real two functions and run for real on a stub DOM.

/**
 * momentSource(walkSrc, capSrc) → the source of one arrow function `(a) => ({ skel, rep })`.
 *
 * `walkSrc`/`capSrc` are `String(snapLayoutWalk)` / `String(captureReplica)` — the sources, not the
 * functions, because what this builds is text for a page to evaluate. Built by concatenation rather
 * than a template literal on purpose: a backtick or a `${` anywhere in either body would otherwise
 * be interpolated by this file instead of shipped verbatim.
 *
 * `a` carries what the two calls carried between them: `{ ring, target, props, claim, claims, base,
 * minRegion, caps, env? }` — one `target`, one `ring`, resolved once by the caller. Each half is
 * wrapped in its own try, so the cheaper artefact survives the failure of the other (the skeleton
 * is what the drawing and the gate are derived from; a capture that dies must not take it with it).
 */
export function momentFunction (walkSrc, capSrc) {
  // A STRING handed to `page.evaluate` is EVALUATED, never CALLED (measured against Playwright
  // 1.62 before this landed: the arg is ignored and the expression's own value — the function —
  // comes back, which serialises to `undefined`; the harness then filed a photograph with no
  // skeleton beside it, silently). A FUNCTION is serialised by its source and called with the arg,
  // which is the path every other capture here already uses — so the composed source is turned into
  // a real function on THIS side, in Node, where there is no CSP to argue with, and handed over
  // like any other page function. Nothing new is asked of the page.
  // eslint-disable-next-line no-new-func
  return new Function('a', 'return (' + momentSource(walkSrc, capSrc) + ')(a)')
}

export function momentSource (walkSrc, capSrc) {
  return '(a) => {' +
    'var __walk = ' + walkSrc + ';' +
    'var __cap = ' + capSrc + ';' +
    // what the walk decided, in element references — never returned to Node (a DOM node is not
    // serialisable), only handed across to the capture inside this one pass
    'var rp = { ringEl: null, occluded: [] };' +
    'var skel = null, rep = null;' +
    'try { skel = __walk({ ring: a.ring, target: a.target, env: a.env || null, report: rp }) } catch (e) { skel = null }' +
    'try {' +
      'rep = __cap({ ring: a.ring, target: rp.ringEl || a.target || null, props: a.props, claim: a.claim,' +
      ' claims: a.claims, base: a.base, minRegion: a.minRegion, caps: a.caps, env: a.env || null,' +
      ' occluded: rp.occluded })' +
    '} catch (e) { rep = null }' +
    'return { skel: skel, rep: rep }' +
  '}'
}
