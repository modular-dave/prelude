import { useCallback } from "react";
import { LINK_TYPE_COLORS } from "@/lib/types";
import type { FilterBag } from "@/lib/types";
import { VIZ_CONFIGS } from "@/lib/3d-graph/constants";
import { hexAlpha, adaptiveEdgeWidth, adaptiveEdgeOpacity } from "@/lib/3d-graph/utils";

interface UseEdgeRendererParams {
  selectedGraphId: string | null;
  selectedEdge: { sourceId: string; targetId: string } | null;
  connectionMap: Map<string, number> | null;
  maxLinkValue: number;
  filterBagRef: React.RefObject<FilterBag>;
  zoomLevelRef: React.RefObject<number>;
  vizModeRef: React.RefObject<"hero" | "cluster" | "zero">;
  retrievalCentralityRef: React.RefObject<Map<string, number>>;
  highlightedPathRef: React.RefObject<Set<string> | null>;
}

export function useEdgeRenderer({
  selectedGraphId, selectedEdge, connectionMap, maxLinkValue,
  filterBagRef, zoomLevelRef, vizModeRef, retrievalCentralityRef, highlightedPathRef,
}: UseEdgeRendererParams) {
  const getLinkColor = useCallback(
    (link: any) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      const linkType = link.linkType || "relates";
      const linkTypeColor = LINK_TYPE_COLORS[linkType] || "#6b7280";

      if (selectedEdge) {
        const isSelected = (src === selectedEdge.sourceId && tgt === selectedEdge.targetId) ||
                           (src === selectedEdge.targetId && tgt === selectedEdge.sourceId);
        const hp = highlightedPathRef.current;
        const isPathEdge = hp ? (hp.has(src) && hp.has(tgt)) : false;
        return (isSelected || isPathEdge) ? hexAlpha(linkTypeColor, 1.0) : "rgba(200,200,200,0.08)";
      }

      if (selectedGraphId && connectionMap) {
        if (src === selectedGraphId || tgt === selectedGraphId) {
          const otherId = src === selectedGraphId ? tgt : src;
          const connStrength = connectionMap.get(otherId) ?? 0;
          return hexAlpha(linkTypeColor, 0.3 + connStrength * 0.7);
        }
        return "rgba(200,200,200,0.15)";
      }

      const zl = zoomLevelRef.current;
      const cfg = VIZ_CONFIGS[vizModeRef.current];
      const ef = filterBagRef.current!.edgeFocus;
      const normalizedStrength = (link.value || 1) / maxLinkValue;
      const opacityBoost = ef ? 2.5 : 1.0;
      const cm = filterBagRef.current!.centerMode;
      const retCent = retrievalCentralityRef.current;
      if (cm === "retrieved") {
        const srcScore = retCent.get(src) ?? 0;
        const tgtScore = retCent.get(tgt) ?? 0;
        const avg = (srcScore + tgtScore) / 2;
        const blended = Math.max(avg, normalizedStrength * 0.5);
        return hexAlpha(linkTypeColor, Math.min(1, adaptiveEdgeOpacity(blended, zl, cfg) * opacityBoost));
      }
      if (cm === "combined") {
        const srcScore = retCent.get(src) ?? 0;
        const tgtScore = retCent.get(tgt) ?? 0;
        const retAvg = (srcScore + tgtScore) / 2;
        const combined = Math.max(normalizedStrength, retAvg);
        return hexAlpha(linkTypeColor, Math.min(1, adaptiveEdgeOpacity(combined, zl, cfg) * opacityBoost));
      }

      return hexAlpha(linkTypeColor, Math.min(1, adaptiveEdgeOpacity(normalizedStrength, zl, cfg) * opacityBoost));
    },
    [selectedGraphId, selectedEdge, connectionMap, maxLinkValue] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const getLinkWidth = useCallback(
    (link: any) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      if (selectedEdge) {
        const isSelected = (src === selectedEdge.sourceId && tgt === selectedEdge.targetId) ||
                           (src === selectedEdge.targetId && tgt === selectedEdge.sourceId);
        const hp = highlightedPathRef.current;
        const isPathEdge = hp ? (hp.has(src) && hp.has(tgt)) : false;
        return isSelected ? 3 : isPathEdge ? 1.5 : 0.05;
      }

      if (selectedGraphId && connectionMap) {
        if (src === selectedGraphId || tgt === selectedGraphId) {
          const otherId = src === selectedGraphId ? tgt : src;
          const connStrength = connectionMap.get(otherId) ?? 0;
          return 0.8 + connStrength * 4;
        }
        return 0.05;
      }

      const zl = zoomLevelRef.current;
      const cfg = VIZ_CONFIGS[vizModeRef.current];
      const ef = filterBagRef.current!.edgeFocus;
      const widthBoost = ef ? 3.0 : 1.0;
      const normalizedStrength = (link.value || 1) / maxLinkValue;
      const cm = filterBagRef.current!.centerMode;
      const retCent = retrievalCentralityRef.current;
      if (cm === "retrieved") {
        const srcScore = retCent.get(src) ?? 0;
        const tgtScore = retCent.get(tgt) ?? 0;
        const avg = (srcScore + tgtScore) / 2;
        const blended = Math.max(avg, normalizedStrength * 0.5);
        return adaptiveEdgeWidth(blended, zl, cfg) * widthBoost;
      }
      if (cm === "combined") {
        const srcScore = retCent.get(src) ?? 0;
        const tgtScore = retCent.get(tgt) ?? 0;
        const retAvg = (srcScore + tgtScore) / 2;
        const combined = Math.max(normalizedStrength, retAvg);
        return adaptiveEdgeWidth(combined, zl, cfg) * widthBoost;
      }

      return adaptiveEdgeWidth(normalizedStrength, zl, cfg) * widthBoost;
    },
    [selectedGraphId, selectedEdge, connectionMap, maxLinkValue] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const getLinkParticles = useCallback(
    (link: any) => {
      if (!selectedGraphId || !connectionMap) return 0;
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (src === selectedGraphId || tgt === selectedGraphId) {
        const otherId = src === selectedGraphId ? tgt : src;
        const strength = connectionMap.get(otherId) ?? 0;
        return Math.round(strength * 3);
      }
      return 0;
    },
    [selectedGraphId, connectionMap]
  );

  const getLinkParticleColor = useCallback(
    (link: any) => {
      const linkType = link.linkType || "relates";
      return LINK_TYPE_COLORS[linkType] || "#888";
    },
    []
  );

  return { getLinkColor, getLinkWidth, getLinkParticles, getLinkParticleColor };
}
