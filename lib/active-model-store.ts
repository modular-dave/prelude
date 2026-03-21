// ── Per-function model assignment store ─────────────────────────
// Persists to .env.local via INFERENCE_{CHAT|DREAM|REFLECT}_{MODEL|PROVIDER}.
// NOTE: Intentionally separate from EngineConfig (localStorage). Model assignments
// must persist to .env.local because server-side API routes read them at startup
// via process.env — they cannot rely on browser localStorage.

import { persistEnv, removeEnv } from "@/lib/env-persist";

export type CogFunc = "chat" | "dream" | "reflect";

export interface Assignment {
  model: string;
  provider: string;
}

const COG_FUNCS: CogFunc[] = ["chat", "dream", "reflect"];

function envKey(fn: CogFunc, field: "MODEL" | "PROVIDER"): string {
  return `INFERENCE_${fn.toUpperCase()}_${field}`;
}

/** Load assignments from env vars (called once at module init) */
function loadFromEnv(): Record<CogFunc, Assignment | null> {
  const result: Record<CogFunc, Assignment | null> = { chat: null, dream: null, reflect: null };
  for (const fn of COG_FUNCS) {
    const model = process.env[envKey(fn, "MODEL")];
    const provider = process.env[envKey(fn, "PROVIDER")];
    if (model && provider) {
      result[fn] = { model, provider };
    }
  }
  return result;
}

let assignments = loadFromEnv();

export function getAssignment(fn: CogFunc): Assignment | null {
  return assignments[fn];
}

export function setAssignment(fn: CogFunc, model: string, provider: string): void {
  assignments[fn] = { model, provider };
  persistEnv({
    [envKey(fn, "MODEL")]: model,
    [envKey(fn, "PROVIDER")]: provider,
  });
}

export function getAllAssignments(): Record<CogFunc, Assignment | null> {
  return { ...assignments };
}

/** Clear any assignments that reference the given model */
export function clearAssignmentsForModel(model: string): void {
  const keysToRemove: string[] = [];
  for (const fn of COG_FUNCS) {
    if (assignments[fn]?.model === model) {
      assignments[fn] = null;
      keysToRemove.push(envKey(fn, "MODEL"), envKey(fn, "PROVIDER"));
    }
  }
  if (keysToRemove.length > 0) removeEnv(keysToRemove);
}

// ── Embedding assignment ───────────────────────────────────────

export interface EmbeddingAssignment {
  provider: string;
  model: string;
  baseUrl: string;
  dims: number;
  apiKey?: string;
}

function loadEmbeddingFromEnv(): EmbeddingAssignment | null {
  const provider = process.env.EMBEDDING_PROVIDER;
  const model = process.env.EMBEDDING_MODEL;
  const baseUrl = process.env.EMBEDDING_BASE_URL;
  const dims = process.env.EMBEDDING_DIMENSIONS;
  if (!provider || !model) return null;
  return {
    provider,
    model,
    baseUrl: baseUrl || "",
    dims: dims ? parseInt(dims, 10) : 384,
    apiKey: process.env.EMBEDDING_API_KEY,
  };
}

let embeddingConfig = loadEmbeddingFromEnv();

export function getEmbeddingConfig(): EmbeddingAssignment | null {
  return embeddingConfig;
}

export function setEmbeddingConfig(cfg: EmbeddingAssignment): void {
  embeddingConfig = cfg;
  persistEnv({
    EMBEDDING_PROVIDER: cfg.provider,
    EMBEDDING_MODEL: cfg.model,
    EMBEDDING_BASE_URL: cfg.baseUrl,
    EMBEDDING_DIMENSIONS: String(cfg.dims),
    ...(cfg.apiKey ? { EMBEDDING_API_KEY: cfg.apiKey } : {}),
  });
}

// ── Backward-compat aliases (used by existing code) ────────────

/** Returns the chat-assigned model, or null */
export function getActiveModel(): string | null {
  return assignments.chat?.model ?? null;
}

/** Sets the chat assignment (provider defaults to "unknown") */
export function setActiveModel(model: string): void {
  setAssignment("chat", model, "unknown");
}
