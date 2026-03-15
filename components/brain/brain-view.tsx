"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { NeuralGraph, type NeuralGraphHandle, type SelectedEdgeInfo } from "@/components/brain/neural-graph";
import { MemoryNodeDetail } from "@/components/brain/memory-node-detail";
import { EdgePathDetail } from "@/components/brain/edge-path-detail";
import { useMemory } from "@/lib/memory-context";
import { useContainerSize } from "@/hooks/use-container-size";
import { TYPE_COLORS, TYPE_LABELS, LINK_TYPE_COLORS, LINK_TYPE_LABELS, type MemoryType } from "@/lib/types";
import { ALL_MEMORY_TYPES } from "@/lib/retrieval-settings";
import { Target, Link2, SlidersHorizontal, ChevronDown, ChevronRight, Moon, Check, Play, Pause, Plus, Minus, RotateCcw, Info } from "lucide-react";

type MemoryFilter = "all" | "inputs" | "outputs";
type CenterMode = "reinforced" | "retrieved";

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

interface BrainViewProps {
  initialEdge?: SelectedEdgeInfo | null;
}

export function BrainView({ initialEdge = null }: BrainViewProps = {}) {
  const { memories, retrievalSettings, updateRetrievalSettings, refresh } = useMemory();
  const [selectedMemoryId, setSelectedMemoryId] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(initialEdge);
  const [highlightedPath, setHighlightedPath] = useState<Set<string> | null>(null);
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>("all");
  const [enabledTypes, setEnabledTypes] = useState<MemoryType[]>([...ALL_MEMORY_TYPES]);
  const [enabledDreamSources, setEnabledDreamSources] = useState<string[]>([...DREAM_SOURCES]);
  const [selectedDream, setSelectedDream] = useState<number | null>(null); // null = all
  const [centerMode, setCenterMode] = useState<CenterMode>("reinforced");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dreamSessions, setDreamSessions] = useState<DreamSession[]>([]);
  const [timelineCutoff, setTimelineCutoff] = useState(Infinity); // Infinity = "now", no cutoff
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [statusCardCollapsed, setStatusCardCollapsed] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const neuralGraphRef = useRef<NeuralGraphHandle>(null);
  const graphSize = useContainerSize(graphContainerRef);

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
    setDetailsOpen(false);
    setSelectedEdge(edge);
    neuralGraphRef.current?.clearPinned();
  }, []);

  const toggleType = useCallback((type: MemoryType) => {
    setEnabledTypes((prev) => {
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

  const filteredMemories = memories.filter((m) => {
    if (timelineCutoff !== Infinity && new Date(m.created_at).getTime() > timelineCutoff) return false;
    if (!enabledTypes.includes(m.memory_type)) return false;
    if (!passesDreamFilter(m)) return false;
    if (memoryFilter === "inputs") return (m.tags || []).includes("user-message");
    if (memoryFilter === "outputs") return (m.tags || []).includes("assistant-response");
    return true;
  });

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
        {/* Left buttons: filter + details */}
        <div className="flex flex-row gap-1.5 pointer-events-auto">
          <button
            onClick={() => { setFiltersOpen((v) => !v); if (!filtersOpen) setDetailsOpen(false); }}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-all duration-200 glass active:scale-95"
            style={{ color: filtersOpen ? "var(--accent)" : "var(--text-faint)" }}
            title={filtersOpen ? "Hide filters" : "Show filters"}
          >
            <SlidersHorizontal className="h-3 w-3" />
          </button>
          {(selectedMemoryId || selectedEdge) && (
            <button
              onClick={() => { setDetailsOpen((v) => !v); if (!detailsOpen) setFiltersOpen(false); }}
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
              <button
                onClick={() => setStatusCardCollapsed((v) => !v)}
                className="flex items-center gap-1.5 ml-auto"
              >
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
              </button>
              {!statusCardCollapsed && (
                <div className="mt-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="font-mono" style={{ color: "var(--text-faint)" }}>memory</span>
                    <span className="font-mono" style={{ color: memActive ? "var(--accent)" : "var(--text-faint)" }}>
                      {memActive ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="font-mono" style={{ color: "var(--text-faint)" }}>model</span>
                    <span className="font-mono" style={{ color: modelActive ? "var(--accent)" : "var(--text-faint)" }}>
                      {activeModel || "none"}
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
              )}
            </div>
          );
        })()}
      </div>

      {/* Zoom buttons */}
      <div
        className="absolute z-10 flex flex-col gap-1.5 select-none"
        style={{ top: statusCardCollapsed ? "100px" : "170px", right: "16px", transition: "top 0.2s ease" }}
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
        <button
          onClick={async () => {
            setSelectedMemoryId(null);
            setSelectedEdge(null);
            setHighlightedPath(null);
            await refresh();
            neuralGraphRef.current?.resetView();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
          style={{ color: "var(--accent)", background: "transparent", border: "1px solid var(--border)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
          title="Refresh graph"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      {/* Left side panel: filters only */}
      {filtersOpen && (
        <div className="w-[200px] relative z-10 shrink-0 overflow-y-auto px-4 pb-4 pt-12 space-y-3 transition-all duration-300" style={{ borderRight: "1px solid var(--border)", marginTop: "64px", height: "calc(100% - 64px)" }}>
            <div className="space-y-1">
              {/* Mode section */}
              <FilterSection title="Mode" sectionKey="mode" collapsed={collapsed} onToggle={toggleSection}>
                {([["reinforced", "Reinforcement", Link2], ["retrieved", "Retrieval", Target]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setCenterMode(key)}
                    className="flex items-center gap-1.5 text-left transition-all duration-200"
                    style={{ opacity: centerMode === key ? 1 : 0.3 }}
                  >
                    <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: centerMode === key ? "var(--accent)" : "var(--text-faint)" }} />
                    <span className="t-tiny" style={{ color: centerMode === key ? "var(--text-muted)" : "var(--text-faint)" }}>
                      {label}
                    </span>
                  </button>
                ))}
              </FilterSection>

              {/* Signals section */}
              <FilterSection title="Signals" sectionKey="signals" collapsed={collapsed} onToggle={toggleSection}>
                {([["all", "All"], ["inputs", "External"], ["outputs", "Internal"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMemoryFilter(key)}
                    className="flex items-center gap-1.5 text-left transition-all duration-200"
                    style={{ opacity: memoryFilter === key ? 1 : 0.3 }}
                  >
                    <div
                      className="h-[6px] w-[6px] rounded-sm shrink-0"
                      style={{ backgroundColor: memoryFilter === key ? "var(--accent)" : "var(--text-faint)" }}
                    />
                    <span className="t-tiny" style={{ color: memoryFilter === key ? "var(--text-muted)" : "var(--text-faint)" }}>
                      {label}
                    </span>
                  </button>
                ))}
              </FilterSection>

              {/* Memory Types section */}
              <FilterSection title="Memory Types" sectionKey="nodes" collapsed={collapsed} onToggle={toggleSection}>
                {ALL_MEMORY_TYPES.map((type) => {
                  const active = enabledTypes.includes(type);
                  const color = TYPE_COLORS[type];
                  const count = typeCounts[type] || 0;
                  return (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      className="flex items-center gap-1.5 text-left transition-all duration-200"
                      style={{ opacity: active ? 1 : 0.3 }}
                    >
                      <div
                        className="h-[6px] w-[6px] rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="t-tiny" style={{ color: active ? "var(--text-muted)" : "var(--text-faint)" }}>
                        {TYPE_LABELS[type]} {count}
                      </span>
                    </button>
                  );
                })}
              </FilterSection>

              {/* Dream — parent section wrapping sub-sections */}
              <FilterSection title="Dream" sectionKey="dream" collapsed={collapsed} onToggle={toggleSection} icon={<Moon className="h-2 w-2" />}>
                <div className="space-y-1 pl-1">
                  {/* Dream # sub-section */}
                  <FilterSection title={selectedDream !== null ? `#${selectedDream}` : `Cycle (${dreamSessions.length})`} sectionKey="dreamCycle" collapsed={collapsed} onToggle={toggleSection}>
                    <div className="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto">
                      <button
                        onClick={() => setSelectedDream(null)}
                        className="flex items-center gap-1.5 text-left t-tiny transition-all duration-200"
                        style={{ color: selectedDream === null ? "var(--text-muted)" : "var(--text-faint)" }}
                      >
                        <Check className="h-2.5 w-2.5 shrink-0" style={{ opacity: selectedDream === null ? 1 : 0, color: "var(--accent)" }} />
                        All
                      </button>
                      {dreamSessions.map((s) => (
                        <button
                          key={s.index}
                          onClick={() => setSelectedDream(s.index === selectedDream ? null : s.index)}
                          className="flex items-center gap-1.5 text-left t-tiny transition-all duration-200"
                          style={{ color: selectedDream === s.index ? "var(--text-muted)" : "var(--text-faint)" }}
                        >
                          <Check className="h-2.5 w-2.5 shrink-0" style={{ opacity: selectedDream === s.index ? 1 : 0, color: "var(--accent)" }} />
                          #{s.index}
                        </button>
                      ))}
                    </div>
                  </FilterSection>

                  {/* Dream Source sub-section */}
                  <FilterSection title="Source" sectionKey="dreamSource" collapsed={collapsed} onToggle={toggleSection}>
                    {DREAM_SOURCES.map((src) => {
                      const active = enabledDreamSources.includes(src);
                      const color = DREAM_SOURCE_COLORS[src] || "var(--text-faint)";
                      const count = dreamSourceCounts[src] || 0;
                      return (
                        <button
                          key={src}
                          onClick={() => toggleDreamSource(src)}
                          className="flex items-center gap-1.5 text-left transition-all duration-200"
                          style={{ opacity: active ? 1 : 0.3 }}
                        >
                          <div
                            className="h-[6px] w-[6px] rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="t-tiny" style={{ color: active ? "var(--text-muted)" : "var(--text-faint)" }}>
                            {DREAM_SOURCE_LABELS[src] || src} {count}
                          </span>
                        </button>
                      );
                    })}
                  </FilterSection>

                  {/* Dream Created sub-section */}
                  <FilterSection title="Created" sectionKey="dreamCreated" collapsed={collapsed} onToggle={toggleSection}>
                    {selectedDream !== null && dreamSessions.find((s) => s.index === selectedDream) ? (
                      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
                        {new Date(dreamSessions.find((s) => s.index === selectedDream)!.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    ) : dreamSessions.length > 0 ? (
                      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
                        {new Date(dreamSessions[0].timestamp).toLocaleString(undefined, { month: "short", day: "numeric" })}
                        {" – "}
                        {new Date(dreamSessions[dreamSessions.length - 1].timestamp).toLocaleString(undefined, { month: "short", day: "numeric" })}
                        {` · ${dreamSessions.length} sessions`}
                      </span>
                    ) : (
                      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>No dream data</span>
                    )}
                  </FilterSection>
                </div>
              </FilterSection>

              {/* Edges section */}
              <FilterSection title="Edges" sectionKey="edges" collapsed={collapsed} onToggle={toggleSection}>
                {Object.entries(LINK_TYPE_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div
                      className="h-[1.5px] w-[8px] shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
                      {LINK_TYPE_LABELS[type] || type}
                    </span>
                  </div>
                ))}
              </FilterSection>
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
            />
          ) : selectedEdge ? (
            <EdgePathDetail
              sourceMemory={memories.find((m) => m.id === selectedEdge.sourceNumericId) ?? null}
              targetMemory={memories.find((m) => m.id === selectedEdge.targetNumericId) ?? null}
              linkType={selectedEdge.linkType}
              strength={selectedEdge.strength}
              onClose={() => { setSelectedEdge(null); setHighlightedPath(null); setDetailsOpen(false); }}
              onNavigateMemory={(id) => { setSelectedEdge(null); setHighlightedPath(null); setSelectedMemoryId(id); }}
              onNavigateEdge={(edge) => { setHighlightedPath(null); handleEdgeSelect(edge); setDetailsOpen(true); }}
              onPathHighlight={setHighlightedPath}
            />
          ) : null}
        </div>
      )}

      {/* Graph area */}
      <div
        ref={graphContainerRef}
        className="flex-1 min-h-0 min-w-0 transition-all duration-300"
      >
        {graphSize.width > 0 && graphSize.height > 0 && (
          <NeuralGraph
            ref={neuralGraphRef}
            onNodeSelect={handleNodeSelect}
            selectedNodeId={selectedMemoryId}
            memoryFilter={memoryFilter}
            typeFilter={enabledTypes}
            centerMode={centerMode}
            width={graphSize.width}
            height={graphSize.height}
            autoRotate={autoRotate}
            timelineCutoff={timelineCutoff}
            hideEdges={timelineDragging}
            selectedEdge={selectedEdge ? { sourceId: selectedEdge.sourceId, targetId: selectedEdge.targetId } : null}
            highlightedPath={highlightedPath}
            onEdgeSelect={handleEdgeSelect}
            onBackgroundSelect={() => {
              setSelectedMemoryId(null);
              setSelectedEdge(null);
              setHighlightedPath(null);
              setDetailsOpen(false);
              neuralGraphRef.current?.resetView();
            }}
          />
        )}
      </div>


      {/* Play/pause auto-rotation */}
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
                const panelPx = detailsOpen && (selectedMemoryId || selectedEdge) ? "280px" : filtersOpen ? "200px" : "0px";
                return { bottom: 64, left: `calc(${panelPx} + (100% - ${panelPx}) / 2)`, transform: "translateX(-50%)" };
              })(),
        }}
        title={autoRotate ? "Pause rotation" : "Resume rotation"}
      >
        {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>

      {/* Timeline bar — bottom */}
      {timeRange.min < timeRange.max && (
        <div className="absolute bottom-0 right-0 z-10 px-6 pb-4 pt-6" style={{ left: detailsOpen && (selectedMemoryId || selectedEdge) ? "280px" : filtersOpen ? "200px" : "0px", background: "linear-gradient(transparent, var(--bg))", transition: "left 0.3s" }}>
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
