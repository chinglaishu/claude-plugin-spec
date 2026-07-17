// syncResults grep-channel decision. On Windows, `npx playwright test <~40 specs> -g "<85 ORed
// titles>"` overflows the ~8191-char cmd line → "command line too long" → no report → abort.
// Fix: pass the grep via the E2E_KG_GREP env var (length-safe, ~32KB Windows limit) instead of a
// `-g` argv, and skip the grep entirely for a full "run everything" scope (a grep of all cases is
// pointless). buildRunGrep is the pure decision the runner uses to populate that env var.
import { describe, it, expect } from "vitest";
import { buildRunGrep } from "./runGrep";

const titles = ["a wizard draft persists", "UW-8 reverse yield", "a.b (c)"];

describe("buildRunGrep", () => {
  it("returns undefined for a full (unscoped) run — no grep, run all specs", () => {
    expect(buildRunGrep(titles, false)).toBeUndefined();
  });

  it("for a scoped run, ORs the ESCAPED titles into one regex (regex metachars escaped; '-' is literal outside a class)", () => {
    const g = buildRunGrep(["a.b (c)", "UW-8"], true);
    expect(g).toBe("a\\.b \\(c\\)|UW-8");
  });

  it("compiles to a RegExp that matches its member titles and not others", () => {
    const g = buildRunGrep(["a wizard draft persists", "UW-8 reverse yield"], true)!;
    const re = new RegExp(g);
    expect(re.test("a wizard draft persists")).toBe(true);
    expect(re.test("UW-8 reverse yield")).toBe(true);
    expect(re.test("some other unrelated title")).toBe(false);
  });

  it("returns undefined for a scoped run with zero titles (nothing to grep)", () => {
    expect(buildRunGrep([], true)).toBeUndefined();
  });
});
