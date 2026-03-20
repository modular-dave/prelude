"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useMemory } from "@/lib/memory-context";
import { Brain, Zap, Heart, TrendingUp, Tag, Eye, Moon, Sparkles, Loader2, Play } from "lucide-react";
import { TYPE_COLORS, type MemoryType } from "@/lib/types";

export function StatsGrid() {
  const { memories, stats } = useMemory();
  const [actionLearning, setActionLearning] = useState<{ lessons: string[] } | null>(null);
  const [learningLoading, setLearningLoading] = useState(false);

  const total = stats?.total ?? memories.length;
  const avgImportance = stats?.avgImportance ?? (
    memories.length > 0 ? memories.reduce((s, m) => s + m.importance, 0) / memories.length : 0
  );
  const avgDecay = stats?.avgDecay ?? (
    memories.length > 0
      ? memories.reduce((s, m) => s + (m.decay_factor || 1), 0) / memories.length
      : 1
  );
  const avgValence =
    memories.length > 0
      ? memories.reduce((s, m) => s + (m.emotional_valence || 0), 0) / memories.length
      : 0;
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
      label: "Top Tag",
      value: stats?.topTags?.find((t) => t.tag !== "user-message" && t.tag !== "assistant-response" && !t.tag.startsWith("conv:"))?.tag ?? "—",
      icon: Tag,
      color: "#f43f5e",
    },
    {
      label: "Dream Sessions",
      value: stats?.totalDreamSessions ?? 0,
      icon: Moon,
      color: "#a855f7",
    },
    {
      label: "Embedded",
      value: stats?.embeddedCount ?? 0,
      icon: Sparkles,
      color: "#ec4899",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-[6px] p-4"
              style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className="h-4 w-4"
                  style={{ color: card.color }}
                />
                <span style={{ color: "var(--text-faint)" }}>{card.label}</span>
              </div>
              <div className="mt-2 t-stat" style={{ color: "var(--text)" }}>
                {card.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Learning */}
      <div
        className="rounded-[6px] p-4"
        style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: "#10b981" }} />
            <span style={{ color: "var(--text-faint)" }}>Action Learning</span>
          </div>
          <button
            onClick={async () => {
              setLearningLoading(true);
              try {
                const res = await fetch("/api/actions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: "learn" }),
                });
                const data = await res.json();
                setActionLearning({ lessons: data.lessons || [] });
              } catch {
                setActionLearning({ lessons: [] });
              } finally {
                setLearningLoading(false);
              }
            }}
            disabled={learningLoading}
            className="flex items-center gap-1 text-btn transition active:scale-95 disabled:opacity-40"
            style={{ fontSize: 10, color: "var(--accent)" }}
          >
            {learningLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Learn
          </button>
        </div>
        {actionLearning && (
          <div className="mt-2">
            {actionLearning.lessons.length > 0 ? (
              <div className="space-y-1">
                {actionLearning.lessons.map((lesson, i) => (
                  <p key={i} className="t-small" style={{ color: "var(--text-muted)" }}>
                    {lesson}
                  </p>
                ))}
              </div>
            ) : (
              <p className="t-small" style={{ color: "var(--text-faint)" }}>
                No strategies learned yet. Log actions and outcomes first.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Most Accessed Memory */}
      {mostAccessed && (mostAccessed.access_count || 0) > 0 ? (
        <Link
          href={`/brain?node=${mostAccessed.id}`}
          className="block rounded-[6px] p-4 transition hover:brightness-95"
          style={{ background: "var(--surface-dim)", border: "1px solid var(--border)", textDecoration: "none" }}
        >
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" style={{ color: "#06b6d4" }} />
            <span style={{ color: "var(--text-faint)" }}>Most Accessed Memory</span>
            <span
              className="ml-auto rounded-full px-2 py-0.5 t-small"
              style={{ background: "rgba(6, 182, 212, 0.1)", color: "#06b6d4" }}
            >
              {mostAccessed.access_count}x recalled
            </span>
          </div>
          <p className="mt-2 t-heading truncate" style={{ color: "var(--text)" }}>
            {mostAccessed.summary}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: TYPE_COLORS[mostAccessed.memory_type as MemoryType] }}
            />
            <span className="t-small" style={{ color: "var(--text-muted)" }}>
              {mostAccessed.memory_type}
            </span>
            <span className="t-small" style={{ color: "var(--text-faint)" }}>
              imp: {Math.round(mostAccessed.importance * 100)}%
            </span>
          </div>
        </Link>
      ) : (
        <div
          className="rounded-[6px] p-4"
          style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" style={{ color: "#06b6d4" }} />
            <span style={{ color: "var(--text-faint)" }}>Most Accessed Memory</span>
          </div>
          <div className="mt-2 t-small" style={{ color: "var(--text-faint)" }}>
            No recalls yet
          </div>
        </div>
      )}
    </div>
  );
}
