// Resolve the backend venv's python across the two layouts a monorepo may use: the venv may live at
// the workspace root (`<repoRoot>/.venv`) OR inside the backend package (`<backendDir>/.venv`). Pick
// whichever exists so the orchestrated E2E backend doesn't fail with a missing-interpreter ENOENT
// when the checkout puts the venv in the non-default spot. Falls back to the root-level path (the
// historical default) when neither exists yet.
//
// A project's Playwright config typically needs the same resolution; the two are duplicated rather
// than shared because the tool and the project are separate packages.
//
// OPEN QUESTION §12.7, deliberately left open: a generic tool arguably should not know what a Python
// venv is, and this should probably become an opaque command the project supplies. That is a
// requirement change and the CEO's to make, so phase 2 only removed the hardcoded LOCATIONS — which
// is all REQ-0 forces, since `repoRoot` and `backendDir` were already parameters. The knowledge that
// a backend is Python, run under uvicorn, still lives in serve.ts.
export function resolveBackendVenvPython(
  repoRoot: string,
  backendDir: string,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
  join: (...segments: string[]) => string
): string {
  const relPython =
    platform === "win32" ? join("Scripts", "python.exe") : join("bin", "python");
  const candidates = [
    join(repoRoot, ".venv", relPython),
    join(backendDir, ".venv", relPython),
  ];
  return candidates.find((candidate) => exists(candidate)) ?? candidates[0];
}
