"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────

type PhaseKey = "consolidation" | "compaction" | "reflection" | "contradiction_resolution" | "emergence";

export interface PhaseResult {
  id: number;
  phase: PhaseKey;
  output: string;
  inputCount: number;
  newMemoryIds: number[];
  createdAt: string;
}

export interface NewMemory {
  id: number;
  type: string;
  summary: string;
  importance: number;
  tags: string[];
  source: string;
  createdAt: string;
}

export interface DreamResult {
  emergence: string | null;
  phases: PhaseResult[];
  newMemories: NewMemory[];
  stats: { totalPhases: number; totalNewMemories: number; totalInputMemories: number };
}

export interface DreamLog {
  id: number;
  session_type: PhaseKey;
  input_memory_ids: number[];
  output: string;
  new_memories_created: number[];
  created_at: string;
}

export interface DreamSession {
  id: string;
  timestamp: string;
  logs: DreamLog[];
}

// ── Session grouping ───────────────────────────────────────────────

export function groupIntoSessions(logs: DreamLog[]): DreamSession[] {
  if (logs.length === 0) return [];

  const asc = [...logs].reverse();
  const sessions: DreamSession[] = [];
  let current: DreamLog[] = [asc[0]];

  for (let i = 1; i < asc.length; i++) {
    const gap = new Date(asc[i].created_at).getTime() - new Date(asc[i - 1].created_at).getTime();
    const isNewCycle = asc[i].session_type === "consolidation" && current[current.length - 1].session_type !== "consolidation";
    if (isNewCycle || gap > 15 * 60 * 1000) {
      sessions.push({
        id: String(current[0].id),
        timestamp: current[current.length - 1].created_at,
        logs: current,
      });
      current = [asc[i]];
    } else {
      current.push(asc[i]);
    }
  }
  sessions.push({
    id: String(current[0].id),
    timestamp: current[current.length - 1].created_at,
    logs: current,
  });

  return sessions.reverse();
}

// ── Hook ───────────────────────────────────────────────────────────

export interface DreamCycleState {
  running: boolean;
  error: string | null;
  result: DreamResult | null;
  dreamScheduleActive: boolean;
  scheduleLoading: boolean;
  expandedPhase: string | null;
  setExpandedPhase: (phase: string | null) => void;
  history: DreamLog[];
  historyLoading: boolean;
  dreamSessions: DreamSession[];
  clearing: boolean;
  confirmClearAll: boolean;
  setConfirmClearAll: (v: boolean) => void;
  confirmSessionDelete: number[] | null;
  setConfirmSessionDelete: (ids: number[] | null) => void;
  toggleDreamSchedule: () => Promise<void>;
  runDream: () => Promise<void>;
  clearDreams: () => Promise<void>;
  deleteSession: (logIds: number[]) => Promise<void>;
}

/**
 * Manages dream cycle state: running dreams, schedule toggle,
 * history polling, and session CRUD.
 */
export function useDreamCycle(refresh: () => void, memoryCount: number): DreamCycleState {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DreamResult | null>(null);
  const [dreamScheduleActive, setDreamScheduleActive] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [history, setHistory] = useState<DreamLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmSessionDelete, setConfirmSessionDelete] = useState<number[] | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/dream?limit=200");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.logs || []);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 10_000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const toggleDreamSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setError(null);
    try {
      if (dreamScheduleActive) {
        const res = await fetch("/api/dream/schedule", { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to stop dream schedule");
          return;
        }
        setDreamScheduleActive(false);
      } else {
        const res = await fetch("/api/dream/schedule", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to start dream schedule");
          return;
        }
        setDreamScheduleActive(true);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setScheduleLoading(false);
    }
  }, [dreamScheduleActive]);

  const runDream = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/dream", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Dream cycle failed");
      } else {
        setResult(data);
        await refresh();
        await loadHistory();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }, [running, refresh, loadHistory]);

  const clearDreams = useCallback(async () => {
    setClearing(true);
    try {
      await fetch("/api/dream", { method: "DELETE" });
      setResult(null);
      await refresh();
      await loadHistory();
    } catch {
      setError("Failed to clear dreams");
    } finally {
      setClearing(false);
      setConfirmClearAll(false);
    }
  }, [refresh, loadHistory]);

  const deleteSession = useCallback(async (logIds: number[]) => {
    await fetch("/api/dream", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logIds }),
    });
    await refresh();
    await loadHistory();
    setConfirmSessionDelete(null);
  }, [refresh, loadHistory]);

  const dreamSessions = groupIntoSessions(history);

  return {
    running, error, result,
    dreamScheduleActive, scheduleLoading,
    expandedPhase, setExpandedPhase,
    history, historyLoading, dreamSessions,
    clearing, confirmClearAll, setConfirmClearAll,
    confirmSessionDelete, setConfirmSessionDelete,
    toggleDreamSchedule, runDream, clearDreams, deleteSession,
  };
}
