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

  // The WHOLE card opens the screen (board R1) — its whole content is about that one screen,
  // the latest-run still included (Task 8, the frozen mockup: the cover opens Focus like the rest
  // of the card; it is the one thumbnail the lightbox does NOT claim — see the zoom handler).
  for (const c of document.querySelectorAll('#home .card'))
    c.addEventListener('click', e => {
      if (e.target.closest('button, a, input, label')) return
      open(c.dataset.i)
    })
  // closing the detail also tears down an open focus reader, returning every borrowed node to the
  // baked source panes (.cols stays hidden — it is the data source, not a view; board R13 2026-08-18)
  // the gif-mode frame-stepper's chained timer leaves with whatever held it (Task 13): a reader
  // being torn down, a Focus page being paged away (release pass M-2 — paging is the commonest way
  // to leave a page, and the old page's timer used to outlive it until its hold expired). The
  // tick's isConnected guard is only the backstop, never the plan.
  // Every frame-stepper in a subtree, stopped. Since the per-beat split (2026-08-28) a reader holds
  // one per beat row rather than one per media pane, so they are found by the data-stepper marker
  // makeStepper sets — never by where they happen to be mounted.
  function stopSteppers (root) {
    for (const p of (root || document).querySelectorAll('[data-stepper]')) if (p._stop) p._stop()
  }
  function closeFocus () {
    // BOTH reader kinds hold a media pane — stop any stepper before the nodes go
    for (const o of document.querySelectorAll('.focusov, .lst-card.open')) stopSteppers(o)
    for (const o of document.querySelectorAll('.focusov')) {
      if (o._onKey) { document.removeEventListener('keydown', o._onKey); o._onKey = null }   // the ← → keys leave with the reader (A-4)
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
    // the torn-down cells' speed, zoom and play-mode subscriptions go with them — no detached backlog
    pruneSpd(); pruneZoom(); pruneMode()
  }
  // KEEP YOUR PLACE ACROSS A REFRESH (the human, 2026-09-02: "keep back to top when running test").
  // A run's refresh rebuilds the open reader (close-fold-reopen, and refreshAfterRun below), and the
  // fresh .fscroll — the card's own scroll region (R2, one card that scrolls inside itself) — starts
  // at the top. A background run fires this on every SSE tick, so the reader kept snapping up mid-read.
  // Capture the offset off whichever reader is open (Focus overlay or the List's open row, both a
  // .fread), and put it back on the fresh node after the reopen. dispatch:R7's beat proves it.
  function openReaderScroller () {
    return document.querySelector('.dt:not([hidden]) .focusov .fread > .fscroll') ||
      document.querySelector('.dt:not([hidden]) .lst-card.open .fread > .fscroll')
  }
  function readerScrollTop () { const s = openReaderScroller(); return s ? s.scrollTop : null }
  function restoreReaderScroll (top) {
    if (top == null) return
    const put = function () { const s = openReaderScroller(); if (s) s.scrollTop = top }
    put()                                   // synchronous — the reopen built the node in this task
    requestAnimationFrame(put)              // belt: late-loading frames can reflow the height after
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
  // The tail is the FOUR lines that keep the proof honest (board R15, amended by the human
  // 2026-09-02): the red-first line was method rather than proof — "normal user won't get the
  // write failing test first anyway" — and the kg-e2e skill still carries it for Claude. What stays
  // is what stops a fake green: the tag, a real assertion, the value on camera, never weakening.
  var PROMPT_DISCIPLINE = 'For the proof to count:\n' +
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
    } else if (action === 'schemwrong') {
      // THE ESCAPE FROM A WRONG PICTURE (the human, 2026-08-31: "let user know if the schematic is
      // not what they want"). Renamed with the picture itself (2026-09-03): the Expected cell is the
      // app's own component now, captured, never drawn — so the fix is upstream in what the run
      // MEASURES, and more so than before: nothing the board renders can be edited into agreement.
      // The prompt carries the provenance the reader was just shown, so the work starts from the
      // same fact rather than from a fresh guess.
      head = 'In this specboard project, the Expected picture for ' + ctx.screen + ':' + ctx.reqId +
        ' does not match the real app.'
      body = 'Files: ' + spec + ' and spec/' + ctx.screen + '/steps.ts\n' +
        'Target: requirement ' + req + '\n' +
        'The picture today: ' + (ctx.prov || 'unknown') + '\n\n' +
        'The Expected picture is CAPTURED, never authored — spec/_replica.mjs serialises the app\'s ' +
        'own markup for the region each proveVisible ringed, and applies the beat\'s claims to it. ' +
        'So do not edit the committed html: it is overwritten at the next fold. Fix what the run ' +
        'MEASURES.\n' +
        '- give each beat a proveVisible on the element whose value it asserts (the When\'s own box, ' +
        'then the Then\'s result), so the harvest rings, photographs and replicates them;\n' +
        '- keep the beats in spec/' + ctx.screen + '/steps.ts one When → one Then, so a moment is one ' +
        'change;\n' +
        '- re-run the covering test so the frames, skeletons and replicas are re-harvested, then ' +
        '`npm run proof mirror` to see what the gate says the picture is missing.\n' +
        'If the cell says there is no Expected yet, nothing was harvested with a ring — that is the ' +
        'whole gap. If it is a SKETCH, this requirement has no UI harvested at all. Never hand-write ' +
        'a picture to match: an invented picture beside a real photograph is the most convincing lie ' +
        'this board can tell.'
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
      removetest: 'Remove this test', schemwrong: 'The Expected picture doesn’t match my app' }
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
  // a test node's KIND — the baked source-plan kind ∪ the newest record's server-derived kind (the
  // same union flowsOf applies for the Flow view: flow if either says so)
  function testKind (t) {
    if (!t) return ''
    const slot = t.querySelector('.tststeps')
    const one = slot && slot._hist && slot._hist[0]
    const rec = (one && one.kind) || ''
    const baked = t.dataset.kind || ''
    return (rec === 'flow' || baked === 'flow') ? 'flow' : (rec || baked)
  }
  // the newest record's commit for a test node — the `run <id>` the strip header names
  function testRunId (t) {
    if (!t) return ''
    const slot = t.querySelector('.tststeps')
    const one = slot && slot._hist && slot._hist[0]
    if (one && one.commit) return String(one.commit)
    const shaEl = t.querySelector('.tmeta .tsha')
    return shaEl && shaEl.textContent ? shaEl.textContent.trim() : ''
  }
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
    let behHtml = ''; let proseHtml = ''
    if (bodyEl) {
      const c = bodyEl.cloneNode(true)
      const cov = c.querySelector('.covers'); if (cov) cov.remove()
      const beh = c.querySelector('.behavior')
      if (beh) { behHtml = beh.outerHTML; beh.remove() }
      proseHtml = c.innerHTML
    }
    return {
      node: node,
      id: idEl ? idEl.textContent : '',
      state: node.getAttribute('data-state') || 'unproven',
      status: node.getAttribute('data-status') || 'untested',
      beats: Number(node.getAttribute('data-beats') || 0),
      ev: {
        before: node.getAttribute('data-ev-before') || '',
        after: node.getAttribute('data-ev-after') || '',
        // the harvest window ("from:to", ms into the run's recording) — the frame-stepper's
        // timing base (Task 13); absent on an old harvest, and the stepper says so with equal holds
        window: (function () {
          const m = /^(\d+):(\d+)$/.exec(node.getAttribute('data-ev-window') || '')
          return m ? { from: +m[1], to: +m[2] } : null
        })(),
        // the COMMITTED video (Task 16 #1) + its own frozen seek offsets — a separate attribute
        // from the harvest window on purpose: a CLI fold moves the window with fresh frames while
        // the video keeps the offsets it was cut against
        video: node.getAttribute('data-ev-video') || '',
        vwin: (function () {
          const m = /^(\d+):(\d+)$/.exec(node.getAttribute('data-ev-vwin') || '')
          return m ? { from: +m[1], to: +m[2] } : null
        })(),
        // the PER-BEAT harvest (the human, 2026-08-28) — [{n, before, after, layoutBefore,
        // layoutAfter, window, focus}], baked as one JSON attribute. Absent on an older harvest, and
        // the storyline reader falls back to the requirement-level pair rather than inventing one.
        beats: (function () {
          const raw = node.getAttribute('data-ev-beats')
          if (!raw) return []
          try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch (e) { return [] }
        })(),
        at: node.getAttribute('data-ev-at') || '',
        // the screen's one committed @font-face sheet (phase 4a) — the Expected cell writes it into
        // the replica's srcdoc so the app's own words are laid out in the app's own type
        faces: node.getAttribute('data-ev-faces') || ''
      },
      title: ttlEl ? ttlEl.textContent : '',
      family: node.getAttribute('data-fam') || '',   // the prd's `###` family this sits under (board R17); '' = none
      behHtml: behHtml,
      proseHtml: proseHtml
    }
  }
  // opts.counter — the Focus view's "n of N" position (the List's open row passes none: a row
  // already knows where it sits)
  function focusBody (dt, r, opts) {
    opts = opts || {}
    const tests = [].slice.call(dt.querySelectorAll('.testpane .test'))
    const cov = tests.filter(function (t) { return t.querySelector('.tags .tag[data-r="' + r.id + '"]') })
    // The PRIMARY covering test — the one whose node the reader borrows and whose newest record the
    // media pane renders. Under a failed status (Task 6 review A-1) it is the covering test whose
    // newest record FAILED: r.status is the board-wide fold, so with two covering tests the first
    // in DOM order may have passed, and its green strip under "✗ failed run" would misdescribe the
    // failure. Falls back to the first when no record says it failed (a fold older than the records).
    const failedOne = r.status === 'failed' ? cov.find(function (t) {
      const slot = t.querySelector('.tststeps')
      const one = slot && slot._hist && slot._hist[0]
      return !!one && one.ok === false
    }) : null
    const primary = failedOne || cov[0] || null
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

    // THE STORYLINE READER (the human, 2026-08-28): ONE card, read top to bottom as the behaviour's
    // own story. Every row is one beat and carries that beat's three cells side by side —
    // [ the schematic frame | the Given / When→Then text | the beat's own proof frames ] — so the
    // drawing, the sentence and the photograph of it happening are read together instead of being
    // hunted for in three separate places. Under the rows: the one video for the whole requirement,
    // then the authored prose in full.
    const page = document.createElement('div'); page.className = 'fpage'
    const read = document.createElement('div'); read.className = 'fread'
    // ONE header row (the human, 2026-08-25): id · chip · TITLE · ⋯ on a single line — the title
    // joins the meta so the reading card leads compactly. The position (family · n of N) is DROPPED
    // from here: the pager IS the map (R17) — the family names its dots and the current one is
    // ringed, so repeating "· 3 of 8" in the header was redundant chrome. opts.counter is left
    // unused (a caller may still pass it; nothing renders it now).
    const rmeta = document.createElement('div'); rmeta.className = 'frmeta'
    const fid = document.createElement('span'); fid.className = 'fid'; fid.textContent = r.id
    const fchip = document.createElement('span'); fchip.className = 'fchip ' + r.status
    fchip.textContent = FCHIP[r.status] || FCHIP.untested
    rmeta.appendChild(fid); rmeta.appendChild(fchip)
    const h = document.createElement('div'); h.className = 'fttl'; h.textContent = r.title
    rmeta.appendChild(h)
    // the requirement's ⋯ authoring menu (board R15) — fresh reader chrome, no move/restore hazard
    const reqCtx = function () {
      return { screen: dt.dataset.screen, reqId: r.id, reqTitle: r.title, reqList: screenReqList(dt) }
    }
    const reqAddTestCtx = function () { const c = reqCtx(); c.coverIds = [r.id]; return c }
    // …and the escape from a drawing that is not what the reader wanted (the human, 2026-08-31):
    // the same provenance the schematic cell captions travels into the prompt, so the work starts
    // from the fact the reader was shown rather than from a guess.
    const schemCtx = function () { const c = reqCtx(); c.prov = schemProv(hasReplicas(r)).text; return c }
    // THE READER-WIDE CONTROLS RIDE THE TITLE ROW (the human, 2026-09-02: "put all these on the same
    // row of the test title row, left side of the menu button"). The schematic frames and every beat
    // cell's stepper are views of the SAME beat, so one play mode and one speed pace them both — and
    // they sit on the requirement's own line now, not on a bar of their own beneath it.
    // They ride only where there is something to pace: a control over an empty reader is chrome.
    // (The advance itself is NOT here — a requirement has several When/Then, so "next" must name its
    // beat; that lives on each beat row's own moment strip, board R20. And the video is no
    // longer one of the paced surfaces — the reader has none since 2026-09-02 — but a requirement
    // whose only evidence is a committed recording still has a harvest to pace, so the video's
    // presence is kept as a signal that a harvest happened at all, never as a thing to play.)
    const paceable =
      !!(primary && (r.ev.video || r.ev.before || r.ev.after || (r.ev.beats && r.ev.beats.length)))
    if (paceable) {
      const tools = document.createElement('span'); tools.className = 'frtools'
      const ml = document.createElement('span'); ml.className = 'fbarl'; ml.textContent = 'play'
      tools.appendChild(ml); tools.appendChild(modePicker())
      const bl = document.createElement('span'); bl.className = 'fbarl'; bl.textContent = 'play speed'
      tools.appendChild(bl); tools.appendChild(spdSelect())
      rmeta.appendChild(tools)
    }
    // THE COVERING TEST'S ACTIONS RIDE THE TITLE ROW TOO (the human, 2026-09-02: a proof header at
    // the bottom of the card "is just weird" — "make it in the test title row as well, combine with
    // the title row's current tool button, clear and clean"). Its FIRST shape carried the test's FACE
    // as well — a TEST eyebrow, a ✓/✗/◌ mark tracking the requirement's derived status, and the
    // test's own name — and the same human asked for that face back off the row later the same day:
    // "can we remove the test ✓ Tsumiki — the full flow (R1–R8)". BOTH words are kept here on purpose
    // (rule 6): the earlier one is why this group exists at all, the later one is why it is now only
    // the ACTIONS. The chip two elements to the left already spells the requirement's state in words,
    // so a second mark beside a test title was the same fact said twice and a long flow title crowded
    // the line it was said on.
    // So the row reads, left to right: id · chip · TITLE · play · speed · ▶ Run · ⋯ — and the one ⋯
    // carries EVERYTHING that was split across two menus before: the test's wired Run-in-background /
    // Logs / Steps, its add · edit · remove, then the requirement's own reword / add / remove /
    // schematic-wrong. The test's NAME still travels with every one of those (the Edit/Remove prompts
    // name it, the Logs and Steps windows are its own) — it is read where it is acted on, not as
    // standing chrome. Nothing is left beneath the beat rows: no proof header, no prose (see the
    // fscroll note below).
    const ptop = document.createElement('div'); ptop.className = 'fptop'
    const acts = document.createElement('div'); acts.className = 'fpacts'
    const tacts = primary && primary.querySelector('.tacts')
    const runWatch = tacts && tacts.querySelector('.runone[data-headed]')
    const runBg = tacts && tacts.querySelector('.runone:not([data-headed])')
    const logBtn = primary && primary.querySelector('[data-log]')
    const stepBtn = primary && primary.querySelector('[data-steps]')
    if (cov.length) {
      ptop.appendChild(acts)
      // the wired per-test Run (watchable) — the REAL node, moved and undone on leave
      if (runWatch) move(runWatch, acts, false)
    } else {
      // no covering test — the honest gap stays SAID (rule 3), because it is content and not the
      // chrome that went: the ◌ and the words, then the one next move where Run would be. The mark
      // rides the words as one string, so the row carries no .fpm to contradict the chip.
      const nm = document.createElement('span'); nm.className = 'fpnone'; nm.textContent = '◌ no test yet'
      ptop.appendChild(nm); ptop.appendChild(acts)
      acts.appendChild(writeTestBtn(dt, r))
    }
    rmeta.appendChild(ptop)
    // ONE ⋯ for the card (board R15) — LAST in the row. Three groups, two dividers: the test's
    // wired run/log/steps (the real nodes, moved), the test's authoring, the requirement's authoring.
    // "Add a test" is said ONCE (it was on both of the old menus).
    {
      const testCtx = function () {
        const ttlEl = primary && primary.querySelector('.ttl')
        return { screen: dt.dataset.screen, reqId: r.id, reqTitle: r.title,
          testTitle: primary ? (primary.getAttribute('data-title') || (ttlEl ? ttlEl.textContent.trim() : '')) : '',
          coverIds: primary ? [].slice.call(primary.querySelectorAll('.tags .tag')).map(function (el) { return el.getAttribute('data-r') }) : [r.id],
          reqList: screenReqList(dt) }
      }
      const menu = promptMenu('run, log and authoring actions', [])
      const pop = menu.querySelector('.fmenupop')
      ;[runBg, logBtn, stepBtn].forEach(function (b) { if (b) move(b, pop, false) })
      const div = function () { const d = document.createElement('div'); d.className = 'fmdiv'; pop.appendChild(d) }
      if (runBg || logBtn || stepBtn) div()
      pop.appendChild(promptItem('addtest', 'Add a test', reqAddTestCtx))
      if (primary) {
        pop.appendChild(promptItem('edittest', 'Edit this test', testCtx))
        pop.appendChild(promptItem('removetest', 'Remove this test', testCtx))
      }
      div()
      pop.appendChild(promptItem('reword', 'Reword this requirement', reqCtx))
      pop.appendChild(promptItem('addreq', 'Add a requirement', reqCtx))
      pop.appendChild(promptItem('removereq', 'Remove this requirement', reqCtx))
      pop.appendChild(promptItem('schemwrong', 'The Expected picture doesn’t match my app', schemCtx))
      rmeta.appendChild(menu)
    }
    read.appendChild(rmeta)
    // THE STORYLINE, ALONE (the human, 2026-09-02: "remove the whole thing as well" — the authored
    // paragraph that followed the rows; and the proof header above it moved up into the title row).
    // The beat rows ARE the requirement in the reader: the Given / When→Then words, the drawing and
    // the harvested proof, row by row. The prose stays where it is authored (prd.md) and on the baked
    // source row; a paragraph restating the rows beneath them was read once and scrolled past after.
    // Task 12 (the shape on first sight), kept: the storyline lives in .fscroll, the card's INTERNAL
    // scroll region, between the fixed header above and the pinned .ffoot below — so the card shrinks
    // to the viewport and the first beat is on screen from the first paint. The 'clipped' class
    // drives the footer's hairline fade — the honest cue that more sits below.
    const scroll = document.createElement('div'); scroll.className = 'fscroll'
    scroll.appendChild(buildStoryline(r))
    read.appendChild(scroll)
    // the moved covering test itself — kept in the card, HIDDEN: its .tstlog / .tststeps slots are
    // what the header's Logs / Steps read, and loadRuns folds it whenever it is home in the pane
    // (close-fold-reopen, CLAUDE.md). Nothing of it shows; the title row is its face.
    const evl = document.createElement('div'); evl.className = 'feval'; evl.hidden = true
    if (primary) {
      const ev = document.createElement('div'); ev.className = 'fev'
      evl.appendChild(ev)
      move(primary, ev, true)
    }
    read.appendChild(evl)
    const foot = document.createElement('div'); foot.className = 'ffoot'
    const syncClip = function () {
      read.classList.toggle('clipped', scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 1)
    }
    scroll.addEventListener('scroll', syncClip)
    // a ResizeObserver fires once the region gets a layout (and on every reflow of its box) — the
    // initial paint's cue without racing the append; content-height changes go through syncClip calls
    if (window.ResizeObserver) new ResizeObserver(syncClip).observe(scroll)
    read.appendChild(foot)
    page.appendChild(read)
    return { page: page, restore: restore, id: r.id }
  }

  // PLAY SPEED (Task 13, superseding Task 11's cycle button): a design-system <select> —
  // 0.25× · 0.5× · 1× · 1.5× · 2× · 4× (the human's chosen range; a cycle button cannot carry
  // six stops, and a native select is keyboard-reachable for free). SESSION-scoped on purpose
  // (module state, never storage): readers are rebuilt on every fold (close-fold-reopen), so the
  // chosen pace must survive a rebuild — but a preference that quietly persisted across visits
  // would make tomorrow's proof play fast with no cue why.
  //
  // ONE control per reader (the human, 2026-08-28), not one per pane: the schematic and the proof
  // are the two halves of the same requirement, so watching them drift apart at different paces was
  // the defect. The single state drives BOTH — the schematic's --spd (viz emits every duration as
  // calc(<X>s/var(--spd,1)), and the parked-still CSS divides its delay by the SAME var, so a still
  // shows the same frame at every speed) and the media pane (the frame-stepper's holds / a video's
  // playbackRate across the native range). Panes subscribe with onSpd and are pruned once their node
  // leaves the DOM, so a rebuilt reader never accumulates dead listeners.
  const SPDS = [0.25, 0.5, 1, 1.5, 2, 4]
  const spdLabel = function (v) { return v + '×' }
  let PLAY_SPD = 1
  const SPD_W = []
  function onSpd (node, fn) { SPD_W.push({ node: node, fn: fn }) }
  // dropped only where a node is KNOWN gone (a torn-down reader, or a fold's rebuild) — never at
  // registration time, when the freshly-built page is still detached and every watcher would go
  function pruneSpd () {
    for (let i = SPD_W.length - 1; i >= 0; i--) if (!SPD_W[i].node.isConnected) SPD_W.splice(i, 1)
  }
  function setSpd (v) {
    PLAY_SPD = v
    pruneSpd()
    for (const w of SPD_W) w.fn(v)
  }
  function spdSelect () {
    const s = document.createElement('select'); s.className = 'pspd'
    s.title = 'play speed'; s.setAttribute('aria-label', 'play speed')
    SPDS.forEach(function (v) {
      const o = document.createElement('option'); o.value = String(v); o.textContent = spdLabel(v)
      s.appendChild(o)
    })
    s.value = String(PLAY_SPD)
    s.addEventListener('change', function () { setSpd(parseFloat(s.value) || 1) })
    // wrapped so the CSS can draw the caret (M-6) — a <select> takes no pseudo-element
    const w = document.createElement('span'); w.className = 'pspdwrap'; w.appendChild(s)
    // SPEED IS AUTO-ONLY (the human, 2026-09-02: "play speed only enable when it's auto mode"). A
    // stepped beat sets its pace by hand — there is nothing for a speed to rate — so the control is
    // disabled (and dimmed via .pspdwrap[data-off]) in step, and wakes when auto is chosen.
    const sync = function () {
      const off = PLAY_MODE !== 'auto'
      s.disabled = off
      if (off) w.setAttribute('data-off', '1'); else w.removeAttribute('data-off')
      w.title = off ? 'play speed — available in auto' : 'play speed'
    }
    sync()
    onMode(w, sync)
    return w
  }

  // behParts reads the baked .behavior block (the same markup renderBehavior emits) back into the
  // Given + When/Then beats the storyline splits into rows — label innerHTML kept so the WHEN1/THEN1
  // numbering survives, text innerHTML kept so its escaping does.
  function behParts (behHtml) {
    const tmp = document.createElement('div'); tmp.innerHTML = behHtml || ''
    const out = { given: null, beats: [] }; let cur = null
    ;[].slice.call(tmp.querySelectorAll('.behavior .brow')).forEach(function (x) {
      const lab = x.querySelector('.blab'); const txt = x.querySelector('.btxt')
      const L = lab ? lab.innerHTML : ''; const T = txt ? txt.innerHTML : ''
      if (x.classList.contains('bgiven')) out.given = { lab: L, txt: T }
      else if (x.classList.contains('bwhen')) { cur = { when: { lab: L, txt: T }, then: null }; out.beats.push(cur) }
      else if (x.classList.contains('bthen') && cur) cur.then = { lab: L, txt: T }
    })
    return out
  }
  // the plain words of a baked fragment — what a NAME needs (a segment label, an alt): the source's
  // own escaping is undone by the parser, and nothing of the markup survives into the text
  function textOf (html) {
    const t = document.createElement('div'); t.innerHTML = html || ''
    return String(t.textContent || '').replace(/\s+/g, ' ').trim()
  }
  // ONE SENTENCE, KEYWORD-LED (the human, 2026-09-02: "revise the layout/design of the given/when/
  // then again — even more easy to read"). The label COLUMN is gone, and so is the tinted Then panel
  // that briefly replaced it: `When` / `Then` / `Given` are the first WORD of the sentence they name,
  // quiet beside it, and the sentence itself is the size it deserves. The label html still comes
  // from the baked .behavior row (behParts), so the words are the source's, never retyped here.
  function sentence (cls, labHtml, txtHtml, isThen) {
    return '<p class="' + cls + '"><span class="lead' + (isThen ? ' then' : '') + '">' + labHtml +
      '</span> <span class="sbv">' + txtHtml + '</span></p>'
  }
  // …and the MARK COLUMN beside them: the beat's ringed numeral (the Given row's is a small hollow
  // ring — a context row has no step number), with a hairline running from under it to the row's
  // foot, so a multi-beat requirement reads as a numbered sequence down the page. The numeral is
  // also the SELECTION cue's other half (the row's ink rule is the first): it steps up to --ink on
  // the selected row, no hue involved.
  function markCol (n) {
    return '<div class="sbmark">' +
      (n ? '<span class="sbno">' + n + '</span>' : '<span class="sbno hollow" aria-hidden="true"></span>') +
      '<span class="sbrule" aria-hidden="true"></span></div>'
  }
  // ── THE CAMERA ───────────────────────────────────────────────────────────────────────────────
  // A proof cell frames the FOCUSED component, not the whole screen (the human, 2026-08-28): the
  // harvest records the ringed target's box and the viewport it was measured in, and the cell holds
  // the media under a fixed window, scaled and translated so that box — padded generously — reads
  // large. The maths is pure and shared (tools/board/stepper.js cameraView/cameraCss) precisely so
  // stills, the stepper's frames and the video are framed IDENTICALLY: switching mode inside a cell
  // must never move the view. It is a VIEW, never a crop — every cell carries the toggle back to the
  // whole screenshot, and the evidence on disk is untouched either way.
  //
  // ONE option set for BOTH cells of a row (the human, 2026-08-28). The cap is not a per-cell taste:
  // a row is comparable only while the drawing and the photograph frame the SAME region, so the
  // moment the two sides take different caps they frame different regions and the comparison is
  // gone. The numbers moved on the human's 2026-08-31 ask ("do more aggressive zoom in on the area
  // it's focusing"): 2.2 → 3.2, with minFrac holding the framed region to at least 30% of the page
  // width, so a 30px checkbox still reads inside the row it sits in instead of filling the cell
  // alone, while a normal ringed control now FILLS its cell instead of floating in a third of it.
  // The pad shrank with them (tools/board/stepper.js: 2.75 → a breathing 1.2), and the camera aims
  // at the SCENE on show rather than at the beat's whole union — one magnification per row, one aim
  // per scene. Mirrored in tools/viz.mjs (MAX_SCALE / PAD / framedRegion).
  const CAM = { maxScale: 3.2, minFrac: 0.3 }
  // the base glide the camera eases a scene change over (the human, 2026-08-31) — scaled by the
  // reader's speed and clamped in tools/board/stepper.js cameraDur. Reduced motion turns it off.
  const CAM_TWEEN = 420
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  let ZOOMED = true            // session-scoped, like the play speed; zoom is the default
  const ZOOM_W = []            // {node, fn} — cells re-aim themselves when the choice changes
  function onZoom (node, fn) { ZOOM_W.push({ node: node, fn: fn }) }
  function pruneZoom () {
    for (let i = ZOOM_W.length - 1; i >= 0; i--) if (!ZOOM_W[i].node.isConnected) ZOOM_W.splice(i, 1)
  }
  function setZoom (v) {
    ZOOMED = v
    pruneZoom()
    for (const w of ZOOM_W) w.fn(v)
  }
  // (The COLUMN-ORDER state that stood here — 'sbp' / 'bsp', with its watcher list and its .ord-bsp
  // class — is GONE with its toggle, the human 2026-08-30: "just always be behaviour first". The
  // storyline deals one order now and there is nothing left to hold for the session.)
  //
  // PLAY MODE (the human, 2026-08-30: "add a display mode for the small steps"). 'step' is now the
  // DEFAULT (the human, 2026-09-02: "default as step") — every beat opens HELD on its first scene,
  // walked by its moment strip or the ← → keys on the selected row, so reading a beat a moment at
  // a time is the resting state (board R20). 'auto' is the opt-in hands-free loop: every beat's
  // scenes loop the moment the row exists. Reader-wide and session-scoped, exactly like the speed
  // beside it and for the same reason: a reader is rebuilt on every fold, so the choice must survive
  // the rebuild, but one that persisted across visits would silently freeze tomorrow's board with no
  // cue why.
  let PLAY_MODE = 'step'
  const MODE_W = []
  function onMode (node, fn) { MODE_W.push({ node: node, fn: fn }) }
  function pruneMode () {
    for (let i = MODE_W.length - 1; i >= 0; i--) if (!MODE_W[i].node.isConnected) MODE_W.splice(i, 1)
  }
  function setMode (v) {
    PLAY_MODE = (v === 'step') ? 'step' : 'auto'
    pruneMode()
    for (const w of MODE_W) w.fn(PLAY_MODE)
  }
  // the control: two stops, so a segmented pair rather than a dropdown — the same .medbar chrome the
  // retired column-order pair wore (tokens only; the live stop is carried by wash + weight, never by
  // hue). It is a PLAY mode, never a media mode: no .pcmodes and no per-cell toolbar comes back with
  // it (board R20's standing absence).
  function modePicker () {
    const box = document.createElement('span'); box.className = 'medbar pmode'
    const mk = function (val, label, title) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label
      b.dataset.mode = val; b.title = title
      b.addEventListener('click', function () { setMode(val) })
      return b
    }
    const a = mk('auto', 'auto', 'play every beat’s scenes on a loop')
    const b = mk('step', 'step', 'hold each scene — walk it with ‹ › or the ← → keys')
    const paint = function () {
      a.classList.toggle('on', PLAY_MODE === 'auto')
      b.classList.toggle('on', PLAY_MODE === 'step')
    }
    paint()
    onMode(box, paint)
    box.appendChild(a); box.appendChild(b)
    return box
  }
  // THE WALK IS PER BEAT ROW (the human, 2026-08-30: "the go to next small step can NOT be on top as
  // there could be multi when/then, so the go to next small step need to be by each when/then"). The
  // advance lives on each beat row's own moment strip now (momentStrip), never a single reader-wide
  // cursor — a requirement with several When/Then beats made one global "next" ambiguous about WHICH
  // beat it stepped. The ← → keys are the keyboard face of that same strip: while a reader is open in step mode
  // they step the row the reader is ACTUALLY on — the one holding keyboard focus (a bead just clicked),
  // else the one under the pointer, else the first steppable beat — never every row at once. Returns
  // whether a row was found to step, so the key handlers know to swallow the arrow.
  function beatRows (root) {
    if (!root) return []
    return [].slice.call(root.querySelectorAll('.sbrow[data-rowstep]')).filter(function (el) {
      return el._rowStep && el.isConnected && el.offsetParent !== null
    })
  }
  function selectedRow (root) {
    const rows = beatRows(root)
    if (!rows.length) return null
    return rows.filter(function (r) { return r.classList.contains('sel') })[0] || null
  }
  // mark one beat row selected — clearing any other in this reader — and bring it into view. Returns it.
  function selectRow (root, row, scroll) {
    if (!root || !row) return null
    beatRows(root).forEach(function (r) { r.classList.toggle('sel', r === row) })
    if (scroll && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' })
    return row
  }
  // the first steppable beat is selected by default, so ← → always has a target and the reader shows
  // which When/Then it is walking from the first paint
  function markDefaultBeat (wrap) {
    const rows = [].slice.call((wrap || document).querySelectorAll('.sbrow[data-rowstep]'))
    if (rows.length && !rows.some(function (r) { return r.classList.contains('sel') })) rows[0].classList.add('sel')
  }
  // ← → : walk the SELECTED beat's scenes (selecting the first if none is yet), holding the loop —
  // walking is a step action, so it flips a still-auto reader into step, exactly as the ‹ › chevrons do
  function readerStep (root, dir) {
    const rows = beatRows(root)
    if (!rows.length) return false
    const row = selectedRow(root) || selectRow(root, rows[0], false)
    if (!row) return false
    if (PLAY_MODE !== 'step') setMode('step')
    row._rowStep(dir)
    return true
  }
  // ↑ ↓ : move the selection to the previous / next beat row (the human, 2026-09-02). It stops at the
  // ends rather than wrapping, so the arrows never surprise you onto a far row.
  function selectBeat (root, dir) {
    const rows = beatRows(root)
    if (!rows.length) return false
    const curEl = selectedRow(root)
    const at = curEl ? rows.indexOf(curEl) : -1
    const nextIdx = at < 0 ? (dir < 0 ? rows.length - 1 : 0) : Math.min(rows.length - 1, Math.max(0, at + (dir < 0 ? -1 : 1)))
    if (at >= 0 && nextIdx === at) return false
    selectRow(root, rows[nextIdx], true)
    return true
  }
  // Aim one camera box at its focus rect — the SAME call for a proof frame and for the schematic
  // beside it (the human, 2026-08-28): a row is only comparable if both cells frame the same region,
  // so they take the same focus rect through the same maths. The transform is recomputed on every
  // resize, so a reflowed reader keeps the framing.
  //
  // The class is set BEFORE the box is measured, because the box only HAS a camera height while it
  // is .zoomed — full-frame it takes its media's own height (so nothing floats letterboxed in a
  // field of background). It is set again after, so a camera that refuses to magnify (cameraView's
  // ok:false — a target as wide as the frame) drops honestly back to the filling full-frame.
  // THE AIM rides beside the focus (the human, 2026-08-31): the beat's focus rect still sets the
  // ZOOM — one magnification per row, so the two cells never pump against each other — and the ring
  // of the SCENE currently on show sets the centre. `box._aim(rect)` moves it; the box re-applies
  // with the same options, so a scene change is a pan and never a re-zoom. With no aim the camera is
  // exactly what it was before, centred on the focus.
  function aimCamera (box, focus, opts) {
    let aim = null
    let card = null           // the scene's callout card box (page units) — framed WITH its ring so
                              // it is never clipped at the cell edge (the human, 2026-08-30)
    // apply is IDEMPOTENT — the class change resizes the box and wakes the observer that called it,
    // and the second pass computes the same classes, so the echo dies on the next frame. `animate`
    // asks for a smooth glide between scenes (the human, 2026-08-31): a scene change eases the pan +
    // zoom instead of snapping; a resize or a zoom toggle re-applies without animation.
    const apply = function (animate) {
      const want = !!(ZOOMED && focus)
      box.classList.toggle('zoomed', want)
      // NOT LAID OUT YET — the reader is built DETACHED and may still sit in a not-yet-shown pane, so
      // the box has no measurable size and a zoom cannot be computed. Committing a full-frame 'none'
      // here and walking away is exactly what left STEP-mode beats un-zoomed (the human, 2026-09-02:
      // "the whole … focus effect is gone") — in auto the loop re-aimed until the size arrived, step
      // holds after one aim. So when a zoom is wanted but the box is unsized, retry next frame until it
      // has a size, then apply for real. Bounded, so a discarded box can never spin forever.
      if (want && (box.clientWidth < 1 || box.clientHeight < 1)) {
        // schedule the retry even while DETACHED — the box is inserted moments later, and guarding on
        // isConnected here skipped the retry at the very first (detached) apply, so it never zoomed.
        // The 120-frame cap (~2s) bounds a box that is discarded before it is ever laid out.
        if ((apply._tries = (apply._tries || 0) + 1) < 120 && window.requestAnimationFrame) {
          requestAnimationFrame(function () { apply(animate) })
        }
        return
      }
      apply._tries = 0
      const o = (aim || card) ? Object.assign({}, opts, { aim: aim || undefined, card: card || undefined }) : opts
      const view = want ? window.SBStepper.cameraView(focus, { w: box.clientWidth, h: box.clientHeight }, o) : null
      const css = window.SBStepper.cameraCss(view)
      const dur = (animate && !REDUCED) ? window.SBStepper.cameraDur(CAM_TWEEN, PLAY_SPD) : 0
      // …and the FRAME SWAP eases with the pan (the human, 2026-08-31: "make the transition to the next
      // small step smooth <- also apply to proof"). The proof cell's scenes are stacked frames whose
      // opacity is toggled on scene change; riding OPACITY on the very same transition string makes the
      // outgoing frame cross-fade into the incoming one over the SAME cubic-bezier and the SAME
      // cameraDur the camera pans over, so both halves of a row glide identically instead of the picture
      // hard-cutting while the crop slides. The schematic's single SVG has nothing to fade — harmless
      // there. Reduced motion (dur 0 → 'none') snaps both, exactly as before.
      var ease = 'cubic-bezier(0.4, 0, 0.2, 1)'
      const trans = dur > 0 ? ('transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms ' + ease) : 'none'
      for (const m of box.querySelectorAll('.camsub')) { m.style.transition = trans; m.style.transform = css }
      box.classList.toggle('zoomed', !!(view && view.ok))
    }
    // a scene move carries the ring AND its card, and asks to be ANIMATED (the eased glide); the
    // INITIAL set of a freshly built cell snaps (animate=false) so a row does not zoom-in on open —
    // only a change from one scene to the next glides.
    box._aim = function (rect, cardRect, animate) { aim = rect || null; card = cardRect || null; apply(animate !== false) }
    apply(false)   // self-heals via a bounded rAF retry above until the box is laid out (step-safe)
    if (window.ResizeObserver) new ResizeObserver(function () { apply(false) }).observe(box)
    if (focus) onZoom(box, function () { apply(false) })
    return apply
  }

  // ── THE MOMENT'S CAMERA (design C, phase 4b — the human, 2026-09-03) ─────────────────────────
  // The camera above frames a BEAT (its focus rect is the union of the beat's rings) and aims at
  // each scene inside it. Design C frames a MOMENT: the ring the assertion painted, UNION the chip
  // that says what it claimed — a chip framed out of view is a caption on nothing — with 45% of the
  // pair's own size as room around it and a cap of 1.25× the app's natural size ("zoomed in a bit
  // too much", the human, on the first cut: a picker blown up to fill a cell loses the header it
  // sits in). The maths is pure and shared (tools/board/stepper.js frameFor).
  //
  // Both cells of a row stand on the SAME page coordinates — the replica is the app's own markup at
  // the app's own coordinates and the photograph is the app's own pixels — so one absolute page→cell
  // scale frames the two identically by construction, rather than by two computations agreeing.
  // `box._aim(ring, chip, animate)` keeps the older camera's shape, so buildStoryline drives either.
  function aimFrame (box, vp) {
    let ring = null
    let chip = null
    box._views = box._views || []
    const apply = function (animate) {
      const want = !!(ZOOMED && ring)
      box.classList.toggle('zoomed', want)
      // not laid out yet — the reader is built DETACHED (see aimCamera's own note); retry, bounded
      if (want && (box.clientWidth < 1 || box.clientHeight < 1)) {
        if ((apply._tries = (apply._tries || 0) + 1) < 120 && window.requestAnimationFrame) {
          requestAnimationFrame(function () { apply(animate) })
        }
        return
      }
      apply._tries = 0
      const view = want
        ? window.SBStepper.frameFor(ring, chip, vp, { w: box.clientWidth, h: box.clientHeight })
        : null
      // the media is laid out at the box's WIDTH, so one page pixel is already r cell pixels; the
      // transform supplies the rest of the absolute scale the frame asks for
      const r = box.clientWidth / vp.vw
      const css = (view && r > 0)
        ? window.SBStepper.cameraCss({ ok: true, scale: view.scale / r, tx: -view.x * view.scale, ty: -view.y * view.scale })
        : 'none'
      const dur = (animate && !REDUCED) ? window.SBStepper.cameraDur(CAM_TWEEN, PLAY_SPD) : 0
      const ease = 'cubic-bezier(0.4, 0, 0.2, 1)'
      const trans = dur > 0 ? ('transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms ' + ease) : 'none'
      for (const m of box.querySelectorAll('.camsub')) { m.style.transition = trans; m.style.transform = css }
      box.classList.toggle('zoomed', !!view)
      box._view = view
      // everything drawn in PAGE coordinates over this picture — the chips, the row's difference
      // marker — rides the same view and the same glide, so nothing can be left pointing at where
      // the ring used to be. A list, not one hook: two things now read the camera.
      for (const f of (box._views || [])) f(view, dur)
    }
    box._aim = function (r0, c0, animate) { ring = r0 || null; chip = c0 || null; apply(animate !== false) }
    apply(false)
    if (window.ResizeObserver) new ResizeObserver(function () { apply(false) }).observe(box)
    onZoom(box, function () { apply(false) })
    return apply
  }

  // ── THE CHIPS: ONE PER CELL, THE VALUE ONLY (design C) ───────────────────────────────────────
  // "Every text once" (the human, 2026-09-02/03). The sentence is in the words cell, the moment's
  // name is in the strip's caption, and the two chips over the pictures say only what each side
  // holds: EXPECTED "…" on the replica, ACTUAL ✓/✕ "…" on the photograph. The MARK carries the state
  // beside the hue, so a greyscale reader loses nothing. One line, ellipsised, with the whole text
  // one hover away in a styled .mtip — never the native title, which would stack a second tooltip.
  //
  // The chip's GEOMETRY is page-space (so the camera can frame it and both cells can agree on it);
  // its RENDERING is cell-space (so its type is the reader's own, crisp at every zoom, rather than
  // the app's pixels magnified). chipSpot is the chip's own placement rule — above the ring where
  // there is room, else below, left-aligned to it — stated here because it is the CHIP's rule, not
  // the burned card's (tools/overlay-geometry.mjs calloutSpot still owns that one); the numbers it
  // uses are that module's, read off the island.
  const CHIP_LINE = 22             // a chip line, in PAGE units — what the camera must reserve
  const CHIP_PAD = 10
  function chipHeight (lines) { return CHIP_LINE * Math.max(1, lines) + 2 * CHIP_PAD }
  // BELOW THE RING FIRST, then above — the burn-in's own order (tools/overlay-geometry.mjs
  // calloutSpot), so the chip lands where a reader who has watched a recording expects the
  // explaining box to be, and where the plan's reference row renders it. (The brief for this phase
  // said above-first; corrected here with the reason rather than followed silently — a chip above a
  // ring covers the row the value is READ IN, which is the very defect calloutSpot's order exists to
  // avoid, and it would put the board's chip and the video's card on opposite sides of one ring.)
  // Left-aligned to the ring, which is the one thing this rule does differently: the ring's own left
  // edge is where the eye lands, and a centred chip on a narrow target hangs off both sides of it.
  function chipSpot (ring, vp, lines) {
    if (!ring || !vp) return null
    const w = CARDG.width
    const h = chipHeight(lines)
    const m = CARDG.margin
    const below = ring.y + ring.h + CARDG.gap
    const above = ring.y - CARDG.gap - h
    const y = (below + h <= vp.vh - m) ? below : (above >= m ? above : below)
    const x = Math.max(m, Math.min(ring.x, Math.max(m, vp.vw - w - m)))
    return { x: x, y: Math.max(m, Math.min(y, Math.max(m, vp.vh - h - m))), w: w, h: h }
  }
  // the chip's own words: a value moment says one value, a Then says the beat's CHECKLIST — every
  // claim it made, ticked on the Expected side (that is what the requirement says) and ticked or
  // crossed on the Actual (that is what the app did), the crossed ones carrying what was got. Facts
  // are the beat's claims; never a count of them.
  function chipLines (m, side) {
    const q = function (s) { return '“' + String(s) + '”' }
    if (m.facts && m.facts.length) {
      return m.facts.map(function (c) {
        return side === 'expected'
          ? { mark: '✓', text: q(c.expected), ok: true }
          : (c.ok
              ? { mark: '✓', text: q(c.expected), ok: true }
              : { mark: '✕', text: c.missing ? 'MISSING' : q(c.got), ok: false })
      })
    }
    if (!m.claim) return []
    const c = m.claim
    return [side === 'expected'
      ? { mark: '', text: q(c.expected), ok: true }
      : { mark: c.ok ? '✓' : '✕', text: (c.missing ? 'MISSING' : q(c.got)), ok: !!c.ok }]
  }
  // ONE CHIP LAYER PER CELL — built once, repainted per moment, positioned off the camera's own view
  // so it always lands over the picture it explains. It is inside the camera box: a chip that
  // wandered outside would be chrome floating over the row rather than a label on this picture.
  function chipLayer (box, side) {
    const layer = document.createElement('div')
    layer.className = 'pcchips ' + side
    box.appendChild(layer)
    let cur = null                                   // {spot, chip}
    const place = function (view, dur) {
      if (!cur || !cur.spot) { layer.hidden = true; return }
      const v = view || box._view
      layer.hidden = false
      const el = cur.chip
      if (v) {
        el.style.transition = dur > 0 ? ('transform ' + dur + 'ms cubic-bezier(0.4, 0, 0.2, 1)') : 'none'
        el.style.transform = 'translate(' + ((cur.spot.x - v.x) * v.scale) + 'px,' + ((cur.spot.y - v.y) * v.scale) + 'px)'
        el.style.maxWidth = (CARDG.width * v.scale) + 'px'
        // the tooltip flips toward the picture's middle so the box's own edge cannot clip it
        el.classList.toggle('tipup', (cur.spot.y - v.y) * v.scale > box.clientHeight * 0.55)
        el.classList.toggle('tipr', (cur.spot.x - v.x) * v.scale > box.clientWidth * 0.5)
      } else {
        // no camera on this moment (the whole page): the chip sits over the ring where the page has
        // it, at the cell's own natural scale
        const r = box.clientWidth / (cur.vp ? cur.vp.vw : 1)
        el.style.transition = 'none'
        el.style.transform = 'translate(' + (cur.spot.x * r) + 'px,' + (cur.spot.y * r) + 'px)'
        el.style.maxWidth = (CARDG.width * r) + 'px'
      }
    }
    box._views = box._views || []
    box._views.push(place)
    // paint(moment) — null, or a moment with nothing claimed, shows NO chip at all: a chip over a
    // bare snapValue would be a label with nothing to say (design C: the value only).
    layer._paint = function (m, vp) {
      const lines = m ? chipLines(m, side) : []
      if (!m || !m.aim || !lines.length) { cur = null; layer.textContent = ''; layer.hidden = true; return }
      // A BUTTON, not a div (2026-09-04, the review's I1): the value is one ellipsised line, so the
      // whole of it lives in the tooltip — and a tooltip only a mouse can open is a tooltip half the
      // readers do not have. It is also what makes the aria-label announced at all. It does nothing
      // when pressed: the chip is a label you can reach, not an action.
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'pchip ' + side + (lines.some(function (l) { return !l.ok }) ? ' bad' : '')
      const lab = document.createElement('span'); lab.className = 'pcl'
      lab.textContent = side === 'expected' ? 'expected' : 'actual'
      chip.appendChild(lab)
      const body = document.createElement('span'); body.className = 'pcb'
      const full = []
      lines.forEach(function (l) {
        const row = document.createElement('span'); row.className = 'pcvr' + (l.ok ? '' : ' no')
        if (l.mark) {
          const mk = document.createElement('span'); mk.className = 'pcm'; mk.textContent = l.mark
          row.appendChild(mk)
        }
        const tx = document.createElement('span'); tx.className = 'pcv'; tx.textContent = l.text
        row.appendChild(tx)
        body.appendChild(row)
        full.push((l.mark ? l.mark + ' ' : '') + l.text)
      })
      chip.appendChild(body)
      const tip = document.createElement('span'); tip.className = 'mtip'; tip.setAttribute('role', 'tooltip')
      tip.textContent = (side === 'expected' ? 'expected' : 'actual') + ' — ' + full.join(' · ')
      chip.appendChild(tip)
      chip.setAttribute('aria-label', tip.textContent)
      layer.textContent = ''
      layer.appendChild(chip)
      cur = { spot: chipSpot(m.aim, vp, lines.length), chip: chip, vp: vp }
      place(box._view, 0)
    }
    return layer
  }
  // THE MOMENT'S FRAME — the ring and the chip box the camera must hold, computed ONCE for the row
  // (phase 4b). Both cells take the same pair: the chip is the same width on either side (the card's
  // one width) and the taller of the two decides the union, so a checklist on one side can never
  // frame a region the other side does not show. A moment that claimed nothing has no chip, and the
  // camera frames its ring alone.
  // …and a moment that recorded NO ring of its own still has a region it is about: the beat's focus
  // rect (the union of the rings the beat painted, or — on a beat whose checks never rang anything —
  // whatever the harvest recorded as its subject). That is what the older beat camera framed, and
  // dropping to the whole page here would have un-zoomed every beat whose assertions read the page
  // with reveal() rather than proveVisible(), which is most of this board's own. The LOUPE does not
  // take the fallback (it is about a ringed ELEMENT, and there is none), and neither does a chip: a
  // moment with no claim has nothing to say either way.
  function momentFrame (m, vp) {
    const ring = (m && (m.aim || m.focus)) ? (m.aim || m.focus) : null
    if (!ring || !vp) return { ring: ring, chip: null }
    const lines = Math.max(chipLines(m, 'expected').length, chipLines(m, 'actual').length)
    return { ring: ring, chip: lines ? chipSpot(ring, vp, lines) : null }
  }
  // …and the moment's FAILED CLAIMS, asked once (the difference marker and the chips' ✕ both need
  // exactly this list). A passing moment has none, which is why no marker is drawn on one.
  function failedClaims (m) {
    if (!m) return []
    if (m.facts && m.facts.length) return m.facts.filter(function (c) { return c && c.ok === false })
    return (m.claim && m.claim.ok === false) ? [m.claim] : []
  }

  // ── THE DIFFERENCE MARKER (phase 5) ──────────────────────────────────────────────────────────
  // On a FAILED moment, ONE label ACROSS the two cells: `expected "Published" · actual "Draft"`. It
  // sits on the seam between them, at the ring's own projected height, because that is where a
  // reader's eyes already are — the two values are a sentence about the very element both pictures
  // are ringing, and reading it should not cost a look away. One marker per failed claim (a Then
  // with several facts stacks them), and NONE on a passing moment: a marker that appeared on every
  // moment would say "difference" where there is none, which is the opposite of what it is for.
  //
  // It reads its position off the ACTUAL cell's camera view, so it travels with the pan and the
  // glide; a ring the camera has taken off-screen parks the marker at the top of the pictures
  // rather than off the row (a label pointing outside the frame is a label pointing at nothing).
  function diffLayer (pics) {
    const layer = document.createElement('div'); layer.className = 'mdiffs'
    layer.hidden = true
    pics.appendChild(layer)
    let cur = null                              // {moment, box, vp}
    const place = function () {
      if (!cur || !cur.box) return
      const box = cur.box
      const view = box._view
      const ring = cur.m && cur.m.aim
      const r = (cur.vp && cur.vp.vw > 0 && box.clientWidth > 0) ? box.clientWidth / cur.vp.vw : 0
      const ry = ring ? (view ? (ring.y - view.y) * view.scale : ring.y * r) : 0
      const off = box.offsetTop - pics.clientTop
      const h = pics.clientHeight || 0
      const want = (ry >= 0 && (!box.clientHeight || ry <= box.clientHeight)) ? off + ry : 0
      layer.style.top = Math.max(0, h ? Math.min(want, h - 4) : want) + 'px'
    }
    layer._paint = function (m, box, vp) {
      const bad = failedClaims(m)
      layer.textContent = ''
      cur = { m: m, box: box, vp: vp }
      if (!bad.length) { layer.hidden = true; return }
      layer.hidden = false
      bad.forEach(function (c) {
        const el = document.createElement('div'); el.className = 'mdiff'
        const put = function (word, val, no, quoted) {
          const k = document.createElement('span'); k.className = 'mdk'; k.textContent = word
          const v = document.createElement('b'); v.className = 'mdv' + (no ? ' no' : '')
          v.textContent = (quoted === false) ? String(val) : ('“' + String(val) + '”')
          el.appendChild(k); el.appendChild(v)
        }
        put('expected', c.expected == null ? '' : c.expected, false)
        const sep = document.createElement('span'); sep.className = 'mdsep'; sep.textContent = '·'
        el.appendChild(sep)
        // NOTHING WAS THERE is a word, not a quoted value — the same word the chip beside it uses,
        // because two names for one fact reads as two facts
        put('actual', c.missing ? 'MISSING' : (c.got == null ? '' : c.got), true, !c.missing)
        layer.appendChild(el)
      })
      place()
    }
    layer._place = place
    return layer
  }

  // ── THE PROVED PHRASE, IN THE ROW'S OWN WORDS (design C) ─────────────────────────────────────
  // Every text once: the chips say the value, the strip says the moment's name, and the sentence —
  // written once, in the words cell — UNDERLINES the part of itself the moment on show is proving.
  // The range comes from the pure rule (tools/board/words.js), which works on TEXT; this splices it
  // back into the row's own markup by walking the text nodes, so a sentence carrying `code` or an
  // emphasis keeps it. Re-rendered from the original html on every step — the words are small, and
  // rebuilding from the source is what keeps an underline from accumulating on top of the last one.
  function underlineIn (host, html, range) {
    host.innerHTML = html
    if (!range || !(range[1] > range[0])) return
    const marks = []
    let pos = 0
    const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null)
    let n = walk.nextNode()
    while (n) {
      const len = n.nodeValue.length
      const a = Math.max(range[0], pos); const b = Math.min(range[1], pos + len)
      if (a < b) marks.push({ node: n, from: a - pos, to: b - pos })
      pos += len
      n = walk.nextNode()
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      const mk = marks[i]
      const tail = mk.node.splitText(mk.from)
      if (mk.to - mk.from < tail.nodeValue.length) tail.splitText(mk.to - mk.from)
      const u = document.createElement('u'); u.className = 'sbprove'
      tail.parentNode.insertBefore(u, tail)
      u.appendChild(tail)
    }
  }

  // ── THE EXPECTED PICTURE: THE APP'S OWN COMPONENT, ON PAPER ──────────────────────────────────
  // (the human, 2026-09-03 — the Expected View decision: "the picture beside a proof is a real HTML
  // replica of the app's own component", not a drawing of it.) The harvest commits, beside every
  // frame, the app's own sanitised markup for the region the assertion rang — `.expected.html`, one
  // per moment, with the requirement's claims applied — and this renders the
  // EXPECTED one in an `<iframe sandbox srcdoc>` with no `allow-*` token at all: no script, no
  // network, no same-origin identity, so the app's own CSS lays its own words out and nothing in the
  // file can do anything else. The file body is NEVER inlined into board.html; it is fetched (the
  // static server allowlists spec/**), which keeps a 4 MB board.html from becoming a 12 MB one.
  //
  // The page inside the frame is the app's page: paper, the app's shell PLATES around the region (so
  // the component reads in place rather than floating), the replica at the app's own coordinates,
  // and the SAME ring and dim the photograph beside it wears — painted from the very numbers
  // spec/_base.ts renderOverlay burned in (window.__BOARD__.geom) in the very colours
  // spec/_design.css declares (window.__BOARD__.paperCss). Two copies of those numbers is how the
  // two pictures of one row drift apart, so there is one source and both sides read it.
  const BD = window.__BOARD__ || {}
  const PAPER = BD.paperCss || {}
  const RINGG = (BD.geom && BD.geom.RING) || { inset: 4, stroke: 2, radius: 6, halo: 3 }
  // …and the CALLOUT's numbers, from the same one place (tools/overlay-geometry.mjs CARD, baked onto
  // the island): the chip that says what a moment claimed is the board's own descendant of the card
  // the burn-in used to paint, so it takes that card's width, its gap off the ring and its margin
  // off the page edge rather than inventing three numbers of its own.
  const CARDG = (BD.geom && BD.geom.CARD) || { width: 360, gap: 12, margin: 12 }
  // fetched ONCE per path, for the life of the page: the path carries the harvest's content hash, so
  // a re-harvest is a different key and a re-opened reader never re-downloads what it already has
  const REP_TEXT = new Map()
  function repFetch (path) {
    if (!path) return Promise.resolve('')
    if (!REP_TEXT.has(path)) {
      REP_TEXT.set(path, fetch(path).then(function (r) { return r.ok ? r.text() : '' }).catch(function () { return '' }))
    }
    return REP_TEXT.get(path)
  }
  function repJson (path) {
    if (!path) return Promise.resolve(null)
    const key = 'json:' + path
    if (!REP_TEXT.has(key)) {
      REP_TEXT.set(key, fetch(path).then(function (r) { return r.ok ? r.json() : null }).catch(function () { return null }))
    }
    return REP_TEXT.get(key)
  }
  // DEFENCE IN DEPTH, exactly as renderSchematic applies it to a committed svg: the file is
  // sanitised at capture and the sandbox forbids script anyway, but a committed file that has become
  // executable content never reaches a srcdoc from here. Its html comment header is dropped too.
  function repBody (text) {
    const t0 = String(text || '')
    if (!t0) return ''
    // THE COMMENT HEADER GOES FIRST (final review R6, 2026-09-04). Every replica file opens with an
    // html comment saying what it is; stripping it AFTER the test meant a file whose header (or any
    // other comment) happened to contain `<script` or an `on…=` was refused wholesale and the row
    // went blank with no reason given — a false negative on an honest file.
    const t = t0.replace(/<!--[\s\S]*?-->/g, '')
    // …and the handler test now matches an UNQUOTED handler too: `<img src=x onerror=alert(1)>`
    // walked straight past `\son\w+\s*=\s*["']`. Contained by `sandbox=''` either way, so this is
    // the second wall, not the first — but a wall with a hole in it is not a wall.
    if (/<script\b/i.test(t) || /\son\w+\s*=/i.test(t) || /javascript:/i.test(t)) return ''
    // …AND NO EXTERNAL FETCH, WHATEVER THE FILE SAYS (final review I1, second wall). The capture
    // refuses an external url on the way in (spec/_replica.mjs) and a computed value can no longer
    // close the sheet — but this frame is the thing that would actually make the request, from the
    // reviewer's own browser, so it asks the question itself rather than trusting the file it was
    // handed. A `src`/`href` with a scheme or a protocol-relative `//` is neutralised in place; the
    // element stays (an <img> with no src is an empty box, which is what a plate already is) so the
    // rest of the picture is not thrown away for it.
    // `data:` is the one scheme that stays: the capture keeps a small data: image because those
    // pixels ARE the app's own picture, and they fetch nothing.
    return t.replace(/\s(?:src|href|srcset)\s*=\s*(["'])\s*(?!data:)(?:[a-z][a-z0-9+.-]*:|\/\/)[^"']*\1/gi, ' data-external-src-removed="1"')
      .replace(/\s(?:src|href|srcset)\s*=\s*(?!["']|data:)(?:[a-z][a-z0-9+.-]*:|\/\/)[^\s>]*/gi, ' data-external-src-removed="1"')
      .trim()
  }
  const repAttr = function (text, name) {
    const m = new RegExp(name + '="([^"]*)"').exec(String(text || ''))
    return m ? m[1] : ''
  }
  const repRect = function (text, name) {
    const p = repAttr(text, name).trim().split(/\s+/).map(Number)
    return (p.length === 4 && p.every(function (n) { return isFinite(n) })) ? { x: p[0], y: p[1], w: p[2], h: p[3] } : null
  }
  // THE APP'S SHELL, AS BLANK PLATES (the plan's scene-root rule): the region is the component, and
  // the rest of the page is paper — but a component floating on blank paper loses where it SITS, so
  // the big painted boxes the harvest measured OUTSIDE the region are drawn as plates. No text on
  // them: they are the shell, not a second copy of the page. Read off the beat's own before
  // skeleton, so they are measured rather than invented; bounded, and any box that would overlap the
  // region is skipped rather than painted over the replica.
  const PLATE_FRAC = 0.05
  const PLATE_MAX = 12
  function repPlates (lay, reg, vw, vh) {
    const els = (lay && Array.isArray(lay.els)) ? lay.els : []
    const area = (vw > 0 && vh > 0) ? vw * vh : 0
    const out = []
    for (let i = 0; i < els.length && out.length < PLATE_MAX; i++) {
      const e = els[i]
      if (!e || !e.bg || !(e.w > 0 && e.h > 0)) continue
      if (!isFinite(Number(e.x)) || !isFinite(Number(e.y))) continue   // a skeleton is file content: its numbers are checked, not trusted
      if (!(area > 0) || e.w * e.h < area * PLATE_FRAC) continue
      if (reg && !(e.x + e.w <= reg.x || e.x >= reg.x + reg.w || e.y + e.h <= reg.y || e.y >= reg.y + reg.h)) continue
      out.push({ x: e.x, y: e.y, w: e.w, h: e.h })
    }
    return out
  }
  // ONE SRCDOC. `ok:false` reddens the ring exactly as the burn-in does on a failed claim.
  function repSrcdoc (parts) {
    const ring = parts.ring
    const i = RINGG.inset
    const rb = ring ? { x: ring.x - i, y: ring.y - i, w: ring.w + 2 * i, h: ring.h + 2 * i } : null
    const ink = parts.ok === false ? PAPER.ringFail : PAPER.ring
    // the TINT on a claimed element is an OUTLINE, so the app's own layout never moves; the mark
    // beside it (✓ ✎ ↺ +) is what keeps hue from carrying the state alone. Written with the
    // attribute repeated three times on purpose: the replica's own sheet declares `outline` on
    // every element as `.rep .rN` (two classes) and sits LATER in the document, so a single
    // attribute selector would lose the tie and the tint would never paint.
    const A = '[data-claim]'
    const A3 = A + A + A
    const mark = function (v, glyph, col) {
      return '[data-claim="' + v + '"]' + A + A + '{outline:2px ' + (v === 'ok' ? 'solid' : 'dashed') + ' ' + col +
        ';outline-offset:2px}\n[data-claim="' + v + '"]::after{content:"' + glyph + '";color:' + col + '}'
    }
    const css = [
      'html,body{margin:0;padding:0;background:' + PAPER.paper + ';overflow:hidden}',
      parts.faces || '',
      A3 + '{position:relative}',
      A + '::after{position:absolute;top:-8px;right:-8px;font:700 9px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1;pointer-events:none}',
      mark('ok', '✓', PAPER.tintOk),
      mark('fixed', '✎', PAPER.tintFixed),
      mark('restored', '↺', PAPER.tintFixed),
      mark('new', '+', PAPER.tintFixed),
      '.sbplate{position:absolute;background:' + PAPER.plate + ';pointer-events:none}',
      // A PLATE IS A THING THE CAPTURE COULD NOT SERIALISE, and it must LOOK like one. The replica
      // marks a big svg, a canvas, an iframe or an image it could not afford as `data-plate` and
      // leaves it empty (spec/_replica.mjs); rendered with no fill it reads as nothing at all, which
      // is a picture claiming the app shows blank space there. A washed box with a hairline says
      // "something stands here that this picture cannot draw" — which is the truth. Same repeated
      // attribute as the claim tints, and for the same reason: the replica's own sheet declares
      // background and border on every element and sits later in the document.
      '[data-plate][data-plate][data-plate]{background:' + PAPER.plate + ';border:1px dashed ' + PAPER.hair + '}',
      '[data-plate="space"][data-plate][data-plate]{background:transparent;border:0}',
      '.sbring{position:absolute;border:' + RINGG.stroke + 'px solid ' + ink + ';border-radius:' + RINGG.radius +
        'px;box-shadow:0 0 0 ' + RINGG.halo + 'px ' + PAPER.halo + ',0 0 0 9999px ' + PAPER.veil + ';pointer-events:none}',
      '.sbdim{position:absolute;inset:0;background:' + PAPER.veil + ';pointer-events:none}',
      // THE BASE'S CONTEXT, FADED (phase 8, 2026-09-05). The page around the patch was captured at
      // the beat's OPENING and this moment's patch was not, so showing the two at equal weight would
      // be a picture claiming to be one instant. Faded, it does the one job it is there for: saying
      // WHERE the component sits. Marked by tools/board/graft.js, never by this sheet.
      '[data-ctx][data-ctx][data-ctx]{opacity:.4;filter:saturate(.5)}',
      // (the .sbsk sketch layer that stood a drawing in a borrowed page went with the SKETCH, retired
      // by the human 2026-09-05 — an un-harvested requirement shows its prose and an honest empty
      // state, so no page here is ever a borrowed one.)
    ].join('\n')
    // EVERY NUMBER THAT REACHES A STYLE ATTRIBUTE IS ONE (final review R6). A plate's box comes out
    // of a committed `*.layout.json` — file content, not something this page computed — and `x`/`y`
    // were interpolated unvalidated while `w`/`h` were checked: a corrupt skeleton carrying a quote
    // in `x` closes the attribute and writes markup of its own. Sandboxed, so not execution; a
    // false picture all the same, and the cheapest possible guard.
    const num = function (v) { return isFinite(Number(v)) ? Number(v) : 0 }
    const plates = (parts.plates || []).map(function (p) {
      return '<div class="sbplate" style="left:' + num(p.x) + 'px;top:' + num(p.y) + 'px;width:' + num(p.w) + 'px;height:' + num(p.h) + 'px"></div>'
    }).join('')
    const reg = parts.region || { x: 0, y: 0, w: parts.vw, h: parts.vh }
    const body = '<div style="position:absolute;left:' + reg.x + 'px;top:' + reg.y + 'px;width:' + reg.w + 'px">' + parts.body + '</div>'
    // the ring's own 9999px shadow IS the dim, spreading out from it — one element, exactly the
    // geometry the reference row ships. With no ring there is nothing to spot-light, so the page
    // takes the even wash the photograph beside it has.
    const over = parts.note
      ? ''                                             // nothing to ring, and nothing to dim either
      : (rb
          ? '<div class="sbring" style="left:' + rb.x + 'px;top:' + rb.y + 'px;width:' + rb.w + 'px;height:' + rb.h + 'px"></div>'
          : '<div class="sbdim"></div>')
    // …and where there is NO picture for this moment, the page says so rather than standing empty
    // (the review's C3): the same paper, one quiet line in the system's own ink, no ring on nothing.
    const note = parts.note
      ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'font:italic 13px ui-sans-serif,system-ui,sans-serif;color:' + PAPER.ink3 + ';text-align:center;' +
        'padding:0 24px;box-sizing:border-box">◌ ' + String(parts.note).replace(/[<>&"]/g, '') + '</div>'
      : ''
    return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' +
      plates + body + over + note + '</body></html>'
  }

  // ── THE FRAME-STEPPER, at any scale ──────────────────────────────────────────────────────────
  // Task 13's player, extracted from the old media pane so a per-beat proof CELL can play its own
  // pair: the frames stacked, one on show, over a slim bar of exact dots and the mono n / N count.
  // It carries data-stepper so closeFocus's sweep finds it wherever it is mounted, and it re-arms
  // itself at the reader's one speed.
  function makeStepper (frames) {
    const el = document.createElement('div'); el.className = 'fsteps-wrap'; el.dataset.stepper = '1'
    const stage = document.createElement('div'); stage.className = 'fsteps'
    frames.forEach(function (f) {
      // eager on purpose (release pass M-1): the frames stack display:none, and a lazy img is never
      // fetched while hidden — at 4× the first loop flashed blank.
      const img = document.createElement('img'); img.className = 'camsub'; img.src = f.src; img.alt = f.alt || ''
      stage.appendChild(img)
    })
    // NO dots and NO n/N counter in the proof cell any more (the human, 2026-09-02): the row's ONE
    // moment strip over the pictures (momentStrip, fed by _onStep below) is the single readout and
    // walk for the beat, so the frames stack alone here with nothing under them.
    const timing = window.SBStepper.stepperHolds(frames.map(function (f) { return f.anchor }))
    const holds = timing.holds
    const imgs = [].slice.call(stage.children)
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    let cur = 0
    let timer = null
    const stop = function () { if (timer) { clearTimeout(timer); timer = null } }
    const show = function (i) {
      cur = i
      // the row's DRAWING rides this same step (2026-08-29): buildStoryline hands the cell an
      // `_onFrame` that moves the schematic to the scene this frame belongs to, over this frame's
      // own hold — so the two halves of a beat row change at the same moment, in the same order,
      // instead of each running its own clock.
      if (el._onFrame) el._onFrame(i, window.SBStepper.scaleHold(holds[i], PLAY_SPD))
      // …and the CAMERA moves with it (2026-08-31): the cell pans to the ring this scene rang, and
      // the drawing's cell is panned to the same rect by the very same call, so a row is one camera
      // on one region at every moment of the beat — not only at its start.
      if (el._onScene) el._onScene(i)
      imgs.forEach(function (im, k) { im.classList.toggle('on', k === i) })
      // the row's MOMENT STRIP is the readout now — it lights the segment of the moment on show
      // (the human, 2026-09-02), tracking the loop in auto and the walk in step alike.
      if (el._onStep) el._onStep(cur)
    }
    // In STEP mode (the default) nothing is scheduled: the scene holds until a person walks it with
    // the strip's ‹ › or the ← → keys. In auto the loop advances on its own hold.
    const schedule = function () {
      stop()
      if (reduced || imgs.length < 2) return             // pauses like the schematic's loop
      if (PLAY_MODE === 'step') return                   // held: the reader is walking it by hand
      timer = setTimeout(function () {
        timer = null
        if (!el.isConnected || el.hidden) return         // torn down, or the cell shows its stills
        show((cur + 1) % imgs.length)
        schedule()
      }, window.SBStepper.scaleHold(holds[cur], PLAY_SPD))
    }
    el.appendChild(stage)
    show(0)
    el._count = imgs.length
    el._start = schedule; el._stop = stop
    // ONE SCENE FORWARD, wrapping — what a click in step mode asks for. It goes through show(), so
    // the row's DRAWING is driven by the very same call the loop makes: the two halves step together
    // whether a timer or a person moved them.
    el._next = function () {
      if (imgs.length < 2) return
      show((cur + 1) % imgs.length)
      schedule()                                        // a no-op in step mode; re-arms in auto
    }
    // …and ONE SCENE BACK — what the dedicated stepper's ← asks for (the human, 2026-08-30). Same
    // path, same drawing driven beside it: prev and next are the loop's own step, walked by hand.
    el._prev = function () {
      if (imgs.length < 2) return
      show((cur - 1 + imgs.length) % imgs.length)
      schedule()
    }
    // …and a JUMP to a named scene — what a rail bead asks for. Goes through show() like every other
    // move, so the drawing and the camera come with it; schedule() re-arms in auto, no-ops in step.
    el._goto = function (j) {
      if (imgs.length < 2) return
      show(((j % imgs.length) + imgs.length) % imgs.length)
      schedule()
    }
    el._cur = function () { return cur }
    onSpd(el, function () { if (!el.hidden) schedule() })
    // switching the reader's mode arms or holds every loop at once (schedule() itself is the gate)
    onMode(el, function () { if (!el.hidden) schedule() })
    return el
  }

  // ── THE BEAT'S ONE STEPPER, OVER ITS PICTURES ────────────────────────────────────────────────
  // (the human, 2026-09-02: "schematic and proof should share same stepper (as their steps must be
  // same???), please think about the product and really fix the problem.")
  //
  // THE PRODUCT MODEL. A beat has ONE ordered list of MOMENTS: every value the test proved, in the
  // order it proved them, then the beat's result — the Then. The drawing and the photograph are two
  // RENDERINGS of that one list, never two things to be kept in sync, so the row has ONE stepper
  // and both pictures always show the same index. It sits ACROSS the two pictures, because that is
  // what it steps; the `‹ n / N ›` that used to hide in the behaviour gutter (2026-09-01) is gone
  // with the two-clocks it read from — "not obvious and hard to read", the human, the same day.
  //
  // Each segment is NAMED by the assertion the run recorded (values[].label, harvested by
  // spec/_base.ts snapValue off the CLAIM the check painted) — never "when 1". The last segment is
  // the beat's Then, marked with the word `then` as well as the indigo (hue never carries a state
  // alone). A click on a segment jumps to that moment; ‹ › walk it; at the end › becomes a restart
  // ↺. The keys are unchanged: ← → walk the SELECTED row, ↑ ↓ pick the row.
  //
  // A `driver` is the row's stepper seen through one small interface, so the proof loop and a
  // proof-less drawing's own stepper both feed the same control:
  //   { count, goto(j), step(dir), current(), subscribe(fn) }
  //
  // the proof loop, seen as a driver — the strip's ‹ › walk the SAME frames the loop plays
  function proofDriver (step) {
    return {
      count: step._count,
      goto: function (j) { step._goto(j) },
      step: function (dir) { if (dir < 0) step._prev(); else step._next() },
      current: function () { return step._cur() },
      subscribe: function (fn) { step._onStep = fn }
    }
  }
  // ONE STEPPER FOR THE ROW, over its two pictures. `moments` names each index — the assertion the
  // run recorded (values[].label), the last one the beat's Then. A name it does not have falls back
  // to a generic one rather than being invented: the strip says what the harvest knows.
  // `claims[i]` is what moment i PROVED — `{ claim }` for a value moment, `{ facts }` for the beat's
  // result — so the tooltip can say the values as well as the name. Without it (a drawing-only row,
  // which had no assertion to name its scenes after) a segment's tooltip is its name alone, exactly
  // as before.
  function momentStrip (driver, moments, claims) {
    if (!driver || !(driver.count > 1)) return null
    const N = driver.count
    const names = []
    for (let i = 0; i < N; i++) {
      const raw = (moments && moments[i]) ? String(moments[i]) : ''
      names.push(raw.replace(/\s+/g, ' ').trim() || ('what the test checked, ' + (i + 1)))
    }
    const strip = document.createElement('div'); strip.className = 'mstrip'
    strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', 'walk this beat’s moments')
    const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'mnav mprev'
    prev.textContent = '‹'; prev.setAttribute('aria-label', 'previous moment'); prev.title = 'previous moment'
    const track = document.createElement('div'); track.className = 'mtrack'
    const segs = []
    for (let i = 0; i < N; i++) {
      const isThen = i === N - 1
      const seg = document.createElement('button'); seg.type = 'button'
      seg.className = 'mseg' + (isThen ? ' then' : '')
      // the WORD, not the hue alone: the last segment is prefixed `then ·`, so a greyscale reader
      // still knows which moment is the beat's result (design system — hue never carries a state).
      const lab = document.createElement('span'); lab.className = 'msegl'
      const full = (isThen ? 'then · ' : '') + names[i]
      lab.textContent = full
      lab.dataset.full = full
      const bar = document.createElement('span'); bar.className = 'msegb'
      // ONE LINE, ALWAYS, with the whole name one hover away (the human, 2026-09-02: "always max. show
      // one line, and user can hover and it show a proper tooltip for the full text when the text is
      // too long"). A name that wrapped made one row's strip taller than the next; the label is a
      // single ellipsised line now and the full name is a STYLED tooltip (.mtip) the segment shows on
      // hover / keyboard focus — not the native title, which would stack a second tooltip on top.
      // …AND THE TWO VALUES WITH IT (2026-09-04, the review's C1 — the brief's deliverable B). The
      // segment's label is the moment's NAME; hovering it must also say what that moment expected and
      // what the app gave, because the name alone cannot tell you whether the moment passed. Same
      // shape the plan's reference row uses: the name in bold, then one `expected` / `actual` pair —
      // or, on the beat's result, one ticked line per fact. The chips over the pictures carry the
      // same values; this is the readout for the moment you are NOT standing on.
      const tip = document.createElement('span'); tip.className = 'mtip'; tip.setAttribute('role', 'tooltip')
      const head = document.createElement('b'); head.textContent = full
      tip.appendChild(head)
      const said = []
      const line = function (key, text, bad) {
        const row = document.createElement('span'); row.className = 'tvr'
        const k = document.createElement('span'); k.className = 'tk'; k.textContent = key
        const v = document.createElement('span'); v.className = 'tv' + (bad ? ' bad' : '')
        v.textContent = text
        row.appendChild(k); row.appendChild(v); tip.appendChild(row)
        said.push(key + ' ' + text)
      }
      const q = function (t) { return '“' + String(t == null ? '' : t) + '”' }
      const got = function (c) { return c.missing ? 'MISSING' : q(c.got) }
      const cl = (claims && claims[i]) || null
      if (cl && cl.facts && cl.facts.length) {
        for (const c of cl.facts) line(c.ok ? '✓' : '✕', c.ok ? q(c.expected) : (q(c.expected) + ' · got ' + got(c)), !c.ok)
      } else if (cl && cl.claim) {
        line('expected', q(cl.claim.expected), false)
        line('actual', got(cl.claim), cl.claim.ok === false)
      }
      seg.appendChild(lab); seg.appendChild(bar); seg.appendChild(tip)
      seg.setAttribute('aria-label', 'moment ' + (i + 1) + ' of ' + N + ' — ' + names[i] +
        (said.length ? ' — ' + said.join(' · ') : ''))
      seg.addEventListener('click', function () {
        if (PLAY_MODE !== 'step') setMode('step')   // jumping holds the loop, else it snaps on
        driver.goto(i)
      })
      track.appendChild(seg); segs.push(seg)
    }
    const next = document.createElement('button'); next.type = 'button'; next.className = 'mnav mnext'
    next.textContent = '›'; next.setAttribute('aria-label', 'next moment'); next.title = 'walk to the next moment'
    const read = document.createElement('div'); read.className = 'mread'
    const pos = document.createElement('span'); pos.className = 'mpos'
    const chip = document.createElement('span'); chip.className = 'chip mkind'
    read.appendChild(pos); read.appendChild(chip)
    // prev WALKS BACK one moment, holding the loop; it is inert (and dimmed) at the first
    prev.addEventListener('click', function () {
      if (driver.current() <= 0) return
      if (PLAY_MODE !== 'step') setMode('step')
      driver.step(-1)
    })
    // next WALKS FORWARD one moment; at the last it is a RESTART that wraps to the first
    next.addEventListener('click', function () {
      if (PLAY_MODE !== 'step') setMode('step')
      if (driver.current() >= N - 1) driver.goto(0)   // ↺ wraps to the start
      else driver.step(1)
    })
    strip.appendChild(prev); strip.appendChild(track); strip.appendChild(next); strip.appendChild(read)
    const paint = function (cur) {
      for (let i = 0; i < segs.length; i++) {
        segs[i].classList.toggle('cur', i === cur)
        segs[i].classList.toggle('done', i < cur)
        if (i === cur) segs[i].setAttribute('aria-current', 'step'); else segs[i].removeAttribute('aria-current')
      }
      pos.textContent = (cur + 1) + ' / ' + N
      const atEnd = cur >= N - 1
      chip.textContent = atEnd ? 'then' : 'when'      // the word, beside the indigo — never the hue alone
      chip.classList.toggle('then', atEnd)
      prev.disabled = cur <= 0                        // dim/disable at the start — the walk has a beginning
      next.textContent = atEnd ? '↺' : '›'
      next.classList.toggle('restart', atEnd)
      next.setAttribute('aria-label', atEnd ? 'restart from the first moment' : 'next moment')
      next.title = atEnd ? 'restart — back to the first moment' : 'walk to the next moment'
    }
    driver.subscribe(paint)
    paint(driver.current())
    return strip
  }
  // THE ROW'S FOCUS RECT — the one both of its cells frame (the human, 2026-08-28). The GIVEN row is
  // the CONTEXT row: it shows the whole page on both sides, because the point of it is where the
  // component sits, not what it says. Every beat row takes its beat's own recorded box. A prose-only
  // requirement has one row and no context row to spare, so it keeps beat 1's box if there is one.
  // i: 0 = the Given row, 1..nbeats = beat i.
  function beatFocus (r, i, nbeats) {
    if (i === 0 && nbeats) return null
    const want = i || 1
    const b = (r.ev.beats || []).filter(function (x) { return Number(x.n) === want })[0]
    return (b && b.focus) ? b.focus : null
  }
  // ── THE PROOF a beat row shows ───────────────────────────────────────────────────────────────
  // `ev.beats` is the per-beat harvest: beat n's own before/after and the window it spans. An OLDER
  // harvest carries none, and then only the requirement-level pair is honest — its before opens the
  // story on the Given row, its after closes it on the LAST beat row, and every row in between says
  // the gap out loud. Nothing is ever borrowed from a neighbouring beat to fill a cell (rule 3).
  // i: 0 = the Given row, 1..nbeats = beat i.
  function beatShots (r, i, nbeats, thenTxt) {
    const per = (r.ev.beats || [])
    const at = function (n) { return per.filter(function (b) { return Number(b.n) === n })[0] || null }
    // ONE focus rect for the whole row — the same one the schematic cell is aimed at, so the two
    // cells can never frame different regions of the same beat
    const rf = beatFocus(r, i, nbeats)
    // …and the AIM the row's camera takes for THIS scene (the human, 2026-08-31): the ring that
    // scene photographed, derived at build time from the layout skeleton beside its frame. The
    // zoom stays the beat's; only the centre moves. A scene with no ring of its own (an old
    // harvest, a before frame that rings nothing) simply has none, and the camera stays on the
    // focus — the pre-2026-08-31 framing, honestly.
    // …and the moment's OTHER PICTURE beside its photograph (phase 4a, 2026-09-03): the committed
    // replica the Expected cell renders. It rides on the SHOT, not in a parallel list, because that
    // is what makes the two cells one thing — moment j of the row is shot j on both sides by
    // construction, and no length check can drift. `rep` is the Expected where the harvest took one
    // and the Actual where it did not (a before moment has claimed nothing, so its Actual IS its
    // Expected); `repSide` says which, and `claim` is what the check asserted there.
    // …and WHAT IT CLAIMED, in the two shapes a moment can carry it (phase 4b, design C): `claim` is
    // the ONE value a value moment proved, `facts` the beat's whole CHECKLIST — every claim it made —
    // which is what its Then is the result of. Facts are the claims themselves, never a count of
    // them: "2 of 2 checks" is a scoreboard, and a reader cannot tell from it what was checked.
    const shot = function (src, cap, anchor, aim, rep, repSide, claim, facts) {
      return {
        src: src,
        cap: cap,                    // the moment's NAME — the strip's segment label AND the img alt
        anchor: (typeof anchor === 'number') ? anchor : null,
        focus: rf,
        aim: (aim && aim.w > 0 && aim.h > 0) ? aim : null,
        rep: rep || '',
        repSide: rep ? (repSide || 'actual') : '',
        claim: claim || null,
        facts: (facts && facts.length) ? facts : null
      }
    }
    // THE ASSERTED VALUES BETWEEN THE ENDS (2026-08-29, the human: the When has to be visible in the
    // proof too). A beat's before/after pair photographs the two ends of the assertion body, and the
    // action itself falls between them — a box carrying what was just typed is empty in the before
    // frame and cleared again by the after one. proveVisible photographs each value it rings, and
    // each frame carries `at`, its offset from the start of the beat's own window, so the loop plays
    // them at the run's true relative pace. A frame with no offset simply has no anchor, and the
    // stepper falls back to equal holds for the whole loop rather than inventing one.
    // Each value frame is NAMED by the assertion that took it (the human, 2026-09-02): the run
    // recorded the claim's own label beside the frame (spec/_base.ts snapValue → the fold →
    // data-ev-beats), and that name is what the row's one stepper writes under its segment and what
    // the frame's alt text says. A harvest from before this carries no label, and the segment falls
    // back to a generic name rather than to an invented one.
    const values = function (b) {
      return (b.values || []).filter(function (v) { return v && v.frame }).map(function (v, k) {
        const at = (b.window && typeof v.at === 'number') ? b.window.from + v.at : null
        const name = (typeof v.label === 'string' && v.label.trim())
          ? v.label.replace(/\s+/g, ' ').trim() : ('what the test checked, ' + (k + 1))
        // the claim carries the assertion's own NAME with it (phase 4b): `provedPhrase` falls back to
        // the label's longest shared run when the sentence does not say the value outright, and the
        // fold files the label on the VALUE rather than inside the claim — so it is attached here,
        // once, instead of every reader of a claim having to know where the other half lives.
        const claim = v.claim
          ? { expected: v.claim.expected, got: v.claim.got, ok: v.claim.ok, missing: v.claim.missing, label: v.claim.label || name }
          : null
        // ONE HTML PER MOMENT (2026-09-04): the Expected is the only replica a moment has, and the
        // Actual half of it is the photograph this same `shot` carries. A moment with none renders
        // the honest per-moment placeholder — never the app's own markup under a chip saying
        // "expected" (final review R2).
        return shot(v.frame, name, at, v.focus, v.replicaExpected || '', 'expected', claim)
      })
    }
    // THE ROW OPENS ON THE WHEN (the human, 2026-08-31: "first screen in when/then should already
    // have the 'when' action started — instead of just same as given, it will be redundant"). A beat
    // that PROVED values shows them and its result: its opening state is the Given row above it, or
    // the previous beat's result, and spending the first scene on it shows a picture already read.
    // A beat that proved nothing between its ends keeps [before, after] — there the before IS the
    // motion. The harvest still CAPTURES the before frame (it stays in evidence): this is a display
    // rule about which scenes the row walks, never about what the run recorded.
    const pair = function (b, capA, capB) {
      const out = []
      const vals = values(b)
      // …and the beat's OPENING picture is its BASE since phase 8 (2026-09-05): the body-rooted
      // capture of the Given, one blob shared by every beat that starts from that page. A legacy
      // entry still carries `replicaExpectedBefore`, and this reads whichever the fold left.
      if (b.before && !vals.length) out.push(shot(b.before, capA, b.window ? b.window.from : null, b.aimBefore, b.base || b.replicaExpectedBefore || '', 'expected', null))
      for (const v of vals) out.push(v)
      // the beat's RESULT takes its Expected — the intended state, which on a failed beat is the last
      // one the app got right plus every claim (spec/_replica.mjs intendedLayout's own rule)
      if (b.after) {
        // the result's chips are the beat's CHECKLIST — every claim it made, in the order it made
        // them. A beat that claimed nothing has no checklist and shows no chip at all.
        out.push(shot(b.after, capB, b.window ? b.window.to : null, b.aimAfter,
          b.replicaExpectedAfter || '', 'expected',
          null, vals.map(function (v) { return v.claim }).filter(Boolean)))
      }
      // THE RESULT STANDS WHERE THE BEAT LAST STOOD (phase 4b). A beat's RESULT moment records no
      // ring of its own — the run paints one around each value it checks, not around the page it
      // leaves — so its chips would have nowhere to sit and its camera would jump back out to the
      // whole beat at the very moment the checklist appears. It inherits the last ring the beat
      // painted, which is the element the checklist is about. This moves no picture and invents no
      // overlay: the frames are the run's own, ring and all; only the FRAMING, the chip's spot and
      // the chip's spot read it. (The same rule the drawing already used for an element the app
      // never had — draw it beside the ring the beat last stood on.)
      let last = null
      for (const s of out) { if (s.aim) last = s.aim; else if (last) s.aim = last }
      // THE BEAT'S BASE RIDES ON EVERY SHOT OF IT (phase 8, 2026-09-05): the screen's Given, which is
      // the page each of this beat's moments is a patch on. Attached here, once, rather than threaded
      // through `shot`'s eight positional arguments — the base is a property of the BEAT, and every
      // moment of it wants the same one.
      for (const s of out) s.base = b.base || ''
      return out
    }
    // the LAST moment of a beat is its result, so it is named by the beat's own Then — "after — <Then>"
    // reads as the sentence the picture is proving rather than as a phase name nobody asked about.
    const after1 = thenTxt ? ('after — ' + thenTxt) : 'after'
    if (per.length) {
      if (i === 0) {
        const b1 = at(1)
        if (!b1) return { shots: [], why: 'no frame harvested for the opening state yet' }
        // a prose-only requirement has no beat rows at all — its ONE row carries the whole pair
        const out = nbeats
          ? (b1.before ? [shot(b1.before, 'given', b1.window ? b1.window.from : null, b1.aimBefore, b1.replicaExpectedBefore || '', 'expected', null)] : [])
          : pair(b1, 'before', after1)
        return out.length ? { shots: out } : { shots: [], why: 'no frame harvested for the opening state yet' }
      }
      const b = at(i)
      if (!b) return { shots: [], why: 'no per-beat evidence yet — the next run harvests it' }
      const out = pair(b, 'before', after1)
      return out.length ? { shots: out } : { shots: [], why: 'no per-beat evidence yet — the next run harvests it' }
    }
    // the fallback: the requirement-level pair, at the two ends of the story it actually covers
    if (i === 0) {
      const out = []
      if (r.ev.before) out.push(shot(r.ev.before, 'before', r.ev.window ? r.ev.window.from : null))
      // no beat rows to close the story on — a prose-only requirement's one row carries both ends
      if (!nbeats && r.ev.after) out.push(shot(r.ev.after, after1, r.ev.window ? r.ev.window.to : null))
      return out.length ? { shots: out } : { shots: [], why: 'no evidence harvested yet' }
    }
    if (i === nbeats) {
      return r.ev.after
        ? { shots: [shot(r.ev.after, after1, r.ev.window ? r.ev.window.to : null)] }
        : { shots: [], why: 'no evidence harvested yet' }
    }
    return { shots: [], why: 'no per-beat evidence yet — this harvest only spans the whole requirement' }
  }

  // one beat row's PROOF cell: the beat's frames under the camera. It ALWAYS LOOPS (the human,
  // 2026-08-28) — the beat's before→after plays on the reader's shared speed, exactly as the
  // schematic beside it loops that beat's own motion, so a row plays as ONE thing. There is no
  // loop/stills switch any more: a mode toolbar over two frames was chrome asking a question nobody
  // had, and every cell answering it differently broke the row's rhythm. A beat with a single frame
  // — the Given row, or a half-harvest — has nothing to loop and stays the still it is; the
  // zoom ↔ full-frame toggle rides wherever the harvest recorded a focus box.
  // `vpIn` is the row's ONE viewport (buildStoryline's viewportOf) — the page both cells stand on.
  // Passed in rather than re-derived here so the two cameras of a row can never take their page size
  // from two different records; with none, this cell falls back to its own shots' measurements.
  function proofCell (r, i, nbeats, cards, thenTxt, vpIn) {
    const cell = document.createElement('div'); cell.className = 'sbproof'
    const got = beatShots(r, i, nbeats, thenTxt)
    // the row's MOMENTS, in order — what the strip names its segments after (buildStoryline reads it)
    cell._moments = got.shots.map(function (s) { return s.cap })
    // …and the SHOTS themselves, so the Expected cell beside this one renders the SAME ordered list
    // of moments (phase 4a). One list, two renderings — never two lists to be kept in step.
    cell._shots = got.shots
    if (!got.shots.length) {
      const no = document.createElement('div'); no.className = 'pcnone'
      no.textContent = '◌ ' + (got.why || 'no evidence yet')
      cell.appendChild(no)
      return cell
    }
    const focus = got.shots[0].focus
    // THE MOMENT'S CAMERA, where the row has the app's own component to compare (phase 4b, the human
    // 2026-09-03). A replica row frames the ring ∪ its chip at ≤ 1.25× (aimFrame) rather than the
    // beat's whole union at up to 3.2×: the chip that says what was claimed must be in shot, and a
    // component blown up to fill the cell loses the header it sits in. A row with no replica keeps
    // the older beat camera — there is no chip beside its picture to hold in frame.
    const vp = (function () {
      if (vpIn && vpIn.vw > 0 && vpIn.vh > 0) return { vw: vpIn.vw, vh: vpIn.vh }
      const f = got.shots[0].focus || got.shots[0].aim
      return (f && f.vw > 0 && f.vh > 0) ? { vw: f.vw, vh: f.vh } : null
    })()
    // …and never on the GIVEN row: it is the context row, whole page on both sides by design (R19),
    // and beatFocus is what says so — no focus rect, no camera, on either path. `vpIn` is the second
    // half of that gate: only a BEAT row is handed the row viewport, because only a beat row has a
    // showMoment to drive the moment camera; a cell that took it without one would zoom once and
    // then never aim at anything.
    const useFrame = !!(vpIn && vp && focus && hasReplicas(r))
    cell._vp = vp
    const cam = document.createElement('div'); cam.className = 'pccam'
    if (got.shots.length > 1) {
      // THE LOOP — one camera box, the frames played in it, armed on build. The cell is still
      // detached here, but the reader is appended synchronously in this same task and the shortest
      // hold is 350ms, so the first hop always lands with the node in the document; the tick's
      // isConnected guard stops orphans, never this.
      const sbox = document.createElement('div'); sbox.className = 'pcbox pcplay'
      const step = makeStepper(got.shots.map(function (s) {
        return { src: s.src, alt: s.cap, anchor: s.anchor }
      }))
      sbox.appendChild(step)
      cam.appendChild(sbox)
      if (useFrame) {
        aimFrame(sbox, vp)
        cell._chips = chipLayer(sbox, 'actual')   // ACTUAL ✓/✕ "…" over the photograph
        cell._camBox = sbox
        // the row drives BOTH cells from one place (buildStoryline's showMoment), so this cell does
        // not aim itself scene by scene: two aimers on one row is how the halves drift apart.
        cell._aimMoment = function (ring, chip, animate) { sbox._aim(ring, chip, animate) }
      } else aimCamera(sbox, focus, CAM)
      cell._stepper = step        // the row's drawing locks to this loop (buildStoryline)
      // THE CAMERA FOLLOWS THE SCENE (the human, 2026-08-31). The beat's rings can be most of a page
      // apart; one static frame that held them all could only do it by zooming back out. So the
      // stepper hands every scene change to the camera as well as to the drawing, and the cell pans
      // to the ring the frame on show photographed. The drawing beside it takes the SAME rect
      // (buildStoryline, through the svg's own coordinates), so the row is still one camera.
      cell._aims = got.shots.map(function (s) { return s.aim })
      // …and every scene's CALLOUT CARD box beside its ring (the human, 2026-08-30): the camera
      // frames the union so the burned card is never clipped. `cards` rode in from the SKETCH's own
      // svg until the sketch was retired (the human, 2026-09-05); it arrives null now and the camera
      // frames the ring alone. Kept as a parameter because the harvest may yet publish card boxes.
      cell._cards = (cards && cards.length === got.shots.length) ? cards : []
      if (!useFrame) {
        step._onScene = function (j) { sbox._aim((cell._aims || [])[j] || null, (cell._cards || [])[j] || null, true) }
        sbox._aim(cell._aims[0] || null, (cell._cards || [])[0] || null, false)   // initial: snap, don't zoom-in
      }
      // …and the row can TAKE THE PAN BACK. A drawing that cannot be linked to this loop (an older
      // harvest, a mismatched scene count) shows a scene of its own choosing, and a proof cell that
      // panned alone would leave the two cells framing different regions — the one thing R19
      // forbids. Then both stay on the beat's focus: less zoom, still one camera.
      cell._unaim = function () { cell._aims = null; cell._cards = null; sbox._aim(null, null) }
      // THE PROOF IS A PROOF AGAIN (the human, 2026-08-30: "now can not zoom in proof"). Stepping no
      // longer rides a click on the frames — a dedicated reader-wide control does it (readerStep), so
      // a click on the proof cell opens the shared lightbox in EVERY mode exactly as every other image
      // does, and a beat whose harvest has no proof frames can still be walked by the control. The cell
      // registers what the control drives it with: one scene forward or back, wrapping. (The proof cell
      // has no dots any more — the row's moment strip and the ← → keys are the walk and the readout.)
      cell._rowStep = function (dir) { if (dir < 0) step._prev(); else step._next() }
      // …and the row's MOMENT STRIP drives this same loop: a jump to any moment (‹ › walk, the ↺
      // restart wraps to the first) — the same show()/_drive path, so both cells step together.
      cell._rowGoto = function (j) { step._goto(j) }
      step._start()
    } else {
      // ONE frame: a plain, UNCAPTIONED still (the human, 2026-09-02 — the "given" label row is gone,
      // like the dots and the full-frame button; the beat's words live in the behaviour cell, and the
      // burned-in callout is inside the frame). Same camera the loop would use.
      const s = got.shots[0]
      const strip = document.createElement('div'); strip.className = 'pcstrip'
      const fig = document.createElement('figure'); fig.className = 'pcfig'
      const box = document.createElement('div'); box.className = 'pcbox'
      const im = document.createElement('img'); im.className = 'camsub'; im.src = s.src; im.alt = s.cap
      box.appendChild(im); fig.appendChild(box)
      strip.appendChild(fig)
      cam.appendChild(strip)
      // ONE CAMERA, WHATEVER THE MOMENT COUNT (final review R5, 2026-09-04). `useFrame` was only
      // consulted in the multi-shot branch above, so a beat row with exactly ONE moment framed its
      // photograph with `aimCamera` (cameraView: max 3.2×, pad 1.2) while the Expected cell beside
      // it took `frameFor` (max 1.25×, pad .45) — two different regions in one row, which is the one
      // thing board R19 forbids — and got no chips and no `_aimMoment` at all. A beat row now takes
      // the moment camera on both sides however many moments it has; `aimCamera` stays for the
      // whole-page Given/context rows, which is what `useFrame` being false now means.
      if (useFrame) {
        aimFrame(box, vp)
        cell._chips = chipLayer(box, 'actual')
        cell._camBox = box
        cell._aimMoment = function (ring, chip, animate) { box._aim(ring, chip, animate) }
      } else {
        aimCamera(box, s.focus, CAM)
        box._aim(s.aim || null, (cards && cards.length === 1 ? cards[0] : null) || null, false)
      }
    }
    cell.appendChild(cam)
    // NO per-cell chrome (the human, 2026-09-02: "remove full frame button and also the dots in
    // proof as it already did in the step on behaviour"). The full screenshot is the LIGHTBOX a click
    // on the proof opens, and the ONE readout + walk for the beat is the moment strip above the two
    // pictures — so the proof cell carries no zoom toggle, no dots and no counter. The camera
    // stays a view (ZOOMED is the standing default; both cells frame the component), never a claim
    // about what was captured — the frame on disk is untouched, one click away whole.
    return cell
  }

  // ── THE STORYLINE: one row per beat, three cells wide ────────────────────────────────────────
  // (the human, 2026-08-28) [ the drawn frame | the Given / When→Then | the beat's own proof ]. The
  // rows read top to bottom as the behaviour's story, so the picture, the sentence and the
  // photograph of it happening are read together. Given leads (phase 0); beat i draws the motion
  // from phase i to phase i+1 and shows the frames harvested around its assertion.
  //
  // THE PICTURE'S PROVENANCE (the human, 2026-08-31: "let user know if the schematic is not what
  // they want"). A reader looking at a picture beside a photograph deserves to know which KIND of
  // picture it is before they judge the comparison — and to be told, not to infer it. Two answers
  // since the SKETCH was retired (the human, 2026-09-05), and no third is invented:
  //   replica — the app's own markup, captured for the region the beat rang and re-rendered with
  //             the requirement's claims applied
  //   none    — nothing was harvested to picture, and the cell says so instead of guessing
  // (It used to answer `mirror` and `archetype` too — the drawn ui-mirror, retired 2026-09-03 by
  // the Expected View decision, and the archetype sketch, retired 2026-09-05. Neither is derived,
  // committed or baked any more, so an answer about one would be an answer about nothing.)
  function schemProv (hasReps) {
    if (hasReps) {
      return {
        kind: 'replica',
        mark: '▣',
        text: 'the app’s own markup, captured around the ring and re-rendered with the requirement’s claim applied'
      }
    }
    return { kind: 'none', mark: '◌', text: 'nothing harvested to picture yet' }
  }
  // does this requirement's harvest carry the app's own markup? (the same question buildStoryline
  // asks — stated once, here, so the ⋯ prompt and the reader can never disagree about which KIND of
  // picture the reader is looking at)
  function hasReplicas (r) {
    return ((r && r.ev && r.ev.beats) || []).some(function (b) {
      return !!(b && (b.replicaExpectedBefore || b.replicaExpectedAfter ||
        (b.values || []).some(function (x) { return x && x.replicaExpected })))
    })
  }
  function buildStoryline (r) {
    const wrap = document.createElement('div'); wrap.className = 'fstory'
    // THE SKETCH IS RETIRED (the human, 2026-09-05). A requirement with no harvest used to get a
    // drawing here — derived from its sentence, committed as spec/<screen>/viz/<id>.svg, split into
    // park points, optionally stood inside a sibling screen’s borrowed page and walked by a stepper
    // of its own. All of it is gone: such a row shows its Given/When→Then words beside an honest
    // "no Expected yet". The only picture beside a proof is the replica the app itself rendered.
    const beh = r.behHtml ? behParts(r.behHtml) : null
    const nbeats = beh ? beh.beats.length : 0
    const repStage = function (box, vp, label) {
      // the PAGE: the app's own viewport, at 100% of the cell, so the camera transform that frames
      // the photograph frames this identically (cameraView's maths assumes exactly this — the media
      // rendered at cell width, at the frame's own aspect)
      const page = document.createElement('div'); page.className = 'camsub reppage'
      page.style.aspectRatio = vp.vw + ' / ' + vp.vh
      // an iframe cannot size itself to its content, so the page-sized frame is scaled down to the
      // cell by the one ratio the camera also uses (cell width / viewport width)
      const scaler = document.createElement('div'); scaler.className = 'repscale'
      scaler.style.width = vp.vw + 'px'; scaler.style.height = vp.vh + 'px'
      const ifr = document.createElement('iframe'); ifr.className = 'repframe'
      ifr.setAttribute('sandbox', '')                 // no allow-* token at all: no script, no network, no origin
      ifr.setAttribute('title', 'Expected')
      ifr.setAttribute('aria-label', label)
      scaler.appendChild(ifr); page.appendChild(scaler); box.appendChild(page)
      const fit = function () {
        const w = page.clientWidth
        if (w > 0 && vp.vw > 0) scaler.style.transform = 'scale(' + (w / vp.vw) + ')'
      }
      fit()
      if (window.ResizeObserver) new ResizeObserver(fit).observe(page)
      return ifr
    }
    const replicaCell = function (shots, focus, vp, facesPath, layPath, momentCam) {
      const fr = document.createElement('div'); fr.className = 'sbframe sbrep'
      const box = document.createElement('div'); box.className = 'pcbox'
      const ifr = repStage(box, vp, 'the requirement, in the app’s own component')
      fr.appendChild(box)
      // ONE CAMERA, ONE RULE, BOTH CELLS (phase 4b): the Expected cell takes the moment camera
      // wherever its Actual does — same maths, same page coordinates, same chip box — and the older
      // beat camera on the context row, which frames the whole page on both sides.
      // ONE CAMERA ON A BEAT ROW, WHATEVER ITS MOMENT COUNT (final review R5, 2026-09-04): see
      // proofCell's single-shot branch, which used to take `aimCamera` (3.2×, pad 1.2) here while
      // this cell took `frameFor` (1.25×, pad .45) — two different regions in one row, and chips on
      // one side only. The whole-page Given/context rows still take the older beat camera.
      if (momentCam && focus) { aimFrame(box, vp); fr._chips = chipLayer(box, 'expected') } else aimCamera(box, focus, CAM)
      fr._camBox = box
      // the shared pieces of every moment's page: the screen's faces, and the beat's own shell plates.
      // The FACES are baked (the review's C2): an `about:srcdoc` document resolves a relative url
      // against the PARENT's base, so the sheet the board hands over is the one whose every url the
      // builder has already pointed at the dir it lives in — and it is here before the first paint,
      // so a replica never flashes its fallback stack on the way to its own type.
      const want = { faces: Promise.resolve((BD.faces || {})[facesPath] || ''), lay: repJson(layPath) }
      let cur = -1
      let seq = 0
      // AN HONEST BLANK, NEVER THE NEIGHBOUR'S PICTURE (the review's C3, 2026-09-04). A moment whose
      // harvest landed no replica — a byte budget, a timeout, a beat with no skeleton to gate
      // against — used to leave the LAST moment's srcdoc standing while the strip and the photograph
      // walked on, so the row showed two different moments of the beat and said it was showing one:
      // exactly the drift R19/R20 forbid. The cell now says what it does not have, for THIS moment,
      // and `data-repsrc` (the reader's own readout, and the seam the board's tests poll) says so too.
      // ONE PLACE THE PAGE IS SET, so the honest-blank and the real replica cannot drift apart in
      // how they hand the document over. (It also PUBLISHED the srcdoc for the loupe under the row
      // until 2026-09-04, when the human removed that row — "the row of loupe · the ringed element
      // is useless" — and the hook went with its one reader.)
      const show = function (doc) { ifr.srcdoc = doc }
      const blank = function (why) {
        fr.dataset.repsrc = ''
        fr.dataset.repside = ''
        fr.dataset.repbase = ''
        show(repSrcdoc({ body: '', faces: '', plates: [], region: null, ring: null, ok: true,
          vw: vp.vw, vh: vp.vh, note: why }))
      }
      const paint = function (j) {
        // THE GENERATION TOKEN IS TAKEN FIRST, ON EVERY PATH (final review R1, 2026-09-04). It was
        // bumped only where a fetch was about to start, so stepping to a moment with NO replica
        // invalidated nothing in flight: moment 0's fetch resolved after moment 1's honest blank had
        // painted, wrote moment 0's picture over it, and rewrote `data-repmoment` back to 0 — the
        // strip, the photograph and the chips on one moment, the Expected cell on another, and the
        // seam the board's own tests poll agreeing with the wrong one. Exactly the C3 regression the
        // comment above says it closed.
        const mine = ++seq
        const sh = shots[j]
        if (!sh || !sh.rep) { fr.dataset.repmoment = String(j); blank('no Expected for this moment'); return }
        Promise.all([repFetch(sh.rep), want.faces, want.lay]).then(function (got) {
          if (mine !== seq || !fr.isConnected) return    // a later step won the race, or the reader closed
          const body = repBody(got[0])
          if (!body) {
            fr.dataset.repmoment = String(j)
            fr.dataset.repgone = '1'
            blank('no Expected for this moment — the committed picture would not read')
            return
          }
          const region = repRect(got[0], 'data-replica-region')
          // WHAT THIS CELL SHOWS WITH NO BASE UNDER IT — a legacy harvest, a body-rooted moment
          // (which IS the whole page already), or a graft the base could not take. Exactly what this
          // row showed before phase 8: the moment's own replica on paper, with the shell plates the
          // beat's before skeleton measured. Never a blank for want of a base (rule 3).
          const paintLone = function () {
            show(repSrcdoc({
              body: body,
              faces: got[1] || '',
              plates: repPlates(got[2], region, vp.vw, vp.vh),
              region: region,
              ring: repRect(got[0], 'data-ring-box'),
              // the ring reddens where THIS moment failed — a value's own claim, or, on the beat's
              // result, any claim in its checklist that the app did not answer
              ok: !failedClaims(sh).length,
              vw: vp.vw, vh: vp.vh
            }))
            // …and it still NAMES the base when the picture it drew IS the base (a beat's opening
            // moment): the cell's readout says what it is showing, always.
            fr.dataset.repbase = (sh.base && sh.base === sh.rep) ? sh.base : ''
            // WHICH moment this cell is showing, said out loud on the cell (phase 4a): the reader's
            // own readout for a person, and the deterministic seam the board's own tests walk — the
            // path is the harvest's, so "both pictures move together" can be asserted against the
            // index rather than against a tween.
            fr.dataset.repside = sh.repSide
            fr.dataset.repsrc = sh.rep
            fr.dataset.repmoment = String(j)
          }
          // THE GRAFT (phase 8, 2026-09-05): the Expected of a moment is the beat's BASE — the whole
          // page as the beat found it — with this moment's PATCH standing where its own scene root
          // stands in it, and everything off that path faded as context. The patch records that path
          // itself (`data-replica-path`, A2) and its classes are namespaced by its moment (A1), so
          // the two files can share one document without restyling each other. A body-rooted patch
          // has no smaller scene to graft and is already the whole page — it paints alone.
          const path = repAttr(got[0], 'data-replica-path')
          if (!(sh.base && sh.repSide === 'expected' && path && window.SBGraft)) { paintLone(); return }
          repFetch(sh.base).then(function (baseText) {
            if (mine !== seq || !fr.isConnected) return
            const baseHtml = repBody(baseText)
            if (!baseHtml) { paintLone(); return }
            const p = new DOMParser().parseFromString(
              '<div id="b">' + baseHtml + '</div><div id="p">' + body + '</div>', 'text/html')
            const baseRoot = p.querySelector('#b > .rep')
            const patchRoot = p.querySelector('#p > .rep')
            const g = window.SBGraft.graft(baseRoot, patchRoot, path)
            // A REFUSED GRAFT IS NOT A BLANK ROW (rule 3): the base has moved past the path this
            // patch recorded, so the honest picture is the patch alone — and the cell says the
            // reason out loud rather than pretending it drew the page.
            if (!g.ok) { fr.dataset.repwhy = g.why; paintLone(); return }
            fr.dataset.repwhy = ''
            const styles = Array.prototype.map.call(p.querySelectorAll('style'), function (s) { return s.outerHTML }).join('')
            show(repSrcdoc({
              body: styles + baseRoot.outerHTML,
              faces: got[1] || '',
              // no shell plates: the base IS the shell, measured rather than blocked in
              plates: [],
              region: repRect(baseText, 'data-replica-region'),
              ring: repRect(got[0], 'data-ring-box'),
              ok: !failedClaims(sh).length,
              vw: vp.vw, vh: vp.vh
            }))
            fr.dataset.repbase = sh.base
            fr.dataset.repside = sh.repSide
            fr.dataset.repsrc = sh.rep
            fr.dataset.repmoment = String(j)
          })
        })
      }
      for (const sh of shots) if (sh.rep) repFetch(sh.rep)      // prefetch the row, once
      fr._step = function (j) { if (j === cur) return; cur = j; paint(j) }
      fr._aimScene = function (rect, card, animate) { box._aim(rect || null, card || null, animate) }
      fr._step(0)
      return fr
    }
    // THE VIEWPORT THE BEAT WAS MEASURED IN — the page the replica stands on. Baked per beat by
    // tools/build-board.mjs off the layout skeleton; a beat with none borrows the requirement's
    // other beats rather than inventing a viewport, because a replica at the wrong page size is a
    // picture of a different screen.
    const viewportOf = function (i) {
      const per = r.ev.beats || []
      const at = per.filter(function (b) { return Number(b.n) === (i || 1) })[0]
      const from = function (b) {
        if (b && b.vw > 0 && b.vh > 0) return { vw: b.vw, vh: b.vh }
        const f = b && (b.focus || b.aimAfter || b.aimBefore)
        return (f && f.vw > 0 && f.vh > 0) ? { vw: f.vw, vh: f.vh } : null
      }
      let vp = from(at)
      for (let k = 0; !vp && k < per.length; k++) vp = from(per[k])
      return vp
    }
    // the beat's own BEFORE skeleton — where the shell plates are measured from (the state the beat
    // opens in, which is the page the component sits on all through it)
    const beatLayout = function (i) {
      const b = (r.ev.beats || []).filter(function (x) { return Number(x.n) === (i || 1) })[0]
      return (b && (b.layoutBefore || b.layoutAfter)) || ''
    }
    // ONE ROW'S EXPECTED CELL, from the Actual cell beside it: the same ordered moments, so the two
    // are two renderings of one list. A row whose harvest carries no replica — and no viewport to
    // stand one on — says so out loud instead of showing a picture of something else.
    const expectedCell = function (pc, i, momentCam) {
      const shots = (pc && pc._shots) || []
      const vp = viewportOf(i)
      if (vp && shots.some(function (s) { return s.rep })) {
        return replicaCell(shots, beatFocus(r, i, nbeats), vp, r.ev.faces, beatLayout(i || 1), momentCam)
      }
      // …AND A HARVESTED REQUIREMENT'S EMPTY BEAT IS NOT A SKETCH (final review R3, 2026-09-04). This
      // fell through to the sketch cell, captioned "◇ sketch · no UI yet" — false on a requirement
      // whose other beats DID harvest UI — and that cell had no `_step`, no `_chips` and no
      // `_aimScene`, so it sat frozen while the photograph beside it panned and stepped. Where the
      // requirement has replicas anywhere, this beat gets the honest per-moment placeholder that
      // still walks and aims with the row. (The sketch itself is retired — the human, 2026-09-05.)
      if (vp && hasReps) return replicaCell(shots, beatFocus(r, i, nbeats), vp, r.ev.faces, beatLayout(i || 1), momentCam)
      // a replica that cannot be STOOD ON A PAGE — an older harvest that landed the markup but no
      // layout skeleton, so nothing knows the viewport it was measured in — is not a picture, and
      // the cell says the gap out loud rather than inventing a page size.
      return noCell(hasReps ? 'no Expected for this beat — re-harvest this screen' : 'no Expected yet — re-harvest this screen')
    }
    const noCell = function (why) {
      const cell = document.createElement('div'); cell.className = 'sbframe'
      const no = document.createElement('div'); no.className = 'noschem'; no.textContent = why
      cell.appendChild(no); return cell
    }
    const textCell = function (mark, wordsHtml) {
      const tx = document.createElement('div'); tx.className = 'sbtext'
      tx.innerHTML = mark + '<div class="sbwords">' + wordsHtml + '</div>'
      return tx
    }
    // ONE ORDER, BEHAVIOUR FIRST (the human, 2026-08-30). The words lead every row, then the drawing,
    // then the photograph — the sentence you are being asked to believe, then the two pictures of it.
    // The DOM order IS the visual order now: the CSS `order` shuffle the retired toggle needed is
    // gone with it, so a header can no longer end up over a column it does not name.
    //
    // THE TWO PICTURES ARE ONE THING (the human, 2026-09-02: "schematic and proof should share same
    // stepper"). They live together in `.pics` under the row's ONE `.mstrip`, because the strip
    // steps BOTH — a control that sat in the words' gutter (the 2026-09-01 `‹ n / N ›`) read as if
    // it belonged to the sentence and left the pictures looking like two independent players.
    // The row's grid is therefore [ words | right ], and `.pics` re-splits the right half into the
    // same two columns the header names, so each header label still starts over its own cell.
    const row = function (cls, frame, text, proof, strip) {
      const el = document.createElement('div'); el.className = 'sbrow' + (cls ? ' ' + cls : '')
      const right = document.createElement('div'); right.className = 'sbright'
      const pics = document.createElement('div'); pics.className = 'pics'
      pics.appendChild(frame); pics.appendChild(proof)
      if (strip) right.appendChild(strip)
      right.appendChild(pics)
      el.appendChild(text); el.appendChild(right)
      // the row's two containers, named — phase 5 hangs the difference marker inside .pics, which
      // is the seam between the two cells it spans
      el._pics = pics; el._right = right
      return el
    }
    // the column names, as a table header over the rows (the human, 2026-08-28) — the one row that
    // says what the three cells ARE. Small-caps mono like every other label in the system; it shares
    // the rows' grid (the two picture names nested in .sbhpair, exactly as .pics nests them) so each
    // name sits over its own column, and it folds away when the row stacks (a header over a single
    // stacked column labels nothing).
    const headRow = function () {
      const el = document.createElement('div'); el.className = 'sbhead'
      const pair = document.createElement('div'); pair.className = 'sbhpair'
      // EXPECTED · ACTUAL (the human, 2026-09-03 — the Expected View decision). The middle cell is no
      // longer a drawing of an intent: it is the requirement IN THE APP'S OWN COMPONENT, and the
      // right one is what the app really did. The old names said what the pictures were MADE of;
      // these say what they MEAN, which is the comparison a reader is actually making.
      ;[['behavior', 'what the requirement says'], ['expected', 'the requirement, in the app’s own component'], ['actual', 'what the app did']]
        .forEach(function (p, i) {
          const c = document.createElement('span'); c.className = 'sbhc'
          c.textContent = p[0]; c.title = p[1]
          ;(i === 0 ? el : pair).appendChild(c)
        })
      el.appendChild(pair)
      return el
    }

    // DOES THIS REQUIREMENT HAVE THE APP'S OWN PICTURE? (phase 4a.) One answer for the whole
    // storyline: where the harvest landed replicas the Expected cell IS the replica, and a row that
    // has none says so honestly rather than dropping back to a drawing of the same component —
    // two kinds of picture down one requirement is a comparison of nothing.
    const hasReps = hasReplicas(r)
    // THE FOUR WAYS THE EXPECTED PICTURE STOPS BEING TRUE (phase 4a), each its own line: the
    // requirement was reworded past the run that photographed it (the board's own Changed drift);
    // the APP moved — the harvest on disk no longer hashes to the pin the replica was gated
    // against; the in-page gate measured a GAP the picture never answered for (or was never gated
    // at all); or the capture ran out of BYTES and the picture is part of a component.
    const repWhy = (function () {
      if (!hasReps) return null
      const bs = r.ev.beats || []
      const anyVal = function (f) { return bs.some(function (b) { return (b.values || []).some(f) }) }
      return {
        text: r.status === 'changed',
        layout: bs.some(function (b) { return b && b.lstale === true }),
        gap: bs.some(function (b) { return b && b.replica && (b.replica.gaps > 0 || b.replica.gated === false) }) ||
          anyVal(function (x) { return x && x.replicaGaps > 0 }),
        trunc: bs.some(function (b) { return b && b.replica && b.replica.trunc === true })
      }
    })()
    const isStale = !!(repWhy && (repWhy.text || repWhy.layout || repWhy.gap || repWhy.trunc))
    wrap.className = 'fstory' + (isStale ? ' isstale' : '')
    wrap.style.setProperty('--spd', String(PLAY_SPD))
    const body = document.createElement('div'); body.className = 'sbwrap'
    body.appendChild(headRow())
    if (beh) {
      const noDraw = 'no Expected yet — re-harvest this screen'
      // the GIVEN row is the context row: whole page on BOTH sides (beatFocus returns none for it)
      const gpc = proofCell(r, 0, nbeats)
      const givenFrame = hasReps ? expectedCell(gpc, 0) : noCell(noDraw)
      body.appendChild(row('bgiven', givenFrame,
        textCell(markCol(0), sentence('sbgiven', beh.given ? beh.given.lab : 'Given', beh.given ? beh.given.txt : '', false)),
        gpc, null))
      beh.beats.forEach(function (bt, i) {
        // the row's WORDS: its numeral in the mark column, then the two sentences (the human,
        // 2026-09-02). No per-row keyboard hint — the reader's footer says it once ("the hint of
        // walk this beat… is repeating on every block, again please avoid duplicated things").
        const html = sentence('sbwhen', bt.when.lab, bt.when.txt, false) +
          (bt.then ? sentence('sbthen', bt.then.lab, bt.then.txt, true) : '')
        // the beat's Then, as PLAIN TEXT — the name of the row's last moment (its result), used by
        // the strip's final segment and by the closing frame's alt
        const thenTxt = bt.then ? textOf(bt.then.txt) : ''
        const vpRow = viewportOf(i + 1)
        // (the 4th argument was the DRAWING's callout-card boxes, read off the sketch's own svg so
        // both cells framed the same union. The sketch is retired — the human, 2026-09-05 — so the
        // camera has only the harvest's own cards to frame.)
        const pc = proofCell(r, i + 1, nbeats, null, thenTxt, vpRow)
        // THE EXPECTED CELL IS THE REPLICA (phase 4a) wherever the harvest landed one; a requirement
        // with no UI harvested yet says so honestly instead of showing a picture of something else.
        const fc = hasReps ? expectedCell(pc, i + 1, true) : noCell(noDraw)
        let rowStep = null
        let rowDriver = null            // the row's stepper as the strip's small interface
        if (hasReps) {
          // ONE STEPPER, TWO RENDERINGS. The row's proof loop is the clock; the Expected cell swaps
          // to the same moment's replica and pans to the same ring, so the two pictures can never
          // show different moments of the beat. A row with no proof loop (a single-frame beat) has
          // one moment on both sides and nothing to step. The AIMING and everything drawn over the
          // pictures is installed once the row exists (showMoment, below): the marker lives inside
          // .pics, so it cannot be built before the row it hangs in.
          rowDriver = pc._stepper ? proofDriver(pc._stepper) : null
          rowStep = pc._rowStep || null
        }
        if (!rowStep) rowStep = pc._rowStep || null   // a proof-only row (no pairing) still walks
        if (!rowDriver && pc._stepper) rowDriver = proofDriver(pc._stepper)
        // THE ROW'S ONE STEPPER, over the two pictures it steps (the human, 2026-09-02). Its segments
        // are the beat's MOMENTS: each value the test proved, named by the assertion the run recorded,
        // then the beat's result. A row the run recorded fewer names for than it has scenes pads
        // generically — there was no assertion to name those after, and inventing one would be a
        // caption over nothing.
        const moments = (pc._moments && pc._moments.length ? pc._moments.slice() : [])
        if (rowDriver) {
          for (let m = moments.length; m < rowDriver.count; m++) moments.push('scene ' + (m + 1))
          if (thenTxt && rowDriver.count > 0) moments[rowDriver.count - 1] = thenTxt
        }
        const tc = textCell(markCol(i + 1), html)
        // …and WHAT each moment proved, so the strip's tooltip can say both values beside the name
        // (the review's C1). Index-aligned with `moments` by construction — both come off the row's
        // one ordered list of shots — and short by however many scenes a drawing-only row padded.
        const proved = (pc._shots || []).map(function (s) { return { claim: s.claim, facts: s.facts } })
        const strip = rowDriver ? momentStrip(rowDriver, moments, proved) : null
        const rowEl = row(i === 0 ? '' : 'beatstart', fc, tc, pc, strip)
        // ── ONE MOMENT, EVERYWHERE ON THE ROW (design C, phases 4b + 5) ────────────────────────
        // A beat row shows ONE moment at a time, and everything on it is a rendering of that one
        // moment: the two pictures, the chip over each, the marker across their seam, and the
        // underline in the sentence. So there is ONE function that shows a
        // moment, and every mover — the loop, the strip, the keys — goes through it. Anything that
        // aimed or painted on its own is exactly how the halves of a row drift apart.
        if (hasReps) {
          const shots = pc._shots || []
          const diffs = vpRow ? diffLayer(rowEl._pics) : null
          if (diffs && pc._camBox) (pc._camBox._views = pc._camBox._views || []).push(function () { diffs._place() })
          // the sentence's own halves, kept as they were authored so each step re-renders from the
          // source rather than underlining on top of the last underline
          const said = [].slice.call(tc.querySelectorAll('.sbthen .sbv, .sbwhen .sbv'))
            .map(function (el) { return { el: el, html: el.innerHTML } })
          const showMoment = function (j, animate) {
            const m = shots[j] || null
            const mf = momentFrame(m, vpRow)
            if (pc._aimMoment) pc._aimMoment(mf.ring, mf.chip, animate)
            if (fc._aimScene) fc._aimScene(mf.ring, mf.chip, animate)
            if (pc._chips) pc._chips._paint(m, vpRow)
            if (fc._chips) fc._chips._paint(m, vpRow)
            // the row says whether the moment on show FAILED, so the underline in its sentence takes
            // the same iron-oxide the marker and the ring do — one moment, one reading, everywhere
            rowEl.classList.toggle('hasfail', failedClaims(m).length > 0)
            if (diffs) diffs._paint(m, pc._camBox, vpRow)
            // THE PROVED PHRASE. The Then is asked first — a claim is a fact about the beat's result,
            // and that is where the sentence usually says it; the When answers only where the Then
            // does not, which is the "you read the picker" case. Nothing matched underlines nothing.
            const claim = m ? (failedClaims(m)[0] || ((m.facts && m.facts[0]) || m.claim) || null) : null
            let hit = -1; let rng = null
            for (let k = 0; k < said.length && hit < 0; k++) {
              const got = claim ? window.SBWords.provedPhrase(said[k].el.textContent || '', claim) : null
              if (got) { hit = k; rng = got }
            }
            said.forEach(function (p, k) { underlineIn(p.el, p.html, k === hit ? rng : null) })
          }
          rowEl._showMoment = showMoment
          if (pc._stepper) {
            pc._stepper._onFrame = function (j) { if (fc._step) fc._step(j); showMoment(j, true) }
          }
          showMoment(pc._stepper ? pc._stepper._cur() : 0, false)
        }
        // the row's own strip and the ← → keys (targeting the SELECTED row) drive the walk; clicking
        // anywhere on the row SELECTS it (the human, 2026-09-02: "make clear which when/then is
        // selected"), so ← → then walk this beat and no other. Selection is additive — it never eats
        // a segment click or a proof-cell lightbox click bubbling up from inside.
        if (rowStep) {
          rowEl._rowStep = rowStep; rowEl.dataset.rowstep = '1'
          // the words are the row's own hit area, and the cursor says so (a per-row button would be N
          // buttons down the page). No repeated hint text — the footer carries the keys once.
          tc.title = 'click to select this When/Then'
          rowEl.addEventListener('click', function () {
            const rt = rowEl.closest('.fread'); if (rt) selectRow(rt, rowEl, false)
          })
        }
        body.appendChild(rowEl)
      })
    } else {
      // PROSE-ONLY: no Given/When→Then to split into beats, so the story is one row — the drawing if
      // there is one, the pointer to the text below, and whatever proof the requirement carries. The
      // evidence is not dropped just because the requirement was written as prose.
      const cellText = 'This requirement is written as prose — the full text reads below.'
      const ppc = proofCell(r, 0, 0)
      body.appendChild(row('bgiven',
        hasReps
          ? expectedCell(ppc, 0)
          : noCell('no Expected yet — re-harvest this screen'),
        textCell(markCol(0), '<p class="sbgiven"><span class="sbv">' + cellText + '</span></p>'),
        ppc, null))
    }
    // ONE BANNER, THREE REASONS (the human, 2026-09-02: "make sure the gap between schematic and
    // proof will not exist again"). A drawing stops being true three ways — the requirement is
    // REWORDED, the APP MOVES and the harvest beside it is newer than the picture, or the drawing
    // splits its beat into a different number of scenes than the harvest recorded — and more than one
    // can be true at once, so each says its own line instead of one standing in for the other. Same
    // quiet grey either way: it is a note about the drawing, never a verdict on the proof. (The
    // scene-count line is new with the one-stepper pass: that row's drawing is PARKED, not stepping,
    // and a reader deserves to be told why rather than to wonder at a still picture.)
    if (isStale) {
      const sn = document.createElement('div'); sn.className = 'sbstale'
      const head = []; const why = []
      // THE REPLICA'S OWN REASONS (phase 4a), and since the sketch was retired (the human,
      // 2026-09-05) the only ones: "behind the harvest" and "redrawn at the next fold" were a
      // DRAWING's complaints — about park points a drawing publishes and a derive that no longer
      // runs. A replica has no scenes of its own to fall behind with: it IS the moment's picture.
      if (repWhy.text) { head.push('text changed'); why.push('the requirement was reworded after this was harvested') }
      if (repWhy.layout) { head.push('layout moved'); why.push('the app’s layout moved since this picture was captured') }
      if (repWhy.gap) { head.push('replica gap'); why.push('the gate found something the harvest measured that this picture does not carry') }
      if (repWhy.trunc) { head.push('truncated'); why.push('the capture ran out of bytes — this is part of the component, not all of it') }
      sn.innerHTML = '<b>stale — ' + head.join(' · ') + '</b><span>' + why.join('; ') +
        ' — re-harvest this screen</span>'
      body.insertBefore(sn, body.firstChild)
    }
    wrap.appendChild(body)
    markDefaultBeat(wrap)          // the first steppable beat opens selected — ← → have a target at once
    onSpd(wrap, function (sp) { wrap.style.setProperty('--spd', String(sp)) })
    return wrap
  }

  // THE PROOF BAND IS GONE (the human, 2026-09-02: "remove the full flow video from focus mode"),
  // and so is the proof HEADER that briefly replaced it under the rows (the same day: the covering
  // test rides the TITLE ROW). buildMedia rendered the whole-requirement band beneath the beat rows —
  // the covering test's bar, a failing run's filmstrip, the pinned-era watermark and ONE full-width
  // video; the recording is the FLOW view's subject (board R13). What did NOT go: the honest word.
  // The title row's mark reads ✓ / ✗ / ◌ off the derived status, and where NO test covers the
  // requirement the row offers the one next move — this button, where Run would otherwise be.
  function writeTestBtn (dt, r) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn sm'
    // data-prompt marks the click as a sheet-OPENING one, so the prompt sheet's outside-click
    // closer does not shut it in the same bubble (the [data-log] pattern)
    btn.dataset.prompt = 'addtest'
    btn.textContent = '\uFF0B write the failing test'
    btn.addEventListener('click', function () { openAddTest(dt, [r.id]) })
    return btn
  }

  // A pager dot's STATE and TITLE derive from its baked requirement row (data-status, .rt) — called
  // by the Focus pager's render and again by syncDerived after a run, so a dot's hue is as fresh as
  // the row's chip without a rebuild. The state rides on data-status, which the CSS paints as the
  // dot's hue (R17, 2026-08-25 — the shoulder glyph is gone); the state's WORD is in the title, so
  // hue-never-alone is met one hover / keyboard-focus away.
  function dotMark (d, rr) {
    const st = rr.getAttribute('data-status') || 'untested'
    const ttlEl = rr.querySelector('.rt')
    d.setAttribute('data-status', st)
    d.title = rr.getAttribute('data-r') + ' — ' + (ttlEl ? ttlEl.textContent : '') + ' · ' + st.replace('-', ' ')
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
    // NO KEYBOARD HINT HERE (the human, 2026-09-02: "remove the short cut key hint in this page,
    // only mention in the setting page"). Task 8's `.fpk` line rode the pager since the mockup; the
    // keys it named are now listed ONCE, on the guide (#howview's Keyboard section) — the reader is
    // for reading, and a permanent legend on a page you look at every day is chrome. The keys
    // themselves are unchanged (buildFocus's onKey below).
    pager.appendChild(prev); pager.appendChild(dots); pager.appendChild(next)
    function render () {
      if (bodyRestore) { bodyRestore(); bodyRestore = null }   // reclaim the previous page's moved nodes
      const old = ov.querySelector('.fpage'); if (old) { stopSteppers(old); old.remove() }
      const r = reqInfo(reqs[cur])
      ov._curId = r.id        // so a loadRuns fold can reopen this reader on the SAME requirement
      // the counter leads with the requirement's FAMILY when the prd has them (board R17):
      // `<family> · n of N`; a screen with no families keeps the bare `n of N`
      const fb = focusBody(dt, r, { counter: (r.family ? r.family + ' · ' : '') + (cur + 1) + ' of ' + reqs.length })
      bodyRestore = fb.restore
      ov.appendChild(fb.page)

      prev.disabled = cur === 0; next.disabled = cur === reqs.length - 1
      dots.innerHTML = ''
      // THE PAGER IS THE MAP (board R17; the human 2026-08-23 merged the top "THE MAP" block and the
      // number row — two navigators over the same requirements): EVERY requirement is a dot (no
      // window, no ellipsis — a map that hides entries is not a map), grouped under its family with
      // the family's `<n> · <name>` label inline and a thin inert tick between families; each dot
      // WEARS the requirement's derived state as a hue (R17, 2026-08-25 — no shoulder glyph; the CSS
      // paints data-status) and exposes its id/title/state on hover / keyboard focus (a title attr +
      // the CSS bubble, where the state's word lives). A screen with no families renders the same bar
      // with no labels and no ticks.
      let group = null; let groupKey = null
      reqs.forEach(function (rr, i) {
        const fam = rr.getAttribute('data-fam') || ''
        if (!group || fam !== groupKey) {
          if (group) {
            const fg = document.createElement('span'); fg.className = 'fdotfam'; fg.setAttribute('aria-hidden', 'true')
            dots.appendChild(fg)
          }
          group = document.createElement('span'); group.className = 'ffam'
          if (fam) {
            group.setAttribute('data-fam', fam)
            const fl = document.createElement('span'); fl.className = 'ffl'
            const n = rr.getAttribute('data-famn') || ''
            if (n) fl.appendChild(document.createTextNode(n + ' · '))
            const b = document.createElement('b'); b.textContent = fam; fl.appendChild(b)
            group.appendChild(fl)
          }
          dots.appendChild(group); groupKey = fam
        }
        const d = document.createElement('button')
        d.className = 'fdot' + (i === cur ? ' cur' : '')
        d.setAttribute('data-r', rr.getAttribute('data-r') || '')
        // the dot shows the requirement's OWN id (board R17 / the human 2026-08-26), so the pager,
        // the header, the prd (## R10) and the test tag (checkReq('R10')) all speak one number — a
        // sequential 1..N position read as an id and clashed with the R-id it was next to
        d.appendChild(document.createTextNode(rr.getAttribute('data-r') || String(i + 1)))
        dotMark(d, rr)
        d.addEventListener('click', (function (idx) { return function () { cur = idx; render() } })(i))
        group.appendChild(d)
      })
      // the strip is ONE row (R17, 2026-08-25); when the families are too wide to fit (this board's
      // own labels are long) it scrolls, so keep the current dot in view — you always see where you
      // are. getBoundingClientRect forces the reflow, so the just-appended positions are real.
      const curd = dots.querySelector('.fdot.cur')
      if (curd && dots.scrollWidth > dots.clientWidth + 1) {
        const dr = dots.getBoundingClientRect(); const cr = curd.getBoundingClientRect()
        dots.scrollLeft += (cr.left - dr.left) - (dots.clientWidth - cr.width) / 2
      }
    }
    prev.addEventListener('click', function () { if (cur > 0) { cur--; render() } })
    next.addEventListener('click', function () { if (cur < reqs.length - 1) { cur++; render() } })
    // registered ONCE per reader and removed by closeFocus (ov._onKey) — fix round 1, A-4 — so a
    // loadRuns close-fold-reopen cycle never stacks listeners
    // THE READER'S KEYS, on two axes (the human, 2026-09-02). ← → walk the SELECTED beat's scenes
    // (readerStep flips a still-auto reader to step and moves only that row); ↑ ↓ select which
    // When/Then; PgUp / PgDn page to the previous / next requirement — the dedicated "change test
    // case" shortcut, so the scene arrows no longer double as the pager. Never while a field has the
    // caret (the board has a search box).
    const onKey = function (e) {
      if (dt.hidden || !ov.isConnected || !ov.offsetParent) return
      const a = document.activeElement
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return
      const fread = ov.querySelector('.fread')
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (readerStep(fread, e.key === 'ArrowLeft' ? -1 : 1)) e.preventDefault()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (selectBeat(fread, e.key === 'ArrowUp' ? -1 : 1)) e.preventDefault()
      } else if (e.key === 'PageDown') {
        if (cur < reqs.length - 1) { cur++; render(); e.preventDefault() }
      } else if (e.key === 'PageUp') {
        if (cur > 0) { cur--; render(); e.preventDefault() }
      }
    }
    ov._onKey = onKey
    document.addEventListener('keydown', onKey)
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
  // (board R13/#4; on the TITLE ROW since 2026-09-02), so `closest('.test')` finds nothing there —
  // fall back to the reading card's moved test node (.fread .feval .fev .test, a hidden holder),
  // which still carries the .tstlog / .tststeps slots the popups read.
  const ownerTest = el => el.closest('.test') ||
    (el.closest('.fread') ? el.closest('.fread').querySelector('.feval .fev .test') : null)
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

  // TWO homes for a run's record. A third — a GIT BRANCH of the app's own repo — was retired
  // 2026-09-06 (T16, decision A): a run record is a cache, and git keeps a cache forever. A config
  // still saying 'git' clamps to 'local' server-side (spec-store cleanConfig), which is why this
  // control needs no migration: it simply lights the first button.
  const storeHints = {
    local: 'Kept in this project’s data home (~/.specboard/<project>/), addressed by content and pruned with the run log — nothing leaves your machine and nothing is committed.',
    bucket: 'Each run\'s shots are PUT to this base URL (base/runId/name) and the board loads them from there, so they outlive the local prune. The endpoint must accept the PUT.'
  }
  function setStore (w) {
    const where = storeHints[w] ? w : 'local'
    for (const b of document.querySelectorAll('#initstore button')) b.classList.toggle('on', b.dataset.store === where)
    document.getElementById('initbucket').hidden = where !== 'bucket'
    document.getElementById('initstorehint').textContent = storeHints[where]
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
    // the panel is the moment to show it — but IN PLACE, keeping your reading position, never a full
    // reload that snaps the reader to the top (the human, 2026-09-02: "keep back to top … after i
    // closed the test"). The board already refreshed in place while the panel was open (R7); this
    // just makes closing it never undo that.
    if (runDone) reloadOrRefreshInPlace()
  })

  const runflag = document.getElementById('runflag')
  // IS A RUN LIVE (the human, 2026-09-02: "run all in background" reloaded the board over and over).
  // A run WRITES CONSTANTLY — the harvest files an evidence frame per assertion — and the watcher
  // turns each burst into a change event, so the board rebuilt itself every second or so for the
  // whole run: with a reader open that is a visible refresh, with none it was location.reload().
  // Nothing derived is trustworthy mid-run anyway (the fold lands at the END), so the change handler
  // is GATED on this flag and the board takes its ONE refresh once the run is done. Seeded by every
  // caller of setRunning — the SSE run events AND loadRuns' server-side answer — so a page opened
  // mid-run, or a run nobody clicked (watch mode), is gated exactly the same.
  let runLive = false
  // A run lights this chip. Watch mode starts runs nobody clicked, so the chip is also the way back
  // into a run that is streaming with the panel closed — clicking it opens the panel.
  const setRunning = on => { runflag.hidden = !on; runLive = !!on }
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
    const keepScroll = reopen ? readerScrollTop() : null   // don't snap the reader to the top on refresh
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
          // NOT `log`: that is the CASE's own log text, and the run-level one is a src (2026-09-06 —
          // spreading it over `log` put a blob address in every case's <pre> and the replica gate
          // caught it as moved text on board R10's own picture)
          if (rec[title].length < 10) rec[title].push({ ...r.shotsByTest[title], runId: r.runId, hasLog: !!r.hasLog, runLog: r.log || '' })
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
        // (the test's OWN strip keeps every recorded frame set. It is the ONLY surface for a run's
        // cut frames since the reader's proof band went — 2026-09-02; the newest-record-only rule
        // that stood beside it was the band's, and went with it.)
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
          // the whole log is a BLOB now (the data home, 2026-09-05/06) — the run record names its
          // src, and an older record that names none simply offers no link
          const whole = (h.runLog) ? ' · <a class="wholelog" href="/' + eh(h.runLog) +
            '" target="_blank" rel="noopener">whole run log ↗</a>' : ''
          return '<li><div class="lgh"><span class="mark ' + mark + '"></span>' +
            eh(when) + ' · ' + eh(took) + sha + whole + '</div><pre>' + eh(h.log) + '</pre></li>'
        }).join('')
        slot.innerHTML = '<details class="logbox"><summary>full log · last ' + hist.length +
          ' run' + (hist.length === 1 ? '' : 's') + '</summary><ol class="lghist">' + runs + '</ol></details>'
      }
    }
    // reopen the reader now that its borrowed node has been folded back into the pane. A NAVIGATION
    // DURING the fold supersedes the restore (2026-08-28): a deep-link landing between our close and
    // this reopen used to be yanked back to the pre-fold requirement (board R13's test caught it once
    // the per-beat fold grew slow enough to race). Reopen what is open NOW when something is — and
    // close it first, so it re-borrows its node from the pane the fold just refreshed.
    if (reopen && reopen.dt) {
      const ovNow = document.querySelector('.dt:not([hidden]) .focusov')
      const rowNow = ovNow ? null : document.querySelector('.dt:not([hidden]) .lst-card.open')
      const cur = ovNow ? { kind: 'focus', dt: ovNow.closest('.dt'), id: ovNow._curId }
        : rowNow ? { kind: 'list', dt: rowNow.closest('.dt'), id: rowNow.dataset.r } : reopen
      if (ovNow || rowNow) closeFocus()
      if (cur.kind === 'list') openListRow(cur.dt, cur.id)
      else if (cur.dt) setView(cur.dt, 'focus', cur.id)
      restoreReaderScroll(keepScroll)          // back to where you were reading, not the top
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
      // hashes, a fresh window); a reopened reader must never show stale media
      // data-ev-beats included (2026-08-28): the per-beat harvest is derived like the pair — a run
      // re-harvests every beat's frames/window/focus, and a reopened reader must never render the
      // previous run's beat cells over the new run's band.
      for (const a of ['data-beats', 'data-ev-beats', 'data-ev-before', 'data-ev-after', 'data-ev-window', 'data-ev-video', 'data-ev-vwin', 'data-ev-at']) {
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
    // the pager-map's marks (board R17) are the requirements' own — derived, so a run moves them:
    // re-derive each dot from its just-synced row (the Focus pager, when one is open)
    dt.querySelectorAll('.dtfoot .fdot[data-r]').forEach(function (d) {
      const rr = dt.querySelector('.reqpane .req[data-r="' + cssEsc(d.dataset.r) + '"]'); if (rr) dotMark(d, rr)
    })
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
    const keepScroll = ov ? readerScrollTop() : null   // keep your reading position across the refresh
    if (ov) closeFocus()
    await syncDerived(dt)
    await loadRuns()
    if (focusId != null) { setView(dt, 'focus', focusId); restoreReaderScroll(keepScroll) }
  }
  window.__refreshDerived = refreshAfterRun   // a seam so the board's own test can drive this deterministically
  // A finished run (or any on-disk change) must show WITHOUT losing your reading position (the human,
  // 2026-09-02: "keep back to top when running test, after i closed the test"). The two callers below
  // used location.reload(), which resets every scroll — the reader's .fscroll included — so restoring
  // the reader scroll in place could not survive it. When a reader is open (the Focus overlay, or the
  // List's open row), refresh IN PLACE instead (refreshAfterRun keeps its scroll, R7's own mechanism);
  // only a bare home / collapsed detail — nothing scrolled to lose — takes the full reload that a
  // structural change may still need.
  function reloadOrRefreshInPlace () {
    const reader = document.querySelector('.dt:not([hidden]) .focusov, .dt:not([hidden]) .gridview .lst-card.open')
    if (reader) refreshAfterRun(); else location.reload()
  }

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
    let img = e.target.closest('img')
    // …AND A CLICK ANYWHERE ON A PROOF PICTURE IS A CLICK ON THE PICTURE (2026-09-04). board R20:
    // "the whole screenshot one click away in the proof lightbox". The frame is under a camera and
    // now carries a CHIP over it — a real button, so a reader who clicks the middle of the cell can
    // land on the chip (or on the cell's own padding) and nothing opens, which reads as a dead
    // picture. Fall back to the frame the cell is SHOWING; a click inside the lightbox itself, or
    // on any other control, still means what it did.
    if (!img && !e.target.closest('.lb')) {
      const cell = e.target.closest('.pcplay')
      if (cell) img = cell.querySelector('.fsteps img.on') || cell.querySelector('.fsteps img')
    }
    if (!img || !img.src || img.closest('.lb')) return
    if (img.closest('#home .cshot')) return   // the home card's still opens the screen, not the zoom (Task 8)
    e.stopPropagation()
    openLb(img.src, img.alt || 'screenshot')
  })

  // …and the same reader keys drive a LIST open row (the human, 2026-08-30; 2026-09-02). The Focus
  // overlay handles its own arrows (buildFocus's onKey, which also pages the requirement on PgUp/Dn);
  // a List row is an accordion with no pager, so it gets the two beat axes only — ← → walk the
  // selected beat's scenes (readerStep flips a still-auto reader to step), ↑ ↓ pick the beat.
  document.addEventListener('keydown', e => {
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return
    const root = document.querySelector('.dt:not([hidden]) .gridview .lst-card.open .lst-body .fread')
    if (!root) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (readerStep(root, e.key === 'ArrowLeft' ? -1 : 1)) e.preventDefault()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (selectBeat(root, e.key === 'ArrowUp' ? -1 : 1)) e.preventDefault()
    }
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
  // A reload mid-run would kill the panel you are watching, so hold it until the run finishes —
  // and never self-navigate under automation, which does its own reloading.
  // DEBOUNCED: a test run, a crawl or a rapid series of edits writes MANY files in a burst, and
  // reloading on each one makes the board flicker as though it is refreshing forever (the reported
  // "infinite refresh"). Coalesce a burst into ONE reaction once the writes go quiet.
  let changePending = null
  // A finished run set this; the NEXT change (the board's rebuild landing) or a short fallback then
  // syncs the board's derived state in place. One-shot, so a run refreshes the board exactly once.
  let syncPending = false
  // …and the same one-shot for a run watched with the panel CLOSED (watch mode, or a run started
  // from another tab): the debounce alone reacted to every burst DURING the run, which is the
  // reload loop; now nothing reacts until the run is done and this arms the single refresh.
  let postPending = false
  const scheduleSync = () => { if (!syncPending) return; syncPending = false; refreshAfterRun() }
  const reactToChange = () => {
    changePending = null
    postPending = false          // the run's one refresh has landed; the fallback below is spent
    // The conflicts view keeps itself current and holds unsaved picks and a note field. A full
    // reload there would throw away a sentence you were half way through typing, so it refreshes
    // in place instead — the one view on the board that owns its own state.
    if (!document.getElementById('cfview').hidden) { loadConflicts(); return }
    // init holds a half-filled form too — refresh the found table in place, never reload it out
    if (!document.getElementById('initview').hidden) { loadCrawl(); return }
    // how-it-works only ever needs its project cards refreshed — a project added a skill, say — and
    // a full reload would drop you back on the board, so refresh in place like the other tool views
    if (!document.getElementById('howview').hidden) { loadHow(); return }
    // …and a screen detail with an OPEN READER refreshes in place too, so a background run's
    // change events never yank your reading position to the top (the human, 2026-09-02)
    reloadOrRefreshInPlace()
  }
  // ONE handler for every `change` the server streams — the file watcher's, and the board's own
  // rebuild landing after a run.
  const onLiveChange = () => {
    // THE RUN-LIVE GATE (the human, 2026-09-02: "run all in background" reloaded the board forever).
    // A run writes a file per assertion, so the burst never goes quiet and the debounce fired again
    // and again — a visible rebuild every second with a reader open. Nothing derived is settled until
    // the fold lands at the run's END anyway, so a live run rebuilds NOTHING; the done handler arms
    // the single refresh that follows it. Watch-mode runs emit the same run events, so they are
    // gated by the same flag.
    if (runLive) return
    // R7: an OPEN run panel is never RELOADED away — not while a run streams into it, and not once it
    // has finished. But a finished run DID change the derived state, so refresh it IN PLACE (records,
    // state chips, verdicts, the reader) without a reload; the panel and its log stay put.
    if (!panel.hidden) { scheduleSync(); return }
    clearTimeout(changePending)
    changePending = setTimeout(reactToChange, 800)
  }
  const onLiveRun = d => {
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
      // …and with the panel CLOSED, the same one-shot: the rebuild's own change event reacts (the
      // gate is open now), or this fallback asks for it if the rebuild wrote nothing we heard about.
      // Never under automation — that path can end in location.reload(), which aborts a driver's
      // navigation (the board's own spec drives the handlers directly instead).
      if (panel.hidden && !automation) {
        postPending = true
        setTimeout(function () { if (postPending && !changePending) onLiveChange() }, 1500)
      }
    }
  }
  // THE SEAM the board's own spec drives (dispatch R7): the SSE handlers themselves. The change
  // LISTENER is held back under automation — a self-reload aborts a Playwright navigation — so a
  // test that must prove what a change event does calls the handler, not the event.
  window.__live = { change: onLiveChange, run: onLiveRun, live: function () { return runLive } }
  try {
    const es = new EventSource('/api/live')
    es.addEventListener('change', () => { if (automation) return; onLiveChange() })
    es.addEventListener('run', e => onLiveRun(JSON.parse(e.data)))
  } catch (e) { /* served statically — no live reload, everything else still works */ }
