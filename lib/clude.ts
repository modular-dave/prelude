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
  opts?: { limit?: number; types?: MemoryType[]; minImportance?: number; minDecay?: number }
): LocalMemory[] {
  return localRecall({
    query,
    limit: opts?.limit ?? 10,
    memory_types: opts?.types,
    min_importance: opts?.minImportance,
    min_decay: opts?.minDecay,
  });
}

export function getStats(): object {
  return localStats();
}

export function deleteMemoriesBySummaries(summaries: string[]): number {
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".clude");
  const file = path.join(dir, "memories.json");
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const store = JSON.parse(raw);
    const before = store.memories.length;
    const summarySet = new Set(summaries);
    store.memories = store.memories.filter(
      (m: { summary: string }) => !summarySet.has(m.summary)
    );
    const deleted = before - store.memories.length;
    if (deleted > 0) {
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
      fs.renameSync(tmp, file);
    }
    return deleted;
  } catch {
    return 0;
  }
}

export function findClinamen(
  context: string,
  opts?: { limit?: number; minImportance?: number; maxRelevance?: number }
): LocalMemory[] {
  return localClinamen({
    context,
    limit: opts?.limit ?? 3,
    min_importance: opts?.minImportance,
    max_relevance: opts?.maxRelevance,
  });
}
