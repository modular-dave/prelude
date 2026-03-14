"use client";

import { useMemory } from "@/lib/memory-context";
import { GitBranch, TrendingUp, Repeat } from "lucide-react";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/types";

export function HebbianPanel() {
  const { memories, graphData } = useMemory();

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

  // Link stats from graph
  const linkCount = graphData.links.length;
  const strongLinks = graphData.links.filter((l) => l.value >= 3);
  const avgLinkStrength =
    linkCount > 0
      ? graphData.links.reduce((s, l) => s + l.value, 0) / linkCount
      : 0;

  // Most connected nodes
  const connectionCounts: Record<number, number> = {};
  for (const link of graphData.links) {
    const src = typeof link.source === "object" ? (link.source as any).id : link.source;
    const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
    connectionCounts[src] = (connectionCounts[src] || 0) + 1;
    connectionCounts[tgt] = (connectionCounts[tgt] || 0) + 1;
  }
  const topConnected = Object.entries(connectionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, count]) => ({
      memory: memories.find((m) => m.id === Number(id)),
      connections: count,
    }))
    .filter((x) => x.memory);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-purple-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
          Hebbian Reinforcement
        </h3>
      </div>

      {/* Reinforcement rules */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-neutral-800/50 p-3 text-center">
          <p className="font-mono text-sm font-bold text-amber-400">+0.01</p>
          <p className="mt-1 text-[10px] text-neutral-500">
            importance per recall
          </p>
        </div>
        <div className="rounded-lg bg-neutral-800/50 p-3 text-center">
          <p className="font-mono text-sm font-bold text-purple-400">+0.05</p>
          <p className="mt-1 text-[10px] text-neutral-500">
            link strength on co-retrieval
          </p>
        </div>
        <div className="rounded-lg bg-neutral-800/50 p-3 text-center">
          <p className="font-mono text-sm font-bold text-cyan-400">&ge;0.6</p>
          <p className="mt-1 text-[10px] text-neutral-500">
            vector sim auto-link
          </p>
        </div>
      </div>

      {/* Live network stats */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-600">
          Association Graph
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-black/30 p-2 text-center">
            <p className="text-lg font-bold text-white">{linkCount}</p>
            <p className="text-[9px] text-neutral-500">links</p>
          </div>
          <div className="rounded-lg bg-black/30 p-2 text-center">
            <p className="text-lg font-bold text-white">{strongLinks.length}</p>
            <p className="text-[9px] text-neutral-500">strong (&ge;3)</p>
          </div>
          <div className="rounded-lg bg-black/30 p-2 text-center">
            <p className="text-lg font-bold text-white">
              {avgLinkStrength.toFixed(1)}
            </p>
            <p className="text-[9px] text-neutral-500">avg strength</p>
          </div>
        </div>
      </div>

      {/* Access patterns */}
      <div className="mt-4">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-neutral-600">
          <Repeat className="h-3 w-3" /> Recall Activity
        </p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-2xl font-bold text-white">{totalAccesses}</span>
          <span className="text-[11px] text-neutral-500">
            total recalls &middot; {avgAccess.toFixed(1)} avg/memory
          </span>
        </div>
      </div>

      {/* Top reinforced memories */}
      {memoriesWithGrowth.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-neutral-600">
            <TrendingUp className="h-3 w-3" /> Most Reinforced
          </p>
          <div className="mt-2 space-y-1.5">
            {memoriesWithGrowth.slice(0, 4).map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-md bg-neutral-800/40 px-2.5 py-1.5"
              >
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[m.memory_type] }}
                />
                <span className="flex-1 truncate text-[11px] text-neutral-300">
                  {m.summary?.slice(0, 50)}
                </span>
                <span className="font-mono text-[10px] text-amber-400">
                  {m.access_count}x
                </span>
                <span className="font-mono text-[10px] text-green-400">
                  +{(m.estimatedGrowth * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top connected (hub) nodes */}
      {topConnected.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600">
            Hub Nodes
          </p>
          <div className="mt-2 space-y-1.5">
            {topConnected.map(({ memory: m, connections }) => (
              <div
                key={m!.id}
                className="flex items-center gap-2 rounded-md bg-neutral-800/40 px-2.5 py-1.5"
              >
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[m!.memory_type] }}
                />
                <span className="flex-1 truncate text-[11px] text-neutral-300">
                  {m!.summary?.slice(0, 50)}
                </span>
                <span className="font-mono text-[10px] text-purple-400">
                  {connections} links
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
