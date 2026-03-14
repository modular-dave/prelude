"use client";

import { useState } from "react";
import { Moon, Loader2, CheckCircle2, Circle } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import { runFullDreamCycle } from "@/lib/dream-engine";
import type { DreamPhaseResult } from "@/lib/dream-engine";
import type { DreamPhase } from "@/lib/types";
import { TYPE_COLORS } from "@/lib/types";

const PHASE_ICONS = {
  idle: Circle,
  running: Loader2,
  complete: CheckCircle2,
};

const PHASE_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#f43f5e",
];

function PhaseDetails({ phase }: { phase: DreamPhaseResult }) {
  // Consolidation clusters
  if (phase.clusters && phase.clusters.length > 0) {
    return (
      <div className="mt-2 space-y-1">
        <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {phase.clusters.length} clusters found
        </p>
        {phase.clusters.slice(0, 4).map((c) => (
          <div
            key={c.tag}
            className="rounded-[3px] px-2 py-1 text-[10px]"
            style={{ background: "var(--surface-dimmer)" }}
          >
            <span className="text-blue-500">{c.tag}</span>
            <span style={{ color: "var(--text-muted)" }}>
              {" "}&middot; {c.memoryIds.length} mems &middot;{" "}
              {Math.round(c.avgImportance * 100)}% avg
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Compaction candidates
  if (phase.candidates !== undefined) {
    if (phase.candidates.length === 0) {
      return (
        <p className="mt-2 text-[10px] text-green-500" style={{ opacity: 0.7 }}>
          All memories healthy
        </p>
      );
    }
    return (
      <div className="mt-2 space-y-1">
        <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {phase.candidates.length} flagged for compaction
        </p>
        {phase.candidates.slice(0, 3).map((c) => (
          <div
            key={c.id}
            className="rounded-[3px] px-2 py-1 text-[10px]"
            style={{ background: "var(--surface-dimmer)" }}
          >
            <span className="text-amber-500">#{c.id}</span>
            <span style={{ color: "var(--text-muted)" }}>
              {" "}imp: {Math.round(c.importance * 100)}% &middot; decay:{" "}
              {Math.round(c.decayFactor * 100)}%
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Reflection insight
  if (phase.reflection) {
    const r = phase.reflection;
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <span style={{ color: "var(--text-muted)" }}>Dominant:</span>
          <span
            style={{
              color: TYPE_COLORS[r.dominantType as keyof typeof TYPE_COLORS],
            }}
          >
            {r.dominantType} ({r.dominantCount}/{r.totalMemories})
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span style={{ color: "var(--text-muted)" }}>Avg Importance:</span>
          <span className="text-amber-500">
            {Math.round(r.avgImportance * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span style={{ color: "var(--text-muted)" }}>Emotional Tone:</span>
          <span
            className={
              r.emotionalTone === "positive"
                ? "text-green-500"
                : r.emotionalTone === "negative"
                  ? "text-red-500"
                  : ""
            }
            style={
              r.emotionalTone === "neutral" ? { color: "var(--text-muted)" } : undefined
            }
          >
            {r.emotionalTone} ({r.avgValence > 0 ? "+" : ""}
            {r.avgValence.toFixed(2)})
          </span>
        </div>
      </div>
    );
  }

  // Contradiction pairs
  if (phase.contradictions !== undefined) {
    if (phase.contradictions.length === 0) {
      return (
        <p className="mt-2 text-[10px] text-green-500" style={{ opacity: 0.7 }}>
          No contradictions
        </p>
      );
    }
    return (
      <div className="mt-2 space-y-1.5">
        {phase.contradictions.slice(0, 3).map((c, i) => (
          <div
            key={i}
            className="rounded-[3px] px-2 py-1.5 text-[10px]"
            style={{ background: "var(--surface-dimmer)" }}
          >
            <div className="text-rose-500">
              on &ldquo;{c.sharedConcept}&rdquo;
            </div>
            <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
              #{c.memoryA.id}{" "}
              <span className={c.memoryA.valence > 0 ? "text-green-500" : "text-red-500"}>
                ({c.memoryA.valence > 0 ? "+" : ""}{c.memoryA.valence.toFixed(1)})
              </span>
              {" "}vs #{c.memoryB.id}{" "}
              <span className={c.memoryB.valence > 0 ? "text-green-500" : "text-red-500"}>
                ({c.memoryB.valence > 0 ? "+" : ""}{c.memoryB.valence.toFixed(1)})
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Emergence link
  if (phase.emergence) {
    const e = phase.emergence;
    return (
      <div className="mt-2 space-y-1.5">
        <div className="rounded-[3px] px-2 py-1.5 text-[10px]" style={{ background: "var(--surface-dimmer)" }}>
          <div
            className="font-medium"
            style={{
              color: TYPE_COLORS[e.memory.type as keyof typeof TYPE_COLORS],
            }}
          >
            #{e.memory.id}: {e.memory.summary?.slice(0, 50)}
          </div>
          <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
            imp: {Math.round(e.memory.importance * 100)}% &middot;{" "}
            {e.potentialConnections} potential connections
          </div>
          {e.relatedConcepts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {e.relatedConcepts.slice(0, 4).map((c) => (
                <span
                  key={c}
                  className="rounded-[3px] px-1 py-0.5 text-[9px]"
                  style={{ background: "var(--surface-dim)", color: "var(--text-muted)" }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export function DreamCycleDisplay() {
  const { memories } = useMemory();
  const [phases, setPhases] = useState<DreamPhaseResult[]>([
    {
      name: "Consolidation",
      description: "Group related memories by shared tags",
      status: "idle",
    },
    {
      name: "Compaction",
      description: "Compress fading low-importance memories",
      status: "idle",
    },
    {
      name: "Reflection",
      description: "Review self-model against knowledge",
      status: "idle",
    },
    {
      name: "Contradiction Resolution",
      description: "Find and resolve conflicting memories",
      status: "idle",
    },
    {
      name: "Emergence",
      description: "Discover unexpected connections",
      status: "idle",
    },
  ]);
  const [running, setRunning] = useState(false);

  const runDream = async () => {
    if (running) return;
    setRunning(true);

    // Animate through phases
    for (let i = 0; i < 5; i++) {
      setPhases((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "running" as const } : p
        )
      );
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
    }

    // Run actual analysis
    const results = runFullDreamCycle(memories);
    setPhases(results);
    setRunning(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <Moon className="h-4 w-4" />
            Dream Cycle
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
            5-phase memory consolidation inspired by biological sleep
          </p>
        </div>
        <button
          onClick={runDream}
          disabled={running || memories.length === 0}
          className="rounded-[6px] px-4 py-2 text-xs font-medium transition active:scale-95 disabled:opacity-40 glass"
          style={{ color: "var(--text)" }}
        >
          {running ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Dreaming...
            </span>
          ) : (
            "Run Dream Cycle"
          )}
        </button>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-5">
        {phases.map((phase, i) => {
          const Icon = PHASE_ICONS[phase.status];
          return (
            <div
              key={phase.name}
              className="rounded-[6px] p-4 transition"
              style={{
                background: "var(--surface-dim)",
                border: "1px solid var(--border)",
                borderTopColor:
                  phase.status === "complete" ? PHASE_COLORS[i] : undefined,
                borderTopWidth: phase.status === "complete" ? 2 : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-3.5 w-3.5 ${
                    phase.status === "running"
                      ? "animate-spin text-blue-500"
                      : phase.status === "complete"
                        ? "text-green-500"
                        : ""
                  }`}
                  style={
                    phase.status === "idle" ? { color: "var(--text-faint)" } : undefined
                  }
                />
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                  {phase.name}
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {phase.description}
              </p>
              {phase.status === "complete" && (
                <PhaseDetails phase={phase} />
              )}
              {phase.status === "complete" &&
                !(
                  phase.clusters ||
                  phase.candidates !== undefined ||
                  phase.reflection ||
                  phase.contradictions !== undefined ||
                  phase.emergence
                ) &&
                phase.result && (
                  <p className="mt-2 rounded-[3px] p-2 text-[10px] leading-relaxed" style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}>
                    {phase.result}
                  </p>
                )}
              {phase.lastRun && (
                <p className="mt-1 text-[9px]" style={{ color: "var(--text-faint)" }}>
                  {new Date(phase.lastRun).toLocaleTimeString()}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
