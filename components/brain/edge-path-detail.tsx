"use client";

import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useMemory, type MemoryLink } from "@/lib/memory-context";
import {
  TYPE_COLORS,
  TYPE_LABELS,
  LINK_TYPE_COLORS,
  LINK_TYPE_LABELS,
  type Memory,
} from "@/lib/types";

interface SelectedEdgeInfo {
  sourceId: string;
  targetId: string;
  sourceNumericId: number;
  targetNumericId: number;
  linkType: string;
  strength: number;
}

interface EdgePathDetailProps {
  sourceMemory: Memory | null;
  targetMemory: Memory | null;
  linkType: string;
  strength: number;
  onClose: () => void;
  onNavigateMemory: (memoryId: number) => void;
  onNavigateEdge?: (edge: SelectedEdgeInfo) => void;
  /** Trace data passed from parent for path info display */
  traceData?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function EdgePathDetail({
  sourceMemory,
  targetMemory,
  linkType,
  strength,
  onClose,
  onNavigateMemory,
  onNavigateEdge,
  traceData,
}: EdgePathDetailProps) {
  const { memories, fetchMemoryLinks } = useMemory();

  const [sourceLinks, setSourceLinks] = useState<MemoryLink[]>([]);
  const [targetLinks, setTargetLinks] = useState<MemoryLink[]>([]);
  const [loadingSourceLinks, setLoadingSourceLinks] = useState(true);
  const [loadingTargetLinks, setLoadingTargetLinks] = useState(true);

  const linkColor = LINK_TYPE_COLORS[linkType] || "#6b7280";
  const linkLabel = LINK_TYPE_LABELS[linkType] || linkType;

  // Fetch link data
  useEffect(() => {
    if (!sourceMemory || !targetMemory) {
      setLoadingSourceLinks(false); setLoadingTargetLinks(false);
      return;
    }
    let cancelled = false;
    setLoadingSourceLinks(true); setLoadingTargetLinks(true);

    Promise.all([
      fetchMemoryLinks(sourceMemory.id).catch(() => [] as MemoryLink[]),
      fetchMemoryLinks(targetMemory.id).catch(() => [] as MemoryLink[]),
    ]).then(([srcLinks, tgtLinks]) => {
      if (cancelled) return;
      setSourceLinks(srcLinks); setLoadingSourceLinks(false);
      setTargetLinks(tgtLinks); setLoadingTargetLinks(false);
    });

    return () => { cancelled = true; };
  }, [sourceMemory?.id, targetMemory?.id, fetchMemoryLinks]);

  // Shared concepts between source and target
  const sharedConcepts = useMemo(() => {
    if (!sourceMemory?.concepts || !targetMemory?.concepts) return [];
    const srcSet = new Set(sourceMemory.concepts);
    return targetMemory.concepts.filter((c) => srcSet.has(c));
  }, [sourceMemory?.concepts, targetMemory?.concepts]);

  // Resolve linked memories for a set of links
  const resolveLinks = (links: MemoryLink[], memoryId: number) =>
    links
      .map((link) => {
        const otherId = link.source_id === memoryId ? link.target_id : link.source_id;
        const m = memories.find((mem) => mem.id === otherId);
        return m ? { memory: m, link } : null;
      })
      .filter(Boolean) as Array<{ memory: Memory; link: MemoryLink }>;

  const sourceLinkedMemories = sourceMemory ? resolveLinks(sourceLinks, sourceMemory.id) : [];
  const targetLinkedMemories = targetMemory ? resolveLinks(targetLinks, targetMemory.id) : [];

  // Check if target is in trace path (informational only)
  const pathInfo = useMemo(() => {
    if (!traceData || !targetMemory) return null;
    const inAncestors = traceData.ancestors?.find((a: any) => a.id === targetMemory.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    const inDescendants = traceData.descendants?.find((d: any) => d.id === targetMemory.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    const inRelated = traceData.related?.find((r: any) => r.id === targetMemory.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (inAncestors) return { direction: "ancestor", depth: inAncestors.depth };
    if (inDescendants) return { direction: "descendant", depth: inDescendants.depth };
    if (inRelated) return { direction: "related", score: inRelated.score };
    return null;
  }, [traceData, targetMemory]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex-1 pr-2">
          <div className="flex items-center gap-2">
            <div
              className="h-1 w-3 rounded-sm"
              style={{ backgroundColor: linkColor }}
            />
            <span
              className="t-label"
              style={{ color: linkColor }}
            >
              {linkLabel}
            </span>
          </div>
          <p className="mt-1.5" style={{ color: "var(--text-muted)" }}>
            Edge between {sourceMemory?.memory_type?.replace("_", " ") || "?"} and {targetMemory?.memory_type?.replace("_", " ") || "?"}
          </p>
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
        {/* Edge Stats */}
        <div>
          <h4 className="t-label" style={{ color: linkColor }}>
            Edge Stats
          </h4>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-20 t-small" style={{ color: "var(--text-muted)" }}>Strength</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.min(strength, 1) * 100}%`, backgroundColor: linkColor, opacity: 0.7 }}
                />
              </div>
              <span className="t-small font-mono w-10 text-right" style={{ color: "var(--text)" }}>
                {Math.round(strength * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 t-small" style={{ color: "var(--text-muted)" }}>Type</span>
              <span className="t-small font-mono" style={{ color: linkColor }}>{linkLabel}</span>
            </div>
          </div>
        </div>

        {/* Source Memory */}
        {sourceMemory && (
          <MemoryCard
            label="Source"
            memory={sourceMemory}
            onNavigate={onNavigateMemory}
          />
        )}

        {/* Target Memory */}
        {targetMemory && (
          <MemoryCard
            label="Target"
            memory={targetMemory}
            onNavigate={onNavigateMemory}
          />
        )}

        {/* Shared Concepts */}
        {sharedConcepts.length > 0 && (
          <div>
            <h4 className="t-label text-amber-500">
              Shared Concepts
            </h4>
            <div className="mt-2 flex flex-wrap gap-1">
              {sharedConcepts.map((c) => (
                <span
                  key={c}
                  className="rounded-full px-2 py-0.5 t-tiny"
                  style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Path Info (controls on floating card) */}
        {pathInfo && (
          <div>
            <h4 className="t-label text-violet-500">
              Path
            </h4>
            <div className="mt-2 rounded-[4px] px-2.5 py-1.5 t-small" style={{ background: "var(--surface-dimmer)" }}>
              <span style={{ color: "var(--text-faint)" }}>Target is </span>
              <span className="font-mono" style={{ color: "var(--text)" }}>
                {pathInfo.direction === "ancestor"
                  ? `${pathInfo.depth} hop${pathInfo.depth !== 1 ? "s" : ""} upstream`
                  : pathInfo.direction === "descendant"
                  ? `${pathInfo.depth} hop${pathInfo.depth !== 1 ? "s" : ""} downstream`
                  : `related (score ${(pathInfo.score ?? 0).toFixed(2)})`}
              </span>
            </div>
          </div>
        )}

        {/* Source Links */}
        <LinksSection
          title="Source Links"
          loading={loadingSourceLinks}
          linkedMemories={sourceLinkedMemories}
          onNavigate={onNavigateMemory}
          color="#06b6d4"
        />

        {/* Target Links */}
        <LinksSection
          title="Target Links"
          loading={loadingTargetLinks}
          linkedMemories={targetLinkedMemories}
          onNavigate={onNavigateMemory}
          color="#f97316"
        />
      </div>
    </div>
  );
}

function MemoryCard({
  label,
  memory,
  onNavigate,
}: {
  label: string;
  memory: Memory;
  onNavigate: (id: number) => void;
}) {
  return (
    <div>
      <h4 className="t-label" style={{ color: "var(--text-faint)" }}>
        {label}
      </h4>
      <button
        onClick={() => onNavigate(memory.id)}
        className="mt-1.5 w-full rounded-[4px] px-2.5 py-2 text-left transition hover:brightness-95"
        style={{ background: "var(--surface-dimmer)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: TYPE_COLORS[memory.memory_type] }}
          />
          <span className="t-label" style={{ color: TYPE_COLORS[memory.memory_type] }}>
            {TYPE_LABELS[memory.memory_type]}
          </span>
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>#{memory.id}</span>
        </div>
        <p className="t-small leading-relaxed" style={{ color: "var(--text)" }}>
          {memory.summary}
        </p>
        <div className="mt-1.5 flex gap-3 t-tiny" style={{ color: "var(--text-faint)" }}>
          <span>importance {Math.round(memory.importance * 100)}%</span>
          <span>recalls {memory.access_count || 0}</span>
        </div>
      </button>
    </div>
  );
}

function LinksSection({
  title,
  loading,
  linkedMemories,
  onNavigate,
  color,
}: {
  title: string;
  loading: boolean;
  linkedMemories: Array<{ memory: Memory; link: MemoryLink }>;
  onNavigate: (id: number) => void;
  color: string;
}) {
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-2.5 w-20 rounded" style={{ background: "var(--surface-dimmer)" }} />
        <div className="mt-2 space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded-[4px] px-2 py-1.5" style={{ background: "var(--surface-dimmer)" }}>
              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--border)" }} />
              <div className="flex-1 h-2 rounded" style={{ background: "var(--border)" }} />
              <div className="h-1 w-4 rounded-full" style={{ background: "var(--border)" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (linkedMemories.length === 0) return null;

  const sorted = [...linkedMemories].sort((a, b) => b.link.strength - a.link.strength).slice(0, 8);

  return (
    <div>
      <h4 className="t-label" style={{ color }}>
        {title} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({linkedMemories.length})</span>
      </h4>
      <div className="mt-2 space-y-1">
        {sorted.map(({ memory: m, link }) => {
          const ltColor = LINK_TYPE_COLORS[link.link_type] || "#6b7280";
          return (
            <button
              key={`${link.source_id}-${link.target_id}`}
              onClick={() => onNavigate(m.id)}
              className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left transition hover:brightness-95"
              style={{ background: "var(--surface-dimmer)" }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_COLORS[m.memory_type] }}
              />
              <span className="flex-1 t-tiny truncate" style={{ color: "var(--text-muted)" }}>
                {m.summary}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <div className="h-1 w-4 rounded-full overflow-hidden" style={{ background: "var(--bar-track)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(link.strength, 1) * 100}%`, backgroundColor: ltColor }} />
                </div>
                <span className="t-micro font-mono" style={{ color: "var(--text-faint)" }}>
                  {Math.round(link.strength * 100)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
