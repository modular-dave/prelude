import type { MemoryType } from "./types";
import { loadEngineConfig, saveEngineConfig } from "./engine-config";

export interface RetrievalSettings {
  recallLimit: number;
  minImportance: number;
  minDecay: number;
  enabledTypes: MemoryType[];
  clinamenLimit: number;
  clinamenMinImportance: number;
  clinamenMaxRelevance: number;
  dreamScheduleEnabled: boolean;
  reflectionScheduleEnabled: boolean;
}

export const ALL_MEMORY_TYPES: MemoryType[] = [
  "episodic",
  "semantic",
  "procedural",
  "self_model",
  "introspective",
];

export const DEFAULT_RETRIEVAL_SETTINGS: RetrievalSettings = {
  recallLimit: 5,
  minImportance: 0,
  minDecay: 0,
  enabledTypes: [...ALL_MEMORY_TYPES],
  clinamenLimit: 3,
  clinamenMinImportance: 0.6,
  clinamenMaxRelevance: 0.35,
  dreamScheduleEnabled: false,
  reflectionScheduleEnabled: false,
};

/** Load retrieval settings from unified EngineConfig store */
export function loadSettings(): RetrievalSettings {
  const ec = loadEngineConfig();
  return {
    recallLimit: ec.recallLimit,
    minImportance: ec.minImportance,
    minDecay: ec.minDecay,
    enabledTypes: ec.enabledTypes as MemoryType[],
    clinamenLimit: ec.clinamenLimit,
    clinamenMinImportance: ec.clinamenMinImportance,
    clinamenMaxRelevance: ec.clinamenMaxRelevance,
    dreamScheduleEnabled: ec.dreamScheduleEnabled,
    reflectionScheduleEnabled: ec.reflectionScheduleEnabled,
  };
}

/** Save retrieval settings to unified EngineConfig store (auto-syncs to API via useEngineConfig) */
export function saveSettings(s: RetrievalSettings): void {
  const ec = loadEngineConfig();
  const updated = {
    ...ec,
    recallLimit: s.recallLimit,
    minImportance: s.minImportance,
    minDecay: s.minDecay,
    enabledTypes: s.enabledTypes,
    clinamenLimit: s.clinamenLimit,
    clinamenMinImportance: s.clinamenMinImportance,
    clinamenMaxRelevance: s.clinamenMaxRelevance,
    dreamScheduleEnabled: s.dreamScheduleEnabled,
    reflectionScheduleEnabled: s.reflectionScheduleEnabled,
  };
  saveEngineConfig(updated);

  // Sync to API
  if (typeof window !== "undefined") {
    fetch("/api/cortex/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recallLimit: s.recallLimit,
        minImportance: s.minImportance,
        minDecay: s.minDecay,
        enabledTypes: s.enabledTypes,
        clinamenLimit: s.clinamenLimit,
        clinamenMinImportance: s.clinamenMinImportance,
        clinamenMaxRelevance: s.clinamenMaxRelevance,
        dreamScheduleEnabled: s.dreamScheduleEnabled,
        reflectionScheduleEnabled: s.reflectionScheduleEnabled,
      }),
    }).catch(() => {});
  }
}
