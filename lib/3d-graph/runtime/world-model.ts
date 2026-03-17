// ── World Model ─────────────────────────────────────────────────────
// Holds the WorldManifest and provides spatial/topology queries.
// This is the graph equivalent of a tile map — read-only at runtime.

import type { WorldManifest, TileIndexEntry, SphericalBounds } from "../compiler/types";
import type { Vec3 } from "./types";

export class WorldModel {
  readonly manifest: WorldManifest;

  constructor(manifest: WorldManifest) {
    this.manifest = manifest;
  }

  get totalNodes(): number { return this.manifest.totalNodes; }
  get totalEdges(): number { return this.manifest.totalEdges; }
  get bubbleRadius(): number { return this.manifest.bubbleRadius; }
  get rootTileIds(): string[] { return this.manifest.rootTileIds; }

  // ── Tile queries ──────────────────────────────────────────────

  tileEntry(tileId: string): TileIndexEntry | undefined {
    return this.manifest.tileIndex[tileId];
  }

  parentTileId(tileId: string): string | null {
    return this.manifest.tileIndex[tileId]?.parentTileId ?? null;
  }

  childTileIds(tileId: string): string[] {
    return this.manifest.tileIndex[tileId]?.childTileIds ?? [];
  }

  allTileIds(): string[] {
    return Object.keys(this.manifest.tileIndex);
  }

  // ── Entity lookup ─────────────────────────────────────────────

  tileForEntity(entityId: string): string | undefined {
    return this.manifest.entityIndex[entityId]?.tileId;
  }

  hierarchyLevel(entityId: string): number | undefined {
    return this.manifest.entityIndex[entityId]?.hierarchyLevel;
  }

  // ── Topology chunk queries ────────────────────────────────────

  topologyChunkIds(): string[] {
    return Object.keys(this.manifest.topologyIndex);
  }

  neighborhoodChunkForEntity(entityId: string): string | undefined {
    const chunkId = `nbr_${entityId}`;
    return this.manifest.topologyIndex[chunkId] ? chunkId : undefined;
  }

  // ── Spatial queries ───────────────────────────────────────────

  /** Return tile IDs whose bounds intersect the given frustum sphere. */
  tilesInSphere(center: Vec3, radius: number): string[] {
    const results: string[] = [];
    for (const [tileId, entry] of Object.entries(this.manifest.tileIndex)) {
      if (sphereBoundsOverlap(center, radius, entry.bounds, this.manifest.bubbleRadius)) {
        results.push(tileId);
      }
    }
    return results;
  }

  /** Return tile IDs at a specific hierarchy level. */
  tilesAtLevel(level: number): string[] {
    return Object.entries(this.manifest.tileIndex)
      .filter(([id]) => {
        const parts = id.split("/");
        return parseInt(parts[0], 10) === level;
      })
      .map(([id]) => id);
  }

  /** All tile IDs along the ancestry path from entity to root. */
  ancestorTiles(entityId: string): string[] {
    const tileId = this.tileForEntity(entityId);
    if (!tileId) return [];

    const result: string[] = [tileId];
    let current = tileId;
    while (true) {
      const parent = this.parentTileId(current);
      if (!parent) break;
      result.push(parent);
      current = parent;
    }
    return result;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function sphereBoundsOverlap(
  center: Vec3,
  radius: number,
  bounds: SphericalBounds,
  bubbleRadius: number,
): boolean {
  // Convert spherical bounds to a bounding sphere for fast overlap test
  const midR = (bounds.rMin + bounds.rMax) / 2;
  const midTheta = (bounds.thetaMin + bounds.thetaMax) / 2;
  const midPhi = (bounds.phiMin + bounds.phiMax) / 2;

  const sinTheta = Math.sin(midTheta);
  const bx = midR * sinTheta * Math.cos(midPhi);
  const by = midR * Math.cos(midTheta);
  const bz = midR * sinTheta * Math.sin(midPhi);

  // Bounding sphere radius: max extent from center of tile
  const dr = (bounds.rMax - bounds.rMin) / 2;
  const angularExtent = Math.max(
    bounds.thetaMax - bounds.thetaMin,
    bounds.phiMax - bounds.phiMin,
  );
  const arcExtent = midR * angularExtent;
  const tileRadius = Math.sqrt(dr * dr + arcExtent * arcExtent);

  // Distance between sphere centers
  const dx = center.x - bx;
  const dy = center.y - by;
  const dz = center.z - bz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return dist < radius + tileRadius;
}
