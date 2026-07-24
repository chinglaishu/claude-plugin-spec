import { describe, it, expect } from "vitest";
import { REPOS } from "./topology.fixture";
import { parseCache } from "./parseCache";

const yaml = `
- id: bil-versions-query
  key: "['billing-versions', orgId]"
  kind: fe-query
  ttl: 5 min
  populate: useBillingVersions
  invalidate:
    - "billing_version.ts (publish/update/archive)"
  status: covered
  features: [bil.versions]
  note: org-scoped list
- id: metrics-batch
  key: "['pricing-metrics-batch', ids]"
  kind: fe-query
  ttl: 10 min
  populate: usePricingMetricsBatch
  invalidate: []
  status: stale
  features: [pfl.list]
- { }
`;

describe("parseCache", () => {
  const { nodes, edges } = parseCache({ path: "svc_frontend/e2e/cache/billing.cache.yaml", content: yaml }, REPOS);

  it("creates a cache-entry node per entry, skipping entries without an id", () => {
    expect(nodes.map((n) => n.id).sort()).toEqual([
      "frontend:bil-versions-query",
      "frontend:metrics-batch",
    ]);
    expect(nodes.every((n) => n.type === "cache-entry")).toBe(true);
  });

  it("maps key→title, kind/ttl/populate/invalidate/status, note→text", () => {
    const n = nodes.find((x) => x.id === "frontend:bil-versions-query")!;
    expect(n.title).toBe("['billing-versions', orgId]");
    expect(n.cacheKind).toBe("fe-query");
    expect(n.ttl).toBe("5 min");
    expect(n.populate).toBe("useBillingVersions");
    expect(n.invalidate).toEqual(["billing_version.ts (publish/update/archive)"]);
    expect(n.status).toBe("covered");
    expect(n.text).toBe("org-scoped list");
  });

  it("emits a tags edge to each declared feature", () => {
    expect(edges).toEqual([
      { from: "frontend:bil-versions-query", to: "bil.versions", type: "tags", source: "svc_frontend/e2e/cache/billing.cache.yaml" },
      { from: "frontend:metrics-batch", to: "pfl.list", type: "tags", source: "svc_frontend/e2e/cache/billing.cache.yaml" },
    ]);
  });

  it("keeps an empty invalidate list (a real staleness signal) and drops an unknown kind", () => {
    const n = nodes.find((x) => x.id === "frontend:metrics-batch")!;
    expect(n.invalidate).toEqual([]);
    expect(n.status).toBe("stale");
  });

  it("tolerates a non-list root without throwing", () => {
    expect(() => parseCache({ path: "x.cache.yaml", content: "key: nope" }, REPOS)).not.toThrow();
    expect(parseCache({ path: "x.cache.yaml", content: "" }, REPOS).nodes).toEqual([]);
  });
});
