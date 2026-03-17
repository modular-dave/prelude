"use client";

import React, { useCallback, useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { useMemory } from "@/lib/memory-context";
import type { ViewMode, FilterBag } from "@/lib/types";
import * as THREE from "three";
import { VIZ_CONFIGS } from "@/lib/3d-graph/constants";
import { nodeRadius, computeZoomBounds } from "@/lib/3d-graph/utils";
import type { CameraState } from "@/lib/3d-graph/types";

// Subsystem hooks
import { useMaterialPool } from "./graph/use-material-pool";
import { useGraphData } from "./graph/use-graph-data";
import { useEdgeRenderer } from "./graph/use-edge-renderer";
import { useGraphInteractions } from "./graph/use-graph-interactions";
import { useForceSimulation } from "./graph/use-force-simulation";
import { useCameraController } from "./graph/use-camera-controller";
import { useNodeRenderer } from "./graph/use-node-renderer";

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

// ── Props & Handle ────────────────────────────────────────────────────

interface NeuralGraphProps {
  onNodeSelect?: (memoryId: number) => void;
  selectedNodeId?: number | null;
  filterBagRef: React.RefObject<FilterBag>;
  width?: number;
  height?: number;
  autoRotate?: boolean;
  hideEdges?: boolean;
  selectedEdge?: { sourceId: string; targetId: string } | null;
  highlightedPath?: Set<string> | null;
  onPinnedContentChange?: (content: any | null) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  onBackgroundSelect?: () => void;
  onEdgeSelect?: (edge: SelectedEdgeInfo) => void;
  onReady?: () => void;
  onAutoRotateChange?: (rotating: boolean) => void;
  vizMode?: "hero" | "cluster" | "zero";
}

export interface NeuralGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  clearPinned: () => void;
  resetView: () => void;
}

export interface SelectedEdgeInfo {
  sourceId: string;
  targetId: string;
  sourceNumericId: number;
  targetNumericId: number;
  linkType: string;
  strength: number;
}

// ── Orchestrator Component ────────────────────────────────────────────

const NeuralGraphInner = forwardRef<NeuralGraphHandle, NeuralGraphProps>(function NeuralGraph({
  onNodeSelect, selectedNodeId, filterBagRef, width, height,
  autoRotate = false, hideEdges = false, selectedEdge = null,
  highlightedPath = null, onPinnedContentChange, onBackgroundSelect,
  onEdgeSelect, onReady, onAutoRotateChange, vizMode = "hero",
}, ref) {
  const { knowledgeGraph, memories, fetchMemoryLinks } = useMemory();
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Derived values from filterBagRef
  const centerMode = filterBagRef.current!.centerMode;
  const viewMode: ViewMode = centerMode === "retrieved" ? "retrieved" : "hebbian";

  const selectedGraphId = selectedNodeId != null ? `m_${selectedNodeId}` : null;

  // Ref mirrors for vizMode
  const vizModeRef = useRef(vizMode);
  vizModeRef.current = vizMode;
  const hideEdgesRef = useRef(hideEdges);
  hideEdgesRef.current = hideEdges;

  // Shared nodeObjectCache ref — created here so both camera + nodeRenderer can access
  const nodeObjectCache = useRef(new Map<string, THREE.Group>());

  // ── Subsystem hooks ──

  const { materialPoolRef, getMaterial, getHaloMaterial, disposeMaterials } = useMaterialPool();

  const {
    data, dataRef, degreeCentrality, retrievalCentrality,
    anchorNodeId, anchorRef, centralityRef, retrievalCentralityRef,
    nodeNumericIdMap, maxLinkValue, optimalK, optimalKRef,
    bubbleRadius, bubbleRadiusRef, linkVisibility: rawLinkVisibility,
    connectionMap, asyncLinkTypes,
  } = useGraphData({
    memories, knowledgeGraph, fetchMemoryLinks, filterBagRef, vizMode,
    selectedNodeId: selectedNodeId ?? null, selectedGraphId, viewMode,
  });

  // Wrap linkVisibility to also check hideEdges
  const linkVisibility = useCallback((link: any) => {
    if (hideEdgesRef.current) return false;
    return rawLinkVisibility(link);
  }, [rawLinkVisibility]);

  const {
    handleNodeClick, handleNodeHover, handleLinkHover, handleLinkClick,
    stableBackgroundClick, stableNodeLabel, stableLinkLabel,
    hoveredNodeId, pinnedNodeId, pinnedCardContent,
    hoveredNodeIdRef, hoveredLinkRef,
    setPinnedNodeId, setPinnedLinkKey,
  } = useGraphInteractions({
    data, memories, nodeNumericIdMap, connectionMap, asyncLinkTypes,
    selectedGraphId, filterBagRef, viewMode,
    onNodeSelect, onEdgeSelect, onBackgroundSelect, onPinnedContentChange,
  });

  const camera = useCameraController({
    graphRef, filterBagRef, dataRef, bubbleRadiusRef, optimalKRef,
    vizMode, vizModeRef, width, height, selectedEdge, selectedGraphId,
    highlightedPath, nodeObjectCache,
    autoRotate, onAutoRotateChange, onReady,
    hoveredNodeIdRef, hoveredLinkRef, data,
  });

  const {
    nodeThreeObject, tickVisibility,
  } = useNodeRenderer({
    data, dataRef, selectedGraphId, selectedEdge, connectionMap,
    filterBagRef, vizModeRef, optimalKRef, lodLevelRef: camera.lodLevelRef,
    zoomLevelRef: camera.zoomLevelRef, frustumRef: camera.frustumRef,
    getMaterial, getHaloMaterial, highlightedPath,
    highlightedPathRef: camera.highlightedPathRef,
    hoveredNodeId, hoveredNodeIdRef, pinnedNodeId,
    centralityRef, retrievalCentralityRef, anchorRef,
    prevNodeScaleRef: camera.prevNodeScaleRef,
    nodeObjectCache,
  });

  const { setupForces } = useForceSimulation({
    graphRef, filterBagRef, optimalKRef, vizModeRef, bubbleRadiusRef,
    centralityRef, retrievalCentralityRef, anchorRef, vizMode,
  });

  const {
    getLinkColor, getLinkWidth, getLinkParticles, getLinkParticleColor,
  } = useEdgeRenderer({
    selectedGraphId, selectedEdge, connectionMap, maxLinkValue,
    filterBagRef, zoomLevelRef: camera.zoomLevelRef, vizModeRef,
    retrievalCentralityRef, highlightedPathRef: camera.highlightedPathRef,
  });

  // ── Renderer disposal on unmount ──
  useEffect(() => {
    return () => {
      const fg = graphRef.current;
      if (fg) {
        try {
          const renderer = fg.renderer?.();
          renderer?.dispose?.();
          renderer?.forceContextLoss?.();
        } catch { /* silent */ }
        disposeMaterials();
        graphRef.current = null;
      }
    };
  }, [disposeMaterials]);

  // ── Imperative handle ──
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const fg = graphRef.current;
      if (!fg) return;
      const cam = fg.camera?.();
      const controls = fg.controls?.();
      if (!cam) return;
      const navAnchor = camera.navAnchorRef.current.clone();
      const dir = cam.position.clone().sub(navAnchor).normalize();
      const dist = cam.position.distanceTo(navAnchor);
      const newDist = Math.max(controls?.minDistance || 20, dist * 0.75);
      const newPos = navAnchor.clone().addScaledVector(dir, newDist);
      const inSubView = selectedEdge || selectedGraphId;
      camera.requestCameraFlyTo(
        { pos: { x: newPos.x, y: newPos.y, z: newPos.z }, lookAt: { x: navAnchor.x, y: navAnchor.y, z: navAnchor.z } },
        300, inSubView ? "SETTLED" : "ORBIT"
      );
    },
    zoomOut: () => {
      const fg = graphRef.current;
      if (!fg) return;
      const cam = fg.camera?.();
      const controls = fg.controls?.();
      if (!cam) return;
      const navAnchor = camera.navAnchorRef.current.clone();
      const dir = cam.position.clone().sub(navAnchor).normalize();
      const dist = cam.position.distanceTo(navAnchor);
      const newDist = Math.min(controls?.maxDistance || 5000, dist * 1.33);
      const newPos = navAnchor.clone().addScaledVector(dir, newDist);
      const inSubView = selectedEdge || selectedGraphId;
      camera.requestCameraFlyTo(
        { pos: { x: newPos.x, y: newPos.y, z: newPos.z }, lookAt: { x: navAnchor.x, y: navAnchor.y, z: navAnchor.z } },
        300, inSubView ? "SETTLED" : "ORBIT"
      );
    },
    clearPinned: () => {
      setPinnedNodeId(null);
      setPinnedLinkKey(null);
    },
    resetView: () => {
      const dist = camera.adaptiveCamDistRef.current || camera.defaultCamDistRef.current;
      camera.requestCameraFlyTo(
        { pos: { x: 0, y: 0, z: dist }, lookAt: { x: 0, y: 0, z: 0 } },
        800, "ORBIT"
      );
      try { graphRef.current?.d3ReheatSimulation?.(); } catch { /* silent */ }
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Graph ref callback: wire forces + camera ──
  const graphRefCallback = useCallback((fg: any) => {
    graphRef.current = fg;
    if (!fg) return;
    setupForces(fg);
    camera.setupCameraControls(fg);
  }, [setupForces, camera.setupCameraControls]);

  // ── Tick loop pipeline (CesiumJS Scene.render() pattern) ──
  const vizConfigRef = useRef(VIZ_CONFIGS[vizMode]);
  vizConfigRef.current = VIZ_CONFIGS[vizMode];

  useEffect(() => {
    let raf: number;
    let stopped = false;
    const angleRef = { value: 0 };

    const tick = () => {
      if (stopped) return;
      const fg = graphRef.current;
      if (!fg) { raf = requestAnimationFrame(tick); return; }

      const cam = fg.camera?.();
      const controls = fg.controls?.();
      const config = vizConfigRef.current;
      const state = camera.cameraStateRef.current;

      // Phase 1: Zoom level + LOD measurement
      camera.tickZoomAndLOD(cam, controls, config);
      // Phase 2: Frustum update
      camera.tickFrustum(cam);
      // Phase 3: Node visibility + filter-driven resizing
      tickVisibility(cam);
      // Phase 4: Zoom limits + elastic spring
      camera.tickZoomLimits(cam, controls, state);
      // Phase 5: Camera state machine (FLY_TO / ORBIT / SETTLED)
      camera.tickStateMachine(cam, controls, state, config, angleRef);
      // Phase 6: Zoom inertia (Cesium-style momentum)
      camera.tickZoomInertia(cam, controls);
      // Phase 7: Adaptive quality (LOD during interaction)
      camera.tickAdaptiveQuality(state);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { stopped = true; cancelAnimationFrame(raf); camera.wheelCleanupRef.current?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Force node object refresh on structural changes
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.refresh();
    }
  }, [selectedGraphId, selectedEdge, connectionMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active config for ForceGraph3D props
  const activeConfig = VIZ_CONFIGS[vizMode];

  // Memoize ForceGraph3D element
  const forceGraphElement = useMemo(() => ( // eslint-disable-line react-hooks/exhaustive-deps
    <ForceGraph3D
      controlType="orbit"
      ref={graphRefCallback as any} // eslint-disable-line @typescript-eslint/no-explicit-any
      graphData={data}
      linkId="id"
      linkVisibility={linkVisibility}
      width={width}
      height={height}
      nodeLabel={stableNodeLabel}
      nodeThreeObject={nodeThreeObject}
      onNodeHover={handleNodeHover}
      onLinkHover={handleLinkHover}
      linkHoverPrecision={16}
      linkLabel={stableLinkLabel}
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
      onBackgroundClick={stableBackgroundClick}
      onEngineStop={camera.onEngineStop}
      enableNodeDrag={false}
      warmupTicks={activeConfig.warmupTicks}
      cooldownTicks={120}
      cooldownTime={activeConfig.cooldownTime}
      d3AlphaDecay={activeConfig.alphaDecay}
      d3VelocityDecay={activeConfig.velocityDecay}
    />
  ), [data, width, height, nodeThreeObject, getLinkColor, getLinkWidth, getLinkParticles, getLinkParticleColor, activeConfig]); // eslint-disable-line react-hooks/exhaustive-deps

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
    {forceGraphElement}
    </div>
  );
});

export const NeuralGraph = NeuralGraphInner;

// PinnedCardBody extracted to ./pinned-card-body.tsx
export { PinnedCardBody } from "./pinned-card-body";
