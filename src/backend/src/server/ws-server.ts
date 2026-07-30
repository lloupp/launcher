import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { IPCMessage, IPCRequest, IPCResponse, IPCEvent } from "../protocol.js";
import { HandlerRegistry, type HandlerContext } from "../router.js";
import { log } from "../log.js";

/** Configuration for the WebSocket server. */
export interface ServerOptions {
  port?: number;
  host?: string;
}

const DEFAULT_PORT = 7265;
const DEFAULT_HOST = "127.0.0.1";

export class LauncherServer {
  private wss: WebSocketServer;
  private registry: HandlerRegistry;
  private clients = new Set<WebSocket>();
  private port: number;
  private host: string;
  private startedAt = 0;
  private abortController = new AbortController();

  constructor(registry: HandlerRegistry, opts: ServerOptions = {}) {
    this.registry = registry;
    this.port = opts.port ?? DEFAULT_PORT;
    this.host = opts.host ?? DEFAULT_HOST;
    this.wss = new WebSocketServer({ port: this.port, host: this.host });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.on("connection", (ws) => this.onConnection(ws));
      this.wss.on("error", reject);
      this.wss.on("listening", () => {
        this.startedAt = Date.now();
        log.info("server", `WebSocket server listening on ws://${this.host}:${this.port}`);
        log.info("server", `Registered handlers: ${this.registry.types.join(", ")}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    for (const ws of this.clients) {
      ws.close(1001, "Server shutting down");
    }
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }

  get uptime(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  private onConnection(ws: WebSocket): void {
    const clientId = randomUUID().slice(0, 8);
    this.clients.add(ws);
    log.info("server", `Client connected (${clientId}), total: ${this.clients.size}`);

    ws.on("message", (data) => this.onMessage(ws, data.toString()));
    ws.on("close", () => {
      this.clients.delete(ws);
      log.info("server", `Client disconnected (${clientId}), total: ${this.clients.size}`);
    });
    ws.on("error", (err) => {
      log.error("server", `Client error (${clientId}): ${err.message}`);
    });
  }

  private async onMessage(ws: WebSocket, raw: string): Promise<void> {
    let msg: IPCMessage;
    try {
      msg = JSON.parse(raw) as IPCMessage;
    } catch {
      log.warn("server", `Invalid JSON from client: ${raw.slice(0, 120)}`);
      return;
    }

    // Only requests (with id) are expected from the frontend.
    if (!("id" in msg) || !msg.id) return;

    const req = msg as IPCRequest;
    log.debug("server", `→ ${req.type} (${req.id})`);

    const ctx: HandlerContext = {
      emit: (type, payload) => this.broadcast(ws, { type, payload } as IPCEvent),
      signal: this.abortController.signal,
    };

    try {
      const handler = this.registry.get(req.type);
      if (!handler) {
        this.sendResponse(ws, req.id, req.type, undefined, `No handler for "${req.type}"`);
        return;
      }
      const result = await handler(req.payload, ctx);
      this.sendResponse(ws, req.id, req.type, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("server", `Handler "${req.type}" error: ${message}`);
      this.sendResponse(ws, req.id, req.type, undefined, message);
    }
  }

  private sendResponse(
    ws: WebSocket,
    id: string,
    type: string,
    result?: unknown,
    error?: string
  ): void {
    const res: IPCResponse = { id, type, ...(result !== undefined && { result }), ...(error && { error }) };
    ws.send(JSON.stringify(res));
  }

  /** Broadcast to all clients (or exclude the sender). */
  private broadcast(sender: WebSocket, event: IPCEvent): void {
    const json = JSON.stringify(event);
    for (const client of this.clients) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  /** Push event to all connected clients. */
  emit(type: string, payload?: unknown): void {
    const event: IPCEvent = { type, payload };
    const json = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }
}
