import { FloatNav } from "@/components/shell/float-nav";
import { InferenceSection } from "./_inference-section";
import { EmbeddingSection } from "./_embedding-section";

export default function ModelsPage() {
  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16 font-mono" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <span className="t-title" style={{ color: "var(--text)" }}>models</span>
        <p className="mt-1 t-tiny" style={{ color: "var(--text-faint)" }}>
          inference providers and embedding
        </p>
      </div>

      <InferenceSection />
      <EmbeddingSection />

      <FloatNav route="brain" />
    </div>
  );
}
