"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
        <span className="t-title" style={{ color: "var(--text)" }}>reflect</span>
        <p className="mt-1 t-tiny" style={{ color: "var(--text-faint)" }}>
          introspective reflections and self-model journaling
        </p>
      </div>

      {/* Controls — plain text buttons */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={triggerReflection}
          disabled={reflectionLoading}
          className="text-btn transition active:scale-95 disabled:opacity-40"
          style={{ fontSize: 11, fontWeight: 400, color: "var(--accent)" }}
        >
          {reflectionLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              reflecting...
            </span>
          ) : (
            "trigger reflection"
          )}
        </button>

        <span style={{ color: "var(--text-faint)", fontSize: 9 }}>︱</span>

        <button
          onClick={toggleSchedule}
          disabled={scheduleLoading}
          className="text-btn transition active:scale-95 disabled:opacity-40"
          style={{ fontSize: 11, fontWeight: 400, color: scheduleActive ? "var(--success)" : "var(--text-faint)" }}
        >
          {scheduleLoading ? (
            <Loader2 className="h-3 w-3 animate-spin inline-block" />
          ) : (
            <>auto-reflect︱{scheduleActive ? "on" : "off"}</>
          )}
        </button>

        {pastJournals.length > 0 && (
          <>
            <span style={{ color: "var(--text-faint)", fontSize: 9 }}>︱</span>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={clearing}
              className="text-btn transition active:scale-95 disabled:opacity-40"
              style={{ fontSize: 11, fontWeight: 400, color: "var(--error)" }}
            >
              {clearing ? <Loader2 className="h-3 w-3 animate-spin inline-block" /> : "clear all"}
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-4" style={{ fontSize: 11, fontWeight: 400, color: "var(--error)" }}>{error}</p>
      )}

      {/* Current reflection result */}
      {currentJournal && (
        <JournalEntry journal={currentJournal} isNew />
      )}

      {/* Past journal entries */}
      {pastJournals.length > 0 && (
        <div className="mt-8">
          <div style={{ borderTop: "1px solid var(--border)", marginBottom: 8 }} />
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
            past reflections ({pastJournals.length})
          </span>
          <div className="mt-3 space-y-0">
            {pastJournals.map((m) => (
              <MemoryEntry key={m.id} memory={m} onDelete={(id) => setConfirmDeleteId(id)} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!currentJournal && pastJournals.length === 0 && (
        <div className="mt-16">
          <p className="t-body" style={{ color: "var(--text-muted)" }}>no journal entries yet</p>
          <p className="mt-1 t-tiny" style={{ color: "var(--text-faint)" }}>
            trigger a reflection to generate the first introspective journal entry
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

function JournalEntry({ journal, isNew }: { journal: ReflectionJournal; isNew?: boolean }) {
  return (
    <div className={`mt-4 ${isNew ? "animate-fade-slide-up" : ""}`}>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }} />
      <div className="flex items-center justify-between mb-2">
        <span className="t-body" style={{ color: "var(--accent)" }}>
          {journal.title}
        </span>
        <span className="t-micro" style={{ color: "var(--text-faint)" }}>
          {new Date(journal.timestamp).toLocaleString()}
        </span>
      </div>
      <p className="leading-relaxed whitespace-pre-wrap t-body" style={{ color: "var(--text-muted)" }}>
        {journal.text}
      </p>
      {journal.seedMemoryIds && journal.seedMemoryIds.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>seeds︱</span>
          {journal.seedMemoryIds.map((id) => (
            <span key={id} className="t-micro" style={{ color: "var(--text-faint)" }}>
              #{id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryEntry({ memory, onDelete }: { memory: Memory; onDelete?: (id: number) => void }) {
  const [open, setOpen] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(memory.id);
  };

  return (
    <div
      className="cursor-pointer transition py-1"
      onClick={() => setOpen((v) => !v)}
    >
      <div className="flex items-center gap-2">
        <span className="t-body" style={{ color: "var(--text-faint)" }}>
          {open ? "−" : "+"}
        </span>
        <span className="truncate t-body" style={{ color: "var(--text)" }}>
          {memory.summary || "Reflection"}
        </span>
        <span className="t-micro shrink-0" style={{ color: "var(--text-faint)" }}>
          imp: {(memory.importance ?? 0).toFixed(2)}
        </span>
        <span className="t-micro shrink-0" style={{ color: "var(--text-faint)" }}>
          {new Date(memory.created_at).toLocaleDateString()}
        </span>
        <button
          onClick={handleDelete}
          className="shrink-0 opacity-0 hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-faint)" }}
          title="Delete this reflection"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>
      {open && (
        <div className="pl-4 mt-1 animate-fade-slide-up">
          <p className="leading-relaxed whitespace-pre-wrap t-body" style={{ color: "var(--text-muted)" }}>
            {memory.content}
          </p>
          {memory.tags && memory.tags.length > 0 && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {memory.tags.map((tag) => (
                <span key={tag} className="t-micro" style={{ color: "var(--text-faint)" }}>
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
