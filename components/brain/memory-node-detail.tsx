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
}: {
  memory: Memory;
  onClose: () => void;
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-neutral-800 pb-3">
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
            <span className="text-[10px] text-neutral-600">#{memory.id}</span>
          </div>
          <p className="mt-1.5 text-sm text-neutral-200">{memory.summary}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pt-3">
        {/* Retrieval Score Breakdown */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
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
          <div className="mt-2 rounded-md bg-neutral-800/50 px-2.5 py-1.5 text-[10px]">
            <span className="text-neutral-500">Local _score: </span>
            <span className="font-mono text-white">
              {breakdown.localScore.toFixed(3)}
            </span>
          </div>
        </div>

        {/* Hebbian Reinforcement */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
            Hebbian Reinforcement
          </h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-neutral-800/50 p-2 text-center">
              <p className="text-lg font-bold text-amber-400">
                {memory.access_count || 0}
              </p>
              <p className="text-[9px] text-neutral-500">recalls</p>
            </div>
            <div className="rounded-md bg-neutral-800/50 p-2 text-center">
              <p className="text-lg font-bold text-green-400">
                +{(hebbianGrowth * 100).toFixed(1)}%
              </p>
              <p className="text-[9px] text-neutral-500">imp growth</p>
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-neutral-500">Effective importance</span>
              <span className="font-mono text-white">
                {Math.round(effectiveImportance * 100)}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-800">
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
            <div className="mt-0.5 flex justify-between text-[9px] text-neutral-600">
              <span>base: {Math.round(memory.importance * 100)}%</span>
              <span>+{(hebbianGrowth * 100).toFixed(1)}% from recall</span>
            </div>
          </div>
        </div>

        {/* Graph Connections */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">
            Graph Connections ({connections.length})
          </h4>
          {connections.length > 0 ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[10px] text-neutral-500">
                  Total link strength:
                </span>
                <span className="font-mono text-xs text-white">
                  {totalLinkStrength}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {connectedMemories.slice(0, 6).map((cm) => {
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
                  return (
                    <div
                      key={cm.id}
                      className="flex items-center gap-2 rounded-md bg-neutral-800/40 px-2 py-1.5"
                    >
                      <div
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: TYPE_COLORS[cm.memory_type],
                        }}
                      />
                      <span className="flex-1 truncate text-[10px] text-neutral-300">
                        {cm.summary?.slice(0, 45)}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-purple-400">
                        str:{link?.value || 0}
                      </span>
                    </div>
                  );
                })}
                {connectedMemories.length > 6 && (
                  <p className="text-[9px] text-neutral-600">
                    +{connectedMemories.length - 6} more
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-[10px] text-neutral-600">
              No connections yet
            </p>
          )}
        </div>

        {/* Raw Memory Data */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Memory Data
          </h4>
          <div className="mt-2 space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-neutral-500">Content</span>
            </div>
            <p className="rounded-md bg-neutral-800/30 p-2 text-[10px] leading-relaxed text-neutral-400">
              {memory.content}
            </p>
            {memory.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {memory.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-400"
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
                    className="rounded bg-purple-950/30 px-1.5 py-0.5 text-[9px] text-purple-400"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
              <div className="flex justify-between">
                <span className="text-neutral-600">valence</span>
                <span className="text-neutral-300">
                  {(memory.emotional_valence || 0) > 0 ? "+" : ""}
                  {(memory.emotional_valence || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">source</span>
                <span className="text-neutral-300">{memory.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">created</span>
                <span className="text-neutral-300">
                  {new Date(memory.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">accessed</span>
                <span className="text-neutral-300">
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
      <span className="w-20 text-[10px] text-neutral-400">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
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
        <span className="w-5 text-right text-[9px] text-neutral-600">
          &times;{weight}
        </span>
      )}
      <span className="w-16 text-right text-[9px] text-neutral-600">
        {detail}
      </span>
    </div>
  );
}
