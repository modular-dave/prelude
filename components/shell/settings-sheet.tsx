"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ImportOverlay } from "@/components/shell/import-overlay";
import { loadSystemPrompt, saveSystemPrompt } from "@/lib/system-prompt";
import { modelDisplayName } from "@/lib/model-settings";

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [cortexSummary, setCortexSummary] = useState<string | null>(null);

  const refreshActiveModel = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setActiveModelState(data.active || null);
    } catch (e) {
      console.warn("[settings] Failed to fetch active model:", e);
    }
  }, []);

  const refreshCortexSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      const connected = [
        data.supabase?.connected && "DB",
        data.inference?.connected && "LLM",
      ].filter(Boolean);
      setCortexSummary(connected.length > 0 ? connected.join(" + ") : "Setup needed");
    } catch {
      setCortexSummary(null);
    }
  }, []);

  useEffect(() => {
    if (open) setSystemPrompt(loadSystemPrompt());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    refreshActiveModel();
    refreshCortexSummary();
  }, [open, refreshActiveModel, refreshCortexSummary]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) { document.body.style.overflow = "hidden"; } else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        ref={backdropRef}
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.08)" }}
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full sm:w-80 h-full overflow-y-auto font-mono animate-slide-in-right"
        style={{ background: "var(--bg)", borderLeft: "2px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="t-heading" style={{ color: "var(--text)" }}>settings</span>
          <button onClick={onClose} className="text-btn t-body" style={{ color: "var(--text-faint)" }}>
            ×
          </button>
        </div>

        <div className="p-4 space-y-1">
          {/* System Prompt */}
          <button
            onClick={() => setPromptOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 py-1.5 text-left transition active:scale-[0.99]"
          >
            <span className="t-body" style={{ color: "var(--text-faint)" }}>
              {promptOpen ? "−" : "+"} system prompt
            </span>
            {systemPrompt.trim() && (
              <span className="h-[5px] w-[5px] rounded-full" style={{ background: "var(--accent)" }} />
            )}
          </button>
          {promptOpen && (
            <div className="pl-4 space-y-2 pb-2 animate-fade-slide-up">
              <p className="t-micro" style={{ color: "var(--text-faint)", lineHeight: 1.6 }}>
                custom instructions prepended to every chat
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                onBlur={() => saveSystemPrompt(systemPrompt)}
                placeholder="You are a helpful assistant..."
                rows={4}
                className="w-full resize-y bg-transparent px-0 py-1 outline-none t-body"
                style={{
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text)",
                  minHeight: "60px",
                  maxHeight: "200px",
                  lineHeight: 1.6,
                }}
              />
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* Model */}
          <Link
            href="/models"
            onClick={onClose}
            className="flex w-full items-center gap-1.5 py-1.5 text-left transition"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="flex-1 t-body">models</span>
            <span className="truncate max-w-[120px] t-micro" style={{ color: "var(--text-faint)" }}>
              {activeModel ? modelDisplayName(activeModel) : "—"}
            </span>
          </Link>

          {/* Cortex */}
          <Link
            href="/cortex"
            onClick={onClose}
            className="flex w-full items-center gap-1.5 py-1.5 text-left transition"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="flex-1 t-body">cortex</span>
            {cortexSummary && (
              <span className="truncate max-w-[120px] t-micro" style={{ color: "var(--text-faint)" }}>
                {cortexSummary}
              </span>
            )}
          </Link>

          {/* Stats */}
          <Link
            href="/stats"
            onClick={onClose}
            className="flex w-full items-center gap-1.5 py-1.5 text-left transition"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="t-body">stats</span>
          </Link>

          {/* History */}
          <Link
            href="/history"
            onClick={onClose}
            className="flex w-full items-center gap-1.5 py-1.5 text-left transition"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="t-body">memory history</span>
          </Link>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* Import */}
          <button
            onClick={() => setImportOpen(true)}
            className="flex w-full items-center gap-1.5 py-1.5 text-left transition"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="t-body">import chats</span>
          </button>
        </div>
      </div>

      {importOpen && <ImportOverlay onClose={() => setImportOpen(false)} />}
    </div>
  );
}
