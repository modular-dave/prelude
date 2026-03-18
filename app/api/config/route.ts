import { NextResponse } from "next/server";

/** Expose current Cortex configuration (read-only, no secrets). */
export async function GET() {
  return NextResponse.json({
    supabase: {
      url: process.env.SUPABASE_URL || null,
      connected: !!process.env.SUPABASE_URL,
    },
    inference: {
      baseUrl: process.env.VENICE_BASE_URL || process.env.LLM_BASE_URL || null,
      model: process.env.VENICE_MODEL || process.env.LLM_MODEL || null,
      provider: process.env.INFERENCE_PRIMARY || "venice",
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
