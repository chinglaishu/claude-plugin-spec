// covers: REQ-KG-CONF-02
import { describe, it, expect } from "vitest";
import { codeCandidatePairs, declaredSymbols, isProofFile } from "./codeCandidates";

/**
 * REQ-KG-CONF-02, code half. A project arriving with code and no docs has no `governs:`, no
 * requirements and no registries — so the doc-anchored enumerator yields ZERO pairs and the scan finds
 * nothing at all. That is the customer the product is for, so the surface has to reach code directly.
 *
 * The bound moves; it does not disappear. Pairs come from a SHARED DECLARED SYMBOL: two files that
 * declare no name in common never become a candidate, and a name declared everywhere is not a signal.
 */

const tax = {
  path: "src/billing/tax.ts",
  text: `export const TAX_BASIS = "subtotal";\nexport function applyTax(order) { return order.subtotal * 0.2; }\n`,
};
const invoice = {
  path: "src/invoice/render.py",
  text: `TAX_BASIS = "discounted_total"\ndef apply_tax(order):\n    return order.discounted_total * 0.2\n`,
};
const unrelated = {
  path: "src/mailer.ts",
  text: `export function sendMail(to) { return fetch("/mail", { body: to }); }\n`,
};

describe("declaredSymbols", () => {
  it("picks up declarations across languages", () => {
    expect(declaredSymbols(tax.text)).toEqual(expect.arrayContaining(["TAX_BASIS", "applyTax"]));
    expect(declaredSymbols(invoice.text)).toEqual(expect.arrayContaining(["TAX_BASIS", "apply_tax"]));
  });

  // Short and ubiquitous names pair everything with everything — the combinatorial explosion that
  // makes a surface useless rather than merely large.
  it("ignores names too short to carry meaning", () => {
    expect(declaredSymbols("const x = 1;\nconst id = 2;\n")).toEqual([]);
  });

  // A rule lives on a module's surface. A working variable inside a function body shares its name with
  // half the codebase by coincidence, and matching those was 149 junk pairs on this repo alone.
  it("ignores locals inside a function body, and keeps the module's own surface", () => {
    const text = [
      "export const RETRY_LIMIT = 3;",
      "export function retry(job) {",
      "  const results = [];",
      "  let attempts = 0;",
      "  return results;",
      "}",
    ].join("\n");
    expect(declaredSymbols(text)).toEqual(["RETRY_LIMIT", "retry"]);
  });
});

/**
 * Measured on this repo before this existed: 164 of 280 code pairs involved a test file — two suites
 * both declaring `CONFIG` or `PINNED`, which is a shared fixture convention, not a disagreement.
 * Behaviour lives in source; tests are the proof of it. A surface that is 59% noise is the failure
 * §12.10 describes, where the CEO stops opening the inbox.
 */
describe("isProofFile", () => {
  it("recognises tests by the project's own declared globs", () => {
    expect(isProofFile("src/checkout.test.ts", { unitTestGlobs: ["src/**/*.test.ts"], e2eDir: "e2e" })).toBe(true);
    expect(isProofFile("e2e/checkout.spec.ts", { unitTestGlobs: [], e2eDir: "e2e" })).toBe(true);
    expect(isProofFile("src/checkout.ts", { unitTestGlobs: ["src/**/*.test.ts"], e2eDir: "e2e" })).toBe(false);
  });

  // A project that declares no globs still must not have its suites treated as behaviour.
  it("falls back to the near-universal filename convention when a project declares nothing", () => {
    expect(isProofFile("lib/thing.spec.js", { unitTestGlobs: [], e2eDir: "" })).toBe(true);
    expect(isProofFile("tests/test_rates.py", { unitTestGlobs: [], e2eDir: "" })).toBe(true);
    expect(isProofFile("lib/thing.js", { unitTestGlobs: [], e2eDir: "" })).toBe(false);
  });
});

describe("codeCandidatePairs", () => {
  it("pairs two files that declare the same symbol", () => {
    const pairs = codeCandidatePairs([tax, invoice, unrelated]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ kind: "code-code", a: "src/billing/tax.ts", b: "src/invoice/render.py" });
  });

  it("never pairs files with no shared declaration", () => {
    expect(codeCandidatePairs([tax, unrelated])).toEqual([]);
  });

  // A symbol every file declares (a framework hook, a re-exported helper) says nothing about either
  // file. Precision is the whole product here, so ubiquity disqualifies.
  it("drops a symbol declared in too many files to be distinctive", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      path: `src/mod${i}.ts`,
      text: `export function handleRequest(){}\n`,
    }));
    expect(codeCandidatePairs(many, { maxFilesPerSymbol: 5 })).toEqual([]);
  });

  it("is deterministic and deduped — the same tree always enumerates the same surface", () => {
    const third = { path: "src/zzz/legacy.ts", text: `const TAX_BASIS = "gross";\nfunction applyTax(){}\n` };
    const once = codeCandidatePairs([tax, invoice, third]);
    const again = codeCandidatePairs([third, invoice, tax]);
    expect(once).toEqual(again);
    // Two shared symbols between the same two files is still ONE pair to adjudicate.
    expect(once.filter((p) => p.a === "src/billing/tax.ts" && p.b === "src/zzz/legacy.ts")).toHaveLength(1);
  });

  // Without this the adjudicator has to re-derive, by reading two whole files, the one thing the
  // enumerator already knew: which name they have in common and therefore what to compare.
  it("says WHY the pair was made, so the reader knows what to compare", () => {
    const pairs = codeCandidatePairs([tax, invoice, unrelated]);
    expect(pairs[0].sharedSymbols).toEqual(["TAX_BASIS"]);
  });

  // A silent cap reads as "we looked at everything" when it did not.
  it("reports what a cap dropped instead of truncating quietly", () => {
    const files = Array.from({ length: 12 }, (_, i) => ({ path: `src/f${i}.ts`, text: `const SHARED_RATE = ${i};\n` }));
    const { pairs, dropped } = codeCandidatePairs(files, { maxFilesPerSymbol: 20, limit: 5, withReport: true });
    expect(pairs).toHaveLength(5);
    expect(dropped).toBeGreaterThan(0);
  });
});
