import type { Memory, DreamPhase, MemoryType } from "./types";
import { TYPE_LABELS } from "./types";
import type { DreamSettings } from "./dream-settings";
import { DEFAULT_DREAM_SETTINGS } from "./dream-settings";

export interface ConsolidationCluster {
  tag: string;
  memoryIds: number[];
  avgImportance: number;
  memories: { id: number; summary: string; importance: number; type: MemoryType }[];
}

export interface CompactionCandidate {
  id: number;
  summary: string;
  importance: number;
  decayFactor: number;
  createdAt: string;
  type: MemoryType;
}

export interface ReflectionInsight {
  dominantType: string;
  dominantCount: number;
  avgImportance: number;
  emotionalTone: "positive" | "negative" | "neutral";
  avgValence: number;
  totalMemories: number;
  typeCounts: Record<string, number>;
}

export interface ContradictionPair {
  memoryA: { id: number; summary: string; valence: number; type: MemoryType };
  memoryB: { id: number; summary: string; valence: number; type: MemoryType };
  sharedConcept: string;
}

export interface EmergenceLink {
  memory: { id: number; summary: string; type: string; importance: number };
  relatedConcepts: string[];
  potentialConnections: number;
  connectedMemories: { id: number; summary: string; type: MemoryType; sharedConcepts: string[] }[];
}

export interface DreamPhaseResult extends DreamPhase {
  clusters?: ConsolidationCluster[];
  candidates?: CompactionCandidate[];
  reflection?: ReflectionInsight;
  contradictions?: ContradictionPair[];
  emergence?: EmergenceLink;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function runConsolidation(memories: Memory[], settings: DreamSettings = DEFAULT_DREAM_SETTINGS): DreamPhaseResult {
  const tagMap: Record<string, number[]> = {};
  for (const m of memories) {
    for (const tag of m.tags || []) {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(m.id);
    }
  }
  const clusters: ConsolidationCluster[] = Object.entries(tagMap)
    .filter(([, ids]) => ids.length >= settings.clusterMinSize)
    .map(([tag, ids]) => {
      const clusterMemories = ids
        .map((id) => memories.find((mem) => mem.id === id))
        .filter(Boolean) as Memory[];
      return {
        tag,
        memoryIds: ids,
        avgImportance:
          clusterMemories.reduce((s, m) => s + m.importance, 0) / clusterMemories.length,
        memories: clusterMemories.map((m) => ({
          id: m.id,
          summary: m.summary,
          importance: m.importance,
          type: m.memory_type,
        })),
      };
    })
    .sort((a, b) => b.memoryIds.length - a.memoryIds.length);

  const top = clusters[0];
  const reasoning = clusters.length > 0
    ? `Scanned ${memories.length} memories across their tag associations. Found ${clusters.length} cluster${clusters.length > 1 ? "s" : ""} where memories share common tags. The largest cluster "${top.tag}" groups ${top.memoryIds.length} memories with ${Math.round(top.avgImportance * 100)}% average importance. ${clusters.length > 1 ? `Other notable clusters: ${clusters.slice(1, 3).map((c) => `"${c.tag}" (${c.memoryIds.length})`).join(", ")}.` : ""}`
    : `Scanned ${memories.length} memories but found no clusters yet — memories need shared tags to form groups.`;

  return {
    name: "Consolidation",
    description: "Group related memories by shared tags and concepts",
    status: "complete",
    result:
      clusters.length > 0
        ? `${clusters.length} clusters found`
        : "No clusters found — more memories needed",
    reasoning,
    lastRun: new Date().toISOString(),
    clusters,
  };
}

export function runCompaction(memories: Memory[], settings: DreamSettings = DEFAULT_DREAM_SETTINGS): DreamPhaseResult {
  const candidates: CompactionCandidate[] = memories
    .filter((m) => m.importance < settings.compactionMaxImportance && (m.decay_factor || 1) < settings.compactionMaxDecay)
    .map((m) => ({
      id: m.id,
      summary: m.summary,
      importance: m.importance,
      decayFactor: m.decay_factor || 1,
      createdAt: m.created_at,
      type: m.memory_type,
    }))
    .sort((a, b) => a.decayFactor - b.decayFactor);

  const reasoning = candidates.length > 0
    ? `Scanned ${memories.length} memories for decay (importance < ${Math.round(settings.compactionMaxImportance * 100)}% AND decay factor < ${Math.round(settings.compactionMaxDecay * 100)}%). ${candidates.length} memor${candidates.length > 1 ? "ies" : "y"} flagged for compaction. The most faded is #${candidates[0].id} "${candidates[0].summary.slice(0, 40)}..." at ${Math.round(candidates[0].importance * 100)}% importance and ${Math.round(candidates[0].decayFactor * 100)}% decay, created ${timeAgo(candidates[0].createdAt)}.`
    : `Scanned ${memories.length} memories for decay signals. All memories remain above compaction thresholds (importance ≥ ${Math.round(settings.compactionMaxImportance * 100)}% or decay ≥ ${Math.round(settings.compactionMaxDecay * 100)}%). Memory health is good.`;

  return {
    name: "Compaction",
    description: "Identify fading low-importance memories for compression",
    status: "complete",
    result:
      candidates.length > 0
        ? `${candidates.length} flagged for compaction`
        : "All memories healthy",
    reasoning,
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
      reasoning: "No memories available for self-model analysis.",
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
  const sorted = Object.entries(typeCounts).sort(([, a], [, b]) => b - a);
  const dominantType = sorted[0];
  const emotionalTone: "positive" | "negative" | "neutral" =
    avgValence > 0.1 ? "positive" : avgValence < -0.1 ? "negative" : "neutral";

  const reflection: ReflectionInsight = {
    dominantType: dominantType[0],
    dominantCount: dominantType[1],
    avgImportance,
    emotionalTone,
    avgValence,
    totalMemories: memories.length,
    typeCounts,
  };

  const typeBreakdown = sorted
    .map(([t, c]) => `${TYPE_LABELS[t as MemoryType] || t}: ${c}`)
    .join(", ");

  const reasoning = `Analyzed ${memories.length} memories for self-model insight. Memory profile is predominantly ${TYPE_LABELS[dominantType[0] as MemoryType] || dominantType[0]} (${dominantType[1]}/${memories.length}). Type breakdown: ${typeBreakdown}. Average importance across all memories is ${Math.round(avgImportance * 100)}%. Emotional baseline is ${emotionalTone} (valence: ${avgValence > 0 ? "+" : ""}${avgValence.toFixed(2)}).`;

  return {
    name: "Reflection",
    description: "Review self-model against accumulated knowledge",
    status: "complete",
    result: `${TYPE_LABELS[dominantType[0] as MemoryType] || dominantType[0]} dominant · ${emotionalTone}`,
    reasoning,
    lastRun: new Date().toISOString(),
    reflection,
  };
}

export function runContradiction(memories: Memory[], settings: DreamSettings = DEFAULT_DREAM_SETTINGS): DreamPhaseResult {
  const contradictions: ContradictionPair[] = [];
  for (let i = 0; i < memories.length && contradictions.length < settings.contradictionMaxResults; i++) {
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
        Math.abs((a.emotional_valence || 0) - (b.emotional_valence || 0)) > settings.contradictionMinValenceDiff
      ) {
        contradictions.push({
          memoryA: {
            id: a.id,
            summary: a.summary,
            valence: a.emotional_valence || 0,
            type: a.memory_type,
          },
          memoryB: {
            id: b.id,
            summary: b.summary,
            valence: b.emotional_valence || 0,
            type: b.memory_type,
          },
          sharedConcept: sharedConcepts[0],
        });
      }
    }
  }

  const reasoning = contradictions.length > 0
    ? `Compared ${memories.length} memories for emotional conflicts on shared concepts. Found ${contradictions.length} contradiction${contradictions.length > 1 ? "s" : ""}. The strongest tension is on "${contradictions[0].sharedConcept}" — memory #${contradictions[0].memoryA.id} (valence: ${contradictions[0].memoryA.valence > 0 ? "+" : ""}${contradictions[0].memoryA.valence.toFixed(1)}) opposes #${contradictions[0].memoryB.id} (valence: ${contradictions[0].memoryB.valence > 0 ? "+" : ""}${contradictions[0].memoryB.valence.toFixed(1)}).`
    : `Compared ${memories.length} memories for emotional conflicts on shared concepts. No contradictions detected — emotional consistency across shared concepts.`;

  return {
    name: "Contradiction Resolution",
    description: "Find and resolve conflicting memories",
    status: "complete",
    result:
      contradictions.length > 0
        ? `${contradictions.length} conflicts found`
        : "No contradictions",
    reasoning,
    lastRun: new Date().toISOString(),
    contradictions,
  };
}

export function runEmergence(memories: Memory[], settings: DreamSettings = DEFAULT_DREAM_SETTINGS): DreamPhaseResult {
  if (memories.length < 3) {
    return {
      name: "Emergence",
      description: "Discover unexpected connections and novel insights",
      status: "complete",
      result: "Need more memories for emergence",
      reasoning: "Emergence requires at least 3 memories to discover cross-concept connections.",
      lastRun: new Date().toISOString(),
    };
  }
  const random = memories[Math.floor(Math.random() * memories.length)];
  const relatedConcepts = random.concepts || [];
  const connectedMemories = memories
    .filter((m) =>
      m.id !== random.id &&
      (m.concepts || []).some((c) => relatedConcepts.includes(c))
    )
    .slice(0, settings.emergenceMaxConnections)
    .map((m) => ({
      id: m.id,
      summary: m.summary,
      type: m.memory_type,
      sharedConcepts: (m.concepts || []).filter((c) => relatedConcepts.includes(c)),
    }));

  const reasoning = `Randomly surfaced memory #${random.id} (${TYPE_LABELS[random.memory_type] || random.memory_type}, ${Math.round(random.importance * 100)}% importance). This memory carries ${relatedConcepts.length} concept${relatedConcepts.length !== 1 ? "s" : ""}${relatedConcepts.length > 0 ? `: ${relatedConcepts.slice(0, 4).join(", ")}` : ""}. It connects to ${connectedMemories.length} other memor${connectedMemories.length !== 1 ? "ies" : "y"} through shared concepts${connectedMemories.length > 0 ? `, forming a potential knowledge bridge` : ""}.`;

  return {
    name: "Emergence",
    description: "Discover unexpected connections and novel insights",
    status: "complete",
    result: `Surfaced #${random.id} · ${connectedMemories.length} connections`,
    reasoning,
    lastRun: new Date().toISOString(),
    emergence: {
      memory: {
        id: random.id,
        summary: random.summary,
        type: random.memory_type,
        importance: random.importance,
      },
      relatedConcepts,
      potentialConnections: connectedMemories.length,
      connectedMemories,
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
