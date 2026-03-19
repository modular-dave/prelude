// ── Runtime provider config store ────────────────────────────────
// Stores hosted provider credentials in memory (server-side) and
// persists to .env.local so they survive restarts.
// Single-active-provider model: only one hosted provider is active at a time.

import { persistEnv } from "@/lib/env-persist";

export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

const configs: Record<string, ProviderConfig> = {};

// Track which hosted provider is currently active
let activePrimary: string | null = process.env.INFERENCE_PRIMARY || null;

/** Map from provider ID → env var keys (all share VENICE_* since only one is active) */
const ENV_MAP: Record<string, { baseUrl: string; apiKey: string; model: string }> = {
  venice: { baseUrl: "VENICE_BASE_URL", apiKey: "VENICE_API_KEY", model: "VENICE_MODEL" },
  openrouter: { baseUrl: "VENICE_BASE_URL", apiKey: "VENICE_API_KEY", model: "VENICE_MODEL" },
  together: { baseUrl: "VENICE_BASE_URL", apiKey: "VENICE_API_KEY", model: "VENICE_MODEL" },
};

export function setProviderConfig(providerId: string, config: ProviderConfig): void {
  // Clear other hosted providers' in-memory configs (single-active model)
  for (const id of Object.keys(ENV_MAP)) {
    if (id !== providerId) delete configs[id];
  }

  configs[providerId] = config;
  activePrimary = providerId;

  const envKeys = ENV_MAP[providerId];
  if (envKeys) {
    const entries: Record<string, string> = {
      INFERENCE_PRIMARY: providerId,
    };
    if (config.baseUrl) entries[envKeys.baseUrl] = config.baseUrl;
    if (config.apiKey) entries[envKeys.apiKey] = config.apiKey;
    if (config.model) entries[envKeys.model] = config.model;
    persistEnv(entries);
  }
}

export function getProviderConfig(providerId: string): ProviderConfig | null {
  return configs[providerId] || null;
}

export function getAllProviderConfigs(): Record<string, ProviderConfig> {
  return { ...configs };
}

export function getActivePrimary(): string | null {
  return activePrimary;
}

export function isProviderConnected(providerId: string): boolean {
  // Only the active primary provider is considered "connected"
  if (activePrimary && activePrimary !== providerId) return false;
  const cfg = configs[providerId];
  if (!cfg) return false;
  return !!cfg.apiKey;
}
