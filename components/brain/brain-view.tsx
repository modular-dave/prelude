"use client";

import { useState, useCallback, useRef } from "react";
import { NeuralGraph } from "@/components/brain/neural-graph";
import { RetrievalFormula } from "@/components/brain/retrieval-formula";
import { HebbianPanel } from "@/components/brain/hebbian-panel";
import { MemoryNodeDetail } from "@/components/brain/memory-node-detail";
import { StatsGrid } from "@/components/stats/stats-grid";
import { TypeDistribution } from "@/components/stats/type-distribution";
import { TagCloud } from "@/components/stats/tag-cloud";
import { IntrospectionPanel } from "@/components/brain/introspection-panel";
import { MemoryTypeCards } from "@/components/memory/memory-type-cards";
import { MemoryTimeline } from "@/components/memory/memory-timeline";
import { useMemory } from "@/lib/memory-context";
import { useContainerSize } from "@/hooks/use-container-size";
import { TYPE_COLORS, TYPE_LABELS, type MemoryType, type ViewMode } from "@/lib/types";
import { GitBranch, Zap, BarChart3, Database } from "lucide-react";

type BrainPanel = "stats" | "memory" | null;

export function BrainView() {
  const { memories } = useMemory();
  const [selectedMemoryId, setSelectedMemoryId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hebbian");
  const [brainPanel, setBrainPanel] = useState<BrainPanel>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphSize = useContainerSize(graphContainerRef);

  const selectedMemory = selectedMemoryId
    ? memories.find((m) => m.id === selectedMemoryId) ?? null
    : null;

  const handleNodeSelect = useCallback((memoryId: number) => {
    setSelectedMemoryId((prev) => (prev === memoryId ? null : memoryId));
  }, []);

  const typeCounts = memories.reduce(
    (acc, m) => {
      acc[m.memory_type] = (acc[m.memory_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="relative flex h-full flex-col lg:flex-row overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* HUD top-left */}
      <div className="pointer-events-none absolute top-14 left-0 z-10 p-4">
        <div className="glass rounded-[8px] p-4 pointer-events-auto" style={{ maxWidth: 260 }}>
          <h1 className="heading">Neural Map</h1>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
            {memories.length} nodes &middot; {Object.keys(typeCounts).length} types
          </p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            {(Object.keys(TYPE_COLORS) as MemoryType[]).map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <div
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[type] }}
                />
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                  {TYPE_LABELS[type]}
                  <span className="ml-1" style={{ color: "var(--text-faint)" }}>
                    {typeCounts[type] || 0}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top-right toggle: Stats/Memory when no selection, Hebbian/Retrieval when selected */}
      <div className="pointer-events-auto absolute top-14 right-4 z-30 flex items-center gap-0.5 rounded-[8px] p-0.5 glass animate-fade-slide-up">
        {selectedMemoryId ? (
          <>
            <button
              onClick={() => setViewMode("hebbian")}
              className="flex items-center gap-1 rounded-[6px] px-3 py-1.5 text-[10px] font-medium transition-all duration-200"
              style={{
                color: viewMode === "hebbian" ? "var(--accent)" : "var(--text-faint)",
                background: viewMode === "hebbian" ? "rgba(34, 68, 255, 0.08)" : "transparent",
              }}
            >
              <GitBranch className="h-3 w-3" />
              Hebbian
            </button>
            <button
              onClick={() => setViewMode("retrieved")}
              className="flex items-center gap-1 rounded-[6px] px-3 py-1.5 text-[10px] font-medium transition-all duration-200"
              style={{
                color: viewMode === "retrieved" ? "var(--accent)" : "var(--text-faint)",
                background: viewMode === "retrieved" ? "rgba(34, 68, 255, 0.08)" : "transparent",
              }}
            >
              <Zap className="h-3 w-3" />
              Retrieval
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setBrainPanel((v) => v === "stats" ? null : "stats")}
              className="flex items-center gap-1 rounded-[6px] px-3 py-1.5 text-[10px] font-medium transition-all duration-200"
              style={{
                color: brainPanel === "stats" ? "var(--accent)" : "var(--text-faint)",
                background: brainPanel === "stats" ? "rgba(34, 68, 255, 0.08)" : "transparent",
              }}
            >
              <BarChart3 className="h-3 w-3" />
              Stats
            </button>
            <button
              onClick={() => setBrainPanel((v) => v === "memory" ? null : "memory")}
              className="flex items-center gap-1 rounded-[6px] px-3 py-1.5 text-[10px] font-medium transition-all duration-200"
              style={{
                color: brainPanel === "memory" ? "var(--accent)" : "var(--text-faint)",
                background: brainPanel === "memory" ? "rgba(34, 68, 255, 0.08)" : "transparent",
              }}
            >
              <Database className="h-3 w-3" />
              Memory
            </button>
          </>
        )}
      </div>

      {/* Graph area */}
      <div
        ref={graphContainerRef}
        className="flex-1 min-h-0 min-w-0 transition-all duration-300"
      >
        {graphSize.width > 0 && graphSize.height > 0 && (
          <NeuralGraph
            onNodeSelect={handleNodeSelect}
            selectedNodeId={selectedMemoryId}
            viewMode={viewMode}
            width={graphSize.width}
            height={graphSize.height}
          />
        )}
      </div>

      {/* Detail panel */}
      {selectedMemory && (
        <div className="h-[55vh] lg:h-full lg:w-[360px] shrink-0 overflow-y-auto p-4 space-y-4 animate-fade-slide-up glass-panel transition-all duration-300">
          <div className="flex justify-center lg:hidden">
            <div className="h-1 w-10 rounded-full" style={{ background: "var(--border)" }} />
          </div>
          <MemoryNodeDetail
            memory={selectedMemory}
            onClose={() => setSelectedMemoryId(null)}
            onNavigate={setSelectedMemoryId}
          />
        </div>
      )}

      {/* Side panel: Stats or Memory Bank */}
      {!selectedMemory && brainPanel && (
        <div className="h-[55vh] lg:h-full lg:w-[360px] shrink-0 overflow-y-auto p-4 space-y-4 glass-panel transition-all duration-300 animate-fade-slide-up">
          <div className="flex justify-center lg:hidden">
            <div className="h-1 w-10 rounded-full" style={{ background: "var(--border)" }} />
          </div>
          {brainPanel === "stats" ? (
            <>
              <StatsGrid />
              <div>
                <h4 className="label mb-2">Type Distribution</h4>
                <TypeDistribution />
              </div>
              <div>
                <h4 className="label mb-2">Tag Cloud</h4>
                <TagCloud />
              </div>
              <IntrospectionPanel />
            </>
          ) : (
            <>
              <MemoryTypeCards />
              <div>
                <h4 className="label mb-2">Timeline</h4>
                <MemoryTimeline />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
