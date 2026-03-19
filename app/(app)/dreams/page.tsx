import { DreamCycleDisplay } from "@/components/dream/dream-cycle-display";
import { FloatNav } from "@/components/shell/float-nav";

export default function DreamsPage() {
  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <span className="font-mono t-title" style={{ color: "var(--text)" }}>dreams</span>
        <p className="font-mono mt-1 t-tiny" style={{ color: "var(--text-faint)" }}>
          memory consolidation through simulated sleep phases
        </p>
      </div>

      <div className="mt-6">
        <DreamCycleDisplay />
      </div>

      <FloatNav route="dreams" />
    </div>
  );
}
