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
    decayFactor: m.decay_factor ?? 1,
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
    accessCount: e.size || 1,
    decayFactor: 1,
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

// ── Incremental node injection ──────────────────────────────────────
// Adds a single new memory to an existing compiled graph without
// full recompilation. Used for instant feedback after chat messages.

export function injectNode(
  existing: CompilerOutput,
  memory: { id: number; summary?: string; memory_type?: string; importance?: number; access_count?: number; decay_factor?: number },
  typeColors: Record<string, string>,
): CompilerOutput {
  const nodeId = `m_${memory.id}`;

  // Already exists — skip
  if (existing.entities.has(nodeId)) return existing;

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const R = existing.manifest.bubbleRadius;

  // Position using Fibonacci sphere at index = current raw node count
  const rawCount = [...existing.entities.values()].filter(e => e.hierarchyLevel === 3).length;
  const index = rawCount;
  const total = rawCount + 1;
  const y = 1 - (2 * index + 1) / total;
  const theta = Math.acos(Math.max(-1, Math.min(1, y)));
  const phi = ((GOLDEN_ANGLE * index) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  const importance = memory.importance || 0.5;
  const rMin = R * 0.15;
  const rMax = R * 0.85;
  const r = rMin + importance * (rMax - rMin);

  const sinTheta = Math.sin(theta);
  const cartesian = {
    x: r * sinTheta * Math.cos(phi),
    y: r * Math.cos(theta),
    z: r * sinTheta * Math.sin(phi),
  };

  const canonical = { r, theta, phi };
  const memType = memory.memory_type || "episodic";

  const entity: CanonicalEntity = {
    id: nodeId,
    type: memType,
    parentId: null,
    childrenIds: [],
    hierarchyLevel: 3,
    canonical,
    cartesian,
    importance,
    clusterStats: null,
    adjacencyChunkRefs: [],
    pathChunkRefs: [],
    label: memory.summary?.slice(0, 60) || "memory",
    color: typeColors[memType] || "#666",
    nodeCategory: "memory",
    numericId: memory.id,
    memoryType: memType,
    accessCount: memory.access_count ?? 0,
    decayFactor: memory.decay_factor ?? 1,
    displayOffsets: null,
  };

  // Add to entities map
  existing.entities.set(nodeId, entity);

  // Find the matching spatial tile and add entity
  let targetTile: SpatialTile | null = null;
  for (const tile of existing.tiles.values()) {
    if (tile.level === 3) {
      targetTile = tile;
      break;
    }
  }
  if (!targetTile && existing.tiles.size > 0) {
    targetTile = existing.tiles.values().next().value!;
  }
  if (targetTile) {
    targetTile.entities.push(entity);
  }

  // Update manifest counts
  existing.manifest.totalNodes++;
  existing.manifest.entityIndex[nodeId] = {
    tileId: targetTile?.id || "",
    hierarchyLevel: 3,
  };

  return existing;
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
