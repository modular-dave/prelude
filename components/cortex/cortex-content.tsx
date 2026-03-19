"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Power,
} from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import { NeuroSlider } from "@/components/ui/neuro-slider";
import { TypeFilterToggles } from "@/components/ui/type-filter-toggles";
import { DEFAULT_RETRIEVAL_SETTINGS } from "@/lib/retrieval-settings";

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

export function CortexContent({
  variant,
  onBack,
}: {
  variant: "panel" | "page";
  onBack?: () => void;
}) {
  const [config, setConfig] = useState<CortexConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Section open states
  const [supabaseOpen, setSupabaseOpen] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);

  // Supabase form
  const [sbUrl, setSbUrl] = useState("");
  const [sbKey, setSbKey] = useState("");
  const [sbTesting, setSbTesting] = useState(false);
  const [sbSaving, setSbSaving] = useState(false);
  const [sbResult, setSbResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  // Schedules (from memory context, same as settings sheet)
  const { retrievalSettings, updateRetrievalSettings } = useMemory();
  const [dreamScheduleLoading, setDreamScheduleLoading] = useState(false);
  const [reflectionScheduleLoading, setReflectionScheduleLoading] =
    useState(false);

  const s = retrievalSettings;

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
      {/* ── Header (variant-dependent) ── */}
      {variant === "panel" && onBack && (
        <>
          <p
            className="text-btn font-mono"
            onClick={onBack}
            style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)", cursor: "pointer" }}
          >
            &larr; settings
          </p>
          <div className="mt-3">
            <h2
              className="font-mono font-medium"
              style={{ fontSize: "13px", color: "var(--text)" }}
            >
              cortex
            </h2>
            <p
              className="mt-1 font-mono"
              style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-faint)" }}
            >
              Configure memory infrastructure and cognitive schedules
            </p>
          </div>
        </>
      )}
      {variant === "page" && (
        <div className="animate-fade-slide-up">
          <h1
            className="font-mono font-medium"
            style={{ fontSize: "16px", color: "var(--text)" }}
          >
            Cortex
          </h1>
          <p
            className="mt-1 font-mono"
            style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-faint)" }}
          >
            Configure memory infrastructure and cognitive schedules
          </p>
        </div>
      )}

      {/* ── Service Status ── */}
      <div
        className="mt-6 rounded-[8px] px-4 py-3"
        style={{
          background: "var(--surface-dim)",
          border: "1px solid var(--border)",
        }}
      >
        <h2
          className="mb-2 font-mono font-medium"
          style={{ fontSize: "13px", color: "var(--text)" }}
        >
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
              <span
                className="font-mono"
                style={{ fontSize: "11px", fontWeight: 400, color: "var(--text)" }}
              >
                {svc.name}
              </span>
              {svc.detail && (
                <span
                  className="ml-auto truncate max-w-[180px] font-mono"
                  style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
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
              <span
                className="font-mono"
                style={{ fontSize: "11px", fontWeight: 400, color: "var(--text)" }}
              >
                Model
              </span>
              <span
                className="ml-auto truncate max-w-[180px] font-mono"
                style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
              >
                {config.inference.model}
              </span>
            </div>
          )}
        </div>
        {config?.features && Object.keys(config.features).length > 0 && (
          <>
            <h2
              className="mb-2 mt-3 font-mono font-medium"
              style={{ fontSize: "13px", color: "var(--text)" }}
            >
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
                    className="truncate font-mono"
                    style={{
                      fontSize: "9px",
                      fontWeight: 400,
                      color: enabled ? "var(--text)" : "var(--text-faint)",
                    }}
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
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left font-mono font-medium transition"
          style={{ fontSize: "13px", color: "var(--text-muted)" }}
        >
          <span className="flex-1">Supabase</span>
          {config?.supabase?.connected && (
            <span
              className="font-mono"
              style={{ fontSize: "9px", fontWeight: 400, color: "var(--success)" }}
            >
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
            <p
              className="font-mono leading-relaxed"
              style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-faint)" }}
            >
              Connect to Supabase for persistent memory storage with pgvector
              semantic search.
            </p>
            <div className="space-y-2">
              <div>
                <label
                  className="block mb-1 font-mono font-medium uppercase"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Project URL
                </label>
                <input
                  type="text"
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                  className="w-full rounded-[6px] px-2.5 py-2 font-mono bg-transparent outline-none"
                  style={{
                    fontSize: "11px",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block mb-1 font-mono font-medium uppercase"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Service Key
                </label>
                <input
                  type="password"
                  value={sbKey}
                  onChange={(e) => setSbKey(e.target.value)}
                  placeholder="eyJhbGci..."
                  className="w-full rounded-[6px] px-2.5 py-2 font-mono bg-transparent outline-none"
                  style={{
                    fontSize: "11px",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={sbTesting || !sbUrl || !sbKey}
                  onClick={handleSupabaseTest}
                  className="rounded-full px-3 py-1 font-mono transition"
                  style={{
                    fontSize: "9px",
                    fontWeight: 400,
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
                  className="rounded-full px-3 py-1 font-mono transition"
                  style={{
                    fontSize: "9px",
                    fontWeight: 400,
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
                  className="flex items-center gap-1.5 font-mono"
                  style={{
                    fontSize: "9px",
                    fontWeight: 400,
                    color: sbResult.ok ? "var(--success)" : "var(--error)",
                  }}
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

        {/* ── Retrieval Tuning ── */}
        <button
          onClick={() => setTuningOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left font-mono font-medium transition"
          style={{ fontSize: "13px", color: "var(--text-muted)" }}
        >
          <span className="flex-1">Retrieval Tuning</span>
          {(() => {
            const d = DEFAULT_RETRIEVAL_SETTINGS;
            const isDefault =
              s.recallLimit === d.recallLimit &&
              s.minImportance === d.minImportance &&
              s.minDecay === d.minDecay &&
              s.enabledTypes.length === d.enabledTypes.length &&
              s.clinamenLimit === d.clinamenLimit &&
              s.clinamenMinImportance === d.clinamenMinImportance &&
              s.clinamenMaxRelevance === d.clinamenMaxRelevance;
            return !isDefault ? (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            ) : null;
          })()}
          {tuningOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {tuningOpen && (
          <div className="space-y-5 px-1 pb-2 animate-fade-slide-up">
            {/* Recall section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3
                  className="font-mono font-medium"
                  style={{ fontSize: "11px", color: "var(--text)" }}
                >
                  Recall Filters
                </h3>
                <button
                  onClick={() =>
                    updateRetrievalSettings({
                      ...DEFAULT_RETRIEVAL_SETTINGS,
                    })
                  }
                  className="font-mono transition"
                  style={{ fontSize: "9px", fontWeight: 400, color: "var(--accent)" }}
                >
                  Reset
                </button>
              </div>
              <NeuroSlider
                label="Recall Limit"
                value={s.recallLimit}
                min={1}
                max={20}
                step={1}
                onChange={(v) => updateRetrievalSettings({ recallLimit: v })}
              />
              <NeuroSlider
                label="Min Importance"
                value={s.minImportance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  updateRetrievalSettings({ minImportance: v })
                }
                formatValue={(v) => v.toFixed(2)}
              />
              <NeuroSlider
                label="Min Decay Factor"
                value={s.minDecay}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateRetrievalSettings({ minDecay: v })}
                formatValue={(v) => v.toFixed(2)}
              />
              <TypeFilterToggles
                enabled={s.enabledTypes}
                onChange={(types) =>
                  updateRetrievalSettings({ enabledTypes: types })
                }
              />
            </div>

            {/* Clinamen section */}
            <div className="space-y-3">
              <h3
                className="font-mono font-medium"
                style={{ fontSize: "11px", color: "var(--text)" }}
              >
                Clinamen (Divergent Recall)
              </h3>
              <p
                className="font-mono leading-relaxed"
                style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-faint)" }}
              >
                Surfaces high-importance memories with low relevance to the
                current context — for creative synthesis.
              </p>
              <NeuroSlider
                label="Clinamen Limit"
                value={s.clinamenLimit}
                min={1}
                max={10}
                step={1}
                onChange={(v) =>
                  updateRetrievalSettings({ clinamenLimit: v })
                }
              />
              <NeuroSlider
                label="Min Importance"
                value={s.clinamenMinImportance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  updateRetrievalSettings({ clinamenMinImportance: v })
                }
                formatValue={(v) => v.toFixed(2)}
              />
              <NeuroSlider
                label="Max Relevance"
                value={s.clinamenMaxRelevance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  updateRetrievalSettings({ clinamenMaxRelevance: v })
                }
                formatValue={(v) => v.toFixed(2)}
              />
            </div>
          </div>
        )}

        {/* ── Schedules ── */}
        <button
          onClick={() => setSchedulesOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left font-mono font-medium transition"
          style={{ fontSize: "13px", color: "var(--text-muted)" }}
        >
          <span className="flex-1">Schedules</span>
          {(s.dreamScheduleEnabled || s.reflectionScheduleEnabled) && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--success)" }}
            />
          )}
          {schedulesOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {schedulesOpen && (
          <div className="space-y-3 px-1 pb-2 animate-fade-slide-up">
            <p
              className="font-mono leading-relaxed"
              style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-faint)" }}
            >
              Automated background processes for memory consolidation and
              introspection.
            </p>

            {/* Dream Schedule */}
            <div
              className="rounded-[6px] overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <div
                className="flex items-center justify-between px-2.5 py-2"
                style={{ background: "var(--surface-dim)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: s.dreamScheduleEnabled
                        ? "var(--success)"
                        : "var(--text-faint)",
                    }}
                  />
                  <div>
                    <span
                      className="block font-mono font-medium"
                      style={{ fontSize: "11px", color: "var(--text)" }}
                    >
                      Dream Cycle
                    </span>
                    <span
                      className="block font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                    >
                      Consolidate, compact, reflect, resolve, emerge
                    </span>
                  </div>
                </div>
                <button
                  disabled={dreamScheduleLoading}
                  onClick={async () => {
                    setDreamScheduleLoading(true);
                    try {
                      const method = s.dreamScheduleEnabled
                        ? "DELETE"
                        : "POST";
                      await fetch("/api/dream/schedule", { method });
                      updateRetrievalSettings({
                        dreamScheduleEnabled: !s.dreamScheduleEnabled,
                      });
                    } finally {
                      setDreamScheduleLoading(false);
                    }
                  }}
                  className="rounded-full px-2.5 py-1 font-mono transition"
                  style={{
                    fontSize: "9px",
                    fontWeight: 400,
                    background: s.dreamScheduleEnabled
                      ? "rgba(34,197,94,0.15)"
                      : "var(--surface)",
                    color: s.dreamScheduleEnabled
                      ? "var(--success)"
                      : "var(--text-faint)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {dreamScheduleLoading
                    ? "..."
                    : s.dreamScheduleEnabled
                      ? "Active"
                      : "Off"}
                </button>
              </div>
              <div
                className="px-2.5 py-2 space-y-1.5"
                style={{
                  background: "var(--surface-dimmer, var(--surface))",
                }}
              >
                <h4
                  className="font-mono font-medium uppercase"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Schedule Parameters
                </h4>
                {[
                  { label: "Cron", value: "Every 6 hours" },
                  { label: "Initial delay", value: "2 min after start" },
                  { label: "Cycle timeout", value: "10 min max" },
                  {
                    label: "Decay schedule",
                    value: "Daily 3:00 AM UTC",
                  },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4
                  className="font-mono font-medium uppercase pt-1"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Event-Driven Triggers
                </h4>
                {[
                  {
                    label: "Importance threshold",
                    value: "2.0 cumulative",
                  },
                  {
                    label: "Min interval",
                    value: "30 min between reflections",
                  },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4
                  className="font-mono font-medium uppercase pt-1"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Decay Rates (per 24h)
                </h4>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {[
                    { type: "Episodic", rate: "0.93" },
                    { type: "Semantic", rate: "0.98" },
                    { type: "Procedural", rate: "0.97" },
                    { type: "Self Model", rate: "0.99" },
                    { type: "Introspective", rate: "0.98" },
                  ].map((d) => (
                    <div
                      key={d.type}
                      className="flex items-center justify-between"
                    >
                      <span
                        className="font-mono"
                        style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                      >
                        {d.type}
                      </span>
                      <span
                        className="font-mono"
                        style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-muted)" }}
                      >
                        {d.rate}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reflection Schedule */}
            <div
              className="rounded-[6px] overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <div
                className="flex items-center justify-between px-2.5 py-2"
                style={{ background: "var(--surface-dim)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: s.reflectionScheduleEnabled
                        ? "var(--success)"
                        : "var(--text-faint)",
                    }}
                  />
                  <div>
                    <span
                      className="block font-mono font-medium"
                      style={{ fontSize: "11px", color: "var(--text)" }}
                    >
                      Active Reflection
                    </span>
                    <span
                      className="block font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                    >
                      Journaling, introspection, self-model
                    </span>
                  </div>
                </div>
                <button
                  disabled={reflectionScheduleLoading}
                  onClick={async () => {
                    setReflectionScheduleLoading(true);
                    try {
                      const action = s.reflectionScheduleEnabled
                        ? "stop"
                        : "start";
                      await fetch("/api/reflect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ schedule: action }),
                      });
                      updateRetrievalSettings({
                        reflectionScheduleEnabled:
                          !s.reflectionScheduleEnabled,
                      });
                    } finally {
                      setReflectionScheduleLoading(false);
                    }
                  }}
                  className="rounded-full px-2.5 py-1 font-mono transition"
                  style={{
                    fontSize: "9px",
                    fontWeight: 400,
                    background: s.reflectionScheduleEnabled
                      ? "rgba(34,197,94,0.15)"
                      : "var(--surface)",
                    color: s.reflectionScheduleEnabled
                      ? "var(--success)"
                      : "var(--text-faint)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {reflectionScheduleLoading
                    ? "..."
                    : s.reflectionScheduleEnabled
                      ? "Active"
                      : "Off"}
                </button>
              </div>
              <div
                className="px-2.5 py-2 space-y-1.5"
                style={{
                  background: "var(--surface-dimmer, var(--surface))",
                }}
              >
                <h4
                  className="font-mono font-medium uppercase"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Schedule Parameters
                </h4>
                {[
                  { label: "Interval", value: "Every 3 hours" },
                  {
                    label: "Cron",
                    value: "At :30 past 1,4,7,10,13,16,19,22h UTC",
                  },
                  { label: "Initial delay", value: "30 min after start" },
                  { label: "Session timeout", value: "8 min max" },
                  { label: "Quiet hours", value: "23:00 - 08:00 UTC" },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4
                  className="font-mono font-medium uppercase pt-1"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Reflection Constraints
                </h4>
                {[
                  { label: "Min memories", value: "5 required" },
                  { label: "Max journal tokens", value: "1,500" },
                  { label: "Seed limit", value: "15 unique memories" },
                  { label: "Importance", value: "0.8 (stored)" },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4
                  className="font-mono font-medium uppercase pt-1"
                  style={{ fontSize: "9px", color: "var(--text-muted)" }}
                >
                  Seed Selection
                </h4>
                <div className="space-y-0.5">
                  {[
                    "Recent episodic (last 6h, up to 10)",
                    "High-importance (last 48h, >= 0.7)",
                    "Clinamen (high-importance, low-relevance)",
                    "Random older (up to 30 days fallback)",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className="h-0.5 w-0.5 shrink-0 rounded-full"
                        style={{ background: "var(--text-faint)" }}
                      />
                      <span
                        className="font-mono"
                        style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)" }}
                      >
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Wallet ── */}
        {config?.ownerWallet && (
          <div className="px-1 pt-2">
            <h4
              className="mb-1 font-mono font-medium uppercase"
              style={{ fontSize: "9px", color: "var(--text-muted)" }}
            >
              Owner Wallet
            </h4>
            <div
              className="rounded-[6px] px-2.5 py-1.5 font-mono truncate"
              style={{
                fontSize: "9px",
                fontWeight: 400,
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
