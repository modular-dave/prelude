// ── Raycaster ───────────────────────────────────────────────────────
// GPU picking for InstancedMesh. Returns entity ID via tile cache lookup.

import * as THREE from "three";
import type { NodeInstances } from "../renderer/node-instances";

export interface RaycastHit {
  entityId: string;
  distance: number;
  point: THREE.Vector3;
  instanceId: number;
  meshType: "memory" | "entity" | "cluster";
}

const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

export class PickingEngine {
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;
  }

  /** Raycast from screen coordinates against instanced meshes. */
  pick(clientX: number, clientY: number, nodeInstances: NodeInstances): RaycastHit | null {
    const rect = this.canvas.getBoundingClientRect();
    _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, this.camera);

    const meshes: Array<{ mesh: THREE.InstancedMesh; type: "memory" | "entity" | "cluster" }> = [
      { mesh: nodeInstances.memorySpheres, type: "memory" },
      { mesh: nodeInstances.entityOctahedra, type: "entity" },
      { mesh: nodeInstances.clusterSpheres, type: "cluster" },
    ];

    let closest: RaycastHit | null = null;

    for (const { mesh, type } of meshes) {
      if (mesh.count === 0) continue;

      const intersects = _raycaster.intersectObject(mesh);
      if (intersects.length === 0) continue;

      const hit = intersects[0];
      if (hit.instanceId === undefined) continue;

      const entityId = nodeInstances.entityIdAtInstance(mesh, hit.instanceId);
      if (!entityId) continue;

      if (!closest || hit.distance < closest.distance) {
        closest = {
          entityId,
          distance: hit.distance,
          point: hit.point.clone(),
          instanceId: hit.instanceId,
          meshType: type,
        };
      }
    }

    return closest;
  }

  /** Raycast from NDC coordinates (already normalized). */
  pickFromNDC(ndcX: number, ndcY: number, nodeInstances: NodeInstances): RaycastHit | null {
    _mouse.set(ndcX, ndcY);
    _raycaster.setFromCamera(_mouse, this.camera);

    const meshes: Array<{ mesh: THREE.InstancedMesh; type: "memory" | "entity" | "cluster" }> = [
      { mesh: nodeInstances.memorySpheres, type: "memory" },
      { mesh: nodeInstances.entityOctahedra, type: "entity" },
      { mesh: nodeInstances.clusterSpheres, type: "cluster" },
    ];

    for (const { mesh, type } of meshes) {
      if (mesh.count === 0) continue;
      const intersects = _raycaster.intersectObject(mesh);
      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const entityId = nodeInstances.entityIdAtInstance(mesh, intersects[0].instanceId);
        if (entityId) {
          return {
            entityId,
            distance: intersects[0].distance,
            point: intersects[0].point.clone(),
            instanceId: intersects[0].instanceId,
            meshType: type,
          };
        }
      }
    }

    return null;
  }
}
