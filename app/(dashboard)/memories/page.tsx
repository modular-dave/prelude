import { MemoryTypeCards } from "@/components/memory/memory-type-cards";
import { MemoryTimeline } from "@/components/memory/memory-timeline";

export default function MemoriesPage() {
  return (
    <div className="h-full overflow-y-auto bg-[#04040a] p-6">
      <div className="animate-fade-slide-up">
        <h1 className="text-lg font-semibold tracking-wide text-white/90">Memory Bank</h1>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.15em] text-indigo-400/40">
          browse and inspect stored memories by type
        </p>
      </div>

      <div className="mt-6">
        <MemoryTypeCards />
      </div>

      <h2 className="mt-8 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
        Timeline
      </h2>
      <div className="mt-3">
        <MemoryTimeline />
      </div>
    </div>
  );
}
