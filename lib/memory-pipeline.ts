// ── Shared memory processing pipeline ────────────────────────────
// Used by both /api/chat and /api/import to ensure consistent
// Cortex memory operations for all conversation messages.
//
// Cortex's store() auto-handles: embeddings, fragments, entity
// extraction, auto-linking (vector + concept), and concept inference.
// We only add: LLM importance scoring + conversation-thread linking.

import {
  storeMemory,
  scoreImportance,
  link,
} from "@/lib/clude";

/**
 * Process a single conversation message through the Cortex pipeline:
 * 1. Score importance via LLM (user messages) or default (assistant)
 * 2. Store as episodic memory — Cortex auto-handles embeddings,
 *    entity extraction, auto-linking, and concept inference
 * 3. Link to previous messages in the same conversation
 *    (Cortex doesn't know conversation structure)
 *
 * Returns the memory ID or null if storage failed.
 */
export async function processConversationMessage(opts: {
  role: "user" | "assistant";
  content: string;
  conversationId?: string;
  source?: string;
  linkToIds?: number[];
}): Promise<number | null> {
  const { role, content, conversationId, source, linkToIds } = opts;

  // 1. Score importance (Cortex doesn't auto-score via LLM)
  const importance = role === "user"
    ? await scoreImportance(content).catch(() => 0.5)
    : 0.3;

  // 2. Store as episodic — Cortex fire-and-forgets:
  //    embeddings, fragments, entity extraction, auto-linking, concepts
  const summary = content.length > 100
    ? content.slice(0, 100) + "..."
    : content;

  const tags = [
    role === "user" ? "user-message" : "assistant-response",
    ...(conversationId ? [`conv:${conversationId}`] : []),
    ...(source ? ["imported"] : []),
  ];

  const memId = await storeMemory({
    type: "episodic",
    content,
    summary,
    tags,
    importance,
    source,
  });

  if (!memId) return null;

  // 3. Conversation-thread linking (Cortex doesn't know conversation structure)
  if (linkToIds?.length) {
    for (const prevId of linkToIds) {
      await link(memId, prevId, "relates", 0.5).catch(() => {});
    }
  }

  return memId;
}
