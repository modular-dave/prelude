import { Cortex } from "clude-bot";
import { loadEngineConfig, applyEngineConfigToSDK } from "./engine-config";
import { resolveBaseUrl } from "./provider-registry";

let brain: Cortex | null = null;
let initialized = false;

// ── Metering buffer (CortexV2-style event collection) ──
const meterBuffer: Array<{ operation: string; tokens?: number; provider?: string; model?: string; timestamp: string }> = [];

export function getMeterLog() { return [...meterBuffer]; }
export function getMeterSummary(): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const evt of meterBuffer) {
    summary[evt.operation] = (summary[evt.operation] || 0) + 1;
  }
  return summary;
}
export function recordMeterEvent(operation: string, extra?: { tokens?: number; provider?: string; model?: string }) {
  meterBuffer.push({ operation, ...extra, timestamp: new Date().toISOString() });
  // Cap buffer size
  if (meterBuffer.length > 10000) meterBuffer.splice(0, meterBuffer.length - 5000);
}

// ── Privacy policy (persisted via engine config API) ──
let privacyPolicy = {
  defaultVisibility: "private" as "private" | "shared" | "public",
  alwaysPrivateTypes: ["self_model"],
  veniceOnly: false,
  encryptAtRest: false,
};

export function getPrivacyPolicy() { return { ...privacyPolicy }; }
export function setPrivacyPolicy(policy: typeof privacyPolicy) { privacyPolicy = { ...policy }; }

// ── Cognitive routing (function → model mapping) ──
let cognitiveRoutes: Record<string, { provider: string; model: string }> = {};

export function getCognitiveRoutes() { return { ...cognitiveRoutes }; }
export function setCognitiveRoute(fn: string, route: { provider: string; model: string }) {
  cognitiveRoutes[fn] = route;
}
export function resetCognitiveRoutes() { cognitiveRoutes = {}; }

/** Reset the Cortex singleton so the next ensureCortex() re-inits with fresh env. */
export function resetCortex(): void {
  brain = null;
  initialized = false;
}

/**
 * Activate a specific embedding slot (test or publish).
 * Copies EMBEDDING_{TEST|PUBLISH}_* env vars into the active EMBEDDING_* vars
 * and resets Cortex so the next call uses the new config.
 */
export function activateEmbeddingSlot(slot: "test" | "publish"): void {
  const prefix = slot === "test" ? "EMBEDDING_TEST" : "EMBEDDING_PUBLISH";
  const provider = process.env[`${prefix}_PROVIDER`];
  if (!provider) return; // slot not configured
  process.env.EMBEDDING_PROVIDER = provider;
  process.env.EMBEDDING_BASE_URL = process.env[`${prefix}_BASE_URL`] || "";
  process.env.EMBEDDING_API_KEY = process.env[`${prefix}_API_KEY`] || "";
  process.env.EMBEDDING_MODEL = process.env[`${prefix}_MODEL`] || "";
  process.env.EMBEDDING_DIMENSIONS = process.env[`${prefix}_DIMENSIONS`] || "";
  resetCortex();
}

/**
 * Swap the Venice client's model at runtime (for per-function model assignments).
 * This mutates the module-level config in clude-bot's venice-client so the next
 * dream/reflect call uses the specified model.
 */
export function swapVeniceModel(model: string): void {
  try {
    // eslint-disable-next-line no-eval, @typescript-eslint/no-require-imports
    const { createRequire } = eval('require')("module");
    const internalRequire = createRequire(eval('require').resolve("clude-bot"));
    const { initVenice } = internalRequire("../core/venice-client");
    initVenice({
      apiKey: process.env.VENICE_API_KEY || "local",
      model,
    });
  } catch {
    // SDK internal — non-critical if not available
  }
}

/**
 * Monkey-patch clude-bot's embedding functions for custom OpenAI-compatible
 * endpoints (Ollama, local MLX server). The SDK only supports hardcoded
 * provider URLs (voyage, openai, venice) — this bypasses that limitation.
 */
function patchEmbeddingsForCustomEndpoint(baseUrl: string): void {
  try {
    // Use createRequire to bypass both webpack bundling and the package's
    // "exports" restriction — we need access to an unexported internal module.
    // eslint-disable-next-line no-eval, @typescript-eslint/no-require-imports
    const { createRequire } = eval('require')("module");
    const internalRequire = createRequire(eval('require').resolve("clude-bot"));
    const emb = internalRequire("../core/embeddings");
    const url = `${baseUrl.replace(/\/+$/, "")}/embeddings`;
    const apiKey = process.env.EMBEDDING_API_KEY || "";
    const model = process.env.EMBEDDING_MODEL || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey && apiKey !== "local") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Override isEmbeddingEnabled — custom endpoint is always "enabled"
    emb.isEmbeddingEnabled = () => true;

    // Override generateEmbedding
    emb.generateEmbedding = async (text: string): Promise<number[] | null> => {
      const cached = emb.getCachedEmbedding(text);
      if (cached) return cached;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, input: text.slice(0, 8000) }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const embedding: number[] | null = data.data?.[0]?.embedding || null;
        if (embedding) emb.setCachedEmbedding(text, embedding);
        return embedding;
      } catch {
        return null;
      }
    };

    // Override generateQueryEmbedding (same as generate for local)
    emb.generateQueryEmbedding = emb.generateEmbedding;

    // Override generateEmbeddings (batch)
    emb.generateEmbeddings = async (texts: string[]): Promise<(number[] | null)[]> => {
      if (texts.length === 0) return [];
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, input: texts.map(t => t.slice(0, 8000)) }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return texts.map(() => null);
        const data = await res.json();
        const result: (number[] | null)[] = texts.map(() => null);
        for (const item of data.data || []) {
          result[item.index] = item.embedding;
        }
        return result;
      } catch {
        return texts.map(() => null);
      }
    };

    console.log(`[cortex] Patched embeddings for custom endpoint: ${url}`);
  } catch (e) {
    console.error("[cortex] Failed to patch embeddings:", e);
  }
}

/** Resolve the inference URL based on provider assignment */
function resolveInferenceUrl(): string | null {
  const provider = process.env.INFERENCE_CHAT_PROVIDER;
  if (provider) {
    const url = resolveBaseUrl(provider, "inference");
    if (url) return url;
  }
  return process.env.VENICE_BASE_URL || null;
}

export async function ensureCortex(): Promise<Cortex> {
  if (!brain) {
    const embBaseUrl = process.env.EMBEDDING_BASE_URL;
    const isCustomEmbeddingEndpoint = !!embBaseUrl && !embBaseUrl.includes("voyageai.com") && !embBaseUrl.includes("openai.com") && !embBaseUrl.includes("venice.ai");
    const inferenceUrl = resolveInferenceUrl();

    // Patch VENICE_BASE_URL so the SDK's Venice client uses the correct endpoint
    // (it reads process.env.VENICE_BASE_URL at module load time)
    if (inferenceUrl) {
      process.env.VENICE_BASE_URL = inferenceUrl;
    }

    brain = new Cortex({
      supabase: {
        url: process.env.SUPABASE_URL!,
        serviceKey: process.env.SUPABASE_SERVICE_KEY!,
      },
      // Inference via OpenAI-compatible endpoint —
      // Cortex uses this for dream cycles, scoreImportance, reflect, etc.
      // Routed to MLX/Ollama/Venice based on INFERENCE_CHAT_PROVIDER.
      anthropic: inferenceUrl
        ? {
            apiKey: process.env.VENICE_API_KEY || "local",
            model: process.env.INFERENCE_CHAT_MODEL || process.env.VENICE_MODEL || "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
          }
        : undefined,
      // Embedding config — for native providers (voyage/openai/venice) the SDK
      // handles it. For custom endpoints (Ollama, MLX) we monkey-patch below.
      embedding: process.env.EMBEDDING_PROVIDER && !isCustomEmbeddingEndpoint
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

    // For custom OpenAI-compatible endpoints (Ollama, MLX embedding server),
    // the SDK's hardcoded provider URLs won't work. Monkey-patch the exported
    // embedding functions to call our local/custom endpoint directly.
    if (isCustomEmbeddingEndpoint && process.env.EMBEDDING_PROVIDER) {
      patchEmbeddingsForCustomEndpoint(embBaseUrl!);
    }

    // Apply engine config to SDK constants
    const config = loadEngineConfig();
    applyEngineConfigToSDK(config);
  }
  if (!initialized) {
    await brain.init();
    initialized = true;
  }
  return brain;
}
