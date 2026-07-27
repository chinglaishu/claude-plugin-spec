// The staff briefing. An agent about to change a screen runs this FIRST, and it prints what
// governs that screen — the requirements that are the source of truth, whether they are approved
// or still a guess, which gates are open, what is actually proven, and any contradiction the CEO
// has not yet settled. A board nobody consults before coding is an expensive lint; this is the
// half that makes an AI MAINTAIN the truth rather than just display it.
//
//   node tools/staff.mjs                 — every screen, one line each: what governs it, what is open
//   node tools/staff.mjs <screen>        — the full briefing for one screen
//   node tools/staff.mjs --file <path>   — which screen(s) govern a source file (needs `governs:` in a PRD)

import { allScreens, readScreen, readConflicts } from './spec-store.mjs'

const cellWord = {
  ok: 'approved', stale: 'STALE — the thing it was approved against has moved',
  review: 'needs review — nobody has said yes yet', rejected: 'sent back',
  missing: 'not started', waiting: 'waiting on the step before it',
  pass: 'passing', fail: 'FAILING', unrun: 'never run — proves nothing yet',
  ranstale: 'passed, then the screen was edited — run it again'
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

  // 1 — the requirements, the SSoT
  if (!s.reqs.length) {
    L.push('## ⛔ Ungoverned — no requirement exists for this screen.')
    L.push('STOP. Do not build here. Ask the CEO for a requirement first — the next person to change')
    L.push('this has no statement of how it should work, and that is where the bug is born.')
  } else {
    L.push(`## Requirements — the source of truth (${s.reqs.length})`)
    if (s.guess) {
      L.push('⚠ These are a GUESS the crawl read off the running page — NOT canon. Correct them at')
      L.push('  gate A before you trust a word. A requirement read off an implementation cannot')
      L.push('  contradict it, so if the code has a bug, this guess records the bug as intent.')
    }
    for (const r of s.reqs) {
      L.push(`- ${r.id} — ${r.title}`)
      if (r.body) L.push(`    ${r.body.split('\n')[0]}`)
    }
  }
  L.push('')

  // 2 — the gates and what is proven
  L.push('## Where this screen stands')
  L.push(`- 1 · PRD:    ${cellWord[s.cells.prd] || s.cells.prd}${s.guess ? ' (a guess)' : ''}`)
  L.push(`- 2 · Draft:  ${cellWord[s.cells.draft] || s.cells.draft}` +
    (s.cells.draft === 'ok' ? ` — pinned to prd.md · ${s.state.draftApprovedAgainstPrd}` : ''))
  L.push(`- 3 · Screen: ${cellWord[s.cells.screen] || s.cells.screen}`)
  L.push(`- 4 · E2E:    ${cellWord[s.cells.e2e] || s.cells.e2e}` +
    (s.run ? ` (${s.run.total - s.run.failed}/${s.run.total})` : ''))
  if (s.rejections?.length) {
    L.push(`  last sent back: "${s.rejections[s.rejections.length - 1].why}"`)
  }
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
    L.push('  DO NOT pick a side. Choosing canon is the CEO\'s decision — surface it and stop.')
    L.push('')
  }

  // 4 — the rules
  L.push('## Before you change this screen')
  L.push('1. Change the REQUIREMENT first, never the code first. Requirement meaning is the CEO\'s gate.')
  L.push('2. For new or changed behaviour, write the failing test first and watch it go red.')
  L.push('3. Never weaken a test to go green, and never approve a gate on the CEO\'s behalf.')
  if (!s.reqs.length) L.push('4. There is no requirement here — you cannot proceed. Ask the CEO.')
  else if (s.guess) L.push('4. This PRD is a guess — get the CEO to correct and approve it before building to it.')
  else if (open.length) L.push('4. There is an open contradiction here — the CEO must pick canon before you build.')
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
    if (['review', 'stale', 'rejected'].includes(s.cells.draft)) flags.push('gate A open')
    if (['review', 'stale'].includes(s.cells.screen)) flags.push('gate B open')
    if (['unrun', 'fail', 'ranstale'].includes(s.cells.e2e)) flags.push('not proven')
    L.push(`- ${s.name.padEnd(20)} ${s.reqs.length} reqs   ${flags.join(' · ') || 'governed, approved, proven'}`)
  }
  L.push('')
  L.push('Run  node tools/staff.mjs <screen>  for the full briefing before you change one.')
  return L.join('\n')
}

// which screens declare they govern a source file, via `governs:` globs in their PRD frontmatter
function byFile (path) {
  const rx = g => new RegExp('^' + g.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$')
  const hits = allScreens().filter(s => (s.governs || []).some(g => rx(g).test(path)))
  if (!hits.length) {
    return `## ⛔ Nothing on the board governs ${path}\n\nNo screen's PRD declares \`governs:\` covering this file. ` +
      'Either add a `governs:` glob to the screen this file implements, or ask the CEO for a requirement — ' +
      'ungoverned code has no statement of how it should work.'
  }
  return hits.map(s => briefing(s.name)).join('\n\n' + '─'.repeat(70) + '\n\n')
}

const [, , a, b] = process.argv
if (a === '--file') console.log(byFile(b || ''))
else if (a) console.log(briefing(a))
else console.log(list())
