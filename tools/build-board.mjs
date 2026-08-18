// Renders spec/<screen>/ into one self-contained board.html.
//
// Reading and state live in spec-store.mjs; this file only draws. The board inlines the SAME
// spec/_design.css the drafts link, and adds nothing but layout — it is one of the screens this
// tool tracks, so it has no business owning a second design system.

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import {
  ROOT, esc, designCss, allScreens, sortedAreas, writeText
} from './spec-store.mjs'
import { journey } from './journey.mjs'

// A status chip. Hue names the state; a redundant square mark carries it too, so status survives
// greyscale and low vision (design system). tone ∈ ok · stale · gone · bad · rev · run; mark is one
// of the square shapes from _design.css (filled · o hollow · h half · n hairline).
const chip = (tone, mark, label, attrs = '') =>
  `<span class="chip ${tone}"${attrs ? ' ' + attrs : ''}><span class="${mark}"></span>${label}</span>`

// A duration a person can read — "27457ms" is a number to parse, "27.5s" is a fact.
const fmtMs = ms => ms >= 1000 ? (Math.round(ms / 100) / 10) + 's' : Math.round(ms) + 'ms'

// The one-line excerpt under a requirement title (board R3) — the body's first sentence, stripped
// of markdown and author notes, so a collapsed row still says what the requirement is ABOUT.
const excerpt = body => {
  const flat = String(body || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')            // author notes are hints for the test author
    .replace(/[`*_]/g, '')
    .replace(/^\s*[-#>]+\s*/gm, '')
    .replace(/\s+/g, ' ').trim()
  const m = flat.match(/^.{20,150}?[.!?](?=\s|$)/)
  return m ? m[0] : (flat.length > 140 ? flat.slice(0, 140).trimEnd() + '…' : flat)
}

// A requirement's derived STATUS → its header chip (board R4, amended 2026-08-17 at the human's
// direction: the old binary proven/unproven becomes four words, folded by tools/coverage.mjs's
// deriveReqStatus — fail wins, so a requirement covered by both a failing and a passing test still
// reads failed). Every state carries a MARK as well as a hue (hue never alone): passed=moss filled ✓,
// failed=iron half ✗, not-reached=gold hairline ◌ (a flow declared it but stopped before its assertion
// ran), untested=hollow ink ○ (no test tags it at all). Title only, no visible label in Columns — the
// header stays compact; the word lives in the tooltip (List's row spells it out, see LIST_CHIP below).
const REQ_CHIP = {
  passed: ['ok', 'mark', 'Passed — a current passing assertion covers this'],
  failed: ['fail', 'mark h', 'Failed — the covering test failed its assertion'],
  'not-reached': ['wait', 'mark n', 'Not reached — a flow that covers this stopped before it got here'],
  untested: ['gone', 'mark o', 'Untested — no test asserts this yet']
}
const reqChip = status => {
  const [tone, mark, title] = REQ_CHIP[status] || REQ_CHIP.untested
  return `<span class="chip ${tone}" title="${title}"><span class="${mark}"></span></span>`
}

// Home is one CARD per screen (board R1): its name, a proven-count chip, the requirement TITLES, and
// the latest run's recording cover (or the still). There is NO PRD/draft/screen/E2E column strip — the
// card is titles + cover and nothing else. There is no guess/draft chip either (the human, 2026-08-17):
// a drafted PRD is canon the instant it exists, so a card never distinguishes it from one a human wrote.
const card = (s, i) => {
  const M = s.reqs.length
  const proven = s.reqs.filter(r => r.state === 'proven').length
  const done = M > 0 && proven === M
  const q = (s.title + ' ' + s.route + ' ' + s.reqs.map(r => r.title).join(' ')).toLowerCase()
  return `
<div class="card" data-screen="${esc(s.name)}" data-i="${i}" data-q="${esc(q)}">
  <div class="cmain">
    <div class="cd"><span class="nm">${esc(s.title)}</span>
      <span class="chip ${done ? 'ok' : 'gone'} pcount"><span class="mark${done ? '' : ' o'}"></span>${proven} / ${M} proven</span></div>
    <ul class="rl">${s.reqs.slice(0, 5).map(r => `<li><span class="id">${esc(r.id)}</span>${esc(r.title)}</li>`).join('')}${s.reqs.length > 5 ? `<li class="more">… ${s.reqs.length - 5} more</li>` : ''}</ul>
  </div>
  <div class="cshot">${s.hasShot
    ? `<img src="spec/${esc(s.name)}/screen.png?h=${s.shotHash}" alt="${esc(s.title)} — latest run">`
    : '<span class="play">▶</span>'}</div>
</div>`
}

// A step that has no command of its own names the board control that does it, so the one next action
// is a thing you can point at rather than an instruction to go read something. Also feeds Act 4's
// derived CTA (board R12, repurposed) — see wCtaAction below.
const J_ACT = {
  config: 'Set up',
  crawl: 'Crawl',
  prove: 'Run all'
}
// Every step's state, DERIVED in journey.mjs from the tree on this build, never stored. This function
// only DRAWS what it is handed.
//
// The six-step home rail this drew was CUT at the human's direction (board R12, repurposed) — the
// journey now surfaces as Act 4's single derived next action (wCtaAction) instead of a standing
// checklist. journeyRail stays exported and unit-tested directly (tools/journey.test.mjs drives a
// mid-journey shape through it) because the renderer itself is worth keeping proven even unwired;
// it is no longer called from build()'s emitted HTML.
export const journeyRail = j => `
<div id="jrail"${j.folded ? ' hidden' : ''}>
  <div class="jhd"><span class="jttl">Getting started</span>
    <span class="gbn">five steps, each one derived from the tree — nothing is stored</span></div>
  <ol class="jsteps">${j.steps.map((s, n) => `
    <li class="jstep${s.done ? ' done' : s.current ? ' cur' : ''}" data-id="${esc(s.id)}">
      <span class="jtop"><span class="mark${s.done ? '' : s.current ? ' h' : ' o'}"></span><span class="jn">${n + 1}</span><span class="jt">${esc(s.title)}</span></span>
      <span class="jfact">${esc(s.fact)}</span>${s.current
      ? `<span class="jact">${esc(s.cmd || J_ACT[s.id] || '')}</span>` : ''}
    </li>`).join('')}
  </ol>
</div>`

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
    .replace(/<!--[\s\S]*?-->/g, '')                    // author notes are NEVER shown — a requirement is human intent, not a code log
    .replace(/`([^`]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`))
  const out = src.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
    const lines = b.split(/\n/)
    // a block whose FIRST line is a `- ` item is a list. A wrapped item soft-wraps onto
    // continuation lines that do NOT start with a dash — fold those into the current item, so a
    // long bullet stays one <li> instead of collapsing the whole block into a dash-run paragraph.
    if (/^\s*[-*]\s+/.test(lines[0])) {
      const items = []
      for (const l of lines) {
        if (/^\s*[-*]\s+/.test(l)) items.push(l.replace(/^\s*[-*]\s+/, ''))
        else if (items.length) items[items.length - 1] += ' ' + l.trim()
      }
      return `<ul>${items.map(it => `<li>${inline(it)}</li>`).join('')}</ul>`
    }
    return `<p>${inline(b.replace(/\n/g, ' '))}</p>`
  }).join('')
  return out.replace(new RegExp(SENT + '(\\d+)' + SENT, 'g'), (_, i) => holds[Number(i)])
}

// The run-all control for this screen, in the detail bar. Run (headless) is the default; per-test
// Run/Watch buttons and the SSE-streamed run panel live on the test rows (R10).
const runAll = name =>
  `<button class="btn pri runbtn" data-run="${esc(name)}" title="run every test in the background">▶ Run all in background</button>`

// LEFT column (board R2/R3): one requirement per row — its state chip, id and TITLE, always shown;
// the long, formatted description collapses behind it and one click on the header reveals the full
// markdown. An UNPROVEN row's open body ends in an honest "no test asserts this yet" line (R6); a
// proven one ends with the body. A requirement is never faked green.
// (Corrected 2026-08-05: this said an open body "ends in a covers line NAMING the tests that prove
// it". That line was removed from reqRow below — the E2E column already shows the flow — but the
// comment was left behind, and two board tests then asserted a `.covers .ctag` chip that nothing
// renders. A comment describing behaviour the code dropped is how a dead test survives review.)
const reqRow = r => {
  // A proven requirement names NO tests here — the E2E column already shows the flow that proves it,
  // so a "proven by …" line would just repeat it. An UNPROVEN one still says so plainly (board R6):
  // honestly ungreen, never hidden.
  const covers = r.state === 'proven'
    ? ''
    : '<div class="covers"><span class="nocov">no test asserts this yet — honestly ungreen, not hidden</span></div>'
  return `<div class="req" data-r="${esc(r.id)}" data-state="${r.state}" data-status="${esc(r.status)}">
    <div class="h">${reqChip(r.status)}<span class="id">${esc(r.id)}</span><div class="rmain"><span class="rt">${esc(r.title)}</span><div class="rhint">${esc(excerpt(r.body))}</div></div><span class="chev">›</span></div>
    <div class="body">${renderBody(r.body)}${covers}</div>
  </div>`
}
const reqPane = s => `<div class="pane reqpane">
  <h2>Requirements<span class="s">what the screen must do</span></h2>
  ${s.reqs.length ? s.reqs.map(reqRow).join('') : `<div class="empty">No requirements yet — write the first in <code>spec/${esc(s.name)}/prd.md</code>.</div>`}
</div>`

// The LIST view (board R13): the screen's requirements as one compact line each — status, id, title —
// a quick index to scan and jump into Focus from. It is one of THREE views of the same requirements
// (Focus, List, Columns), switched by the header toggle; it stores nothing new. The label spells the
// four-word vocabulary out (board R4, amended 2026-08-17) since this row has room where Columns'
// compact chip does not.
const LIST_CHIP = {
  passed: ['ok', 'mark', '✓ Passed'],
  failed: ['fail', 'mark h', '✗ Failed'],
  'not-reached': ['wait', 'mark n', '◌ Not reached'],
  untested: ['gone', 'mark o', '○ Untested']
}
const listPane = s => `<div class="listview" hidden>
  ${s.reqs.map(r => {
    const [tone, mark, label] = LIST_CHIP[r.status] || LIST_CHIP.untested
    return `<button class="lrow" data-r="${esc(r.id)}" data-state="${r.state}">
      <span class="chip ${tone} lrchip"><span class="${mark}"></span>${label}</span>
      <span class="lrid">${esc(r.id)}</span><span class="lrt">${esc(r.title)}</span><span class="lrchev">›</span>
    </button>`
  }).join('')}
</div>`

// One PLANNED story step, baked from the test's definition (board R10) so it shows before the test
// has run. It renders "pending" (a hollow mark); loadRuns overlays the recorded outcome — passed,
// failed, or not-reached. A flow step carries its author sentence; a prove step carries the
// requirement's title (resolved client-side, since the req row lives in the same document).
const planRow = (st, i) =>
  `<div class="beat pending" data-step="${st.kind}" data-key="${esc(st.kind === 'prove' ? st.id : st.text)}">
    <div class="bh"><span class="bnum">${i + 1}</span><span class="bmk">○</span>${
      st.kind === 'prove' ? `<span class="bid">${esc(st.id)}</span>` : ''
    }<span class="blbl">${esc(st.kind === 'prove' ? st.id : st.text)}</span><span class="bchev">›</span></div>
    <ul class="bdet" hidden></ul>
  </div>`

// RIGHT column (board R3/R5/R10): one test per row, enumerated from the SOURCE plan (so a test
// shows even before it has run), merged with its latest run record `t` when there is one. Leads
// with the flow title, the coverage tags, and a status chip; opens to the recording, the
// Run/Watch/Logs/Steps buttons, and the numbered plan steps (loadRuns overlays outcomes). There is
// no separate screenshot strip — the recording (its still as the cover) is the one artifact.
const testRow = (s, plan, t) => {
  const coverIds = t ? Object.keys(t.reqs || {}) : (plan.covers || [])
  const tags = coverIds.map(qid => {
    const rid = qid.includes(':') ? qid.split(':').pop() : qid
    return `<span class="tag" data-r="${esc(rid)}">${esc(rid)}</span>`
  }).join('')
  const status = !t ? chip('gone', 'mark o', 'not run')
    : t.ok ? chip('ok', 'mark', 'pass') : chip('bad', 'mark o', 'fail')
  const cls = !t ? 'u' : t.ok ? 'p' : 'f'
  const planned = (plan.steps || []).map(planRow).join('')
  return `<div class="test tst ${cls}" data-t="${esc(plan.title)}" data-title="${esc(plan.title)}">
    <div class="th"><div class="throw"><span class="chev">›</span><span class="ttl tt">${esc(plan.title)}</span><div class="tags">${tags}</div>${status}</div><div class="tmeta"></div></div>
    <div class="tbody">
      <div class="trow2">
        <div class="rec"><span class="play">▶</span><span class="lab">${t ? fmtMs(t.ms) : ''}</span></div>
        <span class="grow"></span>
        <span class="tacts">
          <button class="btn sm runone" data-run="${esc(s.name)}" data-grep="${esc(plan.title)}" data-headed="1" title="run this test in a browser you can watch">Run</button>
          <button class="btn sm runone" data-run="${esc(s.name)}" data-grep="${esc(plan.title)}" title="run this test headless, in the background">Run in background</button>
          <button class="btn sm loglink" data-log title="open the full run log in a window">Logs</button>
          <button class="btn sm stepslink" data-steps title="every recorded step of the newest run, in a window">Steps</button>
        </span>
      </div>
      <div class="pfstrip" data-title="${esc(plan.title)}"></div>
      ${t && t.error ? `<pre class="terr">${esc(t.error)}</pre>` : ''}
      <div class="fold"><div class="tststeps" data-title="${esc(plan.title)}" data-planned="1">${planned}</div></div>
      <div class="tstlog" data-title="${esc(plan.title)}"></div>
    </div>
  </div>`
}
// Enumerate the tests from the SOURCE plan (definition order); merge each with its run record when
// one exists. A screen whose spec did not parse into a plan falls back to whatever ran.
const testPane = s => {
  const runByTitle = new Map((s.run && s.run.tests || []).map(t => [t.title, t]))
  const rows = (s.plans && s.plans.length)
    ? s.plans.map(p => testRow(s, p, runByTitle.get(p.title)))
    : (s.run && s.run.tests || []).map(t => testRow(s, { title: t.title, steps: [], covers: [] }, t))
  return `<div class="pane testpane">
  <h2>E2E tests<span class="s">the proof</span></h2>
  ${rows.length ? rows.join('') : `<div class="empty">No test yet · write <code>spec/${esc(s.name)}/test.spec.ts</code>.</div>`}
</div>`
}

// The How-it-works page. The METHOD is fixed — intro, the shared four-column spine, the two lanes
// (map, then depth), and the five skills drawn as flowcharts (howFlowcharts,
// below) — so it is all baked here at build time rather than fetched. Only a PROJECT's own added
// skills/agents are live (loadHow reads /api/capabilities), because those cannot be known ahead of time.
const WORKFLOW = {
  spine: [
    { num: '1 · REQUIREMENTS', h: 'What the screen must do', file: 'prd.md' },
    { num: '2 · E2E TESTS', h: 'The proof, against the real app', file: 'test.spec.ts' }
  ],
  lanes: [
    {
      mode: '1 · Get the map — once',
      sub: '<b>kg-init.</b> The board lands in the repo, and the crawl inventories every screen it can reach. Nothing is faked.',
      steps: [
        { skill: 'kg-init', file: 'tools/ + spec/', h: 'Scaffold the board',
          p: 'The board is vendored into the repo and serves on its own port. Your screens will be its rows.' },
        { skill: 'kg-init', file: 'crawl.png · rows', h: 'Inventory the app', arrow: 'a real browser, no drafting',
          p: 'Each route is visited and screenshotted, and lands as a row with <b>no PRD</b> — visibly uncovered. The board now shows honestly what is not yet governed.' }
      ]
    },
    {
      mode: '2 · Make each screen deep — one at a time',
      sub: '<b>kg-deep</b>, per screen, most important first. This is where requirements and proof actually come from.',
      steps: [
        { skill: 'kg-deep', file: 'study · golden.json', h: 'Study the real screen, seed golden data',
          p: 'Source, testids, existing tests, contracts — then a deterministic fixture, so tests can assert <b>exact numbers</b>, not that boxes exist.' },
        { skill: 'kg-deep', file: 'prd.md', h: 'Draft the requirements',
          p: 'One requirement per behaviour, grounded in what the screen really does — canon the moment it is written, edited freely like any other requirement.' },
        { skill: 'kg-deep', file: 'test.spec.ts', h: 'Prove with unit and flow tests', arrow: 'checkReq tags carry coverage',
          p: 'Unit tests prove the screen&#39;s own behaviours; flow tests cross screens along a chosen path — exact golden values, safe round trips, a writer flow that restores its own baseline. The board derives every requirement&#39;s state from the tags.' }
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

const howNode = st => `<div class="node">
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

const howSpineCol = c => `<div class="col"><div class="num">${c.num}</div><h3>${c.h}</h3>
        <div class="file">${c.file}</div></div>`

// The guide (board R11) — a four-act, click-to-advance walkthrough that DEMONSTRATES the proof
// rather than describing it: without the tool, with the tool, see it work, do it. Acts 1 and 2 are a
// MIRROR — the same three moments (assigning work, reviewing, two weeks later) told twice, once for a
// fast hire whose work you cannot review and once with the system that makes it reviewable. The
// comparison is the argument, so neither act may be tinted to win it: the only hue in the pair is Act
// 1's failure chip. Every act and every step is baked here as static DOM (all steps present; the
// stepper only moves which one is .on). The heavy content lives in this one module-level literal,
// exactly like WORKFLOW / HOW_FLOWS, so howView() only interpolates the finished string.
//   Act 3 is an explicitly LABELLED illustration of a real asset-plan flow — a .wpin banner names it
// in words, so it can never be mistaken for live board state (authored vs measured); its goldens are
// real values shown AS an illustration. The anatomy the old #how-anatomy taught — proven / unproven /
// not-reached, the mark that rides every hue, coverage tags — is folded into the act copy below.
//   INVERSION / INDIGO: there is no more "your turn" state on this page (the human, 2026-08-17 —
// the guess/gate mechanism is gone end to end), so indigo is not spent anywhere in the guide any
// more; it is reserved, unused, for a future `Changed` drift state. Act 4's closing CTA (`.wcta-act`
// when there is a real next action to name, `.wcta-settled` once the journey is folded) now wears the
// board's neutral primary-action ink, never indigo (board R12 fix; see wCtaAction / wCta below). Act
// 1's invisible-green failure wears the board's own solid `chip bad`, the single inverted element of
// that act. Because the acts step one at a time, each act is its own view with at most ONE inverted
// element.
const WALKTHROUGH = {
  acts: [
    { n: 1, title: 'Without the tool', sub: 'a brilliant, fast hire whose work you cannot review',
      steps: [
        { kind: 'scene', scene: 'chat', label: 'Assigning work',
          body: 'The task lives in a chat scroll and then scrolls away. Nothing is written down.' },
        { kind: 'scene', scene: 'wall', label: 'Reviewing',
          body: '"Does it work?" A wall of code and one green badge — so you approve blindly.' },
        { kind: 'scene', scene: 'rot', label: 'Two weeks later',
          body: 'Staff, with no memory of the decision, fixes it by rewriting what it was meant to do.' },
        { kind: 'scene', scene: 'blind',
          note: 'The assertion passed. Nobody looked at the screen — a green you cannot see is trust, not review.' }
      ] },
    { n: 2, title: 'With the tool', sub: 'the same hire, plus a system that makes work reviewable',
      steps: [
        { kind: 'scene', scene: 'req', label: 'Assigning work',
          body: 'The task becomes a written requirement — canon the instant it exists, immediately the source of truth.' },
        { kind: 'scene', scene: 'watch', label: 'Reviewing',
          body: 'The work arrives as a recording where every asserted number is on screen. You review by watching.' },
        { kind: 'scene', scene: 'drift', label: 'Two weeks later',
          body: 'You see drift the moment it happens — proven is computed from the tests, never stored.' },
        { kind: 'scene', scene: 'mirror',
          note: 'Same hire, same speed. The difference is a system.' }
      ] },
    { n: 3, title: 'See it work', sub: 'a real flow, held on screen, checked across pages',
      illustration: 'Illustration — a real asset-plan flow from a real project',
      steps: [
        { kind: 'demo', step: '1', body: 'Change market rent, unit 33A: 100 to 200 psf' },
        { kind: 'demo', step: '2', pinned: true, body: 'Click Run. The chart asserts exact values, and holds them:',
          rows: ['IY1  2,400,000', 'IY3  2,630,687.10', 'IY5  2,671,006.87'] },
        { kind: 'demo', step: '3', body: 'Click Save, then open the Tenancy schedule' },
        { kind: 'crosspage', a: 'Page A after Save: 200', b: 'Page B on load: 200',
          note: 'Every asserted value is visible in the recording. The carry-over is two panels becoming one picture, not a sentence.' }
      ] },
    { n: 4, title: 'Do it on your app', sub: 'the flow, and the full method underneath',
      steps: [
        { kind: 'flow', chain: ['kg-init', 'kg-deep · per screen', 'tests prove it'] },
        // action is no longer authored here (board R12, repurposed): it is DERIVED per build from
        // journey() — see wCtaAction — so a returning user always sees their real next step.
        { kind: 'cta', lead: 'Next on your board:' }
      ] }
  ]
}

// Marks ride every hue (design rule): reuse #howview .mk — a filled 6px square, hollow (.o) for an
// absent state — so the guide draws the board's own marks.
const wMark = cls => '<span class="mk ' + cls + '"></span>'

// One walkthrough step, carrying data-step (1-based) and data-wact (its act) for the stepping
// controller. The act index is deliberately NOT emitted as data-act: the R11 test selects
// [data-act="N"], and a wstep that shared that attribute would make it strict-match more than the
// one .act it means. Every wstep still lives inside its .act[data-act], so the act is never lost.
//   The first step of each act is baked `.on` so it shows even before the controller runs (and with
// JS off); the controller shows exactly one .on step per act. A `pinned` step (Act 3's numeric
// reveal) carries a .wpinned badge — a mark-bearing, neutral pill — that becomes visible when the
// step is active and STAYS (it rides its step's visibility; no timer, no auto-advance).
const wStepNode = (actN, i, kind, inner, pinned) =>
  '<div class="wstep k-' + kind + (i === 0 ? ' on' : '') + '" data-wact="' + actN + '" data-step="' + (i + 1) + '">' +
    inner +
    (pinned ? '<span class="wpinned"><span class="mk"></span>held on screen — this value stays</span>' : '') +
  '</div>'

// One MOMENT in the story (board R11): a captioned beat — the label names the situation ("Assigning
// work"), the body tells it. Acts 1 and 2 carry the SAME three labels in the same order, so the two
// acts read as one mirror: the argument is the comparison, not any sentence inside it.
const wMoment = s =>
  '<div class="wmoment">' +
    '<span class="wm-label">' + esc(s.label) + '</span>' +
    '<p class="wm-body">' + esc(s.body) + '</p>' +
  '</div>'

// ── THE SCENES (board R11, stage 1R) ────────────────────────────────────────────────────────────
// Acts 1 and 2 are WATCHED, not read. Every step of the pair is a small drawn mock — a chat window,
// a wall of code, a recording player, a board card — animated in pure CSS. The prose form these
// replaced said the right things and nobody would have watched it, which is the whole complaint the
// product exists to answer: a claim you cannot see is not review.
//
// THREE INVARIANTS, and everything else follows from them:
//
//   1. NO NEW CLIENT JS. The stepper hides a step with display:none, which cancels its animations;
//      showing it again starts them from zero. The replay when you press Next is the browser's own
//      behaviour, not a timer — so nothing can auto-advance and nothing can drift out of sync.
//   2. EVERY ANIMATED ELEMENT'S BASE RULE IS ITS END STATE, and its keyframes travel from the start
//      to that same end (animation-fill-mode: both). That is what makes prefers-reduced-motion free:
//      switch the animations off and the finished picture is already on screen, nothing to undo. It
//      is also what makes the end states assertable — getComputedStyle reads the held value.
//   3. NOTHING LOOPS and every scene finishes inside ~3.5s, most beats in 1-2s. A viewer who just
//      clicked must never wait on dead air, and a loop would turn a held conclusion into wallpaper.
//
// Colour follows the design system exactly: bengara names the failure beats, koke the settled ones —
// and indigo is spent NOWHERE on this page (the human, 2026-08-17: there is no more state that waits
// on a person, so indigo is reserved, unused, for a future `Changed` drift state).
const scene = (id, inner) => '<div class="scene s-' + id + '">' + inner + '</div>'

// 1 · THE CHAT THAT SCROLLS AWAY. The task is spoken, answered instantly, and then the thread rides
// up out of the window and fades — leaving a dashed, empty document where the requirement should be.
const scChat = () => scene('chat',
  '<div class="sc-win">' +
    '<div class="sc-hd"><span class="sc-t">chat · #rent-edit</span><span class="sc-t sc-r mono">14:02</span></div>' +
    '<div class="sc-view">' +
      '<div class="sc-thread">' +
        '<div class="sc-bub sc-you">Build the rent-edit feature.</div>' +
        '<div class="sc-bub sc-them">Done, boss!</div>' +
        '<div class="sc-bub sc-you">…and it rounds to 2 dp, right?</div>' +
      '</div>' +
      '<div class="sc-ghost">' +
        '<svg class="sc-doc" viewBox="0 0 34 44" aria-hidden="true">' +
          '<path d="M2 2 h20 l10 10 v30 h-30 z"/><path d="M22 2 v10 h10"/>' +
          '<path d="M8 22 h18 M8 28 h18 M8 34 h11"/></svg>' +
        '<span class="sc-gt">nothing written down</span>' +
      '</div>' +
    '</div>' +
  '</div>')

// 2 · THE WALL YOU CANNOT REVIEW. Sixteen greeked lines stream in — deliberately unreadable, because
// that is the honest picture of a diff you were asked to approve — and the only legible thing in the
// window is a green badge counting tests you did not see run.
const WALL_LINES = [
  { i: 0, w: [42, 88] }, { i: 1, w: [30, 118, 26] }, { i: 1, w: [64, 40, 92] }, { i: 2, w: [36, 74] },
  { i: 2, w: [106, 28, 52] }, { i: 1, w: [48, 128] }, { i: 0, w: [22] }, { i: 0, w: [56, 100, 34] },
  { i: 1, w: [78, 46] }, { i: 2, w: [38, 90, 58] }, { i: 2, w: [122, 30] }, { i: 1, w: [44, 70, 108] },
  { i: 1, w: [34, 58] }, { i: 0, w: [92, 42] }, { i: 0, w: [26, 114, 48] }, { i: 1, w: [72, 36, 86] }
]
const scWall = () => scene('wall',
  '<div class="sc-win">' +
    '<div class="sc-hd"><span class="sc-t mono">src/plan/rent-edit.ts + 11 files</span>' +
      '<span class="sc-t sc-r">1,412 lines changed</span></div>' +
    '<div class="sc-code">' +
      WALL_LINES.map((l, i) =>
        '<div class="sc-gl" style="animation-delay:' + (i * 52) + 'ms">' +
          '<span class="sc-n mono">' + (41 + i) + '</span>' +
          '<span class="sc-toks" style="padding-left:' + (l.i * 16) + 'px">' +
            l.w.map((w, k) => '<span class="sc-tok' + (k === 0 ? ' k' : '') + '" style="width:' + w + 'px"></span>').join('') +
          '</span>' +
        '</div>').join('') +
      '<span class="chip ok sc-badge"><span class="mark"></span>40 tests passing</span>' +
    '</div>' +
  '</div>')

// 3 · TWO WEEKS LATER. A calendar peels twice; the feature cracks; and the "fix" rewrites the
// REQUIREMENT rather than the code — the exact move this product exists to make impossible — while a
// counter rolls to the third time the same bug came back.
const scRot = () => scene('rot',
  '<div class="sc-rot">' +
    '<div class="sc-cal">' +
      '<div class="sc-calh"><span class="sc-t">the same feature</span></div>' +
      '<div class="sc-sheets">' +
        '<span class="sc-sheet sc-s3"><b class="mono">3</b>weeks</span>' +
        '<span class="sc-sheet sc-s2"><b class="mono">2</b>weeks</span>' +
        '<span class="sc-sheet sc-s1"><b class="mono">1</b>week</span>' +
      '</div>' +
    '</div>' +
    '<div class="sc-rotr">' +
      '<div class="sc-fcard"><span class="sc-fct">rent-edit</span>' +
        '<span class="chip stale sc-fcc"><span class="mark o"></span>broken again</span>' +
        '<svg class="sc-crack" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true">' +
          '<path d="M22 0 L58 19 L36 25 L92 44"/></svg>' +
      '</div>' +
      '<div class="sc-rew"><span class="sc-rewl mono">the fix · spec/asset-plan/prd.md R5</span>' +
        '<span class="sc-old">market rent carries to the schedule<i class="sc-strike"></i></span>' +
        '<span class="sc-arr" aria-hidden="true">&#8594;</span>' +
        '<span class="sc-new">market rent is a plan-only field</span>' +
      '</div>' +
      '<span class="chip stale sc-same"><span class="mark o"></span>same bug&#160;·&#160;' +
        '<span class="sc-roll"><span class="sc-rs"><span>1st</span><span>2nd</span><span>3rd</span></span></span>&#160;time</span>' +
    '</div>' +
  '</div>')

// 4 · THE INVISIBLE GREEN. The passing assertion on the left, the screen it never looked at on the
// right, and a struck-through eye between them. chip.bad is the board's own solid failure chip and
// this act's ONE inverted element; the assertion is real (toBeVisible ignores what the value says).
const scBlind = () => scene('blind',
  '<div class="sc-split">' +
    '<div class="sc-win sc-half">' +
      '<div class="sc-hd"><span class="sc-t mono">spec/asset-plan/test.spec.ts</span></div>' +
      '<div class="sc-pad">' +
        '<div class="sc-line mono"><span class="sc-n">17</span>const rent = page.locator(".rent")</div>' +
        '<div class="sc-line mono"><span class="sc-n">18</span>await expect(rent).toBeVisible()</div>' +
        '<span class="chip ok sc-green"><span class="mark"></span>test green</span>' +
      '</div>' +
    '</div>' +
    '<div class="sc-mid">' +
      '<svg class="sc-eye" viewBox="0 0 28 20" aria-hidden="true">' +
        '<path d="M2 10 C8 2 20 2 26 10 C20 18 8 18 2 10 Z"/><circle cx="14" cy="10" r="3.2"/>' +
        '<path class="sc-slash" d="M4 19 L24 1"/></svg>' +
      '<span class="sc-nobody">NOBODY LOOKED</span>' +
    '</div>' +
    '<div class="sc-win sc-half">' +
      '<div class="sc-hd"><span class="sc-t">the app · unit 33A</span></div>' +
      '<div class="sc-pad">' +
        '<div class="sc-fld"><span class="sc-fl">Market rent</span><span class="sc-fv mono">100</span></div>' +
        '<div class="sc-fld sc-dimf"><span class="sc-fl">Passing rent</span><span class="sc-fv2 mono">96</span></div>' +
        '<span class="chip bad sc-stalec"><span class="mark o"></span>screen shows rent = 100 (stale)</span>' +
      '</div>' +
    '</div>' +
  '</div>')

// 5 · CANON THE MOMENT IT'S WRITTEN (the mirror of scene 1). The same spoken sentence becomes a
// written requirement card — there is no flag, no confirmation step (the human, 2026-08-17): the
// document IS the requirement the instant it exists.
const scReq = () => scene('req',
  '<div class="sc-morph">' +
    '<div class="sc-bub sc-you sc-mbub">Build the rent-edit feature.</div>' +
    '<div class="sc-card">' +
      '<div class="sc-ch"><span class="sc-t mono">spec/asset-plan/prd.md</span><span class="sc-id mono">R5</span></div>' +
      '<p class="sc-cb">Market rent edited on the plan carries to the tenancy schedule, to the penny.</p>' +
      '<span class="sc-canon chip ok"><span class="mark"></span>canon the moment it&#39;s written</span>' +
    '</div>' +
  '</div>')

// 6 · REVIEW BY WATCHING (the mirror of scene 2). A recording player whose miniature golden scene
// plays once: the edited cell flips 100 → 200, then the chart it feeds grows with its asserted values
// PRINTED ON SCREEN. Labelled `illustration` in the title bar for the same reason Act 3 is — these
// are authored goldens from a real project, never this board's live state.
const WATCH_BARS = [['IY1', '2,400,000', 44], ['IY3', '2,630,687.10', 78], ['IY5', '2,671,006.87', 92]]
const scWatch = () => scene('watch',
  '<div class="sc-player">' +
    '<div class="sc-hd"><span class="sc-t mono">recording · asset-plan · market rent 100 &#8594; 200</span>' +
      '<span class="sc-tag">illustration</span></div>' +
    '<div class="sc-stage">' +
      '<div class="sc-pv sc-tbl">' +
        '<div class="sc-tr sc-th"><span>unit</span><span>market rent</span><span>psf</span></div>' +
        '<div class="sc-tr sc-hit"><span class="mono">33A</span>' +
          '<span class="sc-cell mono"><i class="sc-was">100</i><i class="sc-is">200</i></span>' +
          '<span class="mono">psf</span></div>' +
        '<div class="sc-tr"><span class="mono">33B</span><span class="mono">180</span><span class="mono">psf</span></div>' +
      '</div>' +
      '<div class="sc-pv sc-chart">' +
        WATCH_BARS.map(([l, v, h], i) =>
          '<div class="sc-col">' +
            '<span class="sc-bv mono" style="animation-delay:' + (2900 + i * 130) + 'ms">' + v + '</span>' +
            '<span class="sc-track"><i class="sc-bar" style="height:' + h + '%;animation-delay:' + (2500 + i * 130) + 'ms"></i></span>' +
            '<span class="sc-bl mono">' + l + '</span>' +
          '</div>').join('') +
      '</div>' +
    '</div>' +
    '<div class="sc-transport">' +
      '<svg class="sc-play" viewBox="0 0 10 12" aria-hidden="true"><path d="M1 1 L9 6 L1 11 Z"/></svg>' +
      '<span class="sc-prog"><i class="sc-fill"></i></span><span class="sc-time mono">0:04</span>' +
    '</div>' +
  '</div>')

// 7 · THE CHIP THAT FLIPS (the mirror of scene 3). A code line mutates, a pulse travels the wire, and
// the requirement's chip flips proven → unproven the same instant. BOTH halves of the flip are drawn,
// so the pair is what you watch — not a chip that was simply always red.
const scDrift = () => scene('drift',
  '<div class="sc-dr">' +
    '<div class="sc-win">' +
      '<div class="sc-hd"><span class="sc-t mono">src/plan/rent.ts</span></div>' +
      '<div class="sc-pad">' +
        '<div class="sc-line mono"><span class="sc-n">40</span>const carried = plan.marketRent</div>' +
        '<div class="sc-line sc-hot mono"><span class="sc-n">41</span>return round(carried, ' +
          '<span class="sc-mut"><i class="sc-was">2</i><i class="sc-is">0</i></span>)</div>' +
        '<div class="sc-line mono"><span class="sc-n">42</span>}</div>' +
      '</div>' +
    '</div>' +
    '<svg class="sc-wire" viewBox="0 0 64 14" aria-hidden="true">' +
      '<path class="sc-wl" d="M2 7 H56"/><path class="sc-wh" d="M50 3 L56 7 L50 11"/>' +
      '<path class="sc-wp" d="M2 7 H56"/></svg>' +
    '<div class="sc-win">' +
      '<div class="sc-hd"><span class="sc-t">board · asset-plan</span></div>' +
      '<div class="sc-pad">' +
        '<div class="sc-rq"><span class="sc-rqt">R5 · market rent carries to the schedule</span>' +
          '<span class="sc-flip">' +
            '<span class="chip ok wproven"><span class="mark"></span>proven</span>' +
            '<span class="chip stale wunproven"><span class="mark o"></span>unproven</span>' +
          '</span></div>' +
        '<div class="sc-rq sc-dimf"><span class="sc-rqt">R6 · psf is displayed to 2 dp</span>' +
          '<span class="chip ok"><span class="mark"></span>proven</span></div>' +
      '</div>' +
    '</div>' +
  '</div>')

// 8 · THE MIRROR, DRAWN. The two situations side by side, three beats each, every beat carrying its
// own mark — hollow bengara for what went wrong, filled koke for what holds. The columns are marks
// and ink, never a wash of hue: the comparison has to be read, not felt.
const MIRROR_ROWS = [
  ['the task lives in a chat scroll', 'the task is a written requirement you confirm'],
  ['review is a wall of code you approve blindly', 'review is a recording where the numbers show'],
  ['the same bug comes back a third time', 'the chip flips to unproven the instant it drifts']
]
const scMirror = () => scene('mirror',
  '<div class="sc-mir">' +
    '<div class="sc-mcol sc-bad"><span class="sc-mh">Without the tool</span>' +
      MIRROR_ROWS.map(r => '<span class="sc-row">' + wMark('o') + esc(r[0]) + '</span>').join('') +
    '</div>' +
    '<span class="sc-div" aria-hidden="true"></span>' +
    '<div class="sc-mcol sc-ok"><span class="sc-mh">With the tool</span>' +
      MIRROR_ROWS.map(r => '<span class="sc-row">' + wMark('') + esc(r[1]) + '</span>').join('') +
    '</div>' +
  '</div>')

const SCENES = { chat: scChat, wall: scWall, rot: scRot, blind: scBlind,
  req: scReq, watch: scWatch, drift: scDrift, mirror: scMirror }

// A scene step: the drawn mock, then AT MOST ONE LINE under it. The three mirrored moments keep the
// board's existing caption treatment (.wmoment — the label is what makes Acts 1 and 2 read as the
// same three beats twice); the two closing scenes carry a plain note. The caption is a caption: if it
// grows past a line the scene has stopped carrying the beat and the beat needs redrawing, not more prose.
const wScene = s => SCENES[s.scene]() + (s.label ? wMoment(s) : '<p class="wnote">' + esc(s.note) + '</p>')

const wDemo = s =>
  '<div class="wds">' +
    '<span class="wds-n mono">' + esc(s.step) + '</span>' +
    '<div class="wds-b"><p>' + esc(s.body) + '</p>' +
      (s.rows ? '<div class="wgold">' + s.rows.map(r => '<div class="wgrow mono">' + esc(r) + '</div>').join('') + '</div>' : '') +
    '</div>' +
  '</div>'

// The carry-over: two panels becoming one picture — Page A after Save equals Page B on load.
const wCrosspage = s =>
  '<div class="wcross">' +
    '<div class="wcp"><span class="wcp-v mono">' + esc(s.a) + '</span></div>' +
    '<span class="wcp-eq" aria-hidden="true">=</span>' +
    '<div class="wcp"><span class="wcp-v mono">' + esc(s.b) + '</span></div>' +
  '</div>' +
  '<p class="wnote">' + esc(s.note) + '</p>'

// The flow as verb-phrase steps — plain, uniform nodes, no state hue: nothing on this chain waits on
// a person any more (the human, 2026-08-17).
const wFlow = s =>
  '<div class="wflow">' + s.chain.map((c, i) =>
    (i ? '<span class="wfa" aria-hidden="true">&#8594;</span>' : '') + '<span class="wfn">' + esc(c) + '</span>'
  ).join('') + '</div>'

// Act 4's closing CTA (board R12, repurposed): the first not-done journey() step's own action —
// its cmd when it has one (deepen: '/kg-deep <screen>'), else the short verb J_ACT already names for
// the board control that does it. Once nothing is left (folded), there is no next step to name, so
// the CTA says so instead of pointing at one. Pure function of journey()'s facts — nothing stored.
// Returns { text, state } rather than a bare string (board R12): the renderer (wCta) uses `state` to
// pick which of its two pill treatments to draw, so it never re-derives folded-vs-action from
// journey() itself — one derivation, read twice, rather than two derivations that could disagree.
// Exported so the DERIVATION is unit-tested against synthetic journey() shapes (tools/journey.test.mjs)
// — this repo's own journey is always folded (everything proven), so the live board's own E2E can only
// ever exercise the folded/settled branch below; the not-done/turn branches need a driven fixture.
export const wCtaAction = j => {
  const cur = j.steps.find(s => !s.done)
  if (!cur) return { text: 'Every derivable fact already holds — this project\'s requirements are proven.', state: 'settled' }
  return { text: cur.cmd || J_ACT[cur.id] || cur.title, state: 'turn' }
}

// Act 4's closing pill wears the state `cta` names (board R12), and neither treatment is indigo any
// more (the human, 2026-08-17 — there is no "your turn" state left on the board): `cta.state === 'turn'`
// (a real next action to run) is the neutral primary-action ink, the SAME solid `.btn.pri` treatment
// the board already uses for "the main thing to do" — the one inverted element of Act 4.
// `cta.state === 'settled'` (the folded branch: every derivable fact already holds, nothing left to
// point at) renders instead as a tint, the SAME koke/"ok" tokens the board already uses for
// proven/settled chips elsewhere on this page (compare the legend's `chip ok` / `mk`) — no inversion,
// so a folded board never shows two solid elements competing on one screen.
const wCta = (s, cta) => {
  const pill = cta.state === 'turn'
    ? '<span class="wcta-act"><span class="mk"></span><span class="mono">' + esc(cta.text) + '</span></span>'
    : '<span class="wcta-settled"><span class="mk"></span><span class="mono">' + esc(cta.text) + '</span></span>'
  return '<div class="wcta"><span class="wcta-lead">' + esc(s.lead) + '</span>' + pill + '</div>'
}

// The story rebuild (board R11) retired three kinds with their data — 'symptoms' (Act 1's bullet list
// of pains), 'inversion' and 'beforeafter' (the old Act 2). Stage 1R retired three more — the prose
// 'moment', and the 'proof' and 'mirror' summaries — when Acts 1 and 2 became scenes. Their renderers
// and CSS are deleted rather than parked: no act references them any more, and a dead branch is a lie
// about what this page draws. (wMoment survives as the SCENE CAPTION, which is all it ever drew.)
const wStepInner = (s, ctaAction) => {
  switch (s.kind) {
    case 'scene': return wScene(s)
    case 'demo': return wDemo(s)
    case 'crosspage': return wCrosspage(s)
    case 'flow': return wFlow(s)
    case 'cta': return wCta(s, ctaAction)
    default: return ''
  }
}

// Per-act stepper nav (board R11): Prev / a live "n / N" count / Next. Marks (the chevron glyphs and
// the numeric count), never hue, carry the affordance; the buttons are quiet outlines, not a solid
// element. The controller wires these and clamps at the ends; without JS the act simply shows its
// first step, which is honest.
const wNav = a =>
  '<div class="wnav">' +
    '<button class="wnavb" type="button" data-wprev aria-label="Previous step"><span class="wchev" aria-hidden="true">&#8249;</span>Prev</button>' +
    '<span class="wcount" aria-live="polite">1 / ' + a.steps.length + '</span>' +
    '<button class="wnavb" type="button" data-wnext aria-label="Next step">Next<span class="wchev" aria-hidden="true">&#8250;</span></button>' +
  '</div>'

const wAct = (a, ctaAction) => {
  const steps = a.steps.map((s, i) => wStepNode(a.n, i, s.kind, wStepInner(s, ctaAction), s.pinned)).join('')
  // Act 3 gathers its steps inside a single labelled demo panel; the .wpin banner is what keeps the
  // illustration honest — it says, in words, that this is not live board state.
  const body = a.illustration
    ? '<div class="wdemo"><div class="wpin">' + wMark('o') + esc(a.illustration) + '</div>' + steps + '</div>'
    : '<div class="wsteps">' + steps + '</div>'
  return '<section class="act" data-act="' + a.n + '">' +
    '<div class="act-h"><span class="act-n">' + a.n + '</span>' +
    '<div class="act-t"><h2>' + esc(a.title) + '</h2><span class="act-sub">' + esc(a.sub) + '</span></div></div>' +
    body + wNav(a) + '</section>'
}

// The walkthrough IS the #howitworks landing (board R11). A quiet map of the four beats heads it; its
// pips carry data-pip (never data-act), so the R11 test's [data-act="N"] stays the four .act sections.
const walkthrough = ctaAction =>
  '<div id="walkthrough">' +
    '<div class="wt-map">' + WALKTHROUGH.acts.map(a =>
      '<span class="wt-pip" data-pip="' + a.n + '"><span class="wt-pn">' + a.n + '</span>' + esc(a.title) + '</span>')
      .join('<span class="wt-sep" aria-hidden="true">&#8594;</span>') +
    '</div>' +
    WALKTHROUGH.acts.map(a => wAct(a, ctaAction)).join('') +
  '</div>'


// The five skills, drawn as flowcharts — a fixed part of the specboard method, so baked at build
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
// A gate-shaped node is kg-staff's "stop and ask the human" node (there is no other kind any more —
// the guess/gate mechanism this used to also draw was removed, the human, 2026-08-17). Neutral, never
// indigo: this is process discipline, not a status the board computes.
function fGateBody (n) {
  const cmp = n.cmp ? `<div class="cmp mono">${esc(n.cmp)}</div>` : ''
  return `<div ${XH} class="nb stop">
    <div class="glbl stop"><span class="dia stop"></span>STOP &middot; ask the human</div>
    <div class="nb-title">${esc(n.title)}</div>
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
    tagline: 'scaffold the board + inventory the app into rows',
    when: 'once · when a project has no board yet',
    height: 528,
    nodes: [
      { id: 's1', type: 'step', cx: HOW_Cx, top: 16, w: 252, h: 54, title: 'Scaffold specboard into the repo', tags: ['vendors tools/ + spec/'] },
      { id: 's2', type: 'step', cx: HOW_Cx, top: 100, w: 252, h: 54, title: 'Install deps · start the board' },
      { id: 's3', type: 'step', cx: HOW_Cx, top: 184, w: 252, h: 54, title: 'Setup — point it at the app', tags: ['spec/_config.json'] },
      { id: 's4', type: 'step', cx: HOW_Cx, top: 268, w: 300, h: 58, title: 'Crawl: inventory every reachable route', state: 'running', tags: ['real browser · no drafting'] },
      { id: 's5', type: 'step', cx: HOW_Cx, top: 356, w: 316, h: 58, title: 'Rows land with NO PRD — honestly uncovered', tags: ['crawl.png'] },
      { id: 's6', type: 'step', cx: HOW_Cx, top: 444, w: 316, h: 58, title: 'Pick the most important screen → kg-deep', tags: ['kg-deep · per screen'] }
    ],
    edges: [
      { from: 's1', fromSide: 'bottom', to: 's2', toSide: 'top', route: 'v' },
      { from: 's2', fromSide: 'bottom', to: 's3', toSide: 'top', route: 'v' },
      { from: 's3', fromSide: 'bottom', to: 's4', toSide: 'top', route: 'v' },
      { from: 's4', fromSide: 'bottom', to: 's5', toSide: 'top', route: 'v' },
      { from: 's5', fromSide: 'bottom', to: 's6', toSide: 'top', route: 'v' }
    ]
  },
  {
    id: 'kg-deep',
    tagline: 'one screen → deep and proven',
    when: 'per screen · most important first',
    height: 632,
    nodes: [
      { id: 'k0', type: 'step', cx: HOW_Cx, top: 16, w: 300, h: 54, title: 'Phase 0 · what governs this screen?', tags: ['tools/staff.mjs'] },
      { id: 'k1', type: 'step', cx: HOW_Cx, top: 100, w: 316, h: 58, title: 'Phase 1 · study the real screen', tags: ['source · testids · existing tests'] },
      { id: 'k2', type: 'step', cx: HOW_Cx, top: 188, w: 316, h: 58, title: 'Phase 2 · golden fixture + capture', state: 'running', tags: ['_seed.ts · golden.json'] },
      { id: 'k3', type: 'step', cx: HOW_Cx, top: 276, w: 300, h: 58, title: 'Phase 3 · draft the requirements — canon on write', tags: ['prd.md'] },
      { id: 'k4', type: 'step', cx: HOW_Cx, top: 364, w: 316, h: 58, title: 'Phase 4 · unit + flow tests', tags: ['checkReq · exact numbers'] },
      { id: 'k5', type: 'step', cx: HOW_Cx, top: 452, w: 350, h: 62, title: 'Writer flow LAST — round trip, self-restoring', note: 'discovery-first on every write path' },
      { id: 'k6', type: 'step', cx: HOW_Cx, top: 548, w: 316, h: 58, title: 'Phase 5 · settle on the board + review', state: 'settled' }
    ],
    edges: [
      { from: 'k0', fromSide: 'bottom', to: 'k1', toSide: 'top', route: 'v' },
      { from: 'k1', fromSide: 'bottom', to: 'k2', toSide: 'top', route: 'v' },
      { from: 'k2', fromSide: 'bottom', to: 'k3', toSide: 'top', route: 'v' },
      { from: 'k3', fromSide: 'bottom', to: 'k4', toSide: 'top', route: 'v' },
      { from: 'k4', fromSide: 'bottom', to: 'k5', toSide: 'top', route: 'v' },
      { from: 'k5', fromSide: 'bottom', to: 'k6', toSide: 'top', route: 'v' }
    ]
  },
  {
    id: 'kg-e2e',
    tagline: 'author the proving test — red first, then real',
    when: 'inside a kg-deep pass · or standalone per screen',
    height: 452,
    nodes: [
      { id: 'e1', type: 'step', cx: HOW_Cx, top: 16, w: 288, h: 54, title: 'Write the FAILING assertion first', tags: ['test.spec.ts'] },
      { id: 'e2', type: 'step', cx: HOW_Cx, top: 100, w: 214, h: 54, title: 'Watch it go RED', state: 'redfail' },
      { id: 'e3', type: 'step', cx: HOW_Cx, top: 184, w: 340, h: 62, title: 'Assert on DATA — exact golden values', note: 'wait for content; prove something DID happen' },
      { id: 'e4', type: 'step', cx: HOW_Cx, top: 280, w: 258, h: 58, title: 'Make it pass — never weaken', state: 'settled' },
      { id: 'e5', type: 'step', cx: HOW_Cx, top: 368, w: 288, h: 58, title: 'Shoots screen.png as a byproduct', tags: ['the recording cover'] }
    ],
    edges: [
      { from: 'e1', fromSide: 'bottom', to: 'e2', toSide: 'top', route: 'v' },
      { from: 'e2', fromSide: 'bottom', to: 'e3', toSide: 'top', route: 'v' },
      { from: 'e3', fromSide: 'bottom', to: 'e4', toSide: 'top', route: 'v' },
      { from: 'e4', fromSide: 'bottom', to: 'e5', toSide: 'top', route: 'v' }
    ]
  },
  {
    id: 'kg-staff',
    tagline: 'the change discipline — before you touch a screen',
    when: 'before every change · stop & ask in 2 cases',
    height: 448,
    nodes: [
      { id: 'st1', type: 'step', cx: HOW_Cx, top: 16, w: 272, h: 54, title: 'Read what governs the screen', tags: ['staff briefing'] },
      { id: 'd1', type: 'diamond', cx: HOW_Cx, top: 104, w: 240, h: 116, title: 'One of the two stop cases?' },
      { id: 'a1', type: 'gate', kind: 'stop', cx: HOW_Rx, top: 119, w: 260, h: 86, title: 'Stop — the human decides', cmp: 'new meaning · contradiction' },
      { id: 'o1', type: 'step', cx: HOW_Cx, top: 268, w: 340, h: 62, title: 'Requirement first · failing test · then green', note: 'the change order — never weaken a test' },
      { id: 'o2', type: 'step', cx: HOW_Cx, top: 364, w: 380, h: 58, title: 'Close the loop: whole suite · rescan · stale worklist', state: 'running' }
    ],
    edges: [
      { from: 'st1', fromSide: 'bottom', to: 'd1', toSide: 'top', route: 'v' },
      { from: 'd1', fromSide: 'right', to: 'a1', toSide: 'left', route: 'h', label: { t: 'yes — ask first', pos: [768, 140] } },
      { from: 'd1', fromSide: 'bottom', to: 'o1', toSide: 'top', route: 'v', label: { t: 'no — governed', pos: [608, 244] } },
      { from: 'a1', fromSide: 'bottom', to: 'o1', toSide: 'top', route: 'vhv', my: 240 },
      { from: 'o1', fromSide: 'bottom', to: 'o2', toSide: 'top', route: 'v' }
    ]
  },
  {
    id: 'kg-update',
    tagline: 'adopt a new release without clobbering your edits',
    when: 'after the plugin updates · restart on new code',
    height: 916,
    nodes: [
      { id: 'u1', type: 'step', cx: HOW_Cx, top: 16, w: 280, h: 54, title: 'Compare versions', tags: ['plugin vs _specboard.json'] },
      { id: 'd1', type: 'diamond', cx: HOW_Cx, top: 104, w: 204, h: 112, title: 'Update due?' },
      { id: 'tc', type: 'step', cx: 250, top: 134, w: 214, h: 52, title: 'Already current — done', state: 'settled' },
      { id: 'ur', type: 'step', cx: HOW_Cx, top: 252, w: 384, h: 178, title: 'Update runs — per file',
        rows: [
          { s: 'added', t: 'added — new file dropped in' },
          { s: 'updated', t: 'updated — untouched file refreshed' },
          { s: 'settled', t: 'your local edit kept' },
          { s: 'relook', t: 'CONFLICT → written as <file>.new' }
        ] },
      { id: 'd3', type: 'diamond', cx: HOW_Cx, top: 466, w: 204, h: 112, title: 'Conflicts?' },
      { id: 'mg1', type: 'step', cx: 950, top: 495, w: 232, h: 54, title: 'Merge each .new by graft', state: 'relook' },
      { id: 'mg2', type: 'step', cx: 950, top: 579, w: 214, h: 54, title: 'Delete .new', state: 'settled' },
      { id: 'ur2', type: 'step', cx: HOW_Cx, top: 664, w: 230, h: 54, title: 'Rebuild board.html', state: 'running' },
      { id: 'ur3', type: 'step', cx: HOW_Cx, top: 748, w: 254, h: 54, title: 'Restart the board', state: 'running', tags: ['detached · own port'] },
      { id: 'ur4', type: 'step', cx: HOW_Cx, top: 832, w: 284, h: 58, title: 'Verify live server on new code', state: 'settled' }
    ],
    edges: [
      { from: 'u1', fromSide: 'bottom', to: 'd1', toSide: 'top', route: 'v' },
      { from: 'd1', fromSide: 'left', to: 'tc', toSide: 'right', route: 'h', label: { t: 'no', sub: 'up to date', no: true, pos: [432, 160] } },
      { from: 'd1', fromSide: 'bottom', to: 'ur', toSide: 'top', route: 'v', label: { t: 'yes', pos: [608, 234] } },
      { from: 'ur', fromSide: 'bottom', to: 'd3', toSide: 'top', route: 'v' },
      { from: 'd3', fromSide: 'right', to: 'mg1', toSide: 'left', route: 'h', label: { t: 'yes', pos: [772, 522] } },
      { from: 'mg1', fromSide: 'bottom', to: 'mg2', toSide: 'top', route: 'v' },
      { from: 'mg2', fromSide: 'bottom', to: 'ur2', toSide: 'top', route: 'vhv', my: 648 },
      { from: 'd3', fromSide: 'bottom', to: 'ur2', toSide: 'top', route: 'v', label: { t: 'no', no: true, pos: [608, 640] } },
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

const howView = ctaAction => `<section class="dt" id="howview" hidden>
  <div class="dth">
    <h2>How does it work</h2>
    <span class="gbn">spec-driven development, made visible</span>
    <span class="grow"></span>
    <button class="close btn">Close</button>
  </div>
  <div class="dtscroll cfscroll">
    <div class="howwrap">

      <!-- The walkthrough IS the landing (board R11): a four-act, click-to-advance guide that SHOWS
           the proof. It is the first thing in the view, and — until you open the reference below — the
           only thing. The click-to-advance controller is a later pass; every act is present here. -->
      ${walkthrough(ctaAction)}

      <!-- The full method, demoted to a collapsed reference (board R11). It wraps the old overview and
           the skill flowcharts; a native <details> is the "See the full method" control reached from
           the end of Act 4 — no client JS (that is a later pass). The deep #howitworks/<skillId> pages
           and their router (skillShow / skillReset toggling #howoverview / #skilldetail) are unchanged;
           when the disclosure is closed those toggles simply have nothing to show, which is the point. -->
      <details id="fullmethod">
        <summary>See the full method — the spine, the journey, and the five skills drawn</summary>

      <!-- The overview (#howoverview): intro, the row, the two lanes, the five COLLAPSED skill summary
           cards, and the project's own skills. Shown at #howitworks; hidden wholesale while a single
           skill's flowchart is shown at #howitworks/<skillId>. -->
      <div id="howoverview">

      <div class="intro">
        <h1>How specboard works</h1>
        <p>Every screen in a project is one row with <b>two ends</b> —
          <span class="spine">requirements</span><span class="arrowtok">↔</span><span class="spine">the tests that prove them</span>.
          There is no status field anywhere: a requirement reads <b>proven</b> only while a passing
          test <i>tags</i> it with an assertion that would fail without it. Edit a requirement and its
          proof goes stale; delete an assertion and the green honestly disappears. The board never
          stores state — it derives it, on every build.</p>
        <div class="legend">
          <span class="chip"><span class="mk o"></span>step / artifact</span>
          <span class="chip ok"><span class="mk"></span>proven — assertion-backed</span>
          <span class="chip run"><span class="mk"></span>running — a job in flight</span>
          <span class="chip gone"><span class="mk o"></span>unproven — needs a proof</span>
        </div>
      </div>

      <div class="sect">
        <div class="sect-head"><span class="lbl">the row</span>
          <h2>What the screen must do — and the proof it still does it</h2><span class="rule"></span></div>
        <div class="spine-banner">${WORKFLOW.spine.map(howSpineCol).join('')}</div>
      </div>

      <div class="sect">
        <div class="sect-head"><span class="lbl">the journey</span>
          <h2>Get the map once — then make each screen deep, one at a time</h2><span class="rule"></span></div>
        <div class="lanes">${WORKFLOW.lanes.map(howLane).join('')}</div>
      </div>

      <!-- The five skills, COLLAPSED to one compact summary each. Clicking a summary NAVIGATES to
           #howitworks/<skillId> (history.pushState + route), which swaps this whole overview for the
           focused #skilldetail page below. The summaries stay put; nothing toggles in place. -->
      <div class="sect">
        <div class="sect-head"><span class="lbl">the five skills</span>
          <h2>Where each one branches, runs, and waits for you</h2><span class="rule"></span></div>

        <div class="skill-list" id="skilllist">
          <p class="flow-lead">Each skill is a small procedure with real forks in it — where it branches,
            where a job runs, and where it <b>stops for you</b>. Pick one to see its flow drawn out.</p>
          <div class="skill-summaries">${howSkillSummaries()}</div>
        </div>
      </div>

      <!-- The five skills above are baked; anything the PROJECT adds under .claude/ is fetched live by
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
            <span class="chip"><span class="mk o"></span>stop — ask the human</span>
            <span class="chip run"><span class="mk"></span>running — a job in flight</span>
            <span class="chip ok"><span class="mk"></span>settled — passing / approved</span>
            <span class="chip stale"><span class="mk"></span>re-look — a conflict to resolve</span>
          </div>
        </div>
        <div class="skill-flows">${howFlowcharts()}</div>
      </div>

      </details><!-- /#fullmethod -->

    </div>
  </div>
</section>`

export function build () {
  const screens = allScreens()
  const areas = sortedAreas(screens)
  // The getting-started journey, derived once for this build (board R12) — read from the tree, so a
  // step cannot claim a fact that is not in spec/. It no longer draws a rail (cut at the human's
  // direction); it feeds the walkthrough's closing CTA (Act 4) with the single derived next action.
  const j = journey()
  const ctaAction = wCtaAction(j)
  // There is no "your turn" any more (the human, 2026-08-17 — no guess, no gate). The one number the
  // home banner reads is honest drift, not a person's queue: how many requirements are FAILING right
  // now (board R4's four-word status) — everything else is simply proven or untested.
  const failing = screens.reduce((n, s) => n + s.reqs.filter(r => r.status === 'failed').length, 0)

  const groups = areas.map(a => {
    const inArea = screens.map((s, i) => ({ s, i })).filter(x => x.s.area === a)
    return `
<section class="grp" data-area="${esc(a)}">
  <div class="grph">
    <button class="tw" aria-label="collapse">—</button>
    <h2>${esc(a)}</h2>
    <span class="gc">${inArea.length} screen${inArea.length === 1 ? '' : 's'}</span>
  </div>
  <div class="cards">${inArea.map(x => card(x.s, x.i)).join('')}</div>
</section>`
  }).join('')

  // The detail is two ends only (board R2): the requirements on the left, the tests that prove them
  // on the right, each pane scrolling on its own — no acceptance gate above them (board R8), just the
  // two columns and a Run-all in the bar. data-screen alongside data-i so the router can open it by name.
  const detail = screens.map((s, i) => `
<section class="dt" data-i="${i}" data-screen="${esc(s.name)}" hidden>
  <div class="dth dbarhook">
    <h2>${esc(s.title)}</h2>
    <span class="grow"></span>
    ${runAll(s.name)}
    <div class="viewseg" role="tablist" aria-label="View">
      <button class="vseg on" data-view="focus" data-i="${i}">Focus</button>
      <button class="vseg" data-view="list" data-i="${i}">List</button>
      <button class="vseg" data-view="columns" data-i="${i}">Columns</button>
    </div>
    <button class="close btn">Close</button>
  </div>
  <div class="dtscroll">
    <div class="cols">
      ${reqPane(s)}
      ${testPane(s)}
    </div>
    ${listPane(s)}
  </div>
  <div class="dtfoot" hidden></div>
</section>`).join('')

  // The client behaviour lives in tools/board/client.js now — real JavaScript, not a string inside
  // this template literal — and is read in verbatim below. The build-time values it needs are handed
  // over as a JSON ISLAND (window.__BOARD__), so code and data cross the seam cleanly: no
  // interpolation reaches into the script, so the backtick / ${} / \n escaping traps cannot happen.
  const BOARD_DATA = {
    screens: screens.map(s => s.name),
    skillIds: HOW_FLOWS.map(f => f.id)
  }
  const clientJs = readFileSync(join(ROOT, 'tools', 'board', 'client.js'), 'utf8')

  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>specboard</title>
<style>${designCss()}</style>
<style>
  /* board layout only — every colour, size and space above comes from spec/_design.css */
  body { width:auto; }
  /* The specboard bar heads the LIST (and the tool views); it sticks to the top as you scroll. On a
     detail PAGE the detail is a full-screen window that covers it, so a detail has exactly ONE header
     — its own — never two stacked bars. */
  .top { position:sticky; top:0; z-index:40; }
  /* while a detail (a full-screen fixed window) is open, the page itself must not scroll — only its
     two panes do. Set on <html> by the router when a detail opens, cleared when it closes. */
  html.noscroll { overflow:hidden; }
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

  /* THE GETTING-STARTED RAIL (board R12) was cut at the human's direction — the journey now surfaces
     as Act 4's single derived next action (#howview .wcta) instead of a standing home-screen
     checklist. Its CSS (#jrail, .jhd/.jttl/.jsteps/.jstep/.jtop/.jn/.jt/.jfact/.jact/.jdone) is removed
     with it; journeyRail's renderer stays in build-board.mjs only for its own direct unit test
     (tools/journey.test.mjs), which checks HTML structure, not styling. */

  /* HOME — screens grouped into named areas, one CARD per screen (board R1). No column strip. */
  .grp { margin-bottom:var(--s2); }
  .grp.gone { display:none; }
  .grph { display:flex; align-items:center; gap:var(--s3); padding:var(--s6) 0 var(--s3); }
  .gc { font-size:var(--t-sm); color:var(--ink-4); }
  .tw { border:0; background:transparent; color:var(--ink-4); cursor:pointer;
    font-size:var(--t-sm); padding:0; width:12px; line-height:1; }
  .grp.shut .cards { display:none; }
  .cards { display:flex; flex-direction:column; gap:var(--s4); }
  /* Home cards only — this grid, the pointer cursor and the hover lift are the affordance of an
     openable row. Scoped to #home so it never leaks onto the plain block .card that _design.css
     gives the Setup view; an unscoped rule once split that form into two clipped columns. */
  #home .card { display:grid; grid-template-columns:1fr 260px; gap:var(--s5); background:var(--card);
    border:1px solid var(--hair); border-radius:var(--r-md); padding:var(--s4) var(--s5); cursor:pointer;
    transition:border-color .12s, box-shadow .12s; }
  #home .card:hover { border-color:var(--hair-2); box-shadow:var(--sh-md); }
  #home .card.gone { display:none; }
  #home .card .cd { display:flex; align-items:center; gap:var(--s2); margin-bottom:var(--s3); }
  #home .card .nm { font-size:var(--t-lg); letter-spacing:-.02em; }
  #home .card .pcount { margin-left:auto; }
  .rl { list-style:none; display:flex; flex-direction:column; gap:5px; margin:0; padding:0; }
  .rl li { display:flex; gap:var(--s2); align-items:baseline; font-size:var(--t-sm); color:var(--ink-2); }
  .rl li .id { font:var(--t-micro) var(--mono); color:var(--ink-4); width:24px; flex:none; }
  .rl li.more { color:var(--ink-4); font-size:var(--t-xs); padding-left:calc(24px + var(--s2)); }
  .cshot { aspect-ratio:16/10; border-radius:var(--r); border:1px solid var(--hair-2); overflow:hidden;
    background:linear-gradient(135deg,var(--wash),var(--sunk)); position:relative; }
  .cshot img { width:100%; height:100%; object-fit:cover; object-position:top left; display:block; }
  .cshot .play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:18px; color:var(--ink-4); }

  /* DETAIL — a fixed FULL-SCREEN window that COVERS the specboard bar, so a detail page has exactly
     ONE header: its own. Below it, R2's two panes each scroll on their own. z-index sits above the
     top bar (40) and below the log popup (49/50). */
  .dt { position:fixed; inset:0; background:var(--canvas); z-index:45;
    display:flex; flex-direction:column; }
  /* An author display declaration beats the hidden attribute's UA display:none, so a hidden detail
     really disappears rather than every one stacking. */
  .dt[hidden] { display:none; }
  /* the ONE detail header, full-width: title · … · Run all · view toggle · Close */
  .dth { flex:none; display:flex; align-items:center; gap:var(--s3);
    width:100%; padding:var(--s4) var(--s6);
    border-bottom:1px solid var(--hair); background:var(--paper); }
  .dth h2 { font-size:17px; letter-spacing:-.02em; }
  .dth .m { font:var(--t-xs) var(--mono); color:var(--ink-4); }
  .dtscroll { flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column;
    align-items:center; padding:var(--s5) var(--s6) var(--s5); }
  .dtscroll > .cols { width:100%; max-width:1200px; flex:1; min-height:0; }

  /* two columns, each a FIXED height so each pane scrolls on its OWN — scrolling one never moves the
     other, neither scrolls the page, and both headers stay pinned (board R2) */
  .cols { display:grid; grid-template-columns:minmax(0,40%) minmax(0,60%); gap:var(--s4);
    min-height:340px; }
  .pane { background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
    overflow-y:auto; overflow-x:hidden; padding-bottom:var(--s6); }
  .pane > h2 { position:sticky; top:0; z-index:2; background:var(--card);
    font:var(--t-xs) var(--mono); text-transform:uppercase; letter-spacing:.09em; color:var(--ink-4);
    padding:var(--s3) var(--s4); border-bottom:1px solid var(--hair); display:flex; align-items:center; gap:var(--s2); }
  .pane > h2 .s { margin-left:auto; text-transform:none; letter-spacing:0; }

  /* THE FOCUS READER (board R13): one requirement per page as TWO CONTAINERS — read LEFT (title,
     description, the flow step by step), verify RIGHT (the proof line, the actions, the scannable
     screenshot strip, then the recording). One of THREE views — Focus / List / Columns — switched by
     the header toggle; there is no in-reader Columns button. No new state; the same derived chips. */
  /* cap the reader's width like the mockup (was full-viewport, so the requirement column sprawled and
     the proof read cramped); centred, it keeps the two columns balanced with the proof the wider one */
  .focusov { width:100%; max-width:1160px; margin:0 auto; flex:1; min-height:0; display:flex; flex-direction:column; gap:var(--s3); }
  /* the id + state ride INSIDE the reading card (a meta line above the title) — no full-width bar
     above the columns eating vertical space, so both cards start at the top */
  .fread .frmeta { display:flex; align-items:center; gap:var(--s3); margin-bottom:var(--s4); }
  .frmeta .fid { font:var(--t-md) var(--mono); color:var(--ink-3); }
  .fchip { font-size:var(--t-sm); border-radius:999px; padding:2px 10px; border:1px solid; }
  /* board R4, amended 2026-08-17: the same four-word vocabulary as REQ_CHIP/LIST_CHIP above — the
     Focus reader is the detail's DEFAULT view, so it may never be the one surface still speaking the
     old binary proven/unproven while Columns and List have moved on. */
  .fchip.passed  { color:var(--koke); background:var(--koke-tint); border-color:var(--koke-line); }
  .fchip.failed  { color:var(--bengara); background:var(--bengara-tint); border-color:var(--bengara-line); }
  .fchip.not-reached { color:var(--yamabuki); background:var(--yamabuki-tint); border-color:var(--yamabuki-line); }
  .fchip.untested { color:var(--ink-3); background:var(--wash); border-color:var(--hair-2); }

  /* the two containers, each a bordered, softly-shadowed card. Each scrolls on its OWN (like the
     Columns panes, board R2): a fixed height from the grid, its own overflow — scrolling the evidence
     never moves the requirement, and the page itself does not scroll. */
  .fpage { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 600px;
    gap:var(--s4); align-items:stretch; }
  /* stacked on a narrow screen, per-card scroll would trap content — let the whole page scroll instead */
  @media (max-width:1080px) {
    .fpage { grid-template-columns:1fr; overflow-y:auto; }
    .fpage > .fread, .fpage > .feval { overflow:visible; }
  }
  .fread, .feval { background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
    box-shadow:0 1px 3px rgba(28,27,24,.05); overflow-y:auto; overflow-x:hidden; min-height:0; }
  .fread { padding:var(--s6) var(--s6) var(--s5); }
  .feval { padding:var(--s5); display:flex; flex-direction:column; gap:var(--s4); min-width:0; }
  .fread .fttl { font-size:22px; line-height:1.26; letter-spacing:-.02em; margin:0 0 var(--s3); }
  .fread .fbody { font-size:var(--t-md); line-height:1.64; color:var(--ink-2); }
  .fread .fbody p { margin:0 0 var(--s2); } .fread .fbody p:last-child { margin:0; }
  .fread .fbody ul { margin:var(--s2) 0 0; padding-left:1.2em; }
  .fread .fsteps { margin-top:var(--s6); }
  .flabel { font:var(--t-xs) var(--mono); text-transform:uppercase; letter-spacing:.09em;
    color:var(--ink-4); display:block; margin-bottom:var(--s4); }

  /* MATCH THE READING MOCKUP (board R13). The reader reuses the columns' WIRED components — the cloned
     steps carry the columns' compact beat rows, the moved controls carry the small buttons — so they
     must be RESTYLED here to the mockup's roomier look (rounded step cards, pill buttons, a framed
     highlight on THIS requirement's step). Scoped to the reader, so the columns' rows stay untouched. */
  .fread .fstepclone { margin:0; display:flex; flex-direction:column; gap:8px; }
  .fread .fstepclone .beat { border:1px solid var(--hair); border-radius:9px; background:var(--card);
    margin:0; padding:0; font-size:14px; color:var(--ink); overflow:hidden; }
  .fread .fstepclone .beat.f { color:var(--ink); }            /* only the mark + detail redden, not the label */
  .fread .fstepclone .beat.nr { border-style:solid; }
  .fread .fstepclone .beat.fhere { border-color:var(--hair-2); box-shadow:inset 3px 0 0 var(--ink); }
  .fread .fstepclone .beat .bh { padding:12px 15px; gap:13px; align-items:center; }
  .fread .fstepclone .beat .bnum { min-width:13px; }
  .fread .fstepclone .beat .blbl { font-size:14px; color:var(--ink); }
  .fread .fstepclone .beat.skip .blbl { color:var(--ink-4); }
  .fread .fstepclone .beat .bchev { color:var(--line3); font-size:15px; }
  .fread .fstepclone .beat .bdet { margin:0 15px 12px 42px; }
  .fread .fstepclone .beat .byou { flex:none; font-size:9.5px; letter-spacing:.08em; text-transform:uppercase;
    color:var(--ink-3); border:1px solid var(--hair-2); border-radius:999px; padding:2px 8px; white-space:nowrap; }
  /* #4: the proof label and the actions share the fphead's TOP ROW. Run is always shown; Run in
     background / Logs / Steps fold behind a compact ⋯ menu. The buttons are the MOVED wired per-test
     controls, restyled small here (aligned to the label height) — pills in the row, flat rows in the menu. */
  .feval .fptop { display:flex; align-items:center; gap:var(--s3); min-height:22px; }
  .feval .fpacts { margin-left:auto; display:flex; align-items:center; gap:var(--s2); }
  .feval .fpacts .btn, .feval .fpacts .btn.sm { font-size:12px; padding:5px 13px; border-radius:999px; }
  .feval .fpacts .runone::before { content:'\\25B6'; margin-right:6px; font-size:9px; }   /* the Run glyph */
  .fmenu { position:relative; display:inline-flex; }
  .fmenu .fmenubtn { font-size:15px; line-height:1; padding:4px 11px; border-radius:999px; }
  .fmenupop { position:absolute; right:0; top:calc(100% + 7px); min-width:186px; background:var(--paper);
    border:1px solid var(--hair-2); border-radius:var(--r-md); box-shadow:var(--sh-lg);
    padding:6px; display:none; flex-direction:column; z-index:20; }
  .fmenu.open .fmenupop { display:flex; }
  .fmenupop .btn, .fmenupop .btn.sm { display:block; width:100%; text-align:left; justify-content:flex-start;
    border:0; background:transparent; border-radius:8px; padding:9px 12px; font-size:var(--t-sm); color:var(--ink-2); }
  .fmenupop .btn:hover { background:var(--wash); color:var(--ink); border:0; }
  /* the moved evidence card must NOT wear the columns' row-hover wash — the reader card has no hover */
  .feval .fev .test.infocus:hover { background:transparent; }

  /* RIGHT — the evidence: proof line, controls, the screenshot strip (larger here), the recording */
  .fplbl { font:var(--t-xs) var(--mono); text-transform:uppercase; letter-spacing:.09em; color:var(--ink-4); display:block; }
  .fpby { font-size:var(--t-md); color:var(--ink-2); margin-top:var(--s2); }
  .fpby b { font-weight:500; }
  .fprun { font-size:var(--t-sm); color:var(--ink-4); margin-top:3px; }
  .fprun .tsha { font-family:var(--mono); color:var(--ink-3); border:1px solid var(--hair);
    border-radius:var(--r-sm); padding:0 4px; background:var(--paper); }
  .fpv.pass { color:var(--koke); } .fpv.fail { color:var(--bengara); } .fpv.none { color:var(--ink-4); }
  .fpnone { font:var(--t-sm) var(--mono); color:var(--ink-3); margin-top:var(--s2); }
  .fpmore { color:var(--ink-4); font-size:var(--t-sm); }
  .frecwrap .rec { width:100%; max-width:380px; }
  /* the moved test node, flattened inside .feval: header/steps/log hidden (the proof line is the
     header; the steps show as a clone on the LEFT); its controls a plain row, its frames the strip. */
  .fev { min-width:0; }
  .fev .test, .fev .test:last-child { border-bottom:0; }
  .fev .test.infocus { border:0; }
  .fev .test.infocus > .th { display:none; }
  .fev .test.infocus > .tbody { display:block; padding:0; }
  .fev .test.infocus .trow2 { display:none; }               /* the rec and every control are relocated out of it */
  .fev .test.infocus .fold, .fev .test.infocus .tstlog { display:none; }
  .feval .pfstrip { margin-top:0; overscroll-behavior-x:contain; }   /* its scroll never chains to the page */
  .feval .pfstrip .pframe { width:380px; }                  /* larger stills than the columns' 210px */

  /* the pager rides a compact, full-width FOOTER BAR (board R13) — its own surface (paper on the canvas
     page) with a hairline and a soft top shadow, so the number row reads as a distinct strip rather
     than floating on the background. Short, and its dots vertically centred. Focus-only (hidden else). */
  .dtfoot { flex:none; display:flex; align-items:center; justify-content:center; padding:var(--s5) var(--s6);
    background:var(--paper); border-top:1px solid var(--hair); box-shadow:0 -2px 8px rgba(28,27,24,.05); }
  .dtfoot[hidden] { display:none; }
  .fpager { flex:none; display:flex; align-items:center; justify-content:center; gap:var(--s3); }
  .fnav { width:24px; height:24px; border-radius:999px; border:1px solid var(--hair-2); background:var(--paper);
    color:var(--ink-2); font-size:13px; line-height:1; }
  .fnav:disabled { opacity:.35; cursor:default; }
  .fdots { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
  /* inline-flex + padding:0 so a two-digit number (10–14) sits dead-centre like a single digit does */
  .fdot { width:23px; height:23px; border-radius:999px; border:1px solid var(--hair-2); background:var(--paper);
    color:var(--ink-3); font:var(--t-xs) var(--mono); flex:none; padding:0;
    display:inline-flex; align-items:center; justify-content:center;
    transition:transform .15s var(--sc-e, ease), box-shadow .15s ease, border-color .15s ease; }
  .fdot:hover { border-color:var(--line3); }
  .fdot.proven { background:var(--koke-tint); border-color:var(--koke-line); color:var(--koke); }
  .fdot.unproven { background:var(--wash); }
  /* the gap between a jump-anchor (first/last page) and the sliding window — an inert ellipsis,
     muted so it reads as "there is more between" without competing with the numbered dots. */
  .fdotgap { flex:none; align-self:center; color:var(--ink-3); font:var(--t-xs) var(--mono);
    padding:0 1px; user-select:none; }
  /* the CURRENT dot — no offset outline ring (harsh). It lifts instead: a scale-up, an integral ink
     ring, a bold number and a soft shadow, so "you are here" reads cleanly whatever the dot's state.
     Kept z-index so the grown dot sits over its neighbours; .cur is LAST so it wins the border. */
  .fdot.cur { border-color:var(--ink); color:var(--ink); font-weight:500; transform:scale(1.1);
    box-shadow:0 1px 2px rgba(28,27,24,.08); position:relative; z-index:1; }

  /* the three-view TOGGLE in the detail header — Focus / List / Columns (board R13) */
  .viewseg { display:inline-flex; border:1px solid var(--hair-2); border-radius:999px; overflow:hidden; }
  .viewseg .vseg { font:inherit; font-size:var(--t-sm); padding:0 16px; border:0; background:transparent;
    color:var(--ink-3); cursor:pointer; letter-spacing:.02em; display:inline-flex; align-items:center; }
  .viewseg .vseg + .vseg { border-left:1px solid var(--hair-2); }
  .viewseg .vseg.on { background:var(--wash); color:var(--ink); font-weight:500; }
  /* Run all, the toggle and Close are ONE control family in the detail header (board R13, matching the
     focus mockup): the same 34px height and the same pill radius. Run all stays the one inverted
     element; Close is an outline; the toggle segments. Scoped to .dth so no other .btn is reshaped. */
  .dth .btn { height:34px; border-radius:999px; padding:0 17px; }
  .dth .viewseg { height:34px; }

  /* the LIST view — one compact line per requirement, a click opens it in Focus */
  .listview { display:flex; flex-direction:column; background:var(--card); border:1px solid var(--hair);
    border-radius:var(--r-md); overflow:hidden; width:100%; max-width:820px; margin:0 auto; }
  .lrow { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4); border:0;
    border-bottom:1px solid var(--hair); background:transparent; cursor:pointer; text-align:left; font:inherit; }
  .lrow:last-child { border-bottom:0; }
  .lrow:hover { background:var(--wash); }
  .lrow .lrchip { flex:none; }
  .lrow .lrid { font:var(--t-sm) var(--mono); color:var(--ink-3); width:34px; flex:none; }
  .lrow .lrt { flex:1; min-width:0; font-size:var(--t-md); color:var(--ink);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lrow .lrchev { color:var(--line3); font-size:15px; flex:none; }

  /* the reading hierarchy of both lists (board R3): a quiet one-line hint under each title */
  .rmain { flex:1; min-width:0; }
  .rhint { font-size:var(--t-xs); color:var(--ink-4); white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; margin-top:1px; }
  .req.open .rhint { display:none; }  /* the full body follows — the excerpt would just repeat it */
  .tmeta { font-size:var(--t-xs); color:var(--ink-4); margin-top:2px; padding-left:calc(11px + var(--s3));
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tmeta:empty { display:none; }
  .tmeta .failat { color:var(--bengara); }
  /* the commit a result ran against, on the result itself (dispatch R8) — so which commit a case
     passed or failed in is legible without opening its log */
  .tmeta .tsha { font-family:var(--mono); color:var(--ink-3); border:1px solid var(--hair);
    border-radius:var(--r-sm); padding:0 4px; background:var(--paper); }

  /* requirements — the TITLE until clicked, then the full markdown (board R3) */
  /* highlight the WHOLE item (header + expanded body), and fade it in/out */
  .req { border-bottom:1px solid var(--hair); transition:background-color .16s ease; }
  .req:last-child { border-bottom:0; }
  .req > .h { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4); cursor:pointer; }
  .req:hover { background:var(--wash); }
  .req.hot { background:var(--ai-tint); }
  .req .h .chip { padding:3px; }
  .req .id { font:var(--t-micro) var(--mono); color:var(--ink-4); width:24px; flex:none; }
  .req .rt { flex:1; font-size:var(--t-md); color:var(--ink); }
  .req .chev { color:var(--ink-4); font-size:11px; transition:transform .12s; }
  .req.open .chev { transform:rotate(90deg); }
  .req .body { display:none; padding:var(--s2) var(--s4) var(--s4) calc(var(--s4) + 24px + var(--s3));
    font-size:var(--t-sm); line-height:1.7; color:var(--ink-2); }
  .req.open .body { display:block; }
  .req .body p { margin:0 0 var(--s2); }
  /* the LEAD line reads first — one glanceable sentence of what the requirement means, in full ink */
  .req .body > p:first-child { color:var(--ink); font-weight:500; }
  /* bullets carry the sub-points: a small warm marker for structure, hung in the gutter so the text
     aligns flush and scans as a list, not a paragraph */
  .req .body ul { list-style:none; margin:0 0 var(--s2); padding-left:var(--s4); }
  .req .body li { margin:0 0 5px; position:relative; }
  .req .body li::before { content:""; position:absolute; left:calc(-1 * var(--s4)); top:.62em;
    width:5px; height:5px; border-radius:50%; background:var(--line3); }
  /* bold KEY TERMS get a quiet highlighter wash (yamabuki-tint, the faintest gold) — emphasis that
     reads as a marker-pen, never a state chip; the ink text keeps full AA contrast on top of it */
  .req .body strong { color:var(--ink); font-weight:600;
    box-shadow:inset 0 -0.34em 0 var(--yamabuki-tint); }
  .req .body em { color:var(--ink-3); font-style:italic; }
  .req .body code { font:var(--t-xs) var(--mono); background:var(--sunk); border:1px solid var(--hair);
    border-radius:var(--r-sm); padding:1px 5px; }
  /* the honest "no test asserts this yet" line on an UNPROVEN requirement. (The .ctag rule that used
     to sit here was deleted 2026-08-05: reqRow stopped rendering per-test chips in this line long
     ago, so nothing produced a .ctag — and the orphaned rule was exactly what made a dead assertion
     on it look plausible to two board tests.) */
  .covers { margin-top:var(--s3); font:var(--t-micro) var(--mono); color:var(--ink-4);
    display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .covers .nocov { color:var(--ink-4); }

  /* a test — collapsible: title + coverage tags + status when closed; open to a recording, run/watch,
     the fold of steps, and a link to the full log (board R3/R10) */
  /* padding lives on .th (not .test) so the hover/hot background fills the WHOLE row edge-to-edge,
     exactly like the requirement side — not just the inner text. */
  .test { border-bottom:1px solid var(--hair); transition:background-color .16s ease; }
  .test:last-child { border-bottom:0; }
  .test > .th { cursor:pointer; padding:var(--s3) var(--s4); }
  .throw { display:flex; align-items:center; gap:var(--s3); }
  /* hover the item → grey; its linked item(s) → blue (.hot). The WHOLE item highlights (header +
     expanded body), full-width, and fades in/out. Same both directions, reqs ↔ tests. */
  .test:hover { background:var(--wash); }
  .test.hot { background:var(--ai-tint); }
  .throw .chev { color:var(--ink-4); font-size:11px; transition:transform .12s; flex:none; }
  .test.open .throw .chev { transform:rotate(90deg); }
  .ttl { flex:1; font-size:var(--t-md); color:var(--ink); }
  .throw .tags { flex:none; }
  .tbody { display:none; padding:0 var(--s4) var(--s3); }
  .test.open .tbody { display:block; }
  /* wrap, so when the player GROWS (below) the Run/Watch/Logs/Steps do not get crushed into a sliver
     beside it and spill past the panel — they drop to their own row underneath instead. */
  .trow2 { display:flex; gap:var(--s4); align-items:center; flex-wrap:wrap; }
  /* the actions keep their natural size — never shrink to make room for the growing player. */
  .trow2 .tacts { flex:none; }
  .rec { position:relative; width:300px; aspect-ratio:16/9; flex:none; border-radius:var(--r);
    border:1px solid var(--hair-2); overflow:hidden; cursor:default; transition:width .25s ease;
    background:linear-gradient(135deg,var(--wash),var(--sunk)); background-size:cover; background-position:top left; }
  /* while the recording PLAYS the player grows, so a run is watchable without fullscreen */
  .rec.playing { width:min(640px, 100%); }
  /* a still cover is playable ONLY when a run captured a video; otherwise it is honestly a still */
  .rec.playable { cursor:pointer; }
  .rec .play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:20px; color:var(--ink-4); }
  /* contain, never cover: the narration topbar is burned into the frame's top edge (board R10),
     and cover's fill-and-crop sliced exactly that edge off. Letterbox on the ink background. */
  .rec video { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; background:var(--ink); }
  .rec .lab { position:absolute; bottom:5px; right:7px; font:var(--t-micro) var(--mono); color:var(--ink-3);
    background:var(--paper); padding:0 5px; border-radius:3px; }
  .tacts { flex-wrap:wrap; justify-content:flex-end; }
  .tags { display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
  /* coverage refs — quiet, NEUTRAL metadata at rest. They tint indigo only on hover, tying the test
     to the requirement(s) it covers — the one place indigo is still spent on this board (a transient
     link, not a status; "your turn" itself no longer exists, the human, 2026-08-17). */
  .tag { font:var(--t-micro) var(--mono); padding:1px 7px; border-radius:var(--r-sm);
    background:var(--wash); color:var(--ink-3); transition:background .12s, color .12s; }
  .test:hover .th .tag, .test.hot .th .tag { background:var(--ai-tint); color:var(--ai); }
  .test .tacts { opacity:1; margin-left:0; display:inline-flex; gap:var(--s2); }
  /* full log rides the actions row as a bordered button beside Watch — NOT indigo: it wears the
     neutral .btn sm like Run/Watch. It opens a floating window. */
  .fold { margin-top:var(--s3); }

  /* PROOF FRAMES (board R14): the recording read as a scannable STRIP of stills — one per checked
     value, cut from the video at the instant that check fired, each carrying the topbar it burned in
     and the ring on the value. A reviewer verifies by eye, in order, without pressing play; the video
     (above) is kept for what a still can't show. loadRuns fills this from the run's own frames; a run
     with no video has none, so an :empty strip collapses — never a faked or separately-captured strip. */
  .pfstrip { display:flex; gap:var(--s3); margin-top:var(--s3); padding-bottom:var(--s2);
    overflow-x:auto; scroll-snap-type:x proximity; }
  .pfstrip:empty { display:none; }
  .pframe { flex:none; width:210px; scroll-snap-align:start; margin:0;
    border:1px solid var(--hair-2); border-radius:var(--r-sm); background:var(--paper); overflow:hidden; }
  .pframe.bad { border-color:var(--bengara-line); }
  .pframe img { display:block; width:100%; height:auto; cursor:zoom-in; border-bottom:1px solid var(--hair); }
  .pfcap { padding:var(--s2) var(--s3); font:var(--t-xs) var(--mono); color:var(--ink-3);
    line-height:1.4; display:flex; gap:6px; align-items:baseline; }
  .pfcap .pfreq { flex:none; color:var(--ink-4); }
  .pframe.bad .pfcap { color:var(--bengara); }

  /* the full log opens in a FLOATING window, not a full-viewport scrim — the board stays visible
     behind it. Close / Esc / a click off the card dismiss it (board R10). */
  .sheet { display:none; }
  /* open: a full-viewport scrim dims the board so the popup reads as the foreground, and the .box
     (below) floats on it as a CARD — never filling the viewport (board R10). A click anywhere on the
     scrim (off the card) closes it, alongside the Close button and Esc. The scrim wears the ink colour
     at low alpha, the same overlay tone the lightbox uses. */
  .sheet.on { display:block; position:fixed; inset:0; z-index:49; background:rgba(28,27,24,.32); }
  .sheet .box { position:fixed; z-index:50; top:8vh; left:50%; transform:translateX(-50%);
    width:720px; max-width:calc(100vw - 48px); max-height:80vh;
    background:var(--card); border:1px solid var(--hair-2); border-radius:var(--r-lg);
    box-shadow:var(--sh-lg); display:flex; flex-direction:column; overflow:hidden; }
  .sheet .bh { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4);
    border-bottom:1px solid var(--hair); }
  .sheet .bh strong { font-size:var(--t-md); }
  .sheet .bb { padding:var(--s4); overflow:auto; }
  .sheet .bb:empty:before { content:"No runs recorded for this test yet."; color:var(--ink-4); font-size:var(--t-sm); }
  /* the INLINE evidence of a case (board R10): NUMBERED story rows in human words — the author's
     flow sentence, or the requirement's title for a proves-beat (with a quiet id chip). A row with
     recorded detail (the announced got/expected notes, the requirements it proved) expands on
     click; raw plumbing stays in the Steps window. */
  .tststeps { margin:var(--s2) 0 0 14px; }
  .tststeps:empty { display:none; }
  .beat { border-left:2px solid var(--hair); margin:var(--s2) 0; padding:2px 0 2px var(--s3);
    font-size:var(--t-sm); color:var(--ink-2); }
  .beat.f { border-left-color:var(--bengara); color:var(--bengara); }
  /* a step not yet run (pending) or one the flow never reached (not-reached) reads quiet, never
     green and never red — the honest "we don't know / we didn't get there" (board R10) */
  .beat.pending, .beat.nr { color:var(--ink-4); }
  .beat.nr { border-left-style:dashed; }
  .beat .bh { display:flex; align-items:baseline; gap:var(--s2); }
  .beat.hasdet .bh { cursor:pointer; }
  .beat.hasdet .bh:hover .blbl { color:var(--ink); }
  .beat.f.hasdet .bh:hover .blbl { color:var(--bengara); }
  .beat:not(.hasdet) .bchev { visibility:hidden; }
  .beat .bnum { flex:none; font:var(--t-micro) var(--mono); color:var(--ink-4); min-width:12px; }
  .beat .bmk { flex:none; }
  .beat.p .bmk { color:var(--koke); }
  .beat.f .bmk { color:var(--bengara); }
  .beat.pending .bmk, .beat.nr .bmk { color:var(--ink-4); }
  .beat .bid { flex:none; font:var(--t-micro) var(--mono); background:var(--wash); color:var(--ink-3);
    border-radius:var(--r-sm); padding:1px 6px; }
  .beat.f .bid { background:var(--bengara-tint); color:var(--bengara); }
  .beat .blbl { flex:1; min-width:0; }
  .beat .bchev { flex:none; color:var(--ink-4); font-size:11px; }
  .beat .bdet { list-style:none; margin:3px 0 var(--s2) calc(12px + var(--s2)); padding:0; }
  .beat .bdet[hidden] { display:none; }
  .beat .bdet li { padding:1px 0; line-height:1.5; }
  .bnote { font:var(--t-xs)/1.5 var(--mono); color:var(--ink-3); white-space:pre-line; }
  .bprove { font:var(--t-micro) var(--mono); color:var(--ink-4); }
  .braw { font:var(--t-xs)/1.5 var(--mono); color:var(--bengara); }
  .bdet li.sf { color:var(--bengara); }
  .snote { font:var(--t-micro) var(--mono); color:var(--ink-4); margin-top:var(--s2); }
  .stepslist { list-style:none; margin:var(--s2) 0 0; padding:0; }
  .stepslist li.scat-info { color:var(--ink-3); font-family:var(--mono); }
  .stepslist li.scat-info:before { content:"»"; }
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
  /* the case's OWN log history is POPULATED but never shown inline — there is ONE full-log
     affordance, the popup (board R10). loadRuns still fills .tstlog (dispatch R8 folds every case's
     history into it) and the popup copies its content, so the log lives in exactly one visible place.
     Its styles hang off .logbox / .lghist so they render inside the popup, where the log is read. */
  .tstlog { display:none; }
  .logbox summary { font:var(--t-xs)/1.4 var(--sans); color:var(--ink-4); cursor:pointer; }
  .logbox summary:hover { color:var(--ink-2); }
  .lghist pre { margin:var(--s2) 0 0; padding:var(--s2) var(--s3); background:var(--sunk);
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
  /* every image is clickable — thumbnails render at a fraction of real size, and what a screenshot
     actually shows cannot honestly be judged from a thumbnail */
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
  /* per-test run controls appear on the row you are pointing at, so five tests do not become ten
     competing buttons */
  .tacts { display:inline-flex; gap:4px; margin-left:var(--s2); opacity:0; transition:opacity .12s; }
  .tst:hover .tacts, .tst:focus-within .tacts { opacity:1; }
  .watchtog { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-sm);
    color:var(--ink-3); cursor:pointer; }
  .watchtog input { accent-color:var(--ai); width:13px; height:13px; }
  .watchtog.off { opacity:.5; cursor:default; }
  .watchtog.off input { cursor:default; }
  /* voice-over readiness + install helper (init R6) */
  .vhelp { border:1px solid var(--hair); border-radius:var(--r); padding:var(--s3) var(--s4);
    background:var(--canvas); margin-top:var(--s3); }
  .vhlabel { font-size:var(--t-xs); color:var(--ink-4); margin-bottom:4px; }
  .vhpre { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink-2); background:var(--paper);
    border:1px solid var(--hair); border-radius:var(--r); padding:var(--s3);
    white-space:pre-wrap; word-break:break-word; margin:0 0 6px; max-width:100%; overflow-x:auto; }
  .vhrow { display:flex; align-items:center; gap:var(--s3); }
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

  /* legend — every hue also carries a mark, never colour alone */
  #howview .legend { display:flex; flex-wrap:wrap; gap:var(--s2); margin-top:var(--s5); }
  #howview .legend .chip { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-xs);
    line-height:1.4; padding:3px var(--s2); background:var(--wash); color:var(--ink-3);
    border-radius:var(--r-sm); white-space:nowrap; box-shadow:none; }
  #howview .legend .chip.rev { background:var(--ai-tint); color:var(--ai); box-shadow:inset 0 0 0 1px var(--ai-line); }
  #howview .legend .chip.ok { background:var(--koke-tint); color:var(--koke); box-shadow:inset 0 0 0 1px var(--koke-line); }
  #howview .legend .chip.run { background:var(--yamabuki-tint); color:var(--yamabuki); box-shadow:inset 0 0 0 1px var(--yamabuki-line); }
  #howview .legend .chip.stale { background:var(--bengara-tint); color:var(--bengara); box-shadow:inset 0 0 0 1px var(--bengara-line); }
  /* unproven wears the board's OWN chip. reqChip draws it as chip.gone + a hollow mark, so the
     legend must draw it that way too — it used to borrow bengara chip.stale, which the flow legend
     below already spends on "re-look", leaving one appearance carrying two meanings on the page
     whose whole claim is that it cannot drift from what you will actually see. */
  #howview .legend .chip.gone { background:transparent; color:var(--ink-4); box-shadow:inset 0 0 0 1px var(--hair); }
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

  /* the guide, as a four-act walkthrough (board R11) — LAYOUT only. Every colour, size, radius and
     mark is a token or a board class reused from above; no raw hue is introduced here. The acts are
     all present; the stepper shows one step of each at a time. Indigo is spent only in Act 4 (.wfn.yours,
     .wcta-act), and the one solid element per act is chip.bad in Act 1 and .wcta-act in Act 4 — but
     ONLY while there is a real next action (board R12 fix). Once the journey is folded, the CTA wears
     .wcta-settled instead — the same koke/"ok" tint tokens as this page's own proven/settled chips
     (see .legend .chip.ok below), never indigo: no inverted element competes with anything else. */
  #howview #walkthrough { margin-top:var(--s5); display:flex; flex-direction:column; gap:var(--s6); }
  /* a quiet map of the four beats — pips carry data-pip, never data-act */
  #howview .wt-map { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s2);
    font-size:var(--t-xs); color:var(--ink-3); }
  #howview .wt-pip { display:inline-flex; align-items:center; gap:6px; padding:4px var(--s2);
    background:var(--wash); border-radius:var(--r-sm); color:var(--ink-2); }
  #howview .wt-pn { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px;
    flex:none; border-radius:50%; background:var(--paper); box-shadow:inset 0 0 0 1px var(--hair-2);
    font-size:var(--t-micro); color:var(--ink-3); }
  #howview .wt-sep { color:var(--ink-4); }

  /* one act */
  #howview .act { border:1px solid var(--hair); border-radius:var(--r-md); background:var(--paper);
    padding:var(--s5); }
  #howview .act-h { display:flex; align-items:baseline; gap:var(--s3); margin-bottom:var(--s4); }
  #howview .act-n { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
    flex:none; border-radius:50%; background:var(--wash); box-shadow:inset 0 0 0 1px var(--hair-2);
    font-size:var(--t-sm); color:var(--ink-3); }
  #howview .act-t h2 { font-size:var(--t-lg); }
  #howview .act-sub { display:block; margin-top:2px; font-size:var(--t-sm); color:var(--ink-3); }
  #howview .wsteps { display:flex; flex-direction:column; gap:var(--s4); }
  /* one step per act at a time (board R11): every .wstep is hidden until it is the active .on step —
     the first is baked .on, the controller moves it. Text of a hidden step stays in the DOM. */
  #howview .wstep { display:none; flex-direction:column; gap:var(--s3); }
  #howview .wstep.on { display:flex; }
  #howview .wnote { font-size:var(--t-sm); color:var(--ink-2); line-height:1.5; max-width:760px; }

  /* the pinned verdict (board R11): a mark-bearing neutral pill, NOT a solid/indigo element. It rides
     its step's visibility, so it appears when that step is active and stays — no timer removes it. */
  #howview .wpinned { display:inline-flex; align-self:flex-start; align-items:center; gap:6px;
    margin-top:2px; padding:3px var(--s2); border-radius:var(--r-sm); background:var(--wash);
    box-shadow:inset 0 0 0 1px var(--hair-2); font-size:var(--t-xs); color:var(--ink-2); letter-spacing:.02em; }

  /* per-act stepper nav — quiet outline buttons; the chevron marks and the numeric count carry it */
  #howview .wnav { display:flex; align-items:center; gap:var(--s3); margin-top:var(--s4);
    padding-top:var(--s3); border-top:1px solid var(--hair); }
  #howview .wnavb { display:inline-flex; align-items:center; gap:6px; padding:5px var(--s3);
    border:1px solid var(--hair-2); border-radius:var(--r); background:var(--paper);
    font-size:var(--t-sm); color:var(--ink-2); cursor:pointer; }
  #howview .wnavb:hover:not([disabled]) { border-color:var(--line3); color:var(--ink); }
  #howview .wnavb[disabled] { opacity:.4; cursor:default; }
  #howview .wchev { color:var(--ink-4); font-size:var(--t-md); line-height:1; }
  #howview .wcount { min-width:44px; text-align:center; font-size:var(--t-xs); color:var(--ink-3);
    letter-spacing:.02em; font-variant-numeric:tabular-nums; }

  /* Acts 1 & 2 — the caption UNDER a scene, never the beat itself. One line: the label is the board's
     existing micro/uppercase caption treatment, the body the reading size, and the label is what makes
     the two acts read as the same three moments twice. No hue in a caption — the mirror is the
     argument, so neither act may be tinted to win it. (.wproof / .wmirror / .wsep went with the prose
     step kinds stage 1R replaced; .wsym / .wreframe / .wba with the earlier symptoms/inversion pass.) */
  #howview .wmoment { display:flex; flex-direction:column; gap:var(--s1); }
  #howview .wm-label { font-size:var(--t-micro); letter-spacing:.06em; color:var(--ink-4);
    text-transform:uppercase; }
  #howview .wm-body { font-size:var(--t-md); color:var(--ink); line-height:1.55; }
  #howview .wcp-eq, #howview .wfa { color:var(--ink-4); font-size:var(--t-sm); flex:none; }

  /* ── THE SCENES (board R11, stage 1R) ─────────────────────────────────────────────────────────
     Every step of Acts 1 and 2 is a small drawn mock that PLAYS when the stepper reveals it and ENDS
     IN A HELD STATE. Three invariants hold this together (see the renderers in build-board.mjs):
       1. no new client JS — .wstep toggles display, which cancels a hidden step's animations and
          starts them from zero when it is shown again. That IS the replay mechanism;
       2. every animated element's BASE declaration is its END state, and its keyframes travel from
          the start to that same end with fill-mode both. So the reduced-motion block below only has
          to switch animation off: the finished picture is already what the rules describe;
       3. nothing loops; every scene lands inside ~3.5s.
     Colour is the design system unchanged: bengara for the failure beats, koke for the settled ones —
     and indigo nowhere on this page any more (the human, 2026-08-17: there is no more state that
     waits on a person). Every hue still rides a mark. */
  #howview .scene { --sc-e:cubic-bezier(.2,.7,.3,1);
    border:1px solid var(--hair-2); border-radius:var(--r-md); background:var(--canvas); padding:var(--s4); }

  /* the shared mock-window chrome every scene is built from */
  #howview .sc-win { border:1px solid var(--hair-2); border-radius:var(--r); background:var(--paper);
    overflow:hidden; }
  #howview .sc-hd { display:flex; align-items:center; gap:var(--s2); padding:5px var(--s3);
    border-bottom:1px solid var(--hair); background:var(--wash); }
  #howview .sc-t { font-size:var(--t-micro); color:var(--ink-3); }
  #howview .sc-r { margin-left:auto; }
  #howview .sc-pad { display:flex; flex-direction:column; gap:var(--s2); padding:var(--s3); }
  #howview .sc-line { display:flex; gap:var(--s3); font-size:var(--t-xs); color:var(--ink); }
  #howview .sc-n { flex:none; width:18px; text-align:right; font-size:var(--t-micro); color:var(--ink-4); }
  #howview .sc-dimf { opacity:.45; }

  /* 1 · the chat that scrolls away */
  #howview .s-chat .sc-view { position:relative; height:190px; overflow:hidden; }
  #howview .sc-thread { position:absolute; left:0; right:0; top:0; display:flex; flex-direction:column;
    gap:var(--s2); padding:var(--s3); opacity:.13; transform:translateY(-108px);
    animation:sc-away 1.2s var(--sc-e) 1.55s both; }
  #howview .sc-bub { max-width:64%; padding:6px var(--s3); border-radius:var(--r);
    font-size:var(--t-sm); line-height:1.45; animation:sc-pop .34s var(--sc-e) both; }
  #howview .sc-you { align-self:flex-end; background:var(--wash); color:var(--ink); }
  #howview .sc-them { align-self:flex-start; background:var(--paper); color:var(--ink-2);
    box-shadow:inset 0 0 0 1px var(--hair-2); }
  #howview .sc-thread .sc-bub:nth-child(2) { animation:sc-popin .4s var(--sc-e) .5s both; }
  #howview .sc-thread .sc-bub:nth-child(3) { animation-delay:.95s; }
  #howview .sc-ghost { position:absolute; left:0; right:0; bottom:var(--s4); display:flex;
    flex-direction:column; align-items:center; gap:var(--s2);
    animation:sc-rise .6s var(--sc-e) 2.45s both; }
  #howview .sc-doc { width:34px; height:44px; fill:none; stroke:var(--line3); stroke-width:1;
    stroke-dasharray:3 3; }
  #howview .sc-gt { font-size:var(--t-micro); letter-spacing:.14em; text-transform:uppercase;
    color:var(--ink-3); }

  /* 2 · the wall you cannot review — greeked, because that is the honest picture of a diff nobody read */
  #howview .s-wall .sc-code { position:relative; padding:var(--s3) var(--s3) var(--s6); min-height:190px; }
  #howview .sc-gl { display:flex; align-items:center; gap:var(--s3); height:15px;
    animation:sc-slide .3s var(--sc-e) both; }
  #howview .sc-toks { display:flex; align-items:center; gap:6px; }
  #howview .sc-tok { height:5px; border-radius:2px; background:var(--hair-2); }
  #howview .sc-tok.k { background:var(--line3); }
  #howview .sc-badge { position:absolute; right:var(--s3); bottom:var(--s3);
    animation:sc-stamp .42s var(--sc-e) 1.15s both; }

  /* 3 · two weeks later — the calendar peels, the feature cracks, the REQUIREMENT gets rewritten */
  #howview .sc-rot { display:flex; gap:var(--s4); }
  #howview .sc-cal { flex:none; width:114px; border:1px solid var(--hair-2); border-radius:var(--r);
    background:var(--paper); overflow:hidden; }
  #howview .sc-calh { padding:5px var(--s3); border-bottom:1px solid var(--hair); background:var(--wash); }
  #howview .sc-sheets { position:relative; height:104px; perspective:460px; }
  #howview .sc-sheet { position:absolute; left:0; right:0; top:0; bottom:0; display:flex;
    flex-direction:column; align-items:center; justify-content:center; gap:2px; background:var(--paper);
    font-size:var(--t-micro); letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3);
    transform-origin:top center; }
  #howview .sc-sheet b { font-weight:400; font-size:var(--t-xl); color:var(--ink); letter-spacing:-.03em; }
  #howview .sc-s3 { z-index:1; }
  #howview .sc-s2 { z-index:2; opacity:0; transform:rotateX(-94deg); animation:sc-peel .5s var(--sc-e) .95s both; }
  #howview .sc-s1 { z-index:3; opacity:0; transform:rotateX(-94deg); animation:sc-peel .5s var(--sc-e) .35s both; }
  #howview .sc-rotr { flex:1; min-width:0; display:flex; flex-direction:column; gap:var(--s3);
    justify-content:center; }
  #howview .sc-fcard { position:relative; display:flex; align-items:center; gap:var(--s3);
    padding:var(--s3); border-radius:var(--r); overflow:hidden; background:var(--bengara-tint);
    box-shadow:inset 0 0 0 1px var(--bengara-line); animation:sc-break .5s var(--sc-e) 1.35s both; }
  #howview .sc-fct { font-size:var(--t-sm); color:var(--ink); }
  #howview .sc-fcc { margin-left:auto; }
  #howview .sc-crack { position:absolute; left:0; top:0; width:100%; height:100%; fill:none;
    stroke:var(--bengara); stroke-width:1.5; stroke-dasharray:170; stroke-dashoffset:0;
    animation:sc-draw .55s linear 1.65s both; }
  #howview .sc-rew { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s2); font-size:var(--t-sm); }
  #howview .sc-rewl { width:100%; font-size:var(--t-micro); color:var(--ink-4); }
  #howview .sc-old { position:relative; color:var(--ink-3); }
  #howview .sc-strike { position:absolute; left:0; top:50%; height:1px; width:100%;
    background:var(--bengara); animation:sc-strike .45s linear 2s both; }
  #howview .sc-arr { color:var(--ink-4); }
  #howview .sc-new { color:var(--bengara); animation:sc-rise .4s var(--sc-e) 2.4s both; }
  #howview .sc-same { align-self:flex-start; animation:sc-stamp .4s var(--sc-e) 2.55s both; }
  #howview .sc-roll { display:inline-block; height:15px; overflow:hidden; vertical-align:-3px; }
  #howview .sc-rs { display:block; transform:translateY(-30px); animation:sc-roll .9s linear 2.75s both; }
  #howview .sc-rs > span { display:block; height:15px; line-height:15px; }

  /* 4 · the invisible green — a passing assertion beside the screen it never looked at */
  #howview .sc-split { display:grid; grid-template-columns:1fr 130px 1fr; align-items:center; gap:var(--s3); }
  #howview .sc-split > .sc-win:first-child { animation:sc-rise .4s var(--sc-e) both; }
  #howview .sc-split > .sc-win:last-child { animation:sc-rise .4s var(--sc-e) 1.1s both; }
  #howview .s-blind .sc-line:nth-child(1) { animation:sc-rise .35s var(--sc-e) .15s both; }
  #howview .s-blind .sc-line:nth-child(2) { animation:sc-rise .35s var(--sc-e) .4s both; }
  #howview .sc-green { align-self:flex-start; animation:sc-stamp .42s var(--sc-e) .8s both; }
  #howview .sc-mid { display:flex; flex-direction:column; align-items:center; gap:var(--s2);
    animation:sc-rise .55s var(--sc-e) 2.3s both; }
  #howview .sc-eye { width:28px; height:20px; fill:none; stroke:var(--bengara); stroke-width:1.2; }
  #howview .sc-nobody { font-size:var(--t-micro); letter-spacing:.16em; text-transform:uppercase;
    color:var(--bengara); text-align:center; }
  #howview .sc-fld { display:flex; align-items:baseline; gap:var(--s3); padding-bottom:var(--s2);
    border-bottom:1px solid var(--hair); animation:sc-rise .35s var(--sc-e) 1.3s both; }
  #howview .sc-fld.sc-dimf { animation-delay:1.45s; }
  #howview .sc-fl { font-size:var(--t-xs); color:var(--ink-3); }
  #howview .sc-fv, #howview .sc-fv2 { margin-left:auto; font-size:var(--t-sm); }
  #howview .sc-fv { padding:2px 6px; border-radius:var(--r-sm); color:var(--bengara);
    background:var(--bengara-tint); box-shadow:inset 0 0 0 1px var(--bengara-line);
    animation:sc-mark .5s var(--sc-e) 1.75s both; }
  #howview .sc-stalec { align-self:flex-start; animation:sc-stamp .42s var(--sc-e) 2.65s both; }

  /* 5 · canon the moment it's written — a settled koke stamp, no indigo, no gate */
  #howview .sc-morph { position:relative; min-height:158px; display:flex; align-items:center; }
  #howview .sc-mbub { position:absolute; left:0; top:var(--s3); max-width:58%; opacity:0;
    animation:sc-become 1.35s var(--sc-e) both; }
  #howview .sc-card { position:relative; flex:1; border:1px solid var(--hair-2); border-radius:var(--r);
    background:var(--paper); padding:var(--s4); display:flex; flex-direction:column; gap:var(--s3);
    transform-origin:top left; animation:sc-grow .55s var(--sc-e) 1s both; }
  #howview .sc-ch { display:flex; align-items:center; gap:var(--s2); }
  #howview .sc-id { font-size:var(--t-micro); color:var(--ink-3); padding:1px 6px;
    border-radius:var(--r-sm); box-shadow:inset 0 0 0 1px var(--hair-2); }
  #howview .sc-cb { font-size:var(--t-md); color:var(--ink); line-height:1.5; }
  #howview .sc-canon { align-self:flex-start; animation:sc-stamp .45s var(--sc-e) 1.7s both; }

  /* 6 · review by watching — a recording player whose miniature golden scene plays once */
  #howview .sc-player { border:1px solid var(--hair-2); border-radius:var(--r); background:var(--paper);
    overflow:hidden; animation:sc-rise .4s var(--sc-e) both; }
  #howview .sc-tag { margin-left:auto; font-size:var(--t-micro); letter-spacing:.12em;
    text-transform:uppercase; color:var(--ink-3); padding:1px 6px; border-radius:var(--r-sm);
    background:var(--paper); box-shadow:inset 0 0 0 1px var(--hair-2); }
  #howview .sc-stage { position:relative; height:176px; overflow:hidden; }
  #howview .sc-pv { position:absolute; left:0; right:0; top:0; bottom:0; padding:var(--s3); }
  #howview .sc-tbl { display:flex; flex-direction:column; gap:2px; opacity:0; transform:translateX(-28px);
    animation:sc-swapout 2.45s var(--sc-e) .2s both; }
  #howview .sc-tr { display:grid; grid-template-columns:52px 1fr 44px; align-items:center; gap:var(--s2);
    padding:5px var(--s2); font-size:var(--t-xs); color:var(--ink); }
  #howview .sc-th { font-size:var(--t-micro); letter-spacing:.1em; text-transform:uppercase;
    color:var(--ink-4); border-bottom:1px solid var(--hair); }
  #howview .sc-hit { background:var(--wash); border-radius:var(--r-sm); }
  #howview .sc-cell { position:relative; display:inline-block; height:15px; width:38px; overflow:hidden;
    vertical-align:-3px; }
  #howview .sc-was, #howview .sc-is { position:absolute; left:0; top:0; height:15px; line-height:15px;
    font-style:normal; }
  #howview .sc-was { opacity:0; transform:translateY(-15px); animation:sc-vout .3s var(--sc-e) .95s both; }
  #howview .sc-is { animation:sc-vin .32s var(--sc-e) 1.05s both; }
  #howview .sc-chart { display:flex; align-items:flex-end; justify-content:center; gap:var(--s6);
    padding-bottom:var(--s4); animation:sc-swapin .45s var(--sc-e) 2.25s both; }
  #howview .sc-col { display:flex; flex-direction:column; align-items:center; gap:6px; }
  #howview .sc-bv { font-size:var(--t-micro); color:var(--ink); animation:sc-rise .35s var(--sc-e) both; }
  #howview .sc-track { display:flex; align-items:flex-end; height:88px; }
  #howview .sc-bar { display:block; width:26px; background:var(--ink-3); border-radius:2px 2px 0 0;
    transform-origin:bottom; animation:sc-growb .5s var(--sc-e) both; }
  #howview .sc-bl { font-size:var(--t-micro); color:var(--ink-4); }
  #howview .sc-transport { display:flex; align-items:center; gap:var(--s3); padding:var(--s2) var(--s3);
    border-top:1px solid var(--hair); }
  #howview .sc-play { width:10px; height:12px; flex:none; fill:var(--ink-3); }
  #howview .sc-prog { flex:1; height:3px; border-radius:2px; background:var(--hair); overflow:hidden; }
  #howview .sc-fill { display:block; height:3px; width:100%; background:var(--ink-3);
    animation:sc-prog 3.3s linear .2s both; }
  #howview .sc-time { font-size:var(--t-micro); color:var(--ink-4); }

  /* 7 · the chip that flips — the mutation and the verdict, drawn as one movement */
  #howview .sc-dr { display:grid; grid-template-columns:1fr 64px 1fr; align-items:center; gap:var(--s2); }
  #howview .s-drift .sc-win { animation:sc-rise .4s var(--sc-e) both; }
  #howview .sc-hot { margin:0 -4px; padding:1px 4px; border-radius:var(--r-sm);
    background:var(--bengara-tint); animation:sc-hot .45s var(--sc-e) .85s both; }
  #howview .sc-mut { position:relative; display:inline-block; height:15px; width:8px; overflow:hidden;
    vertical-align:-3px; }
  #howview .s-drift .sc-is { color:var(--bengara); }
  #howview .sc-wire { width:64px; height:14px; fill:none; }
  #howview .sc-wl, #howview .sc-wh { stroke:var(--hair-2); stroke-width:1; }
  #howview .sc-wp { stroke:var(--bengara); stroke-width:1.6; stroke-dasharray:10 60;
    stroke-dashoffset:-58; animation:sc-travel .55s linear 1s both; }
  #howview .sc-rq { display:flex; align-items:center; gap:var(--s3); padding:var(--s2) 0; }
  #howview .sc-rqt { font-size:var(--t-xs); color:var(--ink-2); }
  #howview .sc-flip { position:relative; flex:none; margin-left:auto; width:82px; height:21px; }
  #howview .wproven, #howview .wunproven { position:absolute; right:0; top:0; }
  #howview .wproven { opacity:0; transform:scale(.82); animation:sc-flipout .3s var(--sc-e) 1.45s both; }
  #howview .wunproven { animation:sc-flipin .34s var(--sc-e) 1.55s both; }

  /* 8 · the mirror, drawn — marks and ink, never a wash of hue: the comparison must be read */
  #howview .sc-mir { display:grid; grid-template-columns:1fr 1px 1fr; gap:var(--s5); }
  #howview .sc-mcol { display:flex; flex-direction:column; gap:var(--s3); }
  #howview .sc-mh { font-size:var(--t-micro); letter-spacing:.14em; text-transform:uppercase;
    color:var(--ink-3); animation:sc-rise .35s var(--sc-e) both; }
  #howview .sc-row { display:flex; align-items:flex-start; gap:var(--s2); font-size:var(--t-sm);
    color:var(--ink-2); line-height:1.5; animation:sc-inl .4s var(--sc-e) both; }
  #howview .sc-row .mk { flex:none; margin-top:.5em; }
  #howview .sc-bad .mk { color:var(--bengara); }
  #howview .sc-ok .mk { color:var(--koke); }
  #howview .sc-ok .sc-mh { animation-delay:.8s; }
  #howview .sc-ok .sc-row { animation-name:sc-inr; }
  #howview .sc-bad .sc-row:nth-child(2) { animation-delay:.1s; }
  #howview .sc-bad .sc-row:nth-child(3) { animation-delay:.35s; }
  #howview .sc-bad .sc-row:nth-child(4) { animation-delay:.6s; }
  #howview .sc-ok .sc-row:nth-child(2) { animation-delay:.95s; }
  #howview .sc-ok .sc-row:nth-child(3) { animation-delay:1.2s; }
  #howview .sc-ok .sc-row:nth-child(4) { animation-delay:1.45s; }
  #howview .sc-div { background:var(--hair-2); transform-origin:top;
    animation:sc-drawv .45s var(--sc-e) 1.5s both; }

  /* the keyframes — every one travels FROM a start state TO the rule's own base state, so the last
     frame and the static rule are the same picture. That is the whole reduced-motion strategy. */
  @keyframes sc-pop { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:none; } }
  @keyframes sc-popin { 0% { opacity:0; transform:translateY(7px) scale(.9); }
    62% { opacity:1; transform:translateY(0) scale(1.05); } 100% { opacity:1; transform:none; } }
  @keyframes sc-rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  @keyframes sc-slide { from { opacity:0; transform:translateX(-9px); } to { opacity:1; transform:none; } }
  @keyframes sc-stamp { 0% { opacity:0; transform:scale(.84); } 64% { opacity:1; transform:scale(1.06); }
    100% { opacity:1; transform:none; } }
  @keyframes sc-away { 0%, 30% { opacity:1; transform:none; } 100% { opacity:.13; transform:translateY(-108px); } }
  @keyframes sc-peel { 0%, 55% { opacity:1; transform:none; } 100% { opacity:0; transform:rotateX(-94deg); } }
  @keyframes sc-break { 0% { background:var(--wash); box-shadow:inset 0 0 0 1px var(--hair-2); transform:none; }
    30% { transform:translateX(-3px); } 55% { transform:translateX(3px); } 75% { transform:translateX(-1px); }
    100% { background:var(--bengara-tint); box-shadow:inset 0 0 0 1px var(--bengara-line); transform:none; } }
  @keyframes sc-draw { from { stroke-dashoffset:170; } to { stroke-dashoffset:0; } }
  @keyframes sc-strike { from { width:0; } to { width:100%; } }
  @keyframes sc-roll { 0%, 30% { transform:none; } 31%, 63% { transform:translateY(-15px); }
    64%, 100% { transform:translateY(-30px); } }
  @keyframes sc-mark { 0% { color:var(--ink); background:var(--paper); box-shadow:inset 0 0 0 1px var(--paper); }
    55% { transform:scale(1.1); }
    100% { color:var(--bengara); background:var(--bengara-tint); box-shadow:inset 0 0 0 1px var(--bengara-line);
      transform:none; } }
  @keyframes sc-become { 0% { opacity:0; transform:translateY(8px); } 16% { opacity:1; transform:none; }
    58% { opacity:1; transform:none; } 100% { opacity:0; transform:scale(1.04); } }
  @keyframes sc-grow { from { opacity:0; transform:scale(.94) translateY(10px); } to { opacity:1; transform:none; } }
  @keyframes sc-swapout { 0% { opacity:0; transform:translateX(12px); } 14% { opacity:1; transform:none; }
    74% { opacity:1; transform:none; } 100% { opacity:0; transform:translateX(-28px); } }
  @keyframes sc-swapin { from { opacity:0; transform:translateX(28px); } to { opacity:1; transform:none; } }
  @keyframes sc-vout { from { opacity:1; transform:none; } to { opacity:0; transform:translateY(-15px); } }
  @keyframes sc-vin { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:none; } }
  @keyframes sc-growb { from { transform:scaleY(0); } to { transform:scaleY(1); } }
  @keyframes sc-prog { from { width:0; } to { width:100%; } }
  @keyframes sc-hot { from { background:transparent; } to { background:var(--bengara-tint); } }
  @keyframes sc-travel { from { stroke-dashoffset:12; } to { stroke-dashoffset:-58; } }
  @keyframes sc-flipout { from { opacity:1; transform:none; } to { opacity:0; transform:scale(.82); } }
  @keyframes sc-flipin { from { opacity:0; transform:scale(.82) translateY(-5px); } to { opacity:1; transform:none; } }
  @keyframes sc-inl { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:none; } }
  @keyframes sc-inr { from { opacity:0; transform:translateX(10px); } to { opacity:1; transform:none; } }
  @keyframes sc-drawv { from { transform:scaleY(0); } to { transform:scaleY(1); } }

  /* the whole point of invariant 2: switch every scene animation off and the held end state is
     already the rule. Nothing to restate here, and nothing that can drift out of sync with the
     keyframes above — a reduced-motion block that re-declared end states would be a second copy. */
  @media (prefers-reduced-motion: reduce) {
    #howview .scene, #howview .scene * { animation:none !important; }
  }

  /* Act 3 — see it work: an explicitly LABELLED illustration, never dressed as live board state */
  #howview .wdemo { border:1px solid var(--hair-2); border-radius:var(--r-md); background:var(--canvas);
    padding:var(--s4); display:flex; flex-direction:column; gap:var(--s4); }
  #howview .wpin { display:inline-flex; align-self:flex-start; align-items:center; gap:6px;
    padding:4px var(--s3); border-radius:var(--r-sm); background:var(--wash);
    box-shadow:inset 0 0 0 1px var(--hair-2); font-size:var(--t-xs); color:var(--ink-2); letter-spacing:.02em; }
  #howview .wds { display:flex; gap:var(--s3); }
  #howview .wds-n { flex:none; width:22px; height:22px; display:inline-flex; align-items:center;
    justify-content:center; border-radius:50%; background:var(--paper); box-shadow:inset 0 0 0 1px var(--hair-2);
    font-size:var(--t-xs); color:var(--ink-3); }
  #howview .wds-b { display:flex; flex-direction:column; gap:var(--s2); min-width:0; }
  #howview .wds-b p { font-size:var(--t-sm); color:var(--ink); line-height:1.5; }
  #howview .wgold { display:flex; flex-wrap:wrap; gap:var(--s2); }
  #howview .wgrow { font-size:var(--t-xs); color:var(--ink); background:var(--paper);
    box-shadow:inset 0 0 0 1px var(--hair-2); border-radius:var(--r-sm); padding:3px var(--s2);
    white-space:pre; }
  #howview .wcross { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s3); }
  #howview .wcp { flex:1; min-width:150px; border:1px solid var(--hair-2); border-radius:var(--r);
    background:var(--paper); padding:var(--s3); }
  #howview .wcp-v { font-size:var(--t-sm); color:var(--ink); }

  /* Act 4 — do it: no indigo any more (the human, 2026-08-17 — there is no "your turn" state left) */
  #howview .wflow { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s2); }
  #howview .wfn { display:inline-flex; align-items:center; gap:6px; padding:6px var(--s3);
    border-radius:var(--r); background:var(--wash); font-size:var(--t-sm); color:var(--ink-2); }
  #howview .wcta { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s3); margin-top:var(--s2); }
  #howview .wcta-lead { font-size:var(--t-md); color:var(--ink); }
  /* a real next action: the same neutral primary-action ink as .btn.pri elsewhere on the board — the
     one inverted element of Act 4 */
  #howview .wcta-act { display:inline-flex; align-items:center; gap:6px; padding:6px var(--s4);
    border-radius:var(--r); background:var(--ink); color:var(--paper); font-size:var(--t-sm); }
  /* the folded/settled CTA (board R12): nothing left to derive, so a tint, the same koke/"ok" every
     proven chip on this page already uses (.chip.ok / .legend .chip.ok) — never a second inversion. */
  #howview .wcta-settled { display:inline-flex; align-items:center; gap:6px; padding:6px var(--s4);
    border-radius:var(--r); background:var(--koke-tint); color:var(--koke); font-size:var(--t-sm);
    box-shadow:inset 0 0 0 1px var(--koke-line); }

  /* the full method, demoted to a collapsed native disclosure — the guide shows the proof, this is
     where the old spine / journey / flowcharts survive as reference, reached from the end of Act 4 */
  #howview #fullmethod { margin-top:var(--s7); border-top:1px solid var(--hair); }
  #howview #fullmethod > summary { list-style:none; cursor:pointer; display:inline-flex; align-items:center;
    gap:var(--s2); margin-top:var(--s5); padding:var(--s2) var(--s3); border:1px solid var(--hair-2);
    border-radius:var(--r); background:var(--paper); font-size:var(--t-sm); color:var(--ink-2); }
  #howview #fullmethod > summary::-webkit-details-marker { display:none; }
  #howview #fullmethod > summary::after { content:"▸"; color:var(--ink-4); }
  #howview #fullmethod[open] > summary::after { content:"▾"; color:var(--ink-4); }
  #howview #fullmethod #howoverview { margin-top:var(--s5); }

  /* the shared spine banner */
  #howview .spine-banner { display:flex; align-items:stretch; border:1px solid var(--hair);
    border-radius:var(--r-md); background:var(--paper); overflow:hidden; margin-bottom:var(--s5); }
  #howview .col { flex:1; padding:var(--s3) var(--s4); }
  #howview .col + .col { border-left:1px solid var(--hair); }
  #howview .col .num { font-size:var(--t-micro); color:var(--ink-4); letter-spacing:.16em; }
  #howview .col h3 { margin-top:2px; font-size:var(--t-md); }
  #howview .col .file { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink-4); }

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

  /* the five skills as flowcharts — baked static SVG/HTML (howFlowcharts). Every rule is scoped under
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

  /* stop-and-ask node — kg-staff's process discipline, neutral ink, never indigo (the human,
     2026-08-17: there is no more "your turn" gate state for indigo to signal) */
  #howview .nb.stop { background:var(--wash); border:1px solid var(--hair-2); border-left:4px solid var(--ink-3); }
  #howview .glbl { display:flex; align-items:center; gap:6px; font-size:var(--t-micro); letter-spacing:.13em;
    text-transform:uppercase; color:var(--ink-3); }
  #howview .glbl .dia { width:8px; height:8px; background:var(--ink-3); transform:rotate(45deg); flex:none; }
  #howview .cmp { font-size:var(--t-micro); color:var(--ink-3); opacity:.85; }

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
  ${screens.length ? `<div class="clear">
    <span class="chip ${failing ? 'bad' : 'ok'}"><span class="dot"></span>${failing ? `${failing} failing` : 'nothing failing'}</span>
    ${failing ? `${failing} requirement${failing === 1 ? '' : 's'} failing.` : 'All requirements are proven or untested — nothing is failing.'}
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
    <button class="close btn">Close</button>
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

<!-- Setup is a tool view too (#init): how to reach the project's app, and what a crawl of it
     found. A project that arrives with code and no specs starts here, so the board is populated on
     day one instead of being an empty page nobody knows how to fill. The hash stays #init — the
     stored route — while every label the human reads says Setup, to match the Set up button. -->
<!-- reworded 2026-07-30: the screen's title became "Setup" so it matches the Set up button and
     header; awaiting the human's confirmation (there is no accept mechanism to wire). -->

<section class="dt" id="initview" hidden>
  <div class="dth">
    <h2>Set up the board</h2>
    <span class="gbn">point at your app, then crawl it into rows</span>
    <span class="grow"></span>
    <button class="close btn">Close</button>
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
            <label class="watchtog sm" id="initvoicewrap" style="margin-top:var(--s3)">
              <input type="checkbox" id="initvoiceover"> narrate a watchable run aloud — voice &amp; subtitles, for a screen that has a narration pack</label>
            <div class="h" id="initvoicestatus" hidden style="margin-top:6px"></div>
            <div class="vhelp" id="initvoicehelp" hidden>
              <div class="vhlabel">Voice-over needs <b>piper</b> + a voice model. Do one of these, then Re-check:</div>
              <div class="vhlabel">Hand this to Claude</div>
              <pre class="vhpre" id="initvoiceprompt"></pre>
              <div class="vhlabel">…or run it yourself</div>
              <pre class="vhpre" id="initvoiceshell"></pre>
              <div class="vhrow">
                <button class="btn sm" type="button" data-copy="initvoiceprompt">Copy prompt</button>
                <button class="btn sm" type="button" data-copy="initvoiceshell">Copy shell</button>
                <button class="btn sm" type="button" id="initvoicerecheck">Re-check</button>
              </div>
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
            <span class="chip gone"><span class="mark o"></span>new</span>
            <span class="gbn">No PRD yet — visited and screenshotted, honestly uncovered. A screen that already has a PRD is the human's; a re-crawl leaves it completely alone.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- How does it work — a tool view (#howitworks, no slash) describing the specboard method. The intro,
     spine, lanes and the four skill flowcharts are baked; only a project's own added skills/agents are
     fetched from /api/capabilities and shown as cards below. -->
${howView(ctaAction)}

<div class="lb" id="lb" hidden>
  <div class="lbbar"><span id="lbcap" class="lbcap"></span><span class="grow"></span>
    <button class="btn sm" id="lbzoom">Actual size</button>
    <button class="btn sm gh" id="lbclose">Close</button></div>
  <div class="lbstage" id="lbstage"><img id="lbimg" alt=""></div>
</div>

<!-- The whole log for a test opens HERE, in ONE floating window (board R10) — never a full-viewport
     scrim, so the board stays visible behind it. Close / Esc / a click off the card dismiss it. -->
<div class="sheet" id="logsheet">
  <div class="box">
    <div class="bh"><strong id="logtitle">Full log</strong><span class="grow"></span>
      <button class="btn sm" data-logclose>Close</button></div>
    <div class="bb" id="logbody"></div>
  </div>
</div>

<!-- The COMPLETE raw step record of a test's newest run opens HERE (board R10) — setup, every
     action and check with its mark, and the trimmed-at-cap note. Inline, the test row shows only
     the named beats in human words; this window is where the detail lives. -->
<div class="sheet" id="stepsheet">
  <div class="box">
    <div class="bh"><strong id="stepstitle">All steps</strong><span class="grow"></span>
      <button class="btn sm" data-stepsclose>Close</button></div>
    <div class="bb" id="stepsbody"></div>
  </div>
</div>
${detail}

<script>window.__BOARD__ = ${JSON.stringify(BOARD_DATA)}</script>
<script>${clientJs}</script>
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
  return { screens: screens.length, areas: areas.length, failing, reqs: screens.reduce((n, s) => n + s.reqs.length, 0) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build()
  console.log(`board.html — ${r.screens} screens in ${r.areas} areas, ${r.reqs} requirements, ${r.failing} failing`)
}
