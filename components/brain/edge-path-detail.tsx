"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  onPathHighlight?: (nodeIds: Set<string> | null) => void;
}

export function EdgePathDetail({
  sourceMemory,
  targetMemory,
  linkType,
  strength,
  onClose,
  onNavigateMemory,
  onNavigateEdge,
  onPathHighlight,
}: EdgePathDetailProps) {
  const { memories, fetchMemoryLinks } = useMemory();

  const [sourceLinks, setSourceLinks] = useState<MemoryLink[]>([]);
  const [targetLinks, setTargetLinks] = useState<MemoryLink[]>([]);
  const [loadingSourceLinks, setLoadingSourceLinks] = useState(true);
  const [loadingTargetLinks, setLoadingTargetLinks] = useState(true);
  const [traceData, setTraceData] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loadingTrace, setLoadingTrace] = useState(true);
  const [pathDepth, setPathDepth] = useState(0);
  const [pathDirection, setPathDirection] = useState<"both" | "upstream" | "downstream">("both");
  const [pathMinStrength, setPathMinStrength] = useState(0);

  // Derive actual max depth from trace data
  const traceMaxDepth = traceData?.stats?.max_depth ?? 1;

  const linkColor = LINK_TYPE_COLORS[linkType] || "#6b7280";
  const linkLabel = LINK_TYPE_LABELS[linkType] || linkType;

  // Fetch all edge data in parallel — links + trace
  useEffect(() => {
    if (!sourceMemory || !targetMemory) {
      setLoadingSourceLinks(false); setLoadingTargetLinks(false); setLoadingTrace(false);
      return;
    }
    let cancelled = false;
    setLoadingSourceLinks(true); setLoadingTargetLinks(true); setLoadingTrace(true);
    setPathDepth(0);

    Promise.all([
      fetchMemoryLinks(sourceMemory.id).catch(() => [] as MemoryLink[]),
      fetchMemoryLinks(targetMemory.id).catch(() => [] as MemoryLink[]),
      fetch(`/api/trace?memoryId=${sourceMemory.id}`).then(r => r.json()).catch(() => null),
    ]).then(([srcLinks, tgtLinks, trace]) => {
      if (cancelled) return;
      setSourceLinks(srcLinks); setLoadingSourceLinks(false);
      setTargetLinks(tgtLinks); setLoadingTargetLinks(false);
      setTraceData(trace); setLoadingTrace(false);
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

  // Check if target is in trace path
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

  // Build all trace nodes indexed by id (respects direction + depth filters)
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

  // All reachable nodes from source through filtered links (direction + min strength)
  const reachableNodes = useMemo(() => {
    if (!traceData || !sourceMemory) return [];
    const allLinks = traceData.links || [];
    if (allLinks.length === 0) return [];

    // Filter links by min strength and direction (only include links whose endpoints are in allTraceNodes)
    const links = allLinks.filter((l: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
      l.strength >= pathMinStrength &&
      (allTraceNodes.has(l.source_id) || l.source_id === sourceMemory.id) &&
      (allTraceNodes.has(l.target_id) || l.target_id === sourceMemory.id)
    );

    // Build adjacency list
    const adj = new Map<number, number[]>();
    for (const l of links) {
      if (!adj.has(l.source_id)) adj.set(l.source_id, []);
      if (!adj.has(l.target_id)) adj.set(l.target_id, []);
      adj.get(l.source_id)!.push(l.target_id);
      adj.get(l.target_id)!.push(l.source_id);
    }

    // BFS from source — collect all reachable nodes
    const visited = new Set<number>([sourceMemory.id]);
    const queue = [sourceMemory.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const neighbor of (adj.get(cur) || [])) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    return Array.from(visited).map((id) => {
      const node = allTraceNodes.get(id);
      return node || { id, depth: 0, summary: `Memory #${id}`, memory_type: "unknown" };
    });
  }, [traceData, sourceMemory, allTraceNodes, pathMinStrength]);

  // Debounced highlight — avoids spamming the graph on rapid slider drags
  const highlightTimeout = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(highlightTimeout.current);
    highlightTimeout.current = setTimeout(() => {
      const ids = new Set<string>();
      if (sourceMemory) ids.add(`m_${sourceMemory.id}`);
      if (targetMemory) ids.add(`m_${targetMemory.id}`);
      for (const n of reachableNodes) ids.add(`m_${(n as any).id}`); // eslint-disable-line @typescript-eslint/no-explicit-any
      onPathHighlight?.(ids.size > 0 ? ids : null);
    }, 120);
    return () => { clearTimeout(highlightTimeout.current); onPathHighlight?.(null); };
  }, [reachableNodes, sourceMemory, targetMemory, onPathHighlight]);

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

        {/* Path Controls */}
        {!loadingTrace && (
          <div>
            <h4 className="t-label text-violet-500">
              Path
            </h4>

            {pathInfo && (
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
            )}

            <div className="mt-2 rounded-[4px] px-3 py-2.5 space-y-2.5" style={{ background: "var(--surface-dimmer)", border: "1px solid var(--border)" }}>
              {/* Depth slider */}
              <div className="flex items-center gap-2">
                <span className="w-16 t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>Depth</span>
                <input
                  type="range"
                  min={0}
                  max={traceMaxDepth}
                  value={pathDepth}
                  onChange={(e) => setPathDepth(Number(e.target.value))}
                  className="neuro-range flex-1 h-1"
                />
                <span className="t-tiny font-mono w-4 text-right" style={{ color: "var(--text)" }}>{pathDepth}</span>
              </div>

              {/* Direction toggle */}
              <div className="flex items-center gap-2">
                <span className="w-16 t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>Direction</span>
                <div className="flex gap-0.5">
                  {(["both", "upstream", "downstream"] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setPathDirection(dir)}
                      className="rounded-[3px] px-1.5 py-0.5 t-micro transition"
                      style={{
                        background: pathDirection === dir ? "var(--accent)" : "transparent",
                        color: pathDirection === dir ? "#fff" : "var(--text-faint)",
                        border: `1px solid ${pathDirection === dir ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      {dir === "both" ? "Both" : dir === "upstream" ? "Up" : "Down"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Strength slider */}
              <div className="flex items-center gap-2">
                <span className="w-16 t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>Min Strength</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(pathMinStrength * 100)}
                  onChange={(e) => setPathMinStrength(Number(e.target.value) / 100)}
                  className="neuro-range flex-1 h-1"
                />
                <span className="t-tiny font-mono w-8 text-right" style={{ color: "var(--text)" }}>{Math.round(pathMinStrength * 100)}%</span>
              </div>

              {/* Path status — animated counter */}
              <AnimatedPathStatus count={reachableNodes.length} loading={loadingTrace} />
            </div>
          </div>
        )}
        {loadingTrace && (
          <div className="space-y-2.5 animate-pulse">
            <div className="h-2.5 w-12 rounded" style={{ background: "var(--surface-dimmer)" }} />
            <div className="rounded-[4px] px-3 py-2.5 space-y-2.5" style={{ background: "var(--surface-dimmer)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <div className="h-2 w-12 rounded" style={{ background: "var(--border)" }} />
                <div className="flex-1 h-1 rounded-full" style={{ background: "var(--border)" }} />
                <div className="h-2 w-4 rounded" style={{ background: "var(--border)" }} />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-12 rounded" style={{ background: "var(--border)" }} />
                <div className="flex gap-0.5">
                  <div className="h-4 w-8 rounded-[3px]" style={{ background: "var(--border)" }} />
                  <div className="h-4 w-6 rounded-[3px]" style={{ background: "var(--border)" }} />
                  <div className="h-4 w-8 rounded-[3px]" style={{ background: "var(--border)" }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-12 rounded" style={{ background: "var(--border)" }} />
                <div className="flex-1 h-1 rounded-full" style={{ background: "var(--border)" }} />
                <div className="h-2 w-6 rounded" style={{ background: "var(--border)" }} />
              </div>
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

function AnimatedPathStatus({ count, loading }: { count: number; loading: boolean }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = count;
    if (display === target) return;
    const id = setInterval(() => {
      setDisplay((prev) => {
        if (prev === target) return prev;
        return prev < target
          ? Math.min(prev + Math.ceil((target - prev) / 4), target)
          : Math.max(prev - Math.ceil((prev - target) / 4), target);
      });
    }, 30);
    return () => clearInterval(id);
  }, [count, display]);

  const active = display > 1;
  return (
    <div className="t-micro font-mono text-center" style={{ color: active ? "var(--text-muted)" : "var(--text-faint)" }}>
      {active ? `${display} memories highlighted` : loading ? "..." : "No path found"}
    </div>
  );
}
