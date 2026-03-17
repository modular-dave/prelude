// ── Scene Manager ───────────────────────────────────────────────────
// Creates and manages the Three.js Scene, Camera, Renderer, Controls.
// Owns the render loop. Replaces react-force-graph-3d's scene management.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private container: HTMLElement;
  private rafId: number | null = null;
  private tickCallbacks: Array<(dt: number) => void> = [];
  private clock = { lastTime: 0 };

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
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 1.2;
    this.controls.minDistance = bubbleRadius * 0.1;
    this.controls.maxDistance = camDist * 2;
    this.controls.enablePan = false;

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

  start(): void {
    if (this.rafId !== null) return;
    this.clock.lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.clock.lastTime) / 1000); // cap dt at 50ms
      this.clock.lastTime = now;

      // Run tick callbacks
      for (const cb of this.tickCallbacks) cb(dt);

      // Update controls
      this.controls.update();

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

  flyTo(target: THREE.Vector3, duration = 1000): Promise<void> {
    return new Promise(resolve => {
      const startPos = this.camera.position.clone();
      const startLookAt = this.controls.target.clone();
      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = easeInOutQuart(t);

        this.camera.position.lerpVectors(startPos, target, ease);
        this.controls.target.lerpVectors(startLookAt, new THREE.Vector3(0, 0, 0), ease);
        this.controls.update();

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      animate();
    });
  }

  // ── Canvas access ─────────────────────────────────────────────

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  // ── Cleanup ───────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.clear();
    this.tickCallbacks.length = 0;
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}
