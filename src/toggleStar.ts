/**
 * Toggle `star: true` on a single feature entry inside a `*.features.yaml`
 * document, editing the raw text (not a parse→serialize round-trip) so comments,
 * ordering, and formatting are preserved. Powers the viewer's click-to-star in
 * serve mode: the YAML stays the single source of truth, the edit is just
 * automated instead of hand-typed.
 *
 * @param yaml  full file contents
 * @param bareFeatureId  the authored feature id (e.g. "fin.deal-return"), NOT namespaced
 * @param star  desired state: true = ensure `star: true`; false = ensure no star line
 * @returns the modified document
 * @throws if no `- id: <bareFeatureId>` entry exists
 */
export function toggleStarInYaml(yaml: string, bareFeatureId: string, star: boolean): string {
  const lines = yaml.split("\n");
  const esc = bareFeatureId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `- id: value` — value optionally quoted, optional trailing spaces / comment.
  const idRe = new RegExp(`^(\\s*)-\\s+id:\\s*["']?${esc}["']?\\s*(#.*)?$`);

  let idLine = -1;
  let indent = "";
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(idRe);
    if (m) { idLine = i; indent = m[1]; break; }
  }
  if (idLine === -1) throw new Error(`feature id not found: ${bareFeatureId}`);

  // Field indent = the id line's leading whitespace + 2 (fields align under `id`,
  // which sits after the "- " marker).
  const fieldIndent = indent + "  ";

  // Scan the entry block: from the id line until the next list item at the same
  // indent (`^<indent>- `) or EOF. Find an existing top-level `star:` field.
  // The match is anchored to EXACTLY the entry's field indent so a nested key
  // named `star` (e.g. deeper under `requirements:`) is never matched, moved,
  // or deleted — the whole point of this text edit is to preserve structure.
  let starLine = -1;
  const itemRe = new RegExp(`^${indent}-\\s`);
  const starRe = new RegExp(`^${fieldIndent}star\\s*:`);
  for (let i = idLine + 1; i < lines.length; i++) {
    if (itemRe.test(lines[i])) break;   // next sibling entry — end of this block
    if (starRe.test(lines[i])) starLine = i;
  }

  if (star) {
    if (starLine !== -1) {
      lines[starLine] = `${fieldIndent}star: true`;
    } else {
      lines.splice(idLine + 1, 0, `${fieldIndent}star: true`);
    }
  } else if (starLine !== -1) {
    lines.splice(starLine, 1);
  }
  return lines.join("\n");
}
