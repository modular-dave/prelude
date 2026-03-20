import { NextRequest } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/inference";
import {
  recallMemories,
  formatContext,
  clinamen,
} from "@/lib/clude";
import { processConversationMessage } from "@/lib/memory-pipeline";
import { recordMeterEvent } from "@/lib/cortex";

// Guardrail helpers — gracefully degrade if SDK modules unavailable
let checkInput: ((text: string) => { safe: boolean; reason?: string }) | null = null;
let checkOutput: ((text: string) => { safe: boolean; reason?: string; filtered?: string }) | null = null;
try {
  // eslint-disable-next-line no-eval, @typescript-eslint/no-require-imports
  const { createRequire } = eval("require")("module");
  const internalRequire = createRequire(eval("require").resolve("clude-bot"));
  const inputGuardrails = internalRequire("../core/input-guardrails");
  const outputGuardrails = internalRequire("../core/guardrails");
  if (inputGuardrails?.checkInput) checkInput = inputGuardrails.checkInput;
  if (outputGuardrails?.checkOutput) checkOutput = outputGuardrails.checkOutput;
} catch {
  // Guardrails not available — proceed without them
}

function createSafeSSEStream(message: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: message })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { messages, recallLimit, minImportance, minDecay, types, conversationId, systemPrompt, clinamenLimit, clinamenMinImportance, clinamenMaxRelevance, webSearchEnabled } = (await req.json()) as {
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
      webSearchEnabled?: boolean;
    };
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

    // ── Input guardrail check ──
    if (checkInput && lastUserMsg) {
      const inputResult = checkInput(lastUserMsg.content);
      if (!inputResult.safe) {
        recordMeterEvent("guardrail_input_block");
        return new Response(createSafeSSEStream("I can't process that request."), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
    }

    // ── Recall relevant memories via Cortex (non-critical) ──
    let context = "";
    let recalledCount = 0;
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
        recalledCount = filtered.length;
        if (filtered.length > 0) {
          context = await formatContext(filtered);
        }
        recordMeterEvent("recall", { tokens: filtered.length });
      } catch {
        // Non-critical — proceed without memory context
      }
    }

    // ── Fetch clinamen (divergent) memories (non-critical) ──
    let clinamenContext = "";
    let clinamenCount = 0;
    if (lastUserMsg && clinamenLimit && clinamenLimit > 0) {
      try {
        const clinamenMemories = await clinamen({
          context: lastUserMsg.content,
          limit: clinamenLimit,
          minImportance: clinamenMinImportance,
          maxRelevance: clinamenMaxRelevance,
        });
        clinamenCount = clinamenMemories.length;
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
      recordMeterEvent("store");
    }

    // ── Stream LLM response ──
    const stream = await streamChat(llmMessages);

    // ── Collect assistant response, apply output guardrails, store as memory ──
    let fullText = "";
    let guardrailTriggered = false;
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (guardrailTriggered) return; // stop forwarding if guardrail tripped

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

        // Check output guardrail periodically (every ~500 chars)
        if (checkOutput && fullText.length > 0 && fullText.length % 500 < 50) {
          const result = checkOutput(fullText);
          if (!result.safe) {
            guardrailTriggered = true;
            recordMeterEvent("guardrail_output_block");
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "\n\n[Response filtered by safety guardrails]" })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        }
      },
      async flush(controller) {
        // Send meta event with recall/clinamen/provider info
        const encoder = new TextEncoder();
        const meta = {
          recalled: recalledCount,
          clinamen: clinamenCount,
          guardrail: guardrailTriggered,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta })}\n\n`));

        if (fullText.trim() && fullText.trim().length > 50 && !guardrailTriggered) {
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
        { error: "inference_unavailable", message: "Cannot reach inference backend. Check that your LLM server is running." },
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
