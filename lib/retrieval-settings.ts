import type { MemoryType } from "./types";

export interface RetrievalSettings {
  recallLimit: number;
  minImportance: number;
  minDecay: number;
  enabledTypes: MemoryType[];
  clinamenLimit: number;
  clinamenMinImportance: number;
  clinamenMaxRelevance: number;
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
};

const STORAGE_KEY = "prelude:retrieval-settings";

export function loadSettings(): RetrievalSettings {
  if (typeof window === "undefined") return { ...DEFAULT_RETRIEVAL_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RETRIEVAL_SETTINGS };
    return { ...DEFAULT_RETRIEVAL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_RETRIEVAL_SETTINGS };
  }
}

export function saveSettings(s: RetrievalSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota exceeded or private browsing
  }
}
