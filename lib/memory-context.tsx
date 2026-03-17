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
import type { Memory, MemoryStats, KnowledgeGraphData, GraphStats } from "./types";
import {
  type RetrievalSettings,
  DEFAULT_RETRIEVAL_SETTINGS,
  loadSettings,
  saveSettings,
  ALL_MEMORY_TYPES,
} from "./retrieval-settings";

// ── Context shape ──────────────────────────────────────────────

interface MemoryContextValue {
  memories: Memory[];
  stats: MemoryStats | null;
  loading: boolean;
  refresh: () => Promise<void>;

  // Cortex knowledge graph (entities + relations)
  knowledgeGraph: KnowledgeGraphData;
  graphStats: GraphStats | null;

  // Settings
  retrievalSettings: RetrievalSettings;
  updateRetrievalSettings: (patch: Partial<RetrievalSettings>) => void;

  // On-demand fetchers
  fetchMemoryLinks: (memoryId: number) => Promise<MemoryLink[]>;
  fetchEntityMemories: (entityId: number) => Promise<Memory[]>;
  fetchSelfModel: () => Promise<Memory[]>;
  triggerReflection: () => Promise<ReflectionJournal | null>;
  triggerDecay: () => Promise<number>;
}

export interface MemoryLink {
  id: number;
  source_id: number;
  target_id: number;
  link_type: string;
  strength: number;
  created_at: string;
}

export interface ReflectionJournal {
  text: string;
  title: string;
  seedMemoryIds: number[];
  memoryId: number | null;
  timestamp: string;
}

const EMPTY_KG: KnowledgeGraphData = { nodes: [], edges: [] };

const MemoryContext = createContext<MemoryContextValue>({
  memories: [],
  stats: null,
  knowledgeGraph: EMPTY_KG,
  graphStats: null,
  loading: true,
  refresh: async () => {},
  retrievalSettings: DEFAULT_RETRIEVAL_SETTINGS,
  updateRetrievalSettings: () => {},
  fetchMemoryLinks: async () => [],
  fetchEntityMemories: async () => [],
  fetchSelfModel: async () => [],
  triggerReflection: async () => null,
  triggerDecay: async () => 0,
});

export function useMemory() {
  return useContext(MemoryContext);
}

// ── Provider ───────────────────────────────────────────────────

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphData>(EMPTY_KG);
  const [graphStatsData, setGraphStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrievalSettings, setRetrievalSettings] = useState<RetrievalSettings>(DEFAULT_RETRIEVAL_SETTINGS);
  const settingsRef = useRef(retrievalSettings);
  const initializedRef = useRef(false);

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

  // ── Memory + Stats refresh (every 15s) ────────────────────

  const refreshMemories = useCallback(async () => {
    const s = settingsRef.current;
    const params = new URLSearchParams({ hours: "87600" });
    if (s.enabledTypes.length < ALL_MEMORY_TYPES.length) {
      params.set("types", s.enabledTypes.join(","));
    }

    try {
      const [memRes, statsRes] = await Promise.all([
        fetch(`/api/recent?${params}`),
        fetch("/api/memories?q=__stats__"),
      ]);
      const memData = await memRes.json();
      const statsData = await statsRes.json();
      const nextMems = Array.isArray(memData) ? memData : [];
      // Only update if content actually changed — prevents downstream re-renders
      setMemories(prev => {
        if (prev.length !== nextMems.length) return nextMems;
        const prevFp = prev.map((m: Memory) => `${m.id}:${m.access_count ?? 0}`).join(",");
        const nextFp = nextMems.map((m: Memory) => `${m.id}:${m.access_count ?? 0}`).join(",");
        return prevFp === nextFp ? prev : nextMems;
      });
      setStats(statsData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Knowledge graph refresh (every 30s) — bundled single-request ───

  const graphInitializedRef = useRef(false);

  // Hydrate from sessionStorage on mount for instant first paint
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("prelude:graph-bundle");
      if (cached) {
        const { graph, stats: gs } = JSON.parse(cached);
        if (graph?.nodes) setKnowledgeGraph(graph);
        if (gs?.entityCount !== undefined) setGraphStats(gs);
        graphInitializedRef.current = true;
      }
    } catch { /* ignore corrupt cache */ }
  }, []);

  const mergeGraphLinks = useCallback((kgData: any, linksData: any[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (kgData.nodes && Array.isArray(linksData)) {
      const memoryLinkEdges = linksData.map((l: { source_id: number; target_id: number; link_type: string; strength: number }) => ({
        source: `m_${l.source_id}`,
        target: `m_${l.target_id}`,
        type: l.link_type,
        weight: l.strength,
      }));
      kgData.edges = [...(kgData.edges || []), ...memoryLinkEdges];
    }
    return kgData;
  }, []);

  const refreshGraph = useCallback(async () => {
    try {
      const res = await fetch("/api/graph?includeMemories=true&bundle=true");
      const bundle = await res.json();
      const { graph: kgData, stats: gsData, links: linksData } = bundle;

      // Merge memory_links as edges
      mergeGraphLinks(kgData, linksData);

      if (kgData.nodes) {
        // Only update if content changed — prevents downstream re-renders
        setKnowledgeGraph(prev => {
          const prevFp = `${prev.nodes.length}|${prev.edges.length}`;
          const nextFp = `${kgData.nodes.length}|${kgData.edges?.length ?? 0}`;
          if (prevFp !== nextFp) return kgData;
          const prevNodeIds = prev.nodes.map((n: { id: string }) => n.id).sort().join(",");
          const nextNodeIds = kgData.nodes.map((n: { id: string }) => n.id).sort().join(",");
          return prevNodeIds === nextNodeIds ? prev : kgData;
        });
      }
      if (gsData?.entityCount !== undefined) setGraphStats(gsData);

      // Cache for instant hydration on next page load
      try { sessionStorage.setItem("prelude:graph-bundle", JSON.stringify({ graph: kgData, stats: gsData })); } catch { /* quota */ }
    } catch {
      // ignore
    }
  }, [mergeGraphLinks]);

  // ── Consolidated refresh ──────────────────────────────────

  const refresh = useCallback(async () => {
    await Promise.all([refreshMemories(), refreshGraph()]);
  }, [refreshMemories, refreshGraph]);

  useEffect(() => {
    if (initializedRef.current) {
      refreshMemories();
    }
  }, [retrievalSettings, refreshMemories]);

  useEffect(() => {
    refresh();
    const memInterval = setInterval(refreshMemories, 15000);
    const graphInterval = setInterval(refreshGraph, 30000);
    return () => {
      clearInterval(memInterval);
      clearInterval(graphInterval);
    };
  }, [refresh, refreshMemories, refreshGraph]);

  // ── On-demand fetchers ────────────────────────────────────

  const fetchMemoryLinks = useCallback(async (memoryId: number): Promise<MemoryLink[]> => {
    try {
      const res = await fetch(`/api/links?memoryId=${memoryId}`);
      return await res.json();
    } catch {
      return [];
    }
  }, []);

  const fetchEntityMemories = useCallback(async (entityId: number): Promise<Memory[]> => {
    try {
      const res = await fetch(`/api/entities/${entityId}`);
      return await res.json();
    } catch {
      return [];
    }
  }, []);

  const fetchSelfModel = useCallback(async (): Promise<Memory[]> => {
    try {
      const res = await fetch("/api/self-model");
      return await res.json();
    } catch {
      return [];
    }
  }, []);

  const triggerReflection = useCallback(async (): Promise<ReflectionJournal | null> => {
    try {
      const res = await fetch("/api/reflect", { method: "POST" });
      const data = await res.json();
      if (data.journal) {
        await refreshMemories();
        return data.journal;
      }
      return null;
    } catch {
      return null;
    }
  }, [refreshMemories]);

  const triggerDecay = useCallback(async (): Promise<number> => {
    try {
      const res = await fetch("/api/decay", { method: "POST" });
      const data = await res.json();
      if (data.decayed > 0) await refreshMemories();
      return data.decayed ?? 0;
    } catch {
      return 0;
    }
  }, [refreshMemories]);

  return (
    <MemoryContext.Provider
      value={{
        memories,
        stats,
        knowledgeGraph,
        graphStats: graphStatsData,
        loading,
        refresh,
        retrievalSettings,
        updateRetrievalSettings,
        fetchMemoryLinks,
        fetchEntityMemories,
        fetchSelfModel,
        triggerReflection,
        triggerDecay,
      }}
    >
      {children}
    </MemoryContext.Provider>
  );
}
