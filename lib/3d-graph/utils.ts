import * as THREE from "three";
import { K_REF } from "./constants";
import type { UnifiedVizConfig } from "./constants";
import type { LODLevel } from "./types";

/** Hex color with alpha opacity. Preserves hue at any opacity. */
export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha)).toFixed(2)})`;
}

export function nodeRadius(val: number, modeScore: number, k: number, config: UnifiedVizConfig): number {
  return Math.cbrt(val) * (config.nodeSizeBase + modeScore * config.nodeSizeBoost) * (k / K_REF);
}

export function computeLOD(zoomLevel: number, config: UnifiedVizConfig): LODLevel {
  if (zoomLevel > config.lodFarThreshold) return "far";
  if (zoomLevel < config.lodCloseThreshold) return "close";
  return "mid";
}

export function adaptiveEdgeWidth(strength: number, zoomLevel: number, config: UnifiedVizConfig): number {
  return (config.edgeWidthBase + strength * config.edgeWidthRange) * Math.min(3, Math.max(0.5, zoomLevel));
}

export function adaptiveEdgeOpacity(strength: number, zoomLevel: number, config: UnifiedVizConfig): number {
  return (config.edgeOpacityBase + strength * config.edgeOpacityRange) * Math.min(1, Math.max(0.5, 1.5 - zoomLevel * 0.5));
}

export function adaptiveOrbitSpeed(zoomLevel: number, config: UnifiedVizConfig): number {
  return config.orbitSpeedBase / Math.max(0.3, zoomLevel);
}

/** K-nearest node centroid — stable local pivot for inside-sphere navigation. */
export function kNearestCentroid(point: THREE.Vector3, nodes: readonly any[], k: number): THREE.Vector3 {
  const dists: { n: any; d2: number }[] = [];
  for (const n of nodes) {
    if (!("x" in n)) continue;
    const dx = (n.x || 0) - point.x, dy = (n.y || 0) - point.y, dz = (n.z || 0) - point.z;
    dists.push({ n, d2: dx * dx + dy * dy + dz * dz });
  }
  dists.sort((a, b) => a.d2 - b.d2);
  const count = Math.min(k, dists.length);
  if (count === 0) return new THREE.Vector3();
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < count; i++) {
    sx += dists[i].n.x || 0; sy += dists[i].n.y || 0; sz += dists[i].n.z || 0;
  }
  return new THREE.Vector3(sx / count, sy / count, sz / count);
}

/** Find nearest node to a ray (Blender Auto Depth pattern). Returns null if nothing within maxPerp. */
export function nearestNodeToRay(
  origin: THREE.Vector3, dir: THREE.Vector3, nodes: readonly any[], maxPerp: number,
): { point: THREE.Vector3; dist: number } | null {
  let best: { point: THREE.Vector3; dist: number } | null = null;
  for (const n of nodes) {
    if (!("x" in n)) continue;
    const px = (n.x || 0) - origin.x, py = (n.y || 0) - origin.y, pz = (n.z || 0) - origin.z;
    const t = px * dir.x + py * dir.y + pz * dir.z;
    if (t < 0) continue;
    const cx = px - dir.x * t, cy = py - dir.y * t, cz = pz - dir.z * t;
    if (cx * cx + cy * cy + cz * cz > maxPerp * maxPerp) continue;
    if (!best || t < best.dist) {
      best = { point: new THREE.Vector3(n.x || 0, n.y || 0, n.z || 0), dist: t };
    }
  }
  return best;
}

/** Single source of truth for zoom bounds. */
export function computeZoomBounds(inSubView: boolean, baseDist: number, defaultDist: number): { min: number; max: number } {
  const MIN = 3;
  if (inSubView) return { min: MIN, max: Math.max(baseDist, defaultDist) * 1.5 };
  return { min: MIN, max: baseDist * 1.05 };
}
