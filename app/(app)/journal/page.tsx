"use client";

import { useState } from "react";
import { BookOpen, Loader2, Play, Calendar, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FloatNav } from "@/components/shell/float-nav";
import { useMemory } from "@/lib/memory-context";
import type { Memory } from "@/lib/types";

interface ReflectionJournal {
  text: string;
  title: string;
  timestamp: string;
  seedMemoryIds?: number[];
  memoryId?: number | null;
}

export default function JournalPage() {
  const { memories } = useMemory();
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJournal, setCurrentJournal] = useState<ReflectionJournal | null>(null);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Load past introspective memories as journal entries
  const pastJournals = memories.filter(
    (m) => m.memory_type === "introspective" && m.tags?.includes("reflection")
  );

  const triggerReflection = async () => {
    setReflectionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reflect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reflection failed");
      } else {
        setCurrentJournal({
          text: data.journal?.text || data.text || "Reflection completed.",
          title: data.journal?.title || data.title || "Reflection",
          timestamp: new Date().toISOString(),
          seedMemoryIds: data.journal?.seedMemoryIds || data.seedMemoryIds,
          memoryId: data.journal?.memoryId || data.memoryId,
        });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setReflectionLoading(false);
    }
  };

  const toggleSchedule = async () => {
    setScheduleLoading(true);
    try {
      const action = scheduleActive ? "stop" : "start";
      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: action }),
      });
      if (res.ok) {
        setScheduleActive(!scheduleActive);
      }
    } catch {
      // ignore
    } finally {
      setScheduleLoading(false);
    }
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleteReflection = async (id: number) => {
    try {
      await fetch("/api/memories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setConfirmDeleteId(null);
      window.location.reload();
    } catch {
      setError("Failed to delete reflection");
      setConfirmDeleteId(null);
    }
  };

  const clearReflections = async () => {
    setClearing(true);
    try {
      await fetch("/api/memories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "introspection" }),
      });
      setCurrentJournal(null);
      window.location.reload();
    } catch {
      setError("Failed to clear reflections");
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <h1 className="t-heading" style={{ color: "var(--text)" }}>Journal</h1>
        <p className="mt-1 t-small" style={{ color: "var(--text-faint)" }}>
          Introspective reflections and self-model journaling via Cortex
        </p>
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={triggerReflection}
          disabled={reflectionLoading}
          className="rounded-[6px] px-4 py-2 t-btn transition active:scale-95 disabled:opacity-40 glass"
          style={{ color: "var(--text)" }}
        >
          {reflectionLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reflecting...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Play className="h-3 w-3" />
              Trigger Reflection
            </span>
          )}
        </button>

        <button
          onClick={toggleSchedule}
          disabled={scheduleLoading}
          className="rounded-[6px] px-3 py-2 t-btn transition active:scale-95 disabled:opacity-40 glass"
          style={{
            color: scheduleActive ? "#22c55e" : "var(--text)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: scheduleActive ? "rgba(34,197,94,0.4)" : "var(--border)",
          }}
        >
          {scheduleLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {scheduleActive ? "Auto-Reflect On" : "Auto-Reflect Off"}
            </span>
          )}
        </button>

        {pastJournals.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            disabled={clearing}
            className="rounded-[6px] px-3 py-2 t-btn transition active:scale-95 disabled:opacity-40 glass"
            style={{ color: "#ef4444" }}
          >
            {clearing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                <Trash2 className="h-3 w-3" />
                Clear Reflections
              </span>
            )}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-[8px] p-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <p className="t-small text-red-500">{error}</p>
        </div>
      )}

      {/* Current reflection result */}
      {currentJournal && (
        <JournalCard journal={currentJournal} isNew />
      )}

      {/* Past journal entries */}
      {pastJournals.length > 0 && (
        <div className="mt-8">
          <h2 className="label mb-3">Past Reflections ({pastJournals.length})</h2>
          <div className="space-y-3">
            {pastJournals.map((m) => (
              <JournalMemoryCard key={m.id} memory={m} onDelete={(id) => setConfirmDeleteId(id)} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!currentJournal && pastJournals.length === 0 && (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <BookOpen className="h-10 w-10 mb-4" style={{ color: "var(--text-faint)", opacity: 0.3 }} />
          <p className="t-heading" style={{ color: "var(--text-muted)" }}>No journal entries yet</p>
          <p className="mt-1 t-small" style={{ color: "var(--text-faint)" }}>
            Trigger a reflection to generate the first introspective journal entry
          </p>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear all reflections?"
          message="This will delete all journal reflections and introspective memories. This cannot be undone."
          confirmLabel="Clear All"
          onConfirm={clearReflections}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      {confirmDeleteId !== null && (
        <ConfirmDialog
          title="Delete this reflection?"
          message="This will delete this journal reflection and its associated memory. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => deleteReflection(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <FloatNav route="journal" />
    </div>
  );
}

function JournalCard({ journal, isNew }: { journal: ReflectionJournal; isNew?: boolean }) {
  return (
    <div
      className={`mt-4 rounded-[8px] p-5 ${isNew ? "animate-fade-slide-up" : ""}`}
      style={{
        background: "var(--surface-dim)",
        borderTop: "2px solid #8b5cf6",
        border: "1px solid var(--border)",
        borderTopColor: "#8b5cf6",
        borderTopWidth: 2,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-purple-500" />
          <h3 className="t-btn text-purple-500">
            {journal.title}
          </h3>
        </div>
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
          {new Date(journal.timestamp).toLocaleString()}
        </span>
      </div>
      <p className="leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
        {journal.text}
      </p>
      {journal.seedMemoryIds && journal.seedMemoryIds.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>Seed memories:</span>
          {journal.seedMemoryIds.map((id) => (
            <span
              key={id}
              className="rounded-[3px] px-1.5 py-0.5 t-tiny font-mono"
              style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
            >
              #{id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function JournalMemoryCard({ memory, onDelete }: { memory: Memory; onDelete?: (id: number) => void }) {
  const [open, setOpen] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(memory.id);
  };

  return (
    <div
      className="rounded-[8px] cursor-pointer transition"
      style={{
        background: "var(--surface-dim)",
        border: "1px solid var(--border)",
        borderLeftWidth: 3,
        borderLeftColor: "#8b5cf6",
      }}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="flex items-center p-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
          )}
          <BookOpen className="h-3 w-3 text-purple-500 shrink-0" />
          <span className="truncate" style={{ color: "var(--text)" }}>
            {memory.summary || "Reflection"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="t-tiny font-mono" style={{ color: "var(--text-faint)" }}>
            imp: {(memory.importance ?? 0).toFixed(2)}
          </span>
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
            {new Date(memory.created_at).toLocaleDateString()}
          </span>
          <button
            onClick={handleDelete}
            className="p-1 transition-opacity opacity-30 hover:opacity-80"
            style={{ color: "var(--text-faint)" }}
            title="Delete this reflection"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 animate-fade-slide-up" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="t-small leading-relaxed whitespace-pre-wrap pt-3" style={{ color: "var(--text-muted)" }}>
            {memory.content}
          </p>
          {memory.tags && memory.tags.length > 0 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              {memory.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[3px] px-1.5 py-0.5 t-micro"
                  style={{ background: "var(--surface-dimmer)", color: "var(--text-faint)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
