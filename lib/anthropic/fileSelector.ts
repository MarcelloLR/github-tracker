export interface TreeEntry {
  path: string;
  type: string; // "blob" | "tree"
  size?: number;
  sha: string;
}

const SKIP_DIRS = ["node_modules", "vendor", "dist", "build", ".next", "out", "target"];
const SKIP_SUFFIX = [".lock", ".min.js", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".pdf", ".woff", ".woff2"];

const MAX_FILES = 25;
const MAX_FILE_BYTES = 60_000;

/**
 * Deterministically pick high-signal source files for a deep-dive (no LLM),
 * capped at MAX_FILES. Entrypoints/config rank first. See docs/SPEC.md.
 */
export function selectFiles(tree: TreeEntry[]): TreeEntry[] {
  const blobs = tree.filter(
    (e) =>
      e.type === "blob" &&
      (e.size ?? 0) <= MAX_FILE_BYTES &&
      !SKIP_DIRS.some((d) => e.path === d || e.path.startsWith(`${d}/`) || e.path.includes(`/${d}/`)) &&
      !SKIP_SUFFIX.some((s) => e.path.toLowerCase().endsWith(s)),
  );

  const score = (p: string): number => {
    if (/^(package\.json|pyproject\.toml|go\.mod|cargo\.toml|readme)/i.test(p)) return 0;
    if (/(^|\/)(index|main|app|server)\.[tj]sx?$/.test(p)) return 1;
    if (/(^|\/)(routes?|schema|models?|api)\b/i.test(p)) return 2;
    return 3;
  };

  return blobs
    .sort((a, b) => score(a.path) - score(b.path) || (b.size ?? 0) - (a.size ?? 0))
    .slice(0, MAX_FILES);
}
