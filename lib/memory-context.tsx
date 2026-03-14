"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Memory, GraphData, GraphNode, GraphLink } from "./types";
import { TYPE_COLORS } from "./types";

interface MemoryContextValue {
  memories: Memory[];
  stats: Record<string, unknown>;
  graphData: GraphData;
  loading: boolean;
  refresh: () => Promise<void>;
}

const MemoryContext = createContext<MemoryContextValue>({
  memories: [],
  stats: {},
  graphData: { nodes: [], links: [] },
  loading: true,
  refresh: async () => {},
});

export function useMemory() {
  return useContext(MemoryContext);
}

function buildGraphData(memories: Memory[]): GraphData {
  const nodes: GraphNode[] = memories.map((m) => ({
    id: m.id,
    name: m.summary.length > 40 ? m.summary.slice(0, 40) + "..." : m.summary,
    val: Math.max(2, m.importance * 12),
    color: TYPE_COLORS[m.memory_type] || "#666",
    type: m.memory_type,
    importance: m.importance,
  }));

  const links: GraphLink[] = [];
  // Build links from shared tags/concepts
  for (let i = 0; i < memories.length; i++) {
    const a = memories[i];
    const aTags = new Set([...(a.tags || []), ...(a.concepts || [])]);
    if (aTags.size === 0) continue;

    for (let j = i + 1; j < memories.length; j++) {
      const b = memories[j];
      const bTags = [...(b.tags || []), ...(b.concepts || [])];
      let shared = 0;
      for (const t of bTags) {
        if (aTags.has(t)) shared++;
      }
      if (shared > 0) {
        links.push({ source: a.id, target: b.id, value: shared });
      }
    }
  }

  return { nodes, links };
}

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [memRes, statsRes] = await Promise.all([
        fetch("/api/memories?limit=500"),
        fetch("/api/memories?q=__stats__"),
      ]);
      const memData = await memRes.json();
      const statsData = await statsRes.json();
      const mems = Array.isArray(memData) ? memData : [];
      setMemories(mems);
      setStats(statsData);
      setGraphData(buildGraphData(mems));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <MemoryContext.Provider value={{ memories, stats, graphData, loading, refresh }}>
      {children}
    </MemoryContext.Provider>
  );
}
