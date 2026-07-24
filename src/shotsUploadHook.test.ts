import { describe, it, expect } from "vitest";
import { shouldAutoUpload, uploadCaseArg } from "./shotsUploadHook";

// Pure decision logic for syncResults.ts's end-of-run auto-upload hook (spec §5 item 3):
// runs after results are written, before chaining `sync`; only for a FULL batch or a
// `--case` list covering >=1 case; KG_SHOTS_UPLOAD=0 disables; never blocks the results path.
describe("shouldAutoUpload", () => {
  it("uploads for a full batch run (no --flow/--case scoping) with at least one case", () => {
    expect(shouldAutoUpload({ caseCount: 12, env: {} })).toBe(true);
  });
  it("uploads for a --case-scoped run covering >=1 case", () => {
    expect(shouldAutoUpload({ caseCount: 1, env: {} })).toBe(true);
  });
  it("does not upload when zero cases ran, scoped or not", () => {
    expect(shouldAutoUpload({ caseCount: 0, env: {} })).toBe(false);
    expect(shouldAutoUpload({ caseCount: 0, env: {} })).toBe(false);
  });
  it("KG_SHOTS_UPLOAD=0 disables regardless of scope/count", () => {
    expect(shouldAutoUpload({ caseCount: 5, env: { KG_SHOTS_UPLOAD: "0" } })).toBe(false);
  });
  it("any other KG_SHOTS_UPLOAD value (including unset) leaves it enabled", () => {
    expect(shouldAutoUpload({ caseCount: 5, env: { KG_SHOTS_UPLOAD: "1" } })).toBe(true);
    expect(shouldAutoUpload({ caseCount: 5, env: {} })).toBe(true);
  });
});

describe("uploadCaseArg", () => {
  it("builds the --case argument scoped to exactly the case ids just run", () => {
    expect(uploadCaseArg(["BIL-1", "BIL-2", "ADD-3"])).toBe("BIL-1,BIL-2,ADD-3");
  });
  it("returns undefined for an empty case list (caller should not invoke the upload)", () => {
    expect(uploadCaseArg([])).toBeUndefined();
  });
});
