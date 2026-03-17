// ── Camera Controller ───────────────────────────────────────────────
// Camera state machine with fly-to, orbit, zoom inertia, navigation zones.
// Ported from use-camera-controller.ts for direct Three.js control.

import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ViewStateManager } from "@/lib/3d-graph/runtime/view-state";
import type { NodeInstances } from "../renderer/node-instances";

type CameraMode = "ORBIT" | "FLY_TO" | "SETTLED" | "USER_CONTROL";

interface FlyToState {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  startTime: number;
  duration: number;
  thenMode: "ORBIT" | "SETTLED";
}

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mode: CameraMode = "ORBIT";
  private flyTo: FlyToState | null = null;
  private autoRotate = false;
  private autoRotateSpeed = 0.003;
  private orbitAngle = 0;

  // Zoom inertia
  private zoomVelocity = 0;
  private readonly zoomDecay = 0.88;
  private lastUserInteraction = 0;
  private settleDelay = 2000; // ms before resuming orbit

  // Navigation zones
  private bubbleRadius = 400;

  constructor(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    bubbleRadius: number,
  ) {
    this.camera = camera;
    this.controls = controls;
    this.bubbleRadius = bubbleRadius;
  }

  // ── Per-frame update ──────────────────────────────────────────

  tick(dt: number): void {
    const now = performance.now();

    switch (this.mode) {
      case "ORBIT":
        this.tickOrbit(dt);
        break;
      case "FLY_TO":
        this.tickFlyTo(now);
        break;
      case "SETTLED":
        this.tickSettled(now);
        break;
      case "USER_CONTROL":
        this.tickUserControl(now);
        break;
    }

    // Zoom inertia
    if (Math.abs(this.zoomVelocity) > 0.001) {
      const dist = this.camera.position.length();
      const dir = this.camera.position.clone().normalize();
      const newDist = Math.max(
        this.controls.minDistance,
        Math.min(this.controls.maxDistance, dist * (1 - this.zoomVelocity * 0.1)),
      );
      this.camera.position.copy(dir.multiplyScalar(newDist));
      this.zoomVelocity *= this.zoomDecay;
    }

    // Enforce distance limits with elastic spring
    this.enforceDistanceLimits();
  }

  // ── Mode tickers ──────────────────────────────────────────────

  private tickOrbit(dt: number): void {
    if (!this.autoRotate) return;

    this.orbitAngle += this.autoRotateSpeed * this.adaptiveOrbitSpeed();
    const dist = this.camera.position.length();
    const target = this.controls.target;

    const relX = Math.sin(this.orbitAngle) * dist;
    const relZ = Math.cos(this.orbitAngle) * dist;

    this.camera.position.set(
      target.x + relX,
      this.camera.position.y,
      target.z + relZ,
    );
    this.camera.lookAt(target);
  }

  private tickFlyTo(now: number): void {
    if (!this.flyTo) { this.mode = "SETTLED"; return; }

    const elapsed = now - this.flyTo.startTime;
    const t = Math.min(1, elapsed / this.flyTo.duration);
    const ease = easeInOutQuart(t);

    this.camera.position.lerpVectors(this.flyTo.fromPos, this.flyTo.toPos, ease);
    this.controls.target.lerpVectors(this.flyTo.fromTarget, this.flyTo.toTarget, ease);

    if (t >= 1) {
      this.mode = this.flyTo.thenMode;
      this.flyTo = null;
      if (this.mode === "ORBIT") {
        this.orbitAngle = Math.atan2(this.camera.position.x - this.controls.target.x,
          this.camera.position.z - this.controls.target.z);
      }
    }
  }

  private tickSettled(now: number): void {
    // After settle delay with no interaction, resume orbit
    if (this.autoRotate && now - this.lastUserInteraction > this.settleDelay) {
      this.mode = "ORBIT";
      this.orbitAngle = Math.atan2(
        this.camera.position.x - this.controls.target.x,
        this.camera.position.z - this.controls.target.z,
      );
    }
  }

  private tickUserControl(now: number): void {
    this.lastUserInteraction = now;
    // Transition back to settled when user stops interacting
    // (detected via controls change events externally)
  }

  // ── Camera transitions ────────────────────────────────────────

  requestFlyTo(
    toPos: THREE.Vector3,
    toTarget: THREE.Vector3,
    duration: number,
    thenMode: "ORBIT" | "SETTLED" = "ORBIT",
  ): void {
    this.flyTo = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: toPos.clone(),
      toTarget: toTarget.clone(),
      startTime: performance.now(),
      duration,
      thenMode,
    };
    this.mode = "FLY_TO";
    this.zoomVelocity = 0;
  }

  flyToEntity(position: THREE.Vector3, duration = 1000): void {
    const offset = position.clone().normalize().multiplyScalar(200);
    const camPos = position.clone().add(offset);
    this.requestFlyTo(camPos, position, duration, "SETTLED");
  }

  // ── State controls ────────────────────────────────────────────

  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
    if (enabled && this.mode === "SETTLED") {
      this.mode = "ORBIT";
      this.orbitAngle = Math.atan2(
        this.camera.position.x - this.controls.target.x,
        this.camera.position.z - this.controls.target.z,
      );
    }
  }

  notifyUserInteraction(): void {
    this.lastUserInteraction = performance.now();
    if (this.mode === "ORBIT") {
      this.mode = "USER_CONTROL";
    }
  }

  notifyUserInteractionEnd(): void {
    if (this.mode === "USER_CONTROL") {
      this.mode = "SETTLED";
      this.lastUserInteraction = performance.now();
    }
  }

  addZoomVelocity(delta: number): void {
    this.zoomVelocity += delta;
    this.zoomVelocity = Math.max(-0.5, Math.min(0.5, this.zoomVelocity));
  }

  // ── Helpers ───────────────────────────────────────────────────

  private adaptiveOrbitSpeed(): number {
    const dist = this.camera.position.length();
    const normalized = dist / this.bubbleRadius;
    return Math.max(0.3, Math.min(2.0, 1.0 / normalized));
  }

  private enforceDistanceLimits(): void {
    const dist = this.camera.position.length();
    const minDist = this.controls.minDistance;
    const maxDist = this.controls.maxDistance;

    if (dist < minDist) {
      // Elastic spring back
      const overshoot = minDist - dist;
      const springForce = overshoot * 0.1;
      const dir = this.camera.position.clone().normalize();
      this.camera.position.addScaledVector(dir, springForce);
    } else if (dist > maxDist) {
      const overshoot = dist - maxDist;
      const springForce = overshoot * 0.1;
      const dir = this.camera.position.clone().normalize();
      this.camera.position.addScaledVector(dir, -springForce);
    }
  }

  get currentMode(): CameraMode {
    return this.mode;
  }
}

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}
