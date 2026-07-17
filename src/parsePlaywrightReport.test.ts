import { describe, it, expect } from "vitest";
import { parsePlaywrightJson, parseCaseResult } from "./parsePlaywrightReport";
const report = JSON.stringify({
  suites: [{ title: "house-view.spec.ts", suites: [{ title: "hv", specs: [
    { title: "hv one", ok: true, tests: [{ results: [{ status: "failed" }, { status: "passed" }] }] },
  ] }], specs: [
    { title: "hv two", ok: false, tests: [{ results: [{ status: "failed" }, { status: "failed" }] }] },
  ] }],
});
describe("parsePlaywrightJson", () => {
  const titles = new Map([["hv one", "hv-1"], ["hv two", "hv-2"]]);
  const r = parsePlaywrightJson(report, titles);
  it("maps titles to case ids with pass/fail + attempts (nested suites)", () => {
    expect(r["hv-1"]).toEqual({ status: "pass", attempts: 2 });
    expect(r["hv-2"]).toEqual({ status: "fail", attempts: 2 });
  });
  it("ignores specs whose title is not a known case", () => {
    expect(Object.keys(r).sort()).toEqual(["hv-1", "hv-2"]);
  });

  // Regression: a batch whose auth setup failed reports its tests as "did not
  // run" — `ok: true` with an EMPTY results array. Recording those as `pass`
  // fabricates a green result for a test that never executed (observed live:
  // "newly passing: frontend:UW-6" from a run where UW-6 never ran, recorded
  // as `pass, attempts: 0` in kg-test-results.json).
  it("does NOT record a spec whose tests never ran (ok:true, empty results)", () => {
    const didNotRun = JSON.stringify({
      suites: [{ title: "s.spec.ts", specs: [
        { title: "never ran", ok: true, tests: [{ results: [] }] },
      ] }],
    });
    const out = parsePlaywrightJson(didNotRun, new Map([["never ran", "uw-6"]]));
    expect(out).toEqual({});
  });

  it("does NOT record a spec whose only results are skipped (fixme/serial-skip)", () => {
    const skippedOnly = JSON.stringify({
      suites: [{ title: "s.spec.ts", specs: [
        { title: "skipped case", ok: true, tests: [{ results: [{ status: "skipped" }] }] },
      ] }],
    });
    const out = parsePlaywrightJson(skippedOnly, new Map([["skipped case", "uw-6"]]));
    expect(out).toEqual({});
  });

  // Serial-mode retry: a test skipped in the first chain (an earlier serial
  // test failed) and executed once on the chain retry has results
  // [skipped, passed] — one REAL attempt, not two (attempts=2 previously
  // mislabelled such passes as "flaky").
  it("counts only executed (non-skipped) results as attempts", () => {
    const serialRetry = JSON.stringify({
      suites: [{ title: "s.spec.ts", specs: [
        { title: "ran after skip", ok: true, tests: [{ results: [{ status: "skipped" }, { status: "passed" }] }] },
      ] }],
    });
    const out = parsePlaywrightJson(serialRetry, new Map([["ran after skip", "uw-5"]]));
    expect(out).toEqual({ "uw-5": { status: "pass", attempts: 1 } });
  });
});

// R2-B last-run visibility: failed cases carry a cleaned `error` string extracted from the
// Playwright JSON reporter's per-result error objects (ANSI-colored, multi-line, may embed
// filesystem-absolute paths). Passing cases must NOT carry one.
describe("parsePlaywrightJson — error extraction (failed cases)", () => {
  const failedReport = (message: string) => JSON.stringify({
    suites: [{ title: "s.spec.ts", specs: [
      { title: "t", ok: false, tests: [{ results: [{ status: "failed", errors: [{ message }] }, { status: "failed", errors: [{ message: "second-attempt error (must not win)" }] }] }] },
    ] }],
  });
  const titles = new Map([["t", "uw-8"]]);

  it("extracts the FIRST error message, ANSI-stripped, first non-empty lines only", () => {
    const ansi = "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m\n\n\u001b[2mLocator: getByTestId('deal-return')\u001b[22m";
    const out = parsePlaywrightJson(failedReport(ansi), titles);
    expect(out["uw-8"].status).toBe("fail");
    expect(out["uw-8"].error).toBe("Error: expect(locator).toBeVisible() failed\nLocator: getByTestId('deal-return')");
    expect(out["uw-8"].error).not.toContain("\u001b");
    expect(out["uw-8"].error).not.toContain("second-attempt");
  });

  it("strips filesystem-absolute path prefixes down to repo-relative", () => {
    const msg = "Error: boom\n    at C:\\Users\\ching\\workspace\\dojostack\\dojostack_frontend\\e2e\\uw.spec.ts:42:5";
    const out = parsePlaywrightJson(failedReport(msg), titles);
    expect(out["uw-8"].error).not.toMatch(/[A-Za-z]:\\/);
    expect(out["uw-8"].error).toContain("e2e\\uw.spec.ts:42:5");
  });

  it("truncates to ~300 chars with an ellipsis", () => {
    const out = parsePlaywrightJson(failedReport("E".repeat(500)), titles);
    expect(out["uw-8"].error!.length).toBeLessThanOrEqual(300);
    expect(out["uw-8"].error!.endsWith("…")).toBe(true);
  });

  it("falls back to result.error.message when errors[] is absent", () => {
    const rep = JSON.stringify({
      suites: [{ title: "s.spec.ts", specs: [
        { title: "t", ok: false, tests: [{ results: [{ status: "failed", error: { message: "Error: timed out" } }] }] },
      ] }],
    });
    expect(parsePlaywrightJson(rep, titles)["uw-8"].error).toBe("Error: timed out");
  });

  it("failed case with no error object in the report gets no error field", () => {
    const rep = JSON.stringify({
      suites: [{ title: "s.spec.ts", specs: [
        { title: "t", ok: false, tests: [{ results: [{ status: "failed" }] }] },
      ] }],
    });
    const e = parsePlaywrightJson(rep, titles)["uw-8"];
    expect(e.status).toBe("fail");
    expect("error" in e).toBe(false);
  });

  it("passing cases carry NO error field even when a retried attempt failed first", () => {
    const rep = JSON.stringify({
      suites: [{ title: "s.spec.ts", specs: [
        { title: "t", ok: true, tests: [{ results: [{ status: "failed", errors: [{ message: "flaky first attempt" }] }, { status: "passed" }] }] },
      ] }],
    });
    const e = parsePlaywrightJson(rep, titles)["uw-8"];
    expect(e.status).toBe("pass");
    expect("error" in e).toBe(false);
  });
});

describe("parseCaseResult — single live run (2a)", () => {
  const rep = (spec: object) => JSON.stringify({ suites: [{ title: "s.spec.ts", specs: [spec] }] });

  it("pass: status pass, no error, no screenshots", () => {
    const r = parseCaseResult(rep({ title: "t", ok: true, tests: [{ results: [{ status: "passed" }] }] }), "t");
    expect(r).toEqual({ status: "pass", error: null, screenshots: [] });
  });

  it("fail: cleaned first error + screenshot attachments (name + path)", () => {
    const r = parseCaseResult(rep({ title: "t", ok: false, tests: [{ results: [{
      status: "failed",
      errors: [{ message: "[31mError: boom[39m" }],
      attachments: [
        { name: "screenshot", contentType: "image/png", path: "C:\\Users\\x\\dojostack_frontend\\test-results\\t\\test-failed-1.png" },
        { name: "trace", contentType: "application/zip", path: "C:\\x\\trace.zip" },
      ],
    }] }] }), "t");
    expect(r.status).toBe("fail");
    expect(r.error).toBe("Error: boom");
    expect(r.error).not.toContain("");
    // only image screenshots, name = attachment name, path = raw report path (serve rewrites it)
    expect(r.screenshots).toEqual([{ name: "test-failed-1.png", path: "C:\\Users\\x\\dojostack_frontend\\test-results\\t\\test-failed-1.png" }]);
  });

  it("fail with no screenshot attachment: empty screenshots, error still set", () => {
    const r = parseCaseResult(rep({ title: "t", ok: false, tests: [{ results: [{ status: "failed", errors: [{ message: "Error: nope" }] }] }] }), "t");
    expect(r).toEqual({ status: "fail", error: "Error: nope", screenshots: [] });
  });

  it("unknown title → pass/null/empty (defensive default, never throws)", () => {
    const r = parseCaseResult(rep({ title: "other", ok: true, tests: [{ results: [{ status: "passed" }] }] }), "t");
    expect(r).toEqual({ status: "pass", error: null, screenshots: [] });
  });
});
