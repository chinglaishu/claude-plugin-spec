import { describe, it, expect } from "vitest";
import { repoOf, nsId } from "./repo";

describe("repoOf", () => {
  it("maps backend paths", () => {
    expect(repoOf("dojostack_backend/.github/system-design/00_platform/X.md")).toBe("backend");
  });
  it("maps frontend paths", () => {
    expect(repoOf("dojostack_frontend/e2e/cases/house-view.cases.yaml")).toBe("frontend");
  });
  it("maps workspace-root paths to main", () => {
    expect(repoOf(".github/instructions/security.instructions.md")).toBe("main");
    expect(repoOf("CLAUDE.md")).toBe("main");
    expect(repoOf(undefined)).toBe("main");
  });
});

describe("nsId", () => {
  it("prefixes the bare id with the repo scope", () => {
    expect(nsId("dojostack_backend/.github/x.md", "financial-terminology")).toBe("backend:financial-terminology");
    expect(nsId(undefined, "copilot-instructions")).toBe("main:copilot-instructions");
  });
});
