// ── Tile Loader ─────────────────────────────────────────────────────
// Async tile fetcher with AbortController cancellation.
// Tiles that leave the view before loading completes are cancelled.

import type { SpatialTile, TopologyChunk } from "../compiler/types";

export type LoadCallback<T> = (id: string, data: T) => void;
export type ErrorCallback = (id: string, error: Error) => void;

export class TileLoader {
  private inflight = new Map<string, AbortController>();
  private baseUrl: string;

  constructor(baseUrl = "/api/graph/tiles") {
    this.baseUrl = baseUrl;
  }

  // ── Spatial tile loading ──────────────────────────────────────

  loadTile(
    tileId: string,
    onLoad: LoadCallback<SpatialTile>,
    onError?: ErrorCallback,
  ): void {
    if (this.inflight.has(tileId)) return; // already loading

    const controller = new AbortController();
    this.inflight.set(tileId, controller);

    fetch(`${this.baseUrl}?id=${encodeURIComponent(tileId)}`, {
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`Tile fetch failed: ${res.status}`);
        return res.json() as Promise<SpatialTile>;
      })
      .then(data => {
        this.inflight.delete(tileId);
        onLoad(tileId, data);
      })
      .catch(err => {
        this.inflight.delete(tileId);
        if (err.name === "AbortError") return; // intentional cancel
        onError?.(tileId, err);
      });
  }

  // ── Topology chunk loading ────────────────────────────────────

  loadTopologyChunk(
    chunkId: string,
    onLoad: LoadCallback<TopologyChunk>,
    onError?: ErrorCallback,
  ): void {
    const key = `topo_${chunkId}`;
    if (this.inflight.has(key)) return;

    const controller = new AbortController();
    this.inflight.set(key, controller);

    fetch(`${this.baseUrl}?chunkId=${encodeURIComponent(chunkId)}`, {
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`Chunk fetch failed: ${res.status}`);
        return res.json() as Promise<TopologyChunk>;
      })
      .then(data => {
        this.inflight.delete(key);
        onLoad(chunkId, data);
      })
      .catch(err => {
        this.inflight.delete(key);
        if (err.name === "AbortError") return;
        onError?.(chunkId, err);
      });
  }

  // ── Cancellation ──────────────────────────────────────────────

  cancelTile(tileId: string): void {
    const controller = this.inflight.get(tileId);
    if (controller) {
      controller.abort();
      this.inflight.delete(tileId);
    }
  }

  cancelTopologyChunk(chunkId: string): void {
    const key = `topo_${chunkId}`;
    const controller = this.inflight.get(key);
    if (controller) {
      controller.abort();
      this.inflight.delete(key);
    }
  }

  cancelAll(): void {
    for (const controller of this.inflight.values()) {
      controller.abort();
    }
    this.inflight.clear();
  }

  isLoading(tileId: string): boolean {
    return this.inflight.has(tileId);
  }

  get pendingCount(): number {
    return this.inflight.size;
  }

  dispose(): void {
    this.cancelAll();
  }
}
