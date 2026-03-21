// ── Engine Config: All SDK-derived constants as editable configuration ──
// Loads from localStorage (client) or defaults (server). Persisted via API.

import type { MemoryType } from "./types";

export interface EngineConfig {
  // Retrieval scoring weights
  retrievalWeights: {
    recency: number;
    relevance: number;
    importance: number;
    vector: number;
    graph: number;
    cooccurrence: number;
  };
  recencyDecayBase: number;
  vectorMatchThreshold: number;

  // Knowledge type boosts
  typeBoosts: Record<MemoryType, number>;

  // Decay rates (per 24h)
  decayRates: Record<MemoryType, number>;
  minDecayFloor: number;

  // Hebbian / Auto-linking
  linkSimilarityThreshold: number;
  maxAutoLinks: number;
  coRetrievalBoost: number;
  importanceBoostPerRecall: number;

  // Clinamen (anomaly retrieval)
  clinamenMinAgeHours: number;
  clinamenCandidatePoolSize: number;

  // Dream cycle
  dreamImportanceThreshold: number;
  dreamMinIntervalMin: number;
  dreamTimeoutMin: number;
  compactionAgeDays: number;
  compactionDecayThreshold: number;
  compactionImportanceThreshold: number;
  compactionMinGroupSize: number;

  // Active reflection
  reflectionIntervalHours: number;
  reflectionMinMemories: number;
  reflectionMaxJournalTokens: number;
  reflectionTimeoutMin: number;
  reflectionRecentSeedHours: number;
  reflectionHighImpLookbackHours: number;
  reflectionHighImpThreshold: number;

  // Content limits
  memoryMaxContentLength: number;
  memorySummaryMaxLength: number;

  // Embedding cache
  embeddingCacheMax: number;
  embeddingCacheTTLMin: number;
  embeddingFragmentMaxLength: number;

  // Inference
  inferencePrimary: "auto" | "venice" | "anthropic" | "local";
  inferenceFallback: "anthropic" | "venice" | "local" | "none";
  chatMaxTokens: number;

  // Memory concepts (ontology)
  memoryConcepts: string[];

  // Retrieval settings (absorbed from prelude:retrieval-settings)
  recallLimit: number;
  minImportance: number;
  minDecay: number;
  enabledTypes: string[];
  clinamenLimit: number;
  clinamenMinImportance: number;
  clinamenMaxRelevance: number;
  dreamScheduleEnabled: boolean;
  reflectionScheduleEnabled: boolean;

  // Chat settings (absorbed from prelude:chat-settings)
  webSearchEnabled: boolean;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  retrievalWeights: {
    recency: 1.0,
    relevance: 2.0,
    importance: 2.0,
    vector: 4.0,
    graph: 1.5,
    cooccurrence: 0.4,
  },
  recencyDecayBase: 0.995,
  vectorMatchThreshold: 0.25,

  typeBoosts: {
    episodic: 0.0,
    semantic: 0.15,
    procedural: 0.12,
    self_model: 0.10,
    introspective: 0.12,
  },

  decayRates: {
    episodic: 0.93,
    semantic: 0.98,
    procedural: 0.97,
    self_model: 0.99,
    introspective: 0.98,
  },
  minDecayFloor: 0.05,

  linkSimilarityThreshold: 0.6,
  maxAutoLinks: 5,
  coRetrievalBoost: 0.05,
  importanceBoostPerRecall: 0.01,

  clinamenMinAgeHours: 24,
  clinamenCandidatePoolSize: 100,

  dreamImportanceThreshold: 2.0,
  dreamMinIntervalMin: 30,
  dreamTimeoutMin: 10,
  compactionAgeDays: 7,
  compactionDecayThreshold: 0.3,
  compactionImportanceThreshold: 0.5,
  compactionMinGroupSize: 3,

  reflectionIntervalHours: 3,
  reflectionMinMemories: 5,
  reflectionMaxJournalTokens: 1500,
  reflectionTimeoutMin: 8,
  reflectionRecentSeedHours: 6,
  reflectionHighImpLookbackHours: 48,
  reflectionHighImpThreshold: 0.7,

  memoryMaxContentLength: 5000,
  memorySummaryMaxLength: 500,

  embeddingCacheMax: 200,
  embeddingCacheTTLMin: 30,
  embeddingFragmentMaxLength: 2000,

  inferencePrimary: "auto",
  inferenceFallback: "anthropic",
  chatMaxTokens: 512,

  memoryConcepts: [
    "market_event",
    "holder_behavior",
    "self_insight",
    "social_interaction",
    "community_pattern",
    "sentiment_shift",
    "recurring_user",
    "engagement_pattern",
    "identity_evolution",
    "technical_knowledge",
    "relationship_dynamic",
    "creative_idea",
  ],

  // Retrieval defaults
  recallLimit: 5,
  minImportance: 0,
  minDecay: 0,
  enabledTypes: ["episodic", "semantic", "procedural", "self_model", "introspective"],
  clinamenLimit: 3,
  clinamenMinImportance: 0.6,
  clinamenMaxRelevance: 0.35,
  dreamScheduleEnabled: false,
  reflectionScheduleEnabled: false,

  // Chat defaults
  webSearchEnabled: false,
};

const STORAGE_KEY = "prelude:engine-config";

// In-memory cache for server-side (persisted via localStorage on client)
let cachedConfig: EngineConfig | null = null;

export function loadEngineConfig(): EngineConfig {
  if (cachedConfig) return cachedConfig;

  if (typeof window === "undefined") {
    cachedConfig = { ...DEFAULT_ENGINE_CONFIG };
    return cachedConfig;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cachedConfig = deepMerge(DEFAULT_ENGINE_CONFIG, parsed);

    // ── One-time migration: absorb legacy stores ──
    let migrated = false;

    const oldRetrieval = localStorage.getItem("prelude:retrieval-settings");
    if (oldRetrieval) {
      try {
        const rs = JSON.parse(oldRetrieval);
        cachedConfig = deepMerge(cachedConfig, {
          recallLimit: rs.recallLimit,
          minImportance: rs.minImportance,
          minDecay: rs.minDecay,
          enabledTypes: rs.enabledTypes,
          clinamenLimit: rs.clinamenLimit,
          clinamenMinImportance: rs.clinamenMinImportance,
          clinamenMaxRelevance: rs.clinamenMaxRelevance,
          dreamScheduleEnabled: rs.dreamScheduleEnabled,
          reflectionScheduleEnabled: rs.reflectionScheduleEnabled,
        });
        localStorage.removeItem("prelude:retrieval-settings");
        migrated = true;
      } catch { /* ignore corrupt data */ }
    }

    const oldChat = localStorage.getItem("prelude:chat-settings");
    if (oldChat) {
      try {
        const cs = JSON.parse(oldChat);
        cachedConfig = deepMerge(cachedConfig, {
          webSearchEnabled: cs.webSearchEnabled,
        });
        localStorage.removeItem("prelude:chat-settings");
        migrated = true;
      } catch { /* ignore corrupt data */ }
    }

    if (migrated) {
      saveEngineConfig(cachedConfig!);
    }

    return cachedConfig!;
  } catch {
    cachedConfig = { ...DEFAULT_ENGINE_CONFIG };
    return cachedConfig;
  }
}

export function saveEngineConfig(config: EngineConfig): void {
  cachedConfig = config;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // quota exceeded or private browsing
  }
}

export function updateEngineConfig(partial: Partial<EngineConfig>): EngineConfig {
  const current = loadEngineConfig();
  const updated = deepMerge(current, partial) as EngineConfig;
  saveEngineConfig(updated);
  return updated;
}

export function resetEngineConfig(): EngineConfig {
  const defaults = { ...DEFAULT_ENGINE_CONFIG };
  saveEngineConfig(defaults);
  return defaults;
}

/** Apply engine config to SDK constants at runtime (server-side monkey-patching) */
export function applyEngineConfigToSDK(config: EngineConfig): void {
  try {
    // eslint-disable-next-line no-eval, @typescript-eslint/no-require-imports
    const { createRequire } = eval("require")("module");
    const internalRequire = createRequire(eval("require").resolve("clude-bot"));
    const constants = internalRequire("../utils/constants");

    // Retrieval weights
    if (constants.RETRIEVAL_WEIGHT_RECENCY !== undefined)
      constants.RETRIEVAL_WEIGHT_RECENCY = config.retrievalWeights.recency;
    if (constants.RETRIEVAL_WEIGHT_RELEVANCE !== undefined)
      constants.RETRIEVAL_WEIGHT_RELEVANCE = config.retrievalWeights.relevance;
    if (constants.RETRIEVAL_WEIGHT_IMPORTANCE !== undefined)
      constants.RETRIEVAL_WEIGHT_IMPORTANCE = config.retrievalWeights.importance;
    if (constants.RETRIEVAL_WEIGHT_VECTOR !== undefined)
      constants.RETRIEVAL_WEIGHT_VECTOR = config.retrievalWeights.vector;
    if (constants.RETRIEVAL_WEIGHT_GRAPH !== undefined)
      constants.RETRIEVAL_WEIGHT_GRAPH = config.retrievalWeights.graph;
    if (constants.RETRIEVAL_WEIGHT_COOCCURRENCE !== undefined)
      constants.RETRIEVAL_WEIGHT_COOCCURRENCE = config.retrievalWeights.cooccurrence;

    // Decay base
    if (constants.RECENCY_DECAY_BASE !== undefined)
      constants.RECENCY_DECAY_BASE = config.recencyDecayBase;
    if (constants.VECTOR_MATCH_THRESHOLD !== undefined)
      constants.VECTOR_MATCH_THRESHOLD = config.vectorMatchThreshold;

    // Hebbian
    if (constants.LINK_SIMILARITY_THRESHOLD !== undefined)
      constants.LINK_SIMILARITY_THRESHOLD = config.linkSimilarityThreshold;
    if (constants.MAX_AUTO_LINKS !== undefined)
      constants.MAX_AUTO_LINKS = config.maxAutoLinks;
    if (constants.LINK_CO_RETRIEVAL_BOOST !== undefined)
      constants.LINK_CO_RETRIEVAL_BOOST = config.coRetrievalBoost;
  } catch {
    // SDK internals not available — non-critical
  }
}

// ── Helpers ──

function deepMerge(target: any, source: any): any {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      output[key] = source[key];
    }
  }
  return output;
}
