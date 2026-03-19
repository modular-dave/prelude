"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMemory } from "@/lib/memory-context";
import { X } from "lucide-react";
import { BrainScanline } from "@/components/brain/brain-scanline";
import { ChatHistory } from "@/components/chat/chat-history";
import {
  loadConversations,
  saveConversation,
  updateConversation,
  deleteConversation,
  clearAllConversations,
  generateTitle,
} from "@/lib/chat-store";
import { getActiveModel } from "@/lib/model-settings";
import { loadSystemPrompt } from "@/lib/system-prompt";
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

  const refreshConversations = useCallback(async () => {
    const convs = await loadConversations();
    setConversations(convs);
    return convs;
  }, []);

  // Load conversations on mount — start with a blank new chat
  useEffect(() => {
    refreshConversations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(scrollToBottom, [messages]);

  const persistConversation = useCallback(
    async (msgs: ChatMessage[], convId: string | null): Promise<string | null> => {
      if (msgs.length === 0) return convId;

      const now = new Date().toISOString();
      const title = generateTitle(msgs);

      if (convId) {
        await updateConversation(convId, { title, messages: msgs });
        refreshConversations();
        return convId;
      } else {
        const id = crypto.randomUUID();
        const conv: Conversation = {
          id,
          title,
          messages: msgs,
          createdAt: now,
          updatedAt: now,
        };
        await saveConversation(conv);
        refreshConversations();
        return id;
      }
    },
    [refreshConversations]
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
    // DELETE route cascade-deletes associated memories
    await deleteConversation(id);
    const updated = await refreshConversations();
    refresh();
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

  const handleClearAll = async () => {
    // Delete all memories from the brain — await both operations to prevent race conditions
    await Promise.all([
      fetch("/api/memories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      }),
      clearAllConversations(),
    ]);
    await refresh();
    setConversations([]);
    setActiveId(null);
    setMessages([]);
    setHistoryOpen(false);
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
    const convId = await persistConversation(newMessages, activeId);
    setActiveId(convId);

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          conversationId: convId,
          recallLimit: retrievalSettings.recallLimit,
          minImportance: retrievalSettings.minImportance || undefined,
          minDecay: retrievalSettings.minDecay || undefined,
          types: retrievalSettings.enabledTypes,
          systemPrompt: loadSystemPrompt(),
          clinamenLimit: retrievalSettings.clinamenLimit,
          clinamenMinImportance: retrievalSettings.clinamenMinImportance,
          clinamenMaxRelevance: retrievalSettings.clinamenMaxRelevance,
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let msg = "Failed to connect";
        try { msg = JSON.parse(text).message || msg; } catch { /* non-JSON error response */ }
        throw new Error(msg);
      }

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
          } catch { /* partial SSE chunk — expected during streaming */ }
        }
      }

      // Persist after assistant response
      const finalMessages = [...newMessages, { role: "assistant" as const, content: fullContent }];
      setMessages(finalMessages);
      await persistConversation(finalMessages, convId);

      // NOTE: assistant response memory is stored server-side in the chat route's TransformStream flush handler
      // No need to store it again here — that caused duplicate memories.

      // Generate summary in background after first exchange
      if (finalMessages.length <= 3 && convId) {
        fetch("/api/chat/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalMessages }),
        })
          .then((r) => r.json())
          .then(({ summary }) => {
            if (summary && convId) {
              updateConversation(convId, { summary }).then(() => refreshConversations());
            }
          })
          .catch(() => {});
      }

      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      const finalMessages = [...newMessages, { role: "assistant" as const, content: msg }];
      setMessages(finalMessages);
      await persistConversation(finalMessages, convId);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col pt-16">
      {/* Top-left: History button (below navbar) */}
      <button
        onClick={() => setHistoryOpen(true)}
        className="absolute top-[68px] left-5 z-30 font-mono transition active:scale-95"
        style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}
        title="Chat history"
      >
        history
      </button>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-5 animate-fade-slide-up">
            <BrainScanline size={120} />
            <div className="text-center">
              <p className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                Start a new chat
              </p>
              <p className="font-mono mt-1.5" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                Messages become memories in the neural map
              </p>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-xl space-y-3 pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <span className="font-mono mb-0.5" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                {msg.role === "user" ? "you" : "brain"}
              </span>
              <div className="max-w-[80%]">
                <p
                  className="font-mono whitespace-pre-wrap"
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    lineHeight: 1.5,
                    color: msg.role === "user" ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {msg.content}
                  {streaming &&
                    i === messages.length - 1 &&
                    msg.role === "assistant" && (
                      <span className="ml-1 inline-block h-3 w-px animate-pulse" style={{ background: "var(--accent)" }} />
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
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>&gt;</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && sendMessage()
            }
            placeholder="Type a message..."
            className="flex-1 bg-transparent outline-none font-mono"
            style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="shrink-0 font-mono transition active:scale-95 disabled:opacity-20"
            style={{ fontSize: 9, fontWeight: 400, color: "var(--accent)" }}
          >
            send
          </button>
          <button
            onClick={handleNewChat}
            className="shrink-0 font-mono transition active:scale-95"
            style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}
            title="New chat"
          >
            new
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
        onClearAll={handleClearAll}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
