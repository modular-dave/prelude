// ── Runtime provider config store ────────────────────────────────
// Stores hosted provider credentials in memory (server-side) and
// persists to .env.local so they survive restarts.

import { persistEnv } from "@/lib/env-persist";

export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

const configs: Record<string, ProviderConfig> = {};

/** Map from provider ID → env var keys */
const ENV_MAP: Record<string, { baseUrl: string; apiKey: string; model: string }> = {
  venice: { baseUrl: "VENICE_BASE_URL", apiKey: "VENICE_API_KEY", model: "VENICE_MODEL" },
  openrouter: { baseUrl: "VENICE_BASE_URL", apiKey: "VENICE_API_KEY", model: "VENICE_MODEL" },
  together: { baseUrl: "VENICE_BASE_URL", apiKey: "VENICE_API_KEY", model: "VENICE_MODEL" },
};

export function setProviderConfig(providerId: string, config: ProviderConfig): void {
  configs[providerId] = config;

  const envKeys = ENV_MAP[providerId];
  if (envKeys) {
    const entries: Record<string, string> = {};
    if (config.baseUrl) entries[envKeys.baseUrl] = config.baseUrl;
    if (config.apiKey) entries[envKeys.apiKey] = config.apiKey;
    if (config.model) entries[envKeys.model] = config.model;
    if (Object.keys(entries).length > 0) persistEnv(entries);
  }
}

export function getProviderConfig(providerId: string): ProviderConfig | null {
  return configs[providerId] || null;
}

export function getAllProviderConfigs(): Record<string, ProviderConfig> {
  return { ...configs };
}

export function isProviderConnected(providerId: string): boolean {
  const cfg = configs[providerId];
  if (!cfg) return false;
  // A provider is "connected" if it has at least an API key
  return !!cfg.apiKey;
}
