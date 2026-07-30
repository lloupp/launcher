/**
 * IPC client — WebSocket connection to the backend.
 *
 * Provides a simple request/response API with correlation IDs,
 * plus event subscription for push messages.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_URL = "ws://127.0.0.1:7270";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

type EventHandler = (payload: unknown) => void;

let ws: WebSocket | null = null;
let wsRefCount = 0;
const pending = new Map<string, PendingRequest>();
const eventHandlers = new Map<string, Set<EventHandler>>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let msgIdCounter = 0;

function generateId(): string {
  return `fe_${Date.now()}_${msgIdCounter++}`;
}

function connect(url: string, onStatus: (s: ConnectionStatus) => void): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  onStatus("connecting");
  ws = new WebSocket(url);

  ws.onopen = () => {
    onStatus("connected");
  };

  ws.onclose = () => {
    onStatus("disconnected");
    ws = null;
    // Auto-reconnect after 2s
    if (wsRefCount > 0) {
      reconnectTimer = setTimeout(() => connect(url, onStatus), 2000);
    }
  };

  ws.onerror = () => {
    // onclose will fire after this
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      // Response to a request
      if (msg.id && pending.has(msg.id)) {
        const req = pending.get(msg.id)!;
        pending.delete(msg.id);
        clearTimeout(req.timeout);
        if (msg.error) {
          req.reject(new Error(msg.error));
        } else {
          req.resolve(msg.result);
        }
        return;
      }
      // Push event
      if (msg.type && eventHandlers.has(msg.type)) {
        for (const handler of eventHandlers.get(msg.type)!) {
          handler(msg.payload);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  };
}

/** Send a request and await the response. */
function request<T = unknown>(type: string, payload?: unknown, timeoutMs = 8000): Promise<T> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("WebSocket not connected"));
  }
  const id = generateId();
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Request "${type}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timeout });
    ws!.send(JSON.stringify({ id, type, ...(payload !== undefined && { payload }) }));
  });
}

/** Subscribe to push events from the backend. Returns an unsubscribe function. */
function subscribe(type: string, handler: EventHandler): () => void {
  if (!eventHandlers.has(type)) eventHandlers.set(type, new Set());
  eventHandlers.get(type)!.add(handler);
  return () => {
    eventHandlers.get(type)?.delete(handler);
  };
}

/**
 * React hook for managing the WebSocket connection lifecycle.
 * Automatically connects on mount, disconnects on unmount.
 */
export function useWebSocket(url = DEFAULT_URL): {
  status: ConnectionStatus;
  request: <T = unknown>(type: string, payload?: unknown) => Promise<T>;
  subscribe: (type: string, handler: EventHandler) => () => void;
} {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    wsRefCount++;
    connect(url, setStatus);

    return () => {
      wsRefCount--;
      if (wsRefCount === 0) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) {
          ws.onclose = null; // Prevent auto-reconnect
          ws.close();
          ws = null;
        }
      }
    };
  }, [url]);

  const req = useCallback(<T = unknown>(type: string, payload?: unknown) => request<T>(type, payload), []);

  const sub = useCallback((type: string, handler: EventHandler) => subscribe(type, handler), [])

  return { status, request: req, subscribe: sub };
}
