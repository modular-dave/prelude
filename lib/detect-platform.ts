import os from "os";
import { PROVIDER_URLS } from "@/lib/provider-registry";

// ── Types ────────────────────────────────────────────────────────

export interface Platform {
  os: string;
  arch: string;
  isAppleSilicon: boolean;
  cpuModel: string;
}

interface MlxBackend {
  available: boolean;
  inference: boolean;
  inferenceModel: string | null;
  embedding: boolean;
  embeddingModel: string | null;
  embeddingDims: number | null;
}

interface OllamaBackend {
  available: boolean;
  inferenceModels: string[];
  embeddingModels: string[];
}

interface CloudBackend {
  available: boolean;
  configured: boolean;
}

export interface DetectResult {
  platform: Platform;
  backends: {
    mlx: MlxBackend;
    ollama: OllamaBackend;
    cloud: CloudBackend;
  };
  recommended: string;
}

// ── Platform capabilities (used by UI for filtering) ────────────

export interface PlatformCapabilities {
  canRunMLX: boolean;
  canRunOllama: boolean;
  ollamaEmbeddingBroken: boolean;
  isDesktop: boolean;
  isMobile: boolean;
}

export function getPlatformCapabilities(detection: DetectResult): PlatformCapabilities {
  const isApple = detection.platform.isAppleSilicon;
  return {
    canRunMLX: isApple,
    canRunOllama: true,
    ollamaEmbeddingBroken: isApple || detection.platform.os === "darwin",
    isDesktop: true, // overridden client-side via usePlatform
    isMobile: false,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

async function probeHealth(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Detection ────────────────────────────────────────────────────

export async function detectPlatform(): Promise<DetectResult> {
  const platform: Platform = {
    os: os.platform(),
    arch: os.arch(),
    isAppleSilicon: os.platform() === "darwin" && os.arch() === "arm64",
    cpuModel: os.cpus()[0]?.model || "unknown",
  };

  const [mlxInference, mlxEmbedding, ollamaHealth] = await Promise.all([
    probeHealth(PROVIDER_URLS.mlx.health),
    probeHealth(PROVIDER_URLS.mlx.embeddingHealth),
    probeHealth(PROVIDER_URLS.ollama.health),
  ]);

  let ollamaModels: string[] = [];
  if (ollamaHealth) {
    try {
      const r = await fetch(PROVIDER_URLS.ollama.health, { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      ollamaModels = (data.models || []).map((m: any) => m.name);
    } catch (e) {
      console.warn("[detect] Failed to fetch Ollama models:", e instanceof Error ? e.message : e);
    }
  }

  let mlxModel: string | null = null;
  if (mlxInference) {
    try {
      const r = await fetch(`${PROVIDER_URLS.mlx.inference}/models`, { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      mlxModel = data.data?.[0]?.id || null;
    } catch (e) {
      console.warn("[detect] Failed to fetch MLX model:", e instanceof Error ? e.message : e);
    }
  }

  let mlxEmbedModel: string | null = null;
  let mlxEmbedDims: number | null = null;
  if (mlxEmbedding) {
    try {
      const r = await fetch(PROVIDER_URLS.mlx.embeddingHealth, { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      mlxEmbedModel = data.model || null;
      mlxEmbedDims = data.dimensions || null;
    } catch (e) {
      console.warn("[detect] Failed to fetch MLX embedding status:", e instanceof Error ? e.message : e);
    }
  }

  const cloudConfigured = !!(process.env.VENICE_API_KEY && process.env.VENICE_API_KEY !== "local");

  let recommended = "cloud";
  if (platform.isAppleSilicon && (mlxInference || mlxEmbedding)) recommended = "mlx";
  else if (ollamaHealth && ollamaModels.some(m => !m.includes("embed"))) recommended = "ollama";

  return {
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
  };
}
