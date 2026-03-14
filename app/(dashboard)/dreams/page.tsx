import { DreamCycleDisplay } from "@/components/dream/dream-cycle-display";

export default function DreamsPage() {
  return (
    <div className="h-full overflow-y-auto bg-[#04040a] p-6">
      <div className="animate-fade-slide-up">
        <h1 className="text-lg font-semibold tracking-wide text-white/90">Dream Cycle</h1>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.15em] text-indigo-400/40">
          memory consolidation through simulated sleep phases
        </p>
      </div>

      <div className="mt-6">
        <DreamCycleDisplay />
      </div>
    </div>
  );
}
