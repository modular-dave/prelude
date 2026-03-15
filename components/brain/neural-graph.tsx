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

interface NeuralGraphProps {
  onNodeSelect?: (memoryId: number) => void;
  selectedNodeId?: number | null;
  memoryFilter?: "all" | "inputs" | "outputs";
  typeFilter?: MemoryType[];
  centerMode?: "reinforced" | "retrieved";
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
}

export interface NeuralGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  clearPinned: () => void;
  resetView: () => void;
}

export const NeuralGraph = forwardRef<NeuralGraphHandle, NeuralGraphProps>(function NeuralGraph({ onNodeSelect, selectedNodeId, memoryFilter = "all", typeFilter, centerMode = "reinforced", width, height, autoRotate = true, timelineCutoff = Infinity, hideEdges = false, selectedEdge = null, highlightedPath = null, onPinnedContentChange, onBackgroundSelect, onEdgeSelect }, ref) {
  const { knowledgeGraph, memories, fetchMemoryLinks } = useMemory();
  // Derive viewMode from centerMode: reinforced → hebbian links, retrieved → retrieval similarity
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
        graphRef.current = null;
      }
    };
  }, []);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [pinnedLinkKey, setPinnedLinkKey] = useState<string | null>(null); // "srcId|tgtId"

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const fg = graphRef.current;
      if (!fg) return;
      const cam = fg.camera?.();
      if (!cam) return;
      const pos = cam.position;
      fg.cameraPosition(
        { x: pos.x * 0.75, y: pos.y * 0.75, z: pos.z * 0.75 },
        undefined, 300
      );
    },
    zoomOut: () => {
      const fg = graphRef.current;
      if (!fg) return;
      const cam = fg.camera?.();
      if (!cam) return;
      const pos = cam.position;
      fg.cameraPosition(
        { x: pos.x * 1.33, y: pos.y * 1.33, z: pos.z * 1.33 },
        undefined, 300
      );
    },
    clearPinned: () => {
      setPinnedNodeId(null);
      setPinnedLinkKey(null);
    },
    resetView: () => {
      const fg = graphRef.current;
      if (!fg) return;
      fg.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 800);
      // Reheat the force simulation so nodes re-settle
      try { fg.d3ReheatSimulation?.(); } catch { /* silent */ }
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
    const fp = `${nodeIds}|${links.length}`;
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

  // Bounding bubble: scale radius with node count
  const bubbleRadius = useMemo(() => {
    const count = data.nodes.length;
    return Math.max(120, 60 + Math.cbrt(count) * 40);
  }, [data.nodes.length]);

  // Default camera distance: fit the full sphere in the view height using FOV math
  // dist = radius / tan(vFov/2) with a small padding multiplier
  const defaultCamDist = useMemo(() => {
    const vFov = (75 * Math.PI) / 180; // default FOV
    return bubbleRadius / Math.tan(vFov / 2) * 1.15;
  }, [bubbleRadius]);
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

  // Clear node object cache on structural changes (NOT on highlight-only changes)
  useEffect(() => {
    nodeObjectCache.current.clear();
  }, [selectedGraphId, selectedEdge, connectionMap, hoveredNodeId, pinnedNodeId, centerMode, degreeCentrality, retrievalCentrality]);

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
      const modeScore = centerMode === "retrieved"
        ? (retrievalCentrality.get(node.id) ?? 0)
        : (degreeCentrality.get(node.id) ?? 0);
      const baseSize = Math.cbrt(node.val) * (1.4 + modeScore * 1.6);

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
            mat.opacity = 0.1;
            mat.emissive.set(typeColor);
            mat.emissiveIntensity = 0.0;
            if (halo) halo.visible = false;
          }
          return cached;
        }

        // First creation — build at highlighted size, always include halo
        const group = new THREE.Group();
        const geo = isEntity
          ? new THREE.OctahedronGeometry(baseSize * 1.3, 1)
          : new THREE.SphereGeometry(baseSize * 1.3, 20, 14);
        const mat = new THREE.MeshLambertMaterial({
          color: isEdgeNode ? "#ffffff" : typeColor,
          transparent: true,
          opacity: isEdgeNode ? 1.0 : 0.1,
          emissive: new THREE.Color(typeColor),
          emissiveIntensity: isEdgeNode ? 0.5 : 0.0,
        });
        group.add(new THREE.Mesh(geo, mat));
        // Always add halo (toggle visibility instead of create/destroy)
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(baseSize * 2.5, 16, 12),
          new THREE.MeshBasicMaterial({ color: typeColor, transparent: true, opacity: 0.15 })
        );
        halo.visible = isEdgeNode;
        group.add(halo);
        if (!isEdgeNode) group.scale.setScalar(0.6 / 1.3);
        nodeObjectCache.current.set(node.id, group);
        return group;
      }

      if (!selectedGraphId || !connectionMap) {
        // Default state: size reflects active metric, colors stay consistent
        const group = new THREE.Group();
        const highlight = isHovered || isPinned;
        const geo = isEntity
          ? new THREE.OctahedronGeometry(isPinned ? baseSize * 1.2 : baseSize, 1)
          : new THREE.SphereGeometry(isPinned ? baseSize * 1.2 : baseSize, 20, 14);
        const mat = new THREE.MeshLambertMaterial({
          color: isPinned ? "#ffffff" : typeColor,
          transparent: true,
          opacity: highlight ? 1.0 : 0.85,
          emissive: new THREE.Color(typeColor),
          emissiveIntensity: highlight ? 0.4 : 0.05,
        });
        group.add(new THREE.Mesh(geo, mat));

        if (highlight) {
          const halo = new THREE.Mesh(
            new THREE.SphereGeometry(baseSize * (isPinned ? 2.5 : 2), 16, 12),
            new THREE.MeshBasicMaterial({ color: typeColor, transparent: true, opacity: isPinned ? 0.15 : 0.08 })
          );
          group.add(halo);
        }
        return group;
      }

      if (node.id === selectedGraphId) {
        // Selected: bright core + type-colored glow halo
        const group = new THREE.Group();
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(baseSize * 1.3, 20, 14),
          new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 1.0 })
        );
        group.add(core);

        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(baseSize * 2.5, 16, 12),
          new THREE.MeshBasicMaterial({ color: typeColor, transparent: true, opacity: 0.12 })
        );
        group.add(halo);
        return group;
      }

      const strength = connectionMap.get(node.id);
      if (strength !== undefined) {
        const opacity = 0.3 + strength * 0.7;
        const size = baseSize * (0.7 + strength * 0.6);
        const geo = isEntity
          ? new THREE.OctahedronGeometry(size, 1)
          : new THREE.SphereGeometry(size, 16, 12);
        const mat = new THREE.MeshLambertMaterial({
          color: typeColor,
          transparent: true,
          opacity,
          emissive: new THREE.Color(typeColor),
          emissiveIntensity: strength * 0.4,
        });
        return new THREE.Mesh(geo, mat);
      }

      // Unrelated: small and dim
      const geo = isEntity
        ? new THREE.OctahedronGeometry(baseSize * 0.5, 0)
        : new THREE.SphereGeometry(baseSize * 0.5, 8, 6);
      const mat = new THREE.MeshLambertMaterial({
        color: "#bbbbbb",
        transparent: true,
        opacity: 0.2,
      });
      return new THREE.Mesh(geo, mat);
    },
    [selectedGraphId, selectedEdge, connectionMap, hoveredNodeId, pinnedNodeId, centerMode, degreeCentrality, retrievalCentrality]
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
    graphRef.current?.refresh();
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
    fg.cameraPosition(
      { x: mid.x + dx * ratio, y: mid.y + dy * ratio, z: mid.z + dz * ratio },
      mid,
      600
    );
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

  const graphRefCallback = useCallback((fg: any) => {
    graphRef.current = fg;
    if (!fg || forcesRegistered.current) return;
    forcesRegistered.current = true;

    // Mode-aware gravity: anchor node pinned at origin,
    // "reinforced" weights by degree centrality, "retrieved" weights by access/importance
    let gravityNodes: any[] = [];
    const gravity = Object.assign(
      (alpha: number) => {
        const mode = centerModeRef.current;
        const centrality = mode === "retrieved"
          ? retrievalCentralityRef.current
          : centralityRef.current;
        const anchor = anchorRef.current;
        for (const node of gravityNodes) {
          // Pin anchor node at origin
          if (node.id === anchor) {
            node.x = 0; node.y = 0; node.z = 0;
            node.vx = 0; node.vy = 0; node.vz = 0;
            continue;
          }
          const c = centrality.get(node.id) ?? 0;
          const k = alpha * (0.02 + c * 0.10);
          node.vx = (node.vx || 0) - (node.x || 0) * k;
          node.vy = (node.vy || 0) - (node.y || 0) * k;
          node.vz = (node.vz || 0) - (node.z || 0) * k;
        }
      },
      { initialize: (nodes: any[]) => { gravityNodes = nodes; } }
    );
    fg.d3Force("gravity", gravity);

    // Hard boundary clamp
    let boundaryNodes: any[] = [];
    const boundary = Object.assign(
      () => {
        const r = bubbleRadiusRef.current;
        for (const node of boundaryNodes) {
          const x = node.x || 0, y = node.y || 0, z = node.z || 0;
          const dist = Math.sqrt(x * x + y * y + z * z);
          if (dist > r) {
            const scale = r / dist;
            node.x = x * scale;
            node.y = y * scale;
            node.z = z * scale;
            node.vx = (node.vx || 0) * 0.1;
            node.vy = (node.vy || 0) * 0.1;
            node.vz = (node.vz || 0) * 0.1;
          }
        }
      },
      { initialize: (nodes: any[]) => { boundaryNodes = nodes; } }
    );
    fg.d3Force("boundary", boundary);

    // Allow clicks even after tiny pointer drag (TrackballControls can cause micro-drags)
    if (typeof fg.clickAfterDrag === "function") fg.clickAfterDrag(true);

    // Stronger charge to spread the dense core and repel unlinked clusters
    const charge = fg.d3Force("charge");
    if (charge) {
      charge.strength(-120).distanceMax(300);
    }

    // Moderate link distance — enough spacing to see individual nodes
    const link = fg.d3Force("link");
    if (link) {
      link.distance(35).strength(0.6);
    }
  }, []);

  // After simulation settles, center camera on the graph's center of mass
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    hasCenteredRef.current = false; // reset when data changes
  }, [data]);

  const onEngineStop = useCallback(() => {
    if (hasCenteredRef.current || !graphRef.current) return;
    hasCenteredRef.current = true;

    // Skip auto-centering in edge view — the edge camera effects handle positioning
    if (selectedEdgeRef.current) return;

    const fg = graphRef.current;
    // Anchor is pinned at origin, so center camera there
    const controls = fg.controls?.();
    if (controls && controls.target) {
      controls.target.set(0, 0, 0);
    }
    fg.cameraPosition(
      { x: 0, y: 0, z: defaultCamDistRef.current },
      { x: 0, y: 0, z: 0 },
      800
    );
  }, [data]);

  // Reheat simulation when center mode changes so graph re-layouts
  useEffect(() => {
    if (!graphRef.current || selectedEdgeRef.current) return;
    const fg = graphRef.current;
    // Full reheat + re-center camera so the mode switch is visually clear
    hasCenteredRef.current = false;
    fg.d3ReheatSimulation();
    // Re-center camera on origin (where anchor lives)
    fg.cameraPosition(
      { x: 0, y: 0, z: defaultCamDistRef.current },
      { x: 0, y: 0, z: 0 },
      800
    );
  }, [centerMode]);

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
  const selectedGraphIdRef = useRef(selectedGraphId);
  selectedGraphIdRef.current = selectedGraphId;

  // Auto-rotate: spin the scene around gravity center via direct camera manipulation
  useEffect(() => {
    let raf: number;
    let stopped = false;
    let angle = 0;

    const tick = () => {
      if (stopped) return;
      const fg = graphRef.current;
      if (!fg) { raf = requestAnimationFrame(tick); return; }

      // Update controls zoom limits
      const controls = fg.controls?.();
      if (controls) {
        const minD = (selectedEdgeRef.current || selectedGraphIdRef.current)
          ? zoomMinDistRef.current
          : defaultCamDistRef.current * 0.5;
        const maxD = (selectedEdgeRef.current || selectedGraphIdRef.current)
          ? zoomMaxDistRef.current
          : defaultCamDistRef.current * 1.5;
        controls.minDistance = minD;
        controls.maxDistance = maxD;
      }

      // Auto-rotate: orbit camera around the gravity center in the XZ plane
      // Pause rotation when hovering over a node or link
      if (autoRotateRef.current && !hoveredNodeIdRef.current && !hoveredLinkRef.current) {
        const cam = fg.camera?.();
        if (cam) {
          angle += 0.003;

          // Determine gravity center
          let cx = 0, cy = 0, cz = 0;
          if (selectedEdgeRef.current) {
            const src = dataRef.current.nodes.find((n: any) => n.id === selectedEdgeRef.current!.sourceId) as any;
            const tgt = dataRef.current.nodes.find((n: any) => n.id === selectedEdgeRef.current!.targetId) as any;
            if (src && tgt && 'x' in src && 'x' in tgt) {
              cx = ((src.x || 0) + (tgt.x || 0)) / 2;
              cy = ((src.y || 0) + (tgt.y || 0)) / 2;
              cz = ((src.z || 0) + (tgt.z || 0)) / 2;
            }
          } else if (selectedGraphIdRef.current) {
            const node = dataRef.current.nodes.find((n: any) => n.id === selectedGraphIdRef.current) as any;
            if (node && 'x' in node) {
              cx = node.x || 0; cy = node.y || 0; cz = node.z || 0;
            }
          }

          const dx = cam.position.x - cx;
          const dz = cam.position.z - cz;
          const r = Math.sqrt(dx * dx + dz * dz) || defaultCamDistRef.current;
          cam.position.x = cx + r * Math.sin(angle);
          cam.position.z = cz + r * Math.cos(angle);
          cam.lookAt(cx, cy, cz);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, []);

  // Force node object refresh when selection/mode/hover/visibility changes
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.refresh();
    }
  }, [selectedGraphId, selectedEdge, viewMode, hoveredNodeId, pinnedNodeId, connectionMap, centerMode, visibleMemoryIds, hideEdges]);

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

      // Mode-aware edge color (opacity preserves link type hue)
      if (centerMode === "retrieved") {
        const srcScore = retrievalCentrality.get(src) ?? 0;
        const tgtScore = retrievalCentrality.get(tgt) ?? 0;
        const avg = (srcScore + tgtScore) / 2;
        return hexAlpha(linkTypeColor, 0.12 + avg * 0.5);
      }

      // Reinforcement mode: scale by structural link weight
      const normalizedStrength = (link.value || 1) / maxLinkValue;
      return hexAlpha(linkTypeColor, 0.12 + normalizedStrength * 0.5);
    },
    [selectedGraphId, selectedEdge, connectionMap, maxLinkValue, centerMode, retrievalCentrality]
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

      // Mode-aware width
      if (centerMode === "retrieved") {
        const srcScore = retrievalCentrality.get(src) ?? 0;
        const tgtScore = retrievalCentrality.get(tgt) ?? 0;
        const avg = (srcScore + tgtScore) / 2;
        return 0.15 + avg * 1.5;
      }

      // Reinforcement mode: scale by structural link weight
      const normalizedStrength = (link.value || 1) / maxLinkValue;
      return 0.15 + normalizedStrength * 1.5;
    },
    [selectedGraphId, selectedEdge, connectionMap, maxLinkValue, centerMode, retrievalCentrality]
  );

  const getLinkParticles = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!selectedGraphId || !connectionMap) return 0;

      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      if (src === selectedGraphId || tgt === selectedGraphId) {
        const otherId = src === selectedGraphId ? tgt : src;
        const strength = connectionMap.get(otherId) ?? 0;
        return strength > 0.5 ? 2 : strength > 0.2 ? 1 : 0;
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

  // Focus camera on selected node when it changes (e.g. from card navigation)
  useEffect(() => {
    if (!selectedGraphId || !graphRef.current) return;
    const node = data.nodes.find((n: any) => n.id === selectedGraphId) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!node || !('x' in node)) return;
    const distance = 100;
    const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);
    graphRef.current.cameraPosition(
      {
        x: (node.x || 0) * distRatio,
        y: (node.y || 0) * distRatio,
        z: (node.z || 0) * distRatio,
      },
      node,
      1000
    );
  }, [selectedGraphId, data.nodes]);

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
    // Direction: from midpoint outward (or default up-right if midpoint is near origin)
    const midLen = Math.hypot(mid.x, mid.y, mid.z);
    const dir = midLen > 1
      ? { x: mid.x / midLen, y: mid.y / midLen, z: mid.z / midLen }
      : { x: 0.57, y: 0.57, z: 0.57 }; // default direction if near origin
    graphRef.current.cameraPosition(
      { x: mid.x + dir.x * camDist, y: mid.y + dir.y * camDist, z: mid.z + dir.z * camDist },
      mid,
      1200
    );
  }, [selectedEdge, data.nodes]);

  // Reset camera to default when exiting edge/node view
  const prevSelectedEdgeRef = useRef(selectedEdge);
  const prevSelectedGraphIdRef = useRef(selectedGraphId);
  useEffect(() => {
    const wasEdge = prevSelectedEdgeRef.current;
    const wasNode = prevSelectedGraphIdRef.current;
    prevSelectedEdgeRef.current = selectedEdge;
    prevSelectedGraphIdRef.current = selectedGraphId;

    // If we just exited edge or node view → animate camera back to default
    if ((wasEdge && !selectedEdge) || (wasNode && !selectedGraphId)) {
      const fg = graphRef.current;
      if (!fg) return;
      edgeCameraSetRef.current = null; // allow re-centering on next edge select
      fg.cameraPosition(
        { x: 0, y: 0, z: defaultCamDistRef.current },
        { x: 0, y: 0, z: 0 },
        800
      );
    }
  }, [selectedEdge, selectedGraphId]);

  const handleNodeHover = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setHoveredNodeId(node ? node.id : null);
      // Change cursor
      const el = document.querySelector("canvas");
      if (el) el.style.cursor = node ? "pointer" : "default";
    },
    []
  );

  const handleLinkHover = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      hoveredLinkRef.current = !!link;
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
      warmupTicks={100}
      cooldownTicks={200}
      cooldownTime={5000}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
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
