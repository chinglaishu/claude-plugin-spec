import { restoreState } from './_state-guard'

// Playwright takes one function per hook, so the restore half lives in its own file. Folding the
// results into the per-screen index is NOT done here — Playwright writes the report only after
// globalTeardown, so the fold is a reporter (spec/_results-reporter.mjs) instead.
export default restoreState
