import { test, expect } from "@playwright/test";
// Runs against `npm run serve` (KG_PORT default 8971, override via KG_VIEWER_URL).
//
// All client JS in viewer.template.html lives inside one top-level IIFE
// `(function(){ ... })();` — `renderRunResult`, `esc`, `openLightbox` etc. are closure-scoped,
// NOT attached to `window`. So this spec cannot reach `renderRunResult` via a bare
// `page.evaluate(() => renderRunResult(...))` call (confirmed: that throws
// "renderRunResult is not defined" even though the function exists in the page's script).
// Instead it drives the REAL integration: deep-link straight to a runnable case
// (`#case=<id>`, see viewer.template.html's `applyHash`) so a `.btn-run[data-run]` renders,
// mock `POST /api/run` to return a synthetic SSE stream (start -> result -> exit), click the
// button, and assert against the row's `.run-row-result` that F1's `runOne` SSE switch (see
// the `result` branch) populates by calling `renderRunResult`. This exercises the true F1/F2a
// wiring end-to-end, not just the helper in isolation.
const BASE = process.env.KG_VIEWER_URL ?? "http://127.0.0.1:8971";
const RUN_CASE = process.env.KG_RESULT_TEST_CASE ?? "frontend:ADD-1";

const FAKE_SSE = [
  "event: start",
  'data: {"spec":"onboarding-scenarios.spec.ts"}',
  "",
  "event: result",
  'data: {"status":"fail","error":"<img src=x onerror=alert(1)>Error: boom","screenshots":[{"name":"test-failed-1.png","path":"/run-artifacts/run-x/test-failed-1.png"}]}',
  "",
  "event: exit",
  'data: {"code":1}',
  "",
  "",
].join("\n");

test("live result event renders an escaped error + clickable failure screenshot", async ({ page }) => {
  await page.route("**/api/run", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: FAKE_SSE });
  });

  await page.goto(`${BASE}/#case=${encodeURIComponent(RUN_CASE)}`);
  // Dismiss the first-run intro popover if present — it intercepts pointer events.
  const introSkip = page.locator("#intro-skip, #intro-got");
  if (await introSkip.count()) await introSkip.first().click().catch(() => {});

  await page.locator(".btn-run[data-run]").first().click();

  const row = page.locator(".run-row").first();
  await expect(row).toBeVisible();
  const resultEl = row.locator(".run-row-result");

  // escaped: the literal text is present, no injected <img> element exists inside the error <pre>
  const errEl = resultEl.locator(".rr-err");
  await expect(errEl).toContainText("<img src=x onerror=alert(1)>Error: boom");
  expect(await resultEl.locator(".rr-err img").count()).toBe(0);

  // expand the row (results, like the log, are only shown while the row is open)
  await row.locator(".run-row-head").click();
  const shotImg = resultEl.locator(".rr-shot img");
  await expect(shotImg).toHaveCount(1);
  await expect(shotImg).toBeVisible();

  // clicking the thumbnail opens the EXISTING lightbox (reused machinery, not a new one)
  await shotImg.click();
  await expect(page.locator("#lightbox.show")).toBeVisible();
  await expect(page.locator("#lightbox-img")).toHaveAttribute("src", /run-artifacts\/run-x\/test-failed-1\.png$/);
});
