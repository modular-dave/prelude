"use client";

import { InferenceSection } from "@/app/(app)/models/_inference-section";
import { EmbeddingSection } from "@/app/(app)/models/_embedding-section";

export function ModelsPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="p-4 font-mono">
      <button
        onClick={onBack}
        className="text-btn"
        style={{ fontSize: 9, color: "var(--text-faint)" }}
      >
        &larr; settings
      </button>
      <h2
        className="mt-3"
        style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}
      >
        models
      </h2>
      <p
        className="mt-1"
        style={{ fontSize: 11, color: "var(--text-faint)" }}
      >
        inference providers and embedding models
      </p>
      <InferenceSection />
      <EmbeddingSection />
    </div>
  );
}
