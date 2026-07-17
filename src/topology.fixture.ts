// topology.fixture.ts — the workspace shape the tests parse against.
//
// A FIXTURE, not a topology the tool believes in. Two reasons it lives in one place:
//
//   1. REQ-0 forbids src/ from naming any consuming project, and tests are src/. A test asserting
//      `repoOf("<project>_backend/x") === "backend"` is the tool knowing that project — it just knows
//      it in the test file instead of the parser. The names here are deliberately anonymous: any
//      two-nested-repo workspace exercises the same code paths, which is exactly the claim REQ-0 makes.
//   2. Re-declaring the topology across ten test files would reproduce the defect §10.9 exists to kill,
//      one directory over. The tests get one owner for the same reason the tool does.
import { parseConfig, type Config, type Repos } from "./config";

/** A root repo plus two nested siblings — the shape with the most edge cases. Nothing here depends
 *  on WHICH project it resembles; that is the point. */
export const REPOS: Repos = [
  { name: "main", subdir: "" },
  { name: "backend", subdir: "svc_backend" },
  { name: "frontend", subdir: "svc_frontend" },
];

/** The degenerate case: one repo owning the workspace root. The case a three-repo project can never
 *  exercise, and the one that decides whether "reusable" is real (founding design §8). */
export const SOLO: Repos = [{ name: "main", subdir: "" }];

/** A full config over REPOS, laid out the way a workspace with a nested frontend usually is. */
export const CONFIG: Config = parseConfig(
  JSON.stringify({
    repos: REPOS,
    e2eDir: "svc_frontend/e2e",
    artifactDir: "tools/kg",
    unitTestGlobs: [
      "svc_frontend/src/**/*.test.ts",
      "svc_frontend/src/**/*.test.tsx",
      "svc_backend/tests/**/test_*.py",
      "svc_backend/tests/**/*_test.py",
      "tools/kg/src/**/*.test.ts",
    ],
    runners: { backend: "backend", frontend: "frontend" },
  }),
);

/** A full config over SOLO — everything at the workspace root, no siblings. */
export const SOLO_CONFIG: Config = parseConfig(
  JSON.stringify({ repos: SOLO, e2eDir: "e2e", artifactDir: "kg", unitTestGlobs: ["src/**/*.test.ts"] }),
);
