// Loads SECOND, standing in for board/conflicts/dispatch/init. checkReq's top-level path is
// continue-on-failure (catch → STEP_FAILURES) and relies entirely on the aggregate to fail the
// test. With the aggregate as a module-scope afterEach this test reported "passed" and the run
// exited 0; the auto fixture on the extended `test` must fail it.
import { test, checkReq } from '../../spec/_base'

test('later-loaded file must fail on a swallowed checkReq failure', async ({ page }) => {
  await checkReq('R1', () => { throw new Error('deliberate red — the aggregate must surface this') })
})
