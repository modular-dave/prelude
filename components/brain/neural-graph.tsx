"use client";

import { useCallback, useRef, useMemo, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS, LINK_TYPE_COLORS, LINK_TYPE_LABELS } from "@/lib/types";
import type { ViewMode, MemoryType } from "@/lib/types";
import * as THREE from "three";

// Polyfill THREE.Clock for Three.js r183+ where it was deprecated
// react-force-graph-3d (via three-render-objects) still depends on it
if (typeof window !== "undefined" && !(THREE as any).Clock) {
  (THREE as any).Clock = class Clock {
    autoStart: boolean;
    startTime: number;
    oldTime: number;
    elapsedTime: number;
    running: boolean;
    constructor(autoStart = true) {
      this.autoStart = autoStart;
      this.startTime = 0;
      this.oldTime = 0;
      this.elapsedTime = 0;
      this.running = false;
    }
    start() { this.startTime = this.now(); this.oldTime = this.startTime; this.elapsedTime = 0; this.running = true; }
    stop() { this.getElapsedTime(); this.running = false; }
    getElapsedTime() { this.getDelta(); return this.elapsedTime; }
    getDelta() {
      let diff = 0;
      if (this.autoStart && !this.running) { this.start(); return 0; }
      if (this.running) {
        const newTime = this.now();
        diff = (newTime - this.oldTime) / 1000;
        this.oldTime = newTime;
        this.elapsedTime += diff;
      }
      return diff;
    }
    now() { return performance.now(); }
  };
}

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
});

/** Mix a hex color toward black. factor 0 = black, 1 = original */
function dimHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Hex color with alpha opacity. Preserves hue at any opacity. */
function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha)).toFixed(2)})`;
}

/** Blend two hex colors. t=0 → colorA, t=1 → colorB */
function lerpHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

// Entity node color palette (distinct from memory TYPE_COLORS)
const ENTITY_COLORS: Record<string, string> = {
  person: "#6b7280",
  organization: "#4b5563",
  location: "#374151",
  concept: "#4a6fa5",
  technology: "#5b8db8",
  event: "#7c8daa",
};
const DEFAULT_ENTITY_COLOR = "#6b7280";

// ── Unified Dynamic Spatialization System ──────────────────────────────
// Everything derives from three master variables: optimalK (FR spacing),
// vizMode (force profile), and zoomLevel (normalized camera distance).
// Academic foundation: Fruchterman-Reingold 1991, Wiens K-CAP 2017 semantic zoom,
// Hajek 1988 cooling schedules, golden ratio proportions throughout.
const PHI = 1.618033988749895;
const PHI2 = PHI * PHI; // 2.618
const INV_PHI = 1 / PHI; // 0.618

// Reference k: optimal spacing at N=100, R=400 — anchors all scale-dependent quantities
const K_REF = 0.8 * Math.cbrt((4 / 3) * Math.PI * 400 ** 3 / 100);

// ── Shared Geometry Pool ──────────────────────────────────────────────
// All nodes share from 6 unit-size geometries. Size is encoded in mesh.scale.
// This eliminates ~1200 geometry buffer uploads → 6 shared instances.
const SHARED_GEO = {
  sphereHi:  new THREE.SphereGeometry(1, 20, 14),
  sphereLo:  new THREE.SphereGeometry(1, 8, 6),
  octaHi:    new THREE.OctahedronGeometry(1, 2),
  octaLo:    new THREE.OctahedronGeometry(1, 0),
  haloHi:    new THREE.SphereGeometry(1, 16, 12),
  haloLo:    new THREE.SphereGeometry(1, 8, 6),
};

interface UnifiedVizConfig {
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

const VIZ_CONFIGS: Record<"hero" | "cluster" | "zero", UnifiedVizConfig> = {
  hero: {
    // Radial around most-connected: strong gravity pull toward anchor, moderate repulsion
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
    // Weak gravity, loose links → clusters self-organize by connectivity
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
    // Balanced organic: moderate everything, no hero bias
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

// ── Pure derivation functions ──────────────────────────────────────────
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type LODLevel = "far" | "mid" | "close";

function nodeRadius(val: number, modeScore: number, k: number, config: UnifiedVizConfig): number {
  return Math.cbrt(val) * (config.nodeSizeBase + modeScore * config.nodeSizeBoost) * (k / K_REF);
}

function computeLOD(zoomLevel: number, config: UnifiedVizConfig): LODLevel {
  if (zoomLevel > config.lodFarThreshold) return "far";
  if (zoomLevel < config.lodCloseThreshold) return "close";
  return "mid";
}

function adaptiveEdgeWidth(strength: number, zoomLevel: number, config: UnifiedVizConfig): number {
  // Edges thin slightly when zooming in, thicken when zoomed out — floor at 0.5 to stay visible
  return (config.edgeWidthBase + strength * config.edgeWidthRange) * Math.min(3, Math.max(0.5, zoomLevel));
}

function adaptiveEdgeOpacity(strength: number, zoomLevel: number, config: UnifiedVizConfig): number {
  // Opacity stays high when zoomed in — floor at 0.5 so edges remain visible
  return (config.edgeOpacityBase + strength * config.edgeOpacityRange) * Math.min(1, Math.max(0.5, 1.5 - zoomLevel * 0.5));
}

function adaptiveOrbitSpeed(zoomLevel: number, config: UnifiedVizConfig): number {
  return config.orbitSpeedBase / Math.max(0.3, zoomLevel);
}

interface NeuralGraphProps {
  onNodeSelect?: (memoryId: number) => void;
  selectedNodeId?: number | null;
  memoryFilter?: "all" | "inputs" | "outputs";
  typeFilter?: MemoryType[];
  centerMode?: "combined" | "reinforced" | "retrieved";
  width?: number;
  height?: number;
  autoRotate?: boolean;
  timelineCutoff?: number; // ms timestamp or Infinity for no cutoff
  hideEdges?: boolean;
  selectedEdge?: { sourceId: string; targetId: string } | null;
  highlightedPath?: Set<string> | null;
  onPinnedContentChange?: (content: any | null) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  onBackgroundSelect?: () => void;
  onEdgeSelect?: (edge: SelectedEdgeInfo) => void;
  onReady?: () => void;
  onAutoRotateChange?: (rotating: boolean) => void;
  vizMode?: "hero" | "cluster" | "zero";
  edgeFocus?: boolean;
}

export interface NeuralGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  clearPinned: () => void;
  resetView: () => void;
}

export const NeuralGraph = forwardRef<NeuralGraphHandle, NeuralGraphProps>(function NeuralGraph({ onNodeSelect, selectedNodeId, memoryFilter = "all", typeFilter, centerMode = "combined", width, height, autoRotate = false, timelineCutoff = Infinity, hideEdges = false, selectedEdge = null, highlightedPath = null, onPinnedContentChange, onBackgroundSelect, onEdgeSelect, onReady, onAutoRotateChange, vizMode = "hero", edgeFocus = false }, ref) {
  const { knowledgeGraph, memories, fetchMemoryLinks } = useMemory();
  // Derive viewMode from centerMode: combined/reinforced → hebbian links, retrieved → retrieval similarity
  const viewMode: ViewMode = centerMode === "retrieved" ? "retrieved" : "hebbian";
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const forcesRegistered = useRef(false);
  // Dispose the Three.js renderer on unmount to prevent stale animation loops
  useEffect(() => {
    return () => {
      const fg = graphRef.current;
      if (fg) {
        try {
          const renderer = fg.renderer?.();
          renderer?.dispose?.();
          renderer?.forceContextLoss?.();
        } catch { /* silent */ }
        // Dispose pooled materials on unmount
        for (const mat of materialPoolRef.current.values()) {
          (mat as THREE.Material).dispose();
        }
        materialPoolRef.current.clear();
        graphRef.current = null;
      }
    };
  }, []);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [pinnedLinkKey, setPinnedLinkKey] = useState<string | null>(null); // "srcId|tgtId"

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      // Pivot-aware zoom: zoom toward zoomPivot (selection) or controls.target (global)
      const fg = graphRef.current;
      if (!fg) return;
      const cam = fg.camera?.();
      const controls = fg.controls?.();
      if (!cam) return;
      const pivot = zoomPivotRef.current;
      const target = pivot
        ? new THREE.Vector3(pivot.x, pivot.y, pivot.z)
        : controls?.target?.clone() || new THREE.Vector3(0, 0, 0);
      const dir = cam.position.clone().sub(target).normalize();
      const dist = cam.position.distanceTo(target);
      const newDist = Math.max(controls?.minDistance || 20, dist * 0.75);
      const newPos = target.clone().addScaledVector(dir, newDist);
      requestCameraFlyTo(
        { pos: { x: newPos.x, y: newPos.y, z: newPos.z }, lookAt: { x: target.x, y: target.y, z: target.z } },
        300, pivot ? "SETTLED" : "ORBIT"
      );
    },
    zoomOut: () => {
      const fg = graphRef.current;
      if (!fg) return;
      const cam = fg.camera?.();
      const controls = fg.controls?.();
      if (!cam) return;
      const pivot = zoomPivotRef.current;
      const target = pivot
        ? new THREE.Vector3(pivot.x, pivot.y, pivot.z)
        : controls?.target?.clone() || new THREE.Vector3(0, 0, 0);
      const dir = cam.position.clone().sub(target).normalize();
      const dist = cam.position.distanceTo(target);
      const newDist = Math.min(controls?.maxDistance || 5000, dist * 1.33);
      const newPos = target.clone().addScaledVector(dir, newDist);
      requestCameraFlyTo(
        { pos: { x: newPos.x, y: newPos.y, z: newPos.z }, lookAt: { x: target.x, y: target.y, z: target.z } },
        300, pivot ? "SETTLED" : "ORBIT"
      );
    },
    clearPinned: () => {
      setPinnedNodeId(null);
      setPinnedLinkKey(null);
    },
    resetView: () => {
      const dist = adaptiveCamDistRef.current || defaultCamDistRef.current;
      requestCameraFlyTo(
        { pos: { x: 0, y: 0, z: dist }, lookAt: { x: 0, y: 0, z: 0 } },
        800, "ORBIT"
      );
      try { graphRef.current?.d3ReheatSimulation?.(); } catch { /* silent */ }
    },
  }), []);

  // Async connection data for selected node
  const [asyncConnectionMap, setAsyncConnectionMap] = useState<Map<string, number> | null>(null);
  const [asyncLinkTypes, setAsyncLinkTypes] = useState<Map<string, string> | null>(null);

  // Build a set of visible memory IDs based on meta filter + type filter + timeline
  const visibleMemoryIds = useMemo(() => {
    const hasMetaFilter = memoryFilter !== "all";
    const hasTypeFilter = typeFilter && typeFilter.length < 5; // less than all 5 types
    const hasTimeFilter = timelineCutoff !== Infinity;
    if (!hasMetaFilter && !hasTypeFilter && !hasTimeFilter) return null; // null = show all

    return new Set(
      memories
        .filter((m) => {
          if (hasTimeFilter && new Date(m.created_at).getTime() > timelineCutoff) return false;
          if (typeFilter && !typeFilter.includes(m.memory_type)) return false;
          if (memoryFilter === "inputs" && !(m.tags || []).includes("user-message")) return false;
          if (memoryFilter === "outputs" && !(m.tags || []).includes("assistant-response")) return false;
          return true;
        })
        .map((m) => m.id)
    );
  }, [memories, memoryFilter, typeFilter, timelineCutoff]);

  // Build graph data from ALL memories + entities (topology never changes during scrub)
  // Only rebuilt when the underlying data source changes (new memories, knowledge graph update)
  const prevFingerprintRef = useRef("");
  const prevDataRef = useRef<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });

  const data = useMemo(() => {
    const memoryNodes = memories.map((m) => ({
      id: `m_${m.id}`,
      name: m.summary?.slice(0, 40) || "memory",
      val: Math.max(4, (m.importance || 0.5) * 20),
      color: TYPE_COLORS[m.memory_type] || "#666",
      type: m.memory_type,
      importance: m.importance,
      isEntity: false,
      numericId: m.id,
    }));

    const entityNodes = knowledgeGraph.nodes.map((e) => ({
      id: e.id,
      name: e.label?.slice(0, 40) || "entity",
      val: Math.max(3, (e.size || 1) * 8),
      color: ENTITY_COLORS[e.type] || DEFAULT_ENTITY_COLOR,
      type: e.type,
      importance: (e.size || 1) / 10,
      isEntity: true,
      numericId: null as number | null,
    }));

    const nodes = [...memoryNodes, ...entityNodes];
    const nodeIdSet = new Set(nodes.map((n) => n.id));

    // Deduplicate edges: keep the strongest link per canonical source-target pair
    const linkMap = new Map<string, { id: string; source: string; target: string; value: number; linkType: string }>();
    for (const e of knowledgeGraph.edges) {
      if (!nodeIdSet.has(e.source) || !nodeIdSet.has(e.target)) continue;
      const canon = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
      const existing = linkMap.get(canon);
      const value = e.weight || 1;
      if (!existing || value > existing.value) {
        linkMap.set(canon, { id: canon, source: e.source, target: e.target, value, linkType: e.type || "relates" });
      }
    }
    const links = Array.from(linkMap.values());

    // Conversation edges
    const convGroups = new Map<string, string[]>();
    for (const m of memories) {
      for (const tag of m.tags || []) {
        if (tag.startsWith("conv:")) {
          let group = convGroups.get(tag);
          if (!group) { group = []; convGroups.set(tag, group); }
          group.push(`m_${m.id}`);
        }
      }
    }
    const canonEdgeSet = new Set(linkMap.keys());
    for (const members of convGroups.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const canon = members[i] < members[j] ? `${members[i]}|${members[j]}` : `${members[j]}|${members[i]}`;
          if (!canonEdgeSet.has(canon)) {
            links.push({ id: canon, source: members[i], target: members[j], value: 0.5, linkType: "conversation" });
            canonEdgeSet.add(canon);
          }
        }
      }
    }

    const result = { nodes, links };
    const nodeIds = nodes.map((n) => n.id).sort().join(",");
    const linkIds = links.map((l) => l.id).sort().join(",");
    const fp = `${nodeIds}|${linkIds}`;
    if (fp === prevFingerprintRef.current) {
      return prevDataRef.current;
    }
    prevFingerprintRef.current = fp;
    prevDataRef.current = result;
    return result;
  }, [knowledgeGraph, memories]);

  // Visibility callbacks — filter without changing topology (no simulation restart)
  const visibleMemoryIdsRef = useRef(visibleMemoryIds);
  visibleMemoryIdsRef.current = visibleMemoryIds;
  const hideEdgesRef = useRef(hideEdges);
  hideEdgesRef.current = hideEdges;

  const nodeVisibility = useCallback((node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const ids = visibleMemoryIdsRef.current;
    if (!ids) return true; // null = show all
    if (node.isEntity) return true; // entities always visible
    return ids.has(node.numericId);
  }, []);

  // Lookup: nodeId → numericId (null for entities)
  const nodeNumericIdMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const node of data.nodes) {
      map.set(node.id, node.isEntity ? null : node.numericId);
    }
    return map;
  }, [data.nodes]);

  const linkVisibility = useCallback((link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (hideEdgesRef.current) return false;
    const ids = visibleMemoryIdsRef.current;
    if (!ids) return true;
    const srcId = typeof link.source === "object" ? link.source.id : link.source;
    const tgtId = typeof link.target === "object" ? link.target.id : link.target;
    const srcNum = nodeNumericIdMap.get(srcId);
    const tgtNum = nodeNumericIdMap.get(tgtId);
    // null = entity (always visible), undefined = unknown node
    if (srcNum === undefined || tgtNum === undefined) return false;
    const srcVisible = srcNum === null || ids.has(srcNum);
    const tgtVisible = tgtNum === null || ids.has(tgtNum);
    return srcVisible && tgtVisible;
  }, [nodeNumericIdMap]);

  // Max link value for normalization
  const maxLinkValue = useMemo(() => {
    let max = 1;
    for (const link of data.links) {
      if (link.value > max) max = link.value;
    }
    return max;
  }, [data.links]);

  // Build a node-type lookup for coloring
  const nodeTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of data.nodes) {
      map.set(node.id, node.type);
    }
    return map;
  }, [data.nodes]);

  // Build a node isEntity lookup
  const nodeIsEntityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const node of data.nodes) {
      map.set(node.id, node.isEntity);
    }
    return map;
  }, [data.nodes]);

  // Selected node's string id for graph lookups
  const selectedGraphId = selectedNodeId != null ? `m_${selectedNodeId}` : null;

  // Fetch connection data when selection or mode changes
  useEffect(() => {
    if (!selectedNodeId || !selectedGraphId) {
      setAsyncConnectionMap(null);
      setAsyncLinkTypes(null);
      return;
    }

    let cancelled = false;

    if (viewMode === "hebbian") {
      // Fetch real Cortex links for this memory
      fetchMemoryLinks(selectedNodeId).then((links) => {
        if (cancelled) return;
        const map = new Map<string, number>();
        const typeMap = new Map<string, string>();
        let maxStrength = 0;
        for (const link of links) {
          const otherId = link.source_id === selectedNodeId ? link.target_id : link.source_id;
          const key = `m_${otherId}`;
          const s = link.strength || 0;
          if (s > maxStrength) maxStrength = s;
          map.set(key, s);
          typeMap.set(key, link.link_type);
        }
        // Normalize
        if (maxStrength > 0) {
          for (const [id, val] of map) {
            map.set(id, val / maxStrength);
          }
        }
        setAsyncConnectionMap(map);
        setAsyncLinkTypes(typeMap);
      });
    } else {
      // "retrieved" mode: query the API for similar memories
      const selected = memories.find((m) => m.id === selectedNodeId);
      if (!selected) {
        setAsyncConnectionMap(new Map());
        setAsyncLinkTypes(null);
        return;
      }
      const query = encodeURIComponent(selected.summary || selected.content?.slice(0, 100) || "");
      fetch(`/api/memories?q=${query}&limit=15`)
        .then((res) => res.json())
        .then((results: any[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          if (cancelled) return;
          const map = new Map<string, number>();
          let maxScore = 0;
          for (const r of results) {
            if (r.id === selectedNodeId) continue;
            const score = r._score ?? 0;
            if (score > maxScore) maxScore = score;
            map.set(`m_${r.id}`, score);
          }
          // Normalize
          if (maxScore > 0) {
            for (const [id, val] of map) {
              map.set(id, val / maxScore);
            }
          }
          setAsyncConnectionMap(map);
          setAsyncLinkTypes(null);
        })
        .catch(() => {
          if (!cancelled) setAsyncConnectionMap(new Map());
        });
    }

    return () => { cancelled = true; };
  }, [selectedNodeId, selectedGraphId, viewMode, fetchMemoryLinks, memories]);

  // connectionMap alias for rendering callbacks
  const connectionMap = asyncConnectionMap;

  // Bounding sphere radius — log-dampened so universe doesn't explode at scale
  const bubbleRadius = useMemo(() => {
    const N = data.nodes.length;
    if (N === 0) return 200;
    // Scale sphere proportionally with charge — stronger repulsion needs proportionally more room
    const chargeScale = VIZ_CONFIGS[vizMode].chargeFactor;
    return Math.max(200, (200 + 200 * Math.log2(Math.max(1, N))) * chargeScale);
  }, [data.nodes.length, vizMode]);

  // Fruchterman-Reingold optimal edge length: the master variable
  // k = C · (V/N)^(1/3) — ideal spacing for uniform distribution in sphere
  const optimalK = useMemo(() => {
    const N = data.nodes.length;
    if (N <= 1) return 50;
    const R = bubbleRadius;
    const volume = (4 / 3) * Math.PI * R * R * R;
    const k = 0.8 * Math.cbrt(volume / N);
    return Math.max(12, Math.min(k, R * INV_PHI));
  }, [data.nodes.length, bubbleRadius]);

  const optimalKRef = useRef(optimalK);
  optimalKRef.current = optimalK;
  const vizModeRef = useRef(vizMode);
  vizModeRef.current = vizMode;
  const edgeFocusRef = useRef(edgeFocus);
  edgeFocusRef.current = edgeFocus;

  // Maximum node halo radius in the dataset — used as zoom-in floor
  // so the camera never clips through nodes. Halo is the outermost visual element.
  const maxNodeHaloRadius = useMemo(() => {
    const config = VIZ_CONFIGS[vizMode];
    let maxR = 10;
    for (const node of data.nodes) {
      const r = nodeRadius(node.val || 1, 1, optimalK, config);
      // Halo multiplier is 3.0 for entities/hero, 2.5 for pinned, 2.0 for regular
      const haloR = r * 3.0;
      if (haloR > maxR) maxR = haloR;
    }
    return maxR;
  }, [data.nodes, optimalK, vizMode]);
  const maxNodeHaloRadiusRef = useRef(maxNodeHaloRadius);
  maxNodeHaloRadiusRef.current = maxNodeHaloRadius;

  // ── Material pool: quantized {color|opacity|emissive} → shared material ──
  // Reduces ~1200 unique materials → ~20 shared instances
  const materialPoolRef = useRef(new Map<string, THREE.MeshLambertMaterial>());
  const getMaterial = useCallback((color: string, opacity: number, emissiveColor: string, emissiveIntensity: number, transparent = true): THREE.MeshLambertMaterial => {
    // Quantize to reduce unique materials: opacity to nearest 0.05, emissive to nearest 0.05
    const qOpacity = Math.round(opacity * 20) / 20;
    const qEmissive = Math.round(emissiveIntensity * 20) / 20;
    const key = `${color}|${qOpacity}|${emissiveColor}|${qEmissive}`;
    let mat = materialPoolRef.current.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({
        color, transparent, opacity: qOpacity,
        emissive: new THREE.Color(emissiveColor),
        emissiveIntensity: qEmissive,
      });
      mat.userData = { shared: true };
      materialPoolRef.current.set(key, mat);
    }
    return mat;
  }, []);

  const getHaloMaterial = useCallback((color: string, opacity: number): THREE.MeshBasicMaterial => {
    // Halos are simple — just color + opacity, use a separate small pool
    const key = `halo|${color}|${Math.round(opacity * 20)}`;
    let mat = (materialPoolRef.current as Map<string, any>).get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.round(opacity * 20) / 20 });
      mat.userData = { shared: true };
      (materialPoolRef.current as Map<string, any>).set(key, mat);
    }
    return mat;
  }, []);

  // Zoom & LOD refs — updated every frame in tick loop
  const zoomLevelRef = useRef(1.0);
  const lodLevelRef = useRef<LODLevel>("mid");
  const prevLodRef = useRef<LODLevel>("mid");
  const lodDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNodeScaleRef = useRef(1.0);
  const wheelCleanupRef = useRef<(() => void) | null>(null);

  // Cursor-directed zoom refs
  const zoomPivotRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const mouseNdcRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Zoom inertia/momentum refs (Cesium-style smooth deceleration)
  const zoomVelocityRef = useRef(0);
  const zoomInertiaActiveRef = useRef(false);
  const ZOOM_INERTIA_DECAY = 0.88; // per-frame decay: lower = snappier, higher = more momentum

  // Frustum culling refs — updated once per frame in tick loop
  const frustumRef = useRef(new THREE.Frustum());
  const frustumMatRef = useRef(new THREE.Matrix4());

  // Adaptive quality: low LOD during interaction
  const interactionLodRef = useRef(false);
  const interactionLodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera state machine
  interface CameraPose { pos: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number }; }
  type CameraState =
    | { mode: "ORBIT" }
    | { mode: "FLY_TO"; from: CameraPose; to: CameraPose; start: number; dur: number; then: "ORBIT" | "SETTLED" }
    | { mode: "SETTLED" }
    | { mode: "USER_CONTROL" };
  const cameraStateRef = useRef<CameraState>({ mode: "ORBIT" });

  // Active config derived from vizMode
  const activeConfig = VIZ_CONFIGS[vizMode];

  // Default camera: sphere fits viewport at 100vh, margin from config
  const defaultCamDist = useMemo(() => {
    const vFov = (75 * Math.PI) / 180;
    const aspect = (width && height) ? width / height : 1;
    const fitH = bubbleRadius / Math.tan(vFov / 2);
    const fitW = bubbleRadius / (Math.tan(vFov / 2) * aspect);
    return Math.max(fitH, fitW) * activeConfig.cameraFitMargin;
  }, [bubbleRadius, width, height, activeConfig.cameraFitMargin]);
  const defaultCamDistRef = useRef(defaultCamDist);
  defaultCamDistRef.current = defaultCamDist;

  // Degree centrality: how many edges each node has (normalized 0–1)
  const degreeCentrality = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of data.links) {
      const src = typeof link.source === "object" ? (link.source as any).id : link.source;
      const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
      counts.set(src, (counts.get(src) || 0) + 1);
      counts.set(tgt, (counts.get(tgt) || 0) + 1);
    }
    let maxDeg = 1;
    for (const v of counts.values()) { if (v > maxDeg) maxDeg = v; }
    const normalized = new Map<string, number>();
    for (const [id, deg] of counts) { normalized.set(id, deg / maxDeg); }
    return normalized;
  }, [data.links]);

  // Retrieval centrality: normalized access_count (or importance as fallback) per node
  const retrievalCentrality = useMemo(() => {
    const scores = new Map<string, number>();
    let maxScore = 0;
    for (const node of data.nodes) {
      if (node.isEntity) continue;
      const mem = memories.find((m) => m.id === node.numericId);
      const score = (mem?.access_count ?? 0) || (mem?.importance ?? 0);
      scores.set(node.id, score);
      if (score > maxScore) maxScore = score;
    }
    if (maxScore > 0) {
      for (const [id, s] of scores) scores.set(id, s / maxScore);
    }
    return scores;
  }, [data.nodes, memories]);

  // Anchor node: determines what sits at the center of the graph
  const anchorNodeId = useMemo(() => {
    if (centerMode === "retrieved") {
      let bestId = "";
      let bestCount = -1;
      for (const node of data.nodes) {
        if (node.isEntity) continue;
        const mem = memories.find((m) => m.id === node.numericId);
        const ac = mem?.access_count ?? 0;
        if (ac > bestCount) { bestCount = ac; bestId = node.id; }
      }
      if (bestCount === 0) {
        let bestImp = -1;
        for (const node of data.nodes) {
          if (node.isEntity) continue;
          const imp = node.importance ?? 0;
          if (imp > bestImp) { bestImp = imp; bestId = node.id; }
        }
      }
      return bestId;
    }
    // Combined + reinforced: use degree centrality for anchor
    let bestId = "";
    let bestDeg = 0;
    for (const [id, deg] of degreeCentrality) {
      if (deg > bestDeg) { bestDeg = deg; bestId = id; }
    }
    return bestId;
  }, [centerMode, data.nodes, degreeCentrality, memories]);

  // Refs for highlight path + node object cache (declared before nodeThreeObject callback)
  const highlightedPathRef = useRef(highlightedPath);
  highlightedPathRef.current = highlightedPath;
  const nodeObjectCache = useRef(new Map<string, THREE.Group>());

  // Clear node object cache on structural changes — dispose non-shared materials
  useEffect(() => {
    for (const [, obj] of nodeObjectCache.current) {
      const children = obj instanceof THREE.Group ? obj.children : [obj];
      for (const child of children) {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.Material;
          if (!mat.userData?.shared) mat.dispose();
        }
      }
    }
    nodeObjectCache.current.clear();
  }, [selectedGraphId, selectedEdge, connectionMap, centerMode, degreeCentrality, retrievalCentrality, edgeFocus]);

  // Hover/pin: update materials in-place without rebuilding geometry
  // Only updates changed nodes for O(1) perf instead of O(N) full scan
  const prevHoveredRef = useRef<string | null>(null);
  const prevPinnedRef = useRef<string | null>(null);
  useEffect(() => {
    const changed = new Set<string>();
    if (prevHoveredRef.current) changed.add(prevHoveredRef.current);
    if (hoveredNodeId) changed.add(hoveredNodeId);
    if (prevPinnedRef.current) changed.add(prevPinnedRef.current);
    if (pinnedNodeId) changed.add(pinnedNodeId);
    prevHoveredRef.current = hoveredNodeId;
    prevPinnedRef.current = pinnedNodeId;

    for (const id of changed) {
      const group = nodeObjectCache.current.get(id);
      if (!group) continue;
      const mesh = group.children[0] as THREE.Mesh;
      if (!mesh?.material) continue;
      const mat = mesh.material as THREE.MeshLambertMaterial;
      const isHovered = id === hoveredNodeId;
      const isPinned = id === pinnedNodeId;
      mat.emissiveIntensity = (isHovered || isPinned) ? 0.4 : 0.05;
      mat.opacity = (isHovered || isPinned) ? 1.0 : 0.85;
      group.userData = { ...group.userData, pinned: isPinned };
      mat.needsUpdate = true;
      if (group.children[1]) group.children[1].visible = isHovered || isPinned;
    }
    // No refresh() needed — materials updated in-place, rAF tick loop renders every frame
  }, [hoveredNodeId, pinnedNodeId]);

  // Custom Three.js node objects with per-node opacity + hover glow
  // Mode-aware: node size/brightness reflects the active metric
  // NOTE: highlightedPath is read from ref (not a dep) to keep callback stable during slider drags
  const nodeThreeObject = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const isEntity = node.isEntity;
      const typeColor = isEntity
        ? (ENTITY_COLORS[node.type] || DEFAULT_ENTITY_COLOR)
        : (TYPE_COLORS[node.type as keyof typeof TYPE_COLORS] || "#666");
      const isHovered = node.id === hoveredNodeId;
      const isPinned = node.id === pinnedNodeId;

      // Mode-aware sizing: scale nodes by the active metric
      const degScore = degreeCentrality.get(node.id) ?? 0;
      const retScore = retrievalCentrality.get(node.id) ?? 0;
      const modeScore = centerMode === "retrieved" ? retScore
        : centerMode === "combined" ? Math.max(degScore, retScore)
        : degScore;
      const rawSize = nodeRadius(node.val, modeScore, optimalKRef.current, VIZ_CONFIGS[vizModeRef.current]);
      const baseSize = edgeFocusRef.current ? rawSize * 0.35 : rawSize;

      // LOD-aware geometry selection
      const lod = lodLevelRef.current;
      const coreGeo = isEntity
        ? (lod === "far" ? SHARED_GEO.octaLo : SHARED_GEO.octaHi)
        : (lod === "far" ? SHARED_GEO.sphereLo : SHARED_GEO.sphereHi);
      const haloGeo = lod === "far" ? SHARED_GEO.haloLo : SHARED_GEO.haloHi;

      // Selected edge: highlight endpoint nodes (or path nodes), dim rest
      // Uses cached objects — only updates material/scale when highlight changes
      if (selectedEdge) {
        const hp = highlightedPathRef.current;
        const isEdgeNode = hp
          ? hp.has(node.id)
          : (node.id === selectedEdge.sourceId || node.id === selectedEdge.targetId);

        const cached = nodeObjectCache.current.get(node.id);
        if (cached) {
          // Update existing cached object — no geometry rebuild
          const mesh = cached.children[0] as THREE.Mesh;
          const mat = mesh.material as THREE.MeshLambertMaterial;
          const halo = cached.children[1] as THREE.Mesh | undefined;
          if (isEdgeNode) {
            cached.scale.setScalar(1.0);
            mat.color.set("#ffffff");
            mat.opacity = 1.0;
            mat.emissive.set(typeColor);
            mat.emissiveIntensity = 0.5;
            if (halo) halo.visible = true;
          } else {
            cached.scale.setScalar(0.6 / 1.3);
            mat.color.set(typeColor);
            mat.opacity = 0.25;
            mat.emissive.set(typeColor);
            mat.emissiveIntensity = 0.02;
            if (halo) halo.visible = false;
          }
          return cached;
        }

        // First creation — shared geometry, size via scale
        const group = new THREE.Group();
        const mat = getMaterial(
          isEdgeNode ? "#ffffff" : typeColor,
          isEdgeNode ? 1.0 : 0.25,
          typeColor,
          isEdgeNode ? 0.5 : 0.02,
        );
        const mesh = new THREE.Mesh(coreGeo, mat);
        mesh.scale.setScalar(baseSize * 1.3);
        group.add(mesh);
        // Always add halo (toggle visibility instead of create/destroy)
        const halo = new THREE.Mesh(haloGeo, getHaloMaterial(typeColor, 0.15));
        halo.scale.setScalar(baseSize * 3.0);
        halo.visible = isEdgeNode;
        group.add(halo);
        if (!isEdgeNode) group.scale.setScalar(0.6 / 1.3);
        group.userData = { isEntity, pinned: false };
        nodeObjectCache.current.set(node.id, group);
        return group;
      }

      if (!selectedGraphId || !connectionMap) {
        // Default state: shared geometry, pooled material, size via scale
        const group = new THREE.Group();
        const highlight = isHovered || isPinned;
        const nodeSize = isPinned ? baseSize * 1.2 : baseSize;
        const mat = getMaterial(
          isPinned ? "#ffffff" : typeColor,
          highlight ? 1.0 : 0.85,
          typeColor,
          highlight ? 0.4 : 0.05,
        );
        const mesh = new THREE.Mesh(coreGeo, mat);
        mesh.scale.setScalar(nodeSize);
        group.add(mesh);

        if (highlight) {
          const haloSize = baseSize * (isPinned ? 2.5 : 2);
          const halo = new THREE.Mesh(haloGeo, getHaloMaterial(typeColor, isPinned ? 0.15 : 0.08));
          halo.scale.setScalar(haloSize);
          group.add(halo);
        }
        group.userData = { isEntity, pinned: isPinned };
        return group;
      }

      if (node.id === selectedGraphId) {
        // Selected: bright core + type-colored glow halo
        const group = new THREE.Group();
        const core = new THREE.Mesh(coreGeo, getMaterial("#ffffff", 1.0, "#000000", 0));
        core.scale.setScalar(baseSize * 1.3);
        group.add(core);

        const halo = new THREE.Mesh(haloGeo, getHaloMaterial(typeColor, 0.12));
        halo.scale.setScalar(baseSize * 3.0);
        group.add(halo);
        group.userData = { isEntity, pinned: false };
        return group;
      }

      const strength = connectionMap.get(node.id);
      if (strength !== undefined) {
        const opacity = 0.3 + strength * 0.7;
        const size = baseSize * (0.7 + strength * 0.6);
        const mat = getMaterial(typeColor, opacity, typeColor, strength * 0.4);
        const mesh = new THREE.Mesh(coreGeo, mat);
        mesh.scale.setScalar(size);
        mesh.userData = { isEntity };
        return mesh;
      }

      // Unrelated: small and dim but still type-colored for context
      const mat = getMaterial(typeColor, 0.15, typeColor, 0.01);
      const mesh = new THREE.Mesh(lod === "far" ? (isEntity ? SHARED_GEO.octaLo : SHARED_GEO.sphereLo) : coreGeo, mat);
      mesh.scale.setScalar(baseSize * 0.5);
      mesh.userData = { isEntity };
      return mesh;
    },
    [selectedGraphId, selectedEdge, connectionMap, pinnedNodeId, centerMode, degreeCentrality, retrievalCentrality, edgeFocus, getMaterial, getHaloMaterial]
  );

  // When only highlightedPath changes, update cached edge-view objects directly (no rebuild)
  // When highlightedPath changes, update cached edge-view materials (no rebuild)
  useEffect(() => {
    if (!selectedEdge || nodeObjectCache.current.size === 0) return;
    const hp = highlightedPathRef.current;
    for (const [id, group] of nodeObjectCache.current) {
      const isEdgeNode = hp
        ? hp.has(id)
        : (id === selectedEdge.sourceId || id === selectedEdge.targetId);
      const mesh = group.children[0] as THREE.Mesh;
      const mat = mesh.material as THREE.MeshLambertMaterial;
      const halo = group.children[1] as THREE.Mesh | undefined;
      const typeColor = `#${mat.emissive.getHexString()}`;
      if (isEdgeNode) {
        group.scale.setScalar(1.0);
        mat.color.set("#ffffff");
        mat.opacity = 1.0;
        mat.emissive.set(typeColor);
        mat.emissiveIntensity = 0.5;
        if (halo) halo.visible = true;
      } else {
        group.scale.setScalar(0.6 / 1.3);
        mat.color.set(typeColor);
        mat.opacity = 0.1;
        mat.emissive.set(typeColor);
        mat.emissiveIntensity = 0.0;
        if (halo) halo.visible = false;
      }
    }
    // No refresh() needed — materials updated in-place above
  }, [highlightedPath, selectedEdge]);

  // Cinematic dolly: fit highlighted cluster in the visible area (left of panel)
  // Uses actual bounding sphere of highlighted nodes to compute camera distance
  useEffect(() => {
    if (!selectedEdge || !highlightedPath) return;
    const fg = graphRef.current;
    if (!fg) return;
    const srcNode = data.nodes.find((n: any) => n.id === selectedEdge.sourceId) as any;
    const tgtNode = data.nodes.find((n: any) => n.id === selectedEdge.targetId) as any;
    if (!srcNode || !tgtNode || !('x' in srcNode) || !('x' in tgtNode)) return;

    // Edge midpoint — lookAt target
    const mid = {
      x: ((srcNode.x || 0) + (tgtNode.x || 0)) / 2,
      y: ((srcNode.y || 0) + (tgtNode.y || 0)) / 2,
      z: ((srcNode.z || 0) + (tgtNode.z || 0)) / 2,
    };

    const cam = fg.camera?.();
    if (!cam) return;
    const vFov = (cam.fov || 75) * Math.PI / 180;

    // Baseline: depth-0 distance (same formula as edge-centering effect)
    const nodeDist = Math.hypot(
      (srcNode.x || 0) - (tgtNode.x || 0),
      (srcNode.y || 0) - (tgtNode.y || 0),
      (srcNode.z || 0) - (tgtNode.z || 0)
    );
    const baseDist = Math.max(80, (nodeDist / 2) / Math.tan(vFov / 2) * 3.2);

    let targetDist: number;
    if (highlightedPath.size <= 2) {
      // Depth 0: zoom back to baseline
      targetDist = baseDist;
    } else {
      // Depth 1+: fit cluster bounding sphere, never closer than baseline
      const distances: number[] = [];
      for (const id of highlightedPath) {
        const n = data.nodes.find((nd: any) => nd.id === id) as any;
        if (!n || !('x' in n)) continue;
        distances.push(Math.hypot((n.x || 0) - mid.x, (n.y || 0) - mid.y, (n.z || 0) - mid.z));
      }
      if (distances.length === 0) return;
      distances.sort((a, b) => a - b);
      const p85 = distances[Math.floor(distances.length * 0.85)] || distances[distances.length - 1];
      const clusterDist = p85 / Math.tan(vFov / 2) * 3.2;
      targetDist = Math.max(baseDist, clusterDist);
    }

    // Update zoom clamp refs: user can scroll between baseDist and big-sphere distance
    zoomMinDistRef.current = baseDist;
    zoomMaxDistRef.current = Math.max(targetDist, defaultCamDistRef.current);

    const camPos = cam.position;
    const dx = camPos.x - mid.x;
    const dy = camPos.y - mid.y;
    const dz = camPos.z - mid.z;
    const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    // Only animate if distance change is meaningful (>5%)
    if (Math.abs(targetDist - currentDist) / currentDist < 0.05) return;

    const ratio = targetDist / currentDist;
    requestCameraFlyTo(
      {
        pos: { x: mid.x + dx * ratio, y: mid.y + dy * ratio, z: mid.z + dz * ratio },
        lookAt: { x: mid.x, y: mid.y, z: mid.z },
      },
      600, "SETTLED"
    );
    zoomPivotRef.current = { x: mid.x, y: mid.y, z: mid.z };
  }, [highlightedPath, selectedEdge, data.nodes]);

  // Keep refs so forces always read the latest values
  const centralityRef = useRef(degreeCentrality);
  centralityRef.current = degreeCentrality;
  const retrievalCentralityRef = useRef(retrievalCentrality);
  retrievalCentralityRef.current = retrievalCentrality;
  const anchorRef = useRef(anchorNodeId);
  anchorRef.current = anchorNodeId;
  const centerModeRef = useRef(centerMode);
  centerModeRef.current = centerMode;

  // Ref callback: register forces THE MOMENT the graph instance is available
  // This ensures forces are active before warmupTicks run
  const bubbleRadiusRef = useRef(bubbleRadius);
  bubbleRadiusRef.current = bubbleRadius;

  // Zoom clamping: min = depth-0 baseline, max = big sphere distance
  const zoomMinDistRef = useRef<number>(80);
  const zoomMaxDistRef = useRef<number>(defaultCamDist);

  // ── Camera transition: the ONLY way to move the camera ──
  const requestCameraFlyTo = useCallback((to: CameraPose, duration: number, thenMode: "ORBIT" | "SETTLED" = "ORBIT") => {
    const fg = graphRef.current;
    if (!fg) return;
    const cam = fg.camera?.();
    if (!cam) return;
    const controls = fg.controls?.();
    if (duration === 0) {
      // Instant move
      cam.position.set(to.pos.x, to.pos.y, to.pos.z);
      cam.lookAt(to.lookAt.x, to.lookAt.y, to.lookAt.z);
      if (controls?.target) controls.target.set(to.lookAt.x, to.lookAt.y, to.lookAt.z);
      if (controls) controls.enabled = true;
      cameraStateRef.current = { mode: thenMode };
      return;
    }
    if (controls) controls.enabled = false;
    // Freeze force simulation during camera transition so nodes don't drift
    try { fg.d3AlphaDecay?.(1.0); } catch { /* noop */ }
    cameraStateRef.current = {
      mode: "FLY_TO",
      from: {
        pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        lookAt: controls?.target
          ? { x: controls.target.x, y: controls.target.y, z: controls.target.z }
          : { x: 0, y: 0, z: 0 },
      },
      to, start: performance.now(), dur: duration, then: thenMode,
    };
  }, []);

  const graphRefCallback = useCallback((fg: any) => {
    graphRef.current = fg;
    if (!fg || forcesRegistered.current) return;
    forcesRegistered.current = true;

    // ── φ-scaled gravity: profile-aware, k-inversely-proportional ──
    let gravityNodes: any[] = [];
    const gravity = Object.assign(
      (alpha: number) => {
        const profile = VIZ_CONFIGS[vizModeRef.current];
        const centrality = centerModeRef.current === "retrieved"
          ? retrievalCentralityRef.current
          : centralityRef.current;
        const anchor = anchorRef.current;
        const k = optimalKRef.current;

        for (const node of gravityNodes) {
          if (vizModeRef.current === "hero" && node.id === anchor) {
            node.x = 0; node.y = 0; node.z = 0;
            node.vx = 0; node.vy = 0; node.vz = 0;
            continue;
          }
          const c = centrality.get(node.id) ?? 0;
          const g = alpha * (profile.gravityBase * (30 / k) + profile.heroBoost * c);
          node.vx = (node.vx || 0) - (node.x || 0) * g;
          node.vy = (node.vy || 0) - (node.y || 0) * g;
          node.vz = (node.vz || 0) - (node.z || 0) * g;
        }
      },
      { initialize: (nodes: any[]) => { gravityNodes = nodes; } }
    );
    fg.d3Force("gravity", gravity);

    // ── Boundary: very soft gradient — gentle nudge starting at 0.8R, hard clamp at R·φ² ──
    let boundaryNodes: any[] = [];
    const boundary = Object.assign(
      () => {
        const R = bubbleRadiusRef.current;
        const softStart = R * 0.8;
        const hardR = R * PHI2;
        for (const node of boundaryNodes) {
          const x = node.x || 0, y = node.y || 0, z = node.z || 0;
          const dist = Math.sqrt(x * x + y * y + z * z);
          if (dist > softStart) {
            const t = Math.min(1, (dist - softStart) / (hardR - softStart));
            const push = t * t * 0.15; // very gentle
            const dampen = 1 - push * 0.3;
            node.vx = (node.vx || 0) * dampen;
            node.vy = (node.vy || 0) * dampen;
            node.vz = (node.vz || 0) * dampen;
            if (dist > hardR) {
              const scale = hardR / dist;
              node.x = x * scale; node.y = y * scale; node.z = z * scale;
              node.vx *= 0.2; node.vy *= 0.2; node.vz *= 0.2;
            } else {
              const scale = 1 - push * (1 - softStart / dist);
              node.x = x * scale; node.y = y * scale; node.z = z * scale;
            }
          }
        }
      },
      { initialize: (nodes: any[]) => { boundaryNodes = nodes; } }
    );
    fg.d3Force("boundary", boundary);

    // Allow clicks even after tiny pointer drag (controls can cause micro-drags)
    if (typeof fg.clickAfterDrag === "function") fg.clickAfterDrag(true);

    // ── Charge: FR-proportional (−k²/100), local repulsion for cluster emergence ──
    const charge = fg.d3Force("charge");
    if (charge) {
      const k = optimalKRef.current;
      const p = VIZ_CONFIGS[vizModeRef.current];
      charge.strength(-p.chargeFactor * k * k / 100);
      charge.distanceMax(p.distMaxFactor * k);
    }

    // ── Link distance = k · profile factor ──
    const link = fg.d3Force("link");
    if (link) {
      const k = optimalKRef.current;
      const p = VIZ_CONFIGS[vizModeRef.current];
      link.distance(p.linkDistFactor * k);
      link.strength(p.linkStrength);
    }

    // Initial camera + detect user control via controls events
    requestCameraFlyTo(
      { pos: { x: 0, y: 0, z: defaultCamDistRef.current }, lookAt: { x: 0, y: 0, z: 0 } },
      0, "ORBIT"
    );
    const ctrl = fg.controls?.();
    if (ctrl) {
      // Disable OrbitControls native zoom — we fully own scroll zoom
      ctrl.enableZoom = false;
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.1;
      ctrl.enableRotate = true;
      ctrl.enablePan = true;
      ctrl.screenSpacePanning = true;
      ctrl.minPolarAngle = 0;
      ctrl.maxPolarAngle = Math.PI;

      ctrl.addEventListener("start", () => {
        if (cameraStateRef.current.mode !== "FLY_TO") {
          cameraStateRef.current = { mode: "USER_CONTROL" };
        }
      });
      ctrl.addEventListener("end", () => {
        if (cameraStateRef.current.mode === "USER_CONTROL") {
          const inSubView = selectedEdgeRef.current || selectedGraphIdRef.current;
          cameraStateRef.current = { mode: inSubView ? "SETTLED" : "ORBIT" };
        }
      });
    }

    // ── Cursor-directed zoom (hybrid: cursor zoom when close, re-center when far) ──
    const renderer = fg.renderer?.();
    if (renderer && ctrl) {
      const canvas = renderer.domElement;
      let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

      // Track mouse NDC for cursor-directed raycasting
      const onMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouseNdcRef.current = {
          x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
        };
      };
      canvas.addEventListener("mousemove", onMouseMove);


      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (cameraStateRef.current.mode === "FLY_TO") return;

        const delta = e.deltaY / 100; // normalize across browsers
        // Accumulate velocity (additive — rapid scrolling builds momentum)
        zoomVelocityRef.current += delta * 0.08;
        zoomVelocityRef.current = Math.max(-0.5, Math.min(0.5, zoomVelocityRef.current));
        zoomInertiaActiveRef.current = true;

        // Pause orbit while scrolling
        if (cameraStateRef.current.mode !== "USER_CONTROL") {
          cameraStateRef.current = { mode: "USER_CONTROL" };
        }
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          if (cameraStateRef.current.mode === "USER_CONTROL" && !zoomInertiaActiveRef.current) {
            const stillInSubView = selectedEdgeRef.current || selectedGraphIdRef.current;
            cameraStateRef.current = { mode: stillInSubView ? "SETTLED" : "ORBIT" };
          }
        }, 800);
      };

      canvas.addEventListener("wheel", onWheel, { passive: false });
      wheelCleanupRef.current = () => {
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("mousemove", onMouseMove);
        if (scrollTimeout) clearTimeout(scrollTimeout);
      };
    }
  }, [requestCameraFlyTo]);

  // Reposition camera when bubble size changes (data load, node count change)
  useEffect(() => {
    if (!graphRef.current || selectedEdgeRef.current) return;
    requestCameraFlyTo(
      { pos: { x: 0, y: 0, z: defaultCamDist }, lookAt: { x: 0, y: 0, z: 0 } },
      0, "ORBIT"
    );
  }, [defaultCamDist, requestCameraFlyTo]);

  // After simulation settles, center camera on the graph's center of mass
  const adaptiveCamDistRef = useRef<number>(0); // actual fitted distance from onEngineStop
  const hasCenteredRef = useRef(false);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onEngineStop = useCallback(() => {
    onReadyRef.current?.();
    if (hasCenteredRef.current || !graphRef.current) return;
    hasCenteredRef.current = true;
    if (selectedEdgeRef.current) return;

    const fg = graphRef.current;
    // Measure actual node bounding sphere — fit camera to reality, not theory
    let maxDist = 0;
    for (const node of dataRef.current.nodes) {
      const n = node as any;
      if (!("x" in n)) continue;
      const d = Math.sqrt((n.x || 0) ** 2 + (n.y || 0) ** 2 + (n.z || 0) ** 2);
      if (d > maxDist) maxDist = d;
    }
    const cam = fg.camera?.();
    const vFov = ((cam?.fov || 75) * Math.PI) / 180;
    const aspect = (width && height) ? width / height : 1;
    const actualR = Math.max(maxDist, 50);
    const fitH = actualR / Math.tan(vFov / 2);
    const fitW = actualR / (Math.tan(vFov / 2) * aspect);
    const config = vizConfigRef.current;
    const adaptiveDist = Math.max(fitH, fitW) * config.cameraFitMargin;

    adaptiveCamDistRef.current = adaptiveDist;
    requestCameraFlyTo(
      { pos: { x: 0, y: 0, z: adaptiveDist }, lookAt: { x: 0, y: 0, z: 0 } },
      800, "ORBIT"
    );
  }, [width, height, requestCameraFlyTo]); // reads data via dataRef — no dep on data

  // Reheat simulation when center mode changes — camera handled by onEngineStop
  useEffect(() => {
    if (!graphRef.current || selectedEdgeRef.current) return;
    hasCenteredRef.current = false;
    adaptiveCamDistRef.current = 0;
    graphRef.current.d3ReheatSimulation();
  }, [centerMode]);

  // Update forces when vizMode changes — recalculate k with new bubble, swap params, reheat
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const k = optimalKRef.current;
    const p = VIZ_CONFIGS[vizMode];

    const charge = fg.d3Force("charge");
    if (charge) {
      charge.strength(-p.chargeFactor * k * k / 100);
      charge.distanceMax(p.distMaxFactor * k);
    }
    const link = fg.d3Force("link");
    if (link) {
      link.distance(p.linkDistFactor * k);
      link.strength(p.linkStrength);
    }
    hasCenteredRef.current = false;
    adaptiveCamDistRef.current = 0;
    fg.d3ReheatSimulation();
  }, [vizMode]);

  // Refs for rAF orbit tick (avoids stale closures)
  const hoveredLinkRef = useRef<boolean>(false);
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  hoveredNodeIdRef.current = hoveredNodeId;
  const selectedEdgeRef = useRef(selectedEdge);
  selectedEdgeRef.current = selectedEdge;
  const dataRef = useRef(data);
  dataRef.current = data;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const onAutoRotateChangeRef = useRef(onAutoRotateChange);
  onAutoRotateChangeRef.current = onAutoRotateChange;
  const wasInsideBubbleRef = useRef(false);
  const selectedGraphIdRef = useRef(selectedGraphId);
  selectedGraphIdRef.current = selectedGraphId;

  // ── Unified tick loop: camera state machine + zoom/LOD + orbit ──
  const vizConfigRef = useRef(activeConfig);
  vizConfigRef.current = activeConfig;

  useEffect(() => {
    let raf: number;
    let stopped = false;
    let angle = 0;

    const easeInOutQuart = (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const tick = () => {
      if (stopped) return;
      const fg = graphRef.current;
      if (!fg) { raf = requestAnimationFrame(tick); return; }

      const cam = fg.camera?.();
      const controls = fg.controls?.();
      const config = vizConfigRef.current;
      const state = cameraStateRef.current;

      // ── Zoom level & LOD (every frame) ──
      if (cam) {
        // Use distance to controls target (not origin) for sub-view accuracy
        const dist = controls?.target
          ? cam.position.distanceTo(controls.target)
          : cam.position.length();
        const refDist = adaptiveCamDistRef.current || defaultCamDistRef.current;
        zoomLevelRef.current = refDist > 0 ? dist / refDist : 1.0;

        // Dynamic near/far plane: prevents z-fighting and clipping at close zoom
        const desiredNear = Math.max(1, dist * 0.01);
        const desiredFar = Math.max(dist * 100, bubbleRadiusRef.current * 10);
        if (Math.abs(cam.near - desiredNear) > 0.5) {
          cam.near = desiredNear;
          cam.far = desiredFar;
          cam.updateProjectionMatrix();
        }

        // Auto-toggle rotation: pause inside bubble, play outside
        // Use distance to controls.target (not origin) for accuracy when target has drifted
        const camToTarget = controls?.target
          ? cam.position.distanceTo(controls.target)
          : cam.position.length();
        const insideBubble = camToTarget < bubbleRadiusRef.current * 0.3;
        if (insideBubble !== wasInsideBubbleRef.current) {
          wasInsideBubbleRef.current = insideBubble;
          onAutoRotateChangeRef.current?.(!insideBubble);
        }

        const newLod = computeLOD(zoomLevelRef.current, config);
        if (newLod !== prevLodRef.current) {
          const crossesGeometry = (prevLodRef.current === "far") !== (newLod === "far");
          prevLodRef.current = newLod;
          lodLevelRef.current = newLod;
          if (crossesGeometry) {
            // Swap shared geometries in-place instead of clearing cache + full rebuild
            if (lodDebounceRef.current) clearTimeout(lodDebounceRef.current);
            lodDebounceRef.current = setTimeout(() => {
              const isHigh = newLod !== "far";
              for (const [, obj] of nodeObjectCache.current) {
                const isGroup = obj instanceof THREE.Group;
                const mesh = isGroup ? (obj.children[0] as THREE.Mesh) : (obj as THREE.Mesh);
                if (!mesh?.isMesh) continue;
                const isEnt = (isGroup ? obj : mesh).userData?.isEntity;
                mesh.geometry = isEnt
                  ? (isHigh ? SHARED_GEO.octaHi : SHARED_GEO.octaLo)
                  : (isHigh ? SHARED_GEO.sphereHi : SHARED_GEO.sphereLo);
                // Swap halo geometry too
                if (isGroup && obj.children[1] instanceof THREE.Mesh) {
                  obj.children[1].geometry = isHigh ? SHARED_GEO.haloHi : SHARED_GEO.haloLo;
                }
              }
            }, 100);
          }
        }
      }

      // ── Update frustum for culling ──
      if (cam) {
        cam.updateMatrixWorld();
        frustumMatRef.current.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        frustumRef.current.setFromProjectionMatrix(frustumMatRef.current);
      }

      // ── Node zoom scaling (throttled: only iterate when scale changes >2%) ──
      if (cam && nodeObjectCache.current.size > 0) {
        const zl = zoomLevelRef.current;
        const nodeScale = Math.min(1.8, Math.max(0.4, 1 / Math.sqrt(Math.max(0.15, zl))));
        if (Math.abs(nodeScale - prevNodeScaleRef.current) > 0.02) {
          prevNodeScaleRef.current = nodeScale;
          for (const [, group] of nodeObjectCache.current) {
            // Skip off-screen nodes (frustum culling)
            if (!frustumRef.current.containsPoint(group.position)) continue;
            const pinScale = group.userData?.pinned ? 1.2 : 1.0;
            group.scale.setScalar(nodeScale * pinScale);
          }
        }
      }

      // ── Zoom limits ──
      if (controls) {
        const inSubView = selectedEdgeRef.current || selectedGraphIdRef.current;
        const transitioning = !hasCenteredRef.current && !inSubView;
        const globalMinDist = Math.max(
          maxNodeHaloRadiusRef.current * 2.0,
          bubbleRadiusRef.current * 0.08,
          50
        );
        const minD = inSubView
          ? zoomMinDistRef.current
          : globalMinDist;
        const baseMax = adaptiveCamDistRef.current || defaultCamDistRef.current;
        // During mode transitions, allow generous zoom until onEngineStop recalculates
        const maxD = inSubView
          ? zoomMaxDistRef.current
          : transitioning ? baseMax * 5 : baseMax * config.zoomMaxFactor;
        controls.minDistance = minD;
        controls.maxDistance = maxD;

        // Distance-adaptive: far = fast rotate + slow pan, close = fast pan + slow rotate
        // sqrt(zl) for rotation gives graceful falloff at close distances
        const clampedZl = Math.max(0.05, zoomLevelRef.current);
        if ((controls as any).panSpeed !== undefined)
          (controls as any).panSpeed = Math.max(0.1, Math.min(2.0, 0.8 / clampedZl));
        if ((controls as any).rotateSpeed !== undefined)
          (controls as any).rotateSpeed = Math.max(0.15, Math.min(1.5, 0.5 * Math.sqrt(clampedZl)));

        // ── Camera boundary enforcement: never let camera inside the min distance ──
        if (cam && state.mode !== "FLY_TO") {
          const camToTarget = cam.position.distanceTo(controls.target);
          if (camToTarget < minD) {
            const dir = cam.position.clone().sub(controls.target).normalize();
            cam.position.copy(controls.target).addScaledVector(dir, minD);
            controls.update();
          }
        }
      }

      // ── Camera state machine ──
      if (state.mode === "FLY_TO" && cam) {
        const elapsed = performance.now() - state.start;
        const t = easeInOutQuart(Math.min(1, elapsed / state.dur));
        cam.position.set(
          lerp(state.from.pos.x, state.to.pos.x, t),
          lerp(state.from.pos.y, state.to.pos.y, t),
          lerp(state.from.pos.z, state.to.pos.z, t),
        );
        const lx = lerp(state.from.lookAt.x, state.to.lookAt.x, t);
        const ly = lerp(state.from.lookAt.y, state.to.lookAt.y, t);
        const lz = lerp(state.from.lookAt.z, state.to.lookAt.z, t);
        cam.lookAt(lx, ly, lz);
        if (controls?.target) controls.target.set(lx, ly, lz);

        if (elapsed >= state.dur) {
          if (controls) {
            controls.enabled = true;
          }
          // Restore force simulation after camera transition
          try {
            const fg = graphRef.current;
            const p = VIZ_CONFIGS[vizModeRef.current];
            fg?.d3AlphaDecay?.(p.alphaDecay);
          } catch { /* noop */ }
          cameraStateRef.current = { mode: state.then };
        }
      } else if (state.mode === "ORBIT" && cam) {
        // Auto-rotate: orbit around gravity center, zoom-adaptive speed
        if (autoRotateRef.current && !hoveredNodeIdRef.current && !hoveredLinkRef.current) {
          angle += adaptiveOrbitSpeed(zoomLevelRef.current, config);

          let cx = 0, cy = 0, cz = 0;
          if (selectedEdgeRef.current) {
            const src = dataRef.current.nodes.find((n: any) => n.id === selectedEdgeRef.current!.sourceId) as any;
            const tgt = dataRef.current.nodes.find((n: any) => n.id === selectedEdgeRef.current!.targetId) as any;
            if (src && tgt && "x" in src && "x" in tgt) {
              cx = ((src.x || 0) + (tgt.x || 0)) / 2;
              cy = ((src.y || 0) + (tgt.y || 0)) / 2;
              cz = ((src.z || 0) + (tgt.z || 0)) / 2;
            }
          } else if (selectedGraphIdRef.current) {
            const node = dataRef.current.nodes.find((n: any) => n.id === selectedGraphIdRef.current) as any;
            if (node && "x" in node) {
              cx = node.x || 0; cy = node.y || 0; cz = node.z || 0;
            }
          }

          const dx = cam.position.x - cx;
          const dz = cam.position.z - cz;
          const r = Math.sqrt(dx * dx + dz * dz) || defaultCamDistRef.current;
          cam.position.x = cx + r * Math.sin(angle);
          cam.position.z = cz + r * Math.cos(angle);
          cam.lookAt(cx, cy, cz);
          if (controls?.target) controls.target.set(cx, cy, cz);
        }
      }
      // Re-centering now handled by zoom inertia tick below
      // USER_CONTROL and SETTLED: do nothing else, let OrbitControls handle it

      // ── Zoom inertia: apply accumulated velocity with exponential decay ──
      if (zoomInertiaActiveRef.current && cam && controls) {
        const vel = zoomVelocityRef.current;
        if (Math.abs(vel) > 0.0005) {
          const inSubView = selectedEdgeRef.current || selectedGraphIdRef.current;
          const pivot = inSubView ? zoomPivotRef.current : null;
          const distTarget = pivot
            ? new THREE.Vector3(pivot.x, pivot.y, pivot.z)
            : controls.target;
          const currentDist = cam.position.distanceTo(distTarget);

          // Distance change proportional to velocity * current distance
          let newDist = currentDist * (1 + vel);
          newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));

          if (Math.abs(newDist - currentDist) > 0.01) {
            const radiusDelta = currentDist - newDist; // positive when zooming in

            if (inSubView && pivot) {
              // Sub-view: zoom toward/away from pivot
              const pivotVec = new THREE.Vector3(pivot.x, pivot.y, pivot.z);
              const dir = cam.position.clone().sub(pivotVec).normalize();
              cam.position.copy(pivotVec).addScaledVector(dir, newDist);
              controls.target.copy(pivotVec);
            } else {
              // Global view: cursor-directed zoom
              const ndc = mouseNdcRef.current;
              const dollyDir = new THREE.Vector3(ndc.x, ndc.y, 0.5)
                .unproject(cam).sub(cam.position).normalize();

              if (vel < 0) {
                // Zoom in: move both camera+target along cursor ray
                const offset = dollyDir.clone().multiplyScalar(radiusDelta);
                cam.position.add(offset);
                controls.target.add(offset);
              } else {
                // Zoom out: blend retreat toward center
                const zl = zoomLevelRef.current;
                const retreatDir = cam.position.clone().sub(controls.target).normalize();
                const centerRetreatDir = cam.position.clone().normalize();
                const centerBlend = smoothstep(0.7, 1.0, zl);
                retreatDir.lerp(centerRetreatDir, centerBlend).normalize();

                const retreatAmount = -radiusDelta;
                const offset = retreatDir.multiplyScalar(retreatAmount);
                cam.position.add(offset);
                controls.target.add(offset);

                // Snap target toward origin when fully zoomed out
                if (zl > 0.95) {
                  const td = controls.target.length();
                  if (td > 1.0) controls.target.multiplyScalar(0.92);
                }
              }
            }
            controls.update();
          }

          // Exponential decay (Cesium-style momentum)
          zoomVelocityRef.current *= ZOOM_INERTIA_DECAY;
        } else {
          // Velocity exhausted — stop inertia and return to idle state
          zoomVelocityRef.current = 0;
          zoomInertiaActiveRef.current = false;
          if (cameraStateRef.current.mode === "USER_CONTROL") {
            const stillInSubView = selectedEdgeRef.current || selectedGraphIdRef.current;
            cameraStateRef.current = { mode: stillInSubView ? "SETTLED" : "ORBIT" };
          }
        }
      }

      // ── Adaptive quality: swap to low-LOD during interaction ──
      const isInteracting = state.mode === "USER_CONTROL" || state.mode === "FLY_TO";
      if (isInteracting && !interactionLodRef.current && nodeObjectCache.current.size > 0) {
        interactionLodRef.current = true;
        if (interactionLodTimerRef.current) clearTimeout(interactionLodTimerRef.current);
        for (const [, obj] of nodeObjectCache.current) {
          const isGroup = obj instanceof THREE.Group;
          const mesh = isGroup ? (obj.children[0] as THREE.Mesh) : (obj as THREE.Mesh);
          if (!mesh?.isMesh) continue;
          const isEnt = (isGroup ? obj : mesh).userData?.isEntity;
          mesh.geometry = isEnt ? SHARED_GEO.octaLo : SHARED_GEO.sphereLo;
          if (isGroup && obj.children[1] instanceof THREE.Mesh) {
            obj.children[1].geometry = SHARED_GEO.haloLo;
          }
        }
      } else if (!isInteracting && interactionLodRef.current) {
        // Debounced restore to proper LOD after interaction ends
        if (!interactionLodTimerRef.current) {
          interactionLodTimerRef.current = setTimeout(() => {
            interactionLodTimerRef.current = null;
            interactionLodRef.current = false;
            const isHigh = lodLevelRef.current !== "far";
            for (const [, obj] of nodeObjectCache.current) {
              const isGroup = obj instanceof THREE.Group;
              const mesh = isGroup ? (obj.children[0] as THREE.Mesh) : (obj as THREE.Mesh);
              if (!mesh?.isMesh) continue;
              const isEnt = (isGroup ? obj : mesh).userData?.isEntity;
              mesh.geometry = isEnt
                ? (isHigh ? SHARED_GEO.octaHi : SHARED_GEO.octaLo)
                : (isHigh ? SHARED_GEO.sphereHi : SHARED_GEO.sphereLo);
              if (isGroup && obj.children[1] instanceof THREE.Mesh) {
                obj.children[1].geometry = isHigh ? SHARED_GEO.haloHi : SHARED_GEO.haloLo;
              }
            }
          }, 500);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { stopped = true; cancelAnimationFrame(raf); wheelCleanupRef.current?.(); };
  }, []);

  // Force node object refresh only on structural changes that require full rebuild
  // hoveredNodeId, pinnedNodeId handled by in-place material update effect
  // visibleMemoryIds handled by nodeVisibility callback
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGraphId, selectedEdge, connectionMap, centerMode, hideEdges]);

  // --- Edge styling ---

  const getLinkColor = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      const linkType = link.linkType || "relates";

      const linkTypeColor = LINK_TYPE_COLORS[linkType] || "#6b7280";

      // Selected edge: highlight the specific edge (or all path edges), dim others
      if (selectedEdge) {
        const isSelected = (src === selectedEdge.sourceId && tgt === selectedEdge.targetId) ||
                           (src === selectedEdge.targetId && tgt === selectedEdge.sourceId);
        const hp = highlightedPathRef.current;
        const isPathEdge = hp ? (hp.has(src) && hp.has(tgt)) : false;
        return (isSelected || isPathEdge) ? hexAlpha(linkTypeColor, 1.0) : "rgba(200,200,200,0.08)";
      }

      // Selected node: highlight connections
      if (selectedGraphId && connectionMap) {
        if (src === selectedGraphId || tgt === selectedGraphId) {
          const otherId = src === selectedGraphId ? tgt : src;
          const connStrength = connectionMap.get(otherId) ?? 0;
          return hexAlpha(linkTypeColor, 0.3 + connStrength * 0.7);
        }
        return "rgba(200,200,200,0.15)";
      }

      // Mode-aware edge color with zoom-adaptive opacity
      const zl = zoomLevelRef.current;
      const cfg = VIZ_CONFIGS[vizModeRef.current];
      const ef = edgeFocusRef.current;
      const normalizedStrength = (link.value || 1) / maxLinkValue;
      const opacityBoost = ef ? 2.5 : 1.0;
      if (centerMode === "retrieved") {
        const srcScore = retrievalCentrality.get(src) ?? 0;
        const tgtScore = retrievalCentrality.get(tgt) ?? 0;
        const avg = (srcScore + tgtScore) / 2;
        const blended = Math.max(avg, normalizedStrength * 0.5);
        return hexAlpha(linkTypeColor, Math.min(1, adaptiveEdgeOpacity(blended, zl, cfg) * opacityBoost));
      }
      if (centerMode === "combined") {
        const srcScore = retrievalCentrality.get(src) ?? 0;
        const tgtScore = retrievalCentrality.get(tgt) ?? 0;
        const retAvg = (srcScore + tgtScore) / 2;
        const combined = Math.max(normalizedStrength, retAvg);
        return hexAlpha(linkTypeColor, Math.min(1, adaptiveEdgeOpacity(combined, zl, cfg) * opacityBoost));
      }

      // Reinforcement mode: scale by structural link weight
      return hexAlpha(linkTypeColor, Math.min(1, adaptiveEdgeOpacity(normalizedStrength, zl, cfg) * opacityBoost));
    },
    [selectedGraphId, selectedEdge, connectionMap, maxLinkValue, centerMode, retrievalCentrality, edgeFocus]
  );

  const getLinkWidth = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      // Selected edge: make it thick (or all path edges), dim others
      if (selectedEdge) {
        const isSelected = (src === selectedEdge.sourceId && tgt === selectedEdge.targetId) ||
                           (src === selectedEdge.targetId && tgt === selectedEdge.sourceId);
        const hp = highlightedPathRef.current;
        const isPathEdge = hp ? (hp.has(src) && hp.has(tgt)) : false;
        return isSelected ? 3 : isPathEdge ? 1.5 : 0.05;
      }

      // Selected node: highlight connections
      if (selectedGraphId && connectionMap) {
        if (src === selectedGraphId || tgt === selectedGraphId) {
          const otherId = src === selectedGraphId ? tgt : src;
          const connStrength = connectionMap.get(otherId) ?? 0;
          return 0.8 + connStrength * 4;
        }
        return 0.05;
      }

      // Mode-aware width with zoom-adaptive scaling
      const zl = zoomLevelRef.current;
      const cfg = VIZ_CONFIGS[vizModeRef.current];
      const ef = edgeFocusRef.current;
      const widthBoost = ef ? 3.0 : 1.0;
      const normalizedStrength = (link.value || 1) / maxLinkValue;
      if (centerMode === "retrieved") {
        const srcScore = retrievalCentrality.get(src) ?? 0;
        const tgtScore = retrievalCentrality.get(tgt) ?? 0;
        const avg = (srcScore + tgtScore) / 2;
        const blended = Math.max(avg, normalizedStrength * 0.5);
        return adaptiveEdgeWidth(blended, zl, cfg) * widthBoost;
      }
      if (centerMode === "combined") {
        const srcScore = retrievalCentrality.get(src) ?? 0;
        const tgtScore = retrievalCentrality.get(tgt) ?? 0;
        const retAvg = (srcScore + tgtScore) / 2;
        const combined = Math.max(normalizedStrength, retAvg);
        return adaptiveEdgeWidth(combined, zl, cfg) * widthBoost;
      }

      // Reinforcement mode: scale by structural link weight
      return adaptiveEdgeWidth(normalizedStrength, zl, cfg) * widthBoost;
    },
    [selectedGraphId, selectedEdge, connectionMap, maxLinkValue, centerMode, retrievalCentrality, edgeFocus]
  );

  const getLinkParticles = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!selectedGraphId || !connectionMap) return 0;

      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      if (src === selectedGraphId || tgt === selectedGraphId) {
        const otherId = src === selectedGraphId ? tgt : src;
        const strength = connectionMap.get(otherId) ?? 0;
        return Math.round(strength * 3); // smooth 0-3 particle ramp
      }
      return 0;
    },
    [selectedGraphId, connectionMap]
  );

  const getLinkParticleColor = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const linkType = link.linkType || "relates";
      return LINK_TYPE_COLORS[linkType] || "#888";
    },
    []
  );

  const handleNodeClick = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setPinnedLinkKey(null);
      setPinnedNodeId(null);
      // Zoom camera to node — use numericId directly from node data
      if (node.numericId != null) onNodeSelect?.(node.numericId);
    },
    [onNodeSelect]
  );

  // Focus camera on selected node — distance derived from optimalK
  useEffect(() => {
    if (!selectedGraphId || !graphRef.current) return;
    const node = data.nodes.find((n: any) => n.id === selectedGraphId) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!node || !("x" in node)) return;
    const distance = optimalKRef.current * 2;
    const nodeLen = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
    const distRatio = 1 + distance / nodeLen;
    // Set zoom pivot and zoom bounds for scroll-zoom in single view
    // Min distance = node's halo radius so camera never clips through
    const config = VIZ_CONFIGS[vizModeRef.current];
    const nRadius = nodeRadius(node.val || 1, 1, optimalKRef.current, config);
    const nodeHalo = nRadius * 3.0;
    zoomPivotRef.current = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
    zoomMinDistRef.current = Math.max(nodeHalo * 2.0, optimalKRef.current * 0.5);
    zoomMaxDistRef.current = distance * 4;
    requestCameraFlyTo(
      {
        pos: {
          x: (node.x || 0) * distRatio,
          y: (node.y || 0) * distRatio,
          z: (node.z || 0) * distRatio,
        },
        lookAt: { x: node.x || 0, y: node.y || 0, z: node.z || 0 },
      },
      1000, "SETTLED"
    );
  }, [selectedGraphId, data.nodes, requestCameraFlyTo]);

  // Focus camera on edge midpoint when selectedEdge changes
  // Only runs once per edge selection (not on every data.nodes tick)
  const edgeCameraSetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedEdge || !graphRef.current) return;
    // Only run once per edge (not when highlightedPath changes or nodes tick)
    const edgeKey = selectedEdge.sourceId + '-' + selectedEdge.targetId;
    if (edgeCameraSetRef.current === edgeKey) return;
    const srcNode = data.nodes.find((n: any) => n.id === selectedEdge.sourceId) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const tgtNode = data.nodes.find((n: any) => n.id === selectedEdge.targetId) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!srcNode || !tgtNode || !('x' in srcNode) || !('x' in tgtNode)) return;
    edgeCameraSetRef.current = edgeKey;
    const mid = {
      x: ((srcNode.x || 0) + (tgtNode.x || 0)) / 2,
      y: ((srcNode.y || 0) + (tgtNode.y || 0)) / 2,
      z: ((srcNode.z || 0) + (tgtNode.z || 0)) / 2,
    };
    // Set zoom pivot and zoom bounds for scroll-zoom in single view
    zoomPivotRef.current = mid;
    const nodeDist = Math.hypot(
      (srcNode.x || 0) - (tgtNode.x || 0),
      (srcNode.y || 0) - (tgtNode.y || 0),
      (srcNode.z || 0) - (tgtNode.z || 0)
    );
    // Camera distance: use same formula as dolly (bounding sphere fit)
    // At depth 0 the "cluster" is just the 2 endpoints → radius = nodeDist/2
    const cam = graphRef.current.camera?.();
    const vFov = ((cam?.fov || 75) * Math.PI) / 180;
    const camDist = Math.max(80, (nodeDist / 2) / Math.tan(vFov / 2) * 3.2);
    // Min distance = largest endpoint halo so camera never clips through nodes/edge
    const eConfig = VIZ_CONFIGS[vizModeRef.current];
    const srcHalo = nodeRadius(srcNode.val || 1, 1, optimalKRef.current, eConfig) * 3.0;
    const tgtHalo = nodeRadius(tgtNode.val || 1, 1, optimalKRef.current, eConfig) * 3.0;
    zoomMinDistRef.current = Math.max(Math.max(srcHalo, tgtHalo) * 2.0, optimalKRef.current * 0.5);
    zoomMaxDistRef.current = camDist * 4;
    // Direction: from midpoint outward (or default up-right if midpoint is near origin)
    const midLen = Math.hypot(mid.x, mid.y, mid.z);
    const dir = midLen > 1
      ? { x: mid.x / midLen, y: mid.y / midLen, z: mid.z / midLen }
      : { x: 0.57, y: 0.57, z: 0.57 }; // default direction if near origin
    requestCameraFlyTo(
      { pos: { x: mid.x + dir.x * camDist, y: mid.y + dir.y * camDist, z: mid.z + dir.z * camDist }, lookAt: mid },
      1200, "SETTLED"
    );
  }, [selectedEdge, data.nodes, requestCameraFlyTo]);

  // Reset camera to default when exiting edge/node view
  const prevSelectedEdgeRef = useRef(selectedEdge);
  const prevSelectedGraphIdRef = useRef(selectedGraphId);
  useEffect(() => {
    const wasEdge = prevSelectedEdgeRef.current;
    const wasNode = prevSelectedGraphIdRef.current;
    prevSelectedEdgeRef.current = selectedEdge;
    prevSelectedGraphIdRef.current = selectedGraphId;

    if ((wasEdge && !selectedEdge) || (wasNode && !selectedGraphId)) {
      edgeCameraSetRef.current = null;
      zoomPivotRef.current = null;
      zoomMinDistRef.current = Math.max(
        maxNodeHaloRadiusRef.current * 2.0,
        bubbleRadiusRef.current * 0.08,
        50
      );
      zoomMaxDistRef.current = defaultCamDistRef.current;
      const dist = adaptiveCamDistRef.current || defaultCamDistRef.current;
      requestCameraFlyTo(
        { pos: { x: 0, y: 0, z: dist }, lookAt: { x: 0, y: 0, z: 0 } },
        800, "ORBIT"
      );
    }
  }, [selectedEdge, selectedGraphId, requestCameraFlyTo]);

  const handleNodeHover = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setHoveredNodeId(node ? node.id : null);
      const el = document.querySelector("canvas");
      if (el) el.style.cursor = node ? "grab" : "default";
    },
    []
  );

  const handleLinkHover = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      hoveredLinkRef.current = !!link;
      const el = document.querySelector("canvas");
      if (el) el.style.cursor = link ? "pointer" : (hoveredNodeIdRef.current ? "grab" : "default");
    },
    []
  );

  const handleLinkClick = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setPinnedNodeId(null);
      setPinnedLinkKey(null);
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      const srcNumeric = nodeNumericIdMap.get(srcId);
      const tgtNumeric = nodeNumericIdMap.get(tgtId);
      if (srcNumeric != null && tgtNumeric != null) {
        onEdgeSelect?.({
          sourceId: srcId,
          targetId: tgtId,
          sourceNumericId: srcNumeric,
          targetNumericId: tgtNumeric,
          linkType: link.linkType || "relates",
          strength: typeof link.value === "number" ? link.value : 0,
        });
      }
    },
    [nodeNumericIdMap, onEdgeSelect]
  );

  // Build pinned card content
  const pinnedCardContent = useMemo(() => {
    if (pinnedNodeId) {
      const node = data.nodes.find((n) => n.id === pinnedNodeId);
      if (!node) return null;
      if (node.isEntity) {
        return { type: "entity" as const, node };
      }
      const mem = memories.find((m) => m.id === node.numericId);
      if (!mem) return null;
      const linkCount = data.links.filter((l: any) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return s === node.id || t === node.id;
      }).length;
      return { type: "memory" as const, node, mem, linkCount };
    }
    if (pinnedLinkKey) {
      const [srcId, tgtId] = pinnedLinkKey.split("|");
      const link = data.links.find((l: any) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return (s === srcId && t === tgtId) || (s === tgtId && t === srcId);
      });
      if (!link) return null;
      const src = data.nodes.find((n) => n.id === srcId);
      const tgt = data.nodes.find((n) => n.id === tgtId);
      return { type: "edge" as const, link, src, tgt };
    }
    return null;
  }, [pinnedNodeId, pinnedLinkKey, data, memories]);

  // Notify parent of pinned content changes
  useEffect(() => {
    onPinnedContentChange?.(pinnedCardContent);
  }, [pinnedCardContent, onPinnedContentChange]);

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: "var(--text-faint)" }}>
        <div className="text-center">
          <p className="t-heading">No memories yet</p>
          <p className="mt-1 t-small" style={{ color: "var(--text-faint)" }}>Chat to create your first memories</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width, height }}>
    <ForceGraph3D
      controlType="orbit"
      ref={graphRefCallback as any} // eslint-disable-line @typescript-eslint/no-explicit-any
      graphData={data}
      linkId="id"
      nodeVisibility={nodeVisibility}
      linkVisibility={linkVisibility}
      width={width}
      height={height}
      nodeLabel={(node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (node.id === pinnedNodeId) return ""; // don't show hover tooltip for pinned node
        const cardStyle = "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;background:rgba(255,255,255,0.95);padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);max-width:240px;backdrop-filter:blur(12px);box-shadow:none";
        const dimStyle = "color:rgba(0,0,0,0.35);font-size:8px";
        const valStyle = "color:rgba(0,0,0,0.6);font-size:8px;font-variant-numeric:tabular-nums";

        if (node.isEntity) {
          const titleStyle = "color:rgba(0,0,0,0.25);font-size:7px;text-transform:uppercase;letter-spacing:0.01em;margin-bottom:5px";
          return `<div style="${cardStyle}">
            <div style="${titleStyle}">Entity</div>
            <div style="color:${ENTITY_COLORS[node.type] || DEFAULT_ENTITY_COLOR};font-size:8px;text-transform:uppercase;letter-spacing:0.01em;font-weight:500">entity · ${node.type}</div>
            <div style="color:rgba(0,0,0,0.75);font-size:10px;margin-top:3px;line-height:1.4">${node.name}</div>
          </div>`;
        }

        const mem = memories.find((m) => m.id === node.numericId);
        if (!mem) return node.name;

        const rawLinks = data.links.filter((l: any) => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          return s === node.id || t === node.id;
        }).length;

        const strength = connectionMap?.get(node.id);
        const linkType = asyncLinkTypes?.get(node.id);
        const strengthRow = selectedGraphId && node.id !== selectedGraphId && strength !== undefined
          ? `<div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">${viewMode === "retrieved" ? "relevance" : "hebbian"}</span><span style="${valStyle}">${Math.round(strength * 100)}%${linkType ? ` · ${linkType}` : ""}</span></div>`
          : "";

        const titleStyle = "color:rgba(0,0,0,0.25);font-size:7px;text-transform:uppercase;letter-spacing:0.01em;margin-bottom:5px";

        return `<div style="${cardStyle}">
          <div style="${titleStyle}">Memory</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <div style="width:5px;height:5px;border-radius:50%;background:${TYPE_COLORS[mem.memory_type]};flex-shrink:0"></div>
            <span style="color:rgba(0,0,0,0.4);font-size:8px;text-transform:uppercase;letter-spacing:0.01em">${mem.memory_type.replace("_", " ")}</span>
          </div>
          <div style="color:rgba(0,0,0,0.8);font-size:10px;line-height:1.4;margin-bottom:6px">${mem.summary}</div>
          <div style="display:flex;flex-direction:column;gap:2px;border-top:1px solid rgba(0,0,0,0.06);padding-top:5px">
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">recalls</span><span style="${valStyle}">${mem.access_count ?? 0}</span></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">links</span><span style="${valStyle}">${rawLinks}</span></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">importance</span><span style="${valStyle}">${Math.round(mem.importance * 100)}%</span></div>
            ${strengthRow}
          </div>
        </div>`;
      }}
      nodeThreeObject={nodeThreeObject}
      onNodeHover={handleNodeHover}
      onLinkHover={handleLinkHover}
      linkHoverPrecision={16}
      linkLabel={(link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const linkType = link.linkType || "relates";
        const color = LINK_TYPE_COLORS[linkType] || "#6b7280";
        const label = LINK_TYPE_LABELS[linkType] || linkType;
        const weight = typeof link.value === "number" ? Math.round(link.value * 100) : "—";

        const src = typeof link.source === "object" ? link.source : data.nodes.find((n: any) => n.id === link.source);
        const tgt = typeof link.target === "object" ? link.target : data.nodes.find((n: any) => n.id === link.target);
        const srcName = src?.name || src?.id || "?";
        const tgtName = tgt?.name || tgt?.id || "?";

        const cardStyle = "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;background:rgba(255,255,255,0.95);padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);max-width:240px;backdrop-filter:blur(12px);box-shadow:none";
        const dimStyle = "color:rgba(0,0,0,0.35);font-size:8px";
        const valStyle = "color:rgba(0,0,0,0.6);font-size:8px;font-variant-numeric:tabular-nums";

        const titleStyle = "color:rgba(0,0,0,0.25);font-size:7px;text-transform:uppercase;letter-spacing:0.01em;margin-bottom:5px";

        return `<div style="${cardStyle}">
          <div style="${titleStyle}">Edge</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <div style="width:8px;height:3px;border-radius:1px;background:${color};flex-shrink:0"></div>
            <span style="color:${color};font-size:8px;text-transform:uppercase;letter-spacing:0.01em;font-weight:500">${label}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;border-top:1px solid rgba(0,0,0,0.06);padding-top:5px">
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">from</span><span style="${valStyle};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${srcName}</span></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">to</span><span style="${valStyle};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tgtName}</span></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">weight</span><span style="${valStyle}">${weight}%</span></div>
          </div>
        </div>`;
      }}
      linkColor={getLinkColor}
      linkWidth={getLinkWidth}
      linkOpacity={1}
      linkDirectionalParticles={getLinkParticles}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleWidth={1.5}
      linkDirectionalParticleColor={getLinkParticleColor}
      backgroundColor="rgba(0,0,0,0)"
      onNodeClick={handleNodeClick}
      onLinkClick={handleLinkClick}
      onBackgroundClick={() => { setPinnedNodeId(null); setPinnedLinkKey(null); onBackgroundSelect?.(); }}
      onEngineStop={onEngineStop}
      enableNodeDrag={true}
      warmupTicks={activeConfig.warmupTicks}
      cooldownTicks={120}
      cooldownTime={activeConfig.cooldownTime}
      d3AlphaDecay={activeConfig.alphaDecay}
      d3VelocityDecay={activeConfig.velocityDecay}
    />
    </div>
  );
});

export interface SelectedEdgeInfo {
  sourceId: string;
  targetId: string;
  sourceNumericId: number;
  targetNumericId: number;
  linkType: string;
  strength: number;
}

export function PinnedCardBody({ content, onOpenMemory, onOpenEdge, onClose }: { content: any; onOpenMemory?: (id: number) => void; onOpenEdge?: (edge: SelectedEdgeInfo) => void; onClose: () => void }) {
  const dim = { color: "rgba(0,0,0,0.35)", fontSize: 8 };
  const val = { color: "rgba(0,0,0,0.6)", fontSize: 8 };
  const title = { color: "rgba(0,0,0,0.25)", fontSize: 7, textTransform: "uppercase" as const, letterSpacing: "0.01em", marginBottom: 5 };
  const closeBtn = (
    <button
      onClick={onClose}
      style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.3)", fontSize: 12, lineHeight: 1, padding: 2, fontFamily: "inherit" }}
      title="Close"
    >
      ×
    </button>
  );

  if (content.type === "entity") {
    return (
      <>
        {closeBtn}
        <div style={title}>Entity</div>
        <div style={{ color: ENTITY_COLORS[content.node.type] || DEFAULT_ENTITY_COLOR, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.01em", fontWeight: 500 }}>entity · {content.node.type}</div>
        <div style={{ color: "rgba(0,0,0,0.75)", fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>{content.node.name}</div>
      </>
    );
  }

  if (content.type === "memory") {
    const { mem, linkCount } = content;
    return (
      <>
        {closeBtn}
        <div style={title}>Memory</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: TYPE_COLORS[mem.memory_type], flexShrink: 0 }} />
          <span style={{ color: "rgba(0,0,0,0.4)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.01em" }}>{mem.memory_type.replace("_", " ")}</span>
        </div>
        <div style={{ color: "rgba(0,0,0,0.8)", fontSize: 10, lineHeight: 1.4, marginBottom: 6 }}>{mem.summary}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>recalls</span><span style={val}>{mem.access_count ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>links</span><span style={val}>{linkCount}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>importance</span><span style={val}>{Math.round(mem.importance * 100)}%</span></div>
        </div>
        <button
          onClick={() => { if (mem.id != null) onOpenMemory?.(mem.id); }}
          style={{ marginTop: 6, width: "100%", padding: "3px 0", borderRadius: 4, border: "1px solid rgba(0,0,0,0.08)", background: "transparent", color: "var(--accent)", fontSize: 8, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}
        >
          Open Memory
        </button>
      </>
    );
  }

  if (content.type === "edge") {
    const { link, src, tgt } = content;
    const linkType = link.linkType || "relates";
    const color = LINK_TYPE_COLORS[linkType] || "#6b7280";
    const label = LINK_TYPE_LABELS[linkType] || linkType;
    const weight = typeof link.value === "number" ? Math.round(link.value * 100) : "—";
    return (
      <>
        {closeBtn}
        <div style={title}>Edge</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <div style={{ width: 8, height: 3, borderRadius: 1, background: color, flexShrink: 0 }} />
          <span style={{ color, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.01em", fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>from</span><span style={{ ...val, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src?.name || "?"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>to</span><span style={{ ...val, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tgt?.name || "?"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>weight</span><span style={val}>{weight}%</span></div>
        </div>
        <button
          onClick={() => {
            if (src && tgt) {
              onOpenEdge?.({
                sourceId: src.id,
                targetId: tgt.id,
                sourceNumericId: src.numericId,
                targetNumericId: tgt.numericId,
                linkType,
                strength: typeof link.value === "number" ? link.value : 0,
              });
            }
          }}
          style={{ marginTop: 6, width: "100%", padding: "3px 0", borderRadius: 4, border: "1px solid rgba(0,0,0,0.08)", background: "transparent", color: "var(--accent)", fontSize: 8, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}
        >
          Open Path
        </button>
      </>
    );
  }

  return null;
}
