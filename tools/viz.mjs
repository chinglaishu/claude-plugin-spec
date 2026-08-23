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
