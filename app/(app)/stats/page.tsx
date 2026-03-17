"use client";

import { FloatNav } from "@/components/shell/float-nav";
import { StatsGrid } from "@/components/stats/stats-grid";
import { TypeDistribution } from "@/components/stats/type-distribution";
import { TagCloud } from "@/components/stats/tag-cloud";
import { IntrospectionPanel } from "@/components/brain/introspection-panel";

export default function StatsPage() {
  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-2xl animate-fade-slide-up space-y-6">
        <h1 className="t-heading" style={{ color: "var(--text)" }}>Stats</h1>
        <StatsGrid />
        <div>
          <h2 className="label mb-2">Type Distribution</h2>
          <TypeDistribution />
        </div>
        <div>
          <h2 className="label mb-2">Tag Cloud</h2>
          <TagCloud />
        </div>
        <IntrospectionPanel />
      </div>
      <FloatNav route="stats" />
    </div>
  );
}
