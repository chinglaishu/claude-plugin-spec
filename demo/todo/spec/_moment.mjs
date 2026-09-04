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
    'var rp = { ringEl: null, occluded: [], nodes: [] };' +
    'var rc = { rootEl: null };' +
    'var skel = null, rep = null;' +
    'try { skel = __walk({ ring: a.ring, target: a.target, env: a.env || null, report: rp }) } catch (e) { skel = null }' +
    // …AND NO PICTURE OF SOMETHING THE WALK REFUSED TO MEASURE (final review C1, 2026-09-04). The
    // capture is handed the element the WALK measured under the ring, falling back to the raw target
    // — and that fallback re-opened the very disagreement this file exists to close. When the walk
    // DROPS the handed-over element (a card sitting behind an opened dialog: occluded, so the walk
    // measures the dialog instead) it reports no `ringEl`, the fallback rooted the scene on the card
    // anyway, and the replica pictured the page BEHIND the modal while the skeleton described the
    // modal: board R22.b2, 45 measured elements and not one of them inside the scene root, and an
    // extra box on a file nothing could ever gate. A picture of what a reader cannot see is worse
    // than no picture, so a moment whose ringed element the walk refused simply has none — the row
    // says so out loud, exactly as it does when nothing was measured at all.
    'var __tgt = a.target ? rp.ringEl : (rp.ringEl || null);' +
    'try {' +
      'if (a.target && !rp.ringEl) { rep = null } else {' +
      'rep = __cap({ ring: a.ring, target: __tgt, props: a.props, claim: a.claim,' +
      ' claims: a.claims, base: a.base, minRegion: a.minRegion, caps: a.caps, env: a.env || null,' +
      ' occluded: rp.occluded, report: rc }) }' +
    '} catch (e) { rep = null }' +
    // WHAT IS IN THE PICTURE (fix round 2, I6). The replica is a picture of the scene ROOT'S
    // SUBTREE; `region` is only that root's rectangle. An element that overlaps the rectangle from
    // outside the subtree — a toast, the reader's pager dots, any body-level fixed overlay — can
    // never be in an honest replica, and the gate reported each one as a missing word (board
    // R10.b1.v1, R18.b3.v2, R18.b4.v1). Here, and only here, both facts are in hand at once: the
    // nodes the walk measured and the node the capture rooted on. So the skeleton carries the
    // answer out with it, and BOTH guards — the in-page one and `npm run proof mirror` — read it
    // instead of guessing from geometry. An unmarked skeleton (a harvest from before this) is read
    // exactly as it was.
    'try {' +
      'if (skel && skel.els && rc.rootEl && rp.nodes && rp.nodes.length === skel.els.length) {' +
        'for (var i = 0; i < skel.els.length; i++) {' +
          'var nd = rp.nodes[i];' +
          'skel.els[i].inRoot = (nd && (nd === rc.rootEl || rc.rootEl.contains(nd))) ? 1 : 0' +
        '}' +
        'skel.rootMarked = 1' +
      '}' +
    '} catch (e) { /* an unmarked skeleton still gates, by its rectangle */ }' +
    // ── AND THE GATE, IN THE SAME PASS (final review C1, 2026-09-04) ─────────────────────────────
    // `gateInPage` below, stringified exactly the way the walk and the capture are. See its own
    // header for why the gate belongs here rather than in a third `page.evaluate`.
    'var __gate = ' + String(gateInPage) + ';' +
    'var tidy = function () { try { var el = document.getElementById(a.gateHost); if (el) el.remove() } catch (e) {} };' +
    'var done = function (sk) { tidy(); return { skel: skel, rep: rep, repSkel: sk || null } };' +
    'try {' +
      'var g = __gate({ walk: __walk, rep: rep, ring: a.ring, skel: skel, host: a.gateHost });' +
      'if (g && typeof g.then === "function") return g.then(done, function () { return done(null) });' +
      'return done(g)' +
    '} catch (e) { return done(null) }' +
  '}'
}

/**
 * gateInPage({ walk, rep, ring, skel, host }) → Promise<skeleton | null>  — THE GATE, IN THE PAGE.
 *
 * (final review C1, 2026-09-04.) The replica used to be walked back in a THIRD `page.evaluate`,
 * fired from Node after the screenshot and after the moment pass had already returned — a third
 * reading of a page that had been given three chances to settle between them. It runs here now, in
 * the same pass, on the html this pass has just built and against the skeleton this same pass
 * measured: the two things a likeness gate compares can no longer come from two different instants
 * of the app. The `await` is AFTER both readings are in hand, so the "no await between the walk and
 * the capture" property spec/_moment.mjs exists for is untouched — the page may run its own code
 * while the frame loads, and neither `skel` nor `rep` can change any more when it does.
 *
 * SELF-CONTAINED, like the walk and the capture: it is serialised by its source into the page, so it
 * may not reference a single thing outside its own body — the walk arrives as `walk`.
 *
 * The frame is `sandbox="allow-same-origin"` with NO allow-scripts (the replica's own sanitiser is
 * the second wall), pinned to the viewport origin so its coordinates ARE the page's, and carries the
 * page's own @font-face rules — a frame set in a fallback stack lays every word out at a different
 * width and every text box would drift. `</style` in a serialised font family is neutralised with
 * CSS's own `\/` escape, or the sheet would close early and the frame would set its type in nothing.
 * Every failure resolves to null: an ungated replica is honest, and the CLI refuses it as "not
 * gated" rather than passing it unseen.
 */
export function gateInPage (arg) {
  var walk = arg && arg.walk
  var rep = arg && arg.rep
  var skel = arg && arg.skel
  if (!walk || !rep || !rep.html || !rep.region) return null
  var reg = rep.region
  var faces = ''
  try {
    var ff = rep.fontFaces
    if (ff && ff.length) {
      for (var i = 0; i < ff.length; i++) faces += String((ff[i] && ff[i].cssText) || '') + '\n'
      faces = faces.slice(0, 64000).replace(/<\/style/gi, '<\\/style')
    }
  } catch (e) { faces = '' }
  var doc = '<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}</style><style>' +
    faces + '</style></head><body><div style="position:absolute;left:' + reg.x + 'px;top:' + reg.y +
    'px;width:' + reg.w + 'px">' + rep.html + '</div></body></html>'
  var prev = document.getElementById(arg.host)
  if (prev) prev.remove()
  var f = document.createElement('iframe')
  f.id = arg.host
  f.setAttribute('sandbox', 'allow-same-origin')
  f.setAttribute('style', 'position:fixed;left:0;top:0;width:' + (window.innerWidth || 0) +
    'px;height:' + (window.innerHeight || 0) + 'px;border:0;opacity:0;pointer-events:none;z-index:-1')
  f.srcdoc = doc
  return new Promise(function (resolve) {
    var settled = false
    var finish = function (ok) { if (!settled) { settled = true; resolve(ok) } }
    f.addEventListener('load', function () { finish(true) })
    setTimeout(function () { finish(false) }, 1200)
    document.body.appendChild(f)
  }).then(function (up) {
    if (!up) return null
    var d = f.contentDocument
    var w = f.contentWindow
    if (!d || !w || !d.body) return null
    // THE SAME FORCED TARGET AND THE SAME RING AS THE LIVE SIDE. `focus` is geometric, so a walk
    // given a different ring flags a different set of elements (board R22 came back `missing-focus
    // 15` on a replica that was otherwise gap-free). The capture marks the ringed element
    // `data-ring="1"` so the replica is never left to rediscover it, and `ringFixed` keeps the ring
    // the live skeleton was measured with.
    var ringed = d.querySelector('[data-ring]')
    var lr = (skel && skel.ring)
      ? { x: skel.ring.x, y: skel.ring.y, width: skel.ring.w, height: skel.ring.h }
      : (arg.ring || null)
    return walk({
      ring: lr,
      target: ringed,
      ringFixed: true,
      env: { window: w, document: d, getComputedStyle: w.getComputedStyle.bind(w) }
    })
  })
}
