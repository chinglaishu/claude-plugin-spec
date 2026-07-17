import { createHash } from "node:crypto";

/** Stable content-identity for a conflict finding: hash of scope + subject.
 *  Deterministic (no Date/random) so a re-scan of the same subject in the same scope
 *  yields the same id — the basis for sticky dismiss/resolve (REQ-KG-CONF-05). The scope
 *  length is prefixed so the scope/subject boundary is unambiguous (id("b c","a") and
 *  id("c","a b") must differ even though "a b c" concatenates both ways). */
export function conflictId(subject: string, scope: string): string {
  const h = createHash("sha1").update(`${scope.length}|${scope}|${subject}`).digest("hex");
  return `cf-${h.slice(0, 10)}`;
}
