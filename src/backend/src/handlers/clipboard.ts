import { randomUUID } from "node:crypto";

import type {
  ClipboardEntry,
  ClipboardHistoryPayload,
  ClipboardHistoryResult,
  ClipboardCopyPayload,
} from "../protocol.js";
import { log } from "../log.js";

/* ─── In-memory store (will migrate to SQLite later) ─── */

const MAX_ENTRIES = 500;
const entries: ClipboardEntry[] = [];

/* ─── Handlers ─── */

export async function handleClipboardHistory(
  payload: ClipboardHistoryPayload,
): Promise<ClipboardHistoryResult> {
  const limit = payload.limit ?? 50;
  const offset = payload.offset ?? 0;

  // Pin неп first, then by most recent.
  const sorted = [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.timestamp - a.timestamp;
  });

  return {
    entries: sorted.slice(offset, offset + limit),
    total: entries.length,
  };
}

export async function handleClipboardCopy(
  payload: ClipboardCopyPayload,
): Promise<{ id: string }> {
  let entry: ClipboardEntry;

  if (payload.text !== undefined) {
    // Deduplicate consecutive text entries.
    const last = entries[entries.length - 1];
    if (last && last.kind === "text" && last.text === payload.text) {
      return { id: last.id };
    }
    entry = {
      id: randomUUID(),
      kind: "text",
      text: payload.text,
      timestamp: Date.now(),
    };
  } else if (payload.paths) {
    entry = {
      id: randomUUID(),
      kind: "files",
      paths: payload.paths,
      timestamp: Date.now(),
    };
  } else if (payload.imagePath) {
    entry = {
      id: randomUUID(),
      kind: "image",
      imagePath: payload.imagePath,
      timestamp: Date.now(),
    };
  } else {
    throw new Error("Clipboard copy requires text, paths, or imagePath");
  }

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  log.debug("clipboard", `New entry: ${entry.kind} (${entry.id})`);
  return { id: entry.id };
}

export async function handleClipboardPaste(
  payload: { id: string },
): Promise<{ pasted: true; entry: ClipboardEntry }> {
  const entry = entries.find((e) => e.id === payload.id);
  if (!entry) throw new Error(`Clipboard entry not found: ${payload.id}`);

  // Move to top (update timestamp).
  entry.timestamp = Date.now();

  return { pasted: true as const, entry };
}

export async function handleClipboardPin(
  payload: { id: string; pinned: boolean },
): Promise<{ pinned: boolean }> {
  const entry = entries.find((e) => e.id === payload.id);
  if (!entry) throw new Error(`Clipboard entry not found: ${payload.id}`);

  entry.pinned = payload.pinned;
  return { pinned: entry.pinned };
}

export async function handleClipboardClear(): Promise<{ cleared: true }> {
  const pinned = entries.filter((e) => e.pinned);
  entries.length = 0;
  entries.push(...pinned);
  return { cleared: true as const };
}
