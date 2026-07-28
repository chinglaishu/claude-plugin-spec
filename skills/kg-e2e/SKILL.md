---
name: kg-e2e
description: Use to author the E2E test for a specboard screen — the column-4 spec that proves the PRD and, as a byproduct, shoots column 3's screen.png. Write the failing assertion first and watch it go red. Used standalone when a screen needs its test, and by brownfield kg-init to characterize an existing screen.
---

# Authoring the test that proves a screen

Column 4 is what turns "we think it works" into "a machine checked." The test lives next to the
screen it proves — `spec/<screen>/test.spec.ts` — and it does two jobs at once: it **asserts the
requirements** in that screen's `prd.md`, and it **shoots `spec/<screen>/screen.png`**, which is
column 3. Column 3 is therefore always a *byproduct* of a passing test, never a picture captured by
hand. That is the invariant the whole board rests on; do not break it by writing a screenshot any
other way.

## The two rules that make it a test and not a decoration

1. **Write the failing assertion first, and watch it go red.** A test written after the code can only
   confirm what the code already does. Run it, see it fail for the reason you expect, then make it
   pass. If you cannot make it fail, you have not yet written a test.
2. **Assert something that can fail.** If the test would still pass with the requirement deleted from
   the app, it is a smoke alarm with the battery out. Assert the *behaviour the requirement names* —
   the text that must appear, the control that must work, the state that must change — not that "the
   page loaded."
3. **Assert on DATA, not chrome.** A real app's frame — nav, headings, an empty table — paints
   instantly, so a test that checks a heading passes *before the list has loaded*. Push the assertion
   onto content that only exists once the API resolved: a real table row, a grid cell, an API-derived
   number. Wait for it first with `waitForContent(locator)` from `_base`, then assert. This is the
   single most common way a guessed characterization test becomes a false green — the screen "passes"
   without its data ever arriving, and the screenshot catches an empty shell.

Never weaken, skip, or delete an assertion to go green (CLAUDE.md rule 3). When a test breaks after a
change, first find which of the two — the test or the code — is wrong, before editing either.

## The shape

```ts
import { test, expect } from '../_base'

// One test per requirement it proves. Name it by the requirement, so a red result points at the
// behaviour that broke, not at a file.
test('R1 — <the behaviour R1 names>', async ({ page }) => {
  await page.goto('/<route>')            // see "which URL" below
  // assert the behaviour R1 describes — something that fails if the app stops doing it
  await expect(page.getByRole('heading', { name: /.../ })).toBeVisible()
})

test('R2 — <the behaviour R2 names>', async ({ page }) => {
  await page.goto('/<route>')
  // ...
  // The LAST test to run for a screen shoots column 3. One screenshot per screen is enough.
  await page.screenshot({ path: 'spec/<screen>/screen.png', fullPage: false })
})
```

- Import `{ test, expect }` from `'../_base'` — never from `@playwright/test` directly; `_base`
  carries the one-window behaviour a watched run needs.
- `spec/<screen>/screen.png` is written by exactly one test (usually the last), with
  `page.screenshot({ path: ..., fullPage: false })`. Do not capture it separately, and do not copy
  another image into it.

## Which URL a test navigates to

- **A design-mode screen** (you built a wireframe and then the real thing): the test drives whatever
  you built. For specboard's own screens that is the board on `/`; for a project's own new screen it
  is that screen's route on the app.
- **A document-mode / characterization screen** (an existing screen kg-init crawled): navigate the
  **real running app** at its route, taken from `spec/_config.json` (`baseUrl` + the screen's
  `route`). The screenshot is then the app as it actually is, and the assertions lock in its current
  behaviour as the baseline. The guessed PRD gives that baseline meaning: when the CEO corrects the
  PRD to say the behaviour *should* differ, you update the test to the corrected PRD — and its
  failing against the current app is then a real bug surfaced, which is the point.

## Authenticating (document mode against a real app)

A real app is usually behind a login, and a document-mode test must reach screens that require it. You
do **not** log in inside each test. Instead, put a `signIn` script in `spec/_config.json` (Setup →
sign-in), and the harness runs it **once** in a `setup` project that saves the session; every screen
test then runs in the `screens` project already authenticated (`dependencies:['setup']`, reusing the
saved `storageState`). So the test just navigates to its route and asserts — it starts logged in.

Two things that will cost you an afternoon otherwise:

- **The signIn script must TYPE, never `page.fill()`.** Controlled React inputs (react-hook-form and
  most component libraries) ignore `fill()`'s programmatic value and submit an **empty** form with no
  error — you sit on `/login` wondering why. Use `pressSequentially`, or click the field then `type`.
- **The login screen itself is bespoke.** Once signed in, `/login` redirects away, so the crawl can
  never reach it and it can't be a document-mode screen. Write its PRD and test by hand.

## Run it and read the result

```bash
npm run e2e                         # the whole suite
npx playwright test --config playwright.board.ts spec/<screen>/test.spec.ts   # just this screen
```

A per-screen run folds its result into `spec/_results-index.json` without blanking any other screen's
column — so running one screen to prove it is safe. Watch the new test fail first; then make it pass;
then confirm the board's column 4 shows it green and column 3 shows the shot it produced.
