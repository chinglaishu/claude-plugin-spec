// Renders spec/<screen>/ into one self-contained board.html.
//
// Reading and state live in spec-store.mjs; this file only draws. The board inlines the SAME
// spec/_design.css the drafts link, and adds nothing but layout — it is one of the screens this
// tool tracks, so it has no business owning a second design system.

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROOT, esc, designCss, allScreens, sortedAreas, isWaiting, writeText
} from './spec-store.mjs'

// A status chip. Hue names the state; a redundant square mark carries it too, so status survives
// greyscale and low vision (design system). tone ∈ ok · stale · gone · bad · rev · run; mark is one
// of the square shapes from _design.css (filled · o hollow · h half · n hairline).
const chip = (tone, mark, label, attrs = '') =>
  `<span class="chip ${tone}"${attrs ? ' ' + attrs : ''}><span class="${mark}"></span>${label}</span>`

// A requirement's derived state → its header chip (board R4). proven=moss ✓, reworded=iron (your
// turn to re-accept), unproven=hollow ○ (honestly ungreen, never faked). Title only, no label — the
// header stays compact; the word lives in the tooltip. NOTE the reworded mark is a plain filled
// square, NOT the design system's half-fill `mark h`: that class would collide with the requirement
// header's own `.h` inside the pane (the acceptance test clicks `.req .h`), so hue carries reworded
// here — exactly as the approved mockup does.
const REQ_CHIP = {
  proven: ['ok', 'mark', 'proven'],
  reworded: ['stale', 'mark', 'reworded since it was accepted'],
  unproven: ['gone', 'mark o', 'no passing assertion covers this yet']
}
const reqChip = state => {
  const [tone, mark, title] = REQ_CHIP[state] || REQ_CHIP.unproven
  return `<span class="chip ${tone}" title="${title}"><span class="${mark}"></span></span>`
}

// Home is one CARD per screen (board R1): its name, a guess chip if the PRD is still a crawl guess,
// a proven-count chip, the requirement TITLES, and the latest run's recording cover (or the still).
// There is NO PRD/draft/screen/E2E column strip — the card is titles + cover and nothing else.
const card = (s, i) => {
  const M = s.reqs.length
  const proven = s.reqs.filter(r => r.state === 'proven').length
  const done = M > 0 && proven === M
  const q = (s.title + ' ' + s.route + ' ' + s.reqs.map(r => r.title).join(' ')).toLowerCase()
  return `
<div class="card" data-screen="${esc(s.name)}" data-i="${i}"
     data-waiting="${isWaiting(s) ? 1 : 0}" data-q="${esc(q)}">
  <div class="cmain">
    <div class="cd"><span class="nm">${esc(s.title)}</span>
      ${s.guess ? '<span class="chip stale gmark"><span class="mark h"></span>a guess</span>' : ''}
      <span class="chip ${done ? 'ok' : 'gone'} pcount"><span class="mark${done ? '' : ' o'}"></span>${proven} / ${M} proven</span></div>
    <ul class="rl">${s.reqs.map(r => `<li><span class="id">${esc(r.id)}</span>${esc(r.title)}</li>`).join('')}</ul>
  </div>
  <div class="cshot">${s.hasShot
    ? `<img src="spec/${esc(s.name)}/screen.png?h=${s.shotHash}" alt="${esc(s.title)} — latest run">`
    : '<span class="play">▶</span>'}</div>
</div>`
}

// Requirement prose is light markdown: paragraphs, `- ` lists, **bold**, *em*, `code`, plus
// <!-- author notes --> that are hints for the test author, not requirement text. A PRD is UNTRUSTED
// (anyone authors one; a crawl reads them off a running app), so every span is HTML-escaped before a
// tag is emitted — the only tags in the output are the ones this function puts there. Notes and code
// spans are pulled out FIRST, on the raw text, so their contents are never read as markdown and their
// delimiters (<!--, `) never reach the page; notes render muted so the prose reads clean without
// losing the hint. A private-use sentinel marks the holes, chosen because it cannot occur in prose
// and survives escaping untouched.
export function renderBody (text) {
  const holds = []
  const SENT = ''
  const stash = html => SENT + (holds.push(html) - 1) + SENT
  // marks that are safe to run on already-escaped text; ** before * so the double star is consumed
  // first and never leaves a stray asterisk behind.
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  const src = String(text)
    .replace(/<!--([\s\S]*?)-->/g, (_, c) => stash(`<span class="cmt">${esc(c.trim())}</span>`))
    .replace(/`([^`]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`))
  const out = src.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
    const lines = b.split(/\n/)
    // a block whose every line is a `- ` item is a list; anything else is a paragraph
    if (lines.every(l => /^\s*[-*]\s+/.test(l)))
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`
    return `<p>${inline(b.replace(/\n/g, ' '))}</p>`
  }).join('')
  return out.replace(new RegExp(SENT + '(\\d+)' + SENT, 'g'), (_, i) => holds[Number(i)])
}

// The run-all control for this screen, in the detail bar. Run (headless) is the default; per-test
// Run/Watch buttons and the SSE-streamed run panel live on the test rows (R10).
const runAll = name =>
  `<button class="btn pri runbtn" data-run="${esc(name)}">Run all<span class="kbd">r</span></button>`

// LEFT column (board R2/R3): one requirement per row — its state chip, id and TITLE, always shown;
// the long, formatted description collapses behind it and one click on the header reveals the full
// markdown. An open body ends in a covers line NAMING the tests that prove it, or an honest "no test
// asserts this yet" when it is unproven (R6). A requirement is never faked green.
const reqRow = r => {
  const passing = (r.tests || []).filter(t => t.status === 'pass' && !t.stale)
  const covers = r.state === 'unproven'
    ? '<div class="covers"><span class="nocov">no test asserts this yet — honestly ungreen, not hidden</span></div>'
    : passing.length
      ? `<div class="covers">proven by ${passing.map(t => `<span class="ctag">${esc(t.title)}</span>`).join(' ')}</div>`
      : '<div class="covers"><span class="nocov">a prior pass, now stale — re-run to re-prove</span></div>'
  return `<div class="req" data-r="${esc(r.id)}" data-state="${r.state}">
    <div class="h">${reqChip(r.state)}<span class="id">${esc(r.id)}</span><span class="rt">${esc(r.title)}</span><span class="chev">›</span></div>
    <div class="body">${renderBody(r.body)}${covers}</div>
  </div>`
}
const reqPane = s => `<div class="pane reqpane">
  <h2>1 · Requirements <span class="s crumb">the source of truth</span></h2>
  ${s.reqs.length ? s.reqs.map(reqRow).join('') : `<div class="empty">No requirements yet — write the first in <code>spec/${esc(s.name)}/prd.md</code>.</div>`}
</div>`

// RIGHT column (board R3/R5/R10): one test per row, leading with its own FLOW title (prominent),
// then the coverage TAGS — one neutral chip per requirement it covers — and a status chip. Collapsed;
// open it for the recording cover, a Run/Watch pair, the fold of steps (scrollable), and the full log
// which opens in a floating window. The .tststeps / .tstlog / .tstshots / data-title hooks keep the
// existing run / steps / log machinery working, re-housed into the new row.
const testRow = (s, t) => {
  const tags = Object.keys(t.reqs || {}).map(qid => {
    const rid = qid.includes(':') ? qid.split(':').pop() : qid
    return `<span class="tag" data-r="${esc(rid)}">${esc(rid)}</span>`
  }).join('')
  const status = t.ok ? chip('ok', 'mark', 'pass') : chip('bad', 'mark o', 'fail')
  return `<div class="test tst ${t.ok ? 'p' : 'f'}" data-t="${esc(t.title)}" data-title="${esc(t.title)}">
    <div class="th"><div class="throw"><span class="chev">›</span><span class="ttl tt">${esc(t.title)}</span><div class="tags">${tags}</div>${status}</div></div>
    <div class="tbody">
      <div class="trow2">
        <div class="rec"><span class="play">▶</span><span class="lab">${t.ms}ms</span></div>
        <div class="tsub">${t.ok ? 'passed' : 'failed'} · ${t.ms}ms</div>
        <span class="grow"></span>
        <span class="tacts">
          <button class="btn sm runone" data-run="${esc(s.name)}" data-grep="${esc(t.title)}" title="run only this test">Run</button>
          <button class="btn sm runone" data-run="${esc(s.name)}" data-grep="${esc(t.title)}" data-headed="1" title="watch only this test in a browser">Watch ↗</button>
        </span>
      </div>
      ${t.error ? `<pre class="terr">${esc(t.error)}</pre>` : ''}
      <div class="tstshots" data-title="${esc(t.title)}"></div>
      <div class="fold"><div class="tststeps" data-title="${esc(t.title)}"></div></div>
      <div class="tstlog" data-title="${esc(t.title)}"></div>
      <div class="loglink" data-log><span class="chev" style="transform:none">▸</span>full log — opens in a window</div>
    </div>
  </div>`
}
const testPane = s => `<div class="pane testpane">
  <h2>2 · E2E tests <span class="s crumb">few, comprehensive · each tags what it covers</span></h2>
  ${s.run && s.run.tests && s.run.tests.length
    ? s.run.tests.map(t => testRow(s, t)).join('')
    : `<div class="empty">No test has run yet · <code>spec/${esc(s.name)}/test.spec.ts</code>. Press <b>Run all</b> above.</div>`}
</div>`

// The ONE human gate of the two-column model (board R8): accept the requirements. It is open — your
// turn — whenever the screen is waiting (a crawl guess, a reworded requirement, or a never-accepted
// PRD). Accepting POSTs to the server, which pins the current PRD text so nothing reads reworded
// afterward and the gate closes. There is no draft gate and no gate B — the tests answer "did you
// build it right?" against the real app, automatically.
const acceptGate = s => {
  if (!isWaiting(s)) {
    return `<div class="gate ok">
      ${chip('ok', 'dot', 'requirements accepted')}
      <span class="g2">These requirements are the accepted source of truth. Edit the PRD to change what the screen should do, and it reads as needing re-acceptance until you accept again.</span>
    </div>`
  }
  const why = s.guess
    ? 'These requirements were read off the running app — a guess. Correct any that are wrong, then accept them as the source of truth.'
    : (!s.state.approvedPrdText
        ? 'These requirements have never been accepted. Read them, correct any that are wrong, then accept them as the source of truth.'
        : 'Requirements changed since they were accepted. Re-read what moved, then accept them again as the source of truth.')
  return `<div class="gate open">
    <span class="g1">Gate · your turn</span>
    <span class="g2">${why}</span>
    <button class="btn ok" data-act="accept" data-gate="prd" data-screen="${esc(s.name)}" style="flex:none;margin-left:auto">Accept requirements</button>
  </div>`
}

// The How-it-works page. The METHOD is fixed — intro, the shared four-column spine, the two lanes
// (greenfield DESIGN, brownfield DOCUMENT), and the four skills drawn as flowcharts (howFlowcharts,
// below) — so it is all baked here at build time rather than fetched. Only a PROJECT's own added
// skills/agents are live (loadHow reads /api/capabilities), because those cannot be known ahead of time.
const WORKFLOW = {
  spine: [
    { num: '1 · PRD', h: 'Requirements', file: 'prd.md' },
    { gate: 'GATE A', h: 'Is this what I meant?', cmp: 'PRD ↔ wireframe' },
    { num: '2 · DRAFT', h: 'Wireframe', file: 'draft.html' },
    { gate: 'GATE B', h: 'Did you build it?', cmp: 'wireframe ↔ screenshot' },
    { num: '3 · SCREEN', h: 'Screenshot', file: 'screen.png' },
    { num: '4 · E2E', h: 'The proving test', file: 'test.spec.ts' }
  ],
  lanes: [
    {
      mode: 'New project · greenfield',
      sub: '<b>DESIGN mode.</b> You write the requirement first, then everything downstream chases it.',
      steps: [
        { skill: 'kg-init', file: 'prd.md', h: 'Write the first PRD',
          p: 'Scaffold the board, then state what the screen must do — the source of truth.' },
        { gate: true, glbl: 'Gate A · your turn', h: 'Is this what I meant?', cmp: 'prd.md ↔ draft.html',
          p: 'Only a human approves <b>meaning</b>. Reject sends the wireframe back to the drawing.' },
        { skill: 'kg-init', file: 'draft.html', h: 'Draw the wireframe',
          p: 'A hi-fi, clickable draft at exactly 1280px — every control does something visible.' },
        { gate: true, glbl: 'Gate B · your turn', h: 'Did you build it?', cmp: 'draft.html ↔ screen.png',
          p: 'You compare the wireframe against the screenshot of what shipped.' },
        { skill: 'kg-e2e', file: 'test.spec.ts', h: 'Build &amp; prove', arrow: 'the test writes the screenshot',
          p: 'Write the failing test first, watch it go red, then build until it asserts something real — and it shoots <span class="mono">screen.png</span> as a byproduct.' }
      ]
    },
    {
      mode: 'Existing project · brownfield',
      sub: '<b>DOCUMENT mode.</b> The app already runs. You reverse the arrows: capture reality, then keep it honest.',
      steps: [
        { skill: 'kg-init', file: 'crawl', h: 'Scaffold &amp; crawl',
          p: 'Vendor the board into the repo, then drive a real browser over the running app to find its screens.' },
        { skill: 'kg-init', file: 'prd.md · guess', h: 'Guessed PRDs',
          p: 'Each crawled screen gets a first-draft requirement, flagged <span class="mono">guess</span> until you confirm the meaning.' },
        { skill: 'kg-e2e', file: 'test.spec.ts', h: 'Characterization tests',
          p: 'Pin what the screen <i>currently</i> does, so any later drift shows up as a real failure.' },
        { skill: 'kg-e2e', file: 'golden data', h: 'Golden data', arrow: 'for data-driven screens',
          p: 'Freeze a known dataset so the test asserts the real values a screen renders — not just that boxes exist.' }
      ],
      band: {
        label: 'then, before &amp; after every change — forever',
        steps: [
          { skill: 'kg-staff', file: 'before any edit', h: 'Run the change discipline',
            p: 'Find what governs the screen, learn the three times to stop and ask the human, and change things in the right order.' },
          { skill: 'kg-update', file: 'on each release', h: 'Stay current',
            p: 'Bring the vendored board to a new specboard release — untouched files updated, your edits kept, conflicts dropped beside them to merge.' }
        ]
      }
    }
  ]
}

// One drawn SVG connector; a labelled variant carries a note to the side of the line.
const howArrow = label =>
  `<div class="arrow${label ? ' lbl-arrow' : ''}"><svg width="14" height="30" viewBox="0 0 14 30"><path class="ln" d="M7 0 V20"/><path class="hd" d="M2.5 15 L7 22 L11.5 15"/></svg>${label ? `<span class="side">${label}</span>` : ''}</div>`

const howNode = st => st.gate
  ? `<div class="node gate">
        <div class="ghead"><span class="dia"></span><span class="glbl">${st.glbl}</span></div>
        <h3>${st.h}</h3><p>${st.p}</p><div class="cmp">${st.cmp}</div></div>`
  : `<div class="node">
        <div class="kick"><span class="skill">${st.skill}</span><span class="file">${st.file}</span></div>
        <h3>${st.h}</h3><p>${st.p}</p></div>`

// Arrows sit BETWEEN nodes — every node after the first gets a preceding connector, labelled if the
// step names one. The band's own flow is rendered the same way, one level in.
const howFlow = steps => steps.map((st, i) => (i ? howArrow(st.arrow) : '') + howNode(st)).join('')

const howLane = lane => `<div class="lane">
      <div class="lane-head"><span class="mode"><span class="mk"></span>${lane.mode}</span></div>
      <div class="lane-sub">${lane.sub}</div>
      <div class="flow">${howFlow(lane.steps)}${lane.band ? `
        <div class="band">
          <div class="band-lbl"><span class="loop">&#8635;</span> ${lane.band.label}</div>
          <div class="flow">${howFlow(lane.band.steps)}</div>
        </div>` : ''}</div>
    </div>`

const howSpineCol = c => c.gate
  ? `<div class="col g"><div class="num">${c.gate}</div><h3>${c.h}</h3>
        <div class="gate-tag"><span class="dia"></span>${c.cmp}</div></div>`
  : `<div class="col"><div class="num">${c.num}</div><h3>${c.h}</h3>
        <div class="file">${c.file}</div></div>`

// The four skills, drawn as flowcharts — a fixed part of the specboard method, so baked at build
// time from the definitions below rather than fetched. The node/edge geometry and the SVG chevron
// connectors are computed HERE, in Node, and emitted as static svg/html; nothing is laid out in the
// browser. Diagram language: rectangle = step · indigo diamond = decision · tinted bar = human gate ·
// open-chevron connectors carry yes/no branch pills. All hues come from the inlined design tokens.
// (Ported from the approved skills-flow mockup + its deterministic geometry generator.) This whole
// block is plain module-level JS — it produces a STRING that howView() interpolates, so its own
// template literals never touch the outer board literal.
const HOW_W = 1216, HOW_Cx = 608, HOW_Lx = 300, HOW_Rx = 916
const XH = 'xmlns="http://www.w3.org/1999/xhtml"'
const HOW_MARK = { running: '', settled: '', relook: '', redfail: '' }
const HOW_STATEW = { running: 'runs a job', settled: 'settled', relook: 're-look', redfail: 'must fail' }

function fbox (n) {
  const w = n.w, h = n.h, x = n.cx - w / 2, y = n.top
  return { x, y, w, h, cx: n.cx, cy: y + h / 2, right: x + w, bottom: y + h, top: y, left: x }
}
function fanchor (n, side) {
  const b = fbox(n)
  if (side === 'top') return { x: b.cx, y: b.top }
  if (side === 'bottom') return { x: b.cx, y: b.bottom }
  if (side === 'left') return { x: b.left, y: b.cy }
  if (side === 'right') return { x: b.right, y: b.cy }
  throw new Error('side ' + side)
}
const fpolyPath = pts => 'M' + pts.map(p => `${p.x} ${p.y}`).join(' L')

function fStepBody (n) {
  const cls = ['nb', 'step', n.state ? 's-' + n.state : ''].filter(Boolean).join(' ')
  const tags = (n.tags || []).map(t => `<span class="tag mono">${esc(t)}</span>`).join('')
  const chip = n.state
    ? `<span class="schip s-${n.state}"><span class="mk ${HOW_MARK[n.state] || ''}"></span>${HOW_STATEW[n.state]}</span>`
    : ''
  const note = n.note ? `<div class="nb-note">${esc(n.note)}</div>` : ''
  const rows = (n.rows || [])
    .map(r => `<div class="frow"><span class="fmk s-${r.s}"></span><span class="ftxt">${esc(r.t)}</span></div>`)
    .join('')
  return `<div ${XH} class="${cls}">
    <div class="nb-title">${esc(n.title)}</div>
    ${note}
    ${rows ? `<div class="frows">${rows}</div>` : ''}
    ${tags || chip ? `<div class="nb-foot">${tags}${chip}</div>` : ''}
  </div>`
}
function fGateBody (n) {
  const cmp = n.cmp ? `<div class="cmp mono">${esc(n.cmp)}</div>` : ''
  return `<div ${XH} class="nb gate">
    <div class="glbl"><span class="dia"></span>HUMAN GATE · your turn</div>
    <div class="nb-title ai">${esc(n.title)}</div>
    ${cmp}
  </div>`
}
function fDiaText (n) {
  return `<div ${XH} class="nb dbody">
    <div class="dkick"><span class="ddia"></span>DECISION</div>
    <div class="nb-title ai">${esc(n.title)}</div>
  </div>`
}
const fCapBody = c => `<div ${XH} class="cap ${c.align || 'center'}">${esc(c.text)}</div>`
function fBlabelBody (l) {
  const sub = l.sub ? `<span class="bl-sub">${esc(l.sub)}</span>` : ''
  const tone = l.no ? 'no' : l.plain ? 'plain' : 'yes'
  return `<div ${XH} class="blwrap"><span class="blabel ${tone}"><span class="bdia"></span>${esc(l.t)}${sub}</span></div>`
}

function fRenderNode (n) {
  const b = fbox(n)
  if (n.type === 'junction') return `<circle class="jdot" cx="${b.cx}" cy="${b.cy}" r="4.5"/>`
  if (n.type === 'diamond') {
    const pts = `${b.cx},${b.top} ${b.right},${b.cy} ${b.cx},${b.bottom} ${b.left},${b.cy}`
    const fw = n.w * 0.78, fh = n.h * 0.62
    const fx = b.cx - fw / 2, fy = b.cy - fh / 2
    return `<polygon class="dia-shape" points="${pts}"/>
      <foreignObject x="${fx}" y="${fy}" width="${fw}" height="${fh}">${fDiaText(n)}</foreignObject>`
  }
  const body = n.type === 'gate' ? fGateBody(n) : fStepBody(n)
  return `<foreignObject x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}">${body}</foreignObject>`
}
function fRenderEdge (e, nodes) {
  const from = nodes.find(n => n.id === e.from)
  const to = nodes.find(n => n.id === e.to)
  const a = e.aPt || fanchor(from, e.fromSide)
  const b = e.bPt || fanchor(to, e.toSide)
  let pts
  const mid = e.my != null ? e.my : (a.y + b.y) / 2
  switch (e.route) {
    case 'v': pts = a.x === b.x ? [a, b] : [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b]; break
    case 'h': pts = [a, b]; break
    case 'hv': pts = [a, { x: b.x, y: a.y }, b]; break
    case 'vh': pts = [a, { x: a.x, y: b.y }, b]; break
    case 'vhv': pts = [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b]; break
    default: pts = [a, b]
  }
  const svg = `<path class="edge" d="${fpolyPath(pts)}" marker-end="url(#ah)"/>`
  let lbl = ''
  if (e.label) {
    let lx, ly
    if (e.label.pos) { [lx, ly] = e.label.pos } else if (e.route === 'hv' || e.route === 'h') { lx = (a.x + b.x) / 2; ly = a.y - 15 } else { lx = a.x; ly = (a.y + mid) / 2 }
    const w = 176, h = e.label.sub ? 46 : 26
    lbl = `<foreignObject x="${lx - w / 2}" y="${ly - h / 2}" width="${w}" height="${h}" class="fo-lbl">${fBlabelBody(e.label)}</foreignObject>`
  }
  return svg + lbl
}
// Each SVG carries a unique marker id (ah-<n>) so four inline <defs> markers never collide.
function fRenderFlow (f, idx) {
  const mk = 'ah-' + (idx + 1)
  const edges = f.edges.map(e => fRenderEdge(e, f.nodes).replace(/url\(#ah\)/g, `url(#${mk})`)).join('\n')
  const nodes = f.nodes.map(fRenderNode).join('\n')
  const caps = (f.captions || [])
    .map(c => `<foreignObject x="${c.x}" y="${c.top}" width="${c.w}" height="28">${fCapBody(c)}</foreignObject>`)
    .join('\n')
  return `<section class="flow-panel" data-skill="${esc(f.id)}">
    <header class="p-head">
      <div class="p-id"><span class="p-num">${idx + 1}</span><h3 class="mono">${esc(f.id)}</h3>
        <span class="p-tag">${esc(f.tagline)}</span></div>
      <span class="p-when">${esc(f.when)}</span>
    </header>
    <div class="p-diagram">
      <svg viewBox="0 0 ${HOW_W} ${f.height}" width="${HOW_W}" height="${f.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="${mk}" markerWidth="10" markerHeight="10" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M1.5 1.5 L7.5 4.5 L1.5 7.5" fill="none" stroke="var(--line3)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </marker>
        </defs>
        <g class="edges">${edges}</g>
        <g class="caps">${caps}</g>
        <g class="nodes">${nodes}</g>
      </svg>
    </div>
  </section>`
}

const HOW_FLOWS = [
  {
    id: 'kg-init',
    tagline: 'scaffold the board + stand up the first rows',
    when: 'once · when a project has no board yet',
    height: 1188,
    nodes: [
      { id: 's1', type: 'step', cx: HOW_Cx, top: 16, w: 252, h: 54, title: 'Scaffold specboard into the repo', tags: ['vendors tools/ + spec/'] },
      { id: 's2', type: 'step', cx: HOW_Cx, top: 100, w: 252, h: 54, title: 'Install deps · start the board' },
      { id: 's3', type: 'step', cx: HOW_Cx, top: 184, w: 252, h: 54, title: 'Open Init · point at the app' },
      { id: 'd1', type: 'diamond', cx: HOW_Cx, top: 274, w: 208, h: 116, title: 'App already exists?' },
      { id: 'l1', type: 'step', cx: HOW_Lx, top: 456, w: 214, h: 54, title: 'Crawl the running app', state: 'running', tags: ['real browser'] },
      { id: 'l2', type: 'step', cx: HOW_Lx, top: 544, w: 214, h: 58, title: 'Guessed PRDs', tags: ['prd.md · guess'] },
      { id: 'l3', type: 'gate', cx: HOW_Lx, top: 640, w: 250, h: 68, title: 'Accept the requirements', cmp: 'guess → approved' },
      { id: 'l4', type: 'step', cx: HOW_Lx, top: 742, w: 214, h: 58, title: 'Characterization test', tags: ['kg-e2e'] },
      { id: 'r1', type: 'step', cx: HOW_Rx, top: 456, w: 214, h: 54, title: 'Write the first PRD', tags: ['prd.md'] },
      { id: 'r2', type: 'step', cx: HOW_Rx, top: 540, w: 214, h: 54, title: 'Draw the wireframe', tags: ['draft.html · 1280px'] },
      { id: 'r3', type: 'gate', cx: HOW_Rx, top: 624, w: 250, h: 68, title: 'Gate A · is this what I meant?', cmp: 'prd.md ↔ draft.html' },
      { id: 'r4', type: 'step', cx: HOW_Rx, top: 726, w: 214, h: 54, title: 'Build the screen' },
      { id: 'r5', type: 'gate', cx: HOW_Rx, top: 810, w: 250, h: 68, title: 'Gate B · did you build it?', cmp: 'draft.html ↔ screen.png' },
      { id: 'r6', type: 'step', cx: HOW_Rx, top: 912, w: 214, h: 58, title: 'Prove it', tags: ['kg-e2e → screen.png'] },
      { id: 'm1', type: 'step', cx: HOW_Cx, top: 1016, w: 214, h: 54, title: 'Conflicts scan', tags: ['cross-screen'] },
      { id: 'm2', type: 'gate', cx: HOW_Cx, top: 1100, w: 272, h: 68, title: 'Human adjudicates conflicts' }
    ],
    captions: [],
    edges: [
      { from: 's1', fromSide: 'bottom', to: 's2', toSide: 'top', route: 'v' },
      { from: 's2', fromSide: 'bottom', to: 's3', toSide: 'top', route: 'v' },
      { from: 's3', fromSide: 'bottom', to: 'd1', toSide: 'top', route: 'v' },
      { from: 'd1', fromSide: 'left', to: 'l1', toSide: 'top', route: 'hv', label: { t: 'yes · already built', sub: '→ DOCUMENT mode', pos: [372, 314] } },
      { from: 'd1', fromSide: 'right', to: 'r1', toSide: 'top', route: 'hv', label: { t: 'no · greenfield', sub: '→ DESIGN mode', no: true, pos: [844, 314] } },
      { from: 'l1', fromSide: 'bottom', to: 'l2', toSide: 'top', route: 'v' },
      { from: 'l2', fromSide: 'bottom', to: 'l3', toSide: 'top', route: 'v' },
      { from: 'l3', fromSide: 'bottom', to: 'l4', toSide: 'top', route: 'v' },
      { from: 'r1', fromSide: 'bottom', to: 'r2', toSide: 'top', route: 'v' },
      { from: 'r2', fromSide: 'bottom', to: 'r3', toSide: 'top', route: 'v' },
      { from: 'r3', fromSide: 'bottom', to: 'r4', toSide: 'top', route: 'v' },
      { from: 'r4', fromSide: 'bottom', to: 'r5', toSide: 'top', route: 'v' },
      { from: 'r5', fromSide: 'bottom', to: 'r6', toSide: 'top', route: 'v' },
      { from: 'l4', fromSide: 'bottom', to: 'm1', toSide: 'top', route: 'vhv', my: 990 },
      { from: 'r6', fromSide: 'bottom', to: 'm1', toSide: 'top', route: 'vhv', my: 990 },
      { from: 'm1', fromSide: 'bottom', to: 'm2', toSide: 'top', route: 'v' }
    ]
  },
  {
    id: 'kg-e2e',
    tagline: 'author the proving test — red first, then real',
    when: 'per screen · writes column 4, shoots column 3',
    height: 1112,
    nodes: [
      { id: 'e1', type: 'step', cx: HOW_Cx, top: 16, w: 288, h: 54, title: 'Write the FAILING assertion first', tags: ['test.spec.ts'] },
      { id: 'e2', type: 'step', cx: HOW_Cx, top: 100, w: 214, h: 54, title: 'Watch it go RED', state: 'redfail' },
      { id: 'd1', type: 'diamond', cx: HOW_Cx, top: 190, w: 232, h: 116, title: 'Design- or document-mode screen?' },
      { id: 'e3', type: 'step', cx: HOW_Cx, top: 372, w: 316, h: 62, title: 'Assert on DATA, not chrome', note: 'wait for content — prove something DID happen' },
      { id: 'd2', type: 'diamond', cx: HOW_Cx, top: 470, w: 208, h: 116, title: 'Data-driven screen?' },
      { id: 'f1', type: 'step', cx: HOW_Rx, top: 654, w: 232, h: 58, title: 'Seed golden data', state: 'running', tags: ['_seed.ts · seed:e2e'] },
      { id: 'f2', type: 'step', cx: HOW_Rx, top: 750, w: 214, h: 54, title: 'Record golden.json', tags: ['golden.json'] },
      { id: 'f3', type: 'step', cx: HOW_Rx, top: 834, w: 214, h: 54, title: 'Assert EXACT values', state: 'settled' },
      { id: 'g1', type: 'step', cx: HOW_Lx, top: 654, w: 214, h: 54, title: 'Assert behaviour' },
      { id: 'e4', type: 'step', cx: HOW_Cx, top: 942, w: 258, h: 58, title: 'Make it pass — never weaken', state: 'settled' },
      { id: 'e5', type: 'step', cx: HOW_Cx, top: 1032, w: 272, h: 58, title: 'Shoots screen.png', tags: ['column 3 · byproduct'] }
    ],
    edges: [
      { from: 'e1', fromSide: 'bottom', to: 'e2', toSide: 'top', route: 'v' },
      { from: 'e2', fromSide: 'bottom', to: 'd1', toSide: 'top', route: 'v' },
      { from: 'd1', fromSide: 'left', to: 'e3', toSide: 'top', route: 'vhv', bPt: { x: 578, y: 372 }, my: 336, label: { t: 'design', sub: 'drive draft route', plain: true, pos: [460, 330] } },
      { from: 'd1', fromSide: 'right', to: 'e3', toSide: 'top', route: 'vhv', bPt: { x: 638, y: 372 }, my: 336, label: { t: 'document', sub: 'drive live app', plain: true, pos: [756, 330] } },
      { from: 'e3', fromSide: 'bottom', to: 'd2', toSide: 'top', route: 'v' },
      { from: 'd2', fromSide: 'right', to: 'f1', toSide: 'top', route: 'hv', label: { t: 'yes', sub: 'data-driven' } },
      { from: 'd2', fromSide: 'left', to: 'g1', toSide: 'top', route: 'hv', label: { t: 'no', no: true } },
      { from: 'f1', fromSide: 'bottom', to: 'f2', toSide: 'top', route: 'v' },
      { from: 'f2', fromSide: 'bottom', to: 'f3', toSide: 'top', route: 'v' },
      { from: 'f3', fromSide: 'bottom', to: 'e4', toSide: 'top', route: 'vhv', my: 916 },
      { from: 'g1', fromSide: 'bottom', to: 'e4', toSide: 'top', route: 'vhv', my: 916 },
      { from: 'e4', fromSide: 'bottom', to: 'e5', toSide: 'top', route: 'v' }
    ]
  },
  {
    id: 'kg-staff',
    tagline: 'the change discipline — before you touch a screen',
    when: 'before every change · stop & ask in 3 cases',
    height: 1364,
    nodes: [
      { id: 'st1', type: 'step', cx: HOW_Cx, top: 16, w: 272, h: 54, title: 'Read what governs the screen', tags: ['staff briefing'] },
      { id: 'd1', type: 'diamond', cx: HOW_Cx, top: 104, w: 240, h: 124, title: 'Which case is the screen in?' },
      { id: 'a1', type: 'gate', cx: 170, top: 316, w: 234, h: 86, title: 'Ask the human for a requirement' },
      { id: 'a2', type: 'gate', cx: 462, top: 316, w: 234, h: 86, title: 'Human corrects + approves', cmp: 'Gate A' },
      { id: 'a3', type: 'gate', cx: 754, top: 316, w: 234, h: 86, title: 'Human picks the canonical side' },
      { id: 'a4', type: 'step', cx: 1046, top: 316, w: 212, h: 86, title: 'Governed & settled', state: 'settled', note: 'proceed' },
      { id: 'o1', type: 'gate', cx: HOW_Cx, top: 480, w: 300, h: 66, title: '1 · Requirement FIRST', cmp: 'you own meaning' },
      { id: 'o2', type: 'step', cx: HOW_Cx, top: 584, w: 234, h: 54, title: '2 · Write the failing test', tags: ['watch it go red'] },
      { id: 'o3', type: 'step', cx: HOW_Cx, top: 668, w: 234, h: 54, title: '3 · Make it pass', state: 'settled', note: 'never weaken' },
      { id: 'o4', type: 'step', cx: HOW_Cx, top: 752, w: 254, h: 54, title: '4 · Correct the doc in place', tags: ['reason attached'] },
      { id: 'd2', type: 'diamond', cx: HOW_Cx, top: 836, w: 200, h: 112, title: 'Golden data?' },
      { id: 'o5', type: 'gate', cx: HOW_Rx, top: 859, w: 242, h: 66, title: 'Update golden values', cmp: 'you own the values' },
      { id: 'jb', type: 'junction', cx: HOW_Cx, top: 984, w: 10, h: 10 },
      { id: 'cl1', type: 'step', cx: HOW_Cx, top: 1028, w: 260, h: 54, title: "Run the screen's test" },
      { id: 'cl2', type: 'step', cx: HOW_Cx, top: 1112, w: 260, h: 54, title: 'Run the whole suite', state: 'running' },
      { id: 'cl3', type: 'step', cx: HOW_Cx, top: 1196, w: 260, h: 54, title: 'Conflict rescan' },
      { id: 'cl4', type: 'step', cx: HOW_Cx, top: 1280, w: 260, h: 54, title: 'Clear the stale worklist', state: 'settled' }
    ],
    captions: [
      { x: 468, top: 452, w: 280, text: 'CHANGE ORDER — requirement leads', align: 'center' },
      { x: 120, top: 1000, w: 320, text: 'CLOSE THE LOOP — run outward', align: 'left' }
    ],
    edges: [
      { from: 'st1', fromSide: 'bottom', to: 'd1', toSide: 'top', route: 'v' },
      { from: 'd1', fromSide: 'bottom', to: 'a1', toSide: 'top', route: 'vhv', my: 274, label: { t: 'ungoverned', plain: true, pos: [389, 260] } },
      { from: 'd1', fromSide: 'bottom', to: 'a2', toSide: 'top', route: 'vhv', my: 274, label: { t: 'unapproved guess', plain: true, pos: [535, 260] } },
      { from: 'd1', fromSide: 'bottom', to: 'a3', toSide: 'top', route: 'vhv', my: 274, label: { t: 'open contradiction', plain: true, pos: [681, 260] } },
      { from: 'd1', fromSide: 'bottom', to: 'a4', toSide: 'top', route: 'vhv', my: 274, label: { t: 'else — governed', plain: true, pos: [827, 260] } },
      { from: 'a1', fromSide: 'bottom', to: 'o1', toSide: 'top', route: 'vhv', my: 452, bPt: { x: 460, y: 480 } },
      { from: 'a2', fromSide: 'bottom', to: 'o1', toSide: 'top', route: 'v', bPt: { x: 462, y: 480 } },
      { from: 'a3', fromSide: 'bottom', to: 'o1', toSide: 'top', route: 'v', bPt: { x: 754, y: 480 } },
      { from: 'a4', fromSide: 'bottom', to: 'o1', toSide: 'top', route: 'vhv', my: 452, bPt: { x: 756, y: 480 } },
      { from: 'o1', fromSide: 'bottom', to: 'o2', toSide: 'top', route: 'v' },
      { from: 'o2', fromSide: 'bottom', to: 'o3', toSide: 'top', route: 'v' },
      { from: 'o3', fromSide: 'bottom', to: 'o4', toSide: 'top', route: 'v' },
      { from: 'o4', fromSide: 'bottom', to: 'd2', toSide: 'top', route: 'v' },
      { from: 'd2', fromSide: 'right', to: 'o5', toSide: 'left', route: 'h', label: { t: 'yes', pos: [762, 892] } },
      { from: 'd2', fromSide: 'bottom', to: 'jb', toSide: 'top', route: 'v', label: { t: 'no', no: true, pos: [608, 970] } },
      { from: 'o5', fromSide: 'bottom', to: 'jb', toSide: 'top', route: 'vhv', my: 966 },
      { from: 'jb', fromSide: 'bottom', to: 'cl1', toSide: 'top', route: 'v' },
      { from: 'cl1', fromSide: 'bottom', to: 'cl2', toSide: 'top', route: 'v' },
      { from: 'cl2', fromSide: 'bottom', to: 'cl3', toSide: 'top', route: 'v' },
      { from: 'cl3', fromSide: 'bottom', to: 'cl4', toSide: 'top', route: 'v' }
    ]
  },
  {
    id: 'kg-update',
    tagline: 'adopt a new release without clobbering your edits',
    when: 'after the plugin updates · restart on new code',
    height: 1168,
    nodes: [
      { id: 'u1', type: 'step', cx: HOW_Cx, top: 16, w: 280, h: 54, title: 'Compare versions', tags: ['plugin vs _specboard.json'] },
      { id: 'd1', type: 'diamond', cx: HOW_Cx, top: 104, w: 204, h: 112, title: 'Update due?' },
      { id: 'tc', type: 'step', cx: 250, top: 134, w: 214, h: 52, title: 'Already current — done', state: 'settled' },
      { id: 'd2', type: 'diamond', cx: HOW_Cx, top: 268, w: 204, h: 116, title: 'Has a manifest?' },
      { id: 'sm', type: 'step', cx: 950, top: 290, w: 272, h: 72, title: 'Score cached releases', note: '--from-dir <closest base>' },
      { id: 'ur', type: 'step', cx: HOW_Cx, top: 468, w: 384, h: 178, title: 'Update runs — per file',
        rows: [
          { s: 'added', t: 'added — new file dropped in' },
          { s: 'updated', t: 'updated — untouched file refreshed' },
          { s: 'settled', t: 'your local edit kept' },
          { s: 'relook', t: 'CONFLICT → written as <file>.new' }
        ] },
      { id: 'd3', type: 'diamond', cx: HOW_Cx, top: 704, w: 204, h: 112, title: 'Conflicts?' },
      { id: 'mg1', type: 'step', cx: 950, top: 733, w: 232, h: 54, title: 'Merge each .new by graft', state: 'relook' },
      { id: 'mg2', type: 'step', cx: 950, top: 817, w: 214, h: 54, title: 'Delete .new', state: 'settled' },
      { id: 'ur2', type: 'step', cx: HOW_Cx, top: 902, w: 230, h: 54, title: 'Rebuild board.html', state: 'running' },
      { id: 'ur3', type: 'step', cx: HOW_Cx, top: 986, w: 254, h: 54, title: 'Restart the board', state: 'running', tags: ['detached · own port'] },
      { id: 'ur4', type: 'step', cx: HOW_Cx, top: 1070, w: 284, h: 58, title: 'Verify live server on new code', state: 'settled' }
    ],
    edges: [
      { from: 'u1', fromSide: 'bottom', to: 'd1', toSide: 'top', route: 'v' },
      { from: 'd1', fromSide: 'left', to: 'tc', toSide: 'right', route: 'h', label: { t: 'no', sub: 'up to date', no: true, pos: [432, 160] } },
      { from: 'd1', fromSide: 'bottom', to: 'd2', toSide: 'top', route: 'v', label: { t: 'yes', pos: [608, 244] } },
      { from: 'd2', fromSide: 'right', to: 'sm', toSide: 'left', route: 'h', label: { t: 'no', sub: 'no manifest', no: true, pos: [760, 326] } },
      { from: 'd2', fromSide: 'bottom', to: 'ur', toSide: 'top', route: 'v', label: { t: 'yes', sub: 'has manifest', pos: [608, 428] } },
      { from: 'sm', fromSide: 'bottom', to: 'ur', toSide: 'top', route: 'vhv', my: 440 },
      { from: 'ur', fromSide: 'bottom', to: 'd3', toSide: 'top', route: 'v' },
      { from: 'd3', fromSide: 'right', to: 'mg1', toSide: 'left', route: 'h', label: { t: 'yes', pos: [772, 760] } },
      { from: 'mg1', fromSide: 'bottom', to: 'mg2', toSide: 'top', route: 'v' },
      { from: 'mg2', fromSide: 'bottom', to: 'ur2', toSide: 'top', route: 'vhv', my: 888 },
      { from: 'd3', fromSide: 'bottom', to: 'ur2', toSide: 'top', route: 'v', label: { t: 'no', no: true, pos: [608, 878] } },
      { from: 'ur2', fromSide: 'bottom', to: 'ur3', toSide: 'top', route: 'v' },
      { from: 'ur3', fromSide: 'bottom', to: 'ur4', toSide: 'top', route: 'v' }
    ]
  }
]

const howFlowcharts = () => HOW_FLOWS.map(fRenderFlow).join('\n')

// The collapsed default: one compact, clickable summary per skill (name + one-line purpose + a
// "View flow" affordance). data-skill matches the panel's, so the client toggle opens the right one.
const howSkillSummaries = () => HOW_FLOWS.map((f, i) =>
  `<button class="skill-summary" type="button" data-skill="${esc(f.id)}">
      <span class="ss-num">${i + 1}</span>
      <span class="ss-main"><span class="ss-name mono">${esc(f.id)}</span><span class="ss-tag">${esc(f.tagline)}</span></span>
      <span class="ss-when">${esc(f.when)}</span>
      <span class="ss-go">View flow →</span>
    </button>`).join('\n')

const howView = () => `<section class="dt" id="howview" hidden>
  <div class="dth">
    <h2>How does it work</h2>
    <span class="gbn">spec-driven development, made visible</span>
    <span class="grow"></span>
    <button class="close btn">Close<span class="kbd">esc</span></button>
  </div>
  <div class="dtscroll cfscroll">
    <div class="howwrap">

      <!-- The overview (#howoverview): intro, the row, the two lanes, the four COLLAPSED skill summary
           cards, and the project's own skills. Shown at #howitworks; hidden wholesale while a single
           skill's flowchart is shown at #howitworks/<skillId>. -->
      <div id="howoverview">

      <div class="intro">
        <h1>How specboard works</h1>
        <p>Every screen in a project is one <b>row of four columns</b> —
          <span class="spine">PRD</span><span class="arrowtok">→</span><span class="spine">wireframe</span><span class="arrowtok">→</span><span class="spine">screenshot</span><span class="arrowtok">→</span><span class="spine">test</span>.
          There is no status field anywhere: <b>staleness is derived</b>, by comparing a stored approval
          hash against the live content. Edit the PRD and the wireframe goes stale; change the wireframe
          and the screenshot goes stale; touch anything and a green test result goes stale.</p>
        <span class="gates-badge"><span class="dia"></span>Two human gates guard <b>meaning</b> and <b>the build</b>. Everything else, staff do.</span>
        <div class="legend">
          <span class="chip"><span class="mk o"></span>step / artifact</span>
          <span class="chip rev"><span class="mk d"></span>human gate — your turn</span>
          <span class="chip ok"><span class="mk"></span>settled — hashes match</span>
          <span class="chip run"><span class="mk"></span>running — a job in flight</span>
          <span class="chip stale"><span class="mk"></span>stale — needs a re-look</span>
        </div>
      </div>

      <div class="sect">
        <div class="sect-head"><span class="lbl">the row</span>
          <h2>Wherever you start, you are filling in the same four columns</h2><span class="rule"></span></div>
        <div class="spine-banner">${WORKFLOW.spine.map(howSpineCol).join('')}</div>
      </div>

      <div class="sect">
        <div class="sect-head"><span class="lbl">two ways in</span>
          <h2>Greenfield you design forward · brownfield you document what is already there</h2><span class="rule"></span></div>
        <div class="lanes">${WORKFLOW.lanes.map(howLane).join('')}</div>
      </div>

      <!-- The four skills, COLLAPSED to one compact summary each. Clicking a summary NAVIGATES to
           #howitworks/<skillId> (history.pushState + route), which swaps this whole overview for the
           focused #skilldetail page below. The summaries stay put; nothing toggles in place. -->
      <div class="sect">
        <div class="sect-head"><span class="lbl">the four skills</span>
          <h2>Where each one branches, runs, and waits for you</h2><span class="rule"></span></div>

        <div class="skill-list" id="skilllist">
          <p class="flow-lead">Each skill is a small procedure with real forks in it — where it branches,
            where a job runs, and where it <b>stops for you</b>. Pick one to see its flow drawn out.</p>
          <div class="skill-summaries">${howSkillSummaries()}</div>
        </div>
      </div>

      <!-- The four skills above are baked; anything the PROJECT adds under .claude/ is fetched live by
           loadHow and shown here, so this section only appears once there is something to show. -->
      <div class="sect" id="howprojsect" hidden>
        <div class="sect-head"><span class="lbl">this project</span>
          <h2>Skills &amp; agents this project has added</h2><span class="rule"></span></div>
        <div id="howskills"></div>
      </div>

      </div><!-- /#howoverview -->

      <!-- One skill's flowchart as a focused detail PAGE, shown at #howitworks/<skillId>. The panels
           are all baked into the DOM (howFlowcharts); the router gives the routed one .open and hides
           #howoverview. "← How does it work" / Esc / browser Back all return to the #howitworks overview. -->
      <div class="skill-detail" id="skilldetail" hidden>
        <div class="skill-detail-head">
          <button class="btn sm skill-back" id="skillback" type="button">← How does it work</button>
          <div class="flow-legend legend">
            <span class="chip"><span class="mk o"></span>step / artifact</span>
            <span class="chip rev"><span class="mk d"></span>decision — a fork</span>
            <span class="chip rev"><span class="mk d"></span>human gate — your turn</span>
            <span class="chip run"><span class="mk"></span>running — a job in flight</span>
            <span class="chip ok"><span class="mk"></span>settled — passing / approved</span>
            <span class="chip stale"><span class="mk"></span>re-look — a conflict to resolve</span>
          </div>
        </div>
        <div class="skill-flows">${howFlowcharts()}</div>
      </div>

    </div>
  </div>
</section>`

export function build () {
  const screens = allScreens()
  const areas = sortedAreas(screens)
  // The one number that says whether it is your turn: how many screens have the accept gate open.
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
  <div class="cards">${inArea.map(x => card(x.s, x.i)).join('')}</div>
</section>`
  }).join('')

  // The detail is two ends only (board R2): the requirements on the left, the tests that prove them
  // on the right, each pane scrolling on its own. One accept gate above them; a Run-all in the bar.
  // data-screen alongside data-i so the router can open it by name.
  const detail = screens.map((s, i) => `
<section class="dt" data-i="${i}" data-screen="${esc(s.name)}" hidden>
  <div class="dth">
    <h2>${esc(s.title)}</h2>
    <span class="grow"></span>
    <button class="btn turn nextw" data-i="${i}">Next waiting →<span class="kbd">j</span></button>
    <button class="close btn">Close<span class="kbd">esc</span></button>
  </div>
  <div class="dtscroll">
    <div class="dbar dbarhook">
      <span class="t">${esc(s.title)}</span>
      <span class="m">${s.reqs.length} requirement${s.reqs.length === 1 ? '' : 's'} · spec/${esc(s.name)}/</span>
      <span class="grow"></span>
      ${runAll(s.name)}
    </div>
    ${acceptGate(s)}
    <div class="cols">
      ${reqPane(s)}
      ${testPane(s)}
    </div>
  </div>
</section>`).join('')

  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>specboard</title>
<style>${designCss()}</style>
<style>
  /* board layout only — every colour, size and space above comes from spec/_design.css */
  body { width:auto; }
  .wrap { max-width:1200px; margin:0 auto; padding:var(--s6) var(--s6) var(--s8); }
  .empty { padding:var(--s5) var(--s4); font-size:var(--t-sm); color:var(--ink-4); }
  .empty code { font-family:var(--mono); }

  /* the settings menu — the collapse-all toggle lives in a gear the same height as the Conflicts /
     Set up buttons beside it, instead of on its own header row */
  .setwrap { position:relative; display:inline-flex; }
  .gear { padding-left:7px; padding-right:7px; color:var(--ink-3); }
  .gear svg { display:block; }
  .gear[aria-expanded="true"] { border-color:var(--hair-2); background:var(--wash); color:var(--ink); }
  .setmenu { position:absolute; top:calc(100% + 6px); right:0; z-index:30; min-width:186px;
    display:flex; flex-direction:column; gap:2px; padding:var(--s2);
    background:var(--paper); border:1px solid var(--hair-2); border-radius:var(--r-md);
    box-shadow:var(--sh-lg); }
  .setmenu[hidden] { display:none; }
  .setitem { display:flex; align-items:center; width:100%; text-align:left; border:0;
    background:transparent; cursor:pointer; color:var(--ink-2); border-radius:var(--r-sm);
    padding:var(--s2) var(--s3); font:400 var(--t-sm)/1.4 var(--sans); }
  .setitem:hover { background:var(--wash); color:var(--ink); }
  /* the Conflicts count badge sits INSIDE its button; its taller line-box would push that button
     past Set up and the gear, so pin the badge to the text line and the three controls line up */
  .top .btn .chip { padding-top:0; padding-bottom:0; line-height:1.3; }
  /* update-available affordance — the vendored board updates with a CLICK, never a terminal command. */
  .updwrap { display:inline-flex; align-items:center; gap:var(--s2); }
  .updsetup { max-width:1120px; margin:0 auto var(--s4); font-size:var(--t-sm); color:var(--ink-4); }
  .updsetup.avail { color:var(--ai); }
  .gbn { font-size:var(--t-sm); color:var(--ink-4); }
  .none { display:none; padding:var(--s8) 0; text-align:center; color:var(--ink-4); font-size:var(--t-md); }
  .clear { display:flex; align-items:center; gap:var(--s3); background:var(--koke-tint);
    border:1px solid var(--koke-line); border-radius:var(--r-md); padding:var(--s3) var(--s4);
    margin-bottom:var(--s4); font-size:var(--t-sm); color:var(--koke); }
  .qwrap { position:relative; display:inline-flex; align-items:center; }
  .qx { position:absolute; right:6px; border:0; background:transparent; cursor:pointer;
    color:var(--ink-4); font-size:var(--t-sm); padding:2px 4px; line-height:1; display:none; }
  .qwrap.has .qx { display:block; }

  /* HOME — screens grouped into named areas, one CARD per screen (board R1). No column strip. */
  .grp { margin-bottom:var(--s2); }
  .grp.gone { display:none; }
  .grph { display:flex; align-items:center; gap:var(--s3); padding:var(--s6) 0 var(--s3); }
  .gc { font-size:var(--t-sm); color:var(--ink-4); }
  .gwait { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-sm); color:var(--ai); }
  .tw { border:0; background:transparent; color:var(--ink-4); cursor:pointer;
    font-size:var(--t-sm); padding:0; width:12px; line-height:1; }
  .grp.shut .cards { display:none; }
  .cards { display:flex; flex-direction:column; gap:var(--s4); }
  .card { display:grid; grid-template-columns:1fr 260px; gap:var(--s5); background:var(--card);
    border:1px solid var(--hair); border-radius:var(--r-md); padding:var(--s4) var(--s5); cursor:pointer;
    transition:border-color .12s, box-shadow .12s; }
  .card:hover { border-color:var(--hair-2); box-shadow:var(--sh-md); }
  .card.gone { display:none; }
  .card .cd { display:flex; align-items:center; gap:var(--s2); margin-bottom:var(--s3); }
  .card .nm { font-size:var(--t-lg); letter-spacing:-.02em; }
  .card .pcount { margin-left:auto; }
  .rl { list-style:none; display:flex; flex-direction:column; gap:5px; margin:0; padding:0; }
  .rl li { display:flex; gap:var(--s2); align-items:baseline; font-size:var(--t-sm); color:var(--ink-2); }
  .rl li .id { font:var(--t-micro) var(--mono); color:var(--ink-4); width:24px; flex:none; }
  .cshot { aspect-ratio:16/10; border-radius:var(--r); border:1px solid var(--hair-2); overflow:hidden;
    background:linear-gradient(135deg,var(--wash),var(--sunk)); position:relative; }
  .cshot img { width:100%; height:100%; object-fit:cover; object-position:top left; display:block; }
  .cshot .play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:18px; color:var(--ink-4); }

  /* DETAIL — a fixed window: header, the one accept gate, two independently scrolling panes (R2) */
  .dt { position:fixed; inset:0; background:var(--canvas); z-index:20; display:flex; flex-direction:column; }
  /* An author display declaration beats the hidden attribute's UA display:none, so a hidden detail
     really disappears rather than every one stacking. */
  .dt[hidden] { display:none; }
  .dth { flex:none; display:flex; align-items:center; gap:var(--s3);
    width:100%; max-width:1200px; margin:0 auto; padding:var(--s4) var(--s6);
    border-bottom:1px solid var(--hair); background:var(--paper); }
  .dtscroll { flex:1; overflow:auto; }
  .dtscroll > .dbar, .dtscroll > .gate, .dtscroll > .cols {
    width:100%; max-width:1200px; margin-left:auto; margin-right:auto; }
  .dtscroll { padding:var(--s5) var(--s6) var(--s5); }
  .dbar { display:flex; align-items:center; gap:var(--s4); padding:0 var(--s2) var(--s4); }
  .dbar .t { font-size:var(--t-xl); letter-spacing:-.02em; }
  .dbar .m { font:var(--t-xs) var(--mono); color:var(--ink-4); }

  /* the ONE gate (board R8) — indigo = your turn; the settled state wears moss */
  .gate { display:flex; align-items:center; gap:var(--s3); border-radius:var(--r-md);
    padding:var(--s3) var(--s4); margin-bottom:var(--s4); }
  .gate.open { background:var(--ai-tint); border:1px solid var(--ai-line); border-left:3px solid var(--ai); }
  .gate.ok { background:var(--koke-tint); border:1px solid var(--koke-line); border-left:3px solid var(--koke); }
  .gate .g1 { font-weight:600; color:var(--ai); white-space:nowrap; }
  .gate .g2 { color:var(--ink-2); font-size:var(--t-sm); }

  /* two columns, each a FIXED height so each pane scrolls on its OWN — scrolling one never moves the
     other, neither scrolls the page, and both headers stay pinned (board R2) */
  .cols { display:grid; grid-template-columns:minmax(0,40%) minmax(0,60%); gap:var(--s4);
    height:calc(100vh - 236px); min-height:340px; }
  .pane { background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
    overflow-y:auto; overflow-x:hidden; padding-bottom:var(--s6); }
  .pane > h2 { position:sticky; top:0; z-index:2; background:var(--card);
    font:var(--t-xs) var(--mono); text-transform:uppercase; letter-spacing:.09em; color:var(--ink-4);
    padding:var(--s3) var(--s4); border-bottom:1px solid var(--hair); display:flex; align-items:center; gap:var(--s2); }
  .pane > h2 .s { margin-left:auto; text-transform:none; letter-spacing:0; }

  /* requirements — the TITLE until clicked, then the full markdown (board R3) */
  .req { border-bottom:1px solid var(--hair); }
  .req:last-child { border-bottom:0; }
  .req > .h { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4); cursor:pointer; }
  .req > .h:hover { background:var(--wash); }
  .req.hot > .h { background:var(--ai-tint); }
  .req .h .chip { padding:3px; }
  .req .id { font:var(--t-micro) var(--mono); color:var(--ink-4); width:24px; flex:none; }
  .req .rt { flex:1; font-size:var(--t-md); color:var(--ink); }
  .req .chev { color:var(--ink-4); font-size:11px; transition:transform .12s; }
  .req.open .chev { transform:rotate(90deg); }
  .req .body { display:none; padding:0 var(--s4) var(--s4) calc(var(--s4) + 24px + var(--s3));
    font-size:var(--t-sm); line-height:1.7; color:var(--ink-2); }
  .req.open .body { display:block; }
  .req .body p { margin:0 0 var(--s2); }
  .req .body ul { margin:0 0 var(--s2) var(--s4); padding-left:var(--s3); }
  .req .body li { margin:0 0 3px; }
  .req .body strong { color:var(--ink); font-weight:600; }
  .req .body em { color:var(--ink-4); font-style:normal; }
  .req .body code { font:var(--t-xs) var(--mono); background:var(--sunk); border:1px solid var(--hair);
    border-radius:var(--r-sm); padding:1px 5px; }
  .req .body .cmt { font:var(--t-micro) var(--mono); color:var(--ink-3); background:var(--wash);
    border-radius:var(--r-sm); padding:0 5px; white-space:pre-wrap; }
  .covers { margin-top:var(--s3); font:var(--t-micro) var(--mono); color:var(--ink-4);
    display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .covers .ctag { background:var(--wash); color:var(--ink-3); border-radius:var(--r-sm); padding:1px 6px; }
  .covers .nocov { color:var(--ink-4); }

  /* a test — collapsible: title + coverage tags + status when closed; open to a recording, run/watch,
     the fold of steps, and a link to the full log (board R3/R10) */
  .test { border-bottom:1px solid var(--hair); padding:var(--s3) var(--s4); }
  .test:last-child { border-bottom:0; }
  .test.hot { background:var(--ai-tint); }
  .test > .th { cursor:pointer; }
  .throw { display:flex; align-items:center; gap:var(--s3); }
  .test > .th:hover .ttl { color:var(--ai); }
  .throw .chev { color:var(--ink-4); font-size:11px; transition:transform .12s; flex:none; }
  .test.open .throw .chev { transform:rotate(90deg); }
  .ttl { flex:1; font-size:var(--t-md); color:var(--ink); }
  .throw .tags { flex:none; }
  .tbody { display:none; margin-top:var(--s3); }
  .test.open .tbody { display:block; }
  .trow2 { display:flex; gap:var(--s4); align-items:center; }
  .rec { position:relative; width:150px; aspect-ratio:16/9; flex:none; border-radius:var(--r);
    border:1px solid var(--hair-2); overflow:hidden; cursor:pointer;
    background:linear-gradient(135deg,var(--wash),var(--sunk)); }
  .rec .play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:20px; color:var(--ink-4); }
  .rec .lab { position:absolute; bottom:5px; right:7px; font:var(--t-micro) var(--mono); color:var(--ink-3);
    background:var(--paper); padding:0 5px; border-radius:3px; }
  .tsub { font:var(--t-micro) var(--mono); color:var(--ink-4); }
  .tags { display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
  /* coverage refs — quiet, NEUTRAL metadata (indigo is reserved for "your turn"). They tint only
     when you hover the test, tying it to the requirement on the left. */
  .tag { font:var(--t-micro) var(--mono); padding:1px 7px; border-radius:var(--r-sm);
    background:var(--wash); color:var(--ink-3); transition:background .12s, color .12s; }
  .test:hover .th .tag, .test.hot .th .tag { background:var(--ai-tint); color:var(--ai); }
  .test .tacts { opacity:1; margin-left:0; }
  .loglink { font:var(--t-xs) var(--sans); color:var(--ai); cursor:pointer; display:inline-flex;
    gap:6px; align-items:center; margin-top:var(--s3); }
  .loglink:hover { text-decoration:underline; }
  .fold { margin-top:var(--s3); }

  /* the full log opens in a FLOATING window, not a full-viewport scrim — the board stays visible
     behind it. Close / Esc / a click off the card dismiss it (board R10). */
  .sheet { display:none; }
  .sheet.on { display:block; }
  .sheet .box { position:fixed; z-index:50; top:8vh; left:50%; transform:translateX(-50%);
    width:720px; max-width:calc(100vw - 48px); max-height:80vh;
    background:var(--card); border:1px solid var(--hair-2); border-radius:var(--r-lg);
    box-shadow:var(--sh-lg); display:flex; flex-direction:column; overflow:hidden; }
  .sheet .bh { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4);
    border-bottom:1px solid var(--hair); }
  .sheet .bh strong { font-size:var(--t-md); }
  .sheet .bb { padding:var(--s4); overflow:auto; }
  .sheet .bb:empty:before { content:"No runs recorded for this test yet."; color:var(--ink-4); font-size:var(--t-sm); }
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
  /* the case's OWN log, collapsed behind a native disclosure — the whole thing it printed, kept from
     the latest run, so a failure can be read here without running it again (dispatch R8) */
  .tstlog { margin:var(--s2) 0 0 14px; }
  .tstlog:empty { display:none; }
  .tstlog summary { font:var(--t-xs)/1.4 var(--sans); color:var(--ink-4); cursor:pointer; }
  .tstlog summary:hover { color:var(--ink-2); }
  .tstlog pre { margin:var(--s2) 0 0; padding:var(--s2) var(--s3); background:var(--sunk);
    border:1px solid var(--hair); border-radius:var(--r-sm); max-height:280px; overflow:auto;
    font:var(--t-xs)/1.6 var(--mono); color:var(--ink-3); white-space:pre-wrap; }
  /* the case's last ten runs, newest first — each headed with when, how long, and on what commit */
  .lghist { list-style:none; margin:var(--s2) 0 0; padding:0; }
  .lghist li { padding:var(--s2) 0 0; border-top:1px solid var(--hair); margin-top:var(--s2); }
  .lghist li:first-child { border-top:0; margin-top:0; padding-top:0; }
  .lghist .lgh { display:flex; align-items:baseline; gap:var(--s2);
    font:var(--t-xs)/1.5 var(--mono); color:var(--ink-4); }
  .lghist .lgh .mark { color:var(--koke); }
  .lghist .lgh .mark.o { color:var(--bengara); }
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

  /* how does it work -----------------------------------------------------
     A description of the specboard method, scoped under #howview so its own chip/legend/flow styles
     never leak onto the board's global .chip/.flow/.col — every rule below is tied to this one view.
     Colours, sizes and radii all come from the inlined _design.css tokens; no raw hex here either. */
  #howview .howwrap { max-width:1180px; margin:0 auto; padding:var(--s2) 0 var(--s7); }
  #howview .howwrap :is(h1,h2,h3) { font-weight:400; letter-spacing:-.02em; margin:0; }
  #howview .howwrap p { margin:0; }
  #howview .intro { max-width:860px; margin-top:var(--s2); }
  #howview .intro h1 { font-size:var(--t-xl); margin-bottom:var(--s3); }
  #howview .intro p { color:var(--ink-2); font-size:var(--t-lg); line-height:1.5; }
  #howview .intro .spine { color:var(--ink); }
  #howview .arrowtok { color:var(--ink-4); padding:0 2px; }
  /* the ONE inverted element on this screen — the concept the whole tool turns on */
  #howview .gates-badge { display:inline-flex; align-items:center; gap:var(--s2); margin-top:var(--s4);
    background:var(--ai); color:var(--paper); border-radius:var(--r); padding:6px var(--s3); font-size:var(--t-sm); }
  #howview .gates-badge .dia { width:8px; height:8px; background:var(--paper); transform:rotate(45deg); flex:none; }

  /* legend — every hue also carries a mark, never colour alone */
  #howview .legend { display:flex; flex-wrap:wrap; gap:var(--s2); margin-top:var(--s5); }
  #howview .legend .chip { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-xs);
    line-height:1.4; padding:3px var(--s2); background:var(--wash); color:var(--ink-3);
    border-radius:var(--r-sm); white-space:nowrap; box-shadow:none; }
  #howview .legend .chip.rev { background:var(--ai-tint); color:var(--ai); box-shadow:inset 0 0 0 1px var(--ai-line); }
  #howview .legend .chip.ok { background:var(--koke-tint); color:var(--koke); box-shadow:inset 0 0 0 1px var(--koke-line); }
  #howview .legend .chip.run { background:var(--yamabuki-tint); color:var(--yamabuki); box-shadow:inset 0 0 0 1px var(--yamabuki-line); }
  #howview .legend .chip.stale { background:var(--bengara-tint); color:var(--bengara); box-shadow:inset 0 0 0 1px var(--bengara-line); }
  #howview .mk { width:6px; height:6px; flex:none; background:currentColor; }
  #howview .mk.o { background:transparent; box-shadow:inset 0 0 0 1px currentColor; }
  #howview .mk.d { transform:rotate(45deg); }
  #howview .mk.n { height:1px; }

  /* section heads */
  #howview .sect { margin-top:var(--s7); }
  #howview .sect-head { display:flex; align-items:baseline; gap:var(--s3); margin-bottom:var(--s4); }
  #howview .sect-head h2 { font-size:var(--t-lg); }
  #howview .sect-head .lbl { position:relative; top:-1px; }
  #howview .rule { height:1px; background:var(--hair); flex:1; align-self:center; }

  /* the shared spine banner */
  #howview .spine-banner { display:flex; align-items:stretch; border:1px solid var(--hair);
    border-radius:var(--r-md); background:var(--paper); overflow:hidden; margin-bottom:var(--s5); }
  #howview .col { flex:1; padding:var(--s3) var(--s4); }
  #howview .col + .col { border-left:1px solid var(--hair); }
  #howview .col .num { font-size:var(--t-micro); color:var(--ink-4); letter-spacing:.16em; }
  #howview .col h3 { margin-top:2px; font-size:var(--t-md); }
  #howview .col .file { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink-4); }
  #howview .col.g { background:var(--ai-tint); }
  #howview .gate-tag { display:inline-flex; align-items:center; gap:5px; margin-top:6px;
    font-size:var(--t-micro); letter-spacing:.12em; text-transform:uppercase; color:var(--ai); }
  #howview .gate-tag .dia { width:7px; height:7px; background:var(--ai); transform:rotate(45deg); flex:none; }

  /* two-lane workflow diagram */
  #howview .lanes { display:grid; grid-template-columns:1fr 1fr; gap:var(--s5); }
  #howview .lane { border:1px solid var(--hair); border-radius:var(--r-md); background:var(--paper);
    padding:var(--s5) var(--s5) var(--s6); }
  #howview .lane-head { display:flex; align-items:center; gap:var(--s3); margin-bottom:var(--s2); }
  #howview .mode { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-xs);
    letter-spacing:.14em; text-transform:uppercase; color:var(--ink); border:1px solid var(--hair-2);
    border-radius:var(--r-sm); padding:3px var(--s2); }
  #howview .mode .mk { background:var(--ink); }
  #howview .lane-sub { color:var(--ink-3); font-size:var(--t-sm); margin-bottom:var(--s4); }
  #howview .flow { display:flex; flex-direction:column; align-items:stretch; }
  #howview .node { border:1px solid var(--hair); border-radius:var(--r); background:var(--paper);
    padding:var(--s3) var(--s3) var(--s3) var(--s4); position:relative; }
  #howview .node .kick { display:flex; align-items:center; gap:var(--s2); margin-bottom:3px; flex-wrap:wrap; }
  #howview .node .skill { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink);
    background:var(--wash); border-radius:var(--r-sm); padding:1px 6px; }
  #howview .node .file { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink-4); }
  #howview .node h3 { font-size:var(--t-md); }
  #howview .node p { color:var(--ink-2); font-size:var(--t-sm); margin-top:2px; }
  #howview .node .mono { font-family:var(--mono); font-size:.9em; }
  /* the gate node — the human decision point, deliberately unlike a step */
  #howview .node.gate { background:var(--ai-tint); border:1px solid var(--ai-line); border-left:4px solid var(--ai); }
  #howview .node.gate .ghead { display:flex; align-items:center; gap:6px; margin-bottom:3px; }
  #howview .node.gate .glbl { font-size:var(--t-micro); letter-spacing:.14em; text-transform:uppercase; color:var(--ai); }
  #howview .node.gate .dia { width:9px; height:9px; background:var(--ai); transform:rotate(45deg); flex:none; }
  #howview .node.gate h3 { color:var(--ai); }
  #howview .node.gate .cmp { margin-top:6px; font-family:var(--mono); font-size:var(--t-xs); color:var(--ai); }
  /* the connector between nodes — a real drawn arrow */
  #howview .arrow { display:flex; justify-content:center; padding:var(--s1) 0; }
  #howview .arrow svg { display:block; }
  #howview .arrow .ln, #howview .arrow .hd { stroke:var(--line3); stroke-width:1; fill:none; }
  #howview .arrow.lbl-arrow { position:relative; }
  #howview .arrow .side { position:absolute; left:calc(50% + 14px); top:50%; transform:translateY(-50%);
    font-size:var(--t-micro); color:var(--ink-4); white-space:nowrap; }
  /* the ongoing-discipline band inside lane 2 */
  #howview .band { margin-top:var(--s4); padding-top:var(--s4); border-top:1px dashed var(--hair-2); }
  #howview .band-lbl { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-micro);
    letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3); margin-bottom:var(--s3); }
  #howview .loop { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink-4); }

  /* project skills/agents — the ONE live group, fetched (the four specboard skills are the flowcharts) */
  #howview .skills { display:grid; grid-template-columns:repeat(4,1fr); gap:var(--s4); }
  #howview .scard { border:1px solid var(--hair); border-radius:var(--r-md); background:var(--paper);
    padding:var(--s4); display:flex; flex-direction:column; gap:6px; }
  #howview .scard .stag { font-size:var(--t-micro); letter-spacing:.16em; text-transform:uppercase; color:var(--ink-4); }
  #howview .scard h3 { font-family:var(--mono); font-size:var(--t-md); color:var(--ink); letter-spacing:-.01em; }
  #howview .scard p { color:var(--ink-2); font-size:var(--t-sm); }
  #howview .scard .when { margin-top:auto; padding-top:var(--s2); border-top:1px solid var(--hair);
    font-size:var(--t-xs); color:var(--ink-4); }

  /* the four skills as flowcharts — baked static SVG/HTML (howFlowcharts). Every rule is scoped under
     #howview so its diagram-only classes never touch the board's globals, and it borrows the same
     design tokens. Colours ride shape + hue + label together, never hue alone. */
  #howview .flow-lead { max-width:900px; margin-top:var(--s3); color:var(--ink-2); font-size:var(--t-md); }
  #howview .flow-lead b { color:var(--ink); }
  #howview .flow-legend { margin-top:var(--s4); margin-bottom:var(--s5); }
  #howview .skill-flows { display:flex; flex-direction:column; }

  /* progressive disclosure — collapsed summaries by default; one flowchart opens on click */
  #howview .skill-summaries { display:flex; flex-direction:column; gap:var(--s3); margin-top:var(--s5); }
  #howview .skill-summary { display:flex; align-items:center; gap:var(--s4); width:100%; text-align:left;
    border:1px solid var(--hair); border-radius:var(--r-md); background:var(--paper); cursor:pointer;
    padding:var(--s4) var(--s5); font-family:inherit; color:var(--ink); transition:border-color .12s ease; }
  #howview .skill-summary:hover, #howview .skill-summary:focus-visible { border-color:var(--ai-line); outline:none; }
  #howview .ss-num { width:22px; height:22px; flex:none; display:inline-flex; align-items:center;
    justify-content:center; border:1px solid var(--hair-2); border-radius:50%; font-size:var(--t-xs); color:var(--ink-3); }
  #howview .ss-main { display:flex; flex-direction:column; gap:2px; min-width:0; }
  #howview .ss-name { font-family:var(--mono); font-size:var(--t-md); color:var(--ink); letter-spacing:-.01em; }
  #howview .ss-tag { font-size:var(--t-sm); color:var(--ink-2); }
  #howview .ss-when { margin-left:auto; font-size:var(--t-xs); color:var(--ink-4); letter-spacing:.02em; white-space:nowrap; }
  #howview .ss-go { flex:none; font-size:var(--t-sm); color:var(--ai); }
  /* detail — the back control sits inline with the diagram legend; only the .open panel shows */
  #howview .skill-detail-head { display:flex; align-items:center; gap:var(--s4); flex-wrap:wrap; margin-bottom:var(--s5); }
  #howview .skill-detail-head .flow-legend { margin:0; }
  #howview .skill-flows .flow-panel { display:none; }
  #howview .skill-flows .flow-panel.open { display:block; }

  #howview .flow-panel { border:1px solid var(--hair); border-radius:var(--r-md); background:var(--paper);
    overflow:hidden; margin-bottom:var(--s5); }
  #howview .flow-panel:last-child { margin-bottom:0; }
  #howview .p-head { display:flex; align-items:center; gap:var(--s3); padding:var(--s4) var(--s5);
    border-bottom:1px solid var(--hair); background:var(--canvas); }
  #howview .p-id { display:flex; align-items:baseline; gap:var(--s3); }
  #howview .p-num { width:20px; height:20px; flex:none; display:inline-flex; align-items:center;
    justify-content:center; border:1px solid var(--hair-2); border-radius:50%; font-size:var(--t-xs);
    color:var(--ink-3); position:relative; top:3px; }
  #howview .p-head h3 { font-size:var(--t-lg); color:var(--ink); }
  #howview .p-tag { font-size:var(--t-sm); color:var(--ink-3); }
  #howview .p-when { margin-left:auto; font-size:var(--t-xs); color:var(--ink-4); letter-spacing:.02em; }
  #howview .p-diagram { padding:var(--s5) var(--s5) var(--s6); }
  /* the SVG is authored at 1216 wide; scale it to the column so the diagram never scrolls sideways */
  #howview .p-diagram svg { display:block; width:100%; height:auto; max-width:100%; }

  /* connectors */
  #howview .edge { fill:none; stroke:var(--line3); stroke-width:1.3; stroke-linecap:round; stroke-linejoin:round; }
  #howview .dia-shape { fill:var(--ai-tint); stroke:var(--ai); stroke-width:1.5; }
  #howview .jdot { fill:var(--paper); stroke:var(--line3); stroke-width:1.3; }

  /* node bodies (inside foreignObject) */
  #howview .nb { width:100%; height:100%; border-radius:var(--r); padding:var(--s2) var(--s3);
    display:flex; flex-direction:column; justify-content:center; gap:3px; overflow:hidden; }
  #howview .nb.step { background:var(--paper); border:1px solid var(--hair-2); }
  #howview .nb-title { font-size:var(--t-sm); line-height:1.28; color:var(--ink); letter-spacing:-.01em; }
  #howview .nb-title.ai { color:var(--ai); }
  #howview .nb-note { font-size:var(--t-xs); color:var(--ink-3); line-height:1.3; }
  #howview .nb-foot { display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-top:1px; }
  #howview .flow-panel .tag { display:inline-flex; align-items:center; font-size:var(--t-micro);
    color:var(--ink-2); background:var(--wash); border-radius:var(--r-sm); padding:1px 6px; letter-spacing:-.01em; }
  #howview .schip { display:inline-flex; align-items:center; gap:5px; font-size:var(--t-micro);
    padding:1px 6px; border-radius:var(--r-sm); letter-spacing:.01em; }
  #howview .schip .mk { width:6px; height:6px; }
  #howview .schip.s-running { background:var(--yamabuki-tint); color:var(--yamabuki); box-shadow:inset 0 0 0 1px var(--yamabuki-line); }
  #howview .schip.s-settled { background:var(--koke-tint); color:var(--koke); box-shadow:inset 0 0 0 1px var(--koke-line); }
  #howview .schip.s-relook { background:var(--bengara-tint); color:var(--bengara); box-shadow:inset 0 0 0 1px var(--bengara-line); }
  #howview .schip.s-redfail { background:var(--bengara-tint); color:var(--bengara); box-shadow:inset 0 0 0 1px var(--bengara-line); }
  /* left bar carries the hue, redundant with the chip so hue never rides alone */
  #howview .nb.s-running { border-left:3px solid var(--yamabuki); }
  #howview .nb.s-settled { border-left:3px solid var(--koke); }
  #howview .nb.s-relook { border-left:3px solid var(--bengara); }
  #howview .nb.s-redfail { border-left:3px solid var(--bengara); }

  /* gate node — the human decision point, a tint (never a second inverted element) */
  #howview .nb.gate { background:var(--ai-tint); border:1px solid var(--ai-line); border-left:4px solid var(--ai); }
  #howview .glbl { display:flex; align-items:center; gap:6px; font-size:var(--t-micro); letter-spacing:.13em;
    text-transform:uppercase; color:var(--ai); }
  #howview .glbl .dia { width:8px; height:8px; background:var(--ai); transform:rotate(45deg); flex:none; }
  #howview .cmp { font-size:var(--t-micro); color:var(--ai); opacity:.85; }

  /* diamond text */
  #howview .nb.dbody { align-items:center; text-align:center; justify-content:center; gap:2px; padding:0; background:transparent; }
  #howview .dkick { display:flex; align-items:center; gap:5px; font-size:9.5px; letter-spacing:.13em;
    text-transform:uppercase; color:var(--ai); opacity:.85; }
  #howview .dkick .ddia { width:6px; height:6px; background:var(--ai); transform:rotate(45deg); flex:none; }
  #howview .nb.dbody .nb-title { text-align:center; font-size:var(--t-sm); }

  /* per-file rows inside the kg-update node (scoped tight so the board's global .frow never bleeds in) */
  #howview .frows { display:flex; flex-direction:column; gap:4px; margin-top:2px; }
  #howview .nb .frow { display:flex; align-items:center; gap:7px; padding:0; border-top:0;
    font-size:var(--t-xs); color:var(--ink-2); line-height:1.25; }
  #howview .fmk { width:8px; height:8px; flex:none; border-radius:2px; }
  #howview .fmk.s-added { background:transparent; box-shadow:inset 0 0 0 1px var(--line3); }
  #howview .fmk.s-updated { background:var(--ai-tint); box-shadow:inset 0 0 0 1px var(--ai-line); }
  #howview .fmk.s-settled { background:var(--koke); }
  #howview .fmk.s-relook { background:var(--bengara); }
  #howview .ftxt { letter-spacing:-.01em; }

  /* phase captions floating where no connector runs */
  #howview .cap { display:flex; align-items:center; gap:7px; font-size:var(--t-micro); letter-spacing:.13em;
    text-transform:uppercase; color:var(--ink-3); white-space:nowrap; height:100%; }
  #howview .cap.center { justify-content:center; }
  #howview .cap.left { justify-content:flex-start; }
  #howview .cap.right { justify-content:flex-end; }

  /* branch labels riding the arrows */
  #howview .fo-lbl { overflow:visible; }
  #howview .blwrap { display:flex; align-items:center; justify-content:center; height:100%; }
  #howview .blabel { display:inline-flex; align-items:center; gap:5px; font-size:var(--t-micro); line-height:1.15;
    padding:2px 7px; border-radius:var(--r-sm); white-space:nowrap;
    background:var(--ai-tint); color:var(--ai); box-shadow:inset 0 0 0 1px var(--ai-line); }
  #howview .blabel .bdia { width:6px; height:6px; background:currentColor; transform:rotate(45deg); flex:none; }
  #howview .blabel.no { background:var(--bengara-tint); color:var(--bengara); box-shadow:inset 0 0 0 1px var(--bengara-line); }
  #howview .blabel.plain { background:var(--wash); color:var(--ink-2); box-shadow:inset 0 0 0 1px var(--hair-2); }
  #howview .bl-sub { color:inherit; opacity:.7; font-size:10px; margin-left:2px; }
</style>

<div class="top">
  <div class="brand"><span class="logo"></span>specboard</div>
  <span class="crumb">specboard · dogfooding itself</span>
  <span class="grow"></span>
  <span class="chip run" id="runflag" hidden><span class="dot"></span>running — click to watch</span>
  <span id="shown" class="gbn" style="min-width:64px;text-align:right"></span>
  <span class="qwrap"><input id="q" class="input" style="width:250px"
    placeholder="Search screens and requirements"><button class="qx" id="qx" aria-label="clear">✕</button></span>
  <span class="updwrap" id="updwrap" hidden>
    <span class="gbn" id="updmsg"></span>
    <button class="btn sm turn" id="updbtn">Update</button>
  </span>
  <button class="btn sm" id="cfbtn">Conflicts<span class="chip stale cfn" id="cfcount" hidden></span></button>
  <button class="btn sm" id="initbtn">Set up</button>
  <button class="btn sm" id="howbtn">How does it work</button>
  <div class="setwrap">
    <button class="btn sm gear" id="setbtn" aria-label="Settings" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
    <div class="setmenu" id="setmenu" hidden>
      <button class="setitem" id="toggle-all">Collapse all</button>
    </div>
  </div>
</div>

<div class="wrap">
  ${yourTurn === 0 && screens.length ? `<div class="clear">
    <span class="chip ok"><span class="dot"></span>queue clear</span>
    Nothing is waiting on you — every screen's requirements are accepted. What proves them is up to the tests.
  </div>` : ''}
  <div id="home">
    ${groups}
  </div>
  <div class="none" id="none">Nothing matches.</div>
</div>

<div class="runpanel" id="runpanel" hidden>
  <div class="rph"><span class="chip run" id="rpchip"><span class="dot"></span>running</span>
    <span id="rptitle">tests</span><span class="grow"></span>
    <button class="btn sm" id="rpcancel">Cancel</button>
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
    <div class="updsetup" id="updsetup" hidden></div>
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

<!-- How does it work — a tool view (#howitworks, no slash) describing the specboard method. The intro,
     spine, lanes and the four skill flowcharts are baked; only a project's own added skills/agents are
     fetched from /api/capabilities and shown as cards below. -->
${howView()}

<div class="lb" id="lb" hidden>
  <div class="lbbar"><span id="lbcap" class="lbcap"></span><span class="grow"></span>
    <button class="btn sm" id="lbzoom">Actual size</button>
    <button class="btn sm gh" id="lbclose">Close<span class="kbd">esc</span></button></div>
  <div class="lbstage" id="lbstage"><img id="lbimg" alt=""></div>
</div>

<!-- The whole log for a test opens HERE, in ONE floating window (board R10) — never a full-viewport
     scrim, so the board stays visible behind it. Close / Esc / a click off the card dismiss it. -->
<div class="sheet" id="logsheet">
  <div class="box">
    <div class="bh"><strong id="logtitle">Full log</strong><span class="grow"></span>
      <button class="btn sm" data-logclose>Close<span class="kbd">esc</span></button></div>
    <div class="bb" id="logbody"></div>
  </div>
</div>
${detail}

<script>
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
  const SCREENS = ${JSON.stringify(screens.map(s => s.name))}
  // The skills that have a baked flowchart page at #howitworks/<id>; an unknown id falls back to overview.
  const SKILL_IDS = ${JSON.stringify(HOW_FLOWS.map(f => f.id))}
  const closeAll = () => document.querySelectorAll('.dt').forEach(d => { d.hidden = true })
  const show = i => {
    closeAll()
    const dt = document.querySelector('.dt[data-i="' + i + '"]')
    if (!dt) return
    dt.hidden = false
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
    const name = decodeURIComponent(location.hash.replace(/^#\\//, ''))
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
  for (const b of document.querySelectorAll('.close'))
    b.addEventListener('click', () => { closeAll(); history.pushState(null, '', location.pathname) })

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
      logsheet.classList.add('on')
    })
  for (const b of document.querySelectorAll('[data-logclose]'))
    b.addEventListener('click', () => logsheet.classList.remove('on'))
  document.addEventListener('keydown', e => { if (e.key === 'Escape') logsheet.classList.remove('on') })
  document.addEventListener('click', e => {
    if (logsheet.classList.contains('on') && !e.target.closest('.box') && !e.target.closest('[data-log]'))
      logsheet.classList.remove('on')
  })

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
      // on a skill detail page, Esc first steps back to the #howitworks overview (real history back)
      if (!document.getElementById('howview').hidden && !document.getElementById('skilldetail').hidden) { history.back(); return }
      closeAll(); history.pushState(null, '', location.pathname)
    }
    const openDt = [...document.querySelectorAll('.dt')].find(d => !d.hidden)
    if (openDt && (e.key === 'j' || e.key === 'ArrowRight')) openDt.querySelector('.nextw').click()
    if (openDt && e.key === 'r') { const b = openDt.querySelector('.runbtn'); if (b) b.click() }
  })

  // gate actions ---------------------------------------------------------
  // The ONE gate (board R8): accept the requirements. It POSTs to the board server, which pins the
  // current PRD text so the reworded state clears and the gate closes. Opened as a plain file the
  // board still renders; it just cannot record a decision, and says so rather than doing nothing.
  function toast (msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg
    document.body.appendChild(t); setTimeout(() => t.remove(), 5000)
  }

  for (const b of document.querySelectorAll('[data-act="accept"]')) {
    b.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/gate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ screen: b.dataset.screen, gate: b.dataset.gate || 'prd', act: 'accept' })
        })
        if (!res.ok) throw new Error((await res.text()).slice(0, 120))
        // Stay on the screen you just accepted — a plain reload lands you back on it showing the
        // gate closed, so you see the result of what you did rather than being whisked elsewhere.
        location.reload()
      } catch (err) {
        toast('Accepting needs the board server — run  npm run board  (' + err.message + ')')
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
    // 'yours' — a real PRD the human wrote — is never touched; a guessed row already on the board is
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

  // update available -> update -------------------------------------------
  // The vendored board is brought to a new specboard release with a CLICK, never a terminal command.
  // /api/update-status reports current vs latest; /api/update runs the plugin's kg-update against this
  // project, rebuilds board.html, and reports. The board is expected to run under node --watch, so
  // update.mjs overwriting tools/serve-board.mjs restarts the process — which drops this request's
  // socket. That is treated as success-in-progress: poll status, then reload onto the new code.
  // Emitted inside the template literal: string concatenation only, \\n for newlines, no backticks.
  const updwrap = document.getElementById('updwrap')
  const updbtn = document.getElementById('updbtn')
  const updmsg = document.getElementById('updmsg')
  const updsetup = document.getElementById('updsetup')
  let updBusy = false

  // the .new files a conflicting update wrote alongside your edits, pulled from update.mjs's report
  function newFilesFrom (report) {
    const out = []
    for (const line of String(report || '').split('\\n')) {
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
  // \\n for a newline, and no backticks (see the conflicts note above).
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
      ? busy + ' is already running — one job at a time, so this one was refused.\\n\\n' +
        'To clear it: press Cancel to stop that job, or wait for it to finish and run this again.\\n' +
        'Its output keeps streaming below.\\n\\n'
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
      rplog.textContent = 'A browser window is opening — it drives the app in front of you.\\n' +
        'It closes itself when the test finishes.\\n\\n'
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
      for (const slot of panel.querySelectorAll('.tstshots')) {
        const one = (rec[slot.dataset.title] || [])[0]
        slot.innerHTML = one
          ? (one.shots || []).map(src => '<img src="' + src + '" loading="lazy" alt="what this test saw">').join('') +
            (one.video ? '<a class="recvid" href="' + one.video + '" target="_blank">▶ recording</a>' : '')
          : ''
        // A picture that no longer exists is worse than no picture: the record is pruned with its
        // run, so a shot can outlive its file and render as a broken-image icon captioned "what
        // this test saw". Show nothing rather than a lie about evidence.
        for (const img of slot.querySelectorAll('img')) {
          img.addEventListener('error', () => img.remove())
        }
      }
      // The DETAIL STEPS of each case, collapsed behind a toggle — every action and check the test
      // ran, in order, indented under its named steps. Expand to see exactly what a case did.
      for (const slot of panel.querySelectorAll('.tststeps')) {
        const one = (rec[slot.dataset.title] || [])[0]
        const steps = (one && one.steps) || []
        if (!steps.length) { slot.innerHTML = ''; continue }
        slot.innerHTML =
          '<button class="stepstog" aria-expanded="false">▸ ' + steps.length + ' steps</button>' +
          '<ol class="stepslist" hidden>' + steps.map(s =>
            '<li class="scat-' + eh((s.cat || '').replace(/[^a-z]/gi, '')) + (s.ok ? '' : ' sf') +
            '" style="margin-left:' + (s.depth * 14) + 'px">' +
            eh(s.label || '') + '</li>').join('') + '</ol>'
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
        // A watch-mode run finishes with the panel still closed (nobody opened it). The board's own
        // rebuild fires a change event that refreshes it, so there is nothing to reload here — and
        // there is no longer any "background" run to announce.
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
  // Validate EVERY emitted script, non-greedily — there are two now (the early head script and the
  // main one), and a greedy match would splice them together with the HTML between and fail to parse.
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try {
      new Function(m[1])
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
