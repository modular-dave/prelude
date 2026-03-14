"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Memory, GraphData, GraphNode, GraphLink } from "./types";
import { TYPE_COLORS } from "./types";
import {
  type RetrievalSettings,
  DEFAULT_RETRIEVAL_SETTINGS,
  loadSettings,
  saveSettings,
  ALL_MEMORY_TYPES,
} from "./retrieval-settings";

interface MemoryContextValue {
  memories: Memory[];
  stats: Record<string, unknown>;
  graphData: GraphData;
  loading: boolean;
  refresh: () => Promise<void>;
  retrievalSettings: RetrievalSettings;
  updateRetrievalSettings: (patch: Partial<RetrievalSettings>) => void;
}

const MemoryContext = createContext<MemoryContextValue>({
  memories: [],
  stats: {},
  graphData: { nodes: [], links: [] },
  loading: true,
  refresh: async () => {},
  retrievalSettings: DEFAULT_RETRIEVAL_SETTINGS,
  updateRetrievalSettings: () => {},
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

/** Build a fingerprint of memory IDs to detect actual data changes */
function memoryFingerprint(mems: Memory[]): string {
  return mems.map((m) => m.id).sort((a, b) => a - b).join(",");
}

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });
  const [loading, setLoading] = useState(true);
  const [retrievalSettings, setRetrievalSettings] = useState<RetrievalSettings>(DEFAULT_RETRIEVAL_SETTINGS);
  const lastFingerprintRef = useRef("");
  const settingsRef = useRef(retrievalSettings);
  const initializedRef = useRef(false);

  // Load settings from localStorage on mount (client-only)
  useEffect(() => {
    const stored = loadSettings();
    setRetrievalSettings(stored);
    settingsRef.current = stored;
    initializedRef.current = true;
  }, []);

  const updateRetrievalSettings = useCallback((patch: Partial<RetrievalSettings>) => {
    setRetrievalSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      settingsRef.current = next;
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const s = settingsRef.current;
    const params = new URLSearchParams({ limit: "500" });
    if (s.minImportance > 0) params.set("min_importance", String(s.minImportance));
    if (s.minDecay > 0) params.set("min_decay", String(s.minDecay));
    if (s.enabledTypes.length < ALL_MEMORY_TYPES.length) {
      params.set("types", s.enabledTypes.join(","));
    }

    try {
      const [memRes, statsRes] = await Promise.all([
        fetch(`/api/memories?${params}`),
        fetch("/api/memories?q=__stats__"),
      ]);
      const memData = await memRes.json();
      const statsData = await statsRes.json();
      const mems = Array.isArray(memData) ? memData : [];
      setMemories(mems);
      setStats(statsData);

      // Only rebuild graph data if memories actually changed
      const fp = memoryFingerprint(mems);
      if (fp !== lastFingerprintRef.current) {
        lastFingerprintRef.current = fp;
        setGraphData(buildGraphData(mems));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when settings change (after initial load)
  useEffect(() => {
    if (initializedRef.current) {
      refresh();
    }
  }, [retrievalSettings, refresh]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <MemoryContext.Provider
      value={{ memories, stats, graphData, loading, refresh, retrievalSettings, updateRetrievalSettings }}
    >
      {children}
    </MemoryContext.Provider>
  );
}
