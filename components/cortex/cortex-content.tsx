"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Power,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────

interface CortexConfig {
  supabase: { url: string | null; connected: boolean };
  inference: {
    baseUrl: string | null;
    model: string | null;
    provider: string;
    connected: boolean;
  };
  ownerWallet: string | null;
  features: Record<string, boolean>;
}

// ── Shared Content ──────────────────────────────────────────────────

export function CortexContent() {
  const [config, setConfig] = useState<CortexConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Section open states
  const [supabaseOpen, setSupabaseOpen] = useState(false);

  // Supabase form
  const [sbUrl, setSbUrl] = useState("");
  const [sbKey, setSbKey] = useState("");
  const [sbTesting, setSbTesting] = useState(false);
  const [sbSaving, setSbSaving] = useState(false);
  const [sbResult, setSbResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  const refreshConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfig(data);
      // Pre-fill supabase URL if available
      if (data.supabase?.url) setSbUrl(data.supabase.url);
    } catch (e) {
      console.warn("[cortex] Failed to load config:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  // ── Supabase handlers ──

  const handleSupabaseTest = async () => {
    setSbTesting(true);
    setSbResult(null);
    try {
      const res = await fetch("/api/cortex/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", url: sbUrl, serviceKey: sbKey }),
      });
      setSbResult(await res.json());
    } catch {
      setSbResult({ ok: false, error: "Request failed" });
    }
    setSbTesting(false);
  };

  const handleSupabaseSave = async () => {
    setSbSaving(true);
    try {
      await fetch("/api/cortex/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", url: sbUrl, serviceKey: sbKey }),
      });
      await refreshConfig();
    } catch (e) {
      console.warn("[cortex] Failed to save Supabase config:", e);
    }
    setSbSaving(false);
  };

  // ── Service disconnect handlers ──

  const handleDisconnect = async (service: "supabase" | "inference") => {
    try {
      if (service === "supabase") {
        await fetch("/api/cortex/supabase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "disconnect" }),
        });
      } else if (service === "inference") {
        await fetch("/api/cortex/inference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "disconnect" }),
        });
      }
      await refreshConfig();
    } catch (e) {
      console.warn("[cortex] Failed to disconnect service:", e);
    }
  };

  // ── Render ──

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2
          className="h-5 w-5 animate-spin"
          style={{ color: "var(--accent)" }}
        />
      </div>
    );
  }

  return (
    <div className="font-mono">
      {/* ── Service Status ── */}
      <div
        className="mt-6 rounded-[8px] px-4 py-3"
        style={{
          background: "var(--surface-dim)",
          border: "1px solid var(--border)",
        }}
      >
        <h2 className="mb-2 t-heading" style={{ color: "var(--text)" }}>
          Services
        </h2>
        <div className="space-y-1.5">
          {([
            {
              key: "supabase" as const,
              name: "Supabase",
              connected: config?.supabase?.connected,
              detail: config?.supabase?.url,
              required: true,
            },
            {
              key: "inference" as const,
              name: "Inference",
              connected: config?.inference?.connected,
              detail: config?.inference?.provider,
              required: true,
            },
          ]).map((svc) => (
            <div
              key={svc.name}
              className="group flex items-center gap-2 rounded-[6px] px-2.5 py-1.5"
              style={{ background: "var(--surface)" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: svc.connected
                    ? "var(--success)"
                    : svc.required
                      ? "var(--error)"
                      : "var(--text-faint)",
                }}
              />
              <span className="t-body" style={{ color: "var(--text)" }}>
                {svc.name}
              </span>
              {svc.detail && (
                <span
                  className="ml-auto truncate max-w-[180px] t-tiny"
                  style={{ color: "var(--text-faint)" }}
                >
                  {svc.detail}
                </span>
              )}
              {svc.connected && (
                <button
                  onClick={() => handleDisconnect(svc.key)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition p-0.5 rounded"
                  style={{ color: "var(--text-faint)" }}
                  title={`Disconnect ${svc.name}`}
                >
                  <Power className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          {config?.inference?.model && (
            <div
              className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5"
              style={{ background: "var(--surface)" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--text-faint)" }}
              />
              <span className="t-body" style={{ color: "var(--text)" }}>
                Model
              </span>
              <span
                className="ml-auto truncate max-w-[180px] t-tiny"
                style={{ color: "var(--text-faint)" }}
              >
                {config.inference.model}
              </span>
            </div>
          )}
        </div>
        {config?.features && Object.keys(config.features).length > 0 && (
          <>
            <h2 className="mb-2 mt-3 t-heading" style={{ color: "var(--text)" }}>
              Features
            </h2>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(config.features).map(([key, enabled]) => (
                <div
                  key={key}
                  className="flex items-center gap-1.5 rounded-[4px] px-2 py-1"
                  style={{ background: "var(--surface)" }}
                >
                  <span
                    className="h-1 w-1 shrink-0 rounded-full"
                    style={{
                      background: enabled ? "var(--success)" : "var(--text-faint)",
                    }}
                  />
                  <span
                    className="truncate t-tiny"
                    style={{ color: enabled ? "var(--text)" : "var(--text-faint)" }}
                  >
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {/* ── Supabase Setup ── */}
        <button
          onClick={() => setSupabaseOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-heading transition"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="flex-1">Supabase</span>
          {config?.supabase?.connected && (
            <span className="t-tiny" style={{ color: "var(--success)" }}>
              Connected
            </span>
          )}
          {supabaseOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {supabaseOpen && (
          <div className="space-y-3 px-1 pb-2 animate-fade-slide-up">
            <p className="t-body leading-relaxed" style={{ color: "var(--text-faint)" }}>
              Connect to Supabase for persistent memory storage with pgvector
              semantic search.
            </p>
            <div className="space-y-2">
              <div>
                <label className="block mb-1 t-label" style={{ color: "var(--text-muted)" }}>
                  Project URL
                </label>
                <input
                  type="text"
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                  className="w-full rounded-[6px] px-2.5 py-2 font-mono bg-transparent outline-none t-body"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div>
                <label className="block mb-1 t-label" style={{ color: "var(--text-muted)" }}>
                  Service Key
                </label>
                <input
                  type="password"
                  value={sbKey}
                  onChange={(e) => setSbKey(e.target.value)}
                  placeholder="eyJhbGci..."
                  className="w-full rounded-[6px] px-2.5 py-2 font-mono bg-transparent outline-none t-body"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={sbTesting || !sbUrl || !sbKey}
                  onClick={handleSupabaseTest}
                  className="rounded-full px-3 py-1 t-tiny transition"
                  style={{
                    background: "var(--surface)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    opacity: sbTesting || !sbUrl || !sbKey ? 0.5 : 1,
                  }}
                >
                  {sbTesting ? "Testing..." : "Test Connection"}
                </button>
                <button
                  disabled={sbSaving || !sbUrl || !sbKey}
                  onClick={handleSupabaseSave}
                  className="rounded-full px-3 py-1 t-tiny transition"
                  style={{
                    background: "rgba(var(--accent-rgb, 99,102,241), 0.15)",
                    color: "var(--accent)",
                    border: "1px solid var(--border)",
                    opacity: sbSaving || !sbUrl || !sbKey ? 0.5 : 1,
                  }}
                >
                  {sbSaving ? "Saving..." : "Save"}
                </button>
              </div>
              {sbResult && (
                <div
                  className="flex items-center gap-1.5 t-tiny"
                  style={{ color: sbResult.ok ? "var(--success)" : "var(--error)" }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: sbResult.ok ? "var(--success)" : "var(--error)",
                    }}
                  />
                  {sbResult.ok
                    ? "Connection successful"
                    : sbResult.error || "Connection failed"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Wallet ── */}
        {config?.ownerWallet && (
          <div className="px-1 pt-2">
            <h4 className="mb-1 t-label" style={{ color: "var(--text-muted)" }}>
              Owner Wallet
            </h4>
            <div
              className="rounded-[6px] px-2.5 py-1.5 truncate t-tiny"
              style={{
                background: "var(--surface-dim)",
                color: "var(--text-faint)",
              }}
            >
              {config.ownerWallet}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
