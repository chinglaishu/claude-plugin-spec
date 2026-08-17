// Coverage — the one place that turns a run into "is this requirement proven".
//
// A test proves requirements by TAGGING them (many-to-many, by qualified id `screen:Rn`) and
// asserting each. The test helper (spec/_base.ts) records two things a run carries out to the
// reporter: a `proves <id>` step per assertion (its error = pass/fail) and a `covers` annotation
// listing every id the flow INTENDS to reach. From those, coverage is:
//   pass         — a `proves <id>` step ran and did not error
//   fail         — a `proves <id>` step ran and errored
//   not-reached  — declared in `covers` but the flow stopped before its `proves` step ran
// not-reached is the honest third state R4 demands: a flow that stops early leaves the requirements
// it never reached neither green nor red.
//
// Pure and Playwright-free so the derivation — the single thing this product cannot get wrong — is
// unit-tested directly (tools/coverage.test.mjs), and so the reporter (.mjs) and the store (.mjs)
// share ONE implementation rather than each re-deriving it a subtly different way.

// A bare id (`R4`) means "this test's own screen"; a qualified id (`asset-plan:R5`) names another.
export const qualify = (id, screen) => (String(id).includes(':') ? String(id) : `${screen}:${id}`)

const PROVES = /^proves\s+(\S+)/

// Walk the (possibly nested) Playwright step tree, collecting every `proves <id>` step as
// pass/fail. Worst wins: a requirement asserted twice in one flow, once failing, is failed.
function stepStatuses (steps, screen, out = {}) {
  for (const s of steps || []) {
    const m = String(s?.title || '').match(PROVES)
    if (m) {
      const id = qualify(m[1], screen)
      const status = s.error ? 'fail' : 'pass'
      if (out[id] !== 'fail') out[id] = status
    }
    if (s?.steps?.length) stepStatuses(s.steps, screen, out)
  }
  return out
}

// The ids a flow declared it would cover, from every `covers` annotation (space-separated).
function declaredIds (annotations, screen) {
  const ids = new Set()
  for (const a of annotations || []) {
    if (a?.type !== 'covers') continue
    for (const raw of String(a.description || '').split(/\s+/)) {
      if (raw) ids.add(qualify(raw, screen))
    }
  }
  return ids
}

// One test's per-requirement coverage: { qualifiedId: 'pass' | 'fail' | 'not-reached' }.
export function coverageFromTest ({ steps, annotations, screen }) {
  const reached = stepStatuses(steps, screen)
  const cov = { ...reached }
  for (const id of declaredIds(annotations, screen)) {
    if (!(id in cov)) cov[id] = 'not-reached'   // declared but its proves step never ran
  }
  return cov
}

// Fold the whole results index into: { qualifiedId: [ {title, screen, status, ok, ranAt}, … ] } —
// every test that covers each requirement, wherever its FILE lives. This is the many-to-many join:
// a flow on one screen shows up under the requirement it proves on another.
export function aggregateCoverage (index) {
  const agg = {}
  for (const [screen, entry] of Object.entries(index || {})) {
    const ranAt = entry?.ranAt
    for (const t of entry?.tests || []) {
      for (const [id, status] of Object.entries(t.reqs || {})) {
        ;(agg[id] ||= []).push({ title: t.title, screen, status, ok: !!t.ok, ranAt })
      }
    }
  }
  return agg
}

// A requirement's state — the two R4 states. There is no acceptance gate (R8), so there is no
// "changed since accepted" / reworded state: proven needs a CURRENT passing proof; anything less
// (fail, not-reached, a proof that predates a change, no coverage at all) is unproven.
export function deriveReqState ({ hasCurrentPass }) {
  return hasCurrentPass ? 'proven' : 'unproven'
}

// The board's status words derive from folded coverage. FAIL WINS: a requirement covered by two
// tests, one failing, reads failed — a real failure is never masked by a second green test. No
// covering test at all is untested; a flow that declared it but stopped short is not-reached.
// (`Changed` — a proof that predates a requirement edit — is added in the drift-state plan.)
export function deriveReqStatus (entries) {
  const list = entries || []
  if (list.some(e => e.status === 'fail')) return 'failed'
  if (list.some(e => e.status === 'pass')) return 'passed'
  if (list.some(e => e.status === 'not-reached')) return 'not-reached'
  return 'untested'
}
