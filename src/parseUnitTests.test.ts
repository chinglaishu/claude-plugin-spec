import { describe, it, expect } from "vitest";
import { REPOS } from "./topology.fixture";
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
      path: "svc_frontend/src/app/(main)/properties/addProperty/steps/step2/rowValidation.test.ts",
      content: feContent,
    }, REPOS);
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
    const fe = parseUnitTest({ path: "svc_frontend/src/a.test.ts", content: feWithComment }, REPOS).nodes[0];
    expect(fe.text).toBe("evaluateAnalysisDateChange"); // the "what"
    expect(fe.summary).toBe("Both Step 1 and Step 2 pipe analysis-date changes through these helpers. Tests pin the gate so the two surfaces never silently drift apart again."); // the "why", eslint directive skipped

    const be = parseUnitTest({ path: "svc_backend/tests/test_x.py", content: beContent }, REPOS).nodes[0];
    expect(be.summary).toBe("Contract tests for the update_property_rent_roll stored procedure. Pins that existing units are updated in place, never deleted.");

    // A file with no leading comment gets no summary (viewer falls back to the title alone).
    expect(parseUnitTest({ path: "svc_frontend/src/b.test.ts", content: feContent }, REPOS).nodes[0].summary).toBeUndefined();
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
    const { nodes } = parseUnitTest({ path: "svc_frontend/src/foo.test.ts", content: src }, REPOS);
    // it, it.each, it.only, test.skip, test → 5; the `.test(` method call is NOT counted.
    expect(nodes[0].testCount).toBe(5);
  });

  it("parses a pytest file into a unit-be node (docstring description, def test_ count)", () => {
    const { nodes } = parseUnitTest({
      path: "svc_backend/tests/test_update_property_rent_roll_sql_contract.py",
      content: beContent,
    }, REPOS);
    const n = nodes[0];
    expect(n.kind).toBe("unit-be");
    expect(n.id).toBe("backend:tests/test_update_property_rent_roll_sql_contract.py");
    expect(n.title).toBe("test_update_property_rent_roll_sql_contract.py");
    expect(n.text).toBe("Contract tests for the update_property_rent_roll stored procedure.");
    expect(n.testCount).toBe(3);
  });
});

/**
 * `covers:` in a unit test (CEO 2026-07-24). Until now the ONLY way a requirement got a covering
 * test was a `*.cases.yaml` or a feature registry — both e2e artifacts — so a project with no UI
 * flows could never prove a requirement at all. This tool is exactly that project: 39 requirements,
 * 485 tests, and every requirement reading `uncovered`.
 *
 * Comment-anchored on purpose: a bare `covers:` appearing in test data or a string literal must not
 * be mistaken for a declaration.
 */
describe("declared covers", () => {
  const req = (src: string) => parseUnitTest({ path: "src/x.test.ts", content: src }, REPOS).edges;

  it("links a test to the requirement it declares it proves", () => {
    const e = req(`// covers: REQ-KG-01\nit('x', () => {})`);
    expect(e).toEqual([{ from: "main:src/x.test.ts", to: "REQ-KG-01", type: "covers", source: "src/x.test.ts" }]);
  });

  it("accepts several ids on one line", () => {
    expect(req(`// covers: REQ-A, REQ-B\n`).map((x) => x.to)).toEqual(["REQ-A", "REQ-B"]);
  });

  it("reads a JSDoc block and a python comment", () => {
    expect(req(`/**\n * covers: REQ-A\n */`).map((x) => x.to)).toEqual(["REQ-A"]);
    expect(
      parseUnitTest({ path: "tests/test_x.py", content: `# covers: REQ-B\n` }, REPOS).edges.map((x) => x.to),
    ).toEqual(["REQ-B"]);
  });

  it("does not mistake a covers: inside test data for a declaration", () => {
    expect(req(`it('x', () => { expect(y).toBe("covers: REQ-FAKE") })`)).toEqual([]);
  });

  it("emits nothing when the test declares nothing", () => {
    expect(req(`it('x', () => {})`)).toEqual([]);
  });
});
