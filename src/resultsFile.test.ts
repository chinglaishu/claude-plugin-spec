// covers: REQ-KG-RUN-01, REQ-KG-RUN-02
import { describe, it, expect } from "vitest";
import { normalizeResults, mergeResults, type ResultsFileV2 } from "./resultsFile";

const v1 = JSON.stringify({ generatedAt: "2026-07-02T09:14:00Z", commit: "a1b2c3d", results: { "bil-1": "pass", "bil-4": "fail" } });
const v2 = JSON.stringify({ generatedAt: "2026-07-03T10:00:00Z", commit: "e4f5a6b", results: { "bil-1": { status: "pass", attempts: 2, at: "2026-07-03T10:00:00Z" } } });

describe("normalizeResults", () => {
  it("upgrades v1 string entries to v2 objects (attempts 1, at = file generatedAt)", () => {
    const r = normalizeResults(v1);
    expect(r.results["bil-1"]).toEqual({ status: "pass", attempts: 1, at: "2026-07-02T09:14:00Z" });
    expect(r.results["bil-4"].status).toBe("fail");
    expect(r.commit).toBe("a1b2c3d");
  });
  it("passes v2 entries through unchanged", () => {
    expect(normalizeResults(v2).results["bil-1"]).toEqual({ status: "pass", attempts: 2, at: "2026-07-03T10:00:00Z" });
  });
});

describe("mergeResults", () => {
  const existing = normalizeResults(v1);
  const incoming = normalizeResults(v2);
  it("scoped merge upserts incoming and keeps other existing entries", () => {
    const m = mergeResults(existing, incoming, true);
    expect(m.results["bil-1"].attempts).toBe(2);          // updated
    expect(m.results["bil-4"].status).toBe("fail");       // preserved
    expect(m.generatedAt).toBe("2026-07-03T10:00:00Z");  // meta from incoming
    expect(m.commit).toBe("e4f5a6b");
  });
  it("full (unscoped) merge replaces the results map entirely", () => {
    const m = mergeResults(existing, incoming, false);
    expect(m.results["bil-4"]).toBeUndefined();
    expect(Object.keys(m.results)).toEqual(["bil-1"]);
  });
  it("scoped merge with no existing file behaves like full", () => {
    expect(mergeResults(null, incoming, true).results["bil-1"].attempts).toBe(2);
  });
});

// R2-B: additive entry fields `error` (failed cases) and `commit` (recording commit).
// v1 strings and pre-R2B v2 objects have neither — normalization must NOT invent them.
describe("ResultEntry error/commit fields (R2-B, additive)", () => {
  const v2WithFields = JSON.stringify({
    generatedAt: "2026-07-06T08:00:00Z", commit: "aaaa111",
    results: {
      "uw-8": { status: "fail", attempts: 2, at: "2026-07-06T08:00:00Z", error: "Error: boom", commit: "9f8e7d6" },
      "uw-9": { status: "pass", attempts: 1, at: "2026-07-06T08:00:00Z", commit: "9f8e7d6" },
    },
  });

  it("normalizeResults passes error/commit through on v2 entries", () => {
    const r = normalizeResults(v2WithFields);
    expect(r.results["uw-8"].error).toBe("Error: boom");
    expect(r.results["uw-8"].commit).toBe("9f8e7d6");
    expect(r.results["uw-9"].error).toBeUndefined();
    expect(r.results["uw-9"].commit).toBe("9f8e7d6");
  });

  it("does not invent error/commit for v1 strings or older v2 objects", () => {
    const r1 = normalizeResults(v1);
    expect(r1.results["bil-1"].error).toBeUndefined();
    expect(r1.results["bil-1"].commit).toBeUndefined();
    const r2 = normalizeResults(v2);
    expect(r2.results["bil-1"].error).toBeUndefined();
    expect(r2.results["bil-1"].commit).toBeUndefined();
  });

  it("scoped merge preserves the untouched entries' error/commit fields", () => {
    const existing = normalizeResults(v2WithFields);
    const incoming: ResultsFileV2 = {
      generatedAt: "2026-07-07T00:00:00Z", commit: "bbbb222",
      results: { "uw-9": { status: "pass", attempts: 1, at: "2026-07-07T00:00:00Z", commit: "bbbb222" } },
    };
    const m = mergeResults(existing, incoming, true);
    expect(m.results["uw-8"].error).toBe("Error: boom");   // untouched entry keeps its fields
    expect(m.results["uw-8"].commit).toBe("9f8e7d6");
    expect(m.results["uw-9"].commit).toBe("bbbb222");      // rerecorded entry carries the new commit
  });
});
