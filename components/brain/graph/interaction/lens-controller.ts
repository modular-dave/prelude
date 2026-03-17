// ── Lens Controller ─────────────────────────────────────────────────
// Per-lens behaviors. Lens modes only change residency weights and
// camera behavior — they never redefine world coordinates.

import type { ViewStateManager } from "@/lib/3d-graph/runtime/view-state";
import type { TileCache } from "@/lib/3d-graph/runtime/tile-cache";
import type { Lens } from "@/lib/3d-graph/runtime/types";
import type { CameraController } from "./camera-controller";

export class LensController {
  private currentLens: Lens;
  private viewState: ViewStateManager;
  private tileCache: TileCache;
  private cameraController: CameraController;

  constructor(
    viewState: ViewStateManager,
    tileCache: TileCache,
    cameraController: CameraController,
    initialLens: Lens = "hero",
  ) {
    this.viewState = viewState;
    this.tileCache = tileCache;
    this.cameraController = cameraController;
    this.currentLens = initialLens;
  }

  /** Transition to a new lens. Freezes eviction during the transition. */
  switchLens(newLens: Lens): void {
    if (newLens === this.currentLens) return;

    const prevLens = this.currentLens;
    this.currentLens = newLens;

    // 1. Freeze eviction to prevent holes during transition
    this.tileCache.freezeEviction(1500);

    // 2. Update ViewState lens (this changes residency weights)
    this.viewState.setLens(newLens);

    // 3. Apply lens-specific camera behavior
    this.applyLensBehavior(newLens);
  }

  private applyLensBehavior(lens: Lens): void {
    switch (lens) {
      case "hero":
        // Hero: slower orbit, focus on anchor, cinematic
        this.cameraController.setAutoRotate(true);
        break;

      case "cluster":
        // Cluster: balanced view, stop rotation on selection
        this.cameraController.setAutoRotate(true);
        break;

      case "zeroG":
        // Zero-G: free-flight, more aggressive spatial loading
        this.cameraController.setAutoRotate(false);
        break;
    }
  }

  get lens(): Lens {
    return this.currentLens;
  }
}
