import { StatsGrid } from "@/components/stats/stats-grid";
import { TypeDistribution } from "@/components/stats/type-distribution";
import { TagCloud } from "@/components/stats/tag-cloud";
import { IntrospectionPanel } from "@/components/brain/introspection-panel";

export default function StatsPage() {
  return (
    <div className="h-full overflow-y-auto bg-[#04040a] p-6">
      <div className="animate-fade-slide-up">
        <h1 className="text-lg font-semibold tracking-wide text-white/90">Telemetry</h1>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.15em] text-indigo-400/40">
          aggregate metrics across all memory types
        </p>
      </div>

      <div className="mt-6">
        <StatsGrid />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
            Type Distribution
          </h2>
          <div className="mt-3">
            <TypeDistribution />
          </div>
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
            Tag Cloud
          </h2>
          <div className="mt-3">
            <TagCloud />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <IntrospectionPanel />
      </div>
    </div>
  );
}
