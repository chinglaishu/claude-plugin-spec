import { test as setup } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Document-mode tests hit the REAL app, which is almost always behind a login. This "setup" project
// runs ONCE, signs in with the script from spec/_config.json (the same script the crawl uses), and
// saves the authenticated storageState. The "screens" project then reuses it (dependencies:['setup']),
// so every characterization test starts already logged in instead of repeating the login.
//
// It is inert unless signIn is configured: playwright.board.ts only registers the setup/screens
// projects when spec/_config.json has a signIn, so specboard's own no-auth suite never runs this.

const SPEC = dirname(fileURLToPath(import.meta.url))
const CONFIG = join(SPEC, '_config.json')
// The saved session. It holds real auth tokens, so it is gitignored and never committed.
export const STORAGE = join(SPEC, '_auth-state.json')

setup('authenticate', async ({ page }) => {
  const cfg = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {}
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '')
  const script = String(cfg.signIn || '').trim()
  if (!script) throw new Error('no signIn in spec/_config.json — the setup project should not run without it')

  // The human's script, run verbatim against the live app. It MUST type into fields
  // (pressSequentially, or click + type), never page.fill(): controlled React inputs (react-hook-form
  // and friends) ignore fill()'s programmatic value and submit EMPTY, leaving you on /login. kg-e2e
  // says the same. Signing in first also means /login redirects away and cannot be a document-mode
  // screen — an auth screen is inherently bespoke.
  await new Function('page', 'base', `return (async()=>{${script}})()`)(page, base)

  await page.context().storageState({ path: STORAGE })
})
