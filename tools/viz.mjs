// tools/viz.mjs — the drawn schematic (requirement schematics spec 2026-08-18; task 4 of the
// visual-requirements sequence). PURE: a parsed behavior chain ({given, beats}) maps
// DETERMINISTICALLY to an interaction ARCHETYPE and from there to one house-style animated inline
// SVG — one Given scene, one animation beat per When→Then — plus the still phases that park the
// SAME drawing at [given, beat 1 · then, …]. No model, no fs, no randomness: the drawing is
// computed from the text like everything else on the board, so a re-derive is instant and free.
//
// The honesty rules this module carries:
//   · no match → null. A requirement the kit cannot draw stays text-only — never a wrong picture.
//   · the SVG is stamped with vizHash (reqHash over behaviorText — tools/reqhash.mjs, the ONE
//     text-hash authority): when the text moves past the stamp the board renders it QUIET GREY
//     with the dated "text ≠ viz" note. Stale is computed, never hidden (vizStale below).
//   · the schematic is decoupled from the app and abstract (2026-08-18 decision #2): generic
//     shapes in the dye palette, NEVER a capture of the real UI, never proof (decision #3).
//
// House style: every colour is a design-system variable (no raw hex), no <script>, no backticks
// (safe wherever the builder interpolates it), and NO ids — animation is scoped by one
// hash-suffixed class per drawing, so many schematics (and the stills' copies of each) coexist in
// one document without collisions.

import { reqHash, behaviorText, isStale } from './reqhash.mjs'
// THE OVERLAY'S GEOMETRY, SHARED WITH THE BURN-IN (spec/_base.ts renderOverlay). The drawn overlay
// and the photographed one must be the SAME PICTURE; keeping two copies of the same numbers is
// exactly how they stopped being one. See tools/overlay-geometry.mjs.
import { RING, CARD, ringRect, ringOuter, calloutSpot, calloutRect, unionRect } from './overlay-geometry.mjs'
// …and the callout's WORDS from the one module that owns them (2026-08-30), for the same reason the
// geometry moved there: two copies of the rule drifted, and the drawing and the photograph stopped
// saying the same thing mid-beat. One sentence per scene — the current small step, nothing else.
import { calloutText, sceneDone, CALLOUT_TYPE, calloutBoxHeight, calloutLines } from './callout-text.mjs'

// ── the pin: thin wrappers over reqhash ────────────────────────────────────
export const vizHash = behavior => reqHash(behaviorText(behavior))
// A drawing left behind after the behavior block was removed (behavior null → behaviorText '')
// hashes differently too, so it reads stale rather than silently surviving its own text.
export const vizStale = (stamp, behavior) => isStale(stamp, behaviorText(behavior))

// THE ONE EXCEPTION to "abstract, never the real UI" (the human, 2026-08-28): renderWireframe at
// the foot of this file draws the schematic from the page's own captured LAYOUT SKELETON. The
// complaint that bought it: an archetype's "2 TOTAL → 3 TOTAL" chip is so unlike the app's actual
// counter that nobody could map one onto the other. A mirror is still a DRAWING — house shapes,
// dye tokens, no pixels, no app colours, no app fonts — but its boxes sit where the app's boxes
// sit, so the reader recognises the screen. 2026-08-18 decision #2 stands for everything the
// harvest never measured: with no layout files a requirement falls back to the archetype kit.

// ── shared vocabulary (the mockup's drawing language, tokens only) ─────────
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r1 = v => Math.round(v * 10) / 10
const r2 = v => Math.round(v * 100) / 100
const bar = (x, y, w, h = 7, f = 'var(--wash)', cls = '') =>
  `<rect${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${f}"/>`
const box = (x, y, cls = '') =>
  `<rect${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" width="10" height="10" rx="2" fill="var(--paper)" stroke="var(--line3)" stroke-width="1.3"/>`
const tick = (x, y, cls = '') =>
  `<path${cls ? ` class="${cls}"` : ''} d="M${x + 2.5} ${y + 5} l2 2 l4 -4.5" fill="none" stroke="var(--paper)" stroke-width="1.3"/>`
const CURSOR = '<path d="M0 0 L0 12 L3 9 L5 13 L7 12 L5 8 L9 8 Z" fill="var(--ink)" stroke="var(--paper)" stroke-width="1"/>'

// ── the shared timeline: intro hold → one segment per beat → outro hold ────
// All animations share ONE duration and ZERO base delay, so a single negative animation-delay
// (the still phases) parks every element of the drawing consistently.
function timeline (n) {
  const dur = r2(4 + 1.5 * n)
  const A = 12; const B = 88
  const segs = Array.from({ length: n }, (_, i) => {
    const s = A + (i * (B - A)) / n; const e = A + ((i + 1) * (B - A)) / n
    return { s: r1(s), e: r1(e), act: r1(s + 0.3 * (e - s)), flip: r1(s + 0.42 * (e - s)) }
  })
  // stills: the loop's own frames — just before the intro ends (given) and just before each beat's
  // segment ends (that beat's Then, settled, the cursor at rest)
  const phases = [-0.05, ...segs.map(g => -r2((g.e / 100) * dur - 0.15))]
  // Task 11 (play speed): the ONE duration every animation uses, divided by the wrapper's --spd
  // (1 / 1.5 / 2 — the schematic pane's speed button) so a single var retimes the whole drawing.
  // The still phases above stay plain numbers: the board CSS divides the parked animation-delay by
  // the SAME var, so |delay|/duration — the frame a still shows — is preserved at every speed.
  const durCss = `calc(${dur}s / var(--spd, 1))`
  return { dur, durCss, segs, phases, hold: 94, reset: 98 }
}

const stops = list => list.map(([p, s]) => `${p}%{${s}}`).join('')
// a property that is ON exactly inside the given spans (sharp .1% transitions), OFF elsewhere
function onOff (spans, on, off) {
  const out = []; let cur = 0
  for (const [a, b] of spans) {
    if (a > cur) { out.push([cur, off], [r1(a - 0.1), off]) }
    out.push([a, on], [b, on]); cur = r1(b + 0.1)
  }
  if (cur <= 100) out.push([cur, off], [100, off])
  return stops(out)
}
// the cursor's journey: offstage → each beat's target (a small press dip at act) → offstage.
// `drags` optionally names a second waypoint per beat (a drag's drop point).
function cursorKF (t, targets, drags = null) {
  const off = 'transform:translate(252px,132px);opacity:0'
  const at = (p, i) => `transform:translate(${p.x}px,${p.y + (i || 0)}px);opacity:.9`
  const out = [[0, off], [Math.max(2, r1(t.segs[0].s - 6)), off]]
  t.segs.forEach((g, i) => {
    const p = targets[Math.min(i, targets.length - 1)]
    out.push([r1(g.act - 3), at(p)], [g.act, at(p, 3)], [r1(g.act + 2), at(p)])
    if (drags) out.push([r1(g.flip + 6), at(drags[Math.min(i, drags.length - 1)])])
  })
  out.push([r1(t.segs[t.segs.length - 1].e + 2), off], [100, off])
  return stops(out)
}

// ── the archetype kit ──────────────────────────────────────────────────────
// Deterministic keyword classification over the beat text (2026-08-18: "a structured triple maps
// deterministically to an archetype"). Order matters — the more specific rule sits first, and each
// entry's fits() covers the WHOLE chain, so a chain an archetype cannot draw falls through (and,
// where nothing fits, honestly to null).
const W = {
  tick: /\b(tick|check|toggle|mark|complete|finish)/,
  count: /\b(count|remaining|recount)\b|\d/,
  press: /\b(press|click|tap|hit)/,
  clear: /\b(zero|empty|clear|remove|gone|delete|none)/,
  restore: /\b(return|restore|back|reappear|undo)/,
  move: /\b(move|drag|send|transfer|reassign)/,
  type: /\b(search|type|filter|enter)/,
  filter: /\b(match|stay|hide|only|narrow|filter)/,
  switch: /\b(toggle|switch)/,
  pick: /\b(pick|choose|select)/,
  view: /\b(view|mode|tab|render)/,
  open: /\b(open|expand|unfold|pick|choose|click|double)/,
  reveal: /\b(unfold|open|expand|reveal|show|appear)/,
  // task 7 (2026-08-22) — the three archetypes the beats draft named
  user: /\byou\b/,                                          // a person acting — NOT a derivation
  derived: /\b(reads?|derived?|wears?|proven|refreshes)\b/,  // a word/state computed, never typed
  land: /\b(run|rerun|scan|rescan|crawl|fold)/,              // something lands on a stack of records
  folded: /\b(rows?|cases?|records?|recorded|routes?|settled|keeps?|stays?|folded)\b/,
  append: /\b(type|enter|add|save|fill)/,                  // text put in, then kept
  // review A1-c: a Then must NAME the row or the count that appears — "stores … reads back" names
  // neither, and the drawing would invent a list and a TOTAL for it (init R1 → null)
  appended: /\b(appears?|bottom|foot|rows?|list)\b|\d/,
  becomes: /\bbecomes?\b/,                                  // a row APPEARING — not a landing on rows already there (review A1-b)
  stays: /\b(stays?|keeps?|untouched)\b/,                   // the landed row is left as it was (review A1-a)
  updates: /\b(updates?|changes?|marked|new|becomes?)\b/,
  inPlace: /\b(in place|same row|edited)\b/                 // an edit of what is already there — not an append
}
const lows = b => b.beats.map(x => ({ when: String(x.when).toLowerCase(), then: String(x.then).toLowerCase() }))

const KIT = [
  {
    name: 'toggle-and-recount',
    // every beat ticks something, and at least one Then carries the counted outcome — a views
    // toggle ("toggle Focus / List / Flow") has no count and must fall through to switch-views
    fits (b) {
      const L = lows(b)
      return b.beats.length <= 3 && L.every(x => W.tick.test(x.when)) && L.some(x => W.count.test(x.then))
    },
    draw: drawToggleRecount
  },
  {
    name: 'move-between-lists',
    fits (b) { const L = lows(b); return b.beats.length <= 3 && L.every(x => W.move.test(x.when)) },
    draw: drawMoveBetweenLists
  },
  {
    name: 'press-and-clear',
    // one press that clears; an optional second beat that restores (undo). No more — a longer
    // chain has no honest two-state script here.
    fits (b) {
      const L = lows(b)
      if (!(W.press.test(L[0].when) && W.clear.test(L[0].then))) return false
      // A user APPEND that lands a row is type-and-append, not a clear: when the human types a task and
      // presses Add, "its checkbox empty" in the Then names the NEW row's state, not something being
      // cleared. Refuse it here so the later type-and-append rule draws the row it appends. (todo R1's
      // reworded canon at b65b066 added "press … Add" + "checkbox empty", which made this earlier rule
      // wrongly grab it — a press with an appended row is never a press-and-clear. rule 6, reason inline.)
      if (W.user.test(L[0].when) && W.append.test(L[0].when) && W.appended.test(L[0].then)) return false
      if (b.beats.length === 1) return true
      return b.beats.length === 2 && (W.restore.test(L[1].then) || W.restore.test(L[1].when))
    },
    draw: drawPressClear
  },
  {
    name: 'type-and-filter',
    fits (b) { const L = lows(b); return b.beats.length === 1 && W.type.test(L[0].when) && W.filter.test(L[0].then) },
    draw: drawTypeFilter
  },
  {
    name: 'switch-views',
    fits (b) {
      const L = lows(b)
      return b.beats.length === 1 && W.view.test(L[0].then) &&
        (W.switch.test(L[0].when) || W.pick.test(L[0].when))
    },
    draw: drawSwitchViews
  },
  {
    name: 'open-and-reveal',
    fits (b) { const L = lows(b); return b.beats.length === 1 && W.open.test(L[0].when) && W.reveal.test(L[0].then) },
    draw: drawOpenReveal
  },
  // ── task 7 (2026-08-22): the three archetypes beats-draft.json named ──
  {
    name: 'derive-a-word',
    // every When is an EVENT, never a person ("you …" is somebody typing the word — refused), and
    // every Then reads a computed word or state. Up to three beats: one chip word per beat.
    fits (b) {
      const L = lows(b)
      return b.beats.length <= 3 && L.every(x => !W.user.test(x.when) && W.derived.test(x.then))
    },
    draw: drawDeriveWord
  },
  {
    name: 'fold-into-rows',
    // every When is a run/scan/crawl landing, every Then a record that updates or stays — folded,
    // never replaced. Up to three landings (three rows drawn).
    fits (b) {
      const L = lows(b)
      return b.beats.length <= 3 && L.every(x => W.land.test(x.when) && W.folded.test(x.then) && !W.becomes.test(x.then))
    },
    draw: drawFoldRows
  },
  {
    name: 'type-and-append',
    // every beat is a person putting text in (type / enter / add / save / fill) whose Then keeps
    // it — a new row at the foot, a stored value read back, a count stepping. An edit of a row
    // already there ("the same row reads the new text in place", todo R2) is NOT an append and is
    // refused; a chain with any other kind of beat (init R6's "piper is missing → the switch is
    // disabled") falls through to null too.
    fits (b) {
      const L = lows(b)
      return b.beats.length <= 3 && L.every(x => W.user.test(x.when) && W.append.test(x.when) && W.appended.test(x.then) && !W.inPlace.test(x.then))
    },
    draw: drawTypeAppend
  }
]

const wellFormed = b => b && Array.isArray(b.beats) && b.beats.length > 0 &&
  typeof b.given === 'string' && b.beats.every(x => x && typeof x.when === 'string' && typeof x.then === 'string')

export function matchArchetype (behavior) {
  if (!wellFormed(behavior)) return null
  const hit = KIT.find(a => a.fits(behavior))
  return hit ? hit.name : null
}

// ── the one entry point ────────────────────────────────────────────────────
// deriveSchematic(behavior) → { archetype, svg, phases } | null. The svg is complete and
// self-carrying: class-scoped animation, the vizHash stamp, the archetype, the beat count and the
// still phases all on the root — so a committed file answers "what was this drawn from?" alone.
export function deriveSchematic (behavior) {
  if (!wellFormed(behavior)) return null
  const arch = KIT.find(a => a.fits(behavior))
  if (!arch) return null
  const n = behavior.beats.length
  const t = timeline(n)
  const hash = vizHash(behavior)
  const k = 'vz' + hash.slice(0, 8)               // the scope class; also suffixes keyframe names
  const kf = suffix => `v${hash.slice(0, 8)}${suffix}`  // CSS identifiers may not start with a digit
  const { css, body, view = '0 0 300 150', variant = '' } = arch.draw(behavior, t, k, kf)
  const label = esc(`schematic — the idea, not the real UI. given ${behavior.given}; ` +
    behavior.beats.map((x, i) => `beat ${i + 1}: ${x.when} → ${x.then}`).join('; '))
  const svg = `<svg class="${k}" viewBox="${view}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}"` +
    ` data-viz-hash="${hash}" data-viz-archetype="${arch.name}" data-viz-beats="${n}" data-viz-phases="${t.phases.join(' ')}"${variant ? ` data-variant="${variant}"` : ''}>` +
    `<style>${css}</style>${body}</svg>`
  return { archetype: arch.name, svg, phases: t.phases }
}

// ── the templates ──────────────────────────────────────────────────────────
// Each returns { css, body } — css already scoped to .${k}, all animations ${t.durCss} infinite.

// N ticks in a checklist, the count chip stepping down — the schematics mockup's R5 family.
function drawToggleRecount (b, t, k, kf) {
  const n = b.beats.length
  const widths = [100, 86, 92, 80]
  const rows = []; let css = ''
  const flips = t.segs.map(g => g.flip)
  for (let i = 0; i <= n; i++) {
    const y = 30 + 24 * i
    if (i < n) {
      rows.push(box(30, y, 'b' + i), tick(30, y, 'c' + i), bar(48, y + 1.5, widths[i]))
      css += `.${k} .b${i}{animation:${kf('b' + i)} ${t.durCss} infinite}` +
        `@keyframes ${kf('b' + i)}{${onOff([[flips[i], t.hold]], 'fill:var(--ai);stroke:var(--ai)', 'fill:var(--paper);stroke:var(--line3)')}}` +
        `.${k} .c${i}{animation:${kf('c' + i)} ${t.durCss} infinite}` +
        `@keyframes ${kf('c' + i)}{${onOff([[flips[i], t.hold]], 'opacity:1', 'opacity:0')}}`
    } else {
      rows.push(box(30, y), bar(48, y + 1.5, widths[i]))    // the last row stays open — "leaves only"
    }
  }
  // the count: n+1 stacked values, each visible only in its own window
  let counts = ''
  for (let j = 0; j <= n; j++) {
    const from = j === 0 ? 0 : flips[j - 1]
    const to = j === n ? t.hold : r1(flips[j] - 0.1)
    counts += `<text class="n${j}" x="222" y="78" font-size="30" font-family="var(--mono)" fill="var(--ok)">${n + 1 - j}</text>`
    const spans = j === 0 ? [[0, to]] : [[from, to]]
    css += `.${k} .n${j}{animation:${kf('n' + j)} ${t.durCss} infinite}` +
      `@keyframes ${kf('n' + j)}{${onOff(spans, 'opacity:1', 'opacity:0')}}`
  }
  css += `.${k} .cur{animation:${kf('cur')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('cur')}{${cursorKF(t, t.segs.map((_, i) => ({ x: 34, y: 34 + 24 * i })))}}`
  const body = `<rect x="16" y="16" width="180" height="118" rx="8" fill="none" stroke="var(--line)" stroke-width="1.4"/>` +
    rows.join('') + counts +
    `<text x="206" y="98" font-size="10" font-family="var(--sans)" fill="var(--mute)" letter-spacing="1.5">LEFT</text>` +
    `<g class="cur">${CURSOR}</g>`
  return { css, body }
}

// One press empties the list (count → 0); an optional second beat brings it back.
function drawPressClear (b, t, k, kf) {
  const restore = b.beats.length === 2
  const f0 = t.segs[0].flip; const f1 = restore ? t.segs[1].flip : null
  const rows = [0, 1, 2].map(i => box(24, 34 + 24 * i) + bar(42, 35.5 + 24 * i, [96, 82, 90][i])).join('')
  const goneSpan = [[f0, restore ? r1(f1 - 0.1) : t.hold]]
  let css = `.${k} .rows{animation:${kf('rows')} ${t.durCss} infinite}` +
    `@keyframes ${kf('rows')}{${onOff(goneSpan, 'opacity:0', 'opacity:1')}}` +
    `.${k} .btn{animation:${kf('btn')} ${t.durCss} infinite}` +
    `@keyframes ${kf('btn')}{${onOff(t.segs.map(g => [g.act, r1(g.act + 4)]), 'fill:var(--ai);stroke:var(--ai)', 'fill:var(--paper);stroke:var(--line2)')}}` +
    `.${k} .full{animation:${kf('full')} ${t.durCss} infinite}` +
    `@keyframes ${kf('full')}{${onOff(goneSpan, 'opacity:0', 'opacity:1')}}` +
    `.${k} .none{animation:${kf('none')} ${t.durCss} infinite}` +
    `@keyframes ${kf('none')}{${onOff(goneSpan, 'opacity:1', 'opacity:0')}}` +
    `.${k} .cur{animation:${kf('cur')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('cur')}{${cursorKF(t, [{ x: 236, y: 34 }])}}`
  const body = `<g class="rows">${rows}</g>` +
    `<rect class="btn" x="210" y="28" width="64" height="22" rx="6" fill="var(--paper)" stroke="var(--line2)" stroke-width="1.4"/>` +
    bar(224, 36, 36, 6, 'var(--mute)') +
    `<text class="full" x="234" y="104" font-size="24" font-family="var(--mono)" fill="var(--ok)">3</text>` +
    `<text class="none" x="234" y="104" font-size="24" font-family="var(--mono)" fill="var(--mute)">0</text>` +
    `<g class="cur">${CURSOR}</g>`
  return { css, body }
}

// An item crosses from the left list to the right one, one item per beat.
function drawMoveBetweenLists (b, t, k, kf) {
  const n = b.beats.length
  let css = ''; let items = ''
  for (let i = 0; i < n; i++) {
    const y = 32 + 26 * i
    items += `<g class="it${i}">${box(30, y)}${bar(48, y + 1.5, 62, 7)}</g>`
    const g = t.segs[i]
    css += `.${k} .it${i}{animation:${kf('it' + i)} ${t.durCss} ease-in-out infinite}` +
      `@keyframes ${kf('it' + i)}{${stops([
        [0, 'transform:translate(0,0)'], [g.act, 'transform:translate(0,0)'],
        [r1(g.flip + 6), 'transform:translate(148px,26px)'], [t.hold, 'transform:translate(148px,26px)'],
        [t.reset, 'transform:translate(0,0)'], [100, 'transform:translate(0,0)']
      ])}}`
  }
  css += `.${k} .cur{animation:${kf('cur')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('cur')}{${cursorKF(t,
      Array.from({ length: n }, (_, i) => ({ x: 36, y: 36 + 26 * i })),
      Array.from({ length: n }, (_, i) => ({ x: 184, y: 62 + 26 * i })))}}`
  const body =
    `<rect x="16" y="16" width="120" height="118" rx="8" fill="none" stroke="var(--line)" stroke-width="1.4"/>` +
    `<rect x="164" y="16" width="120" height="118" rx="8" fill="none" stroke="var(--line)" stroke-width="1.4"/>` +
    box(178, 32) + bar(196, 33.5, 62) +      // the right list's one resident row
    items + `<g class="cur">${CURSOR}</g>`
  return { css, body }
}

// Typing into the field narrows the list — non-matching rows drop out.
function drawTypeFilter (b, t, k, kf) {
  const g = t.segs[0]
  const rows = [0, 1, 2, 3].map(i =>
    `<g class="${i % 2 ? 'fout' : ''}"><circle cx="30" cy="${64 + 22 * i}" r="3" fill="var(--line2)"/>${bar(42, 60 + 22 * i, [120, 96, 132, 88][i])}</g>`).join('')
  const css = `.${k} .typed{transform-origin:28px 31px;animation:${kf('ty')} ${t.durCss} infinite}` +
    `@keyframes ${kf('ty')}{${stops([
      [0, 'transform:scaleX(0)'], [g.act, 'transform:scaleX(0)'],
      [r1(g.flip + 4), 'transform:scaleX(1)'], [t.hold, 'transform:scaleX(1)'],
      [t.reset, 'transform:scaleX(0)'], [100, 'transform:scaleX(0)']
    ])}}` +
    `.${k} .fout{animation:${kf('fo')} ${t.durCss} infinite}` +
    `@keyframes ${kf('fo')}{${onOff([[t.segs[0].flip, t.hold]], 'opacity:0.12', 'opacity:1')}}` +
    `.${k} .cur{animation:${kf('cur')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('cur')}{${cursorKF(t, [{ x: 32, y: 26 }])}}`
  const body =
    `<rect x="20" y="20" width="170" height="22" rx="4" fill="var(--paper)" stroke="var(--ai-line)" stroke-width="1.2"/>` +
    `<rect class="typed" x="28" y="27" width="54" height="8" rx="3" fill="var(--line2)"/>` +
    rows + `<g class="cur">${CURSOR}</g>`
  return { css, body }
}

// A segmented control: the highlight slides, the content re-arranges (list ↔ grid).
function drawSwitchViews (b, t, k, kf) {
  const g = t.segs[0]
  const flip = [[g.flip, t.hold]]
  const gridCells = []
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
    gridCells.push(`<rect x="${24 + 52 * j}" y="${62 + 34 * i}" width="44" height="26" rx="4" fill="var(--wash)" stroke="var(--hair)"/>`)
  const css = `.${k} .sw{animation:${kf('sw')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('sw')}{${stops([
      [0, 'transform:translate(0,0)'], [g.act, 'transform:translate(0,0)'],
      [r1(g.flip + 3), 'transform:translate(54px,0)'], [t.hold, 'transform:translate(54px,0)'],
      [t.reset, 'transform:translate(0,0)'], [100, 'transform:translate(0,0)']
    ])}}` +
    `.${k} .va{animation:${kf('va')} ${t.durCss} infinite}` +
    `@keyframes ${kf('va')}{${onOff(flip, 'opacity:0', 'opacity:1')}}` +
    `.${k} .vb{animation:${kf('vb')} ${t.durCss} infinite}` +
    `@keyframes ${kf('vb')}{${onOff(flip, 'opacity:1', 'opacity:0')}}` +
    `.${k} .cur{animation:${kf('cur')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('cur')}{${cursorKF(t, [{ x: 100, y: 30 }])}}`
  const body =
    `<rect x="20" y="20" width="162" height="24" rx="6" fill="var(--paper)" stroke="var(--line2)" stroke-width="1.2"/>` +
    `<rect class="sw" x="21" y="21" width="53" height="22" rx="5" fill="var(--wash)"/>` +
    `<line x1="74" y1="22" x2="74" y2="42" stroke="var(--hair)"/><line x1="128" y1="22" x2="128" y2="42" stroke="var(--hair)"/>` +
    bar(36, 30, 24, 4, 'var(--line3)') + bar(90, 30, 24, 4, 'var(--line3)') + bar(144, 30, 24, 4, 'var(--line3)') +
    `<g class="va">${[0, 1, 2].map(i => bar(24, 62 + 24 * i, 150)).join('')}</g>` +
    `<g class="vb">${gridCells.join('')}</g>` +
    `<g class="cur">${CURSOR}</g>`
  return { css, body }
}

// A title row opens: the chevron turns, the body panel unfolds beneath.
function drawOpenReveal (b, t, k, kf) {
  const g = t.segs[0]
  const css = `.${k} .chv{transform-origin:31px 31px;animation:${kf('ch')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('ch')}{${stops([
      [0, 'transform:rotate(0deg)'], [g.act, 'transform:rotate(0deg)'],
      [r1(g.flip + 3), 'transform:rotate(90deg)'], [t.hold, 'transform:rotate(90deg)'],
      [t.reset, 'transform:rotate(0deg)'], [100, 'transform:rotate(0deg)']
    ])}}` +
    `.${k} .pbody{transform-origin:140px 48px;animation:${kf('pb')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('pb')}{${stops([
      [0, 'transform:scaleY(0);opacity:0'], [g.act, 'transform:scaleY(0);opacity:0'],
      [r1(g.flip + 8), 'transform:scaleY(1);opacity:1'], [t.hold, 'transform:scaleY(1);opacity:1'],
      [t.reset, 'transform:scaleY(0);opacity:0'], [100, 'transform:scaleY(0);opacity:0']
    ])}}` +
    `.${k} .cur{animation:${kf('cur')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('cur')}{${cursorKF(t, [{ x: 36, y: 34 }])}}`
  const body =
    `<path class="chv" d="M28 26 l6 5 l-6 5" fill="none" stroke="var(--ink-3)" stroke-width="1.6"/>` +
    bar(44, 26, 130, 9) +
    `<g class="pbody"><rect x="28" y="48" width="220" height="78" rx="6" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>` +
    bar(40, 60, 180, 6) + bar(40, 74, 150, 6) + bar(40, 88, 166, 6) + bar(40, 102, 120, 6) + `</g>` +
    `<g class="cur">${CURSOR}</g>`
  return { css, body }
}

// ── task 7 (2026-08-22): the three archetypes the beats draft named ────────

// Inputs on the left (a tag chip, an assertion mark, a text-hash glyph) feed ONE chip on the right
// that flips its word per beat — the state is computed, never typed, so this is the one drawing
// with NO cursor: nobody's hand is in it. When a Then names its word ("reads Passed", "chip reads
// passed or failed") the chip shows it; otherwise an abstract bar flips — never an invented word.
const wordOf = then => {
  const m = String(then).match(/\breads (?:the )?([A-Z][A-Za-z-]*|passed|failed)/)
  return m ? m[1] : null
}
function drawDeriveWord (b, t, k, kf) {
  const n = b.beats.length
  const flips = t.segs.map(g => g.flip)
  let css = ''
  // the inputs: each beat lights ONE of the three, in turn — the cause that fed the chip
  const inputs = [0, 1, 2].map(i => {
    const y = 34 + 30 * i
    const glyph = i === 0
      ? `<rect x="24" y="${y}" width="34" height="14" rx="7" fill="var(--wash)" stroke="var(--line2)" stroke-width="1.2"/>` + bar(31, y + 4, 20, 6, 'var(--line3)')
      : i === 1
        ? box(24, y + 2) + `<path d="M26.5 ${y + 7} l2 2 l4 -4.5" fill="none" stroke="var(--ink-3)" stroke-width="1.3"/>` + bar(42, y + 3.5, 16, 6)
        : bar(24, y + 4, 34, 6, 'var(--line2)')
    return `<g class="in${i}">${glyph}</g>`
  })
  for (let i = 0; i < 3; i++) {
    const spans = t.segs.filter((_, j) => j % 3 === i).map(g => [g.act, r1(g.flip + 4)])
    if (!spans.length) continue
    css += `.${k} .in${i}{animation:${kf('in' + i)} ${t.durCss} infinite}` +
      `@keyframes ${kf('in' + i)}{${onOff(spans, 'opacity:1', 'opacity:.45')}}`
  }
  // the wires, each pulsing as its input fires
  const wires = [0, 1, 2].map(i => `<path class="w${i}" d="M62 ${41 + 30 * i} C 110 ${41 + 30 * i}, 120 71, 168 71" fill="none" stroke="var(--line2)" stroke-width="1.2"/>`)
  for (let i = 0; i < 3; i++) {
    const spans = t.segs.filter((_, j) => j % 3 === i).map(g => [g.act, r1(g.flip + 2)])
    if (!spans.length) continue
    css += `.${k} .w${i}{animation:${kf('w' + i)} ${t.durCss} infinite}` +
      `@keyframes ${kf('w' + i)}{${onOff(spans, 'stroke:var(--ai)', 'stroke:var(--line2)')}}`
  }
  // the chip: n+1 faces stacked — the given's blank dashed face, then one word (or bar) per beat
  let faces = `<g class="f0"><rect x="172" y="58" width="96" height="26" rx="13" fill="var(--paper)" stroke="var(--line3)" stroke-width="1.2" stroke-dasharray="3 3"/>${bar(196, 68, 48, 6, 'var(--line3)')}</g>`
  css += `.${k} .f0{animation:${kf('f0')} ${t.durCss} infinite}` +
    `@keyframes ${kf('f0')}{${onOff([[0, r1(flips[0] - 0.1)]], 'opacity:1', 'opacity:0')}}`
  for (let j = 1; j <= n; j++) {
    const w = wordOf(b.beats[j - 1].then)
    const to = j === n ? t.hold : r1(flips[j] - 0.1)
    const face = w
      ? `<text x="220" y="76" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--paper)">${esc(w)}</text>`
      : bar(196 + 6 * j, 68, 48 - 8 * j, 6, 'var(--paper)')
    faces += `<g class="f${j}"><rect x="172" y="58" width="96" height="26" rx="13" fill="var(--ai)"/>${face}</g>`
    css += `.${k} .f${j}{animation:${kf('f' + j)} ${t.durCss} infinite}` +
      `@keyframes ${kf('f' + j)}{${onOff([[flips[j - 1], to]], 'opacity:1', 'opacity:0')}}`
  }
  const body = inputs.join('') + wires.join('') + faces +
    `<text x="220" y="104" text-anchor="middle" font-size="10" font-family="var(--sans)" fill="var(--mute)" letter-spacing="1.5">DERIVED</text>`
  return { css, body }
}

// A stack of rows, each its own record. Per beat a run token slides in from the right and LANDS
// on one row — that row lights and its bar changes — while every other row is drawn exactly as it
// was: folded, never replaced.
function drawFoldRows (b, t, k, kf) {
  const n = b.beats.length
  // the "stays" variant (review A1-a): every Then only stays/keeps and none updates — the landing
  // FLASHES the row it hits and leaves it exactly as it was (conflicts R5: a settled conflict
  // survives a rescan). A chain with an update (dispatch R8, init R5's "marked new") holds the tint.
  const L = lows(b)
  const stays = L.every(x => W.stays.test(x.then)) && !L.some(x => W.updates.test(x.then))
  let css = ''
  const rows = [0, 1, 2].map(i => {
    const y = 30 + 30 * i
    return `<g class="row${i}"><rect x="20" y="${y}" width="170" height="22" rx="5" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>` +
      `<circle cx="34" cy="${y + 11}" r="3.5" fill="var(--line2)"/>` + bar(46, y + 7.5, [92, 76, 84][i]) +
      `<rect class="hit${i}" x="20" y="${y}" width="170" height="22" rx="5" fill="var(--ai)" opacity="0"/></g>`
  })
  // beat i lands on row i — the lit overlay holds from the flip to the end; the run token travels
  for (let i = 0; i < n; i++) {
    const g = t.segs[i]
    const y = 30 + 30 * i
    css += `.${k} .hit${i}{animation:${kf('hit' + i)} ${t.durCss} infinite}` +
      `@keyframes ${kf('hit' + i)}{${onOff([[g.flip, stays ? r1(g.flip + 4) : t.hold]], 'opacity:.22', 'opacity:0')}}` +
      `.${k} .run${i}{animation:${kf('run' + i)} ${t.durCss} ease-in-out infinite}` +
      `@keyframes ${kf('run' + i)}{${stops([
        [0, 'transform:translate(0,0);opacity:0'], [r1(g.s), 'transform:translate(0,0);opacity:0'],
        [r1(g.s + 1), 'transform:translate(0,0);opacity:1'],
        [g.flip, `transform:translate(-60px,${y - 41}px);opacity:1`], [r1(g.flip + 3), `transform:translate(-60px,${y - 41}px);opacity:0`],
        [100, `transform:translate(-60px,${y - 41}px);opacity:0`]
      ])}}`
  }
  const tokens = Array.from({ length: n }, (_, i) =>
    `<g class="run${i}"><rect x="226" y="44" width="48" height="16" rx="8" fill="var(--ai)"/>${bar(238, 49, 24, 6, 'var(--paper)')}</g>`).join('')
  const body = rows.join('') + tokens +
    `<text x="250" y="104" text-anchor="middle" font-size="10" font-family="var(--sans)" fill="var(--mute)" letter-spacing="1.5">${stays ? 'UNTOUCHED' : 'FOLDED'}</text>`
  return { css, body, variant: stays ? 'stays' : '' }
}

// Text typed into a box (the cursor does it — a user act), then a new row slides in at the foot
// of the list and the count beside it steps up, once per beat.
function drawTypeAppend (b, t, k, kf) {
  const n = b.beats.length
  let css = ''
  const base = 2
  const rows = [0, 1].map(i => box(30, 56 + 22 * i) + bar(48, 57.5 + 22 * i, [96, 80][i])).join('')
  let news = ''
  for (let i = 0; i < n; i++) {
    const g = t.segs[i]
    const y = 56 + 22 * (base + i)
    news += `<g class="new${i}">${box(30, y)}${bar(48, y + 1.5, 88 - 10 * i)}</g>`
    css += `.${k} .new${i}{animation:${kf('new' + i)} ${t.durCss} ease-out infinite}` +
      `@keyframes ${kf('new' + i)}{${stops([
        [0, 'transform:translate(0,-8px);opacity:0'], [g.flip, 'transform:translate(0,-8px);opacity:0'],
        [r1(g.flip + 5), 'transform:translate(0,0);opacity:1'], [t.hold, 'transform:translate(0,0);opacity:1'],
        [t.reset, 'transform:translate(0,-8px);opacity:0'], [100, 'transform:translate(0,-8px);opacity:0']
      ])}}`
  }
  // the typed bar grows in the box during each beat's act, and empties on the flip (submitted)
  css += `.${k} .typed{transform-origin:28px 31px;animation:${kf('ty')} ${t.durCss} infinite}` +
    `@keyframes ${kf('ty')}{${stops([[0, 'transform:scaleX(0)']].concat(t.segs.flatMap(g => [
      [r1(g.act - 2), 'transform:scaleX(0)'], [r1(g.flip - 1), 'transform:scaleX(1)'], [g.flip, 'transform:scaleX(0)']
    ])).concat([[100, 'transform:scaleX(0)']]))}}`
  // the count: base, then base+1 … base+n, each visible only in its own window
  let counts = ''
  const flips = t.segs.map(g => g.flip)
  for (let j = 0; j <= n; j++) {
    const from = j === 0 ? 0 : flips[j - 1]
    const to = j === n ? t.hold : r1(flips[j] - 0.1)
    counts += `<text class="n${j}" x="226" y="86" font-size="30" font-family="var(--mono)" fill="var(--ok)">${base + j}</text>`
    css += `.${k} .n${j}{animation:${kf('n' + j)} ${t.durCss} infinite}` +
      `@keyframes ${kf('n' + j)}{${onOff([[from, to]], 'opacity:1', 'opacity:0')}}`
  }
  css += `.${k} .cur{animation:${kf('cur')} ${t.durCss} ease-in-out infinite}` +
    `@keyframes ${kf('cur')}{${cursorKF(t, [{ x: 32, y: 26 }])}}`
  const body =
    `<rect x="20" y="20" width="150" height="22" rx="4" fill="var(--paper)" stroke="var(--ai-line)" stroke-width="1.2"/>` +
    `<rect class="typed" x="28" y="27" width="54" height="8" rx="3" fill="var(--line2)"/>` +
    `<rect x="176" y="20" width="22" height="22" rx="6" fill="var(--wash)" stroke="var(--line2)" stroke-width="1.2"/>` +
    `<path d="M187 25 v12 M181 31 h12" stroke="var(--ink-3)" stroke-width="1.4"/>` +
    rows + news + counts +
    `<text x="210" y="104" font-size="10" font-family="var(--sans)" fill="var(--mute)" letter-spacing="1.5">TOTAL</text>` +
    `<g class="cur">${CURSOR}</g>`
  return { css, body }
}

// ── the UI MIRROR (the human, 2026-08-28) ──────────────────────────────────
// A schematic drawn from the REAL screen's geometry instead of from an archetype. The harvest
// (spec/_base.ts snapLayout) photographs a layout SKELETON around every checkReq assertion — the
// viewport size, the ring target, and up to ~150 visible boxes with a rough kind and, for leaves,
// their text — and the reporter folds the pair to
// spec/<screen>/evidence/<id>.before.layout.json / <id>.after.layout.json. viz-derive reads those
// and calls this INSTEAD of the archetype kit, so the drawing beside the requirement is the app's
// own layout: the same rows in the same places, the asserted element ringed, carrying the value
// the assertion actually read ("5 to do", not an invented TOTAL chip).
//
// Still a drawing, and still honest:
//   · house shapes and dye tokens only — never a screenshot, never a colour or font from the app;
//   · exactly TWO frames, because the harvest captured exactly two states (before the assertion
//     body, after it) — a chain of N beats parks every beat after the first at the SAME after
//     frame rather than inventing per-beat motion nobody measured;
//   · the drawing carries its layout pin (data-viz-layout) beside the text pin (data-viz-hash), so
//     a re-harvest that moves the geometry re-derives, exactly as moved text does.

// ── THE DYE MAPPER (mirror-8, the human 2026-09-02: "it looks like a skeleton") ─────────────────
// The harvest now records what the real screen is COLOURED — snapLayout's bg / fg / bd, plain
// "r,g,b" triples. The board's rule does not bend for that: **never a raw colour in the board**. So
// a captured colour is mapped, HERE and at derive time, to the nearest traditional dye, and the SVG
// emits only var(--token). The rgb lives in the layout JSON, which is data — untrusted, and never
// interpolated into board.html.
//
// The palette below IS spec/_design.css's :root, restated once so this module stays pure (no fs).
// tools/dye.test.mjs reads the css and fails loudly if the two ever part — a palette edit must not
// quietly re-hue every drawing on the board.
export const DYES = {
  // 墨 sumi and the ash ladder under it
  sumi: '#1c1b18',
  ink: '#1c1b18',
  'ink-2': '#46443f',
  'ink-3': '#5f5d56',
  'ink-4': '#6e6b64',
  // 生成り kinari — unbleached paper
  paper: '#fdfcf9',
  canvas: '#f4f1ea',
  wash: '#eae6dc',
  // the hairlines
  hair: '#e2ddd1',
  line2: '#cdc7b8',
  line3: '#a8a59c',
  // 藍 ai · 弁柄 bengara · 苔 koke · 山吹 yamabuki
  ai: '#2f4a63',
  'ai-tint': '#e6eaee',
  'ai-line': '#b9c4ce',
  bengara: '#8d4a38',
  'bengara-tint': '#f2e8e4',
  'bengara-line': '#d8c0b6',
  koke: '#4d5c37',
  'koke-tint': '#eaece1',
  'koke-line': '#bcc4a8',
  yamabuki: '#8a6412',
  'yamabuki-tint': '#f6eeda',
  'yamabuki-line': '#dfc98c'
}

// what each ROLE may say. A background may fill solid or tint; text takes the ink ladder or a
// family solid; a border is always a hairline of its family. (--sunk / --dim-bg are aliases of
// --wash, --card of --paper, --line of --hair: the canonical name is the one emitted.)
const NEUTRALS = {
  bg: ['paper', 'canvas', 'wash', 'sumi'],
  fg: ['paper', 'ink-4', 'ink-3', 'ink-2', 'ink'],
  bd: ['hair', 'line2', 'line3']
}
// the four dye families, by the hue BAND each owns. Bands, not nearest-to-reference: 苔 koke is a
// desaturated olive and 藍 ai a slate, so "nearest reference hue" put a vivid green (145°) closer to
// indigo than to moss by two degrees. A band says what the family MEANS — yellow-gold, green,
// blue-through-purple, red — and is stable under any saturation.
const FAMILIES = [
  { name: 'yamabuki', lo: 30, hi: 70 },
  { name: 'koke', lo: 70, hi: 170 },
  { name: 'ai', lo: 170, hi: 290 },
  { name: 'bengara', lo: 290, hi: 390 }      // wraps 0: 290–360 and 0–30
]
// Grey-ish below this much absolute chroma ((max-min)/255). Measured against this palette: --line2,
// the warm hairline, carries 8% and every neutral rung less; a real app's pale chip (#dbeafe,
// #fef3c7) carries 11–22%. Anything under the line has no hue a reader could name, so it lands on
// the neutral ladder by VALUE — which is the honest answer, and the one that keeps a warm-grey UI
// from reading as gold.
const GREY = 0.10
// A SLATE IS A GREY (2026-09-02, the lead's review): the blue-grey slates a design system inks its
// quiet icons and stamps with (rgb 90,99,118; 139,147,165) carry ~0.11 chroma — just over the floor
// — and were painted --ai, the one hue this board reserves for the ring and the Changed state, so
// every grey chevron lit up indigo. A flat higher floor would swallow the palette's own low-chroma
// dyes (koke is 0.145), so the second test is SATURATION against lightness: a colour whose chroma is
// modest AND whose HSL saturation is low is a neutral; koke (S≈0.25), the -line dyes (≥0.18) and
// every vivid button stay chromatic.
const SLATE_C = 0.18
const SLATE_S = 0.175     // Tailwind's slate-500 (100,116,139) sits at 0.163; koke-line, the palette's least saturated chromatic dye, at 0.193
const TINT_L = 0.75      // above this a chromatic fill is a TINT, below it the solid dye

// "r,g,b" (what snapLayout writes), "#rrggbb" / "#rgb", "rgb()/rgba()", or [r,g,b]. Anything else —
// and anything fully transparent — is NO colour, and the renderer then keeps its own house default.
function parseRGB (v) {
  if (Array.isArray(v)) {
    return v.length >= 3 && v.slice(0, 3).every(n => Number.isFinite(Number(n)))
      ? v.slice(0, 3).map(n => clamp(Math.round(Number(n)), 0, 255)) : null
  }
  const s = String(v == null ? '' : v).trim()
  if (!s) return null
  let m
  if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s))) {
    const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1]
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  }
  if ((m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(s))) {
    if (m[4] != null && Number(m[4]) <= 0.02) return null
    return [1, 2, 3].map(i => clamp(Math.round(Number(m[i])), 0, 255))
  }
  if ((m = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(s))) {
    return [1, 2, 3].map(i => clamp(Number(m[i]), 0, 255))
  }
  return null
}
// lightness (HSL's L) and hue, plus absolute chroma — the three numbers the rule below turns on
function hcl (rgb) {
  const [r, g, b] = rgb.map(v => v / 255)
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min
  let h = 0
  if (d > 0) {
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? ((b - r) / d + 2) : ((r - g) / d + 4)
    h *= 60
  }
  return { h, c: d, l: (max + min) / 2 }
}
const nearestByValue = (l, names) =>
  names.reduce((best, n) => {
    const dl = Math.abs(hcl(parseRGB(DYES[n])).l - l)
    return dl < best.d ? { n, d: dl } : best
  }, { n: names[0], d: Infinity }).n

// dyeOf(colour, role) → the token NAME ('ai', 'ink-3', 'bengara-line'), or null when there is no
// colour to speak of. Pure, total, and deterministic: the same capture always draws the same dye.
// TEXT IS DRAWN ON THE PAPER GROUND, so `paper` is a colour only a genuinely near-white text may
// take (mirror-9, 2026-09-02, rule 7). The demo's "added just now" stamp is #aeb4c2: grey enough to
// land on the neutral ladder, and light enough that PAPER was its nearest rung by value — paper on
// paper, which is nothing at all, on the very element the human named as unacceptable. White text on
// a solid button is still paper; everything below this line takes the nearest rung a reader can see.
const NEAR_WHITE = 0.9
export function dyeOf (colour, role) {
  const names = NEUTRALS[role]
  if (!names) return null
  const rgb = parseRGB(colour)
  if (!rgb) return null
  const { h, c, l } = hcl(rgb)
  const readable = role === 'fg' && l < NEAR_WHITE ? names.filter(n => n !== 'paper') : names
  const sat = c / Math.max(0.02, 1 - Math.abs(2 * l - 1))       // HSL saturation from chroma + lightness
  if (c < GREY || (c < SLATE_C && sat < SLATE_S)) return nearestByValue(l, readable.length ? readable : names)
  const hue = h < 30 ? h + 360 : h
  const fam = (FAMILIES.find(f => hue >= f.lo && hue < f.hi) || FAMILIES[3]).name
  if (role === 'bd') return fam + '-line'
  if (role === 'fg') return l >= NEAR_WHITE ? 'paper' : fam
  return l >= TINT_L ? fam + '-tint' : fam
}
const LAYOUT_W = 600                       // the drawing's internal width; the pane scales by CSS
// THE RENDERER PIN. Staleness on this board is a BODY comparison — viz-derive redraws whenever the
// committed file differs from what the kit draws today — so a renderer change already lands on the
// next pass with no bump at all, and no committed drawing ever needs deleting. This stamp exists so
// the reason is legible ON DISK: `mirror-6` is ONE SENTENCE PER SCENE — the card carries the id chip
// and the single line the scene proves (the When while the action is being shown, the Then on the
// scene the beat rests on), chosen by tools/callout-text.mjs, the same rule the burn-in asks; the
// requirement title and the stacked second line are gone (the human, 2026-08-30: "as less text as
// possible", "both the schematic and proof need to have exact same text");
// `mirror-5` takes the ring's inset and the callout's placement from
// tools/overlay-geometry.mjs — the SAME module the burn-in reads them from, so the two cells of a
// beat row can no longer drift apart the way they had (the drawn ring's hard glow band read ~12
// page px out against the burned ring's ~5, and the band is gone); `mirror-4` draws the asserted value at the ELEMENT'S OWN MEASURED
// TYPE — the page's font size, alignment and text inset, where the harvest recorded them, instead of
// a centred label sized off the ring box's height; `mirror-3` draws the overlay at the burn-in's own PAGE GEOMETRY
// (a CARD.width card, scaled only by drawingW/pageW, so the drawn and photographed callouts are the same
// picture); `mirror-2` was the same overlay sized against the drawing, `mirror-1` the plain
// wireframe before it.
// `mirror-8` (2026-09-02) is COLOUR AND STATE: the harvest measures what the page is painted
// (bg / fg / bd) and the small facts a grey box cannot carry (rd / fw / td / op / dis, and a `check`
// kind that knows whether it is ticked), and the drawing maps each to its nearest dye (dyeOf above).
// The human's word for what it replaced was "a skeleton" — the chips, the primary button, the ticked
// box and the struck-through done row were all the same grey bar. No raw colour reaches the SVG.
// `mirror-10` (2026-09-02) is THE ICON ITSELF. The human, on the demo's R1 scene 3: "there's a weird
// extra circle on each row's right side in the schematic". A row's chevron is a wordless 28×28
// <button class="caret"> holding a 24-unit stroked <svg>; the button took the wash plate at rx≈7 and
// the svg took the image plate with a hair stroke — a filled lozenge with a square on it, where the
// photograph shows a thin grey "›". Two rules meet it: a SMALL inline svg rides the skeleton as the
// few shapes it is actually made of (spec/_base.ts snapLayout `icon`) and is drawn as THOSE lines in
// its own viewBox units, with no plate behind it; and a button the page paints nothing on, that
// carries no word of its own, is that icon and nothing else — the same stand-down the tick box
// already had. A raster <img> is still a wash plate: there is nothing to draw but its place.
// `mirror-9` (2026-09-02) is THE RINGED THING ITSELF. The human, on the demo's R1 scene 3: "schematic
// still looks like skeleton … all styling, component should be same (like currently even missing
// tickbox, and the 'just added now' is totally unacceptable)". Four faults met on that one row:
// the kit SKIPPED every element inside the ring and typed the row's concatenated innerText as one
// mono line (so the tick box, the title, the stamp and the chevron all vanished); the row's
// hover-only controls are `opacity:0` but their child icons carry none, so three wash squares were
// drawn where the photograph shows one chevron; a 21×21 wordless <button> got the "no measured text"
// placeholder bar and read as a dot in a circle; and the stamp's own pale grey mapped to `paper`,
// which on the paper ground is nothing at all. Now every element is drawn ringed or not, a faded
// box takes its subtree with it, a small wordless control is its plate alone, and text is drawn in
// the family, casing and dye the page gives it (ff / tt / ph). (Narrowed by mirror-10, rule 6: that
// plate now stands only where the page PAINTS the control — an unpainted one is its icon alone.)
// `mirror-11` (2026-09-02) is THE SHAPE'S OWN COLOUR, AND A TICK YOU CAN SEE — the lead's visual
// review of the re-harvested demo (demo/todo, the R3 and R6 scenes), two differences still standing
// against the photograph. First: a MULTI-COLOUR ICON DREW IN ONE DYE. Tsumiki's container ring is
// one <svg> holding a pale track circle and an indigo progress arc; mirror-10 carried a single `fg`
// for the whole icon — the svg's computed `color`, which here is the button's ink — so the ring came
// out a heavy black circle where the photograph shows a light track under an indigo arc. Now the
// harvest measures each SHAPE's own computed stroke and fill (`sc` / `fc`), its own stroke-width and
// its own opacity, and each is drawn in its own dye; `fg` is only the fallback for a shape that
// measured neither, so an older skeleton draws exactly as it did. Second: THE TICK ON A DONE
// CHECKBOX WAS INVISIBLE — a koke square with a hairline paper ✓ on it read, at an 18px box, as a
// solid dark square with nothing in it. The mark is drawn heavy and spans its square; and where the
// APP draws its own tick as an svg inside the control, that icon is the only tick.
// `mirror-12` (2026-09-02) is THE INTENT ON A FAILED SCENE. The human, on Tsumiki's R9 — the demo's
// deliberately failing requirement: "for the failed test case, schematic should be correct
// (schematic and behaviour are truth — otherwise user should disagree this truth and update it).
// But now even the schematic is wrong as well, please update." Every kit up to mirror-11 drew the
// ringed element's MEASURED text on every scene, pass or fail, so a beat that expected 5 and read 4
// drew a 4 beside a photograph of a 4: two pictures of the same wrong number, and nothing on the row
// saying what the requirement asks for. The two cells are not two copies of one fact — the DRAWING
// is the authored intent, the PHOTOGRAPH is what the app did, and the row is the comparison. So a
// value frame now carries the CLAIM it made (spec/_base.ts snapValue → tools/evidence.mjs valueMeta
// → the fold), and where that claim failed the ringed value is drawn as the EXPECTED one, in the
// same asserted ink as any measured value; the beat's after frame takes the same intent, being its
// intended end state. The callout is untouched — "got 4 ✕" is the burn-in's, and stays the burn-in's.
const MIRROR_KIT = 'mirror-13'
const KINDS = new Set(['heading', 'text', 'input', 'button', 'row', 'container', 'image', 'check'])
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
// a nests inside b — the ONE tolerance the whole kit uses for "this box is inside that one"
const nestsIn = (a, b) => a !== b && a.x >= b.x - 0.6 && a.y >= b.y - 0.6 &&
  a.x + a.w <= b.x + b.w + 0.6 && a.y + a.h <= b.y + b.h + 0.6
// WHAT THE PAGE DOES NOT SHOW, THE MIRROR MUST NOT DRAW (mirror-9). Below this much effective
// opacity an element is invisible on the page; the capture already skips those subtrees, and this is
// the render side of the same rule, for a skeleton harvested before it.
const GONE = 0.05

// THE ICON, VALIDATED BEFORE A LINE OF IT IS DRAWN (mirror-10, 2026-09-02). This is the only place
// on the board where harvested data becomes GEOMETRY the SVG emits verbatim, so it is checked
// strictly and dropped whole on the first thing that is not plainly a shape: a path `d` outside the
// path-data alphabet or longer than 400 characters, a number that is not finite, a points list that
// is not an even run of finite numbers, more than 12 shapes. A dropped icon is not an error — the
// image simply draws the wash plate it always did. The colour never travels raw: `fg` goes through
// dyeOf like every other measured colour, so the drawing can only ever emit var(--token).
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/
const ICON_SHAPES = 12
function normIcon (ic) {
  if (!ic || typeof ic !== 'object') return null
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : null)
  const vb = (Array.isArray(ic.vb) ? ic.vb : []).map(num)
  if (vb.length !== 4 || vb.some(n => n == null) || !(vb[2] > 0) || !(vb[3] > 0)) return null
  const src = Array.isArray(ic.shapes) ? ic.shapes : []
  if (!src.length || src.length > ICON_SHAPES) return null
  const shapes = []
  for (const sh of src) {
    if (!sh || typeof sh !== 'object') return null
    let out = null
    if (sh.t === 'path') {
      const d = String(sh.d == null ? '' : sh.d).trim()
      if (!d || d.length > 400 || !PATH_D.test(d)) return null
      out = { t: 'path', d }
    } else if (sh.t === 'circle') {
      const cx = num(sh.cx); const cy = num(sh.cy); const rr = num(sh.r)
      if (cx == null || cy == null || !(rr > 0)) return null
      out = { t: 'circle', cx, cy, r: rr }
    } else if (sh.t === 'line') {
      const x1 = num(sh.x1); const y1 = num(sh.y1); const x2 = num(sh.x2); const y2 = num(sh.y2)
      if (x1 == null || y1 == null || x2 == null || y2 == null) return null
      out = { t: 'line', x1, y1, x2, y2 }
    } else if (sh.t === 'rect') {
      const x = num(sh.x); const y = num(sh.y); const w = num(sh.w); const h = num(sh.h); const rx = num(sh.rx)
      if (x == null || y == null || !(w > 0) || !(h > 0)) return null
      out = { t: 'rect', x, y, w, h, rx: rx > 0 ? rx : null }
    } else if (sh.t === 'polyline' || sh.t === 'polygon') {
      const pts = String(sh.points == null ? '' : sh.points).trim().split(/[\s,]+/).map(Number)
      if (!pts.length || pts.length % 2 || pts.length > 200 || pts.some(n => !Number.isFinite(n))) return null
      const pairs = []
      for (let i = 0; i < pts.length; i += 2) pairs.push(r2(pts[i]) + ',' + r2(pts[i + 1]))
      out = { t: sh.t, points: pairs.join(' ') }
    } else return null
    // a shape the page neither fills nor strokes draws nothing at all — and a skeleton claiming one
    // is not a skeleton this kit understands, so the whole icon stands down rather than half of it
    if (!sh.f && !sh.s) return null
    out.f = !!sh.f
    out.s = !!sh.s
    // …AND THE SHAPE'S OWN PAINT (mirror-11). A COLOUR is not geometry: a malformed one is dropped
    // and the shape simply falls back to the icon's dye, exactly as bg/fg/bd do elsewhere — an
    // unreadable colour is no reason to lose a line the page draws. dyeOf is total and returns null
    // on anything that is not plainly a colour ('#zzz', '1,2', '1,2,3,4', a url(), an object), so
    // the raw string can never reach the SVG.
    out.sc = typeof sh.sc === 'string' ? dyeOf(sh.sc, 'fg') : null
    out.fc = typeof sh.fc === 'string' ? dyeOf(sh.fc, 'fg') : null
    const ssw = num(sh.sw)
    out.sw = ssw > 0 ? clamp(ssw, 0.01, 20) : null
    const sop = num(sh.op)
    out.op = sop != null && sop >= 0 && sop < 1 ? clamp(sop, 0, 1) : null
    shapes.push(out)
  }
  const sw = num(ic.sw)
  return { vb, sw: sw > 0 ? clamp(sw, 0.01, 20) : 1.5, shapes, fg: dyeOf(ic.fg, 'fg') }
}
// WHERE AN ICON'S OWN viewBox LANDS INSIDE ITS MEASURED BOX, in drawing units. ONE rule, read by the
// renderer AND by its guard — mirrorGaps asks for the group this computes, never a second sum.
const iconPlace = (ic, box) => {
  const sx = box.w / ic.vb[2]
  const sy = box.h / ic.vb[3]
  return { sx, sy, tx: box.x - ic.vb[0] * sx, ty: box.y - ic.vb[1] * sy }
}
// …and the icon drawn: the page's own shapes, in the page's own units, inside one scaled group.
// The stroke stays the page's — sw is already in viewBox units, and the group's scale carries it to
// exactly the weight the screen shows, relative to everything else in the frame. It is only ever
// RAISED, never lowered: an icon whose line would land under the kit's own hairline would be a
// drawing of nothing. Deliberately NOT sw / scale (a stroke of constant DRAWING units, whatever the
// icon's size): that puts a 2-unit line on a 3-unit chevron — a blob, not a mirror.
const ICON_HAIR = 0.9
// …and since mirror-11 each shape wears ITS OWN dye and its own weight where the harvest measured
// them (`sc` / `fc` / `sw` / `op`), because one icon is often two colours: a pale progress TRACK
// under an indigo ARC is one <svg>, and drawing both in the svg's own `color` made it a black
// circle. A shape that measured neither colour still takes the icon's `fg`, so a mirror-10 skeleton
// draws exactly as it always did.
function iconSVG (ic, box) {
  const p = iconPlace(ic, box)
  const ink = 'var(--' + (ic.fg || 'ink-3') + ')'
  const hair = ICON_HAIR / Math.max(0.0001, Math.min(p.sx, p.sy))
  const body = ic.shapes.map(sh => {
    const si = sh.sc ? 'var(--' + sh.sc + ')' : ink
    const fi = sh.fc ? 'var(--' + sh.fc + ')' : ink
    const sw = r2(Math.max(sh.sw || ic.sw, hair))
    const fade = sh.op != null ? ` opacity="${r2(sh.op)}"` : ''
    const paint = (sh.f ? ` fill="${fi}"` : ' fill="none"') +
      (sh.s ? ` stroke="${si}" stroke-width="${sw}"` : '') + fade
    if (sh.t === 'path') return `<path d="${sh.d}"${paint}/>`
    if (sh.t === 'circle') return `<circle cx="${r2(sh.cx)}" cy="${r2(sh.cy)}" r="${r2(sh.r)}"${paint}/>`
    if (sh.t === 'line') {
      return `<line x1="${r2(sh.x1)}" y1="${r2(sh.y1)}" x2="${r2(sh.x2)}" y2="${r2(sh.y2)}"` +
        ` stroke="${si}" stroke-width="${sw}"${fade}/>`
    }
    if (sh.t === 'rect') {
      return `<rect x="${r2(sh.x)}" y="${r2(sh.y)}" width="${r2(sh.w)}" height="${r2(sh.h)}"` +
        (sh.rx ? ` rx="${r2(sh.rx)}"` : '') + `${paint}/>`
    }
    return `<${sh.t} points="${sh.points}"${paint}/>`
  }).join('')
  return `<g transform="translate(${r2(p.tx)} ${r2(p.ty)}) scale(${r2(p.sx)} ${r2(p.sy)})"` +
    ` stroke-linecap="round" stroke-linejoin="round">${body}</g>`
}

// The layout files are HARVESTED data, not authored: every field is untrusted. Anything malformed
// is dropped rather than drawn, and a layout with no usable box yields null — the caller then
// falls back to the archetype kit, never to an empty frame.
// THE CLAIM A VALUE FRAME MADE (mirror-12, 2026-09-02) — what the assertion asked for beside what
// the page gave it, and whether it held. Untrusted like every other harvested field, and validated
// here rather than imported from the fold: this file's contract is that nothing reaches the drawing
// unchecked. Whole or nothing — two strings and a boolean verdict; a half-claim would leave the
// mirror guessing whether a scene failed, and a guess about a failure is the fake green rule 3
// refuses. The strings are bounded because a value gets TYPED into the drawing.
function normClaim (c) {
  if (!c || typeof c !== 'object') return null
  if (typeof c.expected !== 'string' || typeof c.got !== 'string' || typeof c.ok !== 'boolean') return null
  const one = s => s.replace(/\s+/g, ' ').trim().slice(0, 140)
  const expected = one(c.expected); const got = one(c.got)
  if (!expected && !got) return null
  // `missing` (mirror-13): the check found NOTHING to read — the element the requirement names is
  // not on the page. A drawing treats that differently from a wrong value on a present element.
  return { expected, got, ok: c.ok, ...(c.missing === true ? { missing: true } : {}) }
}
function normLayout (l) {
  if (!l || typeof l !== 'object') return null
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : null)
  const w = num(l.w); const h = num(l.h)
  if (!(w > 0) || !(h > 0)) return null
  const els = []
  const seen = new Set()
  for (const e of (Array.isArray(l.els) ? l.els : [])) {
    if (!e || typeof e !== 'object' || els.length >= 200) continue
    const x = num(e.x); const y = num(e.y); const ew = num(e.w); const eh = num(e.h)
    if (x == null || y == null || !(ew > 0) || !(eh > 0)) continue
    const kind = KINDS.has(e.kind) ? e.kind : 'container'
    // wrapper divs stack identical boxes; one drawn shape per geometry keeps the mirror readable
    const key = kind + '|' + Math.round(x) + '|' + Math.round(y) + '|' + Math.round(ew) + '|' + Math.round(eh)
    if (seen.has(key)) continue
    seen.add(key)
    // THE ELEMENT'S OWN TYPE (2026-08-29), where the harvest measured it: the font size the page
    // renders this text at, how it is aligned in its box, and the inset its text starts from. Only
    // ever used for the text the drawing types INSIDE a box; absent (an older harvest) it stays null
    // and the kit falls back to sizing off the box, which is all such a skeleton can honestly say.
    const fs = num(e.fs)
    const pl = num(e.pl); const pr = num(e.pr)
    // THE COLOUR AND THE STATE (mirror-8, 2026-09-02). Every one of these is OPTIONAL: a skeleton
    // folded before this pass carries none of them and draws exactly as it always did. A colour is
    // kept only if it maps to a dye (dyeOf) — the raw triple is never stored on the drawn element,
    // so no path from here can put an app colour in the SVG.
    const rd = num(e.rd)
    const op = num(e.op)
    els.push({
      x,
      y,
      w: ew,
      h: eh,
      kind,
      text: typeof e.text === 'string' ? e.text : '',
      focus: !!e.focus,
      fs: fs > 0 ? fs : null,
      ta: (e.ta === 'c' || e.ta === 'r' || e.ta === 'l') ? e.ta : null,
      pl: pl > 0 ? pl : 0,
      pr: pr > 0 ? pr : 0,
      bg: dyeOf(e.bg, 'bg'),
      fg: dyeOf(e.fg, 'fg'),
      bd: dyeOf(e.bd, 'bd'),
      rd: rd > 0 ? clamp(rd, 0, 40) : 0,
      fw: !!e.fw,
      td: !!e.td,
      it: !!e.it,
      on: !!e.on,
      dis: !!e.dis,
      // the FAMILY the page renders this text in (mirror-9): the design system has --sans and --mono
      // only, so a measured serif maps to sans rather than inventing a third token. Absent — an older
      // skeleton — it stays null and each draw site keeps its own house default.
      ff: e.ff === 'mono' ? 'mono' : (e.ff === 'sans' || e.ff === 'serif' ? 'sans' : null),
      tt: e.tt === 'u' ? 'u' : null,          // text-transform:uppercase — draw what the page shows
      ph: !!e.ph,                             // the text came from the field's placeholder, not its value
      op: op != null && op >= GONE && op < 1 ? clamp(op, GONE, 0.99) : null,
      // the shapes a small inline svg is made of, or null — an <img>, an illustration, an svg the
      // harvest could not read, or anything malformed (mirror-10, normIcon above)
      icon: kind === 'image' ? normIcon(e.icon) : null,
      // an INTENDED element (mirror-13): its text is already the requirement's expected value, put
      // there by intendedLayout — the scene's own intent swap below must leave it alone, or a later
      // claim's value would overwrite an earlier claim's (the Undo retyped as "5")
      intended: e.intended === true,
      gone: op != null && op < GONE
    })
  }
  // …and an element the page has faded to nothing takes its whole subtree with it (mirror-9,
  // 2026-09-02). Tsumiki's row hides its edit/delete buttons at `opacity:0` until hover; opacity is
  // on the BUTTON, so its 16×16 icon carried none of its own and three wash squares were drawn where
  // the photograph shows one chevron. A box that is not on screen cannot have children that are.
  const gone = els.filter(e => e.gone)
  const live = els.filter(e => !e.gone && !gone.some(g => nestsIn(e, g)))
  // …and what was dropped is REPORTED, not just forgotten (2026-09-02): mirrorGaps needs the boxes
  // the page had faded away in order to say a frame painted one of them anyway. Derived here so
  // there is one rule for "not on screen", never a second reading of `op` somewhere else.
  const hidden = els.filter(e => e.gone || gone.some(g => nestsIn(e, g)))
    .map(e => ({ x: e.x, y: e.y, w: e.w, h: e.h, kind: e.kind, text: e.text }))
  for (const e of live) delete e.gone
  const r = l.ring && typeof l.ring === 'object' ? l.ring : null
  const ring = r && num(r.x) != null && num(r.y) != null && num(r.w) > 0 && num(r.h) > 0
    ? { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) }
    : null
  return { w, h, ring, els: live, hidden, claim: normClaim(l.claim) }
}

// The layout PIN — the same role reqHash plays for the text. Hashes the GEOMETRY the drawing was
// made of, so a re-harvest whose boxes did not move redraws byte-identically (and viz-derive then
// leaves the committed file untouched). Takes either the per-beat list or the legacy single pair,
// matching renderWireframe's two call forms.
//
// Two things are deliberately normalised OUT of it (2026-08-29):
//   · `at` — the harvest's wall-clock offset for a value frame. It never repeats, so hashing it
//     would redraw every schematic on every run and call the geometry changed when nothing moved.
//   · a missing vs empty `values` list — a beat that proved no value is the same beat either way.
const pinShape = p => ({
  before: (p && p.before) || null,
  after: (p && p.after) || null,
  values: (p && Array.isArray(p.values) ? p.values : []).filter(Boolean)
})
export const layoutHash = (a, b) =>
  reqHash(JSON.stringify((Array.isArray(a) ? a : [{ before: a || null, after: b || null }]).map(pinShape),
    (k, v) => (k === 'at' ? undefined : v)))

// App text is untrusted: collapse whitespace, drop control characters and backticks (the builder
// interpolates this into board.html), then XML-escape.
//
// …and then DEFUSE the two shapes build-board's renderSchematic refuses on sight. A label reading
// `<img src=x onerror="…">` escapes to harmless text, but the literal substring ` onerror=` still
// trips that guard's /\son\w+=/ and the whole figure would be dropped — a page whose copy happens
// to mention an attribute would silently lose its drawing. Dropping the `=` keeps the words and
// keeps the drawing renderable; it can never resurrect a handler, because the text is escaped.
const say = s => esc(String(s == null ? '' : s).replace(/[`\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim())
  .replace(/\bon([a-z0-9-]+)\s*=/gi, 'on$1 ')
  .replace(/\bhref\s*=/gi, 'href ')
// Fit a label to its box — a truncated word beats a drawing that overflows its own shapes. It cuts
// the RAW text and escapes after (say() below), never the other way round: truncating escaped text
// can slice an entity in half and leave `&qu…` in the middle of the drawing.
const raw = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
const fitText = (s, wpx, fs) => {
  const max = Math.max(1, Math.floor(wpx / (fs * 0.55)))
  const t = raw(s)
  return t.length <= max ? t : t.slice(0, Math.max(1, max - 1)) + '…'
}
const svgText = (x, y, fs, fill, fam, txt, extra = '') =>
  `<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(fs)}" font-family="var(--${fam})" fill="var(--${fill})"${extra}>${txt}</text>`
// A measured string drawn INSIDE its own box, in the page's own type: ONE <text>, placed by the
// element's alignment and left/right padding inset, vertically centred, and truncated to the content
// width — the same way valueMark lands an asserted value, for the plain (unringed) elements around
// it. That is what turns the mirror from a grey skeleton into something that reads as the real page.
//
// NEVER CUT INSIDE ITS OWN BOX (2026-09-02, the lead's visual review of the re-harvested demo). A
// leaf's box IS its text's measured width, so the words always fit the page — "All tasks" in a 96px
// box at 26px bold was drawn "All t…" because fitText's 0.55em-per-character estimate is wider than
// most type. So a label whose ESTIMATE overflows its room is SQUEEZED to the room with SVG textLength
// (a hair narrower than the page's own letterfit, never a missing word); only a gross overflow — the
// page itself clipping a long string — is still truncated, at the squeezed width.
const SQUEEZE = 1.35                                  // how far the estimate may overshoot before the words are cut
const textIn = (bx, by, bw, bh, fs, fill, fam, s, ta = 'l', pl = 0, pr = 0, extra = '') => {
  const room = Math.max(1, bw - pl - pr)
  const est = raw(s).length * fs * 0.55
  const fits = est <= room
  const label = say(fits ? raw(s) : fitText(s, room * SQUEEZE, fs))   // truncate RAW then escape (fitText → say), never the reverse
  if (!fits) extra += ` textLength="${r1(room)}" lengthAdjust="spacingAndGlyphs"`
  const base = r1(by + bh / 2 + fs * 0.34)
  if (ta === 'c') return svgText(r1(bx + bw / 2), base, fs, fill, fam, label, ' text-anchor="middle"' + extra)
  if (ta === 'r') return svgText(r1(bx + bw - pr), base, fs, fill, fam, label, ' text-anchor="end"' + extra)
  return svgText(r1(bx + pl), base, fs, fill, fam, label, extra)
}

// THE BOARD'S CAMERA, computed here (the human, 2026-08-28: the drawn callout was being CLIPPED).
// Every beat cell zooms onto the beat's focus rect, and the schematic cell zooms this drawing by
// the SAME math — tools/board/stepper.js: pad the focus rect by a breathing MARGIN, then COVER-fit
// that padded rect (a wide, short target crops at the sides rather than zooming out), centre on the
// scene being shown and clamp inside the frame. Anything the drawing puts outside that region is
// simply not on screen in a beat row, which is how R5's card ended up cut mid-word: its counter sits
// at the page's right edge, so the region is the right third of the page.
//
// Because BOTH cells cover-fit at the same scale, an overlay drawn at the burn-in's own page
// geometry lands at the same apparent size as the photographed one — which is the whole point.
//
// TIGHT (the human, 2026-08-31: "do more aggressive zoom in on the area it's focusing"). The pad was
// 2.75 and the cap 2.2, and between them the thing being proven read at about a third of the cell —
// a picture of a page with the proof somewhere inside it. The pad is now a BREATHING MARGIN (×1.2)
// and the cap 3.2, so the ringed thing fills the cell and the reader is looking at the assertion
// rather than hunting for it. Where the pad does not fit, it falls back to MARGIN (×1.12) — the
// same floor the no-crop rule uses, so a target too big to pad still frames itself rather than
// surrendering to the whole page.
//
// AND THE AIM IS THE SCENE, NOT THE BEAT (the same ask). The beat's rings can be 600px apart down
// the page — the demo's R1 types into a box at the top and proves two rows near the bottom — and a
// camera that must hold every one of them at once can only do it by zooming back out. So the BEAT
// still sets the zoom (one magnification per row: a scale that changed mid-beat would pump the two
// cells against each other) and each SCENE sets the aim. `opts.aim` is that scene's own ring; with
// none it defaults to the focus and this is byte-for-byte the old camera.
const MARGIN = 1.12
const MAX_SCALE = 3.2
const PAD = 1.2
function padded (size, frame, pad) {
  const want = size * pad
  return want <= frame ? want : Math.min(frame, size * MARGIN)
}
const usableRect = r => !!(r && r.w > 0 && r.h > 0 &&
  Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h))
export function framedRegion (f, W, H, opts = {}) {
  const pad = opts.pad != null ? opts.pad : PAD
  const maxScale = opts.maxScale != null ? opts.maxScale : MAX_SCALE
  const whole = { x: 0, y: 0, w: W, h: H }
  if (!f || !(f.w > 0) || !(f.h > 0) || !(W > 0) || !(H > 0)) return whole
  let aim = usableRect(opts.aim) ? opts.aim : f
  // …and the scene's callout card is part of what it is SHOWING (the human, 2026-08-30: never crop
  // the explaining text box). The zoom stays the beat's, but the region must CONTAIN the ring's
  // union with its card, and be aimed at that union — so a card hanging below or above its ring is
  // framed with it instead of clipped at the cell edge. Mirrored in tools/board/stepper.js.
  if (usableRect(opts.card)) aim = unionRect(aim, opts.card)
  const pw = padded(f.w, W, pad); const ph = padded(f.h, H, pad)
  // COVER, not contain: the bigger of the two ratios fills the cell, cropping the padded rect's
  // long side instead of refusing to zoom at all
  // …and NEVER past the scale at which the AIM itself stops fitting (2026-08-29, aimed at the scene
  // since 2026-08-31): covering a rect taller than the cell would crop the very scene the row is
  // showing. Small targets never reach this — maxScale bites first.
  const fit = Math.min(W / (aim.w * MARGIN), H / (aim.h * MARGIN))
  const scale = Math.min(maxScale, fit, Math.max(W / pw, H / ph))
  if (!(scale > 1)) return whole
  const rw = W / scale; const rh = H / scale
  return {
    x: Math.min(Math.max(0, aim.x + aim.w / 2 - rw / 2), Math.max(0, W - rw)),
    y: Math.min(Math.max(0, aim.y + aim.h / 2 - rh / 2), Math.max(0, H - rh)),
    w: rw,
    h: rh
  }
}
const insideRegion = (b, reg) => b.x >= reg.x - 0.01 && b.y >= reg.y - 0.01 &&
  b.x + b.w <= reg.x + reg.w + 0.01 && b.y + b.h <= reg.y + reg.h + 0.01

// THE CARD BOX THE REGION MUST CONTAIN (the human, 2026-08-30: never crop the explaining text box).
// Where the callout goes for this scene's ring (the shared calloutSpot), at the width it draws, at
// the height the WHOLE sentence needs — UNCAPPED, because the burn-in does not truncate its card to
// two lines the way the drawn one does, so the camera has to reserve room for every line the
// photograph will actually show or it clips the proof. In PAGE units, so both cells frame one box:
// the drawing passes it to framedRegion, and it is published on the svg (data-viz-cardspots) so the
// proof cell's camera frames the identical box. `spec` is the callout (its `text`/`label`); `ring`
// and the viewport are the page-pixel geometry the harvest recorded.
function cardRegionBox (spec, ring, vw, vh) {
  if (!spec || !raw(spec.text) || !ring || !(ring.w > 0) || !(vw > 0) || !(vh > 0)) return null
  // the SHARED wrap (tools/callout-text.mjs) — the same lines the card actually draws and the burn-in
  // burns, so the region is sized for exactly the card the photograph shows, never a shorter guess
  const ch = calloutBoxHeight(calloutLines(spec.text).length)
  const box = { x: ring.x, y: ring.y, w: ring.w, h: ring.h }
  return calloutRect({ box, vw, vh, cw: CARD.width, ch })
}

// THE ASSERTED VALUE, in the app's own words. IN THE BOX, because that is where the app puts it:
// the screen draws its counter's value inside the counter, so a ring box with a pill stacked under
// it reads as two objects where the page has one. The type is sized off the BOX, exactly like every
// other text this kit draws, so it matches the photograph's own proportions. The pill survives only
// for a box whose value cannot be drawn inside it at all — and it is clamped into the camera's
// framed region so it can never fall outside the beat cell either. Returns the box it occupies
// (null when the value sits inside the ring, which is already the callout's obstacle).
function valueMark (f, text, W, H, hot, region) {
  const label = fitText(text, 460, 12)
  if (!label) return { svg: '', box: null }
  // THE ELEMENT'S OWN TYPE, COLOUR INCLUDED (mirror-9): a measured value is drawn in the family and
  // the dye the page gives it, not forced into ink and a typewriter face — the photograph beside it
  // shows the app's own sans. A value that was never measured (the requirement's own quoted words,
  // an older skeleton) keeps the typed-value convention, so authored and measured never look alike.
  const ink = hot ? (f.fg || 'ink') : 'ink-3'
  const fam = f.ff || 'mono'                           // the ghost's family is measured too; only the INK says authored vs read
  // WHERE THE PAGE PUTS IT (the human, 2026-08-29: "the input box of add task is in a different
  // place"). Sizing the value off the ring box's HEIGHT is right for a text leaf — its box IS its
  // line — and wrong for a FIELD: a 47px Add input drew its typed value mid-box at ~2.5× the type
  // the app renders, the only text in the whole drawing not sitting where the photograph has it.
  // Where the harvest measured the element's own type (fs / ta / the text's inset), the drawing uses
  // it: same size, same alignment, same start, converted by the ONE scale S like every other number
  // here. Where it did not, the old centred mark stands — an older skeleton cannot honestly say more.
  const mfs = f.fs > 0 ? f.fs : 0
  const own = mfs || clamp(f.h * 0.62, 4, 16)          // the element's own type size, as everywhere else
  const pad = mfs ? { l: f.pl || 0, r: f.pr || 0 } : { l: 0, r: 0 }
  // measured type is never grown to fill the box; it only ever shrinks to stay inside it — and the
  // room it must stay inside is the element's own content box (its padding, nothing invented). The
  // guessed path keeps its extra breathing margin, because a centred label sitting on the box's
  // edges reads as an overflow; a left-aligned one starting where the page starts it does not.
  const room = Math.max(1, f.w - pad.l - pad.r)
  const fit = mfs
    ? Math.min(mfs, room / (label.length * 0.62))
    : Math.min(own, (f.w - own * 0.4) / (label.length * 0.62), f.h * 0.78)
  if (fit >= 4) {
    const base = f.y + f.h / 2 + fit * 0.35
    const align = mfs ? (f.ta || 'l') : 'c'
    if (align === 'l') return { svg: svgText(f.x + pad.l, base, fit, ink, fam, say(label)), box: null }
    if (align === 'r') {
      return { svg: svgText(f.x + f.w - pad.r, base, fit, ink, fam, say(label), ' text-anchor="end"'), box: null }
    }
    return {
      svg: svgText(f.x + f.w / 2, base, fit, ink, fam, say(label), ' text-anchor="middle"'),
      box: null
    }
  }
  const reg = region || { x: 0, y: 0, w: W, h: H }
  const fs = Math.max(4, own)
  const pw = r1(Math.min(label.length * fs * 0.62 + fs, reg.w - 4, W - 12))
  const ph = r1(fs * 1.65)
  const x = r1(clamp(f.x + f.w / 2 - pw / 2, Math.max(reg.x + 2, 2), Math.max(reg.x + 2, Math.min(W - pw - 2, reg.x + reg.w - pw - 2))))
  const above = f.y - 4 - ph >= reg.y + 2
  const y = r1(above
    ? f.y - 4 - ph
    : clamp(f.y + f.h + 4, reg.y + 2, Math.max(reg.y + 2, reg.y + reg.h - ph - 2)))
  const svg = `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${r1(ph / 2)}" fill="var(--paper)" stroke="var(--${hot ? 'ai' : 'line2'})" stroke-width="1"/>` +
    svgText(r1(x + pw / 2), r1(y + ph / 2 + fs * 0.35), fs, ink, fam, say(label), ' text-anchor="middle"')
  return { svg, box: { x, y, w: pw, h: ph } }
}

// (the callout's line wrap now lives in tools/callout-text.mjs calloutLines — ONE rule the burn-in
// and the drawing both consume, so the two cards break at the exact same points, 2026-08-31)

// THE RINGED ELEMENT, de-duplicated (2026-08-28 fix). The capture marks every element lying inside
// the ring, so a counter and the span inside it BOTH come back focused — and the drawing put a
// value on each, stacking "6" over "6 to do". Draw ONE box per nest:
//   · a box with words beats a wrapper with none;
//   · the box that best MATCHES THE RING wins — the ring is the element the assertion actually
//     pointed at, so its counter ("3 to do") is the reading, not the digit span inside it;
//   · with no ring measured, the tightest box wins;
//   · anything nesting with a box already kept is dropped.
function pickFocus (marks, ring) {
  const texted = marks.filter(f => raw(f.text))
  const pool = texted.length ? texted : marks
  const areaOf = f => Math.max(1, f.w * f.h)
  const iou = f => {
    if (!ring) return 0
    const ox = Math.max(0, Math.min(f.x + f.w, ring.x + ring.w) - Math.max(f.x, ring.x))
    const oy = Math.max(0, Math.min(f.y + f.h, ring.y + ring.h) - Math.max(f.y, ring.y))
    const inter = ox * oy
    return inter / Math.max(1, areaOf(f) + ring.w * ring.h - inter)
  }
  const nests = (a, b) => a.x >= b.x - 0.6 && a.y >= b.y - 0.6 &&
    a.x + a.w <= b.x + b.w + 0.6 && a.y + a.h <= b.y + b.h + 0.6
  const kept = []
  for (const f of pool.slice().sort((a, b) => (iou(b) - iou(a)) || (areaOf(a) - areaOf(b)))) {
    if (kept.some(k => nests(k, f) || nests(f, k))) continue
    kept.push(f)
  }
  return kept
}
// The verdict mark, DRAWN rather than typed: the burn-in can lean on the browser's UI font for ✓,
// a committed SVG cannot — the glyph is missing from plenty of the families a --sans stack lands
// on, and a missing glyph renders as a tofu box on the one mark that must never be ambiguous.
// …and it takes the dye it is drawn ON (mirror-8): the verdict tick on the card stays 苔 moss, but
// the tick inside a FILLED checkbox has to be paper, or it would be moss on moss — invisible.
const checkMark = (x, y, s, stroke = 'ok') =>
  `<path d="M${r1(x)} ${r1(y)} l${r1(s * 0.34)} ${r1(s * 0.34)} l${r1(s * 0.66)} ${r1(-s * 0.8)}" ` +
  `fill="none" stroke="var(--${stroke})" stroke-width="${r1(Math.max(0.6, s * 0.2))}" stroke-linecap="round" stroke-linejoin="round"/>`

// ── THE BURN-IN, IN PAGE PIXELS ────────────────────────────────────────────
// The drawn overlay and the photographed one must be the SAME PICTURE (the human, 2026-08-28 —
// "identical except mock vs real"). So every number below is renderOverlay's own, in page pixels,
// converted by the ONE ratio this drawing already uses for everything else: S = drawingW / page
// width. Nothing here is sized against the drawing, the focus rect or the camera — that was the
// mistake: a card measured against the framed region renders huge at full frame and stops matching
// the photograph the moment the two are put side by side.
//
// …and since 2026-08-30 they are not copied here at all: the ring's inset and the callout's
// placement come from tools/overlay-geometry.mjs, the ONE module the burn-in reads them from too.
// Copies are exactly how the two drifted — an audit of the demo's R1 beat cells measured the drawn
// ring ~12 page px out from the element box against the burned one's ~5, which on a thin target is
// a drawn ring twice the photographed one's height.
const OV = {
  card: CARD.width,   // .sb-call width
  rad: CARD.radius,   // its border-radius
  padX: CARD.padX,    // its padding: padY padX
  padY: CARD.padY,
  // ONE SENTENCE (2026-08-30) — the id chip, then the line this scene proves. The title row, the
  // second sentence and the gap between them are gone; the type comes from the shared module.
  fsId: CALLOUT_TYPE.id,      // the id chip's mono
  fsLab: CALLOUT_TYPE.lab,    // the WHEN / THEN mono label
  fsLine: CALLOUT_TYPE.line,  // the sentence
  lhLine: CALLOUT_TYPE.lh,
  tagGap: CALLOUT_TYPE.tagGap,
  chipPadX: 5,
  chipRad: 4,
  notch: CARD.notch,  // the 12px square, rotated 45°
  ringStroke: RING.stroke,
  ringRad: RING.radius,
  halo: RING.halo,    // box-shadow 0 0 0 3px paper
  shadowY: 6          // 0 10px 30px rgba(ink,.24), approximated as one offset plate
}
// the rotated square's visible triangle: half-base and tip reach are both side/√2
const NOTCH_REACH = CARD.reach

// THE DIM. The burn-in's veil is `position:fixed;inset:0;background:rgba(28,27,24,.12)` — the WHOLE
// page, the ringed element included; the ring and the card are painted over it. So the drawing
// washes the whole frame too. (An earlier pass cut a hole for the focus; that is not what the
// photograph shows, and side by side the brighter patch was the giveaway.)
const dimWash = (W, H) => `<rect x="0" y="0" width="${r1(W)}" height="${r1(H)}" fill="var(--ink)" opacity="0.12"/>`

// THE RING, at the burn-in's geometry — read from the SHARED module, never re-stated here: a 2px
// indigo stroke whose centreline sits `inset + stroke/2` out from the box (ringRect), with a 3px
// paper halo outside it (ringOuter's edge). `f` is in DRAWING units, so the page-pixel numbers are
// converted by S, the one ratio this drawing uses for everything.
//
// NO GLOW BAND (2026-08-30, rule 6 — the drawing was wrong, not the burn-in). The burn-in's second
// shadow is `0 0 16px rgba(ai,.30)`: a BLUR with no edge, and at that alpha it is barely visible in
// the photograph at all. The drawing rendered it as an 8px-wide flat stroke centred 11.5px out —
// a hard band whose outer edge reached 15.5px from the box. That band IS the "~12 page px" the beat
// cells measured against the burn-in's ~5, and on a thin target (a row title, an "added just now"
// stamp) it doubled the ring's apparent height. A mark the photograph does not show is a mark the
// mirror must not draw.
function ringSVG (f, S) {
  const box = { x: f.x / S, y: f.y / S, w: f.w / S, h: f.h / S }   // back to page px to ask the module
  const r = ringRect(box)
  const x = r.x * S; const y = r.y * S; const w = r.w * S; const h = r.h * S
  const rect = (grow, sw, stroke, extra) =>
    `<rect x="${r1(x - grow)}" y="${r1(y - grow)}" width="${r1(w + 2 * grow)}" height="${r1(h + 2 * grow)}" ` +
    `rx="${r1(OV.ringRad * S + grow)}" fill="none" stroke="var(--${stroke})" stroke-width="${r1(sw)}"${extra}/>`
  return rect((OV.ringStroke / 2 + OV.halo / 2) * S, OV.halo * S, 'paper', ' opacity="0.92"') +
    rect(0, OV.ringStroke * S, 'ai', '')
}

// THE TOUR CALLOUT, in SVG. renderOverlay's card — the same structure, the same wording, the same
// palette, and now the same GEOMETRY: a CARD.width card at scale S, its radius and padding, the
// 11/12.5/15px type, the 10px mono labels, the 12px notch. `u` is the card's own scale: 1 at the
// burn-in's true size, less only when the framed region cannot hold it (the owner takes a slightly
// small card over a clipped one).
function measureCard (spec, S, u) {
  const k = S * u
  const id = raw(spec.id) || 'R?'
  const cardW = OV.card * k
  const padX = OV.padX * k; const padY = OV.padY * k
  const fsId = OV.fsId * k
  const fsLine = OV.fsLine * k; const fsLab = OV.fsLab * k
  const chipW = id.length * fsId * 0.62 + 2 * OV.chipPadX * k + 2 * k
  const chipH = fsId * 1.2 + 2 * k + 2 * k
  const labW = 4 * fsLab * 0.62 + 4 * fsLab * 0.08 + fsLab * 0.6      // "WHEN" + its letter-spacing + a space
  // ONE SENTENCE (the human, 2026-08-30): the line THIS scene proves, wrapped by the SHARED rule the
  // burn-in asks too (calloutLines) — the WHOLE sentence, uncapped, so the drawn card shows exactly
  // the lines the burned one does. Character wrap is scale-invariant, so the page-pixel lines are the
  // drawing's lines. No title row, no second sentence — the card is the current small step.
  const lines = calloutLines(spec.text)
  const lh = fsLine * OV.lhLine
  const bodyH = Math.max(lines.length, 1) * lh
  const cardH = r1(padY + chipH + OV.tagGap * k + bodyH + padY)
  const draw = (x, y) => {
    const parts = []
    const tx = x + padX
    let cy = y + padY
    parts.push(`<rect x="${r1(tx)}" y="${r1(cy)}" width="${r1(chipW)}" height="${r1(chipH)}" rx="${r1(OV.chipRad * k)}" fill="none" stroke="var(--line2)" stroke-width="${r1(k)}"/>`)
    parts.push(svgText(tx + chipW / 2, cy + chipH / 2 + fsId * 0.36, fsId, 'ink-3', 'mono', say(id), ' text-anchor="middle" font-weight="600"'))
    cy += chipH + OV.tagGap * k
    const isThen = spec.label === 'Then'
    lines.forEach((ln, i) => {
      const base = cy + i * lh + fsLine * 0.95
      if (i === 0) {
        parts.push(svgText(tx, base, fsLab, isThen ? 'ai' : 'ink-3', 'mono', say(spec.label.toUpperCase()),
          ' font-weight="600" letter-spacing="' + r2(fsLab * 0.08) + '"'))
      }
      parts.push(svgText(tx + labW, base, fsLine, 'ink', 'sans', say(ln), ' font-weight="600"'))
      // the verdict rides the last line, exactly where the burn-in puts it — and only on the scene
      // that HAS a verdict (the beat at rest). It is the state at DERIVE time (viz-derive reads the
      // board's own derived status), never a status stored in the drawing: the live chip beside the
      // requirement is the authority, and the next pass redraws.
      if (spec.pass && isThen && i === lines.length - 1) {
        const endX = Math.min(tx + labW + ln.length * fsLine * 0.52 + fsLine * 0.4, x + cardW - padX - fsLine * 0.9)
        parts.push(checkMark(endX, base - fsLine * 0.26, fsLine * 0.9))
      }
    })
    return parts.join('')
  }
  return { cardW, cardH, k, draw }
}

// Place it the way renderOverlay places it — which since 2026-08-30 means ASKING the same rule
// rather than re-implementing it: calloutSpot (tools/overlay-geometry.mjs) names the side the
// burn-in chose for this target, and that side is tried FIRST here. The rest of the burn-in's order
// stays as the fallback, because the drawing carries one refusal the burn-in does not need: a
// candidate must also lie inside the camera's framed region, since that is all the beat cell shows.
//
// The one input that cannot match is the card's HEIGHT: the burn-in measures its own DOM card, the
// drawing estimates from its wrapped lines (and caps each section at two). Where the two heights
// disagree enough to change which candidate fits, the sides can still part — the honest fix for
// that is harvesting the burn-in's card rect, which is a change to what the run records.
function calloutSVG (spec, f, W, H, extra, region, S) {
  const reg = region || { x: 0, y: 0, w: W, h: H }
  const M = 2 * S
  const cx = f.x + f.w / 2
  const box = { x: f.x / S, y: f.y / S, w: f.w / S, h: f.h / S }   // page px, to ask the shared rule
  const ro = ringOuter(box)
  const ring = { x: ro.x * S, y: ro.y * S, w: ro.w * S, h: ro.h * S }
  const obst = [ring, ...(extra ? [extra] : [])]
  const place = (card, avoid) => {
    const reach = NOTCH_REACH * card.k
    const gap = reach                              // so the notch's tip lands on the ring
    const clampX = v => clamp(v, reg.x + M, Math.max(reg.x + M, reg.x + reg.w - card.cardW - M))
    const clampY = v => clamp(v, reg.y + M, Math.max(reg.y + M, reg.y + reg.h - card.cardH - M))
    const cands = [
      { side: 'below', x: clampX(cx - card.cardW / 2), y: ring.y + ring.h + gap },
      { side: 'above', x: clampX(cx - card.cardW / 2), y: ring.y - gap - card.cardH },
      { side: 'right', x: ring.x + ring.w + gap, y: clampY(f.y - CARD.sideNudge * S) },
      { side: 'left', x: ring.x - gap - card.cardW, y: clampY(f.y - CARD.sideNudge * S) }
    ]
    // the burn-in's own answer, first in the queue — 'leftof' is what it calls this drawing's 'left'
    const want = calloutSpot({ box, vw: W / S, vh: H / S, cw: OV.card, ch: card.cardH / S }).side
    const first = want === 'leftof' ? 'left' : want
    cands.sort((a, b) => (a.side === first ? 0 : 1) - (b.side === first ? 0 : 1))
    // the notch's own reach beyond the card edge, so the arrow is never the part that gets cut
    const withNotch = c => {
      const b = { x: c.x, y: c.y, w: card.cardW, h: card.cardH }
      if (c.side === 'below') return { x: b.x, y: b.y - reach, w: b.w, h: b.h + reach }
      if (c.side === 'above') return { x: b.x, y: b.y, w: b.w, h: b.h + reach }
      if (c.side === 'right') return { x: b.x - reach, y: b.y, w: b.w + reach, h: b.h }
      return { x: b.x, y: b.y, w: b.w + reach, h: b.h }
    }
    const covers = c => avoid.some(o => !(c.x + card.cardW <= o.x || c.x >= o.x + o.w ||
      c.y + card.cardH <= o.y || c.y >= o.y + o.h))
    return cands.find(c => insideRegion(withNotch(c), reg) && !covers(c)) || null
  }
  // the burn-in's true size first; only a region that cannot hold it shrinks the card, and then
  // only as far as it must (the owner takes a small card over a clipped one)
  const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35]
  let card = null; let hit = null
  for (const avoid of [obst, [ring]]) {           // the value yields before the ring ever does
    for (const u of scales) {
      const c = measureCard(spec, S, u)
      if (c.cardW > reg.w - 2 * M || c.cardH > reg.h - 2 * M) continue
      const p = place(c, avoid)
      if (p) { card = c; hit = p; break }
    }
    if (hit) break
  }
  let side = hit ? hit.side : 'none'
  if (!hit) {
    // the region cannot hold a clean placement at any size: take the smallest card, clamp it INSIDE
    // the region and drop the notch. Overlapping is bad; being cut off the cell is worse, because a
    // reader cannot even tell what they are missing.
    card = measureCard(spec, S, scales[scales.length - 1])
    hit = {
      x: clamp(cx - card.cardW / 2, reg.x + M, Math.max(reg.x + M, reg.x + reg.w - card.cardW - M)),
      y: clamp(ring.y + ring.h + NOTCH_REACH * card.k, reg.y + M, Math.max(reg.y + M, reg.y + reg.h - card.cardH - M))
    }
  }
  const cardW = card.cardW; const cardH = card.cardH
  const reach = NOTCH_REACH * card.k
  const x = r1(hit.x); const y = r1(hit.y)
  const rad = r1(OV.rad * card.k)
  const parts = []
  // the soft drop the burn-in casts (0 10px 30px rgba(28,27,24,.24)) — one offset plate, no filter
  parts.push(`<rect x="${x}" y="${r1(y + OV.shadowY * card.k)}" width="${r1(cardW)}" height="${cardH}" rx="${rad}" fill="var(--ink)" opacity="0.1"/>`)
  parts.push(`<rect x="${x}" y="${y}" width="${r1(cardW)}" height="${cardH}" rx="${rad}" fill="var(--paper)" stroke="var(--line2)" stroke-width="${r1(card.k)}"/>`)
  // the notch: the triangle a 12px square rotated 45° shows, its base sitting ON the card's border
  // so the two read as one object and the border under the base is covered
  if (side !== 'none') {
    const tri = (tipX, tipY, aX, aY, bX, bY) =>
      `<path d="M${r1(aX)} ${r1(aY)} L${r1(tipX)} ${r1(tipY)} L${r1(bX)} ${r1(bY)} Z" fill="var(--paper)"/>` +
      `<path d="M${r1(aX)} ${r1(aY)} L${r1(tipX)} ${r1(tipY)} L${r1(bX)} ${r1(bY)}" fill="none" stroke="var(--line2)" stroke-width="${r1(card.k)}" stroke-linejoin="round"/>`
    if (side === 'below' || side === 'above') {
      const tipX = clamp(cx, x + reach + card.k, x + cardW - reach - card.k)
      const edge = side === 'below' ? y + card.k / 2 : y + cardH - card.k / 2
      const tipY = side === 'below' ? y - reach : y + cardH + reach
      parts.push(tri(tipX, tipY, tipX - reach, edge, tipX + reach, edge))
    } else {
      const tipY = clamp(f.y + f.h / 2, y + reach + card.k, y + cardH - reach - card.k)
      const edge = side === 'right' ? x + card.k / 2 : x + cardW - card.k / 2
      const tipX = side === 'right' ? x - reach : x + cardW + reach
      parts.push(tri(tipX, tipY, edge, tipY - reach, edge, tipY + reach))
    }
  }
  parts.push(card.draw(x, y))
  return { svg: parts.join(''), box: { x, y, w: cardW, h: cardH }, side }
}

// The first literal a beat's own words QUOTE — "Water the plants" out of `you type "Water the
// plants" and press Add`. Straight or curly quotes; the When first, because a beat's quoted string
// is almost always the thing it types or picks. Only ever used where nothing was measured.
const QUOTED = /["“]([^"”]{1,48})["”]/
function quotedIn (callout) {
  for (const s of [callout && callout.when, callout && callout.then]) {
    const m = QUOTED.exec(raw(s))
    if (m && raw(m[1])) return raw(m[1])
  }
  return ''
}
// ── ONE READING OF A SKELETON, SHARED BY THE DRAWING AND ITS GUARD ────────────────────────────
// (2026-09-02, the human: "make sure the gap between schematic and proof will not exist again")
// Everything a frame decides BEFORE it draws anything — which boxes hold words, which are COMPOSED
// of their children, which are ghosted into the frame one moment earlier, which box is ringed, and
// which one the overlay will type — is read HERE, once. frameBody draws from this reading and
// mirrorGaps checks the drawing against the SAME reading; a guard that re-stated these rules would
// drift from the renderer it guards, which is the one defect this pass exists to make impossible.
function mirrorRead (L, S, withFocus, anchors) {
  const px = v => r1(v * S)
  // A BOX THAT HOLDS WORDS IS NOT EMPTY (2026-09-02, the lead's visual review): a <button> whose
  // label is a child leaf carries no text of its own, and the kit drew its "no measured text"
  // placeholder bar straight across the words the leaf then typed on top. So a box is "wordless" only
  // when NO text-bearing element nests inside it — then, and only then, a bar stands in.
  const worded = L.els.filter(e => raw(e.text))
  const holdsWords = e => worded.some(t => nestsIn(t, e))
  const holdsAny = e => L.els.some(t => nestsIn(t, e))
  // …and whether the control already carries THE APP'S OWN PICTURE (mirror-11): a check box whose
  // tick the app draws as an inline svg inside it holds a readable icon, and the house mark over it
  // would be a second ✓ on one box. The app's own always wins — it is the thing the photograph shows.
  const holdsIcon = e => L.els.some(t => t !== e && t.icon && nestsIn(t, e))
  // …and the same question decides whether a box may be SUMMARISED by one drawn value (mirror-9).
  // The capture gives a focused element its whole innerText, so a ringed ROW comes back carrying
  // "Water the plants added just now" — which is precisely what its two child leaves already say,
  // each in its own place, at its own size. A box whose words are exactly what its children spell
  // out is COMPOSED: draw the children, never the concatenation over them. A box that carries words
  // of its own beyond them (a counter reading "3 to do" around a styled "3" span) is not, and there
  // the single value is the honest reading — the children it covers stand down for it.
  const norm = t => raw(t).replace(/\s+/g, ' ').toLowerCase()
  // …measured against the LEAVES only: the capture gives every focused ancestor the same innerText,
  // so a row, the wrapper inside it and the body inside that all say "Water the plants added just
  // now", and counting the wrappers as words made the row look like it carried more than its
  // children do. Only a box that holds no text-bearing box of its own is a word.
  const composed = e => {
    const c = worded.filter(t => nestsIn(t, e) && !holdsWords(t)).map(t => raw(t.text)).join(' ')
    return !!c && norm(c) === norm(e.text)
  }
  const focus = []
  // the before frame's ghosts: for each of the after frame's anchor boxes, THIS layout's element in
  // the same place. Matched up front so the main pass can skip drawing their small label — the
  // pill below says it at a size a reader can actually read.
  //
  // …and only for a LEAF anchor (mirror-9): where the beat rings a whole ROW, its "value" is the
  // concatenation of everything inside it, and a ghost of that is the same unreadable line. The
  // before frame then simply draws the layout as measured, which is the honest picture of what the
  // page looked like one moment earlier.
  const ghosts = []
  for (const a of (withFocus ? [] : (anchors || []))) {
    let best = null; let bestOv = 0
    for (const e of L.els) {
      const ox = Math.max(0, Math.min(e.x + e.w, a.x + a.w) - Math.max(e.x, a.x))
      const oy = Math.max(0, Math.min(e.y + e.h, a.y + a.h) - Math.max(e.y, a.y))
      const ov = (ox * oy) / Math.max(1, Math.max(e.w * e.h, a.w * a.h))
      if (ov > bestOv) { bestOv = ov; best = e }
    }
    if (best && bestOv >= 0.4 && best.text && !composed(best) && !ghosts.some(g => g.el === best)) ghosts.push({ a, el: best })
  }
  const ghosted = new Set(ghosts.map(g => g.el))
  // …and whatever nests inside one: the same twin the ringed frames drop (a counter's digit span),
  // which otherwise leaves a stray bar sitting behind the value the ghost just drew
  for (const e of L.els) {
    for (const g of ghosts) {
      if (e !== g.el && e.x >= g.el.x - 0.6 && e.y >= g.el.y - 0.6 &&
        e.x + e.w <= g.el.x + g.el.w + 0.6 && e.y + e.h <= g.el.y + g.el.h + 0.6) ghosted.add(e)
    }
  }
  const els = L.els.slice().sort((a, b) => (b.w * b.h) - (a.w * a.h))
  // THE RINGED MARKS, PICKED BEFORE ANYTHING IS DRAWN (mirror-9). The overlay pass used to pick them
  // afterwards, and the main loop `continue`d past every focus element to avoid drawing the value
  // twice — which is why a ringed ROW lost its tick box, its title, its stamp and its chevron and
  // became one mono line. Now every element is drawn, ringed or not, and only the ONE box whose
  // value the overlay will type (a leaf) withholds its own text.
  const ringPx = L.ring
    ? { x: px(L.ring.x), y: px(L.ring.y), w: px(L.ring.w), h: px(L.ring.h) }
    : null
  for (const e of els) {
    if (ghosted.has(e) || !e.focus) continue
    const x = px(e.x); const y = px(e.y); const w = px(e.w); const h = px(e.h)
    if (w < 4 || h < 2.5) continue
    focus.push({
      x,
      y,
      w,
      h,
      text: e.text,
      fs: e.fs ? px(e.fs) : null,
      ta: e.ta,
      pl: px(e.pl || 0),
      pr: px(e.pr || 0),
      ff: e.ff,
      fg: e.fg,
      leaf: !composed(e),
      el: e
    })
  }
  const marks = withFocus
    ? pickFocus(focus.length ? focus : (ringPx ? [{ ...ringPx, text: '', leaf: true }] : []), ringPx)
    : []
  // the boxes whose text the overlay will type at a size a person can read — and, with them, the
  // children that value already covers, so no word is ever drawn twice
  const valued = new Set()
  for (const m of marks) {
    if (!m.leaf || !m.el) continue
    valued.add(m.el)
    for (const t of L.els) if (nestsIn(t, m.el)) valued.add(t)
  }
  // ── THE INTENT ON A FAILED SCENE (mirror-12, 2026-09-02) ──────────────────────────────────────
  // The human, on Tsumiki's R9 — the demo's deliberately failing requirement: "for the failed test
  // case, schematic should be correct (schematic and behaviour are truth — otherwise user should
  // disagree this truth and update it). But now even the schematic is wrong as well, please update."
  // The mirror drew the ringed element's MEASURED text on every scene, so a beat that expected 5 and
  // read 4 drew 4 — two pictures of the same wrong number, and nothing on the row saying what the
  // requirement asks for. They are not two copies of one fact: the DRAWING is the authored intent,
  // the PHOTOGRAPH is what the app did, and the row is the comparison. So where this scene's claim
  // failed, the ringed value is drawn as the EXPECTED one — in the same asserted ink as any measured
  // value (an intent that looked like a second kind of mark would just be new chrome), with the
  // callout untouched: the "got 4 ✕" belongs to the burn-in and stays there.
  //
  // Applied HERE so the guard cannot disagree with the renderer — mirrorGaps reads this same
  // substitution and therefore owes a "5" on that element and never a "4". The substituted text is
  // written onto the element itself (frameBody types e.text for everything it draws), which is
  // idempotent: a second reading of the same layout replaces expected with expected.
  const intent = L.claim && L.claim.ok === false && L.claim.expected ? L.claim : null
  if (intent) {
    const swap = new Set()
    // …never an element intendedLayout already typed for an EARLIER claim of the same beat: each
    // intended value stays its own (mirror-13)
    for (const m of marks) if (m.el && !(m.el.intended && raw(m.el.text) !== intent.expected)) swap.add(m.el)
    // …and any other FOCUS leaf reading exactly what the page gave: the same value in a second place
    // (a counter and its own digit span) is the same wrong number twice. Only inside the ring —
    // an unrelated "4" elsewhere on the screen is not this beat's claim.
    if (intent.got) for (const f of focus) if (f.el && f.leaf && !f.el.intended && raw(f.el.text) === intent.got) swap.add(f.el)
    for (const e of swap) { e.text = intent.expected; e.intended = true }
    for (const f of focus) if (swap.has(f.el)) { f.text = intent.expected; f.intended = true }
    for (const m of marks) if (swap.has(m.el)) { m.text = intent.expected; m.intended = true }
  }
  return { holdsWords, holdsAny, holdsIcon, composed, ghosts, ghosted, els, ringPx, marks, valued }
}


// ONE frame of the mirror: every captured box in house shapes, biggest first so the page chrome
// sits behind the rows and the words sit on top. `withFocus` adds the burn-in's own overlay — the
// dim, the ring, the value pill and (when `callout` carries the beat) the tour card. The GIVEN
// frame has none of it, because the given proof frame has none of it either: nothing was being
// asserted yet. It is handed `anchors` (the first beat's focus boxes, in page coordinates) instead,
// so it can show the SAME place's earlier value. `cam` is the rect the board's cell will aim its
// camera at — the beat's RING, which is what the reporter stores as the focus rect
// (tools/evidence.mjs focusFromLayout) and therefore what the crop is centred on. It is NOT always
// the element the drawing rings: a row-wide ring around a value cell frames the row.
function frameBody (L, S, W, H, withFocus, anchors = null, callout = null, cam = null, cardBox = null) {
  const px = v => r1(v * S)
  // what the board's cell will frame: its camera is aimed at the beat's ring, so the drawing has to
  // fit its overlay inside THAT crop, not one centred on whichever element it ends up ringing
  const camPx = cam && cam.w > 0 && cam.h > 0
    ? { x: px(cam.x), y: px(cam.y), w: px(cam.w), h: px(cam.h) }
    : null
  // …and this scene's callout CARD, in drawing units — the region must contain it too (the human,
  // 2026-08-30), so a card hanging below or above its ring is framed with it instead of clipped.
  const cardPx = cardBox && cardBox.w > 0 && cardBox.h > 0
    ? { x: px(cardBox.x), y: px(cardBox.y), w: px(cardBox.w), h: px(cardBox.h) }
    : null
  const parts = []
  const { holdsWords, holdsAny, holdsIcon, ghosts, ghosted, els, ringPx, marks, valued } = mirrorRead(L, S, withFocus, anchors)
  for (const e of els) {
    if (ghosted.has(e)) continue
    const x = px(e.x); const y = px(e.y); const w = px(e.w); const h = px(e.h)
    if (w < 4 || h < 2.5) continue                    // below this a shape is a smudge, not a box
    // the ringed element is drawn by the focus pass below, at a size a person can actually read —
    // drawing its label here too would stack two copies of the same value on one another
    // the measured type rides with the box, in DRAWING units like everything else, so valueMark can
    // put the value where the page puts it instead of guessing from the box
    // THE PAGE'S OWN TYPE where the harvest measured it (2026-09-02: a mirror, not a skeleton). Real
    // text at the size, weight and alignment the app renders — the fidelity gain the human asked for.
    // The measured font size (converted by the one scale S) is used wherever it was captured; absent
    // it, the size still derives from the box, exactly as the old skeleton did. A placeholder bar is
    // drawn ONLY when there is genuinely no measured text, or it is too small to read at this scale.
    const mfs = e.fs ? px(e.fs) : null
    // WHAT THE PAGE SHOWS (mirror-9): a label the app renders uppercase is drawn uppercase — the
    // mirror's job is to look like the screen, and text-transform is the difference between a
    // section header and a sentence.
    const label = e.tt === 'u' ? raw(e.text).toUpperCase() : raw(e.text)
    const pl = px(e.pl || 0); const pr = px(e.pr || 0)
    const tfs = mfs || clamp(h * 0.62, 5, 16)
    // …and the family the page renders it in, sans unless the harvest measured a typewriter face.
    // (Before mirror-9 a field's value was ALWAYS mono, which is the one thing the photograph never
    // shows.) Absent — an older skeleton — sans, which is what most of a real screen is set in.
    const fam = e.ff || 'sans'
    // the ONE box the overlay will type at a readable size: it withholds its own words so the two
    // are never stacked on one another
    const mine = !valued.has(e)
    // READABLE DOWN TO 4 INTERNAL UNITS (2026-09-02, rule 6 — the old 5.5 floor WAS the "skeleton"
    // the human complained about). The drawing is 600 units wide and the pane scales it up, so 4 is
    // the same floor valueMark has always trusted for the asserted value. At 5.5, every 13px label on
    // a 1440px page fell back to a grey bar — which is most of a real screen's words.
    // …and a box never types the words its children are already typing (mirror-9): the capture hands a
    // focused wrapper its whole innerText, and drawing that over the leaves inside it is the "totally
    // unacceptable" line the human saw.
    const readable = !!label && tfs >= 4 && mine && !holdsWords(e)
    // A SMALL WORDLESS CONTROL IS ITS PLATE ALONE (mirror-9, the human: "even missing tickbox").
    // Tsumiki's tick box is a 21×21 <button> with no text and no child; the "no measured text" bar
    // drawn inside it read as a dot in a circle rather than the box it is. Measured in PAGE pixels,
    // because it is a fact about the control, not about how far this drawing is scaled.
    const barOK = mine && !holdsWords(e) && e.w >= 40 && e.h >= 14
    const mid = y + h / 2
    // THE PAGE'S OWN PAINT (mirror-8, 2026-09-02), where the harvest measured it: the fill, the
    // border and the text colour as their nearest DYES (normLayout already mapped them through
    // dyeOf, so nothing raw can reach here), the box's own corner radius, its weight, its strike and
    // its opacity. Every one is optional — absent, each falls back to the house default below, so a
    // skeleton folded before this pass still draws exactly the grey mirror it always did.
    const tok = (t, fallback) => (t ? `var(--${t})` : fallback)
    const rx = e.rd ? r1(clamp(px(e.rd), 0, Math.min(w, h) / 2)) : null
    const plate = (dFill, dStroke, dRx, sw) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx == null ? dRx : rx}" fill="${dFill}"` +
      (dStroke ? ` stroke="${dStroke}" stroke-width="${sw}"` : '') + '/>'
    // the rule a line-through wears, over the words themselves: fitText's own 0.55em measure and the
    // element's own alignment, so the strike lands on the text rather than across the whole box
    const strike = (fs, ink) => {
      const room = Math.max(1, w - pl - pr)
      const lw = Math.min(room, fitText(label, room, fs).length * fs * 0.55)
      const sx = e.ta === 'c' ? x + w / 2 - lw / 2 : e.ta === 'r' ? x + w - pr - lw : x + pl
      const sy = r1(y + h / 2)
      return `<line x1="${r1(sx)}" y1="${sy}" x2="${r1(sx + lw)}" y2="${sy}" ` +
        `stroke="var(--${ink})" stroke-width="${r1(Math.max(0.5, fs * 0.09))}"/>`
    }
    const weight = bold => ((bold ? ' font-weight="600"' : '') + (e.it ? ' font-style="italic"' : ''))
    const piece = []
    switch (e.kind) {
      case 'heading': {
        if (e.bg || e.bd) piece.push(plate(tok(e.bg, 'none'), tok(e.bd, null), 3, 0.9))
        const ink = e.fg || 'ink'
        const fs = Math.min(tfs, h)
        piece.push(readable
          ? textIn(x, y, w, h, fs, ink, fam, label, e.ta, pl, pr, weight(true))
          : barOK ? bar(x, r1(mid - h * 0.22), w, r1(clamp(h * 0.44, 2.5, 9)), 'var(--line2)') : '')
        if (readable && e.td) piece.push(strike(fs, ink))
        break
      }
      case 'text': {
        if (e.bg || e.bd) piece.push(plate(tok(e.bg, 'none'), tok(e.bd, null), 3, 0.9))
        const ink = e.fg || 'ink-3'
        const fs = Math.min(tfs, h)
        piece.push(readable
          ? textIn(x, y, w, h, fs, ink, fam, label, e.ta, pl, pr, weight(e.fw))
          : barOK ? bar(x, r1(mid - clamp(h * 0.3, 1.5, 3.5)), w, r1(clamp(h * 0.4, 2.5, 7)), 'var(--wash)') : '')
        if (readable && e.td) piece.push(strike(fs, ink))
        break
      }
      case 'input':
        // the field — paper, the AI hairline — then its measured VALUE inside it at the type and inset
        // the page gives it (mono, the typed-value convention valueMark uses); the placeholder bar of
        // an empty field only when the harvest read no value there.
        piece.push(plate(tok(e.bg, 'var(--paper)'), tok(e.bd, 'var(--ai-line)'), 3, 1))
        if (readable) {
          piece.push(textIn(x, y, w, h, Math.min(tfs, h * 0.82), e.ph ? 'ink-4' : (e.fg || 'ink-3'), fam, label, e.ta || 'l', pl || 4, pr || 4, weight(e.fw)))
        } else if (w > 16 && h > 8 && barOK) {
          piece.push(bar(r1(x + 4), r1(mid - 2), r1(Math.min(w - 8, w * 0.5)), 4, 'var(--line2)'))
        }
        break
      case 'button':
        // a button the page PAINTS keeps its own paint — the flat --wash plate was the reason every
        // primary action on the board's mirrors read as a disabled one.
        // …AND A BUTTON THE PAGE PAINTS NOTHING ON IS ITS ICON, NOTHING ELSE (mirror-10, the human:
        // "a weird extra circle on each row's right side"). A row's chevron is a 28×28 <button> with
        // background:none and no border, carrying one 24-unit svg; inventing a filled rounded plate
        // under it puts a component on the drawing the screen does not have — exactly the stand-down
        // the tick box already makes. A button with a word of its own, or a worded child, still gets
        // its plate: that is a control a reader has to see the edge of.
        if (e.bg || e.bd || label || holdsWords(e)) {
          piece.push(plate(tok(e.bg, 'var(--wash)'), tok(e.bd, 'var(--line2)'), r1(Math.min(h / 2, 7)), 0.9))
        }
        piece.push(readable
          ? textIn(x, y, w, h, Math.min(tfs, h * 0.72), e.fg || 'ink-3', fam, label, 'c', 3, 3, weight(e.fw))
          : barOK ? bar(r1(x + w * 0.2), r1(mid - 2), r1(w * 0.6), 4, 'var(--line3)') : '')
        break
      case 'check': {
        // A TICK IS A STATE, NOT A BOX (mirror-8): the old kit filed a checkbox under `input` and drew
        // a field, so a done row and an open one were the same picture — the single most common thing
        // a to-do screen's beats prove. Square, at the element's own radius; ticked = a moss fill with
        // the drawn mark ON it (never --ok on --koke, which is the same dye twice).
        const s = Math.min(w, h)
        const cx = x + (w - s) / 2; const cy = y + (h - s) / 2
        const crx = r1(Math.min(rx == null ? 2 : rx, s / 2))
        const sq = (fill, stroke) =>
          `<rect x="${r1(cx)}" y="${r1(cy)}" width="${r1(s)}" height="${r1(s)}" rx="${crx}" fill="${fill}"` +
          (stroke ? ` stroke="${stroke}" stroke-width="1"` : '') + '/>'
        if (e.on) {
          piece.push(sq(tok(e.bg, 'var(--koke)'), null))
          // A TICK YOU CAN SEE (mirror-11, the lead's review of the re-harvested demo). The verdict
          // mark's own weight (checkMark: markSize × 0.2) put a 0.8-unit hairline on the 7.5-unit
          // square an 18px page box draws — at the sizes the storyline shows, a solid dark square
          // with nothing on it, where the photograph shows a clear white tick. So the tick inside a
          // filled box is drawn in the BOX's terms: at least 1.6 drawing units, or 16% of the side,
          // spanning 24% → 46% → 76% of it. …unless the APP draws its own tick as an svg inside the
          // control, in which case that icon is the tick and this one would be the second.
          if (!holdsIcon(e)) {
            const tw = r1(Math.max(1.6, s * 0.16))
            piece.push(`<path d="M${r1(cx + s * 0.24)} ${r1(cy + s * 0.52)}L${r1(cx + s * 0.46)} ` +
              `${r1(cy + s * 0.72)}L${r1(cx + s * 0.76)} ${r1(cy + s * 0.3)}" fill="none" ` +
              `stroke="var(--paper)" stroke-width="${tw}" stroke-linecap="round" stroke-linejoin="round"/>`)
          }
        } else if (e.bg || e.bd || !holdsAny(e)) {
          piece.push(sq(tok(e.bg, 'var(--paper)'), tok(e.bd, 'var(--line2)')))
        }
        // …and a wordless square control the page paints NOTHING on, that holds an icon (a chevron,
        // a kebab), is that icon and nothing else (mirror-9): inventing a paper box with a border
        // around it puts a component on the drawing the screen does not have.
        break
      }
      case 'image':
        // AN ICON IS ITS OWN LINES (mirror-10): a small inline svg whose shapes the harvest could
        // read is drawn as those shapes, in its own viewBox units, with NO wash plate behind it —
        // the plate plus the button's was the "extra circle" the human saw. Everything else — a
        // raster <img>, a canvas, an illustration too big or too complex to read — keeps the plate,
        // which is the honest picture of "something is shown here".
        piece.push(e.icon
          ? iconSVG(e.icon, { x, y, w, h })
          : plate(tok(e.bg, 'var(--wash)'), tok(e.bd, 'var(--hair)'), 3, 0.8))
        break
      case 'row':
        piece.push(plate(tok(e.bg, 'var(--paper)'), tok(e.bd, 'var(--line)'), 3, 0.9))
        break
      default:
        // a container earns a hairline only when it is a real region — and never when it is the
        // page shell itself, which the frame beneath already draws
        if (w >= 30 && h >= 18 && (w * h) < 0.8 * W * H) {
          piece.push(plate(tok(e.bg, 'none'), tok(e.bd, 'var(--hair)'), 4, 0.8))
        }
    }
    if (!piece.length) continue
    // …and the element's own transparency. A disabled control is drawn at half, exactly as the page
    // draws it — the state has to be VISIBLE in the mirror or a beat proving it has no picture.
    const dim = e.dis ? 0.5 : null
    const o = e.op != null ? (dim != null ? Math.min(e.op, dim) : e.op) : dim
    parts.push(o != null ? `<g opacity="${r2(o)}">${piece.join('')}</g>` : piece.join(''))
  }
  if (withFocus) {
    // `marks` was picked above, before anything was drawn. Nothing matched the ring (a canvas cell, a
    // shadow root, an element that moved)? Then it is the MEASURED box, so the drawing still points
    // at what the assertion read.
    if (marks.length) {
      // the veil, exactly as the burn-in paints it: the WHOLE frame, the proven element included.
      // The ring and the card go over it, which is what distinguishes the element — not a hole.
      parts.push(dimWash(W, H))
      // THE CAMERA'S FRAMED REGION (2026-08-28): the beat cell shows only this much of the drawing,
      // so every mark of the overlay — the value and the card both — has to land inside it or it is
      // simply cut off screen. The BEAT's rect sets the zoom and THIS SCENE's own ring sets the aim
      // (2026-08-31), exactly as the board aims the cell beside it.
      const region = framedRegion(camPx || marks[0], W, H, { aim: ringPx || marks[0], card: cardPx })
      const pills = []
      // …and where the capture measured NO text on the ringed element (a box whose value the
      // skeleton could not reach, an element that carries its value in an attribute), the
      // requirement's OWN quoted words stand in — its When names the string in so many letters, and
      // this is the authored side of the row. Quiet ink, never the asserted ink, so a drawn value
      // that was read off the page and one that was read off the prd never look alike (2026-08-29).
      const spoken = quotedIn(callout)
      for (const f of marks) {
        parts.push(ringSVG(f, S))
        // THE POINT of the mirror: the asserted value, in the app's own words — inside the ringed
        // box, where the page itself draws it; a pill beside it only when it cannot go there
        const measured = raw(f.text)
        // …ONLY WHERE THE RINGED BOX IS A LEAF (mirror-9). A row, a card, a whole panel carries the
        // concatenation of everything inside it — "Water the plants added just now" — and typing
        // that over the children that are now drawn properly is the defect, not the fix. Its parts
        // already say it, each in its own place.
        const val = f.leaf
          ? valueMark(f, measured || (f === marks[0] ? spoken : ''), W, H, !!measured, region)
          : { svg: '', box: null }
        if (val.svg) { parts.push(val.svg); if (val.box) pills.push(val.box) }
      }
      // …and the requirement's own words, in the burn-in's card, beside the primary mark
      if (callout && callout.text) {
        parts.push(calloutSVG(callout, marks[0], W, H, pills[0] || null, region, S).svg)
      }
    }
  } else {
    // the BEFORE frame draws its ghosts: the same places, one moment earlier. That is what makes the
    // frames read as a CHANGE — "2 to do" becoming "3 to do" — instead of near-identical pictures.
    for (const g of ghosts) {
      // the given cell aims its camera at the SAME rect the first beat rings, so the ghost obeys
      // the same framed region — a before-value cut off the cell would be no better than a cut card
      // the ghost carries the GHOSTED ELEMENT's own type — it is that element's text being drawn,
      // in the anchor's place, so it must read at the size and alignment the page gives it there
      const box = {
        x: px(g.a.x),
        y: px(g.a.y),
        w: px(g.a.w),
        h: px(g.a.h),
        fs: g.el.fs ? px(g.el.fs) : null,
        ta: g.el.ta,
        pl: px(g.el.pl || 0),
        pr: px(g.el.pr || 0),
        ff: g.el.ff
      }
      parts.push(valueMark(box, g.el.text, W, H, false, framedRegion(camPx || box, W, H)).svg)
    }
  }
  return parts.join('')
}

// ── THE GUARD: WHAT THE MIRROR MEASURED, IT MUST DRAW ───────────────────────────────────────────
// The human, 2026-09-02, after two rounds of the same defect ("schematic still looks like skeleton",
// "totally unacceptable"): "make sure the gap between schematic and proof will not exist again."
//
// A renderer cannot be trusted to report its own omissions — both times the kit had quietly stopped
// drawing something the harvest had measured (the tick box, the row's own leaves) and nothing said
// so until a person looked at a beat row. So the drawn FRAME is read back and checked against the
// same reading of the skeleton it was drawn from (mirrorRead — one authority, never a second copy
// of the rules). Four gaps, each derived at derive/gate time, none ever stored:
//
//   · missing-text  a measured word, big enough for the kit to type, that no <text> types
//   · missing-box   a measured plate (a field, a button, a row, a tick box, a painted box, a real
//                   region) with no rect at its place
//   · hidden-drawn  a box the page had faded to nothing that the frame painted anyway
//   · ring-missing  a ringed scene with no indigo ring around what the assertion pointed at
//
// What the kit DELIBERATELY does not draw is not a gap, and the guard asks mirrorRead rather than
// guessing: a shape below the 4×2.5 floor, a wrapper whose words its own leaves type, the children
// the overlay's one value covers, a box the before frame ghosts. Boxes come back in PAGE units —
// the harvest's own — so a gap can be found on the real screen.
const TEXT_KINDS = new Set(['heading', 'text', 'input', 'button'])
const NEAR = 0.6                              // the ONE tolerance: "this plate is here", in drawing units
const attrIn = (tag, n) => {
  const m = new RegExp('[\\s]' + n + '="([^"]*)"').exec(tag)
  return m ? m[1] : null
}
const drawnTexts = svg => [...String(svg).matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)]
  .map(m => ({ x: Number(attrIn(m[1], 'x')), y: Number(attrIn(m[1], 'y')), txt: m[2] }))
// AN ICON'S OWN SHAPES ARE NOT THE FRAME'S PLATES (mirror-10). The shapes inside a scaled icon
// group are in that icon's viewBox units, not the drawing's, so a <rect> of a 24-unit chevron box
// must never be read as a plate standing at drawing coordinates — nor its absence as a gap. The
// groups are lifted out first; what is left is the frame the plate/word rules are asked about.
const ICON_G = /<g transform="translate\([^"]*\) scale\([^"]*\)"[^>]*>[\s\S]*?<\/g>/g
const drawnIcons = svg => [...String(svg).matchAll(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\((-?[\d.]+) (-?[\d.]+)\)"[^>]*>([\s\S]*?)<\/g>/g)]
  .map(m => ({
    tx: Number(m[1]),
    ty: Number(m[2]),
    sx: Number(m[3]),
    sy: Number(m[4]),
    n: (m[5].match(/<(?:path|circle|line|rect|polyline|polygon)\b/g) || []).length
  }))
const drawnRects = svg => [...String(svg).matchAll(/<rect\b([^>]*?)\/>/g)].map(m => ({
  x: Number(attrIn(m[1], 'x')),
  y: Number(attrIn(m[1], 'y')),
  w: Number(attrIn(m[1], 'width')),
  h: Number(attrIn(m[1], 'height')),
  stroke: attrIn(m[1], 'stroke')
}))
// WHICH BOXES THE KIT PROMISES A PLATE FOR — frameBody's own switch, read as a question. A field, a
// button, a row and an image always get one; a tick box gets its square unless the page paints
// nothing on it and it is only holding an icon; a heading or a line of text only where the page
// paints it; a container only where it is a real region and not the page shell itself.
const platePromised = (e, box, W, H, holdsAny, holdsWords) => {
  if (e.kind === 'input' || e.kind === 'row') return true
  // mirror-10: an image the kit draws as an ICON promises no rect at all (it is checked separately,
  // as its own group), and a wordless button the page paints nothing on promises nothing either
  if (e.kind === 'image') return !e.icon
  if (e.kind === 'button') return !!(e.bg || e.bd || raw(e.text) || holdsWords(e))
  if (e.kind === 'check') return !!(e.on || e.bg || e.bd || !holdsAny(e))
  if (e.kind === 'heading' || e.kind === 'text') return !!(e.bg || e.bd)
  return box.w >= 30 && box.h >= 18 && (box.w * box.h) < 0.8 * W * H
}
export function mirrorGaps (layout, frame, opts = {}) {
  const L = normLayout(layout)
  const svg = String(frame == null ? '' : frame)
  if (!L || !L.els.length) return []
  const S = LAYOUT_W / L.w
  const W = LAYOUT_W
  const H = opts.h > 0 ? opts.h : Math.round(clamp(LAYOUT_W * (L.h / L.w), 180, 900))
  // a ringed scene is one the burn-in's veil is painted on; the caller says so where it knows
  const withFocus = opts.focus != null ? !!opts.focus : /fill="var\(--ink\)" opacity="0\.12"/.test(svg)
  const { holdsWords, holdsAny, ghosted, els, marks, valued } = mirrorRead(L, S, withFocus, opts.anchors || null)
  const px = v => r1(v * S)
  const plain = svg.replace(ICON_G, '')      // the frame WITHOUT its icons' own local geometry
  const texts = drawnTexts(plain)
  const rects = drawnRects(plain)
  const icons = drawnIcons(svg)
  const used = new Set()
  const gaps = []
  const at = (kind, what, e) => gaps.push({ kind, what, x: r1(e.x), y: r1(e.y), w: r1(e.w), h: r1(e.h) })
  const near = (a, b) => Math.abs(a - b) <= NEAR
  const hereIs = (b, rc) => near(rc.x, b.x) && near(rc.y, b.y) && near(rc.w, b.w) && near(rc.h, b.h)
  // the words as the kit would type them (say/fitText — the renderer's own functions, never a second
  // normalisation): an exact match, or the squeezed-and-cut form, which is a prefix plus an ellipsis
  const saysIt = (t, want) => t.txt === want || (t.txt.endsWith('…') && want.startsWith(t.txt.slice(0, -1)))
  const typed = (want, box) => {
    const i = texts.findIndex((t, k) => !used.has(k) && saysIt(t, want) &&
      (!box || (t.x >= box.x - 1 && t.x <= box.x + box.w + 1 && t.y >= box.y - 1 && t.y <= box.y + box.h + 1)))
    if (i < 0) return false
    used.add(i)                                 // two rows saying the same thing need two <text>s
    return true
  }
  const quote = s => '“' + raw(s).slice(0, 40) + '”'
  // the ONE box whose value the overlay types at a readable size — its own words are drawn by
  // valueMark, wherever that lands them (inside the ring, or a pill beside it)
  const spoken = new Set(marks.filter(m => m.leaf && m.el).map(m => m.el))
  // …and a value the overlay could not fit inside its box rides in a PILL beside it, so those two
  // are asked for anywhere in the frame — but only AFTER every word that must be inside its own box
  // has claimed its <text>. Asked first, a pill's loose search swallowed a second button's identical
  // label two rows down and reported that button missing (caught on the demo's real harvest,
  // 2026-09-02): the same words in two places need two nodes, and the placed one has first call.
  const loose = []
  for (const e of els) {
    const box = { x: px(e.x), y: px(e.y), w: px(e.w), h: px(e.h) }
    if (box.w < 4 || box.h < 2.5) continue       // the kit's own smudge floor: a rule, not a gap
    const words = raw(e.text)
    if (ghosted.has(e)) {
      // the given frame types this box's earlier value at the ANCHOR's place and draws no plate for
      // it — the ghost IS the element, one moment earlier. So the plate is not asked for at all, and
      // the words are asked for at the box first, then anywhere.
      if (words && !typed(say(fitText(words, 460, 12)), box)) loose.push({ want: say(fitText(words, 460, 12)), words, e })
      continue
    }
    if (spoken.has(e)) {
      if (words && !typed(say(fitText(words, 460, 12)), box)) loose.push({ want: say(fitText(words, 460, 12)), words, e })
    } else if (!valued.has(e) && TEXT_KINDS.has(e.kind) && words && !holdsWords(e)) {
      const label = e.tt === 'u' ? words.toUpperCase() : words
      const tfs = e.fs ? px(e.fs) : clamp(box.h * 0.62, 5, 16)
      if (tfs >= 4 && !typed(say(label), box)) at('missing-text', quote(label), e)
    }
    // AN ICON COUNTS AS DRAWN WHEN ITS OWN GROUP STANDS AT ITS BOX, carrying at least one shape
    // (mirror-10) — asked at the place iconPlace puts it, which is the renderer's own sum.
    if (e.kind === 'image' && e.icon) {
      const p = iconPlace(e.icon, box)
      const there = icons.some(g => g.n >= 1 && near(g.tx, r2(p.tx)) && near(g.ty, r2(p.ty)) &&
        Math.abs(g.sx - r2(p.sx)) <= 0.02 && Math.abs(g.sy - r2(p.sy)) <= 0.02)
      if (!there) at('missing-box', 'icon', e)
    }
    if (platePromised(e, box, W, H, holdsAny, holdsWords)) {
      // the tick box is drawn as a SQUARE centred in its element, exactly as frameBody lays it out
      const s = Math.min(box.w, box.h)
      const want = e.kind === 'check'
        ? { x: r1(box.x + (box.w - s) / 2), y: r1(box.y + (box.h - s) / 2), w: r1(s), h: r1(s) }
        : box
      if (!rects.some(rc => hereIs(want, rc))) at('missing-box', e.kind, e)
    }
  }
  for (const l of loose) if (!typed(l.want, null)) at('missing-text', quote(l.words), l.e)
  // WHAT THE PAGE DOES NOT SHOW, THE MIRROR MUST NOT DRAW — the render side's rule, checked. A box
  // whose geometry a LIVE element also occupies is that element's plate, not this one's ghost.
  for (const hb of (L.hidden || [])) {
    const box = { x: px(hb.x), y: px(hb.y), w: px(hb.w), h: px(hb.h) }
    if (box.w < 4 || box.h < 2.5) continue
    if (els.some(e => hereIs(box, { x: px(e.x), y: px(e.y), w: px(e.w), h: px(e.h) }))) continue
    const painted = rects.some(rc => hereIs(box, rc)) ||
      (raw(hb.text) && texts.some(t => saysIt(t, say(raw(hb.text)))))
    if (painted) at('hidden-drawn', hb.kind + (raw(hb.text) ? ' ' + quote(hb.text) : ''), hb)
  }
  // THE RING, at the burn-in's own geometry (ringRect — the shared module, so the drawn ring and the
  // photographed one are asked for at one place). Any indigo stroke that actually covers what the
  // assertion pointed at counts: the kit rings the picked mark, which is the ring box or a leaf of it.
  if (withFocus && L.ring) {
    const rr = ringRect({ x: L.ring.x, y: L.ring.y, w: L.ring.w, h: L.ring.h })
    const want = { x: rr.x * S, y: rr.y * S, w: rr.w * S, h: rr.h * S }
    const covers = rc => {
      const ox = Math.max(0, Math.min(rc.x + rc.w, want.x + want.w) - Math.max(rc.x, want.x))
      const oy = Math.max(0, Math.min(rc.y + rc.h, want.y + want.h) - Math.max(rc.y, want.y))
      return (ox * oy) / Math.max(1, Math.min(rc.w * rc.h, want.w * want.h)) >= 0.5
    }
    if (!rects.some(rc => rc.stroke === 'var(--ai)' && covers(rc))) {
      gaps.push({ kind: 'ring-missing', what: 'the ringed element', x: r1(L.ring.x), y: r1(L.ring.y), w: r1(L.ring.w), h: r1(L.ring.h) })
    }
  }
  return gaps
}
// ONE frame group out of a drawing — `<g class="wf3">…</g>`, brace-balanced over the nested
// `<g opacity>` a measured element draws inside (slicing at the first `</g>` cuts the frame off
// mid-page). The board's reader never needs this; the mirror gate does, so it can ask a COMMITTED
// file what it contains rather than trusting a fresh render of it.
export function frameGroup (svg, n) {
  const s = String(svg == null ? '' : svg)
  const i = s.indexOf('<g class="wf' + n + '">')
  if (i < 0) return ''
  const re = /<g\b|<\/g>/g
  re.lastIndex = i
  let depth = 0; let m
  while ((m = re.exec(s))) {
    depth += m[0] === '</g>' ? -1 : 1
    if (depth === 0) return s.slice(i, m.index)
  }
  return s.slice(i)
}
// the derive's one-line reading of a run of gaps — "missing-text 3, hidden-drawn 1"
export const gapSummary = gaps => {
  const by = new Map()
  for (const g of (gaps || [])) by.set(g.kind, (by.get(g.kind) || 0) + 1)
  return [...by].map(([k, n]) => k + ' ' + n).join(', ')
}

// The MIRROR'S timeline: one frame per scene (the Given, then one per beat) and one crossfade per
// transition, so the board's per-beat row scrubs exactly its own beat's change. Every duration is
// calc(<X>s / var(--spd,1)) like the archetype kit, and the still phases stay plain negative
// seconds — the board CSS divides the parked delay by the SAME var, so the frame a still shows is
// identical at every speed (Task 11's contract).
// `m` is the number of TRANSITIONS the drawing plays — one per scene after the Given. Since
// 2026-08-29 a beat can hold several scenes (each value it proved, then its result), so this is no
// longer "one per beat"; wfBeatPhases below folds the scene phases back into the per-beat park
// points the storyboard pairs against.
function wfTimeline (m) {
  const dur = r2(2.5 + 1.5 * m)
  const A = 10; const B = 90
  const segs = Array.from({ length: m }, (_, i) => {
    const s = A + (i * (B - A)) / m
    const e = A + ((i + 1) * (B - A)) / m
    return { s: r1(s), m: r1(s + 0.5 * (e - s)), e: r1(e) }
  })
  const reset = 97                                  // the loop's snap back to the first frame
  // where each frame PARKS: frame 0 inside the intro hold, frame k just before its own segment
  // ends — the crossfade finished, the change settled
  const phases = [-r2(0.08 * dur), ...segs.map(g => -r2((g.e / 100) * dur - 0.1))]
  return { dur, durCss: `calc(${dur}s / var(--spd, 1))`, segs, phases, reset }
}
// FRAME k'S OPACITY, WITHOUT THE DIP (the human, 2026-09-02: "the scene move is not smooth").
//
// It used to fade k OUT while k+1 faded IN over the same span, so at the midpoint of every
// transition BOTH sat near 0.5: identical content blinked, and text ghosted double. Two half-
// transparent sheets are not a crossfade, they are a dip.
//
// The frames are painted in order, so the honest fix is a REPLACEMENT: k holds at FULL opacity for
// the whole of its own fade-out span while k+1 arrives on top of it, and only drops once k+1 is
// completely opaque. That needs every frame group to open with an opaque page rect (renderWireframe
// below) — without it, k+1 would be a transparent sheet over k rather than a replacement for it.
//
// Frame 0 is the bottom layer and simply never fades: everything above covers it, and at the loop's
// reset the frames above it clear and it is already there. That also removes the one instant the
// old timeline could not cover — the snap back — where both the last frame and the first were
// mid-fade at once. The park points are untouched (the board pins them).
function wfFade (k, t, m) {
  if (k === 0) return stops([[0, 'opacity:1'], [100, 'opacity:1']])
  const inS = t.segs[k - 1].s; const inE = t.segs[k - 1].m
  if (k < m) {
    const out = t.segs[k].m
    return stops([[0, 'opacity:0'], [inS, 'opacity:0'], [inE, 'opacity:1'],
      [out, 'opacity:1'], [r1(out + 0.1), 'opacity:0'], [100, 'opacity:0']])
  }
  return stops([[0, 'opacity:0'], [inS, 'opacity:0'], [inE, 'opacity:1'],
    [r1(t.reset - 0.1), 'opacity:1'], [t.reset, 'opacity:0'], [100, 'opacity:0']])
}

// renderWireframe(beatLayouts, meta) → { archetype, kind, svg, phases, layoutHash }, or null when
// no layout is usable. `beatLayouts` is the requirement's harvest IN BEAT ORDER —
// [{ before, after }, …], one entry per beat that was captured (spec/<screen>/evidence/
// <id>.b<n>.{before,after}.layout.json). The drawing gets ONE FRAME PER SCENE: the Given frame is
// beat 1's before, and each beat's frame is that beat's after — which is exactly what the board's
// per-beat rows show, one row one frame.
//
// `meta` carries what the WORDS side already knows, so the drawn callout says exactly what the
// burn-in said: `behavior` (the parsed chain — its beats supply each frame's When/Then, and its
// text is the pin the board's staleness check reads), `id` and `title` for the card's chip, and
// `pass` for the koke ✓. Nothing about the LAYOUT is derived from the words. A requirement whose
// harvest covered fewer beats than its prd lists pads the missing phases with the last measured
// frame, rather than inventing motion nobody measured.
//
// The legacy 3-argument call renderWireframe(before, after, meta) is still accepted as one beat.
// ── THE LAST STATE THE APP GOT RIGHT (mirror-13, 2026-09-02) ─────────────────────────────────
// The human, on Tsumiki's R9 again, one kit after mirror-12: "the failed test case is so fucking
// wrong, the schematic should be correct, only the proof should be wrong." mirror-12 swapped the
// EXPECTED value onto the ringed element of a failed scene — but drew the REST of that scene from
// the failed skeleton, which is a photograph of the app misbehaving: a task the requirement says is
// only archived was drawn already gone, and the Undo it asks for was nowhere, because nothing had
// measured one. One right number in a wrong picture is still a wrong picture.
//
// So a failed scene is not drawn from its own skeleton at all. It is drawn from the LAST SKELETON
// THE APP GOT RIGHT — the beat's latest passing scene, or its before frame — with the requirement's
// expected value put where the claim points. That state is the closest measured thing to the
// intended one: the app was still right there, and the claim says what should have changed since.
//   · a claim whose element is still on the page (a counter reading 4 for an expected 5) finds it in
//     the base by the ring's own box and takes the expected text;
//   · a claim whose element the app REMOVED (claim.missing — the check found nothing to read) finds
//     it in the base by its expected text — the base still has it, which is the whole point;
//   · a claim on something the app NEVER had (an Undo that should appear) becomes a new leaf beside
//     the ring the beat last stood on, in that neighbour's own type — the one thing here the harvest
//     did not measure, drawn because the requirement says it is there, and named in words by the
//     callout on both sides.
// Claims accumulate down the beat (scene k shows every intended change up to k), and the beat's
// after frame is the base with ALL of them applied — the intended rest. Every focus in the base is
// cleared first: the ring belongs to the claim, not to the scene that was borrowed. The derived
// skeleton is registered as the frame's INPUT (rawOf), so mirrorGaps and `npm run proof mirror`
// check the drawing against the very picture it was asked to draw — and the photograph beside it
// keeps what the app did, with the verdict in red.
function intendedLayout (baseRaw, claims) {
  const L = structuredClone(baseRaw)
  if (!L || !Array.isArray(L.els)) return null
  const norm = t => raw(t).replace(/\s+/g, ' ').toLowerCase()
  const worded = e => !!raw(e.text)
  const inside = (t, e) => t !== e && t.x >= e.x - 0.6 && t.y >= e.y - 0.6 &&
    t.x + t.w <= e.x + e.w + 0.6 && t.y + t.h <= e.y + e.h + 0.6
  const overlap = (a, b) => {
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
    return (ox * oy) / Math.max(1, Math.max(a.w * a.h, b.w * b.h))
  }
  for (const e of L.els) { if (e && typeof e === 'object') delete e.focus }
  let ring = null
  for (const { claim, at } of claims) {
    if (!claim || claim.ok !== false || !claim.expected) continue
    const els = L.els.filter(e => e && typeof e === 'object')
    const leaves = els.filter(e => worded(e) && !els.some(t => inside(t, e) && worded(t)))
    let target = null
    if (!claim.missing && at) {
      let best = 0
      for (const e of leaves) { const ov = overlap(e, at); if (ov > best) { best = ov; target = e } }
      if (best < 0.4) target = null
    }
    if (!target) target = leaves.find(e => norm(e.text) === norm(claim.expected)) || null
    if (!target && at) {
      let like = null; let lov = 0.4
      for (const e of leaves) { const ov = overlap(e, at); if (ov > lov) { lov = ov; like = e } }
      const fs = like && like.fs > 0 ? like.fs : Math.max(11, Math.min(16, at.h * 0.6))
      // after the neighbour's WORDS, not its box: a row title's box runs to the chip beside it, and a
      // leaf placed past the box landed on that chip. The text end is estimated the way the whole kit
      // estimates (average advance), padded by the neighbour's own left padding.
      // …and the new leaf must not NEST in the neighbour's box, or the kit reads the neighbour as a
      // wrapper whose leaves type its words and drops the neighbour's own (the title vanished). A text
      // leaf's box is never outlined, so it is trimmed to its words first and the new leaf follows it.
      const words = like ? raw(like.text).length * fs * 0.58 + (like.pl > 0 ? like.pl : 0) : at.w
      const textLike = like && like.kind === 'text'
      if (textLike && words < like.w) like.w = words
      const afterX = textLike ? like.x + like.w + 8 : at.x + at.w + 8
      target = {
        x: afterX, y: at.y, w: Math.max(24, claim.expected.length * fs * 0.6 + 12), h: at.h,
        kind: 'text', text: claim.expected, fs,
        ...(like ? { fg: like.fg, ff: like.ff, fw: like.fw } : {}),
        synthetic: true
      }
      L.els.push(target)
    }
    if (!target) continue
    const was = raw(target.text)
    target.text = claim.expected
    target.focus = true
    target.intended = true
    // the same value in the element's own inner span (a counter's digit) moves with it
    for (const t of els) if (inside(t, target) && worded(t) && raw(t.text) === was) t.text = claim.expected
    ring = { x: target.x, y: target.y, w: target.w, h: target.h }
    L.claim = { ...claim }
  }
  if (ring) L.ring = ring
  return L
}

export function renderWireframe (beatLayouts, metaOrAfter, maybeMeta) {
  const asBeats = Array.isArray(beatLayouts)
  // one canonical shape for BOTH call forms, so the layout pin is the same either way
  const pairsIn = asBeats ? beatLayouts : [{ before: beatLayouts || null, after: metaOrAfter || null }]
  const meta = (asBeats ? metaOrAfter : maybeMeta) || {}
  const usable = L => (L && L.els.length ? L : null)
  // …and which HARVESTED skeleton each normalised layout came from, so a frame can be checked against
  // its own input (mirrorGaps below). Identity-keyed: normLayout returns a fresh object every call.
  const rawOf = new Map()
  const take = raw => { const n = usable(normLayout(raw)); if (n) rawOf.set(n, raw); return n }
  const pairs = (pairsIn || []).map(p => ({
    before: take(p && p.before),
    after: take(p && p.after),
    // …and the beat's ASSERTED VALUES, in the order it proved them (2026-08-29): each one is a
    // scene of the beat, so the drawing ENACTS the When instead of only showing what it produced.
    values: (p && Array.isArray(p.values) ? p.values : []).map(take).filter(Boolean)
  })).filter(p => p.before || p.after || p.values.length)
  if (!pairs.length) return null
  // THE BEAT'S END STATE IS ITS INTENT TOO (mirror-12, 2026-09-02). A beat's AFTER frame asserts
  // nothing of its own, so the harvest files no claim beside it — but it is the picture of where the
  // beat comes to rest, and on a beat that FAILED the rest the requirement asks for is the expected
  // one. So the intent is DERIVED here, from the beat's last failed value, rather than invented at
  // capture time (spec/_base.ts snapPhase deliberately leaves the after phase claimless: a claim
  // written for a frame that asserted nothing would be a fabricated measurement).
  //
  // It rides the REPORTED skeleton as well as the drawn one — a COPY of the harvested file, never
  // the file's own object — so tools/proof-integrity.mjs, which re-checks a committed frame against
  // `gaps[i].layout`, asks the guard the same question this renderer answered. The pin (layoutHash)
  // is taken from the untouched inputs, so deriving this moves no drawing on its own.
  //
  // …and since mirror-13 a FAILED scene, and the after frame of a failed beat, are not that
  // skeleton at all but the last one the app got right with the claims applied (intendedLayout
  // above). The mirror-12 after-claim is the fallback for a beat with no right state to borrow.
  for (const p of pairs) {
    let base = p.before ? rawOf.get(p.before) : null
    const applied = []
    p.values = p.values.map(v => {
      const rv = rawOf.get(v)
      const c = v.claim
      if (!(c && c.ok === false && c.expected)) { base = rv; return v }
      applied.push({ claim: c, at: rv && rv.ring ? { ...rv.ring } : null })
      const truth = base ? take(intendedLayout(base, applied)) : null
      return truth || v
    })
    if (!applied.length || !p.after) continue
    const truth = base ? take(intendedLayout(base, applied)) : null
    if (truth) { p.after = truth; continue }
    if (p.after.claim) continue
    const last = applied[applied.length - 1].claim
    p.after.claim = last
    rawOf.set(p.after, { ...(rawOf.get(p.after) || {}), claim: last })
  }
  const src = pairs[0].before || pairs[0].after
  const S = LAYOUT_W / src.w
  const H = Math.round(clamp(LAYOUT_W * (src.h / src.w), 180, 900))
  const behavior = meta.behavior && wellFormed(meta.behavior) ? meta.behavior : null
  // SCENES PER BEAT: every value the beat proved, then its result — so a beat that proved the
  // typed box and then the row it produced draws both, in that order. A beat that proved nothing
  // beyond its own end is one scene, exactly as before.
  const sizes = pairs.map(p => p.values.length + 1)
  const m = sizes.reduce((a, b) => a + b, 0)           // transitions drawn = scenes after the Given
  const nb = pairs.length                              // beats harvested
  const n = behavior ? behavior.beats.length : nb      // beats the storyboard will pair against
  const hash = vizHash(behavior)                       // spec-store's staleness authority: the TEXT
  const lhash = layoutHash(pairsIn)                    // …and the geometry's own pin beside it
  // the scope class carries BOTH pins: two requirements with no behavior block would otherwise
  // share one text hash, and their drawings' keyframes would collide in the same document
  const k = 'vz' + hash.slice(0, 8) + lhash.slice(0, 4)
  const kf = suffix => 'v' + hash.slice(0, 8) + lhash.slice(0, 4) + suffix
  const t = wfTimeline(m)
  // FRAME 0 is beat 1's before; frame i is beat i's after. Each after-frame wears the burn-in's own
  // overlay — dim, ring, value pill, and the tour card carrying THAT beat's When → Then. Frame 0
  // wears none of it (nothing was asserted yet) and instead shows beat 1's anchors one moment
  // earlier, so the pair reads as a change.
  // …and the SAME de-duplication the ringed frames use (2026-08-28 fix): the capture marks a
  // counter and the digit span inside it, so an un-picked anchor list drew "2" stacked on "2 to do"
  // in the given frame too. pickFocus runs here in PAGE units, where both the marks and the ring are.
  const anchorsOf = L => {
    if (!L) return []
    const marks = L.els.filter(e => e.focus)
    const picked = marks.length ? pickFocus(marks, L.ring) : (L.ring ? [L.ring] : [])
    return picked.map(e => ({ x: e.x, y: e.y, w: e.w, h: e.h }))
  }
  // `done:false` is a scene MID-beat — the When has been performed and read, but the beat's Then
  // has not happened yet, so the card says the action alone and wears no ✓. Anything else would
  // claim a proof one scene before it exists. Which SENTENCE that is comes from the shared rule
  // (tools/callout-text.mjs), the same call the burn-in makes for the same scene — so the drawing
  // and the photograph beside it cannot say different things (the human, 2026-08-30).
  const cardFor = (i, done) => {
    const bt = behavior && behavior.beats[Math.min(i, behavior.beats.length - 1)]
    if (!bt) return null
    const c = calloutText({ id: meta.id || '', when: bt.when, then: bt.then, done })
    return { ...c, when: bt.when, then: bt.then, pass: done ? !!meta.pass : false }
  }
  // the rect each cell's camera will be aimed at: the UNION of the beat's rings (tools/evidence.mjs
  // focusFromLayouts computes exactly this for the proof side), so every scene of a beat is inside
  // the region the row frames — a camera on the result alone would crop the When off both cells.
  const camOf = p => {
    const rings = [...p.values.map(v => v && v.ring), p.after && p.after.ring].filter(Boolean)
    if (!rings.length) return null
    const x = Math.min(...rings.map(r => r.x)); const y = Math.min(...rings.map(r => r.y))
    const rx = Math.max(...rings.map(r => r.x + r.w)); const by = Math.max(...rings.map(r => r.y + r.h))
    return { x, y, w: rx - x, h: by - y }
  }
  const frames = [{ L: pairs[0].before || pairs[0].after, ring: false, anchors: anchorsOf(pairs[0].after), card: null, cam: camOf(pairs[0]) }]
  pairs.forEach((p, i) => {
    const cam = camOf(p)
    for (const v of p.values) frames.push({ L: v, ring: true, anchors: [], card: cardFor(i, false), cam })
    frames.push({ L: p.after || p.before, ring: !!p.after, anchors: [], card: cardFor(i, true), cam })
  })
  // THE CARD BOX EACH FRAME'S REGION MUST CONTAIN (the human, 2026-08-30). Computed once, in page
  // units, from the frame's own ring and its callout sentence — the drawing frames its region around
  // it, AND it is published on the svg so the proof cell frames the identical box. A frame with no
  // ring or no card (the Given, a before scene) has none: its region stays ring-only.
  const frameCardBox = frames.map(f => (f.ring && f.card && f.L && f.L.ring)
    ? cardRegionBox(f.card, f.L.ring, src.w, src.h) : null)
  let css = ''
  // EVERY FRAME OPENS WITH ITS OWN OPAQUE PAGE (2026-09-02). The crossfade above holds frame k at
  // full while k+1 arrives on top of it — which only reads as a replacement if k+1 is opaque. Inset
  // by 1 so the shell's own hairline still shows through around it.
  const page = `<rect x="1" y="1" width="${LAYOUT_W - 2}" height="${H - 2}" rx="5.5" fill="var(--paper)"/>`
  const bodies = frames.map((f, i) =>
    frameBody(f.L, S, LAYOUT_W, H, f.ring, f.anchors, f.card, f.cam, frameCardBox[i]))
  const groups = bodies.map((bd, i) => {
    css += `.${k} .wf${i}{animation:${kf('f' + i)} ${t.durCss} infinite}` +
      `@keyframes ${kf('f' + i)}{${wfFade(i, t, m)}}`
    return `<g class="wf${i}">${page}${bd}</g>`
  }).join('')
  // EVERY FRAME IS CHECKED AGAINST ITS OWN INPUT (the human, 2026-09-02: "make sure the gap between
  // schematic and proof will not exist again"). Derived here, never stored on the drawing: the
  // derive prints it, `npm run proof` refuses a committed drawing that has any, and neither can be
  // satisfied by a renderer that quietly stopped drawing what the harvest measured.
  // Each report carries the INPUTS that frame was drawn from as well as its gaps, so a gate can ask
  // the same question of a COMMITTED file (tools/proof-integrity.mjs checkMirrors) without a second
  // copy of the frame ordering — the one place that knows which skeleton is frame 3 is here.
  const gaps = frames.map((f, i) => ({
    frame: i,
    layout: rawOf.get(f.L) || null,
    focus: !!f.ring,
    anchors: f.anchors,
    h: H,
    gaps: mirrorGaps(rawOf.get(f.L), bodies[i], { focus: f.ring, anchors: f.anchors, h: H })
  }))
  const shell = `<rect x="0.5" y="0.5" width="${LAYOUT_W - 1}" height="${H - 1}" rx="6" fill="var(--paper)" stroke="var(--line2)" stroke-width="1"/>`
  const body = shell + groups
  // ONE PARK POINT PER BEAT — what the storyboard pairs its rows against, unchanged: the Given,
  // then where each beat comes to rest (its LAST scene). A beat past what the harvest measured parks
  // on the last measured frame — the loop window is then zero-length and the board holds that still.
  const beatEnd = []                                   // frame index each harvested beat rests on
  sizes.reduce((at, k) => { beatEnd.push(at + k); return at + k }, 0)
  const phases = Array.from({ length: n + 1 }, (_, i) =>
    t.phases[i === 0 ? 0 : (beatEnd[Math.min(i, nb) - 1] || m)])
  // …and EVERY park point, grouped by beat (2026-08-29): each scene the beat proved, then its
  // result. The board steps this drawing in lock-step with the proof loop beside it — frame j of
  // that loop and park point j here are the same moment of the same beat — so a row plays as one
  // thing. A beat the harvest never reached publishes its resting point twice: nothing to step.
  //
  // THE OPENING SCENE IS DROPPED where the beat proved anything (the human, 2026-08-31: "first
  // screen in when/then should already have the 'when' action started — instead of just same as
  // given, it will be redundant"). The state a beat opens in IS the Given row above it, or the
  // previous beat's result; spending the row's first scene on it shows the reader a picture they
  // have already read. A beat that proved NOTHING between its ends keeps [opening, result] — there
  // the opening is the only motion it has. The drawing still DRAWS the opening frame, and the
  // harvest still captures it: this is a display rule, and the proof loop beside it drops exactly
  // the same frame (tools/board/client.js beatShots), so scene j and frame j stay one moment.
  const subphases = Array.from({ length: n }, (_, i) => {
    if (i >= nb) return [phases[i], phases[i + 1]]
    const start = beatEnd[i] - sizes[i]
    const grp = Array.from({ length: sizes[i] + 1 }, (_, j) => t.phases[start + j])
    return sizes[i] > 1 ? grp.slice(1) : grp
  })
  // …and the CALLOUT CARD BOX for each of those scenes (the human, 2026-08-30), grouped and dropped
  // EXACTLY as the park points above so the proof cell can zip card[j] onto its scene j. A scene
  // with no card (a before scene, the Given) publishes an empty slot, and the proof cell's camera
  // then frames that scene ring-only. Each rect is "x,y,w,h" in page units; scenes join with ";",
  // beats with "|".
  const rectStr = b => b && b.w > 0 && b.h > 0
    ? [r1(b.x), r1(b.y), r1(b.w), r1(b.h)].join(',') : ''
  const cardspots = Array.from({ length: n }, (_, i) => {
    if (i >= nb) return ['', '']
    const start = beatEnd[i] - sizes[i]
    const grp = Array.from({ length: sizes[i] + 1 }, (_, j) => frameCardBox[start + j] || null)
    return (sizes[i] > 1 ? grp.slice(1) : grp).map(rectStr)
  })
  const label = esc('wireframe schematic — the app’s own layout, drawn frame by frame: the given, then each beat' +
    (behavior
      ? '. given ' + behavior.given + '; ' +
        behavior.beats.map((x, i) => 'beat ' + (i + 1) + ': ' + x.when + ' → ' + x.then).join('; ')
      : ''))
  const svg = `<svg class="${k}" viewBox="0 0 ${LAYOUT_W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}"` +
    ` data-viz-hash="${hash}" data-viz-archetype="ui-mirror" data-viz-kind="wireframe" data-viz-layout="${lhash}"` +
    ` data-viz-kit="${MIRROR_KIT}" data-viz-beats="${n}" data-viz-frames="${m + 1}" data-viz-phases="${phases.join(' ')}"` +
    ` data-viz-subphases="${subphases.map(g => g.join(' ')).join('|')}"` +
    ` data-viz-cardspots="${cardspots.map(g => g.join(';')).join('|')}">` +
    `<style>${css}</style>${body}</svg>`
  return { archetype: 'ui-mirror', kind: 'wireframe', svg, phases, layoutHash: lhash, gaps }
}
