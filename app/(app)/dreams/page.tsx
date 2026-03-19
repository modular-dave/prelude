import { DreamCycleDisplay } from "@/components/dream/dream-cycle-display";
import { FloatNav } from "@/components/shell/float-nav";

export default function DreamsPage() {
  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <h1 className="font-mono" style={{ fontSize: 16, fontWeight: 500, color: "var(--text)" }}>Dreams</h1>
        <p className="font-mono mt-1" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
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
