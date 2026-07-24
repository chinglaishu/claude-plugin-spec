// covers: REQ-KG-SERVE-04
import { describe, it, expect } from "vitest";
import { toggleStarInYaml } from "./toggleStar";

const doc = `# a comment
- id: fin.deal-return
  label: Deal return
  flow: fin
  paths:
    - "**/deal/**"
- id: fin.engine
  label: Financial engine
  flow: fin
`;

describe("toggleStarInYaml", () => {
  it("adds `star: true` right under the matching id line, indented like siblings", () => {
    const out = toggleStarInYaml(doc, "fin.deal-return", true);
    expect(out).toContain("- id: fin.deal-return\n  star: true\n  label: Deal return");
    // untouched sibling
    expect(out).toContain("- id: fin.engine\n  label: Financial engine");
  });

  it("is idempotent when adding to an entry that is already starred", () => {
    const once = toggleStarInYaml(doc, "fin.deal-return", true);
    const twice = toggleStarInYaml(once, "fin.deal-return", true);
    expect(twice).toBe(once);
  });

  it("removes the `star: true` line when unstarring", () => {
    const starred = toggleStarInYaml(doc, "fin.deal-return", true);
    const cleared = toggleStarInYaml(starred, "fin.deal-return", false);
    expect(cleared).toBe(doc);
  });

  it("unstarring an entry that is not starred is a no-op", () => {
    expect(toggleStarInYaml(doc, "fin.engine", false)).toBe(doc);
  });

  it("only touches the targeted entry, not one whose id is a prefix/substring", () => {
    const two = `- id: fin.deal
  label: Deal
- id: fin.deal-return
  label: Deal return
`;
    const out = toggleStarInYaml(two, "fin.deal", true);
    expect(out).toBe(`- id: fin.deal
  star: true
  label: Deal
- id: fin.deal-return
  label: Deal return
`);
  });

  it("matches a quoted id value", () => {
    const q = `- id: "fin.deal-return"\n  label: Deal return\n`;
    expect(toggleStarInYaml(q, "fin.deal-return", true)).toContain('- id: "fin.deal-return"\n  star: true\n');
  });

  it("throws when the feature id is not found", () => {
    expect(() => toggleStarInYaml(doc, "nope.missing", true)).toThrow(/not found/i);
  });

  it("flips an explicit `star: false` to true in place (no duplicate line)", () => {
    const withFalse = `- id: fin.engine\n  star: false\n  label: Financial engine\n`;
    const out = toggleStarInYaml(withFalse, "fin.engine", true);
    expect(out).toBe(`- id: fin.engine\n  star: true\n  label: Financial engine\n`);
  });

  // Regression: the star scan must be depth-anchored — a key literally named
  // `star` nested inside the entry (deeper indent) must never be matched,
  // overwritten, or deleted.
  const nested = `- id: fin.x
  label: X
  meta:
    star: nested-value
- id: fin.y
  label: Y
`;
  it("ignores a nested `star:` key when adding a top-level star", () => {
    const out = toggleStarInYaml(nested, "fin.x", true);
    expect(out).toBe(`- id: fin.x
  star: true
  label: X
  meta:
    star: nested-value
- id: fin.y
  label: Y
`);
  });

  it("does not delete a nested `star:` key when unstarring the entry", () => {
    // fin.x has no top-level star, only a nested one → unstarring is a no-op
    // and must leave the nested key intact.
    expect(toggleStarInYaml(nested, "fin.x", false)).toBe(nested);
  });
});
