// Renders spec/<screen>/ into one self-contained board.html.
//
// Reading and state live in spec-store.mjs; this file only draws. The board inlines the SAME
// spec/_design.css the drafts link, and adds nothing but layout — it is one of the screens this
// tool tracks, so it has no business owning a second design system.

import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import {
  ROOT, esc, designCss, allScreens, sortedAreas, writeText, shotHash, readConfig, readRuns, ciGate
} from './spec-store.mjs'
import { journey } from './journey.mjs'
import { stripBehaviorLead } from './behavior.mjs'
// pure: the flow composer's library derivation (Task 5) — fed to the client through the JSON island
import { deriveLibrary } from './compose.mjs'
// pure: a test's unit/flow kind off its qualified tag set (the record side of the kind union)
import { deriveKind } from './flow.mjs'
// pure: one layout skeleton's ringed box — the AIM a scene's camera takes (the human, 2026-08-31)
import { focusFromLayout } from './evidence.mjs'

// Task 14 release pass — the two-column breakpoints ride the design system's --scale. A @media
// query cannot read a CSS var, so build() parses the knob out of _design.css and computes each
// breakpoint from its BASE number at emit time (the emit reads `bp(1080)`, keeping the base
// legible) — changing --scale alone moves the emitted values, the knob's one-line promise kept.
// Pure and exported for tools/scale-breakpoints.test.mjs.
export const parseScale = css => {
  const m = /--scale:\s*([0-9.]+)/.exec(css)
  return m ? Number(m[1]) : 1
}
export const scaledBp = (base, scale) => Math.round(base * scale)

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
// ran), untested=hollow ink ○ (no test tags it at all). Title only, no visible label on the source
// row — it stays compact; the word lives in the tooltip (Grid's row spells it out, see GRID_CHIP below).
const REQ_CHIP = {
  passed: ['ok', 'mark', 'Passed — a current passing assertion covers this'],
  // Changed (board R4's fifth word, 2026-08-19) — a modifier on Passed: the assertion still holds,
  // but the requirement text moved past the pin its last passing proof stamped. Wears the 藍 indigo
  // long reserved for exactly this drift state, and its own ◈-shaped mark (hue never alone).
  changed: ['changed', 'mark c', 'Changed — proved before; the text moved since, re-verify'],
  failed: ['fail', 'mark h', 'Failed — the covering test failed its assertion'],
  'not-reached': ['wait', 'mark n', 'Not reached — a flow that covers this stopped before it got here'],
  untested: ['gone', 'mark o', 'Untested — no test asserts this yet']
}
const reqChip = status => {
  const [tone, mark, title] = REQ_CHIP[status] || REQ_CHIP.untested
  return `<span class="chip ${tone}" title="${title}"><span class="${mark}"></span></span>`
}

// THE HEADER CRUMB (Task 8, the frozen mockup's "Tsumiki · task-tracker demo"): `<project> ·
// <tagline>`, DERIVED — the project's package.json name (falling back to the repo directory), and
// the tagline authored in spec/_config.json when there is one. "dogfooding itself" is the default
// tagline of exactly one project — specboard's own repo — never a hardcoded string on a vendored
// board. Pure and exported (tools/home-card.test.mjs).
// Fix round 1 (A-2): the COMMITTED identity leads — spec/_specboard.json's `project: { name,
// tagline }` (the manifest every scaffolded project commits; scaffold --force and update preserve
// it) — because spec/_config.json is gitignored there and a tagline kept in it vanishes on a clone.
// The config's tagline (Settings may still set it) and package.json only fill the gaps.
export const projectIdentity = (pkg, cfg, dirName, manifest) => {
  const proj = (manifest && manifest.project && typeof manifest.project === 'object') ? manifest.project : {}
  const name = String(proj.name || (pkg && pkg.name) || dirName || 'project').trim()
  const own = name === 'specboard'
  const tagline = String(proj.tagline || (cfg && cfg.tagline) || (own ? 'dogfooding itself' : '')).trim()
  return { name, tagline, own, crumb: tagline ? name + ' · ' + tagline : name }
}

// A screen's test KINDS (board R6 — unit and flow, both first-class), counted for the home card's
// `k unit · j flow` chips. Each test's kind is the UNION of the two honest derivations the List and
// Flow views already agree on (Task 3b): the SOURCE plan's kind (a flowStep beat ⇒ flow) and the
// RECORD's kind (a tag qualified to another screen ⇒ flow, tools/flow.mjs deriveKind) — a flowStep
// story that never leaves its screen is still a flow, and a plain test that proves another screen's
// requirement is too. Tests are enumerated from the source plans (so a never-run test counts), with
// the run records as the fallback when the spec did not parse. Pure and exported.
export const screenKinds = s => {
  const byTitle = new Map(((s.run && s.run.tests) || []).map(t => [t.title, t]))
  const recKind = t => (t ? deriveKind(Object.keys(t.reqs || {}), s.name) : '')
  const plans = (s.plans && s.plans.length)
    ? s.plans.map(p => ({ src: (p.steps || []).some(st => st.kind === 'flow') ? 'flow' : 'unit', rec: recKind(byTitle.get(p.title)) }))
    : [...byTitle.values()].map(t => ({ src: '', rec: recKind(t) }))
  const out = { unit: 0, flow: 0 }
  for (const p of plans) out[(p.src === 'flow' || p.rec === 'flow') ? 'flow' : 'unit']++
  return out
}

// The card's THUMBNAIL is the screen's latest-run STILL (Task 8, the frozen mockup's `latest run ·
// <id>` caption): spec/<screen>/screen.png where a test shot one (the kg-e2e convention), else the
// NEWEST after-frame of the D2 evidence harvest — a project whose tests never shoot screen.png (the
// Tsumiki demo) still gets a real frame of its latest run rather than a grey placeholder. The
// caption names the run: the newest record's commit when the run manifest carries one, else the run
// id. Null when nothing has run — the honest empty cover. Pure: `runs` is spec/_runs.json's array.
export const latestStill = (s, runs) => {
  const run = s.run
  let src = null, hash = '', best = null
  if (s.hasShot) { src = `spec/${s.name}/screen.png`; hash = s.shotHash || '' }
  else if (run && run.evidence) {
    for (const e of Object.values(run.evidence)) {
      if (!e || !e.after) continue
      if (!best || String(e.at || '') > String(best.at || '')) best = e
    }
    if (best) src = String(best.after)
  }
  if (!src) return null
  // the run that PRODUCED the frame (fix round 1, A-3): an evidence frame carries its own runId; a
  // screen.png is the newest run's. Either resolves to that run's recorded commit where the
  // manifest has it, else stays the run id — never a newer run that covered the screen but shot nothing
  const commitOf = r => r && Object.values(r.shotsByTest || {}).map(t => t && t.commit).find(Boolean)
  let rec = null
  if (best && best.runId) rec = (runs || []).find(r => r && String(r.runId) === String(best.runId)) || null
  else {
    const mine = (runs || []).filter(r => r && (r.screen === 'all' || r.screen === s.name))
    rec = mine.reduce((a, b) => (!a || String(b.runId || '') > String(a.runId || '')) ? b : a, null)
  }
  const id = commitOf(rec) || (rec && rec.runId) || (best && best.runId) || (run && run.ranAt != null ? String(run.ranAt) : '')
  return { src, hash, run: String(id) }
}

// Home is one CARD per screen (board R1): its name, a proven-count chip, the requirement TITLES, and
// the latest run's recording cover (or the still). There is NO PRD/draft/screen/E2E column strip — the
// card is titles + cover and nothing else. There is no guess/draft chip either (the human, 2026-08-17):
// a drafted PRD is canon the instant it exists, so a card never distinguishes it from one a human wrote.
// Task 8 (the frozen mockup 2026-08-17): the name is the card's large title with the ROUTE in mono
// beneath; each requirement row LEADS with its status MARK (the five-word vocabulary's marks — hue
// never alone); the right column stacks the proven-count pill, the `k unit · j flow` kind chips and
// the latest-run still, captioned. The pill keeps R4's signed words — "N / M proven" — where the
// mockup wrote "passed": the requirement text owns that word, not the drawing.
const CARD_MARK = { passed: '✓', changed: '◈', failed: '✗', 'not-reached': '◌', untested: '○' }
// FAMILIES (board R17, the human 2026-08-23): a screen's requirements grouped by the prd's `###`
// headings — the loose ones (before any heading) first under a null family, then each family in
// prd order with its requirements in THEIR prd order. Pure, unit-tested (tools/prd-families.test.mjs);
// a screen with no headings is one null group, so every consumer renders exactly as before.
export const familyGroups = s => {
  const fams = s.families || []
  const byId = new Map((s.reqs || []).map(r => [r.id, r]))
  const loose = (s.reqs || []).filter(r => r.family == null)
  const groups = loose.length ? [{ family: null, reqs: loose }] : []
  for (const f of fams) {
    const reqs = f.ids.map(id => byId.get(id)).filter(Boolean)
    if (reqs.length) groups.push({ family: f, reqs })
  }
  return groups
}
// The card's rows under a cap of five, as a plan: {kind:'fam', f} · {kind:'req', r} · {kind:'more', n}.
// With families the fold cuts ONLY at a family boundary — the family the cap lands inside is shown
// whole (never a header with half its requirements), and "… N more" counts the requirements left.
export const cardRows = (s, cap = 5) => {
  const groups = familyGroups(s)
  const rows = []
  let shown = 0
  const total = (s.reqs || []).length
  for (const g of groups) {
    if (shown >= cap) break
    if (g.family) {
      rows.push({ kind: 'fam', f: g.family })
      for (const r of g.reqs) { rows.push({ kind: 'req', r }); shown++ }
    } else {
      for (const r of g.reqs) { if (shown >= cap) break; rows.push({ kind: 'req', r }); shown++ }
    }
  }
  if (shown < total) rows.push({ kind: 'more', n: total - shown })
  return rows
}
// A family header row — the reference catalogue's `.grp` shape (mono uppercase eyebrow: the number
// and name bold, the gloss after the em-dash muted, a hair rule beneath), carried by the row's class.
const famRow = (f, tag = 'li') =>
  `<${tag} class="fam"><span class="fnum">${esc(f.n == null ? '' : f.n + ' · ')}</span><b class="fname">${esc(f.name)}</b>${f.gloss ? `<span class="fgloss"> — ${esc(f.gloss)}</span>` : ''}</${tag}>`
// WHAT GATES CI (the human, 2026-08-30: "user need to be clear that they can add tests for CI check,
// and what tests are added"). A screen whose whole test.spec.ts runs in the CI gate wears one small
// chip on its home card — the same .kchip pattern the unit/flow counts already use, no new hue and
// no new shape, because this is a fact about the screen, not a state of it. DERIVED on every build
// from spec/_ci.json through the very resolver the workflow runs (spec-store ciGate); an absent
// chooser means every screen, so the mark is then on every card, which is exactly what the gate does.
const ciChip = inCi => inCi
  ? '<span class="kchip ci" title="this screen\'s test.spec.ts runs in the CI gate — chosen in spec/_ci.json"><span class="km">CI</span> gate</span>'
  : ''
const card = (s, i, runs, inCi = false) => {
  const M = s.reqs.length
  const proven = s.reqs.filter(r => r.state === 'proven').length
  const done = M > 0 && proven === M
  const q = (s.title + ' ' + s.route + ' ' + s.reqs.map(r => r.title).join(' ')).toLowerCase()
  const kc = screenKinds(s)
  const kinds = (kc.unit || kc.flow)
    ? `<span class="kchip unit"><span class="km">${kc.unit}</span> unit</span><span class="kchip flow"><span class="km">${kc.flow}</span> flow</span>`
    : '<span class="kchip none">no tests yet</span>'
  const ci = ciChip(inCi)
  const still = latestStill(s, runs)
  // the evidence fallback is served off the same allowlisted spec/** path; hashed like screen.png
  const stillSrc = still && (still.hash ? `${still.src}?h=${still.hash}`
    : (existsSync(join(ROOT, still.src)) ? `${still.src}?h=${shotHash(join(ROOT, still.src))}` : null))
  const rows = cardRows(s).map(x => x.kind === 'fam' ? famRow(x.f)
    : x.kind === 'more' ? `<li class="more">… ${x.n} more</li>`
      : `<li><span class="id">${esc(x.r.id)}</span><span class="mk ${esc(x.r.status)}">${CARD_MARK[x.r.status] || CARD_MARK.untested}</span><span class="rtl">${esc(x.r.title)}</span></li>`).join('')
  return `
<div class="card" data-screen="${esc(s.name)}" data-i="${i}" data-q="${esc(q)}">
  <div class="cmain">
    <div class="cname"><h3 class="nm">${esc(s.title)}</h3></div>
    <div class="croute">${esc(s.route)}</div>
    <ul class="rl">${rows}</ul>
  </div>
  <div class="cright">
    <div class="metrics">
      <span class="chip ${done ? 'ok' : 'gone'} pcount"><span class="mark${done ? '' : ' o'}"></span>${proven} / ${M} proven</span>
      <div class="kinds">${kinds}</div>
      ${ci}
    </div>
    <div class="cshot">${stillSrc
      ? `<span class="lrun">latest run · ${esc(still.run)}</span><img src="${esc(stillSrc)}" alt="${esc(s.title)} — latest run">`
      : '<span class="play">▶</span>'}</div>
  </div>
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

// The behavior SHAPE a requirement may lead with — Given + 1..N When/Then beats (D1, spec
// 2026-08-20) parseBehavior (tools/behavior.mjs) read off its body, attached in enrichReqs as
// r.behavior. Drawn as a labelled grid ABOVE the prose, so the shape leads and the prose supports:
// one Given row, then one When and one Then row per beat, in document order — for a 1-beat block
// the markup is BYTE-IDENTICAL to the pre-beats triple (pinned in behavior-render.test.mjs), so
// the board has zero churn until a multi-beat PRD exists. A prose-only requirement (behavior ===
// null) returns '' exactly — no wrapper, no empty block, so the board is unchanged wherever the
// block is absent. The values are UNTRUSTED PRD text (same as renderBody's input), so each is
// escaped before a tag is emitted. Pure and exported, like renderBody, so it is unit-testable
// without a browser (tools/behavior-render.test.mjs).
export function renderBehavior (b) {
  if (!b) return ''
  const row = (k, label, text, cls = '') =>
    `<div class="brow b${k}${cls}"><span class="blab">${label}</span><span class="btxt">${esc(text)}</span></div>`
  const list = b.beats || [{ when: b.when, then: b.then }]
  // Task 8 (the frozen mockup's behavior table): a MULTI-beat block numbers its When/Then labels
  // (WHEN 1 · THEN 1 · WHEN 2 …) and marks every beat after the first `beatstart`, so the Focus
  // table can rule a heavier line between beats. A 1-beat block emits none of it — byte-identical.
  const many = list.length > 1
  const beats = list.map((bt, i) => {
    const n = many ? `<sup class="bno">${i + 1}</sup>` : ''
    return row('when', 'When' + n, bt.when, many && i > 0 ? ' beatstart' : '') + row('then', 'Then' + n, bt.then)
  }).join('')
  return `<div class="behavior">${row('given', 'Given', b.given)}${beats}</div>`
}

// The drawn SCHEMATIC a requirement may carry (requirement schematics, 2026-08-18; task 4) —
// r.viz is attached by enrichReqs from the committed spec/<screen>/viz/<id>.svg (derived by
// tools/viz.mjs from the behavior text, hash-pinned, never a capture of the real UI). Baked here
// into the hidden source row as a <figure> so the Focus reader (and the List's open row — the
// same client builder) renders it without a fetch, with the loop · stills chrome built
// client-side. The empty-string contract mirrors renderBehavior(null): no viz, no wrapper, no
// change anywhere the drawing is absent. Defense in depth: the file is committed content, but the
// builder still refuses to inline anything that is not a plain <svg> (a script, a stray payload) —
// board.html must never gain executable content this way.
export function renderSchematic (r) {
  const v = r && r.viz
  if (!v) return ''
  const svg = String(v.svg || '').trim()
  // task 4 review M1: the <script>/shape checks alone miss an inline on*= event handler attribute
  // or a javascript:/data: URI riding in an href — both execute once this is inlined into the live
  // DOM (and again via innerHTML in client.js buildSchematic). Refuse those too, so the filter
  // actually delivers the contract this comment states.
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>') || /<script\b/i.test(svg) ||
    /\son\w+\s*=/i.test(svg) || /\bhref\s*=\s*["']?\s*(?:javascript|data):/i.test(svg)) return ''
  const stale = v.stale ? ' data-stale="1"' : ''
  const at = v.at ? ` data-vizat="${esc(v.at)}"` : ''
  return `<figure class="schematic" data-phases="${esc((v.phases || []).join(' '))}"` +
    ` data-vizhash="${esc(v.hash || '')}" data-texthash="${esc(v.textHash || '')}"${at}${stale}>${svg}</figure>`
}

// The run-all control for this screen, in the detail bar. Run (headless) is the default; per-test
// Run/Watch buttons and the SSE-streamed run panel live on the test rows (R10).
const runAll = name =>
  `<button class="btn pri runbtn" data-run="${esc(name)}" title="run every test in the background">▶ Run all in background</button>`

// The baked REQUIREMENTS pane (board R2/R3) — the left half of the hidden shared source (.cols):
// one requirement per row — its state chip, id and TITLE, always shown;
// the long, formatted description collapses behind it and one click on the header reveals the full
// markdown. An UNPROVEN row's open body ends in an honest "no test asserts this yet" line (R6); a
// proven one ends with the body. A requirement is never faked green.
// (Corrected 2026-08-05: this said an open body "ends in a covers line NAMING the tests that prove
// it". That line was removed from reqRow below — the E2E column already shows the flow — but the
// comment was left behind, and two board tests then asserted a `.covers .ctag` chip that nothing
// renders. A comment describing behaviour the code dropped is how a dead test survives review.)
// The D2 EVIDENCE the fold carries for this requirement (Task 15: the before/after frame pair,
// folded into spec/_results-index.json from CLI runs too) — baked onto the source row as
// data-ev-* attributes so the Focus media pane (client.js) can render it without a fetch. Only a
// path whose FILE exists is baked (absence of a frame is never an error), and each carries a
// content-hash cache-buster because the harvest overwrites in place (the same ?h= discipline as
// screen.png). The WINDOW — the proves-step's span in the run's recording — is baked as
// `data-ev-window="from:to"` (data, not a path — no file check): it is what lets the gif-mode
// frame-stepper (Task 13) hold each frame for its TRUE relative duration. A legacy entry's clip
// fields are simply not baked — the webp retired with the stepper.
const evAttrs = (s, r) => {
  const e = s.run && s.run.evidence && s.run.evidence[r.id]
  if (!e) return ''
  let out = ''
  for (const [k, p] of [['before', e.before], ['after', e.after]]) {
    if (!p) continue
    const abs = join(ROOT, String(p))
    if (!existsSync(abs)) continue
    out += ` data-ev-${k}="${esc(String(p) + '?h=' + shotHash(abs))}"`
  }
  if (out && e.window && typeof e.window.from === 'number' && typeof e.window.to === 'number') {
    out += ` data-ev-window="${esc(e.window.from + ':' + e.window.to)}"`
  }
  // Task 16 #1: the COMMITTED VIDEO — the screen's primary recording plus this requirement's own
  // frozen seek offsets. Baked only when the file is really on disk (the reader HIDES the video
  // button without it — never a broken player), content-hash-busted like the frames. The offsets
  // ride their own attribute, NOT data-ev-window: a later CLI fold moves the window with the fresh
  // frames while the video keeps the offsets it was cut against.
  if (e.video && e.video.path) {
    const vabs = join(ROOT, String(e.video.path))
    if (existsSync(vabs)) {
      out += ` data-ev-video="${esc(String(e.video.path) + '?h=' + shotHash(vabs))}"`
      if (typeof e.video.from === 'number' && typeof e.video.to === 'number') {
        out += ` data-ev-vwin="${esc(e.video.from + ':' + e.video.to)}"`
      }
    }
  }
  // THE PER-BEAT HARVEST (the human, 2026-08-28): the storyline reader shows each beat's own
  // before/after beside the beat that produced it, so the fold now carries `beats:[{n,before,after,
  // layoutBefore,layoutAfter,window}]` alongside the requirement-level pair. Baked as ONE JSON
  // attribute (a per-beat attribute each would be a dozen), on the same terms as every frame above:
  // only a path whose FILE exists rides, content-hash-busted, and an entry left with no frame at all
  // is dropped rather than baked empty — the reader's cell then says the gap out loud. An old
  // harvest has no `beats` and bakes nothing; the reader falls back to the requirement-level pair.
  if (Array.isArray(e.beats) && e.beats.length) {
    const path = p => {
      if (!p) return null
      const abs = join(ROOT, String(p))
      return existsSync(abs) ? String(p) + '?h=' + shotHash(abs) : null
    }
    // THE SCENE'S OWN RING (the human, 2026-08-31: "do more aggressive zoom in on the area it's
    // focusing"). The beat's focus rect sets the row's ZOOM; the ring of the scene on show sets the
    // AIM, so a beat whose rings sit 600px apart down the page can be framed tight instead of being
    // zoomed back out until all of them fit. It is DERIVED here, never stored: the layout skeleton
    // beside every frame already records the ring and the viewport it was measured in, so no
    // re-harvest is needed — an existing evidence tree gains the aim on its next build. A skeleton
    // that rang nothing, or is missing, simply yields none and that scene stays on the focus.
    const aim = p => {
      if (!p) return null
      const abs = join(ROOT, String(p))
      if (!existsSync(abs)) return null
      try { return focusFromLayout(JSON.parse(readFileSync(abs, 'utf8'))) } catch { return null }
    }
    const list = e.beats.map(b => {
      const o = { n: Number(b.n) }
      for (const k of ['before', 'after', 'layoutBefore', 'layoutAfter']) {
        const v = path(b[k]); if (v) o[k] = v
      }
      const aB = aim(b.layoutBefore); if (aB) o.aimBefore = aB
      const aA = aim(b.layoutAfter); if (aA) o.aimAfter = aA
      if (b.window && typeof b.window.from === 'number' && typeof b.window.to === 'number') {
        o.window = { from: b.window.from, to: b.window.to }
      }
      // the ringed target's box and the viewport it was measured in — the proof cell's CAMERA
      // (the human, 2026-08-28). All six numbers or none: a partial box would frame the wrong thing.
      if (b.focus && ['x', 'y', 'w', 'h', 'vw', 'vh'].every(k => typeof b.focus[k] === 'number' && Number.isFinite(b.focus[k]))) {
        o.focus = { x: b.focus.x, y: b.focus.y, w: b.focus.w, h: b.focus.h, vw: b.focus.vw, vh: b.focus.vh }
      }
      // the beat's ASSERTED-VALUE frames (2026-08-29), in check order: what the loop plays BETWEEN
      // the two ends, each with its offset into the beat's own window so the pace stays true — and,
      // since 2026-08-31, the ring it photographed, read out of the skeleton beside it so the row's
      // camera can aim at each scene. (This said "only the frame and the offset travel — the
      // skeleton is the schematic's source, not the reader's"; corrected in place, rule 6: the
      // reader reads it too now, still derived at build time and never stored.) A value whose frame
      // did not land is dropped, exactly like a missing pair member.
      const vals = (Array.isArray(b.values) ? b.values : []).map(v => {
        const src = path(v && v.frame)
        if (!src) return null
        const o2 = { frame: src }
        if (typeof v.at === 'number' && Number.isFinite(v.at)) o2.at = v.at
        // …and this scene's own ring, so the camera aims where the assertion pointed
        const f = aim(v && v.layout); if (f) o2.focus = f
        return o2
      }).filter(Boolean)
      if (vals.length) o.values = vals
      return o
    }).filter(o => Number.isFinite(o.n) && (o.before || o.after))
    if (list.length) out += ` data-ev-beats="${esc(JSON.stringify(list))}"`
  }
  if (out && e.at) out += ` data-ev-at="${esc(String(e.at).slice(0, 10))}"`
  return out
}
const reqRow = (r, s) => {
  // A proven requirement names NO tests here — the E2E column already shows the flow that proves it,
  // so a "proven by …" line would just repeat it. An UNPROVEN one still says so plainly (board R6):
  // honestly ungreen, never hidden.
  const covers = r.state === 'proven'
    ? ''
    : '<div class="covers"><span class="nocov">no test asserts this yet — honestly ungreen, not hidden</span></div>'
  // When the requirement leads with a Given/When/Then triple, renderBehavior draws it as the shape,
  // so the prose renderer gets the body with that lead stripped — otherwise the triple renders twice
  // (once as the shape, once as a bullet list). Gated on r.behavior so a prose-only body is untouched.
  const prose = r.behavior ? stripBehaviorLead(r.body) : r.body
  // data-beats carries the beat COUNT (0 = prose-only) — the Focus media pane derives its D2
  // default from status × beats, and the List row shows the count, so it is baked once here.
  const beats = r.behavior ? r.behavior.beats.length : 0
  // data-fam: the requirement's family NAME (board R17) — the Focus counter reads `<family> · n of N`
  // off the baked row; absent on a screen with no families, so the counter reads as before
  const fam = (s.families || []).find(f => f.ids.includes(r.id))
  return `<div class="req" data-r="${esc(r.id)}" data-state="${r.state}" data-status="${esc(r.status)}" data-beats="${beats}"${fam ? ` data-fam="${esc(fam.name)}" data-famn="${esc(fam.n == null ? '' : fam.n)}"` : ''}${evAttrs(s, r)}>
    <div class="h">${reqChip(r.status)}<span class="id">${esc(r.id)}</span><div class="rmain"><span class="rt">${esc(r.title)}</span><div class="rhint">${esc(excerpt(r.body))}</div></div><span class="chev">›</span></div>
    <div class="body">${renderBehavior(r.behavior)}${renderSchematic(r)}${renderBody(prose)}${covers}</div>
  </div>`
}
const reqPane = s => `<div class="pane reqpane">
  <h2>Requirements<span class="s">what the screen must do</span></h2>
  ${s.reqs.length ? s.reqs.map(r => reqRow(r, s)).join('') : `<div class="empty">No requirements yet — write the first in <code>spec/${esc(s.name)}/prd.md</code>.</div>`}
</div>`

// The LIST view (board R13, the frozen mockup — Grid became List, the human 2026-08-21; the router
// key stays 'grid'): one COLLAPSED row per requirement — state · id · title · beat count · covering-
// test kind — with a gap-summary strip above, and an OPEN row is the FOCUS BODY ITSELF, rendered in
// place by the client's shared builder (an accordion, one open at a time). Only the collapsed heads
// and the gap strip are baked here; the open body is client-built from the same hidden source rows
// Focus reads, so List and Focus can never render two different truths.
const GRID_CHIP = {
  passed: ['ok', 'mark', '✓ Passed'],
  changed: ['changed', 'mark c', '◈ Changed'],
  failed: ['fail', 'mark h', '✗ Failed'],
  'not-reached': ['wait', 'mark n', '◌ Not reached'],
  untested: ['gone', 'mark o', '○ Untested']
}
// The covering test that best speaks for the requirement NOW: it must AGREE with the chip — the
// chip is r.status (the board-wide fail-wins fold), so the pick is driven by r.status too, never a
// pass-first precedence of its own. A green never shows beside a non-Passed chip (rule 3). Changed
// is passed-family (the pass is current; the text moved), so it names the same passing test.
export const pickProofTest = r => {
  const tests = r.tests || []
  if (!tests.length) return null
  return ((r.status === 'passed' || r.status === 'changed') && tests.find(t => t.status === 'pass' && !t.stale)) ||
    (r.status === 'failed' && tests.find(t => t.status === 'fail')) ||
    (r.status === 'not-reached' && tests.find(t => t.status === 'not-reached')) ||
    tests[0]
}
// The one-line proof sentence for a requirement. The Grid view that RENDERED it retired when Grid
// became List (board R13, 2026-08-21) — an open List row now shows the Focus body's proof line
// instead — but the sentence stays exported and unit-tested (tools/grid-proof.test.mjs) as the
// pinned wording contract for "proof line agrees with the chip", the same keep-the-proven-renderer
// precedent as journeyRail. pickProofTest above is the live half the List still uses (the head's
// covering-test kind).
export const gridProof = (r, screenName) => {
  const tests = r.tests || []
  if (!tests.length) return '<span class="grproof none">no test asserts this yet</span>'
  const cur = pickProofTest(r)
  const from = cur.screen && cur.screen !== screenName ? ` · ${esc(cur.screen)}` : ''
  const line = r.status === 'passed' ? `✓ proved by ${esc(cur.title)}${from}`
    : r.status === 'changed' ? `◈ proved by ${esc(cur.title)}${from} — but the requirement text moved since that proof, re-verify`
      : r.status === 'failed' ? `✗ covered by ${esc(cur.title)}${from} — failed`
        : r.status === 'not-reached' ? `◌ covered by ${esc(cur.title)}${from} — not reached`
          : `○ covered by ${esc(cur.title)}${from} — stale, not re-proven since the screen changed`
  return `<span class="grproof">${line}</span>`
}
// The gap-summary strip above the List (the frozen mockup's reminder): counts of what is NOT green
// — Failed · Changed · Not reached · Untested — with the add-test affordance (the R15 prompt
// handoff; the board still writes nothing). Empty when nothing gapes — an all-green screen carries
// no reminder to close gaps that do not exist.
const gapStrip = s => {
  const n = st => s.reqs.filter(r => r.status === st).length
  const gaps = []
  if (n('failed')) gaps.push(`<b class="gap-failed">${n('failed')} Failed</b>`)
  if (n('changed')) gaps.push(`<b class="gap-changed">${n('changed')} Changed</b>`)
  if (n('not-reached')) gaps.push(`<b class="gap-nr">${n('not-reached')} Not reached</b>`)
  if (n('untested')) gaps.push(`<b class="gap-un">${n('untested')} Untested</b>`)
  if (!gaps.length) return ''
  return `<div class="remind"><span class="rk2">${gaps.join('<span class="gapdot">·</span>')}</span><span class="grow"></span>` +
    `<span class="gbn">add or revise a test to close the gap</span>` +
    `<button class="btn sm" data-addtest data-prompt="addtest">＋ Author a test</button></div>`
}
// kindByTitle: screen + test title → unit | flow, derived from the SOURCE plans (a test with
// flowStep beats is a flow; a checkReq-only test is a unit) — the same derivation flow.mjs makes at
// run time, available at build time so a never-run test still shows its kind.
const listPane = (s, kindOf) => `<div class="gridview" hidden>
  ${gapStrip(s)}
  ${familyGroups(s).flatMap(g => [...(g.family ? [g.family] : []), ...g.reqs]).map(r => {
    if (r.ids) return famRow(r, 'div').replace('class="fam"', 'class="lst-fam"')   // a family header row
    const [, , label] = GRID_CHIP[r.status] || GRID_CHIP.untested
    const beats = r.behavior ? r.behavior.beats.length : 0
    const cur = pickProofTest(r)
    const kind = cur ? kindOf(cur.screen || s.name, cur.title) : ''
    return `<div class="lst-card" data-r="${esc(r.id)}" data-status="${esc(r.status)}">
      <button class="lst-head" type="button">
        <span class="chev">›</span><span class="lid">${esc(r.id)}</span><span class="lttl">${esc(r.title)}</span>
        ${beats > 1 ? `<span class="lbeats">${beats} beats</span>` : ''}
        <span class="lpf ${esc(r.status)}">${label}${kind ? `<span class="lkind"> · ${esc(kind)}</span>` : ''}</span>
      </button>
      <div class="lst-body" hidden></div>
    </div>`
  }).join('')}
</div>`

// THE MAP (board R17) is the Focus pager itself, drawn by the client (tools/board/client.js
// buildFocus) off the baked rows' data-fam / data-famn / data-status — the top "THE MAP" block was
// merged into it on the human's direction (2026-08-23): two navigators over the same requirements
// read as confusion and cost a strip of space.

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

// The baked TESTS pane (board R3/R5/R10) — the right half of the hidden shared source (.cols), and
// the very nodes the Focus reader moves in: one test per row, enumerated from the SOURCE plan (so a test
// shows even before it has run), merged with its latest run record `t` when there is one. Leads
// with the flow title, the coverage tags, and a status chip; opens to the recording, the
// Run/Watch/Logs/Steps buttons, and the numbered plan steps (loadRuns overlays outcomes). There is
// no separate screenshot strip — the recording (its still as the cover) is the one artifact.
// Exported (like renderBody/gridProof) so the tag-chip contract is unit-testable directly
// (tools/testrow-tags.test.mjs). A chip DISPLAYS the bare id (data-r) but also carries the
// ORIGINAL, possibly qualified id in data-q — a qualified cross-screen tag (`dispatch:R7` in the
// board spec) stripped to bare data-r alone is invisible to the owning screen's pane, which is how
// the R4/R6 self-check walks false-positived on dispatch:R7 (2026-08-21; the walks union data-q).
export const testRow = (s, plan, t) => {
  const coverIds = t ? Object.keys(t.reqs || {}) : (plan.covers || [])
  const tags = coverIds.map(qid => {
    const rid = qid.includes(':') ? qid.split(':').pop() : qid
    return `<span class="tag" data-r="${esc(rid)}" data-q="${esc(qid)}">${esc(rid)}</span>`
  }).join('')
  const status = !t ? chip('gone', 'mark o', 'not run')
    : t.ok ? chip('ok', 'mark', 'pass') : chip('bad', 'mark o', 'fail')
  const cls = !t ? 'u' : t.ok ? 'p' : 'f'
  const planned = (plan.steps || []).map(planRow).join('')
  // the SOURCE-derived kind (flowStep present ⇒ flow), baked so the Flow view can offer a pill for
  // a flow-authored test before it has ever run; a record's server-derived kind overrides it live
  const kind = (plan.steps || []).some(st => st.kind === 'flow') ? 'flow' : 'unit'
  return `<div class="test tst ${cls}" data-t="${esc(plan.title)}" data-title="${esc(plan.title)}" data-kind="${kind}">
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
// more; as a STATUS it now belongs to the `Changed` drift state (board R4's fifth word, 2026-08-19
// — see REQ_CHIP/.chip.changed), which this static guide does not draw. Act 4's closing CTA (`.wcta-act`
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
// on a person; indigo now names the `Changed` drift state — board R4's fifth word, 2026-08-19 — and
// these scenes do not draw it).
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

// ONE SENTENCE ABOUT THE GATE (the human, 2026-08-30). The guide is where a person learns what the
// board IS, so it is where they should learn that CI is theirs to choose — and by which file.
// Derived like everything else: it names which screens gate today, and says so out loud when the
// chooser names a screen that is not there (a typo shrinks the gate, which is a false green waiting
// to happen, so it is never smoothed over — rule 3).
const ciNote = ci => {
  if (ci.error) {
    return '<p class="cinote"><b>The CI gate is yours to choose</b> — <code>spec/_ci.json</code> names the ' +
      'screens whose whole <code>test.spec.ts</code> runs in the GitHub Actions gate, and a card wearing ' +
      '<b>CI</b> is in it. Right now that file is <b>broken</b>: ' + esc(ci.error) + '</p>'
  }
  const named = ci.screens.length
  return '<p class="cinote"><b>The CI gate is yours to choose</b> — <code>spec/_ci.json</code> names the ' +
    'screens whose whole <code>test.spec.ts</code> runs in the GitHub Actions gate, and every home card ' +
    'in it wears a <b>CI</b> mark. ' +
    (ci.all
      ? 'There is no chooser on disk right now, so <b>every screen</b> runs — deleting the file widens the gate, it never disables it.'
      : 'Right now it names ' + named + ' screen' + (named === 1 ? '' : 's') + ': <b>' + esc(ci.screens.join(' · ')) + '</b>.') +
    ' Edit the list as screens are added, retired, or judged too slow to gate a merge; one left out still runs with <code>npm run e2e</code>.</p>'
}

const howView = (ctaAction, ci) => `<section class="dt" id="howview" hidden>
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
        ${ciNote(ci)}
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

// The JSON island's serializer (task-5 review B-5): the island carries prd text (titles, Then lines),
// so `<` `>` `&` and the U+2028/9 line terminators are \u-escaped — a title containing </script>
// can neither end the script nor trip the build's parse guard. Plain JSON.parse reads it back.
export const islandJson = data => JSON.stringify(data)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

export function build () {
  const screens = allScreens()
  const areas = sortedAreas(screens)
  // The getting-started journey, derived once for this build (board R12) — read from the tree, so a
  // step cannot claim a fact that is not in spec/. It no longer draws a rail (cut at the human's
  // direction); it feeds the walkthrough's closing CTA (Act 4) with the single derived next action.
  const j = journey()
  const ctaAction = wCtaAction(j)
  // There is no "your turn" any more (the human, 2026-08-17 — no guess, no gate). The numbers the
  // home banner reads are honest drift, not a person's queue: how many requirements are FAILING
  // right now, and how many read CHANGED — proven before, text moved since (board R4's fifth word,
  // 2026-08-19). Everything else is simply proven or untested, and zero of both stays "all clear".
  const failing = screens.reduce((n, s) => n + s.reqs.filter(r => r.status === 'failed').length, 0)
  const changed = screens.reduce((n, s) => n + s.reqs.filter(r => r.status === 'changed').length, 0)
  // the FIRST requirement that needs a look — the strip's "Open R<n> →" deep link (screen order,
  // then requirement order; failed before changed within a screen, as the counts read)
  const attn0 = (() => {
    for (const s of screens) for (const r of s.reqs) if (r.status === 'failed' || r.status === 'changed') return { s, r }
    return null
  })()
  // the run manifest — only for the cards' `latest run · <id>` captions (the newest run's commit)
  const runs = (() => { try { return readRuns() } catch { return [] } })()
  // the header crumb: this project's name + tagline, derived (never "specboard" on a vendored board)
  const pkg = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) } catch { return null } })()
  const manifest = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'spec', '_specboard.json'), 'utf8')) } catch { return null } })()
  const ident = projectIdentity(pkg, readConfig(), basename(ROOT), manifest)

  // test KIND at build time (unit | flow), derived from the source plans — see listPane
  const kindByTitle = new Map()
  for (const s of screens) {
    for (const p of (s.plans || [])) {
      kindByTitle.set(s.name + ' ' + p.title, p.steps.some(st => st.kind === 'flow') ? 'flow' : 'unit')
    }
  }
  const kindOf = (screen, title) => kindByTitle.get(screen + ' ' + title) || ''

  // THE HOME FEATURE STRIP (board R16, the human 2026-08-21 with the frozen mockup): six cards,
  // each a LINK into the live example of itself on THIS board — every target derived from the tree
  // on this build (nothing stored, nothing invented). A card whose example does not exist right now
  // says so in its sub-caption and falls back to the nearest honest surface. The dismiss control and
  // its client-side-only preference live in client.js.
  const flatReqs = []
  for (const s of screens) for (const r of s.reqs) flatReqs.push({ s, r })
  const first = pred => flatReqs.find(pred) || null
  const beatsEx = first(x => x.r.behavior && x.r.behavior.beats.length > 1) || first(x => x.r.behavior)
  const hasEv = x => {
    const e = x.s.run && x.s.run.evidence && x.s.run.evidence[x.r.id]
    return !!(e && e.before && e.after)
  }
  const provenEx = first(x => x.r.status === 'passed' && hasEv(x)) || first(x => x.r.status === 'passed')
  const driftEx = first(x => x.r.status === 'failed') || first(x => x.r.status === 'changed')
  const gapEx = first(x => x.r.status === 'untested') || first(x => x.r.status === 'not-reached')
  const home0 = screens[0]
  const reqHref = x => x ? `#/${esc(x.s.name)}/${esc(x.r.id)}` : (home0 ? `#/${esc(home0.name)}` : '#')
  const see = (x, note) => x ? `see ${esc(x.s.name)} ${esc(x.r.id)}` : note
  const feat = (key, href, mark, line, sub) =>
    `<a class="feat" data-feat="${key}" href="${href}"><span class="fm">${mark}</span>` +
    `<span class="fl2">${line}</span><span class="fs2">${sub}</span></a>`
  const featStrip = home0 ? `<div class="featwrap" id="featwrap">
    <div class="feats">
      ${feat('beats', reqHref(beatsEx), '✎<span class="fmq">→</span>ⁿ', '<b>Beats</b> — one Given, When→Then chained', see(beatsEx, 'author the first beats'))}
      ${feat('proof', reqHref(provenEx), '<span class="fmok">✓</span>', '<b>Proof from real runs</b> — stills · gif · video', see(provenEx, 'run the suite to capture proof'))}
      ${feat('drift', reqHref(driftEx), '<span class="fmbad">✗</span><span class="fmch">◈</span>', '<b>Drift is computed</b> — failed · changed, never stored', see(driftEx, 'none right now — nothing has drifted'))}
      ${feat('views', `#/${esc(home0.name)}/grid`, '☰', '<b>Focus · List · Flow</b> — three reads of one truth', 'open the List')}
      ${feat('compose', `#/compose/${esc(home0.name)}`, '<span class="fmadd">＋</span>', '<b>Compose a flow</b> — chain proven beats; no AI when they all are', 'open the composer')}
      ${feat('gaps', reqHref(gapEx), '<span class="fmun">○◌</span>', '<b>Honest gaps</b> — untested · not-reached stay ungreen', see(gapEx, 'none right now — everything is covered'))}
    </div>
    <button class="featx" id="featx" aria-label="dismiss the feature strip" title="hide this — a client-side preference, never stored">✕</button>
  </div>` : ''

  // the CI gate, read once for the whole build (never per card) — the same file, through the same
  // resolver, that .github/workflows/e2e.yml runs
  const ci = ciGate()
  const inCi = new Set(ci.screens)
  const groups = areas.map(a => {
    const inArea = screens.map((s, i) => ({ s, i })).filter(x => x.s.area === a)
    return `
<section class="grp" data-area="${esc(a)}">
  <div class="grph">
    <button class="tw" aria-label="collapse">—</button>
    <h2>${esc(a)}</h2>
    <span class="gc">${inArea.length} screen${inArea.length === 1 ? '' : 's'}</span>
  </div>
  <div class="cards">${inArea.map(x => card(x.s, x.i, runs, inCi.has(x.s.name))).join('')}</div>
</section>`
  }).join('')

  // The detail pairs the requirements with the tests that prove them (board R2), read in the Focus
  // reader or the Grid — no acceptance gate anywhere (board R8). The two baked panes inside .cols are
  // the SHARED DATA SOURCE those views read (Focus MOVES .testpane nodes into its reader; loadRuns
  // folds records into them; syncDerived refreshes them) — the Columns VIEW that used to show them
  // was retired 2026-08-18 (board R13), so .cols is permanently hidden, never a visible view.
  // data-screen alongside data-i so the router can open it by name.
  const detail = screens.map((s, i) => `
<section class="dt" data-i="${i}" data-screen="${esc(s.name)}" hidden>
  <div class="dth dbarhook">
    <div class="dname"><h2>${esc(s.title)}</h2><span class="dsub">${esc(s.area)} · ${esc(s.route)}</span></div>
    <span class="grow"></span>
    ${runAll(s.name)}
    <div class="viewseg" role="tablist" aria-label="View">
      <button class="vseg on" data-view="focus" data-i="${i}">Focus</button>
      <button class="vseg" data-view="grid" data-i="${i}">List</button>
      <button class="vseg" data-view="flow" data-i="${i}">Flow</button>
    </div>
    <button class="close btn">Close</button>
  </div>
  <div class="dtscroll">
    <div class="cols" style="display:none">
      ${reqPane(s)}
      ${testPane(s)}
    </div>
    ${listPane(s, kindOf)}
    <div class="flowview" hidden></div>
    <div class="composeview" hidden></div>
  </div>
  <div class="dtfoot" hidden></div>
</section>`).join('')

  // The client behaviour lives in tools/board/client.js now — real JavaScript, not a string inside
  // this template literal — and is read in verbatim below. The build-time values it needs are handed
  // over as a JSON ISLAND (window.__BOARD__), so code and data cross the seam cleanly: no
  // interpolation reaches into the script, so the backtick / ${} / \n escaping traps cannot happen.
  // THE COMPOSER'S LIBRARY (Task 5; D4 as amended 2026-08-21): derived HERE, on every build, from
  // behavior blocks + tests only (deriveLibrary — pure, unit-tested) — never the crawl, never a stored
  // graph. Each node carries its requirement's harvested after/before frames (its proof's evidence,
  // when a run has left any) as the composer's thumbnails, and the behavior's last Then as its tip.
  const lib = deriveLibrary(screens)
  const byName = new Map(screens.map(s => [s.name, s]))
  const composeNodes = lib.nodes.map(n => {
    const scr = byName.get(n.screen)
    const ev = scr && scr.run && scr.run.evidence && scr.run.evidence[n.proves]
    const req = scr && scr.reqs.find(r => r.id === n.proves)
    const beats = req && req.behavior ? req.behavior.beats : []
    return {
      ...n,
      still: ev && ev.after ? ev.after : null,
      before: ev && ev.before ? ev.before : null,
      then: beats.length ? beats[beats.length - 1].then : ''
    }
  })
  const BOARD_DATA = {
    screens: screens.map(s => s.name),
    skillIds: HOW_FLOWS.map(f => f.id),
    compose: {
      nodes: composeNodes,
      givens: lib.givens,
      titles: Object.fromEntries(screens.map(s => [s.name, s.title]))
    }
  }
  const clientJs = readFileSync(join(ROOT, 'tools', 'board', 'client.js'), 'utf8')
  // the frame-stepper's pure timing math (Task 13) — a second verbatim real-JS file, emitted in
  // its own <script> BEFORE the client (which reads globalThis.SBStepper); node --test reaches the
  // same bytes directly (tools/stepper.test.mjs), so the pace the board plays is the pace tested
  const stepperJs = readFileSync(join(ROOT, 'tools', 'board', 'stepper.js'), 'utf8')

  // the design system's text is read ONCE and reused: inlined below, and parsed for the --scale
  // the breakpoint emits compute from (see parseScale/scaledBp at the top of this file)
  const css = designCss()
  const bp = base => scaledBp(base, parseScale(css))

  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>specboard</title>
<style>${css}</style>
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
  /* Task 14 (the human, 2026-08-24): the content caps rise 1200/1160 → 1360/1320 and the horizontal
     page padding drops one step to var(--s5) (scaled ≈ 19px — a sane gutter, never 0), so a wide
     screen is spent on content rather than margins; the ×0.8 --scale in _design.css tightens the
     chrome around it. */
  .wrap { max-width:1360px; margin:0 auto; padding:var(--s6) var(--s5) var(--s8); }
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
  .updsetup { max-width:1320px; margin:0 auto var(--s4); font-size:var(--t-sm); color:var(--ink-4); }
  .updsetup.avail { color:var(--ai); }
  .gbn { font-size:var(--t-sm); color:var(--ink-4); }
  .none { display:none; padding:var(--s8) 0; text-align:center; color:var(--ink-4); font-size:var(--t-md); }
  .clear { display:flex; align-items:center; gap:var(--s3); background:var(--koke-tint);
    border:1px solid var(--koke-line); border-radius:var(--r-md); padding:var(--s3) var(--s4);
    margin-bottom:var(--s4); font-size:var(--t-sm); color:var(--koke); }
  /* the NEED-A-LOOK state (Task 8, the mockup's attn queue): gold — in flight, nothing settled — a
     mono count pill, the failed/changed counts in their own hues, and the first one's deep link.
     Measured on --yamabuki-tint #f6eeda: --ink-2 8.4:1 · --yamabuki 4.6:1 · --bengara 5.7:1 · --ai 8.0:1; the pill --yamabuki on --paper 5.2:1. */
  .clear.attn { background:var(--yamabuki-tint); border-color:var(--yamabuki-line); color:var(--ink-2); gap:14px; }
  .clear.attn .qk { font:var(--t-xs) var(--mono); color:var(--yamabuki); background:var(--paper);
    border:1px solid var(--yamabuki-line); border-radius:var(--r-sm); padding:3px 10px; white-space:nowrap; }
  .clear.attn .st-bad { color:var(--bengara); font-weight:500; }
  .clear.attn .st-changed { color:var(--ai); font-weight:500; }
  .clear.attn .qopen { color:var(--yamabuki); font-weight:500; }
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
  /* Task 8 — the frozen mockup's card (2026-08-17): 1fr + a 300px right column; a large title with
     the route in mono beneath; dashed hair-ruled requirement rows each LEADING with its status mark;
     the right column stacks the proven pill, the unit · flow kind chips and the captioned still. */
  #home .card { display:grid; grid-template-columns:1fr calc(300px * var(--scale)); gap:var(--s5); background:var(--card);
    border:1px solid var(--hair); border-radius:var(--r-md); padding:var(--s5); cursor:pointer;
    box-shadow:var(--sh-sm); transition:border-color .12s, box-shadow .12s; }
  #home .card:hover { border-color:var(--hair-2); box-shadow:var(--sh-md); }
  #home .card.gone { display:none; }
  #home .card .cname { display:flex; align-items:center; gap:var(--s3); margin-bottom:2px; }
  #home .card .nm { font-size:var(--t-xl); font-weight:500; letter-spacing:-.02em; }
  #home .card .croute { font:var(--t-micro) var(--mono); color:var(--ink-4); margin-bottom:var(--s3); }
  .rl { list-style:none; display:flex; flex-direction:column; margin:var(--s2) 0 0; padding:0; }
  .rl li { display:flex; gap:9px; align-items:baseline; padding:4px 0; font-size:var(--t-sm); color:var(--ink-2);
    border-top:1px dashed var(--hair); }
  .rl li:first-child { border-top:0; }
  .rl li .id { font:var(--t-micro) var(--mono); color:var(--ink-4); width:24px; flex:none; }
  /* the status mark leads every row — the five-word vocabulary's marks in its hues (board R4), the
     hue never alone because the GLYPH itself differs per state: ✓ ◈ ✗ ◌ ○ */
  .rl li .mk { flex:none; width:14px; text-align:center; font-size:var(--t-sm); color:var(--ink-4); }
  .rl li .mk.passed { color:var(--koke); } .rl li .mk.changed { color:var(--ai); }
  .rl li .mk.failed { color:var(--bengara); } .rl li .mk.not-reached { color:var(--yamabuki); }
  .rl li.more { color:var(--ink-4); font-size:var(--t-xs); padding-left:calc(24px + 14px + 18px); }
  /* a FAMILY header row (board R17) — the reference catalogue's .grp shape scaled to the card: a
     mono uppercase eyebrow, the number muted, the name bold in ink, the gloss muted after the
     em-dash, a hair rule beneath; the row itself has no mark, no id — it is structure, not a
     requirement. Contrast on card: --ink-3 6.42:1, --ink 16.79:1 (measured, the rule above). */
  .rl li.fam { display:block; border-top:0; border-bottom:1px solid var(--hair); margin-top:var(--s2); padding:6px 0 4px;
    font:var(--t-micro) var(--mono); letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); white-space:nowrap;
    overflow:hidden; text-overflow:ellipsis; }
  .rl li.fam:first-child { margin-top:0; }
  .rl li.fam + li { border-top:0; }
  .rl li.fam .fname { color:var(--ink); font-weight:600; }
  .rl li.fam .fgloss { color:var(--ink-3); }
  #home .card .cright { display:flex; flex-direction:column; align-items:flex-end; gap:10px; }
  #home .card .metrics { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  #home .card .pcount { border-radius:999px; padding:2px 10px; }
  #home .card .kinds { display:flex; gap:6px; }
  .kchip { display:inline-flex; align-items:center; gap:5px; font-size:var(--t-xs); border:1px solid var(--hair-2);
    border-radius:999px; padding:2px 9px; color:var(--ink-2); background:var(--paper); }
  .kchip .km { font-family:var(--mono); font-weight:500; }
  .kchip.unit .km { color:var(--ai); }
  .kchip.flow .km { color:var(--koke); }
  .kchip.none { color:var(--ink-4); }
  /* the CI mark (2026-08-30): the same chip, no hue of its own — hue on this board names a requirement
     STATE, and "this screen gates CI" is a fact about the screen, not a state of it. --ink-3 on
     --paper is 6.42:1 (AA). */
  .kchip.ci .km { color:var(--ink-3); }
  /* its own line under the kind counts — it is not a test-kind count, and sitting inside that row
     would read as one (and would break board R1's beat, which pins that row to unit + flow) */
  #home .card .metrics > .kchip.ci { align-self:flex-end; }
  /* the guide's one sentence about the gate — the intro's own voice, held to a readable measure */
  .intro .cinote { margin-top:var(--s3); font-size:var(--t-sm); line-height:1.6; color:var(--ink-2); }
  .intro .cinote code { font:var(--t-xs) var(--mono); background:var(--wash); border:1px solid var(--hair);
    border-radius:var(--r-sm); padding:1px 5px; color:var(--ink-2); }
  /* the card's media column scales with the chrome (Task 14) — the cover is a recognition
     thumbnail, not proof imagery; 16:9 held (240×120 at 0.8) */
  .cshot { width:calc(300px * var(--scale)); height:calc(150px * var(--scale)); border-radius:var(--r-sm); border:1px solid var(--hair); overflow:hidden;
    background:linear-gradient(135deg,var(--wash),var(--sunk)); position:relative; }
  .cshot img { width:100%; height:100%; object-fit:cover; object-position:top left; display:block; }
  .cshot .play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:18px; color:var(--ink-4); }
  /* the "latest run · <id>" caption rides the still's top-left corner, on a paper wash so it reads
     over any frame (--ink-3 on --paper: 6.42:1) */
  .cshot .lrun { position:absolute; top:6px; left:8px; z-index:2; font:var(--t-micro) var(--mono); color:var(--ink-3);
    background:var(--paper); border:1px solid var(--hair); border-radius:var(--r-sm); padding:1px 5px; }

  /* THE FEATURE STRIP (board R16): six cards above the areas, each a link into the live example of
     itself on this board; the ✕ dismisses it — a client-side preference (localStorage), never
     stored in the tree. */
  .featwrap { position:relative; margin-bottom:var(--s4); }
  .featwrap[hidden] { display:none; }
  .feats { display:grid; grid-template-columns:repeat(6, 1fr); gap:var(--s2); padding-right:26px; }
  .feat { border:1px solid var(--hair-2); border-radius:var(--r); background:var(--card);
    padding:9px 11px; display:flex; flex-direction:column; gap:2px; cursor:pointer;
    text-decoration:none; color:var(--ink); transition:border-color .12s; }
  .feat:hover { border-color:var(--ai); }
  .feat .fm { font-size:var(--t-lg); line-height:1; }
  .feat .fm .fmq { color:var(--ink-4); }
  .feat .fm .fmok { color:var(--koke); }
  .feat .fm .fmbad { color:var(--bengara); }
  .feat .fm .fmch { color:var(--ai); }
  .feat .fm .fmadd { color:var(--ai); }
  .feat .fm .fmun { color:var(--ink-4); }
  .feat .fl2 { font-size:var(--t-xs); line-height:1.35; }
  .feat .fl2 b { font-weight:500; }
  .feat .fs2 { font:var(--t-micro) var(--mono); color:var(--ink-4); }
  .featx { position:absolute; right:0; top:0; width:20px; height:20px; border:0; background:transparent;
    color:var(--ink-4); cursor:pointer; font-size:var(--t-sm); line-height:1; padding:0; }
  .featx:hover { color:var(--ink); }
  /* breakpoint computed at emit (base 1100 × --scale): six scaled cards still read at the
     emitted edge — the strip folds to three-up before any card's two-liner clips */
  @media (max-width:${bp(1100)}px) { .feats { grid-template-columns:repeat(3, 1fr); } }

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
  .dth h2 { font-size:var(--t-lg); font-weight:500; letter-spacing:-.02em; }
  /* the screen's name with "area · route" beneath (Task 8, the mockup's .dname) */
  .dth .dname { display:flex; flex-direction:column; gap:1px; }
  .dth .dname .dsub { font:var(--t-micro) var(--mono); color:var(--ink-4); }
  .dth .m { font:var(--t-xs) var(--mono); color:var(--ink-4); }
  .dtscroll { flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column;
    align-items:center; padding:var(--s5) var(--s5) var(--s5); }
  /* Task 12 — on a short window the vertical breathing room yields to the content: the schematic
     must stay on first sight at the 640px floor (tokens only; the sides dropped to s5 with the
     page gutter, Task 14) */
  @media (max-height:760px) {
    .dtscroll { padding-top:var(--s3); padding-bottom:var(--s3); }
    /* release pass M-3: on a short window the reading card's own padding tightens too, so a
       2-line-title card keeps its label + one Given row AND its pinned footer above the schematic
       at the 640 floor (the budget there is 445px; s6/s5 padding cost 24px of it) */
    .focusov .fread, .lst-body .fread { padding-top:var(--s4); padding-bottom:var(--s4); }
  }
  .dtscroll > .cols { width:100%; max-width:1360px; flex:1; min-height:0; }

  /* the two BAKED SOURCE PANES (requirements + tests). Their Columns VIEW was retired 2026-08-18
     (board R13): .cols ships hidden (inline display:none in the markup) and nothing un-hides it —
     the rows stay in the DOM as the shared source Focus, Grid and Flow read. The .pane rules below are
     kept: hidden reads and the restored/moved nodes still rely on this markup's structure. */
  .cols { display:grid; grid-template-columns:minmax(0,40%) minmax(0,60%); gap:var(--s4);
    min-height:340px; }
  .pane { background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
    overflow-y:auto; overflow-x:hidden; padding-bottom:var(--s6); }
  .pane > h2 { position:sticky; top:0; z-index:2; background:var(--card);
    font:var(--t-xs) var(--mono); text-transform:uppercase; letter-spacing:.09em; color:var(--ink-4);
    padding:var(--s3) var(--s4); border-bottom:1px solid var(--hair); display:flex; align-items:center; gap:var(--s2); }
  .pane > h2 .s { margin-left:auto; text-transform:none; letter-spacing:0; }

  /* THE FOCUS READER (board R13; THREE COLUMNS, the human 2026-08-28): one requirement per page as
     three containers — the SCHEMATIC (the drawing, first-class and full column width), the
     REQUIREMENT (its beats, then the authored prose in full) and the PROOF (the media pane and the
     covering test). The old two-container split put the drawing inside the reading card, where it
     could only ever be an aid beside the words; on its own column it is a picture again. One of the
     views — Focus / Grid / Flow — switched by the header toggle. No new state; the same derived chips. */
  /* cap the reader's width (was full-viewport, so the columns sprawled); centred, three columns need
     more room than two, so the cap moved up with the column count */
  .focusov { width:100%; max-width:1760px; margin:0 auto; flex:1; min-height:0; display:flex; flex-direction:column; gap:var(--s3); }
  /* the id + state ride INSIDE the reading card (a meta line above the title) — no full-width bar
     above the reader eating vertical space, so both cards start at the top */
  /* ONE header row (the human, 2026-08-25): id · chip · TITLE · ⋯ — the title shares the line and
     grows (flex:1), so the reading card leads compactly and the ⋯ rides the far edge without a
     margin-left hack. baseline-aligned so the mono id, the chip and the title's first line sit on one
     line; a long title wraps under the row and the tags stay on its first line. */
  .fread .frmeta { display:flex; align-items:baseline; gap:var(--s3); margin-bottom:var(--s4); }
  .frmeta .fid { font:var(--t-md) var(--mono); color:var(--ink-3); flex:none; }
  .frmeta .fchip { flex:none; }
  .fchip { font-size:var(--t-sm); border-radius:999px; padding:2px 10px; border:1px solid; }
  /* board R4, amended 2026-08-17: the same four-word vocabulary as REQ_CHIP/GRID_CHIP above — the
     Focus reader is the detail's DEFAULT view, so it may never be the one surface still speaking the
     old binary proven/unproven while the source rows and Grid have moved on. */
  .fchip.passed  { color:var(--koke); background:var(--koke-tint); border-color:var(--koke-line); }
  .fchip.failed  { color:var(--bengara); background:var(--bengara-tint); border-color:var(--bengara-line); }
  .fchip.not-reached { color:var(--yamabuki); background:var(--yamabuki-tint); border-color:var(--yamabuki-line); }
  .fchip.untested { color:var(--ink-3); background:var(--wash); border-color:var(--hair-2); }
  /* Changed — board R4's fifth word (2026-08-19). It claims the 藍 indigo reserved for exactly this
     drift state: the same tint/line/ink pattern the passed chip spends koke on (--ai #2f4a63 on
     --ai-tint #e6eaee measures 7.6:1 — WCAG AA). A tint like every status chip, never a second
     inverted element. The ◈-shaped mark (a rotated hollow square) carries the state beside the hue
     (hue never alone), distinct from ○ untested's straight hollow square. */
  .fchip.changed { color:var(--ai); background:var(--ai-tint); border-color:var(--ai-line); }
  .chip.changed  { background:var(--ai-tint); color:var(--ai); box-shadow:inset 0 0 0 1px var(--ai-line); }
  .mark.c { background:transparent; box-shadow:inset 0 0 0 1px currentColor; transform:rotate(45deg); }

  /* ONE card, read top to bottom. The reader is no longer a split of containers: it is the
     behaviour's STORYLINE, a row per beat, and the row is where the three things meet (see .sbrow).
     The card fills the reader and its .fscroll region scrolls internally between the fixed header
     and the pinned .ffoot — board R2's independent-scroll guarantee, now between the header and the
     story rather than between two columns. */
  .fpage { flex:1; min-height:0; display:flex; flex-direction:column; }
  .fread { background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
    box-shadow:var(--sh-sm); overflow:hidden; min-height:0; flex:1 1 auto;
    display:flex; flex-direction:column; padding:var(--s5) var(--s5) var(--s4); }
  /* the proof BAND — what belongs to the whole requirement (the covering test, the one video), under
     the beat rows that carry each beat's own frames */
  .feval { display:flex; flex-direction:column; gap:var(--s4); min-width:0; margin-top:var(--s5); }
  /* the reader's ONE bar (the human, 2026-08-28): the play speed that paces every animated cell —
     the drawing, each beat's stepper, the video. No card of its own; it is chrome over the story. */
  .fbar { flex:none; display:flex; align-items:center; justify-content:flex-end; gap:var(--s2);
    flex-wrap:wrap; min-width:0; padding-bottom:var(--s2); }
  .fbar .fbarl { font:var(--t-micro) var(--mono); letter-spacing:.08em; text-transform:uppercase;
    color:var(--ink-3); }
  /* two labelled control groups on one row — the second gets air so the labels read as headings for
     the control beside them, not as one run of words */
  .fbar .fbarl:not(:first-child) { margin-left:var(--s4); }
  /* .medbar's auto margin is for a media bar that pushes its modes to the far edge; in the reader
     bar the groups are already flush right and it would tear them apart */
  .fbar .medbar { margin-left:0; }
  /* 22px is a deliberate step above --t-xl (the reading title leads the page); it rides the same
     knob so the hierarchy holds at any scale (Task 14) */
  .fread .fttl { flex:1 1 auto; min-width:0; font-size:calc(19px * var(--scale)); font-weight:600;
    line-height:1.34; letter-spacing:-.015em; margin:0; color:var(--ink); }
  /* one step up with the beats (the human, 2026-08-28): the requirement column is read, not scanned,
     and half of it sitting a step below the other half read as two different importances */
  .fread .fbody { font-size:var(--t-lg); line-height:1.64; color:var(--ink-2); }
  .fread .fbody p { margin:0 0 var(--s2); } .fread .fbody p:last-child { margin:0; }
  .fread .fbody ul { margin:var(--s2) 0 0; padding-left:1.2em; }
  .flabel { font:var(--t-xs) var(--mono); text-transform:uppercase; letter-spacing:.09em;
    color:var(--ink-4); display:block; margin-bottom:var(--s4); }

  /* THE READING CARD (board R13, reworded 2026-08-28 — one card, a row per beat). Header, the speed
     bar, then the scroll region carrying the beat rows, the proof band and the authored prose in
     full. No Full-requirement toggle any more — the requirement is the thing the board exists to
     show, so it is never half-hidden behind a chevron. */
  /* Task 12 (the shape on first sight), kept and generalized: the card FILLS the reader and its
     story region (.fscroll) scrolls INTERNALLY between the fixed header and the pinned .ffoot — so
     the first beat is on screen from the first paint; only a short viewport clips (overflow:hidden —
     the page never scrolls). */
  /* the card header and footer NEVER shrink — only the scroll region gives way (a crushed title
     clipped mid-glyph is exactly the old failure in a new place) */
  .fread > .frmeta { flex:none; }
  .fread > .fscroll { flex:1 1 auto; min-height:calc(90px * var(--scale)); overflow-y:auto; overflow-x:hidden; }
  /* the pinned footer: zero-height, drawn only when the scroll region is clipped — a hairline + a
     short fade to the card ground mark the cut edge. Tokens only. */
  .fread > .ffoot { flex:none; position:relative; }
  .fread > .ffoot::before { content:''; position:absolute; bottom:100%; left:0; right:0; height:22px;
    background:linear-gradient(to bottom, transparent, var(--card)); opacity:0; pointer-events:none;
    transition:opacity .15s; }
  .fread.clipped > .ffoot::before { opacity:1; }
  .fread.clipped > .ffoot { box-shadow:0 -1px 0 var(--hair); }

  /* THE STORYLINE (the human, 2026-08-28): one bordered block, a ROW PER BEAT, and each row carries
     that beat's three cells side by side — [ the drawn frame | the Given / When→Then | the beat's
     own harvested proof ]. Read top to bottom it IS the behaviour's story: what was drawn, what it
     says, and the photograph of it happening, together instead of in three separate places. The
     .storycap toolbar is gone with the split — its caption named the drawing "the idea, not the real
     UI" while the drawing is being redrawn to mirror the real screen, and its speed dropdown is now
     the reader's single control.
     Measured: --ink-3 on --card 6.0:1 / on --canvas 5.8:1 (labels); --ai on --card 8.6:1 (When/Then);
     --ink on --card 16.8:1 / on --canvas 16.3:1 (the behaviour text). */
  .fstory { display:flex; flex-direction:column; }
  .fstory .sbwrap { border:1px solid var(--hair); border-radius:var(--r-md); overflow:hidden; }
  /* the drawing and the proof are the same width — the two cells of a row frame the SAME region
     under the same camera, and comparing them is the point, so a difference in width would read as a
     difference in the thing shown. The words are the CAPTION between them and take visibly less
     (the human, 2026-08-28): the visuals are what the row is for. ONE template, named once — the
     header row and every beat row take it from here, so they cannot drift apart.
     ONE ORDER, BEHAVIOUR FIRST (the human, 2026-08-30 — "just always be behaviour first"). The
     schematic-first / behavior-first toggle and its .ord-bsp re-deal are GONE: the words lead, then
     the drawing, then the photograph, and the DOM order IS that order. Nothing is shuffled by the
     CSS order property any more, so a header can never sit over a column it does not name. */
  .fstory { --sbcols:minmax(0,0.75fr) minmax(0,1.15fr) minmax(0,1.15fr); }
  .fstory .sbrow { display:grid; grid-template-columns:var(--sbcols);
    align-items:stretch; border-top:1px solid var(--hair); }
  .fstory .sbrow:first-child { border-top:0; }
  .fstory .sbrow.beatstart { border-top:2px solid var(--hair-2); }
  .fstory .sbrow.bgiven { background:var(--canvas); }
  /* THE COLUMN NAMES (the human, 2026-08-28): one header row over the beats, saying what the three
     cells are. Small-caps mono in --ink-3 — the system's one label style — on the --wash a header
     wears elsewhere (--ink-3 on --wash 5.5:1, AA). It shares the rows' grid so each name sits over
     its own column, and it rules off from the first row rather than the row ruling off from it. */
  .fstory .sbhead { display:grid; grid-template-columns:var(--sbcols);
    border-bottom:1px solid var(--hair); background:var(--wash); }
  .fstory .sbhead .sbhc { font:var(--t-micro) var(--mono); letter-spacing:.12em; text-transform:uppercase;
    color:var(--ink-3); padding:var(--s2) var(--s3); border-right:1px solid var(--hair); }
  .fstory .sbhead .sbhc:last-child { border-right:0; }
  .fstory .sbhead + .sbrow { border-top:0; }
  .fstory .sbframe { display:flex; flex-direction:column; align-items:center; justify-content:center;
    background:var(--paper); padding:var(--s3); overflow:hidden; border-right:1px solid var(--hair); }
  /* THE DRAWING'S PROVENANCE (the human, 2026-08-31: "let user know if the schematic is not what
     they want") — one quiet line under the drawing saying WHAT it is: the app's own measured
     layout, the sentence's archetype, nothing drawn yet, or a drawing whose text has moved past it.
     Derived from the marks the viz pass stamps on the svg, never stored. Tokens only, --ink-3 on
     --paper, and it is TEXT — the glyph is a mark, no hue carries the state. */
  .fstory .sbprov { align-self:stretch; font:var(--t-micro) var(--mono); letter-spacing:.04em;
    color:var(--ink-3); padding-top:var(--s2); text-align:center; }
  .fstory .sbprov .pvm { margin-right:4px; }
  .fstory .sbrow.bgiven .sbframe { background:var(--canvas); }
  .fstory .sbframe svg { display:block; width:100%; height:auto; margin:0 auto; }
  /* the drawing's camera box fills the cell — it is the row's other half of the comparison, not an
     inset thumbnail; its border is the cell's own rule, so the two cells read as one row */
  .fstory .sbframe > .pcbox { width:100%; border:0; border-radius:0; background:transparent; }
  .fstory .sbframe.whole { padding:0; }
  .fstory .sbframe.whole .viz { width:100%; }
  /* the still is the drawing PARKED at its phase — every animation paused, delay set from --ph;
     durations are calc(<X>s / var(--spd,1)) (tools/viz.mjs) so the parked delay divides by the SAME
     var, keeping |delay|/duration (the frame shown) identical at every speed */
  .fstory .sbframe svg * { animation-play-state:paused !important;
    animation-delay:calc(var(--ph, 0s) / var(--spd, 1)) !important; }
  /* THE READING (the human, 2026-08-28: the beat text was too small to read comfortably) — the
     sentence steps up to --t-lg and its label to --t-sm, both a full step above where they sat, and
     the label column widens to hold WHEN 1 at the larger size. Scale tokens only. */
  .fstory .sbtext { display:flex; flex-direction:column; justify-content:center;
    padding:var(--s4); min-width:0; border-right:1px solid var(--hair); }
  .fstory .sbstep { display:flex; gap:var(--s3); align-items:baseline; }
  .fstory .sbstep + .sbstep { margin-top:var(--s3); }
  .fstory .sbk { flex:none; width:calc(68px * var(--scale)); font:var(--t-sm) var(--mono);
    letter-spacing:.09em; text-transform:uppercase; color:var(--ink-3); }
  .fstory .sbk.then { color:var(--ai); }
  .fstory .sbk .bno { font-size:var(--t-sm); line-height:1; color:var(--ink-3); margin-left:2px; }
  .fstory .sbv { font-size:var(--t-lg); line-height:1.6; color:var(--ink); min-width:0; }

  /* THE PROOF CELL — the beat's own harvested frames, framed by the CAMERA (the human, 2026-08-28).
     .pcbox is the camera, and the SAME box wraps the drawing in the schematic cell beside it: every
     .camsub inside one is transformed by the shared maths in tools/board/stepper.js off the beat's
     ONE focus rect, so the drawn intent and the photographed result are cropped identically and the
     row is actually comparable. Stills and the stepper take the same code path, so switching mode
     never moves the view either. Zoom is a VIEW: .pczoom always offers the whole screenshot back,
     and the frame on disk is untouched. */
  .fstory .sbproof { display:flex; flex-direction:column; gap:var(--s2); padding:var(--s3);
    min-width:0; background:var(--paper); }
  .fstory .sbrow.bgiven .sbproof { background:var(--canvas); }
  /* the single-frame cell (the Given row, or a half-harvest): one captioned still where a beat has
     nothing to loop. A multi-frame cell is the loop and nothing else. */
  .sbproof .pcstrip { display:flex; gap:var(--s2); min-width:0; }
  .sbproof .pcfig { flex:1 1 0; min-width:0; margin:0; }
  /* THE CAMERA BOX — the same element on both sides of a row (the proof cell's frames and the
     schematic's drawing), so both are framed by one rule set and can never disagree.
     FULL FRAME (no focus, zoom off, or a camera that refused to magnify): the media FILLS the box's
     width and the box takes the media's own height — no fixed height, so nothing floats as a postage
     stamp in a field of background (the human, 2026-08-28).
     ZOOMED: the box takes the camera height, and the media is laid out at the box's WIDTH with its
     own aspect — exactly what cameraView assumes — then transformed. The box's overflow is the
     camera's edge. */
  .pcbox { position:relative; overflow:hidden;
    border:1px solid var(--hair); border-radius:var(--r-sm); background:var(--wash); }
  /* every camera subject is transformed about the same origin — but only a DIRECT child gets its
     display set here: the stepper's frames are stacked one-on-show by .fsteps img, and a stronger
     display:block on them would show the whole stack at once */
  .pcbox .camsub { transform-origin:0 0; }
  .pcbox > .camsub { display:block; width:100%; height:auto; }
  .pcbox > .camsub > svg { display:block; width:100%; height:auto; }
  /* A ZOOMED cell takes the PAGE'S OWN ASPECT (2026-08-28), not a fixed height: the camera's framed
     region is W/scale x H/scale of the page, so a cell with the page's aspect shows EXACTLY that
     region — and the callout the drawing (and the burn-in) placed inside the region can never be
     clipped by the cell edge, which a fixed 170px band did to every card placed above the ring. */
  .pcbox.zoomed { aspect-ratio: 16 / 10; height:auto; }
  .pcbox.zoomed > .camsub, .pcbox.zoomed .fsteps img { position:absolute; left:0; top:0; }
  /* the stepper inside a camera box: full-frame it flows and the box grows with it; zoomed it fills
     the camera. Its bar is pinned to the foot either way, so the count and dots stay reachable. */
  .sbproof .pcplay .fsteps-wrap, .sbproof .pcplay .fsteps { position:static; }
  .sbproof .pcbox.zoomed .fsteps-wrap, .sbproof .pcbox.zoomed .fsteps { position:absolute; inset:0; }
  .sbproof .pcplay .fstepbar { position:absolute; left:0; right:0; bottom:0; z-index:2;
    background:var(--paper); border-top:1px solid var(--hair); padding:var(--s1) var(--s2); }
  .sbproof .pccap { font:var(--t-micro) var(--mono); letter-spacing:.06em; color:var(--ink-3);
    padding-top:var(--s1); }
  /* STEP MODE'S AFFORDANCE (the human, 2026-08-30): in step mode the frames themselves are the
     "next" — a click advances this beat one scene — so the cell says so with the cursor and a
     hairline ring on hover, and nothing else. No button per row: a row is repeated down every
     requirement, and one control there is N controls on the page. In auto mode the class is simply
     absent and the cell is a picture again. */
  .sbproof .pcbox.pcnext { cursor:pointer; }
  .sbproof .pcbox.pcnext:hover { border-color:var(--ink-3); }
  /* the reader bar's play-mode pair — the .medbar chrome, named so a test can tell it from any other.
     The dedicated scene stepper that briefly sat beside it (3c93cb3) is GONE from the bar (the human,
     2026-08-30): a requirement has several When/Then, so the walk moved onto each beat row's own tour
     control (.tourstep below), where "next" names the beat it steps. */
  .fbar .medbar.pmode button { min-width:calc(38px * var(--scale)); }
  /* THE PER-BEAT GUIDED-TOUR STEPPER (the human, 2026-09-01 — a live mock). The labelled bead
     filmstrip that ec62a1d shipped (.scenerail / .srbeads) was REJECTED; in its place, a product
     tour's control in the beat row's behaviour gutter: ONE quiet line ‹ n / N › — a prev chevron,
     the position, a next chevron. No bordered box, no dots, no per-scene labels, no keyboard hint.
     The next chevron is faintly accented in the reader's indigo (--ai) and always carries a glyph
     (its state is the MARK, never the hue): at the last scene it becomes a restart ↺ that wraps to
     scene 1. The prev chevron dims (--ink-4) and disables at scene 1. Contrast: --ai 8.16:1,
     --ink-3 5.84:1, --ink-4 4.71:1 on --canvas — all AA. */
  .fstory .sbtext .tourstep { display:flex; align-items:center; gap:calc(8px * var(--scale));
    margin-top:var(--s3); }
  .tourstep .tsprev, .tourstep .tsnext { display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; background:none; border:0; padding:2px 4px; margin:0; line-height:1;
    font-size:calc(17px * var(--scale)); color:var(--ink-3); border-radius:var(--r-sm);
    min-width:calc(18px * var(--scale)); }
  .tourstep .tsprev:hover, .tourstep .tsnext:hover { color:var(--ink); }
  .tourstep .tsnext { color:var(--ai); }                 /* the forward affordance, faintly accented */
  .tourstep .tsnext:hover { color:var(--ink); }
  .tourstep .tsnext.restart { font-size:calc(14px * var(--scale)); }   /* ↺ reads better a touch smaller */
  .tourstep .tsprev[disabled] { color:var(--ink-4); cursor:default; opacity:.55; }
  .tourstep .tspos { font:var(--t-micro) var(--mono); letter-spacing:.08em; color:var(--ink-4);
    min-width:calc(34px * var(--scale)); text-align:center; }
  .tourstep .tsprev:focus-visible, .tourstep .tsnext:focus-visible { outline:2px solid var(--ink);
    outline-offset:2px; }
  /* the cell's one control, under the media: zoom ↔ full frame. The loop/stills mode toolbar is GONE
     (the human, 2026-08-28) — the loop is the only mode a proof cell has. */
  .sbproof .pcbar { display:flex; align-items:center; gap:var(--s2); flex-wrap:wrap; }
  /* the zoom toggle: quiet, always present where a focus box exists — ink-3 on --canvas 5.84:1 (AA) */
  .sbproof .pczoom { align-self:flex-start; font:var(--t-micro) var(--mono); color:var(--ink-3);
    background:var(--canvas); border:1px solid var(--hair-2); border-radius:999px;
    padding:3px 10px; cursor:pointer; }
  .sbproof .pczoom:hover { color:var(--ink); border-color:var(--ink-3); }
  /* an honest gap: this beat has no frame of its own, and the cell says so rather than borrowing
     its neighbour's (rule 3) */
  .sbproof .pcnone { display:flex; align-items:center; justify-content:center; text-align:center;
    min-height:calc(90px * var(--scale)); padding:var(--s3); font-size:var(--t-xs); color:var(--ink-3);
    border:1px dashed var(--hair-2); border-radius:var(--r-sm); }

  /* a narrow reader STACKS the row's three cells rather than crushing them — the story still reads
     in the same order, one cell under the next, with the dividing rule turned from side to foot.
     Emitted AFTER the cell rules on purpose: it is the same one-child specificity, so ahead of them
     it would lose on source order and the cells would keep their vertical rules while stacked.
     Breakpoint from the design system's --scale, computed at emit (a media query cannot read it). */
  @media (max-width:${bp(1180)}px) {
    .fstory .sbrow { grid-template-columns:1fr; }
    .fstory .sbframe, .fstory .sbtext { border-right:0; border-bottom:1px solid var(--hair); }
    /* a column header over one stacked column labels nothing — it goes, the rows keep their rule */
    .fstory .sbhead { display:none; }
    .fstory .sbhead + .sbrow { border-top:0; }
  }
  /* stale: the SAME drawing, quiet grey — shown, never hidden, never passing for right; the banner
     names it (bengara-tint carries the warning hue, the word carries the meaning) */
  .fstory.isstale .sbframe svg, .fstory.isstale .viz svg { filter:grayscale(1) opacity(.45); }
  .fstory .sbstale { display:flex; flex-direction:column; gap:2px; padding:var(--s2) var(--s3);
    background:var(--bengara-tint); border-bottom:1px solid var(--hair); }
  .fstory .sbstale b { font-size:var(--t-xs); color:var(--ink-2); font-weight:500; }
  .fstory .sbstale span { font-size:var(--t-micro); color:var(--ink-3); }

  /* the no-pair fallback: the animated whole, inside the same bordered .sbwrap. Also where a
     no-schematic requirement shows its honest placeholder line, never an empty frame. */
  .fstory .sbwrap .viz { position:relative; height:calc(320px * var(--scale));
    display:flex; align-items:center; justify-content:center; overflow:hidden; background:var(--paper); }
  .fstory .sbwrap .viz svg { display:block; width:100%; height:100%; }
  .fstory .sbwrap .viz .staleov { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:4px; text-align:center; padding:0 var(--s5);
    background:rgba(253,252,249,.85); /* the .wmark scrim family — paper at .85 so the note reads AA */ }
  .fstory .sbwrap .viz .staleov b { font-size:var(--t-sm); color:var(--ink-2); font-weight:500; }
  .fstory .sbwrap .viz .staleov span { font-size:var(--t-xs); color:var(--ink-3); }
  .fstory .noschem { padding:var(--s4); font-size:var(--t-xs); color:var(--ink-3); text-align:center; }

  /* the authored prose, ALWAYS shown (the human, 2026-08-28 — the "Full requirement" toggle is
     gone): a dashed rule is all that separates it from the beats above it. */
  .fread .fbody.fprose { border-top:1px dashed var(--hair); margin-top:var(--s3);
    padding-top:var(--s3); }

  /* the parked frames need no motion query — the client parks every one of them; the animated whole
     is the only thing left that moves, and a reduced-motion viewer gets it held still */
  @media (prefers-reduced-motion: reduce) {
    .fstory .sbwrap .viz svg * { animation-play-state:paused !important; }
  }

  /* THE MEDIA PANE (D2, the frozen mockup): the proof's media under a stills · gif · video toolbar.
     The default derives from status × beat count; the toolbar overrides it — a client-side
     preference (localStorage), never stored in the tree. */
  .fmedia { border:1px solid var(--hair); border-radius:var(--r); overflow:hidden; background:var(--card); }
  /* Task 16 #3 (the human, 2026-08-24): the proof card's children must NOT shrink — .fmedia is a
     flex child of .feval, and its default flex-shrink let the stacked pair (two ~39vh frames) be
     crushed to fit while .fmedia's own overflow:hidden clipped frame 2 away with scrollTop pinned
     at 0. Kept intrinsic, the card's existing overflow-y:auto scrolls and both frames are reachable. */
  .feval > .fmedia, .feval > .fev { flex:none; }
  .fmbar { display:flex; align-items:center; gap:var(--s2); font:var(--t-micro) var(--mono);
    color:var(--ink-3); padding:6px var(--s3); border-bottom:1px solid var(--hair); background:var(--wash); }
  .fmbar .pinned { color:var(--ai); }
  .medbar { display:inline-flex; margin-left:auto; border:1px solid var(--hair-2); border-radius:var(--r);
    overflow:hidden; background:var(--paper); flex:none; }
  .medbar button { border:0; background:none; font:var(--t-micro) var(--mono); color:var(--ink-3);
    padding:4px 11px; cursor:pointer; }
  .medbar button + button { border-left:1px solid var(--hair); }
  .medbar button:hover { color:var(--ink); }
  .medbar button.on { background:var(--wash); color:var(--ink); font-weight:500; }
  /* Task 13 — the play-speed DROPDOWN (replacing Task 11's cycle button): a native <select>,
     0.25× · 0.5× · 1× · 1.5× · 2× · 4×, mono, session-scoped (never stored) — the keyboard reaches
     it for free. ONE per reader since 2026-08-28, in the reader bar: it paces the schematic and the
     proof media together. ink-3 on paper 6.42:1, hover/focus ink. */
  .pspdwrap { position:relative; display:inline-flex; flex:none; }
  select.pspd { appearance:none; -webkit-appearance:none;
    border:1px solid var(--hair-2); border-radius:var(--r-sm); background:var(--paper);
    color:var(--ink-3); font:var(--t-micro) var(--mono); font-weight:500; padding:4px 18px 4px 8px;
    min-width:52px; cursor:pointer; }
  /* the caret (release pass M-6): a select must look like one — a chevron drawn from two borders
     in --ink-4 (5.18:1 on paper, non-text ≥ 3:1), tokens only (a data-URI could not read a var) */
  .pspdwrap::after { content:''; position:absolute; right:7px; top:calc(50% - 4px); width:5px; height:5px;
    border-right:1.5px solid var(--ink-4); border-bottom:1.5px solid var(--ink-4); transform:rotate(45deg);
    pointer-events:none; }
  .pspdwrap:hover::after { border-color:var(--ink); }
  .fmbody { position:relative; }
  .fmpanel[hidden] { display:none; }
  /* stills: the harvested frame pair, the per-beat filmstrip — or the run's proof-frame strip (the
     merged R14 surface): fixed-width .rf cells, the strip scrolling sideways when they overflow */
  .fmpanel .fstrip { display:flex; gap:var(--s2); padding:var(--s3); overflow-x:auto;
    overscroll-behavior-x:contain; }
  .fstrip .fcell.rf { flex:0 0 300px; }
  .fstrip .fcell { flex:1 1 0; min-width:0; border:1px solid var(--hair); border-radius:var(--r-sm);
    overflow:hidden; background:var(--paper); }
  /* Task 16 #3 (the human, 2026-08-24): in the FILMSTRIP every cell is fixed — the plain given
     cell was flex:1 1 0 and the fixed .rf cells crushed it to a ~2px sliver; same sizing for all,
     so the strip overflows honestly and overflow-x:auto scrolls through every cell */
  .fstrip.filmstrip .fcell { flex:0 0 300px; }
  /* Task 15 (the human, 2026-08-24): the before/after PAIR (no .rf cells — buildMedia marks the
     run-frame strip .filmstrip) STACKS to full pane width, so each frame reads large in the tall
     pane instead of half-width in a wide one. 39vh ≈ 46% of the Focus pane at the 900-tall daily
     viewport — full-width frames at 1440×900 stay uncapped (351px natural < 39vh), and on shorter
     viewports the cap letterboxes (object-fit) rather than distorts. The filmstrip keeps its row. */
  .fstrip:not(.filmstrip) { flex-direction:column; }
  .fstrip:not(.filmstrip) .fcell { flex:none; }
  .fstrip:not(.filmstrip) .fcell img { max-height:39vh; object-fit:contain; }
  .fstrip .fcell img { display:block; width:100%; height:auto; border-bottom:1px solid var(--hair); cursor:zoom-in; }
  .fstrip .fcap { display:flex; align-items:center; gap:6px; font:var(--t-micro) var(--mono); color:var(--ink-3);
    padding:4px 7px; background:var(--wash); }
  .fstrip .fcell.hot { border-color:var(--koke-line); }
  .fstrip .fcell.hotbad { border-color:var(--bengara); }
  .fstrip .fcell.hotbad .fcap { color:var(--bengara); }
  /* the failing check's expected-vs-actual, straight off the covering test's recorded error */
  .fmpanel .xva { border:1px solid var(--bengara-line); background:var(--bengara-tint);
    border-radius:var(--r-sm); margin:0 var(--s3) var(--s3); padding:var(--s2) var(--s3);
    font:var(--t-xs)/1.7 var(--mono); color:var(--ink-2); white-space:pre-wrap; }
  /* the FRAME-STEPPER (Task 13): the harvested frames stacked, one on show, over a slim bar of
     EXACT dots + the mono n / N count. Dot states carry a non-hue mark beside the hue (current = ai
     fill + offset ring, seen = ink-4 fill, upcoming = hollow ink-4 ring), and the count spells the
     position out — hue never alone. Scoped to the stepper's own classes since the per-beat split
     (2026-08-28): it plays inside a proof CELL now, not only inside a media panel. */
  /* THE FRAMES CROSS-FADE, they don't hard-cut (the human, 2026-08-31: "make the transition smooth
     <- also apply to proof"). The scenes are STACKED in one grid cell and the on-frame fades up over
     the out-frame — the transition string (duration = SBStepper.cameraDur, cubic-bezier, reduced-
     motion → none) is set inline in aimCamera beside the camera pan, so both ride one glide. */
  .fsteps { display:grid; }
  .fsteps img { grid-area:1 / 1; width:100%; height:auto; cursor:zoom-in; opacity:0; }
  .fsteps img.on { opacity:1; z-index:1; }
  .fstepbar { display:flex; align-items:center; gap:var(--s3); padding:var(--s2) var(--s3);
    border-top:1px solid var(--hair); background:var(--paper); }
  .fstepbar .pdots { display:inline-flex; gap:6px; align-items:center; }
  .fstepbar .pd { width:9px; height:9px; padding:0; border-radius:999px; border:1px solid var(--ink-4);
    background:none; cursor:pointer; flex:none; }
  .fstepbar .pd.seen { background:var(--ink-4); border-color:var(--ink-4); }
  .fstepbar .pd.cur { background:var(--ai); border-color:var(--ai); outline:1px solid var(--ai); outline-offset:2px; }
  /* the author outline above would swallow the UA focus ring on the current dot (I-6) */
  .fstepbar .pd:focus-visible { outline:2px solid var(--ink); outline-offset:3px; }
  .fstepbar .fstepn { margin-left:auto; font:var(--t-micro) var(--mono); color:var(--ink-3); }
  .fmpanel .frecwrap { padding:var(--s3); }
  /* the committed video's honest label (Task 16 #1): whose flow, and where this beat sits in it */
  .fmpanel .fvlab { padding:0 var(--s3) var(--s3); font:var(--t-micro) var(--mono); color:var(--ink-3); }
  /* the per-beat jumps (2026-08-28): the SAME recording, aimed at the beat you are reading — never a
     second cut file, so nothing here can drift from what the video actually shows */
  .fmpanel .fvjumps { display:flex; flex-wrap:wrap; gap:var(--s2); padding:0 var(--s3) var(--s3); }
  /* the pinned-era watermark on a Changed requirement — the media is the LAST proof's, honestly aged */
  .fmbody .wmark { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    background:rgba(253,252,249,.55); z-index:5; pointer-events:none; }
  .fmbody .wmark span { font-size:var(--t-xs); color:var(--ai); background:var(--ai-tint);
    border:1px solid var(--ai-line); border-radius:var(--r-sm); padding:4px 10px; }
  /* the honest empty states — no media is a statement, never an error */
  .fmedia .noev { min-height:150px; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:var(--s2); text-align:center; padding:var(--s4) var(--s5);
    font-size:var(--t-sm); color:var(--ink-3);
    background:repeating-linear-gradient(-45deg, var(--paper), var(--paper) 10px, var(--wash) 10px, var(--wash) 11px); }
  .fmedia .noev b { font-weight:500; color:var(--ink-2); }
  /* #4: the proof label and the actions share the fphead's TOP ROW. Run is always shown; Run in
     background / Logs / Steps fold behind a compact ⋯ menu. The buttons are the MOVED wired per-test
     controls, restyled small here (aligned to the label height) — pills in the row, flat rows in the menu. */
  /* THE PROOF HEADER (the human, 2026-08-25): one row — a small pass/fail/none MARK, the covering
     test's NAME (clipped before the wired controls), then Run + ⋯ — ruled off from the media below.
     No "THE PROOF" label, no "proven by", no unit/flow badge, no "+N more cover it". */
  .feval .fptop { display:flex; align-items:center; gap:var(--s2); min-height:calc(22px * var(--scale));
    padding-bottom:var(--s3); border-bottom:1px solid var(--hair); }
  .feval .fpm { flex:none; font-size:var(--t-sm); line-height:1; }
  .feval .fpm.pass { color:var(--koke); } .feval .fpm.fail { color:var(--bengara); } .feval .fpm.none { color:var(--ink-4); }
  .feval .fpname { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:var(--t-md); font-weight:600; color:var(--ink); }
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
  /* board R15: the divider between the run/log items and the authoring items in the proof ⋯ menu */
  .fmenupop .fmdiv { height:1px; margin:6px 4px; background:var(--hair); }
  /* the requirement's own ⋯ (board R15) rides the reading card's header row at its far edge — the
     title (flex:1) pushes it there; the position counter that once sat here is gone (it lives in the
     pager — R17, the human 2026-08-25). Kept baseline-safe: align-self so the glyph sits on the row. */
  .frmeta .fmenu { flex:none; align-self:center; }
  /* the moved evidence card must NOT wear the source row's hover wash — the reader card has no hover */
  .feval .fev .test.infocus:hover { background:transparent; }

  /* RIGHT — the evidence: proof line, controls, the screenshot strip (larger here), the recording */
  /* (the Task 8 proof LINE — .fplbl "THE PROOF" + .fpby "proven/covered by [unit|flow] <name> +N more
     cover it" — is replaced by the .fptop test-name header above; the human, 2026-08-25.) */
  /* the Changed drift reads on its own note beneath the name row */
  .feval .stalenote { font-size:var(--t-xs); color:var(--ai); background:var(--ai-tint); border:1px solid var(--ai-line);
    border-radius:var(--r-sm); padding:6px 10px; margin-top:var(--s2); }
  .feval .stalenote b { font-weight:500; }
  /* the strip header: <test name> · proves R4 · run <id> — the name clipped before the facts are */
  .fmbar .fmname { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:0 1 auto; }
  .fmbar .fmfacts { flex:none; white-space:nowrap; }
  .fpv.pass { color:var(--koke); } .fpv.fail { color:var(--bengara); } .fpv.none { color:var(--ink-4); }
  .fpnone { flex:1 1 auto; min-width:0; font:var(--t-sm) var(--mono); color:var(--ink-3); }
  /* Task 15: the PROOF recording fills its pane (the pane is wide since 0.29.1). Scoped to
     .frecwrap on purpose — the global .rec (the test rows' 300px cover) must not blow up. */
  .frecwrap .rec { width:100%; max-width:none; }
  .frecwrap .rec.playing { width:100%; }
  /* THE FULL-FLOW VIDEO KEEPS ITS OWN RATIO (the human, 2026-08-28). The global .rec is a 16:9 cover
     tile with an ink ground, and a 16:10 recording contained inside it wore black bars on two sides
     while a max-height squeezed it into a strip. The evidence player is not a tile: it drops the
     fixed aspect and the ground, takes the width it is given, and lets its height follow the file's
     own ratio — no bars, no strip. Width-capped so a 1700px reader does not hand it the whole page.
     Scoped to .evrec so the test rows' 300px covers are untouched. */
  .fmpanel .frecwrap .rec.evrec { aspect-ratio:auto; max-height:none; height:auto;
    width:min(100%, calc(900px * var(--scale))); background:none; border:0; border-radius:0; }
  .fmpanel .frecwrap .rec.evrec video { position:static; width:100%; height:auto;
    background:none; border:1px solid var(--hair-2); border-radius:var(--r); }
  /* the moved test node, flattened inside .feval: header/steps/log hidden (the proof line is the
     header; the steps show as a clone on the LEFT); its controls a plain row, its frames the strip. */
  .fev { min-width:0; }
  .fev .test, .fev .test:last-child { border-bottom:0; }
  .fev .test.infocus { border:0; }
  .fev .test.infocus > .th { display:none; }
  .fev .test.infocus > .tbody { display:block; padding:0; }
  .fev .test.infocus .trow2 { display:none; }               /* the rec and every control are relocated out of it */
  .fev .test.infocus .fold, .fev .test.infocus .tstlog { display:none; }
  /* R14 as signed 2026-08-22: the media pane's STILLS are the one strip surface in the focus card —
     the moved test node's own strip folds away here (it stays whole on the node, and shows wherever
     the test row itself is read: the pane, the Steps window, a future test view) */
  .fev .test.infocus .pfstrip { display:none; }

  /* the pager rides a compact, full-width FOOTER BAR (board R13) — its own surface (paper on the canvas
     page) with a hairline and a soft top shadow, so the number row reads as a distinct strip rather
     than floating on the background. Short, and its dots vertically centred. Focus-only (hidden else). */
  .dtfoot { flex:none; display:flex; align-items:center; justify-content:center; padding:var(--s4) var(--s5);
    background:var(--paper); border-top:1px solid var(--hair); box-shadow:0 -2px 8px rgba(28,27,24,.05); }
  .dtfoot[hidden] { display:none; }
  /* Task 8 — the mockup's pager: 30px round pages with no border at rest (a hairline on hover), and
     the "← → to review one by one" hint at the right (--ink-3 on --paper 6.4:1). The mockup INVERTS
     the current page in sumi; the detail already spends its one inverted element on Run all (the
     design system: exactly one per screen), so the current page wears a solid ink RING and a bold
     number instead — a divergence listed for the human in the Task 8 report.
     Task 10 (board R17, the human 2026-08-23) — THE PAGER IS THE MAP: every requirement is a dot,
     grouped under an inline family label (n · name, mono uppercase eyebrow, the name in ink) with a
     hair tick between families; each dot wears its requirement's MARK as a small badge at its
     shoulder in the state's hue (hue never alone — the glyph is the card's), a failed dot also on
     the bengara tint; the requirement's title rises as a bubble on hover and keyboard focus. The
     bar wraps at narrow widths, the hint staying at the right.
     WCAG AA, measured against spec/_design.css (text on its background, rest and hover):
       number --ink-2 on --paper 9.48 · on --wash 7.80 (hover) · on --bengara-tint 8.08 (failed);
       the current (ink) number on --bengara-tint 14.30
       label --ink-3 on --paper 6.42 · name --ink on --paper 16.79
       marks on --paper (the badge's own ground, rest and hover): --koke 7.05 · --ai 8.98 ·
       --bengara 6.46 · --yamabuki 5.23 · --ink-4 5.18 (the worst pair)
       the bubble, --paper on --ink 16.79 (the inverse pair) */
  .fpager { flex:none; display:flex; align-items:center; justify-content:center; gap:var(--s1); width:100%; }
  .fnav { flex:none; min-width:30px; height:30px; border-radius:999px; border:1px solid transparent; background:none;
    color:var(--ink-2); font:var(--t-sm) var(--mono); line-height:1; cursor:pointer; }
  .fnav:hover { border-color:var(--hair-2); }
  .fnav:disabled { opacity:.35; cursor:default; }
  /* the dots stay on ONE row (the human, 2026-08-25 — the wrapped two-line strip read as a second
     pager): a single nowrap strip that shrinks to the space between the arrows and, only if the
     families are too wide to fit even then, scrolls sideways rather than wrapping. flex:0 1 auto so
     it sizes to its content when it fits (the bar's justify-content:center keeps it centred) and
     shrinks with an internal scroll when it does not — both ends stay reachable (no centre-clip). */
  .fdots { flex:0 1 auto; display:flex; gap:6px; flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start;
    align-items:center; min-width:0; scrollbar-width:thin; }
  /* one group per family: its label, then its dots */
  .ffam { display:inline-flex; align-items:center; gap:5px; padding:0 var(--s1); }
  .ffl { font:var(--t-micro) var(--mono); letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3);
    white-space:nowrap; margin-right:2px; }
  .ffl b { color:var(--ink); font-weight:500; }
  /* inline-flex + padding:0 so a two-digit number (10–17) sits dead-centre like a single digit does */
  .fdot { position:relative; min-width:30px; height:30px; border-radius:999px; border:1px solid var(--hair-2); background:none;
    color:var(--ink-2); font:var(--t-sm) var(--mono); flex:none; padding:0 4px; cursor:pointer;
    display:inline-flex; align-items:center; justify-content:center;
    transition:box-shadow .15s ease, border-color .15s ease, background-color .15s ease; }
  .fdot:hover { background:var(--wash); }
  /* the dot WEARS its state as a hue (R17, the human 2026-08-25): the shoulder ✓/✗ badge is gone —
     each derived state paints the whole dot (a strong-hue border + number over the state's tint
     fill), so the map reads its states by colour at a glance and stays one clean row. Hue-never-alone
     is met by the state's WORD in the hover/focus title (a human-approved exception for this dense
     map — the row/card chips keep their glyphs). Untested stays the neutral resting dot (base rule).
     Measured on the tint fills: koke 6.06 · bengara 5.50 · yamabuki 4.64 · ai 7.62 — all ≥ AA 4.5. */
  .fdot[data-status="passed"] { border-color:var(--koke); background:var(--koke-tint); color:var(--koke); }
  .fdot[data-status="changed"] { border-color:var(--ai); background:var(--ai-tint); color:var(--ai); }
  .fdot[data-status="failed"] { border-color:var(--bengara); background:var(--bengara-tint); color:var(--bengara); }
  .fdot[data-status="not-reached"] { border-color:var(--yamabuki); background:var(--yamabuki-tint); color:var(--yamabuki); }
  .fdot[data-status="passed"]:hover { background:var(--koke-tint); }
  .fdot[data-status="changed"]:hover { background:var(--ai-tint); }
  .fdot[data-status="failed"]:hover { background:var(--bengara-tint); }
  .fdot[data-status="not-reached"]:hover { background:var(--yamabuki-tint); }
  .fpk { color:var(--ink-3); font-size:var(--t-xs); margin-left:var(--s3); white-space:nowrap; flex:none; }
  /* the thin tick between two FAMILIES' groups (board R17) — a hair rule, inert */
  .fdotfam { flex:none; align-self:center; width:1px; height:22px; background:var(--hair-2); margin:0 var(--s1); }
  /* the CURRENT dot — no offset outline ring (harsh). It lifts instead: an integral ink ring, a bold
     number, so "you are here" reads cleanly whatever the dot's state. Kept z-index so the ringed
     dot sits over its neighbours; .cur is LAST so it wins the border. */
  .fdot.cur, .fdot.cur[data-status] { border-color:var(--ink); color:var(--ink); background:none; font-weight:500;
    box-shadow:inset 0 0 0 1px var(--ink); position:relative; z-index:1; }
  /* the TITLE BUBBLE — the requirement's id, title and state, one hover (or one keyboard focus) away;
     drawn from the dot's title attr so the two can never disagree. Hidden at rest, never in the flow. */
  .fdot::after { content:attr(title); position:absolute; bottom:calc(100% + 9px); left:50%; transform:translateX(-50%);
    background:var(--ink); color:var(--paper); font:var(--t-xs)/1.3 var(--sans); font-weight:400; letter-spacing:0;
    padding:5px 9px; border-radius:var(--r-sm); white-space:nowrap; pointer-events:none;
    visibility:hidden; opacity:0; transition:opacity .12s ease; z-index:3; }
  .fdot::before { content:''; position:absolute; bottom:calc(100% + 4px); left:50%; transform:translateX(-50%);
    border:5px solid transparent; border-top-color:var(--ink); border-bottom:0; pointer-events:none;
    visibility:hidden; opacity:0; transition:opacity .12s ease; z-index:3; }
  .fdot:hover::after, .fdot:focus-visible::after, .fdot:hover::before, .fdot:focus-visible::before { visibility:visible; opacity:1; }
  .fdot:focus-visible { outline:none; border-color:var(--ink); }

  /* the view TOGGLE in the detail header — Focus / Grid / Flow (board R13) */
  .viewseg { display:inline-flex; border:1px solid var(--hair-2); border-radius:999px; overflow:hidden; }
  .viewseg .vseg { font:inherit; font-size:var(--t-sm); padding:0 16px; border:0; background:transparent;
    color:var(--ink-3); cursor:pointer; letter-spacing:.02em; display:inline-flex; align-items:center; }
  .viewseg .vseg + .vseg { border-left:1px solid var(--hair-2); }
  .viewseg .vseg.on { background:var(--wash); color:var(--ink); font-weight:500; }
  /* Run all, the toggle and Close are ONE control family in the detail header (board R13, matching the
     focus mockup): the same 34px height and the same pill radius. Run all stays the one inverted
     element; Close is an outline; the toggle segments. Scoped to .dth so no other .btn is reshaped. */
  .dth .btn { height:calc(34px * var(--scale)); border-radius:999px; padding:0 17px; }
  .dth .viewseg { height:calc(34px * var(--scale)); }

  /* the LIST view (board R13, the frozen mockup — Grid became List, 2026-08-21; router key stays
     'grid'): one collapsed CARD per requirement, a gap-summary strip above, and an open card's body
     is the Focus body itself (client-built). The container scrolls on its OWN — the page never does
     (R2's principle). Every text/background pair this block introduces, RE-MEASURED numerically at
     both states (fix round 1, 2026-08-22 — two of these failed AA on the original --wash hover:
     .lpf.not-reached #8a6412 measured 4.31:1, .lpf.untested/.lkind #6e6b64 measured 4.27:1, both
     under the 4.5:1 floor). Rather than reassign a status hue (hue names the state — it cannot move
     to fix contrast) the hover background moved from --wash to --canvas, the app's own page
     background one step lighter — every pair already used on --card clears 4.5:1 on --canvas too:
     --koke 7.05/6.42, --bengara 6.46/5.87, --yamabuki 5.23/4.76, --ink-4 5.18/4.71, --ink-3
     6.42/5.84, --ai 8.98/8.16, --ink 16.79/15.27 (card/canvas). No new colour, no hue reassigned. */
  .gridview { display:flex; flex-direction:column; gap:var(--s3); width:100%; max-width:1320px;
    margin:0 auto; overflow-y:auto; min-height:0; flex:1; padding-bottom:var(--s6); }
  .lst-card { background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
    box-shadow:var(--sh-sm); overflow:hidden; flex:none; }
  .lst-head { display:flex; align-items:center; gap:var(--s3); width:100%; padding:var(--s3) var(--s4);
    border:0; background:transparent; cursor:pointer; text-align:left; font:inherit; }
  .lst-head:hover { background:var(--canvas); }
  /* the List's FAMILY header row (board R17) — the same .grp eyebrow as the card, between the cards */
  .lst-fam { flex:none; margin:var(--s3) 0 0; padding:0 var(--s1) 6px; border-bottom:1px solid var(--hair);
    font:var(--t-xs) var(--mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3); }
  .lst-fam:first-child { margin-top:0; }
  .lst-fam .fname { color:var(--ink); font-weight:600; }
  .lst-fam .fgloss { color:var(--ink-3); }
  .lst-head .chev { color:var(--ink-4); font-size:var(--t-micro); flex:none; width:12px; transition:transform .12s; }
  .lst-card.open > .lst-head .chev { transform:rotate(90deg); }
  .lst-head .lid { font:var(--t-sm) var(--mono); color:var(--ink-3); min-width:34px; flex:none; }
  .lst-head .lttl { min-width:0; font-size:var(--t-md); color:var(--ink); font-weight:500;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lst-head .lbeats { flex:none; font:var(--t-micro) var(--mono); color:var(--ink-3);
    border:1px solid var(--hair-2); border-radius:999px; padding:1px 8px; }
  /* the state cell: mark + word (+ the covering test's kind) — hue named per status, mark in the
     text, so status survives greyscale exactly like the chips (design rule: hue never alone) */
  .lst-head .lpf { margin-left:auto; flex:none; font-size:var(--t-xs); white-space:nowrap; }
  .lst-head .lpf.passed { color:var(--koke); }
  .lst-head .lpf.failed { color:var(--bengara); }
  .lst-head .lpf.not-reached { color:var(--yamabuki); }
  .lst-head .lpf.untested { color:var(--ink-4); }
  .lst-head .lpf.changed { color:var(--ai); }
  .lst-head .lpf .lkind { font-family:var(--mono); color:var(--ink-4); }
  .lst-body { border-top:1px solid var(--hair); padding:var(--s4); background:var(--wash); }
  .lst-body[hidden] { display:none; }
  /* an open row hosts the full Focus body — a bounded page so the reading card keeps its OWN
     internal scroll (R2), exactly as in the Focus view. In Focus itself .fpage gets its bound for free
     (flex:1 inside .dt's fixed inset:0 viewport overlay); inline in the list there is no such
     ancestor, so the bound has to be stated directly. A bare 560px was arbitrary and off any
     token/scale (fix round 1, 2026-08-22): clamp() to a viewport fraction instead, so the row
     answers to the actual window rather than a fixed guess, floored/ceilinged so it stays usable on
     a short laptop screen and doesn't balloon on a tall monitor. */
  /* raised with the storyline (2026-08-28): a beat row is three cells tall now, so the old 420/640
     bound showed barely one of them before the card scrolled */
  .lst-body .fpage { height:clamp(480px, 72vh, 780px); }
  /* the gap-summary strip: what is not green, counted, with the add-test handoff (R15) */
  .remind { display:flex; align-items:center; gap:var(--s3); background:var(--card);
    border:1px solid var(--hair-2); border-radius:var(--r-md); padding:var(--s3) var(--s4);
    font-size:var(--t-sm); color:var(--ink-2); flex:none; }
  .remind .rk2 { display:inline-flex; gap:var(--s2); align-items:baseline; }
  .remind b { font-weight:500; }
  .remind .gapdot { color:var(--line3); }
  .remind .gap-failed { color:var(--bengara); }
  .remind .gap-changed { color:var(--ai); }
  .remind .gap-nr { color:var(--yamabuki); }
  .remind .gap-un { color:var(--ink-4); }

  /* the FLOW view (board R13, the frozen mockup 2026-08-22): ONE flow at a time — a selector row
     of pills above, then the SPLIT: the chapter rail LEFT, the player RIGHT, each scrolling on its
     own (R2's principle; neither scrolls the page). Status is hue PLUS a mark, never hue alone:
     ✓ passed (koke) · ✗ failed with its beat (bengara) · ◌ not-reached. Every pair measured for AA
     (Task 3b report): worst in this block is --ink-4 on --canvas 4.71:1; the tinted fail/nr rows
     use --ink-3 for their labels because --ink-4 on --bengara-tint measures 4.41:1. */
  .flowview { display:flex; flex-direction:column; gap:var(--s3); width:100%; max-width:1320px;
    margin:0 auto; flex:1; min-height:0; }
  .flowview[hidden] { display:none; }
  .flowsel { flex:none; display:flex; gap:var(--s2); flex-wrap:wrap; }
  .fsel { display:flex; flex-direction:column; align-items:flex-start; gap:1px; font:inherit;
    border:1px solid var(--hair-2); background:var(--paper); border-radius:var(--r);
    padding:7px 14px; color:var(--ink-2); cursor:pointer; text-align:left; max-width:calc(340px * var(--scale)); }
  .fsel .fsttl { font-size:var(--t-sm); max-width:100%; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; }
  .fsel .fk { font:var(--t-micro) var(--mono); color:var(--ink-3); }
  .fsel:hover { border-color:var(--line3); }
  .fsel.on { border-color:var(--line3); background:var(--wash); color:var(--ink); font-weight:500; }
  .fsel.newflow { border-style:dashed; color:var(--ai); }
  .fsel.newflow .fk { color:var(--ai); }
  .flsplit { flex:1; min-height:0; display:grid; grid-template-columns:calc(390px * var(--scale)) minmax(0,1fr);
    gap:var(--s4); align-items:stretch; }
  /* stacked on a narrow screen, per-pane scroll would trap content — the split scrolls whole.
     Breakpoint computed at emit (base 1080 × --scale): the scaled rail leaves the player ≈500px
     at the emitted edge — it collapses before it overflows. */
  @media (max-width:${bp(1080)}px) {
    .flsplit { grid-template-columns:1fr; overflow-y:auto; }
    .flsplit > .flrail, .flsplit > .flmain { overflow:visible; height:auto; }
  }
  .flrail { overflow-y:auto; overflow-x:hidden; min-height:0; padding:2px; }
  .flmain { overflow-y:auto; min-height:0; }
  .flrailhead { font:var(--t-micro) var(--mono); text-transform:uppercase; letter-spacing:.12em;
    color:var(--ink-4); margin:2px 0 var(--s2); }
  .chstrip { display:flex; flex-direction:column; gap:6px; }
  /* one chapter row — thumbnail · given/beat label · name (with its mark) · requirement chips; the
     row is the scrubber (a real button); a not-reached row is a rendered absence (a div) */
  .ch { display:flex; align-items:center; gap:10px; font:inherit; text-align:left; width:100%;
    border:1px solid transparent; border-radius:var(--r-md); padding:5px 8px; background:none;
    color:var(--ink-2); }
  button.ch { cursor:pointer; }
  button.ch:hover { background:var(--paper); border-color:var(--hair); }
  .ch.cur { border-color:var(--line3); background:var(--paper); box-shadow:var(--sh-sm); } /* the ring */
  .ch.f { background:var(--bengara-tint); border-color:var(--bengara-line); }
  .ch.nr { border:1px dashed var(--yamabuki-line); background:var(--yamabuki-tint); opacity:.8; }
  .ch .thumb { position:relative; width:118px; height:64px; flex:none; border:1px solid var(--hair);
    border-radius:var(--r-sm); overflow:hidden; background:var(--wash); }
  .ch .thumb img { width:100%; height:100%; object-fit:cover; display:block; cursor:zoom-in; }
  .ch .thumb .nothumb { position:absolute; inset:0; display:flex; align-items:center;
    justify-content:center; font:var(--t-micro) var(--mono); color:var(--ink-3); }
  .ch .scrtag { position:absolute; bottom:3px; left:3px; font:var(--t-micro) var(--mono);
    color:var(--ink-3); background:var(--paper); padding:0 4px; border-radius:3px; opacity:.92; }
  .chmeta { min-width:0; flex:1; }
  .chno { font:var(--t-micro) var(--mono); text-transform:uppercase; letter-spacing:.05em;
    color:var(--ink-4); }
  .chno .flt { text-transform:none; letter-spacing:0; color:var(--ink-4); }
  /* AA on the tinted rows: --ink-4 on --bengara-tint is 4.41:1, so their labels step up to ink-3 */
  .ch.f .chno, .ch.nr .chno, .ch.f .chno .flt, .ch.nr .chno .flt { color:var(--ink-3); }
  .chname { font-size:var(--t-sm); font-weight:500; line-height:1.35; color:var(--ink); }
  .chmk { font-weight:600; }
  .ch.p .chmk { color:var(--koke); }
  .ch.f .chmk { color:var(--bengara); }
  .ch.nr .chmk { color:var(--ink-3); }
  /* the failing beat, named on the chapter that stopped the flow (rule 3) */
  .flbeat { font-size:var(--t-xs); line-height:1.4; color:var(--bengara); }
  .flnr { font-size:var(--t-xs); color:var(--ink-3); }
  .flreqs { display:flex; gap:5px; flex-wrap:wrap; margin-top:2px; }
  /* the requirement chips a chapter proves — neutral metadata at rest; the transient INDIGO tint on
     hover is the board's many-to-many coverage cue (it moved here from the retired Columns view's
     row hover). A chip opens that requirement in Focus; an id whose screen has no card is inert. */
  .flreq { font:var(--t-micro) var(--mono); padding:1px 7px; border-radius:var(--r-sm); border:0;
    background:var(--wash); color:var(--ink-3); transition:background .12s, color .12s; }
  button.flreq { cursor:pointer; }
  button.flreq:hover { background:var(--ai-tint); color:var(--ai); }
  .flreq.inert { opacity:.75; }
  /* the player card — slim header, the ONE recording, a single caption line */
  .flowcard { background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
    box-shadow:var(--sh-sm); padding:var(--s4); }
  .flhead { display:flex; align-items:center; gap:var(--s3); margin-bottom:var(--s3); min-width:0; }
  .flttl { font-size:var(--t-md); font-weight:500; color:var(--ink); min-width:0; overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap; }
  .flkind { font:var(--t-micro) var(--mono); color:var(--ink-3); border:1px solid var(--hair-2);
    border-radius:999px; padding:1px 8px; flex:none; }
  .flmeta { font:var(--t-micro) var(--mono); color:var(--ink-4); flex:none; }
  .flnone { font-size:var(--t-sm); color:var(--ink-3); }
  .flplay { position:relative; }
  .flplay video { width:100%; max-height:52vh; background:var(--ink); border-radius:var(--r);
    border:1px solid var(--hair-2); object-fit:contain; display:block; }
  .flplay .noev { min-height:180px; display:flex; align-items:center; justify-content:center;
    text-align:center; font-size:var(--t-sm); color:var(--ink-3); border:1px dashed var(--hair-2);
    border-radius:var(--r);
    background:repeating-linear-gradient(-45deg, var(--paper), var(--paper) 10px, var(--wash) 10px, var(--wash) 11px); }
  .flreplay { position:absolute; top:8px; right:8px; z-index:5; font:var(--t-sm) var(--sans);
    background:var(--paper); border:1px solid var(--hair-2); border-radius:999px; padding:3px 10px;
    color:var(--ink-2); cursor:pointer; opacity:.92; }
  .flreplay:hover { color:var(--ink); border-color:var(--line3); }
  /* the stop banner rides the BOTTOM of the player, and the caption CLEARS while it shows — the
     banner never overlaps the caption (the frozen mockup's rule) */
  .flbanner { position:absolute; left:8px; right:8px; bottom:8px; z-index:7; display:none;
    align-items:center; gap:var(--s2); border-radius:var(--r); padding:8px 12px;
    font-size:var(--t-sm); font-weight:500; }
  .flbanner.show { display:flex; }
  .flbanner.bad { background:var(--bengara-tint); color:var(--bengara); border:1px solid var(--bengara-line); }
  .flbanner.ok { background:var(--koke-tint); color:var(--koke); border:1px solid var(--koke-line); }
  .flbanner.neutral { background:var(--paper); color:var(--ink-2); border:1px solid var(--hair-2); }
  .flbanner .flgo { border:1px solid currentColor; background:none; color:inherit; margin-left:auto;
    border-radius:var(--r); font-size:var(--t-xs); padding:3px 11px; cursor:pointer; flex:none; }
  .flcap { font-size:var(--t-xs); color:var(--ink-3); margin-top:var(--s2); text-align:center;
    min-height:1.4em; }
  /* THE FLOW COMPOSER (board R13 / R15 family; Task 5, the frozen mockup's #/compose view): beats
     are frames, the chain is a rail of frames. Tokens only — every pair measured for AA, resting and
     hover (Task 5 report): worst in this block is --yamabuki on --yamabuki-tint 4.64:1; --ink-4 on
     --paper 5.18, --ink-3 on --wash 5.29, --ink-3 on --ai-tint 5.45, --bengara on --ai-tint 5.48,
     --koke on --koke-tint 6.06, --ai on --ai-tint 7.62. A blocked library row is dimmed by COLOUR
     (ink-4 on paper) and a greyed thumbnail, never by opacity on text — that sinks it under 4.5. */
  .composeview { display:flex; flex-direction:column; gap:var(--s3); width:100%; max-width:1320px;
    margin:0 auto; flex:1; min-height:0; overflow-y:auto; }
  .composeview[hidden] { display:none; }
  .chead { display:flex; align-items:center; gap:var(--s3); flex:none; }
  .chead .chl { display:flex; flex-direction:column; gap:1px; flex:1; min-width:0; }
  .chead .cht { font-size:var(--t-lg); font-weight:600; color:var(--ink); }
  .chead .chs { font:var(--t-xs) var(--mono); color:var(--ink-3); }
  .cseg { display:inline-flex; border:1px solid var(--hair-2); border-radius:var(--r); overflow:hidden; }
  .cseg .cmode { border:0; background:var(--paper); color:var(--ink-3); font:var(--t-xs) var(--sans);
    padding:4px 10px; cursor:pointer; }
  .cseg .cmode.on { background:var(--wash); color:var(--ink); font-weight:500; }
  .cwrap { display:grid; grid-template-columns:calc(340px * var(--scale)) minmax(0,1fr); gap:var(--s4); align-items:start; }
  /* breakpoint computed at emit (base 1000 × --scale): the scaled library rail leaves the chain
     ≈490px at the emitted edge — collapses before overflow */
  @media (max-width:${bp(1000)}px) { .cwrap, .cout { grid-template-columns:1fr; } }
  .cpanel { border:1px solid var(--hair-2); border-radius:var(--r-md); background:var(--paper);
    padding:var(--s3) var(--s4); }
  .cpanel h2 { font-size:var(--t-lg); margin:0; }
  .chd { display:flex; align-items:center; gap:var(--s2); margin-bottom:var(--s2); }
  .chint { margin-left:auto; font:var(--t-micro) var(--mono); color:var(--ink-3); text-align:right; }
  .cgrp { font:var(--t-micro) var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3);
    margin:10px 0 6px; }
  .csearch { width:100%; border:1px solid var(--hair-2); border-radius:var(--r); background:var(--paper);
    padding:5px 10px; font:var(--t-xs)/1.4 var(--sans); color:var(--ink); margin-bottom:4px; }
  .csearch::placeholder { color:var(--ink-3); }
  /* library = "what can I do next?": ready beats bright, blocked beats dimmed by colour with the token
     they need; a still per row for recognition, the before/after pair alternating on hover */
  .lrow { display:flex; align-items:center; gap:9px; padding:4px 8px; border:1px solid transparent;
    border-radius:var(--r); cursor:pointer; }
  .lrow:hover { border-color:var(--ai); background:var(--paper); }
  .lrow.hint { border-color:var(--yamabuki); background:var(--yamabuki-tint); }
  .lrow.dim .lname2 { color:var(--ink-4); }
  .lrow.dim .lthumb { filter:grayscale(1) opacity(.55); }
  .lrow.dim:hover .lthumb { filter:none; }
  .lthumb { width:118px; height:64px; flex:none; border:1px solid var(--hair-2); border-radius:var(--r-sm);
    overflow:hidden; position:relative; background:var(--wash); }
  .lthumb img, .cthumb2 img { width:100%; height:100%; object-fit:cover; object-position:top; display:block; cursor:zoom-in; }
  .lmeta2 { min-width:0; flex:1; }
  .lname2 { font-size:var(--t-xs); line-height:1.3; color:var(--ink); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .lname2 .lfill { color:var(--yamabuki); }
  .lneed { font:var(--t-micro)/1.35 var(--mono); color:var(--yamabuki); margin-top:1px; }
  .lrow.hint .lneed, .lrow.hint .lname2 .lfill { color:var(--yamabuki); }
  .lneed.lmute { color:var(--ink-3); }
  .lrid { font:var(--t-micro) var(--mono); color:var(--ink-3); flex:none; }
  .noscene { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center;
    padding:0 6px; font:var(--t-micro) var(--mono); color:var(--ink-3); }
  .cold2 { border:1px dashed var(--hair-2); border-radius:var(--r); padding:8px 11px; font-size:var(--t-xs);
    color:var(--ink-2); line-height:1.55; }
  .cnamebar { display:flex; align-items:center; gap:var(--s2); margin-bottom:var(--s2); }
  .cnamebar .lbl2 { font:var(--t-micro) var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3); flex:none; }
  .cnamebar input { border:1px solid var(--hair-2); border-radius:var(--r); background:var(--paper); padding:4px 10px;
    font:var(--t-sm)/1.4 var(--sans); color:var(--ink); width:280px; }
  .cnamebar input::placeholder { color:var(--ink-3); }
  /* the chain = ONE RAIL — beats hang off a single line; the segments carry the joint state */
  .csum { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:var(--s3); }
  .schip { font:var(--t-micro) var(--mono); padding:1px 9px; border-radius:999px; border:1px solid var(--hair-2);
    color:var(--ink-2); background:var(--paper); }
  .schip.ok { color:var(--koke); border-color:var(--koke-line); background:var(--koke-tint); }
  .schip.warn { color:var(--yamabuki); border-color:var(--yamabuki-line); background:var(--yamabuki-tint); }
  .vchain { display:flex; flex-direction:column; max-width:calc(640px * var(--scale)); }
  .crow2 { display:flex; align-items:center; gap:10px; border-radius:var(--r); padding:3px 6px 3px 0; }
  .crow2:hover { background:var(--wash); }
  .cdot { width:26px; flex:none; display:flex; justify-content:center; }
  .cdot span { width:9px; height:9px; border-radius:999px; background:var(--koke); box-shadow:0 0 0 2px var(--paper); }
  .crow2.given .cdot span { background:var(--ink-3); }
  .crow2.outline .cdot span { width:8px; height:8px; background:var(--paper); border:2px dashed var(--yamabuki); }
  .crow2.gapb .cdot span { background:var(--yamabuki); }
  .cthumb2 { width:190px; height:102px; flex:none; border:1px solid var(--hair-2); border-radius:var(--r-sm);
    overflow:hidden; position:relative; background:var(--wash); }
  .cmeta2 { min-width:0; flex:1; }
  .cname3 { font-size:var(--t-sm); line-height:1.35; color:var(--ink); }
  .csub3 { font:var(--t-micro) var(--mono); color:var(--ink-3); margin-top:1px; }
  .cchip { font:var(--t-micro) var(--mono); color:var(--ai); border:1px solid var(--ai-line); background:var(--ai-tint);
    border-radius:var(--r-sm); padding:0 6px; flex:none; }
  .cchip.fix { color:var(--ink-3); border-color:var(--hair-2); background:var(--wash); }
  .crow2.outline .cchip { color:var(--yamabuki); border-color:var(--yamabuki-line); background:var(--yamabuki-tint); }
  .vx { border:0; background:none; color:var(--ink-3); cursor:pointer; font-size:var(--t-md); padding:2px 6px; flex:none;
    opacity:0; transition:opacity .15s; }
  .crow2:hover .vx, .vx:focus { opacity:1; }
  .vx:hover { color:var(--bengara); }
  .cconn { display:flex; align-items:center; gap:8px; padding-left:12px; }
  .cconn .seg { width:2px; height:14px; background:var(--koke-line); border-radius:2px; }
  .cconn.gap .seg { height:24px; background:none; border-left:2px dashed var(--yamabuki); width:0; }
  .cconn .jlab { font:var(--t-micro) var(--mono); color:var(--yamabuki); }
  .kc { display:inline-block; font:var(--t-micro) var(--mono); padding:0 5px; border-radius:var(--r-sm);
    background:var(--paper); border:1px solid var(--yamabuki-line); color:var(--yamabuki); }
  .cactions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  /* the two-path button wears the colour of the state it produces — a composed, model-free flow
     (koke outline) or a Claude-authored one (the accent) — never inverted: the detail header's Run
     is this screen's one inverted element */
  .cadd.det { border-color:var(--koke); color:var(--koke); background:var(--koke-tint); }
  .cadd.det:hover { border-color:var(--koke); background:var(--paper); }
  .cadd.ai { border-color:var(--ai); color:var(--ai); background:var(--ai-tint); }
  .cadd.ai:hover { border-color:var(--ai); background:var(--paper); }
  .cadd:disabled { color:var(--ink-3); border-color:var(--hair-2); background:var(--paper); cursor:default; }
  .linkbtn.ctog { border:0; background:none; color:var(--ai); font-size:var(--t-xs); cursor:pointer; text-decoration:underline; padding:0; }
  .cwhy { font:var(--t-micro) var(--mono); color:var(--ink-3); }
  /* the hand-off job — the board's own detached claude runner (Scan/Rewrite family), or the emitter */
  .cjob { border:1px solid var(--ai-line); border-radius:var(--r-md); background:var(--ai-tint); padding:10px 14px; margin-top:var(--s3); }
  .cjob .cjhead { font:var(--t-micro) var(--mono); color:var(--ai); letter-spacing:.08em; text-transform:uppercase; margin-bottom:6px; }
  .cjstep { font:var(--t-xs)/1.7 var(--mono); color:var(--ai); display:flex; gap:7px; align-items:baseline; }
  .cjstep.run { color:var(--ink-2); }
  .cjstep.bad { color:var(--bengara); }
  .cjstep a { color:var(--ai); font-weight:500; }
  .cout { display:grid; grid-template-columns:minmax(0,1fr) calc(300px * var(--scale)); gap:var(--s4); margin-top:var(--s3); align-items:start; }
  .cprompt { border:1px solid var(--hair-2); border-radius:var(--r-md); background:var(--paper); overflow:hidden; margin-top:10px; }
  .cprompt[hidden] { display:none; }
  .cprompt .ph2 { display:flex; align-items:center; gap:var(--s2); padding:7px 12px; border-bottom:1px solid var(--hair-2);
    background:var(--wash); font:var(--t-micro) var(--mono); color:var(--ink-2); }
  .cprompt pre { margin:0; padding:10px 14px; font:var(--t-xs)/1.65 var(--mono); color:var(--ink-2); white-space:pre-wrap; max-height:260px; overflow:auto; }
  .chonest { border:1px solid var(--hair-2); border-radius:var(--r-md); background:var(--wash); padding:10px 14px;
    font-size:var(--t-xs); color:var(--ink-2); line-height:1.6; }
  /* the honest empty state — no flows is a statement with a next move, never a blank pane */
  .flempty { text-align:center; padding:64px 20px; color:var(--ink-3); }
  .flempty h3 { font-size:var(--t-lg); font-weight:600; color:var(--ink-2); margin:0 0 4px; }
  .flempty p { font-size:var(--t-sm); margin:0 0 var(--s4); }

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
  .req .h .chip { padding:3px; }
  .req .id { font:var(--t-micro) var(--mono); color:var(--ink-4); width:24px; flex:none; }
  .req .rt { flex:1; font-size:var(--t-md); color:var(--ink); }
  .req .chev { color:var(--ink-4); font-size:var(--t-micro); transition:transform .12s; }
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
  /* hover the item → grey; the WHOLE item highlights (header + expanded body), full-width, and
     fades in/out. (The old req ↔ test blue cross-light — .hot — left with the Columns view,
     2026-08-18: these rows are the hidden shared source now, and the many-to-many cue lives on
     Focus's proof line and the Flow chapters' requirement chips.) */
  .test:hover { background:var(--wash); }
  .throw .chev { color:var(--ink-4); font-size:var(--t-micro); transition:transform .12s; flex:none; }
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
  /* coverage refs — quiet, NEUTRAL metadata. (Their indigo hover tint retired with the Columns
     view, 2026-08-18 — these rows are hidden source now, and the transient indigo coverage cue
     lives on the Flow chapters' .flreq chips above; still a link, never a status.) */
  .tag { font:var(--t-micro) var(--mono); padding:1px 7px; border-radius:var(--r-sm);
    background:var(--wash); color:var(--ink-3); }
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
    width:calc(720px * var(--scale)); max-width:calc(100vw - 48px); max-height:80vh;
    background:var(--card); border:1px solid var(--hair-2); border-radius:var(--r-lg);
    box-shadow:var(--sh-lg); display:flex; flex-direction:column; overflow:hidden; }
  .sheet .bh { display:flex; align-items:center; gap:var(--s3); padding:var(--s3) var(--s4);
    border-bottom:1px solid var(--hair); }
  .sheet .bh strong { font-size:var(--t-md); }
  .sheet .bb { padding:var(--s4); overflow:auto; }
  .sheet .bb:empty:before { content:"No runs recorded for this test yet."; color:var(--ink-4); font-size:var(--t-sm); }
  /* the prompt window (board R15): the requirement PICKER as toggle chips (shown only for the test
     prompts — empty hides itself), then the READ-ONLY prompt. Existing token pairs throughout:
     the chip wears the .tag mono sizing, its .on state the .viewseg wash+ink pair (AA-measured). */
  #promptpick { display:flex; flex-wrap:wrap; gap:var(--s2); margin-bottom:var(--s3); }
  #promptpick:empty { display:none; }
  #promptpick .pmchip { font:var(--t-micro) var(--mono); padding:3px 10px; border-radius:999px;
    border:1px solid var(--hair-2); background:var(--paper); color:var(--ink-3); cursor:pointer; }
  #promptpick .pmchip:hover { color:var(--ink); }
  #promptpick .pmchip.on { background:var(--wash); color:var(--ink); font-weight:500; }
  #promptbody { font-family:var(--mono); font-size:var(--t-xs); color:var(--ink-2); background:var(--paper);
    border:1px solid var(--hair); border-radius:var(--r); padding:var(--s3);
    white-space:pre-wrap; word-break:break-word; margin:0; max-width:100%; overflow-x:auto; }
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
  .beat .bchev { flex:none; color:var(--ink-4); font-size:var(--t-micro); }
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
  .lbcap { color:var(--canvas); font-size:var(--t-sm); }
  .lbbar .btn { background:transparent; border-color:rgba(255,255,255,.35); color:var(--canvas); }
  .lbbar .btn:hover { border-color:var(--canvas); }
  /* Task 15: the zoom is NEAR-FULLSCREEN — the frame is drawn across the whole stage (contained,
     never cropped or distorted), not left at its native size in the middle of it. (Harvest was
     640px when this shipped; Task 16 #2 raised it to 1280px, so the upscale is now mild.) */
  .lbstage { flex:1; overflow:auto; display:flex; align-items:flex-start;
    justify-content:center; padding:var(--s3); cursor:zoom-out; }
  .lbstage img { width:100%; height:100%; object-fit:contain;
    background:var(--paper); box-shadow:var(--sh-lg); }
  .lbstage.actual { align-items:flex-start; }
  /* the Actual-size escape hatch keeps native pixels */
  .lbstage.actual img { width:auto; height:auto; max-width:none; max-height:none; }

  .runpanel { position:fixed; right:var(--s5); bottom:var(--s5); z-index:70; width:calc(600px * var(--scale));
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
  <span class="crumb" data-project="${esc(ident.name)}">${esc(ident.crumb)}</span>
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
  ${screens.length ? (failing || changed ? `<div class="clear attn">
    <span class="qk">${failing + changed} need a look</span>
    <span class="qt">${[
      failing ? `<b class="st-bad">${failing} failed</b>` : '',
      changed ? `<b class="st-changed">${changed} changed since their proof</b>` : ''
    ].filter(Boolean).join(' · ')} — the honest drift, computed from the runs. <a class="qopen" href="#/${esc(attn0.s.name)}/${esc(attn0.r.id)}">Open ${esc(attn0.r.id)} →</a></span>
  </div>` : `<div class="clear">
    <span class="chip ok"><span class="dot"></span>nothing failing</span>
    All requirements are proven or untested — nothing is failing.
  </div>`) : ''}
  ${featStrip}
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
${howView(ctaAction, ci)}

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

<!-- The prompt-handoff window (board R15): every ⋯ authoring action opens a READY Claude prompt
     here — the screen, the exact file, the target and the kg-e2e discipline, with a requirement
     picker for the test prompts. The board writes NO file: the prompt is a read-only pre and the
     Copy button (the shared [data-copy] handler) hands it to the human. -->
<div class="sheet" id="promptsheet">
  <div class="box">
    <div class="bh"><strong id="prompttitle">Prompt</strong><span class="grow"></span>
      <button class="btn sm" data-copy="promptbody">Copy</button>
      <button class="btn sm" data-promptclose>Close</button></div>
    <div class="bb"><div id="promptpick"></div><pre id="promptbody"></pre></div>
  </div>
</div>
${detail}

<script>window.__BOARD__ = ${islandJson(BOARD_DATA)}</script>
<script>${stepperJs}</script>
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
