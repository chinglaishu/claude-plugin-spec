import { describe, it, expect } from "vitest";
import { slugify } from "./ids";

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("House View Freeze")).toBe("house-view-freeze");
  });
  it("strips punctuation and edge dashes", () => {
    expect(slugify("  Financial: Formula_Reference! ")).toBe("financial-formula-reference");
  });
});
