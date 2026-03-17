"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Upload, Loader2, Check, AlertTriangle, Brain, Moon, BookOpen } from "lucide-react";
import { parseConversations, type ParsedConversation } from "@/lib/chatgpt-parser";

type Phase = "idle" | "parsing" | "confirming" | "importing" | "complete" | "error";

interface LogEntry {
  type: "conversation" | "memory" | "dream" | "reflect" | "idle" | "decay" | "error";
  text: string;
  timestamp: number;
}

interface ImportStats {
  conversations: number;
  memories: number;
  dreams: number;
  reflections: number;
  idleDays: number;
}

export function ImportOverlay({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [parsed, setParsed] = useState<ParsedConversation[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats>({ conversations: 0, memories: 0, dreams: 0, reflections: 0, idleDays: 0 });
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
        // Direct JSON file
        const text = await file.text();
        jsonData = JSON.parse(text);
      } else {
        // ZIP file — use JSZip
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
    setStats({ conversations: 0, memories: 0, dreams: 0, reflections: 0, idleDays: 0 });
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
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== "importing") onClose(); }}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl overflow-hidden"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="t-heading font-mono" style={{ color: "var(--text)" }}>Import Chats</h2>
          {phase !== "importing" && (
            <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-dimmer)]">
              <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          {/* ── IDLE: Drop zone ── */}
          {phase === "idle" && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 rounded-lg py-12 cursor-pointer transition-colors hover:bg-[var(--surface-dimmer)]"
              style={{ border: "2px dashed var(--border)" }}
            >
              <Upload className="h-8 w-8" style={{ color: "var(--text-faint)" }} />
              <div className="text-center">
                <p className="t-btn" style={{ color: "var(--text)" }}>
                  Drop your ChatGPT export here
                </p>
                <p className="t-small mt-1" style={{ color: "var(--text-faint)" }}>
                  ZIP or conversations.json from ChatGPT Settings → Data Controls → Export
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* ── PARSING ── */}
          {phase === "parsing" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent)" }} />
              <p className="t-small" style={{ color: "var(--text-muted)" }}>Extracting chats...</p>
            </div>
          )}

          {/* ── CONFIRMING ── */}
          {phase === "confirming" && (
            <div className="space-y-4">
              <div className="rounded-lg px-4 py-3" style={{ background: "var(--surface-dimmer)" }}>
                <p className="t-btn" style={{ color: "var(--text)" }}>
                  Found {parsed.length} chats
                </p>
                {dateRange && (
                  <p className="t-small mt-1" style={{ color: "var(--text-muted)" }}>
                    {dateRange.from} → {dateRange.to}
                  </p>
                )}
                <p className="t-small mt-2" style={{ color: "var(--text-faint)" }}>
                  Chats will be imported chronologically with dream and introspection cycles
                  simulated during idle periods.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPhase("idle"); setParsed([]); }}
                  className="flex-1 rounded-md px-3 py-2 t-btn"
                  style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={startImport}
                  className="flex-1 rounded-md px-3 py-2 t-btn"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Import
                </button>
              </div>
            </div>
          )}

          {/* ── IMPORTING ── */}
          {phase === "importing" && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="t-small" style={{ color: "var(--text-muted)" }}>
                    {progress.current} / {progress.total} chats
                  </span>
                  {currentDate && (
                    <span className="t-small" style={{ color: "var(--text-faint)" }}>
                      {currentDate}
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bar-track)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Memories", value: stats.memories, icon: Brain },
                  { label: "Dreams", value: stats.dreams, icon: Moon },
                  { label: "Reflections", value: stats.reflections, icon: BookOpen },
                  { label: "Idle days", value: stats.idleDays, icon: AlertTriangle },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-md px-2 py-1.5 text-center" style={{ background: "var(--surface-dimmer)" }}>
                    <Icon className="h-3 w-3 mx-auto mb-0.5" style={{ color: "var(--text-faint)" }} />
                    <div className="t-btn" style={{ color: "var(--text)" }}>{value}</div>
                    <div className="t-tiny" style={{ color: "var(--text-faint)" }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Event log */}
              <div
                ref={logRef}
                className="h-48 overflow-y-auto rounded-md px-3 py-2 space-y-1"
                style={{ background: "var(--surface-dimmer)", border: "1px solid var(--border)" }}
              >
                {log.map((entry, i) => (
                  <div key={i} className="flex items-start gap-1.5 t-small" style={{ color: entry.type === "error" ? "var(--error, #e55)" : "var(--text-muted)" }}>
                    <span style={{ color: "var(--text-faint)" }}>
                      {entry.type === "conversation" && "💬"}
                      {entry.type === "dream" && "🌙"}
                      {entry.type === "reflect" && "📖"}
                      {entry.type === "idle" && "⏳"}
                      {entry.type === "decay" && "📉"}
                      {entry.type === "error" && "⚠️"}
                      {entry.type === "memory" && "🧠"}
                    </span>
                    <span>{entry.text}</span>
                  </div>
                ))}
                {log.length === 0 && (
                  <div className="flex items-center gap-2 t-small" style={{ color: "var(--text-faint)" }}>
                    <Loader2 className="h-3 w-3 animate-spin" /> Starting import...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {phase === "complete" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="rounded-full p-2" style={{ background: "var(--accent)", color: "white" }}>
                  <Check className="h-5 w-5" />
                </div>
                <p className="t-heading" style={{ color: "var(--text)" }}>Import complete</p>
                <p className="t-small" style={{ color: "var(--text-faint)" }}>
                  {formatDuration(elapsed)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Chats", value: stats.conversations },
                  { label: "Memories", value: stats.memories },
                  { label: "Dream cycles", value: stats.dreams },
                  { label: "Reflections", value: stats.reflections },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md px-3 py-2" style={{ background: "var(--surface-dimmer)" }}>
                    <div className="t-heading" style={{ color: "var(--text)" }}>{value}</div>
                    <div className="t-small" style={{ color: "var(--text-faint)" }}>{label}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={onClose}
                className="w-full rounded-md px-3 py-2 t-btn"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Done
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === "error" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4">
                <AlertTriangle className="h-6 w-6" style={{ color: "var(--error, #e55)" }} />
                <p className="t-small text-center" style={{ color: "var(--text-muted)" }}>{errorMsg}</p>
              </div>
              <button
                onClick={() => { setPhase("idle"); setErrorMsg(""); }}
                className="w-full rounded-md px-3 py-2 t-btn"
                style={{ background: "var(--surface-dimmer)", color: "var(--text)" }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
