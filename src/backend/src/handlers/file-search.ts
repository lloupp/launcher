import { readdir, stat } from "node:fs/promises";
import { join, basename, dirname, sep } from "node:path";
import { homedir } from "node:os";

import type { FileSearchPayload, FileSearchResult, FileEntry } from "../protocol.js";
import { log } from "../log.js";

/* ─── Fuzzy matching (reused from app-discovery logic) ─── */

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;

  let qi = 0;
  let score = 0;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive;
    } else {
      consecutive = 0;
    }
  }

  if (qi < q.length) return -1;
  if (t.startsWith(q)) score += 50;
  if (t === q) score += 100;
  return score;
}

/* ─── Directory walking ─── */

/** Directories to never traverse. */
const IGNORED_DIRS = new Set([
  "node_modules", ".git", "$Recycle.Bin", "System Volume Information",
  "Windows", "ProgramData", "AppData", ".cache", ".vscode",
  "__pycache__", ".venv", "venv", "site-packages",
]);

/** File extensions to never index. */
const IGNORED_EXTS = new Set([
  ".tmp", ".log", ".pdb", ".obj", ".o", ".lib", ".a", ".class",
  ".pyc", ".pyo", ".cache", ".DS_Store", ".lnk", ".tmp",
]);

/** Max results to return. */
const MAX_RESULTS = 50;

/** Walk a directory recursively, calling onFile for each file/dir. */
async function walk(
  dir: string,
  onFile: (entry: FileEntry) => void,
  opts: { maxDepth: number; maxFiles: number; signal?: AbortSignal },
  depth = 0,
  counter = { count: 0 },
): Promise<void> {
  if (depth > opts.maxDepth || counter.count >= opts.maxFiles) return;
  if (opts.signal?.aborted) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (counter.count >= opts.maxFiles || opts.signal?.aborted) return;

    const name = entry.name;
    const fullPath = join(dir, name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(name)) continue;
      const fileEntry: FileEntry = {
        path: fullPath,
        name,
        isDirectory: true,
        size: 0,
        modified: 0,
      };
      onFile(fileEntry);
      counter.count++;
      await walk(fullPath, onFile, opts, depth + 1, counter);
    } else if (entry.isFile()) {
      if (IGNORED_EXTS.has(name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "")) continue;
      try {
        const st = await stat(fullPath);
        const fileEntry: FileEntry = {
          path: fullPath,
          name,
          isDirectory: false,
          size: st.size,
          modified: st.mtimeMs,
        };
        onFile(fileEntry);
        counter.count++;
      } catch {
        // Skip inaccessible files.
      }
    }
  }
}

/* ─── Handlers ─── */

/** Common search directories for the user. */
function getDefaultSearchDirs(): string[] {
  const home = homedir();
  return [
    join(home, "Desktop"),
    join(home, "Documents"),
    join(home, "Downloads"),
    join(home, "Pictures"),
    join(home, "Music"),
    join(home, "Videos"),
    join(home, "projetos"),
  ].filter(Boolean);
}

export async function handleFileSearch(
  payload: FileSearchPayload,
  ctx: { signal?: AbortSignal },
): Promise<FileSearchResult> {
  const start = Date.now();
  const query = payload.query.trim();
  const limit = payload.limit ?? MAX_RESULTS;
  const searchDirs = payload.directory
    ? [payload.directory]
    : getDefaultSearchDirs();

  const results: Array<{ entry: FileEntry; score: number }> = [];

  for (const dir of searchDirs) {
    await walk(
      dir,
      (entry) => {
        const score = fuzzyMatch(query, entry.name);
        if (score > 0) {
          results.push({ entry, score });
        }
      },
      { maxDepth: 5, maxFiles: 5000, signal: ctx.signal },
    );
  }

  // Sort by fuzzy score (desc), then by modified date (desc).
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.entry.modified - a.entry.modified;
  });

  const top = results.slice(0, limit);
  const elapsed = Date.now() - start;

  log.debug("file-search", `Query "${query}" → ${results.length} matches in ${elapsed}ms`);

  return {
    files: top.map((r) => r.entry),
    total: results.length,
    elapsed,
  };
}

/** Quick path stat for opening or previewing files. */
export async function handleFileInfo(
  payload: { path: string },
): Promise<FileEntry> {
  const st = await stat(payload.path);
  return {
    path: payload.path,
    name: basename(payload.path),
    isDirectory: st.isDirectory(),
    size: st.size,
    modified: st.mtimeMs,
  };
}
