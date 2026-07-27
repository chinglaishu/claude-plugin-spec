import { restoreState } from './_state-guard'

// Playwright takes one function per hook, so the restore half lives in its own file.
export default restoreState
