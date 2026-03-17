// ── Compiler Types ──────────────────────────────────────────────────
// Types for the offline graph compiler that transforms raw Supabase data
// into a tiled, hierarchical world model.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SphericalCoord {
  r: number;
  theta: number; // polar angle [0, π]
  phi: number;   // azimuthal angle [0, 2π)
}

export interface SphericalBounds {
  rMin: number;
  rMax: number;
  thetaMin: number;
  thetaMax: number;
  phiMin: number;
  phiMax: number;
}

// ── Canonical Entity ────────────────────────────────────────────────

export interface CanonicalEntity {
  id: string;
  type: string;               // memory_type or entity type
  parentId: string | null;     // parent cluster id
  childrenIds: string[];       // child node/cluster ids (empty for raw nodes)
  hierarchyLevel: number;      // 0=supercluster, 1=cluster, 2=subcluster, 3=raw
  canonical: SphericalCoord;
  cartesian: Vec3;             // precomputed from spherical
  importance: number;          // normalized [0, 1]
  clusterStats: ClusterStats | null;
  adjacencyChunkRefs: string[];
  pathChunkRefs: string[];
  // Display metadata
  label: string;
  color: string;
  nodeCategory: "memory" | "entity" | "cluster";
  numericId: number | null;    // Supabase memory id (null for entities/clusters)
  memoryType?: string;         // e.g. "episodic", "semantic"
  entityType?: string;         // e.g. "person", "concept"
  accessCount: number;         // retrieval count (access_count from memory)
  displayOffsets: DisplayOffsets | null; // per-lens position warps
}

export interface ClusterStats {
  nodeCount: number;
  edgeCount: number;
  anchor: string;              // representative node id
  boundingRegion: SphericalBounds;
}

// ── Display Offsets (per-lens warps) ────────────────────────────────

export interface DisplayOffsets {
  hero?: Vec3;
  cluster?: Vec3;
  zeroG?: Vec3;
}

// ── Edges ───────────────────────────────────────────────────────────

export interface RawEdge {
  source: string;
  target: string;
  weight: number;
  linkType: string;
}

export interface AggregateEdge {
  sourceCluster: string;
  targetCluster: string;
  weight: number;              // sum of constituent edge weights
  edgeCount: number;
  representativeType: string;  // most common link type
}

// ── Tiles ───────────────────────────────────────────────────────────

export interface SpatialTile {
  id: string;                  // "level/shell/thetaSector/phiSector"
  level: number;
  shell: number;
  thetaSector: number;
  phiSector: number;
  bounds: SphericalBounds;
  entities: CanonicalEntity[];
  aggregateEdges: AggregateEdge[];
}

export type TopologyChunkType = "neighborhood" | "path" | "cluster-adjacency";

export interface TopologyChunk {
  id: string;
  type: TopologyChunkType;
  centerEntityId?: string;     // for neighborhood chunks
  edges: RawEdge[];
}

// ── World Manifest ──────────────────────────────────────────────────

export interface ShellDefinition {
  level: number;
  rMin: number;
  rMax: number;
}

export interface TileIndexEntry {
  entityCount: number;
  bounds: SphericalBounds;
  parentTileId: string | null;
  childTileIds: string[];
}

export interface TopologyIndexEntry {
  edgeCount: number;
  type: TopologyChunkType;
  centerEntityId?: string;
}

export interface WorldManifest {
  version: number;
  timestamp: string;
  totalNodes: number;
  totalEdges: number;
  totalClusters: number;
  hierarchyLevels: number;
  bubbleRadius: number;
  shells: ShellDefinition[];
  tileIndex: Record<string, TileIndexEntry>;
  topologyIndex: Record<string, TopologyIndexEntry>;
  rootTileIds: string[];       // top-level tiles to load first
  entityIndex: Record<string, { tileId: string; hierarchyLevel: number }>;
}

// ── Compiler Input ──────────────────────────────────────────────────

export interface RawGraphNode {
  id: string;
  label: string;
  color: string;
  importance: number;
  isEntity: boolean;
  numericId: number | null;
  type: string;                // memory_type or entity type
  val: number;                 // display value (size)
  accessCount: number;         // retrieval/access count
}

export interface RawGraphData {
  nodes: RawGraphNode[];
  edges: RawEdge[];
}

// ── Compiler Config ─────────────────────────────────────────────────

export interface CompilerConfig {
  maxHierarchyLevels: number;    // default 4
  shellCount: number;            // radial shells for spatial tiling
  thetaSectors: number;          // angular divisions in polar direction
  phiSectors: number;            // angular divisions in azimuthal direction
  minClusterSize: number;        // minimum nodes per cluster
  maxClusterSize: number;        // maximum before splitting
  neighborhoodDepth: number;     // hops for topology chunks
  bubbleRadius: number;          // sphere radius
}

export const DEFAULT_COMPILER_CONFIG: CompilerConfig = {
  maxHierarchyLevels: 4,
  shellCount: 3,
  thetaSectors: 6,
  phiSectors: 12,
  minClusterSize: 3,
  maxClusterSize: 50,
  neighborhoodDepth: 2,
  bubbleRadius: 400,
};
