"use client";

import { useState } from "react";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { Slider, SectionHeader, Section, Divider } from "@/components/settings/settings-primitives";
import { useEngineConfig } from "@/lib/hooks/use-engine-config";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/engine-config";
import { useMemory } from "@/lib/memory-context";

// ── Schedule UI ─────────────────────────────────────────────────

function ScheduleToggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      disabled={loading}
      onClick={onToggle}
      className="rounded-full px-2.5 py-1 t-tiny transition"
      style={{
        background: enabled ? "rgba(34,197,94,0.15)" : "var(--surface)",
        color: enabled ? "var(--success)" : "var(--text-faint)",
        border: "1px solid var(--border)",
      }}
    >
      {loading ? "..." : enabled ? "Active" : "Off"}
    </button>
  );
}

function ScheduleInfo({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="space-y-0.5 mt-2 pl-1">
      {items.map((p) => (
        <div key={p.label} className="flex items-center justify-between">
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{p.label}</span>
          <span className="t-tiny" style={{ color: "var(--text-muted)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function ReinforcementPage() {
  const [engineConfig, updateEngine] = useEngineConfig();
  const { retrievalSettings, updateRetrievalSettings } = useMemory();
  const [decayRunning, setDecayRunning] = useState(false);
  const [decayResult, setDecayResult] = useState<string | null>(null);
  const [dreamScheduleLoading, setDreamScheduleLoading] = useState(false);
  const [reflectionScheduleLoading, setReflectionScheduleLoading] = useState(false);

  const runDecay = async () => {
    setDecayRunning(true);
    setDecayResult(null);
    try {
      const res = await fetch("/api/decay", { method: "POST" });
      const data = await res.json();
      setDecayResult(`Decayed ${data.decayed ?? 0} memories`);
      setTimeout(() => setDecayResult(null), 4000);
    } catch {
      setDecayResult("Decay failed");
      setTimeout(() => setDecayResult(null), 4000);
    }
    setDecayRunning(false);
  };

  const toggleDreamSchedule = async () => {
    setDreamScheduleLoading(true);
    try {
      const method = retrievalSettings.dreamScheduleEnabled ? "DELETE" : "POST";
      await fetch("/api/dream/schedule", { method });
      updateRetrievalSettings({ dreamScheduleEnabled: !retrievalSettings.dreamScheduleEnabled });
    } finally {
      setDreamScheduleLoading(false);
    }
  };

  const toggleReflectionSchedule = async () => {
    setReflectionScheduleLoading(true);
    try {
      const action = retrievalSettings.reflectionScheduleEnabled ? "stop" : "start";
      await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: action }),
      });
      updateRetrievalSettings({ reflectionScheduleEnabled: !retrievalSettings.reflectionScheduleEnabled });
    } finally {
      setReflectionScheduleLoading(false);
    }
  };

  return (
    <SettingsPageLayout title="reinforcement" subtitle="decay, learning & cycles">
      {/* ── Memory Decay ── */}
      <Section title="memory decay" defaultOpen>
        <SectionHeader title="Decay per 24h"
          onReset={() => updateEngine({ decayRates: DEFAULT_ENGINE_CONFIG.decayRates, minDecayFloor: DEFAULT_ENGINE_CONFIG.minDecayFloor })} />
        {(["episodic", "semantic", "procedural", "self_model", "introspective"] as const).map((t) => (
          <Slider key={t} label={t.replace("_", " ")} value={engineConfig.decayRates[t]} min={0.8} max={1.0} step={0.005}
            onChange={(v) => updateEngine({ decayRates: { ...engineConfig.decayRates, [t]: v } })} />
        ))}
        <Slider label="Min Floor" value={engineConfig.minDecayFloor} min={0} max={0.5}
          onChange={(v) => updateEngine({ minDecayFloor: v })} />
        <div className="flex items-center gap-2 mt-2">
          <button onClick={runDecay} disabled={decayRunning}
            className="rounded-[4px] px-3 py-1 t-small transition active:scale-95"
            style={{ background: "var(--surface-dimmer)", color: decayRunning ? "var(--text-faint)" : "var(--accent)", border: "1px solid var(--border)" }}>
            {decayRunning ? "Running..." : "Run Decay Now"}
          </button>
          {decayResult && (
            <span className="t-micro animate-fade-slide-up" style={{ color: "var(--success)" }}>{decayResult}</span>
          )}
        </div>
      </Section>

      <Divider />

      {/* ── Hebbian Reinforcement ── */}
      <Section title="hebbian reinforcement" defaultOpen>
        <SectionHeader title=""
          onReset={() => updateEngine({
            linkSimilarityThreshold: DEFAULT_ENGINE_CONFIG.linkSimilarityThreshold,
            maxAutoLinks: DEFAULT_ENGINE_CONFIG.maxAutoLinks,
            coRetrievalBoost: DEFAULT_ENGINE_CONFIG.coRetrievalBoost,
            importanceBoostPerRecall: DEFAULT_ENGINE_CONFIG.importanceBoostPerRecall,
          })} />
        <p className="t-tiny -mt-1 mb-2" style={{ color: "var(--text-faint)" }}>
          memories that fire together wire together
        </p>
        <Slider label="Link Threshold" value={engineConfig.linkSimilarityThreshold} min={0.3} max={0.9}
          onChange={(v) => updateEngine({ linkSimilarityThreshold: v })} />
        <Slider label="Max Auto Links" value={engineConfig.maxAutoLinks} min={1} max={20} step={1}
          onChange={(v) => updateEngine({ maxAutoLinks: v })} />
        <Slider label="Co-retrieval Boost" value={engineConfig.coRetrievalBoost} min={0.01} max={0.2}
          onChange={(v) => updateEngine({ coRetrievalBoost: v })} />
        <Slider label="Imp per Recall" value={engineConfig.importanceBoostPerRecall} min={0.001} max={0.05} step={0.001}
          onChange={(v) => updateEngine({ importanceBoostPerRecall: v })} />
      </Section>

      <Divider />

      {/* ── Dream Cycle ── */}
      <Section title="dream cycle">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
              background: retrievalSettings.dreamScheduleEnabled ? "var(--success)" : "var(--text-faint)",
            }} />
            <span className="t-small" style={{ color: "var(--text-muted)" }}>
              consolidate, compact, reflect, resolve, emerge
            </span>
          </div>
          <ScheduleToggle
            enabled={retrievalSettings.dreamScheduleEnabled}
            loading={dreamScheduleLoading}
            onToggle={toggleDreamSchedule}
          />
        </div>
        <ScheduleInfo items={[
          { label: "Cron", value: "Every 6 hours" },
          { label: "Initial delay", value: "2 min after start" },
          { label: "Cycle timeout", value: "10 min max" },
          { label: "Decay schedule", value: "Daily 3:00 AM UTC" },
        ]} />
        <SectionHeader title="Thresholds"
          onReset={() => updateEngine({
            dreamImportanceThreshold: DEFAULT_ENGINE_CONFIG.dreamImportanceThreshold,
            dreamMinIntervalMin: DEFAULT_ENGINE_CONFIG.dreamMinIntervalMin,
            dreamTimeoutMin: DEFAULT_ENGINE_CONFIG.dreamTimeoutMin,
          })} />
        <Slider label="Trigger Threshold" value={engineConfig.dreamImportanceThreshold} min={0.5} max={10} step={0.1}
          onChange={(v) => updateEngine({ dreamImportanceThreshold: v })} />
        <Slider label="Min Interval (m)" value={engineConfig.dreamMinIntervalMin} min={10} max={180} step={5}
          onChange={(v) => updateEngine({ dreamMinIntervalMin: v })} />
        <Slider label="Timeout (min)" value={engineConfig.dreamTimeoutMin} min={5} max={30} step={1}
          onChange={(v) => updateEngine({ dreamTimeoutMin: v })} />

        <SectionHeader title="Compaction"
          onReset={() => updateEngine({
            compactionAgeDays: DEFAULT_ENGINE_CONFIG.compactionAgeDays,
            compactionDecayThreshold: DEFAULT_ENGINE_CONFIG.compactionDecayThreshold,
            compactionImportanceThreshold: DEFAULT_ENGINE_CONFIG.compactionImportanceThreshold,
            compactionMinGroupSize: DEFAULT_ENGINE_CONFIG.compactionMinGroupSize,
          })} />
        <Slider label="Age (days)" value={engineConfig.compactionAgeDays} min={1} max={30} step={1}
          onChange={(v) => updateEngine({ compactionAgeDays: v })} />
        <Slider label="Decay Threshold" value={engineConfig.compactionDecayThreshold} min={0.1} max={0.5}
          onChange={(v) => updateEngine({ compactionDecayThreshold: v })} />
        <Slider label="Imp Threshold" value={engineConfig.compactionImportanceThreshold} min={0.1} max={0.8}
          onChange={(v) => updateEngine({ compactionImportanceThreshold: v })} />
        <Slider label="Min Group" value={engineConfig.compactionMinGroupSize} min={1} max={10} step={1}
          onChange={(v) => updateEngine({ compactionMinGroupSize: v })} />
      </Section>

      <Divider />

      {/* ── Active Reflection ── */}
      <Section title="active reflection">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
              background: retrievalSettings.reflectionScheduleEnabled ? "var(--success)" : "var(--text-faint)",
            }} />
            <span className="t-small" style={{ color: "var(--text-muted)" }}>
              journaling, introspection, self-model
            </span>
          </div>
          <ScheduleToggle
            enabled={retrievalSettings.reflectionScheduleEnabled}
            loading={reflectionScheduleLoading}
            onToggle={toggleReflectionSchedule}
          />
        </div>
        <ScheduleInfo items={[
          { label: "Interval", value: "Every 3 hours" },
          { label: "Cron", value: "At :30 past 1,4,7,10,13,16,19,22h UTC" },
          { label: "Initial delay", value: "30 min after start" },
          { label: "Session timeout", value: "8 min max" },
          { label: "Quiet hours", value: "23:00 - 08:00 UTC" },
        ]} />
        <SectionHeader title="Parameters"
          onReset={() => updateEngine({
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
    </SettingsPageLayout>
  );
}
