import { describe, it, expect } from "vitest";
import { parseCache } from "./parseCache";

const yaml = `
- id: hv-versions-query
  key: "['house-view-versions', orgId]"
  kind: fe-query
  ttl: 5 min
  populate: useHouseViewVersions
  invalidate:
    - "house_view_version.ts (publish/update/archive)"
  status: covered
  features: [hv.versions]
  note: org-scoped list
- id: metrics-batch
  key: "['portfolios-metrics-batch', ids]"
  kind: fe-query
  ttl: 10 min
  populate: usePortfolioMetricsBatch
  invalidate: []
  status: stale
  features: [pfl.list]
- { }
`;

describe("parseCache", () => {
  const { nodes, edges } = parseCache({ path: "dojostack_frontend/e2e/cache/house-view.cache.yaml", content: yaml });

  it("creates a cache-entry node per entry, skipping entries without an id", () => {
    expect(nodes.map((n) => n.id).sort()).toEqual([
      "frontend:hv-versions-query",
      "frontend:metrics-batch",
    ]);
    expect(nodes.every((n) => n.type === "cache-entry")).toBe(true);
  });

  it("maps key→title, kind/ttl/populate/invalidate/status, note→text", () => {
    const n = nodes.find((x) => x.id === "frontend:hv-versions-query")!;
    expect(n.title).toBe("['house-view-versions', orgId]");
    expect(n.cacheKind).toBe("fe-query");
    expect(n.ttl).toBe("5 min");
    expect(n.populate).toBe("useHouseViewVersions");
    expect(n.invalidate).toEqual(["house_view_version.ts (publish/update/archive)"]);
    expect(n.status).toBe("covered");
    expect(n.text).toBe("org-scoped list");
  });

  it("emits a tags edge to each declared feature", () => {
    expect(edges).toEqual([
      { from: "frontend:hv-versions-query", to: "hv.versions", type: "tags", source: "dojostack_frontend/e2e/cache/house-view.cache.yaml" },
      { from: "frontend:metrics-batch", to: "pfl.list", type: "tags", source: "dojostack_frontend/e2e/cache/house-view.cache.yaml" },
    ]);
  });

  it("keeps an empty invalidate list (a real staleness signal) and drops an unknown kind", () => {
    const n = nodes.find((x) => x.id === "frontend:metrics-batch")!;
    expect(n.invalidate).toEqual([]);
    expect(n.status).toBe("stale");
  });

  it("tolerates a non-list root without throwing", () => {
    expect(() => parseCache({ path: "x.cache.yaml", content: "key: nope" })).not.toThrow();
    expect(parseCache({ path: "x.cache.yaml", content: "" }).nodes).toEqual([]);
  });
});
