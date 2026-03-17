// ── Graph Clustering ────────────────────────────────────────────────
// Louvain-style modularity maximization producing a multilevel hierarchy.
// Level 0: superclusters, Level 1: clusters, Level 2: subclusters, Level 3: raw nodes.

import type { RawGraphData, RawEdge, CompilerConfig } from "./types";

interface ClusterNode {
  id: string;
  clusterId: string;
  importance: number;
}

interface ClusterResult {
  /** For each raw node id, the cluster path: [supercluster, cluster, subcluster] */
  assignments: Map<string, string[]>;
  /** Cluster metadata keyed by cluster id */
  clusters: Map<string, {
    id: string;
    level: number;
    parentId: string | null;
    childrenIds: string[];
    nodeCount: number;
    edgeCount: number;
    anchor: string; // highest-importance node in this cluster
  }>;
}

// ── Modularity-based community detection ────────────────────────────

function buildAdjacency(nodeIds: string[], edges: RawEdge[]): {
  neighbors: Map<string, Map<string, number>>;
  totalWeight: number;
  degrees: Map<string, number>;
} {
  const neighbors = new Map<string, Map<string, number>>();
  const degrees = new Map<string, number>();
  let totalWeight = 0;

  for (const id of nodeIds) {
    neighbors.set(id, new Map());
    degrees.set(id, 0);
  }

  for (const edge of edges) {
    if (!neighbors.has(edge.source) || !neighbors.has(edge.target)) continue;
    const w = edge.weight || 1;
    neighbors.get(edge.source)!.set(edge.target, (neighbors.get(edge.source)!.get(edge.target) || 0) + w);
    neighbors.get(edge.target)!.set(edge.source, (neighbors.get(edge.target)!.get(edge.source) || 0) + w);
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + w);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + w);
    totalWeight += w;
  }

  return { neighbors, totalWeight, degrees };
}

function louvainPass(
  nodeIds: string[],
  edges: RawEdge[],
): Map<string, string> {
  const { neighbors, totalWeight, degrees } = buildAdjacency(nodeIds, edges);
  if (totalWeight === 0) {
    // No edges: each node is its own community
    const assignment = new Map<string, string>();
    for (const id of nodeIds) assignment.set(id, id);
    return assignment;
  }

  const m2 = totalWeight * 2;

  // Initialize: each node in its own community
  const community = new Map<string, string>();
  for (const id of nodeIds) community.set(id, id);

  // Community internal weight sums
  const commSumIn = new Map<string, number>();
  const commSumTot = new Map<string, number>();
  for (const id of nodeIds) {
    commSumIn.set(id, 0);
    commSumTot.set(id, degrees.get(id) || 0);
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 20;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (const nodeId of nodeIds) {
      const nodeDeg = degrees.get(nodeId) || 0;
      const currentComm = community.get(nodeId)!;

      // Compute weight to each neighboring community
      const commWeights = new Map<string, number>();
      const nodeNeighbors = neighbors.get(nodeId)!;
      for (const [neighbor, w] of nodeNeighbors) {
        const nc = community.get(neighbor)!;
        commWeights.set(nc, (commWeights.get(nc) || 0) + w);
      }

      // Weight to own community
      const wToCurrent = commWeights.get(currentComm) || 0;

      // Try removing node from current community
      let bestComm = currentComm;
      let bestDeltaQ = 0;

      const currentSumTot = commSumTot.get(currentComm)! - nodeDeg;

      for (const [candidateComm, wToCandidate] of commWeights) {
        if (candidateComm === currentComm) continue;

        const candidateSumTot = commSumTot.get(candidateComm)!;

        // Modularity gain from moving to candidateComm
        const deltaQ =
          (wToCandidate - wToCurrent) / m2 -
          nodeDeg * (candidateSumTot - currentSumTot) / (m2 * m2);

        if (deltaQ > bestDeltaQ) {
          bestDeltaQ = deltaQ;
          bestComm = candidateComm;
        }
      }

      if (bestComm !== currentComm) {
        // Move node
        commSumTot.set(currentComm, (commSumTot.get(currentComm) || 0) - nodeDeg);
        commSumIn.set(currentComm, (commSumIn.get(currentComm) || 0) - 2 * wToCurrent);
        commSumTot.set(bestComm, (commSumTot.get(bestComm) || 0) + nodeDeg);
        const wToBest = commWeights.get(bestComm) || 0;
        commSumIn.set(bestComm, (commSumIn.get(bestComm) || 0) + 2 * wToBest);
        community.set(nodeId, bestComm);
        improved = true;
      }
    }
  }

  return community;
}

function mergeSmallClusters(
  assignment: Map<string, string>,
  edges: RawEdge[],
  minSize: number,
): Map<string, string> {
  // Count nodes per cluster
  const clusterCounts = new Map<string, number>();
  for (const comm of assignment.values()) {
    clusterCounts.set(comm, (clusterCounts.get(comm) || 0) + 1);
  }

  // For small clusters, merge into the neighbor cluster with most connections
  const small = new Set<string>();
  for (const [comm, count] of clusterCounts) {
    if (count < minSize) small.add(comm);
  }

  if (small.size === 0) return assignment;

  const result = new Map(assignment);

  for (const nodeId of result.keys()) {
    const comm = result.get(nodeId)!;
    if (!small.has(comm)) continue;

    // Find best neighbor cluster
    const neighborClusters = new Map<string, number>();
    for (const edge of edges) {
      let neighborId: string | null = null;
      if (edge.source === nodeId) neighborId = edge.target;
      else if (edge.target === nodeId) neighborId = edge.source;
      if (!neighborId) continue;
      const nc = result.get(neighborId);
      if (!nc || small.has(nc)) continue;
      neighborClusters.set(nc, (neighborClusters.get(nc) || 0) + (edge.weight || 1));
    }

    if (neighborClusters.size > 0) {
      let bestCluster = "";
      let bestWeight = -1;
      for (const [c, w] of neighborClusters) {
        if (w > bestWeight) { bestWeight = w; bestCluster = c; }
      }
      result.set(nodeId, bestCluster);
    }
  }

  return result;
}

function splitLargeClusters(
  assignment: Map<string, string>,
  nodeImportance: Map<string, number>,
  edges: RawEdge[],
  maxSize: number,
): Map<string, string> {
  // Find large clusters
  const clusterMembers = new Map<string, string[]>();
  for (const [nodeId, comm] of assignment) {
    let members = clusterMembers.get(comm);
    if (!members) { members = []; clusterMembers.set(comm, members); }
    members.push(nodeId);
  }

  const result = new Map(assignment);

  for (const [comm, members] of clusterMembers) {
    if (members.length <= maxSize) continue;

    // Split by running Louvain on just this cluster's subgraph
    const memberSet = new Set(members);
    const subEdges = edges.filter(e => memberSet.has(e.source) && memberSet.has(e.target));
    const subAssignment = louvainPass(members, subEdges);

    // Relabel with unique ids
    let subIdx = 0;
    const labelMap = new Map<string, string>();
    for (const subComm of new Set(subAssignment.values())) {
      labelMap.set(subComm, `${comm}_sub${subIdx++}`);
    }

    for (const nodeId of members) {
      const subComm = subAssignment.get(nodeId)!;
      result.set(nodeId, labelMap.get(subComm)!);
    }
  }

  return result;
}

// ── Main entry point ────────────────────────────────────────────────

export function computeHierarchy(data: RawGraphData, config: CompilerConfig): ClusterResult {
  const nodeImportance = new Map<string, number>();
  for (const node of data.nodes) {
    nodeImportance.set(node.id, node.importance);
  }

  const nodeIds = data.nodes.map(n => n.id);

  // Level 3 → 2: raw nodes → subclusters
  let l2Raw = louvainPass(nodeIds, data.edges);
  l2Raw = mergeSmallClusters(l2Raw, data.edges, config.minClusterSize);
  l2Raw = splitLargeClusters(l2Raw, nodeImportance, data.edges, config.maxClusterSize);

  // Prefix subcluster IDs to avoid collisions with other levels
  const l2Assignment = new Map<string, string>();
  for (const [nodeId, comm] of l2Raw) {
    l2Assignment.set(nodeId, `sc2_${comm}`);
  }

  // Collect subcluster ids
  const subclusters = new Set(l2Assignment.values());

  // Level 2 → 1: subclusters → clusters (if enough subclusters)
  let l1Assignment = new Map<string, string>();
  if (subclusters.size > 12) {
    // Build a coarsened graph: subclusters as nodes, aggregate edges
    const subIds = [...subclusters];
    const subEdges = aggregateEdges(l2Assignment, data.edges);
    const l1Raw = louvainPass(subIds, subEdges);
    const l1Merged = mergeSmallClusters(l1Raw, subEdges, 2);
    // Prefix cluster IDs
    for (const [subId, comm] of l1Merged) {
      l1Assignment.set(subId, `cl1_${comm}`);
    }
  } else {
    // Each subcluster is its own cluster
    for (const sc of subclusters) l1Assignment.set(sc, `cl1_${sc}`);
  }

  // Level 1 → 0: clusters → superclusters (if enough clusters)
  const clusters = new Set(l1Assignment.values());
  let l0Assignment = new Map<string, string>();
  if (clusters.size > 8) {
    const clusterIds = [...clusters];
    // Build cluster-level edges
    const clusterEdgeMap = new Map<string, number>();
    for (const edge of data.edges) {
      const sc1 = l2Assignment.get(edge.source);
      const sc2 = l2Assignment.get(edge.target);
      if (!sc1 || !sc2 || sc1 === sc2) continue;
      const c1 = l1Assignment.get(sc1);
      const c2 = l1Assignment.get(sc2);
      if (!c1 || !c2 || c1 === c2) continue;
      const key = c1 < c2 ? `${c1}|${c2}` : `${c2}|${c1}`;
      clusterEdgeMap.set(key, (clusterEdgeMap.get(key) || 0) + (edge.weight || 1));
    }
    const clusterEdges: RawEdge[] = [];
    for (const [key, w] of clusterEdgeMap) {
      const [s, t] = key.split("|");
      clusterEdges.push({ source: s, target: t, weight: w, linkType: "aggregate" });
    }
    const l0Raw = louvainPass(clusterIds, clusterEdges);
    // Prefix supercluster IDs
    for (const [clusterId, comm] of l0Raw) {
      l0Assignment.set(clusterId, `sc0_${comm}`);
    }
  } else {
    for (const c of clusters) l0Assignment.set(c, "sc0_root");
  }

  // Build the full assignment path for each raw node
  const assignments = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    const subcluster = l2Assignment.get(nodeId)!;
    const cluster = l1Assignment.get(subcluster)!;
    const supercluster = l0Assignment.get(cluster)!;
    assignments.set(nodeId, [supercluster, cluster, subcluster]);
  }

  // Build cluster metadata
  const clusterMeta = new Map<string, {
    id: string; level: number; parentId: string | null;
    childrenIds: string[]; nodeCount: number; edgeCount: number; anchor: string;
  }>();

  // Superclusters (level 0)
  const superclusters = new Set(l0Assignment.values());
  for (const scId of superclusters) {
    const childClusters = [...l0Assignment.entries()].filter(([, v]) => v === scId).map(([k]) => k);
    // Count all raw nodes in this supercluster
    let nodeCount = 0;
    let bestImportance = -1;
    let anchor = "";
    for (const [nodeId, path] of assignments) {
      if (path[0] === scId) {
        nodeCount++;
        const imp = nodeImportance.get(nodeId) || 0;
        if (imp > bestImportance) { bestImportance = imp; anchor = nodeId; }
      }
    }
    const edgeCount = countEdgesInGroup(data.edges, nodeIds.filter(id => assignments.get(id)?.[0] === scId));
    clusterMeta.set(scId, {
      id: scId, level: 0, parentId: null,
      childrenIds: childClusters, nodeCount, edgeCount,
      anchor: anchor || childClusters[0] || scId,
    });
  }

  // Clusters (level 1) — iterate unique cluster IDs (values of l1Assignment)
  const uniqueClusterIds = new Set(l1Assignment.values());
  for (const clusterId of uniqueClusterIds) {
    // Find the supercluster this cluster belongs to
    const superclusterId = l0Assignment.get(clusterId) || "root";
    // Find subclusters that map to this cluster
    const actualChildren: string[] = [];
    for (const sc of subclusters) {
      if (l1Assignment.get(sc) === clusterId) actualChildren.push(sc);
    }
    let nodeCount = 0;
    let bestImportance = -1;
    let anchor = "";
    for (const [nodeId, path] of assignments) {
      if (path[1] === clusterId) {
        nodeCount++;
        const imp = nodeImportance.get(nodeId) || 0;
        if (imp > bestImportance) { bestImportance = imp; anchor = nodeId; }
      }
    }
    const edgeCount = countEdgesInGroup(data.edges, nodeIds.filter(id => assignments.get(id)?.[1] === clusterId));
    clusterMeta.set(clusterId, {
      id: clusterId, level: 1, parentId: superclusterId,
      childrenIds: actualChildren, nodeCount, edgeCount,
      anchor: anchor || clusterId,
    });
  }

  // Subclusters (level 2)
  for (const subclusterId of subclusters) {
    const clusterId = l1Assignment.get(subclusterId)!;
    const memberNodes = nodeIds.filter(id => l2Assignment.get(id) === subclusterId);
    let bestImportance = -1;
    let anchor = "";
    for (const nodeId of memberNodes) {
      const imp = nodeImportance.get(nodeId) || 0;
      if (imp > bestImportance) { bestImportance = imp; anchor = nodeId; }
    }
    const edgeCount = countEdgesInGroup(data.edges, memberNodes);
    clusterMeta.set(subclusterId, {
      id: subclusterId, level: 2, parentId: clusterId,
      childrenIds: memberNodes, nodeCount: memberNodes.length, edgeCount,
      anchor: anchor || memberNodes[0] || subclusterId,
    });
  }

  return { assignments, clusters: clusterMeta };
}

// ── Helpers ─────────────────────────────────────────────────────────

function aggregateEdges(assignment: Map<string, string>, edges: RawEdge[]): RawEdge[] {
  const edgeMap = new Map<string, number>();
  for (const edge of edges) {
    const c1 = assignment.get(edge.source);
    const c2 = assignment.get(edge.target);
    if (!c1 || !c2 || c1 === c2) continue;
    const key = c1 < c2 ? `${c1}|${c2}` : `${c2}|${c1}`;
    edgeMap.set(key, (edgeMap.get(key) || 0) + (edge.weight || 1));
  }
  const result: RawEdge[] = [];
  for (const [key, w] of edgeMap) {
    const [s, t] = key.split("|");
    result.push({ source: s, target: t, weight: w, linkType: "aggregate" });
  }
  return result;
}

function countEdgesInGroup(edges: RawEdge[], nodeIds: string[]): number {
  const set = new Set(nodeIds);
  let count = 0;
  for (const edge of edges) {
    if (set.has(edge.source) && set.has(edge.target)) count++;
  }
  return count;
}
