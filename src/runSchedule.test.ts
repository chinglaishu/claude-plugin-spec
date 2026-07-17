import { describe, it, expect } from "vitest";
import { planRun, buildRunArgs } from "./runSchedule";

const c = (id: string, parallelSafe?: boolean) => ({ id, parallelSafe });

describe("planRun", () => {
  it("splits parallelSafe ids into the pool and the rest into serial", () => {
    const plan = planRun([c("a", true), c("b"), c("d", true), c("e", false)], 3);
    expect(plan.pool).toEqual(["a", "d"]);
    expect(plan.serial).toEqual(["b", "e"]);
  });

  it("preserves input order within each list", () => {
    const plan = planRun([c("z", true), c("a", true), c("m"), c("b")], 2);
    expect(plan.pool).toEqual(["z", "a"]);
    expect(plan.serial).toEqual(["m", "b"]);
  });

  it("passes concurrency through when >= 1", () => {
    expect(planRun([c("a", true)], 3).concurrency).toBe(3);
    expect(planRun([c("a", true)], 1).concurrency).toBe(1);
  });

  it("clamps concurrency to >= 1 (0, negative, NaN, non-integer)", () => {
    expect(planRun([c("a", true)], 0).concurrency).toBe(1);
    expect(planRun([c("a", true)], -5).concurrency).toBe(1);
    expect(planRun([c("a", true)], NaN).concurrency).toBe(1);
    expect(planRun([c("a", true)], 2.9).concurrency).toBe(2);
  });

  it("treats a single parallelSafe case as a one-item pool (no special-casing)", () => {
    expect(planRun([c("only", true)], 3)).toEqual({ pool: ["only"], serial: [], concurrency: 3 });
  });

  it("returns empty lists for empty input", () => {
    expect(planRun([], 3)).toEqual({ pool: [], serial: [], concurrency: 3 });
  });

  it("treats only strict true as parallelSafe (undefined/false → serial)", () => {
    const plan = planRun([c("a"), c("b", false), c("t", true)], 2);
    expect(plan.pool).toEqual(["t"]);
    expect(plan.serial).toEqual(["a", "b"]);
  });
});

describe("buildRunArgs", () => {
  it("headed run (headless=false) pushes --headed when no persistent browser", () => {
    const { args, dropStepPause } = buildRunArgs({ spec: "auth-guard.spec.ts", grepArgs: [], retries: "1", headless: false, hasPersistentBrowser: false });
    expect(args).toEqual(["playwright", "test", "e2e/auth-guard.spec.ts", "--workers=1", "--retries=1", "--headed"]);
    expect(dropStepPause).toBe(false);
  });
  it("headless run omits --headed and drops step-pause pacing", () => {
    const { args, dropStepPause } = buildRunArgs({ spec: "auth-guard.spec.ts", grepArgs: ["-g", "x"], retries: "1", headless: true, hasPersistentBrowser: false });
    expect(args).toEqual(["playwright", "test", "e2e/auth-guard.spec.ts", "-g", "x", "--workers=1", "--retries=1"]);
    expect(dropStepPause).toBe(true);
  });
  it("headed run ALSO omits --headed when a persistent browser is up (it attaches, already headed)", () => {
    const { args } = buildRunArgs({ spec: "s.spec.ts", grepArgs: [], retries: "1", headless: false, hasPersistentBrowser: true });
    expect(args).not.toContain("--headed");
  });
});
