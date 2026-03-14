import { DreamCycleDisplay } from "@/components/dream/dream-cycle-display";

export default function DreamsPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-semibold text-white">Dreams</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Memory consolidation through simulated dream cycles
      </p>

      <div className="mt-6">
        <DreamCycleDisplay />
      </div>
    </div>
  );
}
