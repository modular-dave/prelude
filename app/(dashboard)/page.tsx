"use client";

import { NeuralGraph } from "@/components/brain/neural-graph";
import { BrainScanline } from "@/components/brain/brain-scanline";
import { RetrievalFormula } from "@/components/brain/retrieval-formula";
import { HebbianPanel } from "@/components/brain/hebbian-panel";
import { MemoryNodeDetail } from "@/components/brain/memory-node-detail";
import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS, TYPE_LABELS, type MemoryType, type ViewMode } from "@/lib/types";
import { useState, useCallback } from "react";
import { ChevronRight, ChevronLeft, GitBranch, Zap } from "lucide-react";

export default function BrainPage() {
  const { memories } = useMemory();
  const [showPanels, setShowPanels] = useState(true);
  const [selectedMemoryId, setSelectedMemoryId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hebbian");

  const selectedMemory = selectedMemoryId
    ? memories.find((m) => m.id === selectedMemoryId) ?? null
    : null;

  const handleNodeSelect = useCallback((memoryId: number) => {
    setSelectedMemoryId((prev) => (prev === memoryId ? null : memoryId));
    setShowPanels(true);
  }, []);

  const typeCounts = memories.reduce(
    (acc, m) => {
      acc[m.memory_type] = (acc[m.memory_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="relative h-full overflow-hidden bg-[#04040a]">
      {/* Header overlay */}
      <div className="pointer-events-none absolute top-0 left-0 z-10 flex items-start gap-5 p-5">
        <BrainScanline size={100} />
        <div className="animate-fade-slide-up">
          <h1 className="text-lg font-semibold tracking-wide text-white/90">
            Neural Map
          </h1>
          <p className="mt-0.5 text-[11px] tracking-wider text-indigo-400/40">
            {memories.length} nodes &middot;{" "}
            {Object.keys(typeCounts).length} types &middot; live
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(Object.keys(TYPE_COLORS) as MemoryType[]).map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: TYPE_COLORS[type],
                    boxShadow: `0 0 6px ${TYPE_COLORS[type]}50`,
                  }}
                />
                <span className="text-[9px] font-medium uppercase tracking-widest text-neutral-500">
                  {TYPE_LABELS[type]}
                  <span className="ml-1 text-neutral-600">
                    {typeCounts[type] || 0}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* View mode toggle — appears when a node is selected */}
      {selectedMemoryId && (
        <div className="pointer-events-auto absolute top-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-0.5 glass animate-fade-slide-up"
          style={{ border: "1px solid rgba(99, 102, 241, 0.12)" }}>
          <button
            onClick={() => setViewMode("hebbian")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200 ${
              viewMode === "hebbian"
                ? "text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            style={viewMode === "hebbian" ? {
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(99, 102, 241, 0.2))",
              boxShadow: "0 0 12px rgba(139, 92, 246, 0.15)",
            } : {}}
          >
            <GitBranch className="h-3 w-3" />
            HEBBIAN
          </button>
          <button
            onClick={() => setViewMode("retrieved")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200 ${
              viewMode === "retrieved"
                ? "text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            style={viewMode === "retrieved" ? {
              background: "linear-gradient(135deg, rgba(96, 165, 250, 0.3), rgba(59, 130, 246, 0.2))",
              boxShadow: "0 0 12px rgba(96, 165, 250, 0.15)",
            } : {}}
          >
            <Zap className="h-3 w-3" />
            RETRIEVAL
          </button>
        </div>
      )}

      {/* Panel toggle */}
      <button
        onClick={() => setShowPanels((v) => !v)}
        className={`pointer-events-auto absolute top-5 z-30 flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 glass hover:border-indigo-500/20 ${showPanels ? "right-[392px]" : "right-5"}`}
        title={showPanels ? "Hide panels" : "Show panels"}
      >
        {showPanels ? (
          <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5 text-neutral-400" />
        )}
      </button>

      {/* 3D Graph */}
      <div className="h-full">
        <NeuralGraph
          onNodeSelect={handleNodeSelect}
          selectedNodeId={selectedMemoryId}
          viewMode={viewMode}
        />
      </div>

      {/* Side panel */}
      {showPanels && (
        <div className="absolute top-0 right-0 z-20 h-full w-[380px] overflow-y-auto p-4 space-y-4 animate-slide-in-right glass-panel"
          style={{ borderLeft: "1px solid rgba(99, 102, 241, 0.06)" }}>
          {selectedMemory ? (
            <MemoryNodeDetail
              memory={selectedMemory}
              onClose={() => setSelectedMemoryId(null)}
            />
          ) : (
            <>
              <RetrievalFormula />
              <HebbianPanel />
            </>
          )}
        </div>
      )}
    </div>
  );
}
