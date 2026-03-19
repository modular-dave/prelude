// ── Canonical Layout ────────────────────────────────────────────────
// Assigns stable spherical positions to every node using Fibonacci sphere
// distribution. Clusters occupy angular sectors; importance modulates
// radial placement within shells.

import type {
  CanonicalEntity, SphericalCoord, Vec3, DisplayOffsets,
  RawGraphData, CompilerConfig, ClusterStats, SphericalBounds,
} from "./types";

const PHI = 1.618033988749895;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.3999 rad

// ── Spherical ↔ Cartesian ───────────────────────────────────────────

export function sphericalToCartesian(s: SphericalCoord): Vec3 {
  const sinTheta = Math.sin(s.theta);
  return {
    x: s.r * sinTheta * Math.cos(s.phi),
    y: s.r * Math.cos(s.theta),
    z: s.r * sinTheta * Math.sin(s.phi),
  };
}

export function cartesianToSpherical(v: Vec3): SphericalCoord {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (r === 0) return { r: 0, theta: 0, phi: 0 };
  return {
    r,
    theta: Math.acos(Math.max(-1, Math.min(1, v.y / r))),
    phi: Math.atan2(v.z, v.x) + Math.PI, // [0, 2π)
  };
}

// ── Fibonacci sphere points ─────────────────────────────────────────
// Produces n evenly-spaced points on a unit sphere.

function fibonacciSpherePoint(index: number, total: number): { theta: number; phi: number } {
  // y goes from 1 - 1/n to -1 + 1/n
  const y = 1 - (2 * index + 1) / total;
  const theta = Math.acos(Math.max(-1, Math.min(1, y)));
  const phi = ((GOLDEN_ANGLE * index) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return { theta, phi };
}

// ── Shell definitions ───────────────────────────────────────────────
// Semantic shells: outer = global clusters, middle = subclusters, inner = raw nodes

interface ShellBand {
  level: number;     // hierarchy level this shell serves
  rMin: number;
  rMax: number;
  rCenter: number;
}

function computeShells(bubbleRadius: number): ShellBand[] {
  const R = bubbleRadius;
  return [
    // Level 0: superclusters — outer shell
    { level: 0, rMin: R * 0.85, rMax: R * 1.0, rCenter: R * 0.92 },
    // Level 1: clusters — upper-middle shell
    { level: 1, rMin: R * 0.60, rMax: R * 0.85, rCenter: R * 0.72 },
    // Level 2: subclusters — lower-middle shell
    { level: 2, rMin: R * 0.35, rMax: R * 0.60, rCenter: R * 0.47 },
    // Level 3: raw nodes — fill most of the sphere
    { level: 3, rMin: R * 0.15, rMax: R * 0.85, rCenter: R * 0.50 },
  ];
}

// ── Layout computation ──────────────────────────────────────────────

interface ClusterInfo {
  id: string;
  level: number;
  parentId: string | null;
  childrenIds: string[];
  nodeCount: number;
  edgeCount: number;
  anchor: string;
}

export interface LayoutResult {
  entities: Map<string, CanonicalEntity>;
}

export function computeLayout(
  data: RawGraphData,
  assignments: Map<string, string[]>, // nodeId → [supercluster, cluster, subcluster]
  clusters: Map<string, ClusterInfo>,
  config: CompilerConfig,
): LayoutResult {
  const R = config.bubbleRadius;
  const shells = computeShells(R);
  const entities = new Map<string, CanonicalEntity>();

  // ── Step 1: Assign angular sectors to superclusters ────────────
  const superclusters = [...clusters.values()].filter(c => c.level === 0);
  const scPositions = new Map<string, { theta: number; phi: number }>();

  for (let i = 0; i < superclusters.length; i++) {
    const pos = fibonacciSpherePoint(i, superclusters.length);
    scPositions.set(superclusters[i].id, pos);
  }

  // Create supercluster entities
  const scShell = shells[0];
  for (const sc of superclusters) {
    const angularPos = scPositions.get(sc.id)!;
    const canonical: SphericalCoord = {
      r: scShell.rCenter,
      theta: angularPos.theta,
      phi: angularPos.phi,
    };
    const cartesian = sphericalToCartesian(canonical);

    entities.set(sc.id, {
      id: sc.id,
      type: "supercluster",
      parentId: null,
      childrenIds: sc.childrenIds,
      hierarchyLevel: 0,
      canonical,
      cartesian,
      importance: sc.nodeCount / Math.max(1, data.nodes.length),
      clusterStats: {
        nodeCount: sc.nodeCount,
        edgeCount: sc.edgeCount,
        anchor: sc.anchor,
        boundingRegion: computeBoundingRegion(canonical, scShell, superclusters.length),
      },
      adjacencyChunkRefs: [],
      pathChunkRefs: [],
      label: `Cluster (${sc.nodeCount} nodes)`,
      color: "#4a6fa5",
      nodeCategory: "cluster",
      numericId: null,
      accessCount: 0,
      decayFactor: 1,
      displayOffsets: null,
    });
  }


  // ── Step 2: Position clusters within their supercluster sector ──
  const clusterLevel = [...clusters.values()].filter(c => c.level === 1);
  const clShell = shells[1];

  for (const sc of superclusters) {
    const scAngle = scPositions.get(sc.id)!;
    const children = clusterLevel.filter(c => c.parentId === sc.id);
    if (children.length === 0) continue;

    // Spread children in a cone around the supercluster's direction
    const angularSpread = Math.PI / Math.max(3, superclusters.length);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const subPos = fibonacciSpherePoint(i, children.length);

      // Map sub-positions into the supercluster's angular sector
      const theta = scAngle.theta + (subPos.theta - Math.PI / 2) * angularSpread;
      const phi = scAngle.phi + (subPos.phi - Math.PI) * angularSpread;

      const canonical: SphericalCoord = {
        r: clShell.rCenter + (child.nodeCount / config.maxClusterSize) * (clShell.rMax - clShell.rMin) * 0.3,
        theta: clampAngle(theta, 0.01, Math.PI - 0.01),
        phi: normalizeAngle(phi),
      };
      const cartesian = sphericalToCartesian(canonical);

      entities.set(child.id, {
        id: child.id,
        type: "cluster",
        parentId: sc.id,
        childrenIds: child.childrenIds,
        hierarchyLevel: 1,
        canonical,
        cartesian,
        importance: child.nodeCount / Math.max(1, data.nodes.length),
        clusterStats: {
          nodeCount: child.nodeCount,
          edgeCount: child.edgeCount,
          anchor: child.anchor,
          boundingRegion: computeBoundingRegion(canonical, clShell, children.length),
        },
        adjacencyChunkRefs: [],
        pathChunkRefs: [],
        label: `Cluster (${child.nodeCount} nodes)`,
        color: "#5b8db8",
        nodeCategory: "cluster",
        numericId: null,
        accessCount: 0,
        decayFactor: 1,
        displayOffsets: null,
      });
    }
  }


  // ── Step 3: Position subclusters within their cluster sector ────
  const subclusterLevel = [...clusters.values()].filter(c => c.level === 2);
  const scShell2 = shells[2];

  for (const cl of clusterLevel) {
    const clEntity = entities.get(cl.id);
    if (!clEntity) continue;

    const children = subclusterLevel.filter(c => c.parentId === cl.id);
    if (children.length === 0) continue;

    const parentAngle = clEntity.canonical;
    const angularSpread = Math.PI / Math.max(6, clusterLevel.length * 2);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const subPos = fibonacciSpherePoint(i, children.length);

      const theta = parentAngle.theta + (subPos.theta - Math.PI / 2) * angularSpread;
      const phi = parentAngle.phi + (subPos.phi - Math.PI) * angularSpread;

      const canonical: SphericalCoord = {
        r: scShell2.rCenter,
        theta: clampAngle(theta, 0.01, Math.PI - 0.01),
        phi: normalizeAngle(phi),
      };
      const cartesian = sphericalToCartesian(canonical);

      entities.set(child.id, {
        id: child.id,
        type: "subcluster",
        parentId: cl.id,
        childrenIds: child.childrenIds,
        hierarchyLevel: 2,
        canonical,
        cartesian,
        importance: child.nodeCount / Math.max(1, data.nodes.length),
        clusterStats: {
          nodeCount: child.nodeCount,
          edgeCount: child.edgeCount,
          anchor: child.anchor,
          boundingRegion: computeBoundingRegion(canonical, scShell2, children.length),
        },
        adjacencyChunkRefs: [],
        pathChunkRefs: [],
        label: `Subcluster (${child.nodeCount} nodes)`,
        color: "#7c8daa",
        nodeCategory: "cluster",
        numericId: null,
        accessCount: 0,
        decayFactor: 1,
        displayOffsets: null,
      });
    }
  }


  // ── Step 4: Position raw nodes using global Fibonacci sphere ───
  // Collect all raw nodes, sorted by cluster membership for locality,
  // then distribute across the FULL sphere using Fibonacci spacing.
  const rawShell = shells[3];

  // Build a node lookup for O(1) access
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]));

  // Collect all raw node IDs grouped by subcluster (preserves locality)
  const allRawNodes: { nodeId: string; subclusterId: string }[] = [];
  for (const sc of subclusterLevel) {
    for (const nodeId of sc.childrenIds) {
      allRawNodes.push({ nodeId, subclusterId: sc.id });
    }
  }

  // Also catch any nodes that weren't assigned to subclusters
  for (const node of data.nodes) {
    if (!allRawNodes.some(r => r.nodeId === node.id)) {
      allRawNodes.push({ nodeId: node.id, subclusterId: "unassigned" });
    }
  }

  const totalRawNodes = allRawNodes.length;

  for (let i = 0; i < totalRawNodes; i++) {
    const { nodeId, subclusterId } = allRawNodes[i];
    const rawNode = nodeMap.get(nodeId);
    if (!rawNode) continue;

    // Global Fibonacci sphere point — evenly distributed across entire sphere
    const fibPos = fibonacciSpherePoint(i, totalRawNodes);

    // Importance modulates radial position: more important = further out (more visible)
    const importanceT = rawNode.importance || 0;
    const r = rawShell.rMin + importanceT * (rawShell.rMax - rawShell.rMin);

    const canonical: SphericalCoord = {
      r,
      theta: fibPos.theta,
      phi: fibPos.phi,
    };
    const cartesian = sphericalToCartesian(canonical);

    const path = assignments.get(nodeId);

    entities.set(nodeId, {
      id: nodeId,
      type: rawNode.type,
      parentId: path ? path[2] : subclusterId, // subcluster
      childrenIds: [],
      hierarchyLevel: 3,
      canonical,
      cartesian,
      importance: rawNode.importance,
      clusterStats: null,
      adjacencyChunkRefs: [],
      pathChunkRefs: [],
      label: rawNode.label,
      color: rawNode.color,
      nodeCategory: rawNode.isEntity ? "entity" : "memory",
      numericId: rawNode.numericId,
      memoryType: rawNode.isEntity ? undefined : rawNode.type,
      entityType: rawNode.isEntity ? rawNode.type : undefined,
      accessCount: rawNode.accessCount,
      decayFactor: rawNode.decayFactor,
      displayOffsets: computeDisplayOffsets(canonical, importanceT, R),
    });
  }

  return { entities };
}

// ── Display offset computation ──────────────────────────────────────
// Each lens mode can warp the canonical position slightly for visual effect.

function computeDisplayOffsets(
  canonical: SphericalCoord,
  importance: number,
  bubbleRadius: number,
): DisplayOffsets {
  const R = bubbleRadius;

  // Hero lens: pull important nodes outward, push others inward
  const heroRadialShift = (importance - 0.5) * R * 0.15;
  const heroCart = sphericalToCartesian({
    r: canonical.r + heroRadialShift,
    theta: canonical.theta,
    phi: canonical.phi,
  });
  const baseCart = sphericalToCartesian(canonical);

  // Zero-G lens: spread nodes more evenly (mild radial normalization)
  const targetR = R * 0.4;
  const zeroGRadialShift = (targetR - canonical.r) * 0.3;
  const zeroGCart = sphericalToCartesian({
    r: canonical.r + zeroGRadialShift,
    theta: canonical.theta,
    phi: canonical.phi,
  });

  return {
    hero: { x: heroCart.x - baseCart.x, y: heroCart.y - baseCart.y, z: heroCart.z - baseCart.z },
    cluster: { x: 0, y: 0, z: 0 }, // cluster lens uses canonical positions
    starburst: { x: 0, y: 0, z: 0 }, // starburst uses viz-layout positions
    zeroG: { x: zeroGCart.x - baseCart.x, y: zeroGCart.y - baseCart.y, z: zeroGCart.z - baseCart.z },
  };
}

// ── Bounding region for a cluster ───────────────────────────────────

function computeBoundingRegion(
  center: SphericalCoord,
  shell: ShellBand,
  siblingCount: number,
): SphericalBounds {
  const angularSize = Math.PI / Math.max(2, siblingCount);
  return {
    rMin: shell.rMin,
    rMax: shell.rMax,
    thetaMin: Math.max(0, center.theta - angularSize),
    thetaMax: Math.min(Math.PI, center.theta + angularSize),
    phiMin: normalizeAngle(center.phi - angularSize),
    phiMax: normalizeAngle(center.phi + angularSize),
  };
}

// ── Angle utilities ─────────────────────────────────────────────────

function clampAngle(angle: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, angle));
}

function normalizeAngle(phi: number): number {
  return ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}
