// Reading spec/<screen>/ — the one place that decides what a screen IS and what state it is in.
//
// The builder and the server both need this. If either recomputed a hash its own way, an
// approval could be written against one value and compared against another, and staleness would
// be quietly wrong — which is the single failure this whole product cannot have.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SPEC = join(ROOT, 'spec')

// Drafts are authored at this size and shown scaled, never re-laid-out.
export const CANVAS_W = 1280
export const CANVAS_H = 940

// Areas group the board so a project with eighty screens is still readable. Order is declared,
// not alphabetical, because the reading order of a product is a decision.
export const AREA_ORDER = ['Core', 'Gates', 'Running', 'Setup']

export const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 12)
export const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Drafts link the shared sheet relatively so they render standalone over http. Embedded as
// srcdoc there is no base URL to resolve against, so it is inlined at build time instead.
// Exported because the BOARD uses it too. The board is one of the screens this tool tracks, so
// it has no business having a second design system — that is the drift this product exists to stop.
export const designCss = () => readFileSync(join(SPEC, '_design.css'), 'utf8')
export const inlineDesign = html =>
  html.replace(/<link[^>]+_design\.css[^>]*>/, `<style>${designCss()}</style>`)

// Frontmatter + `## R1 — title` blocks. Deliberately tiny: the PRD format is a decision we are
// still testing, and a parser with opinions is harder to change than one with none.
export function parsePrd (text) {
  const fm = {}
  let body = text
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (kv) fm[kv[1]] = kv[2].trim()
    }
    body = text.slice(m[0].length)
  }
  const reqs = []
  for (const chunk of body.split(/\n(?=## )/)) {
    const h = chunk.match(/^##\s+(.+)/)
    if (!h) continue
    const [, id, title] = h[1].match(/^(\S+)\s+—\s+(.*)$/) || [null, '', h[1]]
    reqs.push({ id, title, body: chunk.replace(/^##.*\n/, '').trim() })
  }
  return { fm, reqs }
}

// Playwright writes one report for the whole run; the board needs it per screen. Tests live at
// spec/<screen>/test.spec.ts, so the directory IS the screen — no registry to keep in sync.
export function readResults () {
  const p = join(SPEC, '_results.json')
  if (!existsSync(p)) return {}
  let report
  try { report = JSON.parse(readFileSync(p, 'utf8')) } catch { return {} }
  // WHEN the run happened, so a pass can be checked against what has changed since. Columns 2
  // and 3 both go stale when their source moves; column 4 used to stay green forever, which made
  // it the one cell on the board allowed to be confidently out of date.
  const ranAt = statSync(p).mtimeMs
  const byScreen = {}
  const walk = suite => {
    for (const spec of suite.specs || []) {
      const screen = String(suite.file || spec.file || '').split('/')[0]
      if (!screen) continue
      const results = (spec.tests || []).flatMap(t => t.results || [])
      const ok = results.every(r => r.status === 'passed')
      const prev = byScreen[screen]
      byScreen[screen] = {
        total: (prev?.total || 0) + 1,
        failed: (prev?.failed || 0) + (ok ? 0 : 1),
        // the individual tests, so "7 of 7 passing" can be opened and read rather than trusted
        tests: [...(prev?.tests || []), {
          title: spec.title,
          ok,
          ms: Math.round(results.reduce((n, r) => n + (r.duration || 0), 0)),
          error: ok ? null : String(results.find(r => r.error)?.error?.message || '').slice(0, 400),
          line: spec.line
        }]
      }
    }
    for (const s of suite.suites || []) walk({ ...s, file: s.file || suite.file })
  }
  for (const s of report.suites || []) walk(s)
  for (const k of Object.keys(byScreen)) byScreen[k].ranAt = ranAt
  return byScreen
}

// Newest source file for a screen. If anything it proves has changed since the run, the result
// describes a version of this screen that no longer exists.
const newestSource = dir => ['prd.md', 'draft.html', 'test.spec.ts']
  .map(f => join(dir, f))
  .filter(existsSync)
  .reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0)

export const statePath = name => join(SPEC, name, 'state.json')

export function readState (name) {
  const p = statePath(name)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}
}

export function writeState (name, state) {
  writeFileSync(statePath(name), JSON.stringify(state, null, 2) + '\n')
}

export function readScreen (name, results = null) {
  const dir = join(SPEC, name)
  const prdPath = join(dir, 'prd.md')
  if (!existsSync(prdPath)) return null

  const prdText = readFileSync(prdPath, 'utf8')
  const { fm, reqs } = parsePrd(prdText)
  const prdHash = sha(prdText)

  const draftPath = join(dir, 'draft.html')
  const hasDraft = existsSync(draftPath)
  const draftSrc = hasDraft ? readFileSync(draftPath, 'utf8') : ''
  // Hash the file as authored, not as inlined — otherwise every draft goes stale whenever the
  // shared stylesheet is touched, and staleness stops meaning "this design changed".
  const draftHash = hasDraft ? sha(draftSrc) : null

  const hasShot = existsSync(join(dir, 'screen.png'))
  const hasTest = existsSync(join(dir, 'test.spec.ts'))
  const state = readState(name)

  // A cell WAITS when the thing to its left does not exist yet — there is nothing to be stale
  // against. REVIEW and STALE are deliberately not the same: review means nobody has ever said
  // yes to this, stale means they did and the thing it was approved against has since moved.
  // Collapsing them hides which of your gates is a first look and which is a re-look.
  // A rejection is a decision and has to LOOK different from never having looked — otherwise
  // saying no leaves the board identical to saying nothing, and the sentence you typed vanishes.
  // It only holds while the PRD is unchanged: rewrite the requirement and the question is new.
  const rejections = state.draftRejections || (state.draftRejection ? [state.draftRejection] : [])
  const lastRejection = rejections[rejections.length - 1]
  const rejected = lastRejection && lastRejection.againstPrd === prdHash

  const draft = !hasDraft ? 'missing'
    : rejected ? 'rejected'
      : !state.draftApprovedAgainstPrd ? 'review'
        : state.draftApprovedAgainstPrd !== prdHash ? 'stale' : 'ok'

  const screen = !hasDraft ? 'waiting'
    : !hasShot ? 'missing'
      : !state.screenApprovedAgainstDraft ? 'review'
        : state.screenApprovedAgainstDraft !== draftHash ? 'stale' : 'ok'

  // A test that exists but has never run proves nothing, so it is not a pass — it is "never run".
  const run = (results || readResults())[name]
  const ranBeforeEdit = run && run.ranAt < newestSource(dir)
  const e2e = !hasDraft ? 'waiting'
    : !hasTest ? 'missing'
      : !run ? 'unrun'
        : run.failed ? 'fail'
          : ranBeforeEdit ? 'ranstale' : 'pass'

  // What you approved AGAINST, not just its fingerprint. A hash can tell you something moved; it
  // can never tell you what. Gate A asks "is this still what you meant" — unanswerable without
  // the old text to compare, which is why the requirement to highlight only what changed was
  // impossible to satisfy while state.json held a hash alone.
  const approvedReqs = state.approvedPrdText ? parsePrd(state.approvedPrdText).reqs : null
  const byId = list => Object.fromEntries((list || []).map(r => [r.id, r]))
  const wasById = byId(approvedReqs)
  const nowById = byId(reqs)
  const diff = approvedReqs && {
    changed: reqs.filter(r => wasById[r.id] && (wasById[r.id].title !== r.title || wasById[r.id].body !== r.body)).map(r => r.id),
    added: reqs.filter(r => !wasById[r.id]).map(r => r.id),
    removed: approvedReqs.filter(r => !nowById[r.id]).map(r => r.id),
    was: wasById
  }

  return {
    name,
    area: fm.area || 'Other',
    title: fm.title || name,
    route: fm.route || '',
    reqs,
    prdText,
    diff,
    rejections,
    hasShot,
    // cache-bust the img so a re-shot screenshot is never served stale from the last run
    shotHash: hasShot ? sha(String(statSync(join(dir, 'screen.png')).mtimeMs)) : '',
    run,
    prdHash,
    draftHash,
    draftHtml: hasDraft ? inlineDesign(draftSrc) : '',
    state,
    cells: { prd: reqs.length ? 'ok' : 'missing', draft, screen, e2e }
  }
}

export function allScreens () {
  // read the report ONCE for the whole board, not once per screen
  const results = readResults()
  return readdirSync(SPEC)
    .filter(n => !n.startsWith('_') && statSync(join(SPEC, n)).isDirectory())
    .map(n => readScreen(n, results))
    .filter(Boolean)
}

// "Waiting on you" means a gate is open. A screen you already rejected is waiting on the
// REDRAFT, not on you, so it must not sit in your queue asking the same question again.
export const isWaiting = s =>
  // A screen whose PRD is empty is waiting on YOU hardest of all — nothing downstream can start.
  // It used to fall out of the queue entirely, because every other cell correctly reported
  // "waits", and the row sat on the board being silently ignored.
  s.cells.prd === 'missing' ||
  ['review', 'stale'].includes(s.cells.draft) || ['review', 'stale'].includes(s.cells.screen)

export function sortedAreas (screens) {
  return [...new Set(screens.map(s => s.area))].sort((a, b) => {
    const ai = AREA_ORDER.indexOf(a); const bi = AREA_ORDER.indexOf(b)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b)
  })
}
