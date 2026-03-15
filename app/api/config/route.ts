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
      connected: !!process.env.EMBEDDING_PROVIDER && !!(process.env.EMBEDDING_API_KEY || process.env.EMBEDDING_BASE_URL),
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
