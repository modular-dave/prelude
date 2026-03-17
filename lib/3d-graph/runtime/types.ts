// ── Runtime Types ───────────────────────────────────────────────────
// Types for the runtime tile streaming and residency engine.

import type { SpatialTile, TopologyChunk, SphericalBounds, Vec3 } from "../compiler/types";

export type { Vec3, SphericalBounds } from "../compiler/types";

// ── View State ──────────────────────────────────────────────────────

export type Lens = "hero" | "cluster" | "zeroG";
export type TopologyMode = "global" | "single";
export type FocusType = "global" | "cluster" | "node" | "path";

export interface CameraView {
  position: Vec3;
  direction: Vec3;
  velocity: Vec3;
  zoom: number;
}

export interface FocusState {
  targetId?: string;
  targetType: FocusType;
  anchor: Vec3;
  radius: number;
}

export interface TopologyState {
  mode: TopologyMode;
  pathDepth: number;
  neighborhoodDepth: number;
  expandedNodeIds: string[];
  pinnedPathIds: string[];
}

export interface ViewState {
  camera: CameraView;
  focus: FocusState;
  topology: TopologyState;
  lens: Lens;
}

// ── Tile Residency ──────────────────────────────────────────────────

export type TileStatus = "cold" | "loading" | "warm" | "hot";

export interface ResidentTile {
  id: string;
  status: TileStatus;
  data: SpatialTile | null;
  score: number;
  lastScored: number;
  /** Offset into the InstancedMesh attribute arrays */
  instanceOffset: number;
  /** Number of entity instances this tile contributes */
  instanceCount: number;
}

export interface ResidentTopologyChunk {
  id: string;
  status: TileStatus;
  data: TopologyChunk | null;
  score: number;
}

export interface TileCacheConfig {
  maxHotTiles: number;
  maxWarmTiles: number;
  hotThreshold: number;
  coldThreshold: number;
  budgetBytes: number;
}

export const DEFAULT_CACHE_CONFIG: TileCacheConfig = {
  maxHotTiles: 64,
  maxWarmTiles: 128,
  hotThreshold: 0.5,
  coldThreshold: 0.1,
  budgetBytes: 64 * 1024 * 1024, // 64 MB
};

// ── Residency Scoring Weights ───────────────────────────────────────

export interface ResidencyWeights {
  spatialVisibility: number;
  focusProximity: number;
  semanticNeed: number;
  topologyNeed: number;
  motionPrediction: number;
  lensBias: number;
  memoryCost: number;
}

export const LENS_WEIGHTS: Record<Lens, ResidencyWeights> = {
  hero: {
    spatialVisibility: 0.2,
    focusProximity: 0.35,
    semanticNeed: 0.15,
    topologyNeed: 0.05,
    motionPrediction: 0.05,
    lensBias: 0.15,
    memoryCost: 0.05,
  },
  cluster: {
    spatialVisibility: 0.25,
    focusProximity: 0.25,
    semanticNeed: 0.2,
    topologyNeed: 0.1,
    motionPrediction: 0.05,
    lensBias: 0.1,
    memoryCost: 0.05,
  },
  zeroG: {
    spatialVisibility: 0.35,
    focusProximity: 0.1,
    semanticNeed: 0.05,
    topologyNeed: 0.05,
    motionPrediction: 0.25,
    lensBias: 0.1,
    memoryCost: 0.1,
  },
};

// ── Edge Classification ─────────────────────────────────────────────

export type EdgeClass = "aggregate" | "frontier" | "neighborhood" | "path-highlight";
