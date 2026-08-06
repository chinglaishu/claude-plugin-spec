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

// A requirement's derived state → its header chip (board R4). Two states, computed from the tests and
// nothing else: proven=moss ✓ (a current passing assertion covers it), unproven=hollow ○ (honestly
// ungreen, never faked). Title only, no label — the header stays compact; the word lives in the
// tooltip. There is no acceptance gate (R8), so there is no "reworded" chip.
const REQ_CHIP = {
  proven: ['ok', 'mark', 'proven'],
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
    <ul class="rl">${s.reqs.slice(0, 5).map(r => `<li><span class="id">${esc(r.id)}</span>${esc(r.title)}</li>`).join('')}${s.reqs.length > 5 ? `<li class="more">… ${s.reqs.length - 5} more</li>` : ''}</ul>
  </div>
  <div class="cshot">${s.hasShot
    ? `<img src="spec/${esc(s.name)}/screen.png?h=${s.shotHash}" alt="${esc(s.title)} — latest run">`
    : '<span class="play">▶</span>'}</div>
</div>`
}

// A step that has no command of its own names the board control that does it, so the one next action
// is a thing you can point at rather than an instruction to go read something. Confirming a draft is
// the exception the board has no button for: it happens in the screen's own prd.md. Also feeds Act 4's
// derived CTA (board R12, repurposed) — see wCtaAction below.
const J_ACT = {
  config: 'Set up',
  crawl: 'Crawl',
  confirm: 'Delete the guess: line in that screen prd.md',
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
    <span class="gbn">six steps, each one derived from the tree — nothing is stored</span></div>
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
  return `<div class="req" data-r="${esc(r.id)}" data-state="${r.state}">
    <div class="h">${reqChip(r.state)}<span class="id">${esc(r.id)}</span><div class="rmain"><span class="rt">${esc(r.title)}</span><div class="rhint">${esc(excerpt(r.body))}</div></div><span class="chev">›</span></div>
    <div class="body">${renderBody(r.body)}${covers}</div>
  </div>`
}
const reqPane = s => `<div class="pane reqpane">
  <h2>Requirements<span class="s">what the screen must do</span></h2>
  ${s.reqs.length ? s.reqs.map(reqRow).join('') : `<div class="empty">No requirements yet — write the first in <code>spec/${esc(s.name)}/prd.md</code>.</div>`}
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
          <button class="btn sm runone" data-run="${esc(s.name)}" data-grep="${esc(plan.title)}" title="run only this test, headless">Run</button>
          <button class="btn sm runone" data-run="${esc(s.name)}" data-grep="${esc(plan.title)}" data-headed="1" title="watch only this test in a browser">Watch</button>
          <button class="btn sm loglink" data-log title="open the full run log in a window">Logs</button>
          <button class="btn sm stepslink" data-steps title="every recorded step of the newest run, in a window">Steps</button>
        </span>
      </div>
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
    { gate: 'YOUR TURN', h: 'Are these what I meant?', cmp: 'guess → accepted' },
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
        { skill: 'kg-deep', file: 'prd.md · guess', h: 'Draft the requirements',
          p: 'One requirement per behaviour, grounded in what the screen really does — a proposal, flagged <span class="mono">guess</span>.' },
        { gate: true, glbl: 'Your turn', h: 'Are these what I meant?', cmp: 'guess → accepted',
          p: 'The one thing that waits on you here. Correct the wording, drop the flag — accepted requirements are the source of truth.' },
        { skill: 'kg-deep', file: 'test.spec.ts', h: 'Prove with a few comprehensive flows', arrow: 'checkReq tags carry coverage',
          p: 'A handful of flow tests prove MANY requirements each — exact golden values, safe cross-page round trips, a writer flow that restores its own baseline. The board derives every requirement&#39;s state from the tags.' }
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
//   INVERSION / INDIGO: indigo is spent only on Act 4 — the "you confirm the meaning" step (a tint)
// and the closing CTA when (and ONLY when) there is a real next action to name (the one solid-indigo
// "your turn" element, `.wcta-act`). Once the journey is folded — nothing left to derive — the CTA
// names that instead and wears the settled/koke treatment (`.wcta-settled`, a tint, no inversion),
// never indigo: CLAUDE.md is absolute that indigo means "your turn" and nothing else, and a folded
// board has no turn left to take (board R12 fix; see wCtaAction / wCta below). Act 1's invisible-green
// failure wears the board's own solid `chip bad`, the single inverted element of that act. Because the
// acts step one at a time, each act is its own view with ONE inverted element; rendered
// all-at-once here they read as two (when the CTA is in its 'turn' state), the same documented trade
// the old anatomy chapter made.
const WALKTHROUGH = {
  acts: [
    { n: 1, title: 'Without the tool', sub: 'a brilliant, fast hire whose work you cannot review',
      steps: [
        { kind: 'moment', label: 'Assigning work', body: '"Build the rent-edit feature." — "Done, boss!" The task now lives only in a chat scroll. Nothing is written down.' },
        { kind: 'moment', label: 'Reviewing', body: '"Does it work?" You get a wall of code and "all 40 tests pass." You cannot check any of it without reading everything — so you approve blindly.' },
        { kind: 'moment', label: 'Two weeks later', body: 'The feature breaks. Staff — no memory of the old decision — fixes it by changing what it was supposed to do. Same bug, third time.' },
        { kind: 'proof', green: 'test green', wrong: 'screen shows rent = 100 (stale)',
          note: 'The assertion passed. Nobody looked at the screen. A green you cannot see is trust, not review.' }
      ] },
    { n: 2, title: 'With the tool', sub: 'the same hire, plus a system that makes work reviewable',
      steps: [
        { kind: 'moment', label: 'Assigning work', body: 'The task becomes a written requirement — one shared document. Staff drafts it; you confirm the meaning — the one thing waiting on you.' },
        { kind: 'moment', label: 'Reviewing', body: 'The work arrives as a recording where every asserted number is visible on screen. You review by watching, not by reading code.' },
        { kind: 'moment', label: 'Two weeks later', body: 'The moment a proof stops holding, the requirement flips to unproven — you see drift when it happens, not two weeks after. Proven is computed from the tests, never stored.' },
        { kind: 'mirror', note: 'Same hire, same speed. The difference is a system: work arrives reviewable by watching, and a written discipline makes the classic mistakes hard.' }
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
        { kind: 'flow', chain: ['kg-init', 'kg-deep · per screen', 'you confirm the meaning', 'tests prove it'] },
        // action is no longer authored here (board R12, repurposed): it is DERIVED per build from
        // journey() — see wCtaAction — so a returning user always sees their real next step.
        { kind: 'cta', lead: 'Next on your board:' }
      ] }
  ]
}

// Marks ride every hue (design rule): reuse #howview .mk — a filled 6px square, hollow (.o) for an
// absent state, a diamond (.d) for "your turn" — so the guide draws the board's own marks.
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

// The closing note of Act 2 — a quiet full-width frame that names what actually changed between the
// two acts. Deliberately NOT a chip or a solid: it is the reader's own conclusion, restated once.
const wMirror = s =>
  '<div class="wmirror">' + wMark('n') + '<p class="wnote">' + esc(s.note) + '</p></div>'

// The invisible green: a real passing chip beside the wrong value the screen actually shows. chip.bad
// is the board's own solid failure chip (this act's one inverted element); the note carries the lesson.
const wProof = s =>
  '<div class="wproof">' +
    '<span class="chip ok"><span class="mark"></span>' + esc(s.green) + '</span>' +
    '<span class="wsep">nobody looked &#8594;</span>' +
    '<span class="chip bad"><span class="mark o"></span>' + esc(s.wrong) + '</span>' +
  '</div>' +
  '<p class="wnote">' + esc(s.note) + '</p>'

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

// The flow as verb-phrase steps; the human's step ("you confirm the meaning") wears indigo = your turn.
const wFlow = s =>
  '<div class="wflow">' + s.chain.map((c, i) => {
    const yours = /confirm/i.test(c)
    const node = '<span class="wfn' + (yours ? ' yours' : '') + '">' + (yours ? wMark('d') : '') + esc(c) + '</span>'
    return (i ? '<span class="wfa" aria-hidden="true">&#8594;</span>' : '') + node
  }).join('') + '</div>'

// Act 4's closing CTA (board R12, repurposed): the first not-done journey() step's own action —
// its cmd when it has one (deepen: '/kg-deep <screen>'), else the short verb J_ACT already names for
// the board control that does it. Once nothing is left (folded), there is no next step to name, so
// the CTA says so instead of pointing at one. Pure function of journey()'s facts — nothing stored.
// Returns { text, state } rather than a bare string (fix, board R12): CLAUDE.md is absolute that
// indigo means ONE thing — "your turn" — but the folded branch names nothing left to DO, so it
// cannot share the 'turn' state a real next action gets. `state` rides the exact same `cur` branch
// that picked `text`, so the renderer (wCta) never re-derives folded-vs-action from journey() itself
// — one derivation, read twice, rather than two derivations that could disagree.
// Exported so the DERIVATION is unit-tested against synthetic journey() shapes (tools/journey.test.mjs)
// — this repo's own journey is always folded (everything proven), so the live board's own E2E can only
// ever exercise the folded/settled branch below; the not-done/turn branches need a driven fixture.
export const wCtaAction = j => {
  const cur = j.steps.find(s => !s.done)
  if (!cur) return { text: 'Every derivable fact already holds — this project\'s requirements are proven.', state: 'settled' }
  return { text: cur.cmd || J_ACT[cur.id] || cur.title, state: 'turn' }
}

// Act 4's closing pill wears the state `cta` names (board R12 fix), not indigo unconditionally:
// `cta.state === 'turn'` (a real next action) keeps the original solid "your turn" treatment — the
// one inverted element of Act 4 — with the `.mk.d` your-turn diamond. `cta.state === 'settled'` (the
// folded branch: every derivable fact already holds, nothing left to point at) renders instead as a
// tint, the SAME koke/"ok" tokens the board already uses for proven/settled chips elsewhere on this
// page (compare the legend's `chip ok` / `mk`), with a filled settled mark — no inversion, so a
// folded board never shows two solid indigo elements competing on one screen.
const wCta = (s, cta) => {
  const pill = cta.state === 'turn'
    ? '<span class="wcta-act">' + wMark('d') + '<span class="mono">' + esc(cta.text) + '</span></span>'
    : '<span class="wcta-settled"><span class="mk"></span><span class="mono">' + esc(cta.text) + '</span></span>'
  return '<div class="wcta"><span class="wcta-lead">' + esc(s.lead) + '</span>' + pill + '</div>'
}

// The story rebuild (board R11) retired three kinds with their data — 'symptoms' (Act 1's bullet list
// of pains), 'inversion' and 'beforeafter' (the old Act 2). Their renderers and CSS are deleted rather
// than parked: no act references them any more, and a dead branch is a lie about what this page draws.
const wStepInner = (s, ctaAction) => {
  switch (s.kind) {
    case 'moment': return wMoment(s)
    case 'mirror': return wMirror(s)
    case 'proof': return wProof(s)
    case 'demo': return wDemo(s)
    case 'crosspage': return wCrosspage(s)
    case 'flow': return wFlow(s)
    case 'cta': return wCta(s, ctaAction)
    default: return ''
  }
}

// Per-act stepper nav (board R11): Prev / a live "n / N" count / Next. Marks (the chevron glyphs and
// the numeric count), never hue, carry the affordance; the buttons are quiet outlines, not a solid or
// indigo element (indigo == your turn, spent only in Act 4). The controller wires these and clamps at
// the ends; without JS the act simply shows its first step, which is honest.
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
// A gate-shaped node draws one of two things, never both: `kind: 'turn'` (default) IS the guess
// confirmation and keeps the your-turn/indigo treatment; `kind: 'stop'` is kg-staff's "stop and ask"
// node, which is process discipline, not the board's reserved your-turn signal — it gets its own
// neutral, non-indigo label and colouring so the two are never visually confused.
function fGateBody (n) {
  const cmp = n.cmp ? `<div class="cmp mono">${esc(n.cmp)}</div>` : ''
  if (n.kind === 'stop') {
    return `<div ${XH} class="nb stop">
    <div class="glbl stop"><span class="dia stop"></span>STOP &middot; ask the human</div>
    <div class="nb-title">${esc(n.title)}</div>
    ${cmp}
  </div>`
  }
  return `<div ${XH} class="nb gate">
    <div class="glbl"><span class="dia"></span>YOUR TURN</div>
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
    tagline: 'one screen → deep, accepted, proven',
    when: 'per screen · most important first',
    height: 734,
    nodes: [
      { id: 'k0', type: 'step', cx: HOW_Cx, top: 16, w: 300, h: 54, title: 'Phase 0 · what governs this screen?', tags: ['tools/staff.mjs'] },
      { id: 'k1', type: 'step', cx: HOW_Cx, top: 100, w: 316, h: 58, title: 'Phase 1 · study the real screen', tags: ['source · testids · existing tests'] },
      { id: 'k2', type: 'step', cx: HOW_Cx, top: 188, w: 316, h: 58, title: 'Phase 2 · golden fixture + capture', state: 'running', tags: ['_seed.ts · golden.json'] },
      { id: 'k3', type: 'step', cx: HOW_Cx, top: 276, w: 300, h: 58, title: 'Phase 3 · draft the requirements', tags: ['prd.md · guess'] },
      { id: 'g1', type: 'gate', cx: HOW_Cx, top: 364, w: 300, h: 68, title: 'Are these what I meant?', cmp: 'guess → accepted' },
      { id: 'k4', type: 'step', cx: HOW_Cx, top: 466, w: 316, h: 58, title: 'Phase 4 · a few comprehensive flows', tags: ['checkReq · exact numbers'] },
      { id: 'k5', type: 'step', cx: HOW_Cx, top: 554, w: 350, h: 62, title: 'Writer flow LAST — round trip, self-restoring', note: 'discovery-first on every write path' },
      { id: 'k6', type: 'step', cx: HOW_Cx, top: 650, w: 316, h: 58, title: 'Phase 5 · settle on the board + review', state: 'settled' }
    ],
    edges: [
      { from: 'k0', fromSide: 'bottom', to: 'k1', toSide: 'top', route: 'v' },
      { from: 'k1', fromSide: 'bottom', to: 'k2', toSide: 'top', route: 'v' },
      { from: 'k2', fromSide: 'bottom', to: 'k3', toSide: 'top', route: 'v' },
      { from: 'k3', fromSide: 'bottom', to: 'g1', toSide: 'top', route: 'v' },
      { from: 'g1', fromSide: 'bottom', to: 'k4', toSide: 'top', route: 'v' },
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
    when: 'before every change · stop & ask in 3 cases',
    height: 448,
    nodes: [
      { id: 'st1', type: 'step', cx: HOW_Cx, top: 16, w: 272, h: 54, title: 'Read what governs the screen', tags: ['staff briefing'] },
      { id: 'd1', type: 'diamond', cx: HOW_Cx, top: 104, w: 240, h: 116, title: 'One of the three stop cases?' },
      { id: 'a1', type: 'gate', kind: 'stop', cx: HOW_Rx, top: 119, w: 260, h: 86, title: 'Stop — the human decides', cmp: 'new meaning · guess · contradiction' },
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
    <button class="close btn">Close<span class="kbd">esc</span></button>
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
        <span class="gates-badge"><span class="dia"></span>One thing waits on a person — accepting requirement meaning. Everything else, staff do.</span>
        <div class="legend">
          <span class="chip"><span class="mk o"></span>step / artifact</span>
          <span class="chip rev"><span class="mk d"></span>your turn — a guess to confirm</span>
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
            <span class="chip rev"><span class="mk d"></span>your turn — a guess to confirm</span>
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
  // The one number that says whether it is your turn: how many screens are waiting on a human
  // correction — in the no-gate model (board R8) that is only a crawl guess still to be confirmed.
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
  // on the right, each pane scrolling on its own — no acceptance gate above them (board R8), just the
  // two columns and a Run-all in the bar. data-screen alongside data-i so the router can open it by name.
  const detail = screens.map((s, i) => `
<section class="dt" data-i="${i}" data-screen="${esc(s.name)}" hidden>
  <div class="dth dbarhook">
    <h2>${esc(s.title)}</h2>
    <span class="m">${s.reqs.length} requirement${s.reqs.length === 1 ? '' : 's'} · ${s.reqs.filter(r => r.state === 'proven').length} proven · spec/${esc(s.name)}/</span>
    <span class="grow"></span>
    ${runAll(s.name)}
    <button class="btn turn nextw" data-i="${i}">Next waiting →<span class="kbd">j</span></button>
    <button class="close btn">Close<span class="kbd">esc</span></button>
  </div>
  <div class="dtscroll">
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
  .gwait { display:inline-flex; align-items:center; gap:6px; font-size:var(--t-sm); color:var(--ai); }
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
  /* the ONE detail header, full-width: title · requirement count · … · Run all · Next waiting · Close */
  .dth { flex:none; display:flex; align-items:center; gap:var(--s3);
    width:100%; padding:var(--s4) var(--s6);
    border-bottom:1px solid var(--hair); background:var(--paper); }
  .dth h2 { font-size:var(--t-xl); letter-spacing:-.02em; }
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

  /* the reading hierarchy of both lists (board R3): a quiet one-line hint under each title */
  .rmain { flex:1; min-width:0; }
  .rhint { font-size:var(--t-xs); color:var(--ink-4); white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; margin-top:1px; }
  .req.open .rhint { display:none; }  /* the full body follows — the excerpt would just repeat it */
  .tmeta { font-size:var(--t-xs); color:var(--ink-4); margin-top:2px; padding-left:calc(11px + var(--s3));
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tmeta:empty { display:none; }
  .tmeta .failat { color:var(--bengara); }

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
  /* coverage refs — quiet, NEUTRAL metadata (indigo is reserved for "your turn"). They tint only
     when you hover the test, tying it to the requirement on the left. */
  .tag { font:var(--t-micro) var(--mono); padding:1px 7px; border-radius:var(--r-sm);
    background:var(--wash); color:var(--ink-3); transition:background .12s, color .12s; }
  .test:hover .th .tag, .test.hot .th .tag { background:var(--ai-tint); color:var(--ai); }
  .test .tacts { opacity:1; margin-left:0; display:inline-flex; gap:var(--s2); }
  /* full log rides the actions row as a bordered button beside Watch — NOT indigo (indigo is
     "your turn" only): it wears the neutral .btn sm like Run/Watch. It opens a floating window. */
  .fold { margin-top:var(--s3); }

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

  /* Acts 1 & 2 — the same three moments, told without the tool then with it. Layout only: the label is
     the board's existing micro/uppercase caption treatment (compare .wsep), the body the reading size.
     No hue at all in a moment — the mirror is the argument, so neither act may be tinted to win it. */
  #howview .wmoment { display:flex; flex-direction:column; gap:var(--s2); max-width:760px; }
  #howview .wm-label { font-size:var(--t-micro); letter-spacing:.06em; color:var(--ink-4);
    text-transform:uppercase; }
  #howview .wm-body { font-size:var(--t-md); color:var(--ink); line-height:1.55; }
  /* the closing note of Act 2: a quiet full-width frame — wash tint, hairline, and the .mk.n rule mark.
     Never a chip, never a solid: it restates what the reader already saw, it does not announce a state. */
  #howview .wmirror { display:flex; align-items:flex-start; gap:var(--s3); padding:var(--s3) var(--s4);
    border:1px solid var(--hair); border-radius:var(--r-md); background:var(--wash); }
  #howview .wmirror .mk { margin-top:.62em; color:var(--ink-4); }

  /* Act 1's close — a green chip beside the wrong value the screen actually shows */
  #howview .wproof { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s3); }
  #howview .wsep { font-size:var(--t-micro); letter-spacing:.06em; color:var(--ink-4); text-transform:uppercase; }
  /* (.wsym / .wreframe / .wba went with the retired symptoms / inversion / beforeafter step kinds) */
  #howview .wcp-eq, #howview .wfa { color:var(--ink-4); font-size:var(--t-sm); flex:none; }

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

  /* Act 4 — do it: indigo is spent here and ONLY here (design rule: indigo == your turn) */
  #howview .wflow { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s2); }
  #howview .wfn { display:inline-flex; align-items:center; gap:6px; padding:6px var(--s3);
    border-radius:var(--r); background:var(--wash); font-size:var(--t-sm); color:var(--ink-2); }
  #howview .wfn.yours { background:var(--ai-tint); color:var(--ai); box-shadow:inset 0 0 0 1px var(--ai-line); }
  #howview .wcta { display:flex; flex-wrap:wrap; align-items:center; gap:var(--s3); margin-top:var(--s2); }
  #howview .wcta-lead { font-size:var(--t-md); color:var(--ink); }
  #howview .wcta-act { display:inline-flex; align-items:center; gap:6px; padding:6px var(--s4);
    border-radius:var(--r); background:var(--ai); color:var(--paper); font-size:var(--t-sm); }
  /* the folded/settled CTA (board R12 fix): nothing left to derive is not "your turn", so it never
     wears indigo. Same shape as .wcta-act, same koke/"ok" tint every proven chip on this page already
     uses (.chip.ok / .legend .chip.ok) — a tint, not a second solid inversion. */
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

  /* gate node — the human decision point, a tint (never a second inverted element). "your turn" is
     reserved for the guess confirmation ONLY (design system rule); kg-staff's stop-and-ask node below
     is process discipline, not that signal, so it is deliberately NOT indigo. */
  #howview .nb.gate { background:var(--ai-tint); border:1px solid var(--ai-line); border-left:4px solid var(--ai); }
  #howview .glbl { display:flex; align-items:center; gap:6px; font-size:var(--t-micro); letter-spacing:.13em;
    text-transform:uppercase; color:var(--ai); }
  #howview .glbl .dia { width:8px; height:8px; background:var(--ai); transform:rotate(45deg); flex:none; }
  /* stop-and-ask node — neutral ink, never the your-turn indigo */
  #howview .nb.stop { background:var(--wash); border:1px solid var(--hair-2); border-left:4px solid var(--ink-3); }
  #howview .glbl.stop { color:var(--ink-3); }
  #howview .glbl.stop .dia { background:var(--ink-3); }
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
    Nothing is waiting on you — only a crawled guess ever needs a look; everything else is proven or unproven by its tests.
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
            <span class="gbn">Read off the page, never canon. Correct it and drop the <span class="mono">guess:</span> flag to make it canon.</span>
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

<!-- The COMPLETE raw step record of a test's newest run opens HERE (board R10) — setup, every
     action and check with its mark, and the trimmed-at-cap note. Inline, the test row shows only
     the named beats in human words; this window is where the detail lives. -->
<div class="sheet" id="stepsheet">
  <div class="box">
    <div class="bh"><strong id="stepstitle">All steps</strong><span class="grow"></span>
      <button class="btn sm" data-stepsclose>Close<span class="kbd">esc</span></button></div>
    <div class="bb" id="stepsbody"></div>
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
          const m = /^proves (\\S+)$/.exec(b.head.label || '')
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
                const rid = /^proves (\\S+)/.exec(k.label)[1]
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
