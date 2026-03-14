import { DreamCycleDisplay } from "@/components/dream/dream-cycle-display";
import { FloatNav } from "@/components/shell/float-nav";

export default function DreamsPage() {
  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <h1 className="heading">Dream Cycle</h1>
        <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
          Memory consolidation through simulated sleep phases
        </p>
      </div>

      <div className="mt-6">
        <DreamCycleDisplay />
      </div>

      <FloatNav route="dreams" />
    </div>
  );
}
