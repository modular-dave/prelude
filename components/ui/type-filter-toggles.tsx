"use client";

import type { MemoryType } from "@/lib/types";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/types";
import { ALL_MEMORY_TYPES } from "@/lib/retrieval-settings";

interface TypeFilterTogglesProps {
  enabled: MemoryType[];
  onChange: (types: MemoryType[]) => void;
}

export function TypeFilterToggles({ enabled, onChange }: TypeFilterTogglesProps) {
  const toggle = (type: MemoryType) => {
    if (enabled.includes(type)) {
      // Don't allow disabling all types
      if (enabled.length <= 1) return;
      onChange(enabled.filter((t) => t !== type));
    } else {
      onChange([...enabled, type]);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
        Memory Types
      </span>
      <div className="flex flex-wrap gap-1.5">
        {ALL_MEMORY_TYPES.map((type) => {
          const active = enabled.includes(type);
          const color = TYPE_COLORS[type];
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              className="rounded-full px-2.5 py-1 text-[9px] font-medium tracking-wide transition-all"
              style={
                active
                  ? { background: color, color: "#fff", opacity: 1 }
                  : {
                      background: "transparent",
                      border: `1px solid ${color}`,
                      color: color,
                      opacity: 0.4,
                    }
              }
            >
              {TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
