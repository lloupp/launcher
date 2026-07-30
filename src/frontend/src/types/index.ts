/** Shared types matching the backend protocol.ts */

export interface AppEntry {
  id: string;
  name: string;
  path: string;
  iconPath?: string;
  source: "start-menu" | "winget" | "uwp" | "path" | "control-panel";
}

export interface ClipboardEntry {
  id: string;
  kind: "text" | "image" | "files";
  text?: string;
  paths?: string[];
  imagePath?: string;
  timestamp: number;
  pinned?: boolean;
}

export interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export interface CalcResult {
  result: string;
  formatted?: string;
}

export interface ExtensionEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  commands: Array<{
    name: string;
    title: string;
    description: string;
    mode: "view" | "no-view" | "menu-bar";
  }>;
}

/** Discriminated union of all result types the launcher can show. */
export type SearchResult =
  | { type: "app"; app: AppEntry }
  | { type: "file"; file: FileEntry }
  | { type: "calc"; calc: CalcResult }
  | { type: "clipboard"; entry: ClipboardEntry }
  | { type: "extension"; extension: ExtensionEntry; commandName: string }
  | { type: "ai"; query: string };
