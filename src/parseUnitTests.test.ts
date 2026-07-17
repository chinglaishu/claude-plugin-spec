import { describe, it, expect } from "vitest";
import { parseUnitTest } from "./parseUnitTests";

const feContent = `import { describe, it, expect } from "vitest";
import { deriveCompletenessErrors } from "./rowValidation";

describe("deriveCompletenessErrors — cycle tenant/trade detection", () => {
  it("does NOT flag tenant/trade as missing when data lives in lc fields", () => {});
  it("flags a genuinely missing unit", () => {});
});
`;

const beContent = `"""Contract tests for the update_property_rent_roll stored procedure.

Pins that existing units are updated in place, never deleted.
"""
import re

def test_function_signature(): pass
def test_units_updated_in_place(): pass
def test_leases_reconciled(): pass
`;

describe("parseUnitTest", () => {
  it("parses a Vitest file into a unit-fe node (kind, title=basename, description, count)", () => {
    const { nodes, edges } = parseUnitTest({
      path: "dojostack_frontend/src/app/(main)/properties/addProperty/steps/step2/rowValidation.test.ts",
      content: feContent,
    });
    expect(edges).toEqual([]);
    expect(nodes).toHaveLength(1);
    const n = nodes[0];
    expect(n.type).toBe("test");
    expect(n.kind).toBe("unit-fe");
    expect(n.id).toBe("frontend:src/app/(main)/properties/addProperty/steps/step2/rowValidation.test.ts");
    expect(n.title).toBe("rowValidation.test.ts");
    expect(n.text).toBe("deriveCompletenessErrors — cycle tenant/trade detection");
    expect(n.testCount).toBe(2);
    expect(n.status).toBe("pass"); // authored/derived default until run results override
    expect(n.source).toBe(feContent); // full file source carried for the viewer's view-source
  });

  it("extracts a `summary` from the leading // comment block (FE) and the module docstring (BE)", () => {
    // CRLF line endings on purpose — Windows checkouts use them, and a naive `$`-anchored
    // line scan silently misses `//` comment runs on CRLF files.
    const feWithComment = [
      'import { describe, it, expect } from "vitest";',
      'import { evaluateAnalysisDateChange } from "./analysisDateGuard";',
      '',
      '// eslint-disable-next-line',
      '// Both Step 1 and Step 2 pipe analysis-date changes through these helpers.',
      '// Tests pin the gate so the two surfaces never silently drift apart again.',
      'describe("evaluateAnalysisDateChange", () => {',
      '  it("returns noop when the new date equals the current date", () => {});',
      '});',
    ].join("\r\n");
    const fe = parseUnitTest({ path: "dojostack_frontend/src/a.test.ts", content: feWithComment }).nodes[0];
    expect(fe.text).toBe("evaluateAnalysisDateChange"); // the "what"
    expect(fe.summary).toBe("Both Step 1 and Step 2 pipe analysis-date changes through these helpers. Tests pin the gate so the two surfaces never silently drift apart again."); // the "why", eslint directive skipped

    const be = parseUnitTest({ path: "dojostack_backend/tests/test_x.py", content: beContent }).nodes[0];
    expect(be.summary).toBe("Contract tests for the update_property_rent_roll stored procedure. Pins that existing units are updated in place, never deleted.");

    // A file with no leading comment gets no summary (viewer falls back to the title alone).
    expect(parseUnitTest({ path: "dojostack_frontend/src/b.test.ts", content: feContent }).nodes[0].summary).toBeUndefined();
  });

  it("counts chained test forms (it.each/it.only/test.skip) and ignores method calls like regex.test(", () => {
    const src = `import { describe, it, test, expect } from "vitest";
describe("counting", () => {
  it("a", () => {});
  it.each([1,2])("b %s", () => {});
  it.only("c", () => {});
  test.skip("d", () => {});
  test("e", () => { expect(/x/.test("x")).toBe(true); });
});`;
    const { nodes } = parseUnitTest({ path: "dojostack_frontend/src/foo.test.ts", content: src });
    // it, it.each, it.only, test.skip, test → 5; the `.test(` method call is NOT counted.
    expect(nodes[0].testCount).toBe(5);
  });

  it("parses a pytest file into a unit-be node (docstring description, def test_ count)", () => {
    const { nodes } = parseUnitTest({
      path: "dojostack_backend/tests/test_update_property_rent_roll_sql_contract.py",
      content: beContent,
    });
    const n = nodes[0];
    expect(n.kind).toBe("unit-be");
    expect(n.id).toBe("backend:tests/test_update_property_rent_roll_sql_contract.py");
    expect(n.title).toBe("test_update_property_rent_roll_sql_contract.py");
    expect(n.text).toBe("Contract tests for the update_property_rent_roll stored procedure.");
    expect(n.testCount).toBe(3);
  });
});
