import { useCallback, useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import type { FilterBag } from "@/lib/types";
import { VIZ_CONFIGS } from "@/lib/3d-graph/constants";
import { computeLOD, adaptiveOrbitSpeed, kNearestCentroid, nearestNodeToRay, computeZoomBounds } from "@/lib/3d-graph/utils";
import type { CameraPose, CameraState, LODLevel, NavZone } from "@/lib/3d-graph/types";
import { SHARED_GEO } from "@/lib/3d-graph/constants";

interface UseCameraControllerParams {
  graphRef: React.RefObject<any>;
  filterBagRef: React.RefObject<FilterBag>;
  dataRef: React.RefObject<{ nodes: any[]; links: any[] }>;
  bubbleRadiusRef: React.RefObject<number>;
  optimalKRef: React.RefObject<number>;
  vizMode: "hero" | "cluster" | "zero";
  vizModeRef: React.RefObject<"hero" | "cluster" | "zero">;
  width?: number;
  height?: number;
  selectedEdge: { sourceId: string; targetId: string } | null;
  selectedGraphId: string | null;
  highlightedPath: Set<string> | null;
  nodeObjectCache: React.RefObject<Map<string, THREE.Group>>;
  autoRotate: boolean;
  onAutoRotateChange?: (rotating: boolean) => void;
  onReady?: () => void;
  hoveredNodeIdRef: React.RefObject<string | null>;
  hoveredLinkRef: React.RefObject<boolean>;
  data: { nodes: any[]; links: any[] };
}

export function useCameraController({
  graphRef, filterBagRef, dataRef, bubbleRadiusRef, optimalKRef,
  vizMode, vizModeRef, width, height, selectedEdge, selectedGraphId,
  highlightedPath, nodeObjectCache, autoRotate, onAutoRotateChange, onReady,
  hoveredNodeIdRef, hoveredLinkRef, data,
}: UseCameraControllerParams) {
  // Camera/navigation refs
  const zoomLevelRef = useRef(1.0);
  const lodLevelRef = useRef<LODLevel>("mid");
  const prevLodRef = useRef<LODLevel>("mid");
  const lodDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNodeScaleRef = useRef(1.0);
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const navAnchorRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const mouseNdcRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomVelocityRef = useRef(0);
  const zoomInertiaActiveRef = useRef(false);
  const ZOOM_INERTIA_DECAY = 0.88;
  const frustumRef = useRef(new THREE.Frustum());
  const frustumMatRef = useRef(new THREE.Matrix4());
  const interactionLodRef = useRef(false);
  const interactionLodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navZoneRef = useRef<NavZone>("OUTSIDE");
  const localPivotRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const dragPivotLockedRef = useRef(false);
  const cameraStateRef = useRef<CameraState>({ mode: "ORBIT" });
  const zoomMinDistRef = useRef<number>(3);
  const adaptiveCamDistRef = useRef<number>(0);
  const hasCenteredRef = useRef(false);
  const wasInsideBubbleRef = useRef(false);
  const edgeCameraSetRef = useRef<string | null>(null);
  const prevSelectedEdgeRef = useRef(selectedEdge);
  const prevSelectedGraphIdRef = useRef(selectedGraphId);

  // Active config
  const activeConfig = VIZ_CONFIGS[vizMode];

  // Default camera distance
  const defaultCamDist = useMemo(() => {
    const vFov = (75 * Math.PI) / 180;
    const aspect = (width && height) ? width / height : 1;
    const fitH = bubbleRadiusRef.current / Math.tan(vFov / 2);
    const fitW = bubbleRadiusRef.current / (Math.tan(vFov / 2) * aspect);
    return Math.max(fitH, fitW) * activeConfig.cameraFitMargin;
  }, [bubbleRadiusRef.current, width, height, activeConfig.cameraFitMargin]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultCamDistRef = useRef(defaultCamDist);
  defaultCamDistRef.current = defaultCamDist;
  const zoomMaxDistRef = useRef<number>(defaultCamDist * 1.15);

  // Ref mirrors
  const selectedEdgeRef = useRef(selectedEdge);
  selectedEdgeRef.current = selectedEdge;
  const selectedGraphIdRef = useRef(selectedGraphId);
  selectedGraphIdRef.current = selectedGraphId;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const onAutoRotateChangeRef = useRef(onAutoRotateChange);
  onAutoRotateChangeRef.current = onAutoRotateChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const highlightedPathRef = useRef(highlightedPath);
  highlightedPathRef.current = highlightedPath;

  // Camera fly-to
  const requestCameraFlyTo = useCallback((to: CameraPose, duration: number, thenMode: "ORBIT" | "SETTLED" = "ORBIT") => {
    const fg = graphRef.current;
    if (!fg) return;
    const cam = fg.camera?.();
    if (!cam) return;
    const controls = fg.controls?.();
    if (duration === 0) {
      cam.position.set(to.pos.x, to.pos.y, to.pos.z);
      cam.lookAt(to.lookAt.x, to.lookAt.y, to.lookAt.z);
      if (controls?.target) controls.target.set(to.lookAt.x, to.lookAt.y, to.lookAt.z);
      if (controls) controls.enabled = true;
      cameraStateRef.current = { mode: thenMode };
      return;
    }
    if (controls) controls.enabled = false;
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

  // Engine stop handler
  const onEngineStop = useCallback(() => {
    onReadyRef.current?.();
    if (hasCenteredRef.current || !graphRef.current) return;
    hasCenteredRef.current = true;
    if (selectedEdgeRef.current) return;

    const fg = graphRef.current;
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
    const config = VIZ_CONFIGS[vizModeRef.current];
    const adaptiveDist = Math.max(fitH, fitW) * config.cameraFitMargin;

    adaptiveCamDistRef.current = adaptiveDist;
    requestCameraFlyTo(
      { pos: { x: 0, y: 0, z: adaptiveDist }, lookAt: { x: 0, y: 0, z: 0 } },
      800, "ORBIT"
    );
  }, [width, height, requestCameraFlyTo]);

  // Setup camera controls in graphRefCallback
  const setupCameraControls = useCallback((fg: any) => {
    requestCameraFlyTo(
      { pos: { x: 0, y: 0, z: defaultCamDistRef.current }, lookAt: { x: 0, y: 0, z: 0 } },
      0, "ORBIT"
    );
    const ctrl = fg.controls?.();
    if (ctrl) {
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
          if (navZoneRef.current === "INSIDE" && !dragPivotLockedRef.current) {
            dragPivotLockedRef.current = true;
            ctrl.target.copy(localPivotRef.current);
          }
        }
      });
      ctrl.addEventListener("end", () => {
        dragPivotLockedRef.current = false;
        if (cameraStateRef.current.mode === "USER_CONTROL") {
          const inSubView = selectedEdgeRef.current || selectedGraphIdRef.current;
          cameraStateRef.current = { mode: inSubView ? "SETTLED" : "ORBIT" };
        }
      });
    }

    // Cursor-directed zoom
    const renderer = fg.renderer?.();
    if (renderer && ctrl) {
      const canvas = renderer.domElement;
      let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

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

        const delta = e.deltaY / 100;
        zoomVelocityRef.current += delta * 0.08;
        zoomVelocityRef.current = Math.max(-0.5, Math.min(0.5, zoomVelocityRef.current));
        zoomInertiaActiveRef.current = true;

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

  // Reposition on bubble size change
  useEffect(() => {
    if (!graphRef.current || selectedEdgeRef.current) return;
    requestCameraFlyTo(
      { pos: { x: 0, y: 0, z: defaultCamDist }, lookAt: { x: 0, y: 0, z: 0 } },
      0, "ORBIT"
    );
  }, [defaultCamDist, requestCameraFlyTo]);

  // vizMode change: reset centered flag
  useEffect(() => {
    hasCenteredRef.current = false;
    adaptiveCamDistRef.current = 0;
  }, [vizMode]);

  // Focus camera on selected node
  useEffect(() => {
    if (!selectedGraphId || !graphRef.current) return;
    const node = data.nodes.find((n: any) => n.id === selectedGraphId) as any;
    if (!node || !("x" in node)) return;
    const distance = optimalKRef.current * 2;
    const nodeLen = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
    const distRatio = 1 + distance / nodeLen;
    navAnchorRef.current.set(node.x || 0, node.y || 0, node.z || 0);
    const nb = computeZoomBounds(true, adaptiveCamDistRef.current || defaultCamDistRef.current, defaultCamDistRef.current);
    zoomMinDistRef.current = nb.min;
    zoomMaxDistRef.current = nb.max;
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

  // Focus camera on edge midpoint
  useEffect(() => {
    if (!selectedEdge || !graphRef.current) return;
    const edgeKey = selectedEdge.sourceId + '-' + selectedEdge.targetId;
    if (edgeCameraSetRef.current === edgeKey) return;
    const srcNode = data.nodes.find((n: any) => n.id === selectedEdge.sourceId) as any;
    const tgtNode = data.nodes.find((n: any) => n.id === selectedEdge.targetId) as any;
    if (!srcNode || !tgtNode || !('x' in srcNode) || !('x' in tgtNode)) return;
    edgeCameraSetRef.current = edgeKey;
    const mid = {
      x: ((srcNode.x || 0) + (tgtNode.x || 0)) / 2,
      y: ((srcNode.y || 0) + (tgtNode.y || 0)) / 2,
      z: ((srcNode.z || 0) + (tgtNode.z || 0)) / 2,
    };
    navAnchorRef.current.set(mid.x, mid.y, mid.z);
    const nodeDist = Math.hypot(
      (srcNode.x || 0) - (tgtNode.x || 0),
      (srcNode.y || 0) - (tgtNode.y || 0),
      (srcNode.z || 0) - (tgtNode.z || 0)
    );
    const cam = graphRef.current.camera?.();
    const vFov = ((cam?.fov || 75) * Math.PI) / 180;
    const camDist = Math.max(80, (nodeDist / 2) / Math.tan(vFov / 2) * 3.2);
    const eb = computeZoomBounds(true, adaptiveCamDistRef.current || defaultCamDistRef.current, defaultCamDistRef.current);
    zoomMinDistRef.current = eb.min;
    zoomMaxDistRef.current = eb.max;
    const midLen = Math.hypot(mid.x, mid.y, mid.z);
    const dir = midLen > 1
      ? { x: mid.x / midLen, y: mid.y / midLen, z: mid.z / midLen }
      : { x: 0.57, y: 0.57, z: 0.57 };
    requestCameraFlyTo(
      { pos: { x: mid.x + dir.x * camDist, y: mid.y + dir.y * camDist, z: mid.z + dir.z * camDist }, lookAt: mid },
      1200, "SETTLED"
    );
  }, [selectedEdge, data.nodes, requestCameraFlyTo]);

  // Reset camera when exiting sub-view
  useEffect(() => {
    const wasEdge = prevSelectedEdgeRef.current;
    const wasNode = prevSelectedGraphIdRef.current;
    prevSelectedEdgeRef.current = selectedEdge;
    prevSelectedGraphIdRef.current = selectedGraphId;

    if ((wasEdge && !selectedEdge) || (wasNode && !selectedGraphId)) {
      edgeCameraSetRef.current = null;
      navAnchorRef.current.set(0, 0, 0);
      const xb = computeZoomBounds(false, adaptiveCamDistRef.current || defaultCamDistRef.current, defaultCamDistRef.current);
      zoomMinDistRef.current = xb.min;
      zoomMaxDistRef.current = xb.max;
      const dist = adaptiveCamDistRef.current || defaultCamDistRef.current;
      requestCameraFlyTo(
        { pos: { x: 0, y: 0, z: dist }, lookAt: { x: 0, y: 0, z: 0 } },
        800, "ORBIT"
      );
    }
  }, [selectedEdge, selectedGraphId, requestCameraFlyTo]);

  // Cinematic dolly for highlighted path
  useEffect(() => {
    if (!selectedEdge || !highlightedPath) return;
    const fg = graphRef.current;
    if (!fg) return;
    const srcNode = data.nodes.find((n: any) => n.id === selectedEdge.sourceId) as any;
    const tgtNode = data.nodes.find((n: any) => n.id === selectedEdge.targetId) as any;
    if (!srcNode || !tgtNode || !('x' in srcNode) || !('x' in tgtNode)) return;

    const mid = {
      x: ((srcNode.x || 0) + (tgtNode.x || 0)) / 2,
      y: ((srcNode.y || 0) + (tgtNode.y || 0)) / 2,
      z: ((srcNode.z || 0) + (tgtNode.z || 0)) / 2,
    };

    const cam = fg.camera?.();
    if (!cam) return;
    const vFov = (cam.fov || 75) * Math.PI / 180;

    const nodeDist = Math.hypot(
      (srcNode.x || 0) - (tgtNode.x || 0),
      (srcNode.y || 0) - (tgtNode.y || 0),
      (srcNode.z || 0) - (tgtNode.z || 0)
    );
    const baseDist = Math.max(80, (nodeDist / 2) / Math.tan(vFov / 2) * 3.2);

    let targetDist: number;
    if (highlightedPath.size <= 2) {
      targetDist = baseDist;
    } else {
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

    zoomMinDistRef.current = baseDist;
    zoomMaxDistRef.current = Math.max(targetDist, defaultCamDistRef.current);

    const camPos = cam.position;
    const dx = camPos.x - mid.x;
    const dy = camPos.y - mid.y;
    const dz = camPos.z - mid.z;
    const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    if (Math.abs(targetDist - currentDist) / currentDist < 0.05) return;

    const ratio = targetDist / currentDist;
    requestCameraFlyTo(
      {
        pos: { x: mid.x + dx * ratio, y: mid.y + dy * ratio, z: mid.z + dz * ratio },
        lookAt: { x: mid.x, y: mid.y, z: mid.z },
      },
      600, "SETTLED"
    );
    navAnchorRef.current.set(mid.x, mid.y, mid.z);
  }, [highlightedPath, selectedEdge, data.nodes]);

  // Tick sub-functions
  const tickZoomAndLOD = useCallback((cam: any, controls: any, config: any) => {
    if (!cam) return;
    const dist = controls?.target
      ? cam.position.distanceTo(controls.target)
      : cam.position.length();
    const refDist = adaptiveCamDistRef.current || defaultCamDistRef.current;
    zoomLevelRef.current = refDist > 0 ? dist / refDist : 1.0;

    const desiredNear = Math.max(1, dist * 0.01);
    const desiredFar = Math.max(dist * 100, bubbleRadiusRef.current * 10);
    if (Math.abs(cam.near - desiredNear) > 0.5) {
      cam.near = desiredNear;
      cam.far = desiredFar;
      cam.updateProjectionMatrix();
    }

    // Navigation zone detection
    const distToCenter = cam.position.length();
    const bR = bubbleRadiusRef.current;
    const prevZone = navZoneRef.current;
    const newZone: NavZone = prevZone === "OUTSIDE"
      ? (distToCenter < bR * 0.85 ? "INSIDE" : "OUTSIDE")
      : (distToCenter > bR * 1.05 ? "OUTSIDE" : "INSIDE");
    navZoneRef.current = newZone;

    if (newZone === "INSIDE" && !dragPivotLockedRef.current) {
      localPivotRef.current = kNearestCentroid(cam.position, dataRef.current.nodes, 5);
    }

    const insideBubble = newZone === "INSIDE";
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
            if (isGroup && obj.children[1] instanceof THREE.Mesh) {
              obj.children[1].geometry = isHigh ? SHARED_GEO.haloHi : SHARED_GEO.haloLo;
            }
          }
        }, 100);
      }
    }
  }, []);

  const tickFrustum = useCallback((cam: any) => {
    if (!cam) return;
    cam.updateMatrixWorld();
    frustumMatRef.current.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustumRef.current.setFromProjectionMatrix(frustumMatRef.current);
  }, []);

  const tickZoomLimits = useCallback((cam: any, controls: any, state: CameraState) => {
    if (!controls) return;
    const inSubView = !!(selectedEdgeRef.current || selectedGraphIdRef.current);
    const baseDist = adaptiveCamDistRef.current || defaultCamDistRef.current;
    const bounds = computeZoomBounds(inSubView, baseDist, defaultCamDistRef.current);
    zoomMinDistRef.current = bounds.min;
    if (!inSubView || !selectedEdgeRef.current) {
      zoomMaxDistRef.current = bounds.max;
    }
    controls.minDistance = zoomMinDistRef.current;
    controls.maxDistance = zoomMaxDistRef.current;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const distToTarget = cam.position.distanceTo(controls.target);
    if (distToTarget > baseDist && state.mode !== "FLY_TO") {
      const overshoot = distToTarget / baseDist;
      const springStrength = Math.min(0.15, (overshoot - 1) * 0.5);
      const dir = cam.position.clone().sub(controls.target).normalize();
      const pullDist = lerp(distToTarget, baseDist, springStrength);
      cam.position.copy(controls.target).addScaledVector(dir, pullDist);
      const center = inSubView ? navAnchorRef.current : new THREE.Vector3(0, 0, 0);
      controls.target.lerp(center, springStrength);
      controls.update();
    }
    const hardMax = baseDist * 1.15;
    if (distToTarget > hardMax && state.mode !== "FLY_TO") {
      const dir = cam.position.clone().sub(controls.target).normalize();
      cam.position.copy(controls.target).addScaledVector(dir, hardMax);
    }

    if ((controls as any).panSpeed !== undefined)
      (controls as any).panSpeed = 1.2;
    if ((controls as any).rotateSpeed !== undefined) {
      if (navZoneRef.current === "INSIDE") {
        const localDist = cam.position.distanceTo(localPivotRef.current);
        (controls as any).rotateSpeed = Math.max(0.15, Math.min(0.5, 0.3 * Math.sqrt(localDist / 50)));
      } else {
        (controls as any).rotateSpeed = Math.max(0.3, Math.min(1.0, 0.6 * Math.sqrt(distToTarget / (baseDist || 1))));
      }
    }
  }, []);

  const tickStateMachine = useCallback((cam: any, controls: any, state: CameraState, config: any, angleRef: { value: number }) => {
    const easeInOutQuart = (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
        if (controls) controls.enabled = true;
        try {
          const fg = graphRef.current;
          const p = VIZ_CONFIGS[vizModeRef.current];
          fg?.d3AlphaDecay?.(p.alphaDecay);
        } catch { /* noop */ }
        cameraStateRef.current = { mode: state.then };
      }
    } else if (state.mode === "ORBIT" && cam) {
      if (autoRotateRef.current && !hoveredNodeIdRef.current && !hoveredLinkRef.current) {
        angleRef.value += adaptiveOrbitSpeed(zoomLevelRef.current, config);

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
        cam.position.x = cx + r * Math.sin(angleRef.value);
        cam.position.z = cz + r * Math.cos(angleRef.value);
        cam.lookAt(cx, cy, cz);
        if (controls?.target) controls.target.set(cx, cy, cz);
      }
    }
  }, []);

  const tickZoomInertia = useCallback((cam: any, controls: any) => {
    if (!zoomInertiaActiveRef.current || !cam || !controls) return;
    const vel = zoomVelocityRef.current;
    if (Math.abs(vel) > 0.0005) {
      const currentDist = cam.position.distanceTo(controls.target);
      const baseDist = adaptiveCamDistRef.current || defaultCamDistRef.current || 1;
      const inSubView = !!(selectedEdgeRef.current || selectedGraphIdRef.current);

      let newDist = currentDist * (1 + vel);
      newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));

      if (Math.abs(newDist - currentDist) > 0.01) {
        const dollyAmount = currentDist - newDist;
        const ndc = mouseNdcRef.current;
        const cursorRay = new THREE.Vector3(ndc.x, ndc.y, 0.5)
          .unproject(cam).sub(cam.position).normalize();

        if (vel < 0) {
          const hit = nearestNodeToRay(
            cam.position, cursorRay, dataRef.current.nodes,
            bubbleRadiusRef.current * 0.15,
          );
          cam.position.addScaledVector(cursorRay, dollyAmount);
          if (hit) {
            controls.target.lerp(hit.point, 0.08);
          }
        } else {
          const viewDir = new THREE.Vector3().subVectors(controls.target, cam.position).normalize();
          cam.position.addScaledVector(viewDir, dollyAmount);
          const center = inSubView ? navAnchorRef.current : new THREE.Vector3(0, 0, 0);
          const outRatio = currentDist / baseDist;
          const t = Math.min(1, Math.max(0, outRatio - 0.3));
          controls.target.lerp(center, t * t * 0.15);
        }
        controls.update();
      }

      if (navZoneRef.current === "INSIDE" && !inSubView && !dragPivotLockedRef.current) {
        controls.target.lerp(localPivotRef.current, 0.05);
      }

      zoomVelocityRef.current *= ZOOM_INERTIA_DECAY;
    } else {
      zoomVelocityRef.current = 0;
      zoomInertiaActiveRef.current = false;
      if (cameraStateRef.current.mode === "USER_CONTROL") {
        const stillInSubView = !!(selectedEdgeRef.current || selectedGraphIdRef.current);
        cameraStateRef.current = { mode: stillInSubView ? "SETTLED" : "ORBIT" };
      }
    }
  }, []);

  const tickAdaptiveQuality = useCallback((state: CameraState) => {
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
  }, []);

  return {
    requestCameraFlyTo, cameraStateRef, zoomLevelRef, lodLevelRef,
    navAnchorRef, frustumRef, zoomMinDistRef, zoomMaxDistRef,
    adaptiveCamDistRef, defaultCamDist, defaultCamDistRef,
    onEngineStop, setupCameraControls, wheelCleanupRef,
    prevNodeScaleRef, highlightedPathRef,
    tickZoomAndLOD, tickFrustum, tickZoomLimits, tickStateMachine, tickZoomInertia, tickAdaptiveQuality,
    hasCenteredRef,
  };
}
