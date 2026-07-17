import { describe, it, expect } from "vitest";
import { parseCases } from "./parseCases";

const yaml = `
- id: HV-1
  title: Publish new version propagates
  status: pass
  parallelSafe: true
  spec: house-view-cascade.spec.ts
  playwrightTitle: "02 — dependent property inherits the new House View value"
  verifies: [house-view-freeze]
  covers: [REQ-HV-FREEZE-01]
  exercises: [services/house_view/]
  features: [hv.publish]
  steps:
    - action: Open the House View page
      expected: The active version list renders
      screenshot: hv-1-list.png
    - action: Publish a draft version
      expected: The property schedule reflects the new rate
- id: HV-2
  title: Save draft stays isolated
  status: pass
  verifies: [house-view-freeze]
`;

describe("parseCases", () => {
  const { nodes, edges } = parseCases({ path: "dojostack_frontend/e2e/cases/house-view.cases.yaml", content: yaml });

  it("creates a test node per case, tagged kind e2e", () => {
    expect(nodes.map((n) => n.id).sort()).toEqual(["frontend:HV-1", "frontend:HV-2"]);
    expect(nodes.every((n) => n.type === "test")).toBe(true);
    expect(nodes.every((n) => n.kind === "e2e")).toBe(true);
    expect(nodes.find((n) => n.id === "frontend:HV-1")?.spec).toBe("house-view-cascade.spec.ts");
  });
  it("emits verifies/covers/exercises + explicit feature tags edges", () => {
    expect(edges).toContainEqual({ from: "frontend:HV-1", to: "house-view-freeze", type: "verifies", source: "dojostack_frontend/e2e/cases/house-view.cases.yaml" });
    expect(edges).toContainEqual({ from: "frontend:HV-1", to: "REQ-HV-FREEZE-01", type: "covers", source: "dojostack_frontend/e2e/cases/house-view.cases.yaml" });
    expect(edges).toContainEqual({ from: "frontend:HV-1", to: "services/house_view/", type: "exercises", source: "dojostack_frontend/e2e/cases/house-view.cases.yaml" });
    expect(edges).toContainEqual({ from: "frontend:HV-1", to: "hv.publish", type: "tags", source: "dojostack_frontend/e2e/cases/house-view.cases.yaml" });
  });
  it("parses steps (action/expected/optional screenshot) when present, undefined otherwise", () => {
    const hv1 = nodes.find((n) => n.id === "frontend:HV-1")!;
    expect(hv1.steps).toEqual([
      { action: "Open the House View page", expected: "The active version list renders", screenshot: "hv-1-list.png" },
      { action: "Publish a draft version", expected: "The property schedule reflects the new rate", screenshot: undefined },
    ]);
    const hv2 = nodes.find((n) => n.id === "frontend:HV-2")!;
    expect(hv2.steps).toBeUndefined();
  });
  it("parses playwrightTitle when present, undefined otherwise", () => {
    expect(nodes.find((n) => n.id === "frontend:HV-1")?.playwrightTitle).toBe("02 — dependent property inherits the new House View value");
    expect(nodes.find((n) => n.id === "frontend:HV-2")?.playwrightTitle).toBeUndefined();
  });
  it("parses parallelSafe when true, undefined when absent", () => {
    expect(nodes.find((n) => n.id === "frontend:HV-1")?.parallelSafe).toBe(true);
    expect(nodes.find((n) => n.id === "frontend:HV-2")?.parallelSafe).toBeUndefined();
  });
});
