"use client";

import { useMemory } from "@/lib/memory-context";
import { Activity } from "lucide-react";

const WEIGHTS = {
  recency: { value: 1, label: "Recency", color: "#06b6d4" },
  relevance: { value: 2, label: "Relevance", color: "#3b82f6" },
  importance: { value: 2, label: "Importance", color: "#f59e0b" },
  vector: { value: 4, label: "Vector Sim", color: "#8b5cf6" },
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
    <div className="rounded-[6px] p-5" style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-cyan-500" />
        <h3 className="t-label" style={{ color: "var(--text)" }}>
          Retrieval Scoring Formula
        </h3>
      </div>

      {/* Formula display */}
      <div className="mt-4 rounded-[4px] p-4 font-mono leading-relaxed" style={{ background: "var(--surface-dimmer)", color: "var(--text)" }}>
        <span style={{ color: "var(--text-faint)" }}>score = </span>
        <span className="text-cyan-500">(R&times;1</span>
        <span style={{ color: "var(--text-faint)" }}> + </span>
        <span className="text-blue-500">Rel&times;2</span>
        <span style={{ color: "var(--text-faint)" }}> + </span>
        <span className="text-amber-500">I&times;2</span>
        <span style={{ color: "var(--text-faint)" }}> + </span>
        <span className="text-purple-500">V&times;4</span>
        <span className="text-cyan-500">)</span>
        <span style={{ color: "var(--text-faint)" }}> / {totalWeight} &times; </span>
        <span className="text-green-500">decay</span>
        <span style={{ color: "var(--text-faint)" }}> &times; </span>
        <span className="text-rose-500">type_boost</span>
        <span style={{ color: "var(--text-faint)" }}> &times; </span>
        <span className="text-orange-500">graph_boost</span>
      </div>

      {/* Weight bars */}
      <div className="mt-4 space-y-2">
        <p className="t-label" style={{ color: "var(--text-faint)" }}>
          Weight Distribution
        </p>
        {Object.entries(WEIGHTS).map(([key, w]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-20" style={{ color: "var(--text-muted)" }}>{w.label}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
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
              className="w-6 text-right t-btn"
              style={{ color: w.color }}
            >
              &times;{w.value}
            </span>
          </div>
        ))}
      </div>

      {/* Live decay */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[4px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <p className="t-label" style={{ color: "var(--text-faint)" }}>
            Decay Function
          </p>
          <p className="mt-1 font-mono t-small text-green-500">
            0.995<sup>hours</sup>
          </p>
          <p className="mt-1 t-small" style={{ color: "var(--text-muted)" }}>
            Live avg: {(liveDecay * 100).toFixed(1)}%
            <span style={{ color: "var(--text-faint)" }}>
              {" "}
              ({Math.round(avgHoursOld)}h avg age)
            </span>
          </p>
        </div>
        <div className="rounded-[4px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <p className="t-label" style={{ color: "var(--text-faint)" }}>
            Local Score
          </p>
          <p className="mt-1 font-mono t-small" style={{ color: "var(--text)" }}>
            <span className="text-cyan-500">term</span>&times;0.6 +{" "}
            <span className="text-amber-500">imp</span>&times;0.2 +{" "}
            <span className="text-green-500">dec</span>&times;0.1 +{" "}
            <span className="text-purple-500">rec</span>&times;0.1
          </p>
        </div>
      </div>

    </div>
  );
}
