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
import { FILES, MANIFEST, hashFile, readVersion, buildManifest, mergeManifest } from './_skeleton.mjs'

// Pure decision + file effects, so it can be proven against throwaway dirs. `base` is the shipped
// manifest ({version, files}) or null; `files` is the set to walk (the real skeleton by default).
export function updateProject ({ dest, src, base, files = FILES, dryRun = false }) {
  const version = readVersion(src)
  const baseVer = base?.version ?? 'unknown'
  const report = { added: [], updated: [], upToDate: [], skipped: [], conflicts: [], hasConflicts: false }
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
  const dest = resolve(positional[0] || process.cwd())

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
