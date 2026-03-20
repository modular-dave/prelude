import { NextRequest, NextResponse } from "next/server";
import { reflect, getStats, startReflectionSchedule, stopReflectionSchedule } from "@/lib/clude";
import { getAssignment } from "@/lib/active-model-store";
import { swapVeniceModel, recordMeterEvent } from "@/lib/cortex";
import { supabase } from "@/lib/supabase";
import { apiError } from "@/lib/api-utils";
import { loadEngineConfig } from "@/lib/engine-config";

/** Generate a short title for a reflection via inference */
async function summarizeTitle(text: string): Promise<string | null> {
  const baseUrl = process.env.VENICE_BASE_URL;
  const model = process.env.INFERENCE_REFLECT_MODEL || process.env.VENICE_MODEL;
  if (!baseUrl || !model) return null;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.VENICE_API_KEY && process.env.VENICE_API_KEY !== "local"
          ? { Authorization: `Bearer ${process.env.VENICE_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Generate a short title (max 8 words) for this journal reflection. Return ONLY the title text, no quotes, no markdown, no punctuation at the end.",
          },
          { role: "user", content: text.slice(0, 1000) },
        ],
        max_tokens: 30,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    const title = data?.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
    return title || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { schedule } = body as { schedule?: "start" | "stop" };

    if (schedule === "start") {
      await startReflectionSchedule();
      return NextResponse.json({ success: true, schedule: "started" });
    }
    if (schedule === "stop") {
      await stopReflectionSchedule();
      return NextResponse.json({ success: true, schedule: "stopped" });
    }

    // Pre-check: inference backend must be configured
    if (!process.env.VENICE_BASE_URL) {
      return apiError("Reflection requires an inference backend. Set VENICE_BASE_URL (and optionally VENICE_API_KEY / VENICE_MODEL) in your environment to enable dream cycles and reflections.");
    }

    // Pre-check: need enough memories to reflect on
    const config = loadEngineConfig();
    const minMemories = config.reflectionMinMemories;
    const stats = await getStats();
    const total = stats.total ?? 0;
    if (total < minMemories) {
      return apiError(`Need at least ${minMemories} memories to reflect (currently ${total}). Have some conversations first.`);
    }

    // Swap to reflect-assigned model if configured
    const reflectAssign = getAssignment("reflect");
    const reflectModel = reflectAssign?.model || null;
    const reflectProvider = reflectAssign?.provider || process.env.INFERENCE_CHAT_PROVIDER || "auto";
    if (reflectAssign) swapVeniceModel(reflectAssign.model);

    recordMeterEvent("reflect", { provider: reflectProvider, model: reflectModel || undefined });

    // Default: run a single reflection session
    const journal = await reflect() as { text?: string; title?: string; memoryId?: number | null; seedMemoryIds?: number[]; [k: string]: unknown } | null;
    if (!journal) {
      return apiError("Reflection produced no output. The system found too few qualifying seed memories. Try having more varied conversations first.");
    }

    // Post-process: generate a clean LLM title and update the stored memory
    const text = journal.text || "";
    if (text && journal.memoryId) {
      const title = await summarizeTitle(text);
      if (title) {
        journal.title = title;
        // Update the memory's summary field in Supabase
        await supabase
          .from("memories")
          .update({ summary: title })
          .eq("id", journal.memoryId);
      }
    }

    return NextResponse.json({
      success: true,
      journal,
      // Model provenance
      model: reflectModel,
      provider: reflectProvider,
    });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
