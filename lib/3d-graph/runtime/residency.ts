// ── Residency Scoring ───────────────────────────────────────────────
// One scoring function drives all tile loading decisions.
// Modes do not change the loader — modes only change the weights.

import type { ViewState, ResidencyWeights, Vec3 } from "./types";
import { LENS_WEIGHTS } from "./types";
import type { TileIndexEntry, SphericalBounds } from "../compiler/types";

export function scoreTile(
  tileId: string,
  entry: TileIndexEntry,
  viewState: ViewState,
  bubbleRadius: number,
): number {
  const weights = LENS_WEIGHTS[viewState.lens];

  const sv = spatialVisibility(entry.bounds, viewState.camera.position, viewState.camera.zoom, bubbleRadius);
  const fp = focusProximity(entry.bounds, viewState.focus.anchor, viewState.focus.radius, bubbleRadius);
  const sn = semanticNeed(tileId, entry, viewState);
  const tn = topologyNeed(tileId, entry, viewState);
  const mp = motionPrediction(entry.bounds, viewState.camera.position, viewState.camera.velocity, bubbleRadius);
  const lb = lensBias(tileId, entry, viewState);
  const mc = memoryCost(entry);

  return (
    weights.spatialVisibility * sv +
    weights.focusProximity * fp +
    weights.semanticNeed * sn +
    weights.topologyNeed * tn +
    weights.motionPrediction * mp +
    weights.lensBias * lb -
    weights.memoryCost * mc
  );
}

// ── Component functions ─────────────────────────────────────────────

function spatialVisibility(
  bounds: SphericalBounds,
  cameraPos: Vec3,
  zoom: number,
  bubbleRadius: number,
): number {
  const center = boundsCenter(bounds);
  const dist = distance(cameraPos, center);
  // Closer tiles score higher; zoom amplifies the effect
  const maxDist = bubbleRadius * 3;
  const normalizedDist = Math.min(1, dist / maxDist);
  return (1 - normalizedDist) * Math.min(2, zoom);
}

function focusProximity(
  bounds: SphericalBounds,
  focusAnchor: Vec3,
  focusRadius: number,
  bubbleRadius: number,
): number {
  const center = boundsCenter(bounds);
  const dist = distance(focusAnchor, center);
  if (dist < focusRadius) return 1.0;
  const falloff = Math.max(0, 1 - (dist - focusRadius) / bubbleRadius);
  return falloff * falloff; // quadratic falloff
}

function semanticNeed(
  tileId: string,
  entry: TileIndexEntry,
  viewState: ViewState,
): number {
  // Tiles at the desired hierarchy level get a boost
  const tileLevel = parseInt(tileId.split("/")[0], 10);
  const desiredLevel = viewState.focus.targetType === "global" ? 0
    : viewState.focus.targetType === "cluster" ? 1
    : 3;

  if (tileLevel === desiredLevel) return 1.0;
  if (Math.abs(tileLevel - desiredLevel) === 1) return 0.5;
  return 0.1;
}

function topologyNeed(
  tileId: string,
  entry: TileIndexEntry,
  viewState: ViewState,
): number {
  if (viewState.topology.mode === "global") return 0;

  // In single mode, tiles containing expanded nodes score high
  // This is a simplified check; full implementation would cross-reference entity index
  if (viewState.topology.expandedNodeIds.length > 0) return 0.5;
  if (viewState.topology.pinnedPathIds.length > 0) return 0.5;
  return 0;
}

function motionPrediction(
  bounds: SphericalBounds,
  cameraPos: Vec3,
  cameraVelocity: Vec3,
  bubbleRadius: number,
): number {
  // Predict where the camera will be in ~0.5s
  const predictedPos: Vec3 = {
    x: cameraPos.x + cameraVelocity.x * 30, // ~30 frames ahead
    y: cameraPos.y + cameraVelocity.y * 30,
    z: cameraPos.z + cameraVelocity.z * 30,
  };
  const center = boundsCenter(bounds);
  const dist = distance(predictedPos, center);
  const maxDist = bubbleRadius * 2;
  return Math.max(0, 1 - dist / maxDist);
}

function lensBias(
  tileId: string,
  entry: TileIndexEntry,
  viewState: ViewState,
): number {
  const tileLevel = parseInt(tileId.split("/")[0], 10);

  switch (viewState.lens) {
    case "hero":
      // Hero prefers coarse clusters + few exemplars
      return tileLevel <= 1 ? 1.0 : tileLevel === 2 ? 0.3 : 0.1;
    case "cluster":
      // Cluster prefers mid-level hierarchy
      return tileLevel === 1 ? 1.0 : tileLevel === 2 ? 0.8 : 0.3;
    case "zeroG":
      // ZeroG prefers whatever's in the frustum, all levels equal
      return 0.5;
  }
}

function memoryCost(entry: TileIndexEntry): number {
  // Rough estimate: ~100 bytes per entity
  const estimatedBytes = entry.entityCount * 100;
  return Math.min(1, estimatedBytes / (1024 * 1024)); // normalized to 1 MB
}

// ── Helpers ─────────────────────────────────────────────────────────

function boundsCenter(bounds: SphericalBounds): Vec3 {
  const r = (bounds.rMin + bounds.rMax) / 2;
  const theta = (bounds.thetaMin + bounds.thetaMax) / 2;
  const phi = (bounds.phiMin + bounds.phiMax) / 2;
  const sinTheta = Math.sin(theta);
  return {
    x: r * sinTheta * Math.cos(phi),
    y: r * Math.cos(theta),
    z: r * sinTheta * Math.sin(phi),
  };
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
