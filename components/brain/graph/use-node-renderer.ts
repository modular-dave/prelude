import { useCallback, useRef, useEffect } from "react";
import * as THREE from "three";
import { TYPE_COLORS } from "@/lib/types";
import type { FilterBag } from "@/lib/types";
import { SHARED_GEO, ENTITY_COLORS, DEFAULT_ENTITY_COLOR, VIZ_CONFIGS } from "@/lib/3d-graph/constants";
import { nodeRadius } from "@/lib/3d-graph/utils";
import type { LODLevel } from "@/lib/3d-graph/types";

interface UseNodeRendererParams {
  data: { nodes: any[]; links: any[] };
  dataRef: React.RefObject<{ nodes: any[]; links: any[] }>;
  selectedGraphId: string | null;
  selectedEdge: { sourceId: string; targetId: string } | null;
  connectionMap: Map<string, number> | null;
  filterBagRef: React.RefObject<FilterBag>;
  vizModeRef: React.RefObject<"hero" | "cluster" | "zero">;
  optimalKRef: React.RefObject<number>;
  lodLevelRef: React.RefObject<LODLevel>;
  zoomLevelRef: React.RefObject<number>;
  frustumRef: React.RefObject<THREE.Frustum>;
  getMaterial: (color: string, opacity: number, emissiveColor: string, emissiveIntensity: number, transparent?: boolean) => THREE.MeshLambertMaterial;
  getHaloMaterial: (color: string, opacity: number) => THREE.MeshBasicMaterial;
  highlightedPath: Set<string> | null;
  highlightedPathRef: React.RefObject<Set<string> | null>;
  hoveredNodeId: string | null;
  hoveredNodeIdRef: React.RefObject<string | null>;
  pinnedNodeId: string | null;
  centralityRef: React.RefObject<Map<string, number>>;
  retrievalCentralityRef: React.RefObject<Map<string, number>>;
  anchorRef: React.RefObject<string>;
  prevNodeScaleRef: React.RefObject<number>;
  nodeObjectCache: React.RefObject<Map<string, THREE.Group>>;
}

export function useNodeRenderer({
  data, dataRef, selectedGraphId, selectedEdge, connectionMap,
  filterBagRef, vizModeRef, optimalKRef, lodLevelRef, zoomLevelRef, frustumRef,
  getMaterial, getHaloMaterial, highlightedPath, highlightedPathRef,
  hoveredNodeId, hoveredNodeIdRef, pinnedNodeId, centralityRef, retrievalCentralityRef,
  anchorRef, prevNodeScaleRef, nodeObjectCache,
}: UseNodeRendererParams) {
  const prevFilterSnapshotRef = useRef({
    centerMode: filterBagRef.current!.centerMode,
    edgeFocus: filterBagRef.current!.edgeFocus,
  });

  // Clear cache on structural changes
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
  }, [selectedGraphId, selectedEdge, connectionMap]);

  // Hover/pin material update
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
  }, [hoveredNodeId, pinnedNodeId]);

  // Highlighted path update
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
  }, [highlightedPath, selectedEdge]);

  // nodeThreeObject callback
  const nodeThreeObject = useCallback(
    (node: any) => {
      const isEntity = node.isEntity;
      const typeColor = isEntity
        ? (ENTITY_COLORS[node.type] || DEFAULT_ENTITY_COLOR)
        : (TYPE_COLORS[node.type as keyof typeof TYPE_COLORS] || "#666");
      const isHovered = node.id === hoveredNodeId;
      const isPinned = node.id === pinnedNodeId;

      const degScore = centralityRef.current.get(node.id) ?? 0;
      const retScore = retrievalCentralityRef.current.get(node.id) ?? 0;
      const cm = filterBagRef.current!.centerMode;
      const modeScore = cm === "retrieved" ? retScore
        : cm === "combined" ? Math.max(degScore, retScore)
        : degScore;
      const rawSize = nodeRadius(node.val, modeScore, optimalKRef.current, VIZ_CONFIGS[vizModeRef.current]);
      const baseSize = filterBagRef.current!.edgeFocus ? rawSize * 0.35 : rawSize;

      const lod = lodLevelRef.current;
      const coreGeo = isEntity
        ? (lod === "far" ? SHARED_GEO.octaLo : SHARED_GEO.octaHi)
        : (lod === "far" ? SHARED_GEO.sphereLo : SHARED_GEO.sphereHi);
      const haloGeo = lod === "far" ? SHARED_GEO.haloLo : SHARED_GEO.haloHi;

      if (selectedEdge) {
        const hp = highlightedPathRef.current;
        const isEdgeNode = hp
          ? hp.has(node.id)
          : (node.id === selectedEdge.sourceId || node.id === selectedEdge.targetId);

        const cached = nodeObjectCache.current.get(node.id);
        if (cached) {
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
        const halo = new THREE.Mesh(haloGeo, getHaloMaterial(typeColor, 0.15));
        halo.scale.setScalar(baseSize * 3.0);
        halo.visible = isEdgeNode;
        group.add(halo);
        if (!isEdgeNode) group.scale.setScalar(0.6 / 1.3);
        group.userData = { isEntity, numericId: node.numericId, pinned: false };
        nodeObjectCache.current.set(node.id, group);
        return group;
      }

      if (!selectedGraphId || !connectionMap) {
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
        group.userData = { isEntity, numericId: node.numericId, pinned: isPinned };
        return group;
      }

      if (node.id === selectedGraphId) {
        const group = new THREE.Group();
        const core = new THREE.Mesh(coreGeo, getMaterial("#ffffff", 1.0, "#000000", 0));
        core.scale.setScalar(baseSize * 1.3);
        group.add(core);

        const halo = new THREE.Mesh(haloGeo, getHaloMaterial(typeColor, 0.12));
        halo.scale.setScalar(baseSize * 3.0);
        group.add(halo);
        group.userData = { isEntity, numericId: node.numericId, pinned: false };
        return group;
      }

      const strength = connectionMap.get(node.id);
      if (strength !== undefined) {
        const opacity = 0.3 + strength * 0.7;
        const size = baseSize * (0.7 + strength * 0.6);
        const mat = getMaterial(typeColor, opacity, typeColor, strength * 0.4);
        const mesh = new THREE.Mesh(coreGeo, mat);
        mesh.scale.setScalar(size);
        mesh.userData = { isEntity, numericId: node.numericId };
        return mesh;
      }

      const mat = getMaterial(typeColor, 0.15, typeColor, 0.01);
      const mesh = new THREE.Mesh(lod === "far" ? (isEntity ? SHARED_GEO.octaLo : SHARED_GEO.sphereLo) : coreGeo, mat);
      mesh.scale.setScalar(baseSize * 0.5);
      mesh.userData = { isEntity, numericId: node.numericId };
      return mesh;
    },
    [selectedGraphId, selectedEdge, connectionMap, pinnedNodeId, getMaterial, getHaloMaterial] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Tick: node visibility + filter-driven resizing
  const tickVisibility = useCallback((cam: any) => {
    if (!cam || nodeObjectCache.current.size === 0) return;
    const ids = filterBagRef.current?.visibleMemoryIds ?? null;
    const zl = zoomLevelRef.current;
    const nodeScale = Math.min(1.8, Math.max(0.4, 1 / Math.sqrt(Math.max(0.15, zl))));
    const scaleChanged = Math.abs(nodeScale - prevNodeScaleRef.current) > 0.02;
    if (scaleChanged) prevNodeScaleRef.current = nodeScale;

    for (const [nodeId, group] of nodeObjectCache.current) {
      if (ids) {
        const numId = (group.userData as any)?.numericId;
        const isEntity = (group.userData as any)?.isEntity;
        group.visible = isEntity || (numId != null && ids.has(numId));
      } else {
        group.visible = true;
      }
      if (!group.visible) continue;
      if (!frustumRef.current.containsPoint(group.position)) continue;
      if (scaleChanged) {
        const pinScale = group.userData?.pinned ? 1.2 : 1.0;
        group.scale.setScalar(nodeScale * pinScale);
      }
    }

    // Filter-driven node resizing
    const curCM = filterBagRef.current!.centerMode;
    const curEF = filterBagRef.current!.edgeFocus;
    const filterChanged = curCM !== prevFilterSnapshotRef.current.centerMode || curEF !== prevFilterSnapshotRef.current.edgeFocus;
    if (filterChanged) {
      prevFilterSnapshotRef.current = { centerMode: curCM, edgeFocus: curEF };
      const degCent = centralityRef.current;
      const retCent = retrievalCentralityRef.current;
      const ns = Math.min(1.8, Math.max(0.4, 1 / Math.sqrt(Math.max(0.15, zl))));

      // Recompute anchor node
      let bestAnchorId = "";
      if (curCM === "retrieved") {
        let bestCount = -1;
        for (const node of dataRef.current.nodes) {
          if (node.isEntity) continue;
          const retS = retCent.get(node.id) ?? 0;
          if (retS > bestCount) { bestCount = retS; bestAnchorId = node.id; }
        }
      } else {
        let bestDeg = 0;
        for (const [id, deg] of degCent) {
          if (deg > bestDeg) { bestDeg = deg; bestAnchorId = id; }
        }
      }
      anchorRef.current = bestAnchorId;

      for (const [nodeId, group] of nodeObjectCache.current) {
        if (!group.visible) continue;
        const node = dataRef.current.nodes.find((n: any) => n.id === nodeId);
        if (!node) continue;
        const degScore = degCent.get(nodeId) ?? 0;
        const retScore = retCent.get(nodeId) ?? 0;
        const modeScore = curCM === "retrieved" ? retScore
          : curCM === "combined" ? Math.max(degScore, retScore)
          : degScore;
        const rawSize = nodeRadius(node.val, modeScore, optimalKRef.current, VIZ_CONFIGS[vizModeRef.current]);
        const baseSize = curEF ? rawSize * 0.35 : rawSize;
        const pinScale = group.userData?.pinned ? 1.2 : 1.0;
        const mesh = group instanceof THREE.Group ? (group.children[0] as THREE.Mesh) : (group as THREE.Mesh);
        if (mesh?.isMesh) mesh.scale.setScalar(baseSize);
        group.scale.setScalar(ns * pinScale);
      }
    }
  }, []);

  return { nodeThreeObject, tickVisibility };
}
