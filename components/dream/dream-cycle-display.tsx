"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Moon, Loader2, CheckCircle2, Circle, Sparkles, Calendar, Play,
  Layers, Eye, AlertTriangle, ChevronDown, ChevronRight,
  Clock, MemoryStick, ArrowRight,
} from "lucide-react";
import { useMemory } from "@/lib/memory-context";

// ── Phase metadata ──────────────────────────────────────────

const PHASES = [
  { key: "consolidation", name: "Consolidation", roman: "I", color: "#3b82f6", icon: Layers, desc: "Synthesize focal-point insights from recent memories" },
  { key: "compaction", name: "Compaction", roman: "II", color: "#8b5cf6", icon: MemoryStick, desc: "Summarize old faded memories into semantic knowledge" },
  { key: "reflection", name: "Reflection", roman: "III", color: "#22c55e", icon: Eye, desc: "Review self-model against accumulated knowledge" },
  { key: "contradiction_resolution", name: "Contradiction Resolution", roman: "IV", color: "#f59e0b", icon: AlertTriangle, desc: "Find and resolve conflicting memories" },
  { key: "emergence", name: "Emergence", roman: "V", color: "#f43f5e", icon: Sparkles, desc: "Discover unexpected connections and novel insights" },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

interface PhaseResult {
  id: number;
  phase: PhaseKey;
  output: string;
  inputCount: number;
  newMemoryIds: number[];
  createdAt: string;
}

interface NewMemory {
  id: number;
  type: string;
  summary: string;
  importance: number;
  tags: string[];
  source: string;
  createdAt: string;
}

interface DreamResult {
  emergence: string | null;
  phases: PhaseResult[];
  newMemories: NewMemory[];
  stats: { totalPhases: number; totalNewMemories: number; totalInputMemories: number };
}

interface DreamLog {
  id: number;
  session_type: PhaseKey;
  input_memory_ids: number[];
  output: string;
  new_memories_created: number[];
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────

function phaseMeta(key: string) {
  return PHASES.find((p) => p.key === key) ?? PHASES[0];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
  semantic: "#3b82f6",
  procedural: "#8b5cf6",
  self_model: "#f43f5e",
  episodic: "#22c55e",
  introspective: "#f59e0b",
};

// ── Component ───────────────────────────────────────────────

export function DreamCycleDisplay() {
  const { memories, refresh } = useMemory();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DreamResult | null>(null);
  const [dreamScheduleActive, setDreamScheduleActive] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  // Dream history
  const [history, setHistory] = useState<DreamLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

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
    // Poll every 10s so history updates while cycles run externally
    const interval = setInterval(loadHistory, 10_000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const toggleDreamSchedule = async () => {
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
  };

  const runDream = async () => {
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
  };

  // Group history by dream session (group consecutive logs within 15 min)
  const dreamSessions = groupIntoSessions(history);

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <Moon className="h-4 w-4" />
            Dream Cycle
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
            5-phase LLM-powered memory consolidation via Cortex
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDreamSchedule}
            disabled={scheduleLoading}
            className="rounded-[6px] px-3 py-2 text-xs font-medium transition active:scale-95 disabled:opacity-40 glass"
            style={{
              color: dreamScheduleActive ? "#22c55e" : "var(--text)",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: dreamScheduleActive ? "rgba(34,197,94,0.4)" : "var(--border)",
            }}
          >
            {scheduleLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {dreamScheduleActive ? "Schedule On" : "Schedule Off"}
              </span>
            )}
          </button>
          <button
            onClick={runDream}
            disabled={running || memories.length === 0}
            className="rounded-[6px] px-4 py-2 text-xs font-medium transition active:scale-95 disabled:opacity-40 glass"
            style={{ color: "var(--text)" }}
          >
            {running ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Dreaming...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Play className="h-3 w-3" />
                Run Dream Cycle
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Phase overview cards */}
      <div className="grid gap-3 sm:grid-cols-5">
        {PHASES.map((phase) => {
          const phaseResult = result?.phases.find((p) => p.phase === phase.key);
          const isComplete = !!phaseResult;
          const Icon = running ? Loader2 : isComplete ? CheckCircle2 : Circle;
          return (
            <button
              key={phase.key}
              onClick={() => phaseResult && setExpandedPhase(expandedPhase === phase.key ? null : phase.key)}
              className="rounded-[6px] p-4 text-left transition-all duration-200"
              style={{
                background: "var(--surface-dim)",
                borderTopWidth: isComplete ? 2 : 1,
                borderTopStyle: "solid",
                borderTopColor: isComplete ? phase.color : "var(--border)",
                borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "var(--border)",
                borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--border)",
                borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--border)",
                cursor: phaseResult ? "pointer" : "default",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold" style={{ color: phase.color, opacity: 0.6 }}>
                  {phase.roman}
                </span>
                <Icon
                  className={`h-3.5 w-3.5 ${running ? "animate-spin text-blue-500" : isComplete ? "text-green-500" : ""}`}
                  style={!running && !isComplete ? { color: "var(--text-faint)" } : undefined}
                />
              </div>
              <p className="mt-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                {phase.name}
              </p>
              <p className="mt-1 text-[9px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
                {phase.desc}
              </p>
              {phaseResult && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[9px] font-medium" style={{ color: phase.color }}>
                    {phaseResult.inputCount} in
                  </span>
                  <ArrowRight className="h-2 w-2" style={{ color: "var(--text-faint)" }} />
                  <span className="text-[9px] font-medium" style={{ color: phase.color }}>
                    {phaseResult.newMemoryIds.length} out
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded phase detail */}
      {expandedPhase && result && (() => {
        const phaseResult = result.phases.find((p) => p.phase === expandedPhase);
        if (!phaseResult) return null;
        const meta = phaseMeta(expandedPhase);
        const phaseMemories = result.newMemories.filter((m) => phaseResult.newMemoryIds.includes(m.id));
        return (
          <div
            className="rounded-[8px] p-5 animate-fade-slide-up"
            style={{
              background: "var(--surface-dim)",
              borderTopWidth: 2, borderTopStyle: "solid", borderTopColor: meta.color,
              borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "var(--border)",
              borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--border)",
              borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--border)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <meta.icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
              <h3 className="text-xs font-semibold" style={{ color: meta.color }}>{meta.name}</h3>
              <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                {phaseResult.inputCount} memories analyzed
              </span>
            </div>

            {/* Phase output */}
            <div className="rounded-[6px] p-3 mb-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              <p className="text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
                {phaseResult.output}
              </p>
            </div>

            {/* New memories created */}
            {phaseMemories.length > 0 && (
              <div>
                <p className="text-[9px] font-medium mb-2" style={{ color: "var(--text-faint)" }}>
                  {phaseMemories.length} memories created
                </p>
                <div className="space-y-1.5">
                  {phaseMemories.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start gap-2 rounded-[6px] p-2.5"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                    >
                      <div
                        className="mt-1 h-[6px] w-[6px] rounded-full shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[m.type] || "var(--text-faint)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] leading-relaxed" style={{ color: "var(--text)" }}>
                          {m.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px]" style={{ color: TYPE_COLORS[m.type] || "var(--text-faint)" }}>
                            {m.type}
                          </span>
                          <span className="text-[8px]" style={{ color: "var(--text-faint)" }}>
                            imp: {m.importance.toFixed(2)}
                          </span>
                          {m.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-[8px]" style={{ color: "var(--text-faint)" }}>
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Error */}
      {error && (
        <div className="rounded-[8px] p-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {/* Emergence highlight */}
      {result?.emergence && (
        <div
          className="rounded-[8px] p-5 animate-fade-slide-up"
          style={{
            background: "var(--surface-dim)",
            borderTopWidth: 2, borderTopStyle: "solid", borderTopColor: "#f43f5e",
            borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "var(--border)",
            borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--border)",
            borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-rose-500" />
            <h3 className="text-xs font-semibold text-rose-500">Emergence</h3>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {result.emergence}
          </p>
        </div>
      )}

      {/* Stats summary */}
      {result && (
        <div className="flex items-center gap-6">
          <Stat label="Phases" value={result.stats.totalPhases} />
          <Stat label="Memories analyzed" value={result.stats.totalInputMemories} />
          <Stat label="Memories created" value={result.stats.totalNewMemories} />
        </div>
      )}

      {/* Dream history */}
      <div>
        <h3 className="text-[11px] font-semibold mb-3" style={{ color: "var(--text)" }}>
          Dream History{" "}
          {dreamSessions.length > 0 && (
            <span style={{ color: "var(--text-faint)" }}>({dreamSessions.length})</span>
          )}
        </h3>
        {historyLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--text-faint)" }} />
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Loading...</span>
          </div>
        ) : dreamSessions.length === 0 ? (
          <p className="text-[10px] py-4" style={{ color: "var(--text-faint)" }}>
            No dream cycles recorded yet. Run your first dream cycle above.
          </p>
        ) : (
          <div className="space-y-2">
            {dreamSessions.map((session) => (
              <DreamSessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>{value}</p>
      <p className="text-[9px]" style={{ color: "var(--text-faint)" }}>{label}</p>
    </div>
  );
}

interface DreamSession {
  id: string;
  timestamp: string;
  logs: DreamLog[];
}

function DreamSessionCard({ session }: { session: DreamSession }) {
  const [open, setOpen] = useState(false);
  const totalIn = session.logs.reduce((s, l) => s + (l.input_memory_ids?.length || 0), 0);
  const totalOut = session.logs.reduce((s, l) => s + (l.new_memories_created?.length || 0), 0);
  const hasEmergence = session.logs.some((l) => l.session_type === "emergence" && l.output);

  return (
    <div
      className="rounded-[6px] overflow-hidden"
      style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 text-left transition-colors duration-150"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="h-2.5 w-2.5" style={{ color: "var(--text-faint)" }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--text)" }}>
              {new Date(session.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
              {timeAgo(session.timestamp)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {/* Phase dots */}
            <div className="flex items-center gap-1">
              {session.logs.map((l) => {
                const meta = phaseMeta(l.session_type);
                return (
                  <div
                    key={l.id}
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ backgroundColor: meta.color }}
                    title={meta.name}
                  />
                );
              })}
            </div>
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
              {totalIn} in → {totalOut} out
            </span>
            {hasEmergence && (
              <Sparkles className="h-2.5 w-2.5 text-rose-500" />
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          {session.logs.map((log) => {
            const meta = phaseMeta(log.session_type);
            return (
              <div key={log.id} className="pt-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: meta.color }} />
                  <span className="text-[9px] font-semibold" style={{ color: meta.color }}>{meta.name}</span>
                  <span className="text-[8px]" style={{ color: "var(--text-faint)" }}>
                    {(log.input_memory_ids?.length || 0)} in → {(log.new_memories_created?.length || 0)} out
                  </span>
                </div>
                <p className="text-[9px] leading-relaxed whitespace-pre-wrap pl-3" style={{ color: "var(--text-muted)" }}>
                  {log.output.length > 400 ? log.output.slice(0, 400) + "…" : log.output}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Grouping utility ────────────────────────────────────────

function groupIntoSessions(logs: DreamLog[]): DreamSession[] {
  if (logs.length === 0) return [];

  // Logs arrive sorted desc. Reverse to ascending for cycle detection.
  const asc = [...logs].reverse();

  const sessions: DreamSession[] = [];
  let current: DreamLog[] = [asc[0]];

  for (let i = 1; i < asc.length; i++) {
    // A new "consolidation" after any other phase signals the start of a new dream cycle.
    // Also split if there's a >15 min gap (safety net for partial cycles).
    const gap = new Date(asc[i].created_at).getTime() - new Date(asc[i - 1].created_at).getTime();
    const isNewCycle = asc[i].session_type === "consolidation" && current[current.length - 1].session_type !== "consolidation";
    if (isNewCycle || gap > 15 * 60 * 1000) {
      sessions.push({
        id: String(current[0].id),
        timestamp: current[current.length - 1].created_at, // use latest timestamp for display
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

  // Return newest first
  return sessions.reverse();
}
