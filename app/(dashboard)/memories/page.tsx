import { MemoryTypeCards } from "@/components/memory/memory-type-cards";
import { MemoryTimeline } from "@/components/memory/memory-timeline";

export default function MemoriesPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-semibold text-white">Memories</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Browse and inspect stored memories by type
      </p>

      <div className="mt-6">
        <MemoryTypeCards />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-neutral-400">Timeline</h2>
      <div className="mt-3">
        <MemoryTimeline />
      </div>
    </div>
  );
}
