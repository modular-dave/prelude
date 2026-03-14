"use client";

import { useMemory } from "@/lib/memory-context";
import {
  TYPE_COLORS,
  TYPE_LABELS,
  DECAY_RATES,
  type MemoryType,
} from "@/lib/types";

const ALL_TYPES: MemoryType[] = [
  "episodic",
  "semantic",
  "procedural",
  "self_model",
  "introspective",
];

export function MemoryTypeCards() {
  const { memories } = useMemory();

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {ALL_TYPES.map((type) => {
        const mems = memories.filter((m) => m.memory_type === type);
        const count = mems.length;
        const avgImportance =
          count > 0
            ? mems.reduce((s, m) => s + m.importance, 0) / count
            : 0;

        return (
          <div
            key={type}
            className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
            style={{ borderTopColor: TYPE_COLORS[type], borderTopWidth: 2 }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: TYPE_COLORS[type] }}
            >
              {TYPE_LABELS[type]}
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{count}</div>
            <div className="mt-1 text-[11px] text-neutral-500">
              {count > 0 ? `${Math.round(avgImportance * 100)}% avg importance` : "No memories"}
            </div>
            <div className="mt-1 text-[10px] text-neutral-600">
              {(DECAY_RATES[type] * 100).toFixed(0)}% daily decay
            </div>
          </div>
        );
      })}
    </div>
  );
}
