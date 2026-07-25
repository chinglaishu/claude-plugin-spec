import { test, expect } from "@playwright/test";
// Runs against `npm run serve` (KG_PORT default 8971, override via KG_VIEWER_URL).
//
// n.suggestedFix is a COMMITTED-graph field (Task 2's applyResults bakes it onto the test node
// from kg-test-results.json at build time) — unlike F2a's live `result` SSE event, it is never
// produced by the viewer's own Run. So this spec cannot drive it via a mocked SSE stream (that
// pattern belongs to result-render.spec.ts / F2a). Instead it patches the SERVED viewer.html's
// embedded `var KG={...}` graph JSON in-flight (via page.route on the document request) to add
// suggestedFix onto one real failing node, then asserts the rendered failure-detail card.
//
// All client JS in viewer.template.html lives inside a top-level IIFE — lastRunLine/N/KG are
// closure-scoped, NOT on `window` (confirmed empirically by result-render.spec.ts and the F2a
// implementer's notes) — so this drives the real render path via the DOM, not a bare
// `page.evaluate(() => lastRunLine(...))` call.
const BASE = process.env.KG_VIEWER_URL ?? "http://127.0.0.1:8971";

// This repo's own committed case nodes, registered in e2e/cases/viewer.cases.yaml. The spec
// injects the failure state it needs into the served graph, so the nodes need only exist.
// (Previously two case ids from the project this tool was ported from, which never existed here.)
// used as the "no suggestedFix" control so we don't need two round-trips off one node's card).
const NODE_WITH_FIX = "main:VIEW-2";
const NODE_WITHOUT_FIX = "main:VIEW-3";
const INJECTED_FIX = "<b>bad</b> add an await before the assert";

/** Brace-match the `var KG={...};` blob emitted by src/viewer.ts (JSON.stringify(graph),
 *  no markers left post-build) so we can safely JSON.parse -> mutate -> JSON.stringify it back
 *  without a regex that could mis-match nested braces/strings inside node bodies. */
function patchGraphHtml(html: string, mutate: (graph: any) => void): string {
  const marker = "var KG=";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("var KG= marker not found in served HTML");
  const jsonStart = start + marker.length;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error("could not brace-match the KG JSON blob");
  const graph = JSON.parse(html.slice(jsonStart, end));
  mutate(graph);
  // Mirror src/viewer.ts renderViewer's </script> escaping — without it, a node body/title
  // containing a literal "</script>" (common: embedded doc text) closes the script tag early
  // and corrupts the whole page (empirically hit: "Invalid or unexpected token" pageerror).
  const patched = JSON.stringify(graph).replace(/<\/script>/gi, "<\\/script>");
  return html.slice(0, jsonStart) + patched + html.slice(end);
}

test.describe("suggestedFix in .lr-fail (committed results)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const patched = patchGraphHtml(body, (graph) => {
        // Inject the WHOLE failure state, not just the fix. The viewer gates the failure block on
        // `status === 'fail' && (lastError || suggestedFix)` and needs a runAt for the result line.
        // These specs used to lean on two committed nodes that happened to be red, which made them
        // depend on someone else's run history — so they broke the moment they met a graph where
        // those cases were green, or absent.
        const fail = (n: any) => {
          n.status = "fail";
          n.runAt = "2026-07-26T00:00:00.000Z";
          n.lastError = "Error: expected true to be false";
        };
        const withFix = graph.nodes.find((n: any) => n.id === NODE_WITH_FIX);
        if (!withFix) throw new Error(`${NODE_WITH_FIX} not found in served graph`);
        fail(withFix);
        withFix.suggestedFix = INJECTED_FIX;
        const withoutFix = graph.nodes.find((n: any) => n.id === NODE_WITHOUT_FIX);
        if (!withoutFix) throw new Error(`${NODE_WITHOUT_FIX} not found in served graph`);
        fail(withoutFix);
        delete withoutFix.suggestedFix;
      });
      await route.fulfill({ response, body: patched, headers: { ...response.headers(), "content-length": String(Buffer.byteLength(patched)) } });
    });
  });

  test("renders the labelled, esc()'d suggestedFix section only when present", async ({ page }) => {
    await page.goto(`${BASE}/#case=${encodeURIComponent(NODE_WITH_FIX)}`);
    const introSkip = page.locator("#intro-skip, #intro-got");
    if (await introSkip.count()) await introSkip.first().click().catch(() => {});

    // caseCard() (the only renderer that calls lastRunLine) renders EVERY test tagged to the
    // open feature page, not just the one deep-linked open — including other failing cases on
    // the same feature — so a bare `.lr-fail` is ambiguous across the page. Its card carries a
    // "feat:" data-anchor prefix (see caseCard's anchorPrefix, and navToNode/goto's own
    // `[data-anchor="feat:"+id]` fallback lookup) — scope to that exact card.
    const card = page.locator(`.card[data-anchor="feat:${NODE_WITH_FIX}"]`).first();
    await expect(card).toBeVisible();
    const failDetails = card.locator(".lr-fail");
    await expect(failDetails).toBeVisible();
    await failDetails.locator("summary").click();

    const fixBlock = failDetails.locator(".lr-fix");
    await expect(fixBlock).toBeVisible();
    await expect(fixBlock.locator(".lr-fix-label")).toContainText("Suggested fix (AI-generated)");
    await expect(fixBlock.locator(".lr-fix-label")).toContainText("🤖"); // 🤖

    // escaped: the literal text renders, no live <b> element was injected (XSS check)
    const fixPre = fixBlock.locator("pre");
    await expect(fixPre).toContainText("<b>bad</b> add an await before the assert");
    expect(await fixBlock.locator("pre b").count()).toBe(0);
    expect(await fixBlock.locator("b").count()).toBe(0);

    // the original lastError <pre> is still rendered alongside it (this task ADDS, doesn't replace)
    await expect(failDetails.locator("pre").first()).toBeVisible();
  });

  test("shows no suggestedFix section when absent", async ({ page }) => {
    await page.goto(`${BASE}/#case=${encodeURIComponent(NODE_WITHOUT_FIX)}`);
    const introSkip = page.locator("#intro-skip, #intro-got");
    if (await introSkip.count()) await introSkip.first().click().catch(() => {});

    const card = page.locator(`.card[data-anchor="feat:${NODE_WITHOUT_FIX}"]`).first();
    await expect(card).toBeVisible();
    const failDetails = card.locator(".lr-fail");
    await expect(failDetails).toBeVisible();
    await failDetails.locator("summary").click();

    expect(await failDetails.locator(".lr-fix").count()).toBe(0);
    await expect(failDetails).not.toContainText("Suggested fix");
    // failure detail itself (lastError) still renders — the guard widening didn't break the base case
    await expect(failDetails.locator("pre").first()).toBeVisible();
  });
});
