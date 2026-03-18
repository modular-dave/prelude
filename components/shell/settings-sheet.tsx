"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, ChevronDown, ChevronRight, Sliders, Cpu, Loader2, Moon, Brain, MessageSquare, Settings2, Clock, BarChart3, Upload } from "lucide-react";
import Link from "next/link";
import { ImportOverlay } from "@/components/shell/import-overlay";
import { NeuroSlider } from "@/components/ui/neuro-slider";
import { TypeFilterToggles } from "@/components/ui/type-filter-toggles";
import { useMemory } from "@/lib/memory-context";
import { DEFAULT_RETRIEVAL_SETTINGS } from "@/lib/retrieval-settings";
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
  const [tuningOpen, setTuningOpen] = useState(false);

  const { retrievalSettings, updateRetrievalSettings } = useMemory();

  // Model summary (just for the settings link label)
  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [dreamScheduleLoading, setDreamScheduleLoading] = useState(false);
  const [reflectionScheduleLoading, setReflectionScheduleLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [cortexConfig, setCortexConfig] = useState<Record<string, any> | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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

  // Load system prompt when sheet opens
  useEffect(() => {
    if (open) {
      setSystemPrompt(loadSystemPrompt());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    refreshActiveModel();
  }, [open, refreshActiveModel]);

  // Fetch Cortex config when section opens
  useEffect(() => {
    if (!configOpen || cortexConfig) return;
    fetch("/api/config").then((r) => r.json()).then(setCortexConfig).catch(() => {});
  }, [configOpen, cortexConfig]);

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

  const s = retrievalSettings;
  const d = DEFAULT_RETRIEVAL_SETTINGS;
  const isDefault =
    s.recallLimit === d.recallLimit &&
    s.minImportance === d.minImportance &&
    s.minDecay === d.minDecay &&
    s.enabledTypes.length === d.enabledTypes.length &&
    s.clinamenLimit === d.clinamenLimit &&
    s.clinamenMinImportance === d.clinamenMinImportance &&
    s.clinamenMaxRelevance === d.clinamenMaxRelevance;

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
          <h2 className="t-heading" style={{ color: "var(--text)" }}>Settings</h2>
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
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <MessageSquare className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">System Prompt</span>
            {systemPrompt.trim() && (
              <span className="t-tiny" style={{ color: "var(--accent)" }}>
                Active
              </span>
            )}
            {promptOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {promptOpen && (
            <div className="space-y-2 px-1 pb-2 animate-fade-slide-up">
              <p className="t-tiny leading-relaxed" style={{ color: "var(--text-faint)" }}>
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
                className="w-full resize-y rounded-[6px] px-2.5 py-2 t-small leading-relaxed bg-transparent outline-none"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  minHeight: "60px",
                  maxHeight: "200px",
                }}
              />
              {systemPrompt.trim() && (
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                  <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
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
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Cpu className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">Model</span>
            <span className="truncate max-w-[120px] t-tiny" style={{ color: "var(--text-faint)" }}>
              {activeModel ? modelDisplayName(activeModel) : "No model"}
            </span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>

          {/* Retrieval Tuning */}
          <button
            onClick={() => setTuningOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Sliders className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">Retrieval Tuning</span>
            {!isDefault && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            )}
            {tuningOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {tuningOpen && (
            <div className="space-y-5 px-1 pb-2 animate-fade-slide-up">
              {/* Recall section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="label">Recall Filters</h4>
                  {!isDefault && (
                    <button
                      onClick={() => updateRetrievalSettings({ ...DEFAULT_RETRIEVAL_SETTINGS })}
                      className="t-tiny transition"
                      style={{ color: "var(--accent)" }}
                    >
                      Reset
                    </button>
                  )}
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
                  onChange={(v) => updateRetrievalSettings({ minImportance: v })}
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
                  onChange={(types) => updateRetrievalSettings({ enabledTypes: types })}
                />
              </div>

              {/* Clinamen section */}
              <div className="space-y-3">
                <h4 className="label">Clinamen (Divergent Recall)</h4>
                <p className="t-tiny leading-relaxed" style={{ color: "var(--text-faint)" }}>
                  Surfaces high-importance memories with low relevance to the current context — for creative synthesis.
                </p>
                <NeuroSlider
                  label="Clinamen Limit"
                  value={s.clinamenLimit}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(v) => updateRetrievalSettings({ clinamenLimit: v })}
                />
                <NeuroSlider
                  label="Min Importance"
                  value={s.clinamenMinImportance}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => updateRetrievalSettings({ clinamenMinImportance: v })}
                  formatValue={(v) => v.toFixed(2)}
                />
                <NeuroSlider
                  label="Max Relevance"
                  value={s.clinamenMaxRelevance}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => updateRetrievalSettings({ clinamenMaxRelevance: v })}
                  formatValue={(v) => v.toFixed(2)}
                />
              </div>
            </div>
          )}

          {/* Cortex Schedules */}
          <button
            onClick={() => setSchedulesOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Moon className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">Cortex Schedules</span>
            {(s.dreamScheduleEnabled || s.reflectionScheduleEnabled) && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "#22c55e" }}
              />
            )}
            {schedulesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {schedulesOpen && (
            <div className="space-y-3 px-1 pb-2 animate-fade-slide-up">
              <p className="t-tiny leading-relaxed" style={{ color: "var(--text-faint)" }}>
                Automated background processes for memory consolidation and introspection.
              </p>

              {/* Dream Schedule */}
              <div className="rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between px-2.5 py-2" style={{ background: "var(--surface-dim)" }}>
                  <div className="flex items-center gap-2">
                    <Moon className="h-3 w-3" style={{ color: s.dreamScheduleEnabled ? "#22c55e" : "var(--text-faint)" }} />
                    <div>
                      <span className="block" style={{ color: "var(--text)" }}>Dream Cycle</span>
                      <span className="block t-tiny" style={{ color: "var(--text-faint)" }}>Consolidate, compact, reflect, resolve, emerge</span>
                    </div>
                  </div>
                  <button
                    disabled={dreamScheduleLoading}
                    onClick={async () => {
                      setDreamScheduleLoading(true);
                      try {
                        const method = s.dreamScheduleEnabled ? "DELETE" : "POST";
                        await fetch("/api/dream/schedule", { method });
                        updateRetrievalSettings({ dreamScheduleEnabled: !s.dreamScheduleEnabled });
                      } finally {
                        setDreamScheduleLoading(false);
                      }
                    }}
                    className="rounded-full px-2.5 py-1 t-tiny transition"
                    style={{
                      background: s.dreamScheduleEnabled ? "rgba(34,197,94,0.15)" : "var(--surface)",
                      color: s.dreamScheduleEnabled ? "#22c55e" : "var(--text-faint)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {dreamScheduleLoading ? "..." : s.dreamScheduleEnabled ? "Active" : "Off"}
                  </button>
                </div>
                {/* Dream schedule parameters */}
                <div className="px-2.5 py-2 space-y-1.5" style={{ background: "var(--surface-dimmer, var(--surface))" }}>
                  <h4 className="label" style={{ fontSize: "8px" }}>Schedule Parameters</h4>
                  {[
                    { label: "Cron", value: "Every 6 hours", mono: true },
                    { label: "Initial delay", value: "2 min after start" },
                    { label: "Cycle timeout", value: "10 min max" },
                    { label: "Decay schedule", value: "Daily 3:00 AM UTC", mono: true },
                  ].map((p) => (
                    <div key={p.label} className="flex items-center justify-between">
                      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{p.label}</span>
                      <span className={`t-tiny ${p.mono ? "font-mono" : ""}`} style={{ color: "var(--text-muted)" }}>{p.value}</span>
                    </div>
                  ))}
                  <h4 className="label pt-1" style={{ fontSize: "8px" }}>Event-Driven Triggers</h4>
                  {[
                    { label: "Importance threshold", value: "2.0 cumulative" },
                    { label: "Min interval", value: "30 min between reflections" },
                  ].map((p) => (
                    <div key={p.label} className="flex items-center justify-between">
                      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{p.label}</span>
                      <span className="t-tiny" style={{ color: "var(--text-muted)" }}>{p.value}</span>
                    </div>
                  ))}
                  <h4 className="label pt-1" style={{ fontSize: "8px" }}>Decay Rates (per 24h)</h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {[
                      { type: "Episodic", rate: "0.93" },
                      { type: "Semantic", rate: "0.98" },
                      { type: "Procedural", rate: "0.97" },
                      { type: "Self Model", rate: "0.99" },
                      { type: "Introspective", rate: "0.98" },
                    ].map((d) => (
                      <div key={d.type} className="flex items-center justify-between">
                        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{d.type}</span>
                        <span className="t-tiny font-mono" style={{ color: "var(--text-muted)" }}>{d.rate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Reflection Schedule */}
              <div className="rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between px-2.5 py-2" style={{ background: "var(--surface-dim)" }}>
                  <div className="flex items-center gap-2">
                    <Brain className="h-3 w-3" style={{ color: s.reflectionScheduleEnabled ? "#22c55e" : "var(--text-faint)" }} />
                    <div>
                      <span className="block" style={{ color: "var(--text)" }}>Active Reflection</span>
                      <span className="block t-tiny" style={{ color: "var(--text-faint)" }}>Journaling, introspection, self-model</span>
                    </div>
                  </div>
                  <button
                    disabled={reflectionScheduleLoading}
                    onClick={async () => {
                      setReflectionScheduleLoading(true);
                      try {
                        const action = s.reflectionScheduleEnabled ? "stop" : "start";
                        await fetch("/api/reflect", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ schedule: action }),
                        });
                        updateRetrievalSettings({ reflectionScheduleEnabled: !s.reflectionScheduleEnabled });
                      } finally {
                        setReflectionScheduleLoading(false);
                      }
                    }}
                    className="rounded-full px-2.5 py-1 t-tiny transition"
                    style={{
                      background: s.reflectionScheduleEnabled ? "rgba(34,197,94,0.15)" : "var(--surface)",
                      color: s.reflectionScheduleEnabled ? "#22c55e" : "var(--text-faint)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {reflectionScheduleLoading ? "..." : s.reflectionScheduleEnabled ? "Active" : "Off"}
                  </button>
                </div>
                {/* Reflection schedule parameters */}
                <div className="px-2.5 py-2 space-y-1.5" style={{ background: "var(--surface-dimmer, var(--surface))" }}>
                  <h4 className="label" style={{ fontSize: "8px" }}>Schedule Parameters</h4>
                  {[
                    { label: "Interval", value: "Every 3 hours" },
                    { label: "Cron", value: "At :30 past 1,4,7,10,13,16,19,22h UTC", mono: true },
                    { label: "Initial delay", value: "30 min after start" },
                    { label: "Session timeout", value: "8 min max" },
                    { label: "Quiet hours", value: "23:00 - 08:00 UTC" },
                  ].map((p) => (
                    <div key={p.label} className="flex items-center justify-between">
                      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{p.label}</span>
                      <span className={`t-tiny ${p.mono ? "font-mono" : ""}`} style={{ color: "var(--text-muted)" }}>{p.value}</span>
                    </div>
                  ))}
                  <h4 className="label pt-1" style={{ fontSize: "8px" }}>Reflection Constraints</h4>
                  {[
                    { label: "Min memories", value: "5 required" },
                    { label: "Max journal tokens", value: "1,500" },
                    { label: "Seed limit", value: "15 unique memories" },
                    { label: "Importance", value: "0.8 (stored)" },
                  ].map((p) => (
                    <div key={p.label} className="flex items-center justify-between">
                      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{p.label}</span>
                      <span className="t-tiny" style={{ color: "var(--text-muted)" }}>{p.value}</span>
                    </div>
                  ))}
                  <h4 className="label pt-1" style={{ fontSize: "8px" }}>Seed Selection</h4>
                  <div className="space-y-0.5">
                    {[
                      "Recent episodic (last 6h, up to 10)",
                      "High-importance (last 48h, >= 0.7)",
                      "Clinamen (high-importance, low-relevance)",
                      "Random older (up to 30 days fallback)",
                    ].map((s) => (
                      <div key={s} className="flex items-center gap-1.5">
                        <span className="h-0.5 w-0.5 shrink-0 rounded-full" style={{ background: "var(--text-faint)" }} />
                        <span className="t-micro" style={{ color: "var(--text-faint)" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cortex Config */}
          <button
            onClick={() => setConfigOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Settings2 className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">Cortex Status</span>
            {configOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {configOpen && (
            <div className="space-y-3 px-1 pb-2 animate-fade-slide-up">
              {!cortexConfig ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--accent)" }} />
                  <span className="t-tiny" style={{ color: "var(--text-faint)" }}>Loading config...</span>
                </div>
              ) : (
                <>
                  {/* Connected Services */}
                  <div className="space-y-1.5">
                    <h4 className="label">Services</h4>
                    {[
                      { name: "Supabase", connected: cortexConfig.supabase?.connected, detail: cortexConfig.supabase?.url, required: true },
                      { name: "Inference", connected: cortexConfig.inference?.connected, detail: cortexConfig.inference?.provider, required: true },
                      { name: "Embedding", connected: cortexConfig.embedding?.connected, detail: cortexConfig.embedding?.provider || "not configured", required: false },
                    ].map((svc) => (
                      <div key={svc.name} className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5" style={{ background: "var(--surface-dim)" }}>
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: svc.connected ? "#22c55e" : svc.required ? "#ef4444" : "var(--text-faint)" }}
                        />
                        <span className="t-small" style={{ color: "var(--text)" }}>{svc.name}</span>
                        {svc.detail && (
                          <span className="ml-auto truncate max-w-[140px] t-tiny" style={{ color: "var(--text-faint)" }}>
                            {svc.detail}
                          </span>
                        )}
                      </div>
                    ))}
                    {cortexConfig.inference?.model && (
                      <div className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5" style={{ background: "var(--surface-dim)" }}>
                        <Cpu className="h-2.5 w-2.5" style={{ color: "var(--text-faint)" }} />
                        <span className="t-small" style={{ color: "var(--text)" }}>Model</span>
                        <span className="ml-auto truncate max-w-[160px] t-tiny" style={{ color: "var(--text-faint)" }}>
                          {cortexConfig.inference.model}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Feature Flags */}
                  <div className="space-y-1.5">
                    <h4 className="label">Features</h4>
                    <div className="grid grid-cols-2 gap-1">
                      {cortexConfig.features && Object.entries(cortexConfig.features).map(([key, enabled]) => (
                        <div
                          key={key}
                          className="flex items-center gap-1.5 rounded-[4px] px-2 py-1"
                          style={{ background: "var(--surface-dim)" }}
                        >
                          <span
                            className="h-1 w-1 shrink-0 rounded-full"
                            style={{ background: enabled ? "#22c55e" : "var(--text-faint)" }}
                          />
                          <span className="t-tiny truncate" style={{ color: enabled ? "var(--text)" : "var(--text-faint)" }}>
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Wallet */}
                  {cortexConfig.ownerWallet && (
                    <div className="space-y-1">
                      <h4 className="label">Owner Wallet</h4>
                      <div className="rounded-[6px] px-2.5 py-1.5 font-mono t-tiny truncate" style={{ background: "var(--surface-dim)", color: "var(--text-faint)" }}>
                        {cortexConfig.ownerWallet}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Stats link */}
          <Link
            href="/stats"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <BarChart3 className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">Stats</span>
          </Link>

          {/* History link */}
          <Link
            href="/history"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Clock className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">Memory History</span>
          </Link>

          {/* Import conversations */}
          <button
            onClick={() => setImportOpen(true)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Upload className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">Import Chats</span>
          </button>

        </div>
      </div>

      {/* Import overlay */}
      {importOpen && <ImportOverlay onClose={() => setImportOpen(false)} />}
    </div>
  );
}
