// ── Tile Cache ──────────────────────────────────────────────────────
// Three-tier cache (hot/warm/cold) with progressive refinement.
// Coarse parent tiles stay visible until all children are loaded.
// Never removes parents before children are ready.

import type { SpatialTile, TopologyChunk } from "../compiler/types";
import type { ViewState, ResidentTile, ResidentTopologyChunk, TileCacheConfig } from "./types";
import { DEFAULT_CACHE_CONFIG } from "./types";
import type { WorldModel } from "./world-model";
import { scoreTile } from "./residency";
import { TileLoader } from "./tile-loader";

export type TileCacheEvent = "tile-loaded" | "tile-evicted" | "chunk-loaded";
export type TileCacheListener = (event: TileCacheEvent, id: string) => void;

export class TileCache {
  private spatialTiles = new Map<string, ResidentTile>();
  private topologyChunks = new Map<string, ResidentTopologyChunk>();
  private injectedChunkIds = new Set<string>();
  private config: TileCacheConfig;
  private worldModel: WorldModel;
  private loader: TileLoader;
  private listeners = new Set<TileCacheListener>();
  private evictionFrozen = false;
  private evictionFreezeUntil = 0;
  private _generation = 0;
  private _allLocal = false; // true when all tiles were injected locally (no eviction needed)

  /** Monotonic counter — increments on tile load/evict/inject. Cheap dirty check for consumers. */
  get generation(): number { return this._generation; }

  /** Bump generation to signal consumers that tile data changed in-place. */
  touch(): void { this._generation++; }

  constructor(worldModel: WorldModel, config = DEFAULT_CACHE_CONFIG) {
    this.worldModel = worldModel;
    this.config = config;
    this.loader = new TileLoader();
  }

  // ── Per-frame update ──────────────────────────────────────────

  update(viewState: ViewState): void {
    const now = performance.now();

    // Score all known tiles
    const scored: Array<{ id: string; score: number }> = [];
    for (const tileId of this.worldModel.allTileIds()) {
      const entry = this.worldModel.tileEntry(tileId);
      if (!entry) continue;
      const score = scoreTile(tileId, entry, viewState, this.worldModel.bubbleRadius);
      scored.push({ id: tileId, score });

      // Update resident tile score
      const resident = this.spatialTiles.get(tileId);
      if (resident) {
        resident.score = score;
        resident.lastScored = now;
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Promote: load tiles that score above hot threshold
    const hotCount = this.hotTiles().length;
    for (const { id, score } of scored) {
      if (score < this.config.hotThreshold) break;
      if (hotCount >= this.config.maxHotTiles) break;

      const resident = this.spatialTiles.get(id);
      if (!resident) {
        // Not yet resident — start loading
        this.spatialTiles.set(id, {
          id, status: "loading", data: null, score,
          lastScored: now, instanceOffset: 0, instanceCount: 0,
        });
        this.loader.loadTile(id, (tileId, data) => this.onTileLoaded(tileId, data));
      } else if (resident.status === "warm" || resident.status === "cold") {
        resident.status = "hot";
      }
    }

    // Demote: evict tiles below cold threshold (unless frozen or local mode)
    if (!this._allLocal && !this.isEvictionFrozen(now)) {
      this.evictColdTiles(scored, now);
    }

    // Load topology chunks for expanded nodes
    this.updateTopologyChunks(viewState);
  }

  // ── Tile lifecycle ────────────────────────────────────────────

  private onTileLoaded(tileId: string, data: SpatialTile): void {
    const resident = this.spatialTiles.get(tileId);
    if (!resident) return; // was evicted before load completed

    resident.data = data;
    resident.status = "hot";
    resident.instanceCount = data.entities.length;
    this._generation++;
    this.emit("tile-loaded", tileId);
  }

  private evictColdTiles(scored: Array<{ id: string; score: number }>, now: number): void {
    // Find tiles scoring below threshold, starting from the lowest
    for (let i = scored.length - 1; i >= 0; i--) {
      const { id, score } = scored[i];
      if (score >= this.config.coldThreshold) continue;

      const resident = this.spatialTiles.get(id);
      if (!resident || resident.status === "loading") continue;

      // Progressive refinement rule: never evict a parent whose children aren't all hot
      if (this.hasUnloadedChildren(id)) continue;

      // Demote: hot → warm → cold → evict
      if (resident.status === "hot") {
        resident.status = "warm";
      } else if (resident.status === "warm") {
        resident.status = "cold";
      } else if (resident.status === "cold") {
        this.loader.cancelTile(id);
        this.spatialTiles.delete(id);
        this._generation++;
        this.emit("tile-evicted", id);
      }
    }
  }

  private hasUnloadedChildren(tileId: string): boolean {
    const childIds = this.worldModel.childTileIds(tileId);
    if (childIds.length === 0) return false;

    for (const childId of childIds) {
      const child = this.spatialTiles.get(childId);
      if (!child || child.status !== "hot") return true;
    }
    return false;
  }

  // ── Topology chunks ───────────────────────────────────────────

  private updateTopologyChunks(viewState: ViewState): void {
    // Load neighborhood chunks for focused/expanded nodes
    const neededChunks = new Set<string>();

    if (viewState.focus.targetId) {
      const chunkId = this.worldModel.neighborhoodChunkForEntity(viewState.focus.targetId);
      if (chunkId) neededChunks.add(chunkId);
    }

    for (const nodeId of viewState.topology.expandedNodeIds) {
      const chunkId = this.worldModel.neighborhoodChunkForEntity(nodeId);
      if (chunkId) neededChunks.add(chunkId);
    }

    // Load missing chunks
    for (const chunkId of neededChunks) {
      if (this.topologyChunks.has(chunkId)) continue;

      this.topologyChunks.set(chunkId, {
        id: chunkId, status: "loading", data: null, score: 1,
      });
      this.loader.loadTopologyChunk(chunkId, (id, data) => {
        const chunk = this.topologyChunks.get(id);
        if (!chunk) return;
        chunk.data = data;
        chunk.status = "hot";
        this.emit("chunk-loaded", id);
      });
    }

    // Evict dynamically-loaded topology chunks no longer needed
    // (keep injected chunks — they were compiled client-side at no fetch cost)
    for (const [chunkId, chunk] of this.topologyChunks) {
      if (!neededChunks.has(chunkId) && !this.injectedChunkIds.has(chunkId) && chunk.status !== "loading") {
        this.loader.cancelTopologyChunk(chunkId);
        this.topologyChunks.delete(chunkId);
      }
    }
  }

  // ── Direct injection (client-side compilation) ─────────────────

  /** Inject a tile directly into the cache as hot. Skips HTTP fetch.
   *  Enables local mode (disables eviction) since all data is in-memory. */
  injectTile(tileId: string, data: SpatialTile): void {
    this._allLocal = true;
    this.spatialTiles.set(tileId, {
      id: tileId,
      status: "hot",
      data,
      score: 1,
      lastScored: performance.now(),
      instanceOffset: 0,
      instanceCount: data.entities.length,
    });
    this._generation++;
    this.emit("tile-loaded", tileId);
  }

  /** Inject a topology chunk directly into the cache as hot. */
  injectTopologyChunk(chunkId: string, data: TopologyChunk): void {
    this.topologyChunks.set(chunkId, {
      id: chunkId,
      status: "hot",
      data,
      score: 1,
    });
    this.injectedChunkIds.add(chunkId);
    this._generation++;
    this.emit("chunk-loaded", chunkId);
  }

  // ── Transition support ────────────────────────────────────────

  /** Freeze eviction for a duration (ms) to prevent holes during transitions. */
  freezeEviction(durationMs: number): void {
    this.evictionFrozen = true;
    this.evictionFreezeUntil = performance.now() + durationMs;
  }

  private isEvictionFrozen(now: number): boolean {
    if (!this.evictionFrozen) return false;
    if (now > this.evictionFreezeUntil) {
      this.evictionFrozen = false;
      return false;
    }
    return true;
  }

  // ── Accessors ─────────────────────────────────────────────────

  hotTiles(): ResidentTile[] {
    const result: ResidentTile[] = [];
    for (const tile of this.spatialTiles.values()) {
      if (tile.status === "hot" && tile.data) result.push(tile);
    }
    return result;
  }

  allResidentTiles(): ResidentTile[] {
    return [...this.spatialTiles.values()].filter(t => t.data != null);
  }

  allResidentTopologyChunks(): ResidentTopologyChunk[] {
    return [...this.topologyChunks.values()].filter(c => c.data != null);
  }

  hotTopologyChunks(): ResidentTopologyChunk[] {
    const result: ResidentTopologyChunk[] = [];
    for (const chunk of this.topologyChunks.values()) {
      if (chunk.status === "hot" && chunk.data) result.push(chunk);
    }
    return result;
  }

  getTile(tileId: string): ResidentTile | undefined {
    return this.spatialTiles.get(tileId);
  }

  getTopologyChunk(chunkId: string): ResidentTopologyChunk | undefined {
    return this.topologyChunks.get(chunkId);
  }

  get stats() {
    let hot = 0, warm = 0, cold = 0, loading = 0;
    for (const tile of this.spatialTiles.values()) {
      switch (tile.status) {
        case "hot": hot++; break;
        case "warm": warm++; break;
        case "cold": cold++; break;
        case "loading": loading++; break;
      }
    }
    return { hot, warm, cold, loading, total: this.spatialTiles.size };
  }

  // ── Events ────────────────────────────────────────────────────

  subscribe(listener: TileCacheListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TileCacheEvent, id: string): void {
    for (const listener of this.listeners) {
      listener(event, id);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────

  dispose(): void {
    this.loader.dispose();
    this.spatialTiles.clear();
    this.topologyChunks.clear();
    this.listeners.clear();
  }
}
