import { sep } from "node:path";

// Path-traversal guard shared by every static-serving site in serve.ts
// (`/shots/`, the feature-path resolver behind `/api/star`, and the generic
// static-file fallback). A bare `abs.startsWith(normalizedRoot)` has a boundary
// bug: root "…/shots" also matches "…/shots-evil/x" as a string prefix, even
// though "shots-evil" is a SIBLING directory, not a descendant. Requiring the
// separator (or an exact match on the root itself) closes that gap.
export function isWithinRoot(root: string, abs: string): boolean {
  if (abs === root) return true;
  const withSep = root.endsWith(sep) ? root : root + sep;
  return abs.startsWith(withSep);
}
