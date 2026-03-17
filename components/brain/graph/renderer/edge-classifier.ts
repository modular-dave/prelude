// ── Edge Classifier ─────────────────────────────────────────────────
// Classifies edges into 4 rendering categories based on ViewState.
// Never renders all raw edges globally.

import type { ViewState, EdgeClass, ResidentTile, ResidentTopologyChunk } from "@/lib/3d-graph/runtime/types";
import type { RawEdge, AggregateEdge } from "@/lib/3d-graph/compiler/types";

export interface ClassifiedEdge {
  source: string;
  target: string;
  weight: number;
  linkType: string;
  edgeClass: EdgeClass;
}

export class EdgeClassifier {
  private classified: ClassifiedEdge[] = [];

  /** Reclassify edges based on current view state and loaded tiles/chunks. */
  classify(
    viewState: ViewState,
    hotTiles: ResidentTile[],
    topologyChunks: ResidentTopologyChunk[],
    highlightedPath?: Set<string> | null,
    linkTypeFilter?: string[],
    visibleEntityIds?: Set<string>,
  ): void {
    this.classified.length = 0;
    const seen = new Set<string>();

    // Edges from topology chunks (neighborhood + cluster-adjacency)
    for (const chunk of topologyChunks) {
      if (!chunk.data) continue;
      for (const edge of chunk.data.edges) {
        // Filter by link type
        if (linkTypeFilter && !linkTypeFilter.includes(edge.linkType)) continue;

        // Filter by node visibility
        if (visibleEntityIds && (!visibleEntityIds.has(edge.source) || !visibleEntityIds.has(edge.target))) continue;

        // Deduplicate (same edge can appear in multiple neighborhood chunks)
        const edgeKey = edge.source < edge.target
          ? `${edge.source}|${edge.target}`
          : `${edge.target}|${edge.source}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);

        // Check if this is a path highlight edge
        if (highlightedPath?.has(edgeKey)) {
          this.classified.push({
            ...edge,
            edgeClass: "path-highlight",
          });
        } else if (chunk.data.type === "cluster-adjacency") {
          this.classified.push({
            ...edge,
            edgeClass: "frontier",
          });
        } else {
          this.classified.push({
            ...edge,
            edgeClass: "neighborhood",
          });
        }
      }
    }
  }

  /** Get classified edges, optionally filtered by class. */
  getEdges(filter?: EdgeClass): ClassifiedEdge[] {
    if (!filter) return this.classified;
    return this.classified.filter(e => e.edgeClass === filter);
  }

  /** Get edges grouped by class for rendering. */
  getGrouped(): Record<EdgeClass, ClassifiedEdge[]> {
    const result: Record<EdgeClass, ClassifiedEdge[]> = {
      aggregate: [],
      frontier: [],
      neighborhood: [],
      "path-highlight": [],
    };
    for (const edge of this.classified) {
      result[edge.edgeClass].push(edge);
    }
    return result;
  }

  get totalEdges(): number {
    return this.classified.length;
  }
}
