import { describe, it, expect } from "vitest";
import { REPOS } from "./topology.fixture";
import { parseCases } from "./parseCases";

const yaml = `
- id: BIL-1
  title: Publish new version propagates
  status: pass
  parallelSafe: true
  spec: billing-cascade.spec.ts
  playwrightTitle: "02 — dependent property inherits the new Billing value"
  verifies: [billing-freeze]
  covers: [REQ-BIL-FREEZE-01]
  exercises: [services/billing/]
  features: [bil.publish]
  steps:
    - action: Open the Billing page
      expected: The active version list renders
      screenshot: bil-1-list.png
    - action: Publish a draft version
      expected: The property schedule reflects the new rate
- id: BIL-2
  title: Save draft stays isolated
  status: pass
  verifies: [billing-freeze]
`;

describe("parseCases", () => {
  const { nodes, edges } = parseCases({ path: "svc_frontend/e2e/cases/billing.cases.yaml", content: yaml }, REPOS);

  it("creates a test node per case, tagged kind e2e", () => {
    expect(nodes.map((n) => n.id).sort()).toEqual(["frontend:BIL-1", "frontend:BIL-2"]);
    expect(nodes.every((n) => n.type === "test")).toBe(true);
    expect(nodes.every((n) => n.kind === "e2e")).toBe(true);
    expect(nodes.find((n) => n.id === "frontend:BIL-1")?.spec).toBe("billing-cascade.spec.ts");
  });
  it("emits verifies/covers/exercises + explicit feature tags edges", () => {
    expect(edges).toContainEqual({ from: "frontend:BIL-1", to: "billing-freeze", type: "verifies", source: "svc_frontend/e2e/cases/billing.cases.yaml" });
    expect(edges).toContainEqual({ from: "frontend:BIL-1", to: "REQ-BIL-FREEZE-01", type: "covers", source: "svc_frontend/e2e/cases/billing.cases.yaml" });
    expect(edges).toContainEqual({ from: "frontend:BIL-1", to: "services/billing/", type: "exercises", source: "svc_frontend/e2e/cases/billing.cases.yaml" });
    expect(edges).toContainEqual({ from: "frontend:BIL-1", to: "bil.publish", type: "tags", source: "svc_frontend/e2e/cases/billing.cases.yaml" });
  });
  it("parses steps (action/expected/optional screenshot) when present, undefined otherwise", () => {
    const hv1 = nodes.find((n) => n.id === "frontend:BIL-1")!;
    expect(hv1.steps).toEqual([
      { action: "Open the Billing page", expected: "The active version list renders", screenshot: "bil-1-list.png" },
      { action: "Publish a draft version", expected: "The property schedule reflects the new rate", screenshot: undefined },
    ]);
    const hv2 = nodes.find((n) => n.id === "frontend:BIL-2")!;
    expect(hv2.steps).toBeUndefined();
  });
  it("parses playwrightTitle when present, undefined otherwise", () => {
    expect(nodes.find((n) => n.id === "frontend:BIL-1")?.playwrightTitle).toBe("02 — dependent property inherits the new Billing value");
    expect(nodes.find((n) => n.id === "frontend:BIL-2")?.playwrightTitle).toBeUndefined();
  });
  it("parses parallelSafe when true, undefined when absent", () => {
    expect(nodes.find((n) => n.id === "frontend:BIL-1")?.parallelSafe).toBe(true);
    expect(nodes.find((n) => n.id === "frontend:BIL-2")?.parallelSafe).toBeUndefined();
  });
});
