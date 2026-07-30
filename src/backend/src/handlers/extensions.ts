import { readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import type { ExtensionListResult, ExtensionInvokePayload } from "../protocol.js";
import { log } from "../log.js";

/* ─── Extension manifest ─── */

export interface ExtensionManifest {
  name: string;
  description: string;
  version: string;
  commands: Array<{
    name: string;
    title: string;
    description: string;
    mode: "view" | "no-view" | "menu-bar";
    /** JS/TS entry file relative to extension root. */
    entry: string;
  }>;
}

/* ─── Extension registry ─── */

interface LoadedExtension {
  id: string;
  manifest: ExtensionManifest;
  rootDir: string;
  /** Map of command name → loaded module. */
  modules: Map<string, unknown>;
}

const loadedExtensions = new Map<string, LoadedExtension>();
const extensionIds: string[] = [];

/** Get the extensions directory. */
function getExtensionsDir(): string {
  // This mirrors how Raycast does it: ~/.config/launcher/extensions
  return join(homedir(), ".config", "launcher", "extensions");
}

/** Scan the extensions directory and load all manifests. */
async function scanExtensions(): Promise<void> {
  const extDir = getExtensionsDir();
  let entries;
  try {
    entries = await readdir(extDir, { withFileTypes: true });
  } catch {
    log.info("extensions", `Extensions directory not found: ${extDir}`);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(extDir, entry.name, "package.json");
    try {
      const manifestText = await import("node:fs/promises").then(
        (fs) => fs.readFile(manifestPath, "utf-8")
      );
      const pkg = JSON.parse(manifestText);

      // Extract manifest from package.json
      if (!pkg.launcher || !pkg.launcher.commands) {
        log.warn("extensions", `Skipping ${entry.name}: no "launcher" field in package.json`);
        continue;
      }

      const manifest: ExtensionManifest = {
        name: pkg.name,
        description: pkg.description ?? "",
        version: pkg.version ?? "0.0.0",
        commands: pkg.launcher.commands,
      };

      const extId = entry.name;
      loadedExtensions.set(extId, {
        id: extId,
        manifest,
        rootDir: join(extDir, entry.name),
        modules: new Map(),
      });
      extensionIds.push(extId);
      log.info("extensions", `Loaded: ${manifest.name} v${manifest.version} (${manifest.commands.length} commands)`);
    } catch (err) {
      log.warn("extensions", `Failed to load extension ${entry.name}: ${err}`);
    }
  }
}

/* ─── Handlers ─── */

export async function handleExtensionList(): Promise<ExtensionListResult> {
  if (extensionIds.length === 0) await scanExtensions();
  return {
    extensions: [...loadedExtensions.values()].map((ext) => ({
      id: ext.id,
      name: ext.manifest.name,
      description: ext.manifest.description,
      version: ext.manifest.version,
      commands: ext.manifest.commands,
    })),
  };
}

export async function handleExtensionInvoke(
  payload: ExtensionInvokePayload,
): Promise<unknown> {
  if (extensionIds.length === 0) await scanExtensions();

  const ext = loadedExtensions.get(payload.extensionId);
  if (!ext) throw new Error(`Extension not found: ${payload.extensionId}`);

  const command = ext.manifest.commands.find((c) => c.name === payload.commandName);
  if (!command) throw new Error(`Command not found: ${payload.commandName}`);

  // Lazy-load the command module
  let mod = ext.modules.get(command.name);
  if (!mod) {
    const entryPath = join(ext.rootDir, command.entry);
    const entryUrl = pathToFileURL(entryPath).href;
    try {
      mod = await import(entryUrl);
      ext.modules.set(command.name, mod);
    }  catch (err) {
      throw new Error(`Failed to load extension command "${command.name}": ${err}`);
    }
  }

  // Call the default export or a named "run" export
  const fn = (mod as Record<string, unknown>).default ?? (mod as Record<string, unknown>).run;
  if (typeof fn !== "function") {
    throw new Error(`Extension command "${command.name}" does not export a default function`);
  }

  return await fn(payload.input);
}

/** Force rescan of extensions directory. */
export async function handleExtensionRefresh(): Promise<{ total: number }> {
  loadedExtensions.clear();
  extensionIds.length = 0;
  await scanExtensions();
  return { total: loadedExtensions.size };
}
