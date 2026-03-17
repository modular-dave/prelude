import { useCallback, useRef, useEffect } from "react";
import type { FilterBag } from "@/lib/types";
import { PHI2, VIZ_CONFIGS } from "@/lib/3d-graph/constants";

interface UseForceSimulationParams {
  graphRef: React.RefObject<any>;
  filterBagRef: React.RefObject<FilterBag>;
  optimalKRef: React.RefObject<number>;
  vizModeRef: React.RefObject<"hero" | "cluster" | "zero">;
  bubbleRadiusRef: React.RefObject<number>;
  centralityRef: React.RefObject<Map<string, number>>;
  retrievalCentralityRef: React.RefObject<Map<string, number>>;
  anchorRef: React.RefObject<string>;
  vizMode: "hero" | "cluster" | "zero";
}

export function useForceSimulation({
  graphRef, filterBagRef, optimalKRef, vizModeRef, bubbleRadiusRef,
  centralityRef, retrievalCentralityRef, anchorRef, vizMode,
}: UseForceSimulationParams) {
  const forcesRegistered = useRef(false);

  const setupForces = useCallback((fg: any) => {
    if (forcesRegistered.current) return;
    forcesRegistered.current = true;

    // φ-scaled gravity
    let gravityNodes: any[] = [];
    const gravity = Object.assign(
      (alpha: number) => {
        const profile = VIZ_CONFIGS[vizModeRef.current];
        const centrality = filterBagRef.current!.centerMode === "retrieved"
          ? retrievalCentralityRef.current
          : centralityRef.current;
        const anchor = anchorRef.current;
        const k = optimalKRef.current;

        for (const node of gravityNodes) {
          if (vizModeRef.current === "hero" && node.id === anchor) {
            node.x = 0; node.y = 0; node.z = 0;
            node.vx = 0; node.vy = 0; node.vz = 0;
            continue;
          }
          const c = centrality.get(node.id) ?? 0;
          const g = alpha * (profile.gravityBase * (30 / k) + profile.heroBoost * c);
          node.vx = (node.vx || 0) - (node.x || 0) * g;
          node.vy = (node.vy || 0) - (node.y || 0) * g;
          node.vz = (node.vz || 0) - (node.z || 0) * g;
        }
      },
      { initialize: (nodes: any[]) => { gravityNodes = nodes; } }
    );
    fg.d3Force("gravity", gravity);

    // Boundary force
    let boundaryNodes: any[] = [];
    const boundary = Object.assign(
      () => {
        const R = bubbleRadiusRef.current;
        const softStart = R * 0.8;
        const hardR = R * PHI2;
        for (const node of boundaryNodes) {
          const x = node.x || 0, y = node.y || 0, z = node.z || 0;
          const dist = Math.sqrt(x * x + y * y + z * z);
          if (dist > softStart) {
            const t = Math.min(1, (dist - softStart) / (hardR - softStart));
            const push = t * t * 0.15;
            const dampen = 1 - push * 0.3;
            node.vx = (node.vx || 0) * dampen;
            node.vy = (node.vy || 0) * dampen;
            node.vz = (node.vz || 0) * dampen;
            if (dist > hardR) {
              const scale = hardR / dist;
              node.x = x * scale; node.y = y * scale; node.z = z * scale;
              node.vx *= 0.2; node.vy *= 0.2; node.vz *= 0.2;
            } else {
              const scale = 1 - push * (1 - softStart / dist);
              node.x = x * scale; node.y = y * scale; node.z = z * scale;
            }
          }
        }
      },
      { initialize: (nodes: any[]) => { boundaryNodes = nodes; } }
    );
    fg.d3Force("boundary", boundary);

    if (typeof fg.clickAfterDrag === "function") fg.clickAfterDrag(true);

    // Charge
    const charge = fg.d3Force("charge");
    if (charge) {
      const k = optimalKRef.current;
      const p = VIZ_CONFIGS[vizModeRef.current];
      charge.strength(-p.chargeFactor * k * k / 100);
      charge.distanceMax(p.distMaxFactor * k);
    }

    // Link distance
    const link = fg.d3Force("link");
    if (link) {
      const k = optimalKRef.current;
      const p = VIZ_CONFIGS[vizModeRef.current];
      link.distance(p.linkDistFactor * k);
      link.strength(p.linkStrength);
    }
  }, []);

  // Update forces when vizMode changes
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const k = optimalKRef.current;
    const p = VIZ_CONFIGS[vizMode];

    const charge = fg.d3Force("charge");
    if (charge) {
      charge.strength(-p.chargeFactor * k * k / 100);
      charge.distanceMax(p.distMaxFactor * k);
    }
    const link = fg.d3Force("link");
    if (link) {
      link.distance(p.linkDistFactor * k);
      link.strength(p.linkStrength);
    }
    fg.d3ReheatSimulation();
  }, [vizMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return { setupForces, forcesRegistered };
}
