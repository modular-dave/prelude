"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, ChevronRight } from "lucide-react";
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

  // Model summary (just for the settings link label)
  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  // Cortex summary
  const [cortexSummary, setCortexSummary] = useState<string | null>(null);

  // Fetch active model name for the link label
  const refreshActiveModel = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setActiveModelState(data.active || null);
    } catch {
      // ignore
    }
  }, []);

  // Fetch cortex config summary
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

  // Load system prompt when sheet opens
  useEffect(() => {
    if (open) {
      setSystemPrompt(loadSystemPrompt());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    refreshActiveModel();
    refreshCortexSummary();
  }, [open, refreshActiveModel, refreshCortexSummary]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        ref={backdropRef}
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      <div className="relative z-10 w-full sm:w-96 h-full overflow-y-auto glass-panel animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 glass">
          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>Settings</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] transition"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {/* System Prompt */}
          <button
            onClick={() => setPromptOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)" }}
          >
            <span className="flex-1">System Prompt</span>
            {systemPrompt.trim() && (
              <span style={{ fontSize: "9px", fontWeight: 400, color: "var(--accent)" }}>
                Active
              </span>
            )}
            {promptOpen ? (
              <ChevronRight className="h-3.5 w-3.5 rotate-90" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {promptOpen && (
            <div className="space-y-2 px-1 pb-2 animate-fade-slide-up">
              <p style={{ fontSize: "9px", fontWeight: 400, lineHeight: 1.6, color: "var(--text-faint)" }}>
                Custom instructions prepended to every chat.
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => {
                  setSystemPrompt(e.target.value);
                }}
                onBlur={() => {
                  saveSystemPrompt(systemPrompt);
                }}
                placeholder="You are a helpful assistant..."
                rows={4}
                className="w-full resize-y rounded-[6px] px-2.5 py-2 bg-transparent outline-none"
                style={{
                  fontSize: "11px",
                  fontWeight: 400,
                  lineHeight: 1.6,
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  minHeight: "60px",
                  maxHeight: "200px",
                }}
              />
              {systemPrompt.trim() && (
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                  <span style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}>
                    Custom prompt active
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Model — link to dedicated page */}
          <Link
            href="/models"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="flex-1">Model</span>
            <span className="truncate max-w-[120px]" style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}>
              {activeModel ? modelDisplayName(activeModel) : "No model"}
            </span>
          </Link>

          {/* Cortex — link to dedicated page */}
          <Link
            href="/cortex"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="flex-1">Cortex</span>
            {cortexSummary && (
              <span className="truncate max-w-[120px]" style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}>
                {cortexSummary}
              </span>
            )}
          </Link>

          {/* Stats link */}
          <Link
            href="/stats"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="flex-1">Stats</span>
          </Link>

          {/* History link */}
          <Link
            href="/history"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)", textDecoration: "none" }}
          >
            <span className="flex-1">Memory History</span>
          </Link>

          {/* Import conversations */}
          <button
            onClick={() => setImportOpen(true)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left transition"
            style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-muted)" }}
          >
            <span className="flex-1">Import Chats</span>
          </button>

        </div>
      </div>

      {/* Import overlay */}
      {importOpen && <ImportOverlay onClose={() => setImportOpen(false)} />}
    </div>
  );
}
