// tools/ci-select.mjs — the CI gate is USER-CHOSEN, not "every screen automatically" (the human's
// design). spec/_ci.json names which screens' test.spec.ts files gate CI; this module is the pure
// resolver that turns that file's parsed contents (or null when it is absent) plus the real set of
// screens on disk into the ordered list of spec paths to run. Absent file → every screen, so a repo
// with no chooser yet keeps today's "run everything" behaviour. A name in the file with no matching
// test.spec.ts on disk throws LOUD — a typo that silently drops a screen out of the gate is a false
// green waiting to happen (rule 3: never fake a green).
//
// Pure on purpose (no fs, no child_process): unit-tested in ci-select.test.mjs under node --test.
// The CLI entry below owns reading spec/_ci.json and scanning spec/ for the screens that actually
// have a test.spec.ts — the only fs-touching part of this file.

export function selectCiTests (config, screensOnDisk) {
  const onDisk = new Set(screensOnDisk)

  if (config == null) {
    // No chooser on disk: everyone runs, in a stable (sorted) order so the gate's output is
    // deterministic across machines rather than depending on directory-scan order.
    return [...onDisk].sort().map(toSpecPath)
  }

  const requested = Array.isArray(config.screens) ? config.screens : []
  const missing = requested.filter(name => !onDisk.has(name))
  if (missing.length) {
    throw new Error(
      `spec/_ci.json names ${missing.length === 1 ? 'a screen' : 'screens'} with no spec/<screen>/test.spec.ts on disk: ${missing.join(', ')} — fix the typo or remove the entry. A name that silently drops out shrinks the gate without telling anyone.`
    )
  }

  // De-dupe while keeping the human's authored order and first occurrence — a repeated name must
  // not run its spec file twice.
  const seen = new Set()
  const ordered = []
  for (const name of requested) {
    if (seen.has(name)) continue
    seen.add(name)
    ordered.push(name)
  }
  return ordered.map(toSpecPath)
}

function toSpecPath (screen) {
  return `spec/${screen}/test.spec.ts`
}

// --- CLI entry --------------------------------------------------------------------------------
// `node tools/ci-select.mjs` prints the space-separated list of test.spec.ts paths for the
// workflow to pass straight to `npx playwright test`. Reads spec/_ci.json if present (an absent
// file, or one that fails to parse, is treated as "no chooser" — every screen runs, matching
// selectCiTests(null, …)), scans spec/*/test.spec.ts for the real set on disk, resolves, and
// prints. A bad name in the chooser fails the process loudly (non-zero exit + stderr) rather than
// silently shrinking the CI run.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, existsSync, readdirSync, statSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')

  const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
  const specDir = join(ROOT, 'spec')

  const screensOnDisk = readdirSync(specDir).filter(name => {
    const full = join(specDir, name)
    return statSync(full).isDirectory() && existsSync(join(full, 'test.spec.ts'))
  })

  const ciJsonPath = join(ROOT, 'spec', '_ci.json')
  let config = null
  if (existsSync(ciJsonPath)) {
    try {
      config = JSON.parse(readFileSync(ciJsonPath, 'utf8'))
    } catch (err) {
      console.error(`spec/_ci.json failed to parse (${err.message}) — treating the gate as absent (all screens).`)
      config = null
    }
  }

  try {
    const paths = selectCiTests(config, screensOnDisk)
    console.log(paths.join(' '))
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}
