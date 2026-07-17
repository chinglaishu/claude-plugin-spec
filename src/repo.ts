export function repoOf(path: string | undefined): "main" | "backend" | "frontend" {
  const p = path ?? "";
  if (p.startsWith("dojostack_backend/")) return "backend";
  if (p.startsWith("dojostack_frontend/")) return "frontend";
  return "main";
}

export function nsId(path: string | undefined, bare: string): string {
  return `${repoOf(path)}:${bare}`;
}
