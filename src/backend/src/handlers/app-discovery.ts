import { readdir, stat, access } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";

import type {
  AppEntry,
  AppSearchPayload,
  AppSearchResult,
  AppLaunchPayload,
} from "../protocol.js";
import { frecencyScore } from "../router.js";
import { log } from "../log.js";

const execFileAsync = promisify(execFile);

/* ─── Frecency store (in-memory; will migrate to SQLite later) ─── */

interface AppFrecency {
  accessCount: number;
  lastAccessed: number;
}

const frecency = new Map<string, AppFrecency>();

/* ─── App Discovery ─── */

/** Scan the Windows Start Menu for .lnk files. */
async function scanStartMenu(): Promise<AppEntry[]> {
  const dirs = [
    join(process.env.ProgramData ?? "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
    join(homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs"),
  ];

  const apps: AppEntry[] = [];
  for (const dir of dirs) {
    try {
      await scanLnkDir(dir, apps);
    } catch {
      // Directory might not exist in some environments.
    }
  }
  return apps;
}

/** Recursively scan a directory for .lnk files. */
async function scanLnkDir(dir: string, apps: AppEntry[], depth = 0): Promise<void> {
  if (depth > 4) return; // Safety limit
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanLnkDir(fullPath, apps, depth + 1);
    } else if (entry.name.toLowerCase().endsWith(".lnk")) {
      const name = entry.name.replace(/\.lnk$/i, "");
      apps.push({
        id: `lnk:${fullPath}`,
        name,
        path: fullPath,
        source: "start-menu",
      });
    }
  }
}

/** Scan UWP/MSIX apps via PowerShell. */
async function scanUwpApps(): Promise<AppEntry[]> {
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      "Get-AppxPackage | Where-Object { $_.InstallLocation } | Select-Object Name, PackageFullName, InstallLocation | ConvertTo-Json",
    ], { timeout: 5000, maxBuffer: 1024 * 1024 * 10 });

    if (!stdout.trim()) return [];
    const data = JSON.parse(stdout);
    const packages = Array.isArray(data) ? data : [data];

    return packages.map((pkg: { Name: string; PackageFullName: string; InstallLocation: string }) => ({
      id: `uwp:${pkg.PackageFullName}`,
      name: pkg.Name,
      path: pkg.InstallLocation,
      source: "uwp" as const,
    }));
  } catch {
    log.warn("app-discovery", "UWP scan failed (PowerShell not available or no packages)");
    return [];
  }
}

/** Scan PATH for executables. */
async function scanPath(): Promise<AppEntry[]> {
  const pathDirs = (process.env.PATH ?? "").split(";");
  const apps: AppEntry[] = [];
  const seen = new Set<string>();

  for (const dir of pathDirs) {
    if (!dir || seen.has(dir.toLowerCase())) continue;
    seen.add(dir.toLowerCase());
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.(exe)$/i.test(entry.name)) {
          apps.push({
            id: `path:${join(dir, entry.name)}`,
            name: entry.name.replace(/\.exe$/i, ""),
            path: join(dir, entry.name),
            source: "path",
          });
        }
      }
    } catch {
      // Skip inaccessible dirs.
    }
  }
  return apps;
}

/** Scan Control Panel applets (.cpl files). */
async function scanControlPanel(): Promise<AppEntry[]> {
  const sysDir = process.env.SystemRoot ?? "C:\\Windows\\System32";
  const apps: AppEntry[] = [];
  try {
    const entries = await readdir(sysDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.cpl$/i.test(entry.name)) {
        const friendlyName = cplNames[entry.name.toLowerCase()] ?? entry.name.replace(/\.cpl$/i, "");
        apps.push({
          id: `cpl:${join(sysDir, entry.name)}`,
          name: friendlyName,
          path: join(sysDir, entry.name),
          source: "control-panel",
        });
      }
    }
  } catch {
    // System32 might not be accessible.
  }
  return apps;
}

/** Friendly names for common .cpl applets. */
const cplNames: Record<string, string> = {
  "appwiz.cpl": "Programs and Features",
  "desk.cpl": "Display Settings",
  "inetcpl.cpl": "Internet Options",
  "joy.cpl": "Game Controllers",
  "main.cpl": "Mouse Properties",
  "mmsys.cpl": "Sound Settings",
  "ncpa.cpl": "Network Connections",
  "powercfg.cpl": "Power Options",
  "sysdm.cpl": "System Properties",
  "timedate.cpl": "Date and Time",
  "firewall.cpl": "Windows Firewall",
  "hdwwiz.cpl": "Device Manager",
};

/* ─── Fuzzy search ─── */

/** Simple subsequence-based fuzzy match. Returns a score or -1 for no match. */
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
      score += consecutive; // Consecutive matches score higher
    } else {
      consecutive = 0;
    }
  }

  if (qi < q.length) return -1; // Not all query chars matched

  // Bonus for matching at word boundaries.
  if (t.startsWith(q)) score += 50;
  // Bonus for shorter names (exact name match scores highest).
  if (t === q) score += 100;

  return score;
}

/* ─── Cache ─── */

let appCache: AppEntry[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

async function getAppCache(): Promise<AppEntry[]> {
  const now = Date.now();
  if (appCache && now - cacheTime < CACHE_TTL) return appCache;

  log.debug("app-discovery", "Scanning for apps...");
  const [startMenu, uwp, pathApps, controlPanel] = await Promise.all([
    scanStartMenu(),
    scanUwpApps(),
    scanPath(),
    scanControlPanel(),
  ]);

  appCache = [...startMenu, ...uwp, ...pathApps, ...controlPanel];
  cacheTime = now;
  log.info("app-discovery", `Found ${appCache.length} apps (Start Menu: ${startMenu.length}, UWP: ${uwp.length}, PATH: ${pathApps.length}, CPL: ${controlPanel.length})`);

  return appCache;
}

/* ─── Handlers ─── */

export async function handleAppSearch(
  payload: AppSearchPayload,
): Promise<AppSearchResult> {
  const apps = await getAppCache();
  const limit = payload.limit ?? 20;

  if (!payload.query.trim()) {
    // Return all apps sorted by frecency when query is empty.
    const sorted = apps
      .map((app) => {
        const fr = frecency.get(app.id);
        return { app, score: fr ? frecencyScore(fr.accessCount, fr.lastAccessed) : 0 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { apps: sorted.map((s) => s.app), total: apps.length };
  }

  const scored = apps
    .map((app) => ({
      app,
      matchScore: fuzzyMatch(payload.query, app.name),
      frScore: (() => {
        const fr = frecency.get(app.id);
        return fr ? frecencyScore(fr.accessCount, fr.lastAccessed) : 0;
      })(),
    }))
    .filter((s) => s.matchScore > 0)
    .sort((a, b) => {
      // Combine fuzzy score + frecency: (matchScore * 100) + frecency
      const aScore = a.matchScore * 100 + a.frScore;
      const bScore = b.matchScore * 100 + b.frScore;
      return bScore - aScore;
    })
    .slice(0, limit);

  return {
    apps: scored.map((s) => s.app),
    total: scored.length,
  };
}

export async function handleAppLaunch(
  payload: AppLaunchPayload,
): Promise<{ launched: true; id: string }> {
  const apps = await getAppCache();
  const app = apps.find((a) => a.id === payload.id);
  if (!app) throw new Error(`App not found: ${payload.id}`);

  // Launch via the OS default handler (ShellExecute equivalent).
  const { spawn } = await import("node:child_process");
  if (app.source === "uwp") {
    // UWP apps need to be launched via shell:AppsFolder
    spawn("explorer", [`shell:AppsFolder\\${app.id.replace("uwp:", "")}`], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("cmd", ["/c", "start", "", "", app.path], { detached: true, stdio: "ignore" }).unref();
  }

  // Update frecency
  const fr = frecency.get(app.id) ?? { accessCount: 0, lastAccessed: 0 };
  fr.accessCount++;
  fr.lastAccessed = Date.now();
  frecency.set(app.id, fr);

  log.info("app-discovery", `Launched: ${app.name} (${app.id})`);
  return { launched: true as const, id: app.id };
}

/** Force a rescan of all app sources. */
export async function handleAppRescan(): Promise<{ total: number }> {
  appCache = null;
  const apps = await getAppCache();
  return { total: apps.length };
}
