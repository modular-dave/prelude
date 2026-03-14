"use client";

import { useState } from "react";
import { useMemory } from "@/lib/memory-context";
import { TypeBadge } from "@/components/ui/type-badge";
import { ImportanceBar } from "@/components/ui/importance-bar";
import type { Memory } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MemoryItem({
  memory,
  expanded,
  onToggle,
}: {
  memory: Memory;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className="cursor-pointer rounded-[6px] p-4 transition"
      style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <TypeBadge type={memory.memory_type} />
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {timeAgo(memory.created_at)}
            </span>
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--text)" }}>{memory.summary}</p>
          <div className="mt-2 w-32">
            <ImportanceBar value={memory.importance} />
          </div>
        </div>
        <div className="text-right text-[10px] space-y-0.5" style={{ color: "var(--text-faint)" }}>
          <div>decay: {Math.round((memory.decay_factor || 1) * 100)}%</div>
          <div>recalls: {memory.access_count || 0}</div>
          <div className="text-amber-500">
            +{Math.min((memory.access_count || 0) * 1, 100 - Math.round(memory.importance * 100))}% reinforced
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {memory.content}
          </p>
          {memory.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {memory.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[3px] px-1.5 py-0.5 text-[10px]"
                  style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {memory.emotional_valence !== undefined && (
            <div className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
              valence: {memory.emotional_valence > 0 ? "+" : ""}
              {memory.emotional_valence.toFixed(2)}
            </div>
          )}
          {/* Hebbian reinforcement info */}
          <div className="mt-2 rounded-[3px] px-2 py-1.5 text-[10px]" style={{ background: "var(--surface-dimmer)" }}>
            <span style={{ color: "var(--text-faint)" }}>Hebbian: </span>
            <span className="text-amber-500">
              {memory.access_count || 0} recalls
            </span>
            <span style={{ color: "var(--text-faint)" }}> &middot; </span>
            <span className="text-green-500">
              +{((memory.access_count || 0) * 0.01).toFixed(2)} imp growth
            </span>
            <span style={{ color: "var(--text-faint)" }}> &middot; </span>
            <span style={{ color: "var(--text-muted)" }}>
              score: {((memory.importance * 0.2) + ((memory.decay_factor || 1) * 0.1)).toFixed(2)} base
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function MemoryTimeline() {
  const { memories } = useMemory();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = [...memories].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm" style={{ color: "var(--text-faint)" }}>
        No memories yet. Start chatting to create some.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((m) => (
        <MemoryItem
          key={m.id}
          memory={m}
          expanded={expandedId === m.id}
          onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
        />
      ))}
    </div>
  );
}
