import { describe, it, expect } from "vitest";
import { fixPlanFor, fixPlan } from "./conflictFixPlan";
import type { ConflictFinding } from "./types";

const finding = (id: string): ConflictFinding => ({
  id, subject: "npi_margin", scope: "pfl", category: "formula", severity: "high", axis: "mixed", tags: [], why: "",
  positions: [
    { id: "A", statement: "/ gross_income", heldBy: ["doc:fin"] },
    { id: "B", statement: "/ effective_income", heldBy: ["run.py"] },
  ],
  participants: [
    { kind: "doc", ref: "doc:fin", quote: "/ gross_income", positionId: "A", span: "§3" },
    { kind: "code", ref: "run.py", quote: "/ effective_income", positionId: "B" },
  ],
});

describe("fixPlanFor", () => {
  it("targets the dissenters (non-canonical participants), classified by fix type", () => {
    const plan = fixPlanFor(finding("cf-1"), "A")!; // A canonical → code participant (B) is the dissenter
    expect(plan.canonicalStatement).toBe("/ gross_income");
    expect(plan.targets).toEqual([{ ref: "run.py", kind: "code", via: "code-tdd", quote: "/ effective_income", span: undefined }]);
  });
  it("routes a dissenting doc to a doc-edit and a dissenting code to a code-tdd", () => {
    const plan = fixPlanFor(finding("cf-1"), "B")!; // B canonical → doc participant (A) is the dissenter
    expect(plan.targets).toEqual([{ ref: "doc:fin", kind: "doc", via: "doc-edit", quote: "/ gross_income", span: "§3" }]);
  });
  it("returns null when the canonical position id does not exist", () => {
    expect(fixPlanFor(finding("cf-1"), "Z")).toBeNull();
  });
});

describe("fixPlan", () => {
  it("builds plans only for resolved decisions that name a canonical position", () => {
    const findings = [finding("cf-1"), finding("cf-2"), finding("cf-3")];
    const decisions = {
      "cf-1": { status: "resolved" as const, positionId: "A" },
      "cf-2": { status: "dismissed" as const },
      "cf-3": { status: "resolved" as const }, // no positionId → skipped
    };
    const plans = fixPlan(findings, decisions);
    expect(plans.map((p) => p.findingId)).toEqual(["cf-1"]);
  });
});
