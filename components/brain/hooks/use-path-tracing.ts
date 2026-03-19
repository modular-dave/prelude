"use client";

import { useMemo } from "react";
import type { SelectedEdgeInfo } from "@/components/brain/neural-graph";

// ── Types ──────────────────────────────────────────────────────────

export interface TraceLink {
  source_id: number;
  target_id: number;
  strength: number;
  link_type: string;
}

export interface TraceNode {
  id: number;
  depth: number;
}

export interface TraceData {
  root: TraceNode;
  ancestors: TraceNode[];
  descendants: TraceNode[];
  related: TraceNode[];
  links: TraceLink[];
}

export interface PathTracingResult {
  traceMemoryId: number | null;
  traceData: TraceData | null;
  traceMaxDepth: number;
  allTraceNodes: Map<number, TraceNode>;
  traceNodeDepths: Map<string, number>;
  reachableNodes: number[];
  reachableCount: number;
  visibleMemoryIds: Set<number> | null;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

// ── Hook ───────────────────────────────────────────────────────────

/**
 * Pure computation chain: builds adjacency from graph edges, runs BFS
 * from the selected node/edge, then filters by direction/depth/strength.
 * Returns all derived trace values needed by the 3D graph and UI.
 */
export function usePathTracing(
  selectedMemoryId: number | null,
  selectedEdge: SelectedEdgeInfo | null,
  graphEdges: GraphEdge[],
  globalVisibleIds: Set<number> | null,
  pathDepth: number,
  pathDirection: "both" | "upstream" | "downstream",
  pathMinStrength: number,
): PathTracingResult {
  // The memory ID to trace from — edge source or selected node
  const traceMemoryId = selectedEdge
    ? selectedEdge.sourceNumericId
    : selectedMemoryId;

  // Build adjacency list from loaded graph edges (instant, no API call)
  const adjacency = useMemo(() => {
    const adj = new Map<string, Array<{ target: string; type: string; strength: number }>>();
    for (const e of graphEdges) {
      const src = e.source;
      const tgt = e.target;
      if (!adj.has(src)) adj.set(src, []);
      if (!adj.has(tgt)) adj.set(tgt, []);
      adj.get(src)!.push({ target: tgt, type: e.type, strength: e.weight });
      adj.get(tgt)!.push({ target: src, type: e.type, strength: e.weight });
    }
    return adj;
  }, [graphEdges]);

  // Client-side BFS trace (synchronous, instant — derived value, no state)
  const traceData = useMemo((): TraceData | null => {
    if (!traceMemoryId) return null;
    const rootId = `m_${traceMemoryId}`;
    const visited = new Map<string, number>();
    visited.set(rootId, 0);
    const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
    const links: TraceLink[] = [];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= 10) continue;
      for (const edge of (adjacency.get(id) || [])) {
        if (!visited.has(edge.target)) {
          visited.set(edge.target, depth + 1);
          queue.push({ id: edge.target, depth: depth + 1 });
        }
        if (id.startsWith("m_") && edge.target.startsWith("m_")) {
          const key = id < edge.target ? `${id}|${edge.target}` : `${edge.target}|${id}`;
          if (!seen.has(key)) {
            seen.add(key);
            const srcNum = parseInt(id.slice(2));
            const tgtNum = parseInt(edge.target.slice(2));
            if (!isNaN(srcNum) && !isNaN(tgtNum)) {
              links.push({ source_id: srcNum, target_id: tgtNum, strength: edge.strength, link_type: edge.type });
            }
          }
        }
      }
    }

    const nodes: TraceNode[] = Array.from(visited.entries())
      .filter(([id]) => id.startsWith("m_"))
      .map(([id, depth]) => ({ id: parseInt(id.slice(2)), depth }));

    return {
      root: { id: traceMemoryId, depth: 0 },
      ancestors: nodes.filter(n => n.depth > 0),
      descendants: [],
      related: [],
      links,
    };
  }, [traceMemoryId, adjacency]);

  // Compute actual max depth from trace nodes
  const traceMaxDepth = useMemo(() => {
    if (!traceData) return 0;
    let max = 0;
    for (const n of traceData.ancestors) if (n.depth > max) max = n.depth;
    for (const n of traceData.descendants) if (n.depth > max) max = n.depth;
    for (const n of traceData.related) if ((n.depth ?? 1) > max) max = n.depth ?? 1;
    return max;
  }, [traceData]);

  // Build filtered trace nodes (respects direction + depth)
  const allTraceNodes = useMemo(() => {
    if (!traceData) return new Map<number, TraceNode>();
    const map = new Map<number, TraceNode>();
    if (traceData.root) map.set(traceData.root.id, { ...traceData.root, depth: 0 });
    if (pathDirection !== "downstream") {
      for (const n of traceData.ancestors) {
        if (n.depth <= pathDepth) map.set(n.id, n);
      }
    }
    if (pathDirection !== "upstream") {
      for (const n of traceData.descendants) {
        if (n.depth <= pathDepth) map.set(n.id, n);
      }
    }
    for (const n of traceData.related) {
      if ((n.depth ?? 1) <= pathDepth) map.set(n.id, n);
    }
    return map;
  }, [traceData, pathDirection, pathDepth]);

  // Depth map for NeuralGraph — maps graph node IDs to BFS hop depth
  const traceNodeDepths = useMemo(() => {
    const map = new Map<string, number>();
    for (const [numId, node] of allTraceNodes) {
      map.set(`m_${numId}`, node.depth ?? 1);
    }
    return map;
  }, [allTraceNodes]);

  // All trace nodes within depth + strength filter
  const reachableNodes = useMemo(() => {
    if (!traceData || !traceMemoryId) return [];
    const nodes = new Set<number>(allTraceNodes.keys());
    nodes.add(traceMemoryId);
    if (pathMinStrength > 0 && traceData.links) {
      const connected = new Set<number>();
      connected.add(traceMemoryId);
      for (const l of traceData.links) {
        if (l.strength >= pathMinStrength && nodes.has(l.source_id) && nodes.has(l.target_id)) {
          connected.add(l.source_id);
          connected.add(l.target_id);
        }
      }
      return Array.from(connected);
    }
    return Array.from(nodes);
  }, [traceData, traceMemoryId, allTraceNodes, pathMinStrength]);

  const reachableCount = reachableNodes.length;

  // Combined visibility: global filters ∩ trace path filter
  const visibleMemoryIds = useMemo(() => {
    if (!traceData || !traceMemoryId) return globalVisibleIds;
    const reachableSet = new Set(reachableNodes);
    if (globalVisibleIds !== null) {
      return new Set([...reachableSet].filter(id => globalVisibleIds.has(id)));
    }
    return reachableSet;
  }, [traceData, traceMemoryId, reachableNodes, globalVisibleIds]);

  return {
    traceMemoryId,
    traceData,
    traceMaxDepth,
    allTraceNodes,
    traceNodeDepths,
    reachableNodes,
    reachableCount,
    visibleMemoryIds,
  };
}
