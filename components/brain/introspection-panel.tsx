"use client";

import { useMemory } from "@/lib/memory-context";
import { Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { TYPE_COLORS, TYPE_LABELS, type MemoryType } from "@/lib/types";

export function IntrospectionPanel() {
  const { memories } = useMemory();

  if (memories.length === 0) {
    return (
      <div className="rounded-[6px] p-5" style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-rose-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
            Introspection
          </h3>
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--text-faint)" }}>
          No memories to introspect on yet.
        </p>
      </div>
    );
  }

  // Self-model analysis
  const selfModelMems = memories.filter((m) => m.memory_type === "self_model");
  const introspectiveMems = memories.filter(
    (m) => m.memory_type === "introspective"
  );

  // Emotional landscape
  const withValence = memories.filter(
    (m) => m.emotional_valence !== undefined && m.emotional_valence !== 0
  );
  const avgValence =
    withValence.length > 0
      ? withValence.reduce((s, m) => s + m.emotional_valence, 0) /
        withValence.length
      : 0;
  const positive = withValence.filter((m) => m.emotional_valence > 0.1).length;
  const negative = withValence.filter((m) => m.emotional_valence < -0.1).length;
  const neutral = withValence.length - positive - negative;

  // Type distribution for personality fingerprint
  const typeCounts: Record<MemoryType, number> = {
    episodic: 0,
    semantic: 0,
    procedural: 0,
    self_model: 0,
    introspective: 0,
  };
  for (const m of memories) {
    typeCounts[m.memory_type]++;
  }
  const dominant = (Object.entries(typeCounts) as [MemoryType, number][]).sort(
    ([, a], [, b]) => b - a
  )[0];

  // Concept frequency for cognitive focus areas
  const conceptFreq: Record<string, number> = {};
  for (const m of memories) {
    for (const c of m.concepts || []) {
      conceptFreq[c] = (conceptFreq[c] || 0) + 1;
    }
  }
  const topConcepts = Object.entries(conceptFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  // Importance distribution
  const highImp = memories.filter((m) => m.importance >= 0.7).length;
  const midImp = memories.filter(
    (m) => m.importance >= 0.3 && m.importance < 0.7
  ).length;
  const lowImp = memories.filter((m) => m.importance < 0.3).length;

  // Recent vs old memory balance
  const now = Date.now();
  const recentCount = memories.filter(
    (m) => now - new Date(m.created_at).getTime() < 24 * 3600000
  ).length;

  return (
    <div className="rounded-[6px] p-5" style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-rose-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
          Introspection &amp; Self-Model
        </h3>
      </div>

      {/* Self model stats */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-[4px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Self-Model Memories
          </p>
          <p className="mt-1 text-xl font-bold" style={{ color: TYPE_COLORS.self_model }}>
            {selfModelMems.length}
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {selfModelMems.length > 0
              ? `avg imp: ${Math.round(
                  (selfModelMems.reduce((s, m) => s + m.importance, 0) /
                    selfModelMems.length) *
                    100
                )}%`
              : "none yet"}
          </p>
        </div>
        <div className="rounded-[4px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Introspective
          </p>
          <p
            className="mt-1 text-xl font-bold"
            style={{ color: TYPE_COLORS.introspective }}
          >
            {introspectiveMems.length}
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {introspectiveMems.length > 0
              ? `avg imp: ${Math.round(
                  (introspectiveMems.reduce((s, m) => s + m.importance, 0) /
                    introspectiveMems.length) *
                    100
                )}%`
              : "none yet"}
          </p>
        </div>
      </div>

      {/* Emotional landscape */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Emotional Landscape
        </p>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span className="text-[11px] text-green-500">{positive}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{neutral}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-red-500" />
            <span className="text-[11px] text-red-500">{negative}</span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
            avg: {avgValence > 0 ? "+" : ""}
            {avgValence.toFixed(2)}
          </span>
        </div>
        {/* Valence bar */}
        <div className="mt-2 flex h-2 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
          {positive > 0 && (
            <div
              className="bg-green-500"
              style={{
                width: `${(positive / Math.max(withValence.length, 1)) * 100}%`,
              }}
            />
          )}
          {neutral > 0 && (
            <div
              style={{
                width: `${(neutral / Math.max(withValence.length, 1)) * 100}%`,
                background: "var(--text-faint)",
                opacity: 0.3,
              }}
            />
          )}
          {negative > 0 && (
            <div
              className="bg-red-500"
              style={{
                width: `${(negative / Math.max(withValence.length, 1)) * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* Cognitive fingerprint */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Cognitive Fingerprint
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Dominant:{" "}
          <span style={{ color: TYPE_COLORS[dominant[0]] }}>
            {TYPE_LABELS[dominant[0]]}
          </span>{" "}
          ({dominant[1]}/{memories.length})
        </p>
        <div className="mt-2 space-y-1">
          {(Object.keys(typeCounts) as MemoryType[]).map((type) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-20 text-[10px]" style={{ color: "var(--text-muted)" }}>
                {TYPE_LABELS[type]}
              </span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${
                      (typeCounts[type] / Math.max(memories.length, 1)) * 100
                    }%`,
                    backgroundColor: TYPE_COLORS[type],
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="w-6 text-right text-[10px]" style={{ color: "var(--text-faint)" }}>
                {typeCounts[type]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Importance tiers */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Importance Distribution
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-[4px] p-2 text-center" style={{ background: "rgba(34, 197, 94, 0.08)" }}>
            <p className="text-sm font-bold text-green-500">{highImp}</p>
            <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>high &ge;70%</p>
          </div>
          <div className="rounded-[4px] p-2 text-center" style={{ background: "rgba(245, 158, 11, 0.08)" }}>
            <p className="text-sm font-bold text-amber-500">{midImp}</p>
            <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>mid 30-70%</p>
          </div>
          <div className="rounded-[4px] p-2 text-center" style={{ background: "rgba(239, 68, 68, 0.08)" }}>
            <p className="text-sm font-bold text-red-500">{lowImp}</p>
            <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>low &lt;30%</p>
          </div>
        </div>
      </div>

      {/* Cognitive focus areas */}
      {topConcepts.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Cognitive Focus Areas
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topConcepts.map(([concept, count]) => (
              <span
                key={concept}
                className="rounded-[4px] px-2 py-0.5 text-[10px]"
                style={{
                  background: "var(--surface-dim)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  opacity: 0.5 + (count / Math.max(topConcepts[0][1] as number, 1)) * 0.5,
                }}
              >
                {concept}{" "}
                <span style={{ color: "var(--text-faint)" }}>&times;{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Activity pulse */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          24h activity:
        </span>
        <span className="text-[11px] font-bold" style={{ color: "var(--text)" }}>
          {recentCount}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          new memories in last 24h
        </span>
      </div>
    </div>
  );
}
