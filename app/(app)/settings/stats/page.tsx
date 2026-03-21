"use client";

import { useEffect, useState } from "react";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { StatsGrid } from "@/components/stats/stats-grid";
import { TypeDistribution } from "@/components/stats/type-distribution";
import { TagCloud } from "@/components/stats/tag-cloud";
import { IntrospectionPanel } from "@/components/brain/introspection-panel";

function ActionLearningStats() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [strategies, setStrategies] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/actions")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats || null);
        setStrategies(data.strategies || []);
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div>
      <h2 className="t-label mb-2">Action Learning</h2>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "actions", value: stats.actionsLogged ?? 0 },
          { label: "outcomes", value: stats.outcomesRecorded ?? 0 },
          { label: "strategies", value: stats.strategiesLearned ?? 0 },
          { label: "positive", value: stats.positive ?? 0, color: "var(--success)" },
          { label: "negative", value: stats.negative ?? 0, color: "var(--error)" },
          { label: "neutral", value: stats.neutral ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
            <div className="t-body font-mono" style={{ color: s.color || "var(--text)" }}>{s.value}</div>
            <div className="t-micro" style={{ color: "var(--text-faint)" }}>{s.label}</div>
          </div>
        ))}
      </div>
      {strategies.length > 0 && (
        <div className="mt-3 space-y-1">
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>Learned Strategies</span>
          {strategies.map((s, i) => (
            <div key={i} className="rounded-[4px] p-2 t-small" style={{ background: "var(--surface-dimmer)", color: "var(--text)", lineHeight: 1.5 }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeteringStats() {
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [venice, setVenice] = useState<any>(null);

  useEffect(() => {
    fetch("/api/cortex/meter")
      .then((r) => r.json())
      .then((data) => {
        setSummary(data.meterSummary || {});
        setVenice(data.veniceStats || null);
      })
      .catch(() => {});
  }, []);

  if (Object.keys(summary).length === 0 && !venice) return null;

  return (
    <div>
      <h2 className="t-label mb-2">Usage</h2>
      {Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(summary).map(([op, count]) => (
            <div key={op} className="rounded-[4px] p-2 text-center" style={{ background: "var(--surface-dimmer)" }}>
              <div className="t-body font-mono" style={{ color: "var(--text)" }}>{count}</div>
              <div className="t-micro truncate" style={{ color: "var(--text-faint)" }}>{op}</div>
            </div>
          ))}
        </div>
      )}
      {venice && (
        <div className="flex gap-4 mt-2">
          <span className="t-small" style={{ color: "var(--text-muted)" }}>Venice: {venice.totalCalls || 0} calls</span>
          <span className="t-small" style={{ color: "var(--text-muted)" }}>{((venice.totalTokens || 0) / 1000).toFixed(1)}K tokens</span>
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  return (
    <SettingsPageLayout title="stats" subtitle="analytics & usage">
      <StatsGrid />
      <div>
        <h2 className="t-label mb-2">Type Distribution</h2>
        <TypeDistribution />
      </div>
      <div>
        <h2 className="t-label mb-2">Tag Cloud</h2>
        <TagCloud />
      </div>
      <ActionLearningStats />
      <MeteringStats />
      <IntrospectionPanel />
    </SettingsPageLayout>
  );
}
