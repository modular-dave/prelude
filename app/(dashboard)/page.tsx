"use client";

import { NeuralGraph } from "@/components/brain/neural-graph";
import { BrainScanline } from "@/components/brain/brain-scanline";
import { RetrievalFormula } from "@/components/brain/retrieval-formula";
import { HebbianPanel } from "@/components/brain/hebbian-panel";
import { MemoryNodeDetail } from "@/components/brain/memory-node-detail";
import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS, TYPE_LABELS, type MemoryType } from "@/lib/types";
import { useState, useCallback } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

export default function BrainPage() {
  const { memories } = useMemory();
  const [showPanels, setShowPanels] = useState(true);
  const [selectedMemoryId, setSelectedMemoryId] = useState<number | null>(null);

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
    <div className="relative h-full overflow-hidden">
      {/* Header overlay */}
      <div className="pointer-events-none absolute top-0 left-0 z-10 flex items-start gap-6 p-6">
        <BrainScanline size={120} />
        <div>
          <h1 className="text-xl font-semibold text-white">Neural Map</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {memories.length} memories &middot;{" "}
            {Object.keys(typeCounts).length} types active
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(TYPE_COLORS) as MemoryType[]).map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[type] }}
                />
                <span className="text-[10px] text-neutral-500">
                  {TYPE_LABELS[type]} ({typeCounts[type] || 0})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setShowPanels((v) => !v)}
        className={`pointer-events-auto absolute top-6 z-30 rounded-lg bg-neutral-800/80 p-2 text-neutral-400 transition hover:bg-neutral-700 hover:text-white ${showPanels ? "right-[412px]" : "right-6"}`}
        title={showPanels ? "Hide panels" : "Show scoring & Hebbian data"}
      >
        {showPanels ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* 3D Graph fills the page */}
      <div className="h-full">
        <NeuralGraph onNodeSelect={handleNodeSelect} />
      </div>

      {/* Side panels — absolute overlay */}
      {showPanels && (
        <div className="absolute top-0 right-0 z-20 h-full w-[400px] overflow-y-auto border-l border-neutral-800 bg-neutral-950/95 p-4 space-y-4 backdrop-blur-sm">
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
