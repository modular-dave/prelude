"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { NeuralGraph, type NeuralGraphHandle, type SelectedEdgeInfo } from "@/components/brain/neural-graph";

import { MemoryNodeDetail } from "@/components/brain/memory-node-detail";
import { EdgePathDetail } from "@/components/brain/edge-path-detail";
import { useMemory } from "@/lib/memory-context";
import { useContainerSize } from "@/hooks/use-container-size";
import { TYPE_COLORS, TYPE_LABELS, LINK_TYPE_COLORS, LINK_TYPE_LABELS, type MemoryType, type FilterBag } from "@/lib/types";
import { ALL_MEMORY_TYPES } from "@/lib/retrieval-settings";
import { Target, Link2, Layers, ChevronDown, ChevronRight, Moon, Check, Play, Pause, Plus, Minus, Info, Send, MessageSquare, Clock, Trash2 } from "lucide-react";
import {
  loadConversations,
  saveConversation,
  updateConversation,
  deleteConversation,
  clearAllConversations,
  generateTitle,
} from "@/lib/chat-store";
import { getActiveModel } from "@/lib/model-settings";
import { loadSystemPrompt } from "@/lib/system-prompt";
import type { Conversation, ChatMessage } from "@/lib/chat-store";

type MemoryFilter = "all" | "inputs" | "outputs";
type CenterMode = "combined" | "reinforced" | "retrieved";


const DREAM_SOURCE_LABELS: Record<string, string> = {
  consolidation: "Consolidation",
  reflection: "Reflection",
  emergence: "Emergence",
  active_reflection: "Introspection",
};

const DREAM_SOURCE_COLORS: Record<string, string> = {
  consolidation: "#3b82f6",
  reflection: "#22c55e",
  emergence: "#f43f5e",
  active_reflection: "#f59e0b",
};

const DREAM_SOURCES = ["consolidation", "reflection", "emergence", "active_reflection"];

interface DreamSession {
  index: number; // 1-based dream #
  memoryIds: Set<number>;
  timestamp: string;
  phases: string[];
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface BrainViewProps {
  initialEdge?: SelectedEdgeInfo | null;
}

export function BrainView({ initialEdge = null }: BrainViewProps = {}) {
  const { memories, retrievalSettings, updateRetrievalSettings, refresh } = useMemory();
  const [selectedMemoryId, setSelectedMemoryId] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(initialEdge);
  const [highlightedPath, setHighlightedPath] = useState<Set<string> | null>(null);
  const [highlightedLinks, setHighlightedLinks] = useState<Set<string> | null>(null);
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>("all");
  const [enabledTypes, setEnabledTypes] = useState<MemoryType[]>([...ALL_MEMORY_TYPES]);
  const [enabledLinkTypes, setEnabledLinkTypes] = useState<string[]>(Object.keys(LINK_TYPE_COLORS));
  const [enabledDreamSources, setEnabledDreamSources] = useState<string[]>([...DREAM_SOURCES]);
  const [selectedDream, setSelectedDream] = useState<number | null>(null); // null = all
  const [centerMode, setCenterMode] = useState<CenterMode>("combined");
  const [autoRotate, setAutoRotate] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dreamSessions, setDreamSessions] = useState<DreamSession[]>([]);
  const [timelineCutoff, setTimelineCutoff] = useState(Infinity); // Infinity = "now", no cutoff
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [statusCardCollapsed, setStatusCardCollapsed] = useState(false);
  const [vizMode, setVizMode] = useState<"hero" | "cluster">("hero");
  const [edgeFocus, setEdgeFocus] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [graphReady, setGraphReady] = useState(false);
  // Path controls state (lifted from EdgePathDetail for floating card)
  const [pathDepth, setPathDepth] = useState(0);
  const [pathDirection, setPathDirection] = useState<"both" | "upstream" | "downstream">("both");
  const [pathMinStrength, setPathMinStrength] = useState(0);
  const [traceData, setTraceData] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loadingTrace, setLoadingTrace] = useState(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const neuralGraphRef = useRef<NeuralGraphHandle>(null);
  const graphSize = useContainerSize(graphContainerRef);

  // ── Filter bag: all filter values in a stable ref, read by NeuralGraph tick loop ──
  const visibleMemoryIds = useMemo(() => {
    const hasMetaFilter = memoryFilter !== "all";
    const hasTypeFilter = enabledTypes.length < ALL_MEMORY_TYPES.length;
    const hasTimeFilter = timelineCutoff !== Infinity;
    if (!hasMetaFilter && !hasTypeFilter && !hasTimeFilter) return null;
    return new Set(
      memories
        .filter((m) => {
          if (hasTimeFilter && new Date(m.created_at).getTime() > timelineCutoff) return false;
          if (!enabledTypes.includes(m.memory_type)) return false;
          if (memoryFilter === "inputs" && !(m.tags || []).includes("user-message")) return false;
          if (memoryFilter === "outputs" && !(m.tags || []).includes("assistant-response")) return false;
          return true;
        })
        .map((m) => m.id)
    );
  }, [memories, memoryFilter, enabledTypes, timelineCutoff]);

  const filterBagRef = useRef<FilterBag>({
    memoryFilter, typeFilter: enabledTypes, centerMode, edgeFocus, linkTypeFilter: enabledLinkTypes,
    timelineCutoff, visibleMemoryIds,
  });
  filterBagRef.current = {
    memoryFilter, typeFilter: enabledTypes, centerMode, edgeFocus, linkTypeFilter: enabledLinkTypes,
    timelineCutoff, visibleMemoryIds,
  };

  // The memory ID to trace from — edge source or selected node
  const traceMemoryId = selectedEdge
    ? selectedEdge.sourceNumericId
    : selectedMemoryId;

  // Fetch trace data when selection changes
  useEffect(() => {
    if (!traceMemoryId) {
      setTraceData(null);
      setLoadingTrace(false);
      return;
    }
    let cancelled = false;
    setLoadingTrace(true);
    setPathDepth(selectedEdge ? 0 : 1);
    setPathDirection("both");
    setPathMinStrength(0);
    fetch(`/api/trace?memoryId=${traceMemoryId}&maxDepth=10`)
      .then(r => r.json())
      .then(data => { if (!cancelled) { setTraceData(data); setLoadingTrace(false); } })
      .catch(() => { if (!cancelled) { setTraceData(null); setLoadingTrace(false); } });
    return () => { cancelled = true; };
  }, [traceMemoryId]);

  // Compute actual max depth from trace nodes (not the request param)
  const traceMaxDepth = useMemo(() => {
    if (!traceData) return 1;
    let max = 0;
    for (const n of (traceData.ancestors || [])) if (n.depth > max) max = n.depth;
    for (const n of (traceData.descendants || [])) if (n.depth > max) max = n.depth;
    for (const n of (traceData.related || [])) if ((n.depth ?? 1) > max) max = n.depth ?? 1;
    return max || 1;
  }, [traceData]);

  // Build filtered trace nodes (respects direction + depth)
  const allTraceNodes = useMemo(() => {
    if (!traceData) return new Map<number, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const map = new Map<number, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (traceData.root) map.set(traceData.root.id, { ...traceData.root, depth: 0 });
    if (pathDirection !== "downstream") {
      for (const n of (traceData.ancestors || [])) {
        if (n.depth <= pathDepth) map.set(n.id, n);
      }
    }
    if (pathDirection !== "upstream") {
      for (const n of (traceData.descendants || [])) {
        if (n.depth <= pathDepth) map.set(n.id, n);
      }
    }
    for (const n of (traceData.related || [])) {
      if ((n.depth ?? 1) <= pathDepth) map.set(n.id, n);
    }
    return map;
  }, [traceData, pathDirection, pathDepth]);

  // Depth map for NeuralGraph — maps graph node IDs to BFS hop depth
  const traceNodeDepths = useMemo(() => {
    const map = new Map<string, number>();
    for (const [numId, node] of allTraceNodes) {
      map.set(`m_${numId}`, node.depth ?? 1);
    }
    return map;
  }, [allTraceNodes]);

  // All trace nodes within depth + strength filter (no BFS needed — trace API already computed the cluster)
  const reachableNodes = useMemo(() => {
    if (!traceData || !traceMemoryId) return [];
    // Start with all nodes from allTraceNodes (already filtered by depth + direction)
    const nodes = new Set<number>(allTraceNodes.keys());
    nodes.add(traceMemoryId);
    // If minStrength > 0, filter to only nodes that have at least one link passing the threshold
    if (pathMinStrength > 0 && traceData.links) {
      const connected = new Set<number>();
      connected.add(traceMemoryId);
      for (const l of traceData.links) {
        if (l.strength >= pathMinStrength && nodes.has(l.source_id) && nodes.has(l.target_id)) {
          connected.add(l.source_id);
          connected.add(l.target_id);
        }
      }
      return Array.from(connected);
    }
    return Array.from(nodes);
  }, [traceData, traceMemoryId, allTraceNodes, pathMinStrength]);

  const reachableCount = reachableNodes.length;

  // Debounced path highlight
  useEffect(() => {
    clearTimeout(highlightTimeoutRef.current);
    if (!traceMemoryId || (selectedEdge && pathDepth === 0)) {
      setHighlightedPath(null);
      setHighlightedLinks(null);
      return;
    }
    highlightTimeoutRef.current = setTimeout(() => {
      const ids = new Set<string>();
      if (traceMemoryId) ids.add(`m_${traceMemoryId}`);
      if (selectedEdge) ids.add(`m_${selectedEdge.targetNumericId}`);
      for (const id of reachableNodes) ids.add(`m_${id}`);
      setHighlightedPath(ids.size > 0 ? ids : null);

      // Build set of specific trace link IDs (canonical: sorted pair)
      // Only links between reachable nodes get highlighted
      const reachableSet = new Set(reachableNodes);
      const linkIds = new Set<string>();
      if (traceData?.links) {
        for (const l of traceData.links) {
          if (!reachableSet.has(l.source_id) || !reachableSet.has(l.target_id)) continue;
          if (l.strength < pathMinStrength) continue;
          const a = `m_${Math.min(l.source_id, l.target_id)}`;
          const b = `m_${Math.max(l.source_id, l.target_id)}`;
          linkIds.add(`${a}|${b}`);
        }
      }
      setHighlightedLinks(linkIds.size > 0 ? linkIds : null);
    }, 120);
    return () => { clearTimeout(highlightTimeoutRef.current); };
  }, [reachableNodes, traceMemoryId, selectedEdge, pathDepth, traceData, pathMinStrength]);

  const timeRange = useMemo(() => {
    if (!memories.length) return { min: Date.now(), max: Date.now() };
    const timestamps = memories.map(m => new Date(m.created_at).getTime());
    return { min: Math.min(...timestamps), max: Date.now() };
  }, [memories]);

  // Fetch dream logs to build memory→session mapping
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dream?limit=500");
        if (!res.ok) return;
        const { logs } = await res.json();
        if (!logs?.length) return;

        // Group into sessions (same logic as dream page)
        const asc = [...logs].reverse();
        const groups: typeof logs[] = [];
        let cur = [asc[0]];
        for (let i = 1; i < asc.length; i++) {
          const gap = new Date(asc[i].created_at).getTime() - new Date(asc[i - 1].created_at).getTime();
          const isNew = asc[i].session_type === "consolidation" && cur[cur.length - 1].session_type !== "consolidation";
          if (isNew || gap > 15 * 60 * 1000) {
            groups.push(cur);
            cur = [asc[i]];
          } else {
            cur.push(asc[i]);
          }
        }
        groups.push(cur);

        const sessions: DreamSession[] = groups.map((g, i) => ({
          index: i + 1,
          memoryIds: new Set(g.flatMap((l: any) => l.new_memories_created || [])),
          timestamp: g[g.length - 1].created_at,
          phases: g.map((l: any) => l.session_type),
        }));

        setDreamSessions(sessions);
      } catch { /* silent */ }
    })();
  }, []);

  // ── Cortex status ──
  const [cortexOnline, setCortexOnline] = useState<boolean | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [dreamToggling, setDreamToggling] = useState(false);
  const [reflectToggling, setReflectToggling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/models");
        const data = await res.json();
        setCortexOnline(!!data.running);
        if (data.active) setActiveModel(data.active);
      } catch {
        setCortexOnline(false);
      }
    })();
  }, []);

  const toggleDreamSchedule = useCallback(async () => {
    setDreamToggling(true);
    try {
      const method = retrievalSettings.dreamScheduleEnabled ? "DELETE" : "POST";
      await fetch("/api/dream/schedule", { method });
      updateRetrievalSettings({ dreamScheduleEnabled: !retrievalSettings.dreamScheduleEnabled });
    } finally {
      setDreamToggling(false);
    }
  }, [retrievalSettings.dreamScheduleEnabled, updateRetrievalSettings]);

  const toggleReflectSchedule = useCallback(async () => {
    setReflectToggling(true);
    try {
      const action = retrievalSettings.reflectionScheduleEnabled ? "stop" : "start";
      await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: action }),
      });
      updateRetrievalSettings({ reflectionScheduleEnabled: !retrievalSettings.reflectionScheduleEnabled });
    } finally {
      setReflectToggling(false);
    }
  }, [retrievalSettings.reflectionScheduleEnabled, updateRetrievalSettings]);

  // Build a set of memory IDs belonging to any dream session
  const allDreamMemoryIds = useMemo(() => {
    const ids = new Set<number>();
    dreamSessions.forEach((s) => s.memoryIds.forEach((id) => ids.add(id)));
    return ids;
  }, [dreamSessions]);

  // Memory IDs for the selected dream
  const selectedDreamMemoryIds = useMemo(() => {
    if (selectedDream === null) return null;
    return dreamSessions.find((s) => s.index === selectedDream)?.memoryIds ?? new Set<number>();
  }, [selectedDream, dreamSessions]);

  const selectedMemory = selectedMemoryId
    ? memories.find((m) => m.id === selectedMemoryId) ?? null
    : null;

  const handleNodeSelect = useCallback((memoryId: number) => {
    setSelectedEdge(null);
    setDetailsOpen(false);
    setSelectedMemoryId((prev) => (prev === memoryId ? null : memoryId));
  }, []);

  const handleEdgeSelect = useCallback((edge: SelectedEdgeInfo) => {
    setSelectedMemoryId(null);
    setHighlightedPath(null);
    setHighlightedLinks(null);
    setDetailsOpen(false);
    setSelectedEdge(edge);
    neuralGraphRef.current?.clearPinned();
  }, []);

  // Debug API for programmatic testing via preview_eval
  useEffect(() => {
    (window as any).__debugBrain = {
      selectNode: (numericId: number) => handleNodeSelect(numericId),
      selectEdge: (edge: SelectedEdgeInfo) => handleEdgeSelect(edge),
      deselect: () => { setSelectedMemoryId(null); setSelectedEdge(null); setHighlightedPath(null); setHighlightedLinks(null); },
      setDepth: (d: number) => setPathDepth(d),
      getState: () => ({ selectedMemoryId, selectedEdge, pathDepth, highlightedPathSize: highlightedPath?.size ?? 0, traceNodeCount: allTraceNodes.size }),
      getMemoryIds: () => memories.slice(0, 20).map(m => ({ id: m.id, type: m.memory_type, content: m.content?.slice(0, 60) })),
    };
    return () => { delete (window as any).__debugBrain; };
  });

  const toggleType = useCallback((type: MemoryType) => {
    setEnabledTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length <= 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }, []);

  const toggleLinkType = useCallback((type: string) => {
    setEnabledLinkTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length <= 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }, []);

  const toggleDreamSource = useCallback((source: string) => {
    setEnabledDreamSources((prev) => {
      if (prev.includes(source)) {
        if (prev.length <= 1) return prev;
        return prev.filter((s) => s !== source);
      }
      return [...prev, source];
    });
  }, []);

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  // Check if a memory passes the dream filter
  const passesDreamFilter = useCallback((m: { id: number; source?: string }) => {
    const src = m.source || "prelude";
    const isDreamMemory = allDreamMemoryIds.has(m.id);

    // If a specific dream is selected, only show memories from that dream
    if (selectedDreamMemoryIds !== null) {
      if (!selectedDreamMemoryIds.has(m.id)) return false;
    }

    // If it's a dream memory, check source filter
    if (isDreamMemory) {
      return enabledDreamSources.includes(src);
    }

    // Non-dream memories always pass (they're "prelude"/chat)
    return true;
  }, [allDreamMemoryIds, selectedDreamMemoryIds, enabledDreamSources]);

  // Auto-scroll chat messages
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages]);

  const refreshConversations = useCallback(async () => {
    const convs = await loadConversations();
    setConversations(convs);
    return convs;
  }, []);

  // Load conversations on mount
  useEffect(() => { refreshConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewBrainChat = useCallback(() => {
    setChatMessages([]);
    setChatConvId(null);
    setChatInput("");
    setHistoryOpen(false);
  }, []);

  const handleLoadConversation = useCallback((conv: Conversation) => {
    setChatMessages(conv.messages);
    setChatConvId(conv.id);
    setHistoryOpen(false);
    setChatOpen(true);
    setChatBtnsOpen(true);
    setFiltersOpen(false);
    setDetailsOpen(false);
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    const updated = await refreshConversations();
    refresh();
    if (chatConvId === id) {
      if (updated.length > 0) {
        setChatConvId(updated[0].id);
        setChatMessages(updated[0].messages);
      } else {
        setChatConvId(null);
        setChatMessages([]);
      }
    }
  }, [chatConvId, refreshConversations, refresh]);

  const handleClearAll = useCallback(async () => {
    fetch("/api/memories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).then(() => refresh());
    await clearAllConversations();
    setConversations([]);
    setChatConvId(null);
    setChatMessages([]);
    setHistoryOpen(false);
  }, [refresh]);

  const sendBrainChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatStreaming(true);

    // Persist conversation
    const now = new Date().toISOString();
    const title = generateTitle(newMessages);
    let convId = chatConvId;

    if (convId) {
      await updateConversation(convId, { title, messages: newMessages });
    } else {
      convId = crypto.randomUUID();
      const conv: Conversation = { id: convId, title, messages: newMessages, createdAt: now, updatedAt: now };
      await saveConversation(conv);
      setChatConvId(convId);
    }

    // Refresh graph — user memory node appears
    refresh();

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setChatMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          model: getActiveModel(),
          conversationId: convId,
          recallLimit: retrievalSettings.recallLimit,
          minImportance: retrievalSettings.minImportance || undefined,
          minDecay: retrievalSettings.minDecay || undefined,
          types: retrievalSettings.enabledTypes,
          systemPrompt: loadSystemPrompt(),
          clinamenLimit: retrievalSettings.clinamenLimit,
          clinamenMinImportance: retrievalSettings.clinamenMinImportance,
          clinamenMaxRelevance: retrievalSettings.clinamenMaxRelevance,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Failed to connect");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const json = JSON.parse(data);
            if (json.content) {
              fullContent += json.content;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullContent };
                return updated;
              });
            }
          } catch { /* skip */ }
        }
      }

      const finalMessages = [...newMessages, { role: "assistant" as const, content: fullContent }];
      setChatMessages(finalMessages);
      await updateConversation(convId!, { title: generateTitle(finalMessages), messages: finalMessages });
      refreshConversations();

      // Refresh graph — assistant memory node appears
      refresh();
    } catch (err) {
      const errorMsg = `Error: ${err instanceof Error ? err.message : "Connection failed"}`;
      const finalMessages = [...newMessages, { role: "assistant" as const, content: errorMsg }];
      setChatMessages(finalMessages);
      if (convId) await updateConversation(convId, { title: generateTitle(finalMessages), messages: finalMessages });
    } finally {
      setChatStreaming(false);
    }
  }, [chatInput, chatStreaming, chatMessages, chatConvId, retrievalSettings, refresh, refreshConversations]);

  const filteredMemories = useMemo(() => memories.filter((m) => {
    if (timelineCutoff !== Infinity && new Date(m.created_at).getTime() > timelineCutoff) return false;
    if (!enabledTypes.includes(m.memory_type)) return false;
    if (!passesDreamFilter(m)) return false;
    if (memoryFilter === "inputs") return (m.tags || []).includes("user-message");
    if (memoryFilter === "outputs") return (m.tags || []).includes("assistant-response");
    return true;
  }), [memories, timelineCutoff, enabledTypes, passesDreamFilter, memoryFilter]);

  const typeCounts = memories.reduce(
    (acc, m) => {
      if (memoryFilter === "inputs" && !(m.tags || []).includes("user-message")) return acc;
      if (memoryFilter === "outputs" && !(m.tags || []).includes("assistant-response")) return acc;
      if (!passesDreamFilter(m)) return acc;
      acc[m.memory_type] = (acc[m.memory_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const dreamSourceCounts = memories.reduce(
    (acc, m) => {
      if (!allDreamMemoryIds.has(m.id)) return acc;
      if (selectedDreamMemoryIds !== null && !selectedDreamMemoryIds.has(m.id)) return acc;
      if (memoryFilter === "inputs" && !(m.tags || []).includes("user-message")) return acc;
      if (memoryFilter === "outputs" && !(m.tags || []).includes("assistant-response")) return acc;
      if (!enabledTypes.includes(m.memory_type)) return acc;
      const src = m.source || "prelude";
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );


  return (
    <div ref={containerRef} className="relative flex h-full flex-row overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Top bar: filter (left) · Now (center) · status (right) */}
      <div className="absolute top-16 left-4 right-4 z-30 flex items-start justify-between pointer-events-none">
        {/* Left: filter card + details button */}
        <div className="flex flex-col gap-1.5 pointer-events-auto select-none">
          <div className="space-y-0.5">
            <button onClick={() => toggleSection("filters")} className="font-mono transition active:scale-95 text-left" style={{ color: "var(--accent)" }}>
              Filters {(collapsed.filters ?? false) ? "+" : "−"}
            </button>
            {!(collapsed.filters ?? false) && (
            <div className="flex flex-col gap-0.5">
            {/* Viz — collapsible */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => toggleSection("viz")} className="font-mono transition active:scale-95 text-left" style={{ color: "var(--text-faint)" }}>
                viz {(collapsed.viz ?? true) ? "+" : "−"}
              </button>
              {!(collapsed.viz ?? true) && (["hero", "cluster"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setVizMode(m)}
                  className="font-mono transition active:scale-95 text-left pl-2"
                  style={{ color: vizMode === m ? "var(--accent)" : "var(--text-faint)" }}
                >
                  {m}
                </button>
              ))}
            </div>
            {/* Focus — collapsible */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => toggleSection("focus")} className="font-mono transition active:scale-95 text-left" style={{ color: "var(--text-faint)" }}>
                focus {(collapsed.focus ?? true) ? "+" : "−"}
              </button>
              {!(collapsed.focus ?? true) && (["memories", "edges"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setEdgeFocus(m === "edges")}
                  className="font-mono transition active:scale-95 text-left pl-2"
                  style={{ color: (m === "edges") === edgeFocus ? "var(--accent)" : "var(--text-faint)" }}
                >
                  {m}
                </button>
              ))}
            </div>
            {/* Mode — collapsible */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => toggleSection("mode")} className="font-mono transition active:scale-95 text-left" style={{ color: "var(--text-faint)" }}>
                mode {(collapsed.mode ?? true) ? "+" : "−"}
              </button>
              {!(collapsed.mode ?? true) && ([["combined", "combined"], ["reinforced", "reinforced"], ["retrieved", "retrieval"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCenterMode(key)}
                  className="font-mono transition active:scale-95 text-left pl-2"
                  style={{ color: centerMode === key ? "var(--accent)" : "var(--text-faint)" }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Signals — collapsible */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => toggleSection("signals")} className="font-mono transition active:scale-95 text-left" style={{ color: "var(--text-faint)" }}>
                signals {(collapsed.signals ?? true) ? "+" : "−"}
              </button>
              {!(collapsed.signals ?? true) && ([["all", "all"], ["inputs", "external"], ["outputs", "internal"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMemoryFilter(key)}
                  className="font-mono transition active:scale-95 text-left pl-2"
                  style={{ color: memoryFilter === key ? "var(--accent)" : "var(--text-faint)" }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Memory Types — collapsible */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => toggleSection("types")} className="font-mono transition active:scale-95 text-left" style={{ color: "var(--text-faint)" }}>
                types {(collapsed.types ?? true) ? "+" : "−"}
              </button>
              {!(collapsed.types ?? true) && ALL_MEMORY_TYPES.map((type) => {
                const active = enabledTypes.includes(type);
                const count = typeCounts[type] || 0;
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className="font-mono transition active:scale-95 text-left pl-2"
                    style={{ color: active ? TYPE_COLORS[type] : "var(--text-faint)" }}
                  >
                    {type.replace("_", " ")} {count}
                  </button>
                );
              })}
            </div>
            {/* Edges — collapsible */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => toggleSection("edges")} className="font-mono transition active:scale-95 text-left" style={{ color: "var(--text-faint)" }}>
                edges {(collapsed.edges ?? true) ? "+" : "−"}
              </button>
              {!(collapsed.edges ?? true) && Object.entries(LINK_TYPE_COLORS).map(([type, color]) => {
                const active = enabledLinkTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleLinkType(type)}
                    className="font-mono transition active:scale-95 text-left pl-2"
                    style={{ color: active ? color : "var(--text-faint)" }}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            </div>
            )}
          </div>
          {/* Details button — only when something is selected */}
          {(selectedMemoryId || selectedEdge) && (
            <button
              onClick={() => { setDetailsOpen((v) => !v); if (!detailsOpen) { setChatOpen(false); setHistoryOpen(false); } }}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-all duration-200 glass active:scale-95"
              style={{ color: detailsOpen ? "var(--accent)" : "var(--text-faint)" }}
              title={detailsOpen ? "Hide details" : "See details"}
            >
              <Info className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Now / timeline date — true center, click to toggle clock */}
        {timeRange.min < timeRange.max && (
          <button
            className="absolute left-1/2 -translate-x-1/2 font-mono cursor-pointer pointer-events-auto"
            style={{ color: "var(--accent)" }}
            onClick={() => setShowClock((v) => !v)}
          >
            {timelineCutoff === Infinity
              ? (showClock ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now")
              : formatTimelineTick(timelineCutoff, timeRange.max - timeRange.min, true)}
          </button>
        )}

        {/* Neural Map status — collapsible, right */}
        {(() => {
          const memActive = memories.length > 0;
          const modelActive = !!activeModel;
          const dreamActive = retrievalSettings.dreamScheduleEnabled;
          const reflectActive = retrievalSettings.reflectionScheduleEnabled;
          const activeCount = [memActive, modelActive, dreamActive, reflectActive].filter(Boolean).length;
          const status = cortexOnline === null ? "..." : !cortexOnline ? "inactive" : activeCount === 4 ? "live" : activeCount > 0 ? "partial" : "inactive";
          const dotColor = status === "live" ? "#22c55e" : status === "partial" ? "#f59e0b" : "#ef4444";
          const textColor = status === "live" ? "#22c55e" : status === "partial" ? "#f59e0b" : "#ef4444";
          return (
            <div className="select-none text-right pointer-events-auto">
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="font-mono" style={{ color: "var(--accent)" }}>
                  Neural Map
                </span>
                <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                  {filteredMemories.length}
                </span>
                <span
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ background: status === "..." ? "var(--text-faint)" : dotColor }}
                />
                <span className="font-mono" style={{ color: status === "..." ? "var(--text-faint)" : textColor }}>
                  {status}
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="font-mono" style={{ color: "var(--text-faint)" }}>model</span>
                    <span className="font-mono" style={{ color: modelActive ? "var(--accent)" : "var(--text-faint)" }}>
                      {activeModel ? activeModel.split("/").pop() : "none"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="font-mono" style={{ color: "var(--text-faint)" }}>memory</span>
                    <span className="font-mono" style={{ color: memActive ? "var(--accent)" : "var(--text-faint)" }}>
                      {memActive ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ background: dreamActive ? "#22c55e" : "transparent" }}
                    />
                    <button
                      onClick={toggleDreamSchedule}
                      disabled={dreamToggling}
                      className="font-mono transition active:scale-95"
                      style={{ color: "var(--text-faint)" }}
                    >
                      dream
                    </button>
                    <span
                      className="font-mono cursor-pointer"
                      onClick={toggleDreamSchedule}
                      style={{ color: dreamActive ? "#22c55e" : "var(--text-faint)" }}
                    >
                      {dreamToggling ? "..." : dreamActive ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ background: reflectActive ? "#22c55e" : "transparent" }}
                    />
                    <button
                      onClick={toggleReflectSchedule}
                      disabled={reflectToggling}
                      className="font-mono transition active:scale-95"
                      style={{ color: "var(--text-faint)" }}
                    >
                      reflect
                    </button>
                    <span
                      className="font-mono cursor-pointer"
                      onClick={toggleReflectSchedule}
                      style={{ color: reflectActive ? "#22c55e" : "var(--text-faint)" }}
                    >
                      {reflectToggling ? "..." : reflectActive ? "active" : "inactive"}
                    </span>
                  </div>
                </div>
            </div>
          );
        })()}
      </div>

      {/* Zoom buttons */}
      {graphReady && (
        <div
          className="absolute z-10 flex flex-col gap-1.5 select-none"
          style={{ top: "170px", right: "16px" }}
        >
          <button
            onClick={() => neuralGraphRef.current?.zoomIn()}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
            style={{ color: "var(--accent)", background: "transparent", border: "1px solid var(--border)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            title="Zoom in"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => neuralGraphRef.current?.zoomOut()}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
            style={{ color: "var(--accent)", background: "transparent", border: "1px solid var(--border)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            title="Zoom out"
          >
            <Minus className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Floating path controls card — visible when any node or edge selected */}
      {graphReady && (selectedEdge || selectedMemoryId) && (
        <div
          className="absolute z-10 select-none"
          style={{
            bottom: 80,
            left: (() => {
              const panelPx = detailsOpen && (selectedMemoryId || selectedEdge) ? 280 : 0;
              return `${panelPx + 16}px`;
            })(),
            transition: "left 0.3s ease",
          }}
        >
          <div
            className="overflow-hidden"
            style={{
              background: "rgba(245, 245, 240, 0.65)",
              backdropFilter: "blur(24px) saturate(1.2)",
              WebkitBackdropFilter: "blur(24px) saturate(1.2)",
              border: "1px solid rgba(0, 0, 0, 0.06)",
              borderRadius: 12,
              fontFamily: "inherit",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)",
              width: 200,
            }}
          >
            {/* Header strip */}
            <div
              className="flex items-center justify-between px-3 py-1.5"
              style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.04)" }}
            >
              <span className="t-micro font-mono tracking-widest uppercase" style={{ color: "var(--accent)", opacity: 0.7, fontSize: 9 }}>Path</span>
              {reachableCount > 1 && (
                <span className="t-micro font-mono" style={{ color: "var(--accent)", opacity: 0.6, fontSize: 9 }}>
                  {reachableCount} nodes
                </span>
              )}
            </div>

            <div className="px-3 py-2 space-y-2.5">
              {/* Depth */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="t-micro" style={{ color: "var(--text-faint)", fontSize: 9 }}>Depth</span>
                  <span className="t-micro font-mono" style={{ color: "var(--text-muted)", fontSize: 9 }}>{pathDepth}/{traceMaxDepth}</span>
                </div>
                <input
                  type="range"
                  min={selectedEdge ? 0 : 1}
                  max={traceMaxDepth}
                  value={pathDepth}
                  onChange={(e) => setPathDepth(Number(e.target.value))}
                  className="neuro-range w-full h-0.5"
                />
              </div>

              {/* Direction */}
              <div>
                <span className="t-micro block mb-1" style={{ color: "var(--text-faint)", fontSize: 9 }}>Direction</span>
                <div className="flex gap-1">
                  {(["both", "upstream", "downstream"] as const).map((dir) => {
                    const active = pathDirection === dir;
                    return (
                      <button
                        key={dir}
                        onClick={() => setPathDirection(dir)}
                        className="flex-1 py-0.5 rounded-md transition-all duration-200 cursor-pointer"
                        style={{
                          background: active ? "var(--accent)" : "rgba(0, 0, 0, 0.03)",
                          color: active ? "#fff" : "var(--text-faint)",
                          fontSize: 9,
                          fontWeight: active ? 500 : 400,
                          border: "none",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {dir === "both" ? "All" : dir === "upstream" ? "↑ Up" : "↓ Dn"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Min Strength */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="t-micro" style={{ color: "var(--text-faint)", fontSize: 9 }}>Min Strength</span>
                  <span className="t-micro font-mono" style={{ color: "var(--text-muted)", fontSize: 9 }}>{Math.round(pathMinStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(pathMinStrength * 100)}
                  onChange={(e) => setPathMinStrength(Number(e.target.value) / 100)}
                  className="neuro-range w-full h-0.5"
                />
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Left side panel: details */}
      {detailsOpen && (selectedMemory || selectedEdge) && (
        <div className="w-[280px] relative z-10 shrink-0 overflow-y-auto px-4 pb-4 pt-12 space-y-3 transition-all duration-300" style={{ borderRight: "1px solid var(--border)", marginTop: "64px", height: "calc(100% - 64px)" }}>
          {selectedMemory ? (
            <MemoryNodeDetail
              memory={selectedMemory}
              onClose={() => { setSelectedMemoryId(null); setDetailsOpen(false); }}
              onNavigate={(id) => { setSelectedMemoryId(id); }}
              traceData={traceData}
            />
          ) : selectedEdge ? (
            <EdgePathDetail
              sourceMemory={memories.find((m) => m.id === selectedEdge.sourceNumericId) ?? null}
              targetMemory={memories.find((m) => m.id === selectedEdge.targetNumericId) ?? null}
              linkType={selectedEdge.linkType}
              strength={selectedEdge.strength}
              onClose={() => { setSelectedEdge(null); setHighlightedPath(null); setHighlightedLinks(null); setDetailsOpen(false); }}
              onNavigateMemory={(id) => { setSelectedEdge(null); setHighlightedPath(null); setHighlightedLinks(null); setSelectedMemoryId(id); }}
              onNavigateEdge={(edge) => { setHighlightedPath(null); setHighlightedLinks(null); handleEdgeSelect(edge); setDetailsOpen(true); }}
              traceData={traceData}
            />
          ) : null}
        </div>
      )}

      {/* Left side panel: chat */}
      {chatOpen && (
        <div className="w-[320px] relative z-10 shrink-0 flex flex-col transition-all duration-300" style={{ borderRight: "1px solid var(--border)", marginTop: "64px", height: "calc(100% - 64px)" }}>
          {/* Chat messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 pt-12 pb-2">
            {chatMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <MessageSquare className="h-8 w-8" style={{ color: "var(--text-faint)", opacity: 0.3 }} />
                <p className="t-tiny text-center" style={{ color: "var(--text-faint)" }}>
                  Start a conversation from the brain
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="max-w-[85%] rounded-[8px] px-3 py-2"
                      style={msg.role === "user" ? {
                        background: "var(--accent)",
                        color: "#fff",
                      } : {
                        color: "var(--text)",
                      }}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed t-tiny">
                        {msg.content}
                        {chatStreaming &&
                          i === chatMessages.length - 1 &&
                          msg.role === "assistant" && (
                            <span className="ml-1 inline-block h-3 w-0.5 animate-pulse" style={{ background: "var(--accent)" }} />
                          )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Chat input */}
          <div className="px-4 pb-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBrainChat()}
                placeholder="Message..."
                className="flex-1 bg-transparent outline-none t-tiny"
                style={{ color: "var(--text)" }}
                disabled={chatStreaming}
              />
              <button
                onClick={sendBrainChat}
                disabled={chatStreaming || !chatInput.trim()}
                className="shrink-0 transition active:scale-95 disabled:opacity-20"
                style={{ color: "var(--accent)" }}
              >
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left side panel: history */}
      {historyOpen && (
        <div className="w-[280px] relative z-10 shrink-0 flex flex-col transition-all duration-300" style={{ borderRight: "1px solid var(--border)", marginTop: "64px", height: "calc(100% - 64px)" }}>
          <div className="flex-1 overflow-y-auto px-3 pt-12 pb-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-8 text-center t-tiny" style={{ color: "var(--text-faint)" }}>
                No chats yet
              </p>
            ) : (
              <div className="space-y-0.5">
                {conversations.map((conv) => {
                  const isActive = conv.id === chatConvId;
                  return (
                    <div
                      key={conv.id}
                      className="group flex items-start gap-2 rounded-[6px] px-2 py-2 transition cursor-pointer"
                      style={{ background: isActive ? "var(--surface-dim)" : "transparent" }}
                      onClick={() => handleLoadConversation(conv)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate t-tiny" style={{ color: isActive ? "var(--accent)" : "var(--text)" }}>
                          {conv.summary || conv.title}
                        </p>
                        <p className="mt-0.5 t-micro" style={{ color: "var(--text-faint)" }}>
                          {conv.messages.length} messages · {timeAgo(conv.updatedAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition rounded-[4px] p-1"
                        style={{ color: "var(--text-faint)" }}
                        title="Delete chat"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {conversations.length > 0 && (
            <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={handleClearAll}
                className="flex w-full items-center justify-center gap-1.5 rounded-[6px] py-1.5 t-tiny transition active:scale-95"
                style={{ color: "#ef4444" }}
              >
                <Trash2 className="h-2.5 w-2.5" />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Graph area */}
      <div
        ref={graphContainerRef}
        className="flex-1 min-h-0 min-w-0 transition-all duration-300 relative"
      >
        {/* Loading indicator — pulsing dot morphs into hero node */}
        <div
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          style={{
            background: graphReady ? "transparent" : "var(--bg)",
            opacity: graphReady ? 0 : 1,
            transition: "opacity 600ms ease-out, background 600ms ease-out",
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
              <div className="absolute h-6 w-6 rounded-full animate-ping" style={{ background: "var(--accent)", opacity: 0.15 }} />
            </div>
            <p className="t-small" style={{ color: "var(--text-faint)", opacity: graphReady ? 0 : 1, transition: "opacity 300ms ease-out" }}>Mapping neural graph...</p>
          </div>
        </div>
        <div
          style={{
            opacity: graphReady ? 1 : 0,
            transition: "opacity 600ms ease-out",
            pointerEvents: graphReady ? "auto" : "none",
            width: "100%",
            height: "100%",
          }}
        >
          {graphSize.width > 0 && graphSize.height > 0 && (
            <NeuralGraph
              ref={neuralGraphRef}
              onNodeSelect={handleNodeSelect}
              selectedNodeId={selectedMemoryId}
              filterBagRef={filterBagRef}
              vizMode={vizMode}
              width={graphSize.width}
              height={graphSize.height}
              autoRotate={autoRotate}
              onAutoRotateChange={setAutoRotate}
              hideEdges={timelineDragging}
              selectedEdge={selectedEdge ? { sourceId: selectedEdge.sourceId, targetId: selectedEdge.targetId } : null}
              highlightedPath={highlightedPath}
              onEdgeSelect={handleEdgeSelect}
              onReady={() => setGraphReady(true)}
              onBackgroundSelect={() => {
                setSelectedMemoryId(null);
                setSelectedEdge(null);
                setHighlightedPath(null);
                setHighlightedLinks(null);
                setDetailsOpen(false);
                neuralGraphRef.current?.resetView();
              }}
            />
          )}
        </div>
      </div>


      {/* Play/pause auto-rotation */}
      {graphReady && (
        <button
          onClick={() => setAutoRotate((v) => !v)}
          className="absolute z-20 flex h-8 w-8 items-center justify-center rounded-full active:scale-95 cursor-pointer select-none"
          style={{
            color: "var(--accent)",
            background: "transparent",
            border: "1px solid var(--border)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            ...(() => {
                  const panelPx = chatOpen ? "320px" : historyOpen ? "280px" : detailsOpen && (selectedMemoryId || selectedEdge) ? "280px" : "0px";
                  return { bottom: 64, left: `calc(${panelPx} + (100% - ${panelPx}) / 2)`, transform: "translateX(-50%)" };
                })(),
          }}
          title={autoRotate ? "Pause rotation" : "Resume rotation"}
        >
          {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
      )}

      {/* Timeline bar — bottom */}
      {graphReady && timeRange.min < timeRange.max && (
        <div className="absolute bottom-0 right-0 z-10 px-6 pb-4 pt-6" style={{ left: chatOpen ? "320px" : historyOpen ? "280px" : detailsOpen && (selectedMemoryId || selectedEdge) ? "280px" : "0px", background: "linear-gradient(transparent, var(--bg))", transition: "left 0.3s" }}>
          {/* Track */}
          <div className="relative h-5 flex items-center">
            <div className="absolute left-0 right-0 h-[3px] rounded-full" style={{ background: "var(--bar-track)" }} />
            <div
              className="absolute left-0 h-[3px] rounded-full"
              style={{
                width: `${(((timelineCutoff === Infinity ? timeRange.max : timelineCutoff) - timeRange.min) / (timeRange.max - timeRange.min)) * 100}%`,
                background: "var(--accent)",
              }}
            />
            <input
              type="range"
              min={timeRange.min}
              max={timeRange.max}
              step={Math.max(1, Math.floor((timeRange.max - timeRange.min) / 500))}
              value={timelineCutoff === Infinity ? timeRange.max : timelineCutoff}
              onChange={(e) => {
                const v = Number(e.target.value);
                const step = Math.max(1, Math.floor((timeRange.max - timeRange.min) / 500));
                // Snap to Infinity (= "now") when at or within one step of max
                setTimelineCutoff(v >= timeRange.max - step ? Infinity : v);
              }}
              onPointerDown={() => setTimelineDragging(true)}
              onPointerUp={() => setTimelineDragging(false)}
              className="neuro-range absolute inset-0 w-full cursor-pointer"
            />
          </div>
          {/* Tick labels */}
          <div className="flex justify-between mt-0.5">
            {Array.from({ length: 4 }, (_, i) => {
              const ts = timeRange.min + ((timeRange.max - timeRange.min) * i) / 3;
              return (
                <span key={i} className="t-micro" style={{ color: "var(--text-faint)" }}>
                  {formatTimelineTick(ts, timeRange.max - timeRange.min, false)}
                </span>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

function formatTimelineTick(ts: number, spanMs: number, full: boolean): string {
  const d = new Date(ts);
  if (full) {
    // Full label for the current position
    if (spanMs < 86_400_000) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (spanMs < 604_800_000) return d.toLocaleDateString([], { weekday: "short", hour: "numeric" });
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }
  // Short tick labels
  if (spanMs < 86_400_000) return d.toLocaleTimeString([], { hour: "numeric" });
  if (spanMs < 604_800_000) return d.toLocaleDateString([], { weekday: "short" });
  if (spanMs < 7_776_000_000) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short" });
}

function FilterSection({
  title,
  sectionKey,
  collapsed,
  onToggle,
  icon,
  children,
}: {
  title: string;
  sectionKey: string;
  collapsed: Record<string, boolean>;
  onToggle: (key: string) => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isCollapsed = collapsed[sectionKey] ?? true;
  return (
    <div>
      <div className="h-px w-full" style={{ background: "var(--border)" }} />
      <button
        onClick={() => onToggle(sectionKey)}
        className="flex items-center gap-1 w-full py-1.5 text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="h-2 w-2 shrink-0" style={{ color: "var(--text-faint)" }} />
        ) : (
          <ChevronDown className="h-2 w-2 shrink-0" style={{ color: "var(--text-faint)" }} />
        )}
        {icon && <span style={{ color: "var(--text-faint)" }}>{icon}</span>}
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
          {title}
        </span>
      </button>
      {!isCollapsed && (
        <div className="flex flex-col gap-1 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}
