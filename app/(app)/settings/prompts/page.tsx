"use client";

import { useEffect, useState } from "react";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { Section, Divider } from "@/components/settings/settings-primitives";
import {
  loadPromptConfig,
  savePromptConfig,
  previewPrompt,
  type PromptConfig,
} from "@/lib/prompt-builder";

export default function PromptsPage() {
  const [promptConfig, setPromptConfig] = useState<PromptConfig>({
    persona: "",
    customInstructions: "",
    securityRules: true,
    memoryInstructions: true,
    webSearchEnabled: false,
  });
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setPromptConfig(loadPromptConfig());
  }, []);

  const update = (partial: Partial<PromptConfig>) => {
    const updated = { ...promptConfig, ...partial };
    setPromptConfig(updated);
    savePromptConfig(updated);
  };

  return (
    <SettingsPageLayout title="prompts" subtitle="persona & instructions">
      {/* ── Persona ── */}
      <Section title="persona" defaultOpen>
        <textarea
          value={promptConfig.persona}
          onChange={(e) => update({ persona: e.target.value })}
          placeholder="You are Clude, an AI companion..."
          rows={3}
          className="w-full resize-y bg-transparent px-0 py-1 outline-none t-small"
          style={{
            borderBottom: "1px solid var(--border)",
            color: "var(--text)",
            minHeight: "40px",
            maxHeight: "120px",
            lineHeight: 1.6,
          }}
        />
      </Section>

      <Divider />

      {/* ── Custom Instructions ── */}
      <Section title="custom instructions" defaultOpen>
        <textarea
          value={promptConfig.customInstructions}
          onChange={(e) => update({ customInstructions: e.target.value })}
          placeholder="Additional instructions for behavior, tone, style..."
          rows={2}
          className="w-full resize-y bg-transparent px-0 py-1 outline-none t-small"
          style={{
            borderBottom: "1px solid var(--border)",
            color: "var(--text)",
            minHeight: "30px",
            maxHeight: "100px",
            lineHeight: 1.6,
          }}
        />
      </Section>

      <Divider />

      {/* ── Safety & Context ── */}
      <Section title="safety & context" defaultOpen>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={promptConfig.securityRules} onChange={(e) => update({ securityRules: e.target.checked })} />
            <span className="t-small" style={{ color: "var(--text)" }}>Security Rules</span>
            <span className="t-tiny" style={{ color: "var(--text-faint)" }}>anti-injection</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={promptConfig.memoryInstructions} onChange={(e) => update({ memoryInstructions: e.target.checked })} />
            <span className="t-small" style={{ color: "var(--text)" }}>Memory Instructions</span>
            <span className="t-tiny" style={{ color: "var(--text-faint)" }}>recall context</span>
          </label>
        </div>
      </Section>

      <Divider />

      {/* ── Preview ── */}
      <Section title="assembled prompt">
        <div className="rounded-[4px] p-2 t-micro leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto"
          style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}>
          {previewPrompt(promptConfig)}
        </div>
      </Section>
    </SettingsPageLayout>
  );
}
