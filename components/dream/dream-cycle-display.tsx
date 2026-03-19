"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ChevronDown, ChevronRight, Play, Trash2 } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ── Phase metadata ──────────────────────────────────────────

const PHASES = [
  { key: "consolidation", name: "Consolidation", roman: "I", desc: "Synthesize focal-point insights from recent memories" },
  { key: "compaction", name: "Compaction", roman: "II", desc: "Summarize old faded memories into semantic knowledge" },
  { key: "reflection", name: "Reflection", roman: "III", desc: "Review self-model against accumulated knowledge" },
  { key: "contradiction_resolution", name: "Contradiction Resolution", roman: "IV", desc: "Find and resolve conflicting memories" },
  { key: "emergence", name: "Emergence", roman: "V", desc: "Discover unexpected connections and novel insights" },
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

  const [clearing, setClearing] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmSessionDelete, setConfirmSessionDelete] = useState<number[] | null>(null);

  const clearDreams = async () => {
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
  };

  const deleteSession = async (logIds: number[]) => {
    await fetch("/api/dream", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logIds }),
    });
    await refresh();
    await loadHistory();
    setConfirmSessionDelete(null);
  };

  // Group history by dream session (group consecutive logs within 15 min)
  const dreamSessions = groupIntoSessions(history);

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
            Dream Cycle
          </h2>
          <p className="font-mono mt-0.5" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
            5-phase LLM-powered memory consolidation via Cortex
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dreamSessions.length > 0 && (
            <button
              onClick={() => setConfirmClearAll(true)}
              disabled={clearing}
              className="font-mono rounded-[6px] px-3 py-2 transition active:scale-95 disabled:opacity-40 glass"
              style={{ fontSize: 11, fontWeight: 500, color: "var(--error)" }}
            >
              {clearing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="flex items-center gap-1.5">
                  <Trash2 className="h-3 w-3" />
                  Clear Dreams
                </span>
              )}
            </button>
          )}
          <button
            onClick={toggleDreamSchedule}
            disabled={scheduleLoading}
            className="font-mono rounded-[6px] px-3 py-2 transition active:scale-95 disabled:opacity-40 glass"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: dreamScheduleActive ? "var(--success)" : "var(--text)",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: dreamScheduleActive ? "var(--success)" : "var(--border)",
            }}
          >
            {scheduleLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                {dreamScheduleActive ? "Schedule On" : "Schedule Off"}
              </span>
            )}
          </button>
          <button
            onClick={runDream}
            disabled={running || memories.length === 0}
            className="font-mono rounded-[6px] px-4 py-2 transition active:scale-95 disabled:opacity-40 glass"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}
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
          return (
            <button
              key={phase.key}
              onClick={() => phaseResult && setExpandedPhase(expandedPhase === phase.key ? null : phase.key)}
              className="font-mono rounded-[6px] p-4 text-left transition-all duration-200"
              style={{
                background: "var(--surface-dim)",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--border)",
                borderTopWidth: isComplete ? 2 : 1,
                borderTopColor: isComplete ? "var(--accent)" : "var(--border)",
                cursor: phaseResult ? "pointer" : "default",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
                  {phase.roman}
                </span>
                {running && <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--accent)" }} />}
                {!running && isComplete && (
                  <span style={{ fontSize: 9, fontWeight: 400, color: "var(--success)" }}>done</span>
                )}
              </div>
              <p className="mt-2" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
                {phase.name}
              </p>
              <p className="mt-1 leading-relaxed" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                {phase.desc}
              </p>
              {phaseResult && (
                <div className="mt-2 flex items-center gap-2">
                  <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>
                    {phaseResult.inputCount} in
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>&rarr;</span>
                  <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>
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
            className="font-mono rounded-[8px] p-5 animate-fade-slide-up"
            style={{
              background: "var(--surface-dim)",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--border)",
              borderTopWidth: 2,
              borderTopColor: "var(--accent)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <h3 style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{meta.name}</h3>
              <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                {phaseResult.inputCount} memories analyzed
              </span>
            </div>

            {/* Phase output */}
            <div className="rounded-[6px] p-3 mb-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              <p className="leading-relaxed whitespace-pre-wrap" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                {phaseResult.output}
              </p>
            </div>

            {/* New memories created */}
            {phaseMemories.length > 0 && (
              <div>
                <p className="mb-2" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                  {phaseMemories.length} memories created
                </p>
                <div className="space-y-1.5">
                  {phaseMemories.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start gap-2 rounded-[6px] p-2.5"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}>
                          {m.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>
                            {m.type}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                            imp: {m.importance.toFixed(2)}
                          </span>
                          {m.tags.slice(0, 3).map((t) => (
                            <span key={t} style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
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
        <div className="rounded-[8px] p-4" style={{ background: "var(--bg)", border: "1px solid var(--error)" }}>
          <p className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--error)" }}>{error}</p>
        </div>
      )}

      {/* Emergence highlight */}
      {result?.emergence && (
        <div
          className="font-mono rounded-[8px] p-5 animate-fade-slide-up"
          style={{
            background: "var(--surface-dim)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "var(--border)",
            borderTopWidth: 2,
            borderTopColor: "var(--accent)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <h3 style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>Emergence</h3>
          </div>
          <p className="leading-relaxed" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
            {result.emergence}
          </p>
        </div>
      )}

      {/* Stats summary */}
      {result && (
        <div className="flex items-center gap-6 font-mono">
          <Stat label="Phases" value={result.stats.totalPhases} />
          <Stat label="Memories analyzed" value={result.stats.totalInputMemories} />
          <Stat label="Memories created" value={result.stats.totalNewMemories} />
        </div>
      )}

      {/* Dream history */}
      <div>
        <h3 className="font-mono mb-3" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
          Dream History{" "}
          {dreamSessions.length > 0 && (
            <span style={{ color: "var(--text-faint)" }}>({dreamSessions.length})</span>
          )}
        </h3>
        {historyLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--text-faint)" }} />
            <span className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>Loading...</span>
          </div>
        ) : dreamSessions.length === 0 ? (
          <p className="font-mono py-4" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
            No dream cycles recorded yet. Run your first dream cycle above.
          </p>
        ) : (
          <div className="space-y-2">
            {dreamSessions.map((session) => (
              <DreamSessionCard
                key={session.id}
                session={session}
                onDelete={(logIds) => setConfirmSessionDelete(logIds)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm dialogs */}
      {confirmClearAll && (
        <ConfirmDialog
          title="Clear all dreams?"
          message="This will delete all dream logs and dream-generated memories. This cannot be undone."
          confirmLabel="Clear All"
          onConfirm={clearDreams}
          onCancel={() => setConfirmClearAll(false)}
        />
      )}
      {confirmSessionDelete && (
        <ConfirmDialog
          title="Delete this dream session?"
          message="This will delete the dream logs and any memories created during this session."
          confirmLabel="Delete"
          onConfirm={() => deleteSession(confirmSessionDelete)}
          onCancel={() => setConfirmSessionDelete(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{value}</p>
      <p style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>{label}</p>
    </div>
  );
}

interface DreamSession {
  id: string;
  timestamp: string;
  logs: DreamLog[];
}

function DreamSessionCard({ session, onDelete }: { session: DreamSession; onDelete?: (logIds: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const totalIn = session.logs.reduce((s, l) => s + (l.input_memory_ids?.length || 0), 0);
  const totalOut = session.logs.reduce((s, l) => s + (l.new_memories_created?.length || 0), 0);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(session.logs.map((l) => l.id));
  };

  return (
    <div
      className="font-mono rounded-[6px] overflow-hidden"
      style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 flex items-center gap-3 p-3 text-left transition-colors duration-150"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}>
                {new Date(session.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                {timeAgo(session.timestamp)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                {session.logs.length} phases
              </span>
              <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                {totalIn} in &rarr; {totalOut} out
              </span>
            </div>
          </div>
        </button>
        <button
          onClick={handleDelete}
          className="p-3 transition-opacity opacity-30 hover:opacity-80"
          style={{ color: "var(--text-faint)" }}
          title="Delete this dream session"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          {session.logs.map((log) => {
            const meta = phaseMeta(log.session_type);
            return (
              <div key={log.id} className="pt-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{meta.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                    {(log.input_memory_ids?.length || 0)} in &rarr; {(log.new_memories_created?.length || 0)} out
                  </span>
                </div>
                <p className="leading-relaxed whitespace-pre-wrap pl-3" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>
                  {log.output.length > 400 ? log.output.slice(0, 400) + "\u2026" : log.output}
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
