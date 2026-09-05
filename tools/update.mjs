// Bring a scaffolded project's vendored specboard code up to a new release — safely. The scaffold
// only ever skipped-or-forced; this compares three hashes per file (what was shipped, what the
// project has now, what the new release carries) and does the right, reversible thing with each:
// update the untouched, leave the unchanged, and for a file you have edited that ALSO changed
// upstream, keep yours and drop the new one alongside as <file>.new for a human to merge. It never
// loses an edit and never silently ships stale code.
//
//   node <plugin>/tools/update.mjs [targetDir] [--from-dir <baseReleaseDir>] [--dry-run]
//
// The base-of-record is the project's spec/_specboard.json (written by scaffold/update). A project
// scaffolded before manifests existed has none — the caller passes --from-dir pointing at the
// release it came from, and this writes the manifest so the next update needs no guessing.

import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FILES, DEPS, SPEC_IGNORE, boardIgnoreLines, MANIFEST, POINTER, hashFile, readVersion, buildManifest, mergeManifest, resolveProject } from './_skeleton.mjs'

// Pure decision + file effects, so it can be proven against throwaway dirs. `base` is the shipped
// manifest ({version, files}) or null; `files` is the set to walk (the real skeleton by default).
export function updateProject ({ dest, src, base, files = FILES, dryRun = false }) {
  const version = readVersion(src)
  const baseVer = base?.version ?? 'unknown'
  const report = { added: [], updated: [], upToDate: [], skipped: [], conflicts: [], deps: [], ignores: [], hasConflicts: false }
  const newFiles = { ...(base?.files || {}) }
  const ops = [] // deferred, so a dry run computes the plan and writes nothing

  const backup = (rel) => {
    const to = join(dest, `.specboard-backup-${baseVer}`, rel)
    ops.push(() => { mkdirSync(dirname(to), { recursive: true }); cpSync(join(dest, rel), to) })
  }
  const install = (rel) => ops.push(() => {
    const to = join(dest, rel); mkdirSync(dirname(to), { recursive: true }); cpSync(join(src, rel), to)
  })

  for (const rel of files) {
    const inc = hashFile(join(src, rel))
    if (inc === null) continue // not part of this release
    const cur = hashFile(join(dest, rel))
    const shipped = base?.files?.[rel] ?? null

    if (cur === null) {                       // ADD — a file this release introduces
      report.added.push(rel); newFiles[rel] = inc; install(rel)
    } else if (cur === inc) {                 // already the new version
      report.upToDate.push(rel); newFiles[rel] = inc
    } else if (shipped !== null && inc === shipped) {  // unchanged upstream, so a local edit stands
      report.skipped.push(rel)
    } else if (cur === shipped) {             // untouched from base — safe to overwrite
      report.updated.push(rel); newFiles[rel] = inc; backup(rel); install(rel)
    } else {                                  // edited AND changed upstream — keep yours, drop .new
      report.conflicts.push({ file: rel, new: rel + '.new' })
      if (shipped !== null) newFiles[rel] = shipped // still on the old base until merged
      else delete newFiles[rel]
      backup(rel)
      ops.push(() => cpSync(join(src, rel), join(dest, rel + '.new')))
    }
  }

  // THE STORE'S DEPENDENCIES (the data home, 2026-09-06). The vendored code is only half of what a
  // board needs to open its store: better-sqlite3 is the default db driver and pg the team's, and a
  // project that gained tools/store*.mjs without them throws on its first read of the fold. The
  // scaffold puts them in a NEW project's package.json; an existing board is only ever UPDATED, so
  // the update has to install them too. The release's pins win for these two — they are part of the
  // vendored code's contract, and a native module resolving to a build specboard is not tested
  // against is the failure, not the safeguard. Nothing else in package.json is touched, and a
  // directory with no package.json is not a scaffolded project: it is left exactly as it is.
  const pkgPath = join(dest, 'package.json')
  if (existsSync(pkgPath)) {
    let pkg = null
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch { pkg = null }
    if (pkg) {
      const missing = Object.keys(DEPS).filter(k => !pkg.dependencies || pkg.dependencies[k] !== DEPS[k])
      if (missing.length) {
        report.deps = missing
        ops.push(() => {
          // re-read at write time: a dry run must have written nothing, and the ops run after the copies
          const cur = JSON.parse(readFileSync(pkgPath, 'utf8'))
          cur.dependencies = { ...(cur.dependencies || {}), ...DEPS }
          writeFileSync(pkgPath, JSON.stringify(cur, null, 2) + '\n')
        })
      }
    }
  }

  // …AND THE BOARD FOLDER'S OWN IGNORE LISTS (2026-09-06). What the vendored code IS changes with a
  // release, and the folder's `.gitignore` is what keeps that code — and every derived byte — out of
  // the commit while the authored spec beside it goes in. A project that updated without this kept
  // the old lists and would stage a byte copy of the plugin the moment its folder became committed.
  // APPEND-ONLY, and only inside the board folder: a line the project added is never removed, a line
  // that has gone stale is left for a person to delete, and the APP repo's own .gitignore is never
  // touched by an update (removing a `/specboard/` line there is the owner's decision, not ours).
  // A project with no .gitignore of its own is the flat layout — its ignores live in the app repo,
  // so one is never created here.
  for (const [rel, lines] of [['.gitignore', boardIgnoreLines()], ['spec/.gitignore', SPEC_IGNORE]]) {
    const p = join(dest, rel)
    if (!existsSync(p)) continue
    const cur = readFileSync(p, 'utf8')
    const have = new Set(cur.split('\n').map(l => l.trim()))
    const add = lines.filter(l => !have.has(l))
    if (!add.length) continue
    report.ignores.push(rel)
    ops.push(() => {
      const now = readFileSync(p, 'utf8')
      writeFileSync(p, now + (now && !now.endsWith('\n') ? '\n' : '') +
        `# specboard ${version} — the board's vendored code and everything a run derives (the data home)\n` +
        add.join('\n') + '\n')
    })
  }

  report.hasConflicts = report.conflicts.length > 0
  // The version only advances to the new release when nothing is left half-merged; while a conflict
  // stands the project is genuinely part-old, and the version must not claim otherwise.
  // the project's committed identity block rides along from the base (A-2) — hashes are the update's
  const manifest = mergeManifest({ version: report.hasConflicts ? baseVer : version, files: newFiles }, base)

  if (!dryRun) {
    for (const op of ops) op()
    const mp = join(dest, MANIFEST)
    mkdirSync(dirname(mp), { recursive: true })
    writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n')
  }
  return report
}

// CLI ------------------------------------------------------------------------------------------
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const fromIdx = args.indexOf('--from-dir')
  const fromDir = fromIdx >= 0 ? resolve(args[fromIdx + 1]) : null
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--from-dir')
  // An app repo keeps its board in `specboard/` (the rule) or wherever its one-line `.specboard` pointer
  // says; `update.mjs .` run from the app repo lands on that board, never re-vendors into the app repo.
  const asked = resolve(positional[0] || process.cwd())
  const dest = resolveProject(asked)
  if (dest !== asked) console.log(`${asked} → ${dest}  (its board — the ${POINTER} pointer or the specboard/ folder)`)

  if (dest === SRC) {
    console.error('Refusing to update specboard itself. Give a scaffolded project directory.'); process.exit(1)
  }

  const manifestPath = join(dest, MANIFEST)
  let base = null
  if (existsSync(manifestPath)) base = JSON.parse(readFileSync(manifestPath, 'utf8'))
  else if (fromDir) base = buildManifest(fromDir)
  else {
    console.error(`No ${MANIFEST} in ${dest}, and no --from-dir given.`)
    console.error('Pass --from-dir <path-to-the-release-this-project-was-scaffolded-from> so the update')
    console.error('knows which files are untouched vs locally edited. The skill can find it for you.')
    process.exit(1)
  }

  const to = readVersion(SRC)
  if (base.version === to) { console.log(`Already on specboard ${to} — nothing to update.`); process.exit(0) }

  const rep = updateProject({ dest, src: SRC, base, dryRun })
  const line = (label, arr) => arr.length ? console.log(`  ${label}: ${arr.join(', ')}`) : null
  console.log(`${dryRun ? '[dry run] ' : ''}specboard ${base.version} → ${to}  (${dest})`)
  line('added', rep.added)
  line('updated', rep.updated)
  line('up to date', rep.upToDate)
  line('unchanged (local edits kept)', rep.skipped)
  if (rep.deps.length) console.log(`  dependencies installed into package.json: ${rep.deps.join(', ')} — run \`npm install\` in ${dest}`)
  if (rep.ignores.length) console.log(`  ignore lists brought forward (appended, nothing removed): ${rep.ignores.join(', ')}`)
  if (rep.conflicts.length) {
    console.log('  CONFLICTS — your edits kept, new version written alongside; merge then delete the .new:')
    for (const c of rep.conflicts) console.log(`    ${c.file}   (new → ${c.new})`)
  }
  const changedFiles = rep.added.length + rep.updated.length
  if (!dryRun) console.log(
    rep.hasConflicts ? '\nPartial: rebuild + restart the board AFTER merging the conflicts above.'
      : changedFiles ? '\nDone. Rebuild board.html and restart the board to run the new code.'
        : '\nDone — no board files changed (only the manifest). Nothing to rebuild or restart.')
  process.exit(rep.hasConflicts ? 2 : 0)
}
