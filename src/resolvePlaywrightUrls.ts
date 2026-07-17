// Derive the env vars a spawned Playwright process needs to navigate at the SAME
// FE/BE this process's own readiness gate (runReadinessGate/gateDecision) just
// probed. playwright.config.ts reads E2E_BASE_URL / E2E_BACKEND_URL independently
// — it has no knowledge of serve.ts's FE_PORT/BE_PORT — so without this, pointing
// serve.ts at an already-running dev server via E2E_FE_PORT/E2E_BE_PORT (e.g. a
// custom port) passes the readiness gate but Playwright still navigates at its own
// localhost:4000/:9000 default. Reproduced live: gate confirmed :3000 healthy,
// Playwright still hit ERR_CONNECTION_REFUSED at :4000.
//
// Respects an explicit E2E_BASE_URL/E2E_BACKEND_URL override (e.g. a value already
// set in the calling shell) rather than always forcing the derived one.
export function resolvePlaywrightUrls(
  feUrl: string,
  beUrl: string,
  env: { E2E_BASE_URL?: string; E2E_BACKEND_URL?: string }
): { E2E_BASE_URL: string; E2E_BACKEND_URL: string } {
  return {
    E2E_BASE_URL: env.E2E_BASE_URL ?? feUrl,
    E2E_BACKEND_URL: env.E2E_BACKEND_URL ?? beUrl,
  };
}
