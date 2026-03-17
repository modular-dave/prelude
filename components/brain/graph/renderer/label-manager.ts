// ── Label Manager ───────────────────────────────────────────────────
// On-demand label rendering. Labels only appear for:
// - Selected node
// - Hovered node
// - Searched nodes
// - Top-N importance nodes in viewport
// Never renders global labels. Uses a reusable DOM element pool.

import * as THREE from "three";
import type { CanonicalEntity } from "@/lib/3d-graph/compiler/types";
import type { NodeInstances } from "./node-instances";

const MAX_LABELS = 20;

interface LabelEntry {
  element: HTMLDivElement;
  entityId: string | null;
  active: boolean;
}

export class LabelManager {
  private container: HTMLElement;
  private pool: LabelEntry[] = [];
  private camera: THREE.PerspectiveCamera;
  private rendererDom: HTMLCanvasElement;

  constructor(container: HTMLElement, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.container = container;
    this.camera = camera;
    this.rendererDom = canvas;

    // Pre-create label pool
    for (let i = 0; i < MAX_LABELS; i++) {
      const el = document.createElement("div");
      el.className = "graph-label";
      el.style.cssText = `
        position: absolute;
        pointer-events: none;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        color: var(--text-secondary, #aaa);
        background: rgba(10, 10, 10, 0.85);
        padding: 2px 6px;
        border-radius: 3px;
        border: 1px solid var(--border, rgba(255,255,255,0.08));
        white-space: nowrap;
        transform: translate(-50%, -100%);
        opacity: 0;
        transition: opacity 150ms ease;
        z-index: 10;
      `;
      container.appendChild(el);
      this.pool.push({ element: el, entityId: null, active: false });
    }
  }

  // ── Update visible labels ─────────────────────────────────────

  update(
    nodeInstances: NodeInstances,
    entities: CanonicalEntity[],
    config: {
      selectedId?: string | null;
      hoveredId?: string | null;
      searchResults?: string[];
      topImportance?: number;
    },
  ): void {
    // Determine which entities need labels
    const labelTargets: Array<{ id: string; entity: CanonicalEntity; priority: number }> = [];

    for (const entity of entities) {
      let priority = 0;

      if (config.selectedId === entity.id) priority = 100;
      else if (config.hoveredId === entity.id) priority = 90;
      else if (config.searchResults?.includes(entity.id)) priority = 80;
      else continue; // Only show labels for selected/hovered/searched

      labelTargets.push({ id: entity.id, entity, priority });
    }

    // Sort by priority, take top MAX_LABELS
    labelTargets.sort((a, b) => b.priority - a.priority);
    const visible = labelTargets.slice(0, MAX_LABELS);

    // Assign labels from pool
    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];

      if (i < visible.length) {
        const target = visible[i];
        entry.entityId = target.id;
        entry.active = true;
        entry.element.textContent = target.entity.label;
        entry.element.style.opacity = "1";

        // Project 3D position to screen
        const pos3d = nodeInstances.getEntityPosition(target.id);
        if (pos3d) {
          const screen = this.project(pos3d);
          if (screen) {
            entry.element.style.left = `${screen.x}px`;
            entry.element.style.top = `${screen.y - 10}px`;
          } else {
            entry.element.style.opacity = "0";
          }
        } else {
          entry.element.style.opacity = "0";
        }
      } else {
        entry.active = false;
        entry.entityId = null;
        entry.element.style.opacity = "0";
      }
    }
  }

  // ── 3D → 2D projection ───────────────────────────────────────

  private project(position: THREE.Vector3): { x: number; y: number } | null {
    const vector = position.clone().project(this.camera);

    // Behind camera
    if (vector.z > 1) return null;

    const rect = this.rendererDom.getBoundingClientRect();
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-vector.y * 0.5 + 0.5) * rect.height,
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────

  dispose(): void {
    for (const entry of this.pool) {
      entry.element.remove();
    }
    this.pool.length = 0;
  }
}
