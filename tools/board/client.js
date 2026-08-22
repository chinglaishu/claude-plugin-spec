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
  // Search across requirement text is the only way to narrow the board. The old whose-turn filter
  // toggle is gone, and so — since the guess flag / human gate was removed (2026-08-17) — are the
  // per-group "N waiting" cues and the whose-turn banner: there is no "is it my turn" state left to
  // filter or point at, only requirement text to match.
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
    // open in the default FOCUS view (board R13, the human's call 2026-08-13): the reader opens straight
    // away on the first requirement. A screen with no requirements can't build a reader — fall back to
    // the Grid (empty, but a real view; the Columns view is retired, board R13 2026-08-18).
    setView(dt, 'focus')
    if (!dt.querySelector('.focusov')) setView(dt, 'grid')
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
      loadConfig(); loadCrawl(); loadVoiceStatus()
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
    // #/<screen> opens the detail on the Focus default; #/<screen>/<rid> deep-links one
    // requirement's Focus page (the feature strip's live-example links, board R16); #/<screen>/grid
    // and #/<screen>/flow open the named view. The sub-path is routing sugar over setView — the
    // views themselves stay derived, nothing new is stored.
    const seg = decodeURIComponent(location.hash.replace(/^#\//, '')).split('/')
    // #/compose/<screen> — the flow composer for that screen (the frozen mockup's address; board R13)
    if (seg[0] === 'compose' && SCREENS.indexOf(seg[1]) >= 0) {
      show(SCREENS.indexOf(seg[1]))
      const cdt = document.querySelector('.dt[data-screen="' + seg[1] + '"]')
      if (cdt) setView(cdt, 'compose')
      return
    }
    const name = seg[0]
    const i = SCREENS.indexOf(name)
    if (i >= 0) {
      show(i)
      const sub = seg[1] || ''
      if (sub) {
        const dt = document.querySelector('.dt[data-screen="' + name + '"]')
        if (dt && (sub === 'grid' || sub === 'flow')) setView(dt, sub)
        else if (dt) setView(dt, 'focus', sub)
      }
    } else closeAll()
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
  // closing the detail also tears down an open focus reader, returning every borrowed node to the
  // baked source panes (.cols stays hidden — it is the data source, not a view; board R13 2026-08-18)
  function closeFocus () {
    for (const o of document.querySelectorAll('.focusov')) {
      if (o._restore) o._restore()          // put any moved test node/recording back before tearing down —
      // else o.remove() would destroy the real nodes the source panes still need
      const dtx = o.closest('.dt')
      const foot = dtx && dtx.querySelector('.dtfoot')   // the pager lived here — clear and hide the footer
      if (foot) { foot.innerHTML = ''; foot.hidden = true }
      o.remove()
    }
    // the List's open row is a reader too (its body is the Focus body, borrowed nodes and all) —
    // restore and collapse it under the same teardown, so no view switch can strand a moved node
    for (const card of document.querySelectorAll('.lst-card.open')) {
      const body = card.querySelector('.lst-body')
      if (body && body._restore) { body._restore(); body._restore = null }
      if (body) { body.innerHTML = ''; body.hidden = true }
      card.classList.remove('open')
    }
  }
  for (const b of document.querySelectorAll('.close'))
    b.addEventListener('click', () => { closeFocus(); closeAll(); history.pushState(null, '', location.pathname) })

  // The five-word requirement vocabulary (board R4, amended 2026-08-17; `changed` added 2026-08-19)
  // — the SAME mapping build-board.mjs's REQ_CHIP/GRID_CHIP render server-side, reproduced here
  // because the Focus reader is built client-side from the baked `.req` node's data-status
  // attribute. Missing `changed` here would read a Changed requirement as "○ Untested" in the
  // detail's DEFAULT view — the one surface allowed to speak a wrong word is none of them.
  var FCHIP = {
    passed: '✓ Passed', changed: '◈ Changed', failed: '✗ Failed',
    'not-reached': '◌ Not reached', untested: '○ Untested'
  }

  // PROMPT HANDOFF (board R15): the board proposes work but never authors it. buildPrompt is PURE —
  // a plain string builder composing a ready Claude prompt: the screen, the exact file, the target,
  // the cover set and the kg-e2e discipline. No DOM, no fetch, no write — the human runs the prompt
  // and keeps the words theirs.
  var PROMPT_DISCIPLINE = 'The discipline that governs this change (kg-e2e — non-negotiable):\n' +
    '- write the failing test first, and watch it go red\n' +
    '- tag the requirement with checkReq\n' +
    '- assert something that would fail without it\n' +
    '- keep every asserted value visible in the recording\n' +
    '- never weaken a test to go green'
  function buildPrompt (action, ctx) {
    const prd = 'spec/' + ctx.screen + '/prd.md'
    const spec = 'spec/' + ctx.screen + '/test.spec.ts'
    const req = (ctx.reqId || '') + (ctx.reqTitle ? ' — "' + ctx.reqTitle + '"' : '')
    const list = (ctx.reqList || []).map(function (r) { return '  - ' + r.id + ' — ' + r.title }).join('\n')
    const cover = 'Cover these requirements: ' + (ctx.coverIds && ctx.coverIds.length ? ctx.coverIds.join(', ') : '(pick at least one)')
    const reqBlock = 'The screen\'s requirements:\n' + list
    let head = ''
    let body = ''
    if (action === 'reword') {
      head = 'In this specboard project, reword requirement ' + ctx.screen + ':' + ctx.reqId + '.'
      body = 'File: ' + prd + '\nTarget: requirement ' + req + '\n\n' +
        'Draft the new wording in place — requirement MEANING belongs to the human, so keep the ' +
        'change to what they asked for and attach the reason inline (the house style: an italic ' +
        '"*Amended <date> at the human\'s direction: …*" note). If the behaviour itself changes, ' +
        'update the covering assertions in ' + spec + ' the same way.'
    } else if (action === 'addreq') {
      const last = (ctx.reqList || []).length ? ctx.reqList[ctx.reqList.length - 1].id : ''
      head = 'In this specboard project, add a requirement to the ' + ctx.screen + ' screen.'
      body = 'File: ' + prd + '\nTarget: a new requirement' + (last ? ' (the next id after ' + last + ')' : '') + '\n\n' +
        'Write it as a "## R<n> — <title>" section in the human\'s words — it is canon the moment ' +
        'it is written. Then prove it: add a covering test in ' + spec + '.\n\n' + reqBlock
    } else if (action === 'removereq') {
      head = 'In this specboard project, remove requirement ' + ctx.screen + ':' + ctx.reqId + '.'
      body = 'File: ' + prd + '\nTarget: requirement ' + req + '\n\n' +
        'Delete its section (or fold what survives into a neighbour, with the reason attached). ' +
        'Then sweep ' + spec + ': a checkReq(\'' + ctx.reqId + '\') left behind proves a ' +
        'requirement that no longer exists.'
    } else if (action === 'addtest') {
      head = 'In this specboard project, add a test (unit or flow) for the ' + ctx.screen + ' screen.'
      body = 'File: ' + spec + '\nTarget: a new test\n' + cover + '\n\n' + reqBlock
    } else if (action === 'edittest') {
      head = 'In this specboard project, edit the test "' + (ctx.testTitle || '') + '".'
      body = 'File: ' + spec + '\nTarget: the test "' + (ctx.testTitle || '') + '"\n' + cover + '\n\n' + reqBlock
    } else if (action === 'removetest') {
      head = 'In this specboard project, remove the test "' + (ctx.testTitle || '') + '".'
      body = 'File: ' + spec + '\nTarget: the test "' + (ctx.testTitle || '') + '"\n\n' +
        'Delete it whole. The requirements it covered' +
        (ctx.coverIds && ctx.coverIds.length ? ' (' + ctx.coverIds.join(', ') + ')' : '') +
        ' will read Untested unless another test tags them — leave them honestly ungreen or cover ' +
        'them elsewhere; never fake their green.'
    }
    return head + '\n\n' + body + '\n\n' + PROMPT_DISCIPLINE + '\n'
  }
  // Opens the prompt window on a composed prompt. The picker (#promptpick) renders ONLY for the
  // add/edit-test actions: the screen's requirement ids as toggle chips, a toggle re-running
  // buildPrompt with the new cover set. The prompt lands as .textContent in a read-only <pre> —
  // the board writes no file; Copy (the shared [data-copy] handler) hands it to the human. Best
  // effort, it is also copied on open (R15), with the button as the reliable path.
  function openPrompt (action, ctx) {
    const sheet = document.getElementById('promptsheet')
    const body = document.getElementById('promptbody')
    const pick = document.getElementById('promptpick')
    const TITLES = { reword: 'Reword this requirement', addreq: 'Add a requirement',
      removereq: 'Remove this requirement', addtest: 'Add a test', edittest: 'Edit this test',
      removetest: 'Remove this test' }
    document.getElementById('prompttitle').textContent = TITLES[action] || 'Prompt'
    pick.innerHTML = ''
    if (action === 'addtest' || action === 'edittest') {
      const on = {}
      ;(ctx.coverIds || []).forEach(function (id) { on[id] = true })
      // every one of the screen's ids as a chip, plus any covered id not in the list (a qualified
      // cross-screen tag) so an existing cover set is never silently dropped by the first toggle
      const ids = (ctx.reqList || []).map(function (r) { return r.id })
      ;(ctx.coverIds || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id) })
      ids.forEach(function (id) {
        const c = document.createElement('button')
        c.type = 'button'; c.className = 'pmchip' + (on[id] ? ' on' : ''); c.textContent = id
        c.addEventListener('click', function () {
          c.classList.toggle('on')
          const picked = [].slice.call(pick.querySelectorAll('.pmchip.on')).map(function (el) { return el.textContent })
          body.textContent = buildPrompt(action, Object.assign({}, ctx, { coverIds: picked }))
        })
        pick.appendChild(c)
      })
    }
    body.textContent = buildPrompt(action, ctx)
    sheet.classList.add('on')
    try { navigator.clipboard.writeText(body.textContent).catch(function () {}) } catch (err) {}
  }
  // one ⋯ authoring menu, shared shape (mirrors the proof ⋯): items carry data-prompt so the
  // sheet's backdrop-close can tell an opening click from an outside one
  function promptMenu (aria, items) {
    const menu = document.createElement('div'); menu.className = 'fmenu'
    const mbtn = document.createElement('button'); mbtn.className = 'btn sm fmenubtn'
    mbtn.setAttribute('aria-label', aria); mbtn.textContent = '⋯'
    const pop = document.createElement('div'); pop.className = 'fmenupop'
    menu.appendChild(mbtn); menu.appendChild(pop)
    mbtn.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('open') })
    pop.addEventListener('click', function () { menu.classList.remove('open') })  // any pick closes it
    items.forEach(function (it) { pop.appendChild(promptItem(it[0], it[1], it[2])) })
    return menu
  }
  function promptItem (action, label, ctxFn) {
    const b = document.createElement('button')
    b.className = 'btn sm'; b.dataset.prompt = action; b.textContent = label
    b.addEventListener('click', function () { openPrompt(action, ctxFn()) })
    return b
  }

  // THE FOCUS READER (board R13, the frozen mockup 2026-08-21): ONE body builder shared VERBATIM by
  // the Focus view and the List view's open row — "an open row is the Focus body itself". The body
  // is two columns: the reading STACK on the left (the behavior block leading, the prose collapsed
  // beneath, the schematic slot below) and the proof on the right (Run + ⋯ header, proof line, then
  // MEDIA whose default derives from status × beat count — D2 — under a stills · gif · video
  // toolbar that is a client-side preference, never stored in the tree). The covering test's REAL
  // node still moves in (no player is ever rebuilt) and every move is tracked and undone on leave,
  // so the hidden source rows are always left whole — the same borrow / close-fold-reopen contract
  // loadRuns depends on (CLAUDE.md).
  function reqNodes (dt) { return [].slice.call(dt.querySelectorAll('.reqpane .req')) }
  function screenReqList (dt) {
    return reqNodes(dt).map(function (x) {
      const t = x.querySelector('.rt')
      return { id: x.getAttribute('data-r'), title: t ? t.textContent : '' }
    })
  }
  // ＋ New flow / ＋ Author a flow test route to the composer (board R13: "＋ New flow opens the
  // composer") — the prompt modal stays for the requirement/test ⋯ menus (R15)
  function openCompose (dt) {
    history.pushState(null, '', '#/compose/' + dt.dataset.screen)
    setView(dt, 'compose')
  }
  function openAddTest (dt, coverIds) {
    openPrompt('addtest', { screen: dt.dataset.screen, coverIds: coverIds || [], reqList: screenReqList(dt) })
  }
  // Read ONE baked source row into the shape focusBody draws — fresh on every render, so a forced
  // or freshly-synced data-status/data-ev-* is always what renders (no stale snapshot).
  function reqInfo (node) {
    const idEl = node.querySelector('.id'); const ttlEl = node.querySelector('.rt')
    const bodyEl = node.querySelector('.body')
    let behHtml = ''; let proseHtml = ''; let schem = null
    if (bodyEl) {
      const c = bodyEl.cloneNode(true)
      const cov = c.querySelector('.covers'); if (cov) cov.remove()
      const beh = c.querySelector('.behavior')
      if (beh) { behHtml = beh.outerHTML; beh.remove() }
      // the baked drawn schematic (task 4): lifted out of the prose clone like the behavior block,
      // so the Focus slot renders it and the collapsed prose never carries a second copy
      const sc = c.querySelector('.schematic')
      if (sc) {
        const svgEl = sc.querySelector('svg')
        schem = {
          svg: svgEl ? svgEl.outerHTML : '',
          phases: (sc.getAttribute('data-phases') || '').split(/\s+/).filter(Boolean),
          hash: sc.getAttribute('data-vizhash') || '',
          textHash: sc.getAttribute('data-texthash') || '',
          at: sc.getAttribute('data-vizat') || '',
          stale: sc.getAttribute('data-stale') === '1'
        }
        sc.remove()
      }
      proseHtml = c.innerHTML
    }
    return {
      schem: schem,
      node: node,
      id: idEl ? idEl.textContent : '',
      state: node.getAttribute('data-state') || 'unproven',
      status: node.getAttribute('data-status') || 'untested',
      beats: Number(node.getAttribute('data-beats') || 0),
      ev: {
        before: node.getAttribute('data-ev-before') || '',
        after: node.getAttribute('data-ev-after') || '',
        clip: node.getAttribute('data-ev-clip') || '',
        at: node.getAttribute('data-ev-at') || ''
      },
      title: ttlEl ? ttlEl.textContent : '',
      behHtml: behHtml,
      proseHtml: proseHtml
    }
  }
  function focusBody (dt, r) {
    const tests = [].slice.call(dt.querySelectorAll('.testpane .test'))
    const cov = tests.filter(function (t) { return t.querySelector('.tags .tag[data-r="' + r.id + '"]') })
    const primary = cov[0] || null
    // every relocated node is tracked; restore() reverses in LIFO order so a node whose original
    // parent sits inside another moved node goes home after its container does
    const moved = []
    function move (node, host, flatten) {
      moved.push({ node: node, parent: node.parentNode, next: node.nextSibling })
      if (flatten) node.classList.add('open', 'infocus')
      host.appendChild(node)
    }
    function restore () {
      for (let k = moved.length - 1; k >= 0; k--) {
        const b = moved[k]
        if (b.node.classList) b.node.classList.remove('open', 'infocus')
        if (b.next && b.next.parentNode === b.parent) b.parent.insertBefore(b.node, b.next)
        else if (b.parent) b.parent.appendChild(b.node)
      }
      moved.length = 0
    }

    const page = document.createElement('div'); page.className = 'fpage'

    // ── LEFT: the reading stack ──────────────────────────────────────────────
    const left = document.createElement('div'); left.className = 'fleft'
    const read = document.createElement('div'); read.className = 'fread'
    const rmeta = document.createElement('div'); rmeta.className = 'frmeta'
    const fid = document.createElement('span'); fid.className = 'fid'; fid.textContent = r.id
    const fchip = document.createElement('span'); fchip.className = 'fchip ' + r.status
    fchip.textContent = FCHIP[r.status] || FCHIP.untested
    rmeta.appendChild(fid); rmeta.appendChild(fchip)
    // the requirement's ⋯ authoring menu (board R15) — fresh reader chrome, no move/restore hazard
    const reqCtx = function () {
      return { screen: dt.dataset.screen, reqId: r.id, reqTitle: r.title, reqList: screenReqList(dt) }
    }
    const reqAddTestCtx = function () { const c = reqCtx(); c.coverIds = [r.id]; return c }
    rmeta.appendChild(promptMenu('requirement authoring actions', [
      ['reword', 'Reword this requirement', reqCtx],
      ['addreq', 'Add a requirement', reqCtx],
      ['removereq', 'Remove this requirement', reqCtx],
      ['addtest', 'Add a test to cover it', reqAddTestCtx]
    ]))
    read.appendChild(rmeta)
    const h = document.createElement('div'); h.className = 'fttl'; h.textContent = r.title
    read.appendChild(h)
    // THE BEHAVIOR LEADS (R13): the baked block (build-board renders it from the escaped PRD via
    // renderBehavior) heads the card; the PROSE collapses beneath it, one click away. A prose-only
    // requirement has no shape to lead with, so its prose stays open.
    if (r.behHtml) {
      const bl = document.createElement('span'); bl.className = 'flabel'; bl.textContent = 'The behavior'
      read.appendChild(bl)
      read.insertAdjacentHTML('beforeend', r.behHtml)
    }
    const fbody = document.createElement('div')
    fbody.className = 'fbody' + (r.behHtml ? ' fprose' : '')
    fbody.innerHTML = r.proseHtml
    if (r.behHtml) {
      const pt = document.createElement('button'); pt.type = 'button'; pt.className = 'prose-t'
      pt.textContent = 'the authored requirement — in full'
      pt.addEventListener('click', function () { fbody.classList.toggle('open') })
      read.appendChild(pt)
    }
    read.appendChild(fbody)
    left.appendChild(read)
    // the schematic slot (task 4): the drawn, hash-pinned loop where a committed drawing exists —
    // quiet grey with the dated ≠ note when the text has moved past it — and the honest
    // placeholder line where none does
    left.appendChild(buildSchematic(r))

    // ── RIGHT: the proof ─────────────────────────────────────────────────────
    const evl = document.createElement('div'); evl.className = 'feval'
    const flows = cov.map(function (t) { const e = t.querySelector('.ttl'); return e ? e.textContent.trim() : '' }).filter(Boolean)
    if (cov.length) {
      const vstate = primary.classList.contains('f') ? 'fail' : primary.classList.contains('p') ? 'pass' : 'none'
      const vword = vstate === 'fail' ? 'failed' : vstate === 'pass' ? 'passed' : 'not run yet'
      const ph = document.createElement('div'); ph.className = 'fphead'
      const ptop = document.createElement('div'); ptop.className = 'fptop'
      ptop.innerHTML = '<span class="fplbl">The proof</span>'
      const acts = document.createElement('div'); acts.className = 'fpacts'
      ptop.appendChild(acts); ph.appendChild(ptop)
      // "proved by" tracks r.status (board R4) — the same fold that names the chip names this line.
      // Changed is passed-family (it WAS proved; the text moved since) — mirroring gridProof.
      const proved = r.status === 'passed' || r.status === 'changed'
      const by = document.createElement('div'); by.className = 'fpby'
      by.innerHTML = (proved ? 'proved by ' : 'covered by ') + '<b>' + eh(flows[0] || '') + '</b>' +
        ' · <span class="fpv ' + vstate + '">' + vword + '</span>' +
        (cov.length > 1 ? ' · <span class="fpmore">+' + (cov.length - 1) + ' more cover it</span>' : '') +
        (r.status === 'changed' ? ' — text moved since that proof, re-verify' : (proved ? '' : ' — not passed yet'))
      ph.appendChild(by)
      const shaEl = primary.querySelector('.tmeta .tsha')
      if (shaEl && shaEl.textContent) {
        const run = document.createElement('div'); run.className = 'fprun'
        run.innerHTML = 'last run · <span class="tsha">' + eh(shaEl.textContent) + '</span>'
        ph.appendChild(run)
      }
      evl.appendChild(ph)
      // relocate the wired per-test controls into the proof header: Run (watchable) always visible,
      // Run in background / Logs / Steps behind the ⋯ menu — the REAL nodes, moved and undone on leave
      const tacts = primary.querySelector('.tacts')
      const runWatch = tacts && tacts.querySelector('.runone[data-headed]')
      const runBg = tacts && tacts.querySelector('.runone:not([data-headed])')
      const logBtn = primary.querySelector('[data-log]')
      const stepBtn = primary.querySelector('[data-steps]')
      if (runWatch) move(runWatch, acts, false)
      {
        const testCtx = function () {
          const ttlEl = primary.querySelector('.ttl')
          return { screen: dt.dataset.screen, reqId: r.id, reqTitle: r.title,
            testTitle: primary.getAttribute('data-title') || (ttlEl ? ttlEl.textContent.trim() : ''),
            coverIds: [].slice.call(primary.querySelectorAll('.tags .tag')).map(function (el) { return el.getAttribute('data-r') }),
            reqList: screenReqList(dt) }
        }
        const addCtx = function () { const c = testCtx(); c.coverIds = [r.id]; return c }
        const menu = document.createElement('div'); menu.className = 'fmenu'
        const mbtn = document.createElement('button'); mbtn.className = 'btn sm fmenubtn'
        mbtn.setAttribute('aria-label', 'run, log and authoring actions'); mbtn.textContent = '⋯'
        const pop = document.createElement('div'); pop.className = 'fmenupop'
        menu.appendChild(mbtn); menu.appendChild(pop); acts.appendChild(menu)
        ;[runBg, logBtn, stepBtn].forEach(function (b) { if (b) move(b, pop, false) })
        if (runBg || logBtn || stepBtn) {
          const d = document.createElement('div'); d.className = 'fmdiv'; pop.appendChild(d)
        }
        pop.appendChild(promptItem('addtest', 'Add a test', addCtx))
        pop.appendChild(promptItem('edittest', 'Edit this test', testCtx))
        pop.appendChild(promptItem('removetest', 'Remove this test', testCtx))
        mbtn.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('open') })
        pop.addEventListener('click', function () { menu.classList.remove('open') })  // any pick closes it
      }
    } else {
      const ph = document.createElement('div'); ph.className = 'fphead'
      ph.innerHTML = '<span class="fplbl">The proof</span>' +
        '<div class="fpnone">No test asserts this yet — honestly ungreen, not hidden.</div>'
      evl.appendChild(ph)
    }
    // THE MEDIA PANE (D2) — built after the header so its video panel can relocate the recording
    evl.appendChild(buildMedia(dt, r, primary, move))
    // the moved covering test itself — its proof-frame strip stays visible here (board R14), the
    // rest of its chrome folded away; loadRuns folds it whenever it is home in the pane
    if (primary) {
      const ev = document.createElement('div'); ev.className = 'fev'
      evl.appendChild(ev)
      move(primary, ev, true)
    }
    page.appendChild(left); page.appendChild(evl)
    return { page: page, restore: restore, id: r.id }
  }

  // The SCHEMATIC slot (requirement schematics spec 2026-08-18; task 4): the AUTHORED-side
  // drawing — derived once from the behavior text (tools/viz.mjs), committed at
  // spec/<screen>/viz/<id>.svg, hash-pinned — NEVER captured media (the golden/expected-vs-current
  // diff was dropped 2026-08-18; the left pane's only media choice is loop vs stills of the SAME
  // drawing). loop · stills is a client-side preference (localStorage 'sbSchemMode'); a
  // reduced-motion viewer defaults to the stepped stills. A drawing whose text moved past its pin
  // renders QUIET GREY under the dated "text ≠ viz" note — honest, never a wrong picture; a
  // requirement with no committed drawing keeps the placeholder line.
  function buildSchematic (r) {
    const wrap = document.createElement('div'); wrap.className = 'fschem'
    const v = r.schem
    if (!v || !v.svg) {
      wrap.innerHTML = '<div class="figcap">schematic · the idea, not the real UI</div>' +
        '<div class="noschem">no schematic drawn yet — the next viz pass derives one from the behavior text</div>'
      return wrap
    }
    const short = function (h) { return String(h || '').slice(0, 6) }
    const render = function () {
      let mode = null
      try { mode = localStorage.getItem('sbSchemMode') } catch (e) { mode = null }
      if (mode !== 'loop' && mode !== 'stills') {
        mode = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
          ? 'stills' : 'loop'
      }
      wrap.className = 'fschem' + (v.stale ? ' isstale' : '')
      wrap.textContent = ''
      const cap = document.createElement('div'); cap.className = 'figcap'
      const lbl = document.createElement('span'); lbl.textContent = 'schematic · the idea, not the real UI'
      cap.appendChild(lbl)
      if (mode === 'loop' && r.beats > 1) {
        // one dot per beat — static (first on): a quiet count, not a synced progress indicator
        const dots = document.createElement('span'); dots.className = 'beatdots'
        for (let i = 0; i < r.beats; i++) {
          const d = document.createElement('i'); if (i === 0) d.className = 'on'
          dots.appendChild(d)
        }
        cap.appendChild(dots)
      }
      const mb = document.createElement('span'); mb.className = 'medbar'
      ;['loop', 'stills'].forEach(function (m) {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.sm = m
        b.textContent = m
        if (m === mode) b.classList.add('on')
        b.addEventListener('click', function () {
          try { localStorage.setItem('sbSchemMode', m) } catch (e) { /* preference only, never the tree */ }
          render()
        })
        mb.appendChild(b)
      })
      cap.appendChild(mb)
      wrap.appendChild(cap)
      if (mode === 'stills') {
        // the stills ARE the loop's own frames: the same drawing, paused, parked per phase by a
        // negative animation-delay (the CSS reads --ph off each frame's holder)
        const st = document.createElement('div'); st.className = 'sstills'
        const phases = v.phases.length ? v.phases : ['-0.05']
        phases.forEach(function (ph, i) {
          const f = document.createElement('div'); f.className = 'sframe'
          const holder = document.createElement('div'); holder.style.setProperty('--ph', ph + 's')
          holder.innerHTML = v.svg
          const c = document.createElement('div'); c.className = 'scap'
          c.textContent = i === 0 ? 'given' : (phases.length > 2 ? 'beat ' + i + ' · then' : 'then')
          f.appendChild(holder); f.appendChild(c); st.appendChild(f)
        })
        wrap.appendChild(st)
      } else {
        const viz = document.createElement('div'); viz.className = 'viz'
        viz.innerHTML = v.svg
        if (v.stale) {
          const so = document.createElement('div'); so.className = 'staleov'
          const b = document.createElement('b'); b.textContent = '✎ stale — text changed'
          const s = document.createElement('span')
          s.textContent = 'the requirement was reworded after this was drawn' +
            (v.at ? ' (' + v.at + ')' : '') + ' — redrawn on the next viz pass'
          so.appendChild(b); so.appendChild(s); viz.appendChild(so)
        }
        wrap.appendChild(viz)
      }
      const foot = document.createElement('div'); foot.className = 'figfoot'
      foot.innerHTML = v.stale
        ? 'drawn from the text · <span class="h">text@' + eh(short(v.textHash)) + ' ≠ viz@' + eh(short(v.hash)) + '</span> — redrawn on the next viz pass'
        : 'drawn from the text · <span class="h">viz@' + eh(short(v.hash)) + '</span> · ' +
          (mode === 'stills' ? 'the loop’s own frames, frozen per beat' : 'loops · pauses under reduced-motion')
      wrap.appendChild(foot)
    }
    render()
    return wrap
  }

  // The MEDIA pane (D2, the frozen mockup): default derives from status × beat count —
  //   passed, 1 beat  → the harvested before/after frame pair
  //   passed, N beats → the per-beat filmstrip (given + the run's per-requirement frames, or the
  //                     harvested after-frame closing the chain when no recording captured them)
  //   failed          → the NEWEST record's own frames when it cut any (D3: the failing value red),
  //                     else the red after-frame — plus the covering test's expected-vs-actual and
  //                     the ✗ failed mark on the bar
  //   changed         → the last proof's media under a pinned-era watermark
  //   untested / not-reached → no media: "no proof yet · ＋ write the failing test"
  // — under a stills · gif · video toolbar. The override is a client-side preference (localStorage),
  // never stored in the tree; the gif renders only when the fold cut a clip file (absence of ffmpeg
  // output is never an error — the stills still stand).
  function buildMedia (dt, r, primary, move) {
    const box = document.createElement('div'); box.className = 'fmedia'
    const st = r.status
    if (!primary || st === 'untested' || st === 'not-reached') {
      const bar = document.createElement('div'); bar.className = 'fmbar'
      bar.textContent = 'proves ' + r.id
      const no = document.createElement('div'); no.className = 'noev'
      const b = document.createElement('b')
      b.textContent = st === 'not-reached'
        ? '◌ no proof yet — the flow stopped before this step' : '○ no proof yet'
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn sm'
      // data-prompt marks the click as a sheet-OPENING one, so the prompt sheet's outside-click
      // closer does not shut it in the same bubble (the [data-log] pattern)
      btn.dataset.prompt = 'addtest'
      btn.textContent = '＋ write the failing test'
      btn.addEventListener('click', function () { openAddTest(dt, [r.id]) })
      no.appendChild(b); no.appendChild(btn)
      box.appendChild(bar); box.appendChild(no)
      return box
    }
    const LBL = { frames: 'stills', clip: 'gif', video: st === 'failed' ? 'video@fail' : 'video' }
    let mode = null
    try { mode = localStorage.getItem('sbFocusMedia') } catch (e) { mode = null }
    if (['frames', 'clip', 'video'].indexOf(mode) < 0) mode = 'frames'
    if (st === 'failed' && mode === 'clip') mode = 'frames'   // the mockup skips gif on a failure
    const bar = document.createElement('div'); bar.className = 'fmbar'
    const lab = document.createElement('span')
    lab.innerHTML = 'proves ' + eh(r.id) + (r.ev.at ? ' · ' + eh(r.ev.at) : '') +
      (st === 'changed' ? ' · <span class="pinned">✎ pinned era</span>' : '') +
      // D3: a failing run's media shows — so the pane itself carries the failed state, with the
      // existing failed mark (✗ + bengara, the .fpv chip the proof line already uses; hue never alone)
      (st === 'failed' ? ' · <span class="fpv fail">✗ failed run</span>' : '')
    bar.appendChild(lab)
    const mb = document.createElement('span'); mb.className = 'medbar'
    const modes = st === 'failed' ? ['frames', 'video'] : ['frames', 'clip', 'video']
    const panels = {}
    const apply = function (m) {
      ;[].slice.call(mb.children).forEach(function (b) { b.classList.toggle('on', b.dataset.m === m) })
      Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== m })
    }
    modes.forEach(function (m) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.m = m
      b.textContent = LBL[m]
      b.addEventListener('click', function () {
        mode = m
        try { localStorage.setItem('sbFocusMedia', m) } catch (e) { /* preference only */ }
        apply(m)
      })
      mb.appendChild(b)
    })
    bar.appendChild(mb)
    box.appendChild(bar)
    const body = document.createElement('div'); body.className = 'fmbody'
    const cell = function (src, cap, cls) {
      return '<div class="fcell' + (cls ? ' ' + cls : '') + '">' +
        '<img loading="lazy" src="' + eh(src) + '" alt="' + eh(cap) + '">' +
        '<div class="fcap">' + eh(cap) + '</div></div>'
    }
    // THE RUN'S PROOF FRAMES (board R14, as signed 2026-08-22): the media pane's stills ARE the
    // scannable strip — one surface in the focus card, not a near-duplicate pair. Where the NEWEST
    // record covers this requirement with frames, its per-value stills render as the strip's
    // cells: one per checked value, in order, the got-vs-expected in the caption, red on a failure.
    // Frames are frames OF the recording (the harvest cuts them), so a record with no video has
    // none — no strip, never a faked or separately-captured one. Read off the record loadRuns
    // stashed (never the DOM strip, which is folded away here) — a qualified req tag counts only
    // for its own screen.
    // D3 (the human, 2026-08-22; task-3b review L3): NEWEST RECORD ONLY, whatever its status. The
    // old rule took the newest record that HAD frames and so had to blank the strip under a failed
    // chip (an older passing run's green strip there is a fake green); reading only hist[0] lets a
    // failing run's own frames show — the value that broke, burned red — with no fake-green path,
    // and a later video-less CLI run falls back to the harvested pair (that fold's own frames).
    const runFrames = function () {
      const slot = primary.querySelector('.tststeps')
      const hist = (slot && slot._hist) || []
      const rec = hist[0]
      if (!rec || !rec.frames || !rec.frames.length) return []
      return rec.frames.filter(function (fr) {
        const q = String(fr.req || '')
        const k = q.indexOf(':')
        const scr = k > 0 ? q.slice(0, k) : dt.dataset.screen
        const bare = k > 0 ? q.slice(k + 1) : q
        return bare === r.id && scr === dt.dataset.screen && fr.img
      })
    }
    // frames
    const pf = document.createElement('div'); pf.className = 'fmpanel'; pf.dataset.m = 'frames'
    {
      const cells = []
      const rf = runFrames()
      if (rf.length) {
        // the merged R14 strip — one cell per checked value, its own caption, red where it failed
        if (r.ev.before) cells.push(cell(r.ev.before, 'given'))
        rf.forEach(function (fr) {
          cells.push(cell(fr.img, (fr.ok === false ? '✗ ' : '✓ ') + (fr.cap || 'checked value'),
            (fr.ok === false ? 'hotbad' : 'hot') + ' rf'))
        })
      } else if (st === 'failed') {
        // no frames on the newest record (a CLI run): the D2 red-frame default — the harvested after
        // IS the red frame (the harvest paints the verdict before snapping), expected-vs-actual beneath
        if (r.ev.before) cells.push(cell(r.ev.before, 'given'))
        if (r.ev.after) cells.push(cell(r.ev.after, "✗ the failing beat's red frame", 'hotbad'))
      } else if (r.beats > 1) {
        if (r.ev.before) cells.push(cell(r.ev.before, 'given'))
        if (r.ev.after) cells.push(cell(r.ev.after, '✓ beat ' + r.beats + ' · then — the asserted value in frame', 'hot'))
      } else {
        if (r.ev.before) cells.push(cell(r.ev.before, 'before'))
        if (r.ev.after) cells.push(cell(r.ev.after, '✓ after — the asserted value in frame', 'hot'))
      }
      pf.innerHTML = cells.length
        ? '<div class="fstrip">' + cells.join('') + '</div>'
        : '<div class="noev"><span>no harvested frames for this proof yet — the next run captures them</span></div>'
      if (st === 'failed') {
        const err = primary.querySelector('.terr')
        if (err && err.textContent) {
          const x = document.createElement('div'); x.className = 'xva'
          x.textContent = err.textContent.slice(0, 400)
          pf.appendChild(x)
        }
      }
    }
    panels.frames = pf; body.appendChild(pf)
    // gif — the fold's looping clip, only where the file exists
    if (modes.indexOf('clip') >= 0) {
      const pc = document.createElement('div'); pc.className = 'fmpanel'; pc.dataset.m = 'clip'
      pc.innerHTML = r.ev.clip
        ? '<img class="fclip" loading="lazy" src="' + eh(r.ev.clip) + '" alt="looping clip of the proof">'
        : '<div class="noev"><span>no gif for this run — stills still stand</span></div>'
      panels.clip = pc; body.appendChild(pc)
    }
    // video — the covering test's own recording, the wired .rec node moved in (undone on leave)
    {
      const pv = document.createElement('div'); pv.className = 'fmpanel'; pv.dataset.m = 'video'
      const rec = primary.querySelector('.rec')
      if (rec && (rec.classList.contains('playable') || rec.style.backgroundImage)) {
        const rw = document.createElement('div'); rw.className = 'frecwrap'
        pv.appendChild(rw)
        move(rec, rw, false)
      } else {
        pv.innerHTML = '<div class="noev"><span>no recording kept for this run — stills still stand</span></div>'
      }
      panels.video = pv; body.appendChild(pv)
    }
    if (st === 'changed') {
      const wm = document.createElement('div'); wm.className = 'wmark'
      wm.innerHTML = '<span>✎ proof predates this text — re-run to re-verify</span>'
      body.appendChild(wm)
    }
    box.appendChild(body)
    apply(mode)
    return box
  }

  // The FOCUS VIEW: the overlay that pages focusBody through the screen's requirements.
  function buildFocus (dt, startId) {
    const scroll = dt.querySelector('.dtscroll')
    if (!scroll) return
    const reqs = reqNodes(dt)
    if (!reqs.length) return
    let cur = Math.max(0, reqs.findIndex(function (n) { return n.getAttribute('data-r') === startId }))
    const ov = document.createElement('div'); ov.className = 'focusov'
    let bodyRestore = null
    ov._restore = function () { if (bodyRestore) { bodyRestore(); bodyRestore = null } }
    // a vertical wheel over the frame strip scrolls the STRIP sideways, not the page — scanning the
    // stills never moves the requirement out from under you
    ov.addEventListener('wheel', function (e) {
      const strip = e.target.closest && e.target.closest('.pfstrip')
      if (!strip || !e.deltaY) return
      const before = strip.scrollLeft; strip.scrollLeft += e.deltaY
      if (strip.scrollLeft !== before) e.preventDefault()
    }, { passive: false })
    const pager = document.createElement('div'); pager.className = 'fpager'
    const prev = document.createElement('button'); prev.className = 'fnav prev'; prev.textContent = '‹'
    const dots = document.createElement('div'); dots.className = 'fdots'
    const next = document.createElement('button'); next.className = 'fnav next'; next.textContent = '›'
    pager.appendChild(prev); pager.appendChild(dots); pager.appendChild(next)
    function render () {
      if (bodyRestore) { bodyRestore(); bodyRestore = null }   // reclaim the previous page's moved nodes
      const old = ov.querySelector('.fpage'); if (old) old.remove()
      const r = reqInfo(reqs[cur])
      ov._curId = r.id        // so a loadRuns fold can reopen this reader on the SAME requirement
      const fb = focusBody(dt, r)
      bodyRestore = fb.restore
      ov.appendChild(fb.page)

      prev.disabled = cur === 0; next.disabled = cur === reqs.length - 1
      dots.innerHTML = ''
      // first and last page ALWAYS reachable; a window slides around the current one; the gap to an
      // anchor is an inert ellipsis — "1 … 4 5 6 7 8 … 13"
      const N = reqs.length
      const DMAX = 10
      let idxs
      if (N <= DMAX) {
        idxs = []
        for (let i = 0; i < N; i++) idxs.push(i)
      } else {
        const set = {}
        set[0] = set[N - 1] = 1
        for (let k = cur - 2; k <= cur + 2; k++) if (k >= 0 && k < N) set[k] = 1
        idxs = Object.keys(set).map(Number).sort(function (a, b) { return a - b })
      }
      let prevIdx = -1
      idxs.forEach(function (i) {
        if (prevIdx >= 0 && i - prevIdx > 1) {
          const gap = document.createElement('span'); gap.className = 'fdotgap'; gap.textContent = '…'
          dots.appendChild(gap)
        }
        const rr = reqs[i]
        const ttlEl = rr.querySelector('.rt')
        const d = document.createElement('button')
        d.className = 'fdot ' + (rr.getAttribute('data-state') || '') + (i === cur ? ' cur' : '')
        d.textContent = String(i + 1)
        d.title = rr.getAttribute('data-r') + ' — ' + (ttlEl ? ttlEl.textContent : '')
        d.addEventListener('click', (function (idx) { return function () { cur = idx; render() } })(i))
        dots.appendChild(d)
        prevIdx = i
      })
    }
    prev.addEventListener('click', function () { if (cur > 0) { cur--; render() } })
    next.addEventListener('click', function () { if (cur < reqs.length - 1) { cur++; render() } })
    // the pager lives in the detail's full-width FOOTER BAR, shown only while focus is open
    const foot = dt.querySelector('.dtfoot')
    if (foot) { foot.innerHTML = ''; foot.appendChild(pager); foot.hidden = false }
    scroll.appendChild(ov); render()   // .cols is baked hidden — the data source, never a view
  }

  // THE LIST'S OPEN ROW (board R13: "an open row is the Focus body itself") — the accordion. One
  // row open at a time; opening restores any other reader first, so the shared source rows and the
  // one borrowed test node can never be claimed twice.
  function openListRow (dt, rid) {
    closeFocus()
    const escSel = window.CSS && CSS.escape ? CSS.escape(rid) : String(rid).replace(/"/g, '\\"')
    const card = dt.querySelector('.gridview .lst-card[data-r="' + escSel + '"]')
    const node = dt.querySelector('.reqpane .req[data-r="' + escSel + '"]')
    if (!card || !node) return
    const body = card.querySelector('.lst-body')
    const fb = focusBody(dt, reqInfo(node))
    body._restore = fb.restore
    body.appendChild(fb.page)
    body.hidden = false
    card.classList.add('open')
    card.scrollIntoView({ block: 'nearest' })
  }

  // THE FLOW VIEW (board R13, the frozen mockup 2026-08-22): the authored flows read like Focus.
  // ONE flow at a time, picked in a selector row above (one pill per flow + ＋ New flow, which
  // opens the composer — Task 5), then the SPLIT: the chapter rail on
  // the LEFT and the player on the RIGHT, each scrolling on its own (R2's principle). The rail IS
  // the scrubber — clicking a chapter seeks the ONE recording to that proves-step's timestamp
  // (never cut), the current chapter wears a ring, a failing chapter wears bengara and stops the
  // playback with its beat named, and everything after it reads not-reached. Everything derives
  // from the folded records (chapters + the unit/flow kind server-side in tools/flow.mjs, delivered
  // on /api/runs; thumbnails are the harvested frames) — the view stores nothing, and it never
  // moves the shared .testpane nodes (those belong to Focus's borrow / close-fold-reopen contract,
  // and a second borrower would fight it; Flow only READS them).
  function flowsOf (dt) {
    return [].slice.call(dt.querySelectorAll('.testpane .test')).map(function (t) {
      const slot = t.querySelector('.tststeps')
      const hist = (slot && slot._hist) || []
      // chapters and the video must come from the SAME record — the seek offsets are offsets into
      // that recording; prefer the newest record carrying both, then one with chapters alone (a
      // CLI run records steps but no video — the rail still reads honestly, with nothing to play)
      const one = hist.find(function (x) { return x.video && x.chapters && x.chapters.length }) ||
        hist.find(function (x) { return x.chapters && x.chapters.length }) || null
      // kind: the UNION of the two honest derivations — the baked source-plan kind (flowStep
      // present ⇒ flow, the List's rule; it also keeps a flow's pill before it has ever run) and
      // the record's server-derived kind (a cross-screen tag ⇒ flow, board R6's rule). A
      // flowStep-authored story is a flow even when it never leaves its screen — the record's
      // 'unit' must not shadow it.
      const recKind = (one && one.kind) || ''
      const baked = t.dataset.kind || ''
      const kind = (recKind === 'flow' || baked === 'flow') ? 'flow' : (recKind || baked)
      return { node: t, one: one, kind: kind, title: t.dataset.title || '' }
    }).filter(function (f) { return f.kind === 'flow' })
  }
  function buildFlow (dt, selTitle) {
    const fv = dt.querySelector('.flowview')
    if (!fv) return
    fv.innerHTML = ''
    const screen = dt.dataset.screen
    const flows = flowsOf(dt)
    if (!flows.length) {
      // the empty state offers the same authoring affordance the selector row does: the composer
      const em = document.createElement('div'); em.className = 'flempty'
      const h = document.createElement('h3'); h.textContent = 'No flow tests on this screen'
      const p = document.createElement('p')
      p.textContent = 'A flow crosses screens along a chosen path and reads as the units it connects.'
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'
      b.textContent = '＋ Author a flow test — chain proven beats'
      b.addEventListener('click', function () { openCompose(dt) })
      em.appendChild(h); em.appendChild(p); em.appendChild(b)
      fv.appendChild(em)
      return
    }
    const want = selTitle || dt._flowSel
    const cur = flows.filter(function (f) { return f.title === want })[0] || flows[0]
    dt._flowSel = cur.title   // an in-memory view preference — never stored in the tree
    // the selector row — one pill per flow, the open one marked; ＋ New flow hands off the prompt
    const bar = document.createElement('div'); bar.className = 'flowsel'
    flows.forEach(function (f) {
      const b = document.createElement('button'); b.type = 'button'
      b.className = 'fsel' + (f === cur ? ' on' : '')
      const t = document.createElement('span'); t.className = 'fsttl'; t.textContent = f.title
      const k = document.createElement('span'); k.className = 'fk'
      k.textContent = f.one ? ('flow · ' + f.one.chapters.length + ' chapters') : 'flow · not run yet'
      b.appendChild(t); b.appendChild(k)
      b.addEventListener('click', function () { buildFlow(dt, f.title) })
      bar.appendChild(b)
    })
    {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fsel newflow'
      const t = document.createElement('span'); t.className = 'fsttl'; t.textContent = '＋ New flow'
      const k = document.createElement('span'); k.className = 'fk'; k.textContent = 'chain proven beats — composed, or a prompt'
      b.appendChild(t); b.appendChild(k)
      b.addEventListener('click', function () { openCompose(dt) })
      bar.appendChild(b)
    }
    fv.appendChild(bar)
    if (!cur.one) {
      // a flow-kind plan with no record — the honest placeholder, never fake chapters
      const none = document.createElement('div'); none.className = 'flnone'
      none.textContent = 'Not run yet — Run to see its flow.'
      fv.appendChild(none)
      return
    }
    fv.appendChild(flowSplit(dt, screen, cur))
  }
  // Compose the chapters the strip shows from ONE record's reached chapters + its declared set.
  // flow.mjs deliberately returns only what RAN; the honesty is composed here (rule 3):
  //   - a failing chapter stops the flow — it is marked with its failing beat, and EVERY chapter
  //     after it reads not-reached, even one the recording ran green (a flow whose middle broke
  //     proves nothing downstream, and a strip that ends green on a broken run is a fake green);
  //   - a declared coverReqs id whose screen no reached chapter landed on trails as a not-reached
  //     chapter, so what the flow never got to is visible rather than silently absent.
  function flowChapters (one, screen) {
    const reached = (one.chapters || [])
    const steps = one.steps || []
    const out = []
    let broken = false   // once a chapter fails, nothing after it may read green (rule 3)
    for (let i = 0; i < reached.length; i++) {
      const c = reached[i]
      if (broken) {
        // recorded — even recorded GREEN — but downstream of the failure: the flow's state is no
        // longer the authored one, so it reads not-reached, never a green the run did not earn
        out.push({ title: c.title, screen: c.screen, t: c.t, reqs: c.reqs, st: 'nr', beat: '' })
      } else if (c.ok === false) {
        // name the beat that broke it: the first failing recorded step inside this chapter's range
        // (skipping the bare `proves` markers — coverage grammar, not a beat a person named)
        const end = i + 1 < reached.length ? reached[i + 1].t : null
        const inRange = function (s) {
          return s.ok === false && typeof s.t === 'number' && s.t >= c.t && (end == null || s.t < end)
        }
        const beat = steps.find(function (s) { return inRange(s) && !/^proves /.test(String(s.label || '')) }) ||
          steps.find(inRange) || steps.find(function (s) { return s.ok === false })
        out.push({ title: c.title, screen: c.screen, t: c.t, reqs: c.reqs, st: 'f', beat: beat ? String(beat.label || '') : '' })
        broken = true
      } else out.push({ title: c.title, screen: c.screen, t: c.t, reqs: c.reqs, st: 'p' })
    }
    const seen = {}
    for (const c of reached) seen[c.screen] = 1
    const miss = {}
    const order = []
    for (const id of one.reqs || []) {
      const q = String(id); const k = q.indexOf(':')
      const scr = k > 0 ? q.slice(0, k) : screen
      const bare = k > 0 ? q.slice(k + 1) : q
      if (seen[scr]) continue
      if (!miss[scr]) { miss[scr] = []; order.push(scr) }
      if (miss[scr].indexOf(bare) < 0) miss[scr].push(bare)
    }
    for (const scr of order) out.push({ title: scr, screen: scr, t: null, reqs: miss[scr], st: 'nr', beat: '' })
    return out
  }
  // The SPLIT itself — rail left, player right. All the seek mechanics live here: the ONE recording
  // is PAUSED at start (the server's byte-range support makes a MediaRecorder webm seekable);
  // nothing plays until a chapter is clicked, and playback pauses at each chapter's boundary —
  // manual advance, from the rail or the banner's play-next. A failing chapter STOPS the flow: its
  // banner names the failing beat the moment it is chosen (the verdict is already recorded), and
  // the caption clears while any banner shows so the two never overlap (the mockup's rule).
  function flowSplit (dt, screen, f) {
    const one = f.one
    const tnode = f.node
    const chs = flowChapters(one, screen)
    const split = document.createElement('div'); split.className = 'flsplit'
    const rail = document.createElement('div'); rail.className = 'flrail'
    const rh = document.createElement('div'); rh.className = 'flrailhead'
    rh.textContent = 'the path · ' + chs.length + ' chapter' + (chs.length === 1 ? '' : 's')
    rail.appendChild(rh)
    const strip = document.createElement('div'); strip.className = 'chstrip'
    rail.appendChild(strip)
    const main = document.createElement('div'); main.className = 'flmain'
    const card = document.createElement('div'); card.className = 'flowcard'
    // the slim header: flow name + kind + duration/run/cross-screen + the ⋯ menu
    const head = document.createElement('div'); head.className = 'flhead'
    const ttl = document.createElement('span'); ttl.className = 'flttl'; ttl.textContent = f.title
    head.appendChild(ttl)
    const kindEl = document.createElement('span'); kindEl.className = 'flkind'; kindEl.textContent = f.kind
    head.appendChild(kindEl)
    const seen = {}; let nscr = 0
    for (const c of chs) if (c.screen && !seen[c.screen]) { seen[c.screen] = 1; nscr++ }
    const cross = nscr > 1
    const meta = document.createElement('span'); meta.className = 'flmeta'
    const dur = one.ms != null ? (one.ms >= 1000 ? Math.round(one.ms / 1000) + 's' : Math.round(one.ms) + 'ms') : ''
    meta.textContent = [dur, one.commit ? 'run ' + one.commit : '', cross ? 'cross-screen' : '']
      .filter(Boolean).join(' · ')
    head.appendChild(meta)
    const grow = document.createElement('span'); grow.className = 'grow'; head.appendChild(grow)
    // the ⋯ menu: Edit / open recording / Remove — authoring is the R15 prompt handoff; the
    // recording item just opens the one artifact itself, and is withheld when no video exists
    {
      const testCtx = function () {
        return { screen: screen, testTitle: f.title,
          coverIds: [].slice.call(tnode.querySelectorAll('.tags .tag')).map(function (el) { return el.getAttribute('data-r') }),
          reqList: screenReqList(dt) }
      }
      const menu = promptMenu('flow actions', [['edittest', '✎ Edit this flow', testCtx]])
      const pop = menu.querySelector('.fmenupop')
      if (one.video) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'
        b.textContent = '▶ Open the full recording'
        b.addEventListener('click', function () { window.open(one.voiced || one.video, '_blank', 'noopener') })
        pop.appendChild(b)
      }
      pop.appendChild(promptItem('removetest', '✕ Remove this flow', testCtx))
      head.appendChild(menu)
    }
    card.appendChild(head)

    const play = document.createElement('div'); play.className = 'flplay'
    const cap = document.createElement('div'); cap.className = 'flcap'
    const banner = document.createElement('div'); banner.className = 'flbanner'
    let video = null
    let ready = false
    let pending = null   // a chapter seek clicked before the metadata (and duration probe) landed
    let endAt = null     // the current chapter's boundary — playback pauses there (manual advance)
    let curIdx = -1
    const MARK = { p: '✓', f: '✗', nr: '◌' }
    const fmtT = function (ms) {
      const s = Math.max(0, Math.round(ms / 1000))
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
    }
    function setCaption (i) {
      const c = chs[i]
      cap.textContent = 'chapter ' + (i + 1) + ' of ' + chs.length + ' — ' + c.title +
        (c.reqs && c.reqs.length ? ' · proves ' + c.reqs.join(', ') : '')
    }
    function hideBanner () { banner.className = 'flbanner'; banner.innerHTML = '' }
    // the banner never overlaps the caption — the caption CLEARS while a banner shows, so a stop
    // reads once, loudly, never twice in two places
    function showBanner (kind, text, btnLabel, btnFn) {
      banner.innerHTML = ''
      const s = document.createElement('span'); s.textContent = text; banner.appendChild(s)
      if (btnLabel) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'flgo'
        b.textContent = btnLabel
        b.addEventListener('click', btnFn)
        banner.appendChild(b)
      }
      banner.className = 'flbanner show ' + kind
      cap.textContent = ''
    }
    function seekChapter (i) {
      const c = chs[i]
      if (!video || !c || c.t == null) return
      curIdx = i
      for (const el of strip.querySelectorAll('.ch.cur')) el.classList.remove('cur')
      if (strip.children[i]) strip.children[i].classList.add('cur')   // the ring
      if (c.st === 'f') {
        // the recorded verdict IS the stop — say so the moment the failing chapter is chosen, and
        // let its segment play beneath the banner; playback never proceeds past it (rule 3)
        showBanner('bad', '✗ the flow stopped here — failed at ' + (c.beat || c.title) +
          ' · everything after is not reached', '⟳ replay', function () { seekChapter(0) })
      } else { hideBanner(); setCaption(i) }
      // play THIS chapter only: the boundary is the next recorded chapter's start
      endAt = null
      for (let k = i + 1; k < chs.length; k++) if (chs[k].t != null) { endAt = chs[k].t / 1000; break }
      if (!ready) { pending = c.t / 1000; return }
      video.currentTime = c.t / 1000
      video.play().catch(function () {})
    }
    // what the end of chapter i means: a failure already stopped it for good (its banner is up);
    // the last green chapter of an all-green run completes the flow; otherwise the person advances
    // by hand — or the honest early-stop is named (rule 3: a broken run never ends on a plain green)
    function atChapterEnd (i) {
      const c = chs[i]
      if (!c || c.st === 'f') return
      let next = -1
      for (let k = i + 1; k < chs.length; k++) if (chs[k].t != null && chs[k].st !== 'nr') { next = k; break }
      if (next >= 0) showBanner('neutral', 'chapter done', '▶ play next — ' + chs[next].title, function () { seekChapter(next) })
      else if (chs.every(function (c2) { return c2.st === 'p' }))
        showBanner('ok', '✓ flow complete — every tagged requirement proven', '⟳ replay', function () { seekChapter(0) })
      else showBanner('neutral', '◌ the flow stopped early — what follows is not reached', '⟳ replay', function () { seekChapter(0) })
    }
    if (one.video) {
      video = document.createElement('video')
      video.controls = true; video.playsInline = true; video.preload = 'metadata'
      video.src = one.voiced || one.video
      const settle = function () {
        ready = true
        if (pending != null) { video.currentTime = pending; pending = null; video.play().catch(function () {}) }
        else video.currentTime = 0
      }
      video.addEventListener('loadedmetadata', function () {
        if (video.duration === Infinity) {
          // MediaRecorder webm carries no duration header — probe the file's end (the server
          // answers Range requests) so chapter seeks can land, then settle on the pending chapter
          // or back to the paused start
          const back = function () { video.removeEventListener('seeked', back); settle() }
          video.addEventListener('seeked', back)
          video.currentTime = 1e9
        } else settle()
      })
      video.addEventListener('timeupdate', function () {
        // MANUAL ADVANCE: pause at the chapter boundary — the person advances from the rail (or
        // the banner's play-next); on a failed chapter this same pause is where playback STOPS
        if (endAt != null && video.currentTime >= endAt) { video.pause(); endAt = null; atChapterEnd(curIdx) }
      })
      video.addEventListener('ended', function () { if (curIdx >= 0) atChapterEnd(curIdx) })
      play.appendChild(video)
      const rp = document.createElement('button'); rp.type = 'button'; rp.className = 'flreplay'
      rp.title = 'replay from the first chapter'; rp.textContent = '⟳'
      rp.addEventListener('click', function () { seekChapter(0) })
      play.appendChild(rp)
      play.appendChild(banner)
      cap.textContent = 'paused — click any chapter to play it'
    } else {
      const no = document.createElement('div'); no.className = 'noev flnovid'
      const s = document.createElement('span')
      s.textContent = 'no recording kept for this run — the rail still reads honestly'
      no.appendChild(s)
      play.appendChild(no)
    }
    card.appendChild(play); card.appendChild(cap)
    main.appendChild(card)

    // the rail rows — thumbnail · given/beat label · name (with its mark) · requirement chips
    let beatN = 0
    chs.forEach(function (c, i) {
      // a not-reached chapter never plays — it is a rendered absence, not a seek target
      const el = document.createElement(c.st === 'nr' ? 'div' : 'button')
      if (c.st !== 'nr') el.type = 'button'
      el.className = 'ch ' + c.st
      const thumb = document.createElement('div'); thumb.className = 'thumb'
      if (c.t != null) {
        // the still: the harvested proof frame nearest this chapter's seek point, when one was cut
        let end = null
        for (let k = i + 1; k < chs.length; k++) if (chs[k].t != null) { end = chs[k].t; break }
        const frame = (one.frames || []).find(function (fr) {
          return typeof fr.t === 'number' && fr.t >= c.t && (end == null || fr.t < end)
        })
        if (frame) {
          const img = document.createElement('img')
          img.loading = 'lazy'; img.src = frame.img; img.alt = frame.cap || 'chapter still'
          thumb.appendChild(img)
        } else {
          const nt = document.createElement('span'); nt.className = 'nothumb'; nt.textContent = 'no still'
          thumb.appendChild(nt)
        }
      } else {
        const nt = document.createElement('span'); nt.className = 'nothumb'; nt.textContent = '◌'
        thumb.appendChild(nt)
      }
      if (cross && c.screen) {
        const tag = document.createElement('span'); tag.className = 'scrtag'; tag.textContent = c.screen
        thumb.appendChild(tag)
      }
      el.appendChild(thumb)
      const cm = document.createElement('div'); cm.className = 'chmeta'
      const no = document.createElement('div'); no.className = 'chno'
      // 'given' for an opening chapter that proves nothing (the setup the flow stands on); every
      // later reached chapter is a numbered beat; 'declared' marks a coverReqs screen the run
      // never reached at all
      no.textContent = c.t == null ? 'declared'
        : (i === 0 && !(c.reqs && c.reqs.length) ? 'given' : 'beat ' + (++beatN))
      if (c.t != null) {
        const tt = document.createElement('span'); tt.className = 'flt'; tt.textContent = ' · ' + fmtT(c.t)
        no.appendChild(tt)
      }
      cm.appendChild(no)
      const nm = document.createElement('div'); nm.className = 'chname'
      const mk = document.createElement('span'); mk.className = 'chmk'; mk.textContent = MARK[c.st]
      nm.appendChild(mk)
      nm.appendChild(document.createTextNode(' ' + c.title))
      cm.appendChild(nm)
      if (c.st === 'f' && c.beat) {
        const beat = document.createElement('div'); beat.className = 'flbeat'
        beat.textContent = '✗ failed at — ' + c.beat
        cm.appendChild(beat)
      }
      if (c.st === 'nr') {
        const why = document.createElement('div'); why.className = 'flnr'
        why.textContent = c.t == null ? 'declared, never reached' : 'after the failure — not reached'
        cm.appendChild(why)
      }
      // the requirement chips this chapter proves — each opens that requirement in Focus; a chapter
      // can land on a hash route with no card (howitworks, a probe page), whose ids render INERTLY
      const reqs = document.createElement('div'); reqs.className = 'flreqs'
      for (const rid of c.reqs || []) {
        const home = c.screen === screen ? dt : document.querySelector('.dt[data-screen="' + c.screen + '"]')
        if (home) {
          const chip = document.createElement('button'); chip.className = 'flreq'
          chip.dataset.r = rid
          chip.textContent = (c.screen === screen ? '' : c.screen + ':') + rid
          chip.addEventListener('click', function (e) {
            e.stopPropagation()
            if (home === dt) { setView(dt, 'focus', rid); return }
            const j = SCREENS.indexOf(c.screen)
            if (j >= 0) { open(j); setView(home, 'focus', rid) }
          })
          reqs.appendChild(chip)
        } else {
          const chip = document.createElement('span'); chip.className = 'flreq inert'
          chip.textContent = (c.screen ? c.screen + ':' : '') + rid
          reqs.appendChild(chip)
        }
      }
      if (reqs.children.length) cm.appendChild(reqs)
      el.appendChild(cm)
      if (c.st !== 'nr') el.addEventListener('click', function (e) {
        if (e.target.closest('img')) return   // the thumbnail opens the zoom — a different intent
        seekChapter(i)
      })
      strip.appendChild(el)
    })
    split.appendChild(rail); split.appendChild(main)
    return split
  }

  // THE FLOW COMPOSER (board R13's "＋ New flow opens the composer"; D4 of the 2026-08-20 beats spec
  // as amended 2026-08-21 by the human — deterministic-first). The LIBRARY is derived at build time
  // (tools/compose.mjs deriveLibrary, fed by build-board through the JSON island) from behavior
  // blocks + tests ONLY: a beat node where spec/<screen>/steps.ts declares a step function, an
  // inline node where a test tags a requirement but no step function exists (Claude-path only,
  // marked), an outline node where only a behavior block exists (its flow is the first proof), and
  // NO node where a requirement has neither. The chain is a BROWSER-ONLY draft (localStorage) — the
  // board stores no graph as truth. The two-path button renders the SAME answer the server's
  // composeCheck gives (every chained beat function-shaped + proven ⇒ composed with no model; else
  // the detached claude job, the blocking beat named); the server re-derives and re-checks before
  // it writes anything, so this is a rendering of the rule, never the authority.
  const COMPOSE = B.compose || { nodes: [], givens: {}, titles: {} }
  const cnodeOf = id => COMPOSE.nodes.find(function (n) { return n.id === id }) || null
  const draftKey = screen => 'sbComposeDraft:' + screen
  function readDraft (screen) {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(screen)) || 'null')
      if (d && Array.isArray(d.chain)) return { chain: d.chain.filter(cnodeOf), name: String(d.name || '') }
    } catch (err) { /* no draft */ }
    return { chain: [], name: '' }
  }
  function writeDraft (screen, d) { try { localStorage.setItem(draftKey(screen), JSON.stringify(d)) } catch (err) { /* private mode */ } }
  // the chain's start screen decides the fixture and the file (a flow lives where it starts)
  const chainStart = (screen, chain) => (chain.length ? cnodeOf(chain[0]).screen : screen)
  const givenFor = (screen, chain) => COMPOSE.givens[chainStart(screen, chain)] || null
  function chainCheck (screen, chain) {
    const given = givenFor(screen, chain)
    const state = {}
    ;(given ? given.gives : []).forEach(function (t) { state[t] = true })
    const rows = chain.map(function (id) {
      const n = cnodeOf(id)
      const missing = n.needs.filter(function (t) { return !state[t] })
      n.gives.forEach(function (t) { state[t] = true })
      return { n: n, missing: missing }
    })
    return { rows: rows, end: state, gap: rows.find(function (r) { return r.missing.length }) || null }
  }
  const fillerFor = missing => COMPOSE.nodes.find(function (n) { return n.gives.some(function (g) { return missing.indexOf(g) >= 0 }) }) || null
  const qualified = (n, start) => (n.screen === start ? '' : n.screen + ':') + n.proves
  // the prompt — the SAME text tools/compose.mjs composePrompt builds server-side for the job
  function composePromptText (screen, chain, name) {
    const picked = chain.map(cnodeOf)
    const start = chainStart(screen, chain)
    const given = givenFor(screen, chain)
    const covers = []
    picked.forEach(function (n) { const q = qualified(n, start); if (covers.indexOf(q) < 0) covers.push(q) })
    const screens = {}; picked.forEach(function (n) { screens[n.screen] = true })
    const unproven = picked.filter(function (n) { return !n.proven })
    const beats = picked.map(function (n, i) {
      return '  beat ' + (i + 1) + ' — ' + n.name + '   (proves ' + qualified(n, start) + (n.proven ? '' : ' — UNPROVEN, red-first here') + ')'
    }).join('\n')
    return 'Author a ' + (Object.keys(screens).length > 1 ? 'cross-screen ' : '') + 'flow test for the "' + start + '" screen.\n\n' +
      'File: spec/' + start + '/test.spec.ts   (a flow lives in the screen it starts on)\n' +
      "Test name: '" + (name.trim() || 'Untitled flow') + "'\n" +
      'Declare up front: coverReqs(' + (covers.map(function (c) { return "'" + c + "'" }).join(', ') || '…') + ')\n\n' +
      'Given (the fixture): ' + (given ? given.text : 'seed the golden fixture (spec/<screen>/steps.ts has no GIVEN yet)') + '\n' +
      (beats || '  (chain beats above)') + '\n' +
      (unproven.length ? '\nUnproven beats: ' + unproven.map(function (n) { return n.proves }).join(', ') + ' — this flow is their FIRST proof; same red-first standard.\n' : '') +
      '\nA beat already function-shaped (spec/<screen>/steps.ts) is CALLED, never re-written; an inline or\n' +
      'unwritten beat is authored red-first — and refactoring it into an exported step function while you\n' +
      'are there makes the next flow composable with no model at all (the beat-function convention,\n' +
      'kg-e2e).\n\n' +
      "Discipline (kg-e2e): failing test FIRST · every Then a real assertion · checkReq('<id>') inside the beat it proves · every asserted value visible in the recording · never weaken a test to go green."
  }
  // a thumbnail: the requirement's harvested AFTER frame (its proof, a real run's evidence — the
  // composer shows what a beat's Then looked like when it last passed); hover alternates the
  // before/after pair (the beat as a two-frame loop); click zooms in the shared lightbox
  function cthumb (n, cls) {
    const box = document.createElement('div'); box.className = cls
    if (n.still) {
      const img = document.createElement('img'); if (cls === 'lthumb') img.loading = 'lazy'; img.src = n.still
      img.alt = n.name + ' — after'; img.dataset.after = n.still
      if (n.before) img.dataset.before = n.before
      box.appendChild(img)
    } else {
      const ns = document.createElement('div'); ns.className = 'noscene'
      ns.textContent = n.kind === 'outline' ? 'no proof yet' : 'no evidence frame yet'
      box.appendChild(ns)
    }
    return box
  }
  const cplayers = []
  function cplay (box) {
    const img = box.querySelector('img'); if (!img || !img.dataset.before || box._cstop) return
    // both frames DECODED before the loop starts — swapping src on a still-loading image restarts
    // its load every tick and the frame never paints (a large evidence png outlives a 700ms tick)
    const pre = new Image(); pre.src = img.dataset.before
    let on = false; let t = null; let dead = false
    const go = function () {
      if (dead) return
      t = setInterval(function () { on = !on; img.src = on ? img.dataset.before : img.dataset.after }, 700)
      cplayers.push(t)
    }
    if (pre.complete) go(); else { pre.onload = go; pre.onerror = function () { dead = true } }
    box._cstop = function () { dead = true; if (t) clearInterval(t); img.src = img.dataset.after; box._cstop = null }
  }
  function cstopAll () {
    while (cplayers.length) clearInterval(cplayers.pop())
    document.querySelectorAll('.composeview .cthumb2, .composeview .lthumb').forEach(function (b) { if (b._cstop) b._cstop() })
  }
  let compMode = 'gif'     // chain thumbs: gif (the two-frame loop) ↔ stills — a view preference, never stored
  function buildCompose (dt) {
    const cv = dt.querySelector('.composeview')
    if (!cv) return
    cstopAll()
    const screen = dt.dataset.screen
    const draft = readDraft(screen)
    let chain = draft.chain
    const q = (cv._q || '').trim().toLowerCase()
    cv.innerHTML = ''
    const chk = chainCheck(screen, chain)
    const filler = chk.gap ? fillerFor(chk.gap.missing) : null
    const ready = n => n.needs.every(function (t) { return chk.end[t] })
    const start = chainStart(screen, chain)
    const given = givenFor(screen, chain)
    writeDraft(screen, { chain: chain, name: draft.name })

    // ── the header row
    const head = document.createElement('div'); head.className = 'chead'
    const hl = document.createElement('div'); hl.className = 'chl'
    const ht = document.createElement('span'); ht.className = 'cht'; ht.textContent = 'Flow composer'
    const hs = document.createElement('span'); hs.className = 'chs'
    hs.textContent = (COMPOSE.titles[screen] || screen) + ' · chain proven beats → a composed flow, or a ready kg-e2e prompt'
    hl.appendChild(ht); hl.appendChild(hs); head.appendChild(hl)
    const seg = document.createElement('div'); seg.className = 'cseg'
    ;['gif', 'stills'].forEach(function (m) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cmode' + (compMode === m ? ' on' : '')
      b.textContent = m; b.addEventListener('click', function () { compMode = m; buildCompose(dt) }); seg.appendChild(b)
    })
    head.appendChild(seg)
    const back = document.createElement('button'); back.type = 'button'; back.className = 'btn sm cback'
    back.textContent = 'Back to Flow'
    back.addEventListener('click', function () { history.pushState(null, '', '#/' + screen + '/flow'); setView(dt, 'flow') })
    head.appendChild(back)
    cv.appendChild(head)

    const wrap = document.createElement('div'); wrap.className = 'cwrap'
    // ── the LIBRARY: "what can I do next?" — ready beats bright and first, blocked beats dimmed with
    // the token they still need, the gap's filler pinned on top whatever the filter
    const lib = document.createElement('div'); lib.className = 'cpanel clib'
    const lh = document.createElement('div'); lh.className = 'chd'
    const lt = document.createElement('h2'); lt.textContent = 'Beats'
    const lhint = document.createElement('span'); lhint.className = 'chint'; lhint.textContent = 'hover = preview · click name = chain · click frame = zoom'
    lh.appendChild(lt); lh.appendChild(lhint); lib.appendChild(lh)
    const search = document.createElement('input'); search.className = 'csearch'; search.type = 'search'
    search.placeholder = '⌕ find a beat — name or R id'; search.value = cv._q || ''
    search.addEventListener('input', function () {
      cv._q = search.value; const at = search.selectionStart
      buildCompose(dt)
      const s2 = cv.querySelector('.csearch'); if (s2) { s2.focus(); try { s2.setSelectionRange(at, at) } catch (err) {} }
    })
    lib.appendChild(search)
    const matches = COMPOSE.nodes.filter(function (n) {
      return !q || (n.name + ' ' + n.proves + ' ' + n.screen + ' ' + (COMPOSE.titles[n.screen] || '')).toLowerCase().indexOf(q) >= 0
    })
    const row = function (n) {
      const r = document.createElement('div'); r.className = 'lrow' + (ready(n) ? '' : ' dim') +
        (n.kind === 'outline' ? ' outline' : '') + (filler && filler.id === n.id ? ' hint' : '')
      r.dataset.node = n.id; r.dataset.kind = n.kind; r.dataset.ready = ready(n) ? '1' : '0'
      r.title = n.then || n.name
      r.appendChild(cthumb(n, 'lthumb'))
      const meta = document.createElement('div'); meta.className = 'lmeta2'
      const nm = document.createElement('div'); nm.className = 'lname2'; nm.textContent = n.name
      if (filler && filler.id === n.id) { const b = document.createElement('b'); b.className = 'lfill'; b.textContent = ' ← fills the gap'; nm.appendChild(b) }
      meta.appendChild(nm)
      if (!ready(n)) {
        const need = document.createElement('div'); need.className = 'lneed'
        need.textContent = 'needs ' + n.needs.filter(function (t) { return !chk.end[t] }).join(' · ')
        meta.appendChild(need)
      }
      if (n.kind === 'inline') {
        const il = document.createElement('div'); il.className = 'lneed lmute'
        il.textContent = 'inline test · runs via Claude'; meta.appendChild(il)
      } else if (n.kind === 'outline') {
        const ol = document.createElement('div'); ol.className = 'lneed'
        ol.textContent = 'behavior only · first proof, via Claude'; meta.appendChild(ol)
      } else if (!n.proven) {
        const np = document.createElement('div'); np.className = 'lneed'
        np.textContent = 'not currently passing · re-prove first'; meta.appendChild(np)
      }
      r.appendChild(meta)
      const rid = document.createElement('span'); rid.className = 'lrid'; rid.textContent = n.proves
      r.appendChild(rid)
      r.addEventListener('mouseenter', function () { cplay(r.querySelector('.lthumb')) })
      r.addEventListener('mouseleave', function () { const b = r.querySelector('.lthumb'); if (b && b._cstop) b._cstop() })
      r.addEventListener('click', function (e) {
        if (e.target.closest('img')) return      // the frame zooms (the shared lightbox) — a different intent
        compAdd(dt, n.id)
      })
      return r
    }
    if (filler) lib.appendChild(row(filler))
    const grps = {}
    matches.forEach(function (n) { if (!filler || n.id !== filler.id) (grps[n.screen] = grps[n.screen] || []).push(n) })
    const order = Object.keys(grps).sort(function (a, b) { return a === screen ? -1 : b === screen ? 1 : 0 })
    if (order.length) {
      order.forEach(function (sid) {
        const g = document.createElement('div'); g.className = 'cgrp'
        g.textContent = (COMPOSE.titles[sid] || sid) + ' · ' + grps[sid].length
        lib.appendChild(g)
        grps[sid].slice().sort(function (a, b) { return (ready(b) ? 1 : 0) - (ready(a) ? 1 : 0) }).forEach(function (n) { lib.appendChild(row(n)) })
      })
    } else if (!filler) {
      const none = document.createElement('div'); none.className = 'cold2'
      none.textContent = q ? 'no beat matches “' + q + '”' : 'no beats yet — a node appears here the moment a behavior block or a test exists'
      lib.appendChild(none)
    }
    if (!q) {
      // screens with NO node at all, named honestly — nothing is invented for them
      const empty = SCREENS.filter(function (s) { return !COMPOSE.nodes.some(function (n) { return n.screen === s }) })
      empty.forEach(function (sid) {
        const g = document.createElement('div'); g.className = 'cgrp'; g.textContent = (COMPOSE.titles[sid] || sid) + ' · 0'
        const c = document.createElement('div'); c.className = 'cold2'
        c.textContent = 'no beats yet — no behavior block and no tagging test. kg-deep drafts them; they appear here the moment they exist.'
        lib.appendChild(g); lib.appendChild(c)
      })
    }
    wrap.appendChild(lib)

    // ── the CHAIN: one rail — the Given, then each beat; the segment between rows carries the joint
    const right = document.createElement('div')
    const cp = document.createElement('div'); cp.className = 'cpanel cchain'
    const nb = document.createElement('div'); nb.className = 'cnamebar'
    const nl = document.createElement('span'); nl.className = 'lbl2'; nl.textContent = 'flow name'
    const name = document.createElement('input'); name.id = 'compName'; name.value = draft.name; name.placeholder = 'name the flow'
    name.addEventListener('input', function () { writeDraft(screen, { chain: chain, name: name.value }); renderPrompt() })
    nb.appendChild(nl); nb.appendChild(name); cp.appendChild(nb)
    const sum = document.createElement('div'); sum.className = 'csum'
    const chip = function (cls, text) { const s = document.createElement('span'); s.className = 'schip ' + cls; s.textContent = text; sum.appendChild(s) }
    chip('', chain.length + ' beat' + (chain.length === 1 ? '' : 's'))
    const scr = {}; chain.forEach(function (id) { scr[cnodeOf(id).screen] = true })
    if (Object.keys(scr).length > 1) chip('', Object.keys(scr).length + ' screens')
    const gaps = chk.rows.filter(function (r) { return r.missing.length }).length
    if (gaps) chip('warn', '⚠ ' + gaps + ' gap' + (gaps === 1 ? '' : 's')); else chip('ok', 'path holds ✓')
    const proves = []; chain.forEach(function (id) { const qd = qualified(cnodeOf(id), start); if (proves.indexOf(qd) < 0) proves.push(qd) })
    if (proves.length) chip('', 'proves ' + proves.join(' · '))
    cp.appendChild(sum)
    const vc = document.createElement('div'); vc.className = 'vchain'
    const crow = function (cls, node, thumbNode, title, sub, chipText, chipCls) {
      const r = document.createElement('div'); r.className = 'crow2 ' + cls
      if (node) r.dataset.node = node.id
      const d = document.createElement('div'); d.className = 'cdot'; d.appendChild(document.createElement('span')); r.appendChild(d)
      const th = cthumb(thumbNode || { name: title, still: null, kind: 'given' }, 'cthumb2')
      r.appendChild(th)
      if (compMode === 'gif') cplay(th)
      const m = document.createElement('div'); m.className = 'cmeta2'
      const t = document.createElement('div'); t.className = 'cname3'; t.textContent = title
      const s = document.createElement('div'); s.className = 'csub3'; s.textContent = sub
      m.appendChild(t); m.appendChild(s); r.appendChild(m)
      const c = document.createElement('span'); c.className = 'cchip ' + (chipCls || ''); c.textContent = chipText; r.appendChild(c)
      return r
    }
    const g = crow('given', null, null, given ? given.text : 'no GIVEN yet — spec/' + start + '/steps.ts declares no fixture',
      given ? 'given · set once' : 'the Claude path seeds it', 'fixture', 'fix')
    vc.appendChild(g)
    chk.rows.forEach(function (r, i) {
      const conn = document.createElement('div'); conn.className = 'cconn' + (r.missing.length ? ' gap' : '')
      const sg = document.createElement('span'); sg.className = 'seg'; conn.appendChild(sg)
      if (r.missing.length) {
        const jl = document.createElement('span'); jl.className = 'jlab'
        jl.appendChild(document.createTextNode('needs '))
        r.missing.forEach(function (mt) { const k = document.createElement('span'); k.className = 'kc'; k.textContent = mt; jl.appendChild(k); jl.appendChild(document.createTextNode(' ')) })
        if (filler) { jl.appendChild(document.createTextNode('— ')); const b = document.createElement('b'); b.textContent = filler.name; jl.appendChild(b); jl.appendChild(document.createTextNode(' fills it, pinned top-left')) }
        conn.appendChild(jl)
      }
      vc.appendChild(conn)
      const n = r.n
      const kindNote = n.kind === 'beat' ? (n.proven ? '' : n.stale ? ' · proven, stale by source — run first' : ' · not currently passing') : n.kind === 'inline' ? ' · inline — Claude writes this beat' : ' · unproven — written red-first here'
      const cr = crow((n.proven && n.kind === 'beat' ? '' : 'outline') + (r.missing.length ? ' gapb' : ''), n, n, n.name,
        'beat ' + (i + 1) + ' · ' + n.screen + kindNote, qualified(n, start), '')
      const x = document.createElement('button'); x.type = 'button'; x.className = 'vx'; x.title = 'remove'; x.textContent = '✕'
      x.addEventListener('click', function () { chain.splice(i, 1); writeDraft(screen, { chain: chain, name: name.value }); buildCompose(dt) })
      cr.appendChild(x)
      vc.appendChild(cr)
    })
    cp.appendChild(vc)
    right.appendChild(cp)

    // ── the job panel (hidden until a path runs) + the two-path actions + the prompt + the honesty note
    const job = document.createElement('div'); job.className = 'cjob'; job.hidden = true
    const jh = document.createElement('div'); jh.className = 'cjhead'; job.appendChild(jh)
    const js = document.createElement('div'); js.className = 'cjsteps'; job.appendChild(js)
    right.appendChild(job)
    const out = document.createElement('div'); out.className = 'cout'
    const left = document.createElement('div')
    const acts = document.createElement('div'); acts.className = 'cactions'
    const blocking = chain.map(cnodeOf).filter(function (n) { return n.kind !== 'beat' || !n.proven })
    const deterministic = chain.length > 0 && blocking.length === 0 && !!given
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn cadd ' + (deterministic ? 'det' : 'ai')
    add.dataset.path = deterministic ? 'deterministic' : 'claude'
    add.textContent = deterministic ? '＋ Add test — composed instantly, no AI' : '＋ Add test — runs in Claude'
    add.disabled = !chain.length
    add.addEventListener('click', function () { if (deterministic) compCompose(dt, chain, name.value, job); else compHand(dt, chain, name.value, job) })
    acts.appendChild(add)
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn ccopy'
    copy.textContent = deterministic ? '⧉ Copy prompt — run Claude yourself' : '⧉ Copy prompt — run it yourself'
    copy.addEventListener('click', function () {
      const t = composePromptText(screen, chain, name.value)
      const p = navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject(new Error('no clipboard'))
      p.then(function () { toast('Prompt copied — paste it to Claude') }).catch(function () { toast('Select and copy the prompt text') })
    })
    acts.appendChild(copy)
    const tog = document.createElement('button'); tog.type = 'button'; tog.className = 'linkbtn ctog'; tog.textContent = 'view the prompt'
    acts.appendChild(tog)
    const why = document.createElement('span'); why.className = 'cwhy'
    why.textContent = !chain.length ? 'chain beats first'
      : deterministic ? 'every beat is a proven step function — no model involved'
        : !given ? 'spec/' + start + '/steps.ts declares no GIVEN — Claude seeds the fixture'
          // two reasons, told apart (final review m2): every blocker STALE by a source edit — most
          // often the compose that just wrote this screen's file — wants a run, not the Claude path
          : blocking.every(function (n) { return n.stale })
            ? blocking.map(function (n) { return qualified(n, start) }).join(' · ') + (blocking.length === 1 ? ' is' : ' are') + ' proven, but stale by source — run spec/' + start + ' first, then compose'
            : blocking.map(function (n) { return qualified(n, start) }).join(' · ') + (blocking.length === 1 ? ' isn’t' : ' aren’t') + ' function-shaped + proven yet — Claude writes this one'
    acts.appendChild(why)
    left.appendChild(acts)
    const pb = document.createElement('div'); pb.className = 'cprompt'; pb.hidden = true
    const ph = document.createElement('div'); ph.className = 'ph2'; ph.textContent = 'what gets handed to Claude'
    const pre = document.createElement('pre'); pb.appendChild(ph); pb.appendChild(pre)
    left.appendChild(pb)
    tog.addEventListener('click', function () { pb.hidden = !pb.hidden; tog.textContent = pb.hidden ? 'view the prompt' : 'hide the prompt' })
    function renderPrompt () { pre.textContent = composePromptText(screen, chain, name.value) }
    renderPrompt()
    out.appendChild(left)
    const honest = document.createElement('div'); honest.className = 'chonest'
    honest.innerHTML = '<b>Two paths, no guessing which</b> — when every chained beat is a <b>function-shaped, proven</b> step, ' +
      'Add test <b>composes the flow file deterministically: no AI at all</b> (each beat call threads exact expected numbers ' +
      'through shared state). When any beat is inline or not yet written, Add test hands the prompt to the board’s ' +
      '<b>detached claude job</b> (the Scan · Rewrite runner) and Claude writes it red-first. Either way the composer ' +
      'itself stores nothing, and the flow appears on the board when its test lands and runs.'
    out.appendChild(honest)
    right.appendChild(out)
    wrap.appendChild(right)
    cv.appendChild(wrap)
  }
  function compAdd (dt, id) {
    const screen = dt.dataset.screen
    const d = readDraft(screen)
    const chk = chainCheck(screen, d.chain)
    const n = cnodeOf(id)
    const gapAt = chk.rows.findIndex(function (r) { return r.missing.length })
    // the gap's filler slots in BEFORE the beat that needed it; anything else appends
    if (gapAt >= 0 && n.gives.some(function (g2) { return chk.rows[gapAt].missing.indexOf(g2) >= 0 })) d.chain.splice(gapAt, 0, id)
    else d.chain.push(id)
    writeDraft(screen, d)
    buildCompose(dt)
  }
  const jstep = (box, mark, text, cls) => {
    const s = document.createElement('div'); s.className = 'cjstep' + (cls ? ' ' + cls : '')
    const m = document.createElement('span'); m.textContent = mark; const t = document.createElement('span'); t.textContent = text
    s.appendChild(m); s.appendChild(t); box.appendChild(s); return s
  }
  // THE DETERMINISTIC PATH: the server re-derives the library, runs composeCheck and emitFlow
  // (tools/compose.mjs), writes spec/<start>/test.spec.ts and reports the file — or refuses with
  // the reason. Nothing is composed at suite runtime and no graph is stored: the file is ordinary
  // authored-test material from the moment it is written.
  function compCompose (dt, chain, name, job) {
    const screen = dt.dataset.screen
    job.hidden = false
    job.querySelector('.cjhead').textContent = 'composing — deterministic, no model involved'
    const box = job.querySelector('.cjsteps'); box.innerHTML = ''
    const run = jstep(box, '◌', 'asking the server to compose the flow file', 'run')
    fetch('/api/compose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain: chain, name: name }) })
      .then(function (r) { return r.text().then(function (t) { return { ok: r.ok, text: t } }) })
      .then(function (r) {
        run.remove()
        if (!r.ok) { job.querySelector('.cjhead').textContent = 'refused — nothing written'; jstep(box, '✗', r.text, 'bad'); return }
        const out = JSON.parse(r.text)
        job.querySelector('.cjhead').textContent = 'composed — deterministic, no model involved'
        jstep(box, '✓', 'wrote ' + out.path + " — test('" + out.testTitle + "') · coverReqs(" + out.covers.map(function (c) { return "'" + c + "'" }).join(', ') + ')')
        jstep(box, '✓', chain.length + ' beat call' + (chain.length === 1 ? '' : 's') + ' chained, each inside its checkReq — expected numbers threaded through shared state')
        jstep(box, '✓', 'validity = every beat proven red-first in its unit home + this file’s first run passing')
        // honest about the cost (final review m2): the write moved spec/<start>/test.spec.ts, so EVERY
        // proof that file carries — the whole start screen, and any cross-screen tag in it — reads
        // stale board-wide until the file runs; a second compose on this screen is refused until then
        jstep(box, '!', 'spec/' + out.start + '’s proofs read stale until this file runs — the write moved their source; run it before composing here again')
        const s = jstep(box, '→', '')
        const a = document.createElement('a'); a.href = '#/' + out.start + '/flow'; a.textContent = 'run it — the flow folds in and appears in the Flow view'
        s.lastChild.appendChild(a)
        writeDraft(screen, { chain: [], name: '' })     // the draft is spent — the file is the flow now
      })
      .catch(function (err) { run.remove(); jstep(box, '✗', 'could not reach the board server: ' + err.message, 'bad') })
  }
  // THE CLAUDE PATH: one click, no clipboard — the prompt goes to the board's EXISTING detached claude
  // runner (the Scan · Rewrite family: a signed-in `claude`, its own process group so Cancel kills
  // the whole tree, diagnose() naming an expired login). The run panel streams it like any job; the
  // server's "done" means the test really landed on disk (flowLanded), never that claude exited 0.
  function compHand (dt, chain, name, job) {
    job.hidden = false
    job.querySelector('.cjhead').textContent = 'authoring — a detached claude job, the Scan · Rewrite runner'
    const box = job.querySelector('.cjsteps'); box.innerHTML = ''
    const run = jstep(box, '◌', 'handing the prompt to the board’s claude runner', 'run')
    fetch('/api/compose-job', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain: chain, name: name }) })
      .then(function (r) { return r.text().then(function (t) { return { ok: r.ok, text: t } }) })
      .then(function (r) {
        run.remove()
        if (!r.ok) { job.querySelector('.cjhead').textContent = 'refused — no job started'; jstep(box, '✗', r.text, 'bad'); return }
        jstep(box, '✓', 'prompt handed over · job started detached — Cancel in the run panel kills the group')
        jstep(box, '◌', "Claude is writing the failing test '" + (name.trim() || 'Untitled flow') + "' red-first — minutes, not seconds; the run panel streams it", 'run')
        jstep(box, '→', 'done means the test LANDED in the file (the disk is asked, never the exit code); the flow appears in the Flow view from its first run')
      })
      .catch(function (err) { run.remove(); jstep(box, '✗', 'could not reach the board server: ' + err.message, 'bad') })
  }

  // THE VIEW TOGGLE (board R13): Focus / Grid / Flow, one segmented control in the detail header
  // (the Columns view was retired 2026-08-18 — its baked panes stay in the DOM as the hidden shared
  // source, and NOTHING un-hides .cols). Focus is the default and opens the reader; Grid is the
  // behavior grid (one row per requirement — Grid replaced the compact List, 2026-08-18); Flow is
  // the chaptered player over each test's recording, rebuilt from the folded records on every
  // entry. Switching tears down any open reader (restoring its moved nodes).
  function setView (dt, view, startId) {
    const gv = dt.querySelector('.gridview')
    const fv = dt.querySelector('.flowview')
    const cv = dt.querySelector('.composeview')
    dt.querySelectorAll('.viewseg .vseg').forEach(function (b) { b.classList.toggle('on', b.dataset.view === view) })
    closeFocus()
    cstopAll()
    if (cv) cv.hidden = view !== 'compose'
    if (view === 'grid') { if (gv) gv.hidden = false; if (fv) fv.hidden = true }
    else if (view === 'flow') {
      if (gv) gv.hidden = true
      // build AFTER closeFocus put any borrowed test node back — Flow reads the whole pane
      if (fv) { buildFlow(dt); fv.hidden = false }
    } else if (view === 'compose') {
      // the composer (board R13 / R15 family) — not a segment of the toggle; reached from ＋ New
      // flow or #/compose/<screen>, it derives its library from the JSON island and stores nothing
      if (gv) gv.hidden = true; if (fv) fv.hidden = true
      if (cv) buildCompose(dt)
    } else { if (gv) gv.hidden = true; if (fv) fv.hidden = true; buildFocus(dt, startId) }   // focus (the default)
  }
  for (const b of document.querySelectorAll('.viewseg .vseg'))
    b.addEventListener('click', e => { const dt = e.currentTarget.closest('.dt'); if (dt) setView(dt, e.currentTarget.dataset.view) })
  // a List row toggles open in place — the accordion whose open body IS the Focus body (board R13)
  for (const h of document.querySelectorAll('.gridview .lst-head'))
    h.addEventListener('click', e => {
      const card = e.currentTarget.closest('.lst-card')
      const dt = e.currentTarget.closest('.dt')
      if (!card || !dt) return
      if (card.classList.contains('open')) closeFocus()          // toggling the open row shut
      else openListRow(dt, card.dataset.r)
    })
  // the gap strip's add-test affordance (R15 prompt handoff) — delegated, it survives a syncDerived swap
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-addtest]')
    if (!b) return
    const dt = b.closest('.dt')
    if (dt) openAddTest(dt)
  })
  // a click anywhere outside an open ⋯ menu closes it (the toggle stops its own click bubbling here)
  document.addEventListener('click', e => {
    document.querySelectorAll('.fmenu.open').forEach(m => { if (!m.contains(e.target)) m.classList.remove('open') })
  })

  // A requirement is a title that EXPANDS to its full description (board R3); a test collapses to a
  // title + tags + status and opens to its evidence (R10). One click on the header toggles either.
  for (const h of document.querySelectorAll('.req > .h'))
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'))
  for (const h of document.querySelectorAll('.test > .th'))
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'))

  // (The many-to-many hover cross-light — hover a requirement, its tests lit indigo, and back —
  // left with the Columns view, 2026-08-18: the .req/.test rows it wired are the hidden shared
  // source now, unreachable by a pointer. The link itself is served visibly instead: Focus's proof
  // line resolves a requirement's covering test by tag (board R5's test asserts it), and a Flow
  // chapter's requirement chips carry the same indigo hover cue the rows used to.)

  // The full log opens in ONE floating window (board R10), populated from the test's own log history
  // (the .tstlog the run machinery fills). No full-viewport scrim — the board stays visible behind it.
  const logsheet = document.getElementById('logsheet')
  const logbody = document.getElementById('logbody')
  // The Logs / Steps buttons are RELOCATED out of their .test row into the focus reader's ⋯ menu
  // (board R13/#4), so `closest('.test')` finds nothing there — fall back to the reader's moved test
  // node (.feval .fev .test), which still carries the .tstlog / .tststeps slots the popups read.
  const ownerTest = el => el.closest('.test') ||
    (el.closest('.feval') ? el.closest('.feval').querySelector('.fev .test') : null)
  for (const l of document.querySelectorAll('[data-log]'))
    l.addEventListener('click', e => {
      e.stopPropagation()
      const testEl = ownerTest(l); if (!testEl) return
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
      const testEl = ownerTest(l); if (!testEl) return
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

  // The prompt-handoff window (board R15) closes like the other sheets: Close / Esc / a click off
  // the card. The [data-prompt] guard keeps the opening click (a ⋯ menu item, outside the .box)
  // from closing the sheet in the same bubble that opened it — the [data-log] pattern above.
  const promptsheet = document.getElementById('promptsheet')
  for (const b of document.querySelectorAll('[data-promptclose]'))
    b.addEventListener('click', () => promptsheet.classList.remove('on'))
  document.addEventListener('keydown', e => { if (e.key === 'Escape') promptsheet.classList.remove('on') })
  document.addEventListener('click', e => {
    if (promptsheet.classList.contains('on') && !e.target.closest('.box') && !e.target.closest('[data-prompt]'))
      promptsheet.classList.remove('on')
  })

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
    document.getElementById('initvoiceover').checked = !!cfg.voiceOver
    const st = cfg.storage || { where: 'local' }
    setStore(st.where || 'local')
    document.getElementById('initgitbranch').value = st.gitBranch || ''
    document.getElementById('initpush').checked = !!st.push
    document.getElementById('initbucket').value = st.bucketUrl || ''
  }

  // Voice-over readiness (init R6). The switch is DISABLED until piper + ffmpeg + a voice model are all
  // present; when they are not, Setup names what is missing and offers a one-click fix — a copyable
  // Claude prompt (primary) and a shell fallback — plus a Re-check that re-probes without a restart.
  const VOICE_PROMPT = 'Install piper text-to-speech and a voice model so specboard can narrate ' +
    'watchable runs aloud. Put the voice model (e.g. en_US-lessac-medium.onnx and its .json) in this ' +
    "project's spec/_voices/ folder, and make sure the piper binary is on PATH. Then tell me it is ready."
  const VOICE_SHELL = [
    '# 1) install piper (pick what fits your OS)',
    'pipx install piper-tts        # Python, cross-platform',
    '# or grab a release binary: https://github.com/rhasspy/piper/releases',
    '',
    '# 2) drop a voice model into spec/_voices/',
    'mkdir -p spec/_voices',
    'base=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium',
    'curl -L -o spec/_voices/en_US-lessac-medium.onnx      "$base/en_US-lessac-medium.onnx"',
    'curl -L -o spec/_voices/en_US-lessac-medium.onnx.json "$base/en_US-lessac-medium.onnx.json"'
  ].join('\n')
  async function loadVoiceStatus () {
    const box = document.getElementById('initvoiceover')
    if (!box) return
    document.getElementById('initvoiceprompt').textContent = VOICE_PROMPT
    document.getElementById('initvoiceshell').textContent = VOICE_SHELL
    let st
    try { st = await (await fetch('/api/voice-status')).json() } catch (e) { return }
    box.disabled = !st.ready
    document.getElementById('initvoicewrap').classList.toggle('off', !st.ready)
    const status = document.getElementById('initvoicestatus')
    status.hidden = false
    status.textContent = st.ready
      ? 'piper detected — voice-over can run.'
      : (st.reason || 'voice-over prerequisites are missing') + ' — install below, then Re-check.'
    document.getElementById('initvoicehelp').hidden = !!st.ready
  }

  function foundRow (r) {
    // 'yours' — a screen with a PRD, the human's, full stop — is never touched by a re-crawl; a route
    // with no PRD yet is new. There is no guess distinction any more (the human, 2026-08-17). R5:
    // rerunning leaves settled work alone.
    const state = r.exists ? 'yours' : 'new'
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
      voiceOver: document.getElementById('initvoiceover').checked,
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

  // Copy-to-clipboard for any [data-copy] block (the voice-over install helper's prompt and shell).
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]')
    if (!b) return
    const el = document.getElementById(b.dataset.copy)
    if (!el) return
    try {
      await navigator.clipboard.writeText(el.textContent)
      const was = b.textContent; b.textContent = 'Copied ✓'
      setTimeout(() => { b.textContent = was }, 1200)
    } catch (err) { toast('could not copy — select the text and copy manually') }
  })
  // Re-check re-probes /api/voice-status live, so a just-installed piper flips the switch on with no reload.
  document.getElementById('initvoicerecheck').addEventListener('click', loadVoiceStatus)

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

  // THE FEATURE STRIP (board R16): six cards above the areas, each a link into the live example of
  // itself on this board (the hrefs are derived at build time). The dismiss control hides it, and
  // the dismissal is a CLIENT-SIDE preference (localStorage) — never stored in the tree, so where
  // no preference exists the strip simply renders again.
  {
    const featwrap = document.getElementById('featwrap')
    if (featwrap) {
      let pref = null
      try { pref = localStorage.getItem('sbFeats') } catch (e) { pref = null }
      if (pref === 'off') featwrap.hidden = true
      const fx = document.getElementById('featx')
      if (fx) fx.addEventListener('click', () => {
        featwrap.hidden = true
        try { localStorage.setItem('sbFeats', 'off') } catch (e) { /* preference only */ }
      })
      // the compose card's href routes to the composer itself (#/compose/<screen>, board R13) — the
      // old prompt-modal hop that used to ride this click is gone (final review wave: it opened the
      // R15 sheet on top of the composer)
    }
  }

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
    b.addEventListener('click', () => runTests(b.dataset.run, { headed: b.dataset.headed === '1' }))
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
    // The FOCUS reader (board R13) borrows a test node OUT of the testpane — and so does the List's
    // OPEN ROW, whose body is the Focus body itself. This fold only walks .testpane, so a borrowed
    // node would be skipped and its recording / frames / steps left stale (or, on a fresh deep-link,
    // never filled). Close whichever reader is open first (its node goes home and gets folded like
    // the rest), then reopen it on the SAME requirement. Both readers are derived, so this is a
    // clean refresh, not lost state — the close-fold-reopen contract (CLAUDE.md).
    const openOv = document.querySelector('.dt:not([hidden]) .focusov')
    const openRow = openOv ? null : document.querySelector('.dt:not([hidden]) .lst-card.open')
    const reopen = openOv ? { kind: 'focus', dt: openOv.closest('.dt'), id: openOv._curId }
      : openRow ? { kind: 'list', dt: openRow.closest('.dt'), id: openRow.dataset.r } : null
    if (reopen) closeFocus()
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
            // frames and its cover (board R10). When voice-over produced a VOICED cut, play that in
            // place of the silent one (init R6) — it carries the same frames plus narration audio.
            slot.innerHTML = '<video controls autoplay playsinline src="' + (one.voiced || one.video) + '"></video>' + label
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
      // PROOF FRAMES (board R14): the recording read as a scannable STRIP — one still per checked
      // value, cut from the recording at the instant that check fired, each captioned with its
      // got-vs-expected and reddened on a failure. Drawn from the newest record that actually HAS
      // frames (a later video-less CLI run must not blank them), exactly like the cover above. A run
      // with no video captures no frames, so the strip stays empty and collapses (:empty) — never a
      // faked or separately-captured strip. Each still is an <img>, so the existing lightbox zooms it.
      for (const slot of panel.querySelectorAll('.pfstrip')) {
        const host = slot.closest('.test')
        const hist = rec[host && host.dataset.title] || []
        const withFrames = hist.find(x => x.frames && x.frames.length)
        const frames = (withFrames && withFrames.frames) || []
        slot.innerHTML = frames.map(f =>
          '<figure class="pframe' + (f.ok === false ? ' bad' : '') + '">' +
          '<img loading="lazy" src="' + eh(f.img) + '" alt="' + eh(f.cap || f.req || 'proof frame') + '">' +
          '<figcaption class="pfcap">' + (f.req ? '<span class="pfreq">' + eh(f.req) + '</span>' : '') +
          '<span>' + eh(f.cap || '') + '</span></figcaption></figure>'
        ).join('')
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
        slot._hist = rec[slot.dataset.title] || []   // the Flow view reads the folded records here
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
        // the meta line SHOUTS the failure: how many steps broke, and which — not just the first. It
        // also NAMES THE COMMIT the result ran against (dispatch R8), so which commit a case passed or
        // failed in is legible on the result itself, not only inside the opened log.
        if (meta) {
          const took = one && one.ms != null ? fmt(one.ms) : ''
          const sha = one && one.commit
            ? ' · <span class="tsha" title="the commit this result ran against">' + eh(one.commit) + '</span>' : ''
          if (!one) meta.textContent = 'not run yet'
          else if (one.ok === false) {
            const nF = failNames.length || 1
            const names = failNames.slice(0, 2).join(' · ') + (failNames.length > 2 ? ' · …' : '')
            meta.innerHTML = '<span class="failat">✕ ' + nF + ' step' + (nF === 1 ? '' : 's') +
              ' failed' + (names ? ' — ' + eh(names) : '') + '</span>' + (took ? ' · ' + eh(took) : '') + sha
          } else {
            const np = beats.filter(b => /^proves /.test(b.head.label || '')).length
            meta.innerHTML = (np ? 'proves ' + np + ' requirement' + (np === 1 ? '' : 's') + ' · ' : '') +
              steps.filter(s => s.cat !== 'note').length + ' steps' + (took ? ' · ' + eh(took) : '') + sha
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
    // reopen the reader now that its borrowed node has been folded back into the pane
    if (reopen && reopen.dt) {
      if (reopen.kind === 'list') openListRow(reopen.dt, reopen.id)
      else setView(reopen.dt, 'focus', reopen.id)
    }
    // an OPEN Flow view rebuilds off the fresh fold (it reads records and moves no shared nodes,
    // so a rebuild is safe) — this is also what fills it in on a fresh deep-link, where the boot
    // fold lands after the view was first built
    const openFv = document.querySelector('.dt:not([hidden]) .flowview:not([hidden])')
    if (openFv) buildFlow(openFv.closest('.dt'))
  }
  loadRuns()

  // A run refreshes the RECORDS via loadRuns, but a requirement's DERIVED state (proven/unproven) and a
  // test's pass/fail verdict are baked into board.html at build time — the client never recomputes them.
  // dispatch R7 keeps the run panel open and does NOT reload the page, so the board behind the panel
  // would sit stale until you closed it. Fetch the freshly-rebuilt board.html and sync the derived bits
  // IN PLACE — state chips (reqpane + grid rows, the grid's proof cell too), test pass/fail + status
  // chip — no reload, panel intact.
  async function syncDerived (dt) {
    let html
    try { html = await (await fetch('board.html', { cache: 'no-store' })).text() } catch (e) { return false }
    const fresh = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('.dt[data-screen="' + (window.CSS && CSS.escape ? CSS.escape(dt.dataset.screen) : dt.dataset.screen) + '"]')
    if (!fresh) return false
    const cssEsc = v => (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/"/g, '\\"')
    const swapChip = (a, b, sel) => { const x = a.querySelector(sel), y = b.querySelector(sel); if (x && y) x.replaceWith(y.cloneNode(true)) }
    dt.querySelectorAll('.reqpane .req').forEach(function (req) {
      const f = fresh.querySelector('.reqpane .req[data-r="' + cssEsc(req.dataset.r) + '"]'); if (!f) return
      req.setAttribute('data-state', f.getAttribute('data-state') || '')
      req.setAttribute('data-status', f.getAttribute('data-status') || '')  // Focus reads this on reopen
      // the media pane's inputs are derived too — a run re-harvests the evidence (new content
      // hashes) and can add or drop the clip; a reopened reader must never show stale media
      for (const a of ['data-beats', 'data-ev-before', 'data-ev-after', 'data-ev-clip', 'data-ev-at']) {
        const v = f.getAttribute(a)
        if (v == null) req.removeAttribute(a); else req.setAttribute(a, v)
      }
      swapChip(req, f, '.h > .chip')
    })
    dt.querySelectorAll('.gridview .lst-card').forEach(function (card) {
      const f = fresh.querySelector('.gridview .lst-card[data-r="' + cssEsc(card.dataset.r) + '"]'); if (!f) return
      card.setAttribute('data-status', f.getAttribute('data-status') || '')
      swapChip(card, f, '.lst-head .lpf')   // the state cell is derived — a run changes its word
    })
    // the gap-summary strip is derived too — counts move with the run, and it can appear or vanish
    {
      const list = dt.querySelector('.gridview'); const flist = fresh.querySelector('.gridview')
      if (list && flist) {
        const cur = list.querySelector('.remind'); const nxt = flist.querySelector('.remind')
        if (cur && nxt) cur.replaceWith(nxt.cloneNode(true))
        else if (cur && !nxt) cur.remove()
        else if (!cur && nxt) list.insertBefore(nxt.cloneNode(true), list.firstChild)
      }
    }
    dt.querySelectorAll('.testpane .test').forEach(function (t) {
      const f = fresh.querySelector('.testpane .test[data-title="' + cssEsc(t.dataset.title) + '"]'); if (!f) return
      ;['p', 'f', 'u'].forEach(function (c) { t.classList.toggle(c, f.classList.contains(c)) })
      swapChip(t, f, '.throw > .chip')
    })
    return true
  }
  // Refresh the whole open detail after a run WITHOUT a reload (R7): put any borrowed reader node back in
  // its pane, sync the derived state, fold the fresh records, then reopen the reader on the SAME
  // requirement so its verdict and record are both current.
  async function refreshAfterRun () {
    const dt = document.querySelector('.dt:not([hidden])'); if (!dt) return
    const ov = dt.querySelector('.focusov'); const focusId = ov ? ov._curId : null
    if (ov) closeFocus()
    await syncDerived(dt)
    await loadRuns()
    if (focusId != null) setView(dt, 'focus', focusId)
  }
  window.__refreshDerived = refreshAfterRun   // a seam so the board's own test can drive this deterministically

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
    // A finished run set this; the NEXT change (the board's rebuild landing) or a short fallback then
    // syncs the board's derived state in place. One-shot, so a run refreshes the board exactly once.
    let syncPending = false
    const scheduleSync = () => { if (!syncPending) return; syncPending = false; refreshAfterRun() }
    es.addEventListener('change', () => {
      if (automation) return
      // R7: an OPEN run panel is never RELOADED away — not while a run streams into it, and not once it
      // has finished. But a finished run DID change the derived state, so refresh it IN PLACE (records,
      // state chips, verdicts, the reader) without a reload; the panel and its log stay put.
      if (!panel.hidden) { scheduleSync(); return }
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
        // the run changed the board's derived state; with the panel open (R7: never reloaded away),
        // sync it in place. Fire on the rebuild's change event, or a short fallback if none follows.
        if (!panel.hidden && !automation) { syncPending = true; setTimeout(scheduleSync, 800) }
      }
    })
  } catch (e) { /* served statically — no live reload, everything else still works */ }
