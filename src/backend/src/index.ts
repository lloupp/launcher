/**
 * Launcher Backend — Entry Point
 *
 * Starts the WebSocket IPC server and registers all handlers
 * for the frontend/host to call.
 */

import { LauncherServer } from "./server/ws-server.js";
import { HandlerRegistry } from "./router.js";
import { log } from "./log.js";

import { handleAppSearch, handleAppLaunch, handleAppRescan } from "./handlers/app-discovery.js";
import { handleClipboardHistory, handleClipboardCopy, handleClipboardPaste, handleClipboardPin, handleClipboardClear } from "./handlers/clipboard.js";
import { handleCalcEvaluate } from "./handlers/calculator.js";
import { handleFileSearch, handleFileInfo } from "./handlers/file-search.js";
import { handleExtensionList, handleExtensionInvoke, handleExtensionRefresh } from "./handlers/extensions.js";
import { handleAIChat, handleAIClear, handleAIConversations, isAIConfigured } from "./handlers/ai.js";

import type { PingResult } from "./protocol.js";

const VERSION = "0.1.0";
let startedAt = Date.now();

async function main() {
  log.info("startup", `Launcher backend v${VERSION} starting...`);

  const registry = new HandlerRegistry();

  /* ─── System ─── */
  registry.register("system.ping", async () => {
    const result: PingResult = {
      pong: true,
      version: VERSION,
      uptime: Date.now() - startedAt,
    };
    return result;
  });

  /* ─── App Discovery ─── */
  registry.register("app.search", handleAppSearch);
  registry.register("app.launch", handleAppLaunch);
  registry.register("app.rescan", handleAppRescan);

  /* ─── Clipboard ─── */
  registry.register("clipboard.history", handleClipboardHistory);
  registry.register("clipboard.copy", handleClipboardCopy);
  registry.register("clipboard.paste", handleClipboardPaste);
  registry.register("clipboard.pin", handleClipboardPin);
  registry.register("clipboard.clear", handleClipboardClear);

  /* ─── Calculator ─── */
  registry.register("calc.evaluate", handleCalcEvaluate);

  /* ─── File Search ─── */
  registry.register("file.search", handleFileSearch);
  registry.register("file.info", handleFileInfo);

  /* ─── Extensions ─── */
  registry.register("extension.list", handleExtensionList);
  registry.register("extension.invoke", handleExtensionInvoke);
  registry.register("extension.refresh", handleExtensionRefresh);

  /* ─── AI ─── */
  registry.register("ai.chat", handleAIChat);
  registry.register("ai.clear", handleAIClear);
  registry.register("ai.conversations", handleAIConversations);

  if (isAIConfigured()) {
    log.info("startup", "AI integration: configured");
  } else {
    log.info("startup", "AI integration: not configured (set LAUNCHER_AI_API_KEY to enable)");
  }

  /* ─── Start server ─── */
  const port = parseInt(process.env.LAUNCHER_PORT ?? "7265", 10);
  const server = new LauncherServer(registry, { port });

  await server.start();

  // Graceful shutdown
  const shutdown = async () => {
    log.info("shutdown", "Received shutdown signal, stopping...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error("startup", `Fatal: ${err.stack ?? err.message}`);
  process.exit(1);
});
