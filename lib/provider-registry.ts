// ── Central provider URL + port registry ─────────────────────
// Single source of truth for all server URLs. Import from here
// instead of hardcoding ports in individual files.

export const PORTS = {
  mlxInference: 8899,
  mlxEmbedding: 11435,
  ollama: 11434,
} as const;

export const PROVIDER_URLS = {
  mlx: {
    inference: `http://127.0.0.1:${PORTS.mlxInference}/v1`,
    embedding: `http://127.0.0.1:${PORTS.mlxEmbedding}/v1`,
    health: `http://127.0.0.1:${PORTS.mlxInference}/`,
    embeddingHealth: `http://127.0.0.1:${PORTS.mlxEmbedding}/health`,
  },
  ollama: {
    inference: `http://127.0.0.1:${PORTS.ollama}/v1`,
    embedding: `http://127.0.0.1:${PORTS.ollama}/v1`,
    api: `http://127.0.0.1:${PORTS.ollama}/api`,
    health: `http://127.0.0.1:${PORTS.ollama}/api/tags`,
  },
} as const;

const LOCAL_PROVIDERS = new Set(["mlx", "ollama"]);

/** Resolve the base URL for a given provider + purpose. Custom URL wins. */
export function resolveBaseUrl(
  provider: string,
  purpose: "inference" | "embedding",
  customUrl?: string,
): string {
  if (customUrl) return customUrl.replace(/\/+$/, "");
  const urls = PROVIDER_URLS[provider as keyof typeof PROVIDER_URLS];
  if (urls) return urls[purpose];
  // Hosted fallback — must provide customUrl
  return customUrl || "";
}

export function isLocalProvider(provider: string): boolean {
  return LOCAL_PROVIDERS.has(provider);
}

export function providerNeedsApiKey(provider: string): boolean {
  return !LOCAL_PROVIDERS.has(provider);
}
