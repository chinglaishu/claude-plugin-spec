import { test as setup } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Document-mode tests hit the REAL app, which is almost always behind a login. A "setup" project
// runs ONCE, signs in, and saves the authenticated storageState; the matching "screens" project then
// reuses it (dependencies:['setup']), so every characterization test starts already logged in instead
// of repeating the login. This ONE file backs EVERY setup project: playwright.board.ts registers one
// per login (the default from _config.json's signIn, plus any named authProfiles), and each passes its
// own script + output path through the project's `use` — read back here as authScript / authStorage.
//
// It is inert unless a signIn is configured: playwright.board.ts only registers setup/screens projects
// when spec/_config.json has a signIn, so specboard's own no-auth suite never runs this.

const SPEC = dirname(fileURLToPath(import.meta.url))
const CONFIG = join(SPEC, '_config.json')
// The DEFAULT saved session (the historical path). A named profile overrides this via project.use.
// It holds real auth tokens, so it is gitignored and never committed.
export const STORAGE = join(SPEC, '_auth-state.json')

setup('authenticate', async ({ page }, testInfo) => {
  const cfg = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {}
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '')
  // Which login THIS setup project runs, and where to save its session, come from the project's own
  // `use` (set by buildAuthProjects). Fall back to the default signIn / STORAGE so a hand-written
  // single-login config with no per-project `use` still works.
  const use = (testInfo.project.use || {}) as { authScript?: string, authStorage?: string }
  const script = String(use.authScript ?? cfg.signIn ?? '').trim()
  const storage = String(use.authStorage || STORAGE)
  if (!script) throw new Error('no signIn for this setup project (spec/_config.json signIn / authProfiles) — it should not run without one')

  // The human's script, run verbatim against the live app. It MUST type into fields
  // (pressSequentially, or click + type), never page.fill(): controlled React inputs (react-hook-form
  // and friends) ignore fill()'s programmatic value and submit EMPTY, leaving you on /login. kg-e2e
  // says the same. Signing in first also means /login redirects away and cannot be a document-mode
  // screen — an auth screen is inherently bespoke.
  await new Function('page', 'base', `return (async()=>{${script}})()`)(page, base)

  await page.context().storageState({ path: storage })
})
