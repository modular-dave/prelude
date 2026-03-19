// ── Viz Layout ──────────────────────────────────────────────────────
// Pure-function layout algorithms for hero, cluster, and starburst viz modes.
// Returns Map<string, Vec3> of transformed positions.
// No Three.js dependency — operates on CanonicalEntity data only.

import type { CanonicalEntity, Vec3 } from "@/lib/3d-graph/compiler/types";
import type { FilterBag } from "@/lib/types";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ── Hero Layout ─────────────────────────────────────────────────────
// Starburst: hero at origin, each BFS root-branch forms a radial spoke.
// Nodes in the same branch share one angular direction — depth determines
// how far along the spoke they sit. Disconnected nodes form ambient noise
// on the outermost shell via Fibonacci sphere. Cross-edges between spokes
// create visible inter-cluster links.

// Deterministic hash for sub-positioning within a branch
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function computeHeroLayout(
  memories: CanonicalEntity[],
  entities: CanonicalEntity[],
  degreeMap: Map<string, number>,
  maxDegree: number,
  maxAccessCount: number,
  filterBag: FilterBag,
  bubbleRadius: number,
  adjacencyMap?: Map<string, Set<string>>,
  diversityScoreMap?: Map<string, number>,
): Map<string, Vec3> {
  const result = new Map<string, Vec3>();
  const all = [...memories, ...entities];
  const R = bubbleRadius;
  const { centerMode, reorgMode } = filterBag;

  // 1. Score every node, find hero
  let heroId = "";
  let bestScore = -1;
  const nodeScores = new Map<string, number>();
  for (const e of all) {
    let score: number;
    if (reorgMode === "diversity" && diversityScoreMap) {
      score = diversityScoreMap.get(e.id) ?? 0;
    } else {
      const degScore = maxDegree > 0 ? (degreeMap.get(e.id) || 0) / maxDegree : 0;
      const retScore = maxAccessCount > 0 ? e.accessCount / maxAccessCount : 0;
      score =
        centerMode === "retrieved" ? retScore
          : centerMode === "combined" ? Math.max(degScore, retScore)
          : degScore;
    }
    nodeScores.set(e.id, score);
    if (score > bestScore) {
      bestScore = score;
      heroId = e.id;
    }
  }

  // 2. BFS from hero → depth, parent, root-branch per node
  const depthMap = new Map<string, number>();
  const rootBranch = new Map<string, string>(); // nodeId → depth-1 ancestor
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
          // Track root branch: depth-1 nodes are their own root
          rootBranch.set(nbr, depth === 0 ? nbr : rootBranch.get(nodeId)!);
          queue.push(nbr);
        }
      }
    }
  }

  // Disconnected → outermost shell
  let maxDepth = 0;
  for (const d of depthMap.values()) { if (d > maxDepth) maxDepth = d; }
  const disconnectedDepth = maxDepth + 1;
  for (const e of all) {
    if (!depthMap.has(e.id)) depthMap.set(e.id, disconnectedDepth);
  }
  if (disconnectedDepth > maxDepth) maxDepth = disconnectedDepth;

  // 3. Assign each root branch a unit-vector direction from origin
  // Direction derived from branch ID hash — uniform, no pole bias
  const branchSize = new Map<string, number>();
  for (const [, branch] of rootBranch) {
    branchSize.set(branch, (branchSize.get(branch) || 0) + 1);
  }
  const branchIds = [...branchSize.keys()];

  // Each branch gets a direction that radiates outward in the view plane (XY)
  // with gentle Z depth variation. Camera looks along Z, so spreading in XY
  // creates visible spokes. Even angular spacing — no bias.
  const branchVec = new Map<string, [number, number, number]>(); // unit vector
  const B = branchIds.length;
  for (let i = 0; i < B; i++) {
    // Even angular spacing around the screen plane
    const angle = (2 * Math.PI * i) / B;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    // Gentle Z oscillation so it's not perfectly flat — adds 3D depth on rotation
    const z = 0.3 * Math.sin(angle * 3.7 + i * 0.5);
    // Normalize
    const len = Math.sqrt(x * x + y * y + z * z);
    branchVec.set(branchIds[i], [x / len, y / len, z / len]);
  }

  // 4. Place nodes — straight lines from hero to edge
  const outerR = R * 0.7;

  // Hero at exact origin
  result.set(heroId, { x: 0, y: 0, z: 0 });

  // Connected depth range (excluding disconnected shell)
  const connectedMaxDepth = Math.max(1, maxDepth - (disconnectedDepth <= maxDepth ? 0 : 1));

  for (const e of all) {
    if (e.id === heroId) continue;
    const depth = depthMap.get(e.id)!;
    const branch = rootBranch.get(e.id);

    if (branch && branchVec.has(branch)) {
      // ── Connected node: straight line along branch direction ──
      const [dx, dy, dz] = branchVec.get(branch)!;

      // Distance from hero: proportional to BFS depth
      const t = connectedMaxDepth > 0 ? depth / connectedMaxDepth : 1;
      const dist = t * outerR;

      // Perpendicular jitter so siblings at same depth don't overlap.
      // Scales with branch population — bigger branches spread wider.
      const h = idHash(e.id);
      const bSize = branchSize.get(branch) || 1;
      const jitter = outerR * 0.05 * Math.pow(bSize, 0.4);
      const jx = ((h % 1000) / 1000 - 0.5) * jitter;
      const jy = (((h >> 10) % 1000) / 1000 - 0.5) * jitter;
      const jz = (((h >> 20) % 1000) / 1000 - 0.5) * jitter;

      result.set(e.id, {
        x: dx * dist + jx,
        y: dy * dist + jy,
        z: dz * dist + jz,
      });
    }
  }

  // ── Disconnected nodes: uniform shell via even sphere distribution ──
  const disconnected = all.filter(e => e.id !== heroId && !rootBranch.has(e.id));
  const M = disconnected.length;
  if (M > 0) {
    for (let i = 0; i < M; i++) {
      const e = disconnected[i];
      const y = M > 1 ? 1 - (2 * i + 1) / M : 0;
      const theta = Math.acos(Math.max(-1, Math.min(1, y)));
      const phi = GOLDEN_ANGLE * i;
      const sinT = Math.sin(theta);
      const dist = outerR * 0.9;
      result.set(e.id, {
        x: sinT * Math.cos(phi) * dist,
        y: Math.cos(theta) * dist,
        z: sinT * Math.sin(phi) * dist,
      });
    }
  }

  // 5. Per-spoke minimum distance — space nodes along each line
  // Keeps nodes exactly on their spoke, just pushes them outward if too close.
  const minDist = R * 0.035;

  for (const [branch, dir] of branchVec) {
    const [dx, dy, dz] = dir;
    // Collect nodes on this spoke with their projected distance along the line
    const spokeNodes: { id: string; dist: number; jx: number; jy: number; jz: number }[] = [];
    for (const e of all) {
      if (rootBranch.get(e.id) !== branch) continue;
      const p = result.get(e.id);
      if (!p) continue;
      // Project position onto spoke direction to get radial distance
      const projDist = p.x * dx + p.y * dy + p.z * dz;
      // Perpendicular offset (jitter component)
      const jx = p.x - dx * projDist;
      const jy = p.y - dy * projDist;
      const jz = p.z - dz * projDist;
      spokeNodes.push({ id: e.id, dist: projDist, jx, jy, jz });
    }

    // Sort by distance from hero
    spokeNodes.sort((a, b) => a.dist - b.dist);

    // Enforce minimum spacing along the spoke
    for (let i = 1; i < spokeNodes.length; i++) {
      const gap = spokeNodes[i].dist - spokeNodes[i - 1].dist;
      if (gap < minDist) {
        spokeNodes[i].dist = spokeNodes[i - 1].dist + minDist;
      }
    }

    // Write back: spoke direction × adjusted distance + original perpendicular jitter
    for (const n of spokeNodes) {
      result.set(n.id, {
        x: dx * n.dist + n.jx,
        y: dy * n.dist + n.jy,
        z: dz * n.dist + n.jz,
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
  filterBag?: FilterBag,
  diversityScoreMap?: Map<string, number>,
  degreeMap?: Map<string, number>,
  maxDegree?: number,
  maxAccessCount?: number,
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
  const reorgMode = filterBag?.reorgMode ?? "count";
  const centerMode = filterBag?.centerMode ?? "combined";

  for (const [clusterId, members] of clusterGroups) {
    const center = clusterCenters.get(clusterId)!;
    const microR = Math.max(R * 0.05, Math.sqrt(members.length) * R * 0.04);

    // Find local hero per cluster (most important by active scoring)
    let localHeroId = members[0].id;
    let bestScore = -1;
    for (const e of members) {
      let score: number;
      if (reorgMode === "diversity" && diversityScoreMap) {
        score = diversityScoreMap.get(e.id) ?? 0;
      } else if (degreeMap && maxDegree && maxAccessCount) {
        const deg = maxDegree > 0 ? (degreeMap.get(e.id) || 0) / maxDegree : 0;
        const ret = maxAccessCount > 0 ? e.accessCount / maxAccessCount : 0;
        score = centerMode === "retrieved" ? ret
          : centerMode === "combined" ? Math.max(deg, ret)
          : deg;
      } else {
        score = e.importance;
      }
      if (score > bestScore) { bestScore = score; localHeroId = e.id; }
    }

    // Place local hero at cluster center
    result.set(localHeroId, { x: center.x, y: center.y, z: center.z });

    // Other members on micro-sphere
    const others = members.filter(e => e.id !== localHeroId);
    const M = others.length;
    for (let i = 0; i < M; i++) {
      const e = others[i];
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

// ── Starburst Layout ────────────────────────────────────────────────
// Hybrid: clusters on a macro-sphere (like cluster mode), but each
// cluster gets its own local hero with BFS spoke layout internally
// instead of a uniform micro-sphere.

export function computeStarburstLayout(
  memories: CanonicalEntity[],
  entities: CanonicalEntity[],
  entityById: Map<string, CanonicalEntity>,
  degreeMap: Map<string, number>,
  maxDegree: number,
  maxAccessCount: number,
  filterBag: FilterBag,
  bubbleRadius: number,
  adjacencyMap?: Map<string, Set<string>>,
  diversityScoreMap?: Map<string, number>,
): Map<string, Vec3> {
  const result = new Map<string, Vec3>();
  const R = bubbleRadius;
  const all = [...memories, ...entities];
  const { centerMode, reorgMode } = filterBag;

  // 1. Group nodes by level-1 cluster (same as cluster layout)
  const clusterGroups = new Map<string, CanonicalEntity[]>();
  for (const e of all) {
    let clusterId = "unassigned";
    const parent = entityById.get(e.parentId || "");
    if (parent) {
      if (parent.hierarchyLevel === 2) {
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
    if (!group) { group = []; clusterGroups.set(clusterId, group); }
    group.push(e);
  }

  // 2. Place cluster centers on macro-sphere via Fibonacci
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

  // 3. Per-cluster: BFS starburst layout around local hero
  for (const [clusterId, members] of clusterGroups) {
    const center = clusterCenters.get(clusterId)!;
    const microR = Math.max(R * 0.12, Math.sqrt(members.length) * R * 0.07);
    const memberIds = new Set(members.map(e => e.id));

    // Build local adjacency + degree within cluster
    const localDeg = new Map<string, number>();
    const localAdj = new Map<string, Set<string>>();
    if (adjacencyMap) {
      for (const id of memberIds) {
        const neighbors = adjacencyMap.get(id);
        if (!neighbors) continue;
        for (const nbr of neighbors) {
          if (!memberIds.has(nbr)) continue;
          localDeg.set(id, (localDeg.get(id) || 0) + 1);
          let s = localAdj.get(id);
          if (!s) { s = new Set(); localAdj.set(id, s); }
          s.add(nbr);
        }
      }
    }

    // Find local hero (highest local degree or diversity, break ties with accessCount)
    let heroId = members[0].id;
    let bestScore = -1;
    const localMaxDeg = localDeg.size > 0 ? Math.max(...localDeg.values()) : 1;
    for (const e of members) {
      let score: number;
      if (reorgMode === "diversity" && diversityScoreMap) {
        score = diversityScoreMap.get(e.id) ?? 0;
      } else {
        const deg = localDeg.get(e.id) || 0;
        const degScore = localMaxDeg > 0 ? deg / localMaxDeg : 0;
        const retScore = maxAccessCount > 0 ? e.accessCount / maxAccessCount : 0;
        score =
          centerMode === "retrieved" ? retScore
            : centerMode === "combined" ? Math.max(degScore, retScore)
            : degScore;
      }
      if (score > bestScore) { bestScore = score; heroId = e.id; }
    }

    // Single-node cluster: place at center
    if (members.length === 1) {
      result.set(members[0].id, { x: center.x, y: center.y, z: center.z });
      continue;
    }

    // BFS from local hero
    const depthMap = new Map<string, number>();
    const rootBranch = new Map<string, string>();
    depthMap.set(heroId, 0);

    if (localAdj.size > 0) {
      const queue: string[] = [heroId];
      let head = 0;
      while (head < queue.length) {
        const nodeId = queue[head++];
        const depth = depthMap.get(nodeId)!;
        const neighbors = localAdj.get(nodeId);
        if (!neighbors) continue;
        for (const nbr of neighbors) {
          if (!depthMap.has(nbr)) {
            depthMap.set(nbr, depth + 1);
            rootBranch.set(nbr, depth === 0 ? nbr : rootBranch.get(nodeId)!);
            queue.push(nbr);
          }
        }
      }
    }

    // Disconnected members within cluster
    let maxDepth = 0;
    for (const d of depthMap.values()) { if (d > maxDepth) maxDepth = d; }
    const disconnectedDepth = maxDepth + 1;
    for (const e of members) {
      if (!depthMap.has(e.id)) depthMap.set(e.id, disconnectedDepth);
    }
    if (disconnectedDepth > maxDepth) maxDepth = disconnectedDepth;

    // Branch directions — even angular spacing in XY with Z variation
    const branchSize = new Map<string, number>();
    for (const [, branch] of rootBranch) {
      branchSize.set(branch, (branchSize.get(branch) || 0) + 1);
    }
    const branchIds = [...branchSize.keys()];
    const branchVec = new Map<string, [number, number, number]>();
    const B = branchIds.length;
    for (let i = 0; i < B; i++) {
      const angle = (2 * Math.PI * i) / B;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      const z = 0.3 * Math.sin(angle * 3.7 + i * 0.5);
      const len = Math.sqrt(x * x + y * y + z * z);
      branchVec.set(branchIds[i], [x / len, y / len, z / len]);
    }

    // Place hero at cluster center
    result.set(heroId, { x: center.x, y: center.y, z: center.z });

    // Place connected nodes along spokes
    const connectedMaxDepth = Math.max(1, maxDepth - (disconnectedDepth <= maxDepth ? 0 : 1));
    for (const e of members) {
      if (e.id === heroId) continue;
      const depth = depthMap.get(e.id)!;
      const branch = rootBranch.get(e.id);

      if (branch && branchVec.has(branch)) {
        const [dx, dy, dz] = branchVec.get(branch)!;
        const t = connectedMaxDepth > 0 ? depth / connectedMaxDepth : 1;
        const dist = t * microR;

        const h = idHash(e.id);
        const bSize = branchSize.get(branch) || 1;
        const jitter = microR * 0.08 * Math.pow(bSize, 0.4);
        const jx = ((h % 1000) / 1000 - 0.5) * jitter;
        const jy = (((h >> 10) % 1000) / 1000 - 0.5) * jitter;
        const jz = (((h >> 20) % 1000) / 1000 - 0.5) * jitter;

        result.set(e.id, {
          x: center.x + dx * dist + jx,
          y: center.y + dy * dist + jy,
          z: center.z + dz * dist + jz,
        });
      }
    }

    // Disconnected members: micro Fibonacci shell around cluster center
    const disconnected = members.filter(e => e.id !== heroId && !rootBranch.has(e.id));
    const M = disconnected.length;
    if (M > 0) {
      for (let i = 0; i < M; i++) {
        const e = disconnected[i];
        const yy = M > 1 ? 1 - (2 * i + 1) / M : 0;
        const theta = Math.acos(Math.max(-1, Math.min(1, yy)));
        const phi = GOLDEN_ANGLE * i;
        const sinT = Math.sin(theta);
        const dist = microR * 0.9;
        result.set(e.id, {
          x: center.x + sinT * Math.cos(phi) * dist,
          y: center.y + Math.cos(theta) * dist,
          z: center.z + sinT * Math.sin(phi) * dist,
        });
      }
    }

    // Per-spoke minimum distance enforcement
    const minDist = microR * 0.1;
    for (const [branch, dir] of branchVec) {
      const [dx, dy, dz] = dir;
      const spokeNodes: { id: string; dist: number; jx: number; jy: number; jz: number }[] = [];
      for (const e of members) {
        if (rootBranch.get(e.id) !== branch) continue;
        const p = result.get(e.id);
        if (!p) continue;
        const rx = p.x - center.x, ry = p.y - center.y, rz = p.z - center.z;
        const projDist = rx * dx + ry * dy + rz * dz;
        spokeNodes.push({
          id: e.id,
          dist: projDist,
          jx: rx - dx * projDist,
          jy: ry - dy * projDist,
          jz: rz - dz * projDist,
        });
      }
      spokeNodes.sort((a, b) => a.dist - b.dist);
      for (let i = 1; i < spokeNodes.length; i++) {
        if (spokeNodes[i].dist - spokeNodes[i - 1].dist < minDist) {
          spokeNodes[i].dist = spokeNodes[i - 1].dist + minDist;
        }
      }
      for (const n of spokeNodes) {
        result.set(n.id, {
          x: center.x + dx * n.dist + n.jx,
          y: center.y + dy * n.dist + n.jy,
          z: center.z + dz * n.dist + n.jz,
        });
      }
    }
  }

  return result;
}

// ── Zero-G Layout ───────────────────────────────────────────────────
// Temporal sphere: oldest memory at center, newest at edge.
// Radial distance derived from numericId (sequential DB ID = creation
// order proxy). Falls back to decayFactor, then importance.
// Angular position via Fibonacci sphere — decoupled from age so
// same-age nodes scatter across the sphere.

export function computeZeroGLayout(
  memories: CanonicalEntity[],
  entities: CanonicalEntity[],
  bubbleRadius: number,
  filterBag?: FilterBag,
  diversityScoreMap?: Map<string, number>,
  degreeMap?: Map<string, number>,
  maxDegree?: number,
  maxAccessCount?: number,
): Map<string, Vec3> {
  const result = new Map<string, Vec3>();
  const R = bubbleRadius;
  const all = [...memories, ...entities];
  const N = all.length;

  if (N === 0) return result;

  const reorgMode = filterBag?.reorgMode ?? "count";
  const centerMode = filterBag?.centerMode ?? "combined";

  // Compute temporal value per node: numericId (creation order proxy)
  // Entities lack numericId — use importance as fallback
  let minT = Infinity, maxT = -Infinity;
  const temporalValues = new Map<string, number>();
  for (const e of all) {
    const t = e.numericId != null ? e.numericId : e.importance * 1000;
    temporalValues.set(e.id, t);
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const rangeT = maxT - minT || 1;

  // Hero selection: score-based when reorgMode/centerMode are active, temporal fallback
  let heroId = all[0].id;
  let bestScore = -1;
  for (const e of all) {
    let score: number;
    if (reorgMode === "diversity" && diversityScoreMap) {
      score = diversityScoreMap.get(e.id) ?? 0;
    } else if (degreeMap && maxDegree && maxDegree > 0 && maxAccessCount != null) {
      const deg = (degreeMap.get(e.id) || 0) / maxDegree;
      const ret = maxAccessCount > 0 ? e.accessCount / maxAccessCount : 0;
      score = centerMode === "retrieved" ? ret
        : centerMode === "combined" ? Math.max(deg, ret)
        : deg;
    } else {
      // Fallback: oldest node (lowest temporal value)
      score = 1 - (temporalValues.get(e.id)! - minT) / rangeT;
    }
    if (score > bestScore) { bestScore = score; heroId = e.id; }
  }
  result.set(heroId, { x: 0, y: 0, z: 0 });

  // Place all other nodes: radius from temporal position, angle from Fibonacci
  const outerR = R * 0.7;
  let fi = 0;
  for (let i = 0; i < N; i++) {
    const e = all[i];
    if (e.id === heroId) continue;

    // Radial distance: normalized temporal value [0→center, 1→edge]
    // Cube-root mapping for uniform volume density (shell volume ∝ r²)
    const tNorm = (temporalValues.get(e.id)! - minT) / rangeT;
    const r = (0.05 + 0.95 * Math.cbrt(tNorm)) * outerR;

    // Fibonacci sphere angular distribution (index decoupled from age)
    const nonHeroCount = N - 1;
    const y = nonHeroCount > 1 ? 1 - (2 * fi + 1) / nonHeroCount : 0;
    const theta = Math.acos(Math.max(-1, Math.min(1, y)));
    const phi = GOLDEN_ANGLE * fi;
    const sinT = Math.sin(theta);

    result.set(e.id, {
      x: sinT * Math.cos(phi) * r,
      y: Math.cos(theta) * r,
      z: sinT * Math.sin(phi) * r,
    });
    fi++;
  }

  return result;
}
