import { randomUUID } from "node:crypto";

import type { AIChatPayload, AIChatResult } from "../protocol.js";
import { log } from "../log.js";

/* ─── Configuration ─── */

interface AIConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function getConfig(): AIConfig {
  return {
    apiKey: process.env.LAUNCHER_AI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: process.env.LAUNCHER_AI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.LAUNCHER_AI_MODEL ?? "gpt-4o-mini",
  };
}

/** Check if AI is configured. */
export function isAIConfigured(): boolean {
  return getConfig().apiKey !== undefined;
}

/* ─── Conversation store (in-memory) ─── */

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const conversations = new Map<string, Turn[]>();

/* ─── Handlers ─── */

export async function handleAIChat(
  payload: AIChatPayload,
): Promise<AIChatResult> {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error(
      "AI not configured. Set LAUNCHER_AI_API_KEY or OPENAI_API_KEY environment variable."
    );
  }

  const conversationId = payload.conversationId ?? randomUUID();
  const history = conversations.get(conversationId) ?? [];
  history.push({ role: "user", content: payload.message });

  // OpenAI-compatible chat completions endpoint
  const url = `${config.baseUrl}/chat/completions`;
  const body = {
    model: config.model,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant integrated into a productivity launcher. " +
          "Keep responses concise and actionable.",
      },
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ],
    max_tokens: 500,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const reply = data.choices[0]?.message?.content ?? "";
  history.push({ role: "assistant", content: reply });
  conversations.set(conversationId, history);

  log.debug("ai", `Chat turn: ${history.length} messages in conversation ${conversationId}`);

  return { reply, conversationId };
}

/** Clear a conversation history. */
export async function handleAIClear(
  payload: { conversationId: string },
): Promise<{ cleared: true }> {
  conversations.delete(payload.conversationId);
  return { cleared: true as const };
}

/** List active conversations. */
export async function handleAIConversations(): Promise<{
  conversations: Array<{ id: string; turns: number; lastMessage: string }>;
}> {
  const result = [];
  for (const [id, turns] of conversations) {
    result.push({
      id,
      turns: turns.length,
      lastMessage: turns[turns.length - 1]?.content ?? "",
    });
  }
  return { conversations: result };
}
