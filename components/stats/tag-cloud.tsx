"use client";

import { useMemo } from "react";
import { useMemory } from "@/lib/memory-context";

export function TagCloud() {
  const { memories } = useMemory();

  const tags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memories) {
      for (const tag of [...(m.tags || []), ...(m.concepts || [])]) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30);
  }, [memories]);

  if (tags.length === 0) {
    return (
      <p className="text-xs text-neutral-600">No tags yet</p>
    );
  }

  const maxCount = tags[0][1];

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(([tag, count]) => {
        const scale = 0.6 + 0.4 * (count / maxCount);
        return (
          <span
            key={tag}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-neutral-400 transition hover:bg-neutral-700"
            style={{ fontSize: `${Math.round(scale * 12)}px` }}
          >
            {tag}
            <span className="ml-1 text-neutral-600">{count}</span>
          </span>
        );
      })}
    </div>
  );
}
