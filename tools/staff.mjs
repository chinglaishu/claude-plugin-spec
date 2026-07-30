// The staff briefing. An agent about to change a screen runs this FIRST, and it prints what governs
// that screen — the requirements that are the source of truth, each one proven / reworded / unproven,
// whether they are accepted or still a crawl guess, what a test actually proves, and any contradiction
// the human has not yet settled. A board nobody consults before coding is an expensive lint; this is
// the half that makes an AI MAINTAIN the truth rather than just display it.
//
//   node tools/staff.mjs                 — every screen, one line each: what governs it, what is open
//   node tools/staff.mjs <screen>        — the full briefing for one screen
//   node tools/staff.mjs --file <path>   — which screen(s) govern a source file (needs `governs:` in a PRD)
//   node tools/staff.mjs --stale         — the AFTER-a-change worklist: every screen a change left un-settled

import { allScreens, readScreen, readConflicts, isWaiting } from './spec-store.mjs'

// A requirement's computed state (spec-store derives it; it is never typed). Proven needs a CURRENT
// passing test that TAGS the requirement on an assertion that would fail without it. Reworded (text
// moved since it was accepted) wins over any proof and is the one thing waiting on a person.
const stateMark = { proven: '✓', reworded: '✎', unproven: '·' }
const stateWord = {
  proven: 'proven — a current passing test asserts it',
  reworded: 'REWORDED — changed since accepted; re-accept it (the human gate)',
  unproven: 'unproven — no passing assertion covers it yet'
}
const countBy = (reqs, st) => reqs.filter(r => r.state === st).length

// Why the accept gate is open, or that it is closed. The ONE human gate is accepting the
// requirements: a crawl guess, any reworded requirement, or a screen never accepted all wait on it.
function gateLine (s) {
  if (!isWaiting(s)) return 'accepted — nothing waiting on you'
  if (s.guess) return 'a crawl GUESS — correct any that are wrong, then accept the requirements'
  const r = countBy(s.reqs, 'reworded')
  if (r) return `${r} requirement${r === 1 ? '' : 's'} reworded since accepted — re-accept the requirements`
  if (!s.state.approvedPrdText) return 'never accepted — accept the requirements to make them canon'
  return 'waiting on you to accept the requirements'
}

// The findings whose either side lives in this screen's PRD. An OPEN one is a stop sign: the agent
// must not pick a side, because picking silently is the disease the whole tool exists to cure.
function conflictsFor (name) {
  const src = `spec/${name}/prd.md`
  return readConflicts().findings.filter(f =>
    String(f.a?.source || '').startsWith(src) || String(f.b?.source || '').startsWith(src))
}

function briefing (name) {
  const s = readScreen(name)
  if (!s) return `No screen "${name}". Run  node tools/staff.mjs  to list them.`
  const L = []
  L.push(`# Staff briefing — ${s.title}  (screen: ${name}${s.route ? `, route ${s.route}` : ''})`)
  L.push(`  spec/${name}/`)
  L.push('')

  // 1 — the requirements, the SSoT, each with its computed proof state
  if (!s.reqs.length) {
    L.push('## ⛔ Ungoverned — no requirement exists for this screen.')
    L.push('STOP. Do not build here. Ask the human for a requirement first — the next person to change')
    L.push('this has no statement of how it should work, and that is where the bug is born.')
  } else {
    L.push(`## Requirements — the source of truth (${s.reqs.length})`)
    if (s.guess) {
      L.push('⚠ These are a GUESS the crawl read off the running page — NOT canon. Correct them, then')
      L.push('  accept the requirements before you trust a word. A requirement read off an implementation')
      L.push('  cannot contradict it, so if the code has a bug, this guess records the bug as intent.')
    }
    for (const r of s.reqs) {
      L.push(`- ${r.id} ${stateMark[r.state] || '·'} ${r.state.padEnd(8)} — ${r.title}`)
      if (r.body) L.push(`    ${r.body.split('\n')[0]}`)
    }
  }
  L.push('')

  // 2 — the one gate, and what the tests prove
  L.push('## Where this screen stands')
  if (s.reqs.length) {
    L.push(`- Requirements: ${countBy(s.reqs, 'proven')} proven · ` +
      `${countBy(s.reqs, 'reworded')} reworded · ${countBy(s.reqs, 'unproven')} unproven`)
  }
  L.push(`- The one gate — accept the requirements: ${gateLine(s)}`)
  L.push(`- Tests: ${s.run
    ? `${s.run.total - s.run.failed} of ${s.run.total} passing` + (s.run.failed ? ' — some FAILING' : '')
    : 'no test has run against this screen yet — nothing is proven'}`)
  L.push('')

  // 3 — conflicts touching this screen
  const cons = conflictsFor(name)
  const open = cons.filter(c => c.status === 'open')
  if (open.length) {
    L.push(`## ⚖ Open contradictions touching this screen — ${open.length}`)
    for (const c of open) {
      L.push(`- ${c.subject}`)
      L.push(`    ${c.a.source}: ${c.a.quote}`)
      L.push(`    ${c.b.source}: ${c.b.quote}`)
    }
    L.push('  DO NOT pick a side. Choosing canon is the human\'s decision — surface it and stop.')
    L.push('')
  }

  // 4 — the rules
  L.push('## Before you change this screen')
  L.push('1. Change the REQUIREMENT first, never the code first. Requirement meaning is the human\'s gate.')
  L.push('2. For new or changed behaviour, write the failing test first and watch it go red — and TAG the')
  L.push('   requirement it proves with checkReq(id, fn) so its proof is assertion-backed.')
  L.push('3. Never weaken a test to go green, and never accept the requirements on the human\'s behalf.')
  if (!s.reqs.length) L.push('4. There is no requirement here — you cannot proceed. Ask the human.')
  else if (s.guess) L.push('4. This PRD is a guess — get the human to correct and accept it before building to it.')
  else if (open.length) L.push('4. There is an open contradiction here — the human must pick canon before you build.')
  return L.join('\n')
}

function list () {
  const screens = allScreens()
  const { findings } = readConflicts()
  const openBy = new Set(findings.filter(f => f.status === 'open')
    .flatMap(f => [f.a?.source, f.b?.source]).map(s => String(s || '').split('/')[1]))
  const L = ['# What governs each screen', '']
  for (const s of screens) {
    const flags = []
    if (!s.reqs.length) flags.push('⛔ UNGOVERNED')
    if (s.guess) flags.push('⚠ guess')
    if (openBy.has(s.name)) flags.push('⚖ open conflict')
    const reworded = countBy(s.reqs, 'reworded')
    if (reworded) flags.push(`${reworded} to re-accept`)
    else if (isWaiting(s) && s.reqs.length) flags.push('requirements to accept')
    const unproven = countBy(s.reqs, 'unproven')
    if (unproven) flags.push(`${unproven} unproven`)
    L.push(`- ${s.name.padEnd(20)} ${String(s.reqs.length).padStart(2)} reqs   ${flags.join(' · ') || 'accepted, all proven'}`)
  }
  L.push('')
  L.push('Run  node tools/staff.mjs <screen>  for the full briefing before you change one.')
  return L.join('\n')
}

// --stale — the worklist you run AFTER a change, where `list()` is what you read before one. A change
// to one screen ripples: it can leave a sibling's PRD contradicting yours, or a sibling's test still
// asserting the old behaviour — a false green. This prints every screen that is not fully SETTLED and
// PROVEN, with the concrete reason for each, so "what did my change break" is a checklist and not a
// hunt. Every line is work; a stale test still asserting old behaviour is a lie the board is telling.
function stale () {
  const screens = allScreens()
  const { findings } = readConflicts()
  const openBy = new Set(findings.filter(f => f.status === 'open')
    .flatMap(f => [f.a?.source, f.b?.source]).map(s => String(s || '').split('/')[1]))
  const rows = []
  for (const s of screens) {
    const why = []
    if (!s.reqs.length) why.push('⛔ ungoverned — no requirement exists; nothing downstream can be trusted')
    if (s.guess) why.push('⚠ PRD is a guess — the human must correct and accept the requirements')
    const reworded = s.reqs.filter(r => r.state === 'reworded')
    if (reworded.length) why.push(`✎ reworded since accepted — ${reworded.map(r => r.id).join(', ')} — re-accept (the human gate)`)
    const unproven = s.reqs.filter(r => r.state === 'unproven')
    if (unproven.length) why.push(`· not proven by a test — ${unproven.map(r => r.id).join(', ')} — write or re-run the test that tags it`)
    if (s.run && s.run.failed) why.push(`✗ ${s.run.failed} test case(s) FAILING`)
    if (openBy.has(s.name)) why.push('⚖ open contradiction touching this screen — the human picks canon, you must not')
    if (why.length) rows.push({ name: s.name, why })
  }
  if (!rows.length) {
    return 'Nothing is stale — every screen is governed, accepted and proven.'
  }
  const L = [`# What your change may have left stale — ${rows.length} screen(s) not settled and proven`, '']
  for (const r of rows) {
    L.push(`- ${r.name}`)
    for (const w of r.why) L.push(`    ${w}`)
  }
  L.push('')
  L.push('Work every item your change left stale — a test still asserting the old behaviour is a false green.')
  L.push('If clearing one needs a requirement decision (picking canon, changing what a REQ means, accepting')
  L.push('the requirements), STOP and ask the human — never decide it yourself.')
  return L.join('\n')
}

// which screens declare they govern a source file, via `governs:` globs in their PRD frontmatter
function byFile (path) {
  const rx = g => new RegExp('^' + g.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$')
  const hits = allScreens().filter(s => (s.governs || []).some(g => rx(g).test(path)))
  if (!hits.length) {
    return `## ⛔ Nothing on the board governs ${path}\n\nNo screen's PRD declares \`governs:\` covering this file. ` +
      'Either add a `governs:` glob to the screen this file implements, or ask the human for a requirement — ' +
      'ungoverned code has no statement of how it should work.'
  }
  return hits.map(s => briefing(s.name)).join('\n\n' + '─'.repeat(70) + '\n\n')
}

const [, , a, b] = process.argv
if (a === '--file') console.log(byFile(b || ''))
else if (a === '--stale') console.log(stale())
else if (a) console.log(briefing(a))
else console.log(list())
