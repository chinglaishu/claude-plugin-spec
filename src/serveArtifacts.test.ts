import { describe, it, expect } from "vitest";
import { runArtifactUrl } from "./serveArtifacts";

describe("runArtifactUrl", () => {
  it("maps a report screenshot to /run-artifacts/<runId>/<basename>", () => {
    expect(runArtifactUrl("run-abc", "C:\\x\\svc_frontend\\test-results\\t\\test-failed-1.png"))
      .toBe("/run-artifacts/run-abc/test-failed-1.png");
  });
  it("url-encodes the run id and the file basename", () => {
    expect(runArtifactUrl("run abc", "/a/b/shot 1.png")).toBe("/run-artifacts/run%20abc/shot%201.png");
  });
});
