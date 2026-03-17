// ── Viz Layout ──────────────────────────────────────────────────────
// Pure-function layout algorithms for hero and cluster viz modes.
// Returns Map<string, Vec3> of transformed positions.
// No Three.js dependency — operates on CanonicalEntity data only.

import type { CanonicalEntity, Vec3 } from "@/lib/3d-graph/compiler/types";
import type { FilterBag } from "@/lib/types";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ── Hero Layout ─────────────────────────────────────────────────────
// BFS Concentric Spheres: hero at origin, each BFS depth layer on a
// concentric spherical shell. Fibonacci distribution within each shell.
// Position = graph distance from hero. Investigative and beautiful.

export function computeHeroLayout(
  memories: CanonicalEntity[],
  entities: CanonicalEntity[],
  degreeMap: Map<string, number>,
  maxDegree: number,
  maxAccessCount: number,
  filterBag: FilterBag,
  bubbleRadius: number,
  adjacencyMap?: Map<string, Set<string>>,
): Map<string, Vec3> {
  const result = new Map<string, Vec3>();
  const all = [...memories, ...entities];
  const R = bubbleRadius;
  const { centerMode } = filterBag;

  // 1. Score all nodes, find hero
  let heroId = "";
  let heroScore = -1;
  for (const e of all) {
    const degScore = maxDegree > 0 ? (degreeMap.get(e.id) || 0) / maxDegree : 0;
    const retScore = maxAccessCount > 0 ? e.accessCount / maxAccessCount : 0;
    const score =
      centerMode === "retrieved" ? retScore
        : centerMode === "combined" ? Math.max(degScore, retScore)
        : degScore;
    if (score > heroScore) {
      heroScore = score;
      heroId = e.id;
    }
  }

  // 2. BFS from hero → assign depth to every node
  const depthMap = new Map<string, number>();
  const allIds = new Set(all.map(e => e.id));
  depthMap.set(heroId, 0);

  if (adjacencyMap && adjacencyMap.size > 0) {
    const queue: string[] = [heroId];
    let head = 0;
    while (head < queue.length) {
      const nodeId = queue[head++];
      const depth = depthMap.get(nodeId)!;
      const neighbors = adjacencyMap.get(nodeId);
      if (!neighbors) continue;
      for (const nbr of neighbors) {
        if (!depthMap.has(nbr) && allIds.has(nbr)) {
          depthMap.set(nbr, depth + 1);
          queue.push(nbr);
        }
      }
    }
  }

  // Disconnected nodes → outermost shell
  let maxDepth = 0;
  for (const d of depthMap.values()) { if (d > maxDepth) maxDepth = d; }
  const disconnectedDepth = maxDepth + 1;
  for (const e of all) {
    if (!depthMap.has(e.id)) depthMap.set(e.id, disconnectedDepth);
  }
  if (disconnectedDepth > maxDepth) maxDepth = disconnectedDepth;

  // 3. Group by depth, sort within each layer by degree (most connected first)
  const layers = new Map<number, CanonicalEntity[]>();
  for (const e of all) {
    const d = depthMap.get(e.id)!;
    let layer = layers.get(d);
    if (!layer) { layer = []; layers.set(d, layer); }
    layer.push(e);
  }
  for (const layer of layers.values()) {
    layer.sort((a, b) => (degreeMap.get(b.id) || 0) - (degreeMap.get(a.id) || 0));
  }

  // 4. Concentric sphere placement
  //    Shell radii: sqrt scaling gives inner shells breathing room
  const innerR = R * 0.06;   // smallest shell (depth 1)
  const outerR = R * 0.7;    // largest shell

  // Hero at exact origin
  result.set(heroId, { x: 0, y: 0, z: 0 });

  for (let depth = 1; depth <= maxDepth; depth++) {
    const layer = layers.get(depth);
    if (!layer || layer.length === 0) continue;

    // Shell radius: sqrt scaling for visual breathing room
    const t = maxDepth > 1 ? depth / maxDepth : 1;
    const shellR = innerR + Math.sqrt(t) * (outerR - innerR);

    // Fibonacci sphere distribution within this shell
    const N = layer.length;
    for (let i = 0; i < N; i++) {
      const e = layer[i];

      // Fibonacci sphere: even distribution on sphere surface
      const y = N > 1 ? 1 - (2 * i + 1) / N : 0;
      const theta = Math.acos(Math.max(-1, Math.min(1, y)));
      const phi = GOLDEN_ANGLE * i;
      const sinTheta = Math.sin(theta);

      result.set(e.id, {
        x: shellR * sinTheta * Math.cos(phi),
        y: shellR * Math.cos(theta),
        z: shellR * sinTheta * Math.sin(phi),
      });
    }
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
