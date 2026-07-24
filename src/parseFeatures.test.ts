import { describe, it, expect } from "vitest";
import { REPOS } from "./topology.fixture";
import { parseFeatures } from "./parseFeatures";

const yaml = `
- id: add.mapping
  label: Column mapping
  flow: add
  paths:
    - "**/addProperty/steps/step2/ColumnMappingStage.test.tsx"
    - "**/svc_ai/**column_mapping**"
- id: add.validate
  label: Data review & validation
  flow: add
  paths: ["**/rowValidation.test.ts"]
- { }
`;

describe("parseFeatures", () => {
  const { nodes, edges } = parseFeatures({ path: "svc_frontend/e2e/features/onboarding.features.yaml", content: yaml }, REPOS);

  it("creates one feature node per entry, skipping entries without an id", () => {
    expect(nodes.map((n) => n.id).sort()).toEqual(["frontend:add.mapping", "frontend:add.validate"]);
    expect(nodes.every((n) => n.type === "feature")).toBe(true);
  });

  it("namespaces the id by repo and keeps the authored dotted slug", () => {
    const m = nodes.find((n) => n.id === "frontend:add.mapping")!;
    expect(m.title).toBe("Column mapping");
    expect(m.flow).toBe("add");
    expect(m.paths).toEqual([
      "**/addProperty/steps/step2/ColumnMappingStage.test.tsx",
      "**/svc_ai/**column_mapping**",
    ]);
  });

  it("defaults title to the id and paths to [] when omitted", () => {
    const bare = parseFeatures({ path: "svc_frontend/e2e/features/x.features.yaml", content: "- id: add.dup" }, REPOS);
    expect(bare.nodes[0]).toMatchObject({ id: "frontend:add.dup", title: "add.dup", paths: [] });
  });

  it("emits no edges (tag edges are derived elsewhere)", () => {
    expect(edges).toEqual([]);
  });

  it("emits requirement nodes + a feature→requirement `specifies` edge, carrying provenBy", () => {
    const reqYaml = `
- id: pfl.scenario
  label: Scenario modeling
  flow: pfl
  paths: ["**/x.test.ts"]
  requirements:
    - id: REQ-PFL-SCEN-01
      text: Removing a member and running recomputes the KPIs.
      covers: [PFL-1]
    - text: The Run button is disabled until an edit is applied.
- id: pfl.page
  label: Pricing Scenario — overview
  flow: pfl
  page: true
  paths: []
  requirements:
    - id: REQ-PFL-PAGE-01
      text: The page models levers without mutating saved data.
`;
    const { nodes, edges } = parseFeatures({ path: "svc_frontend/e2e/features/pricing.features.yaml", content: reqYaml }, REPOS);
    const reqs = nodes.filter((n) => n.type === "requirement");
    expect(reqs.map((r) => r.id).sort()).toEqual(["REQ-FRONTEND-PFL-SCENARIO-2", "REQ-PFL-PAGE-01", "REQ-PFL-SCEN-01"]); // authored ids kept; auto id (namespaced) for the untitled one
    const scen = reqs.find((r) => r.id === "REQ-PFL-SCEN-01")!;
    expect(scen.title).toBe("Removing a member and running recomputes the KPIs.");
    expect(scen.provenBy).toEqual(["PFL-1"]);
    // the page feature is flagged
    expect(nodes.find((n) => n.id === "frontend:pfl.page")!.page).toBe(true);
    // feature → requirement specifies edges
    expect(edges).toContainEqual({ from: "frontend:pfl.scenario", to: "REQ-PFL-SCEN-01", type: "specifies", source: "svc_frontend/e2e/features/pricing.features.yaml" });
    expect(edges.filter((e) => e.type === "specifies").length).toBe(3);
  });

  it("parses `star: true` as a feature-node favourite flag (defaults undefined)", () => {
    const starYaml = `
- id: bil.versions
  label: Versions
  flow: bil
  star: true
  paths: []
- id: bil.leasing
  label: Leasing
  flow: bil
  paths: []
- id: bil.macro
  label: Macro
  flow: bil
  star: false
  paths: []
`;
    const { nodes } = parseFeatures({ path: "svc_frontend/e2e/features/billing.features.yaml", content: starYaml }, REPOS);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId["frontend:bil.versions"].star).toBe(true);
    expect(byId["frontend:bil.leasing"].star).toBeUndefined();  // omitted → undefined, not false, so consumers can use truthy check
    expect(byId["frontend:bil.macro"].star).toBeUndefined();    // explicit false also normalises to undefined — the field is a flag, not a tri-state
  });

  // PIN (provenance contract, not TDD — locks existing behaviour): the serve-mode
  // `/registry/<basename>` + GitHub-blob provenance links resolve a requirement's
  // origin from `node.path`, so requirement nodes MUST carry `path` equal to the
  // registry yaml they were authored in (parseFeatures.ts stamps `path: input.path`
  // on both feature and requirement nodes). If this ever regresses, registry
  // provenance links in the viewer silently vanish — fail loudly here instead.
  it("PIN: requirement nodes carry `path` = the registry yaml path they came from", () => {
    const regPath = "svc_frontend/e2e/features/underwriting.features.yaml";
    const { nodes } = parseFeatures({
      path: regPath,
      content: `
- id: uw.deal-return
  label: Deal return
  flow: uw
  paths: []
  requirements:
    - id: REQ-FIN-DEALRETURN-03
      text: A messy upload still renders a deal return after blocking errors are resolved.
    - text: An untitled requirement also inherits the registry path.
`,
    }, REPOS);
    const reqs = nodes.filter((n) => n.type === "requirement");
    expect(reqs.length).toBe(2);
    for (const r of reqs) expect(r.path).toBe(regPath);
    // the feature node carries the same provenance path
    expect(nodes.find((n) => n.type === "feature")!.path).toBe(regPath);
  });

  it("tolerates a mis-authored non-list root (mapping/scalar/empty) without throwing", () => {
    // A registry authored as a top-level mapping or scalar must not abort the build.
    expect(() => parseFeatures({ path: "x.features.yaml", content: "id: add.oops\nlabel: nope" }, REPOS)).not.toThrow();
    expect(parseFeatures({ path: "x.features.yaml", content: "id: add.oops" }, REPOS).nodes).toEqual([]);
    expect(parseFeatures({ path: "x.features.yaml", content: "" }, REPOS).nodes).toEqual([]);
    expect(parseFeatures({ path: "x.features.yaml", content: "just a string" }, REPOS).nodes).toEqual([]);
  });
});
