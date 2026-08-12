// The board's client behaviour, authored as REAL JavaScript (no longer a string inside a template
// literal in build-board.mjs — so backticks, ${} and \n are ordinary characters and the whole
// escaping-trap class is gone). build-board reads this verbatim into a <script>, right after a JSON
// island that carries the three build-time values below. Lint/type-check this file to catch the
// logic errors the build's new Function() parse-guard cannot see.
const B = window.__BOARD__ || {}
  // The wireframe left the tool, so the home has no scaled draft thumbnails and the detail has no
  // sticky column header — there is nothing to measure and fit. safeFit stays as a harmless no-op so
  // the search / routing call sites below need no edit.
  const safeFit = () => {}

  // search ---------------------------------------------------------------
  // The whose-turn filter toggle was removed; search across requirement text is the only way to
  // narrow the board now. Per-group "N waiting" cues and the queue-clear banner still say whose turn
  // it is, so nothing about "is it my turn" was lost — only the button that filtered the whole page.
  const q = document.getElementById('q')
  function apply () {
    const term = q.value.trim().toLowerCase()
    let shown = 0
    // Search matches a card's requirement TITLES, name and route (board R9). A hidden card gets
    // .gone; a group with no visible card gets .gone too, so it hides rather than sitting empty —
    // and .card:not(.gone) / .grp:not(.gone) reflect exactly what is on screen.
    for (const c of document.querySelectorAll('#home .card')) {
      const ok = !term || c.dataset.q.includes(term)
      c.classList.toggle('gone', !ok); if (ok) shown++
    }
    for (const g of document.querySelectorAll('.grp'))
      g.classList.toggle('gone', !g.querySelector('.card:not(.gone)'))
    document.getElementById('none').style.display = shown ? 'none' : 'block'
    // Say how much is hidden. A filtered board that looks like the whole board is how you
    // conclude a screen does not exist when it is one search away.
    const tot = document.querySelectorAll('#home .card').length
    document.getElementById('shown').textContent = shown === tot ? '' : shown + ' of ' + tot
    document.querySelector('.qwrap').classList.toggle('has', !!term)
    document.getElementById('none').textContent = term
      ? 'Nothing matches “' + term + '”.' : 'Nothing matches.'
  }
  q.addEventListener('input', apply)
  document.getElementById('qx').addEventListener('click', () => { q.value = ''; apply(); q.focus() })
  for (const t of document.querySelectorAll('.tw'))
    t.addEventListener('click', () => {
      const g = t.closest('.grp'); g.classList.toggle('shut')
      t.textContent = g.classList.contains('shut') ? '+' : '—'
    })
  document.getElementById('toggle-all').addEventListener('click', e => {
    const shut = e.target.textContent.startsWith('Collapse')
    document.querySelectorAll('.grp').forEach(g => {
      g.classList.toggle('shut', shut)
      g.querySelector('.tw').textContent = shut ? '+' : '—'
    })
    e.target.textContent = shut ? 'Expand all' : 'Collapse all'
  })

  // Settings menu — a gear in the top bar holding the collapse-all toggle that used to sit on its own
  // row. Opens on click, closes on a click outside or Escape. The toggle keeps its own id and listener
  // above; this only shows and hides the sheet it now lives in, and it stays open while you flip it.
  const setbtn = document.getElementById('setbtn')
  const setmenu = document.getElementById('setmenu')
  const setMenu = open => {
    setmenu.hidden = !open
    setbtn.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  setbtn.addEventListener('click', e => { e.stopPropagation(); setMenu(setmenu.hidden) })
  document.addEventListener('click', e => {
    if (!setmenu.hidden && !e.target.closest('.setwrap')) setMenu(false)
  })
  addEventListener('keydown', e => { if (e.key === 'Escape' && !setmenu.hidden) setMenu(false) })

  // detail + routing -----------------------------------------------------
  // Every detail view has an address. Without one a refresh dumps you back on the board, the
  // back button leaves the page entirely, and a screen cannot be linked to anyone.
  const SCREENS = B.screens
  // The skills that have a baked flowchart page at #howitworks/<id>; an unknown id falls back to overview.
  const SKILL_IDS = B.skillIds
  const closeAll = () => {
    document.querySelectorAll('.dt').forEach(d => { d.hidden = true })
    // A detail is a full-screen fixed window; while it is open the PAGE must not scroll — only the two
    // panes do. Locking the body kills the "scrolling does nothing" (it was moving the hidden list
    // behind the overlay) and any overscroll bounce. Cleared here, set by show() when a detail opens.
    document.documentElement.classList.remove('noscroll')
  }
  const show = i => {
    closeAll()
    const dt = document.querySelector('.dt[data-i="' + i + '"]')
    if (!dt) return
    dt.hidden = false
    document.documentElement.classList.add('noscroll')
    // Every screen's detail is baked in, so the #reqpane / #testpane ids — and the .dbar class — the
    // tests address unscoped would not be unique. Carry them on the VISIBLE detail only: strip
    // everywhere, then set here, so each resolves to exactly one element while this detail is open.
    document.querySelectorAll('.reqpane, .testpane').forEach(p => { p.removeAttribute('id') })
    const rp = dt.querySelector('.reqpane'); if (rp) rp.id = 'reqpane'
    const tp = dt.querySelector('.testpane'); if (tp) tp.id = 'testpane'
    document.querySelectorAll('.dbarhook').forEach(b => b.classList.remove('dbar'))
    const bar = dt.querySelector('.dbarhook'); if (bar) bar.classList.add('dbar')
    safeFit()
  }
  const open = (i, push = true) => {
    show(i)
    if (push) history.pushState({ i }, '', '#/' + SCREENS[i])
  }
  const route = () => {
    // #conflicts, not #/conflicts. The slash form addresses a SCREEN, and conflicts is a view of
    // the whole spec rather than a row in it — there is also a screen called conflicts, and the
    // two must not fight over one address.
    if (location.hash === '#conflicts') {
      closeAll()
      document.getElementById('cfview').hidden = false
      loadConflicts()
      return
    }
    if (location.hash === '#init') {
      closeAll()
      document.getElementById('initview').hidden = false
      loadConfig(); loadCrawl()
      return
    }
    // #howitworks — the method overview; #howitworks/<skillId> — one skill's flowchart, focused. A
    // slash route here is its OWN thing, distinct from the #/<screen> routes handled below.
    if (location.hash === '#howitworks' || location.hash.indexOf('#howitworks/') === 0) {
      closeAll()
      document.getElementById('howview').hidden = false
      loadHow()
      const skillId = location.hash.indexOf('#howitworks/') === 0
        ? decodeURIComponent(location.hash.slice('#howitworks/'.length)) : ''
      // A known skill id opens its focused detail page; the bare route and any unknown id show overview.
      if (skillId && SKILL_IDS.indexOf(skillId) >= 0) skillShow(skillId)
      else skillReset()
      return
    }
    const name = decodeURIComponent(location.hash.replace(/^#\//, ''))
    const i = SCREENS.indexOf(name)
    if (i >= 0) show(i); else closeAll()
  }
  // Both: popstate covers back/forward, hashchange covers a URL typed or pasted into the bar of
  // an already-open board — that is a same-document navigation and never reloads the page.
  addEventListener('popstate', route)
  addEventListener('hashchange', route)

  // The WHOLE card opens the screen (board R1) — its whole content is about that one screen. The
  // cover image is the exception: it opens the zoom, a different intent from "open this screen".
  for (const c of document.querySelectorAll('#home .card'))
    c.addEventListener('click', e => {
      if (e.target.closest('img, button, a, input, label')) return
      open(c.dataset.i)
    })
  // closing the detail also tears down an open focus reader and restores the columns for next time
  function closeFocus () {
    for (const o of document.querySelectorAll('.focusov')) {
      const dtx = o.closest('.dt'); const cx = dtx && dtx.querySelector('.cols')
      if (cx) cx.style.display = ''
      o.remove()
    }
  }
  for (const b of document.querySelectorAll('.close'))
    b.addEventListener('click', () => { closeFocus(); closeAll(); history.pushState(null, '', location.pathname) })

  // THE FOCUS READER (board R13): replace the two columns with a one-requirement-per-page reader,
  // built from the screen's own requirement rows, and put the columns back on "Columns". No new
  // state — the same derived chips the columns show, one screenful each.
  function buildFocus (dt) {
    const cols = dt.querySelector('.cols'); const scroll = dt.querySelector('.dtscroll')
    if (!cols || !scroll) return
    const reqs = [].slice.call(dt.querySelectorAll('.reqpane .req')).map(function (r) {
      const idEl = r.querySelector('.id'); const ttlEl = r.querySelector('.rt'); const bodyEl = r.querySelector('.body')
      return {
        id: idEl ? idEl.textContent : '',
        state: r.getAttribute('data-state') || 'unproven',
        title: ttlEl ? ttlEl.textContent : '',
        body: bodyEl ? bodyEl.innerHTML : ''
      }
    })
    if (!reqs.length) return
    let cur = 0
    const ov = document.createElement('div'); ov.className = 'focusov'
    const head = document.createElement('div'); head.className = 'foch'
    const count = document.createElement('span'); count.className = 'fcount'
    const back = document.createElement('button'); back.className = 'btn fcols'; back.textContent = 'Columns'
    head.appendChild(count); head.appendChild(back)
    const card = document.createElement('div'); card.className = 'fcard'
    const pager = document.createElement('div'); pager.className = 'fpager'
    const prev = document.createElement('button'); prev.className = 'fnav prev'; prev.textContent = '‹'
    const dots = document.createElement('div'); dots.className = 'fdots'
    const next = document.createElement('button'); next.className = 'fnav next'; next.textContent = '›'
    pager.appendChild(prev); pager.appendChild(dots); pager.appendChild(next)
    function render () {
      const r = reqs[cur]
      card.innerHTML = ''
      const top = document.createElement('div'); top.className = 'ftop'
      const idEl = document.createElement('span'); idEl.className = 'fid'; idEl.textContent = r.id
      const chip = document.createElement('span'); chip.className = 'fchip ' + r.state
      chip.textContent = r.state === 'proven' ? '✓ proven' : '○ unproven'
      top.appendChild(idEl); top.appendChild(chip)
      const h = document.createElement('div'); h.className = 'fttl'; h.textContent = r.title
      const b = document.createElement('div'); b.className = 'fbody'; b.innerHTML = r.body
      card.appendChild(top); card.appendChild(h); card.appendChild(b)
      count.textContent = r.id + ' · ' + (cur + 1) + ' of ' + reqs.length
      prev.disabled = cur === 0; next.disabled = cur === reqs.length - 1
      dots.innerHTML = ''
      reqs.forEach(function (rr, i) {
        const d = document.createElement('button'); d.className = 'fdot ' + rr.state + (i === cur ? ' cur' : '')
        d.textContent = String(i + 1); d.title = rr.id + ' — ' + rr.title
        d.addEventListener('click', function () { cur = i; render() })
        dots.appendChild(d)
      })
    }
    prev.addEventListener('click', function () { if (cur > 0) { cur--; render() } })
    next.addEventListener('click', function () { if (cur < reqs.length - 1) { cur++; render() } })
    back.addEventListener('click', function () { ov.remove(); cols.style.display = '' })
    ov.appendChild(head); ov.appendChild(card); ov.appendChild(pager)
    cols.style.display = 'none'; scroll.appendChild(ov); render()
  }
  for (const fb of document.querySelectorAll('.focusbtn'))
    fb.addEventListener('click', e => { const dt = e.currentTarget.closest('.dt'); if (dt) { closeFocus(); buildFocus(dt) } })

  // A requirement is a title that EXPANDS to its full description (board R3); a test collapses to a
  // title + tags + status and opens to its evidence (R10). One click on the header toggles either.
  for (const h of document.querySelectorAll('.req > .h'))
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'))
  for (const h of document.querySelectorAll('.test > .th'))
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'))

  // The many-to-many link, lit on hover (board R5): hover a requirement and every test that tags it
  // lights up; hover a test and every requirement it covers lights up. Leaving clears it. Scoped to
  // the open detail so a hover never reaches across into a hidden screen's panes.
  const clearHot = () => document.querySelectorAll('.hot').forEach(e => e.classList.remove('hot'))
  for (const rq of document.querySelectorAll('.req')) {
    rq.addEventListener('mouseenter', () => {
      clearHot(); const r = rq.dataset.r; const pane = rq.closest('.dt')
      if (pane) pane.querySelectorAll('.test .tag[data-r="' + r + '"]').forEach(t => t.closest('.test').classList.add('hot'))
    })
    rq.addEventListener('mouseleave', clearHot)
  }
  for (const ts of document.querySelectorAll('.test')) {
    ts.addEventListener('mouseenter', () => {
      clearHot(); const pane = ts.closest('.dt'); if (!pane) return
      ts.querySelectorAll('.tag[data-r]').forEach(tag => {
        const rq = pane.querySelector('.req[data-r="' + tag.dataset.r + '"]'); if (rq) rq.classList.add('hot')
      })
    })
    ts.addEventListener('mouseleave', clearHot)
  }

  // The full log opens in ONE floating window (board R10), populated from the test's own log history
  // (the .tstlog the run machinery fills). No full-viewport scrim — the board stays visible behind it.
  const logsheet = document.getElementById('logsheet')
  const logbody = document.getElementById('logbody')
  for (const l of document.querySelectorAll('[data-log]'))
    l.addEventListener('click', e => {
      e.stopPropagation()
      const testEl = l.closest('.test')
      document.getElementById('logtitle').textContent = 'Full log — ' + (testEl.querySelector('.ttl').textContent || '')
      const src = testEl.querySelector('.tstlog')
      logbody.innerHTML = src ? src.innerHTML : ''
      // the copied history is a <details>; open it so the popup shows every run without another click
      logbody.querySelectorAll('details').forEach(d => { d.open = true })
      logsheet.classList.add('on')
    })
  for (const b of document.querySelectorAll('[data-logclose]'))
    b.addEventListener('click', () => logsheet.classList.remove('on'))
  document.addEventListener('keydown', e => { if (e.key === 'Escape') logsheet.classList.remove('on') })
  document.addEventListener('click', e => {
    if (logsheet.classList.contains('on') && !e.target.closest('.box') && !e.target.closest('[data-log]'))
      logsheet.classList.remove('on')
  })

  // The all-steps window (board R10): the COMPLETE raw record of the case's newest run — setup,
  // every action and check with its mark, and the trimmed-at-cap note. Inline the row shows only
  // the named beats in human words; the detail lives here, one click away, same floating card as
  // the log. Reads the record loadRuns stashed on the case's .tststeps slot.
  const stepsheet = document.getElementById('stepsheet')
  const stepsbody = document.getElementById('stepsbody')
  for (const l of document.querySelectorAll('[data-steps]'))
    l.addEventListener('click', e => {
      e.stopPropagation()
      const testEl = l.closest('.test')
      const slot = testEl.querySelector('.tststeps')
      const steps = (slot && slot._steps) || []
      document.getElementById('stepstitle').textContent =
        'All steps — ' + (testEl.querySelector('.ttl').textContent || '')
      stepsbody.innerHTML = steps.length
        ? '<ol class="stepslist rawsteps">' + steps.map(s =>
            s.cat === 'note'
              ? '<li class="snote">' + eh(s.label || '') + '</li>'
              : '<li class="scat-' + eh((s.cat || '').replace(/[^a-z]/gi, '')) + (s.ok ? '' : ' sf') +
                '" style="margin-left:' + ((s.depth || 0) * 14) + 'px">' + eh(s.label || '') + '</li>'
          ).join('') + '</ol>'
        : '<span class="nocov">No run has recorded steps for this test yet.</span>'
      stepsheet.classList.add('on')
    })
  for (const b of document.querySelectorAll('[data-stepsclose]'))
    b.addEventListener('click', () => stepsheet.classList.remove('on'))
  document.addEventListener('keydown', e => { if (e.key === 'Escape') stepsheet.classList.remove('on') })
  document.addEventListener('click', e => {
    if (stepsheet.classList.contains('on') && !e.target.closest('.box') && !e.target.closest('[data-steps]'))
      stepsheet.classList.remove('on')
  })

  // Clearing the queue is the real motion — sit down, go through everything, leave. Without this
  // every screen costs a close, a scroll and a hunt for the next one still showing something that
  // needs you.
  const WAITING = B.waiting
  for (const b of document.querySelectorAll('.nextw')) {
    if (WAITING.length < 2) { b.hidden = true; continue }
    b.addEventListener('click', () => {
      const here = Number(b.dataset.i)
      const next = WAITING.find(i => i > here) ?? WAITING[0]
      document.querySelectorAll('.dt').forEach(d => { d.hidden = true })
      open(next)
      scrollTo(0, 0)
    })
  }
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return
    if (e.key === 'Escape') {
      if (!document.getElementById('lb').hidden) { document.getElementById('lb').hidden = true; return }
      if (!document.getElementById('runpanel').hidden) { document.getElementById('rpclose').click(); return }
      // on a skill detail page, Esc first steps back to the #howitworks overview (real history back)
      if (!document.getElementById('howview').hidden && !document.getElementById('skilldetail').hidden) { history.back(); return }
      closeAll(); history.pushState(null, '', location.pathname)
    }
    const openDt = [...document.querySelectorAll('.dt')].find(d => !d.hidden)
    if (openDt && (e.key === 'j' || e.key === 'ArrowRight')) openDt.querySelector('.nextw').click()
    if (openDt && e.key === 'r') { const b = openDt.querySelector('.runbtn'); if (b) b.click() }
  })

  // toast ----------------------------------------------------------------
  // A small transient message, shared by the handlers below (runs, config, conflicts, update). There
  // is no acceptance gate to wire (board R8) — a requirement is the source of truth as written.
  function toast (msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg
    document.body.appendChild(t); setTimeout(() => t.remove(), 5000)
  }

  // conflicts ------------------------------------------------------------
  // NOTE FOR ANYONE EDITING THIS FILE: every line below is emitted inside a JS template literal,
  // so a backtick here becomes the end of the board's HTML and an unescaped newline becomes real
  // whitespace. That has shipped a page with every listener dead, twice. String concatenation
  // only, and \n where a newline is meant.
  const cfview = document.getElementById('cfview')
  const cfcount = document.getElementById('cfcount')
  let CF = { findings: [], open: [], settled: [], scanned: false, scannedAt: null }
  // A pick you have made but not committed. It lives in the page, never on disk: choosing a side
  // is not the same act as settling the question, and writing on the first click would mean a
  // stray tap on a quote had already decided which requirement is canon.
  const picked = {}

  const eh = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // 'spec/init/prd.md · R2' names a requirement; the rewrite targets the FILE.
  const fileOf = src => String(src || '').split('·')[0].trim()
  const when = iso => String(iso || '').replace('T', ' ').slice(0, 16)

  function sideHtml (f, which) {
    const s = f[which] || {}
    const on = picked[f.key] === which
    return '<div class="side' + (on ? ' picked' : '') + '" data-side="' + which + '">' +
      '<div class="src">' + eh(s.source) + '</div>' +
      '<p class="quote">' + eh(s.quote) + '</p>' +
      '<div class="pick"><span class="radio' + (on ? ' on' : '') + '"></span>This is canon</div></div>'
  }

  function cardHtml (f) {
    const pick = picked[f.key]
    const loser = pick ? fileOf((pick === 'a' ? f.b : f.a).source) : ''
    return '<div class="cf" data-key="' + eh(f.key) + '">' +
      '<header><span class="chip stale"><span class="mark h"></span>open</span>' +
      '<span class="sub">' + eh(f.subject) + '</span><span class="grow"></span>' +
      '<span class="imp">' + eh(f.impact || '') + '</span></header>' +
      '<div class="two">' + sideHtml(f, 'a') + sideHtml(f, 'b') + '</div>' +
      '<div class="cfoot">' +
      '<button class="btn pri" data-resolve' + (pick ? '' : ' disabled') + '>' +
      (pick ? 'Resolve — rewrite ' + eh(loser) : 'Pick a side first') + '</button>' +
      '<div class="note"><input class="input cfnote" ' +
      'placeholder="Note — carried into the rewrite job"></div></div></div>'
  }

  function rowHtml (f) {
    const d = f.decision || {}
    return '<div class="srow" data-key="' + eh(f.key) + '">' +
      '<span class="chip ok"><span class="dot"></span>settled</span>' +
      '<span class="w">' + eh(f.subject) + '</span><span class="grow"></span>' +
      '<span class="gbn">' + eh(d.won) + ' won · ' + eh(when(d.at)) + '</span>' +
      '<button class="btn sm" data-rewrite>Rewrite ' + eh(d.lost) + '</button>' +
      '<button class="btn sm gh" data-undo>Undo</button></div>'
  }

  const cfTab = () => document.querySelector('#cfseg .on').dataset.cf
  function setTab (v) {
    for (const b of document.querySelectorAll('#cfseg button')) b.classList.toggle('on', b.dataset.cf === v)
    renderConflicts()
  }

  function renderConflicts () {
    const tab = cfTab()
    for (const b of document.querySelectorAll('#cfseg button'))
      b.textContent = (b.dataset.cf === 'open' ? 'Open ' : 'Settled ') +
        (b.dataset.cf === 'open' ? CF.open.length : CF.settled.length)

    const openWrap = document.getElementById('cfopen')
    const setWrap = document.getElementById('cfsettled')
    openWrap.innerHTML = CF.open.map(cardHtml).join('')
    setWrap.innerHTML = CF.settled.length
      ? '<div class="srows">' + CF.settled.map(rowHtml).join('') + '</div>' : ''
    openWrap.hidden = tab !== 'open'
    setWrap.hidden = tab !== 'settled'

    // Never scanned and scanned-finding-nothing are DIFFERENT answers, and only one of them means
    // there is nothing to worry about. Collapsing them would let an empty list read as a clean
    // bill of health for a project nobody has ever looked at.
    const empty = document.getElementById('cfempty')
    const none = tab === 'open' ? !CF.open.length : !CF.settled.length
    empty.hidden = !none
    empty.innerHTML = tab === 'settled'
      ? 'Nothing has been settled yet.'
      : !CF.scanned
        ? 'No scan has run yet.<br>Rescan reads every <code>prd.md</code> and looks for one fact stated two incompatible ways.'
        : 'Nothing contradicts anything else.<br>Rescan after the next batch of requirements.'
    document.getElementById('cfwhen').textContent =
      CF.scannedAt ? 'last scanned ' + when(CF.scannedAt) : ''
    cfcount.hidden = !CF.open.length
    cfcount.textContent = CF.open.length
  }

  async function loadConflicts () {
    try { CF = await (await fetch('/api/conflicts')).json() } catch (e) { return }
    renderConflicts()
  }

  async function cfPost (path, body) {
    try {
      const r = await fetch(path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.text()).slice(0, 160))
      return true
    } catch (err) { toast(err.message); return false }
  }

  // Delegated, because the list is re-rendered after every decision and per-node listeners would
  // be attached to elements that no longer exist.
  cfview.addEventListener('click', async e => {
    const side = e.target.closest('.side')
    if (side) {
      picked[side.closest('.cf').dataset.key] = side.dataset.side
      renderConflicts()
      return
    }
    const res = e.target.closest('[data-resolve]')
    if (res) {
      const card = res.closest('.cf')
      const key = card.dataset.key
      if (!picked[key]) return
      const note = card.querySelector('.cfnote').value
      // read these off the card BEFORE the re-render throws it away — the toast names them
      const subject = card.querySelector('.sub').textContent
      const winEl = card.querySelector('.side.picked .src')
      const winner = fileOf(winEl ? winEl.textContent : '')
      if (!await cfPost('/api/conflict', { key: key, canon: picked[key], note: note })) return
      delete picked[key]
      await loadConflicts()
      // STAY on the Open list (conflicts R4) — the next open conflict is right where you were;
      // working a queue must not cost a tab round-trip per decision. The card leaving quietly is
      // NOT silent: the Settled count ticks up and this toast names what was settled, so a
      // misclick is still distinguishable from nothing having happened.
      toast('Settled — ' + subject + ' · ' + winner + ' won')
      return
    }
    const undo = e.target.closest('[data-undo]')
    if (undo) {
      const row = undo.closest('.srow')
      const key = row.dataset.key
      const subject = row.querySelector('.w').textContent
      if (!await cfPost('/api/conflict', { key: key, undo: true })) return
      await loadConflicts()
      // same rule the other way: undoing from the Settled list keeps you on it (conflicts R4)
      toast('Reopened — ' + subject + ' is back under Open')
      return
    }
    const rw = e.target.closest('[data-rewrite]')
    if (rw) {
      const key = rw.closest('.srow').dataset.key
      openPanel('rewriting', rw.textContent.replace('Rewrite ', ''))
      if (!await cfPost('/api/rewrite', { key: key })) panelRefused('a job is already in progress')
    }
  })

  for (const b of document.querySelectorAll('#cfseg button'))
    b.addEventListener('click', () => setTab(b.dataset.cf))

  document.getElementById('cfscan').addEventListener('click', async () => {
    openPanel('scanning', 'every prd.md')
    if (!await cfPost('/api/scan', {})) panelRefused('a job is already in progress')
  })

  document.getElementById('cfbtn').addEventListener('click', () => {
    history.pushState(null, '', '#conflicts')
    route()
  })

  // The header count has to be right on the board too, not only inside the conflicts view — an
  // open contradiction you cannot see from the board is one you never go and settle. So load it
  // once at startup regardless of the current route.
  loadConflicts()

  // init -----------------------------------------------------------------
  const initview = document.getElementById('initview')
  const initMode = () => document.querySelector('#initmode .on').dataset.mode
  function setInitMode (m) {
    for (const b of document.querySelectorAll('#initmode button')) b.classList.toggle('on', b.dataset.mode === m)
    document.getElementById('initstartfld').hidden = m !== 'start'
  }
  for (const b of document.querySelectorAll('#initmode button'))
    b.addEventListener('click', () => setInitMode(b.dataset.mode))

  const storeHints = {
    local: 'Kept under spec/_runs/ and pruned with the run log — nothing leaves your machine.',
    git: 'Each run\'s shots are committed to this branch in an isolated worktree (your working tree is untouched). It stays local unless you tick push.',
    bucket: 'Each run\'s shots are PUT to this base URL (base/runId/name) and the board loads them from there, so they outlive the local prune. The endpoint must accept the PUT.'
  }
  function setStore (w) {
    for (const b of document.querySelectorAll('#initstore button')) b.classList.toggle('on', b.dataset.store === w)
    document.getElementById('initgitbranch').hidden = w !== 'git'
    document.getElementById('initpushwrap').hidden = w !== 'git'
    document.getElementById('initbucket').hidden = w !== 'bucket'
    document.getElementById('initstorehint').textContent = storeHints[w] || storeHints.local
  }
  for (const b of document.querySelectorAll('#initstore button'))
    b.addEventListener('click', () => setStore(b.dataset.store))
  const storeWhere = () => document.querySelector('#initstore .on').dataset.store

  async function loadConfig () {
    let cfg
    try { cfg = await (await fetch('/api/config')).json() } catch (e) { return }
    setInitMode(cfg.mode || 'attach')
    document.getElementById('initbackendcmd').value = cfg.backendCommand || ''
    document.getElementById('initbackendurl').value = cfg.backendUrl || ''
    document.getElementById('initfrontendcmd').value = cfg.frontendCommand || ''
    document.getElementById('initurl').value = cfg.baseUrl || ''
    document.getElementById('initroutes').value = (cfg.routes || []).join('\n')
    document.getElementById('initsignin').value = cfg.signIn || ''
    document.getElementById('initstepdelay').value = cfg.stepDelayMs == null ? 300 : cfg.stepDelayMs
    const st = cfg.storage || { where: 'local' }
    setStore(st.where || 'local')
    document.getElementById('initgitbranch').value = st.gitBranch || ''
    document.getElementById('initpush').checked = !!st.push
    document.getElementById('initbucket').value = st.bucketUrl || ''
  }

  function foundRow (r) {
    // 'yours' — a real PRD the human wrote — is never touched; a guessed row already on the board is
    // still a guess; a route with no screen yet is new. R5: rerunning leaves settled work alone.
    const state = r.mine ? 'yours' : r.exists ? 'a guess, already on board' : 'new'
    const thumb = r.exists || r.slug
      ? '<div class="fthumb"><img src="spec/' + eh(r.slug) + '/crawl.png" onerror="this.style.display=\'none\'" alt=""></div>'
      : '<div class="fthumb"></div>'
    return '<div class="frow" data-slug="' + eh(r.slug) + '">' + thumb +
      '<div><div class="frt">' + eh(r.route) + '</div>' +
      (r.title ? '<div class="fname">' + eh(r.title) + '</div>' : '') + '</div>' +
      '<span class="fst">' + state + '</span></div>'
  }

  async function loadCrawl () {
    let data
    try { data = await (await fetch('/api/crawl')).json() } catch (e) { return }
    const found = document.getElementById('initfound')
    const empty = document.getElementById('initempty')
    found.innerHTML = data.routes.map(foundRow).join('')
    // never-crawled and crawled-found-nothing are different answers. Only the second is greenfield
    // — the same flow with a zero result, and it says what to do next rather than looking broken.
    const greenfield = !!data.crawledAt && !data.routes.length
    empty.hidden = data.routes.length > 0
    empty.innerHTML = greenfield
      ? 'Nothing was found to crawl.<br>That is the greenfield case — <b>write the first PRD</b> and the board grows from there.'
      : 'No crawl has run yet.<br>Point at your app on the left, then <b>Crawl the app</b>.'
    document.getElementById('initwhen').textContent = data.crawledAt ? 'crawled ' + when(data.crawledAt) : ''
  }

  async function saveConfig () {
    const body = {
      mode: initMode(),
      backendCommand: document.getElementById('initbackendcmd').value,
      backendUrl: document.getElementById('initbackendurl').value,
      frontendCommand: document.getElementById('initfrontendcmd').value,
      baseUrl: document.getElementById('initurl').value,
      routes: document.getElementById('initroutes').value,
      signIn: document.getElementById('initsignin').value,
      stepDelayMs: Number(document.getElementById('initstepdelay').value),
      storage: {
        where: storeWhere(),
        gitBranch: document.getElementById('initgitbranch').value,
        push: document.getElementById('initpush').checked,
        bucketUrl: document.getElementById('initbucket').value
      }
    }
    const r = await fetch('/api/config', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!r.ok) throw new Error((await r.text()).slice(0, 160))
    return r.json()
  }

  document.getElementById('initsave').addEventListener('click', async () => {
    try {
      await saveConfig()
      const saved = document.getElementById('initsaved')
      saved.hidden = false; setTimeout(() => { saved.hidden = true }, 2000)
    } catch (err) { toast(err.message) }
  })

  document.getElementById('initcrawl').addEventListener('click', async () => {
    // save first, so the crawl reads exactly what is on screen, then run the real job in the panel
    try { await saveConfig() } catch (err) { toast(err.message); return }
    openPanel('crawling', 'the app')
    try {
      const r = await fetch('/api/crawl', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
      })
      if (!r.ok) throw new Error((await r.text()).slice(0, 160))
    } catch (err) { panelRefused(err.message) }
  })

  document.getElementById('initbtn').addEventListener('click', () => {
    history.pushState(null, '', '#init'); route()
  })

  // update available -> update -------------------------------------------
  // The vendored board is brought to a new specboard release with a CLICK, never a terminal command.
  // /api/update-status reports current vs latest; /api/update runs the plugin's kg-update against this
  // project, rebuilds board.html, and reports. The board is expected to run under node --watch, so
  // update.mjs overwriting tools/serve-board.mjs restarts the process — which drops this request's
  // socket. That is treated as success-in-progress: poll status, then reload onto the new code.
  // Emitted inside the template literal: string concatenation only, \n for newlines, no backticks.
  const updwrap = document.getElementById('updwrap')
  const updbtn = document.getElementById('updbtn')
  const updmsg = document.getElementById('updmsg')
  const updsetup = document.getElementById('updsetup')
  let updBusy = false

  // the .new files a conflicting update wrote alongside your edits, pulled from update.mjs's report
  function newFilesFrom (report) {
    const out = []
    for (const line of String(report || '').split('\n')) {
      const m = line.match(/new → ([^)]+)/)
      if (m) out.push(m[1].trim())
    }
    return out
  }

  // The --watch restart drops the socket mid-update. Wait for the new server to answer, then reload
  // onto the freshly built board running the new code.
  async function pollUntilBack () {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1500))
      try {
        const r = await fetch('/api/update-status', { cache: 'no-store' })
        if (r.ok) { location.reload(); return }
      } catch (e) { /* still restarting */ }
    }
    updmsg.textContent = 'still restarting — reload the page in a moment'
  }

  async function doUpdate () {
    if (updBusy) return
    updBusy = true
    updbtn.disabled = true
    updbtn.textContent = 'Updating…'
    let res
    try {
      res = await fetch('/api/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    } catch (e) {
      // the socket dropped — almost certainly the node --watch restart. Treat as in-progress.
      updmsg.textContent = 'Updating… reconnecting'
      pollUntilBack()
      return
    }
    let data = {}
    try { data = await res.json() } catch (e) { /* non-JSON body */ }
    if (data.conflicts) {
      const news = newFilesFrom(data.report)
      updbtn.textContent = 'Merge needed'
      updmsg.textContent = 'updated with conflicts to merge: ' + (news.join(', ') || 'see the report')
      toast('Updated with conflicts to merge — resolve then delete: ' + (news.join(', ') || '(see the update report)'))
      updBusy = false
      return
    }
    if (data.ok) {
      updbtn.textContent = 'Updated'
      updmsg.textContent = 'updated to ' + (data.version || 'the new release') + ' — reloading…'
      setTimeout(function () { location.reload() }, 1500)
      return
    }
    // a non-zero exit that is not a conflict — surface the report and let them retry
    updbtn.disabled = false
    updbtn.textContent = 'Retry update'
    updmsg.textContent = 'update did not complete'
    toast('Update did not complete: ' + String(data.report || '').slice(0, 300))
    updBusy = false
  }

  if (updbtn) updbtn.addEventListener('click', doUpdate)

  async function loadUpdateStatus () {
    let s
    try { s = await (await fetch('/api/update-status', { cache: 'no-store' })).json() } catch (e) { return }
    const avail = 'specboard ' + s.latest + " available — you're on " + (s.current || '?')
    if (s.updateAvailable) {
      updmsg.textContent = avail
      updwrap.hidden = false
      if (updsetup) { updsetup.textContent = avail + '. Update from the top bar.'; updsetup.className = 'updsetup avail'; updsetup.hidden = false }
    } else {
      updwrap.hidden = true
      if (updsetup && s.current) { updsetup.textContent = 'specboard ' + s.current + ' — up to date.'; updsetup.className = 'updsetup'; updsetup.hidden = false }
    }
  }
  loadUpdateStatus()

  // how does it work -----------------------------------------------------
  // The four specboard skills are baked as flowcharts at build time. Only what the PROJECT adds under
  // .claude/ is live: loadHow fetches /api/capabilities and renders that project's own skills & agents
  // as cards below the flowcharts. Emitted inside the template literal, so: string concatenation only,
  // \n for a newline, and no backticks (see the conflicts note above).
  function scardHtml (c) {
    const when = c.kind === 'agent' ? 'a project agent' : 'a project skill'
    return '<div class="scard"><span class="stag">' + eh(c.kind || 'skill') + '</span>' +
      '<h3>' + eh(c.name) + '</h3><p>' + eh(c.description) + '</p>' +
      '<div class="when">' + eh(when) + '</div></div>'
  }
  async function loadHow () {
    const sect = document.getElementById('howprojsect')
    const box = document.getElementById('howskills')
    let data
    // The flowcharts are baked and always shown; only the project cards need the server. A failed or
    // empty fetch just leaves this optional section hidden rather than surfacing an error on the page.
    try { data = await (await fetch('/api/capabilities')).json() } catch (e) { sect.hidden = true; return }
    const proj = (data.capabilities || []).filter(c => c.source === 'project')
    if (!proj.length) { sect.hidden = true; return }
    box.innerHTML = '<div class="skills">' + proj.map(scardHtml).join('') + '</div>'
    sect.hidden = false
  }

  // The four skill flowcharts are URL-driven pages under #howitworks/<skillId>. The router calls these
  // view updaters; they never touch history themselves. The panels are all baked into the DOM
  // (howFlowcharts) and hidden by CSS — showing one just gives it .open and hides the whole overview.
  // Emitted in the template literal, so: + concatenation, no backticks, and no unescaped newlines.
  function skillShow (id) {
    const panels = document.querySelectorAll('#howview .flow-panel')
    for (let i = 0; i < panels.length; i++) {
      panels[i].classList.toggle('open', panels[i].getAttribute('data-skill') === id)
    }
    // #skilldetail lives inside the collapsed #fullmethod <details>. A direct #howitworks/<skillId>
    // cold load would strand it inside a closed disclosure and render blank — so OPEN the disclosure
    // whenever a skill routes (board R11, the guide's routing).
    const fm = document.getElementById('fullmethod')
    if (fm) fm.open = true
    document.getElementById('howoverview').hidden = true
    document.getElementById('skilldetail').hidden = false
    const back = document.getElementById('skillback')
    if (back) back.focus()
  }
  function skillReset () {
    const detail = document.getElementById('skilldetail')
    const overview = document.getElementById('howoverview')
    if (detail) detail.hidden = true
    if (overview) overview.hidden = false
    const open = document.querySelectorAll('#howview .flow-panel.open')
    for (let i = 0; i < open.length; i++) open[i].classList.remove('open')
    // Backing out of a deep skill re-collapses the full method (board R11), so the walkthrough
    // — not the reference it opened into — leads again the next time this view is seen.
    const fm = document.getElementById('fullmethod')
    if (fm) fm.open = false
  }
  // Clicking a summary NAVIGATES (pushState + route), so it lands in real history; browser Back then
  // returns to the overview. The back control and Esc both step back the same way.
  const skillCards = document.querySelectorAll('#howview .skill-summary')
  for (let i = 0; i < skillCards.length; i++) {
    skillCards[i].addEventListener('click', function () {
      history.pushState(null, '', '#howitworks/' + encodeURIComponent(this.getAttribute('data-skill'))); route()
    })
  }
  const skillBackBtn = document.getElementById('skillback')
  if (skillBackBtn) skillBackBtn.addEventListener('click', function () { history.back() })

  document.getElementById('howbtn').addEventListener('click', () => {
    history.pushState(null, '', '#howitworks'); route()
  })

  // The walkthrough steps on click and HOLDS (board R11). Each .act is its own mini-stepper through
  // its own .wsteps: one .on step at a time, Prev/Next and the arrow keys advance it, clamped at the
  // ends. Nothing here ever auto-advances — no setTimeout/setInterval touches a step, so the pinned
  // verdict stays put once it is revealed. Emitted in the template literal: plain quotes, +
  // concatenation, no backticks.
  const wsteppers = []
  const wacts = document.querySelectorAll('#walkthrough .act')
  for (let ai = 0; ai < wacts.length; ai++) {
    const act = wacts[ai]
    const steps = act.querySelectorAll('.wstep')
    if (!steps.length) continue
    const prevb = act.querySelector('[data-wprev]')
    const nextb = act.querySelector('[data-wnext]')
    const count = act.querySelector('.wcount')
    let idx = 0
    for (let si = 0; si < steps.length; si++) if (steps[si].classList.contains('on')) idx = si
    const render = function () {
      for (let si = 0; si < steps.length; si++) steps[si].classList.toggle('on', si === idx)
      if (prevb) prevb.disabled = idx === 0
      if (nextb) nextb.disabled = idx === steps.length - 1
      if (count) count.textContent = (idx + 1) + ' / ' + steps.length
    }
    const go = function (d) {
      const n = Math.min(steps.length - 1, Math.max(0, idx + d))
      if (n !== idx) { idx = n; render() }
    }
    if (prevb) prevb.addEventListener('click', function () { go(-1) })
    if (nextb) nextb.addEventListener('click', function () { go(1) })
    wsteppers.push({ act: act, go: go })
    render()
  }
  // Arrow keys drive whichever act is nearest the middle of the viewport — but NEVER while the caret
  // is in an input/textarea (the board has a search box), so typing is not hijacked, and only while
  // the guide is the open view.
  if (wsteppers.length) document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    const how = document.getElementById('howview')
    if (!how || how.hidden) return
    let best = null, bestd = Infinity
    for (let i = 0; i < wsteppers.length; i++) {
      const r = wsteppers[i].act.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= innerHeight) continue
      const d = Math.abs((r.top + r.bottom) / 2 - innerHeight / 2)
      if (d < bestd) { bestd = d; best = wsteppers[i] }
    }
    if (best) { best.go(e.key === 'ArrowRight' ? 1 : -1); e.preventDefault() }
  })

  route()

  // running the suite ----------------------------------------------------
  const panel = document.getElementById('runpanel')
  const rplog = document.getElementById('rplog')
  const rpchip = document.getElementById('rpchip')
  let runDone = false
  // The run this PAGE is being driven by, if any. A spec proving the run panel opens the board with
  // ?runid=<its own run> so the Run it clicks can nest inside that run instead of being refused by
  // it (dispatch R4). A person's browser carries no runid, so a person clicking Run twice is still
  // refused — which is the whole point of the slot.
  const PARENT = new URLSearchParams(location.search).get('runid') || ''

  // ONE panel for every kind of job — tests, a redraft, a scan, a PRD rewrite. A job is a job,
  // and a second panel would be a second place to look for "is something actually happening".
  function openPanel (what, title) {
    rplog.textContent = ''
    runDone = false
    rpchip.className = 'chip run'
    rpchip.innerHTML = '<span class="dot"></span>' + what
    document.getElementById('rptitle').textContent = title
    document.getElementById('rpcancel').disabled = false
    panel.hidden = false
  }
  // A refusal has to be ACTIONABLE. "A run is already in progress" states that you cannot start and
  // says nothing about how to get out of it — and it used to disable Cancel too, which removed the
  // one control that would clear the block. So: name the job that is in the way, say the two ways
  // out, and leave Cancel live, because cancelling that job IS the way out (dispatch R4).
  async function panelRefused (msg) {
    rpchip.className = 'chip bad'
    rpchip.textContent = 'refused'
    let busy = ''
    if (/in progress/i.test(msg)) {
      try { busy = (await (await fetch('/api/runs')).json()).running || '' } catch (e) { busy = '' }
    }
    rplog.textContent = busy
      ? busy + ' is already running — one job at a time, so this one was refused.\n\n' +
        'To clear it: press Cancel to stop that job, or wait for it to finish and run this again.\n' +
        'Its output keeps streaming below.\n\n'
      : msg
    runDone = true
    // only meaningful while something is actually running — cancelling nothing is refused anyway
    document.getElementById('rpcancel').disabled = !busy
  }

  async function runTests (screen, opts) {
    const o = opts || {}
    const what = o.headed ? 'watching' : 'running'
    const title = (o.grep ? o.grep : screen ? screen + ' · test.spec.ts' : 'all tests') +
      (o.headed ? ' · in a visible browser' : '')
    openPanel(what, title)
    if (o.headed) {
      rplog.textContent = 'A browser window is opening — it drives the app in front of you.\n' +
        'It closes itself when the test finishes.\n\n'
    }
    try {
      const res = await fetch('/api/run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ screen, grep: o.grep, headed: !!o.headed, parent: PARENT })
      })
      if (!res.ok) throw new Error((await res.text()).slice(0, 120))
    } catch (err) { panelRefused(err.message) }
  }
  // A job you cannot stop is a job you have to sit out. A scan or crawl runs for minutes, so noticing
  // ten seconds in that you started the wrong one should cost ten seconds, not four minutes.
  document.getElementById('rpcancel').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/cancel', { method: 'POST' })
      if (!res.ok) throw new Error((await res.text()).slice(0, 120))
      document.getElementById('rpcancel').disabled = true
    } catch (err) { toast(err.message) }
  })
  for (const b of document.querySelectorAll('.runbtn'))
    b.addEventListener('click', () => runTests(b.dataset.run))
  // Watch it run: a real browser window opens and drives the app in front of you. This is what
  // people mean by watching a test — the re-run-on-save switch is a different thing entirely.
  for (const b of document.querySelectorAll('.headed'))
    b.addEventListener('click', () => runTests(b.dataset.run, { headed: true }))
  // ONE test, not the whole file.
  for (const b of document.querySelectorAll('.runone'))
    b.addEventListener('click', () => runTests(b.dataset.run, {
      grep: b.dataset.grep, headed: b.dataset.headed === '1'
    }))
  // Watch, per screen, from the detail view — one global switch, mirrored on every copy so it
  // never disagrees with itself. Ticking it re-runs this screen whenever its files change.
  for (const w of document.querySelectorAll('.dwatch'))
    w.addEventListener('change', () => setWatch(w.checked))
  document.getElementById('rpclose').addEventListener('click', () => {
    panel.hidden = true
    // R7: the panel is dismissed only here, by hand. A finished run changed the board, so leaving
    // the panel is the moment to show it — but nothing closes the panel on your behalf.
    if (runDone) location.reload()
  })

  const runflag = document.getElementById('runflag')
  // A run lights this chip. Watch mode starts runs nobody clicked, so the chip is also the way back
  // into a run that is streaming with the panel closed — clicking it opens the panel.
  const setRunning = on => { runflag.hidden = !on }
  runflag.style.cursor = 'pointer'
  runflag.title = 'a run is in progress — click to open its panel'
  runflag.addEventListener('click', () => { panel.hidden = false })

  // Watch: re-run the moment a PRD, draft or spec changes, so the E2E column stops being the one
  // cell you have to remember to refresh by hand. One switch, mirrored onto every per-screen copy in
  // the detail views, so they never disagree about whether watch is on. (The old board-wide header
  // watch checkbox was removed; watch now lives only where a single screen is run.)
  function syncWatch (on) {
    for (const w of document.querySelectorAll('.dwatch')) w.checked = on
  }
  async function setWatch (on) {
    syncWatch(on)
    await fetch('/api/watch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on })
    }).catch(() => {})
  }

  // Per-test records are fetched rather than baked in — the board is rebuilt by a run, so a record
  // written into the HTML would always be one run behind itself.
  async function loadRuns () {
    let data
    try { data = await (await fetch('/api/runs')).json() } catch (e) { return }
    syncWatch(!!data.watch)
    setRunning(!!data.running)
    for (const panel of document.querySelectorAll('.testpane')) {
      const dt = panel.closest('.dt')
      const screen = dt && dt.dataset.screen
      if (!screen) continue

      // The RECORD, shown UNDER each test — what THAT test saw, not a heap of images under all of
      // them. FOLDED across runs, never read out of a single one: a run filtered to one test records
      // only that test, so taking every case's record from "the newest run" strips the steps and the
      // log off every case that run did not include. Walk newest to oldest and let each case keep the
      // newest record that actually covers IT (dispatch R8) — the same fold the results index needs,
      // for the same reason.
      // HISTORY, not just the newest: each case collects its last ten runs, newest first, so a red
      // case can be read against when it started failing and which commit it ran on. rec[title][0]
      // is the newest, which is what the steps and the shots come from.
      const rec = {}
      for (const r of data.runs) {
        if (r.screen !== screen && r.screen !== 'all') continue
        for (const title of Object.keys(r.shotsByTest || {})) {
          if (!rec[title]) rec[title] = []
          // carry the runId (and whether a whole-log file exists) so the case's log can link out to
          // the WHOLE run log — the per-case log is that case's stdout/stderr/error (bounded); run.log
          // is the entire process output, including globalSetup / seed output and the untruncated tail,
          // which the per-case view never had. A CLI run has no run.log, so the link is withheld.
          if (rec[title].length < 10) rec[title].push({ ...r.shotsByTest[title], runId: r.runId, hasLog: !!r.hasLog })
        }
      }
      // The RECORDING is the test's cover and its ONE artifact (board R10): the last asserted frame
      // as a still, and — when a board-started run captured a .webm — it PLAYS on click, swapping the
      // still for an inline video. A plain CLI run captures no video, so the still stays the cover and
      // there is nothing to play: never a fake play affordance, and never a separate screenshot strip.
      for (const slot of panel.querySelectorAll('.rec')) {
        const host = slot.closest('.test')
        // The RECORDING (cover + ▶) is board-only and must OUTLIVE a later video-less CLI run: a
        // headless run updates a case's status/steps (the overlay block below) but captures no .webm
        // and no shots, so if it lands newest it must NOT blank the last real recording. Draw the
        // cover/video from the most recent run that actually captured one — status/steps still come
        // from the newest run. (CLAUDE.md: shots stay board-only, folded never replaced.)
        const hist = rec[host && host.dataset.title] || []
        const one = hist.find(x => (x.shots && x.shots.length) || x.video) || hist[0]
        const lab = slot.querySelector('.lab')
        const label = '<span class="lab">' + eh(lab ? lab.textContent : '') + '</span>'
        const shots = (one && one.shots) || []
        const still = shots[shots.length - 1]        // the end state it proved — the cover frame
        slot.style.backgroundImage = still ? 'url("' + still + '")' : ''
        if (one && one.video) {
          slot.classList.add('playable')
          slot.innerHTML = '<span class="play">▶</span>' + label
          slot.onclick = () => {
            slot.onclick = null; slot.classList.remove('playable')
            // The large size is STICKY from the moment the player exists: pausing and SEEKING both
            // fire pause/play events, and a size that jumped on every scrub was unusable.
            slot.classList.add('playing')
            // No board-side overlay on the player: the recording NARRATES ITSELF — the harness
            // paints a topbar into the page while the test runs (spec/_base.ts checkReq/hudCheck),
            // so what-is-being-proven and expected-vs-actual are burned into the video's own
            // frames and its cover (board R10).
            slot.innerHTML = '<video controls autoplay playsinline src="' + one.video + '"></video>' + label
            const v = slot.querySelector('video')
            // MediaRecorder webm has no duration header, so the timeline starts unscrubbable.
            // Force the browser's end-of-file probe (needs the server's Range support): jump far
            // past the end once metadata lands, then snap back — duration resolves and seeking works.
            v.addEventListener('loadedmetadata', () => {
              if (v.duration === Infinity) {
                const back = () => { v.removeEventListener('seeked', back); v.currentTime = 0; v.play() }
                v.addEventListener('seeked', back)
                v.currentTime = 1e9
              }
            })
          }
        } else {
          slot.classList.remove('playable'); slot.onclick = null
          slot.innerHTML = label                     // a still (or nothing) — honestly not playable
        }
      }
      // The INLINE evidence of each case (board R10): the plan rows are BAKED from the test source
      // (planRow), so the full numbered story shows before the test ever runs. This loop OVERLAYS
      // the latest run onto those rows — never replacing them — so a step reads passed / failed /
      // not-reached, and a failure leaves the steps after it visibly not-reached rather than gone.
      const fmt = ms => ms >= 1000 ? (Math.round(ms / 100) / 10) + 's' : Math.round(ms) + 'ms'
      // 'R5' (this screen) or 'x:R5' → the requirement's own title, looked up in the baked req rows
      const reqTitle = (rid, scr) => {
        const el = document.querySelector('.dt[data-screen="' + (scr || screen) + '"] .req[data-r="' + rid + '"] .rt')
        return el && el.textContent ? el.textContent : rid
      }
      for (const slot of panel.querySelectorAll('.tststeps')) {
        const host = slot.closest('.test')
        const meta = host && host.querySelector('.tmeta')
        const one = (rec[slot.dataset.title] || [])[0]
        const steps = (one && one.steps) || []
        slot._steps = steps                    // the all-steps window reads the raw record here
        const rows = [...slot.querySelectorAll('.beat')]

        // a prove-step's label is the requirement's TITLE (the id alone means nothing to a person)
        for (const row of rows) if (row.dataset.step === 'prove') {
          const lbl = row.querySelector('.blbl'); if (lbl) lbl.textContent = reqTitle(row.dataset.key)
        }

        // fold the record into top-level beats (test.step / proves) + their kids
        const beats = []
        let cur = null
        for (const s of steps) {
          if (s.cat === 'note') continue
          if (s.cat === 'test.step' && !s.depth) { cur = { head: s, kids: [] }; beats.push(cur); continue }
          if (cur) cur.kids.push(s)
        }
        const keyOf = b => {
          const m = /^proves (\S+)$/.exec(b.head.label || '')
          return m ? (m[1].indexOf(':') > -1 ? m[1].split(':').pop() : m[1]) : (b.head.label || '')
        }
        const beatByKey = {}
        for (const b of beats) beatByKey[keyOf(b)] = b
        // EVERY failed beat is marked, not just the last — a flow runs through all its steps now
        // and records each failure (board R10), so a person sees the whole broken picture.
        const isBad = b => (b.head && b.head.ok === false) || b.kids.some(k => !k.ok)
        const failNames = []
        for (const row of rows) {
          const b = beatByKey[row.dataset.key]
          const mk = row.querySelector('.bmk')
          const dl = row.querySelector('.bdet')
          row.classList.remove('pending', 'p', 'f', 'nr', 'hasdet')
          if (b) {
            const bad = isBad(b)
            row.classList.add(bad ? 'f' : 'p')
            if (mk) mk.textContent = bad ? '✕' : '✓'
            if (bad) failNames.push(row.querySelector('.blbl').textContent)
            const det = []
            for (const k of b.kids) {
              if (k.cat === 'info') det.push('<li class="bnote' + (k.ok ? '' : ' sf') + '">' + eh(k.label || '') + '</li>')
              else if (k.cat === 'test.step' && /^proves /.test(k.label || '')) {
                const rid = /^proves (\S+)/.exec(k.label)[1]
                const bare = rid.indexOf(':') > -1 ? rid.split(':').pop() : rid
                det.push('<li class="bprove' + (k.ok ? '' : ' sf') + '">proves ' + eh(bare) + ' · ' + eh(reqTitle(bare)) + '</li>')
              } else if (bad && !k.ok) det.push('<li class="braw sf">' + eh(k.label || '') + '</li>')  // the failing check(s)
            }
            if (dl) { dl.innerHTML = det.join(''); dl.hidden = !bad }   // a failed beat opens to its failure
            if (det.length) row.classList.add('hasdet')
          } else if (one && one.ok === false) {
            row.classList.add('nr')                 // ran, but this planned step was never reached
            if (mk) mk.textContent = '·'
            if (dl) dl.innerHTML = ''
          } else if (!one) {
            row.classList.add('pending')            // no run yet
            if (mk) mk.textContent = '○'
            if (dl) dl.innerHTML = ''
          } else {
            row.classList.add('p'); if (mk) mk.textContent = '✓'   // passed run, unrecorded plan row
          }
        }
        // the meta line SHOUTS the failure: how many steps broke, and which — not just the first
        if (meta) {
          const took = one && one.ms != null ? fmt(one.ms) : ''
          if (!one) meta.textContent = 'not run yet'
          else if (one.ok === false) {
            const nF = failNames.length || 1
            const names = failNames.slice(0, 2).join(' · ') + (failNames.length > 2 ? ' · …' : '')
            meta.innerHTML = '<span class="failat">✕ ' + nF + ' step' + (nF === 1 ? '' : 's') +
              ' failed' + (names ? ' — ' + eh(names) : '') + '</span>' + (took ? ' · ' + eh(took) : '')
          } else {
            const np = beats.filter(b => /^proves /.test(b.head.label || '')).length
            meta.textContent = (np ? 'proves ' + np + ' requirement' + (np === 1 ? '' : 's') + ' · ' : '') +
              steps.filter(s => s.cat !== 'note').length + ' steps' + (took ? ' · ' + took : '')
          }
        }
      }
      // The case's own LOG HISTORY — its last ten runs, newest first, each headed with when it ran,
      // how long it took and the commit it ran against. One log says whether it passes today; ten
      // say when it started failing and which commit did it (dispatch R8).
      for (const slot of panel.querySelectorAll('.tstlog')) {
        const hist = (rec[slot.dataset.title] || []).filter(h => h && h.log)
        if (!hist.length) { slot.innerHTML = ''; continue }
        const runs = hist.map(h => {
          const when = h.at ? String(h.at).replace('T', ' ').slice(0, 16) : 'unknown time'
          const took = h.ms != null ? Math.round(h.ms) + 'ms' : ''
          const sha = h.commit ? ' · ' + eh(h.commit) : ''
          const mark = h.ok === false ? 'o' : ''
          // link to the WHOLE run log — the complete process output for the run this case ran in, not
          // just this case's bounded stdout. Only a board-started run writes run.log, so link only when
          // that file exists; a CLI run has none and simply shows its per-case log.
          const whole = (h.hasLog && h.runId) ? ' · <a class="wholelog" href="/spec/_runs/' + eh(h.runId) +
            '/run.log" target="_blank" rel="noopener">whole run log ↗</a>' : ''
          return '<li><div class="lgh"><span class="mark ' + mark + '"></span>' +
            eh(when) + ' · ' + eh(took) + sha + whole + '</div><pre>' + eh(h.log) + '</pre></li>'
        }).join('')
        slot.innerHTML = '<details class="logbox"><summary>full log · last ' + hist.length +
          ' run' + (hist.length === 1 ? '' : 's') + '</summary><ol class="lghist">' + runs + '</ol></details>'
      }
    }
  }
  loadRuns()

  // lightbox -------------------------------------------------------------
  // Screenshots are a recording's evidence, and they render at a third of their real size.
  // What a test actually showed cannot be judged from a thumbnail.
  const lb = document.getElementById('lb')
  const lbimg = document.getElementById('lbimg')
  const lbstage = document.getElementById('lbstage')
  const openLb = (src, cap) => {
    lbimg.src = src
    document.getElementById('lbcap').textContent = cap
    lbstage.classList.remove('actual')
    document.getElementById('lbzoom').textContent = 'Actual size'
    lb.hidden = false
  }
  // EVERY image is zoomable, wherever it is — the row thumbnails, the detail screenshot, and the
  // shots a test recorded. They all render at a fraction of real size, and a judgement about
  // whether the build matches the design cannot honestly be made from a thumbnail.
  document.addEventListener('click', e => {
    const img = e.target.closest('img')
    if (!img || !img.src || img.closest('.lb')) return
    e.stopPropagation()
    openLb(img.src, img.alt || 'screenshot')
  })

  // expand/collapse a story step's recorded detail (board R10)
  document.addEventListener('click', e => {
    const bh = e.target.closest('.beat.hasdet .bh')
    if (!bh) return
    const det = bh.parentElement.querySelector('.bdet')
    if (det) det.hidden = !det.hidden
  })

  document.getElementById('lbzoom').addEventListener('click', e => {
    const on = lbstage.classList.toggle('actual')
    e.target.textContent = on ? 'Fit to window' : 'Actual size'
  })
  const closeLb = () => { lb.hidden = true }
  document.getElementById('lbclose').addEventListener('click', closeLb)
  lbstage.addEventListener('click', e => { if (e.target === lbstage) closeLb() })

  // live stream + live reload -------------------------------------------
  // Two behaviours used to share one switch, and the switch was OFF under automation — which is
  // why the panel's streaming, the whole point of the dispatch screen, could never be tested. But
  // only ONE of the two actually fights Playwright: the page RELOADING itself mid-test, which
  // aborts the navigation a spec just started (net::ERR_ABORTED). Streaming a job's output into
  // the panel reloads nothing. So the stream stays on always — a driver watching a real run is
  // exactly what R2 asks for — and only the self-navigation is held back under automation.
  const automation = navigator.webdriver || location.search.includes('nolive')
  try {
    const es = new EventSource('/api/live')
    // A reload mid-run would kill the panel you are watching, so hold it until the run finishes —
    // and never self-navigate under automation, which does its own reloading.
    // DEBOUNCED: a test run, a crawl or a rapid series of edits writes MANY files in a burst, and
    // reloading on each one makes the board flicker as though it is refreshing forever (the reported
    // "infinite refresh"). Coalesce a burst into ONE reaction once the writes go quiet.
    let changePending = null
    es.addEventListener('change', () => {
      if (automation) return
      // R7: an OPEN run panel is never reloaded away — not while a run streams into it, and not once
      // it has finished. The log stays there to read; the board refreshes when you close the panel.
      if (!panel.hidden) return
      clearTimeout(changePending)
      changePending = setTimeout(() => {
        // The conflicts view keeps itself current and holds unsaved picks and a note field. A full
        // reload there would throw away a sentence you were half way through typing, so it refreshes
        // in place instead — the one view on the board that owns its own state.
        if (!document.getElementById('cfview').hidden) { loadConflicts(); return }
        // init holds a half-filled form too — refresh the found table in place, never reload it out
        if (!document.getElementById('initview').hidden) { loadCrawl(); return }
        // how-it-works only ever needs its project cards refreshed — a project added a skill, say — and
        // a full reload would drop you back on the board, so refresh in place like the other tool views
        if (!document.getElementById('howview').hidden) { loadHow(); return }
        location.reload()
      }, 800)
    })
    es.addEventListener('run', e => {
      const d = JSON.parse(e.data)
      if (d.state === 'started') {
        setRunning(true)
        // watch mode starts runs nobody clicked — show what is happening without stealing focus
        if (panel.hidden) { rplog.textContent = ''; runDone = false }
        document.getElementById('rptitle').textContent =
          (d.screen === 'all' ? 'all tests' : d.screen + ' · test.spec.ts')
      } else if (d.state === 'line') {
        rplog.textContent += d.line + '\n'
        rplog.scrollTop = rplog.scrollHeight
      } else if (d.state === 'done') {
        runDone = true
        setRunning(false)
        document.getElementById('rpcancel').disabled = true
        // a scan or a rewrite changes what is waiting on you — the header count has to follow;
        // a crawl changes what the init "what was found" table should show
        loadConflicts()
        if (!document.getElementById('initview').hidden) loadCrawl()
        // A watch-mode run finishes with the panel still closed (nobody opened it). The board's own
        // rebuild fires a change event that refreshes it, so there is nothing to reload here — and
        // there is no longer any "background" run to announce.
        rpchip.className = 'chip ' + (d.ok ? 'ok' : 'bad')
        rpchip.innerHTML = '<span class="dot"></span>' + (d.ok ? 'passed' : 'failed')
        rplog.textContent += '\n' + (d.note || ((d.total - d.failed) + ' of ' + d.total + ' passing')) +
          ' · ' + Math.round(d.ms / 100) / 10 + 's\n'
        rplog.scrollTop = rplog.scrollHeight
        loadRuns()
      }
    })
  } catch (e) { /* served statically — no live reload, everything else still works */ }
