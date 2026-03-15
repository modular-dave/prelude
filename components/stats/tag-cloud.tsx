"use client";

import { useMemo } from "react";
import { useMemory } from "@/lib/memory-context";

export function TagCloud() {
  const { memories } = useMemory();

  const tags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memories) {
      for (const tag of [...(m.tags || []), ...(m.concepts || [])]) {
        if (tag === "user-message" || tag === "assistant-response" || tag.startsWith("conv:")) continue;
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30);
  }, [memories]);

  if (tags.length === 0) {
    return (
      <p className="t-small" style={{ color: "var(--text-faint)" }}>No tags yet</p>
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
            className="rounded-[4px] px-2 py-1 transition"
            style={{
              fontSize: `${Math.round(scale * 12)}px`,
              background: "var(--surface-dim)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {tag}
            <span className="ml-1" style={{ color: "var(--text-faint)" }}>{count}</span>
          </span>
        );
      })}
    </div>
  );
}
