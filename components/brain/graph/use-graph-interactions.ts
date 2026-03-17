import { useCallback, useRef, useMemo, useEffect, useState } from "react";
import { TYPE_COLORS, LINK_TYPE_COLORS, LINK_TYPE_LABELS } from "@/lib/types";
import type { ViewMode, FilterBag } from "@/lib/types";
import { ENTITY_COLORS, DEFAULT_ENTITY_COLOR } from "@/lib/3d-graph/constants";
import type { SelectedEdgeInfo } from "../neural-graph";

interface UseGraphInteractionsParams {
  data: { nodes: any[]; links: any[] };
  memories: any[];
  nodeNumericIdMap: Map<string, number | null>;
  connectionMap: Map<string, number> | null;
  asyncLinkTypes: Map<string, string> | null;
  selectedGraphId: string | null;
  filterBagRef: React.RefObject<FilterBag>;
  viewMode: ViewMode;
  onNodeSelect?: (memoryId: number) => void;
  onEdgeSelect?: (edge: SelectedEdgeInfo) => void;
  onBackgroundSelect?: () => void;
  onPinnedContentChange?: (content: any | null) => void;
}

export function useGraphInteractions({
  data, memories, nodeNumericIdMap, connectionMap, asyncLinkTypes,
  selectedGraphId, filterBagRef, viewMode,
  onNodeSelect, onEdgeSelect, onBackgroundSelect, onPinnedContentChange,
}: UseGraphInteractionsParams) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [pinnedLinkKey, setPinnedLinkKey] = useState<string | null>(null);

  const hoveredNodeIdRef = useRef(hoveredNodeId);
  hoveredNodeIdRef.current = hoveredNodeId;
  const hoveredLinkRef = useRef<boolean>(false);

  const handleNodeClick = useCallback(
    (node: any) => {
      setPinnedLinkKey(null);
      setPinnedNodeId(null);
      if (node.numericId != null) onNodeSelect?.(node.numericId);
    },
    [onNodeSelect]
  );

  const handleNodeHover = useCallback(
    (node: any) => {
      setHoveredNodeId(node ? node.id : null);
      const el = document.querySelector("canvas");
      if (el) el.style.cursor = node ? "grab" : "default";
    },
    []
  );

  const handleLinkHover = useCallback(
    (link: any) => {
      hoveredLinkRef.current = !!link;
      const el = document.querySelector("canvas");
      if (el) el.style.cursor = link ? "pointer" : (hoveredNodeIdRef.current ? "grab" : "default");
    },
    []
  );

  const handleLinkClick = useCallback(
    (link: any) => {
      setPinnedNodeId(null);
      setPinnedLinkKey(null);
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      const srcNumeric = nodeNumericIdMap.get(srcId);
      const tgtNumeric = nodeNumericIdMap.get(tgtId);
      if (srcNumeric != null && tgtNumeric != null) {
        onEdgeSelect?.({
          sourceId: srcId,
          targetId: tgtId,
          sourceNumericId: srcNumeric,
          targetNumericId: tgtNumeric,
          linkType: link.linkType || "relates",
          strength: typeof link.value === "number" ? link.value : 0,
        });
      }
    },
    [nodeNumericIdMap, onEdgeSelect]
  );

  const onBackgroundSelectRef = useRef(onBackgroundSelect);
  onBackgroundSelectRef.current = onBackgroundSelect;
  const stableBackgroundClick = useCallback(() => {
    setPinnedNodeId(null);
    setPinnedLinkKey(null);
    onBackgroundSelectRef.current?.();
  }, []);

  // Node label ref-delegate
  const nodeLabelFnRef = useRef<(node: any) => string>(() => "");
  nodeLabelFnRef.current = (node: any) => {
    if (node.id === pinnedNodeId) return "";
    const cardStyle = "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;background:rgba(255,255,255,0.95);padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);max-width:240px;backdrop-filter:blur(12px);box-shadow:none";
    const dimStyle = "color:rgba(0,0,0,0.35);font-size:8px";
    const valStyle = "color:rgba(0,0,0,0.6);font-size:8px;font-variant-numeric:tabular-nums";
    if (node.isEntity) {
      const titleStyle = "color:rgba(0,0,0,0.25);font-size:7px;text-transform:uppercase;letter-spacing:0.01em;margin-bottom:5px";
      return `<div style="${cardStyle}"><div style="${titleStyle}">Entity</div><div style="color:${ENTITY_COLORS[node.type] || DEFAULT_ENTITY_COLOR};font-size:8px;text-transform:uppercase;letter-spacing:0.01em;font-weight:500">entity · ${node.type}</div><div style="color:rgba(0,0,0,0.75);font-size:10px;margin-top:3px;line-height:1.4">${node.name}</div></div>`;
    }
    const mem = memories.find((m) => m.id === node.numericId);
    if (!mem) return node.name;
    const rawLinks = data.links.filter((l: any) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return s === node.id || t === node.id;
    }).length;
    const strength = connectionMap?.get(node.id);
    const linkType = asyncLinkTypes?.get(node.id);
    const strengthRow = selectedGraphId && node.id !== selectedGraphId && strength !== undefined
      ? `<div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">${viewMode === "retrieved" ? "relevance" : "hebbian"}</span><span style="${valStyle}">${Math.round(strength * 100)}%${linkType ? ` · ${linkType}` : ""}</span></div>`
      : "";
    const titleStyle = "color:rgba(0,0,0,0.25);font-size:7px;text-transform:uppercase;letter-spacing:0.01em;margin-bottom:5px";
    return `<div style="${cardStyle}"><div style="${titleStyle}">Memory</div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:5px;height:5px;border-radius:50%;background:${TYPE_COLORS[mem.memory_type]};flex-shrink:0"></div><span style="color:rgba(0,0,0,0.4);font-size:8px;text-transform:uppercase;letter-spacing:0.01em">${mem.memory_type.replace("_", " ")}</span></div><div style="color:rgba(0,0,0,0.8);font-size:10px;line-height:1.4;margin-bottom:6px">${mem.summary}</div><div style="display:flex;flex-direction:column;gap:2px;border-top:1px solid rgba(0,0,0,0.06);padding-top:5px"><div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">recalls</span><span style="${valStyle}">${mem.access_count ?? 0}</span></div><div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">links</span><span style="${valStyle}">${rawLinks}</span></div><div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">importance</span><span style="${valStyle}">${Math.round(mem.importance * 100)}%</span></div>${strengthRow}</div></div>`;
  };
  const stableNodeLabel = useCallback((node: any) => nodeLabelFnRef.current(node), []);

  // Link label ref-delegate
  const linkLabelFnRef = useRef<(link: any) => string>(() => "");
  linkLabelFnRef.current = (link: any) => {
    const linkType = link.linkType || "relates";
    const color = LINK_TYPE_COLORS[linkType] || "#6b7280";
    const label = LINK_TYPE_LABELS[linkType] || linkType;
    const weight = typeof link.value === "number" ? Math.round(link.value * 100) : "—";
    const src = typeof link.source === "object" ? link.source : data.nodes.find((n: any) => n.id === link.source);
    const tgt = typeof link.target === "object" ? link.target : data.nodes.find((n: any) => n.id === link.target);
    const srcName = src?.name || src?.id || "?";
    const tgtName = tgt?.name || tgt?.id || "?";
    const cardStyle = "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;background:rgba(255,255,255,0.95);padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);max-width:240px;backdrop-filter:blur(12px);box-shadow:none";
    const dimStyle = "color:rgba(0,0,0,0.35);font-size:8px";
    const valStyle = "color:rgba(0,0,0,0.6);font-size:8px;font-variant-numeric:tabular-nums";
    const titleStyle = "color:rgba(0,0,0,0.25);font-size:7px;text-transform:uppercase;letter-spacing:0.01em;margin-bottom:5px";
    return `<div style="${cardStyle}"><div style="${titleStyle}">Edge</div><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:3px;border-radius:1px;background:${color};flex-shrink:0"></div><span style="color:${color};font-size:8px;text-transform:uppercase;letter-spacing:0.01em;font-weight:500">${label}</span></div><div style="display:flex;flex-direction:column;gap:2px;border-top:1px solid rgba(0,0,0,0.06);padding-top:5px"><div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">from</span><span style="${valStyle};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${srcName}</span></div><div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">to</span><span style="${valStyle};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tgtName}</span></div><div style="display:flex;justify-content:space-between;gap:12px"><span style="${dimStyle}">weight</span><span style="${valStyle}">${weight}%</span></div></div></div>`;
  };
  const stableLinkLabel = useCallback((link: any) => linkLabelFnRef.current(link), []);

  // Pinned card content
  const pinnedCardContent = useMemo(() => {
    if (pinnedNodeId) {
      const node = data.nodes.find((n) => n.id === pinnedNodeId);
      if (!node) return null;
      if (node.isEntity) {
        return { type: "entity" as const, node };
      }
      const mem = memories.find((m) => m.id === node.numericId);
      if (!mem) return null;
      const linkCount = data.links.filter((l: any) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return s === node.id || t === node.id;
      }).length;
      return { type: "memory" as const, node, mem, linkCount };
    }
    if (pinnedLinkKey) {
      const [srcId, tgtId] = pinnedLinkKey.split("|");
      const link = data.links.find((l: any) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return (s === srcId && t === tgtId) || (s === tgtId && t === srcId);
      });
      if (!link) return null;
      const src = data.nodes.find((n) => n.id === srcId);
      const tgt = data.nodes.find((n) => n.id === tgtId);
      return { type: "edge" as const, link, src, tgt };
    }
    return null;
  }, [pinnedNodeId, pinnedLinkKey, data, memories]);

  useEffect(() => {
    onPinnedContentChange?.(pinnedCardContent);
  }, [pinnedCardContent, onPinnedContentChange]);

  return {
    handleNodeClick, handleNodeHover, handleLinkHover, handleLinkClick,
    stableBackgroundClick, stableNodeLabel, stableLinkLabel,
    hoveredNodeId, pinnedNodeId, pinnedCardContent,
    hoveredNodeIdRef, hoveredLinkRef,
    setPinnedNodeId, setPinnedLinkKey,
  };
}
