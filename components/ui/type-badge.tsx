"use client";

import { TYPE_COLORS, TYPE_LABELS, type MemoryType } from "@/lib/types";

export function TypeBadge({ type }: { type: MemoryType }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: TYPE_COLORS[type] + "20",
        color: TYPE_COLORS[type],
      }}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
