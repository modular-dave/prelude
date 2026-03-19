"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { NeuralGraph, type NeuralGraphHandle, type SelectedEdgeInfo } from "@/components/brain/neural-graph";
import { PinnedCardBody } from "@/components/brain/pinned-card-body";

import { MemoryNodeDetail } from "@/components/brain/memory-node-detail";
import { EdgePathDetail } from "@/components/brain/edge-path-detail";
import { useMemory } from "@/lib/memory-context";
import { useContainerSize } from "@/hooks/use-container-size";
import { TYPE_COLORS, LINK_TYPE_COLORS, type MemoryType, type FilterBag, type FocusMode } from "@/lib/types";
import { ALL_MEMORY_TYPES } from "@/lib/retrieval-settings";
import { ChevronDown, ChevronRight, Play, Pause, Plus, Minus, Info, MessageSquare, Trash2 } from "lucide-react";
import type { Conversation } from "@/lib/chat-store";
import { useCortexStatus } from "@/components/brain/hooks/use-cortex-status";
import { useBrainChat } from "@/components/brain/hooks/use-brain-chat";
import { usePathTracing } from "@/components/brain/hooks/use-path-tracing";
import { SettingsPanel } from "@/components/brain/panels/settings-panel";
import { ModelsPanel } from "@/components/brain/panels/models-panel";
import { CortexPanel } from "@/components/brain/panels/cortex-panel";
import { ImportPanel } from "@/components/brain/panels/import-panel";
import { FloatNav } from "@/components/shell/float-nav";
import { BrainStatusBar } from "@/components/brain/sections/brain-status-bar";

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
  const { memories, knowledgeGraph, retrievalSettings, updateRetrievalSettings, refresh } = useMemory();
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
  const [reorgMode, setReorgMode] = useState<"count" | "diversity">("count");
  const [autoRotate, setAutoRotate] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dreamSessions, setDreamSessions] = useState<DreamSession[]>([]);
  const [timelineCutoff, setTimelineCutoff] = useState(Infinity); // Infinity = "now", no cutoff
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [decayCutoff, setDecayCutoff] = useState(0); // 0 = show all, 1 = only fresh
  const [statusCardCollapsed, setStatusCardCollapsed] = useState(false);
  const [vizMode, setVizMode] = useState<"hero" | "cluster" | "starburst" | "zero">("zero");
  const [focus, setFocus] = useState<FocusMode>("memories");
  const [showClock, setShowClock] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // ── Brain chat (extracted hook) ──
  const {
    chatInput, setChatInput, chatStreaming, chatMessages, setChatMessages,
    chatConvId, setChatConvId, historyOpen, setHistoryOpen, conversations,
    chatScrollRef, handleNewBrainChat, handleLoadConversation,
    handleDeleteConversation, handleClearAll, sendBrainChat,
  } = useBrainChat(retrievalSettings, refresh, setChatOpen, setDetailsOpen);

  const [rightPanel, setRightPanel] = useState<"settings" | "models" | "cortex" | "import" | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pinnedContent, setPinnedContent] = useState<{ content: any; position: { x: number; y: number } } | null>(null);
  // Path controls state (lifted from EdgePathDetail for floating card)
  const [pathDepth, setPathDepth] = useState(0);
  const [pathDirection, setPathDirection] = useState<"both" | "upstream" | "downstream">("both");
  const [pathMinStrength, setPathMinStrength] = useState(0);
  // traceData is now a derived value (useMemo), not state
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const neuralGraphRef = useRef<NeuralGraphHandle>(null);
  const graphSize = useContainerSize(graphContainerRef);
  const compact = graphSize.width > 0 && graphSize.width < 500;

  // ── Filter bag: all filter values in a stable ref, read by NeuralGraph tick loop ──
  const globalVisibleIds = useMemo(() => {
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
    memoryFilter, typeFilter: enabledTypes, centerMode, focus, linkTypeFilter: enabledLinkTypes,
    timelineCutoff, decayCutoff, visibleMemoryIds: globalVisibleIds, reorgMode,
  });
  // ── Path tracing (extracted hook) ──
  const {
    traceMemoryId, traceData, traceMaxDepth, allTraceNodes,
    traceNodeDepths, reachableNodes, reachableCount, visibleMemoryIds,
  } = usePathTracing(
    selectedMemoryId, selectedEdge, knowledgeGraph.edges,
    globalVisibleIds, pathDepth, pathDirection, pathMinStrength,
  );

  // Update filterBag ref with combined visibility
  filterBagRef.current = {
    memoryFilter, typeFilter: enabledTypes, centerMode, focus, linkTypeFilter: enabledLinkTypes,
    timelineCutoff, decayCutoff, visibleMemoryIds, reorgMode,
  };

  // Zoom camera to fit reachable nodes (single source of camera control)
  // Use a stable key (sorted IDs string) to avoid re-firing when array reference changes but content is the same.
  const reachableKey = useMemo(() => reachableNodes.slice().sort((a, b) => a - b).join(","), [reachableNodes]);
  const hasSelectedRef = useRef(false);
  useEffect(() => {
    if (!traceMemoryId) {
      if (hasSelectedRef.current) {
        neuralGraphRef.current?.resetView();
        hasSelectedRef.current = false;
      }
      return;
    }
    hasSelectedRef.current = true;
    if (reachableNodes.length <= 1) {
      neuralGraphRef.current?.fitNodes([`m_${traceMemoryId}`]);
    } else {
      const graphIds = reachableNodes.map(id => `m_${id}`);
      neuralGraphRef.current?.fitNodes(graphIds);
    }
  }, [reachableKey, traceMemoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced path highlight
  useEffect(() => {
    clearTimeout(highlightTimeoutRef.current);
    if (!traceMemoryId) {
      setHighlightedPath(null);
      setHighlightedLinks(null);
      return;
    }
    highlightTimeoutRef.current = setTimeout(() => {
      // Always highlight root (and edge target if applicable)
      const ids = new Set<string>();
      ids.add(`m_${traceMemoryId}`);
      if (selectedEdge) ids.add(`m_${selectedEdge.targetNumericId}`);
      // At depth > 0, also highlight reachable nodes
      if (pathDepth > 0) {
        for (const id of reachableNodes) ids.add(`m_${id}`);
      }
      setHighlightedPath(ids.size > 0 ? ids : null);

      // Build highlighted links (only at depth > 0)
      const linkIds = new Set<string>();
      if (pathDepth > 0 && traceData?.links) {
        const reachableSet = new Set(reachableNodes);
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

  // ── Cortex status (extracted hook) ──
  const cortexStatus = useCortexStatus(retrievalSettings, updateRetrievalSettings);

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
    setPathDepth(0);
    setPathDirection("both");
    setPathMinStrength(0);
    setSelectedMemoryId((prev) => (prev === memoryId ? null : memoryId));
  }, []);

  const handleEdgeSelect = useCallback((edge: SelectedEdgeInfo) => {
    setSelectedMemoryId(null);
    setHighlightedPath(null);
    setHighlightedLinks(null);
    setDetailsOpen(false);
    setPathDepth(0);
    setPathDirection("both");
    setPathMinStrength(0);
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

  const edgeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Only count edges where both endpoints are visible (filtered) memories
    const visIds = globalVisibleIds;
    for (const e of knowledgeGraph.edges) {
      // If we have a visibility filter, check both endpoints
      if (visIds) {
        const srcNum = e.source.startsWith("m_") ? parseInt(e.source.slice(2)) : NaN;
        const tgtNum = e.target.startsWith("m_") ? parseInt(e.target.slice(2)) : NaN;
        if (!isNaN(srcNum) && !visIds.has(srcNum)) continue;
        if (!isNaN(tgtNum) && !visIds.has(tgtNum)) continue;
      }
      const t = e.type || "relates";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [knowledgeGraph.edges, globalVisibleIds]);

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
      {/* Left side panel: chat */}
      {chatOpen && (
        <div className="w-[33vw] relative z-10 shrink-0 flex flex-col transition-all duration-300" style={{ borderRight: "2px solid var(--border)", marginTop: "64px", height: "calc(100% - 64px)", background: "var(--bg)" }}>
          {/* Chat header */}
          <div className="flex items-center justify-end px-4 pt-3 pb-1">
            <button
              onClick={() => { setChatMessages([]); setChatConvId(null); setHistoryOpen(false); }}
              className="font-mono transition active:scale-95"
              style={{ color: "var(--accent)", fontSize: 13, fontWeight: 500 }}
              title="New chat"
            >
              +
            </button>
          </div>
          {/* Chat messages OR history list */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 pt-2 pb-2">
            {historyOpen ? (
              <div>
                {conversations.length === 0 ? (
                  <p className="font-mono py-8 text-center" style={{ color: "var(--text-faint)", fontSize: 11 }}>
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
                            <p className="font-mono truncate" style={{ color: isActive ? "var(--accent)" : "var(--text)", fontSize: 11 }}>
                              {conv.summary || conv.title}
                            </p>
                            <p className="font-mono mt-0.5" style={{ color: "var(--text-faint)", fontSize: 9 }}>
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
                {conversations.length > 0 && (
                  <div className="pt-3 mt-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <button
                      onClick={handleClearAll}
                      className="font-mono flex w-full items-center justify-center gap-1.5 rounded-[6px] py-1.5 transition active:scale-95"
                      style={{ color: "var(--error)", fontSize: 9 }}
                    >
                      clear all
                    </button>
                  </div>
                )}
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <MessageSquare className="h-8 w-8" style={{ color: "var(--text-faint)", opacity: 0.3 }} />
                <p className="font-mono text-center" style={{ color: "var(--text-faint)", fontSize: "11px" }}>
                  Start a conversation from the brain
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
                    <span className="font-mono t-micro" style={{ color: "var(--text-faint)" }}>
                      {msg.role === "user" ? "you" : "brain"}
                    </span>
                    <p
                      className="font-mono whitespace-pre-wrap leading-relaxed t-tiny mt-0.5"
                      style={{ color: msg.role === "user" ? "var(--accent)" : "var(--text)" }}
                    >
                      {msg.content}
                      {chatStreaming &&
                        i === chatMessages.length - 1 &&
                        msg.role === "assistant" && (
                          <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse" style={{ background: "var(--accent)" }} />
                        )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Chat input — hidden when history is open */}
          {!historyOpen && <div className="absolute left-0 right-0 px-4" style={{ bottom: 42 }}>
            <div className="mb-2" style={{ borderTop: "1px solid var(--border)" }} />
            <div className="flex items-center gap-1.5">
              <span className="font-mono shrink-0" style={{ color: "var(--accent)", fontSize: "11px" }}>&gt;</span>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBrainChat()}
                className="flex-1 bg-transparent outline-none font-mono"
                style={{ color: "var(--accent)", caretColor: "var(--accent)", fontSize: "11px" }}
                disabled={chatStreaming}
              />
              <button
                onClick={sendBrainChat}
                disabled={chatStreaming || !chatInput.trim()}
                className="shrink-0 font-mono transition active:scale-95 disabled:opacity-20"
                style={{ color: "var(--accent)", fontSize: "11px" }}
              >
                send
              </button>
            </div>
          </div>}
        </div>
      )}

      {/* History panel removed — now inline in chat panel */}
      {false && (
        <div />
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

      {/* Graph area — click to close chat panel */}
      <div
        ref={graphContainerRef}
        className="flex-1 min-h-0 min-w-0 transition-all duration-300 relative"
        onClick={() => { if (chatOpen) setChatOpen(false); if (rightPanel) setRightPanel(null); }}
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
            position: "relative",
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
              nodeDepthMap={traceNodeDepths.size > 0 ? traceNodeDepths : null}
              onEdgeSelect={handleEdgeSelect}
              onReady={() => setGraphReady(true)}
              onPinnedContentChange={(data) => {
                if (data) {
                  const { position, ...content } = data;
                  setPinnedContent({ content, position });
                } else {
                  setPinnedContent(null);
                }
              }}
              onBackgroundSelect={() => {
                setSelectedMemoryId(null);
                setSelectedEdge(null);
                setHighlightedPath(null);
                setHighlightedLinks(null);
                setDetailsOpen(false);
              }}
            />
          )}

          {/* Hover card */}
          {pinnedContent && (
            <div
              style={{
                position: "absolute",
                left: pinnedContent.position.x + 12,
                top: pinnedContent.position.y - 8,
                zIndex: 50,
                pointerEvents: "none",
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(8px)",
                borderRadius: 8,
                padding: "8px 10px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
                minWidth: 140,
                maxWidth: 220,
              }}
            >
              <PinnedCardBody content={pinnedContent.content} />
            </div>
          )}
        </div>

        {/* Top bar: filter (left) · Now (center) · status (right) — each absolutely pinned */}
        <div className="absolute top-16 left-0 right-0 bottom-0 z-30 pointer-events-none">
          {/* Left: filter card */}
          <div className="absolute top-0 left-4 pointer-events-auto select-none flex flex-col gap-1.5">
            {compact && (
              /* Compact mode: just "filter +" toggle */
              <button
                onClick={() => toggleSection("compactFilter")}
                className="font-mono transition active:scale-95"
                style={{ color: "var(--text-faint)" }}
              >
                filter {(collapsed.compactFilter ?? true) ? "+" : "−"}
              </button>
            )}
            {(!compact || !(collapsed.compactFilter ?? true)) && (
            <div className="space-y-0.5">
              {/* Viz — horizontal, always visible */}
              <div className="flex flex-row gap-2 font-mono">
                <span style={{ color: "var(--text-faint)" }}>viz︱</span>
                {(["zero", "hero", "cluster", "starburst"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setVizMode(m)}
                    className="transition active:scale-95"
                    style={{ color: vizMode === m ? "var(--accent)" : "var(--text-faint)" }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {/* Focus — horizontal, always visible */}
              <div className="flex flex-row gap-2 font-mono">
                <span style={{ color: "var(--text-faint)" }}>focus︱</span>
                {(["memories", "edges", "entities"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setFocus(m)}
                    className="transition active:scale-95"
                    style={{ color: focus === m ? "var(--accent)" : "var(--text-faint)" }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {/* Reorg — horizontal, always visible, same style as viz/focus */}
              <div className="flex flex-row gap-2 font-mono">
                <span style={{ color: "var(--text-faint)" }}>reorg︱</span>
                {(["count", "diversity"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setReorgMode(m)}
                    className="transition active:scale-95"
                    style={{ color: reorgMode === m ? "var(--accent)" : "var(--text-faint)" }}
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
                  const count = edgeTypeCounts[type] || 0;
                  return (
                    <button
                      key={type}
                      onClick={() => toggleLinkType(type)}
                      className="font-mono transition active:scale-95 text-left pl-2"
                      style={{ color: active ? color : "var(--text-faint)" }}
                    >
                      {type} {count}
                    </button>
                  );
                })}
              </div>
            </div>
            )}
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

          {/* Now / timeline date — pinned top-center */}
          {timeRange.min < timeRange.max && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-auto">
              <button
                className="font-mono cursor-pointer"
                style={{ color: "var(--accent)", fontSize: 11 }}
                onClick={() => setShowClock((v) => !v)}
              >
                {timelineCutoff === Infinity
                  ? (showClock ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now")
                  : formatTimelineTick(timelineCutoff, timeRange.max - timeRange.min, true)}
              </button>
            </div>
          )}

          {/* Neural Map status — pinned top-right */}
          <BrainStatusBar
            compact={compact}
            filteredCount={filteredMemories.length}
            cortexStatus={cortexStatus}
            dreamScheduleEnabled={retrievalSettings.dreamScheduleEnabled}
            reflectionScheduleEnabled={retrievalSettings.reflectionScheduleEnabled}
            collapsed={collapsed}
            toggleSection={toggleSection}
          />
        </div>

        {/* Zoom buttons */}
        {graphReady && (
          <div
            className="absolute z-10 flex flex-col gap-1.5 select-none"
            style={{ top: "50%", right: "16px", transform: "translateY(-50%)" }}
          >
            <button
              onClick={() => neuralGraphRef.current?.zoomIn()}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
              style={{ color: "var(--accent)", background: "transparent", border: "1px solid var(--border)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
              title="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => neuralGraphRef.current?.zoomOut()}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
              style={{ color: "var(--accent)", background: "transparent", border: "1px solid var(--border)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
              title="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Floating path controls card — visible when any node or edge selected */}
        {graphReady && (selectedEdge || selectedMemoryId) && (
          <div
            className="absolute z-10 select-none"
            style={{ bottom: 80, left: 16 }}
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
                    min={0}
                    max={Math.max(0, traceMaxDepth)}
                    value={Math.min(pathDepth, Math.max(0, traceMaxDepth))}
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

        {/* Play/pause (center) · Chat (right) — above timeline */}
        {graphReady && (
          <div className="absolute z-20" style={{ bottom: timeRange.min < timeRange.max ? 100 : 16, left: 0, right: 0 }}>
            {/* Play/pause — center */}
            <button
              onClick={() => setAutoRotate((v) => !v)}
              className="absolute flex h-10 w-10 items-center justify-center rounded-full active:scale-95 cursor-pointer select-none"
              style={{
                left: "50%",
                transform: "translateX(-50%)",
                color: "var(--accent)",
                background: "transparent",
                border: "1px solid var(--border)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
              title={autoRotate ? "Pause rotation" : "Resume rotation"}
            >
              {autoRotate ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            {/* Chat toggle — right */}
            <button
              onClick={() => setChatOpen((v) => !v)}
              className="absolute flex h-10 w-10 items-center justify-center rounded-full active:scale-95 cursor-pointer select-none"
              style={{
                right: 24,
                color: chatOpen ? "#fff" : "var(--text-faint)",
                background: chatOpen ? "var(--accent)" : "transparent",
                border: chatOpen ? "none" : "1px solid var(--border)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                transition: "all 0.2s",
              }}
              title={chatOpen ? "Close chat" : "Open chat"}
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Timeline bar + decay — bottom */}
        {graphReady && timeRange.min < timeRange.max && (
          <div className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-4 pt-6" style={{ background: "linear-gradient(transparent, var(--bg))" }}>
            {/* Decay filter — vertical in compact mode */}
            {compact ? (
              <div className="absolute z-20 flex flex-col items-center gap-1" style={{ left: 8, bottom: 80, width: 24 }}>
                <span className="t-micro font-mono" style={{ color: "var(--text-faint)", fontSize: 8 }}>
                  {Math.round(decayCutoff * 100)}%
                </span>
                <div className="relative flex items-center justify-center" style={{ width: 24, height: 80 }}>
                  <div className="absolute h-full w-[2px] rounded-full" style={{ background: "var(--bar-track)" }} />
                  <div
                    className="absolute bottom-0 w-[2px] rounded-full"
                    style={{ height: `${decayCutoff * 100}%`, background: "var(--accent)" }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={decayCutoff * 100}
                    onChange={(e) => setDecayCutoff(Number(e.target.value) / 100)}
                    className="neuro-range absolute cursor-pointer"
                    style={{ width: 80, transform: "rotate(-90deg)", transformOrigin: "center" }}
                  />
                </div>
                <span className="t-micro" style={{ color: decayCutoff > 0 ? "var(--accent)" : "var(--text-faint)", fontSize: 8 }}>decay</span>
              </div>
            ) : (
            <div className="flex items-center gap-2 mb-2" style={{ width: "25%" }}>
              <span className="t-micro" style={{ color: decayCutoff > 0 ? "var(--accent)" : "var(--text-faint)", whiteSpace: "nowrap" }}>decay</span>
              <div className="relative h-4 flex items-center flex-1">
                <div className="absolute left-0 right-0 h-[2px] rounded-full" style={{ background: "var(--bar-track)" }} />
                <div
                  className="absolute left-0 h-[2px] rounded-full"
                  style={{ width: `${decayCutoff * 100}%`, background: "var(--accent)" }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={decayCutoff * 100}
                  onChange={(e) => setDecayCutoff(Number(e.target.value) / 100)}
                  className="neuro-range absolute inset-0 w-full cursor-pointer"
                />
              </div>
              <span className="t-micro font-mono" style={{ color: "var(--text-faint)", minWidth: 28, textAlign: "right" }}>
                {Math.round(decayCutoff * 100)}%
              </span>
            </div>
            )}
            {/* Timeline track */}
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

      {/* Right panel: settings / models / cortex / import */}
      {rightPanel && (
        <div className="w-[33vw] relative z-10 shrink-0 flex flex-col overflow-y-auto transition-all duration-300 font-mono"
          style={{ borderLeft: "2px solid var(--border)", marginTop: "64px", height: "calc(100% - 64px)", background: "var(--bg)" }}>
          {rightPanel === "settings" && <SettingsPanel onNavigate={(v) => setRightPanel(v as typeof rightPanel)} />}
          {rightPanel === "models" && <ModelsPanel onBack={() => setRightPanel("settings")} />}
          {rightPanel === "cortex" && <CortexPanel onBack={() => setRightPanel("settings")} />}
          {rightPanel === "import" && <ImportPanel onBack={() => setRightPanel("settings")} />}
        </div>
      )}

      {/* Navigation overlay */}
      <FloatNav route="brain" onSettingsClick={() => setRightPanel((v) => v ? null : "settings")} />
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
