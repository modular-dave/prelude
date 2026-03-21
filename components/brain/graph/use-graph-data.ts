import { useMemo, useRef, useCallback, useEffect, useState } from "react";
import { TYPE_COLORS } from "@/lib/types";
import type { ViewMode, FilterBag } from "@/lib/types";
import { ENTITY_COLORS, DEFAULT_ENTITY_COLOR, VIZ_CONFIGS, INV_PHI } from "@/lib/3d-graph/constants";

interface UseGraphDataParams {
  memories: any[];
  knowledgeGraph: { nodes: any[]; edges: any[] };
  fetchMemoryLinks: (id: number) => Promise<any[]>;
  filterBagRef: React.RefObject<FilterBag>;
  vizMode: "hero" | "cluster" | "zero";
  selectedNodeId: number | null | undefined;
  selectedGraphId: string | null;
  viewMode: ViewMode;
}

export function useGraphData({
  memories, knowledgeGraph, fetchMemoryLinks, filterBagRef, vizMode,
  selectedNodeId, selectedGraphId, viewMode,
}: UseGraphDataParams) {
  // Fingerprint-based dedup for graph data
  const prevFingerprintRef = useRef("");
  const prevDataRef = useRef<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });

  const data = useMemo(() => {
    const memoryNodes = memories.map((m) => ({
      id: `m_${m.id}`,
      name: m.summary?.slice(0, 40) || "memory",
      val: Math.max(4, (m.importance || 0.5) * 20),
      color: TYPE_COLORS[m.memory_type as keyof typeof TYPE_COLORS] || "#666",
      type: m.memory_type,
      importance: m.importance,
      isEntity: false,
      numericId: m.id,
    }));

    const entityNodes = knowledgeGraph.nodes.map((e) => ({
      id: e.id,
      name: e.label?.slice(0, 40) || "entity",
      val: Math.max(3, (e.size || 1) * 8),
      color: ENTITY_COLORS[e.type] || DEFAULT_ENTITY_COLOR,
      type: e.type,
      importance: (e.size || 1) / 10,
      isEntity: true,
      numericId: null as number | null,
    }));

    const nodes = [...memoryNodes, ...entityNodes];
    const nodeIdSet = new Set(nodes.map((n) => n.id));

    const linkMap = new Map<string, { id: string; source: string; target: string; value: number; linkType: string }>();
    for (const e of knowledgeGraph.edges) {
      if (!nodeIdSet.has(e.source) || !nodeIdSet.has(e.target)) continue;
      const canon = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
      const existing = linkMap.get(canon);
      const value = e.weight || 1;
      if (!existing || value > existing.value) {
        linkMap.set(canon, { id: canon, source: e.source, target: e.target, value, linkType: e.type || "relates" });
      }
    }
    const links = Array.from(linkMap.values());

    // Conversation edges
    const convGroups = new Map<string, string[]>();
    for (const m of memories) {
      for (const tag of m.tags || []) {
        if (tag.startsWith("conv:")) {
          let group = convGroups.get(tag);
          if (!group) { group = []; convGroups.set(tag, group); }
          group.push(`m_${m.id}`);
        }
      }
    }
    const canonEdgeSet = new Set(linkMap.keys());
    for (const members of convGroups.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const canon = members[i] < members[j] ? `${members[i]}|${members[j]}` : `${members[j]}|${members[i]}`;
          if (!canonEdgeSet.has(canon)) {
            links.push({ id: canon, source: members[i], target: members[j], value: 0.5, linkType: "conversation" });
            canonEdgeSet.add(canon);
          }
        }
      }
    }

    const result = { nodes, links };
    const nodeIds = nodes.map((n) => n.id).sort().join(",");
    const linkIds = links.map((l) => l.id).sort().join(",");
    const fp = `${nodeIds}|${linkIds}`;
    if (fp === prevFingerprintRef.current) {
      return prevDataRef.current;
    }
    prevFingerprintRef.current = fp;
    prevDataRef.current = result;
    return result;
  }, [knowledgeGraph, memories]);

  const nodeNumericIdMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const node of data.nodes) {
      map.set(node.id, node.isEntity ? null : node.numericId);
    }
    return map;
  }, [data.nodes]);

  const linkVisibility = useCallback((link: any) => {
    const ltf = filterBagRef.current?.linkTypeFilter;
    if (ltf && !ltf.includes(link.linkType)) return false;
    const ids = filterBagRef.current?.visibleMemoryIds ?? null;
    if (!ids) return true;
    const srcId = typeof link.source === "object" ? link.source.id : link.source;
    const tgtId = typeof link.target === "object" ? link.target.id : link.target;
    const srcNum = nodeNumericIdMap.get(srcId);
    const tgtNum = nodeNumericIdMap.get(tgtId);
    if (srcNum === undefined || tgtNum === undefined) return false;
    const srcVisible = srcNum === null || ids.has(srcNum);
    const tgtVisible = tgtNum === null || ids.has(tgtNum);
    return srcVisible && tgtVisible;
  }, [nodeNumericIdMap, filterBagRef]);

  const maxLinkValue = useMemo(() => {
    let max = 1;
    for (const link of data.links) {
      if (link.value > max) max = link.value;
    }
    return max;
  }, [data.links]);

  // Async connection data
  const [asyncConnectionMap, setAsyncConnectionMap] = useState<Map<string, number> | null>(null);
  const [asyncLinkTypes, setAsyncLinkTypes] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    if (!selectedNodeId || !selectedGraphId) {
      setAsyncConnectionMap(null);
      setAsyncLinkTypes(null);
      return;
    }

    let cancelled = false;

    if (viewMode === "hebbian") {
      fetchMemoryLinks(selectedNodeId).then((links) => {
        if (cancelled) return;
        const map = new Map<string, number>();
        const typeMap = new Map<string, string>();
        let maxStrength = 0;
        for (const link of links) {
          const otherId = link.source_id === selectedNodeId ? link.target_id : link.source_id;
          const key = `m_${otherId}`;
          const s = link.strength || 0;
          if (s > maxStrength) maxStrength = s;
          map.set(key, s);
          typeMap.set(key, link.link_type);
        }
        if (maxStrength > 0) {
          for (const [id, val] of map) {
            map.set(id, val / maxStrength);
          }
        }
        setAsyncConnectionMap(map);
        setAsyncLinkTypes(typeMap);
      });
    } else {
      const selected = memories.find((m) => m.id === selectedNodeId);
      if (!selected) {
        setAsyncConnectionMap(new Map());
        setAsyncLinkTypes(null);
        return;
      }
      const query = encodeURIComponent(selected.summary || selected.content?.slice(0, 100) || "");
      fetch(`/api/memories?q=${query}&limit=15`)
        .then((res) => res.json())
        .then((results: any[]) => {
          if (cancelled) return;
          const map = new Map<string, number>();
          let maxScore = 0;
          for (const r of results) {
            if (r.id === selectedNodeId) continue;
            const score = r._score ?? 0;
            if (score > maxScore) maxScore = score;
            map.set(`m_${r.id}`, score);
          }
          if (maxScore > 0) {
            for (const [id, val] of map) {
              map.set(id, val / maxScore);
            }
          }
          setAsyncConnectionMap(map);
          setAsyncLinkTypes(null);
        })
        .catch(() => {
          if (!cancelled) setAsyncConnectionMap(new Map());
        });
    }

    return () => { cancelled = true; };
  }, [selectedNodeId, selectedGraphId, viewMode, fetchMemoryLinks, memories]);

  const connectionMap = asyncConnectionMap;

  // Bounding sphere radius
  const bubbleRadius = useMemo(() => {
    const N = data.nodes.length;
    if (N === 0) return 200;
    const chargeScale = VIZ_CONFIGS[vizMode].chargeFactor;
    return Math.max(200, (200 + 200 * Math.log2(Math.max(1, N))) * chargeScale);
  }, [data.nodes.length, vizMode]);

  // Fruchterman-Reingold optimal edge length
  const optimalK = useMemo(() => {
    const N = data.nodes.length;
    if (N <= 1) return 50;
    const R = bubbleRadius;
    const volume = (4 / 3) * Math.PI * R * R * R;
    const k = 0.8 * Math.cbrt(volume / N);
    return Math.max(12, Math.min(k, R * INV_PHI));
  }, [data.nodes.length, bubbleRadius]);

  // Degree centrality
  const degreeCentrality = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of data.links) {
      const src = typeof link.source === "object" ? (link.source as any).id : link.source;
      const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
      counts.set(src, (counts.get(src) || 0) + 1);
      counts.set(tgt, (counts.get(tgt) || 0) + 1);
    }
    let maxDeg = 1;
    for (const v of counts.values()) { if (v > maxDeg) maxDeg = v; }
    const normalized = new Map<string, number>();
    for (const [id, deg] of counts) { normalized.set(id, deg / maxDeg); }
    return normalized;
  }, [data.links]);

  // Retrieval centrality
  const retrievalCentrality = useMemo(() => {
    const scores = new Map<string, number>();
    let maxScore = 0;
    for (const node of data.nodes) {
      const mem = node.isEntity ? null : memories.find((m) => m.id === node.numericId);
      const score = node.isEntity
        ? (node.importance ?? 0)
        : ((mem?.access_count ?? 0) || (mem?.importance ?? 0));
      scores.set(node.id, score);
      if (score > maxScore) maxScore = score;
    }
    if (maxScore > 0) {
      for (const [id, s] of scores) scores.set(id, s / maxScore);
    }
    return scores;
  }, [data.nodes, memories]);

  // Anchor node
  const anchorNodeId = useMemo(() => {
    const centerMode = filterBagRef.current!.centerMode;
    if (centerMode === "retrieved") {
      let bestId = "";
      let bestCount = -1;
      for (const node of data.nodes) {
        const mem = node.isEntity ? null : memories.find((m) => m.id === node.numericId);
        const ac = node.isEntity ? ((node.importance ?? 0) * 10) : (mem?.access_count ?? 0);
        if (ac > bestCount) { bestCount = ac; bestId = node.id; }
      }
      if (bestCount === 0) {
        let bestImp = -1;
        for (const node of data.nodes) {
          const imp = node.importance ?? 0;
          if (imp > bestImp) { bestImp = imp; bestId = node.id; }
        }
      }
      return bestId;
    }
    let bestId = "";
    let bestDeg = 0;
    for (const [id, deg] of degreeCentrality) {
      if (deg > bestDeg) { bestDeg = deg; bestId = id; }
    }
    return bestId;
  }, [filterBagRef.current!.centerMode, data.nodes, degreeCentrality, memories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Value-mirror refs
  const dataRef = useRef(data);
  dataRef.current = data;
  const centralityRef = useRef(degreeCentrality);
  centralityRef.current = degreeCentrality;
  const retrievalCentralityRef = useRef(retrievalCentrality);
  retrievalCentralityRef.current = retrievalCentrality;
  const anchorRef = useRef(anchorNodeId);
  anchorRef.current = anchorNodeId;
  const optimalKRef = useRef(optimalK);
  optimalKRef.current = optimalK;
  const bubbleRadiusRef = useRef(bubbleRadius);
  bubbleRadiusRef.current = bubbleRadius;

  return {
    data, dataRef,
    degreeCentrality, retrievalCentrality,
    anchorNodeId, anchorRef,
    centralityRef, retrievalCentralityRef,
    nodeNumericIdMap, maxLinkValue,
    optimalK, optimalKRef,
    bubbleRadius, bubbleRadiusRef,
    linkVisibility, connectionMap, asyncLinkTypes,
  };
}
