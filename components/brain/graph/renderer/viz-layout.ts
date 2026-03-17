// ── Viz Layout ──────────────────────────────────────────────────────
// Pure-function layout algorithms for hero and cluster viz modes.
// Returns Map<string, Vec3> of transformed positions.
// No Three.js dependency — operates on CanonicalEntity data only.

import type { CanonicalEntity, Vec3 } from "@/lib/3d-graph/compiler/types";
import type { FilterBag } from "@/lib/types";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ── Hero Layout ─────────────────────────────────────────────────────
// Hero node at origin. Others radiate outward by inverse score.
// Angular positions preserved from canonical coords for stability.

export function computeHeroLayout(
  memories: CanonicalEntity[],
  entities: CanonicalEntity[],
  degreeMap: Map<string, number>,
  maxDegree: number,
  maxAccessCount: number,
  filterBag: FilterBag,
  bubbleRadius: number,
): Map<string, Vec3> {
  const result = new Map<string, Vec3>();
  const all = [...memories, ...entities];
  const R = bubbleRadius;
  const { centerMode } = filterBag;
  const minR = R * 0.05;

  // 1. Score all nodes, find hero
  let heroId = "";
  let heroScore = -1;
  const scores = new Map<string, number>();

  for (const e of all) {
    const degScore = maxDegree > 0 ? (degreeMap.get(e.id) || 0) / maxDegree : 0;
    const retScore = maxAccessCount > 0 ? e.accessCount / maxAccessCount : 0;
    const score =
      centerMode === "retrieved" ? retScore
        : centerMode === "combined" ? Math.max(degScore, retScore)
        : degScore; // "reinforced"
    scores.set(e.id, score);
    if (score > heroScore) {
      heroScore = score;
      heroId = e.id;
    }
  }

  // 2. Place hero at origin
  result.set(heroId, { x: 0, y: 0, z: 0 });

  // 3. Others: keep angular position, radius from inverse score
  for (const e of all) {
    if (e.id === heroId) continue;
    const score = scores.get(e.id) || 0;
    const r = minR + (1 - score) * (R - minR);
    const sinTheta = Math.sin(e.canonical.theta);
    result.set(e.id, {
      x: r * sinTheta * Math.cos(e.canonical.phi),
      y: r * Math.cos(e.canonical.theta),
      z: r * sinTheta * Math.sin(e.canonical.phi),
    });
  }

  return result;
}

// ── Cluster Layout ──────────────────────────────────────────────────
// Nodes grouped into galaxy-like clusters. Each cluster gets a center
// on a macro-sphere, members distributed on micro-spheres around it.

export function computeClusterLayout(
  memories: CanonicalEntity[],
  entities: CanonicalEntity[],
  entityById: Map<string, CanonicalEntity>,
  bubbleRadius: number,
): Map<string, Vec3> {
  const result = new Map<string, Vec3>();
  const R = bubbleRadius;
  const all = [...memories, ...entities];

  // 1. Group nodes by level-1 cluster (walk up parentId chain)
  const clusterGroups = new Map<string, CanonicalEntity[]>();

  for (const e of all) {
    let clusterId = "unassigned";
    const parent = entityById.get(e.parentId || "");
    if (parent) {
      if (parent.hierarchyLevel === 2) {
        // Parent is subcluster → grandparent is cluster
        clusterId = parent.parentId || "unassigned";
      } else if (parent.hierarchyLevel === 1) {
        clusterId = parent.id;
      } else if (parent.hierarchyLevel === 0) {
        clusterId = parent.id;
      } else {
        clusterId = e.parentId || "unassigned";
      }
    } else {
      clusterId = e.parentId || "unassigned";
    }

    let group = clusterGroups.get(clusterId);
    if (!group) {
      group = [];
      clusterGroups.set(clusterId, group);
    }
    group.push(e);
  }

  // 2. Assign cluster centers on macro-sphere via Fibonacci
  const clusterIds = [...clusterGroups.keys()];
  const N = clusterIds.length;
  const macroR = R * 0.6;

  const clusterCenters = new Map<string, Vec3>();
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * i + 1) / N;
    const theta = Math.acos(Math.max(-1, Math.min(1, y)));
    const phi = ((GOLDEN_ANGLE * i) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const sinTheta = Math.sin(theta);
    clusterCenters.set(clusterIds[i], {
      x: macroR * sinTheta * Math.cos(phi),
      y: macroR * Math.cos(theta),
      z: macroR * sinTheta * Math.sin(phi),
    });
  }

  // 3. Distribute nodes within each cluster's micro-sphere
  for (const [clusterId, members] of clusterGroups) {
    const center = clusterCenters.get(clusterId)!;
    const microR = Math.max(R * 0.05, Math.sqrt(members.length) * R * 0.04);
    const M = members.length;

    for (let i = 0; i < M; i++) {
      const e = members[i];
      const y = M > 1 ? 1 - (2 * i + 1) / M : 0;
      const theta = Math.acos(Math.max(-1, Math.min(1, y)));
      const phi = ((GOLDEN_ANGLE * i) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const r = microR * (0.3 + 0.7 * e.importance);
      const sinTheta = Math.sin(theta);
      result.set(e.id, {
        x: center.x + r * sinTheta * Math.cos(phi),
        y: center.y + r * Math.cos(theta),
        z: center.z + r * sinTheta * Math.sin(phi),
      });
    }
  }

  return result;
}
