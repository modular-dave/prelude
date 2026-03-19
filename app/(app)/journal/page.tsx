"use client";

import { useState } from "react";
import { Loader2, Play, Trash2, ChevronDown, ChevronRight } from "lucide-react";
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
    <div className="relative h-full overflow-y-auto p-6 pt-16 font-mono" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--text)" }}>Journal</h1>
        <p className="mt-1" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
          Introspective reflections and self-model journaling via Cortex
        </p>
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={triggerReflection}
          disabled={reflectionLoading}
          className="rounded-[6px] px-4 py-2 transition active:scale-95 disabled:opacity-40 glass"
          style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}
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
          className="rounded-[6px] px-3 py-2 transition active:scale-95 disabled:opacity-40 glass"
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: scheduleActive ? "var(--success)" : "var(--text)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: scheduleActive ? "var(--success)" : "var(--border)",
          }}
        >
          {scheduleLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span className="flex items-center gap-1.5">
              {scheduleActive ? "Auto-Reflect On" : "Auto-Reflect Off"}
            </span>
          )}
        </button>

        {pastJournals.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            disabled={clearing}
            className="rounded-[6px] px-3 py-2 transition active:scale-95 disabled:opacity-40 glass"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--error)" }}
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
        <div className="mt-4 rounded-[8px] p-4" style={{ background: "var(--bg)", border: "1px solid var(--error)" }}>
          <p style={{ fontSize: 11, fontWeight: 400, color: "var(--error)" }}>{error}</p>
        </div>
      )}

      {/* Current reflection result */}
      {currentJournal && (
        <JournalCard journal={currentJournal} isNew />
      )}

      {/* Past journal entries */}
      {pastJournals.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3" style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
            Past Reflections ({pastJournals.length})
          </h2>
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
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>No journal entries yet</p>
          <p className="mt-1" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
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
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "var(--border)",
        borderTopWidth: 2,
        borderTopColor: "var(--accent)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontSize: 11, fontWeight: 500, color: "var(--accent)" }}>
          {journal.title}
        </h3>
        <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
          {new Date(journal.timestamp).toLocaleString()}
        </span>
      </div>
      <p className="leading-relaxed whitespace-pre-wrap" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
        {journal.text}
      </p>
      {journal.seedMemoryIds && journal.seedMemoryIds.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>Seed memories:</span>
          {journal.seedMemoryIds.map((id) => (
            <span
              key={id}
              className="rounded-[3px] px-1.5 py-0.5"
              style={{ fontSize: 9, fontWeight: 400, background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
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
        borderLeftColor: "var(--accent)",
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
          <span className="truncate" style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}>
            {memory.summary || "Reflection"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
            imp: {(memory.importance ?? 0).toFixed(2)}
          </span>
          <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
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
          <p className="leading-relaxed whitespace-pre-wrap pt-3" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
            {memory.content}
          </p>
          {memory.tags && memory.tags.length > 0 && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {memory.tags.map((tag) => (
                <span
                  key={tag}
                  style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}
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
