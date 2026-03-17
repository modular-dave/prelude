// ── Edge Instances ──────────────────────────────────────────────────
// Renders classified edges using instanced line segments.
// Aggregate edges are wide + transparent; path edges are bright + animated.

import * as THREE from "three";
import type { ClassifiedEdge } from "./edge-classifier";
import type { NodeInstances } from "./node-instances";
import type { EdgeClass } from "@/lib/3d-graph/runtime/types";
import { LINK_TYPE_COLORS } from "@/lib/types";

const MAX_EDGE_INSTANCES = 8192;

// Opacity by edge class (color comes from linkType)
const EDGE_CLASS_OPACITY: Record<EdgeClass, number> = {
  "aggregate": 0.25,
  "frontier": 0.35,
  "neighborhood": 0.5,
  "path-highlight": 0.9,
};

const FALLBACK_EDGE_COLOR = "#6b7280";

export class EdgeInstances {
  private lines: THREE.LineSegments;
  private positionAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private edgeCount = 0;
  private visible = true;

  constructor() {
    const geometry = new THREE.BufferGeometry();

    // Each edge is 2 vertices (start, end)
    const positions = new Float32Array(MAX_EDGE_INSTANCES * 2 * 3);
    const colors = new Float32Array(MAX_EDGE_INSTANCES * 2 * 3);

    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", this.positionAttr);

    this.colorAttr = new THREE.BufferAttribute(colors, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("color", this.colorAttr);

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      linewidth: 1, // WebGL line width is always 1 on most platforms
    });

    this.lines = new THREE.LineSegments(geometry, material);
    this.lines.frustumCulled = false;
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.lines);
  }

  // ── Sync from classified edges ────────────────────────────────

  syncFromEdges(edges: ClassifiedEdge[], nodeInstances: NodeInstances, edgeFocus = false): void {
    this.edgeCount = 0;
    const positions = this.positionAttr.array as Float32Array;
    const colors = this.colorAttr.array as Float32Array;

    // In node-focus mode, edges are faint background context.
    // In edge-focus mode, edges are the primary visual element.
    const globalOpacity = edgeFocus ? 1.0 : 0.12;
    const mat = this.lines.material as THREE.LineBasicMaterial;
    mat.opacity = edgeFocus ? 0.9 : 0.3;

    for (const edge of edges) {
      if (this.edgeCount >= MAX_EDGE_INSTANCES) break;

      const srcPos = nodeInstances.getEntityPosition(edge.source);
      const tgtPos = nodeInstances.getEntityPosition(edge.target);
      if (!srcPos || !tgtPos) continue;

      const linkColor = LINK_TYPE_COLORS[edge.linkType] || FALLBACK_EDGE_COLOR;
      const classOpacity = EDGE_CLASS_OPACITY[edge.edgeClass];
      const opacity = classOpacity * globalOpacity;
      const color = new THREE.Color(linkColor);

      const i = this.edgeCount * 6;

      // Start vertex
      positions[i] = srcPos.x;
      positions[i + 1] = srcPos.y;
      positions[i + 2] = srcPos.z;

      // End vertex
      positions[i + 3] = tgtPos.x;
      positions[i + 4] = tgtPos.y;
      positions[i + 5] = tgtPos.z;

      // Colors (with opacity baked into brightness)
      const r = color.r * opacity;
      const g = color.g * opacity;
      const b = color.b * opacity;
      colors[i] = r; colors[i + 1] = g; colors[i + 2] = b;
      colors[i + 3] = r; colors[i + 4] = g; colors[i + 5] = b;

      this.edgeCount++;
    }

    // Update draw range
    this.lines.geometry.setDrawRange(0, this.edgeCount * 2);
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  // ── Visibility ────────────────────────────────────────────────

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.lines.visible = visible;
  }

  get totalEdges(): number {
    return this.edgeCount;
  }

  // ── Cleanup ───────────────────────────────────────────────────

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
