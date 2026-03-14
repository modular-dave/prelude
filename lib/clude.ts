const { localStore, localRecall, localStats, localClinamen } = require("clude-bot/local");

export type MemoryType =
  | "episodic"
  | "semantic"
  | "procedural"
  | "self_model"
  | "introspective";

export interface LocalMemory {
  id: number;
  memory_type: MemoryType;
  content: string;
  summary: string;
  tags: string[];
  concepts: string[];
  importance: number;
  decay_factor: number;
  access_count: number;
  emotional_valence: number;
  source: string;
  created_at: string;
  last_accessed: string;
}

export function storeMemory(opts: {
  type: MemoryType;
  content: string;
  summary: string;
  tags?: string[];
  importance?: number;
  source?: string;
}): number {
  return localStore({
    type: opts.type,
    content: opts.content,
    summary: opts.summary,
    tags: opts.tags ?? [],
    importance: opts.importance ?? 0.5,
    source: opts.source ?? "prelude",
  });
}

export function recallMemories(
  query: string,
  opts?: { limit?: number; types?: MemoryType[]; minImportance?: number }
): LocalMemory[] {
  return localRecall({
    query,
    limit: opts?.limit ?? 10,
    memory_types: opts?.types,
    min_importance: opts?.minImportance,
  });
}

export function getStats(): object {
  return localStats();
}

export function findClinamen(
  context: string,
  limit: number = 3
): LocalMemory[] {
  return localClinamen({ context, limit });
}
