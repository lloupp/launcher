/**
 * Protocol types for WebSocket IPC between the Launcher host (WPF/WebView2)
 * and this Node.js backend.
 *
 * Every message is a JSON object with a `type` field identifying the command
 * and an optional `id` for request/response correlation.
 */

/** Core request envelope – sent by the frontend/host to the backend. */
export interface IPCRequest {
  /** Unique correlation id – echoed back in the response. */
  id: string;
  /** Channel name, e.g. "app.search", "clipboard.history", "calc.evaluate". */
  type: string;
  /** Optional payload depending on the channel. */
  payload?: unknown;
}

/** Core response envelope – sent by the backend to the frontend/host. */
export interface IPCResponse {
  /** Correlates with the request id. */
  id: string;
  /** Same channel name as the request. */
  type: string;
  /** Result data on success. */
  result?: unknown;
  /** Error message on failure. */
  error?: string;
}

/** Push event – unsolicited message from backend to frontend. */
export interface IPCEvent {
  /** Event channel, e.g. "clipboard.updated", "indexer.progress". */
  type: string;
  /** Event payload. */
  payload?: unknown;
}

/** Any incoming message is one of these three shapes. */
export type IPCMessage = IPCRequest | IPCResponse | IPCEvent;

/* ────────────── App Discovery ────────────── */

export interface AppEntry {
  id: string;
  name: string;
  path: string;
  iconPath?: string;
  /** Source where the app was discovered. */
  source: "start-menu" | "winget" | "uwp" | "path" | "control-panel";
}

export interface AppSearchPayload {
  query: string;
  limit?: number;
}

export interface AppSearchResult {
  apps: AppEntry[];
  total: number;
}

export interface AppLaunchPayload {
  id: string;
}

/* ────────────── Clipboard ────────────── */

export interface ClipboardEntry {
  id: string;
  /** "text" | "image" | "files" (paths) */
  kind: "text" | "image" | "files";
  /** Text content (for kind="text"). */
  text?: string;
  /** File paths (for kind="files"). */
  paths?: string[];
  /** Image path (for kind="image"). */
  imagePath?: string;
  /** Timestamp in ms since epoch. */
  timestamp: number;
  /** Pinned by user. */
  pinned?: boolean;
}

export interface ClipboardHistoryPayload {
  limit?: number;
  offset?: number;
}

export interface ClipboardHistoryResult {
  entries: ClipboardEntry[];
  total: number;
}

export interface ClipboardCopyPayload {
  text?: string;
  paths?: string[];
  imagePath?: string;
}

/* ────────────── Calculator ────────────── */

export interface CalcEvaluatePayload {
  expression: string;
}

export interface CalcEvaluateResult {
  result: string;
  /** Optional formatted output, e.g. "1,234.50". */
  formatted?: string;
}

/* ────────────── File Search ────────────── */

export interface FileSearchPayload {
  query: string;
  limit?: number;
  /** Optional directory scope. */
  directory?: string;
}

export interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export interface FileSearchResult {
  files: FileEntry[];
  total: number;
  /** Time spent searching in ms. */
  elapsed: number;
}

/* ────────────── Extensions ────────────── */

export interface ExtensionListResult {
  extensions: Array<{
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
  }>;
}

export interface ExtensionInvokePayload {
  extensionId: string;
  commandName: string;
  input?: unknown;
}

/* ────────────── AI ────────────── */

export interface AIChatPayload {
  message: string;
  /** Conversation id for multi-turn. */
  conversationId?: string;
}

export interface AIChatResult {
  reply: string;
  conversationId: string;
}

/* ────────────── System / Lifecycle ────────────── */

export interface PingResult {
  pong: true;
  version: string;
  uptime: number;
}
