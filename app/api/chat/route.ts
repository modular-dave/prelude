import { NextRequest } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import { storeMemory, recallMemories } from "@/lib/clude";

export async function POST(req: NextRequest) {
  const { messages, model, recallLimit, minImportance, minDecay, types } = (await req.json()) as {
    messages: ChatMessage[];
    model?: string;
    recallLimit?: number;
    minImportance?: number;
    minDecay?: number;
    types?: import("@/lib/clude").MemoryType[];
  };
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  // Recall relevant memories
  let memories: { summary: string; memory_type: string }[] = [];
  if (lastUserMsg) {
    memories = recallMemories(lastUserMsg.content, {
      limit: recallLimit ?? 5,
      minImportance: minImportance || undefined,
      minDecay: minDecay || undefined,
      types,
    });
  }

  // Stream response from Ollama
  const stream = await streamChat([...messages], model);

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
