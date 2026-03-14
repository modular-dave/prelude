import { NextRequest } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import { storeMemory, recallMemories } from "@/lib/clude";

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  // Recall relevant memories
  let memories: { summary: string; memory_type: string }[] = [];
  if (lastUserMsg) {
    memories = recallMemories(lastUserMsg.content, { limit: 5 });
  }

  // Build system prompt with memory context
  const memoryContext =
    memories.length > 0
      ? `\n\nYou have the following memories from past conversations:\n${memories
          .map((m) => `- [${m.memory_type}] ${m.summary}`)
          .join("\n")}\n\nUse these memories naturally if relevant.`
      : "";

  const systemMsg: ChatMessage = {
    role: "system",
    content: `You are Prelude, a helpful AI assistant with persistent memory. Be concise and helpful.${memoryContext}`,
  };

  // Stream response from Ollama
  const stream = await streamChat([systemMsg, ...messages]);

  // Store the user message as episodic memory (fire and forget)
  if (lastUserMsg) {
    try {
      storeMemory({
        type: "episodic",
        content: lastUserMsg.content,
        summary:
          lastUserMsg.content.length > 100
            ? lastUserMsg.content.slice(0, 100) + "..."
            : lastUserMsg.content,
        tags: ["user-message"],
        importance: 0.5,
      });
    } catch {
      // non-critical
    }
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
