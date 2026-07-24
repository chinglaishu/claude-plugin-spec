// Proves REQ-FX-3: an empty order totals zero, and the fixture's unit-test indexing with it.
import { describe, expect, it } from "vitest";
import { total } from "./checkout";

describe("total", () => {
  it("totals an empty order to zero", () => {
    expect(total([])).toBe(0);
  });
});
