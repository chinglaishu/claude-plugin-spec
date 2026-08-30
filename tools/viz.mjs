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

const LAYOUT_W = 600                        // the drawing's internal width; the pane scales by CSS
// THE RENDERER PIN. Staleness on this board is a BODY comparison — viz-derive redraws whenever the
// committed file differs from what the kit draws today — so a renderer change already lands on the
// next pass with no bump at all, and no committed drawing ever needs deleting. This stamp exists so
// the reason is legible ON DISK: `mirror-4` draws the asserted value at the ELEMENT'S OWN MEASURED
// TYPE — the page's font size, alignment and text inset, where the harvest recorded them, instead of
// a centred label sized off the ring box's height; `mirror-3` draws the overlay at the burn-in's own PAGE GEOMETRY
// (a 300px card, scaled only by drawingW/pageW, so the drawn and photographed callouts are the same
// picture); `mirror-2` was the same overlay sized against the drawing, `mirror-1` the plain
// wireframe before it.
const MIRROR_KIT = 'mirror-4'
const KINDS = new Set(['heading', 'text', 'input', 'button', 'row', 'container', 'image'])
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// The layout files are HARVESTED data, not authored: every field is untrusted. Anything malformed
// is dropped rather than drawn, and a layout with no usable box yields null — the caller then
// falls back to the archetype kit, never to an empty frame.
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
      pr: pr > 0 ? pr : 0
    })
  }
  const r = l.ring && typeof l.ring === 'object' ? l.ring : null
  const ring = r && num(r.x) != null && num(r.y) != null && num(r.w) > 0 && num(r.h) > 0
    ? { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) }
    : null
  return { w, h, ring, els }
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

// THE BOARD'S CAMERA, computed here (the human, 2026-08-28: the drawn callout was being CLIPPED).
// Every beat cell zooms onto the beat's focus rect, and the schematic cell zooms this drawing by
// the SAME math — tools/board/stepper.js: pad the focus rect by 2.75, then COVER-fit that padded
// rect (scale = min(2.2, max(coverX, coverY)) — a wide, short target crops at the sides rather than
// zooming out), centre on the focus and clamp inside the frame. Anything the drawing puts outside
// that region is simply not on screen in a beat row, which is how R5's card ended up cut mid-word:
// its counter sits at the page's right edge, so the region is the right third of the page.
//
// Because BOTH cells cover-fit at the same scale, an overlay drawn at the burn-in's own page
// geometry lands at the same apparent size as the photographed one — which is the whole point.
// ONE AXIS OF THE PADDED RECT (2026-08-29). The generous 2.75 pad is what makes a 30px chip
// readable in context, but a BIG target — since a beat's camera frames the union of its rings, a
// target can be a third of the page — pads past the frame, and clamping to the frame then gave up
// the zoom entirely: two 0.39× screenshots of a 1440px app side by side, the unreadable row the
// human called out. So padding that would not fit falls back to a MARGIN (×1.12), which still
// frames the target rather than the whole page. Mirrored verbatim in tools/board/stepper.js
// cameraView — the two are one camera, and a row is a comparison only while they agree.
const MARGIN = 1.12
function padded (size, frame, pad) {
  const want = size * pad
  return want <= frame ? want : Math.min(frame, size * MARGIN)
}
export function framedRegion (f, W, H, opts = {}) {
  const pad = opts.pad != null ? opts.pad : 2.75
  const maxScale = opts.maxScale != null ? opts.maxScale : 2.2
  const whole = { x: 0, y: 0, w: W, h: H }
  if (!f || !(f.w > 0) || !(f.h > 0) || !(W > 0) || !(H > 0)) return whole
  const pw = padded(f.w, W, pad); const ph = padded(f.h, H, pad)
  // COVER, not contain: the bigger of the two ratios fills the cell, cropping the padded rect's
  // long side instead of refusing to zoom at all
  // …and NEVER past the scale at which the focus itself stops fitting (2026-08-29): covering a union
  // taller than the cell would crop the beat's own first scene out of the row. Small targets never
  // reach this — maxScale bites first.
  const fit = Math.min(W / (f.w * MARGIN), H / (f.h * MARGIN))
  const scale = Math.min(maxScale, fit, Math.max(W / pw, H / ph))
  if (!(scale > 1)) return whole
  const rw = W / scale; const rh = H / scale
  return {
    x: Math.min(Math.max(0, f.x + f.w / 2 - rw / 2), W - rw),
    y: Math.min(Math.max(0, f.y + f.h / 2 - rh / 2), H - rh),
    w: rw,
    h: rh
  }
}
const insideRegion = (b, reg) => b.x >= reg.x - 0.01 && b.y >= reg.y - 0.01 &&
  b.x + b.w <= reg.x + reg.w + 0.01 && b.y + b.h <= reg.y + reg.h + 0.01

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
  const ink = hot ? 'ink' : 'ink-3'
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
    if (align === 'l') return { svg: svgText(f.x + pad.l, base, fit, ink, 'mono', say(label)), box: null }
    if (align === 'r') {
      return { svg: svgText(f.x + f.w - pad.r, base, fit, ink, 'mono', say(label), ' text-anchor="end"'), box: null }
    }
    return {
      svg: svgText(f.x + f.w / 2, base, fit, ink, 'mono', say(label), ' text-anchor="middle"'),
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
    svgText(r1(x + pw / 2), r1(y + ph / 2 + fs * 0.35), fs, ink, 'mono', say(label), ' text-anchor="middle"')
  return { svg, box: { x, y, w: pw, h: ph } }
}

// ONE text run wrapped to at most `maxLines`, each line cut to the width it has (line 0 is shorter
// where a label sits beside it). Overflow ends in an ellipsis — the card never grows to fit its
// text and text never runs past the card. Widths are in drawing units; 0.52·fs is the average glyph
// advance the whole kit estimates with.
function wrapText (text, fs, widths, maxLines) {
  const words = raw(text).split(' ').filter(Boolean)
  if (!words.length) return []
  const cap = i => Math.max(4, Math.floor(widths[Math.min(i, widths.length - 1)] / (fs * 0.52)))
  const lines = []
  let cur = ''
  let wi = 0
  while (wi < words.length && lines.length < maxLines) {
    const t = cur ? cur + ' ' + words[wi] : words[wi]
    if (t.length <= cap(lines.length)) { cur = t; wi++; continue }
    if (!cur) { cur = words[wi].slice(0, Math.max(1, cap(lines.length) - 1)) + '…'; wi++ }
    lines.push(cur); cur = ''
  }
  if (cur && lines.length < maxLines) { cur = (wi = words.length, lines.push(cur), '') }
  if (wi < words.length) {
    const j = lines.length - 1
    const c = cap(j)
    lines[j] = lines[j].length + 1 > c ? lines[j].slice(0, Math.max(1, c - 1)) + '…' : lines[j] + '…'
  }
  return lines
}

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
const checkMark = (x, y, s) =>
  `<path d="M${r1(x)} ${r1(y)} l${r1(s * 0.34)} ${r1(s * 0.34)} l${r1(s * 0.66)} ${r1(-s * 0.8)}" ` +
  `fill="none" stroke="var(--ok)" stroke-width="${r1(Math.max(0.6, s * 0.2))}" stroke-linecap="round" stroke-linejoin="round"/>`

// ── THE BURN-IN, IN PAGE PIXELS ────────────────────────────────────────────
// The drawn overlay and the photographed one must be the SAME PICTURE (the human, 2026-08-28 —
// "identical except mock vs real"). So every number below is renderOverlay's own, in page pixels,
// converted by the ONE ratio this drawing already uses for everything else: S = drawingW / page
// width. Nothing here is sized against the drawing, the focus rect or the camera — that was the
// mistake: a card measured against the framed region renders huge at full frame and stops matching
// the photograph the moment the two are put side by side.
const OV = {
  card: 300,          // .sb-call width
  rad: 11,            // its border-radius
  padX: 15,           // its padding: 12px 15px
  padY: 12,
  fsTag: 11,          // the tag row (the title)
  fsId: 10,           // the id chip's mono
  fsLab: 10,          // the WHEN / THEN mono labels
  fsWhen: 12.5,
  fsThen: 15,
  lhWhen: 1.35,
  lhThen: 1.36,
  tagGap: 8,          // tagRow margin-bottom
  whenGap: 3,         // When row margin-bottom
  chipPadX: 5,
  chipRad: 4,
  notch: 12,          // the 12px square, rotated 45°
  ringInset: 4,       // ring: left/top = box - 4, size = box + 8
  ringStroke: 2,
  ringRad: 6,
  halo: 3,            // box-shadow 0 0 0 3px paper
  glow: 8,            // 0 0 16px rgba(ai,.30), approximated as a wide pale stroke
  shadowY: 6          // 0 10px 30px rgba(ink,.24), approximated as one offset plate
}
// the rotated square's visible triangle: half-base and tip reach are both side/√2
const NOTCH_REACH = OV.notch / Math.SQRT2

// THE DIM. The burn-in's veil is `position:fixed;inset:0;background:rgba(28,27,24,.12)` — the WHOLE
// page, the ringed element included; the ring and the card are painted over it. So the drawing
// washes the whole frame too. (An earlier pass cut a hole for the focus; that is not what the
// photograph shows, and side by side the brighter patch was the giveaway.)
const dimWash = (W, H) => `<rect x="0" y="0" width="${r1(W)}" height="${r1(H)}" fill="var(--ink)" opacity="0.12"/>`

// THE RING, at the burn-in's geometry: a 2px indigo stroke inset 4px around the box with a 6px
// radius, a 3px paper halo outside it, and the pale glow beyond that. S converts each px.
function ringSVG (f, S) {
  const o = OV.ringInset * S + (OV.ringStroke * S) / 2
  const x = f.x - o; const y = f.y - o
  const w = f.w + 2 * o; const h = f.h + 2 * o
  const rect = (grow, sw, stroke, extra) =>
    `<rect x="${r1(x - grow)}" y="${r1(y - grow)}" width="${r1(w + 2 * grow)}" height="${r1(h + 2 * grow)}" ` +
    `rx="${r1(OV.ringRad * S + grow)}" fill="none" stroke="var(--${stroke})" stroke-width="${r1(sw)}"${extra}/>`
  return rect((OV.ringStroke / 2 + OV.halo / 2 + OV.glow / 2) * S, OV.glow * S, 'ai', ' opacity="0.12"') +
    rect((OV.ringStroke / 2 + OV.halo / 2) * S, OV.halo * S, 'paper', ' opacity="0.92"') +
    rect(0, OV.ringStroke * S, 'ai', '')
}

// THE TOUR CALLOUT, in SVG. renderOverlay's card — the same structure, the same wording, the same
// palette, and now the same GEOMETRY: a 300px card at scale S, 11px radius, 12/15 padding, the
// 11/12.5/15px type, the 10px mono labels, the 12px notch. `u` is the card's own scale: 1 at the
// burn-in's true size, less only when the framed region cannot hold it (the owner takes a slightly
// small card over a clipped one).
function measureCard (spec, S, u) {
  const k = S * u
  const id = raw(spec.id) || 'R?'
  const cardW = OV.card * k
  const padX = OV.padX * k; const padY = OV.padY * k
  const inner = cardW - 2 * padX
  const fsId = OV.fsId * k; const fsTag = OV.fsTag * k
  const fsWhen = OV.fsWhen * k; const fsThen = OV.fsThen * k; const fsLab = OV.fsLab * k
  const chipW = id.length * fsId * 0.62 + 2 * OV.chipPadX * k + 2 * k
  const chipH = fsId * 1.2 + 2 * k + 2 * k
  const tagGap = 7 * k
  const title = fitText(spec.title, Math.max(inner - chipW - tagGap, fsTag * 3), fsTag)
  const labW = 4 * fsLab * 0.62 + 4 * fsLab * 0.08 + fsLab * 0.6      // "WHEN" + its letter-spacing + a space
  const whenLines = wrapText(spec.when, fsWhen, [inner - labW], 2)
  const thenLines = wrapText(spec.then, fsThen, [inner - labW], 2)
  const lhW = fsWhen * OV.lhWhen; const lhT = fsThen * OV.lhThen
  const whenH = whenLines.length * lhW
  // a mid-beat card says the WHEN alone (2026-08-29) — no Then has happened yet — so it reserves no
  // line for one. A card that HAS a Then keeps its minimum line, exactly as before.
  const thenH = Math.max(thenLines.length, raw(spec.then) ? 1 : 0) * lhT
  const cardH = r1(padY + chipH + OV.tagGap * k + whenH + OV.whenGap * k + thenH + padY)
  const draw = (x, y) => {
    const parts = []
    const tx = x + padX
    let cy = y + padY
    parts.push(`<rect x="${r1(tx)}" y="${r1(cy)}" width="${r1(chipW)}" height="${r1(chipH)}" rx="${r1(OV.chipRad * k)}" fill="none" stroke="var(--line2)" stroke-width="${r1(k)}"/>`)
    parts.push(svgText(tx + chipW / 2, cy + chipH / 2 + fsId * 0.36, fsId, 'ink-3', 'mono', say(id), ' text-anchor="middle" font-weight="600"'))
    if (title) parts.push(svgText(tx + chipW + tagGap, cy + chipH / 2 + fsTag * 0.34, fsTag, 'ink-3', 'sans', say(title)))
    cy += chipH + OV.tagGap * k
    whenLines.forEach((ln, i) => {
      const base = cy + i * lhW + fsWhen * 0.95
      if (i === 0) parts.push(svgText(tx, base, fsLab, 'ink-3', 'mono', 'WHEN', ' font-weight="600" letter-spacing="' + r2(fsLab * 0.08) + '"'))
      parts.push(svgText(tx + labW, base, fsWhen, 'ink-3', 'sans', say(ln)))
    })
    cy += whenH + OV.whenGap * k
    thenLines.forEach((ln, i) => {
      const base = cy + i * lhT + fsThen * 0.95
      if (i === 0) parts.push(svgText(tx, base, fsLab, 'ai', 'mono', 'THEN', ' font-weight="600" letter-spacing="' + r2(fsLab * 0.08) + '"'))
      parts.push(svgText(tx + labW, base, fsThen, 'ink', 'sans', say(ln), ' font-weight="600"'))
      // the verdict rides the last line, exactly where the burn-in puts it. It is the state at
      // DERIVE time (viz-derive reads the board's own derived status), never a status stored in the
      // drawing: the live chip beside the requirement is the authority, and the next pass redraws.
      if (spec.pass && i === thenLines.length - 1) {
        const endX = Math.min(tx + labW + ln.length * fsThen * 0.52 + fsThen * 0.4, x + cardW - padX - fsThen * 0.9)
        parts.push(checkMark(endX, base - fsThen * 0.26, fsThen * 0.9))
      }
    })
    return parts.join('')
  }
  return { cardW, cardH, k, draw }
}

// Place it the way renderOverlay places it — below the ring, then above, then beside — with one
// extra refusal the burn-in does not need: the candidate must also lie inside the camera's framed
// region, because that is all the beat cell shows.
function calloutSVG (spec, f, W, H, extra, region, S) {
  const reg = region || { x: 0, y: 0, w: W, h: H }
  const M = 2 * S
  const cx = f.x + f.w / 2
  const ringOut = (OV.ringInset + OV.ringStroke + OV.halo) * S
  const ring = { x: f.x - ringOut, y: f.y - ringOut, w: f.w + 2 * ringOut, h: f.h + 2 * ringOut }
  const obst = [ring, ...(extra ? [extra] : [])]
  const place = (card, avoid) => {
    const reach = NOTCH_REACH * card.k
    const gap = reach                              // so the notch's tip lands on the ring
    const clampX = v => clamp(v, reg.x + M, Math.max(reg.x + M, reg.x + reg.w - card.cardW - M))
    const clampY = v => clamp(v, reg.y + M, Math.max(reg.y + M, reg.y + reg.h - card.cardH - M))
    const cands = [
      { side: 'below', x: clampX(cx - card.cardW / 2), y: ring.y + ring.h + gap },
      { side: 'above', x: clampX(cx - card.cardW / 2), y: ring.y - gap - card.cardH },
      { side: 'right', x: ring.x + ring.w + gap, y: clampY(f.y - 6 * S) },
      { side: 'left', x: ring.x - gap - card.cardW, y: clampY(f.y - 6 * S) }
    ]
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

// ONE frame of the mirror: every captured box in house shapes, biggest first so the page chrome
// sits behind the rows and the words sit on top. `withFocus` adds the burn-in's own overlay — the
// dim, the ring, the value pill and (when `callout` carries the beat) the tour card. The GIVEN
// frame has none of it, because the given proof frame has none of it either: nothing was being
// asserted yet. It is handed `anchors` (the first beat's focus boxes, in page coordinates) instead,
// so it can show the SAME place's earlier value. `cam` is the rect the board's cell will aim its
// camera at — the beat's RING, which is what the reporter stores as the focus rect
// (tools/evidence.mjs focusFromLayout) and therefore what the crop is centred on. It is NOT always
// the element the drawing rings: a row-wide ring around a value cell frames the row.
function frameBody (L, S, W, H, withFocus, anchors = null, callout = null, cam = null) {
  const px = v => r1(v * S)
  // what the board's cell will frame: its camera is aimed at the beat's ring, so the drawing has to
  // fit its overlay inside THAT crop, not one centred on whichever element it ends up ringing
  const camPx = cam && cam.w > 0 && cam.h > 0
    ? { x: px(cam.x), y: px(cam.y), w: px(cam.w), h: px(cam.h) }
    : null
  const parts = []
  const focus = []
  // the before frame's ghosts: for each of the after frame's anchor boxes, THIS layout's element in
  // the same place. Matched up front so the main pass can skip drawing their small label — the
  // pill below says it at a size a reader can actually read.
  const ghosts = []
  for (const a of (withFocus ? [] : (anchors || []))) {
    let best = null; let bestOv = 0
    for (const e of L.els) {
      const ox = Math.max(0, Math.min(e.x + e.w, a.x + a.w) - Math.max(e.x, a.x))
      const oy = Math.max(0, Math.min(e.y + e.h, a.y + a.h) - Math.max(e.y, a.y))
      const ov = (ox * oy) / Math.max(1, Math.max(e.w * e.h, a.w * a.h))
      if (ov > bestOv) { bestOv = ov; best = e }
    }
    if (best && bestOv >= 0.4 && best.text && !ghosts.some(g => g.el === best)) ghosts.push({ a, el: best })
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
  for (const e of els) {
    if (ghosted.has(e)) continue
    const x = px(e.x); const y = px(e.y); const w = px(e.w); const h = px(e.h)
    if (w < 4 || h < 2.5) continue                    // below this a shape is a smudge, not a box
    // the ringed element is drawn by the focus pass below, at a size a person can actually read —
    // drawing its label here too would stack two copies of the same value on one another
    // the measured type rides with the box, in DRAWING units like everything else, so valueMark can
    // put the value where the page puts it instead of guessing from the box
    if (e.focus) {
      focus.push({ x, y, w, h, text: e.text, fs: e.fs ? px(e.fs) : null, ta: e.ta, pl: px(e.pl || 0), pr: px(e.pr || 0) })
      if (withFocus) continue
    }
    const fs = clamp(h * 0.62, 5, 16)
    const label = raw(e.text)
    const readable = fs >= 7.5 && !!label             // smaller than this, real text is mush — draw a bar
    const mid = y + h / 2
    switch (e.kind) {
      case 'heading':
        parts.push(readable
          ? svgText(x, mid + fs * 0.34, fs, 'ink', 'sans', say(fitText(label, w, fs)), ' font-weight="600"')
          : bar(x, r1(mid - h * 0.22), w, r1(clamp(h * 0.44, 2.5, 9)), 'var(--line2)'))
        break
      case 'text':
        parts.push(readable
          ? svgText(x, mid + fs * 0.32, fs, 'ink-3', 'sans', say(fitText(label, w, fs)))
          : bar(x, r1(mid - clamp(h * 0.3, 1.5, 3.5)), w, r1(clamp(h * 0.4, 2.5, 7)), 'var(--wash)'))
        break
      case 'input':
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="var(--paper)" stroke="var(--ai-line)" stroke-width="1"/>`)
        if (w > 16 && h > 8) parts.push(bar(r1(x + 4), r1(mid - 2), r1(Math.min(w - 8, w * 0.5)), 4, 'var(--line2)'))
        break
      case 'button':
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r1(Math.min(h / 2, 7))}" fill="var(--wash)" stroke="var(--line2)" stroke-width="0.9"/>`)
        parts.push(readable
          ? svgText(r1(x + w / 2), r1(mid + fs * 0.32), fs, 'ink-3', 'sans', say(fitText(label, w - 6, fs)), ' text-anchor="middle"')
          : bar(r1(x + w * 0.2), r1(mid - 2), r1(w * 0.6), 4, 'var(--line3)'))
        break
      case 'image':
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="var(--wash)" stroke="var(--hair)" stroke-width="0.8"/>`)
        break
      case 'row':
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="var(--paper)" stroke="var(--line)" stroke-width="0.9"/>`)
        break
      default:
        // a container earns a hairline only when it is a real region — and never when it is the
        // page shell itself, which the frame beneath already draws
        if (w >= 30 && h >= 18 && (w * h) < 0.8 * W * H) {
          parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="var(--hair)" stroke-width="0.8"/>`)
        }
    }
  }
  if (withFocus) {
    // nothing matched the ring (a canvas cell, a shadow root, an element that moved): ring the
    // MEASURED box instead, so the drawing still points at what the assertion read
    const ringPx = L.ring
      ? { x: px(L.ring.x), y: px(L.ring.y), w: px(L.ring.w), h: px(L.ring.h) }
      : null
    const marks = pickFocus(focus.length ? focus : (ringPx ? [{ ...ringPx, text: '' }] : []), ringPx)
    if (marks.length) {
      // the veil, exactly as the burn-in paints it: the WHOLE frame, the proven element included.
      // The ring and the card go over it, which is what distinguishes the element — not a hole.
      parts.push(dimWash(W, H))
      // THE CAMERA'S FRAMED REGION (2026-08-28): the beat cell shows only this much of the drawing,
      // so every mark of the overlay — the value and the card both — has to land inside it or it is
      // simply cut off screen. Aimed at the PRIMARY mark, exactly as the board aims the cell.
      const region = framedRegion(camPx || marks[0], W, H)
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
        const val = valueMark(f, measured || (f === marks[0] ? spoken : ''), W, H, !!measured, region)
        if (val.svg) { parts.push(val.svg); if (val.box) pills.push(val.box) }
      }
      // …and the requirement's own words, in the burn-in's card, beside the primary mark
      if (callout && (callout.when || callout.then)) {
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
        pr: px(g.el.pr || 0)
      }
      parts.push(valueMark(box, g.el.text, W, H, false, framedRegion(camPx || box, W, H)).svg)
    }
  }
  return parts.join('')
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
// frame k's opacity across the loop: invisible until its own transition fades it in, held until
// the next transition fades it out, and the last frame held to the reset.
function wfFade (k, t, m) {
  if (k === 0) {
    return stops([[0, 'opacity:1'], [t.segs[0].s, 'opacity:1'], [t.segs[0].m, 'opacity:0'],
      [r1(t.reset - 0.1), 'opacity:0'], [t.reset, 'opacity:1'], [100, 'opacity:1']])
  }
  if (k < m) {
    return stops([[0, 'opacity:0'], [t.segs[k - 1].s, 'opacity:0'], [t.segs[k - 1].m, 'opacity:1'],
      [t.segs[k].s, 'opacity:1'], [t.segs[k].m, 'opacity:0'], [100, 'opacity:0']])
  }
  return stops([[0, 'opacity:0'], [t.segs[m - 1].s, 'opacity:0'], [t.segs[m - 1].m, 'opacity:1'],
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
export function renderWireframe (beatLayouts, metaOrAfter, maybeMeta) {
  const asBeats = Array.isArray(beatLayouts)
  // one canonical shape for BOTH call forms, so the layout pin is the same either way
  const pairsIn = asBeats ? beatLayouts : [{ before: beatLayouts || null, after: metaOrAfter || null }]
  const meta = (asBeats ? metaOrAfter : maybeMeta) || {}
  const usable = L => (L && L.els.length ? L : null)
  const pairs = (pairsIn || []).map(p => ({
    before: usable(normLayout(p && p.before)),
    after: usable(normLayout(p && p.after)),
    // …and the beat's ASSERTED VALUES, in the order it proved them (2026-08-29): each one is a
    // scene of the beat, so the drawing ENACTS the When instead of only showing what it produced.
    values: (p && Array.isArray(p.values) ? p.values : []).map(v => usable(normLayout(v))).filter(Boolean)
  })).filter(p => p.before || p.after || p.values.length)
  if (!pairs.length) return null
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
  // claim a proof one scene before it exists.
  const cardFor = (i, done) => {
    const bt = behavior && behavior.beats[Math.min(i, behavior.beats.length - 1)]
    if (!bt) return null
    return {
      id: meta.id || '', title: meta.title || '', when: bt.when,
      then: done ? bt.then : '', pass: done ? !!meta.pass : false
    }
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
  let css = ''
  const groups = frames.map((f, i) => {
    css += `.${k} .wf${i}{animation:${kf('f' + i)} ${t.durCss} infinite}` +
      `@keyframes ${kf('f' + i)}{${wfFade(i, t, m)}}`
    return `<g class="wf${i}">${frameBody(f.L, S, LAYOUT_W, H, f.ring, f.anchors, f.card, f.cam)}</g>`
  }).join('')
  const shell = `<rect x="0.5" y="0.5" width="${LAYOUT_W - 1}" height="${H - 1}" rx="6" fill="var(--paper)" stroke="var(--line2)" stroke-width="1"/>`
  const body = shell + groups
  // ONE PARK POINT PER BEAT — what the storyboard pairs its rows against, unchanged: the Given,
  // then where each beat comes to rest (its LAST scene). A beat past what the harvest measured parks
  // on the last measured frame — the loop window is then zero-length and the board holds that still.
  const beatEnd = []                                   // frame index each harvested beat rests on
  sizes.reduce((at, k) => { beatEnd.push(at + k); return at + k }, 0)
  const phases = Array.from({ length: n + 1 }, (_, i) =>
    t.phases[i === 0 ? 0 : (beatEnd[Math.min(i, nb) - 1] || m)])
  // …and EVERY park point, grouped by beat (2026-08-29): where the beat opens, then each scene it
  // proved. The board steps this drawing in lock-step with the proof loop beside it — frame j of
  // that loop and park point j here are the same moment of the same beat — so a row plays as one
  // thing. A beat the harvest never reached publishes its resting point twice: nothing to step.
  const subphases = Array.from({ length: n }, (_, i) => {
    if (i >= nb) return [phases[i], phases[i + 1]]
    const start = beatEnd[i] - sizes[i]
    return Array.from({ length: sizes[i] + 1 }, (_, j) => t.phases[start + j])
  })
  const label = esc('wireframe schematic — the app’s own layout, drawn frame by frame: the given, then each beat' +
    (behavior
      ? '. given ' + behavior.given + '; ' +
        behavior.beats.map((x, i) => 'beat ' + (i + 1) + ': ' + x.when + ' → ' + x.then).join('; ')
      : ''))
  const svg = `<svg class="${k}" viewBox="0 0 ${LAYOUT_W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}"` +
    ` data-viz-hash="${hash}" data-viz-archetype="ui-mirror" data-viz-kind="wireframe" data-viz-layout="${lhash}"` +
    ` data-viz-kit="${MIRROR_KIT}" data-viz-beats="${n}" data-viz-frames="${m + 1}" data-viz-phases="${phases.join(' ')}"` +
    ` data-viz-subphases="${subphases.map(g => g.join(' ')).join('|')}">` +
    `<style>${css}</style>${body}</svg>`
  return { archetype: 'ui-mirror', kind: 'wireframe', svg, phases, layoutHash: lhash }
}
