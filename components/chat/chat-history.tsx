"use client";

import { useEffect, useRef, useState } from "react";
import { X, Trash2, PenSquare, AlertTriangle } from "lucide-react";
import type { Conversation } from "@/lib/chat-store";

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

function DeleteConfirm({
  conv,
  onConfirm,
  onCancel,
}: {
  conv: Conversation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
        onClick={onCancel}
      />
      <div
        className="relative z-10 mx-4 w-full max-w-xs rounded-[10px] p-5 animate-fade-slide-up glass-panel"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="t-btn" style={{ color: "var(--text)" }}>
              Delete chat?
            </p>
            <p className="mt-1.5 t-small leading-relaxed" style={{ color: "var(--text-muted)" }}>
              This will also remove the associated memories from the brain. This action cannot be undone.
            </p>
            <p className="mt-2 truncate t-small" style={{ color: "var(--text-faint)" }}>
              &ldquo;{conv.title}&rdquo;
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-[6px] px-3 py-1.5 t-btn transition active:scale-95"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-[6px] px-3 py-1.5 t-btn text-white transition active:scale-95"
            style={{ background: "#ef4444" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatHistory({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onClearAll,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conv: Conversation) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onNewChat: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [pendingClearAll, setPendingClearAll] = useState(false);

  useEffect(() => {
    if (!open) {
      setPendingDelete(null);
      setPendingClearAll(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingDelete) {
          setPendingDelete(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, pendingDelete]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      <div
        ref={backdropRef}
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      <div className="relative z-10 w-full sm:w-80 h-full flex flex-col glass-panel animate-slide-in-left">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 glass">
          <h2 className="t-heading" style={{ color: "var(--text)" }}>History</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewChat}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] transition"
              style={{ color: "var(--accent)" }}
              title="New chat"
            >
              <PenSquare className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] transition"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-8 text-center t-small" style={{ color: "var(--text-faint)" }}>
              No chats yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => {
                const isActive = conv.id === activeId;
                return (
                  <div
                    key={conv.id}
                    className="group flex items-start gap-2 rounded-[6px] px-3 py-2.5 transition cursor-pointer"
                    style={{
                      background: isActive ? "var(--surface-dim)" : "transparent",
                    }}
                    onClick={() => onSelect(conv)}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="truncate t-btn"
                        style={{ color: isActive ? "var(--accent)" : "var(--text)" }}
                      >
                        {conv.summary || conv.title}
                      </p>
                      <p className="mt-0.5 t-tiny flex items-center gap-1" style={{ color: "var(--text-faint)" }}>
                        {conv.source && conv.source !== "internal" && (
                          <span className="inline-flex items-center rounded px-1 py-px t-micro" style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}>
                            {conv.source === "chatgpt" ? "ChatGPT" : conv.source}
                          </span>
                        )}
                        {conv.messages.length} messages · {timeAgo(conv.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(conv);
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition rounded-[4px] p-1"
                      style={{ color: "var(--text-faint)" }}
                      title="Delete chat"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Clear all */}
        {conversations.length > 0 && (
          <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => setPendingClearAll(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-[6px] py-2 t-small transition active:scale-95"
              style={{ color: "#ef4444" }}
            >
              <Trash2 className="h-3 w-3" />
              Clear all chats & memories
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {pendingDelete && (
        <DeleteConfirm
          conv={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}

      {/* Clear all confirmation */}
      {pendingClearAll && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 animate-fade-in"
            style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
            onClick={() => setPendingClearAll(false)}
          />
          <div className="relative z-10 mx-4 w-full max-w-xs rounded-[10px] p-5 animate-fade-slide-up glass-panel">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="t-btn" style={{ color: "var(--text)" }}>
                  Clear everything?
                </p>
                <p className="mt-1.5 t-small leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  This will delete all {conversations.length} chat{conversations.length !== 1 ? "s" : ""} and all associated memories from the brain. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingClearAll(false)}
                className="rounded-[6px] px-3 py-1.5 t-btn transition active:scale-95"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onClearAll();
                  setPendingClearAll(false);
                }}
                className="rounded-[6px] px-3 py-1.5 t-btn text-white transition active:scale-95"
                style={{ background: "#ef4444" }}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
