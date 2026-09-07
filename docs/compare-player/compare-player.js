/* compare-player — a general COMPARISON ROW.
 *
 * One Given / When → Then beat, drawn once per SOURCE (what the spec says, what the doc and the code
 * say, what the app actually did …), every panel driven by ONE stepper so the panels are always on
 * the same moment — the same rule the board's Focus reader keeps for its Expected and Actual.
 *
 *   SBCompare.mount(rootEl, decision)          → { go(i), next(), prev(), setMode(m), destroy() }
 *
 * A DECISION is data (see decisions-*.js):
 *   { id, question, badge, badgeKind, words: { given, when, thens: [..] }, moments: [label, ..],
 *     sources: [ { id, kind: 'spec'|'doc'|'code'|'act'|'none', label, sub,
 *                  scenes: [ scene, .. ],        // one per moment, aligned by index (a short list holds its last)
 *                  notes:  [ 'this source's fact at this moment', .. ] } ],
 *     options: [ { title, fails } .. ], recommend }
 *
 * A SCENE is one of:
 *   { kind:'grid', cols:[..], widths:'1.1fr ..', rows:[{cells:[{v, face, ring, ok, cls}]}], chip:{text,tag,warn,ring,pulse},
 *     flag:'html', flagRing:true, dialog:'html', dialogRing:true,
 *     when:{ type:'type', cell:[r,c], from:'4.00%', text:'6.00%' } | { type:'pulse', target:'chip'|[r,c] } }
 *   { kind:'img', shots:[{src, w:'45%', boxes:[{l,t,w,h,ok}]}] }   // w: optional css width of the shot
 *   { kind:'empty', text }
 *   { kind:'html', html }
 *
 * PLAY MODES (the board's three): auto — each moment plays LEAD · FILM · REST once, then the row advances
 * and loops the beat; semi — the moment on show replays its gesture and waits for you; step — still.
 * The gesture is the scene's `when`: typing is performed one character at a time at the harness's pace.
 */
(function (global) {
  'use strict'
  const LEAD = 700, TYPE_MS = 55, REST = 2000, PULSE = 1800

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  function h (tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }

  // ---- scenes -------------------------------------------------------------------------------
  function drawGrid (s, stage) {
    if (s.chip) {
      const c = h('div', 'hv' + (s.chip.ring ? ' ring' : ''), `<span class="dot"></span>${s.chip.text}${s.chip.warn ? ' <span class="warn">⚠</span>' : ''}${s.chip.tag ? `<span class="tag">${esc(s.chip.tag)}</span>` : ''}`)
      c.dataset.part = 'chip'; stage.appendChild(c)
    }
    const g = h('div', 'mg'); g.style.gridTemplateColumns = s.widths || '1.1fr 1.25fr .95fr .85fr .85fr .85fr'
    s.cols.forEach(c => g.appendChild(h('div', 'h', c)))
    s.rows.forEach((r, ri) => r.cells.forEach((c, ci) => {
      const d = h('div', (c.face || '') + (c.ring ? ' ring' : '') + (c.ok ? ' ok' : '') + (c.cls ? ' ' + c.cls : '') + (ci < 2 && !c.face ? ' l' : ''), c.html != null ? c.html : esc(c.v))
      if (c.face === 'sel') d.classList.add('l')
      d.dataset.cell = ri + ',' + ci; g.appendChild(d)
    }))
    stage.appendChild(g)
    if (s.flag) stage.appendChild(h('div', 'flag' + (s.flagRing ? ' ring' : ''), s.flag))
    if (s.dialog) stage.appendChild(h('div', 'dlg' + (s.dialogRing ? ' ring' : ''), s.dialog))
  }
  function drawImg (s, stage) {
    (s.shots || []).forEach(sh => {
      const w = h('div', 'shot', `<img src="${sh.src}" alt="">`)
      if (sh.w) w.style.width = sh.w                     // a small crop keeps its size instead of filling the panel
      ;(sh.boxes || []).forEach(b => { const d = h('div', 'box' + (b.ok ? ' ok' : '')); d.style.cssText = `left:${b.l}%;top:${b.t}%;width:${b.w}%;height:${b.h}%`; w.appendChild(d) })
      stage.appendChild(w)
    })
  }
  function draw (scene, stage) {
    stage.innerHTML = ''
    if (!scene) return
    if (scene.kind === 'grid') drawGrid(scene, stage)
    else if (scene.kind === 'img') drawImg(scene, stage)
    else if (scene.kind === 'empty') stage.appendChild(h('div', 'empty', scene.text))
    else if (scene.kind === 'html') stage.innerHTML = scene.html
  }

  // ---- one panel: a source's rendering of the moment on show --------------------------------
  function panel (src) {
    const root = h('div', 'cmp-panel ' + (src.kind || 'spec'))
    root.appendChild(h('div', 'pl', esc(src.label) + (src.sub ? `<small>${src.sub}</small>` : '')))
    const chip = h('div', 'cmp-chip'); root.appendChild(chip)
    const stage = h('div', 'cmp-stage'); root.appendChild(stage)
    const note = h('div', 'cmp-note'); root.appendChild(note)
    let timers = []
    const clear = () => { timers.forEach(t => clearTimeout(t)); timers = [] }
    const sceneAt = i => src.scenes[Math.min(i, src.scenes.length - 1)]
    const noteAt = i => (src.notes || [])[Math.min(i, (src.notes || []).length - 1)] || ''

    // show moment i. phase: 'still' (step, or rest) | 'play' (perform the gesture, then still)
    function show (i, label, mode, onDone) {
      clear()
      const s = sceneAt(i)
      chip.className = 'cmp-chip' + (src.verdict ? ' ' + src.verdict : '')
      chip.innerHTML = `<span class="cl">${esc(src.short || src.label)}</span><span class="cv">${esc(label)}</span>`
      note.textContent = noteAt(i)
      const when = s && s.when
      if (mode === 'step' || !when) { draw(s, stage); stage.classList.remove('filming'); if (onDone) onDone(0); return 0 }
      // START state: the scene with the gesture not yet performed
      draw(s, stage); stage.classList.add('filming')
      let filmMs = 0
      if (when.type === 'type') {
        const cell = stage.querySelector(`[data-cell="${when.cell[0]},${when.cell[1]}"]`)
        if (cell) {
          const from = when.from == null ? '' : String(when.from), text = String(when.text)
          cell.textContent = from; cell.classList.add('typed'); cell.appendChild(h('i', 'caret'))
          const clearCut = from && !text.startsWith(from) // a clearing is one cut at the film's midpoint
          const keys = clearCut ? text.length : text.length - from.length
          filmMs = (clearCut ? TYPE_MS * 3 : 0) + Math.max(1, keys) * TYPE_MS
          timers.push(setTimeout(() => {
            let typed = clearCut ? '' : from
            const step = () => {
              if (typed.length >= text.length) return
              typed = text.slice(0, typed.length + 1); cell.textContent = typed; cell.appendChild(h('i', 'caret'))
              timers.push(setTimeout(step, TYPE_MS))
            }
            if (clearCut) { cell.textContent = ''; cell.appendChild(h('i', 'caret')); timers.push(setTimeout(step, TYPE_MS * 3)) } else step()
          }, LEAD))
        }
      } else if (when.type === 'pulse') {
        const target = when.target === 'chip' ? stage.querySelector('[data-part="chip"]') : stage.querySelector(`[data-cell="${when.target[0]},${when.target[1]}"]`)
        filmMs = PULSE
        timers.push(setTimeout(() => { if (target) target.classList.add('pulse') }, LEAD))
      }
      // REST: the moment's own still — the state the gesture LEAVES
      timers.push(setTimeout(() => { draw(s, stage); stage.classList.remove('filming'); if (onDone) onDone(LEAD + filmMs) }, LEAD + filmMs))
      return LEAD + filmMs
    }
    return { root, show, clear }
  }

  // ---- the row ---------------------------------------------------------------------------------
  function mount (rootEl, dec, opts) {
    opts = opts || {}
    const N = dec.moments.length
    const row = h('section', 'cmp'); row.id = 'cmp-' + dec.id
    row.appendChild(h('div', 'cmp-head', `<span class="id">${esc(dec.id)}</span><span class="q">${dec.question}</span>${dec.badge ? `<span class="badge${dec.badgeKind === 'mis' ? ' mis' : ''}">${esc(dec.badge)}</span>` : ''}`))

    // controls
    const ctl = h('div', 'cmp-ctl')
    const modes = h('div', 'modes'); ;['auto', 'semi', 'step'].forEach(m => { const b = h('button', '', m === 'semi' ? 'semi-auto' : m); b.dataset.mode = m; modes.appendChild(b) })
    const nav = h('span', 'nav', '<button data-nav="-1" title="previous moment">‹</button> <button data-nav="1" title="next moment">›</button>')
    const pos = h('span', 'pos'); const strip = h('div', 'cmp-strip')
    dec.moments.forEach((m, i) => { const s = h('div', 'seg', esc(m)); s.dataset.i = i; s.title = m; strip.appendChild(s) })
    ctl.append(modes, nav, pos, strip); row.appendChild(ctl)

    // body
    const body = h('div', 'cmp-body')
    const words = h('div', 'cmp-words')
    words.innerHTML = `<div class="s given"><span class="lead">Given</span>${dec.words.given}</div><div class="s when"><span class="lead">When</span>${dec.words.when}</div><div class="s then"><span class="lead">Then</span><ul>${(dec.words.thens || []).map(t => `<li>${t}</li>`).join('')}</ul></div>`
    const panelsEl = h('div', 'cmp-panels'); panelsEl.style.gridTemplateColumns = `repeat(${dec.sources.length}, minmax(0,1fr))`
    const panels = dec.sources.map(src => { const p = panel(src); panelsEl.appendChild(p.root); return p })
    body.append(words, panelsEl); row.appendChild(body)

    if (dec.options || dec.recommend) {
      const o = h('div', 'cmp-opts')
      ;(dec.options || []).forEach(op => o.appendChild(h('div', '', `<b>${op.title}</b>${op.fails ? `<span class="fm">fails: ${op.fails}</span>` : ''}`)))
      if (dec.recommend) o.appendChild(h('div', 'rec', `<b>Recommend</b> ${dec.recommend}`))
      row.appendChild(o)
    }
    rootEl.appendChild(row)

    // ---- the one stepper ----
    let i = 0, mode = opts.mode || 'semi', timer = null, alive = true
    const stop = () => { if (timer) { clearTimeout(timer); timer = null } }
    function paintWords () {
      words.querySelectorAll('.s').forEach(s => s.classList.remove('on'))
      words.querySelectorAll('.then li').forEach(li => li.classList.remove('on'))
      if (i === 0) words.querySelector('.given').classList.add('on')
      else if (i === 1) words.querySelector('.when').classList.add('on')
      else { words.querySelector('.then').classList.add('on'); const li = words.querySelectorAll('.then li')[i - 2]; if (li) li.classList.add('on') }
      strip.querySelectorAll('.seg').forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('done', k < i) })
      pos.textContent = `${i + 1} / ${N}`
      modes.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode))
    }
    function play () {
      stop(); if (!alive) return
      paintWords()
      let longest = 0, pending = panels.length
      panels.forEach(p => { const ms = p.show(i, dec.moments[i], mode, () => { pending-- }); if (ms > longest) longest = ms })
      if (mode === 'step') return
      // one clock for the row: the longest panel's LEAD+FILM, then the shared REST
      timer = setTimeout(() => {
        if (mode === 'auto') { i = (i + 1) % N; play() }
        else if (mode === 'semi') play()               // replay the moment on show; wait for you
      }, longest + REST)
    }
    const api = {
      go (k) { i = Math.max(0, Math.min(N - 1, k)); play() },
      next () { api.go((i + 1) % N) }, prev () { api.go((i - 1 + N) % N) },
      setMode (m) { mode = m; play() },
      get index () { return i }, get mode () { return mode },
      destroy () { alive = false; stop(); panels.forEach(p => p.clear()) }
    }
    modes.addEventListener('click', e => { const b = e.target.closest('button'); if (b) api.setMode(b.dataset.mode) })
    nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b) (b.dataset.nav === '1' ? api.next : api.prev)() })
    strip.addEventListener('click', e => { const s = e.target.closest('.seg'); if (s) api.go(+s.dataset.i) })
    play()
    return api
  }

  const rows = []
  function mountAll (rootEl, decisions, opts) { decisions.forEach(d => rows.push(mount(rootEl, d, opts))); return rows }
  global.SBCompare = { mount, mountAll, rows, LEAD, TYPE_MS, REST }
})(typeof window !== 'undefined' ? window : globalThis)
