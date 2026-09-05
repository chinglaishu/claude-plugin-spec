// tools/store-import.mjs — ONE-TIME IMPORT of a harvest that predates the store (the data home,
// 2026-09-05/06). It reads the committed fold a project has today — `spec/_results-index.json`,
// `spec/<screen>/evidence/*`, `spec/_runs.json`, `spec/_results.json` — moves every file it names
// into the project's blob store, and writes the fold, the run log and the raw report as rows. No
// project loses its last fold when the storage rule changes under it.
//
// TWO THINGS IT WILL NOT DO.
//   1. It never deletes or modifies anything under the repo. Taking the old files out of git is a
//      separate step a person runs with the plan beside them.
//   2. It never invents. A path that names no file on disk is left exactly as written and reported
//      under `missing`: an entry that lied before lies the same way after, visibly (rule 3).
// And it is idempotent — the same bytes are the same blob and every row is an upsert, so running it
// again after a half-migration changes nothing.
//
// THE RE-KEY (the human's C2 ruling, 2026-09-06). The old index keyed evidence by REQUIREMENT, which
// is how a standalone `spec/init` run could overwrite `board:R1`'s beats. The store keys it by the
// covering TEST. The index already knows who covers what — every test carries its `reqs` — so the
// importer reads that attribution back out. Where a requirement is covered from more than one file,
// the committed bytes belong to the requirement's HOME screen (the precedence rule the old key
// needed), and the other covering files are named in the report's `ambiguous` list rather than
// silently dropped.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore, projectId, isBlobSrc } from './store.mjs'

// A harvest path, not a sentence that happens to start with `spec/`: the index also carries labels
// and log lines like "spec/board/prd.md won · 2026-09-05". A file reference has no spaces and ends
// in an extension — anything else is prose and is left alone (and is not reported as missing, which
// would bury the real misses in noise).
const SPEC = /^spec\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]{1,8}$/

const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

// Which test file owns a requirement's harvest, from the attribution the index already carries.
// Pure: the index's screens → { file, title, others } for one screen's requirement.
export function attributionFor (index, screen, reqId) {
  const qualified = `${screen}:${reqId}`
  const home = `spec/${screen}/test.spec.ts`
  const hits = []
  for (const [s, entry] of Object.entries(index || {})) {
    if (!entry || !Array.isArray(entry.tests)) continue
    for (const t of entry.tests) {
      const reqs = (t && t.reqs) || {}
      if (qualified in reqs || (s === screen && reqId in reqs)) hits.push({ file: `spec/${s}/test.spec.ts`, title: t.title })
    }
  }
  const files = [...new Set(hits.map(h => h.file))]
  const mine = hits.filter(h => h.file === home)
  if (mine.length) return { file: home, title: mine.length === 1 ? mine[0].title : null, others: files.filter(f => f !== home) }
  if (files.length === 1) return { file: files[0], title: hits.length === 1 ? hits[0].title : null, others: [] }
  // nobody covers it, or several files do and none is the home one: key it under the screen's own
  // file (the only stable answer) and say so in the report.
  return { file: home, title: null, others: files, uncertain: true }
}

export async function importHarvest ({ root, home = null, manifest = null, env = process.env, store = null } = {}) {
  const out = { blobs: 0, rewritten: 0, missing: [], screens: [], evidence: 0, runs: 0, report: null, ambiguous: [], projectId: projectId(root, manifest) }
  const idx = readJson(join(root, 'spec/_results-index.json'))
  const runs = readJson(join(root, 'spec/_runs.json'))
  const report = readJson(join(root, 'spec/_results.json'))
  if (!idx && !runs && !report) return out

  const own = !store
  const s = store || await openStore({ root, home, manifest, env })
  const seen = new Set(await s.listBlobs())

  // every repo-relative path under spec/ that names a real file becomes a blob; everything else is
  // left exactly as it is
  const moveOne = async str => {
    if (isBlobSrc(str) || !SPEC.test(str)) return str
    const abs = join(root, str)
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      if (!out.missing.includes(str)) out.missing.push(str)
      return str
    }
    const src = await s.putBlob(readFileSync(abs), extname(abs).slice(1) || 'bin')
    if (!seen.has(src)) { seen.add(src); out.blobs++ }
    out.rewritten++
    return src
  }
  const walk = async v => {
    if (typeof v === 'string') return moveOne(v)
    if (Array.isArray(v)) { const a = []; for (const x of v) a.push(await walk(x)); return a }
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await walk(x); return o }
    return v
  }

  for (const [screen, entry] of Object.entries(idx || {})) {
    if (!entry || typeof entry !== 'object') continue
    const tests = (Array.isArray(entry.tests) ? entry.tests : []).map(t => ({ ...t, file: t.file || `spec/${screen}/test.spec.ts` }))
    await s.putScreen(screen, { total: entry.total, failed: entry.failed, ranAt: entry.ranAt, srcHashes: entry.srcHashes, provenHashes: entry.provenHashes, tests })
    out.screens.push(screen)
    for (const [reqId, ev] of Object.entries(entry.evidence || {})) {
      if (!ev || typeof ev !== 'object') continue
      const { runId = null, at = null, ...rest } = ev
      const who = attributionFor(idx, screen, reqId)
      if (who.others.length) out.ambiguous.push({ screen, reqId, chose: who.file, alsoCoveredBy: who.others })
      await s.putEvidence({ testFile: who.file, screen, reqId, testTitle: who.title, runId, at, entry: await walk(rest) })
      out.evidence++
    }
  }

  let newest = null
  for (const r of (Array.isArray(runs) ? runs : [])) {
    if (!r || !r.runId) continue
    await s.putRun(await walk(r))
    out.runs++
    if (!newest || String(r.at || '') > String(newest.at || '')) newest = r
  }

  // The raw Playwright report is the LAST CLI run's — the file has no run id of its own, so it is
  // filed under the newest run in the log, and under 'legacy' when there is no log to name one.
  if (report) {
    const runId = newest ? String(newest.runId) : 'legacy'
    await s.putReport(runId, report, (newest && newest.at) || new Date().toISOString())
    out.report = runId
  }

  if (own) await s.close()
  return out
}

// CLI: import THIS tree's harvest into its own data home.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || fileURLToPath(new URL('..', import.meta.url)))
  const manifest = readJson(join(root, 'spec/_specboard.json'))
  const r = await importHarvest({ root, manifest })
  console.log(`imported ${root} into the data home of ${r.projectId}: ${r.blobs} new blob(s), ${r.rewritten} path(s) rewritten, ${r.evidence} evidence row(s) across ${r.screens.length} screen(s), ${r.runs} run(s), ${r.missing.length} missing`)
  for (const a of r.ambiguous) console.log(`  also covered · ${a.screen}:${a.reqId} kept under ${a.chose}; also covered by ${a.alsoCoveredBy.join(', ')}`)
  for (const m of r.missing.slice(0, 20)) console.log(`  missing · ${m}`)
}
