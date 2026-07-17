import { describe, it, expect } from "vitest";
import { deriveAxis, normalizeFinding } from "./conflictModel";
import { conflictId } from "./conflictId";
import type { ConflictParticipant } from "./types";

const p = (kind: ConflictParticipant["kind"], positionId: string): ConflictParticipant =>
  ({ kind, ref: `${kind}:x`, quote: "q", positionId });

describe("deriveAxis", () => {
  it("doc when all participants are doc/req/test", () => {
    expect(deriveAxis([p("doc", "A"), p("req", "A"), p("test", "B")])).toBe("doc");
  });
  it("code when all participants are code", () => {
    expect(deriveAxis([p("code", "A"), p("code", "B")])).toBe("code");
  });
  it("mixed when doc-ish and code participants coexist", () => {
    expect(deriveAxis([p("doc", "A"), p("code", "B")])).toBe("mixed");
  });
});

describe("normalizeFinding", () => {
  const base = {
    subject: "npi_margin denominator", category: "formula", severity: "high", tags: ["pfl"], why: "disagree",
    positions: [
      { id: "A", statement: "/ gross_income", heldBy: ["doc:fin"] },
      { id: "B", statement: "/ effective_income", heldBy: ["code:run"] },
    ],
    participants: [
      { kind: "doc", ref: "doc:fin", quote: "/ gross_income", positionId: "A" },
      { kind: "code", ref: "run.py", quote: "/ effective_income", positionId: "B" },
    ],
  };
  it("stamps the content id and derives axis", () => {
    const f = normalizeFinding(base, "pfl")!;
    expect(f.id).toBe(conflictId("npi_margin denominator", "pfl"));
    expect(f.axis).toBe("mixed");
    expect(f.scope).toBe("pfl");
  });
  it("rejects fewer than 2 participants (not a cluster)", () => {
    expect(normalizeFinding({ ...base, participants: [base.participants[0]] }, "pfl")).toBeNull();
  });
  it("rejects fewer than 2 positions", () => {
    expect(normalizeFinding({ ...base, positions: [base.positions[0]] }, "pfl")).toBeNull();
  });
  it("rejects a participant whose positionId references no declared position", () => {
    const bad = { ...base, participants: [base.participants[0], { ...base.participants[1], positionId: "Z" }] };
    expect(normalizeFinding(bad, "pfl")).toBeNull();
  });
  it("rejects a non-object / missing subject", () => {
    expect(normalizeFinding(null, "pfl")).toBeNull();
    expect(normalizeFinding({ ...base, subject: "" }, "pfl")).toBeNull();
  });
});
