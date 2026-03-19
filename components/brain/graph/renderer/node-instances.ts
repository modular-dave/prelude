// ── Node Instances ──────────────────────────────────────────────────
// GPU-instanced node rendering. No object-per-node.
// Three InstancedMesh objects: memory spheres, entity octahedra, cluster aggregates.

import * as THREE from "three";
import { SHARED_GEO } from "@/lib/3d-graph/constants";
import type { CanonicalEntity, SpatialTile } from "@/lib/3d-graph/compiler/types";
import type { ResidentTile, ResidentTopologyChunk } from "@/lib/3d-graph/runtime/types";
import type { Lens } from "@/lib/3d-graph/runtime/types";
import type { FilterBag } from "@/lib/types";
import { computeHeroLayout, computeClusterLayout, computeStarburstLayout, computeZeroGLayout } from "./viz-layout";
import type { Vec3 } from "@/lib/3d-graph/compiler/types";

// ── Sizing constants ──────────────────────────────────────────────
// Base sizes at ~100 nodes. As node count grows, sizes shrink via density factor.
const BASE_MIN_SIZE = 30;
const BASE_HERO_SIZE = 200;
// density factor: sizes scale as 1/sqrt(N/100), clamped to [0.25, 1.0]
function densityFactor(totalNodes: number): number {
  return Math.max(0.25, Math.min(1.0, Math.sqrt(100 / Math.max(1, totalNodes))));
}

const MAX_INSTANCES = 4096;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

export interface NodeInstancesConfig {
  selectedId?: string | null;
  hoveredId?: string | null;
  highlightedIds?: Set<string>;
  depthMap?: Map<string, number>; // entity ID → BFS depth (0 = root)
  maxDepth?: number;
}

export class NodeInstances {
  readonly memorySpheres: THREE.InstancedMesh;
  readonly entityOctahedra: THREE.InstancedMesh;
  readonly clusterSpheres: THREE.InstancedMesh;
  readonly haloMesh: THREE.InstancedMesh;

  // Maps entity id → instance index for each mesh
  private memoryIndex = new Map<string, number>();
  private entityIndex = new Map<string, number>();
  private clusterIndex = new Map<string, number>();
  private haloIndex = new Map<string, number>();

  // Reverse map: instance index → entity id
  private memoryEntities: string[] = [];
  private entityEntities: string[] = [];
  private clusterEntities: string[] = [];

  // Entity data for filtering (stored during sync)
  private memoryEntityData: CanonicalEntity[] = [];
  private entityEntityData: CanonicalEntity[] = [];

  private memoryCount = 0;
  private entityCount = 0;
  private clusterCount = 0;
  private haloCount = 0;

  // Viz layout cache — recomputed only when lens/centerMode/entity count changes
  private cachedPositionMap: Map<string, Vec3> | null = null;
  private cachedLens: Lens | null = null;
  private cachedCenterMode: string | null = null;
  private cachedEntityCount = 0;

  // Hero map: "count:combined" → entityId for all 6 mode combos (for layout hero selection)
  heroMap = new Map<string, string>();

  // Rank among VISIBLE nodes for current reorg+mode (recomputed only when visibility changes)
  private currentRanks = new Map<string, number>();
  private currentRankTotal = 0;
  private currentHeroModes = new Map<string, string[]>();
  private lastVisHash = -1;
  private lastRankKey = "";

  // Cached diversity map (only rebuilt when topology or centerMode changes)
  private cachedDivMap: Map<string, number> | null = null;
  private cachedDivMapKey = "";

  constructor() {
    // Memory nodes: sphere geometry
    const memoryMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    this.memorySpheres = new THREE.InstancedMesh(SHARED_GEO.sphereHi, memoryMat, MAX_INSTANCES);
    this.memorySpheres.count = 0;
    this.memorySpheres.frustumCulled = false;

    // Entity nodes: octahedron geometry
    const entityMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    this.entityOctahedra = new THREE.InstancedMesh(SHARED_GEO.octaHi, entityMat, MAX_INSTANCES);
    this.entityOctahedra.count = 0;
    this.entityOctahedra.frustumCulled = false;

    // Cluster aggregate nodes: larger sphere
    const clusterMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    this.clusterSpheres = new THREE.InstancedMesh(SHARED_GEO.sphereLo, clusterMat, 256);
    this.clusterSpheres.count = 0;
    this.clusterSpheres.frustumCulled = false;

    // Halo mesh for selected/hovered
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.BackSide,
    });
    this.haloMesh = new THREE.InstancedMesh(SHARED_GEO.haloHi, haloMat, 256);
    this.haloMesh.count = 0;
    this.haloMesh.frustumCulled = false;
  }

  // ── Add to scene ──────────────────────────────────────────────

  addToScene(scene: THREE.Scene): void {
    scene.add(this.memorySpheres);
    scene.add(this.entityOctahedra);
    scene.add(this.clusterSpheres);
    scene.add(this.haloMesh);
  }

  // ── Sync from tile cache ──────────────────────────────────────

  syncFromTiles(hotTiles: ResidentTile[]): void {
    // Collect all entities from hot tiles
    const allMemories: CanonicalEntity[] = [];
    const allEntities: CanonicalEntity[] = [];
    const allClusters: CanonicalEntity[] = [];

    for (const tile of hotTiles) {
      if (!tile.data) continue;
      for (const entity of tile.data.entities) {
        switch (entity.nodeCategory) {
          case "memory": allMemories.push(entity); break;
          case "entity": allEntities.push(entity); break;
          case "cluster": allClusters.push(entity); break;
        }
      }
    }

    // Store entity data for filtering
    this.memoryEntityData = allMemories;
    this.entityEntityData = allEntities;

    // Update memory spheres
    this.updateInstances(
      this.memorySpheres, allMemories,
      this.memoryIndex, this.memoryEntities,
      (count) => { this.memoryCount = count; },
    );

    // Update entity octahedra
    this.updateInstances(
      this.entityOctahedra, allEntities,
      this.entityIndex, this.entityEntities,
      (count) => { this.entityCount = count; },
    );

    // Cluster spheres hidden — they're LOD placeholders for progressive refinement.
    // Only show them when zoomed out so far that individual nodes aren't visible.
    this.clusterSpheres.count = 0;
    this.clusterCount = 0;
  }

  // ── Degree centrality from topology ─────────────────────────────
  // Only recomputed when topology chunks change (dirty flag)

  private degreeMap = new Map<string, number>();
  private adjacencyMap = new Map<string, Set<string>>();
  private maxDegree = 1;
  private maxAccessCount = 1;
  private lastChunkKey = "";  // dirty flag — skip if unchanged

  // Diversity metrics
  private linkTypeDiversityMap = new Map<string, number>();
  private neighborTypeDiversityMap = new Map<string, number>();
  private maxLinkTypeDiversity = 1;
  private maxNeighborTypeDiversity = 1;
  private maxPathDepthMap = new Map<string, number>();

  /** Degree (link count) for a given entity id */
  getDegree(id: string): number { return this.degreeMap.get(id) || 0; }

  /** Raw link type diversity count for a given entity id */
  getLinkTypeDiversity(id: string): number { return this.linkTypeDiversityMap.get(id) ?? 0; }

  /** Raw neighbor type diversity count for a given entity id (all reachable via BFS) */
  getNeighborTypeDiversity(id: string): number { return this.neighborTypeDiversityMap.get(id) ?? 0; }

  /** Max BFS depth reachable from a given entity id */
  getMaxPathDepth(id: string): number { return this.maxPathDepthMap.get(id) ?? 0; }

  /** Max neighbors (direct adjacency count) for a given entity id */
  getMaxNeighbors(id: string): number { return this.adjacencyMap.get(id)?.size ?? 0; }

  /** Diversity score [0, 1] for a given entity id, optionally filtered by centerMode */
  getDiversityScore(id: string, centerMode?: "combined" | "reinforced" | "retrieved"): number {
    const ltDiv = (this.linkTypeDiversityMap.get(id) ?? 0) / this.maxLinkTypeDiversity;
    const ntDiv = (this.neighborTypeDiversityMap.get(id) ?? 0) / this.maxNeighborTypeDiversity;
    if (centerMode === "reinforced") return ltDiv;
    if (centerMode === "retrieved") return ntDiv;
    return 0.6 * ltDiv + 0.4 * ntDiv; // combined
  }

  /** Build diversity score map for all entities (used by layout algorithms) */
  private buildDiversityScoreMap(centerMode: "combined" | "reinforced" | "retrieved"): Map<string, number> {
    const map = new Map<string, number>();
    const allIds = new Set([...this.linkTypeDiversityMap.keys(), ...this.neighborTypeDiversityMap.keys()]);
    for (const id of allIds) {
      map.set(id, this.getDiversityScore(id, centerMode));
    }
    return map;
  }

  updateDegree(topologyChunks: ResidentTopologyChunk[]): void {
    // Dirty flag: skip if topology chunks haven't changed
    const chunkKey = topologyChunks.map(c => c.id).join(",");
    if (chunkKey === this.lastChunkKey) return;
    this.lastChunkKey = chunkKey;

    this.degreeMap.clear();
    this.adjacencyMap.clear();
    for (const rc of topologyChunks) {
      if (!rc.data) continue;
      for (const edge of rc.data.edges) {
        this.degreeMap.set(edge.source, (this.degreeMap.get(edge.source) || 0) + 1);
        this.degreeMap.set(edge.target, (this.degreeMap.get(edge.target) || 0) + 1);

        // Build adjacency map (bidirectional)
        let srcNeighbors = this.adjacencyMap.get(edge.source);
        if (!srcNeighbors) { srcNeighbors = new Set(); this.adjacencyMap.set(edge.source, srcNeighbors); }
        srcNeighbors.add(edge.target);

        let tgtNeighbors = this.adjacencyMap.get(edge.target);
        if (!tgtNeighbors) { tgtNeighbors = new Set(); this.adjacencyMap.set(edge.target, tgtNeighbors); }
        tgtNeighbors.add(edge.source);
      }
    }
    this.maxDegree = 1;
    for (const v of this.degreeMap.values()) {
      if (v > this.maxDegree) this.maxDegree = v;
    }

    // Also compute max access count from memory data
    this.maxAccessCount = 1;
    for (const e of this.memoryEntityData) {
      if (e.accessCount > this.maxAccessCount) this.maxAccessCount = e.accessCount;
    }

    // Diversity: count distinct link types per node
    this.linkTypeDiversityMap.clear();
    this.neighborTypeDiversityMap.clear();
    const linkTypeSets = new Map<string, Set<string>>();
    for (const rc of topologyChunks) {
      if (!rc.data) continue;
      for (const edge of rc.data.edges) {
        if (!linkTypeSets.has(edge.source)) linkTypeSets.set(edge.source, new Set());
        if (!linkTypeSets.has(edge.target)) linkTypeSets.set(edge.target, new Set());
        linkTypeSets.get(edge.source)!.add(edge.linkType || "relates");
        linkTypeSets.get(edge.target)!.add(edge.linkType || "relates");
      }
    }
    this.maxLinkTypeDiversity = 1;
    for (const [id, types] of linkTypeSets) {
      this.linkTypeDiversityMap.set(id, types.size);
      if (types.size > this.maxLinkTypeDiversity) this.maxLinkTypeDiversity = types.size;
    }

    // Neighbor type diversity: count distinct memoryTypes reachable via BFS (all hops)
    const allEntities = new Map<string, CanonicalEntity>();
    for (const e of this.memoryEntityData) allEntities.set(e.id, e);
    for (const e of this.entityEntityData) allEntities.set(e.id, e);
    this.maxNeighborTypeDiversity = 1;
    this.maxPathDepthMap.clear();
    for (const startId of this.adjacencyMap.keys()) {
      const visitedTypes = new Set<string>();
      const visited = new Set<string>();
      visited.add(startId);
      const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
      let maxDepth = 0;
      while (queue.length > 0) {
        const { id: nodeId, depth } = queue.shift()!;
        const neighbors = this.adjacencyMap.get(nodeId);
        if (!neighbors) continue;
        for (const nId of neighbors) {
          if (visited.has(nId)) continue;
          visited.add(nId);
          const ne = allEntities.get(nId);
          if (ne) visitedTypes.add(ne.memoryType || ne.type || "unknown");
          const nextDepth = depth + 1;
          if (nextDepth > maxDepth) maxDepth = nextDepth;
          queue.push({ id: nId, depth: nextDepth });
        }
      }
      this.neighborTypeDiversityMap.set(startId, visitedTypes.size);
      this.maxPathDepthMap.set(startId, maxDepth);
      if (visitedTypes.size > this.maxNeighborTypeDiversity) this.maxNeighborTypeDiversity = visitedTypes.size;
    }
  }

  /** Compute hero node for all 6 reorg×mode combinations (among ALL nodes, for layout) */
  private computeHeroMap(): void {
    this.heroMap.clear();
    const all = [...this.memoryEntityData, ...this.entityEntityData];
    if (all.length === 0) return;
    for (const reorg of ["count", "diversity"] as const) {
      for (const mode of ["combined", "reinforced", "retrieved"] as const) {
        let bestId = "";
        let bestScore = -1;
        for (const e of all) {
          let score: number;
          if (reorg === "diversity") {
            score = this.getDiversityScore(e.id, mode);
          } else {
            const deg = this.maxDegree > 0 ? (this.degreeMap.get(e.id) || 0) / this.maxDegree : 0;
            const ret = this.maxAccessCount > 0 ? e.accessCount / this.maxAccessCount : 0;
            score = mode === "retrieved" ? ret : mode === "combined" ? Math.max(deg, ret) : deg;
          }
          if (score > bestScore) { bestScore = score; bestId = e.id; }
        }
        if (bestId) this.heroMap.set(`${reorg}:${mode}`, bestId);
      }
    }
  }

  /** Compute ranks among visible nodes for all 6 mode combos */
  private computeVisibleRanks(visibleScored: Array<{ id: string; score: number }>): void {
    this.currentRanks.clear();
    this.currentHeroModes.clear();
    // Rank for current active mode
    visibleScored.sort((a, b) => b.score - a.score);
    this.currentRankTotal = visibleScored.length;
    for (let i = 0; i < visibleScored.length; i++) {
      this.currentRanks.set(visibleScored[i].id, i + 1);
    }

    // Compute hero-in-any-mode among visible nodes
    const visibleIds = new Set(visibleScored.map(s => s.id));
    const visibleEntities = [...this.memoryEntityData, ...this.entityEntityData].filter(e => visibleIds.has(e.id));
    for (const reorg of ["count", "diversity"] as const) {
      for (const mode of ["combined", "reinforced", "retrieved"] as const) {
        let bestId = "";
        let bestScore = -1;
        for (const e of visibleEntities) {
          let score: number;
          if (reorg === "diversity") {
            score = this.getDiversityScore(e.id, mode);
          } else {
            const deg = this.maxDegree > 0 ? (this.degreeMap.get(e.id) || 0) / this.maxDegree : 0;
            const ret = this.maxAccessCount > 0 ? e.accessCount / this.maxAccessCount : 0;
            score = mode === "retrieved" ? ret : mode === "combined" ? Math.max(deg, ret) : deg;
          }
          if (score > bestScore) { bestScore = score; bestId = e.id; }
        }
        if (bestId) {
          const key = `${reorg}:${mode}`;
          let modes = this.currentHeroModes.get(bestId);
          if (!modes) { modes = []; this.currentHeroModes.set(bestId, modes); }
          modes.push(key);
        }
      }
    }
  }

  /** Get rank of a node among visible nodes */
  getRank(id: string): { rank: number; total: number } | null {
    const r = this.currentRanks.get(id);
    if (r == null) return null;
    return { rank: r, total: this.currentRankTotal };
  }

  /** Get mode keys where this node is #1 among visible nodes */
  getHeroModes(id: string): string[] | undefined { return this.currentHeroModes.get(id); }

  // ── Filter application ─────────────────────────────────────────

  applyFilters(filterBag: FilterBag, lens: Lens, entityById?: Map<string, CanonicalEntity>, bubbleRadius?: number): void {
    const { visibleMemoryIds, focus, centerMode, decayCutoff, reorgMode } = filterBag;
    // Focus filter: show only the focused node type, hide the other
    const memoryScale = focus === "entities" ? 0 : 1.0;
    const entityScale = focus === "memories" ? 0 : 1.0;
    const totalNodes = this.memoryCount + this.entityCount;
    const df = densityFactor(totalNodes);
    const minSize = BASE_MIN_SIZE * df;
    const heroSize = BASE_HERO_SIZE * df;
    const R = bubbleRadius ?? 400;

    // Compute viz layout (cached — only recomputes when lens/centerMode/count changes)
    const currentEntityCount = this.memoryEntityData.length + this.entityEntityData.length;
    const cacheKey = `${centerMode}:${reorgMode}`;
    const needsRecompute =
      lens !== this.cachedLens ||
      cacheKey !== this.cachedCenterMode ||
      currentEntityCount !== this.cachedEntityCount;

    let positionMap: Map<string, Vec3> | null = null;
    // Build diversity score map (cached — only rebuild when topology or mode changes)
    const divKey = `${centerMode}:${reorgMode}:${this.lastChunkKey}`;
    let divMap: Map<string, number> | undefined;
    if (reorgMode === "diversity") {
      if (divKey !== this.cachedDivMapKey) {
        this.cachedDivMap = this.buildDiversityScoreMap(centerMode);
        this.cachedDivMapKey = divKey;
      }
      divMap = this.cachedDivMap ?? undefined;
    }
    if (needsRecompute) {
      if (lens === "hero") {
        positionMap = computeHeroLayout(
          this.memoryEntityData, this.entityEntityData,
          this.degreeMap, this.maxDegree, this.maxAccessCount,
          filterBag, R, this.adjacencyMap, divMap,
        );
      } else if (lens === "cluster" && entityById) {
        positionMap = computeClusterLayout(
          this.memoryEntityData, this.entityEntityData,
          entityById, R,
          filterBag, divMap, this.degreeMap, this.maxDegree, this.maxAccessCount,
        );
      } else if (lens === "starburst" && entityById) {
        positionMap = computeStarburstLayout(
          this.memoryEntityData, this.entityEntityData,
          entityById, this.degreeMap, this.maxDegree, this.maxAccessCount,
          filterBag, R, this.adjacencyMap, divMap,
        );
      } else if (lens === "zeroG") {
        positionMap = computeZeroGLayout(
          this.memoryEntityData, this.entityEntityData, R,
          filterBag, divMap, this.degreeMap, this.maxDegree, this.maxAccessCount,
        );
      }
      this.cachedPositionMap = positionMap;
      this.cachedLens = lens;
      this.cachedCenterMode = cacheKey;
      this.cachedEntityCount = currentEntityCount;
      this.computeHeroMap();
    } else {
      positionMap = this.cachedPositionMap;
    }

    // Collect visible nodes with scores for ranking
    const visibleScored: Array<{ id: string; score: number }> = [];

    // Apply to memory spheres
    for (let i = 0; i < this.memoryEntityData.length && i < this.memoryCount; i++) {
      const e = this.memoryEntityData[i];

      // Visibility: check visibleMemoryIds + decay cutoff
      let visible = true;
      if (visibleMemoryIds && e.numericId != null) {
        visible = visibleMemoryIds.has(e.numericId);
      }
      if (decayCutoff > 0 && e.decayFactor <= decayCutoff) visible = false;

      // Compute normalized scores [0, 1]
      const degScore = (this.degreeMap.get(e.id) || 0) / this.maxDegree;
      const retScore = e.accessCount / this.maxAccessCount;

      // Select hero metric based on centerMode + reorgMode
      let heroScore: number;
      if (reorgMode === "diversity") {
        heroScore = this.getDiversityScore(e.id, centerMode);
      } else {
        heroScore = centerMode === "retrieved" ? retScore
          : centerMode === "combined" ? Math.max(degScore, retScore)
          : degScore; // "reinforced"
      }

      // Linear interpolation: minSize → heroSize (density-scaled)
      let s = minSize + heroScore * (heroSize - minSize);

      s *= memoryScale;
      if (!visible) s = 0;
      else visibleScored.push({ id: e.id, score: heroScore });

      // Luminance: heroes glow bright, peripherals dim (Cleveland & McGill triple-channel)
      const brightness = 0.2 + heroScore * 0.8; // 20%–100%
      _color.set(e.color).multiplyScalar(brightness);
      this.memorySpheres.setColorAt(i, _color);

      // Position from viz layout (origin fallback — no surface positions)
      const pos = positionMap?.get(e.id);
      _position.set(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);

      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.memorySpheres.setMatrixAt(i, _matrix);
    }
    this.memorySpheres.instanceMatrix.needsUpdate = true;
    this.memorySpheres.boundingSphere = null; // invalidate for raycasting
    if (this.memorySpheres.instanceColor) this.memorySpheres.instanceColor.needsUpdate = true;

    // Apply to entity octahedra
    for (let i = 0; i < this.entityEntityData.length && i < this.entityCount; i++) {
      const e = this.entityEntityData[i];
      const degScore = (this.degreeMap.get(e.id) || 0) / this.maxDegree;
      let entScore: number;
      if (reorgMode === "diversity") {
        entScore = this.getDiversityScore(e.id, centerMode);
      } else {
        entScore = degScore;
      }
      let s = minSize + entScore * (heroSize - minSize) * 0.6;
      s *= entityScale;
      if (entityScale > 0) visibleScored.push({ id: e.id, score: entScore });

      // Luminance: same triple-channel encoding for entities
      const brightness = 0.2 + entScore * 0.8;
      _color.set(e.color).multiplyScalar(brightness);
      this.entityOctahedra.setColorAt(i, _color);

      // Position from viz layout (origin fallback — no surface positions)
      const pos = positionMap?.get(e.id);
      _position.set(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);

      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.entityOctahedra.setMatrixAt(i, _matrix);
    }
    this.entityOctahedra.instanceMatrix.needsUpdate = true;
    this.entityOctahedra.boundingSphere = null; // invalidate for raycasting
    if (this.entityOctahedra.instanceColor) this.entityOctahedra.instanceColor.needsUpdate = true;

    // Compute ranks among visible nodes (skip if unchanged)
    const visHash = visibleScored.length;
    if (visHash !== this.lastVisHash || cacheKey !== this.lastRankKey) {
      this.computeVisibleRanks(visibleScored);
      this.lastVisHash = visHash;
      this.lastRankKey = cacheKey;
    }
  }

  /** Returns the set of currently visible entity IDs (for edge filtering) */
  getVisibleEntityIds(filterBag: FilterBag): Set<string> {
    const { visibleMemoryIds } = filterBag;
    const visible = new Set<string>();

    // All entities are always visible
    for (const id of this.entityEntities) {
      if (id) visible.add(id);
    }

    // Memories: check filter
    for (let i = 0; i < this.memoryEntityData.length && i < this.memoryCount; i++) {
      const e = this.memoryEntityData[i];
      if (!visibleMemoryIds || e.numericId == null || visibleMemoryIds.has(e.numericId)) {
        visible.add(e.id);
      }
    }

    return visible;
  }

  private updateInstances(
    mesh: THREE.InstancedMesh,
    entities: CanonicalEntity[],
    indexMap: Map<string, number>,
    entityList: string[],
    setCount: (n: number) => void,
  ): void {
    indexMap.clear();
    entityList.length = 0;

    const count = Math.min(entities.length, MAX_INSTANCES);
    mesh.count = count;

    for (let i = 0; i < count; i++) {
      const e = entities[i];
      indexMap.set(e.id, i);
      entityList[i] = e.id;

      // Scale from importance — proportional to bubble radius (~2000+)
      const s = 8 + e.importance * 20;
      _position.set(0, 0, 0);
      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);

      // Color
      _color.set(e.color);
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null; // invalidate for raycasting
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    setCount(count);
  }

  // ── Selection / hover halos ───────────────────────────────────

  updateHighlights(config: NodeInstancesConfig): void {
    const haloIds: string[] = [];
    const depthMap = config.depthMap;
    const maxDepth = config.maxDepth || 1;

    if (config.selectedId) haloIds.push(config.selectedId);
    if (config.hoveredId && config.hoveredId !== config.selectedId) haloIds.push(config.hoveredId);
    if (config.highlightedIds) {
      for (const id of config.highlightedIds) {
        if (!haloIds.includes(id)) haloIds.push(id);
      }
    }

    this.haloIndex.clear();
    const count = Math.min(haloIds.length, 256);
    this.haloMesh.count = count;

    let needsColor = false;
    for (let i = 0; i < count; i++) {
      const entityId = haloIds[i];
      this.haloIndex.set(entityId, i);

      const pos = this.getEntityPosition(entityId);
      if (!pos) continue;

      const baseScale = this.getEntityScale(entityId);
      const s = baseScale * 1.5;
      _position.copy(pos);
      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.haloMesh.setMatrixAt(i, _matrix);

      // Depth-based opacity: root = bright white, deeper = darker (less visible)
      if (depthMap) {
        const depth = depthMap.get(entityId) ?? 0;
        const t = maxDepth > 0 ? depth / maxDepth : 0;
        const brightness = 1.0 - t * 0.8; // root=1.0, max depth=0.2
        _color.setRGB(brightness, brightness, brightness);
        this.haloMesh.setColorAt(i, _color);
        needsColor = true;
      }
    }

    if (count > 0) {
      this.haloMesh.instanceMatrix.needsUpdate = true;
      if (needsColor && this.haloMesh.instanceColor) this.haloMesh.instanceColor.needsUpdate = true;
    }
    this.haloCount = count;
  }

  // ── Hit testing ───────────────────────────────────────────────

  entityIdAtInstance(mesh: THREE.InstancedMesh, instanceId: number): string | null {
    if (mesh === this.memorySpheres) return this.memoryEntities[instanceId] || null;
    if (mesh === this.entityOctahedra) return this.entityEntities[instanceId] || null;
    if (mesh === this.clusterSpheres) return this.clusterEntities[instanceId] || null;
    return null;
  }

  getEntityPosition(entityId: string): THREE.Vector3 | null {
    let mesh: THREE.InstancedMesh;
    let idx: number | undefined;

    idx = this.memoryIndex.get(entityId);
    if (idx !== undefined) mesh = this.memorySpheres;
    else {
      idx = this.entityIndex.get(entityId);
      if (idx !== undefined) mesh = this.entityOctahedra;
      else {
        idx = this.clusterIndex.get(entityId);
        if (idx !== undefined) mesh = this.clusterSpheres;
        else return null;
      }
    }

    mesh!.getMatrixAt(idx, _matrix);
    _matrix.decompose(_position, _quaternion, _scale);
    return _position.clone();
  }

  private getEntityScale(entityId: string): number {
    let mesh: THREE.InstancedMesh;
    let idx: number | undefined;

    idx = this.memoryIndex.get(entityId);
    if (idx !== undefined) mesh = this.memorySpheres;
    else {
      idx = this.entityIndex.get(entityId);
      if (idx !== undefined) mesh = this.entityOctahedra;
      else {
        idx = this.clusterIndex.get(entityId);
        if (idx !== undefined) mesh = this.clusterSpheres;
        else return 5;
      }
    }

    mesh!.getMatrixAt(idx, _matrix);
    _matrix.decompose(_position, _quaternion, _scale);
    return _scale.x;
  }

  // ── Accessors ─────────────────────────────────────────────────

  get totalVisible(): number {
    return this.memoryCount + this.entityCount + this.clusterCount;
  }

  hasEntity(entityId: string): boolean {
    return this.memoryIndex.has(entityId) ||
      this.entityIndex.has(entityId) ||
      this.clusterIndex.has(entityId);
  }

  // ── Visibility ────────────────────────────────────────────────

  setVisible(visible: boolean): void {
    this.memorySpheres.visible = visible;
    this.entityOctahedra.visible = visible;
  }

  // ── Cleanup ───────────────────────────────────────────────────

  dispose(): void {
    this.memorySpheres.dispose();
    this.entityOctahedra.dispose();
    this.clusterSpheres.dispose();
    this.haloMesh.dispose();
  }
}
