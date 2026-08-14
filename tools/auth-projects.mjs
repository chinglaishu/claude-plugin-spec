// PURE: map the target's sign-in config into Playwright `projects`. A document-mode suite hits the
// REAL app behind a login; the harness signs in ONCE in a `setup` project and every screen project
// reuses the saved session (dependencies:['setup']). Most targets have ONE login, but some carry a
// fixture only a DIFFERENT account can reach (an isolated org, an admin area) — those screens used to
// re-login inside every test's beforeEach, paying a full browser login per test. Named AUTH PROFILES
// let a project declare a second (third, …) login in spec/_config.json and point a set of screen dirs
// at it, so that account signs in ONCE too and its screens reuse the session.
//
// This function is the whole policy, kept pure so tools/auth-projects.test.mjs can pin it without a
// browser: given the default signIn and the optional profiles, it returns the exact projects array
// (or null when there is no login at all, so the caller runs the single default project unchanged).

// The saved-session file for a profile. The default profile keeps the historical name so an existing
// scaffold's gitignore + saved state keep working; a named profile gets its own file.
export function authStoragePath (name) {
  return !name || name === 'default'
    ? './spec/_auth-state.json'
    : `./spec/_auth-${name}-state.json`
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A RegExp matching `<dir>/test.spec.ts` for any of the given screen dirs — used to ROUTE those
// screens to a profile's project (testMatch) and to EXCLUDE them from the default project (testIgnore).
const dirsRegExp = (dirs) =>
  new RegExp('(?:' + dirs.map(escapeRe).join('|') + ')/test\\.spec\\.ts$')

// Keep only well-formed profiles: a name, a non-empty signIn script, and at least one screen dir.
function validProfiles (authProfiles) {
  if (!Array.isArray(authProfiles)) return []
  return authProfiles.filter(
    (p) =>
      p && typeof p.name === 'string' && p.name.trim() &&
      String(p.signIn || '').trim() &&
      Array.isArray(p.match) && p.match.length > 0
  )
}

// Build the Playwright `projects` array, or null when there is no default signIn (the no-auth suite
// runs as a single default project — this must stay invisible to the no-login case).
//
// One `setup` project per login (all matching the single _auth.setup.ts file, each carrying its own
// script + output path in `use`, which _auth.setup.ts reads back). One `screens` project per login:
// the default one runs every screen EXCEPT those a named profile claimed (testIgnore), and each named
// profile runs ONLY its own screens (testMatch). Login is plumbing, so every setup pins slowMo:0.
export function buildAuthProjects (signIn, authProfiles = []) {
  const defaultScript = String(signIn || '').trim()
  if (!defaultScript) return null

  const profiles = validProfiles(authProfiles)
  const claimedDirs = profiles.flatMap((p) => p.match)

  const setupProject = (name, script, storage) => ({
    name,
    testMatch: /_auth\.setup\.ts$/,
    // slowMo:0 so the login always runs at full speed, whatever pace the run it precedes uses.
    use: { launchOptions: { slowMo: 0 }, authScript: script, authStorage: storage }
  })

  const projects = [
    setupProject('setup', defaultScript, authStoragePath('default')),
    {
      name: 'screens',
      testMatch: '*/test.spec.ts',
      // Hand the profiled screens to their own projects; the default one must NOT also run them
      // (that would run each twice, from the wrong session).
      ...(claimedDirs.length ? { testIgnore: dirsRegExp(claimedDirs) } : {}),
      dependencies: ['setup'],
      use: { storageState: authStoragePath('default') }
    }
  ]

  for (const p of profiles) {
    const storage = authStoragePath(p.name)
    projects.push(setupProject('setup-' + p.name, String(p.signIn).trim(), storage))
    projects.push({
      name: 'screens-' + p.name,
      testMatch: dirsRegExp(p.match),
      dependencies: ['setup-' + p.name],
      use: { storageState: storage }
    })
  }

  return projects
}
