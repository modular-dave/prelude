import { NextRequest, NextResponse } from "next/server";

/** Expose current Cortex configuration (read-only, no secrets). */
export async function GET() {
  return NextResponse.json({
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

/** Live-probe services to check actual availability (not just env vars). */
export async function POST(req: NextRequest) {
  const { action } = (await req.json()) as { action: string };

  if (action !== "probe") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const results: Record<string, { ok: boolean; provider?: string; model?: string; ms?: number; error?: string }> = {};

  // ── Probe Supabase ──
  const sbStart = Date.now();
  try {
    const sbUrl = process.env.SUPABASE_URL;
    if (!sbUrl) throw new Error("not configured");
    const r = await fetch(`${sbUrl}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY || "" },
      signal: AbortSignal.timeout(5000),
    });
    results.supabase = { ok: r.ok, ms: Date.now() - sbStart };
  } catch (e) {
    results.supabase = { ok: false, ms: Date.now() - sbStart, error: e instanceof Error ? e.message : "failed" };
  }

  // ── Probe inference ──
  const infStart = Date.now();
  const infUrl = process.env.VENICE_BASE_URL;
  const infModel = process.env.INFERENCE_CHAT_MODEL || process.env.VENICE_MODEL;
  const infProvider = process.env.INFERENCE_CHAT_PROVIDER || "unknown";
  if (infUrl && infModel) {
    try {
      const r = await fetch(`${infUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VENICE_API_KEY || "local"}` },
        body: JSON.stringify({ model: infModel, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await r.json().catch(() => ({}));
      const ok = r.ok && !!body.choices;
      results.inference = { ok, provider: infProvider, model: infModel, ms: Date.now() - infStart };
      if (!ok) results.inference.error = body.error?.message || `status ${r.status}`;
    } catch (e) {
      results.inference = { ok: false, provider: infProvider, model: infModel, ms: Date.now() - infStart, error: e instanceof Error ? e.message : "failed" };
    }
  } else {
    results.inference = { ok: false, error: "not configured" };
  }

  // ── Probe embedding ──
  const embStart = Date.now();
  const embUrl = process.env.EMBEDDING_BASE_URL;
  const embModel = process.env.EMBEDDING_MODEL;
  if (embUrl && embModel) {
    try {
      const r = await fetch(`${embUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.EMBEDDING_API_KEY || "local"}` },
        body: JSON.stringify({ model: embModel, input: "test" }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await r.json().catch(() => ({}));
      const ok = r.ok && !!body.data;
      results.embedding = { ok, provider: "ollama", model: embModel, ms: Date.now() - embStart };
      if (!ok) results.embedding.error = body.error?.message || `status ${r.status}`;
    } catch (e) {
      results.embedding = { ok: false, provider: "ollama", model: embModel, ms: Date.now() - embStart, error: e instanceof Error ? e.message : "failed" };
    }
  } else {
    results.embedding = { ok: false, error: "not configured" };
  }

  return NextResponse.json(results);
}
