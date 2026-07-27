// Renders spec/<screen>/ into one self-contained board.html.
//
// Reading and state live in spec-store.mjs; this file only draws. The board inlines the SAME
// spec/_design.css the drafts link, and adds nothing but layout — it is one of the screens this
// tool tracks, so it has no business owning a second design system.

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROOT, CANVAS_W, CANVAS_H, esc, designCss, allScreens, sortedAreas, isWaiting, writeText
} from './spec-store.mjs'

// label · chip tone · mark shape. The mark is redundant with the tone on purpose: status has to
// survive greyscale and low vision, so hue is never the only thing carrying it.
const CHIP = {
  ok: ['approved', 'ok', 'dot'],
  review: ['needs review', 'rev', 'dot'],
  stale: ['PRD moved', 'stale', 'mark h'],
  rejected: ['you sent it back', 'bad', 'mark o'],
  missing: ['not started', 'gone', 'mark n'],
  waiting: ['waits', 'gone', 'mark n'],
  pass: ['pass', 'ok', 'dot'],
  fail: ['fail', 'bad', 'mark o'],
  unrun: ['never run', 'gone', 'mark o'],
  ranstale: ['passed, then you edited', 'stale', 'mark h'],
  // document mode. 'nodraft' is a NON-BLOCKING absence — an existing screen simply has no wireframe,
  // so it wears the neutral dashed 'gone' look, never a red/attention tone. 'current' is the live
  // screen in a screen cell with no gate B; a distinct muted 'live' tone so it never reads as an
  // approval (green) it did not earn — its proof is the test in column 4, not a human gate.
  nodraft: ['no wireframe', 'gone', 'mark n'],
  current: ['current screen', 'live', 'dot']
}

const chip = st => {
  const [label, tone, mark] = CHIP[st] || [st, 'gone', 'mark n']
  return `<span class="chip ${tone}"><span class="${mark}"></span>${label}</span>`
}

function cell (s, col, inner) {
  const st = s.cells[col]
  const tone = (CHIP[st] || [])[1] || 'gone'
  // Only the DRAFT cell is clickable, because gate A is the only gate that exists. A cell that
  // opens something unrelated to the column you clicked teaches you not to trust any of them.
  const act = col === 'draft' && ['stale', 'review', 'rejected'].includes(st)
  // The chip sits ABOVE the artwork, never on it. A status badge floating over a hi-fi draft
  // covers the part of the design it is making a claim about.
  return `<div class="cell c-${tone}${act ? ' act' : ''}" data-screen="${esc(s.name)}" data-col="${col}">
    <div class="cellh">${chip(st)}</div>
    <div class="cellb">${inner}</div>
  </div>`
}

const row = (s, i) => `
<div class="row" data-i="${i}" data-area="${esc(s.area)}"
     data-waiting="${isWaiting(s) ? 1 : 0}" data-started="${s.cells.draft === 'missing' ? 0 : 1}"
     data-q="${esc((s.title + ' ' + s.route + ' ' + s.reqs.map(r => r.title).join(' ')).toLowerCase())}">
  <div class="c1">
    <div class="nm">${esc(s.title)}${s.guess ? '<span class="chip stale gmark"><span class="mark h"></span>a guess</span>' : ''}</div>
    <div class="meta">${s.reqs.length} requirements${s.route ? ` · <code>${esc(s.route)}</code>` : ''}${s.guess ? ' · <span class="gdim">crawled — correct it</span>' : ''}</div>
    <ul class="reqs">${s.reqs.slice(0, 6).map(r => `<li><span class="rq">${esc(r.id)}</span><span class="rt">${esc(r.title)}</span></li>`).join('')}${s.reqs.length > 6 ? `<li class="more">+${s.reqs.length - 6} more</li>` : ''}</ul>
  </div>
  ${cell(s, 'draft', s.draftHtml
    ? `<div class="frame"><iframe scrolling="no" srcdoc="${esc(s.draftHtml)}"></iframe></div>`
    : s.cells.draft === 'nodraft'
      ? blank('no wireframe', 'this screen already exists — add one to redesign it')
      : '<span class="ph">no draft</span>')}
  ${cell(s, 'screen', s.hasShot
    ? `<div class="shot"><img src="spec/${esc(s.name)}/screen.png?h=${s.shotHash}" alt="${esc(s.title)} as built"></div>`
    : blank('not built', s.cells.draft === 'ok'
      ? 'ready to build — the design is approved'
      : 'waits for gate A'))}
  ${cell(s, 'e2e', ['pass', 'fail', 'ranstale'].includes(s.cells.e2e)
    ? `<div class="runs"><div class="runsh"><span class="tk ${s.cells.e2e}">${s.cells.e2e === 'fail' ? '✕' : s.cells.e2e === 'ranstale' ? '!' : '✓'}</span>
       <span class="ms">${s.run.total - s.run.failed} of ${s.run.total} passing${s.cells.e2e === 'ranstale' ? ' · stale' : ''}</span></div>
       <ul class="e2emini">${s.run.tests.map(t => `<li class="${t.ok ? 'p' : 'f'}"><span class="mark ${t.ok ? '' : 'o'}"></span><span class="tt">${esc(t.title)}</span></li>`).join('')}</ul></div>`
    : blank(s.cells.e2e === 'unrun' ? 'never run' : 'no test',
      s.cells.e2e === 'unrun' ? 'open it and press Run'
        : s.cells.screen === 'ok' || s.hasShot ? 'ready for a test'
          : 'waits for the screen'))}
</div>`

// An empty cell is half the board on a young project. Saying WHAT HAS TO HAPPEN FIRST turns that
// space into the answer to "so what do I do next" — the question an empty cell otherwise raises
// and refuses to answer.
const blank = (what, next) => `<div class="blank"><div class="b1">${what}</div>
  <div class="b2">${next}</div></div>`

// Only the requirements that MOVED, by default. Re-reading eight requirements to find the two
// that changed is precisely how a review queue stops getting opened — so when we know what moved,
// the rest starts collapsed and one click brings it back.
const prdFilter = s => {
  const d = s.diff
  if (!d) return ''
  const n = d.changed.length + d.added.length + d.removed.length
  if (!n) return ''
  return `<div class="seg pseg">
    <span data-v="changed" class="on">Changed ${n}</span><span data-v="all">All ${s.reqs.length}</span>
  </div>`
}

const para = t => t.split(/\n\s*\n/)
  .map(p => `<p>${esc(p.replace(/\n/g, ' ')).replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`).join('')

function prdBody (s) {
  const d = s.diff
  const mark = r => !d ? '' : d.added.includes(r.id) ? 'added' : d.changed.includes(r.id) ? 'moved' : ''
  // changed first, in their original order — you should not have to hunt down the page for them
  const ordered = d ? [...s.reqs].sort((a, b) => (mark(b) ? 1 : 0) - (mark(a) ? 1 : 0)) : s.reqs
  const arts = ordered.map(r => {
    const m = mark(r)
    const was = d && d.was[r.id]
    const title = was && was.title !== r.title
      ? `<del>${esc(was.title)}</del> <ins>${esc(r.title)}</ins>`
      : esc(r.title)
    return `<article class="${m}"${m ? '' : ' data-unchanged="1"'}>
      <h3><span class="rid">${esc(r.id)}</span><span>${title}</span>${m ? `<span class="chip ${m === 'added' ? 'rev' : 'stale'}">${m === 'added' ? 'new' : 'reworded'}</span>` : ''}</h3>
      ${para(r.body)}</article>`
  }).join('')
  const gone = d && d.removed.length
    ? `<article class="removed"><h3><span class="rid"></span><span>${d.removed.map(id => esc(id)).join(', ')} deleted since you approved this</span></h3></article>`
    : ''
  return arts + gone
}

// Column 4 in the detail view. The board could only ever say "7 of 7 passing", which asks you to
// trust a number — you could not read WHICH seven, when they ran, or what a failure actually said.
// The run controls shown wherever a screen can be run — the detail view now, not just the home
// header. Run, the same run held in the background, and watch (re-run this screen when its files
// change), so you are not sent back to the board to reach any of them.
const runControls = name => `<span class="runctl">
  <button class="btn sm runbtn" data-run="${esc(name)}">Run<span class="kbd">r</span></button>
  <button class="btn sm headed" data-run="${esc(name)}">Watch it run ↗</button>
  <button class="btn sm gh runbg" data-run="${esc(name)}"
    title="run without the panel — the header chip stays lit and tells you the result when it is done">Background</button>
  <label class="watchtog sm" title="re-run this screen whenever its files change">
    <input type="checkbox" class="dwatch"> re-run on save</label>
</span>`

function e2ePanel (s) {
  if (!s.run) {
    // A test that exists but has never run needs a way to BE run from here — otherwise the only
    // way to prove a fresh screen is the board-wide "Run all", and a per-screen Run that vanishes
    // exactly when there is nothing yet to show is the button you needed most.
    if (s.cells.e2e === 'unrun') {
      return `<div class="dtp">
        <div class="dtl dth2"><span class="lbl">4 · E2E</span>${chip(s.cells.e2e)}</div>
        <div class="runbar">${runControls(s.name)}</div>
        <div class="e2e"><div class="ph big">never run · <code>spec/${esc(s.name)}/test.spec.ts</code></div>
          <div class="runlog" data-screen="${esc(s.name)}"><div class="lbl">recent runs</div>
            <div class="runrows">loading…</div></div></div>
      </div>`
    }
    if (s.cells.e2e !== 'missing' && s.cells.e2e !== 'waiting') return ''
    return `<div class="dtp">
      <div class="dtl lbl">4 · E2E</div>
      <div class="ph big">no test yet · <code>spec/${esc(s.name)}/test.spec.ts</code></div>
    </div>`
  }
  const ranAt = new Date(s.run.ranAt).toISOString().replace('T', ' ').slice(0, 16)
  return `<div class="dtp">
    <div class="dtl dth2"><span class="lbl">4 · E2E</span>${chip(s.cells.e2e)}</div>
    <div class="runbar">${runControls(s.name)}</div>
    <div class="e2e">
      <div class="e2emeta">
        <span>last run <b>${ranAt}</b></span>
        <span class="tcnote">${s.run.total} test case${s.run.total === 1 ? '' : 's'} — each an independent check; a case may hold several steps</span>
        ${s.cells.e2e === 'ranstale' ? '<span class="warn">you have edited this screen since — run it again</span>' : ''}
        <div class="path"><code>spec/${esc(s.name)}/test.spec.ts</code></div>
      </div>
      ${s.run.tests.map(t => `<article class="tst ${t.ok ? 'p' : 'f'}" data-title="${esc(t.title)}">
        <div class="th"><span class="mark ${t.ok ? '' : 'o'}"></span>
          <span class="tt">${esc(t.title)}</span><span class="ms">${t.ms}ms</span>
          <span class="tacts">
            <button class="btn sm gh runone" data-run="${esc(s.name)}" data-grep="${esc(t.title)}"
              title="run only this test">Run</button>
            <button class="btn sm gh runone" data-run="${esc(s.name)}" data-grep="${esc(t.title)}"
              data-headed="1" title="watch only this test run in a browser">Watch ↗</button>
          </span></div>
        ${t.error ? `<pre class="terr">${esc(t.error)}</pre>` : ''}
        <div class="tststeps" data-title="${esc(t.title)}"></div>
        <div class="tstshots" data-title="${esc(t.title)}"></div>
      </article>`).join('')}
      <div class="runlog" data-screen="${esc(s.name)}">
        <div class="lbl">recent runs</div>
        <div class="runrows">loading…</div>
      </div>
    </div>
  </div>`
}

// Gate B: the approved design against what actually got built. It can only exist once a test has
// produced a screenshot — which is why column 3 is a byproduct of column 4 and never its own step.
function gateBBar (s) {
  const wrap = (cls, inner) => `<div class="gb ${cls}"><div class="gbin">${inner}</div></div>`
  const st = s.cells.screen
  if (st === 'ok') {
    return wrap('ok', `
      ${chip('ok')}
      <span class="gbn">built screen matches the approved design — pinned to <code>draft ${s.draftHash}</code></span>
      <span class="grow"></span>
      <button class="btn" data-act="unapprove" data-gate="screen" data-screen="${esc(s.name)}">Un-approve</button>`)
  }
  const why = st === 'stale'
    ? 'The design moved after you approved this screen.'
    : 'Nobody has checked the built screen against the design yet.'
  return wrap('open', `
    <span class="gbn" style="flex:none">${why}</span>
    <button class="btn ok" data-act="approve" data-gate="screen" data-screen="${esc(s.name)}">Matches the design</button>
    <span class="gor">or</span>
    <input class="why input" required
      placeholder="Which is wrong — the build or the design? One sentence.">
    <button class="btn no" data-act="reject" data-gate="screen" data-screen="${esc(s.name)}">Send it back<span class="kbd">↵</span></button>
    <span class="gbn" style="flex:none">pins <code>${s.draftHash}</code></span>`)
}

// Gate A lives in the detail view: PRD on the left, the draft on the right, approve underneath.
function gateBar (s) {
  const wrap = (cls, inner) => `<div class="gb ${cls}"><div class="gbin">${inner}</div></div>`
  const st = s.cells.draft
  // DOCUMENT mode: no wireframe, so no gate A on a draft and no gate B on a build. The PRD is the
  // source of truth, and the one decision is whether a crawled GUESS is accepted as canon. There is
  // no hash-pinning here — once accepted, editing the PRD makes the TEST stale, not this bar.
  if (st === 'nodraft') {
    if (s.guess) {
      return wrap('open', `
        <span class="gbn" style="flex:none">These requirements were read off the running app — a guess. Correct the PRD if it is wrong, then accept it as the source of truth.</span>
        <span class="grow"></span>
        <button class="btn ok" data-act="accept" data-gate="prd" data-screen="${esc(s.name)}">Accept these requirements</button>`)
    }
    return wrap('ok', `
      ${chip('ok')}
      <span class="gbn">requirements accepted — this screen is documented. Edit the PRD to change what it should do, and its test goes stale until you re-run it.</span>
      <span class="grow"></span>
      <button class="btn" data-dispatch="${esc(s.name)}">Add a wireframe to redesign →</button>`)
  }
  if (st === 'missing') return wrap('', '<span class="gbn">No draft yet — nothing to approve.</span>')
  if (st === 'ok') {
    // gate A is settled, so the open question moves downstream to gate B
    if (s.hasShot) return gateBBar(s)
    return wrap('ok', `
      ${chip('ok')}
      <span class="gbn">design approved against <code>prd.md · ${s.state.draftApprovedAgainstPrd}</code> — build the screen next</span>
      <span class="grow"></span>
      <button class="btn" data-act="unapprove" data-screen="${esc(s.name)}">Un-approve</button>`)
  }
  if (st === 'rejected') {
    // The sentence is the whole point of rejecting. Showing it back is what makes saying no feel
    // like a decision that landed rather than a button that did nothing visible.
    const why = s.rejections[s.rejections.length - 1].why
    const earlier = s.rejections.length - 1
    return wrap('bad', `
      ${chip('rejected')}
      <span class="gbw">${why ? esc(why) : 'No reason given.'}</span>
      ${earlier ? `<span class="gbn">+ ${earlier} earlier — all of them go to the redraft</span>` : ''}
      <span class="grow"></span>
      <span class="grow"></span>
      <button class="btn pri" data-dispatch="${esc(s.name)}">Redraft it →</button>
      <button class="btn" data-act="unreject" data-screen="${esc(s.name)}">Take it back</button>`)
  }
  const why = st === 'stale'
    ? 'The PRD moved after you approved this draft.'
    : 'Nobody has said yes to this draft yet.'
  // Two paths, in reading order, each ending in its own button. The reason field used to sit
  // AFTER the verdict buttons, so you typed into a box and then hunted backwards for the control
  // that sent it — which is where a half-written rejection gets abandoned.
  return wrap('open', `
    <span class="gbn" style="flex:none">${why}</span>
    <button class="btn ok" data-act="approve" data-screen="${esc(s.name)}">Looks right</button>
    <span class="gor">or</span>
    <input class="why input" required
      placeholder="Say what is wrong — one sentence, saved with the rejection">
    <button class="btn no" data-act="reject" data-screen="${esc(s.name)}">Send it back<span class="kbd">↵</span></button>
    <span class="gbn" style="flex:none">pins <code>${s.prdHash}</code></span>`)
}

export function build () {
  const screens = allScreens()
  const areas = sortedAreas(screens)
  const count = (col, ...states) => screens.filter(s => states.includes(s.cells[col])).length
  // The one number that says whether it is your turn: gates open, first looks and re-looks alike.
  const yourTurn = screens.filter(isWaiting).length

  const groups = areas.map(a => {
    const inArea = screens.map((s, i) => ({ s, i })).filter(x => x.s.area === a)
    const waiting = inArea.filter(x => isWaiting(x.s)).length
    return `
<section class="grp" data-area="${esc(a)}">
  <div class="grph">
    <button class="tw" aria-label="collapse">—</button>
    <h2>${esc(a)}</h2>
    <span class="gc">${inArea.length} screen${inArea.length === 1 ? '' : 's'}</span>
    ${waiting ? `<span class="gwait"><span class="dot"></span>${waiting} waiting</span>` : ''}
  </div>
  <div class="rows">${inArea.map(x => row(x.s, x.i)).join('')}</div>
</section>`
  }).join('')

  const detail = screens.map((s, i) => `
<section class="dt" data-i="${i}" hidden>
  <div class="dth">
    <h2>${esc(s.title)}</h2>
    ${chip(s.cells.draft)}
    <span class="gbn">${s.reqs.length} requirements · <code>spec/${esc(s.name)}/</code></span>
    <span class="grow"></span>
    ${s.draftHtml
      ? `<a class="btn" href="spec/${esc(s.name)}/draft.html" target="_blank">Open draft full size ↗</a>
    <button class="btn edit" data-path="spec/${esc(s.name)}/draft.html">Edit the draft</button>`
      : s.cells.draft === 'nodraft'
        ? `<button class="btn" data-dispatch="${esc(s.name)}">Add a wireframe to redesign →</button>`
        : ''}
    <button class="btn turn nextw" data-i="${i}">Next waiting →<span class="kbd">j</span></button>
    <button class="close btn">Close<span class="kbd">esc</span></button>
  </div>
  <div class="dtscroll">
    <div class="dtb">
      <div class="dtp">
        <div class="dtl lbl dth2">1 · PRD${prdFilter(s)}</div>
        <div class="prd">${prdBody(s)}</div>
      </div>
      <div class="dtp"><div class="dtl lbl">2 · Draft — click into it, it is a working prototype</div>${s.draftHtml
        ? `<div class="bigframe"><iframe srcdoc="${esc(s.draftHtml)}"></iframe></div>`
        : s.cells.draft === 'nodraft'
          ? `<div class="ph big" style="flex-direction:column;gap:var(--s3)">
              <div>no wireframe — this screen already exists</div>
              <button class="btn" data-dispatch="${esc(s.name)}">Add a wireframe to redesign →</button></div>`
          : '<div class="ph big">no draft yet</div>'}</div>
      ${s.hasShot ? `<div class="dtp">
        <div class="dtl lbl">3 · Screen — shot by the last test run</div>
        <div class="bigshot"><img src="spec/${esc(s.name)}/screen.png?h=${s.shotHash}" alt="${esc(s.title)} as built"></div>
      </div>` : ''}
      ${e2ePanel(s)}
    </div>
  </div>
  ${gateBar(s)}
</section>`).join('')

  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>specboard</title>
<style>${designCss()}</style>
<style>
  /* board layout only — every colour, size and space above comes from spec/_design.css */
  :root { --gcols:minmax(300px,1.15fr) 1fr 1fr 1fr; }
  /* Hide the whole wireframe column — a per-user board preference, remembered in localStorage.
     Column 2 carries data-col="draft" in both the sticky header and every row, so one selector
     drops it everywhere; the grid falls to three tracks so PRD, Screen and E2E stay aligned. */
  .hide-wf .colhs, .hide-wf .row { grid-template-columns:minmax(300px,1.5fr) 1fr 1fr; }
  .hide-wf [data-col="draft"] { display:none; }
  body { width:auto; }
  .wrap { max-width:1760px; margin:0 auto; padding:var(--s6) var(--s6) var(--s8); }
  .ph { font-size:var(--t-sm); color:var(--ink-4); }
  .ph.big { display:flex; align-items:center; justify-content:center; height:320px; }
  .shot { position:absolute; inset:0; overflow:hidden; background:var(--wash); }
  .shot img { width:100%; display:block; }
  .runs { align-self:stretch; width:100%; display:flex; flex-direction:column; gap:var(--s2);
    padding:var(--s2) var(--s3); overflow:hidden; }
  .runsh { display:flex; align-items:center; gap:var(--s2); flex:none; }
  .runs .tk { width:20px; height:20px; border-radius:50%; display:flex; align-items:center;
    justify-content:center; font-size:11px; flex:none; }
  .runs .tk.pass { background:var(--koke-tint); color:var(--koke); }
  .runs .tk.fail { background:var(--bengara-tint); color:var(--bengara); }
  .runs .tk.ranstale { background:var(--yamabuki-tint); color:var(--yamabuki); }
  .runs .ms { font-size:var(--t-xs); color:var(--ink-3); }
  /* the E2E cell shows WHAT was proven, not just a count — the same list the detail view opens,
     compact, so the home board answers "which behaviours are green" without a click */
  .e2emini { list-style:none; margin:0; padding:0; overflow:auto; flex:1; min-height:0; }
  .e2emini li { display:flex; align-items:baseline; gap:var(--s2); font-size:var(--t-xs);
    color:var(--ink-3); padding:2px 0; line-height:1.4; }
  .e2emini li .tt { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
  .e2emini li.p .mark { color:var(--koke); } .e2emini li.f .mark { color:var(--bengara); }
  .e2emini li .mark { position:relative; top:2px; flex:none; }
  .blank { text-align:center; padding:0 var(--s4); }
  .blank .b1 { font-size:var(--t-md); color:var(--ink-3); margin-bottom:5px; }
  .blank .b2 { font-size:var(--t-xs); color:var(--ink-4); }

  .stats { display:flex; align-items:baseline; padding-bottom:var(--s4);
    border-bottom:1px solid var(--hair); margin-bottom:var(--s2); }
  /* the stat NUMBERS align on their baseline (that is why .stats is baseline), but the controls on
     the right are boxes, not text — they line up on their centres, in their own group */
  .statsactions { display:flex; align-items:center; gap:var(--s3); align-self:center; }
  .none { display:none; padding:var(--s8) 0; text-align:center; color:var(--ink-4); font-size:var(--t-md); }
  .clear { display:flex; align-items:center; gap:var(--s3); background:var(--koke-tint);
    border:1px solid var(--koke-line); border-radius:var(--r-md); padding:var(--s3) var(--s4);
    margin-bottom:var(--s4); font-size:var(--t-sm); color:var(--koke); }
  .qwrap { position:relative; display:inline-flex; align-items:center; }
  .qx { position:absolute; right:6px; border:0; background:transparent; cursor:pointer;
    color:var(--ink-4); font-size:var(--t-sm); padding:2px 4px; line-height:1; display:none; }
  .qwrap.has .qx { display:block; }

  .colhs { display:grid; grid-template-columns:var(--gcols); gap:var(--s3);
    position:sticky; top:0; z-index:5; background:var(--canvas);
    padding:var(--s5) 0 var(--s2); }
  /* the columns ARE a sequence — PRD becomes a draft becomes a screen becomes a test — so the
     header says so with an arrow sitting in the gap to the next column */
  .colhs .lbl.flow { position:relative; }
  .colhs .lbl.flow:after { content:"→"; position:absolute; right:-13px; top:0;
    color:var(--ink-4); font-size:var(--t-sm); }

  .grp { margin-bottom:var(--s2); }
  .grph { display:flex; align-items:center; gap:var(--s3); padding:var(--s6) 0 var(--s3); }
  .gc { font-size:var(--t-sm); color:var(--ink-4); }
  /* a group count is a cue, not a badge — repeated once per area, a filled chip became noise */
  .gwait { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-sm); color:var(--ai); }
  .tw { border:0; background:transparent; color:var(--ink-4); cursor:pointer;
    font-size:var(--t-sm); padding:0; width:12px; line-height:1; }
  .grp.shut .rows { display:none; }
  .rows { display:flex; flex-direction:column; gap:var(--s3); }

  /* The four cells are ONE row and the eye must read them together — PRD, then wireframe, then
     screen, then test. The row is therefore a CARD that is always visible, not a hover effect: a
     grouping you can only see by pointing at it does not help you scan forty rows. The cells sit
     inside it on the same paper, so the band reads as one object; hover only deepens what is
     already there. The whole row is clickable, so there is no hunting for the one part that opens. */
  .row { display:grid; grid-template-columns:var(--gcols); gap:var(--s3);
    padding:var(--s3); margin:0 calc(var(--s3) * -1) var(--s2); border-radius:var(--r-md);
    background:var(--paper); box-shadow:inset 0 0 0 1px var(--hair);
    cursor:pointer; align-items:stretch;
    transition:box-shadow .12s, transform .12s; }
  .row:hover { box-shadow:inset 0 0 0 1px var(--hair-2), var(--sh-md); }
  /* on the row's own paper the cells no longer need a fill of their own — a box inside an
     identical box is the nested look that made four cells read as four separate cards */
  .row .cell, .row .c1 { background:transparent; }
  .row.gone { display:none; }
  .c1 { background:var(--paper); border:1px solid var(--hair); padding:var(--s4);
    border-radius:var(--r-md); cursor:pointer;
    transition:border-color .12s, box-shadow .12s, transform .12s; }
  /* the lift is the affordance — it is how a row says "this is a thing you can open" without
     needing a button drawn on it */
  .c1:hover { border-color:var(--hair-2); box-shadow:var(--sh-md); }
  .nm { font-size:var(--t-lg); letter-spacing:-.02em; }
  .meta { font-size:var(--t-sm); color:var(--ink-4); margin:2px 0 var(--s4); }
  .reqs { list-style:none; margin:0; padding:0; }
  .reqs li { display:flex; gap:var(--s2); font-size:var(--t-sm); color:var(--ink-2); padding:3px 0; }
  /* ellipsis on the TEXT, not the flex row — a flex item clips mid-word without it, which
     reads as a rendering fault rather than a deliberate truncation */
  .reqs li .rt { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
  .reqs li .rq { font-family:var(--mono); font-size:var(--t-micro); color:var(--ink-4);
    width:18px; flex:none; padding-top:2px; }
  .reqs .more { color:var(--ink-4); padding-left:26px; }

  .cell { border:1px solid var(--hair); background:var(--paper); border-radius:var(--r-md);
    min-height:var(--cellh,200px); overflow:hidden; display:flex; flex-direction:column;
    transition:border-color .12s, box-shadow .12s; }
  .cell.c-gone { background:transparent; border-style:dashed; }
  .cell.c-rev { border-color:var(--ai-line); }
  .cell.c-stale { border-color:var(--bengara-line); }
  /* document mode: the current screen sits in a normal solid cell (it is real content, not an
     absence), and its chip is a muted 'live' tone — present, but never the green of an approval. */
  .chip.live { background:var(--wash); color:var(--ink-3); }
  .chip.live .dot { background:var(--ink-3); }
  .cell.act { cursor:pointer; }
  .cell.act:hover { border-color:var(--ink); box-shadow:var(--sh-md); }
  .cellh { flex:none; padding:var(--s2) var(--s2) 7px; }
  .cellb { position:relative; flex:1; overflow:hidden; display:flex;
    align-items:center; justify-content:center; }
  .frame { position:relative; width:100%; overflow:hidden; }
  /* A thumbnail is a picture of a screen, not the screen. Live controls inside a 26%-scale
     preview means clicking a row lands on some button in the prototype instead of opening the
     row — the prototype is interactive in the detail view, where it is legible enough to use. */
  .frame iframe { width:${CANVAS_W}px; border:0; transform-origin:top left; display:block;
    pointer-events:none; }
  /* a cut-off thumbnail says so — a hard edge reads as "that was the end of the screen" */
  .frame.cropped:after { content:""; position:absolute; left:0; right:0; bottom:0; height:40px;
    background:linear-gradient(rgba(253,252,249,0), var(--paper)); }
  .frame.cropped:before { content:"continues"; position:absolute; right:var(--s2); bottom:3px;
    z-index:2; font-size:var(--t-micro); letter-spacing:.14em; text-transform:uppercase;
    color:var(--ink-4); }

  /* Header, body, footer — a real app layout. The gate bar used to be sticky INSIDE the scroll,
     so it floated over the requirement text behind it and read as a broken row. A verdict bar
     belongs to the window, not to the document it is scrolling past. */
  .dt { position:fixed; inset:0; background:var(--canvas); z-index:20;
    display:flex; flex-direction:column; }
  /* An author display declaration beats the hidden attribute's UA display:none. Without this
     every detail view renders at once, stacked, and you see whichever is last in the DOM — which
     looks like the router picking the wrong screen rather than none of them being hidden. */
  .dt[hidden] { display:none; }
  .dth { flex:none; display:flex; align-items:center; gap:var(--s3);
    width:100%; max-width:1760px; margin:0 auto; padding:var(--s4) var(--s6);
    border-bottom:1px solid var(--hair); background:var(--paper); }
  /* Each column scrolls on its own. The PRD is a long read; the draft and the screen are single
     images. Scrolling them as one block meant reading requirement six scrolled both pictures off
     the screen — so the one comparison the whole view exists for became impossible to hold. */
  /* ONE scroller for the whole detail view. Four independently scrolling panels meant the wheel
     only worked while the pointer sat over the exact column you wanted — and over the draft it
     scrolled the prototype's own document instead of the page. Each panel now sizes to its
     content and the view scrolls as a page, which is what every hand reaches for. */
  .dtscroll { flex:1; overflow:auto; padding:var(--s5) var(--s6) var(--s5); }
  .dtb { display:grid; grid-template-columns:minmax(320px,1fr) 1.35fr; gap:var(--s5);
    max-width:1760px; margin:0 auto; align-items:start; }
  .dtb:has(> :nth-child(3)) { grid-template-columns:minmax(260px,.85fr) 1.1fr 1.1fr; }
  /* the E2E column carries a control row (Run · Background · watch) and a test list, so it earns
     more width than the other three when all four are present */
  .dtb:has(> :nth-child(4)) { grid-template-columns:minmax(220px,.72fr) .95fr .95fr minmax(330px,1.05fr); }
  .dtp { display:flex; flex-direction:column; min-height:0; }
  .dtp > .dtl { flex:none; }
  /* content-sized, not scroll-boxed — the page scroller above owns the scrolling now */
  .dtp > .prd, .dtp > .bigframe, .dtp > .bigshot, .dtp > .e2e { overflow:visible; flex:none; }
  .bigshot { background:var(--wash); }
  .bigshot img { width:100%; display:block; }

  /* the run controls get their own row under the E2E label — a narrow column cannot hold Run,
     Background and watch on the same line as a heading without wrapping into a mess */
  .runbar { display:flex; padding:var(--s2) var(--s4); border-bottom:1px solid var(--hair);
    background:var(--paper); }
  .runctl { display:flex; align-items:center; gap:var(--s3); flex-wrap:wrap;
    text-transform:none; letter-spacing:normal; }
  .watchtog.sm { font-size:var(--t-xs); text-transform:none; letter-spacing:normal; }
  .dth2 { flex-wrap:nowrap; }
  .dth2 .lbl { flex:none; white-space:nowrap; }
  .e2e { padding:var(--s3) var(--s4) var(--s4); }
  .e2emeta { font-size:var(--t-sm); color:var(--ink-4); padding-bottom:var(--s3);
    border-bottom:1px solid var(--hair); margin-bottom:var(--s2); display:flex;
    flex-direction:column; gap:3px; }
  .e2emeta b { color:var(--ink-2); font-weight:400; }
  .e2emeta .warn { color:var(--bengara); }
  .tst { padding:var(--s3) 0; border-bottom:1px solid var(--hair); }
  .tst:last-child { border-bottom:0; }
  .tst .th { display:flex; align-items:baseline; gap:var(--s2); }
  .tst .mark { position:relative; top:1px; }
  .tst.p .mark { color:var(--koke); } .tst.f .mark { color:var(--bengara); }
  .tst .tt { flex:1; font-size:var(--t-sm); color:var(--ink-2); }
  .tst .ms { font-size:var(--t-micro); color:var(--ink-4); font-family:var(--mono); }
  .tcnote { color:var(--ink-4); }
  /* the detail steps of a case — every action and check, collapsed behind a toggle */
  .tststeps { margin:var(--s2) 0 0 14px; }
  .tststeps:empty { display:none; }
  .stepstog { border:0; background:transparent; cursor:pointer; padding:0;
    font:var(--t-xs)/1.4 var(--sans); color:var(--ink-4); }
  .stepstog:hover { color:var(--ink-2); }
  .stepslist { list-style:none; margin:var(--s2) 0 0; padding:0; }
  /* the humanised step reads as a sentence; a leading tick marks a check, a dot marks an action,
     and a named step (the author's own words) stands out as the beat it is */
  .stepslist li { font-size:var(--t-xs); color:var(--ink-3); padding:2px 0; line-height:1.5; }
  .stepslist li:before { display:inline-block; width:14px; color:var(--ink-4); }
  .stepslist li.scat-pwapi:before { content:"·"; }
  .stepslist li.scat-expect { color:var(--koke); }
  .stepslist li.scat-expect:before { content:"✓"; color:var(--koke); }
  .stepslist li.scat-teststep { color:var(--ink); margin-top:var(--s2); }
  .stepslist li.scat-teststep:before { content:"▸"; color:var(--ai); }
  .stepslist li.sf { color:var(--bengara); }
  .stepslist li.sf:before { content:"✕"; color:var(--bengara); }
  .terr { margin:var(--s2) 0 0 14px; padding:var(--s2) var(--s3); background:var(--bengara-tint);
    font:var(--t-xs)/1.6 var(--mono); color:var(--bengara); white-space:pre-wrap; overflow-x:auto; }
  .dtp { background:var(--paper); border:1px solid var(--hair); overflow:hidden;
    border-radius:var(--r-md); }
  .dtl { padding:var(--s3) var(--s4); border-bottom:1px solid var(--hair); }
  .prd { padding:0 var(--s5) var(--s4); }
  .prd article { padding:var(--s4) 0; border-bottom:1px solid var(--hair); }
  .prd article:last-child { border-bottom:0; }
  .prd article.moved, .prd article.added { background:var(--bengara-tint); margin:0 calc(var(--s5) * -1);
    padding:var(--s4) var(--s5); border-left:3px solid var(--bengara-line); }
  .prd article.added { background:var(--ai-tint); border-left-color:var(--ai-line); }
  .prd article.removed { color:var(--ink-4); font-size:var(--t-sm); }
  .prd h3 { display:flex; gap:var(--s2); margin:0 0 var(--s2); align-items:baseline; }
  .prd h3 .chip { margin-left:auto; }
  .dth2 { display:flex; align-items:center; gap:var(--s3); }
  .pseg { margin-left:auto; }
  .pseg span { padding:3px var(--s2); font-size:var(--t-xs); }
  .rid { font-family:var(--mono); font-size:var(--t-micro); color:var(--ink-4);
    width:20px; flex:none; padding-top:3px; }
  .prd p { margin:0 0 var(--s2) 28px; font-size:var(--t-sm); line-height:1.75; color:var(--ink-2); }
  .prd em { color:var(--ink-4); font-style:normal; font-size:var(--t-xs); }
  .bigframe { overflow:hidden; position:relative; }
  .bigframe iframe { width:${CANVAS_W}px; height:${CANVAS_H}px; border:0; transform-origin:top left; }

  /* The verdict must never be below the fold. A gate whose buttons you have to go looking for
     is a gate that gets skipped, and skipping it is the failure this product exists to prevent. */
  .gb { flex:none; display:flex; align-items:center; gap:var(--s3);
    background:var(--paper); border-top:1px solid var(--hair);
    padding:var(--s3) var(--s6); box-shadow:var(--sh-md); }
  .gb > * { max-width:100%; }
  .gbin { display:flex; align-items:center; gap:var(--s3); width:100%;
    max-width:1760px; margin:0 auto; }
  .gb.open { border-top:2px solid var(--ai); }
  .gb.ok { border-top:2px solid var(--koke); }
  .gb.bad { border-top:2px solid var(--bengara); background:var(--bengara-tint); }
  .gbn { font-size:var(--t-sm); color:var(--ink-4); }
  .gbw { font-size:var(--t-md); color:var(--bengara); }
  .why { flex:1; min-width:220px; }
  .gor { font-size:var(--t-sm); color:var(--ink-4); flex:none; }
  .kbd { font-family:var(--mono); font-size:var(--t-micro); color:var(--ink-4);
    border:1px solid var(--hair); border-radius:3px; padding:1px 4px; margin-left:7px; }
  /* a shortcut hint has to be legible on whatever the button is painted — inherit, don't guess */
  .btn .kbd { color:inherit; border-color:currentColor; opacity:.5; }
  /* every image is clickable — thumbnails render at a fraction of real size, and gate B's
     question cannot honestly be answered from a thumbnail */
  img { cursor:zoom-in; }
  .lb { position:fixed; inset:0; z-index:80; background:rgba(28,27,24,.86);
    display:flex; flex-direction:column; }
  .lb[hidden] { display:none; }
  .lbbar { flex:none; display:flex; align-items:center; gap:var(--s3);
    padding:var(--s3) var(--s5); border-bottom:1px solid rgba(255,255,255,.14); }
  .lbcap { color:#f4f1ea; font-size:var(--t-sm); }
  .lbbar .btn { background:transparent; border-color:rgba(255,255,255,.35); color:#f4f1ea; }
  .lbbar .btn:hover { border-color:#f4f1ea; }
  .lbstage { flex:1; overflow:auto; display:flex; align-items:flex-start;
    justify-content:center; padding:var(--s5); cursor:zoom-out; }
  .lbstage img { max-width:100%; max-height:100%; object-fit:contain;
    background:var(--paper); box-shadow:var(--sh-lg); }
  .lbstage.actual { align-items:flex-start; }
  .lbstage.actual img { max-width:none; max-height:none; }

  .runpanel { position:fixed; right:var(--s5); bottom:var(--s5); z-index:70; width:600px;
    max-width:calc(100vw - 48px); background:var(--paper); border:1px solid var(--hair-2);
    border-radius:var(--r-lg); box-shadow:var(--sh-lg); overflow:hidden; }
  .runpanel[hidden] { display:none; }
  .rph { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4);
    border-bottom:1px solid var(--hair); font-size:var(--t-sm); }
  .rplog { margin:0; padding:var(--s3) var(--s4); height:260px; overflow:auto;
    font:var(--t-xs)/1.75 var(--mono); color:var(--ink-2); background:var(--canvas);
    white-space:pre-wrap; }
  .runlog { margin-top:var(--s4); padding-top:var(--s3); border-top:1px solid var(--hair); }
  .runrow { display:flex; align-items:center; gap:var(--s2); padding:4px 0;
    font-size:var(--t-xs); color:var(--ink-3); font-family:var(--mono); }
  .runrow .rr-s { color:var(--ink-4); }
  .runrow .ms { margin-left:auto; color:var(--ink-4); }
  .runrow .rr-arch { color:var(--ink-4); font-family:var(--mono); font-size:var(--t-micro); }
  /* what THIS test saw — its own shots, under its own row, each zoomable */
  .tstshots { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:var(--s2) 0 0 14px; }
  .tstshots:empty { display:none; }
  .tstshots img { width:76px; height:48px; object-fit:cover; object-position:top left;
    border:1px solid var(--hair-2); border-radius:var(--r-sm); background:var(--wash); display:block; }
  .tstshots img:hover { border-color:var(--ink); }
  .tstshots .recvid { font-size:var(--t-micro); font-family:var(--mono); color:var(--ink-3);
    text-decoration:none; border:1px solid var(--hair); border-radius:var(--r-sm); padding:3px 6px; }
  .tstshots .recvid:hover { border-color:var(--ink); color:var(--ink); }
  /* per-test run controls appear on the row you are pointing at, so five tests do not become ten
     competing buttons */
  .tacts { display:inline-flex; gap:4px; margin-left:var(--s2); opacity:0; transition:opacity .12s; }
  .tst:hover .tacts, .tst:focus-within .tacts { opacity:1; }
  .watchtog { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-sm);
    color:var(--ink-3); cursor:pointer; }
  .watchtog input { accent-color:var(--ai); width:13px; height:13px; }
  .toast { position:fixed; left:50%; bottom:var(--s5); transform:translateX(-50%); z-index:60;
    background:var(--ink); color:var(--paper); padding:var(--s3) var(--s4);
    font-size:var(--t-sm); max-width:70vw; border-radius:var(--r); box-shadow:var(--sh-lg); }
  .kbd { border-radius:3px; }
  /* the sticky column header only earns a shadow once content is actually running under it */
  .colhs.stuck { box-shadow:var(--sh-sm); }

  /* conflicts ------------------------------------------------------------
     Two columns of equal weight, because the question is which of two sentences wins. Anything
     that made one side look primary — order, size, a default selection — would be the tool
     quietly picking, which is the one thing R3 forbids it to do. */
  .cfscroll { overflow:auto; }
  .cfwrap { max-width:1100px; margin:0 auto; }
  .cfhd { display:flex; align-items:baseline; gap:var(--s3); padding-bottom:var(--s4); }
  .cfn { margin-left:6px; }
  .cf { background:var(--paper); border:1px solid var(--bengara-line);
    border-radius:var(--r-md); overflow:hidden; margin-bottom:var(--s4); }
  .cf > header { display:flex; align-items:center; gap:var(--s3); background:var(--wash);
    padding:var(--s3) var(--s4); border-bottom:1px solid var(--hair); }
  .cf .sub { font-size:var(--t-lg); letter-spacing:-.02em; }
  .cf .imp { font-size:var(--t-xs); color:var(--ink-4); }
  .two { display:grid; grid-template-columns:1fr 1fr; }
  .side { padding:var(--s4) var(--s5); cursor:pointer; transition:background .12s; }
  .side + .side { border-left:1px solid var(--hair); }
  .side:hover { background:var(--canvas); }
  .side.picked, .side.picked:hover { background:var(--ai-tint); }
  .side .src { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink-3);
    margin-bottom:var(--s2); }
  .side .quote { font-size:var(--t-md); line-height:1.7; color:var(--ink); margin:0 0 var(--s3); }
  .side .pick { display:flex; align-items:center; gap:var(--s2); font-size:var(--t-sm);
    color:var(--ink-3); }
  .side.picked .pick { color:var(--ai); }
  .cfoot { display:flex; align-items:center; gap:var(--s3);
    padding:var(--s3) var(--s4); border-top:1px solid var(--hair); }
  .cfoot .note { flex:1; }
  .srows { background:var(--paper); border:1px solid var(--hair); border-radius:var(--r-md); }
  .srow { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4);
    border-top:1px solid var(--hair); font-size:var(--t-sm); color:var(--ink-3); }
  .srow:first-child { border-top:0; }
  .srow .w { color:var(--ink); }
  .cfempty { text-align:center; padding:var(--s8) var(--s4); color:var(--ink-3);
    font-size:var(--t-md); line-height:1.9; }
  .gmark { margin-left:var(--s2); vertical-align:middle; }
  .gdim { color:var(--bengara); }

  /* init ----------------------------------------------------------------- */
  .initwrap { max-width:1120px; margin:0 auto; display:grid;
    grid-template-columns:minmax(360px,440px) 1fr; gap:var(--s5); align-items:start; }
  .initcol .fld { margin-bottom:var(--s4); }
  .initcol .fld:last-child { margin-bottom:0; }
  .initcol .fld .l { font-size:var(--t-md); margin-bottom:var(--s2); display:flex; gap:var(--s2); align-items:baseline; }
  .initcol .fld .h { font-size:var(--t-xs); color:var(--ink-4); margin-top:var(--s2); }
  .initcol .fld .h.warn { color:var(--bengara); }
  .initcol textarea.input { resize:vertical; font-family:var(--mono); line-height:1.6; }
  .initfoot { display:flex; align-items:center; gap:var(--s3); margin-top:var(--s4); }
  .initnote { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4);
    border-top:1px solid var(--hair); }
  .frow { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4);
    border-top:1px solid var(--hair); font-size:var(--t-sm); }
  .frow:first-child { border-top:0; }
  .frow .fthumb { width:60px; height:40px; flex:none; border:1px solid var(--hair-2);
    border-radius:var(--r-sm); background:var(--wash); overflow:hidden; }
  .frow .fthumb img { width:100%; display:block; }
  .frow .frt { font-family:var(--mono); font-size:var(--t-sm); }
  .frow .fname { color:var(--ink-4); font-size:var(--t-xs); }
  .frow .fst { margin-left:auto; color:var(--ink-4); font-size:var(--t-xs); }
</style>

<div class="top">
  <div class="brand"><span class="logo"></span>specboard</div>
  <span class="crumb">specboard · dogfooding itself</span>
  <span class="grow"></span>
  <div class="seg" id="filt">
    <button data-f="all" class="on">All</button>
    <button data-f="waiting">Waiting on you</button>
    <button data-f="new">Not started</button>
  </div>
  <span class="qwrap"><input id="q" class="input" style="width:250px"
    placeholder="Search screens and requirements"><button class="qx" id="qx" aria-label="clear">✕</button></span>
  <span id="shown" class="gbn" style="min-width:64px"></span>
  <button class="btn sm" id="cfbtn">Conflicts<span class="chip stale cfn" id="cfcount" hidden></span></button>
  <button class="btn sm" id="initbtn">Set up</button>
</div>

<div class="wrap">
  ${yourTurn === 0 && screens.length ? `<div class="clear">
    <span class="chip ok"><span class="dot"></span>queue clear</span>
    Nothing is waiting on you.
    ${count('screen', 'missing') ? `${count('screen', 'missing')} screen${count('screen', 'missing') === 1 ? '' : 's'} still to build.` : ''}
    ${count('e2e', 'ranstale') ? `${count('e2e', 'ranstale')} test result${count('e2e', 'ranstale') === 1 ? '' : 's'} predate your latest edit — <code>npm run e2e</code>.` : ''}
    ${!count('screen', 'missing') && !count('e2e', 'ranstale') ? 'Every screen is built, approved and proven.' : ''}
  </div>` : ''}
  <div class="stats">
    <span class="stat"><b>${screens.length}</b> screens</span>
    <span class="stat"><b>${count('draft', 'ok', 'stale', 'review')}</b> drafted</span>
    <span class="stat"><b>${count('screen', 'ok', 'stale', 'review')}</b> built</span>
    <span class="stat"><b>${count('e2e', 'pass')}</b> tested</span>
    <span class="stat hot"><b>${yourTurn}</b> waiting on you</span>
    <span class="grow"></span>
    <div class="statsactions">
      <span class="chip run" id="runflag" hidden><span class="dot"></span>running — click to watch</span>
      <button class="btn sm" id="runall">Run all tests</button>
      <label class="watchtog"><input type="checkbox" id="watch"> watch</label>
      <button class="btn sm gh" id="wftoggle">Hide wireframes</button>
      <button class="btn sm gh" id="toggle-all">Collapse all</button>
    </div>
  </div>

  <div class="colhs">
    <div class="lbl flow">1 · PRD — the source of truth</div>
    <div class="lbl flow" data-col="draft">2 · Draft — the wireframe</div>
    <div class="lbl flow">3 · Screen — what got built</div>
    <div class="lbl">4 · E2E — what proves it</div>
  </div>

  ${groups}
  <div class="none" id="none">Nothing matches.</div>
</div>

<div class="runpanel" id="runpanel" hidden>
  <div class="rph"><span class="chip run" id="rpchip"><span class="dot"></span>running</span>
    <span id="rptitle">tests</span><span class="grow"></span>
    <button class="btn sm" id="rpcancel">Cancel</button>
    <button class="btn sm gh" id="rpbg">Run in background</button>
    <button class="btn sm gh" id="rpclose">Close</button></div>
  <pre class="rplog" id="rplog"></pre>
</div>

<!-- Conflicts is a TOOL page, not a screen: it is about the whole spec rather than one row, so
     it gets #conflicts and never #/<screen>. Its contents are fetched rather than baked, for the
     same reason the run log is — a scan rebuilds the board, so a findings list written into the
     HTML would always be one scan behind itself. -->
<section class="dt" id="cfview" hidden>
  <div class="dth">
    <h2>Conflicts</h2>
    <span class="gbn" id="cfsub">one fact, stated two incompatible ways</span>
    <span class="grow"></span>
    <div class="seg" id="cfseg">
      <button data-cf="open" class="on">Open</button><button data-cf="settled">Settled</button>
    </div>
    <button class="btn" id="cfscan">Rescan</button>
    <button class="close btn">Close<span class="kbd">esc</span></button>
  </div>
  <div class="dtscroll cfscroll">
    <div class="cfwrap">
      <div class="cfhd">
        <span class="lbl">not gaps, not TODOs — only pairs that cannot both be true</span>
        <span class="gbn" id="cfwhen"></span>
      </div>
      <div id="cfopen"></div>
      <div id="cfsettled" hidden></div>
      <div class="cfempty" id="cfempty" hidden></div>
    </div>
  </div>
</section>

<!-- Init is a tool view too (#init): how to reach the project's app, and what a crawl of it
     found. A project that arrives with code and no specs starts here, so the board is populated on
     day one instead of being an empty page nobody knows how to fill. -->
<section class="dt" id="initview" hidden>
  <div class="dth">
    <h2>Set up the board</h2>
    <span class="gbn">point at your app, then crawl it into rows</span>
    <span class="grow"></span>
    <button class="close btn">Close<span class="kbd">esc</span></button>
  </div>
  <div class="dtscroll cfscroll">
    <div class="initwrap">
      <div class="initcol">
        <div class="card pad">
          <div class="fld">
            <div class="l">How do we reach your app?</div>
            <div class="seg" id="initmode">
              <button data-mode="attach" class="on">It's already running</button><button data-mode="start">Start it for me</button>
            </div>
            <div class="h">Pointing at a server you already have running is safer than starting a second one on the wrong port.</div>
          </div>
          <div id="initstartfld" hidden>
            <div class="fld">
              <div class="l">Backend / API, if there is one <span class="gbn">optional</span></div>
              <input class="input" id="initbackendcmd" placeholder="npm run api">
              <input class="input" id="initbackendurl" placeholder="ready when this URL answers — http://localhost:8000/health" style="margin-top:8px">
              <div class="h">Started first and waited for, so the frontend is never crawled before its API is up.</div>
            </div>
            <div class="fld">
              <div class="l">Frontend</div>
              <input class="input" id="initfrontendcmd" placeholder="npm run dev">
            </div>
          </div>
          <div class="fld">
            <div class="l">What URL does the frontend serve on?</div>
            <input class="input" id="initurl" placeholder="http://localhost:3000">
            <div class="h">The page with routes — this is what the crawl visits.</div>
          </div>
          <div class="fld">
            <div class="l">Which routes matter?</div>
            <textarea class="input" id="initroutes" rows="4" placeholder="/  (one per line — leave blank to crawl from the root)"></textarea>
            <div class="h warn">Guessing any of these wrong builds a complete, confident, wrong board.</div>
          </div>
          <div class="fld">
            <div class="l">Sign-in, if screens need it <span class="gbn">optional</span></div>
            <textarea class="input" id="initsignin" rows="3" placeholder="a script against the page object that leaves the app logged in"></textarea>
          </div>
          <div class="sep" style="margin:var(--s2) 0 var(--s4)"></div>
          <div class="fld">
            <div class="l">Pace of a watchable run</div>
            <div style="display:flex;align-items:center;gap:var(--s3)">
              <input class="input" id="initstepdelay" type="number" min="0" max="5000" step="50" style="width:110px" placeholder="300">
              <span class="gbn">ms between each step, so you can follow along</span>
            </div>
          </div>
          <div class="fld" style="margin-bottom:0">
            <div class="l">Where to keep run screenshots &amp; video</div>
            <div class="seg" id="initstore">
              <button data-store="local" class="on">In this repo</button><button data-store="git">Git branch</button><button data-store="bucket">Bucket URL</button>
            </div>
            <input class="input" id="initgitbranch" placeholder="branch name, e.g. spec-shots" style="margin-top:8px" hidden>
            <label class="watchtog sm" id="initpushwrap" style="margin-top:8px" hidden>
              <input type="checkbox" id="initpush"> also push to origin (an outward action)</label>
            <input class="input" id="initbucket" placeholder="https://…  a base URL uploads are PUT to" style="margin-top:8px" hidden>
            <div class="h" id="initstorehint">Kept under spec/_runs/ and pruned with the run log — nothing leaves your machine.</div>
          </div>
        </div>
        <div class="initfoot">
          <button class="btn" id="initsave">Save setup</button>
          <button class="btn pri" id="initcrawl">Crawl the app →</button>
          <span class="gbn" id="initsaved" hidden>saved</span>
        </div>
      </div>

      <div class="initcol">
        <div class="card">
          <header>
            <span class="lbl">what a crawl found · each becomes one row</span>
            <span class="grow"></span>
            <span class="gbn" id="initwhen"></span>
          </header>
          <div id="initfound"></div>
          <div class="cfempty" id="initempty" hidden></div>
          <div class="initnote">
            <span class="chip stale"><span class="mark h"></span>a guess</span>
            <span class="gbn">Read off the page, never canon. Every crawled screen starts unapproved, so the loop still begins at gate A.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<div class="lb" id="lb" hidden>
  <div class="lbbar"><span id="lbcap" class="lbcap"></span><span class="grow"></span>
    <button class="btn sm" id="lbzoom">Actual size</button>
    <button class="btn sm gh" id="lbclose">Close<span class="kbd">esc</span></button></div>
  <div class="lbstage" id="lbstage"><img id="lbimg" alt=""></div>
</div>
${detail}

<script>
  // Drafts are authored at ${CANVAS_W}px and shown scaled, so a thumbnail is the real artifact
  // rather than a picture of one — it cannot drift from the file it came from.
  // A thumbnail is for RECOGNISING a screen, not reading it — that is what the detail view is
  // for. Sized to full height the board draft alone made a 430px row, so barely one row fitted
  // on screen and scanning forty of them would be impossible.
  const W = ${CANVAS_W}, FALLBACK_H = ${CANVAS_H}, THUMB_MAX = 280
  // Drafts vary in length — the board draft is 1481px, init is 729px. A fixed canvas height
  // silently cropped the tall ones, which is the board breaking its own R3 on its own row.
  // Measure each draft instead; srcdoc iframes are same-origin so the height is readable.
  function fit () {
    for (const f of document.querySelectorAll('.frame, .bigframe')) {
      if (!f.clientWidth) continue
      const fr = f.querySelector('iframe')
      // documentElement is null for an srcdoc iframe that has not parsed yet. Reading through it
      // threw on the very first fit(), and because this runs at the top of the script it took
      // every listener below it with it — filters, search, the detail view, the gate buttons.
      // Layout measurement must never be able to disarm the page.
      const doc = fr.contentDocument
      const h = doc?.documentElement?.scrollHeight || FALLBACK_H
      const s = f.clientWidth / W
      fr.style.height = h + 'px'
      fr.style.transform = 'scale(' + s + ')'
      if (f.classList.contains('bigframe')) { f.style.height = (h * s) + 'px'; continue }
      // In a cell the thumbnail is capped so one long screen cannot push every other row off
      // the page — and when it IS cut, the cell says so rather than pretending that was the end.
      const full = h * s
      const shown = Math.min(full, THUMB_MAX)
      f.style.height = shown + 'px'
      const cell = f.closest('.cell')
      if (cell) cell.style.height = (shown + 31) + 'px'
      f.classList.toggle('cropped', full > shown + 2)
    }
  }
  // Belt and braces: nothing about sizing a picture is worth breaking the whole board over.
  const safeFit = () => { try { fit() } catch (err) { console.error('fit', err) } }
  const colhs = document.querySelector('.colhs')
  addEventListener('scroll', () => colhs.classList.toggle('stuck', scrollY > 8), { passive: true })
  addEventListener('resize', safeFit)
  for (const fr of document.querySelectorAll('iframe')) fr.addEventListener('load', safeFit)
  safeFit(); setTimeout(safeFit, 60)

  // filtering ------------------------------------------------------------
  let mode = 'all'
  const q = document.getElementById('q')
  function apply () {
    const term = q.value.trim().toLowerCase()
    let shown = 0
    for (const r of document.querySelectorAll('.row')) {
      const ok = (mode === 'all' || (mode === 'waiting' && r.dataset.waiting === '1')
        || (mode === 'new' && r.dataset.started === '0'))
        && (!term || r.dataset.q.includes(term))
      r.classList.toggle('gone', !ok); if (ok) shown++
    }
    for (const g of document.querySelectorAll('.grp'))
      g.style.display = g.querySelectorAll('.row:not(.gone)').length ? '' : 'none'
    document.getElementById('none').style.display = shown ? 'none' : 'block'
    // Say how much is hidden. A filtered board that looks like the whole board is how you
    // conclude a screen does not exist when it is one click away.
    const tot = document.querySelectorAll('.row').length
    document.getElementById('shown').textContent = shown === tot ? '' : shown + ' of ' + tot
    document.querySelector('.qwrap').classList.toggle('has', !!term)
    // "Nothing matches" is wrong when a filter is the reason — name which one it was.
    document.getElementById('none').textContent = term
      ? 'Nothing matches “' + term + '”.'
      : mode === 'waiting' ? 'Nothing is waiting on you.'
        : mode === 'new' ? 'Every screen has a draft.' : 'Nothing matches.'
    safeFit()
  }
  q.addEventListener('input', apply)
  document.getElementById('qx').addEventListener('click', () => { q.value = ''; apply(); q.focus() })
  for (const b of document.querySelectorAll('#filt button'))
    b.addEventListener('click', () => {
      mode = b.dataset.f
      document.querySelectorAll('#filt button').forEach(x => x.classList.toggle('on', x === b))
      apply()
    })
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

  // Hide/show the whole wireframe column, board-wide, remembered across reloads. This is a viewing
  // PREFERENCE, not spec state — it lives in localStorage and never on disk, so it cannot change
  // anything the board derives. A document-mode board with no wireframes anywhere is the case this
  // most helps: the column is then all "no wireframe" placeholders and folding it away is pure gain.
  const wfBtn = document.getElementById('wftoggle')
  const WF_KEY = 'board-hide-wireframes'
  const wfHidden = () => { try { return localStorage.getItem(WF_KEY) === '1' } catch (e) { return false } }
  function applyWf () {
    const hide = wfHidden()
    document.body.classList.toggle('hide-wf', hide)
    wfBtn.textContent = hide ? 'Show wireframes' : 'Hide wireframes'
    safeFit()
  }
  wfBtn.addEventListener('click', () => {
    try { localStorage.setItem(WF_KEY, wfHidden() ? '0' : '1') } catch (e) { /* storage denied — session only */ }
    applyWf()
  })
  applyWf()

  // detail + routing -----------------------------------------------------
  // Every detail view has an address. Without one a refresh dumps you back on the board, the
  // back button leaves the page entirely, and a screen cannot be linked to anyone.
  const SCREENS = ${JSON.stringify(screens.map(s => s.name))}
  const closeAll = () => document.querySelectorAll('.dt').forEach(d => { d.hidden = true })
  const show = i => { closeAll(); document.querySelector('.dt[data-i="' + i + '"]').hidden = false; safeFit() }
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
    const name = decodeURIComponent(location.hash.replace(/^#\\//, ''))
    const i = SCREENS.indexOf(name)
    if (i >= 0) show(i); else closeAll()
  }
  // Both: popstate covers back/forward, hashchange covers a URL typed or pasted into the bar of
  // an already-open board — that is a same-document navigation and never reloads the page.
  addEventListener('popstate', route)
  addEventListener('hashchange', route)

  // The WHOLE row opens the screen — every cell in it is about that one screen, so any part of it
  // is a reasonable place to click. Images are the exception: they open the zoom instead, because
  // "let me look closer at this screenshot" is a different intent from "open this screen".
  for (const r of document.querySelectorAll('.row'))
    r.addEventListener('click', e => {
      if (e.target.closest('img, button, a, input, label')) return
      open(r.dataset.i)
    })
  for (const b of document.querySelectorAll('.close'))
    b.addEventListener('click', () => { closeAll(); history.pushState(null, '', location.pathname) })

  // Show only what moved, by default, wherever we know what moved.
  for (const seg of document.querySelectorAll('.pseg')) {
    const apply2 = () => {
      const only = seg.querySelector('.on').dataset.v === 'changed'
      seg.closest('.dtp').querySelectorAll('.prd article[data-unchanged]')
        .forEach(a => { a.hidden = only })
    }
    for (const s of seg.querySelectorAll('span')) s.addEventListener('click', () => {
      seg.querySelectorAll('span').forEach(x => x.classList.toggle('on', x === s))
      apply2()
    })
    apply2()
  }

  // Clearing the queue is the real motion — sit down, go through everything, leave. Without this
  // every screen costs a close, a scroll and a hunt for the next one still showing a gate.
  const WAITING = ${JSON.stringify(screens.map((s, i) => (isWaiting(s) ? i : -1)).filter(i => i >= 0))}
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
      closeAll(); history.pushState(null, '', location.pathname)
    }
    const openDt = [...document.querySelectorAll('.dt')].find(d => !d.hidden)
    if (openDt && (e.key === 'j' || e.key === 'ArrowRight')) openDt.querySelector('.nextw').click()
    if (openDt && e.key === 'r') { const b = openDt.querySelector('.runbtn'); if (b) b.click() }
  })

  // gate actions ---------------------------------------------------------
  // These POST to the board server. Opened as a plain file the board still renders; it just
  // cannot record a decision, and says so rather than silently doing nothing.
  function toast (msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg
    document.body.appendChild(t); setTimeout(() => t.remove(), 5000)
  }
  // The escape hatch: the draft is a plain HTML file, and the watcher already rebuilds on save.
  // So "edit it yourself" is a real answer today — it just was not discoverable from the board.
  for (const b of document.querySelectorAll('.edit')) {
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.path) } catch (e) { /* clipboard denied */ }
      toast(b.dataset.path + ' — path copied. Edit it and the board reloads the moment you save.')
    })
  }

  // You have just typed the entire decision. Making you then find and hit a button is a step
  // that exists for no reason, and it is where a half-written rejection gets abandoned.
  for (const w of document.querySelectorAll('.gb .why')) {
    w.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      w.closest('.gb').querySelector('[data-act="reject"]').click()
    })
  }

  for (const b of document.querySelectorAll('[data-act]')) {
    b.addEventListener('click', async () => {
      const box = b.closest('.gb')
      const why = box.querySelector('.why')
      // Ask before the request, not after it fails — the sentence IS the rejection.
      if (b.dataset.act === 'reject' && !why.value.trim()) {
        why.focus()
        why.placeholder = 'Say what is wrong — this is what the redraft gets'
        why.style.borderColor = 'var(--bengara)'
        return
      }
      try {
        const res = await fetch('/api/gate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            screen: b.dataset.screen, gate: b.dataset.gate || 'draft', act: b.dataset.act,
            why: why ? why.value : ''
          })
        })
        if (!res.ok) throw new Error((await res.text()).slice(0, 120))
        // Stay on the screen you just judged. Jumping to the next one on its own takes the pace
        // out of your hands and hides the result of what you just did — you never see the cell
        // turn green, so you cannot tell an approval from a misclick. The hash already points at
        // this screen, so a plain reload lands you back on it showing the new state, and moving
        // on is a button you press when you are ready.
        location.reload()
      } catch (err) {
        toast('Decisions need the board server — run  npm run board  (' + err.message + ')')
      }
    })
  }

  // conflicts ------------------------------------------------------------
  // NOTE FOR ANYONE EDITING THIS FILE: every line below is emitted inside a JS template literal,
  // so a backtick here becomes the end of the board's HTML and an unescaped newline becomes real
  // whitespace. That has shipped a page with every listener dead, twice. String concatenation
  // only, and \\n where a newline is meant.
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
      if (!await cfPost('/api/conflict', { key: key, canon: picked[key], note: note })) return
      delete picked[key]
      await loadConflicts()
      // Show what you just did. A card that silently vanishes from one tab is indistinguishable
      // from a misclick, which is how you end up resolving the same thing twice.
      setTab('settled')
      return
    }
    const undo = e.target.closest('[data-undo]')
    if (undo) {
      const key = undo.closest('.srow').dataset.key
      if (!await cfPost('/api/conflict', { key: key, undo: true })) return
      await loadConflicts()
      setTab('open')
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
    git: 'Each run\\'s shots are committed to this branch in an isolated worktree (your working tree is untouched). It stays local unless you tick push.',
    bucket: 'Each run\\'s shots are PUT to this base URL (base/runId/name) and the board loads them from there, so they outlive the local prune. The endpoint must accept the PUT.'
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
    document.getElementById('initroutes').value = (cfg.routes || []).join('\\n')
    document.getElementById('initsignin').value = cfg.signIn || ''
    document.getElementById('initstepdelay').value = cfg.stepDelayMs == null ? 300 : cfg.stepDelayMs
    const st = cfg.storage || { where: 'local' }
    setStore(st.where || 'local')
    document.getElementById('initgitbranch').value = st.gitBranch || ''
    document.getElementById('initpush').checked = !!st.push
    document.getElementById('initbucket').value = st.bucketUrl || ''
  }

  function foundRow (r) {
    // 'yours' — a real PRD the CEO wrote — is never touched; a guessed row already on the board is
    // still a guess; a route with no screen yet is new. R5: rerunning leaves settled work alone.
    const state = r.mine ? 'yours' : r.exists ? 'a guess, already on board' : 'new'
    const thumb = r.exists || r.slug
      ? '<div class="fthumb"><img src="spec/' + eh(r.slug) + '/crawl.png" onerror="this.style.display=\\'none\\'" alt=""></div>'
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

  route()

  // running the suite ----------------------------------------------------
  const panel = document.getElementById('runpanel')
  const rplog = document.getElementById('rplog')
  const rpchip = document.getElementById('rpchip')
  let runDone = false

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
  function panelRefused (msg) {
    rpchip.className = 'chip bad'
    rpchip.textContent = 'refused'
    rplog.textContent = msg
    runDone = true
    document.getElementById('rpcancel').disabled = true
  }

  async function runTests (screen, opts) {
    const o = opts || {}
    const what = o.headed ? 'watching' : 'running'
    const title = (o.grep ? o.grep : screen ? screen + ' · test.spec.ts' : 'all tests') +
      (o.headed ? ' · in a visible browser' : '')
    openPanel(what, title)
    if (o.headed) {
      rplog.textContent = 'A browser window is opening — it drives the app in front of you.\\n' +
        'It closes itself when the test finishes.\\n\\n'
    }
    try {
      const res = await fetch('/api/run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ screen, grep: o.grep, headed: !!o.headed })
      })
      if (!res.ok) throw new Error((await res.text()).slice(0, 120))
    } catch (err) { panelRefused(err.message) }
  }
  async function dispatch (screen) {
    openPanel('redrafting', screen + ' · draft.html')
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ screen })
      })
      if (!res.ok) throw new Error((await res.text()).slice(0, 160))
    } catch (err) { panelRefused(err.message) }
  }

  // A job you cannot stop is a job you have to sit out. A redraft runs for minutes, so noticing
  // ten seconds in that you dispatched the wrong screen should cost ten seconds, not four minutes.
  document.getElementById('rpcancel').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/cancel', { method: 'POST' })
      if (!res.ok) throw new Error((await res.text()).slice(0, 120))
      document.getElementById('rpcancel').disabled = true
    } catch (err) { toast(err.message) }
  })
  for (const b of document.querySelectorAll('[data-dispatch]'))
    b.addEventListener('click', () => dispatch(b.dataset.dispatch))

  document.getElementById('runall').addEventListener('click', () => runTests(null))
  for (const b of document.querySelectorAll('.runbtn'))
    b.addEventListener('click', () => runTests(b.dataset.run))
  // Run in background from the detail view: start the run, then drop the panel. The run keeps
  // going and the header chip stays lit so it is never a job you forget is happening.
  for (const b of document.querySelectorAll('.runbg'))
    b.addEventListener('click', async () => { await runTests(b.dataset.run); panel.hidden = true })
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
    // a finished run changed the board, so leaving the panel is the moment to show it
    if (runDone) location.reload()
  })
  // Background is not a different run — it is the same run without the window. The header chip
  // keeps it visible, because a job you cannot see is a job you start twice.
  document.getElementById('rpbg').addEventListener('click', () => { panel.hidden = true })

  const runflag = document.getElementById('runflag')
  const setRunning = on => {
    runflag.hidden = !on
    document.getElementById('runall').disabled = on
  }
  // A run you sent to the background is still yours to watch — clicking the header chip brings the
  // panel back up. Without this a backgrounded run was a job you could see was happening and could
  // never open again.
  runflag.style.cursor = 'pointer'
  runflag.title = 'a job is running in the background — click to open its panel'
  runflag.addEventListener('click', () => { panel.hidden = false })

  // Watch: re-run the moment a PRD, draft or spec changes, so the E2E column stops being the one
  // cell you have to remember to refresh by hand. One switch, mirrored onto every copy — the
  // header checkbox and each detail view's — so they never disagree about whether watch is on.
  const watchBox = document.getElementById('watch')
  function syncWatch (on) {
    watchBox.checked = on
    for (const w of document.querySelectorAll('.dwatch')) w.checked = on
  }
  async function setWatch (on) {
    syncWatch(on)
    await fetch('/api/watch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on })
    }).catch(() => {})
  }
  watchBox.addEventListener('change', () => setWatch(watchBox.checked))

  // recent runs, fetched rather than baked in — the board is rebuilt by a run, so a run log
  // written into the HTML would always be one run behind itself
  // Where a run's record went, if anywhere but local — said plainly, success or failure, because a
  // storage option that silently does nothing is worse than not offering it.
  function archiveNote (a) {
    if (!a) return ''
    if (a.where === 'git') {
      return a.ok
        ? '→ git ' + eh(a.branch) + ' @ ' + eh(a.sha) +
          (a.requestedPush ? (a.pushed ? ' (pushed)' : ' (push failed)') : ' (committed locally)')
        : '→ git failed: ' + eh(a.error || 'unknown')
    }
    if (a.where === 'bucket') {
      return a.ok ? '→ bucket · ' + (a.count || 0) + ' file(s)' : '→ bucket failed: ' + eh(a.error || 'unknown')
    }
    return ''
  }

  async function loadRuns () {
    let data
    try { data = await (await fetch('/api/runs')).json() } catch (e) { return }
    syncWatch(!!data.watch)
    setRunning(!!data.running)
    for (const box of document.querySelectorAll('.runlog')) {
      const screen = box.dataset.screen
      const mine = data.runs.filter(r => r.screen === screen || r.screen === 'all').slice(0, 5)
      box.querySelector('.runrows').innerHTML = mine.length
        ? mine.map(r => '<div class="runrow"><span class="mark ' + (r.ok ? '' : 'o') + '" style="color:var(--' +
            (r.ok ? 'koke' : 'bengara') + ')"></span><span>' + r.at.replace('T', ' ').slice(0, 16) +
            '</span><span class="rr-s">' + r.screen + '</span><span class="ms">' +
            (r.total - r.failed) + '/' + r.total + ' · ' + Math.round(r.ms / 100) / 10 + 's</span>' +
            (r.archive ? '<span class="rr-arch">' + archiveNote(r.archive) + '</span>' : '') + '</div>').join('')
        : '<div class="runrow ms">no runs recorded yet</div>'

      // The RECORD, shown UNDER each test — what THAT test saw, not a heap of images under all of
      // them. Take the newest run that recorded this screen and carries a per-test manifest.
      const rec = data.runs.find(r => (r.screen === screen || r.screen === 'all') &&
        r.shotsByTest && Object.keys(r.shotsByTest).length)
      const panel = box.closest('.e2e')
      for (const slot of panel.querySelectorAll('.tstshots')) {
        const one = rec && rec.shotsByTest[slot.dataset.title]
        slot.innerHTML = one
          ? (one.shots || []).map(src => '<img src="' + src + '" loading="lazy" alt="what this test saw">').join('') +
            (one.video ? '<a class="recvid" href="' + one.video + '" target="_blank">▶ recording</a>' : '')
          : ''
      }
      // The DETAIL STEPS of each case, collapsed behind a toggle — every action and check the test
      // ran, in order, indented under its named steps. Expand to see exactly what a case did.
      for (const slot of panel.querySelectorAll('.tststeps')) {
        const one = rec && rec.shotsByTest[slot.dataset.title]
        const steps = (one && one.steps) || []
        if (!steps.length) { slot.innerHTML = ''; continue }
        slot.innerHTML =
          '<button class="stepstog" aria-expanded="false">▸ ' + steps.length + ' steps</button>' +
          '<ol class="stepslist" hidden>' + steps.map(s =>
            '<li class="scat-' + eh((s.cat || '').replace(/[^a-z]/gi, '')) + (s.ok ? '' : ' sf') +
            '" style="margin-left:' + (s.depth * 14) + 'px">' +
            eh(s.label || '') + '</li>').join('') + '</ol>'
      }
    }
  }
  loadRuns()

  // lightbox -------------------------------------------------------------
  // Screenshots are the evidence gate B rests on, and they render at a third of their real size.
  // A judgement about whether the build matches the design cannot be made from a thumbnail.
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

  // expand/collapse a test case's detail steps
  document.addEventListener('click', e => {
    const tog = e.target.closest('.stepstog')
    if (!tog) return
    const list = tog.nextElementSibling
    const show = list.hidden
    list.hidden = !show
    tog.setAttribute('aria-expanded', String(show))
    tog.textContent = (show ? '▾ ' : '▸ ') + list.querySelectorAll('li').length + ' steps'
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
    es.addEventListener('change', () => {
      if (automation) return
      if (!panel.hidden && !runDone) return
      // The conflicts view keeps itself current and holds unsaved picks and a note field. A full
      // reload there would throw away a sentence you were half way through typing, so it refreshes
      // in place instead — the one view on the board that owns its own state.
      if (!document.getElementById('cfview').hidden) { loadConflicts(); return }
      // init holds a half-filled form too — refresh the found table in place, never reload it out
      if (!document.getElementById('initview').hidden) { loadCrawl(); return }
      location.reload()
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
        rplog.textContent += d.line + '\\n'
        rplog.scrollTop = rplog.scrollHeight
      } else if (d.state === 'done') {
        runDone = true
        setRunning(false)
        document.getElementById('rpcancel').disabled = true
        // a scan or a rewrite changes what is waiting on you — the header count has to follow;
        // a crawl changes what the init "what was found" table should show
        loadConflicts()
        if (!document.getElementById('initview').hidden) loadCrawl()
        // Finished while you were NOT watching (backgrounded). Do not just silently refresh — say
        // what happened, so a background run is a thing you get told the result of rather than a
        // thing that quietly changed the board while you looked away.
        if (panel.hidden) {
          loadRuns()
          const label = (d.screen === 'all' ? 'all tests' : (d.screen || 'run')) + ' — ' + (d.note ||
            ((d.total - d.failed) + ' of ' + d.total + (d.ok ? ' passed' : ' — some failed')))
          toast('Background job done · ' + label + ' · click the running chip to see it')
          if (!automation) setTimeout(() => location.reload(), 1800)
          return
        }
        rpchip.className = 'chip ' + (d.ok ? 'ok' : 'bad')
        rpchip.innerHTML = '<span class="dot"></span>' + (d.ok ? 'passed' : 'failed')
        rplog.textContent += '\\n' + (d.note || ((d.total - d.failed) + ' of ' + d.total + ' passing')) +
          ' · ' + Math.round(d.ms / 100) / 10 + 's\\n'
        rplog.scrollTop = rplog.scrollHeight
        loadRuns()
      }
    })
  } catch (e) { /* served statically — no live reload, everything else still works */ }
</script>
`

  // The board's script is written INSIDE a template literal, so an unescaped \n or backtick in
  // the emitted JS silently becomes real whitespace and breaks the whole file — which disables
  // every listener on the page while the board still renders perfectly. That has now shipped a
  // dead page twice. Parse it before writing; a build that cannot produce working JS must fail
  // loudly rather than hand over something that merely looks right.
  const script = html.match(/<script>([\s\S]*)<\/script>/)
  if (script) {
    try {
      new Function(script[1])
    } catch (err) {
      throw new Error(`board.html script does not parse — refusing to write it: ${err.message}`)
    }
  }

  // Atomic write — temp then rename. The server's file-watcher and a board-started run can both
  // rebuild at once, and a plain writeFileSync truncates-then-fills, so a reader mid-write (the
  // server serving the page, a test's goto) can get a half-written board and render a broken page.
  // Rename is atomic within a filesystem, so a reader sees either the whole old board or the whole
  // new one — the same guarantee the JSON writes have always had, for the same reason.
  writeText(join(ROOT, 'board.html'), html)
  return { screens: screens.length, areas: areas.length, yourTurn, reqs: screens.reduce((n, s) => n + s.reqs.length, 0) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build()
  console.log(`board.html — ${r.screens} screens in ${r.areas} areas, ${r.reqs} requirements, ${r.yourTurn} waiting`)
}
