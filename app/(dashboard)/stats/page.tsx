import { StatsGrid } from "@/components/stats/stats-grid";
import { TypeDistribution } from "@/components/stats/type-distribution";
import { TagCloud } from "@/components/stats/tag-cloud";
import { IntrospectionPanel } from "@/components/brain/introspection-panel";

export default function StatsPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-semibold text-white">Statistics</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Aggregate metrics across all memory types
      </p>

      <div className="mt-6">
        <StatsGrid />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-400">
            Type Distribution
          </h2>
          <div className="mt-3">
            <TypeDistribution />
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-neutral-400">
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
