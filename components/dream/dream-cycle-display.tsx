"use client";

import { useState } from "react";
import { Loader2, Play, Trash2 } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDreamCycle, type DreamLog, type DreamSession } from "./use-dream-cycle";

// ── Phase metadata ──────────────────────────────────────────

const PHASES = [
  { key: "consolidation", name: "Consolidation", roman: "I", desc: "Synthesize focal-point insights from recent memories" },
  { key: "compaction", name: "Compaction", roman: "II", desc: "Summarize old faded memories into semantic knowledge" },
  { key: "reflection", name: "Reflection", roman: "III", desc: "Review self-model against accumulated knowledge" },
  { key: "contradiction_resolution", name: "Contradiction Resolution", roman: "IV", desc: "Find and resolve conflicting memories" },
  { key: "emergence", name: "Emergence", roman: "V", desc: "Discover unexpected connections and novel insights" },
] as const;

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
  const dream = useDreamCycle(refresh, memories.length);

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
          {dream.dreamSessions.length > 0 && (
            <button
              onClick={() => dream.setConfirmClearAll(true)}
              disabled={dream.clearing}
              className="font-mono text-btn transition active:scale-95 disabled:opacity-40"
              style={{ fontSize: 11, fontWeight: 500, color: "var(--error)" }}
            >
              {dream.clearing ? (
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
            onClick={dream.toggleDreamSchedule}
            disabled={dream.scheduleLoading}
            className="font-mono text-btn transition active:scale-95 disabled:opacity-40"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: dream.dreamScheduleActive ? "var(--success)" : "var(--text)",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: dream.dreamScheduleActive ? "var(--success)" : "var(--border)",
            }}
          >
            {dream.scheduleLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                {dream.dreamScheduleActive ? "Schedule On" : "Schedule Off"}
              </span>
            )}
          </button>
          <button
            onClick={dream.runDream}
            disabled={dream.running || memories.length === 0}
            className="font-mono text-btn transition active:scale-95 disabled:opacity-40"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}
          >
            {dream.running ? (
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
          const phaseResult = dream.result?.phases.find((p) => p.phase === phase.key);
          const isComplete = !!phaseResult;
          return (
            <button
              key={phase.key}
              onClick={() => phaseResult && dream.setExpandedPhase(dream.expandedPhase === phase.key ? null : phase.key)}
              className="font-mono py-2 text-left transition-all duration-200"
              style={{
                background: "transparent",
                borderTop: isComplete ? "2px solid var(--accent)" : "1px solid var(--border)",
                cursor: phaseResult ? "pointer" : "default",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
                  {phase.roman}
                </span>
                {dream.running && <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--accent)" }} />}
                {!dream.running && isComplete && (
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
      {dream.expandedPhase && dream.result && (() => {
        const phaseResult = dream.result.phases.find((p) => p.phase === dream.expandedPhase);
        if (!phaseResult) return null;
        const meta = phaseMeta(dream.expandedPhase);
        const phaseMemories = dream.result.newMemories.filter((m) => phaseResult.newMemoryIds.includes(m.id));
        return (
          <div
            className="font-mono mt-4 animate-fade-slide-up"
            style={{
              background: "transparent",
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
            <div className="mb-3" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
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
                    <div key={m.id} className="flex items-start gap-2 py-1">
                      <div className="min-w-0 flex-1">
                        <p style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}>
                          {m.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>{m.type}</span>
                          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>imp: {m.importance.toFixed(2)}</span>
                          {m.tags.slice(0, 3).map((t) => (
                            <span key={t} style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>#{t}</span>
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
      {dream.error && (
        <div className="mt-4">
          <p className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--error)" }}>{dream.error}</p>
        </div>
      )}

      {/* Emergence highlight */}
      {dream.result?.emergence && (
        <div
          className="font-mono mt-4 animate-fade-slide-up"
          style={{
            background: "transparent",
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
            {dream.result.emergence}
          </p>
        </div>
      )}

      {/* Stats summary */}
      {dream.result && (
        <div className="flex items-center gap-6 font-mono">
          <Stat label="Phases" value={dream.result.stats.totalPhases} />
          <Stat label="Memories analyzed" value={dream.result.stats.totalInputMemories} />
          <Stat label="Memories created" value={dream.result.stats.totalNewMemories} />
        </div>
      )}

      {/* Dream history */}
      <div>
        <h3 className="font-mono mb-3" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
          Dream History{" "}
          {dream.dreamSessions.length > 0 && (
            <span style={{ color: "var(--text-faint)" }}>({dream.dreamSessions.length})</span>
          )}
        </h3>
        {dream.historyLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--text-faint)" }} />
            <span className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>Loading...</span>
          </div>
        ) : dream.dreamSessions.length === 0 ? (
          <p className="font-mono py-4" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
            No dream cycles recorded yet. Run your first dream cycle above.
          </p>
        ) : (
          <div className="space-y-2">
            {dream.dreamSessions.map((session) => (
              <DreamSessionCard
                key={session.id}
                session={session}
                onDelete={(logIds) => dream.setConfirmSessionDelete(logIds)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm dialogs */}
      {dream.confirmClearAll && (
        <ConfirmDialog
          title="Clear all dreams?"
          message="This will delete all dream logs and dream-generated memories. This cannot be undone."
          confirmLabel="Clear All"
          onConfirm={dream.clearDreams}
          onCancel={() => dream.setConfirmClearAll(false)}
        />
      )}
      {dream.confirmSessionDelete && (
        <ConfirmDialog
          title="Delete this dream session?"
          message="This will delete the dream logs and any memories created during this session."
          confirmLabel="Delete"
          onConfirm={() => dream.deleteSession(dream.confirmSessionDelete!)}
          onCancel={() => dream.setConfirmSessionDelete(null)}
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
      className="font-mono overflow-hidden"
      style={{ borderTop: "1px solid var(--border)", paddingTop: 4 }}
    >
      <div className="flex items-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 flex items-center gap-2 py-1 text-left transition-colors duration-150"
        >
          <span className="font-mono shrink-0" style={{ color: "var(--text-faint)", fontSize: 11 }}>
            {open ? "−" : "+"}
          </span>
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
