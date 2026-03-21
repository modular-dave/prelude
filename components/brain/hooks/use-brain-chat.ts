"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  loadConversations,
  saveConversation,
  updateConversation,
  deleteConversation,
  clearAllConversations,
  generateTitle,
} from "@/lib/chat-store";
import { loadSystemPrompt } from "@/lib/system-prompt";
import type { Conversation, ChatMessage } from "@/lib/chat-store";
import type { RetrievalSettings } from "@/lib/retrieval-settings";

export interface BrainChatState {
  chatInput: string;
  setChatInput: (v: string) => void;
  chatStreaming: boolean;
  chatMessages: ChatMessage[];
  setChatMessages: (msgs: ChatMessage[]) => void;
  chatConvId: string | null;
  setChatConvId: (id: string | null) => void;
  historyOpen: boolean;
  setHistoryOpen: (v: boolean) => void;
  conversations: Conversation[];
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  refreshConversations: () => Promise<Conversation[]>;
  handleNewBrainChat: () => void;
  handleLoadConversation: (conv: Conversation) => void;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleClearAll: () => Promise<void>;
  sendBrainChat: () => Promise<void>;
}

/**
 * Manages the brain chat panel: message state, conversation persistence,
 * streaming inference, and history CRUD.
 */
export function useBrainChat(
  retrievalSettings: RetrievalSettings,
  refresh: () => void,
  setChatOpen: (v: boolean) => void,
  setDetailsOpen: (v: boolean) => void,
): BrainChatState {
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat messages
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages]);

  const refreshConversations = useCallback(async () => {
    const convs = await loadConversations();
    setConversations(convs);
    return convs;
  }, []);

  // Load conversations on mount
  useEffect(() => { refreshConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewBrainChat = useCallback(() => {
    setChatMessages([]);
    setChatConvId(null);
    setChatInput("");
    setHistoryOpen(false);
  }, []);

  const handleLoadConversation = useCallback((conv: Conversation) => {
    setChatMessages(conv.messages);
    setChatConvId(conv.id);
    setHistoryOpen(false);
    setChatOpen(true);
    setDetailsOpen(false);
  }, [setChatOpen, setDetailsOpen]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    const updated = await refreshConversations();
    refresh();
    if (chatConvId === id) {
      if (updated.length > 0) {
        setChatConvId(updated[0].id);
        setChatMessages(updated[0].messages);
      } else {
        setChatConvId(null);
        setChatMessages([]);
      }
    }
  }, [chatConvId, refreshConversations, refresh]);

  const handleClearAll = useCallback(async () => {
    fetch("/api/memories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).then(() => refresh());
    await clearAllConversations();
    setConversations([]);
    setChatConvId(null);
    setChatMessages([]);
    setHistoryOpen(false);
  }, [refresh]);

  const sendBrainChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatStreaming(true);

    // Persist conversation
    const now = new Date().toISOString();
    const title = generateTitle(newMessages);
    let convId = chatConvId;

    if (convId) {
      await updateConversation(convId, { title, messages: newMessages });
    } else {
      convId = crypto.randomUUID();
      const conv: Conversation = { id: convId, title, messages: newMessages, createdAt: now, updatedAt: now };
      await saveConversation(conv);
      setChatConvId(convId);
    }

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setChatMessages([...newMessages, assistantMsg]);

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
        try { msg = JSON.parse(text).message || msg; } catch { /* non-JSON */ }
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
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullContent };
                return updated;
              });
            }
          } catch { /* skip */ }
        }
      }

      const finalMessages = [...newMessages, { role: "assistant" as const, content: fullContent }];
      setChatMessages(finalMessages);
      await updateConversation(convId!, { title: generateTitle(finalMessages), messages: finalMessages });
      refreshConversations();

      // Rapid refresh cascade: memory processing takes ~1-3s
      // Poll at 500ms, 1.5s, 3s to catch it ASAP
      setTimeout(() => refresh(), 500);
      setTimeout(() => refresh(), 1500);
      setTimeout(() => refresh(), 3000);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Connection failed";
      const isServiceError = rawMsg.includes("inference") || rawMsg.includes("Supabase") || rawMsg.includes("Model");
      const errorMsg = isServiceError ? rawMsg : `Error: ${rawMsg}`;
      const finalMessages = [...newMessages, { role: "assistant" as const, content: errorMsg }];
      setChatMessages(finalMessages);
      if (convId) await updateConversation(convId, { title: generateTitle(finalMessages), messages: finalMessages });
    } finally {
      setChatStreaming(false);
    }
  }, [chatInput, chatStreaming, chatMessages, chatConvId, retrievalSettings, refresh, refreshConversations]);

  return {
    chatInput, setChatInput,
    chatStreaming,
    chatMessages, setChatMessages,
    chatConvId, setChatConvId,
    historyOpen, setHistoryOpen,
    conversations,
    chatScrollRef,
    refreshConversations,
    handleNewBrainChat,
    handleLoadConversation,
    handleDeleteConversation,
    handleClearAll,
    sendBrainChat,
  };
}
