"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Memory {
  id: number;
  memory_type: string;
  summary: string;
  importance: number;
  created_at: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemories, setShowMemories] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(scrollToBottom, [messages]);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memories?limit=20");
      const data = await res.json();
      setMemories(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
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

      // Refresh memories after response
      fetchMemories();
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Connection failed"}. Is Ollama running? (ollama serve)`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Prelude</h1>
            <p className="text-sm text-neutral-500">
              AI with persistent memory
            </p>
          </div>
          <button
            onClick={() => setShowMemories(!showMemories)}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
          >
            {showMemories ? "Hide" : "Show"} Memories ({memories.length})
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-lg text-neutral-500">
                  Start a conversation
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  Powered by Ollama (qwen2.5:1.5b) + Clude memory
                </p>
              </div>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.content}
                    {streaming &&
                      i === messages.length - 1 &&
                      msg.role === "assistant" && (
                        <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-neutral-400" />
                      )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-neutral-800 px-6 py-4">
          <div className="mx-auto flex max-w-3xl gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 outline-none transition focus:border-neutral-500"
              disabled={streaming}
            />
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Memory sidebar */}
      {showMemories && (
        <div className="w-80 overflow-y-auto border-l border-neutral-800 bg-neutral-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-400">
            Memories
          </h2>
          {memories.length === 0 ? (
            <p className="text-xs text-neutral-600">No memories yet</p>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                      {m.memory_type}
                    </span>
                    <span className="text-[10px] text-neutral-600">
                      {(m.importance * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-neutral-300">
                    {m.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
