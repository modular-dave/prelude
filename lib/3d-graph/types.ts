import type * as THREE from "three";

export interface CameraPose {
  pos: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
}

export type CameraState =
  | { mode: "ORBIT" }
  | { mode: "FLY_TO"; from: CameraPose; to: CameraPose; start: number; dur: number; then: "ORBIT" | "SETTLED" }
  | { mode: "SETTLED" }
  | { mode: "USER_CONTROL" };

export type LODLevel = "far" | "mid" | "close";

export type NavZone = "OUTSIDE" | "INSIDE";
