"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Search, Send, MessageSquare, Bot, User } from "lucide-react";
import { useMemory, type MemoryLink } from "@/lib/memory-context";
import {
  TYPE_COLORS,
  TYPE_LABELS,
  LINK_TYPE_COLORS,
  LINK_TYPE_LABELS,
  type Memory,
  type Entity,
} from "@/lib/types";

interface TraceData {
  ancestors: Array<{ id: number; summary?: string; depth: number; memory_type?: string }>;
  descendants: Array<{ id: number; summary?: string; depth: number; memory_type?: string }>;
  related: Array<{ id: number; summary?: string; score?: number; memory_type?: string }>;
  linkTypes: string[];
  entities: Array<{ name: string; entity_type: string }>;
  timeSpan: { earliest: string; latest: string } | null;
}

export function MemoryNodeDetail({
  memory,
  onClose,
  onNavigate,
  traceData: externalTraceData,
}: {
  memory: Memory;
  onClose: () => void;
  onNavigate?: (memoryId: number) => void;
  traceData?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { memories, fetchMemoryLinks } = useMemory();

  const [links, setLinks] = useState<MemoryLink[]>([]);
  const [relatedMemories, setRelatedMemories] = useState<Array<{ memory: Memory; score: number }>>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [loadingEntities, setLoadingEntities] = useState(true);

  // Trace state — use external data from brain-view when available
  const [internalTraceData, setInternalTraceData] = useState<TraceData | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  // Prefer external trace data (already fetched by brain-view for path controls)
  const traceData = externalTraceData ?? internalTraceData;

  // Auto-fetch trace data when no external data is provided
  useEffect(() => {
    if (externalTraceData) return; // brain-view provides it
    if (internalTraceData) return; // already fetched
    let cancelled = false;
    setTraceLoading(true);
    setTraceError(null);
    fetch(`/api/trace?memoryId=${memory.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setTraceError(data.error);
          else setInternalTraceData(data);
        }
      })
      .catch((err) => { if (!cancelled) setTraceError(String(err)); })
      .finally(() => { if (!cancelled) setTraceLoading(false); });
    return () => { cancelled = true; };
  }, [memory.id, externalTraceData, internalTraceData]);

  // Conversation pair state
  const [convPair, setConvPair] = useState<Memory[]>([]);
  const [loadingConvPair, setLoadingConvPair] = useState(false);

  // Explain state
  const [explainQuestion, setExplainQuestion] = useState("");
  const [explainAnswer, setExplainAnswer] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const submitExplain = async () => {
    if (!explainQuestion.trim()) return;
    setExplainLoading(true);
    setExplainAnswer(null);
    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId: memory.id, question: explainQuestion }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExplainAnswer(data.error || "Failed to get explanation");
      } else {
        setExplainAnswer(data.explanation || data.answer || JSON.stringify(data));
      }
    } catch (err) {
      setExplainAnswer(String(err));
    } finally {
      setExplainLoading(false);
    }
  };

  // Fetch Cortex links for this memory
  useEffect(() => {
    let cancelled = false;
    setLoadingLinks(true);
    fetchMemoryLinks(memory.id).then((data) => {
      if (!cancelled) {
        setLinks(data);
        setLoadingLinks(false);
      }
    });
    return () => { cancelled = true; };
  }, [memory.id, fetchMemoryLinks]);

  // Fetch retrieval-related memories from Cortex
  useEffect(() => {
    let cancelled = false;
    setLoadingRelated(true);
    const query = encodeURIComponent(memory.summary || memory.content?.slice(0, 100) || "");
    fetch(`/api/memories?q=${query}&limit=8`)
      .then((r) => r.json())
      .then((data: any[]) => {
        if (!cancelled) {
          const scored = (Array.isArray(data) ? data : [])
            .filter((m: any) => m.id !== memory.id)
            .map((m: any) => ({ memory: m as Memory, score: m.score ?? m.importance ?? 0 }));
          setRelatedMemories(scored);
          setLoadingRelated(false);
        }
      })
      .catch(() => {
        if (!cancelled) { setRelatedMemories([]); setLoadingRelated(false); }
      });
    return () => { cancelled = true; };
  }, [memory.id, memory.summary, memory.content]);

  // Fetch entities for this memory
  useEffect(() => {
    let cancelled = false;
    setLoadingEntities(true);
    fetch(`/api/entities?memoryId=${memory.id}`)
      .then((r) => r.json())
      .then((data: any) => {
        if (!cancelled) {
          setEntities(Array.isArray(data) ? data : []);
          setLoadingEntities(false);
        }
      })
      .catch(() => {
        if (!cancelled) { setEntities([]); setLoadingEntities(false); }
      });
    return () => { cancelled = true; };
  }, [memory.id]);

  // Fetch conversation pair (user-message ↔ assistant-response sharing the same conv:* tag)
  useEffect(() => {
    let cancelled = false;
    const convTag = memory.tags?.find((t) => t.startsWith("conv:"));
    if (!convTag) {
      setConvPair([]);
      return;
    }
    setLoadingConvPair(true);
    fetch(`/api/memories?tag=${encodeURIComponent(convTag)}&limit=20`)
      .then((r) => r.json())
      .then((data: any[]) => {
        if (!cancelled) {
          const others = (Array.isArray(data) ? data : []).filter((m: any) => m.id !== memory.id);
          setConvPair(others as Memory[]);
          setLoadingConvPair(false);
        }
      })
      .catch(() => {
        if (!cancelled) { setConvPair([]); setLoadingConvPair(false); }
      });
    return () => { cancelled = true; };
  }, [memory.id, memory.tags]);

  // Resolve linked memories from the local memories array
  const linkedMemories = links
    .map((link) => {
      const otherId = link.source_id === memory.id ? link.target_id : link.source_id;
      const m = memories.find((mem) => mem.id === otherId);
      return m ? { memory: m, link } : null;
    })
    .filter(Boolean) as Array<{ memory: Memory; link: MemoryLink }>;

  const totalLinkStrength = links.reduce((s, l) => s + l.strength, 0);
  const maxRelatedScore = relatedMemories[0]?.score || 1;

  // Hebbian stats
  const hebbianGrowth = Math.min(
    (memory.access_count || 0) * 0.01,
    1 - memory.importance
  );
  const effectiveImportance = Math.min(1, memory.importance + hebbianGrowth);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex-1 pr-2">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[memory.memory_type] }}
            />
            <span
              className="t-label"
              style={{ color: TYPE_COLORS[memory.memory_type] }}
            >
              {TYPE_LABELS[memory.memory_type]}
            </span>
            <span className="t-small" style={{ color: "var(--text-faint)" }}>#{memory.id}</span>
          </div>
          <p className="mt-1.5 t-small" style={{ color: "var(--text)" }}>{memory.summary}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-[4px] p-1 transition"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pt-3">
        {/* Cortex Score Breakdown */}
        <div>
          <h4 className="t-label text-cyan-500">
            Cortex Score Breakdown
          </h4>
          <div className="mt-2 space-y-1.5">
            <ScoreRow
              label="Importance"
              value={memory.importance}
              color="#f59e0b"
              detail={`${Math.round(memory.importance * 100)}%`}
            />
            <ScoreRow
              label="Decay Factor"
              value={memory.decay_factor ?? 1}
              color="#22c55e"
              detail={`${Math.round((memory.decay_factor ?? 1) * 100)}%`}
            />
            <ScoreRow
              label="Access Count"
              value={Math.min((memory.access_count || 0) / 50, 1)}
              color="#06b6d4"
              detail={`${memory.access_count || 0} recalls`}
            />
            <ScoreRow
              label="Valence"
              value={Math.abs(memory.emotional_valence || 0)}
              color={
                (memory.emotional_valence || 0) >= 0 ? "#3b82f6" : "#ef4444"
              }
              detail={`${(memory.emotional_valence || 0) > 0 ? "+" : ""}${(memory.emotional_valence || 0).toFixed(2)}`}
            />
            <ScoreRow
              label="Links"
              value={Math.min(links.length / 10, 1)}
              color="#f97316"
              detail={`${links.length} link${links.length !== 1 ? "s" : ""}`}
            />
          </div>
          <div className="mt-2 rounded-[4px] px-2.5 py-1.5 t-small" style={{ background: "var(--surface-dimmer)" }}>
            <span style={{ color: "var(--text-faint)" }}>Effective importance: </span>
            <span className="font-mono" style={{ color: "var(--text)" }}>
              {effectiveImportance.toFixed(3)}
            </span>
            <span style={{ color: "var(--text-faint)" }}> (base {memory.importance.toFixed(3)} + {(hebbianGrowth).toFixed(3)} hebbian)</span>
          </div>
        </div>

        {/* Chat Pair (Input ↔ Output) */}
        {(loadingConvPair || convPair.length > 0) && (
          <div>
            <h4 className="flex items-center gap-1.5 t-label text-violet-500">
              <MessageSquare className="h-3 w-3" />
              Chat Pair
            </h4>
            {loadingConvPair ? (
              <div className="mt-2 flex items-center gap-1.5 t-small" style={{ color: "var(--text-faint)" }}>
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading chat pair...
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {/* Current memory */}
                <div
                  className="rounded-[4px] px-2.5 py-2"
                  style={{ background: "var(--surface-dimmer)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {memory.tags?.includes("user-message") ? (
                      <User className="h-3 w-3 text-blue-400" />
                    ) : (
                      <Bot className="h-3 w-3 text-emerald-400" />
                    )}
                    <span className="t-label" style={{
                      color: memory.tags?.includes("user-message") ? "#60a5fa" : "#34d399"
                    }}>
                      {memory.tags?.includes("user-message") ? "You" : "Assistant"}
                    </span>
                    <span className="t-micro font-mono" style={{ color: "var(--text-faint)" }}>#{memory.id}</span>
                  </div>
                  <p className="t-small leading-relaxed" style={{ color: "var(--text)" }}>
                    {memory.content?.slice(0, 200)}{(memory.content?.length ?? 0) > 200 ? "..." : ""}
                  </p>
                </div>

                {/* Partner memories */}
                {convPair.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-[4px] px-2.5 py-2 cursor-pointer transition-all duration-150 hover:scale-[1.01]"
                    style={{ background: "var(--surface-dimmer)" }}
                    onClick={() => onNavigate?.(m.id)}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {m.tags?.includes("user-message") ? (
                        <User className="h-3 w-3 text-blue-400" />
                      ) : (
                        <Bot className="h-3 w-3 text-emerald-400" />
                      )}
                      <span className="t-label" style={{
                        color: m.tags?.includes("user-message") ? "#60a5fa" : "#34d399"
                      }}>
                        {m.tags?.includes("user-message") ? "You" : "Assistant"}
                      </span>
                      <span className="t-micro font-mono" style={{ color: "var(--text-faint)" }}>#{m.id}</span>
                    </div>
                    <p className="t-small leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {m.content?.slice(0, 200)}{(m.content?.length ?? 0) > 200 ? "..." : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hebbian Reinforcement */}
        <div>
          <h4 className="t-label text-purple-500">
            Hebbian Reinforcement
          </h4>

          {/* Core stats row */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
              <p className="t-stat text-amber-500">
                {memory.access_count || 0}
              </p>
              <p className="t-tiny" style={{ color: "var(--text-muted)" }}>recalls</p>
            </div>
            <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
              <p className="t-stat text-green-500">
                +{(hebbianGrowth * 100).toFixed(1)}%
              </p>
              <p className="t-tiny" style={{ color: "var(--text-muted)" }}>imp growth</p>
            </div>
            <div className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
              <p className="t-stat text-purple-500">
                {links.length}
              </p>
              <p className="t-tiny" style={{ color: "var(--text-muted)" }}>links</p>
            </div>
          </div>

          {/* Effective importance bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between t-small">
              <span style={{ color: "var(--text-muted)" }}>Effective importance</span>
              <span className="font-mono" style={{ color: "var(--text)" }}>
                {Math.round(effectiveImportance * 100)}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
              <div className="relative h-full">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-500/40"
                  style={{ width: `${effectiveImportance * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
                  style={{ width: `${memory.importance * 100}%` }}
                />
              </div>
            </div>
            <div className="mt-0.5 flex justify-between t-tiny" style={{ color: "var(--text-faint)" }}>
              <span>base: {Math.round(memory.importance * 100)}%</span>
              <span>+{(hebbianGrowth * 100).toFixed(1)}% from {memory.access_count || 0} recalls (&times;0.01)</span>
            </div>
          </div>

          {/* Reinforcement rules */}
          <div className="mt-3 rounded-[4px] p-2 t-small space-y-1" style={{ background: "var(--surface-dim)" }}>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Importance increment</span>
              <span className="font-mono text-amber-500">
                {memory.access_count || 0} &times; 0.01 = +{((memory.access_count || 0) * 0.01).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Capped at</span>
              <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                1.0 (current: {memory.importance.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Decay factor</span>
              <span className="font-mono text-green-500">
                {(memory.decay_factor ?? 1).toFixed(3)}
              </span>
            </div>
          </div>

          {/* Cortex Association Links */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p className="t-label text-orange-500">
                Cortex Links ({links.length})
              </p>
              {links.length > 0 && (
                <span className="font-mono t-tiny" style={{ color: "var(--text-faint)" }}>
                  total str: {totalLinkStrength.toFixed(1)}
                </span>
              )}
            </div>
            {loadingLinks ? (
              <p className="mt-2 t-small" style={{ color: "var(--text-faint)" }}>Loading links...</p>
            ) : linkedMemories.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {linkedMemories
                  .sort((a, b) => b.link.strength - a.link.strength)
                  .slice(0, 8)
                  .map(({ memory: cm, link }) => {
                    const maxStrength = Math.max(...links.map((l) => l.strength), 1);
                    const linkColor = LINK_TYPE_COLORS[link.link_type] || "#6b7280";
                    const linkLabel = LINK_TYPE_LABELS[link.link_type] || link.link_type;
                    return (
                      <div
                        key={cm.id}
                        className="rounded-[4px] px-2.5 py-2 transition-all duration-150 cursor-pointer hover:scale-[1.01]"
                        style={{ background: "var(--surface-dimmer)" }}
                        onClick={() => onNavigate?.(cm.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: TYPE_COLORS[cm.memory_type] }}
                          />
                          <span className="flex-1 truncate t-small" style={{ color: "var(--text)" }}>
                            #{cm.id} {cm.summary?.slice(0, 40)}
                          </span>
                        </div>
                        {/* Link type + strength bar */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className="w-16 t-tiny"
                            style={{ color: linkColor }}
                          >
                            {linkLabel}
                          </span>
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
                            <div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{
                                width: `${(link.strength / maxStrength) * 100}%`,
                                backgroundColor: linkColor,
                                opacity: 0.7,
                              }}
                            />
                          </div>
                          <span
                            className="w-6 text-right font-mono t-tiny"
                            style={{ color: linkColor }}
                          >
                            {link.strength.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                {linkedMemories.length > 8 && (
                  <p className="t-tiny" style={{ color: "var(--text-faint)" }}>
                    +{linkedMemories.length - 8} more connections
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 t-small" style={{ color: "var(--text-faint)" }}>
                No Cortex links yet &mdash; links form via co-retrieval, shared concepts, or vector similarity
              </p>
            )}
          </div>

          {/* Retrieval-linked memories from Cortex search */}
          {!loadingRelated && relatedMemories.length > 0 && (
            <div className="mt-3">
              <p className="t-label" style={{ color: "var(--accent)" }}>
                Retrieval-Linked ({relatedMemories.length})
              </p>
              <div className="mt-2 space-y-1.5">
                {relatedMemories.map(({ memory: m, score }) => (
                  <div
                    key={m.id}
                    className="rounded-[4px] px-2.5 py-2 transition-all duration-150 cursor-pointer hover:scale-[1.01]"
                    style={{ background: "var(--surface-dimmer)" }}
                    onClick={() => onNavigate?.(m.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[m.memory_type] }}
                      />
                      <span className="flex-1 truncate t-small" style={{ color: "var(--text)" }}>
                        #{m.id} {m.summary?.slice(0, 40)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="w-8 t-tiny" style={{ color: "var(--text-faint)" }}>score</span>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${(score / maxRelatedScore) * 100}%`,
                            background: "var(--accent)",
                            opacity: 0.6,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono t-tiny" style={{ color: "var(--accent)" }}>
                        {score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {loadingRelated && (
            <p className="mt-3 t-small" style={{ color: "var(--text-faint)" }}>Loading related memories...</p>
          )}
        </div>

        {/* Entities */}
        {!loadingEntities && entities.length > 0 && (
          <div>
            <h4 className="t-label text-teal-500">
              Entities ({entities.length})
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entities.map((entity) => (
                <div
                  key={entity.id}
                  className="rounded-[4px] px-2 py-1 t-small"
                  style={{ background: "var(--surface-dimmer)" }}
                >
                  <span style={{ color: "var(--text)" }}>{entity.name}</span>
                  <span className="ml-1.5 t-micro uppercase" style={{ color: "var(--text-faint)" }}>
                    {entity.entity_type}
                  </span>
                  {entity.mention_count > 1 && (
                    <span className="ml-1 font-mono t-micro text-teal-500">
                      &times;{entity.mention_count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw Memory Data */}
        <div>
          <h4 className="t-label" style={{ color: "var(--text-muted)" }}>
            Memory Data
          </h4>
          <div className="mt-2 space-y-1 t-small">
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Content</span>
            </div>
            <p className="rounded-[4px] p-2 t-small leading-relaxed" style={{ background: "var(--surface-dim)", color: "var(--text-muted)" }}>
              {memory.content}
            </p>
            {memory.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {memory.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-[3px] px-1.5 py-0.5 t-tiny"
                    style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {(memory.concepts?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {memory.concepts.map((c) => (
                  <span
                    key={c}
                    className="rounded-[3px] px-1.5 py-0.5 t-tiny"
                    style={{ background: "rgba(147, 51, 234, 0.1)", color: "rgb(147, 51, 234)" }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>valence</span>
                <span style={{ color: "var(--text)" }}>
                  {(memory.emotional_valence || 0) > 0 ? "+" : ""}
                  {(memory.emotional_valence || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>source</span>
                <span style={{ color: "var(--text)" }}>{memory.source}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>created</span>
                <span style={{ color: "var(--text)" }}>
                  {new Date(memory.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-faint)" }}>accessed</span>
                <span style={{ color: "var(--text)" }}>
                  {new Date(memory.last_accessed).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Trace / Provenance — always visible, auto-loads */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
          <h4 className="flex items-center gap-1.5 t-label text-cyan-500">
            <Search className="h-3 w-3" />
            Memory Trace / Provenance
          </h4>

          {traceLoading && (
            <div className="mt-2 flex items-center gap-1.5 t-small" style={{ color: "var(--text-faint)" }}>
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading trace data...
            </div>
          )}

          {traceError && (
            <p className="mt-2 t-small text-red-500">{traceError}</p>
          )}

          {traceData && (
            <div className="mt-3 space-y-3">
              {/* Time span */}
              {traceData.timeSpan && (
                <div className="rounded-[4px] px-2.5 py-1.5 t-small" style={{ background: "var(--surface-dimmer)" }}>
                  <span style={{ color: "var(--text-faint)" }}>Time span: </span>
                  <span className="font-mono" style={{ color: "var(--text)" }}>
                    {new Date(traceData.timeSpan.earliest).toLocaleDateString()} &mdash; {new Date(traceData.timeSpan.latest).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Link types */}
              {traceData.linkTypes?.length > 0 && (
                <div>
                  <p className="t-label" style={{ color: "var(--text-muted)" }}>
                    Link Types
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {traceData.linkTypes?.map((lt: string) => (
                      <span
                        key={lt}
                        className="rounded-[3px] px-1.5 py-0.5 t-tiny"
                        style={{
                          background: `${LINK_TYPE_COLORS[lt] || "#6b7280"}20`,
                          color: LINK_TYPE_COLORS[lt] || "#6b7280",
                        }}
                      >
                        {LINK_TYPE_LABELS[lt] || lt}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ancestors */}
              {(traceData.ancestors?.length ?? 0) > 0 && (
                <div>
                  <p className="t-label text-amber-500">
                    Ancestors ({(traceData.ancestors?.length ?? 0)})
                  </p>
                  <div className="mt-1 space-y-1">
                    {traceData.ancestors?.map((a: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-[4px] px-2.5 py-1.5 cursor-pointer hover:scale-[1.01] transition-all duration-150"
                        style={{ background: "var(--surface-dimmer)", paddingLeft: `${0.625 + a.depth * 0.5}rem` }}
                        onClick={() => onNavigate?.(a.id)}
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: a.memory_type ? TYPE_COLORS[a.memory_type as keyof typeof TYPE_COLORS] : "var(--text-faint)" }}
                        />
                        <span className="flex-1 truncate t-small" style={{ color: "var(--text)" }}>
                          #{a.id} {a.summary?.slice(0, 50)}
                        </span>
                        <span className="t-micro font-mono" style={{ color: "var(--text-faint)" }}>
                          depth {a.depth}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Descendants */}
              {(traceData.descendants?.length ?? 0) > 0 && (
                <div>
                  <p className="t-label text-green-500">
                    Descendants ({(traceData.descendants?.length ?? 0)})
                  </p>
                  <div className="mt-1 space-y-1">
                    {traceData.descendants?.map((d: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <div
                        key={d.id}
                        className="flex items-center gap-2 rounded-[4px] px-2.5 py-1.5 cursor-pointer hover:scale-[1.01] transition-all duration-150"
                        style={{ background: "var(--surface-dimmer)", paddingLeft: `${0.625 + d.depth * 0.5}rem` }}
                        onClick={() => onNavigate?.(d.id)}
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: d.memory_type ? TYPE_COLORS[d.memory_type as keyof typeof TYPE_COLORS] : "var(--text-faint)" }}
                        />
                        <span className="flex-1 truncate t-small" style={{ color: "var(--text)" }}>
                          #{d.id} {d.summary?.slice(0, 50)}
                        </span>
                        <span className="t-micro font-mono" style={{ color: "var(--text-faint)" }}>
                          depth {d.depth}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related memories */}
              {(traceData.related?.length ?? 0) > 0 && (
                <div>
                  <p className="t-label" style={{ color: "var(--accent)" }}>
                    Related ({(traceData.related?.length ?? 0)})
                  </p>
                  <div className="mt-1 space-y-1">
                    {traceData.related?.map((r: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <div
                        key={r.id}
                        className="flex items-center gap-2 rounded-[4px] px-2.5 py-1.5 cursor-pointer hover:scale-[1.01] transition-all duration-150"
                        style={{ background: "var(--surface-dimmer)" }}
                        onClick={() => onNavigate?.(r.id)}
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: r.memory_type ? TYPE_COLORS[r.memory_type as keyof typeof TYPE_COLORS] : "var(--text-faint)" }}
                        />
                        <span className="flex-1 truncate t-small" style={{ color: "var(--text)" }}>
                          #{r.id} {r.summary?.slice(0, 50)}
                        </span>
                        {r.score != null && (
                          <span className="font-mono t-tiny" style={{ color: "var(--accent)" }}>
                            {r.score.toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entities from trace */}
              {(traceData.entities?.length ?? 0) > 0 && (
                <div>
                  <p className="t-label text-teal-500">
                    Traced Entities ({(traceData.entities?.length ?? 0)})
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {traceData.entities?.map((e: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <span
                        key={`${e.name}-${i}`}
                        className="rounded-[3px] px-1.5 py-0.5 t-tiny"
                        style={{ background: "var(--surface-dimmer)", color: "var(--text)" }}
                      >
                        {e.name}
                        <span className="ml-1 t-micro uppercase" style={{ color: "var(--text-faint)" }}>
                          {e.entity_type}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty trace */}
              {(traceData.ancestors?.length ?? 0) === 0 &&
                (traceData.descendants?.length ?? 0) === 0 &&
                (traceData.related?.length ?? 0) === 0 && (
                  <p className="t-small" style={{ color: "var(--text-faint)" }}>
                    No provenance trace found for this memory.
                  </p>
                )}

              {/* Explain input */}
              <div>
                <p className="t-label text-purple-500 mb-1.5">
                  Ask about this memory
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={explainQuestion}
                    onChange={(e) => setExplainQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitExplain(); }}
                    placeholder="Why did you think this?"
                    className="flex-1 rounded-[4px] px-2.5 py-1.5 t-small outline-none"
                    style={{
                      background: "var(--surface-dimmer)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  />
                  <button
                    onClick={submitExplain}
                    disabled={explainLoading || !explainQuestion.trim()}
                    className="rounded-[4px] px-2 py-1.5 transition active:scale-95 disabled:opacity-40"
                    style={{ background: "var(--surface-dimmer)", color: "var(--text)" }}
                  >
                    {explainLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                  </button>
                </div>
                {explainAnswer && (
                  <div
                    className="mt-2 rounded-[4px] p-2.5 t-small leading-relaxed whitespace-pre-wrap"
                    style={{ background: "var(--surface-dim)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                  >
                    {explainAnswer}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  color,
  detail,
}: {
  label: string;
  value: number;
  color: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 t-small" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(value, 1) * 100}%`,
            backgroundColor: color,
            opacity: 0.7,
          }}
        />
      </div>
      <span className="w-12 text-right font-mono t-tiny" style={{ color }}>
        {value.toFixed(3)}
      </span>
      <span className="w-16 text-right t-tiny" style={{ color: "var(--text-faint)" }}>
        {detail}
      </span>
    </div>
  );
}
