import { FloatNav } from "@/components/shell/float-nav";
import { InferenceSection } from "./_inference-section";
import { EmbeddingSection } from "./_embedding-section";

export default function ModelsPage() {
  return (
    <div className="relative h-full overflow-y-auto p-6 pt-16 font-mono" style={{ background: "var(--bg)" }}>
      <div className="animate-fade-slide-up">
        <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--text)" }}>Models</h1>
        <p className="mt-1" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
          Configure inference providers and embedding models
        </p>
      </div>

      <InferenceSection />
      <EmbeddingSection />

      <FloatNav route="brain" />
    </div>
  );
}
