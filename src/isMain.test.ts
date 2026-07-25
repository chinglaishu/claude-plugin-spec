// covers: REQ-KG-SUB-06
import { describe, it, expect } from "vitest";
import { pathToFileURL } from "node:url";
import { isMain } from "./isMain";

/**
 * REQ-KG-SUB-06 — the canonical answer to "am I the process entrypoint?", chosen by the CEO on
 * 2026-07-26 as position B of conflict cf-4b6d6187fc.
 *
 * Six CLI modules answered this three ways. The two cases below are exactly where the three
 * disagreed, so each is a real defect in one of the losing positions rather than a hypothetical:
 *
 *   - a path needing URL encoding (a space) — position C string-concatenated `file://` onto argv[1]
 *     and produced an unencoded URL that never matched, then leaned on a filename-suffix fallback to
 *     get the right answer for the wrong reason;
 *   - an absent argv[1] — position A called `pathToFileURL(undefined)`, which throws.
 */
describe("isMain — one answer, in one place", () => {
  it("is true when the module is the invoked script", () => {
    const url = pathToFileURL("/repo/src/build.ts").href;
    expect(isMain(url, "/repo/src/build.ts")).toBe(true);
  });

  it("is false when some other script was invoked", () => {
    const url = pathToFileURL("/repo/src/build.ts").href;
    expect(isMain(url, "/repo/src/serve.ts")).toBe(false);
  });

  // Position C's PRIMARY comparison is wrong here — `file://` + "/repo/my project/…" yields a raw
  // space that never equals the encoded import.meta.url. Verified by running C against this test: it
  // still passes, because the filename fallback catches what the comparison missed. So this pins the
  // right answer without discriminating C from B; the suffix case below is what actually catches C.
  it("is true for a path that needs URL encoding", () => {
    const path = "/repo/my project/src/build.ts";
    expect(isMain(pathToFileURL(path).href, path)).toBe(true);
  });

  // Position A's defect: pathToFileURL(undefined) throws, taking the whole process down at import
  // time — for a module that was only ever imported, never run.
  it("is false, and does not throw, when no script was invoked", () => {
    const url = pathToFileURL("/repo/src/build.ts").href;
    expect(() => isMain(url, undefined)).not.toThrow();
    expect(isMain(url, undefined)).toBe(false);
  });

  // The suffix fallback position C used: any invoked script whose name merely ENDS WITH this
  // module's filename claimed to be it. `run-build.ts` is not `build.ts`.
  it("is false for a different script whose filename merely ends with this one's", () => {
    const url = pathToFileURL("/repo/src/build.ts").href;
    expect(isMain(url, "/repo/src/run-build.ts")).toBe(false);
  });
});
