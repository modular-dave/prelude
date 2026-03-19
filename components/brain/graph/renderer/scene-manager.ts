// ── Scene Manager ───────────────────────────────────────────────────
// Creates and manages the Three.js Scene, Camera, Renderer, Controls.
// Owns the render loop. Replaces react-force-graph-3d's scene management.

import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

interface ActiveAnimation {
  startPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endPos: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTime: number;
  duration: number;
}

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: TrackballControls;

  private container: HTMLElement;
  private rafId: number | null = null;
  private tickCallbacks: Array<(dt: number) => void> = [];
  private postControlsCallbacks: Array<(dt: number) => void> = [];
  private clock = { lastTime: 0 };

  // Animation state — driven by the main render loop, no separate RAF
  private animation: ActiveAnimation | null = null;

  constructor(container: HTMLElement, width: number, height: number, bubbleRadius = 400) {
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f0eb);

    // Camera — position at 2.5x bubble radius to see the whole sphere
    const camDist = bubbleRadius * 2.5;
    this.camera = new THREE.PerspectiveCamera(60, width / height, 1, camDist * 5);
    this.camera.position.set(0, 0, camDist);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new TrackballControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 2.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0;
    this.controls.noPan = true;
    this.controls.noZoom = false;
    this.controls.minDistance = bubbleRadius * 0.1;
    this.controls.maxDistance = camDist * 2;
    this.controls.dynamicDampingFactor = 0.15;
    this.controls.staticMoving = false;

    // Lights — strong ambient + directional for clear colors
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(1, 1, 1);
    this.scene.add(directional);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-1, -0.5, -1);
    this.scene.add(backLight);
  }

  // ── Render loop ───────────────────────────────────────────────

  onTick(callback: (dt: number) => void): void {
    this.tickCallbacks.push(callback);
  }

  onPostControls(callback: (dt: number) => void): void {
    this.postControlsCallbacks.push(callback);
  }

  start(): void {
    if (this.rafId !== null) return;
    this.clock.lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.clock.lastTime) / 1000); // cap dt at 50ms
      this.clock.lastTime = now;

      // Drive camera animation (if active) BEFORE tick callbacks
      if (this.animation) {
        const a = this.animation;
        const t = Math.min(1, (now - a.startTime) / a.duration);
        const ease = easeInOutQuart(t);
        this.camera.position.lerpVectors(a.startPos, a.endPos, ease);
        this.controls.target.lerpVectors(a.startTarget, a.endTarget, ease);
        this.camera.lookAt(this.controls.target);
        if (t >= 1) {
          this.animation = null;
          this.controls.enabled = true;
          // Sync TrackballControls internal state — prevents stale rotation/zoom deltas
          const c = this.controls as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (c._movePrev && c._moveCurr) c._movePrev.copy(c._moveCurr);
          if (c._zoomStart && c._zoomEnd) c._zoomStart.copy(c._zoomEnd);
        }
      }

      // Run tick callbacks
      for (const cb of this.tickCallbacks) cb(dt);

      // Update controls (skip during animated transitions to prevent fighting)
      if (!this.animation) this.controls.update();

      // Post-controls hooks (e.g. sphere clamping that must run after controls)
      for (const cb of this.postControlsCallbacks) cb(dt);

      // Render
      this.renderer.render(this.scene, this.camera);

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // ── Resize ────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.controls.handleResize();
  }

  // ── Camera helpers ────────────────────────────────────────────

  getCameraPosition(): { x: number; y: number; z: number } {
    return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
  }

  getCameraDirection(): { x: number; y: number; z: number } {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return { x: dir.x, y: dir.y, z: dir.z };
  }

  getCameraZoom(): number {
    const dist = this.camera.position.length();
    return 800 / Math.max(1, dist); // normalized: 1.0 = default distance
  }

  // Unified camera movement — single source of truth for all camera changes.
  // Animation is driven by the main render loop (no separate RAF).
  moveTo(position: THREE.Vector3, target: THREE.Vector3, animate = true, duration = 500): void {
    // Cancel any running animation
    this.animation = null;

    if (!animate) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.enabled = true;
      return;
    }

    this.controls.enabled = false; // prevent input accumulation during animation
    this.animation = {
      startPos: this.camera.position.clone(),
      startTarget: this.controls.target.clone(),
      endPos: position.clone(),
      endTarget: target.clone(),
      startTime: performance.now(),
      duration,
    };
  }

  get animating(): boolean {
    return this.animation !== null;
  }

  // ── Canvas access ─────────────────────────────────────────────

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  // ── Cleanup ───────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    this.animation = null;
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.clear();
    this.tickCallbacks.length = 0;
    this.postControlsCallbacks.length = 0;
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}
