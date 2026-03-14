"use client";

import { useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS } from "@/lib/types";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
});

export function NeuralGraph({ onNodeSelect }: { onNodeSelect?: (memoryId: number) => void } = {}) {
  const { graphData, memories } = useMemory();
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Ensure graphData has nodes before rendering
  const data = useMemo(() => {
    if (graphData.nodes.length === 0 && memories.length > 0) {
      // Fallback: create nodes from memories even without links
      return {
        nodes: memories.map((m) => ({
          id: m.id,
          name: m.summary?.slice(0, 40) || "memory",
          val: Math.max(2, (m.importance || 0.5) * 12),
          color: TYPE_COLORS[m.memory_type] || "#666",
          type: m.memory_type,
          importance: m.importance,
        })),
        links: [],
      };
    }
    return graphData;
  }, [graphData, memories]);

  const handleNodeClick = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (graphRef.current) {
        const distance = 80;
        const distRatio =
          1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);
        graphRef.current.cameraPosition(
          {
            x: (node.x || 0) * distRatio,
            y: (node.y || 0) * distRatio,
            z: (node.z || 0) * distRatio,
          },
          node,
          1000
        );
      }
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-600">
        <div className="text-center">
          <p className="text-lg">No memories yet</p>
          <p className="mt-1 text-sm">Chat to create your first memories</p>
        </div>
      </div>
    );
  }

  return (
    <ForceGraph3D
      ref={graphRef}
      graphData={data}
      nodeLabel={(node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const mem = memories.find((m) => m.id === node.id);
        return mem
          ? `<div style="background:#1a1a1a;padding:8px 12px;border-radius:8px;border:1px solid #333;max-width:250px">
              <div style="color:${node.color};font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${mem.memory_type}</div>
              <div style="color:#eee;font-size:12px">${mem.summary}</div>
              <div style="color:#888;font-size:10px;margin-top:4px">importance: ${Math.round(mem.importance * 100)}%</div>
            </div>`
          : node.name;
      }}
      nodeColor={(node: any) => node.color} // eslint-disable-line @typescript-eslint/no-explicit-any
      nodeVal={(node: any) => node.val} // eslint-disable-line @typescript-eslint/no-explicit-any
      nodeOpacity={0.9}
      linkColor={() => "rgba(255,255,255,0.08)"}
      linkWidth={0.5}
      linkOpacity={0.3}
      backgroundColor="#0a0a0a"
      onNodeClick={handleNodeClick}
      enableNodeDrag={true}
      warmupTicks={50}
      cooldownTicks={100}
    />
  );
}
