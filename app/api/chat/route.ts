import { NextRequest } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import {
  storeMemory,
  recallMemories,
  formatContext,
  scoreImportance,
  extractEntities,
  clinamen,
} from "@/lib/clude";

export async function POST(req: NextRequest) {
  const { messages, model, recallLimit, minImportance, minDecay, types, conversationId, systemPrompt, clinamenLimit, clinamenMinImportance, clinamenMaxRelevance } = (await req.json()) as {
    messages: ChatMessage[];
    model?: string;
    recallLimit?: number;
    minImportance?: number;
    minDecay?: number;
    types?: import("@/lib/clude").MemoryType[];
    conversationId?: string;
    systemPrompt?: string;
    clinamenLimit?: number;
    clinamenMinImportance?: number;
    clinamenMaxRelevance?: number;
  };
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  // Recall relevant memories via Cortex (full recall with access tracking + Hebbian reinforcement)
  let context = "";
  if (lastUserMsg) {
    const memories = await recallMemories(lastUserMsg.content, {
      limit: recallLimit ?? 5,
      minImportance: minImportance || undefined,
      minDecay: minDecay || undefined,
      types,
    });
    // Filter out memories from the current conversation — they're already in the message history
    const filtered = conversationId
      ? memories.filter((m: any) => !m.tags?.includes(`conv:${conversationId}`))
      : memories;
    if (filtered.length > 0) {
      context = await formatContext(filtered);
    }
  }

  // Fetch clinamen (divergent) memories if enabled
  let clinamenContext = "";
  if (lastUserMsg && clinamenLimit && clinamenLimit > 0) {
    try {
      const clinamenMemories = await clinamen({
        context: lastUserMsg.content,
        limit: clinamenLimit,
        minImportance: clinamenMinImportance,
        maxRelevance: clinamenMaxRelevance,
      });
      if (clinamenMemories.length > 0) {
        const lines = clinamenMemories.map(
          (m) => `- [clinamen, importance=${m.importance.toFixed(2)}, similarity=${m._relevanceSim.toFixed(2)}] ${m.summary}`
        );
        clinamenContext = `[Divergent memories — tangential associations for creative synthesis]\n${lines.join("\n")}`;
      }
    } catch {
      // non-critical
    }
  }

  // Build messages with custom system prompt, Cortex context, and clinamen
  const llmMessages: ChatMessage[] = [];
  if (systemPrompt) {
    llmMessages.push({ role: "system", content: systemPrompt });
  }
  if (context) {
    llmMessages.push({ role: "system", content: context });
  }
  if (clinamenContext) {
    llmMessages.push({ role: "system", content: clinamenContext });
  }
  llmMessages.push(...messages);

  // Stream response from local MLX
  const stream = await streamChat(llmMessages, model);

  // Store the user message as episodic memory with scored importance (fire and forget)
  if (lastUserMsg) {
    (async () => {
      try {
        const importance = await scoreImportance(lastUserMsg.content).catch(() => 0.5);
        const summary =
          lastUserMsg.content.length > 100
            ? lastUserMsg.content.slice(0, 100) + "..."
            : lastUserMsg.content;
        const memId = await storeMemory({
          type: "episodic",
          content: lastUserMsg.content,
          summary,
          tags: conversationId ? ["user-message", `conv:${conversationId}`] : ["user-message"],
          importance,
        });
        // Extract and link entities from the user message
        if (memId) {
          await extractEntities(memId, lastUserMsg.content, summary).catch(() => {});
        }
      } catch {
        // non-critical
      }
    })();
  }

  // Use TransformStream to intercept chunks inline while streaming to client
  // This ensures assistant response collection survives the request lifecycle
  let fullText = "";
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Pass through to client
      controller.enqueue(chunk);
      // Collect text for memory storage
      const text = new TextDecoder().decode(chunk, { stream: true });
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || parsed.content;
          if (content) fullText += content;
        } catch {
          // skip
        }
      }
    },
    async flush() {
      // Stream is done — store assistant response as memory (skip trivially short/generic responses)
      if (fullText.trim() && fullText.trim().length > 50) {
        try {
          const importance = await scoreImportance(fullText).catch(() => 0.3);
          const summary =
            fullText.length > 100
              ? fullText.slice(0, 100) + "..."
              : fullText;
          const memId = await storeMemory({
            type: "semantic",
            content: fullText,
            summary,
            tags: conversationId
              ? ["assistant-response", `conv:${conversationId}`]
              : ["assistant-response"],
            importance,
          });
          if (memId) {
            await extractEntities(memId, fullText, summary).catch(() => {});
          }
        } catch {
          // non-critical
        }
      }
    },
  });

  return new Response(stream.pipeThrough(transform), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
