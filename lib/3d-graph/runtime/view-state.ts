// ── ViewState Manager ───────────────────────────────────────────────
// Reactive state object that captures the complete view configuration.
// One ViewState drives all loading decisions.

import type { ViewState, CameraView, FocusState, TopologyState, Lens, Vec3 } from "./types";

export type ViewStateListener = (state: ViewState) => void;

export class ViewStateManager {
  private state: ViewState;
  private listeners: Set<ViewStateListener> = new Set();
  private dirty = false;

  constructor(initialLens: Lens = "hero") {
    this.state = {
      camera: {
        position: { x: 0, y: 0, z: 800 },
        direction: { x: 0, y: 0, z: -1 },
        velocity: { x: 0, y: 0, z: 0 },
        zoom: 1.0,
      },
      focus: {
        targetType: "global",
        anchor: { x: 0, y: 0, z: 0 },
        radius: 400,
      },
      topology: {
        mode: "global",
        pathDepth: 0,
        neighborhoodDepth: 1,
        expandedNodeIds: [],
        pinnedPathIds: [],
      },
      lens: initialLens,
    };
  }

  get current(): Readonly<ViewState> {
    return this.state;
  }

  // ── Camera updates (called every frame from Three.js camera) ────

  updateCamera(position: Vec3, direction: Vec3, zoom: number): void {
    const cam = this.state.camera;
    // Compute velocity from position delta
    const velocity: Vec3 = {
      x: position.x - cam.position.x,
      y: position.y - cam.position.y,
      z: position.z - cam.position.z,
    };

    this.state.camera = { position, direction, velocity, zoom };
    this.dirty = true;
  }

  // ── Focus changes (from user selection) ───────────────────────

  setFocus(focus: Partial<FocusState>): void {
    this.state.focus = { ...this.state.focus, ...focus };
    this.dirty = true;
    this.notify();
  }

  clearFocus(): void {
    this.state.focus = {
      targetType: "global",
      anchor: { x: 0, y: 0, z: 0 },
      radius: this.state.focus.radius,
    };
    this.state.topology.mode = "global";
    this.dirty = true;
    this.notify();
  }

  // ── Lens changes (from mode selector) ─────────────────────────

  setLens(lens: Lens): void {
    if (this.state.lens === lens) return;
    this.state.lens = lens;
    this.dirty = true;
    this.notify();
  }

  // ── Topology changes ──────────────────────────────────────────

  setTopology(update: Partial<TopologyState>): void {
    this.state.topology = { ...this.state.topology, ...update };
    this.dirty = true;
    this.notify();
  }

  expandNode(nodeId: string): void {
    if (!this.state.topology.expandedNodeIds.includes(nodeId)) {
      this.state.topology.expandedNodeIds = [...this.state.topology.expandedNodeIds, nodeId];
      this.dirty = true;
      this.notify();
    }
  }

  pinPath(pathId: string): void {
    if (!this.state.topology.pinnedPathIds.includes(pathId)) {
      this.state.topology.pinnedPathIds = [...this.state.topology.pinnedPathIds, pathId];
      this.dirty = true;
      this.notify();
    }
  }

  // ── Frame tick (flushes dirty flag) ───────────────────────────

  /** Call once per frame after camera update. Returns true if state changed. */
  tick(): boolean {
    if (this.dirty) {
      this.dirty = false;
      this.notify();
      return true;
    }
    return false;
  }

  // ── Subscriptions ─────────────────────────────────────────────

  subscribe(listener: ViewStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
