"use client";

import { X } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import {
  TYPE_COLORS,
  TYPE_LABELS,
  DECAY_RATES,
  type Memory,
  type MemoryType,
} from "@/lib/types";

const TYPE_BOOSTS: Record<MemoryType, number> = {
  semantic: 0.15,
  procedural: 0.12,
  self_model: 0.1,
  episodic: 0.0,
  introspective: 0.08,
};

function computeRetrievalBreakdown(memory: Memory) {
  const hoursOld =
    (Date.now() - new Date(memory.created_at).getTime()) / 3600000;
  const recency = Math.pow(0.995, hoursOld);
  const importance = memory.importance;
  const decayFactor = memory.decay_factor ?? 1;
  const typeBoost = 1 + (TYPE_BOOSTS[memory.memory_type] || 0);
  const decayRate = DECAY_RATES[memory.memory_type] || 0.03;

  // Local score approximation
  const localScore =
    0.6 * 1.0 + // term_score (unknown, assume 1 for self)
    0.2 * importance +
    0.1 * decayFactor +
    0.1 * recency;

  return {
    recency,
    importance,
    decayFactor,
    typeBoost,
    decayRate,
    localScore,
    hoursOld,
  };
}

export function MemoryNodeDetail({
  memory,
  onClose,
  onNavigate,
}: {
  memory: Memory;
  onClose: () => void;
  onNavigate?: (memoryId: number) => void;
}) {
  const { graphData, memories } = useMemory();
  const breakdown = computeRetrievalBreakdown(memory);

  // Hebbian stats for this memory
  const hebbianGrowth = Math.min(
    (memory.access_count || 0) * 0.01,
    1 - memory.importance
  );
  const effectiveImportance = Math.min(
    1,
    memory.importance + hebbianGrowth
  );

  // Count connections in graph
  const connections = graphData.links.filter((l) => {
    const src = typeof l.source === "object" ? (l.source as any).id : l.source;
    const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
    return src === memory.id || tgt === memory.id;
  });

  const connectedMemoryIds = connections.map((l) => {
    const src = typeof l.source === "object" ? (l.source as any).id : l.source;
    const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
    return src === memory.id ? tgt : src;
  });

  const connectedMemories = connectedMemoryIds
    .map((id) => memories.find((m) => m.id === id))
    .filter(Boolean) as Memory[];

  const totalLinkStrength = connections.reduce((s, l) => s + l.value, 0);
  const graphBoost = connections.length > 0 ? 1 + connections.length * 0.02 : 1;

  // Retrieval-scored related memories
  const selectedTags = new Set([...(memory.tags || []), ...(memory.concepts || [])]);
  const now = Date.now();
  const retrievalScored = memories
    .filter((m) => m.id !== memory.id)
    .map((m) => {
      const memTags = [...(m.tags || []), ...(m.concepts || [])];
      let shared = 0;
      for (const t of memTags) if (selectedTags.has(t)) shared++;
      const relevance = selectedTags.size > 0 ? shared / selectedTags.size : 0;
      const ageMs = now - new Date(m.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recency = Math.exp(-ageDays * 0.05);
      const decayRate = DECAY_RATES[m.memory_type] || 0.03;
      const decay = Math.max(0, 1 - decayRate * ageDays);
      const typeBoost = 1 + (TYPE_BOOSTS[m.memory_type] || 0);
      const score = ((recency * 1 + relevance * 2 + m.importance * 2) / 5) * decay * typeBoost;
      return { memory: m, score };
    })
    .filter((r) => r.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const maxRetrievalScore = retrievalScored[0]?.score || 1;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex-1 pr-2">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[memory.memory_type] }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: TYPE_COLORS[memory.memory_type] }}
            >
              {TYPE_LABELS[memory.memory_type]}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>#{memory.id}</span>
          </div>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text)" }}>{memory.summary}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-[4px] p-1 transition"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pt-3">
        {/* Retrieval Score Breakdown */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-cyan-500">
            Retrieval Score Breakdown
          </h4>
          <div className="mt-2 space-y-1.5">
            <ScoreRow
              label="Recency"
              value={breakdown.recency}
              weight={1}
              color="#06b6d4"
              detail={`0.995^${Math.round(breakdown.hoursOld)}h`}
            />
            <ScoreRow
              label="Importance"
              value={breakdown.importance}
              weight={2}
              color="#f59e0b"
              detail={`base: ${Math.round(breakdown.importance * 100)}%`}
            />
            <ScoreRow
              label="Decay Factor"
              value={breakdown.decayFactor}
              weight={0}
              color="#22c55e"
              detail={`${(breakdown.decayRate * 100).toFixed(0)}%/day`}
            />
            <ScoreRow
              label="Type Boost"
              value={breakdown.typeBoost - 1}
              weight={0}
              color="#f43f5e"
              detail={`+${((breakdown.typeBoost - 1) * 100).toFixed(0)}%`}
            />
            <ScoreRow
              label="Graph Boost"
              value={graphBoost - 1}
              weight={0}
              color="#f97316"
              detail={`${connections.length} links → +${((graphBoost - 1) * 100).toFixed(0)}%`}
            />
          </div>
          <div className="mt-2 rounded-[4px] px-2.5 py-1.5 text-[10px]" style={{ background: "var(--surface-dimmer)" }}>
            <span style={{ color: "var(--text-faint)" }}>Local _score: </span>
            <span className="font-mono" style={{ color: "var(--text)" }}>
              {breakdown.localScore.toFixed(3)}
            </span>
          </div>
        </div>

        {/* Hebbian Reinforcement — per-node detail */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">
            Hebbian Reinforcement
          </h4>

          {/* Core stats row */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
              <p className="text-lg font-bold text-amber-500">
                {memory.access_count || 0}
              </p>
              <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>recalls</p>
            </div>
            <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
              <p className="text-lg font-bold text-green-500">
                +{(hebbianGrowth * 100).toFixed(1)}%
              </p>
              <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>imp growth</p>
            </div>
            <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
              <p className="text-lg font-bold text-purple-500">
                {connections.length}
              </p>
              <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>links</p>
            </div>
          </div>

          {/* Effective importance bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: "var(--text-muted)" }}>Effective importance</span>
              <span className="font-mono" style={{ color: "var(--text)" }}>
                {Math.round(effectiveImportance * 100)}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
              <div className="relative h-full">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-500/40"
                  style={{ width: `${effectiveImportance * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
                  style={{ width: `${memory.importance * 100}%` }}
                />
              </div>
            </div>
            <div className="mt-0.5 flex justify-between text-[9px]" style={{ color: "var(--text-faint)" }}>
              <span>base: {Math.round(memory.importance * 100)}%</span>
              <span>+{(hebbianGrowth * 100).toFixed(1)}% from {memory.access_count || 0} recalls (&times;0.01)</span>
            </div>
          </div>

          {/* Reinforcement rules applied to this node */}
          <div className="mt-3 rounded-[4px] p-2 text-[10px] space-y-1" style={{ background: "var(--surface-dim)" }}>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Importance increment</span>
              <span className="font-mono text-amber-500">
                {memory.access_count || 0} &times; 0.01 = +{((memory.access_count || 0) * 0.01).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Capped at</span>
              <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                1.0 (current: {memory.importance.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Co-retrieval links</span>
              <span className="font-mono text-purple-500">
                {connections.length} &times; +0.05 per co-retrieval
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Graph boost</span>
              <span className="font-mono text-orange-500">
                {connections.length} links &rarr; &times;{graphBoost.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Association links with strength bars */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500">
                Association Links ({connections.length})
              </p>
              {connections.length > 0 && (
                <span className="font-mono text-[9px]" style={{ color: "var(--text-faint)" }}>
                  total str: {totalLinkStrength}
                </span>
              )}
            </div>
            {connections.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {connectedMemories
                  .map((cm) => {
                    const link = connections.find((l) => {
                      const src =
                        typeof l.source === "object"
                          ? (l.source as any).id
                          : l.source;
                      const tgt =
                        typeof l.target === "object"
                          ? (l.target as any).id
                          : l.target;
                      return src === cm.id || tgt === cm.id;
                    });
                    const strength = link?.value || 0;
                    const sharedTags = (memory.tags || []).filter((t) =>
                      (cm.tags || []).includes(t)
                    );
                    const sharedConcepts = (memory.concepts || []).filter((c) =>
                      (cm.concepts || []).includes(c)
                    );
                    const coRetrievalEst = Math.min(
                      (memory.access_count || 0),
                      (cm.access_count || 0)
                    );
                    return { cm, strength, sharedTags, sharedConcepts, coRetrievalEst };
                  })
                  .sort((a, b) => b.strength - a.strength)
                  .slice(0, 8)
                  .map(({ cm, strength, sharedTags, sharedConcepts, coRetrievalEst }) => {
                    const maxStrength = Math.max(
                      ...connections.map((l) => l.value),
                      1
                    );
                    return (
                      <div
                        key={cm.id}
                        className="rounded-[4px] px-2.5 py-2 transition-all duration-150 cursor-pointer hover:scale-[1.01]"
                        style={{ background: "var(--surface-dimmer)" }}
                        onClick={() => onNavigate?.(cm.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: TYPE_COLORS[cm.memory_type],
                            }}
                          />
                          <span className="flex-1 truncate text-[10px]" style={{ color: "var(--text)" }}>
                            #{cm.id} {cm.summary?.slice(0, 40)}
                          </span>
                        </div>
                        {/* Strength bar */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="w-8 text-[9px]" style={{ color: "var(--text-faint)" }}>str</span>
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-purple-500"
                              style={{
                                width: `${(strength / maxStrength) * 100}%`,
                                opacity: 0.7,
                              }}
                            />
                          </div>
                          <span className="w-6 text-right font-mono text-[9px] text-purple-500">
                            {strength}
                          </span>
                        </div>
                        {/* Shared tags/concepts */}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {sharedTags.map((t) => (
                            <span
                              key={`t-${t}`}
                              className="rounded-[3px] px-1 py-0.5 text-[8px]"
                              style={{ background: "var(--surface-dim)", color: "var(--text-muted)" }}
                            >
                              {t}
                            </span>
                          ))}
                          {sharedConcepts.map((c) => (
                            <span
                              key={`c-${c}`}
                              className="rounded-[3px] px-1 py-0.5 text-[8px]"
                              style={{ background: "rgba(147, 51, 234, 0.1)", color: "rgb(147, 51, 234)" }}
                            >
                              {c}
                            </span>
                          ))}
                          <span className="text-[8px]" style={{ color: "var(--text-faint)" }}>
                            ~{coRetrievalEst} co-retrievals
                          </span>
                        </div>
                      </div>
                    );
                  })}
                {connectedMemories.length > 8 && (
                  <p className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                    +{connectedMemories.length - 8} more connections
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                No associations yet &mdash; links form when memories share tags/concepts or have vector similarity &ge;0.6
              </p>
            )}
          </div>

          {/* Retrieval-linked memories */}
          {retrievalScored.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                Retrieval-Linked ({retrievalScored.length})
              </p>
              <div className="mt-2 space-y-1.5">
                {retrievalScored.map(({ memory: m, score }) => (
                  <div
                    key={m.id}
                    className="rounded-[4px] px-2.5 py-2 transition-all duration-150 cursor-pointer hover:scale-[1.01]"
                    style={{ background: "var(--surface-dimmer)" }}
                    onClick={() => onNavigate?.(m.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[m.memory_type] }}
                      />
                      <span className="flex-1 truncate text-[10px]" style={{ color: "var(--text)" }}>
                        #{m.id} {m.summary?.slice(0, 40)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="w-8 text-[9px]" style={{ color: "var(--text-faint)" }}>score</span>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${(score / maxRetrievalScore) * 100}%`,
                            background: "var(--accent)",
                            opacity: 0.6,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-[9px]" style={{ color: "var(--accent)" }}>
                        {score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Raw Memory Data */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Memory Data
          </h4>
          <div className="mt-2 space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Content</span>
            </div>
            <p className="rounded-[4px] p-2 text-[10px] leading-relaxed" style={{ background: "var(--surface-dim)", color: "var(--text-muted)" }}>
              {memory.content}
            </p>
            {memory.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {memory.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-[3px] px-1.5 py-0.5 text-[9px]"
                    style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {(memory.concepts?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {memory.concepts.map((c) => (
                  <span
                    key={c}
                    className="rounded-[3px] px-1.5 py-0.5 text-[9px]"
                    style={{ background: "rgba(147, 51, 234, 0.1)", color: "rgb(147, 51, 234)" }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>valence</span>
                <span style={{ color: "var(--text)" }}>
                  {(memory.emotional_valence || 0) > 0 ? "+" : ""}
                  {(memory.emotional_valence || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>source</span>
                <span style={{ color: "var(--text)" }}>{memory.source}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>created</span>
                <span style={{ color: "var(--text)" }}>
                  {new Date(memory.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>accessed</span>
                <span style={{ color: "var(--text)" }}>
                  {new Date(memory.last_accessed).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  weight,
  color,
  detail,
}: {
  label: string;
  value: number;
  weight: number;
  color: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(value, 1) * 100}%`,
            backgroundColor: color,
            opacity: 0.7,
          }}
        />
      </div>
      <span className="w-12 text-right font-mono text-[9px]" style={{ color }}>
        {value.toFixed(3)}
      </span>
      {weight > 0 && (
        <span className="w-5 text-right text-[9px]" style={{ color: "var(--text-faint)" }}>
          &times;{weight}
        </span>
      )}
      <span className="w-16 text-right text-[9px]" style={{ color: "var(--text-faint)" }}>
        {detail}
      </span>
    </div>
  );
}
