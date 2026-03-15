import { Cortex } from "clude-bot";

let brain: Cortex | null = null;
let initialized = false;

export async function ensureCortex(): Promise<Cortex> {
  if (!brain) {
    brain = new Cortex({
      supabase: {
        url: process.env.SUPABASE_URL!,
        serviceKey: process.env.SUPABASE_SERVICE_KEY!,
      },
      // Venice/MLX inference via OpenAI-compatible endpoint —
      // Cortex uses this for dream cycles, scoreImportance, reflect, etc.
      anthropic: process.env.VENICE_BASE_URL
        ? {
            apiKey: process.env.VENICE_API_KEY || "local",
            model: process.env.VENICE_MODEL || "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
          }
        : undefined,
      // Embedding config (if available)
      embedding: process.env.EMBEDDING_PROVIDER
        ? {
            provider: process.env.EMBEDDING_PROVIDER as "voyage" | "openai",
            apiKey: process.env.EMBEDDING_API_KEY || "",
            model: process.env.EMBEDDING_MODEL,
            dimensions: process.env.EMBEDDING_DIMENSIONS
              ? parseInt(process.env.EMBEDDING_DIMENSIONS, 10)
              : undefined,
          }
        : undefined,
      // Owner wallet (optional)
      ownerWallet: process.env.OWNER_WALLET || undefined,
    });
  }
  if (!initialized) {
    await brain.init();
    initialized = true;
  }
  return brain;
}
