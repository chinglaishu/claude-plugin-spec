// covers: REQ-KG-RUN-05
import { describe, it, expect } from "vitest";
import { orchestratePlan } from "./ensureOrchestrated";

describe("orchestratePlan", () => {
  it("defaults ON when KG_ORCHESTRATE is unset", () => {
    expect(orchestratePlan({}).enabled).toBe(true);
  });
  it("stays ON for KG_ORCHESTRATE=1 (and any non-'0' value)", () => {
    expect(orchestratePlan({ KG_ORCHESTRATE: "1" }).enabled).toBe(true);
    expect(orchestratePlan({ KG_ORCHESTRATE: "true" }).enabled).toBe(true);
  });
  it("opts OUT only for the exact string '0'", () => {
    expect(orchestratePlan({ KG_ORCHESTRATE: "0" }).enabled).toBe(false);
  });
});
