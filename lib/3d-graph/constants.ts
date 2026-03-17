import * as THREE from "three";

// ── Golden ratio constants ──────────────────────────────────────────
export const PHI = 1.618033988749895;
export const PHI2 = PHI * PHI; // 2.618
export const INV_PHI = 1 / PHI; // 0.618

// Reference k: optimal spacing at N=100, R=400 — anchors all scale-dependent quantities
export const K_REF = 0.8 * Math.cbrt((4 / 3) * Math.PI * 400 ** 3 / 100);

// ── Shared Geometry Pool ──────────────────────────────────────────────
// All nodes share from 6 unit-size geometries. Size is encoded in mesh.scale.
// This eliminates ~1200 geometry buffer uploads → 6 shared instances.
export const SHARED_GEO = {
  sphereHi:  new THREE.SphereGeometry(1, 20, 14),
  sphereLo:  new THREE.SphereGeometry(1, 8, 6),
  octaHi:    new THREE.OctahedronGeometry(1, 2),
  octaLo:    new THREE.OctahedronGeometry(1, 0),
  haloHi:    new THREE.SphereGeometry(1, 16, 12),
  haloLo:    new THREE.SphereGeometry(1, 8, 6),
};

// Entity node color palette (distinct from memory TYPE_COLORS)
export const ENTITY_COLORS: Record<string, string> = {
  person: "#6b7280",
  organization: "#4b5563",
  location: "#374151",
  concept: "#4a6fa5",
  technology: "#5b8db8",
  event: "#7c8daa",
};
export const DEFAULT_ENTITY_COLOR = "#6b7280";

// ── Unified Dynamic Spatialization System ──────────────────────────────
export interface UnifiedVizConfig {
  // Forces
  gravityBase: number; heroBoost: number; chargeFactor: number;
  linkDistFactor: number; linkStrength: number; distMaxFactor: number;
  // Camera
  cameraFitMargin: number; orbitSpeedBase: number;
  zoomMinFactor: number; zoomMaxFactor: number;
  // Node sizing
  nodeSizeBase: number; nodeSizeBoost: number;
  // Edge rendering
  edgeWidthBase: number; edgeWidthRange: number;
  edgeOpacityBase: number; edgeOpacityRange: number;
  // Simulation
  warmupTicks: number; cooldownTime: number;
  alphaDecay: number; velocityDecay: number;
  // LOD thresholds (multiples of normalized zoom)
  lodFarThreshold: number; lodCloseThreshold: number;
}

export const VIZ_CONFIGS: Record<"hero" | "cluster" | "zero", UnifiedVizConfig> = {
  hero: {
    gravityBase: 0.01, heroBoost: 0.02, chargeFactor: 7.0,
    linkDistFactor: PHI2, linkStrength: 0.15, distMaxFactor: 10.0,
    cameraFitMargin: PHI, orbitSpeedBase: 0.003,
    zoomMinFactor: 0.3, zoomMaxFactor: 1.5,
    nodeSizeBase: 7.0, nodeSizeBoost: 8.0,
    edgeWidthBase: 0.75, edgeWidthRange: 7.5,
    edgeOpacityBase: 0.12, edgeOpacityRange: 0.5,
    warmupTicks: 10, cooldownTime: 2500, alphaDecay: 0.035, velocityDecay: 0.35,
    lodFarThreshold: 3.0, lodCloseThreshold: INV_PHI,
  },
  cluster: {
    gravityBase: 0.003, heroBoost: 0.0, chargeFactor: 7.0,
    linkDistFactor: PHI2 * 2, linkStrength: 0.06, distMaxFactor: 12.0,
    cameraFitMargin: PHI, orbitSpeedBase: 0.002,
    zoomMinFactor: 0.3, zoomMaxFactor: 1.5,
    nodeSizeBase: 7.0, nodeSizeBoost: 5.0,
    edgeWidthBase: 0.75, edgeWidthRange: 7.5,
    edgeOpacityBase: 0.10, edgeOpacityRange: 0.6,
    warmupTicks: 10, cooldownTime: 2500, alphaDecay: 0.035, velocityDecay: 0.35,
    lodFarThreshold: 3.0, lodCloseThreshold: INV_PHI,
  },
  zero: {
    gravityBase: 0.006, heroBoost: 0.0, chargeFactor: 7.0,
    linkDistFactor: PHI, linkStrength: 0.1, distMaxFactor: 10.0,
    cameraFitMargin: PHI, orbitSpeedBase: 0.0025,
    zoomMinFactor: 0.3, zoomMaxFactor: 1.5,
    nodeSizeBase: 7.0, nodeSizeBoost: 6.0,
    edgeWidthBase: 0.70, edgeWidthRange: 7.5,
    edgeOpacityBase: 0.10, edgeOpacityRange: 0.5,
    warmupTicks: 10, cooldownTime: 2500, alphaDecay: 0.035, velocityDecay: 0.35,
    lodFarThreshold: 3.0, lodCloseThreshold: INV_PHI,
  },
};
