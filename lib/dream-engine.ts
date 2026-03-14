import type { Memory, DreamPhase } from "./types";

export interface ConsolidationCluster {
  tag: string;
  memoryIds: number[];
  avgImportance: number;
}

export interface CompactionCandidate {
  id: number;
  summary: string;
  importance: number;
  decayFactor: number;
}

export interface ReflectionInsight {
  dominantType: string;
  dominantCount: number;
  avgImportance: number;
  emotionalTone: "positive" | "negative" | "neutral";
  avgValence: number;
  totalMemories: number;
}

export interface ContradictionPair {
  memoryA: { id: number; summary: string; valence: number };
  memoryB: { id: number; summary: string; valence: number };
  sharedConcept: string;
}

export interface EmergenceLink {
  memory: { id: number; summary: string; type: string; importance: number };
  relatedConcepts: string[];
  potentialConnections: number;
}

export interface DreamPhaseResult extends DreamPhase {
  clusters?: ConsolidationCluster[];
  candidates?: CompactionCandidate[];
  reflection?: ReflectionInsight;
  contradictions?: ContradictionPair[];
  emergence?: EmergenceLink;
}

export function runConsolidation(memories: Memory[]): DreamPhaseResult {
  const tagMap: Record<string, number[]> = {};
  for (const m of memories) {
    for (const tag of m.tags || []) {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(m.id);
    }
  }
  const clusters: ConsolidationCluster[] = Object.entries(tagMap)
    .filter(([, ids]) => ids.length >= 2)
    .map(([tag, ids]) => ({
      tag,
      memoryIds: ids,
      avgImportance:
        ids.reduce((s, id) => {
          const m = memories.find((mem) => mem.id === id);
          return s + (m?.importance || 0);
        }, 0) / ids.length,
    }))
    .sort((a, b) => b.memoryIds.length - a.memoryIds.length);

  return {
    name: "Consolidation",
    description: "Group related memories by shared tags and concepts",
    status: "complete",
    result:
      clusters.length > 0
        ? `Found ${clusters.length} memory clusters: ${clusters
            .slice(0, 3)
            .map(
              (c) =>
                `"${c.tag}" (${c.memoryIds.length} mems, ${Math.round(c.avgImportance * 100)}% avg imp)`
            )
            .join(", ")}`
        : "No clusters found yet — more memories needed",
    lastRun: new Date().toISOString(),
    clusters,
  };
}

export function runCompaction(memories: Memory[]): DreamPhaseResult {
  const candidates: CompactionCandidate[] = memories
    .filter((m) => m.importance < 0.3 && (m.decay_factor || 1) < 0.5)
    .map((m) => ({
      id: m.id,
      summary: m.summary,
      importance: m.importance,
      decayFactor: m.decay_factor || 1,
    }));

  return {
    name: "Compaction",
    description: "Identify fading low-importance memories for compression",
    status: "complete",
    result:
      candidates.length > 0
        ? `${candidates.length} memories flagged for compaction`
        : "All memories are healthy — nothing to compact",
    lastRun: new Date().toISOString(),
    candidates,
  };
}

export function runReflection(memories: Memory[]): DreamPhaseResult {
  if (memories.length === 0) {
    return {
      name: "Reflection",
      description: "Review self-model against accumulated knowledge",
      status: "complete",
      result: "No memories to reflect on",
      lastRun: new Date().toISOString(),
    };
  }
  const avgImportance =
    memories.reduce((s, m) => s + m.importance, 0) / memories.length;
  const avgValence =
    memories.reduce((s, m) => s + (m.emotional_valence || 0), 0) /
    memories.length;
  const typeCounts = memories.reduce(
    (acc, m) => ({ ...acc, [m.memory_type]: (acc[m.memory_type] || 0) + 1 }),
    {} as Record<string, number>
  );
  const dominantType = Object.entries(typeCounts).sort(
    ([, a], [, b]) => b - a
  )[0];
  const emotionalTone: "positive" | "negative" | "neutral" =
    avgValence > 0.1 ? "positive" : avgValence < -0.1 ? "negative" : "neutral";

  const reflection: ReflectionInsight = {
    dominantType: dominantType[0],
    dominantCount: dominantType[1],
    avgImportance,
    emotionalTone,
    avgValence,
    totalMemories: memories.length,
  };

  return {
    name: "Reflection",
    description: "Review self-model against accumulated knowledge",
    status: "complete",
    result: `Dominant type: ${dominantType[0]} (${dominantType[1]}). Avg importance: ${Math.round(avgImportance * 100)}%. Emotional tone: ${emotionalTone}`,
    lastRun: new Date().toISOString(),
    reflection,
  };
}

export function runContradiction(memories: Memory[]): DreamPhaseResult {
  const contradictions: ContradictionPair[] = [];
  for (let i = 0; i < memories.length && contradictions.length < 5; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const a = memories[i];
      const b = memories[j];
      const sharedConcepts = (a.concepts || []).filter((c) =>
        (b.concepts || []).includes(c)
      );
      if (
        sharedConcepts.length > 0 &&
        Math.sign(a.emotional_valence || 0) !==
          Math.sign(b.emotional_valence || 0) &&
        Math.abs((a.emotional_valence || 0) - (b.emotional_valence || 0)) > 0.5
      ) {
        contradictions.push({
          memoryA: {
            id: a.id,
            summary: a.summary,
            valence: a.emotional_valence || 0,
          },
          memoryB: {
            id: b.id,
            summary: b.summary,
            valence: b.emotional_valence || 0,
          },
          sharedConcept: sharedConcepts[0],
        });
      }
    }
  }

  return {
    name: "Contradiction Resolution",
    description: "Find and resolve conflicting memories",
    status: "complete",
    result:
      contradictions.length > 0
        ? `${contradictions.length} contradictions: ${contradictions
            .map((c) => `#${c.memoryA.id} vs #${c.memoryB.id} on "${c.sharedConcept}"`)
            .join("; ")}`
        : "No contradictions detected",
    lastRun: new Date().toISOString(),
    contradictions,
  };
}

export function runEmergence(memories: Memory[]): DreamPhaseResult {
  if (memories.length < 3) {
    return {
      name: "Emergence",
      description: "Discover unexpected connections and novel insights",
      status: "complete",
      result: "Need more memories for emergence patterns",
      lastRun: new Date().toISOString(),
    };
  }
  const random = memories[Math.floor(Math.random() * memories.length)];
  const relatedConcepts = random.concepts || [];
  const potentialConnections = memories.filter((m) =>
    m.id !== random.id &&
    (m.concepts || []).some((c) => relatedConcepts.includes(c))
  ).length;

  return {
    name: "Emergence",
    description: "Discover unexpected connections and novel insights",
    status: "complete",
    result: `Surfaced insight from memory #${random.id}: "${random.summary?.slice(0, 60)}"`,
    lastRun: new Date().toISOString(),
    emergence: {
      memory: {
        id: random.id,
        summary: random.summary,
        type: random.memory_type,
        importance: random.importance,
      },
      relatedConcepts,
      potentialConnections,
    },
  };
}

export function runFullDreamCycle(memories: Memory[]): DreamPhaseResult[] {
  return [
    runConsolidation(memories),
    runCompaction(memories),
    runReflection(memories),
    runContradiction(memories),
    runEmergence(memories),
  ];
}
