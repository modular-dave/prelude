"use client";

import { useEffect, useState } from "react";
import { Trash2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { FloatNav } from "@/components/shell/float-nav";
import { useMemory } from "@/lib/memory-context";
import {
  loadConversations,
  deleteConversation,
  clearAllConversations,
  type Conversation,
} from "@/lib/chat-store";
import {
  TYPE_LABELS,
  type MemoryType,
  type Memory,
} from "@/lib/types";

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const ALL_TYPES: MemoryType[] = [
  "episodic",
  "semantic",
  "procedural",
  "self_model",
  "introspective",
];

type TimelineFilter = "all" | "prompts" | "thoughts";

function MemoryItem({
  memory,
  expanded,
  onToggle,
}: {
  memory: Memory;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isPrompt = (memory.tags || []).includes("user-message");
  const isThought = (memory.tags || []).includes("assistant-response");

  return (
    <div
      onClick={onToggle}
      className="cursor-pointer rounded-[6px] p-4 transition font-mono"
      style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>
              {TYPE_LABELS[memory.memory_type] || memory.memory_type}
            </span>
            {isPrompt && (
              <span style={{ fontSize: 9, fontWeight: 400, color: "var(--accent)" }}>
                prompt
              </span>
            )}
            {isThought && (
              <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>
                thought
              </span>
            )}
            <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
              {timeAgo(memory.created_at)}
            </span>
          </div>
          <p className="mt-2" style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}>{memory.summary}</p>
          <div className="mt-1 flex items-center gap-2">
            <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
              imp: {Math.round(memory.importance * 100)}%
            </span>
          </div>
        </div>
        <div className="text-right space-y-0.5">
          <div style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>decay: {Math.round((memory.decay_factor || 1) * 100)}%</div>
          <div style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>recalls: {memory.access_count || 0}</div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="leading-relaxed" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
            {memory.content}
          </p>
          {memory.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {memory.tags.map((tag) => (
                <span
                  key={tag}
                  style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const { memories } = useMemory();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [pendingClearAll, setPendingClearAll] = useState(false);

  const [statsOpen, setStatsOpen] = useState(true);
  const [convsOpen, setConvsOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [expandedMemoryId, setExpandedMemoryId] = useState<number | null>(null);

  useEffect(() => {
    loadConversations().then(setConversations);
  }, []);

  const handleDelete = async (id: string) => {
    deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setPendingDelete(null);
  };

  const handleClearAll = async () => {
    clearAllConversations();
    setConversations([]);
    setPendingClearAll(false);
  };

  const typeCounts = memories.reduce(
    (acc, m) => {
      acc[m.memory_type] = (acc[m.memory_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const filteredMemories = memories
    .filter((m) => {
      if (timelineFilter === "prompts") return (m.tags || []).includes("user-message");
      if (timelineFilter === "thoughts") return (m.tags || []).includes("assistant-response");
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16 font-mono" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-2xl animate-fade-slide-up">
        <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--text)" }}>History</h1>
        <p className="mt-1" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
          {memories.length} memories &middot; {conversations.length} chats
        </p>

        {/* Stats section */}
        <div className="mt-6">
          <button
            onClick={() => setStatsOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}
          >
            <span className="flex-1">Stats</span>
            {statsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {statsOpen && (
            <div className="px-3 pb-2 animate-fade-slide-up">
              <div className="space-y-1.5">
                {ALL_TYPES.map((type) => {
                  const count = typeCounts[type] || 0;
                  const mems = memories.filter((m) => m.memory_type === type);
                  const avgImp = count > 0 ? mems.reduce((s, m) => s + m.importance, 0) / count : 0;
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="w-20" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                        {TYPE_LABELS[type]}
                      </span>
                      <span className="w-6 text-right" style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}>
                        {count}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                        {count > 0 ? `${Math.round(avgImp * 100)}% imp` : ""}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                        {count > 0
                          ? `${Math.round((mems.reduce((s, m) => s + (m.decay_factor || 1), 0) / count) * 100)}% decay`
                          : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Chats section */}
        <div className="mt-2">
          <button
            onClick={() => setConvsOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}
          >
            <span className="flex-1">Chats</span>
            <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>{conversations.length}</span>
            {convsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {convsOpen && (
            <div className="px-1 pb-2 animate-fade-slide-up">
              {conversations.length === 0 ? (
                <p className="py-8 text-center" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
                  No chats yet
                </p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="group flex items-start gap-2 rounded-[6px] px-3 py-2.5 transition"
                      style={{ background: "var(--surface-dim)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
                          {conv.summary || conv.title}
                        </p>
                        <p className="mt-0.5" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                          {conv.messages.length} messages &middot; {timeAgo(conv.updatedAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => setPendingDelete(conv)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition rounded-[4px] p-1"
                        style={{ color: "var(--text-faint)" }}
                        title="Delete chat"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {conversations.length > 0 && (
                <button
                  onClick={() => setPendingClearAll(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[6px] py-2 transition active:scale-95"
                  style={{ fontSize: 11, fontWeight: 400, color: "var(--error)" }}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all chats &amp; memories
                </button>
              )}
            </div>
          )}
        </div>

        {/* Memory Timeline section */}
        <div className="mt-2">
          <button
            onClick={() => setTimelineOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}
          >
            <span className="flex-1">Memory Timeline</span>
            <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>{memories.length}</span>
            {timelineOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {timelineOpen && (
            <div className="px-1 pb-2 animate-fade-slide-up">
              {/* Filter toggles */}
              <div className="mb-3 flex items-center gap-0.5 rounded-[8px] p-0.5 glass">
                {(["all", "prompts", "thoughts"] as TimelineFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTimelineFilter(f)}
                    className="rounded-[6px] px-3 py-1.5 transition-all duration-200"
                    style={{
                      fontSize: 11,
                      fontWeight: 400,
                      color: timelineFilter === f ? "var(--accent)" : "var(--text-faint)",
                      background: timelineFilter === f ? "var(--surface-dim)" : "transparent",
                    }}
                  >
                    {f === "all" ? "All" : f === "prompts" ? "Prompts" : "Thoughts"}
                  </button>
                ))}
              </div>

              {filteredMemories.length === 0 ? (
                <div className="flex h-40 items-center justify-center" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
                  No memories yet. Start chatting to create some.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMemories.map((m) => (
                    <MemoryItem
                      key={m.id}
                      memory={m}
                      expanded={expandedMemoryId === m.id}
                      onToggle={() => setExpandedMemoryId(expandedMemoryId === m.id ? null : m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 animate-fade-in"
            style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
            onClick={() => setPendingDelete(null)}
          />
          <div className="relative z-10 mx-4 w-full max-w-xs rounded-[10px] p-5 animate-fade-slide-up glass-panel font-mono">
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
                Delete chat?
              </p>
              <p className="mt-1.5 leading-relaxed" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                This will also remove the associated memories from the brain.
              </p>
              <p className="mt-2 truncate" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                &ldquo;{pendingDelete.title}&rdquo;
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-[6px] px-3 py-1.5 transition active:scale-95"
                style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(pendingDelete.id)}
                className="rounded-[6px] px-3 py-1.5 transition active:scale-95"
                style={{ fontSize: 11, fontWeight: 500, color: "var(--error)" }}
              >
                delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear all confirmation */}
      {pendingClearAll && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 animate-fade-in"
            style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
            onClick={() => setPendingClearAll(false)}
          />
          <div className="relative z-10 mx-4 w-full max-w-xs rounded-[10px] p-5 animate-fade-slide-up glass-panel font-mono">
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
                Clear everything?
              </p>
              <p className="mt-1.5 leading-relaxed" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                This will delete all {conversations.length} chat{conversations.length !== 1 ? "s" : ""} and all memories. This cannot be undone.
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingClearAll(false)}
                className="rounded-[6px] px-3 py-1.5 transition active:scale-95"
                style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="rounded-[6px] px-3 py-1.5 transition active:scale-95"
                style={{ fontSize: 11, fontWeight: 500, color: "var(--error)" }}
              >
                delete all
              </button>
            </div>
          </div>
        </div>
      )}

      <FloatNav route="history" />
    </div>
  );
}
