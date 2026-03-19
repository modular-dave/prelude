import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { persistEnv } from "@/lib/env-persist";
import { resetCortex } from "@/lib/cortex";
import { apiError } from "@/lib/api-utils";

/** Expose current Cortex configuration (read-only, no secrets). */
export async function GET() {
  return NextResponse.json({
    setupComplete: process.env.PRELUDE_SETUP_COMPLETE === "true",
    supabase: {
      url: process.env.SUPABASE_URL || null,
      connected: !!process.env.SUPABASE_URL,
    },
    inference: {
      baseUrl: process.env.VENICE_BASE_URL || process.env.LLM_BASE_URL || null,
      model: process.env.INFERENCE_CHAT_MODEL || process.env.VENICE_MODEL || process.env.LLM_MODEL || null,
      provider: process.env.INFERENCE_CHAT_PROVIDER || process.env.INFERENCE_PRIMARY || "venice",
      connected: !!(process.env.VENICE_BASE_URL || process.env.LLM_BASE_URL),
    },
    embedding: {
      provider: process.env.EMBEDDING_PROVIDER || null,
      model: process.env.EMBEDDING_MODEL || null,
      baseUrl: process.env.EMBEDDING_BASE_URL || null,
      dimensions: process.env.EMBEDDING_DIMENSIONS ? parseInt(process.env.EMBEDDING_DIMENSIONS, 10) : null,
      connected: !!process.env.EMBEDDING_PROVIDER && !!(process.env.EMBEDDING_API_KEY || process.env.EMBEDDING_BASE_URL),
    },
    embeddingSlots: {
      test: process.env.EMBEDDING_TEST_PROVIDER ? {
        provider: process.env.EMBEDDING_TEST_PROVIDER,
        model: process.env.EMBEDDING_TEST_MODEL || null,
        baseUrl: process.env.EMBEDDING_TEST_BASE_URL || null,
        dimensions: process.env.EMBEDDING_TEST_DIMENSIONS ? parseInt(process.env.EMBEDDING_TEST_DIMENSIONS, 10) : null,
      } : null,
      publish: process.env.EMBEDDING_PUBLISH_PROVIDER ? {
        provider: process.env.EMBEDDING_PUBLISH_PROVIDER,
        model: process.env.EMBEDDING_PUBLISH_MODEL || null,
        baseUrl: process.env.EMBEDDING_PUBLISH_BASE_URL || null,
        dimensions: process.env.EMBEDDING_PUBLISH_DIMENSIONS ? parseInt(process.env.EMBEDDING_PUBLISH_DIMENSIONS, 10) : null,
      } : null,
    },
    embeddingKeys: {
      openai: !!process.env.EMBEDDING_OPENAI_API_KEY,
      voyage: !!process.env.EMBEDDING_VOYAGE_API_KEY,
    },
    inferenceKeys: {
      saved: !!(process.env.VENICE_API_KEY && process.env.VENICE_API_KEY !== "local"),
    },
    ownerWallet: process.env.OWNER_WALLET || null,
    features: {
      dreamCycles: !!(process.env.VENICE_BASE_URL || process.env.VENICE_API_KEY),
      reflection: !!(process.env.VENICE_BASE_URL || process.env.VENICE_API_KEY),
      importanceScoring: !!(process.env.VENICE_BASE_URL || process.env.VENICE_API_KEY),
      entityExtraction: true,
      clinamen: true,
      memoryTrace: true,
      actionLearning: true,
      onChainVerification: !!process.env.OWNER_WALLET,
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────

async function probeEndpoint(url: string, body: object, timeoutMs: number): Promise<{ ok: boolean; data?: any; error?: string; ms: number }> {
  const start = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, data, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed", ms: Date.now() - start };
  }
}

async function probeHealth(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

/** POST /api/config — actions: probe, detect, save */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action as string;

  // ── PROBE: test configured services ──
  if (action === "probe") {
    const results: Record<string, { ok: boolean; provider?: string; model?: string; ms?: number; error?: string }> = {};

    // Supabase
    const sbUrl = process.env.SUPABASE_URL;
    if (sbUrl) {
      const start = Date.now();
      try {
        const r = await fetch(`${sbUrl}/rest/v1/`, {
          headers: { apikey: process.env.SUPABASE_SERVICE_KEY || "" },
          signal: AbortSignal.timeout(5000),
        });
        results.supabase = { ok: r.ok, ms: Date.now() - start };
      } catch (e) {
        results.supabase = { ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : "failed" };
      }
    } else {
      results.supabase = { ok: false, error: "not configured" };
    }

    // Inference
    const infUrl = process.env.VENICE_BASE_URL;
    const infModel = process.env.INFERENCE_CHAT_MODEL || process.env.VENICE_MODEL;
    const infProvider = process.env.INFERENCE_CHAT_PROVIDER || "unknown";
    if (infUrl && infModel) {
      const r = await probeEndpoint(`${infUrl}/chat/completions`, {
        model: infModel, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false,
      }, 15000);
      results.inference = { ok: r.ok && !!r.data?.choices, provider: infProvider, model: infModel, ms: r.ms };
      if (!r.ok) results.inference.error = r.data?.error?.message || r.error || "failed";
    } else {
      results.inference = { ok: false, error: "not configured" };
    }

    // Embedding
    const embUrl = process.env.EMBEDDING_BASE_URL;
    const embModel = process.env.EMBEDDING_MODEL;
    if (embUrl && embModel) {
      const r = await probeEndpoint(`${embUrl}/embeddings`, { model: embModel, input: "test" }, 10000);
      results.embedding = { ok: r.ok && !!r.data?.data, provider: process.env.EMBEDDING_PROVIDER || "unknown", model: embModel, ms: r.ms };
      if (!r.ok) results.embedding.error = r.data?.error?.message || r.error || "failed";
    } else {
      results.embedding = { ok: false, error: "not configured" };
    }

    return NextResponse.json(results);
  }

  // ── DETECT: discover platform + available backends ──
  if (action === "detect") {
    const platform = {
      os: os.platform(),
      arch: os.arch(),
      isAppleSilicon: os.platform() === "darwin" && os.arch() === "arm64",
      cpuModel: os.cpus()[0]?.model || "unknown",
    };

    const [mlxInference, mlxEmbedding, ollamaHealth] = await Promise.all([
      probeHealth("http://127.0.0.1:8899/"),
      probeHealth("http://127.0.0.1:11435/health"),
      probeHealth("http://127.0.0.1:11434/api/tags"),
    ]);

    let ollamaModels: string[] = [];
    if (ollamaHealth) {
      try {
        const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3000) });
        const data = await r.json();
        ollamaModels = (data.models || []).map((m: any) => m.name);
      } catch {}
    }

    let mlxModel: string | null = null;
    if (mlxInference) {
      try {
        const r = await fetch("http://127.0.0.1:8899/v1/models", { signal: AbortSignal.timeout(3000) });
        const data = await r.json();
        mlxModel = data.data?.[0]?.id || null;
      } catch {}
    }

    let mlxEmbedModel: string | null = null;
    let mlxEmbedDims: number | null = null;
    if (mlxEmbedding) {
      try {
        const r = await fetch("http://127.0.0.1:11435/health", { signal: AbortSignal.timeout(3000) });
        const data = await r.json();
        mlxEmbedModel = data.model || null;
        mlxEmbedDims = data.dimensions || null;
      } catch {}
    }

    const cloudConfigured = !!(process.env.VENICE_API_KEY && process.env.VENICE_API_KEY !== "local");

    let recommended = "cloud";
    if (platform.isAppleSilicon && (mlxInference || mlxEmbedding)) recommended = "mlx";
    else if (ollamaHealth && ollamaModels.some(m => !m.includes("embed"))) recommended = "ollama";

    return NextResponse.json({
      platform,
      backends: {
        mlx: {
          available: mlxInference || mlxEmbedding,
          inference: mlxInference,
          inferenceModel: mlxModel,
          embedding: mlxEmbedding,
          embeddingModel: mlxEmbedModel,
          embeddingDims: mlxEmbedDims,
        },
        ollama: {
          available: ollamaHealth,
          inferenceModels: ollamaModels.filter(m => !m.includes("embed")),
          embeddingModels: ollamaModels.filter(m => m.includes("embed")),
        },
        cloud: {
          available: cloudConfigured,
          configured: cloudConfigured,
        },
      },
      recommended,
    });
  }

  // ── SAVE: persist config to .env.local ──
  if (action === "save") {
    const config = body.config as Record<string, string>;
    if (!config || typeof config !== "object") {
      return apiError("config object required");
    }
    config.PRELUDE_SETUP_COMPLETE = "true";
    await persistEnv(config);
    resetCortex();
    return NextResponse.json({ ok: true });
  }

  return apiError("Unknown action. Use: probe, detect, save");
}
