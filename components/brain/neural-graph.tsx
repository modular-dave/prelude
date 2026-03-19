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
  nodeDepthMap?: Map<string, number> | null;
  onPinnedContentChange?: (content: any | null) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  onBackgroundSelect?: () => void;
  onEdgeSelect?: (edge: SelectedEdgeInfo) => void;
  onReady?: () => void;
  onAutoRotateChange?: (rotating: boolean) => void;
  vizMode?: "hero" | "cluster" | "starburst" | "zero";
}

export interface NeuralGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  clearPinned: () => void;
  resetView: () => void;
  fitNodes: (nodeIds: string[]) => void;
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
    case "starburst": return "starburst";
    case "zero": return "zeroG";
    default: return "hero";
  }
}

// ── Orchestrator Component ────────────────────────────────────────────

const NeuralGraphInner = forwardRef<NeuralGraphHandle, NeuralGraphProps>(function NeuralGraph({
  onNodeSelect, selectedNodeId, filterBagRef, width, height,
  autoRotate = false, hideEdges = false, selectedEdge = null,
  highlightedPath = null, nodeDepthMap = null, onPinnedContentChange, onBackgroundSelect,
  onEdgeSelect, onReady, onAutoRotateChange, vizMode = "hero",
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const nodeInstancesRef = useRef<NodeInstances | null>(null);
  const edgeInstancesRef = useRef<EdgeInstances | null>(null);
  const edgeClassifierRef = useRef<EdgeClassifier | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isDragging = useRef(false);
  const wasDragging = useRef(false); // survives pointerUp→click sequence
  const readyFired = useRef(false);

  const lens = vizModeToLens(vizMode);
  const selectedGraphId = selectedNodeId != null ? `m_${selectedNodeId}` : null;

  // Refs to mirror props/state for the tick closure (avoids stale captures)
  const highlightedPathRef = useRef(highlightedPath);
  highlightedPathRef.current = highlightedPath;
  const selectedGraphIdRef = useRef(selectedGraphId);
  selectedGraphIdRef.current = selectedGraphId;
  const hoveredIdRef = useRef(hoveredId);
  hoveredIdRef.current = hoveredId;
  const hideEdgesRef = useRef(hideEdges);
  hideEdgesRef.current = hideEdges;
  const nodeDepthMapRef = useRef(nodeDepthMap);
  nodeDepthMapRef.current = nodeDepthMap;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  // ── World session (compiler + runtime) ──
  const session = useWorldSession(lens);

  // ── Refs to mirror session values for the tick closure ──
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // ── Props → ViewState sync (camera handled by brain-view fitNodes) ──
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
      const focusMode = filters?.focus ?? "memories";

      if (filters) {
        nodeInstances.applyFilters(filters, s.viewState.current.lens, s.entityById, s.bubbleRadius);
      }

      // All focus modes show nodes (scaling handles emphasis)
      nodeInstances.setVisible(true);

      // Show edges in edge-focus mode, or when path has multiple nodes (depth > 0)
      const hp = highlightedPathRef.current;
      const pathActive = hp && hp.size > 1;
      if ((focusMode === "edges" || pathActive) && !hideEdgesRef.current) {
        const linkTypeFilter = filters?.linkTypeFilter;
        const visibleEntityIds = filters ? nodeInstances.getVisibleEntityIds(filters) : undefined;
        edgeClassifier.classify(s.viewState.current, hotTiles, hotChunks, hp, linkTypeFilter, visibleEntityIds);
        edgeInstances.syncFromEdges(edgeClassifier.getEdges(), nodeInstances, true);
        edgeInstances.setVisible(true);
      } else {
        edgeInstances.setVisible(false);
      }

      // 6. Update highlights with depth-based halos
      const dm = nodeDepthMapRef.current;
      const hpNodes = highlightedPathRef.current;
      nodeInstances.updateHighlights({
        selectedId: selectedGraphIdRef.current,
        hoveredId: hoveredIdRef.current,
        highlightedIds: hpNodes && hpNodes.size > 0 ? hpNodes : undefined,
        depthMap: dm || undefined,
        maxDepth: dm ? Math.max(...dm.values(), 1) : 1,
      });

    });

    // Auto-rotate — always registered, checked via ref so toggle works without re-init
    let angle = Math.atan2(sceneManager.camera.position.x, sceneManager.camera.position.z);
    sceneManager.onTick((dt) => {
      if (!autoRotateRef.current || sceneManager.animating) return;
      angle += dt * 0.3;
      const dist = sceneManager.camera.position.length();
      sceneManager.camera.position.x = Math.sin(angle) * dist;
      sceneManager.camera.position.z = Math.cos(angle) * dist;
      sceneManager.camera.lookAt(sceneManager.controls.target);
    });

    // Single view: clamp camera outside sphere — runs AFTER controls.update()
    // Skip during animations to prevent fighting with moveTo lerp.
    sceneManager.onPostControls(() => {
      if (sceneManager.animating) return;
      const selId = selectedGraphIdRef.current;
      if (selId) {
        const rootPos = nodeInstances.getEntityPosition(selId);
        if (rootPos) {
          const rootDist = rootPos.length();
          const camPos = sceneManager.camera.position;
          const camDist = camPos.length();
          const minDist = Math.max(rootDist * 0.8, 50);
          if (camDist < minDist) {
            const dir = camPos.clone().normalize();
            if (dir.length() < 0.01) dir.copy(rootPos.clone().normalize());
            camPos.copy(dir.multiplyScalar(minDist));
          }
        }
      }
    });

    sceneManager.start();

    // ── Drag detection via canvas pointer events ──
    // Attached here (not in a separate effect) so listeners live/die with the canvas.
    const canvas = sceneManager.canvas;
    let downPos: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
      isDragging.current = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (downPos) {
        const dx = e.clientX - downPos.x;
        const dy = e.clientY - downPos.y;
        if (dx * dx + dy * dy > 16) isDragging.current = true;
      }
    };
    const onPointerUp = () => {
      if (isDragging.current) {
        wasDragging.current = true;
        setTimeout(() => { wasDragging.current = false; }, 100);
      }
      isDragging.current = false;
      downPos = null;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
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
      // Only set camera position on first ready — don't reset after data refreshes
      if (!readyFired.current) {
        sm.camera.position.set(0, 0, camDist);
      }
      // Always update projection limits (non-destructive)
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
    // Skip click if user was dragging (orbit/pan) — wasDragging survives pointerUp→click
    if (wasDragging.current) {
      wasDragging.current = false;
      return;
    }
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

  // Drag detection is handled via canvas pointer events in the SceneManager init effect.

  // ── Hover handling ──
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!sceneManagerRef.current || !nodeInstancesRef.current) return;

    if (isDragging.current) {
      if (hoveredId) setHoveredId(null);
      if (containerRef.current) containerRef.current.style.cursor = "grabbing";
      onPinnedContentChange?.(null);
      return;
    }

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

    // Build pinned content for hover card
    if (hit && onPinnedContentChange) {
      const s = sessionRef.current;
      const entity = s.entityById.get(hit);
      if (entity) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        // Count links from topology chunks
        let linkCount = 0;
        const hotChunks = s.tileCache?.hotTopologyChunks() || [];
        for (const chunk of hotChunks) {
          if (!chunk.data) continue;
          for (const edge of chunk.data.edges) {
            if (edge.source === hit || edge.target === hit) linkCount++;
          }
        }
        const diversityScore = nodeInstancesRef.current?.getDiversityScore(hit, filterBagRef.current.centerMode) ?? 0;
        const linkTypeDiversity = nodeInstancesRef.current?.getLinkTypeDiversity(hit) ?? 0;
        const neighborTypeDiversity = nodeInstancesRef.current?.getNeighborTypeDiversity(hit) ?? 0;
        const maxNeighbors = nodeInstancesRef.current?.getMaxNeighbors(hit) ?? 0;
        const maxPath = nodeInstancesRef.current?.getMaxPathDepth(hit) ?? 0;
        const rank = nodeInstancesRef.current?.getRank(hit) ?? null;
        const heroModes = nodeInstancesRef.current?.getHeroModes(hit);
        onPinnedContentChange({
          type: entity.nodeCategory === "entity" ? "entity" : "memory",
          name: entity.label,
          memoryType: entity.memoryType || entity.type,
          importance: entity.importance,
          accessCount: entity.accessCount,
          linkCount,
          decayFactor: entity.decayFactor,
          diversityScore,
          linkTypeDiversity,
          neighborTypeDiversity,
          maxNeighbors,
          maxPath,
          rank,
          heroModes: heroModes && heroModes.length > 0 ? heroModes : undefined,
          position: { x: mouseX, y: mouseY },
        });
      }
    } else if (!hit && onPinnedContentChange) {
      onPinnedContentChange(null);
    }
  }, [onPinnedContentChange]);

  // ── Imperative handle ──
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const dist = sm.camera.position.distanceTo(sm.controls.target);
      const newDist = Math.max(50, dist * 0.75);
      const dir = sm.camera.position.clone().sub(sm.controls.target).normalize();
      sessionRef.current.tileCache?.freezeEviction(400);
      sm.moveTo(sm.controls.target.clone().add(dir.multiplyScalar(newDist)), sm.controls.target.clone(), true, 300);
    },
    zoomOut: () => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const maxDist = (sessionRef.current.bubbleRadius || 400) * 5;
      const dist = sm.camera.position.distanceTo(sm.controls.target);
      const newDist = Math.min(maxDist, dist * 1.33);
      const dir = sm.camera.position.clone().sub(sm.controls.target).normalize();
      sessionRef.current.tileCache?.freezeEviction(400);
      sm.moveTo(sm.controls.target.clone().add(dir.multiplyScalar(newDist)), sm.controls.target.clone(), true, 300);
    },
    clearPinned: () => {},
    resetView: () => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const camDist = (sessionRef.current.bubbleRadius || 400) * 2.5;
      sessionRef.current.tileCache?.freezeEviction(500);
      sm.moveTo(new THREE.Vector3(0, 0, camDist), new THREE.Vector3(0, 0, 0), true, 400);
    },
    fitNodes: (nodeIds: string[]) => {
      const sm = sceneManagerRef.current;
      const ni = nodeInstancesRef.current;
      if (!sm || !ni || nodeIds.length === 0) return;
      const rootPos = ni.getEntityPosition(nodeIds[0]);
      if (!rootPos) return;
      const target = rootPos.clone();
      const bubbleR = sessionRef.current.bubbleRadius || 400;

      // Angular spread: max angle between root and any reachable node on the sphere
      const rootDir = target.clone().normalize();
      let maxAngle = 0;
      for (const id of nodeIds) {
        const pos = ni.getEntityPosition(id);
        if (pos) {
          const dir = pos.clone().normalize();
          const angle = Math.acos(Math.max(-1, Math.min(1, rootDir.dot(dir))));
          maxAngle = Math.max(maxAngle, angle);
        }
      }

      // Distance based on angular spread
      const fov = sm.camera.fov * (Math.PI / 180);
      let dist: number;
      if (maxAngle < 0.1) {
        dist = 350; // single node close-up
      } else if (maxAngle < Math.PI * 0.5) {
        const arcRadius = bubbleR * Math.sin(maxAngle);
        dist = Math.max(150, (arcRadius + 50) / Math.tan(fov / 2));
      } else {
        dist = bubbleR * 2.5; // wide spread — global view
      }

      // Camera along radial ray from sphere center through root
      const radial = rootDir.length() > 0.01 ? rootDir.clone() : new THREE.Vector3(0, 0, 1);
      const endPos = target.clone().add(radial.multiplyScalar(dist));
      sessionRef.current.tileCache?.freezeEviction(800);
      sm.moveTo(endPos, target, true, 700);
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
