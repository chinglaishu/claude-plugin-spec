import { defineConfig } from "@playwright/test";

// The suite drives the REAL served viewer — `npm run serve` — because what these specs cover is
// client JS that only exists in a browser: SSE stream handling, the Run button, lightbox rendering.
// `viewerRevamp.test.ts` already covers everything JSDOM can reach, so anything here that JSDOM could
// have asserted belongs there instead, where it runs in milliseconds without a browser.
//
// `webServer` starts serve itself and tears it down after, so the suite has no "did you remember to
// start the server?" precondition — a precondition is how a suite ends up skipped rather than run.
export default defineConfig({
  testDir: "./e2e",
  // The tool owns the layout INSIDE e2eDir (cases/, features/, cache/, .step-shots/), so the spec
  // glob must not sweep those registries up as tests.
  testMatch: "*.spec.ts",
  reporter: process.env.CI ? [["json", { outputFile: "e2e/.report.json" }], ["list"]] : "list",
  use: { baseURL: process.env.KG_VIEWER_URL ?? "http://127.0.0.1:8971", trace: "off" },
  webServer: {
    command: "npx tsx src/serve.ts",
    url: process.env.KG_VIEWER_URL ?? "http://127.0.0.1:8971",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
