"use client";

import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS, TYPE_LABELS, type MemoryType } from "@/lib/types";

const ALL_TYPES: MemoryType[] = [
  "episodic",
  "semantic",
  "procedural",
  "self_model",
  "introspective",
];

export function TypeDistribution() {
  const { memories } = useMemory();
  const total = memories.length || 1;

  const counts = ALL_TYPES.map((type) => ({
    type,
    count: memories.filter((m) => m.memory_type === type).length,
  }));

  return (
    <div className="space-y-2">
      {counts.map(({ type, count }) => (
        <div key={type} className="flex items-center gap-3">
          <span
            className="w-20 text-right text-[11px] font-medium"
            style={{ color: TYPE_COLORS[type] }}
          >
            {TYPE_LABELS[type]}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: TYPE_COLORS[type],
                minWidth: count > 0 ? 4 : 0,
              }}
            />
          </div>
          <span className="w-8 text-[11px] tabular-nums" style={{ color: "var(--text-faint)" }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}
