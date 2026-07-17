// Resolve the backend venv's python across the two layouts this monorepo uses:
// the venv may live at the workspace root (`<repoRoot>/.venv`) OR inside the
// backend package (`dojostack_backend/.venv`). Pick whichever exists so the
// orchestrated E2E backend doesn't fail with a missing-interpreter ENOENT when
// the checkout puts the venv in the non-default spot. Falls back to the
// root-level path (the historical default) when neither exists yet.
//
// Mirrors dojostack_frontend/playwright.config.ts's resolveBackendVenvPython —
// duplicated (not imported) because this tool and the frontend are separate
// packages; keep both in sync if the venv layout logic changes.
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
