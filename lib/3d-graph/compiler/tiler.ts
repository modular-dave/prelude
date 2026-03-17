// ── Tile Partitioner ────────────────────────────────────────────────
// Divides the canonical world into spatial tiles (shell + sector)
// and topology chunks (neighborhood, path, cluster-adjacency).

import type {
  CanonicalEntity, SpatialTile, TopologyChunk, AggregateEdge,
  RawEdge, SphericalBounds, CompilerConfig, WorldManifest,
  TileIndexEntry, TopologyIndexEntry, ShellDefinition,
} from "./types";

// ── Spatial Tiling ──────────────────────────────────────────────────

interface TileGrid {
  shellCount: number;
  thetaSectors: number;
  phiSectors: number;
  bubbleRadius: number;
}

function tileId(level: number, shell: number, thetaSector: number, phiSector: number): string {
  return `${level}/${shell}/${thetaSector}/${phiSector}`;
}

function shellBounds(shell: number, grid: TileGrid): { rMin: number; rMax: number } {
  const shellHeight = grid.bubbleRadius / grid.shellCount;
  return {
    rMin: shell * shellHeight,
    rMax: (shell + 1) * shellHeight,
  };
}

function sectorBounds(thetaSector: number, phiSector: number, grid: TileGrid): SphericalBounds {
  const thetaStep = Math.PI / grid.thetaSectors;
  const phiStep = (2 * Math.PI) / grid.phiSectors;
  const { rMin, rMax } = shellBounds(0, grid); // will be overridden

  return {
    rMin, rMax,
    thetaMin: thetaSector * thetaStep,
    thetaMax: (thetaSector + 1) * thetaStep,
    phiMin: phiSector * phiStep,
    phiMax: (phiSector + 1) * phiStep,
  };
}

function entityToTileCoords(entity: CanonicalEntity, grid: TileGrid): {
  shell: number; thetaSector: number; phiSector: number;
} {
  const shellHeight = grid.bubbleRadius / grid.shellCount;
  const shell = Math.min(grid.shellCount - 1, Math.max(0, Math.floor(entity.canonical.r / shellHeight)));

  const thetaStep = Math.PI / grid.thetaSectors;
  const thetaSector = Math.min(grid.thetaSectors - 1, Math.max(0, Math.floor(entity.canonical.theta / thetaStep)));

  const phiStep = (2 * Math.PI) / grid.phiSectors;
  const phi = ((entity.canonical.phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const phiSector = Math.min(grid.phiSectors - 1, Math.max(0, Math.floor(phi / phiStep)));

  return { shell, thetaSector, phiSector };
}

export function buildSpatialTiles(
  entities: Map<string, CanonicalEntity>,
  edges: RawEdge[],
  config: CompilerConfig,
): SpatialTile[] {
  const grid: TileGrid = {
    shellCount: config.shellCount,
    thetaSectors: config.thetaSectors,
    phiSectors: config.phiSectors,
    bubbleRadius: config.bubbleRadius,
  };

  // Bin entities into tiles
  const tileBins = new Map<string, CanonicalEntity[]>();

  for (const entity of entities.values()) {
    const coords = entityToTileCoords(entity, grid);
    const level = entity.hierarchyLevel;
    const id = tileId(level, coords.shell, coords.thetaSector, coords.phiSector);

    let bin = tileBins.get(id);
    if (!bin) { bin = []; tileBins.set(id, bin); }
    bin.push(entity);
  }

  // Build aggregate edges per tile
  const entityTileMap = new Map<string, string>();
  for (const [tid, bin] of tileBins) {
    for (const entity of bin) {
      entityTileMap.set(entity.id, tid);
    }
  }

  const tileAggEdges = new Map<string, Map<string, AggregateEdge>>();

  for (const edge of edges) {
    const srcTile = entityTileMap.get(edge.source);
    const tgtTile = entityTileMap.get(edge.target);
    if (!srcTile || !tgtTile || srcTile === tgtTile) continue;

    const key = srcTile < tgtTile ? `${srcTile}|${tgtTile}` : `${tgtTile}|${srcTile}`;
    const [t1, t2] = key.split("|");

    if (!tileAggEdges.has(t1)) tileAggEdges.set(t1, new Map());
    const agg = tileAggEdges.get(t1)!;

    const existing = agg.get(key);
    if (existing) {
      existing.weight += edge.weight || 1;
      existing.edgeCount++;
    } else {
      agg.set(key, {
        sourceCluster: t1,
        targetCluster: t2,
        weight: edge.weight || 1,
        edgeCount: 1,
        representativeType: edge.linkType,
      });
    }
  }

  // Build tile objects
  const tiles: SpatialTile[] = [];

  for (const [tid, bin] of tileBins) {
    const parts = tid.split("/").map(Number);
    const [level, shell, thetaSector, phiSector] = parts;
    const shellB = shellBounds(shell, grid);
    const sectorB = sectorBounds(thetaSector, phiSector, grid);

    const aggregateEdges: AggregateEdge[] = [];
    const aggMap = tileAggEdges.get(tid);
    if (aggMap) {
      for (const agg of aggMap.values()) aggregateEdges.push(agg);
    }

    tiles.push({
      id: tid,
      level,
      shell,
      thetaSector,
      phiSector,
      bounds: {
        rMin: shellB.rMin,
        rMax: shellB.rMax,
        thetaMin: sectorB.thetaMin,
        thetaMax: sectorB.thetaMax,
        phiMin: sectorB.phiMin,
        phiMax: sectorB.phiMax,
      },
      entities: bin,
      aggregateEdges,
    });
  }

  return tiles;
}

// ── Topology Chunks ─────────────────────────────────────────────────

export function buildTopologyChunks(
  entities: Map<string, CanonicalEntity>,
  edges: RawEdge[],
  config: CompilerConfig,
): TopologyChunk[] {
  const chunks: TopologyChunk[] = [];

  // Build adjacency list for raw nodes
  const adjacency = new Map<string, RawEdge[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge);
    adjacency.get(edge.target)!.push(edge);
  }

  // Neighborhood chunks: for each raw node, collect edges within N hops
  const rawNodes = [...entities.values()].filter(e => e.hierarchyLevel === 3);

  for (const node of rawNodes) {
    const neighborEdges = collectNeighborhood(node.id, adjacency, config.neighborhoodDepth);
    if (neighborEdges.length === 0) continue;

    const chunkId = `nbr_${node.id}`;
    chunks.push({
      id: chunkId,
      type: "neighborhood",
      centerEntityId: node.id,
      edges: neighborEdges,
    });

    // Update entity refs
    node.adjacencyChunkRefs.push(chunkId);
  }

  // Cluster adjacency chunks: edges between clusters at each level
  const clusterEntities = [...entities.values()].filter(e => e.hierarchyLevel < 3);
  const clusterIds = new Set(clusterEntities.map(e => e.id));

  // Group edges by cluster pair
  const clusterEdgeGroups = new Map<string, RawEdge[]>();
  for (const edge of edges) {
    const srcEntity = entities.get(edge.source);
    const tgtEntity = entities.get(edge.target);
    if (!srcEntity || !tgtEntity) continue;
    if (srcEntity.parentId === tgtEntity.parentId) continue; // same cluster

    const srcCluster = srcEntity.parentId || srcEntity.id;
    const tgtCluster = tgtEntity.parentId || tgtEntity.id;
    if (srcCluster === tgtCluster) continue;

    const key = srcCluster < tgtCluster ? `${srcCluster}|${tgtCluster}` : `${tgtCluster}|${srcCluster}`;
    if (!clusterEdgeGroups.has(key)) clusterEdgeGroups.set(key, []);
    clusterEdgeGroups.get(key)!.push(edge);
  }

  for (const [key, groupEdges] of clusterEdgeGroups) {
    const chunkId = `cadj_${key.replace("|", "_")}`;
    chunks.push({
      id: chunkId,
      type: "cluster-adjacency",
      edges: groupEdges,
    });
  }

  return chunks;
}

function collectNeighborhood(
  startId: string,
  adjacency: Map<string, RawEdge[]>,
  maxDepth: number,
): RawEdge[] {
  const visited = new Set<string>();
  const edgeSet = new Set<string>();
  const result: RawEdge[] = [];

  let frontier = [startId];
  visited.add(startId);

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const nodeEdges = adjacency.get(nodeId) || [];
      for (const edge of nodeEdges) {
        const edgeKey = edge.source < edge.target
          ? `${edge.source}|${edge.target}`
          : `${edge.target}|${edge.source}`;

        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          result.push(edge);
        }

        const neighbor = edge.source === nodeId ? edge.target : edge.source;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }

    frontier = nextFrontier;
  }

  return result;
}

// ── Manifest Builder ────────────────────────────────────────────────

export function buildManifest(
  tiles: SpatialTile[],
  topologyChunks: TopologyChunk[],
  entities: Map<string, CanonicalEntity>,
  edges: RawEdge[],
  config: CompilerConfig,
): WorldManifest {
  // Build shell definitions
  const shellHeight = config.bubbleRadius / config.shellCount;
  const shells: ShellDefinition[] = [];
  for (let i = 0; i < config.shellCount; i++) {
    shells.push({ level: i, rMin: i * shellHeight, rMax: (i + 1) * shellHeight });
  }

  // Build tile index
  const tileIndex: Record<string, TileIndexEntry> = {};
  for (const tile of tiles) {
    // Find parent tile (same sector, one level up)
    const parentLevel = tile.level - 1;
    const parentId = parentLevel >= 0
      ? tileId(parentLevel, tile.shell, tile.thetaSector, tile.phiSector)
      : null;
    const parentExists = parentId && tiles.some(t => t.id === parentId);

    // Find child tiles
    const childLevel = tile.level + 1;
    const childIds = tiles
      .filter(t =>
        t.level === childLevel &&
        t.shell === tile.shell &&
        t.thetaSector === tile.thetaSector &&
        t.phiSector === tile.phiSector
      )
      .map(t => t.id);

    tileIndex[tile.id] = {
      entityCount: tile.entities.length,
      bounds: tile.bounds,
      parentTileId: parentExists ? parentId : null,
      childTileIds: childIds,
    };
  }

  // Build topology index
  const topologyIndex: Record<string, TopologyIndexEntry> = {};
  for (const chunk of topologyChunks) {
    topologyIndex[chunk.id] = {
      edgeCount: chunk.edges.length,
      type: chunk.type,
      centerEntityId: chunk.centerEntityId,
    };
  }

  // Build entity index
  const entityIndex: Record<string, { tileId: string; hierarchyLevel: number }> = {};
  for (const tile of tiles) {
    for (const entity of tile.entities) {
      entityIndex[entity.id] = { tileId: tile.id, hierarchyLevel: entity.hierarchyLevel };
    }
  }

  // Root tiles: level 0 tiles (superclusters)
  const rootTileIds = tiles.filter(t => t.level === 0).map(t => t.id);

  // Count clusters
  const totalClusters = [...entities.values()].filter(e => e.nodeCategory === "cluster").length;

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    totalNodes: [...entities.values()].filter(e => e.hierarchyLevel === 3).length,
    totalEdges: edges.length,
    totalClusters,
    hierarchyLevels: config.maxHierarchyLevels,
    bubbleRadius: config.bubbleRadius,
    shells,
    tileIndex,
    topologyIndex,
    rootTileIds,
    entityIndex,
  };
}
