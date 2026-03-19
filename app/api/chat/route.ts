import { NextRequest } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import {
  recallMemories,
  formatContext,
  clinamen,
} from "@/lib/clude";
import { processConversationMessage } from "@/lib/memory-pipeline";

export async function POST(req: NextRequest) {
  try {
    const { messages, recallLimit, minImportance, minDecay, types, conversationId, systemPrompt, clinamenLimit, clinamenMinImportance, clinamenMaxRelevance } = (await req.json()) as {
      messages: ChatMessage[];
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

    // ── Recall relevant memories via Cortex (non-critical) ──
    let context = "";
    if (lastUserMsg) {
      try {
        const memories = await recallMemories(lastUserMsg.content, {
          limit: recallLimit ?? 5,
          minImportance: minImportance || undefined,
          minDecay: minDecay || undefined,
          types,
        });
        const filtered = conversationId
          ? memories.filter((m: any) => !m.tags?.includes(`conv:${conversationId}`))
          : memories;
        if (filtered.length > 0) {
          context = await formatContext(filtered);
        }
      } catch {
        // Non-critical — proceed without memory context
      }
    }

    // ── Fetch clinamen (divergent) memories (non-critical) ──
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

    // ── Build LLM message array ──
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

    // ── Store user message as episodic memory (non-critical) ──
    let userMemId: number | null = null;
    if (lastUserMsg) {
      userMemId = await processConversationMessage({
        role: "user",
        content: lastUserMsg.content,
        conversationId,
      }).catch(() => null);
    }

    // ── Stream LLM response ──
    const stream = await streamChat(llmMessages);

    // ── Collect assistant response and store as episodic memory ──
    let fullText = "";
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
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
        if (fullText.trim() && fullText.trim().length > 50) {
          await processConversationMessage({
            role: "assistant",
            content: fullText,
            conversationId,
            linkToIds: userMemId ? [userMemId] : undefined,
          }).catch(() => { /* memory storage failure is non-fatal — stream already delivered */ });
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
  } catch (err) {
    // Top-level catch — classify the error for the client
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return Response.json(
        { error: "inference_unavailable", message: "Cannot reach Ollama. Start with: ollama serve" },
        { status: 503 }
      );
    }
    if (msg.includes("not found") || msg.includes("not_found")) {
      const model = process.env.VENICE_MODEL || process.env.INFERENCE_CHAT_MODEL || "unknown";
      return Response.json(
        { error: "model_not_found", message: `Model '${model}' not found. Install with: ollama pull ${model}` },
        { status: 502 }
      );
    }
    if (msg.includes("Supabase") || msg.includes("supabaseUrl")) {
      return Response.json(
        { error: "supabase_unavailable", message: "Supabase is not running. Start with: npx supabase start" },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "chat_error", message: msg },
      { status: 500 }
    );
  }
}
