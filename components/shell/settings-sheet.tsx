"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ImportOverlay } from "@/components/shell/import-overlay";
import { loadPromptConfig, savePromptConfig, previewPrompt, type PromptConfig } from "@/lib/prompt-builder";
import { loadEngineConfig, saveEngineConfig, resetEngineConfig, DEFAULT_ENGINE_CONFIG, type EngineConfig } from "@/lib/engine-config";
import { modelDisplayName } from "@/lib/model-settings";
import { RotateCcw } from "lucide-react";

// ── Slider component ──

function Slider({
  label,
  value,
  min,
  max,
  step,
  color,
  onChange,
  suffix,
  displayValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  color?: string;
  onChange: (v: number) => void;
  suffix?: string;
  displayValue?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 t-small" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
        style={{ accentColor: color || "var(--accent)", background: "var(--bar-track)" }}
      />
      <span className="w-14 text-right font-mono t-small" style={{ color: color || "var(--text)" }}>
        {displayValue || value.toFixed(step && step >= 1 ? 0 : 2)}{suffix || ""}
      </span>
    </div>
  );
}

// ── Section header ──

function SectionHeader({ title, onReset }: { title: string; onReset?: () => void }) {
  return (
    <div className="flex items-center justify-between pt-2 pb-1">
      <span className="t-label" style={{ color: "var(--text-faint)" }}>{title}</span>
      {onReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 t-micro transition active:scale-95"
          style={{ color: "var(--text-faint)" }}
          title="Reset to SDK defaults"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          reset
        </button>
      )}
    </div>
  );
}

// ── Collapsible section ──

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1.5 text-left transition active:scale-[0.99]"
      >
        <span className="t-body" style={{ color: "var(--text-faint)" }}>
          {open ? "−" : "+"} {title}
        </span>
      </button>
      {open && (
        <div className="pl-4 space-y-2 pb-2 animate-fade-slide-up">
          {children}
        </div>
      )}
    </div>
  );
}

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [cortexSummary, setCortexSummary] = useState<string | null>(null);

  // Prompt config
  const [promptConfig, setPromptConfig] = useState<PromptConfig>({
    persona: "",
    customInstructions: "",
    securityRules: true,
    memoryInstructions: true,
    webSearchEnabled: false,
  });
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);

  // Engine config
  const [engineConfig, setEngineConfig] = useState<EngineConfig>(DEFAULT_ENGINE_CONFIG);

  // Privacy
  const [privacy, setPrivacy] = useState({
    defaultVisibility: "private" as "private" | "shared" | "public",
    alwaysPrivateTypes: ["self_model"] as string[],
    veniceOnly: false,
    encryptAtRest: false,
  });

  // Metering
  const [meterSummary, setMeterSummary] = useState<Record<string, number>>({});
  const [veniceStats, setVeniceStats] = useState<any>(null);
  const [guardrailStats, setGuardrailStats] = useState<any>(null);

  // Cognitive routes
  const [cogRoutes, setCogRoutes] = useState<Record<string, { provider: string; model: string }>>({});

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

  const refreshMeter = useCallback(async () => {
    try {
      const [meterRes, guardrailRes] = await Promise.all([
        fetch("/api/cortex/meter").then((r) => r.json()).catch(() => ({})),
        fetch("/api/cortex/guardrails").then((r) => r.json()).catch(() => ({})),
      ]);
      setMeterSummary(meterRes.meterSummary || {});
      setVeniceStats(meterRes.veniceStats || null);
      setGuardrailStats(guardrailRes);
    } catch {
      // non-critical
    }
  }, []);

  const refreshPrivacy = useCallback(async () => {
    try {
      const res = await fetch("/api/cortex/privacy");
      const data = await res.json();
      setPrivacy(data);
    } catch {
      // non-critical
    }
  }, []);

  const refreshRoutes = useCallback(async () => {
    try {
      const res = await fetch("/api/cortex/routes");
      const data = await res.json();
      setCogRoutes(data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (open) {
      setPromptConfig(loadPromptConfig());
      setEngineConfig(loadEngineConfig());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    refreshActiveModel();
    refreshCortexSummary();
    refreshMeter();
    refreshPrivacy();
    refreshRoutes();
  }, [open, refreshActiveModel, refreshCortexSummary, refreshMeter, refreshPrivacy, refreshRoutes]);

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

  // ── Config update helpers ──

  const updatePrompt = (partial: Partial<PromptConfig>) => {
    const updated = { ...promptConfig, ...partial };
    setPromptConfig(updated);
    savePromptConfig(updated);
  };

  const updateEngine = (partial: Partial<EngineConfig>) => {
    const current = { ...engineConfig };
    // Deep merge for nested objects
    for (const key of Object.keys(partial) as (keyof EngineConfig)[]) {
      const val = partial[key];
      if (val && typeof val === "object" && !Array.isArray(val) && typeof current[key] === "object" && !Array.isArray(current[key])) {
        (current as any)[key] = { ...(current[key] as any), ...(val as any) };
      } else if (val !== undefined) {
        (current as any)[key] = val;
      }
    }
    setEngineConfig(current);
    saveEngineConfig(current);
    // Also push to server
    fetch("/api/cortex/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    }).catch(() => {});
  };

  const updatePrivacy = (partial: Partial<typeof privacy>) => {
    const updated = { ...privacy, ...partial };
    setPrivacy(updated);
    fetch("/api/cortex/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    }).catch(() => {});
  };

  // Concept management
  const [newConcept, setNewConcept] = useState("");
  const addConcept = () => {
    const c = newConcept.trim().toLowerCase().replace(/\s+/g, "_");
    if (!c || engineConfig.memoryConcepts.includes(c)) return;
    updateEngine({ memoryConcepts: [...engineConfig.memoryConcepts, c] });
    setNewConcept("");
  };
  const removeConcept = (c: string) => {
    updateEngine({ memoryConcepts: engineConfig.memoryConcepts.filter((x) => x !== c) });
  };

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
        className="relative z-10 w-full sm:w-96 h-full overflow-y-auto font-mono animate-slide-in-right"
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

          {/* ── System Prompt ── */}
          <Section title="system prompt" defaultOpen={false}>
            <p className="t-micro" style={{ color: "var(--text-faint)", lineHeight: 1.6 }}>
              structured prompt composition
            </p>

            <div className="space-y-2">
              <div>
                <span className="t-micro" style={{ color: "var(--text-muted)" }}>Persona</span>
                <textarea
                  value={promptConfig.persona}
                  onChange={(e) => updatePrompt({ persona: e.target.value })}
                  placeholder="You are Clude, an AI companion..."
                  rows={3}
                  className="w-full resize-y bg-transparent px-0 py-1 outline-none t-small"
                  style={{ borderBottom: "1px solid var(--border)", color: "var(--text)", minHeight: "40px", maxHeight: "120px", lineHeight: 1.6 }}
                />
              </div>

              <div>
                <span className="t-micro" style={{ color: "var(--text-muted)" }}>Custom Instructions</span>
                <textarea
                  value={promptConfig.customInstructions}
                  onChange={(e) => updatePrompt({ customInstructions: e.target.value })}
                  placeholder="Additional instructions..."
                  rows={2}
                  className="w-full resize-y bg-transparent px-0 py-1 outline-none t-small"
                  style={{ borderBottom: "1px solid var(--border)", color: "var(--text)", minHeight: "30px", maxHeight: "100px", lineHeight: 1.6 }}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={promptConfig.securityRules} onChange={(e) => updatePrompt({ securityRules: e.target.checked })} />
                <span className="t-small" style={{ color: "var(--text-muted)" }}>Security Rules (anti-injection)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={promptConfig.memoryInstructions} onChange={(e) => updatePrompt({ memoryInstructions: e.target.checked })} />
                <span className="t-small" style={{ color: "var(--text-muted)" }}>Memory Instructions</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={promptConfig.webSearchEnabled} onChange={(e) => updatePrompt({ webSearchEnabled: e.target.checked })} />
                <span className="t-small" style={{ color: "var(--text-muted)" }}>Web Search (Venice, returns citations)</span>
              </label>

              <button
                onClick={() => setPromptPreviewOpen((v) => !v)}
                className="t-micro transition"
                style={{ color: "var(--accent)" }}
              >
                {promptPreviewOpen ? "Hide" : "Preview"} assembled prompt
              </button>

              {promptPreviewOpen && (
                <div
                  className="rounded-[4px] p-2 t-micro leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto"
                  style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
                >
                  {previewPrompt(promptConfig)}
                </div>
              )}
            </div>
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Inference ── */}
          <Section title="inference">
            <Slider label="Primary" value={["auto","venice","anthropic","local"].indexOf(engineConfig.inferencePrimary)} min={0} max={3} step={1}
              displayValue={engineConfig.inferencePrimary}
              onChange={(v) => updateEngine({ inferencePrimary: (["auto","venice","anthropic","local"] as const)[v] })} />
            <Slider label="Fallback" value={["anthropic","venice","local","none"].indexOf(engineConfig.inferenceFallback)} min={0} max={3} step={1}
              displayValue={engineConfig.inferenceFallback}
              onChange={(v) => updateEngine({ inferenceFallback: (["anthropic","venice","local","none"] as const)[v] })} />
            <Slider label="Chat Max Tokens" value={engineConfig.chatMaxTokens} min={128} max={4096} step={64} onChange={(v) => updateEngine({ chatMaxTokens: v })} />

            {Object.keys(cogRoutes).length > 0 && (
              <div className="mt-2">
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>Cognitive Routing</span>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(cogRoutes).map(([fn, route]) => (
                    <div key={fn} className="flex items-center gap-2 t-micro">
                      <span className="w-16" style={{ color: "var(--text-muted)" }}>{fn}</span>
                      <span style={{ color: "var(--text)" }}>{route.model}</span>
                      <span style={{ color: "var(--text-faint)" }}>({route.provider})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Retrieval Scoring ── */}
          <Section title="retrieval scoring">
            <SectionHeader title="Weights" onReset={() => updateEngine({ retrievalWeights: DEFAULT_ENGINE_CONFIG.retrievalWeights })} />
            <Slider label="Recency" value={engineConfig.retrievalWeights.recency} min={0} max={5} color="#06b6d4"
              onChange={(v) => updateEngine({ retrievalWeights: { ...engineConfig.retrievalWeights, recency: v } })} />
            <Slider label="Relevance" value={engineConfig.retrievalWeights.relevance} min={0} max={5} color="#3b82f6"
              onChange={(v) => updateEngine({ retrievalWeights: { ...engineConfig.retrievalWeights, relevance: v } })} />
            <Slider label="Importance" value={engineConfig.retrievalWeights.importance} min={0} max={5} color="#f59e0b"
              onChange={(v) => updateEngine({ retrievalWeights: { ...engineConfig.retrievalWeights, importance: v } })} />
            <Slider label="Vector Sim" value={engineConfig.retrievalWeights.vector} min={0} max={8} color="#8b5cf6"
              onChange={(v) => updateEngine({ retrievalWeights: { ...engineConfig.retrievalWeights, vector: v } })} />
            <Slider label="Graph" value={engineConfig.retrievalWeights.graph} min={0} max={5} color="#f97316"
              onChange={(v) => updateEngine({ retrievalWeights: { ...engineConfig.retrievalWeights, graph: v } })} />
            <Slider label="Co-occurrence" value={engineConfig.retrievalWeights.cooccurrence} min={0} max={2} color="#ec4899"
              onChange={(v) => updateEngine({ retrievalWeights: { ...engineConfig.retrievalWeights, cooccurrence: v } })} />
            <Slider label="Recency Decay" value={engineConfig.recencyDecayBase} min={0.99} max={1.0} step={0.001} color="#22c55e"
              onChange={(v) => updateEngine({ recencyDecayBase: v })} />
            <Slider label="Vector Threshold" value={engineConfig.vectorMatchThreshold} min={0} max={1}
              onChange={(v) => updateEngine({ vectorMatchThreshold: v })} />
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Memory Decay ── */}
          <Section title="memory decay">
            <SectionHeader title="Decay per 24h" onReset={() => updateEngine({ decayRates: DEFAULT_ENGINE_CONFIG.decayRates, minDecayFloor: DEFAULT_ENGINE_CONFIG.minDecayFloor })} />
            {(["episodic", "semantic", "procedural", "self_model", "introspective"] as const).map((t) => (
              <Slider key={t} label={t.replace("_", " ")} value={engineConfig.decayRates[t]} min={0.8} max={1.0} step={0.005}
                onChange={(v) => updateEngine({ decayRates: { ...engineConfig.decayRates, [t]: v } })} />
            ))}
            <Slider label="Min Floor" value={engineConfig.minDecayFloor} min={0} max={0.5}
              onChange={(v) => updateEngine({ minDecayFloor: v })} />
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Type Boosts ── */}
          <Section title="knowledge type boosts">
            <SectionHeader title="Boost per type" onReset={() => updateEngine({ typeBoosts: DEFAULT_ENGINE_CONFIG.typeBoosts })} />
            {(["episodic", "semantic", "procedural", "self_model", "introspective"] as const).map((t) => (
              <Slider key={t} label={t.replace("_", " ")} value={engineConfig.typeBoosts[t]} min={0} max={0.5}
                onChange={(v) => updateEngine({ typeBoosts: { ...engineConfig.typeBoosts, [t]: v } })} />
            ))}
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Hebbian Reinforcement ── */}
          <Section title="hebbian reinforcement">
            <SectionHeader title="" onReset={() => updateEngine({
              linkSimilarityThreshold: DEFAULT_ENGINE_CONFIG.linkSimilarityThreshold,
              maxAutoLinks: DEFAULT_ENGINE_CONFIG.maxAutoLinks,
              coRetrievalBoost: DEFAULT_ENGINE_CONFIG.coRetrievalBoost,
              importanceBoostPerRecall: DEFAULT_ENGINE_CONFIG.importanceBoostPerRecall,
            })} />
            <Slider label="Link Threshold" value={engineConfig.linkSimilarityThreshold} min={0.3} max={0.9}
              onChange={(v) => updateEngine({ linkSimilarityThreshold: v })} />
            <Slider label="Max Auto Links" value={engineConfig.maxAutoLinks} min={1} max={20} step={1}
              onChange={(v) => updateEngine({ maxAutoLinks: v })} />
            <Slider label="Co-retrieval Boost" value={engineConfig.coRetrievalBoost} min={0.01} max={0.2}
              onChange={(v) => updateEngine({ coRetrievalBoost: v })} />
            <Slider label="Imp per Recall" value={engineConfig.importanceBoostPerRecall} min={0.001} max={0.05} step={0.001}
              onChange={(v) => updateEngine({ importanceBoostPerRecall: v })} />
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Dream Cycle ── */}
          <Section title="dream cycle">
            <SectionHeader title="" onReset={() => updateEngine({
              dreamImportanceThreshold: DEFAULT_ENGINE_CONFIG.dreamImportanceThreshold,
              dreamMinIntervalMin: DEFAULT_ENGINE_CONFIG.dreamMinIntervalMin,
              dreamTimeoutMin: DEFAULT_ENGINE_CONFIG.dreamTimeoutMin,
              compactionAgeDays: DEFAULT_ENGINE_CONFIG.compactionAgeDays,
              compactionDecayThreshold: DEFAULT_ENGINE_CONFIG.compactionDecayThreshold,
              compactionImportanceThreshold: DEFAULT_ENGINE_CONFIG.compactionImportanceThreshold,
              compactionMinGroupSize: DEFAULT_ENGINE_CONFIG.compactionMinGroupSize,
            })} />
            <Slider label="Trigger Threshold" value={engineConfig.dreamImportanceThreshold} min={0.5} max={10} step={0.1}
              onChange={(v) => updateEngine({ dreamImportanceThreshold: v })} />
            <Slider label="Min Interval (m)" value={engineConfig.dreamMinIntervalMin} min={10} max={180} step={5}
              onChange={(v) => updateEngine({ dreamMinIntervalMin: v })} />
            <Slider label="Timeout (min)" value={engineConfig.dreamTimeoutMin} min={5} max={30} step={1}
              onChange={(v) => updateEngine({ dreamTimeoutMin: v })} />
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>Compaction</span>
            <Slider label="Age (days)" value={engineConfig.compactionAgeDays} min={1} max={30} step={1}
              onChange={(v) => updateEngine({ compactionAgeDays: v })} />
            <Slider label="Decay Threshold" value={engineConfig.compactionDecayThreshold} min={0.1} max={0.5}
              onChange={(v) => updateEngine({ compactionDecayThreshold: v })} />
            <Slider label="Imp Threshold" value={engineConfig.compactionImportanceThreshold} min={0.1} max={0.8}
              onChange={(v) => updateEngine({ compactionImportanceThreshold: v })} />
            <Slider label="Min Group" value={engineConfig.compactionMinGroupSize} min={1} max={10} step={1}
              onChange={(v) => updateEngine({ compactionMinGroupSize: v })} />
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Active Reflection ── */}
          <Section title="active reflection">
            <SectionHeader title="" onReset={() => updateEngine({
              reflectionIntervalHours: DEFAULT_ENGINE_CONFIG.reflectionIntervalHours,
              reflectionMinMemories: DEFAULT_ENGINE_CONFIG.reflectionMinMemories,
              reflectionMaxJournalTokens: DEFAULT_ENGINE_CONFIG.reflectionMaxJournalTokens,
              reflectionTimeoutMin: DEFAULT_ENGINE_CONFIG.reflectionTimeoutMin,
              reflectionRecentSeedHours: DEFAULT_ENGINE_CONFIG.reflectionRecentSeedHours,
              reflectionHighImpLookbackHours: DEFAULT_ENGINE_CONFIG.reflectionHighImpLookbackHours,
              reflectionHighImpThreshold: DEFAULT_ENGINE_CONFIG.reflectionHighImpThreshold,
            })} />
            <Slider label="Interval (h)" value={engineConfig.reflectionIntervalHours} min={1} max={12} step={1}
              onChange={(v) => updateEngine({ reflectionIntervalHours: v })} />
            <Slider label="Min Memories" value={engineConfig.reflectionMinMemories} min={3} max={20} step={1}
              onChange={(v) => updateEngine({ reflectionMinMemories: v })} />
            <Slider label="Max Tokens" value={engineConfig.reflectionMaxJournalTokens} min={500} max={4000} step={100}
              onChange={(v) => updateEngine({ reflectionMaxJournalTokens: v })} />
            <Slider label="Timeout (min)" value={engineConfig.reflectionTimeoutMin} min={3} max={15} step={1}
              onChange={(v) => updateEngine({ reflectionTimeoutMin: v })} />
            <Slider label="Seed Window (h)" value={engineConfig.reflectionRecentSeedHours} min={1} max={24} step={1}
              onChange={(v) => updateEngine({ reflectionRecentSeedHours: v })} />
            <Slider label="Lookback (h)" value={engineConfig.reflectionHighImpLookbackHours} min={12} max={168} step={6}
              onChange={(v) => updateEngine({ reflectionHighImpLookbackHours: v })} />
            <Slider label="Hi-Imp Thresh" value={engineConfig.reflectionHighImpThreshold} min={0.5} max={0.9}
              onChange={(v) => updateEngine({ reflectionHighImpThreshold: v })} />
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Content & Embedding ── */}
          <Section title="content & embedding">
            <Slider label="Max Content" value={engineConfig.memoryMaxContentLength} min={1000} max={20000} step={500}
              onChange={(v) => updateEngine({ memoryMaxContentLength: v })} />
            <Slider label="Max Summary" value={engineConfig.memorySummaryMaxLength} min={100} max={2000} step={50}
              onChange={(v) => updateEngine({ memorySummaryMaxLength: v })} />
            <Slider label="Cache Size" value={engineConfig.embeddingCacheMax} min={50} max={1000} step={25}
              onChange={(v) => updateEngine({ embeddingCacheMax: v })} />
            <Slider label="Cache TTL (m)" value={engineConfig.embeddingCacheTTLMin} min={5} max={120} step={5}
              onChange={(v) => updateEngine({ embeddingCacheTTLMin: v })} />
            <Slider label="Fragment Max" value={engineConfig.embeddingFragmentMaxLength} min={500} max={5000} step={250}
              onChange={(v) => updateEngine({ embeddingFragmentMaxLength: v })} />
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Clinamen Advanced ── */}
          <Section title="clinamen (anomaly)">
            <Slider label="Min Age (h)" value={engineConfig.clinamenMinAgeHours} min={0} max={168} step={1}
              onChange={(v) => updateEngine({ clinamenMinAgeHours: v })} />
            <Slider label="Pool Size" value={engineConfig.clinamenCandidatePoolSize} min={20} max={500} step={10}
              onChange={(v) => updateEngine({ clinamenCandidatePoolSize: v })} />
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Memory Concepts ── */}
          <Section title="memory concepts">
            <div className="flex flex-wrap gap-1">
              {engineConfig.memoryConcepts.map((c) => (
                <span
                  key={c}
                  className="rounded-[3px] px-1.5 py-0.5 t-micro cursor-pointer hover:line-through"
                  style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
                  onClick={() => removeConcept(c)}
                  title="Click to remove"
                >
                  {c} ×
                </span>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1">
              <input
                type="text"
                value={newConcept}
                onChange={(e) => setNewConcept(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addConcept(); }}
                placeholder="new concept..."
                className="flex-1 rounded-[4px] px-2 py-1 t-small outline-none"
                style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <button onClick={addConcept} className="t-small transition active:scale-95" style={{ color: "var(--accent)" }}>
                + add
              </button>
            </div>
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Privacy ── */}
          <Section title="privacy">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="t-small" style={{ color: "var(--text-muted)" }}>Visibility</span>
                {(["private", "shared", "public"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="visibility" checked={privacy.defaultVisibility === v}
                      onChange={() => updatePrivacy({ defaultVisibility: v })} />
                    <span className="t-small" style={{ color: "var(--text)" }}>{v}</span>
                  </label>
                ))}
              </div>
              <div>
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>Always Private</span>
                <div className="flex gap-2 mt-1">
                  {["self_model", "introspective"].map((t) => (
                    <label key={t} className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={privacy.alwaysPrivateTypes.includes(t)}
                        onChange={(e) => {
                          const types = e.target.checked
                            ? [...privacy.alwaysPrivateTypes, t]
                            : privacy.alwaysPrivateTypes.filter((x) => x !== t);
                          updatePrivacy({ alwaysPrivateTypes: types });
                        }} />
                      <span className="t-small" style={{ color: "var(--text-muted)" }}>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={privacy.veniceOnly} onChange={(e) => updatePrivacy({ veniceOnly: e.target.checked })} />
                <span className="t-small" style={{ color: "var(--text-muted)" }}>Venice-only (never send to Anthropic)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={privacy.encryptAtRest} onChange={(e) => updatePrivacy({ encryptAtRest: e.target.checked })} />
                <span className="t-small" style={{ color: "var(--text-muted)" }}>Encrypt memories at rest</span>
              </label>
            </div>
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Cortex Status ── */}
          <Section title="cortex status">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="t-small" style={{ color: "var(--text-muted)" }}>Services</span>
                <span className="t-small" style={{ color: cortexSummary ? "var(--success)" : "var(--text-faint)" }}>
                  {cortexSummary || "—"}
                </span>
              </div>

              {Object.keys(meterSummary).length > 0 && (
                <div>
                  <span className="t-micro" style={{ color: "var(--text-faint)" }}>Usage</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(meterSummary).map(([op, count]) => (
                      <span key={op} className="t-micro" style={{ color: "var(--text-muted)" }}>
                        {op}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {veniceStats && (
                <div>
                  <span className="t-micro" style={{ color: "var(--text-faint)" }}>Venice Inference</span>
                  <div className="flex gap-3 mt-1">
                    <span className="t-micro" style={{ color: "var(--text-muted)" }}>
                      Calls: {veniceStats.totalCalls || 0}
                    </span>
                    <span className="t-micro" style={{ color: "var(--text-muted)" }}>
                      Tokens: {((veniceStats.totalTokens || 0) / 1000).toFixed(1)}K
                    </span>
                  </div>
                </div>
              )}

              {guardrailStats && (
                <div>
                  <span className="t-micro" style={{ color: "var(--text-faint)" }}>Guardrails</span>
                  <div className="flex gap-3 mt-1">
                    <span className="t-micro" style={{ color: "var(--text-muted)" }}>
                      Input blocked: {guardrailStats.inputBlocked || 0}
                    </span>
                    <span className="t-micro" style={{ color: "var(--text-muted)" }}>
                      Output filtered: {guardrailStats.outputBlocked || 0}
                    </span>
                  </div>
                </div>
              )}

              {process.env.NEXT_PUBLIC_OWNER_WALLET && (
                <div className="flex items-center gap-2">
                  <span className="t-micro" style={{ color: "var(--text-faint)" }}>Owner Wallet</span>
                  <span className="t-micro font-mono" style={{ color: "var(--text-muted)" }}>
                    {process.env.NEXT_PUBLIC_OWNER_WALLET}
                  </span>
                </div>
              )}
            </div>
          </Section>

          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {/* ── Links (existing) ── */}

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
            <span className="t-body">cortex</span>
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
