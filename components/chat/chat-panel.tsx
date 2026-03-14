"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMemory } from "@/lib/memory-context";
import { Send, PenSquare, Clock } from "lucide-react";
import { BrainScanline } from "@/components/brain/brain-scanline";
import { ChatHistory } from "@/components/chat/chat-history";
import {
  loadConversations,
  saveConversation,
  deleteConversation,
  generateTitle,
} from "@/lib/chat-store";
import { getActiveModel } from "@/lib/model-settings";
import type { Conversation, ChatMessage } from "@/lib/chat-store";

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { refresh, retrievalSettings } = useMemory();

  // Load conversations and restore most recent on mount
  useEffect(() => {
    const convs = loadConversations();
    setConversations(convs);
    if (convs.length > 0) {
      setActiveId(convs[0].id);
      setMessages(convs[0].messages);
    }
  }, []);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(scrollToBottom, [messages]);

  const persistConversation = useCallback(
    (msgs: ChatMessage[], convId: string | null) => {
      if (msgs.length === 0) return convId;

      const now = new Date().toISOString();
      if (convId) {
        const conv: Conversation = {
          id: convId,
          title: generateTitle(msgs),
          messages: msgs,
          createdAt: conversations.find((c) => c.id === convId)?.createdAt || now,
          updatedAt: now,
        };
        saveConversation(conv);
        setConversations(loadConversations());
        return convId;
      } else {
        const id = crypto.randomUUID();
        const conv: Conversation = {
          id,
          title: generateTitle(msgs),
          messages: msgs,
          createdAt: now,
          updatedAt: now,
        };
        saveConversation(conv);
        setConversations(loadConversations());
        return id;
      }
    },
    [conversations]
  );

  const handleNewChat = () => {
    setMessages([]);
    setActiveId(null);
    setInput("");
    setHistoryOpen(false);
  };

  const handleLoadConversation = (conv: Conversation) => {
    setMessages(conv.messages);
    setActiveId(conv.id);
    setHistoryOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    // Extract user message summaries to delete associated memories
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      const summaries = conv.messages
        .filter((m) => m.role === "user")
        .map((m) =>
          m.content.length > 100 ? m.content.slice(0, 100) + "..." : m.content
        );
      if (summaries.length > 0) {
        fetch("/api/memories", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summaries }),
        }).then(() => refresh());
      }
    }

    deleteConversation(id);
    const updated = loadConversations();
    setConversations(updated);
    if (activeId === id) {
      if (updated.length > 0) {
        setActiveId(updated[0].id);
        setMessages(updated[0].messages);
      } else {
        setActiveId(null);
        setMessages([]);
      }
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Persist immediately on first message to create the conversation
    const convId = persistConversation(newMessages, activeId);
    setActiveId(convId);

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          model: getActiveModel(),
          recallLimit: retrievalSettings.recallLimit,
          minImportance: retrievalSettings.minImportance || undefined,
          minDecay: retrievalSettings.minDecay || undefined,
          types: retrievalSettings.enabledTypes,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Failed to connect");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const json = JSON.parse(data);
            if (json.content) {
              fullContent += json.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: fullContent,
                };
                return updated;
              });
            }
          } catch {
            // skip
          }
        }
      }

      // Persist after assistant response
      const finalMessages = [...newMessages, { role: "assistant" as const, content: fullContent }];
      setMessages(finalMessages);
      persistConversation(finalMessages, convId);

      // Generate summary in background after first exchange
      if (finalMessages.length <= 3) {
        fetch("/api/chat/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalMessages }),
        })
          .then((r) => r.json())
          .then(({ summary }) => {
            if (summary && convId) {
              const convs = loadConversations();
              const conv = convs.find((c) => c.id === convId);
              if (conv) {
                conv.summary = summary;
                saveConversation(conv);
                setConversations(loadConversations());
              }
            }
          })
          .catch(() => {});
      }

      refresh();
    } catch (err) {
      const errorMsg = `Error: ${err instanceof Error ? err.message : "Connection failed"}. Is the MLX server running?`;
      const finalMessages = [...newMessages, { role: "assistant" as const, content: errorMsg }];
      setMessages(finalMessages);
      persistConversation(finalMessages, convId);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col pt-16">
      {/* Top-left: History button (below navbar) */}
      <button
        onClick={() => setHistoryOpen(true)}
        className="absolute top-[68px] left-5 z-30 transition active:scale-95"
        style={{ color: "var(--text-faint)" }}
        title="Chat history"
      >
        <Clock className="h-4 w-4" />
      </button>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-5 animate-fade-slide-up">
            <BrainScanline size={120} />
            <div className="text-center">
              <p className="text-xs" style={{ color: "var(--text-muted)", letterSpacing: "0.02em" }}>
                Start a conversation
              </p>
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                Messages become memories in the neural map
              </p>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-xl space-y-4 pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-[8px] px-4 py-2.5 ${
                  msg.role === "user" ? "" : ""
                }`}
                style={msg.role === "user" ? {
                  background: "var(--accent)",
                  color: "#fff",
                } : {
                  color: "var(--text)",
                }}
              >
                <p className="whitespace-pre-wrap text-xs leading-relaxed">
                  {msg.content}
                  {streaming &&
                    i === messages.length - 1 &&
                    msg.role === "assistant" && (
                      <span className="ml-1 inline-block h-3.5 w-0.5 animate-pulse" style={{ background: "var(--accent)" }} />
                    )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl items-center gap-3 py-3"
          style={{ borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--border)" }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && sendMessage()
            }
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--text)" }}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="shrink-0 transition active:scale-95 disabled:opacity-20"
            style={{ color: "var(--accent)" }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleNewChat}
            className="shrink-0 transition active:scale-95"
            style={{ color: "var(--text-faint)" }}
            title="New chat"
          >
            <PenSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* History panel */}
      <ChatHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onSelect={handleLoadConversation}
        onDelete={handleDeleteConversation}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
