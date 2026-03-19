"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { parseConversations, type ParsedConversation } from "@/lib/chatgpt-parser";

// ── Types ───────────────────────────────────────────────────────────

export type Phase = "idle" | "parsing" | "confirming" | "importing" | "complete" | "error";

export interface LogEntry {
  type: "conversation" | "memory" | "dream" | "reflect" | "idle" | "decay" | "error";
  text: string;
  timestamp: number;
}

export interface ImportStats {
  conversations: number;
  memories: number;
  dreams: number;
  reflections: number;
  idleDays: number;
}

export const LOG_PREFIX: Record<LogEntry["type"], string> = {
  conversation: "chat",
  dream: "dream",
  reflect: "reflect",
  idle: "idle",
  decay: "decay",
  error: "error",
  memory: "memory",
};

const EMPTY_STATS: ImportStats = { conversations: 0, memories: 0, dreams: 0, reflections: 0, idleDays: 0 };

// ── Hook ────────────────────────────────────────────────────────────

export function useImport() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [parsed, setParsed] = useState<ParsedConversation[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats>(EMPTY_STATS);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const addLog = useCallback((entry: Omit<LogEntry, "timestamp">) => {
    setLog((prev) => [...prev.slice(-200), { ...entry, timestamp: Date.now() }]);
  }, []);

  const handleSSE = useCallback((event: string, data: any) => {
    switch (event) {
      case "progress":
        setProgress({ current: data.current, total: data.total });
        break;

      case "conversation":
        setStats((s) => ({ ...s, conversations: s.conversations + 1 }));
        setCurrentDate(data.createdAt ? new Date(data.createdAt).toLocaleDateString() : null);
        addLog({ type: "conversation", text: `${data.title} (${data.memoriesCreated} memories)` });
        break;

      case "memory":
        setStats((s) => ({ ...s, memories: s.memories + 1 }));
        break;

      case "idle":
        setStats((s) => ({ ...s, idleDays: s.idleDays + (data.gapDays || 0) }));
        addLog({
          type: "idle",
          text: `${data.gapDays} days of silence — ${data.dreamCycles} dreams, ${data.reflectCycles} reflections`,
        });
        break;

      case "dream":
        setStats((s) => ({ ...s, dreams: s.dreams + 1 }));
        addLog({
          type: "dream",
          text: data.idle
            ? `Idle dream: ${(data.emergence || "").slice(0, 80)}...`
            : `Dream cycle: ${(data.emergence || "").slice(0, 80)}...`,
        });
        break;

      case "reflect":
        setStats((s) => ({ ...s, reflections: s.reflections + 1 }));
        addLog({ type: "reflect", text: data.idle ? "Idle reflection" : "Reflection complete" });
        break;

      case "decay":
        addLog({ type: "decay", text: `Decay simulated: ${data.period}` });
        break;

      case "error":
        addLog({ type: "error", text: data.message });
        if (data.fatal) {
          setErrorMsg(data.message);
          setPhase("error");
        }
        break;

      case "complete":
        setElapsed(data.elapsed || 0);
        setStats({
          conversations: data.totalConversations,
          memories: data.totalMemories,
          dreams: data.totalDreams,
          reflections: data.totalReflections,
          idleDays: data.totalIdleDays || 0,
        });
        setPhase("complete");
        break;
    }
  }, [addLog]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".zip") && !file.name.endsWith(".json")) {
      setErrorMsg("Please drop a .zip or .json file");
      setPhase("error");
      return;
    }

    setPhase("parsing");

    try {
      let jsonData: unknown[];

      if (file.name.endsWith(".json")) {
        const text = await file.text();
        jsonData = JSON.parse(text);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);
        const convFile = zip.file("conversations.json");
        if (!convFile) {
          setErrorMsg("No conversations.json found in ZIP");
          setPhase("error");
          return;
        }
        const text = await convFile.async("text");
        jsonData = JSON.parse(text);
      }

      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        setErrorMsg("No chats found in file");
        setPhase("error");
        return;
      }

      const conversations = parseConversations(jsonData);
      if (conversations.length === 0) {
        setErrorMsg("No valid chats found after parsing");
        setPhase("error");
        return;
      }

      setParsed(conversations);
      setDateRange({
        from: new Date(conversations[0].createdAt).toLocaleDateString(),
        to: new Date(conversations[conversations.length - 1].createdAt).toLocaleDateString(),
      });
      setPhase("confirming");
    } catch (err) {
      setErrorMsg(`Failed to parse file: ${err}`);
      setPhase("error");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const startImport = useCallback(async () => {
    setPhase("importing");
    setStats(EMPTY_STATS);
    setLog([]);
    setProgress({ current: 0, total: parsed.length });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations: parsed, source: "chatgpt" }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        setErrorMsg("Import request failed");
        setPhase("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSE(eventType, data);
            } catch {
              // skip malformed
            }
            eventType = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMsg(`Import failed: ${err}`);
        setPhase("error");
      }
    }
  }, [parsed, handleSSE]);

  const reset = useCallback(() => {
    setPhase("idle");
    setParsed([]);
    setErrorMsg("");
  }, []);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  return {
    // State
    phase, parsed, dateRange, progress, currentDate,
    stats, log, elapsed, errorMsg,
    // Refs
    logRef, fileRef,
    // Actions
    handleFile, handleDrop, handleDragOver,
    startImport, reset, formatDuration,
  };
}
