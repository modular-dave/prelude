"use client";

import { useMemory } from "@/lib/memory-context";
import { Activity } from "lucide-react";
import { DECAY_RATES, TYPE_LABELS, type MemoryType } from "@/lib/types";

const WEIGHTS = {
  recency: { value: 1, label: "Recency", color: "#06b6d4" },
  relevance: { value: 2, label: "Relevance", color: "#3b82f6" },
  importance: { value: 2, label: "Importance", color: "#f59e0b" },
  vector: { value: 4, label: "Vector Sim", color: "#8b5cf6" },
};

const TYPE_BOOSTS: Record<MemoryType, number> = {
  semantic: 0.15,
  procedural: 0.12,
  self_model: 0.1,
  episodic: 0.0,
  introspective: 0.08,
};

export function RetrievalFormula() {
  const { memories } = useMemory();

  const totalWeight = Object.values(WEIGHTS).reduce((s, w) => s + w.value, 0);

  // Compute live decay examples from actual memories
  const avgHoursOld =
    memories.length > 0
      ? memories.reduce(
          (s, m) =>
            s + (Date.now() - new Date(m.created_at).getTime()) / 3600000,
          0
        ) / memories.length
      : 0;

  const liveDecay = Math.pow(0.995, avgHoursOld);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-cyan-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
          Retrieval Scoring Formula
        </h3>
      </div>

      {/* Formula display */}
      <div className="mt-4 rounded-lg bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-neutral-300">
        <span className="text-neutral-500">score = </span>
        <span className="text-cyan-400">(R&times;1</span>
        <span className="text-neutral-500"> + </span>
        <span className="text-blue-400">Rel&times;2</span>
        <span className="text-neutral-500"> + </span>
        <span className="text-amber-400">I&times;2</span>
        <span className="text-neutral-500"> + </span>
        <span className="text-purple-400">V&times;4</span>
        <span className="text-cyan-400">)</span>
        <span className="text-neutral-500"> / {totalWeight} &times; </span>
        <span className="text-green-400">decay</span>
        <span className="text-neutral-500"> &times; </span>
        <span className="text-rose-400">type_boost</span>
        <span className="text-neutral-500"> &times; </span>
        <span className="text-orange-400">graph_boost</span>
      </div>

      {/* Weight bars */}
      <div className="mt-4 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-600">
          Weight Distribution
        </p>
        {Object.entries(WEIGHTS).map(([key, w]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-20 text-[11px] text-neutral-400">{w.label}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${(w.value / 4) * 100}%`,
                  backgroundColor: w.color,
                  opacity: 0.8,
                }}
              />
            </div>
            <span
              className="w-6 text-right text-[11px] font-bold"
              style={{ color: w.color }}
            >
              &times;{w.value}
            </span>
          </div>
        ))}
      </div>

      {/* Live decay */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-neutral-800/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600">
            Decay Function
          </p>
          <p className="mt-1 font-mono text-xs text-green-400">
            0.995<sup>hours</sup>
          </p>
          <p className="mt-1 text-[10px] text-neutral-500">
            Live avg: {(liveDecay * 100).toFixed(1)}%
            <span className="text-neutral-600">
              {" "}
              ({Math.round(avgHoursOld)}h avg age)
            </span>
          </p>
        </div>
        <div className="rounded-lg bg-neutral-800/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600">
            Local Score
          </p>
          <p className="mt-1 font-mono text-xs text-neutral-300">
            <span className="text-cyan-400">term</span>&times;0.6 +{" "}
            <span className="text-amber-400">imp</span>&times;0.2 +{" "}
            <span className="text-green-400">dec</span>&times;0.1 +{" "}
            <span className="text-purple-400">rec</span>&times;0.1
          </p>
        </div>
      </div>

      {/* Type boosts */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-600">
          Type Boosts
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(TYPE_BOOSTS) as MemoryType[]).map((type) => (
            <div
              key={type}
              className="rounded-md bg-neutral-800/60 px-2 py-1 text-[10px]"
            >
              <span className="text-neutral-400">{TYPE_LABELS[type]}</span>{" "}
              <span className="font-mono text-rose-400">
                +{(TYPE_BOOSTS[type] * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Decay rates per type */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-600">
          Decay Rates (per day)
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(DECAY_RATES) as MemoryType[]).map((type) => (
            <div
              key={type}
              className="rounded-md bg-neutral-800/60 px-2 py-1 text-[10px]"
            >
              <span className="text-neutral-400">{TYPE_LABELS[type]}</span>{" "}
              <span className="font-mono text-green-400">
                {(DECAY_RATES[type] * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
