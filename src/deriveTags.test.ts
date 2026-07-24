// covers: REQ-KG-CORE-03
import { describe, it, expect } from "vitest";
import { matchingFeatures, deriveUnitTagEdges } from "./deriveTags";
import type { GraphNode } from "./types";

const feat = (id: string, paths: string[]): GraphNode => ({ id, type: "feature", title: id, paths });
const unit = (id: string, path: string, kind: "unit-fe" | "unit-be"): GraphNode => ({ id, type: "test", kind, title: id, path });

const features = [
  feat("frontend:add.mapping", ["**/step2/ColumnMappingStage.test.tsx", "**/dojo_ai/**column_mapping**"]),
  feat("frontend:add.validate", ["**/step2/rowValidation.test.ts", "**/dojo_ai/validators/**"]),
];

describe("matchingFeatures", () => {
  it("returns every feature whose globs match the path (a file can match several = cross-cuts)", () => {
    expect(matchingFeatures("svc_frontend/src/x/step2/rowValidation.test.ts", features)).toEqual(["frontend:add.validate"]);
    // a shared dir file matches both
    expect(
      matchingFeatures("svc_backend/tests/services/dojo_ai/validators/test_rent_validator.py", features).sort()
    ).toEqual(["frontend:add.validate"]);
  });
  it("returns [] when nothing matches, and ignores non-feature / empty-glob nodes", () => {
    expect(matchingFeatures("svc_frontend/src/unrelated/foo.test.ts", features)).toEqual([]);
    expect(matchingFeatures("x", [feat("frontend:empty", [])])).toEqual([]);
  });
});

describe("deriveUnitTagEdges", () => {
  it("emits a derived tags edge per (unit test, matching feature)", () => {
    const nodes = [
      ...features,
      unit("frontend:src/x/step2/rowValidation.test.ts", "svc_frontend/src/x/step2/rowValidation.test.ts", "unit-fe"),
    ];
    expect(deriveUnitTagEdges(nodes)).toEqual([
      { from: "frontend:src/x/step2/rowValidation.test.ts", to: "frontend:add.validate", type: "tags", source: "derived" },
    ]);
  });
  it("does not tag e2e tests (they use explicit `features:`), nor untagged unit files", () => {
    const nodes = [
      ...features,
      { id: "frontend:HV-1", type: "test", kind: "e2e", title: "x", path: "svc_frontend/e2e/cases/x.cases.yaml" } as GraphNode,
      unit("frontend:src/unrelated.test.ts", "svc_frontend/src/unrelated.test.ts", "unit-fe"),
    ];
    expect(deriveUnitTagEdges(nodes)).toEqual([]);
  });
});
