// ── Node Instances ──────────────────────────────────────────────────
// GPU-instanced node rendering. No object-per-node.
// Three InstancedMesh objects: memory spheres, entity octahedra, cluster aggregates.

import * as THREE from "three";
import { SHARED_GEO } from "@/lib/3d-graph/constants";
import type { CanonicalEntity, SpatialTile } from "@/lib/3d-graph/compiler/types";
import type { ResidentTile, ResidentTopologyChunk } from "@/lib/3d-graph/runtime/types";
import type { Lens } from "@/lib/3d-graph/runtime/types";
import type { FilterBag } from "@/lib/types";
import { computeHeroLayout, computeClusterLayout } from "./viz-layout";
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
    this.haloMesh = new THREE.InstancedMesh(SHARED_GEO.haloHi, haloMat, 16);
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
  // Cached per-frame to avoid recomputation

  private degreeMap = new Map<string, number>();
  private adjacencyMap = new Map<string, Set<string>>();
  private maxDegree = 1;
  private maxAccessCount = 1;

  /** Degree (link count) for a given entity id */
  getDegree(id: string): number { return this.degreeMap.get(id) || 0; }

  updateDegree(topologyChunks: ResidentTopologyChunk[]): void {
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
  }

  // ── Filter application ─────────────────────────────────────────

  applyFilters(filterBag: FilterBag, lens: Lens, entityById?: Map<string, CanonicalEntity>, bubbleRadius?: number): void {
    const { visibleMemoryIds, focus, centerMode, decayCutoff } = filterBag;
    // In memory focus: memories full, entities/edges small
    // In edge focus: everything small (edges shown separately)
    // In entity focus: entities full, memories small
    const memoryScale = focus === "memories" ? 1.0 : 0.35;
    const entityScale = focus === "entities" ? 1.0 : (focus === "memories" ? 0.6 : 0.35);
    const totalNodes = this.memoryCount + this.entityCount;
    const df = densityFactor(totalNodes);
    const minSize = BASE_MIN_SIZE * df;
    const heroSize = BASE_HERO_SIZE * df;
    const R = bubbleRadius ?? 400;

    // Compute viz layout (cached — only recomputes when lens/centerMode/count changes)
    const currentEntityCount = this.memoryEntityData.length + this.entityEntityData.length;
    const needsRecompute =
      lens !== this.cachedLens ||
      centerMode !== this.cachedCenterMode ||
      currentEntityCount !== this.cachedEntityCount;

    let positionMap: Map<string, Vec3> | null = null;
    if (needsRecompute) {
      if (lens === "hero") {
        positionMap = computeHeroLayout(
          this.memoryEntityData, this.entityEntityData,
          this.degreeMap, this.maxDegree, this.maxAccessCount,
          filterBag, R, this.adjacencyMap,
        );
      } else if (lens === "cluster" && entityById) {
        positionMap = computeClusterLayout(
          this.memoryEntityData, this.entityEntityData,
          entityById, R,
        );
      }
      this.cachedPositionMap = positionMap;
      this.cachedLens = lens;
      this.cachedCenterMode = centerMode;
      this.cachedEntityCount = currentEntityCount;
    } else {
      positionMap = this.cachedPositionMap;
    }

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

      // Select hero metric based on centerMode
      const heroScore = centerMode === "retrieved" ? retScore
        : centerMode === "combined" ? Math.max(degScore, retScore)
        : degScore; // "reinforced"

      // Linear interpolation: minSize → heroSize (density-scaled)
      let s = minSize + heroScore * (heroSize - minSize);

      s *= memoryScale;
      if (!visible) s = 0;

      // Position from viz layout or fallback to canonical
      const pos = positionMap?.get(e.id);
      if (pos) {
        _position.set(pos.x, pos.y, pos.z);
      } else {
        _position.set(e.cartesian.x, e.cartesian.y, e.cartesian.z);
      }

      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.memorySpheres.setMatrixAt(i, _matrix);
    }
    this.memorySpheres.instanceMatrix.needsUpdate = true;
    this.memorySpheres.boundingSphere = null; // invalidate for raycasting

    // Apply to entity octahedra
    for (let i = 0; i < this.entityEntityData.length && i < this.entityCount; i++) {
      const e = this.entityEntityData[i];
      const degScore = (this.degreeMap.get(e.id) || 0) / this.maxDegree;
      let s = minSize + degScore * (heroSize - minSize) * 0.6;
      s *= entityScale;

      // Position from viz layout or fallback to canonical
      const pos = positionMap?.get(e.id);
      if (pos) {
        _position.set(pos.x, pos.y, pos.z);
      } else {
        _position.set(e.cartesian.x, e.cartesian.y, e.cartesian.z);
      }

      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.entityOctahedra.setMatrixAt(i, _matrix);
    }
    this.entityOctahedra.instanceMatrix.needsUpdate = true;
    this.entityOctahedra.boundingSphere = null; // invalidate for raycasting
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
      _position.set(e.cartesian.x, e.cartesian.y, e.cartesian.z);
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

  private updateClusterInstances(clusters: CanonicalEntity[]): void {
    this.clusterIndex.clear();
    this.clusterEntities.length = 0;

    const count = Math.min(clusters.length, 256);
    this.clusterSpheres.count = count;

    for (let i = 0; i < count; i++) {
      const e = clusters[i];
      this.clusterIndex.set(e.id, i);
      this.clusterEntities[i] = e.id;

      // Cluster scale based on node count
      const nodeCount = e.clusterStats?.nodeCount || 1;
      const s = 20 + Math.cbrt(nodeCount) * 15;
      _position.set(e.cartesian.x, e.cartesian.y, e.cartesian.z);
      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.clusterSpheres.setMatrixAt(i, _matrix);

      _color.set(e.color);
      this.clusterSpheres.setColorAt(i, _color);
    }

    this.clusterSpheres.instanceMatrix.needsUpdate = true;
    if (this.clusterSpheres.instanceColor) this.clusterSpheres.instanceColor.needsUpdate = true;
    this.clusterCount = count;
  }

  // ── Selection / hover halos ───────────────────────────────────

  updateHighlights(config: NodeInstancesConfig): void {
    const haloIds: string[] = [];

    if (config.selectedId) haloIds.push(config.selectedId);
    if (config.hoveredId && config.hoveredId !== config.selectedId) haloIds.push(config.hoveredId);
    if (config.highlightedIds) {
      for (const id of config.highlightedIds) {
        if (!haloIds.includes(id)) haloIds.push(id);
      }
    }

    this.haloIndex.clear();
    const count = Math.min(haloIds.length, 16);
    this.haloMesh.count = count;

    for (let i = 0; i < count; i++) {
      const entityId = haloIds[i];
      this.haloIndex.set(entityId, i);

      // Find entity position from any index
      const pos = this.getEntityPosition(entityId);
      if (!pos) continue;

      const baseScale = this.getEntityScale(entityId);
      const s = baseScale * 1.5;
      _position.copy(pos);
      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.haloMesh.setMatrixAt(i, _matrix);
    }

    if (count > 0) this.haloMesh.instanceMatrix.needsUpdate = true;
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
