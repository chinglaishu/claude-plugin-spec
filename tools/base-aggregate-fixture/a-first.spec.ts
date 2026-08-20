// Loads FIRST ('a' < 'b'), standing in for spec/_modes/test.spec.ts ('_' < 'b') in the real
// suite: the file the old module-scope afterEach bound to — and the only one it protected.
import { test, checkReq } from '../../spec/_base'

test('first-loaded file passes honestly', async ({ page }) => {
  await checkReq('R1', () => { /* a passing assertion */ })
})
