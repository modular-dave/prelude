"use client";

import { useEffect, useState, useCallback } from "react";
import { loadSystemPrompt, saveSystemPrompt } from "@/lib/system-prompt";
import { modelDisplayName } from "@/lib/model-settings";

export function SettingsPanel({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [cortexSummary, setCortexSummary] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");

  const refreshActiveModel = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setActiveModel(data.active || null);
    } catch {
      // ignore
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
      setCortexSummary(
        connected.length > 0 ? connected.join(" + ") : "Setup needed"
      );
    } catch {
      setCortexSummary(null);
    }
  }, []);

  useEffect(() => {
    setSystemPrompt(loadSystemPrompt());
    refreshActiveModel();
    refreshCortexSummary();
  }, [refreshActiveModel, refreshCortexSummary]);

  return (
    <div className="p-4 font-mono">
      <h2
        style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}
      >
        settings
      </h2>

      {/* System prompt toggle */}
      <div className="mt-3">
        <button
          onClick={() => setPromptOpen((v) => !v)}
          className="text-btn"
          style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}
        >
          {promptOpen ? "system prompt \u2212" : "system prompt +"}
        </button>
        {systemPrompt.trim() && !promptOpen && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 400,
              color: "var(--text-faint)",
              marginLeft: 6,
            }}
          >
            active
          </span>
        )}
      </div>

      {promptOpen && (
        <div className="mt-2">
          <p
            style={{
              fontSize: 9,
              fontWeight: 400,
              lineHeight: 1.6,
              color: "var(--text-faint)",
            }}
          >
            custom instructions prepended to every chat
          </p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            onBlur={() => saveSystemPrompt(systemPrompt)}
            placeholder="You are a helpful assistant..."
            rows={4}
            className="mt-1 w-full resize-y rounded-[4px] px-2 py-1.5 bg-transparent font-mono outline-none"
            style={{
              fontSize: 11,
              fontWeight: 400,
              lineHeight: 1.6,
              border: "1px solid var(--border)",
              color: "var(--text)",
              minHeight: 60,
              maxHeight: 200,
            }}
          />
          {systemPrompt.trim() && (
            <p
              style={{
                fontSize: 9,
                fontWeight: 400,
                color: "var(--text-faint)",
                marginTop: 4,
              }}
            >
              custom prompt active
            </p>
          )}
        </div>
      )}

      {/* Menu items */}
      <div className="mt-4 space-y-2">
        <div>
          <button
            onClick={() => onNavigate("models")}
            className="text-btn"
            style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}
          >
            models
          </button>
          <span
            style={{
              fontSize: 9,
              fontWeight: 400,
              color: "var(--text-faint)",
              marginLeft: 6,
            }}
          >
            {activeModel ? modelDisplayName(activeModel) : "no model"}
          </span>
        </div>

        <div>
          <button
            onClick={() => onNavigate("cortex")}
            className="text-btn"
            style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}
          >
            cortex
          </button>
          {cortexSummary && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 400,
                color: "var(--text-faint)",
                marginLeft: 6,
              }}
            >
              {cortexSummary}
            </span>
          )}
        </div>

        <div>
          <button
            onClick={() => onNavigate("import")}
            className="text-btn"
            style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}
          >
            import
          </button>
          <span
            style={{
              fontSize: 9,
              fontWeight: 400,
              color: "var(--text-faint)",
              marginLeft: 6,
            }}
          >
            upload conversation files
          </span>
        </div>
      </div>
    </div>
  );
}
