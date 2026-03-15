"use client";

import { useState, useEffect } from "react";
import { BookOpen, Loader2, Play, Calendar } from "lucide-react";
import { FloatNav } from "@/components/shell/float-nav";
import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS } from "@/lib/types";
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

  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <h1 className="heading">Journal</h1>
        <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
          Introspective reflections and self-model journaling via Cortex
        </p>
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={triggerReflection}
          disabled={reflectionLoading}
          className="rounded-[6px] px-4 py-2 text-xs font-medium transition active:scale-95 disabled:opacity-40 glass"
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
          className="rounded-[6px] px-3 py-2 text-xs font-medium transition active:scale-95 disabled:opacity-40 glass"
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
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-[8px] p-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <p className="text-xs text-red-500">{error}</p>
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
              <JournalMemoryCard key={m.id} memory={m} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!currentJournal && pastJournals.length === 0 && (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <BookOpen className="h-10 w-10 mb-4" style={{ color: "var(--text-faint)", opacity: 0.3 }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No journal entries yet</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
            Trigger a reflection to generate the first introspective journal entry
          </p>
        </div>
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
          <h3 className="text-xs font-semibold text-purple-500">
            {journal.title}
          </h3>
        </div>
        <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
          {new Date(journal.timestamp).toLocaleString()}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
        {journal.text}
      </p>
      {journal.seedMemoryIds && journal.seedMemoryIds.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>Seed memories:</span>
          {journal.seedMemoryIds.map((id) => (
            <span
              key={id}
              className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-mono"
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

function JournalMemoryCard({ memory }: { memory: Memory }) {
  return (
    <div
      className="rounded-[8px] p-4"
      style={{
        background: "var(--surface-dim)",
        border: "1px solid var(--border)",
        borderLeftWidth: 3,
        borderLeftColor: "#8b5cf6",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3 w-3 text-purple-500" />
          <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>
            {memory.summary || "Reflection"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono" style={{ color: "var(--text-faint)" }}>
            imp: {(memory.importance ?? 0).toFixed(2)}
          </span>
          <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
            {new Date(memory.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
        {memory.content}
      </p>
      {memory.tags && memory.tags.length > 0 && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {memory.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[3px] px-1.5 py-0.5 text-[8px]"
              style={{ background: "var(--surface-dimmer)", color: "var(--text-faint)" }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
