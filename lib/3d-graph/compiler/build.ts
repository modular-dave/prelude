// ── Graph Compiler Orchestrator ──────────────────────────────────────
// Transforms raw graph data into a tiled world model.
// Can be invoked as a script (`npx tsx lib/3d-graph/compiler/build.ts`)
// or programmatically from an API route.

import type {
  RawGraphData, RawGraphNode, RawEdge, CompilerConfig,
  WorldManifest, SpatialTile, TopologyChunk, CanonicalEntity,
} from "./types";
import { DEFAULT_COMPILER_CONFIG } from "./types";
import { computeHierarchy } from "./cluster";
import { computeLayout } from "./layout";
import type { LayoutResult } from "./layout";
import { buildSpatialTiles, buildTopologyChunks, buildManifest } from "./tiler";

// ── Compiler Output ─────────────────────────────────────────────────

export interface CompilerOutput {
  manifest: WorldManifest;
  tiles: Map<string, SpatialTile>;
  topologyChunks: Map<string, TopologyChunk>;
  entities: Map<string, CanonicalEntity>;
}

// ── Main compiler function ──────────────────────────────────────────

export function compileGraph(
  data: RawGraphData,
  config: CompilerConfig = DEFAULT_COMPILER_CONFIG,
): CompilerOutput {
  if (data.nodes.length === 0) {
    return {
      manifest: {
        version: 1,
        timestamp: new Date().toISOString(),
        totalNodes: 0,
        totalEdges: 0,
        totalClusters: 0,
        hierarchyLevels: 0,
        bubbleRadius: config.bubbleRadius,
        shells: [],
        tileIndex: {},
        topologyIndex: {},
        rootTileIds: [],
        entityIndex: {},
      },
      tiles: new Map(),
      topologyChunks: new Map(),
      entities: new Map(),
    };
  }

  // Calibrate bubble radius from node count
  const N = data.nodes.length;
  const calibratedConfig = {
    ...config,
    bubbleRadius: Math.max(200, 200 + 200 * Math.log2(Math.max(1, N))),
  };

  // Step 1: Compute hierarchy
  const { assignments, clusters } = computeHierarchy(data, calibratedConfig);

  // Step 2: Compute canonical layout
  const layoutResult: LayoutResult = computeLayout(data, assignments, clusters, calibratedConfig);

  // Step 3: Build spatial tiles
  const spatialTiles = buildSpatialTiles(layoutResult.entities, data.edges, calibratedConfig);

  // Step 4: Build topology chunks
  const topologyChunks = buildTopologyChunks(layoutResult.entities, data.edges, calibratedConfig);

  // Step 5: Build manifest
  const manifest = buildManifest(
    spatialTiles, topologyChunks, layoutResult.entities, data.edges, calibratedConfig,
  );

  // Index tiles and chunks by id
  const tilesMap = new Map<string, SpatialTile>();
  for (const tile of spatialTiles) tilesMap.set(tile.id, tile);

  const chunksMap = new Map<string, TopologyChunk>();
  for (const chunk of topologyChunks) chunksMap.set(chunk.id, chunk);

  return {
    manifest,
    tiles: tilesMap,
    topologyChunks: chunksMap,
    entities: layoutResult.entities,
  };
}

// ── Helpers for converting MemoryContext data to RawGraphData ────────

export function memoryContextToRawGraph(
  memories: any[],
  knowledgeGraph: { nodes: any[]; edges: any[] },
  typeColors: Record<string, string>,
  entityColors: Record<string, string>,
  defaultEntityColor: string,
): RawGraphData {
  const memoryNodes: RawGraphNode[] = memories.map((m) => ({
    id: `m_${m.id}`,
    label: m.summary?.slice(0, 60) || "memory",
    val: Math.max(4, (m.importance || 0.5) * 20),
    color: typeColors[m.memory_type] || "#666",
    type: m.memory_type,
    importance: m.importance || 0.5,
    isEntity: false,
    numericId: m.id,
    accessCount: m.access_count ?? 0,
  }));

  const entityNodes: RawGraphNode[] = knowledgeGraph.nodes.map((e) => ({
    id: e.id,
    label: e.label?.slice(0, 60) || "entity",
    val: Math.max(3, (e.size || 1) * 8),
    color: entityColors[e.type] || defaultEntityColor,
    type: e.type,
    importance: (e.size || 1) / 10,
    isEntity: true,
    numericId: null,
    accessCount: 0,
  }));

  const nodes = [...memoryNodes, ...entityNodes];
  const nodeIdSet = new Set(nodes.map(n => n.id));

  // Deduplicate edges (keep highest weight)
  const linkMap = new Map<string, RawEdge>();
  for (const e of knowledgeGraph.edges) {
    if (!nodeIdSet.has(e.source) || !nodeIdSet.has(e.target)) continue;
    const canon = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
    const existing = linkMap.get(canon);
    const weight = e.weight || 1;
    if (!existing || weight > existing.weight) {
      linkMap.set(canon, { source: e.source, target: e.target, weight, linkType: e.type || "relates" });
    }
  }

  // Conversation edges
  const convGroups = new Map<string, string[]>();
  for (const m of memories) {
    for (const tag of m.tags || []) {
      if (tag.startsWith("conv:")) {
        let group = convGroups.get(tag);
        if (!group) { group = []; convGroups.set(tag, group); }
        group.push(`m_${m.id}`);
      }
    }
  }
  for (const members of convGroups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const canon = members[i] < members[j]
          ? `${members[i]}|${members[j]}`
          : `${members[j]}|${members[i]}`;
        if (!linkMap.has(canon)) {
          linkMap.set(canon, { source: members[i], target: members[j], weight: 0.5, linkType: "conversation" });
        }
      }
    }
  }

  return { nodes, edges: [...linkMap.values()] };
}

// ── Serialization helpers ───────────────────────────────────────────

export function serializeCompilerOutput(output: CompilerOutput): {
  manifest: string;
  tiles: Record<string, string>;
  topologyChunks: Record<string, string>;
} {
  const tiles: Record<string, string> = {};
  for (const [id, tile] of output.tiles) {
    tiles[id] = JSON.stringify(tile);
  }

  const topologyChunks: Record<string, string> = {};
  for (const [id, chunk] of output.topologyChunks) {
    topologyChunks[id] = JSON.stringify(chunk);
  }

  return {
    manifest: JSON.stringify(output.manifest, null, 2),
    tiles,
    topologyChunks,
  };
}
