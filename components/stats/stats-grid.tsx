"use client";

import { useMemory } from "@/lib/memory-context";
import { Brain, Zap, Heart, TrendingUp, Tag, Eye } from "lucide-react";

export function StatsGrid() {
  const { memories } = useMemory();

  const total = memories.length;
  const avgImportance =
    total > 0 ? memories.reduce((s, m) => s + m.importance, 0) / total : 0;
  const avgDecay =
    total > 0
      ? memories.reduce((s, m) => s + (m.decay_factor || 1), 0) / total
      : 1;
  const avgValence =
    total > 0
      ? memories.reduce((s, m) => s + (m.emotional_valence || 0), 0) / total
      : 0;
  const uniqueTypes = new Set(memories.map((m) => m.memory_type)).size;
  const mostAccessed = memories.length > 0
    ? [...memories].sort((a, b) => (b.access_count || 0) - (a.access_count || 0))[0]
    : null;

  const cards = [
    {
      label: "Total Memories",
      value: total,
      icon: Brain,
      color: "#3b82f6",
    },
    {
      label: "Avg Importance",
      value: `${Math.round(avgImportance * 100)}%`,
      icon: Zap,
      color: "#f59e0b",
    },
    {
      label: "Memory Health",
      value: `${Math.round(avgDecay * 100)}%`,
      icon: Heart,
      color: "#22c55e",
    },
    {
      label: "Emotional Tone",
      value: avgValence > 0.1 ? "Positive" : avgValence < -0.1 ? "Negative" : "Neutral",
      icon: TrendingUp,
      color: "#8b5cf6",
    },
    {
      label: "Active Types",
      value: `${uniqueTypes}/5`,
      icon: Tag,
      color: "#f43f5e",
    },
    {
      label: "Most Accessed",
      value: mostAccessed
        ? `#${mostAccessed.id} (${mostAccessed.access_count || 0}x)`
        : "—",
      icon: Eye,
      color: "#06b6d4",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
          >
            <div className="flex items-center gap-2">
              <Icon
                className="h-4 w-4"
                style={{ color: card.color }}
              />
              <span className="text-[11px] text-neutral-500">{card.label}</span>
            </div>
            <div className="mt-2 text-xl font-bold text-white">
              {card.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
