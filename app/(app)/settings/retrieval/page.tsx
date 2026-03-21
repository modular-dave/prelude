"use client";

import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { Slider, SectionHeader, Section, Divider } from "@/components/settings/settings-primitives";
import { useEngineConfig } from "@/lib/hooks/use-engine-config";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/engine-config";
import { useMemory } from "@/lib/memory-context";
import { TypeFilterToggles } from "@/components/ui/type-filter-toggles";
import { DEFAULT_RETRIEVAL_SETTINGS } from "@/lib/retrieval-settings";

export default function RetrievalPage() {
  const [engineConfig, updateEngine] = useEngineConfig();
  const { retrievalSettings, updateRetrievalSettings } = useMemory();
  const s = retrievalSettings;

  return (
    <SettingsPageLayout title="retrieval" subtitle="scoring weights & boosts">
      <Section title="recall filters" defaultOpen>
        <SectionHeader title="Filters" onReset={() => updateRetrievalSettings({ ...DEFAULT_RETRIEVAL_SETTINGS })} />
        <Slider label="Recall Limit" value={s.recallLimit} min={1} max={20} step={1}
          onChange={(v) => updateRetrievalSettings({ recallLimit: v })} />
        <Slider label="Min Importance" value={s.minImportance} min={0} max={1} step={0.05}
          onChange={(v) => updateRetrievalSettings({ minImportance: v })} />
        <Slider label="Min Decay" value={s.minDecay} min={0} max={1} step={0.05}
          onChange={(v) => updateRetrievalSettings({ minDecay: v })} />
        <TypeFilterToggles
          enabled={s.enabledTypes}
          onChange={(types) => updateRetrievalSettings({ enabledTypes: types })}
        />
      </Section>

      <Divider />

      <Section title="retrieval scoring" defaultOpen>
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

      <Divider />

      <Section title="knowledge type boosts">
        <SectionHeader title="Boost per type" onReset={() => updateEngine({ typeBoosts: DEFAULT_ENGINE_CONFIG.typeBoosts })} />
        {(["episodic", "semantic", "procedural", "self_model", "introspective"] as const).map((t) => (
          <Slider key={t} label={t.replace("_", " ")} value={engineConfig.typeBoosts[t]} min={0} max={0.5}
            onChange={(v) => updateEngine({ typeBoosts: { ...engineConfig.typeBoosts, [t]: v } })} />
        ))}
      </Section>

      <Divider />

      <Section title="content limits">
        <SectionHeader title="Memory content" onReset={() => updateEngine({
          memoryMaxContentLength: DEFAULT_ENGINE_CONFIG.memoryMaxContentLength,
          memorySummaryMaxLength: DEFAULT_ENGINE_CONFIG.memorySummaryMaxLength,
        })} />
        <Slider label="Max Content" value={engineConfig.memoryMaxContentLength} min={1000} max={20000} step={500}
          onChange={(v) => updateEngine({ memoryMaxContentLength: v })} />
        <Slider label="Max Summary" value={engineConfig.memorySummaryMaxLength} min={100} max={2000} step={50}
          onChange={(v) => updateEngine({ memorySummaryMaxLength: v })} />
      </Section>

      <Divider />

      <Section title="clinamen">
        <SectionHeader title="Anomaly detection" onReset={() => updateEngine({
          clinamenMinAgeHours: DEFAULT_ENGINE_CONFIG.clinamenMinAgeHours,
          clinamenCandidatePoolSize: DEFAULT_ENGINE_CONFIG.clinamenCandidatePoolSize,
        })} />
        <Slider label="Min Age (h)" value={engineConfig.clinamenMinAgeHours} min={0} max={168} step={1}
          onChange={(v) => updateEngine({ clinamenMinAgeHours: v })} />
        <Slider label="Pool Size" value={engineConfig.clinamenCandidatePoolSize} min={20} max={500} step={10}
          onChange={(v) => updateEngine({ clinamenCandidatePoolSize: v })} />
        <SectionHeader title="Divergent recall" onReset={() => updateRetrievalSettings({
          clinamenLimit: DEFAULT_RETRIEVAL_SETTINGS.clinamenLimit,
          clinamenMinImportance: DEFAULT_RETRIEVAL_SETTINGS.clinamenMinImportance,
          clinamenMaxRelevance: DEFAULT_RETRIEVAL_SETTINGS.clinamenMaxRelevance,
        })} />
        <Slider label="Clinamen Limit" value={s.clinamenLimit} min={1} max={10} step={1}
          onChange={(v) => updateRetrievalSettings({ clinamenLimit: v })} />
        <Slider label="Min Importance" value={s.clinamenMinImportance} min={0} max={1} step={0.05}
          onChange={(v) => updateRetrievalSettings({ clinamenMinImportance: v })} />
        <Slider label="Max Relevance" value={s.clinamenMaxRelevance} min={0} max={1} step={0.05}
          onChange={(v) => updateRetrievalSettings({ clinamenMaxRelevance: v })} />
      </Section>
    </SettingsPageLayout>
  );
}
