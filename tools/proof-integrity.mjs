// Proof integrity — a green board is honest only if every `checkReq` actually asserts a VALUE. A
// test that merely checks `.toBeVisible()` still turns its requirement "proven" even though nothing
// about the requirement's substance was checked — the existence-only proof this tool exists to catch
// (rule 2: "assert something that can fail"). Two tools live here:
//
//   lint      — static: read every spec/*/test.spec.ts, flag any checkReq block with no value
//               assertion. Cheap, always safe to run, wired into CI-shaped workflows.
//   perturb   — dynamic: nudge a screen's golden.json numbers and re-run its suite. A proof that
//               still PASSES against wrong numbers survived only because nothing actually reads the
//               value — the golden-perturbation escape hatch for a lint that cannot see through a
//               loose regex (e.g. `expect(x).toBe(cachedSameWrongValue)`).
//
// Pure and Playwright-free (extractCheckReqBlocks / hasValueAssertion / lintSource / perturbNumbers),
// so the part that decides "is this proof real" is unit-tested directly (tools/proof-integrity.test.mjs),
// mirroring tools/coverage.mjs's split between the pure derivation and its thin CLI/reporter shell.

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

// A value assertion checks WHAT is on screen (a number, a string, a count above zero); an existence
// assertion (toBeVisible, toBeAttached, toHaveCount(0)) only checks that SOMETHING is there. Only the
// former can fail because a requirement's substance changed — the latter would still pass with the
// requirement's guts deleted, as long as the element itself still renders.
const VALUE_ASSERTION = /toHaveText|toContainText|toHaveValue|toHaveAttribute|toHaveCount\(\s*[1-9]|toBe\(|toEqual\(|toMatch|toBeCloseTo|toBeGreaterThan|toBeLessThan/

export function hasValueAssertion (body) {
  return VALUE_ASSERTION.test(String(body || ''))
}

// Find every `checkReq('<id>', async () => { … })` (authored specs only — this brace-balances from
// the first `{` after `=>`, so it does not need a real JS parser). A `}` inside a quoted string in the
// body would end the balance early — an accepted v1 limitation; specs are authored by us and do not
// do that today.
const CALL = /checkReq\(\s*(['"])([^'"]+)\1/g

export function extractCheckReqBlocks (src) {
  const text = String(src || '')
  const blocks = []
  CALL.lastIndex = 0
  let m
  while ((m = CALL.exec(text))) {
    const id = m[2]
    const arrow = text.indexOf('=>', m.index + m[0].length)
    if (arrow === -1) continue
    const braceStart = text.indexOf('{', arrow)
    if (braceStart === -1) continue
    let depth = 0
    let end = -1
    for (let i = braceStart; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    if (end === -1) continue // unbalanced — malformed source, skip rather than guess
    const line = text.slice(0, m.index).split('\n').length
    blocks.push({ id, body: text.slice(braceStart + 1, end), line })
  }
  return blocks
}

// One row per checkReq block: does it assert a value, or only that something exists.
export function lintSource (src) {
  return extractCheckReqBlocks(src).map(({ id, line, body }) => ({ id, line, ok: hasValueAssertion(body) }))
}

// Deep-walk an arbitrary JSON value (object/array/scalar), nudging every numeric leaf so a proof that
// depends on the ACTUAL number can no longer pass by accident: an integer moves by +1 (still an
// integer, so a type-only check still passes — only a value check catches it), a float is scaled by
// 1%. Rounded to 6 decimal places so repeated floating-point multiplication cannot leave 1e-15 noise
// in a diff a human is meant to read. Every change is recorded with its dotted path so a perturbed
// golden.json is auditable, not just "different".
function round6 (n) { return Math.round(n * 1e6) / 1e6 }

export function perturbNumbers (value) {
  const changes = []
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.map((item, i) => walk(item, path ? `${path}.${i}` : String(i)))
    if (v !== null && typeof v === 'object') {
      const out = {}
      for (const [k, val] of Object.entries(v)) out[k] = walk(val, path ? `${path}.${k}` : k)
      return out
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      const to = Number.isInteger(v) ? v + 1 : round6(v * 1.01)
      changes.push({ path, from: v, to })
      return to
    }
    return v
  }
  return { value: walk(value, ''), changes }
}

// CLI --------------------------------------------------------------------------------------------
// Thin, not unit-tested (mirrors tools/staff.mjs / tools/update.mjs: the pure derivation above is
// what proof-integrity.test.mjs exercises).

function screenDirs () {
  if (!existsSync('spec')) return []
  return readdirSync('spec', { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort()
}

function runLint () {
  let anyBad = false
  for (const screen of screenDirs()) {
    const path = join('spec', screen, 'test.spec.ts')
    if (!existsSync(path)) continue
    const src = readFileSync(path, 'utf8')
    for (const row of lintSource(src)) {
      const status = row.ok ? 'ok' : 'EXISTENCE-ONLY'
      if (!row.ok) anyBad = true
      console.log(`${screen} · ${row.id} · line ${row.line} · ${status}`)
    }
  }
  if (anyBad) {
    console.log('\nSome checkReq blocks only assert existence (toBeVisible/toBeAttached/toHaveCount(0)) —')
    console.log('a requirement they "prove" would stay green with its substance deleted. Strengthen the')
    console.log('assertion to check an actual value (kg-e2e rule 2).')
  }
  process.exit(anyBad ? 1 : 0)
}

// Recursively collect every `proves <id>` step out of the `--reporter=json` report's suite/spec/test/
// result/step tree, each as { id, passed }. The JSON reporter's step shape mirrors what
// spec/_results-reporter.mjs already reads off Playwright's live Suite/Test objects (title, error,
// nested steps) — same shape, different serialization.
function collectProvesSteps (node, out = []) {
  if (!node || typeof node !== 'object') return out
  for (const s of node.suites || []) collectProvesSteps(s, out)
  for (const s of node.specs || []) collectProvesSteps(s, out)
  for (const t of node.tests || []) collectProvesSteps(t, out)
  for (const r of node.results || []) walkSteps(r.steps, out)
  return out
}
function walkSteps (steps, out) {
  for (const s of steps || []) {
    const m = /^proves\s+(\S+)/.exec(String(s?.title || ''))
    if (m) out.push({ id: m[1], passed: !s.error })
    if (s?.steps?.length) walkSteps(s.steps, out)
  }
}

function runPerturb (screen) {
  if (!screen) {
    console.error('usage: node tools/proof-integrity.mjs perturb <screen>')
    process.exit(2)
  }
  const goldenPath = join('spec', screen, 'golden.json')
  if (!existsSync(goldenPath)) {
    console.log('no-golden')
    process.exit(2)
  }
  const backupPath = goldenPath + '.pi-bak'
  copyFileSync(goldenPath, backupPath)
  try {
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'))
    const { value, changes } = perturbNumbers(golden)
    if (!changes.length) {
      console.log(`no numeric leaves found in ${goldenPath} — nothing to perturb`)
      return
    }
    writeFileSync(goldenPath, JSON.stringify(value, null, 2) + '\n')
    console.log(`perturbed ${changes.length} numeric value(s) in ${goldenPath}:`)
    for (const c of changes) console.log(`  ${c.path}: ${c.from} → ${c.to}`)

    // Which checkReq blocks in this screen's spec make a real value assertion — a proof with no
    // value assertion cannot be a SUSPECT here; lint already flagged it as existence-only.
    const testPath = join('spec', screen, 'test.spec.ts')
    const src = existsSync(testPath) ? readFileSync(testPath, 'utf8') : ''
    const valueAsserted = new Map(extractCheckReqBlocks(src).map(b => [b.id, hasValueAssertion(b.body)]))

    // --reporter=json REPLACES the config's reporter array (see playwright.board.ts) — the custom
    // spec/_results-reporter.mjs does not run, so this perturbed run can never fold into
    // spec/_results-index.json. That is the whole safety property this command depends on.
    const scratch = join(tmpdir(), `proof-integrity-${screen}-${Date.now()}.json`)
    let stdout
    try {
      stdout = execFileSync(
        'npx',
        ['playwright', 'test', `spec/${screen}`, '--config=playwright.board.ts', '--reporter=json'],
        { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 }
      )
    } catch (err) {
      // A red run under perturbation is often the DESIRED outcome — Playwright exits non-zero on any
      // failure, but the JSON report is still on stdout and still worth reading.
      stdout = String(err.stdout || '')
    }
    writeFileSync(scratch, stdout)
    console.log(`\nrun report captured → ${scratch}`)

    let report
    try { report = JSON.parse(stdout) } catch {
      console.log('could not parse the JSON report — see the scratch file above')
      return
    }
    const proves = collectProvesSteps(report)
    if (!proves.length) {
      console.log('no `proves <id>` steps found in the report')
      return
    }
    for (const p of proves) {
      if (p.passed && valueAsserted.get(p.id)) {
        console.log(`${screen} · ${p.id} · SUSPECT — proof survived a perturbed golden`)
      } else if (p.passed) {
        console.log(`${screen} · ${p.id} · passed under perturbation, but is existence-only (lint already flags it)`)
      } else {
        console.log(`${screen} · ${p.id} · went red under perturbation (good — the proof is real)`)
      }
    }
  } finally {
    // Golden restore is unconditional — a perturbed golden left on disk would poison every run after
    // this one, so it comes back even if the run above threw for an unrelated reason.
    copyFileSync(backupPath, goldenPath)
    unlinkSync(backupPath)
  }
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const [, , cmd, arg] = process.argv
  if (cmd === 'lint') runLint()
  else if (cmd === 'perturb') runPerturb(arg)
  else {
    console.error('usage:')
    console.error('  node tools/proof-integrity.mjs lint')
    console.error('  node tools/proof-integrity.mjs perturb <screen>')
    process.exit(2)
  }
}
