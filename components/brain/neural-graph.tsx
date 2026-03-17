"use client";

import React, { useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useState } from "react";
import * as THREE from "three";
import type { FilterBag } from "@/lib/types";
import type { Lens } from "@/lib/3d-graph/runtime/types";
import { useWorldSession } from "./graph/use-world-session";
import { SceneManager } from "./graph/renderer/scene-manager";
import { NodeInstances } from "./graph/renderer/node-instances";
import { EdgeInstances } from "./graph/renderer/edge-instances";
import { EdgeClassifier } from "./graph/renderer/edge-classifier";

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

// ── vizMode → Lens mapping ──────────────────────────────────────────

function vizModeToLens(vizMode: string): Lens {
  switch (vizMode) {
    case "hero": return "hero";
    case "cluster": return "cluster";
    case "zero": return "zeroG";
    default: return "hero";
  }
}

// ── Orchestrator Component ────────────────────────────────────────────

const NeuralGraphInner = forwardRef<NeuralGraphHandle, NeuralGraphProps>(function NeuralGraph({
  onNodeSelect, selectedNodeId, filterBagRef, width, height,
  autoRotate = false, hideEdges = false, selectedEdge = null,
  highlightedPath = null, onPinnedContentChange, onBackgroundSelect,
  onEdgeSelect, onReady, onAutoRotateChange, vizMode = "hero",
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const nodeInstancesRef = useRef<NodeInstances | null>(null);
  const edgeInstancesRef = useRef<EdgeInstances | null>(null);
  const edgeClassifierRef = useRef<EdgeClassifier | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const readyFired = useRef(false);

  const lens = vizModeToLens(vizMode);
  const selectedGraphId = selectedNodeId != null ? `m_${selectedNodeId}` : null;

  // ── World session (compiler + runtime) ──
  const session = useWorldSession(lens);

  // ── Refs to mirror session values for the tick closure ──
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // ── Props → ViewState sync ──
  useEffect(() => {
    if (!session.isReady) return;

    if (selectedGraphId) {
      const entity = session.entityById.get(selectedGraphId);
      if (entity) {
        session.viewState.setFocus({
          targetId: selectedGraphId,
          targetType: "node",
          anchor: entity.cartesian,
          radius: 100,
        });
        session.viewState.setTopology({ mode: "single", neighborhoodDepth: 2 });
      }
    } else if (selectedEdge) {
      const src = session.entityById.get(selectedEdge.sourceId);
      const tgt = session.entityById.get(selectedEdge.targetId);
      if (src && tgt) {
        session.viewState.setFocus({
          targetType: "path",
          anchor: {
            x: (src.cartesian.x + tgt.cartesian.x) / 2,
            y: (src.cartesian.y + tgt.cartesian.y) / 2,
            z: (src.cartesian.z + tgt.cartesian.z) / 2,
          },
          radius: 150,
        });
      }
    } else {
      session.viewState.clearFocus();
    }
  }, [selectedGraphId, selectedEdge, session.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (highlightedPath && highlightedPath.size > 0) {
      session.viewState.setTopology({
        pinnedPathIds: [...highlightedPath],
      });
    }
  }, [highlightedPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initialize Three.js scene ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !width || !height) return;

    const sceneManager = new SceneManager(container, width, height, sessionRef.current.bubbleRadius);
    sceneManagerRef.current = sceneManager;

    const nodeInstances = new NodeInstances();
    nodeInstancesRef.current = nodeInstances;
    nodeInstances.addToScene(sceneManager.scene);

    const edgeInstances = new EdgeInstances();
    edgeInstancesRef.current = edgeInstances;
    edgeInstances.addToScene(sceneManager.scene);

    const edgeClassifier = new EdgeClassifier();
    edgeClassifierRef.current = edgeClassifier;

    // Tick callback: update ViewState + renderers each frame
    sceneManager.onTick((dt) => {
      const s = sessionRef.current;
      if (!s.isReady || !s.tileCache) return;

      const filters = filterBagRef.current;

      // 1. Update ViewState from camera
      const pos = sceneManager.getCameraPosition();
      const dir = sceneManager.getCameraDirection();
      const zoom = sceneManager.getCameraZoom();
      s.viewState.updateCamera(pos, dir, zoom);

      // 2. Run residency engine
      s.tileCache.update(s.viewState.current);

      // 3. Sync renderers from cache
      const hotTiles = s.tileCache.hotTiles();
      nodeInstances.syncFromTiles(hotTiles);

      // 4. Compute degree centrality + apply node filters
      const hotChunks = s.tileCache.hotTopologyChunks();
      nodeInstances.updateDegree(hotChunks);
      if (filters) {
        nodeInstances.applyFilters(filters, s.viewState.current.lens, s.entityById, s.bubbleRadius);
      }

      // 5. Classify and render edges
      if (!hideEdges) {
        const linkTypeFilter = filters?.linkTypeFilter;
        const visibleEntityIds = filters ? nodeInstances.getVisibleEntityIds(filters) : undefined;
        edgeClassifier.classify(s.viewState.current, hotTiles, hotChunks, highlightedPath, linkTypeFilter, visibleEntityIds);
        edgeInstances.syncFromEdges(edgeClassifier.getEdges(), nodeInstances, !!filters?.edgeFocus);
        edgeInstances.setVisible(true);
      } else {
        edgeInstances.setVisible(false);
      }

      // 6. Update highlights
      nodeInstances.updateHighlights({
        selectedId: selectedGraphId,
        hoveredId,
      });
    });

    // Auto-rotate
    if (autoRotate) {
      let angle = 0;
      sceneManager.onTick((dt) => {
        if (!autoRotate) return;
        angle += dt * 0.3;
        const dist = sceneManager.camera.position.length();
        sceneManager.camera.position.x = Math.sin(angle) * dist;
        sceneManager.camera.position.z = Math.cos(angle) * dist;
        sceneManager.camera.lookAt(0, 0, 0);
      });
    }

    sceneManager.start();

    return () => {
      nodeInstances.dispose();
      edgeInstances.dispose();
      sceneManager.dispose();
      sceneManagerRef.current = null;
    };
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // When session becomes ready, reposition camera to fit the bubble
  useEffect(() => {
    if (session.isReady && sceneManagerRef.current) {
      const sm = sceneManagerRef.current;
      const camDist = session.bubbleRadius * 2.5;
      sm.camera.position.set(0, 0, camDist);
      sm.camera.far = camDist * 5;
      sm.camera.updateProjectionMatrix();
      sm.controls.maxDistance = camDist * 2;
      sm.controls.minDistance = session.bubbleRadius * 0.1;
    }
    if (session.isReady && !readyFired.current) {
      readyFired.current = true;
      onReady?.();
    }
  }, [session.isReady, session.bubbleRadius, onReady]);

  // ── Resize handling ──
  useEffect(() => {
    if (sceneManagerRef.current && width && height) {
      sceneManagerRef.current.resize(width, height);
    }
  }, [width, height]);

  // ── Click handling ──
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!sceneManagerRef.current || !nodeInstancesRef.current) return;

    const rect = sceneManagerRef.current.canvas.getBoundingClientRect();
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(mouse.current, sceneManagerRef.current.camera);
    const nodeInstances = nodeInstancesRef.current;

    // Test all instanced meshes
    const meshes = [nodeInstances.memorySpheres, nodeInstances.entityOctahedra, nodeInstances.clusterSpheres];
    let closestHit: { entityId: string; distance: number } | null = null;

    for (const mesh of meshes) {
      const intersects = raycaster.current.intersectObject(mesh);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const entityId = nodeInstances.entityIdAtInstance(mesh, intersects[0].instanceId);
        if (entityId && (!closestHit || intersects[0].distance < closestHit.distance)) {
          closestHit = { entityId, distance: intersects[0].distance };
        }
      }
    }

    if (closestHit) {
      const numericId = session.nodeNumericIdMap.get(closestHit.entityId);
      if (numericId != null) {
        onNodeSelect?.(numericId);
      }
    } else {
      onBackgroundSelect?.();
    }
  }, [session.nodeNumericIdMap, onNodeSelect, onBackgroundSelect]);

  // ── Hover handling ──
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!sceneManagerRef.current || !nodeInstancesRef.current) return;

    const rect = sceneManagerRef.current.canvas.getBoundingClientRect();
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(mouse.current, sceneManagerRef.current.camera);
    const nodeInstances = nodeInstancesRef.current;

    const meshes = [nodeInstances.memorySpheres, nodeInstances.entityOctahedra, nodeInstances.clusterSpheres];
    let hit: string | null = null;

    for (const mesh of meshes) {
      const intersects = raycaster.current.intersectObject(mesh);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const entityId = nodeInstances.entityIdAtInstance(mesh, intersects[0].instanceId);
        if (entityId) { hit = entityId; break; }
      }
    }

    setHoveredId(hit);
    if (containerRef.current) {
      containerRef.current.style.cursor = hit ? "pointer" : "default";
    }
  }, []);

  // ── Imperative handle ──
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const dist = sm.camera.position.length();
      const newDist = Math.max(50, dist * 0.75);
      const dir = sm.camera.position.clone().normalize();
      sm.flyTo(dir.multiplyScalar(newDist), 300);
    },
    zoomOut: () => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const dist = sm.camera.position.length();
      const maxDist = (sessionRef.current.bubbleRadius || 400) * 5;
      const newDist = Math.min(maxDist, dist * 1.33);
      const dir = sm.camera.position.clone().normalize();
      sm.flyTo(dir.multiplyScalar(newDist), 300);
    },
    clearPinned: () => {
      // No-op for now — pinned state managed by brain-view
    },
    resetView: () => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const camDist = (sessionRef.current.bubbleRadius || 400) * 2.5;
      sm.flyTo(new THREE.Vector3(0, 0, camDist), 800);
    },
  }), []);

  const showEmptyState = session.isReady && session.allEntities.length === 0;

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ width, height }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    >
      {showEmptyState && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ color: "var(--text-faint)", pointerEvents: "none" }}>
          <div className="text-center">
            <p className="t-heading">No memories yet</p>
            <p className="mt-1 t-small" style={{ color: "var(--text-faint)" }}>Chat to create your first memories</p>
          </div>
        </div>
      )}
    </div>
  );
});

export const NeuralGraph = NeuralGraphInner;

export { PinnedCardBody } from "./pinned-card-body";
