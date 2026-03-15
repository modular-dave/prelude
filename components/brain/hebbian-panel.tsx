"use client";

import { useMemory } from "@/lib/memory-context";
import { GitBranch, TrendingUp, Repeat } from "lucide-react";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/types";

export function HebbianPanel() {
  const { memories, knowledgeGraph, graphStats } = useMemory();

  // Compute Hebbian stats
  const totalAccesses = memories.reduce(
    (s, m) => s + (m.access_count || 0),
    0
  );
  const avgAccess =
    memories.length > 0 ? totalAccesses / memories.length : 0;

  // Importance growth: estimate based on access_count * 0.01 (capped at 1.0)
  const memoriesWithGrowth = memories
    .filter((m) => (m.access_count || 0) > 0)
    .map((m) => ({
      ...m,
      estimatedGrowth: Math.min((m.access_count || 0) * 0.01, 1 - m.importance),
    }))
    .sort((a, b) => b.estimatedGrowth - a.estimatedGrowth);

  // Link stats from knowledge graph
  const linkCount = graphStats?.relationCount ?? 0;
  const strongLinkCount = knowledgeGraph.edges.filter((e) => e.weight >= 0.5).length;
  const avgLinkStrength =
    knowledgeGraph.edges.length > 0
      ? knowledgeGraph.edges.reduce((s, e) => s + e.weight, 0) / knowledgeGraph.edges.length
      : 0;

  // Top entities from graph stats
  const topEntities = graphStats?.topEntities ?? [];

  return (
    <div className="rounded-[6px] p-5" style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-purple-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
          Hebbian Reinforcement
        </h3>
      </div>

      {/* Reinforcement rules */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-[4px] p-3 text-center" style={{ background: "var(--surface-dimmer)" }}>
          <p className="font-mono text-sm font-bold text-amber-500">+0.01</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            importance per recall
          </p>
        </div>
        <div className="rounded-[4px] p-3 text-center" style={{ background: "var(--surface-dimmer)" }}>
          <p className="font-mono text-sm font-bold text-purple-500">+0.05</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            link strength on co-retrieval
          </p>
        </div>
        <div className="rounded-[4px] p-3 text-center" style={{ background: "var(--surface-dimmer)" }}>
          <p className="font-mono text-sm font-bold text-cyan-500">&ge;0.6</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            vector sim auto-link
          </p>
        </div>
      </div>

      {/* Live network stats */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Association Graph
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
            <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{linkCount}</p>
            <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>links</p>
          </div>
          <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
            <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{strongLinkCount}</p>
            <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>strong (&ge;0.5)</p>
          </div>
          <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
            <p className="text-lg font-bold" style={{ color: "var(--text)" }}>
              {avgLinkStrength.toFixed(2)}
            </p>
            <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>avg strength</p>
          </div>
        </div>
      </div>

      {/* Access patterns */}
      <div className="mt-4">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          <Repeat className="h-3 w-3" /> Recall Activity
        </p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-2xl font-bold" style={{ color: "var(--text)" }}>{totalAccesses}</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            total recalls &middot; {avgAccess.toFixed(1)} avg/memory
          </span>
        </div>
      </div>

      {/* Top reinforced memories */}
      {memoriesWithGrowth.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            <TrendingUp className="h-3 w-3" /> Most Reinforced
          </p>
          <div className="mt-2 space-y-1.5">
            {memoriesWithGrowth.slice(0, 4).map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-[4px] px-2.5 py-1.5"
                style={{ background: "var(--surface-dimmer)" }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[m.memory_type] }}
                />
                <span className="flex-1 truncate text-[11px]" style={{ color: "var(--text)" }}>
                  {m.summary?.slice(0, 50)}
                </span>
                <span className="font-mono text-[10px] text-amber-500">
                  {m.access_count}x
                </span>
                <span className="font-mono text-[10px] text-green-500">
                  +{(m.estimatedGrowth * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top entities (hub nodes) */}
      {topEntities.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Hub Nodes
          </p>
          <div className="mt-2 space-y-1.5">
            {topEntities.slice(0, 5).map((entity) => (
              <div
                key={entity.name}
                className="flex items-center gap-2 rounded-[4px] px-2.5 py-1.5"
                style={{ background: "var(--surface-dimmer)" }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                />
                <span className="flex-1 truncate text-[11px]" style={{ color: "var(--text)" }}>
                  {entity.name}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {entity.type}
                </span>
                <span className="font-mono text-[10px] text-purple-500">
                  {entity.mentions} mentions
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
