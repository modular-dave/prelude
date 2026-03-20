"use client";

import { useSetupWizard } from "./use-setup-wizard";
import { InferenceStep } from "./_inference-step";
import { EmbeddingStep } from "./_embedding-step";
import { StorageStep } from "./_storage-step";
import { STEPS } from "./_types";

const STEP_LABELS: Record<string, string> = {
  inference: "inference",
  embedding: "embedding",
  storage: "storage",
};

export default function SetupPage() {
  const wiz = useSetupWizard();
  const currentIdx = STEPS.indexOf(wiz.step);

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-6 py-12 font-mono min-h-full flex flex-col justify-center">
        <div className="mb-10 text-center">
          <p className="t-title" style={{ color: "var(--text)" }}>prelude</p>
          <p className="t-tiny mt-1" style={{ color: "var(--text-faint)" }}>
            {STEP_LABELS[wiz.step]}
          </p>
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === currentIdx ? 16 : 6,
                  height: 6,
                  backgroundColor: i <= currentIdx ? "var(--accent)" : "var(--border)",
                }}
              />
            ))}
          </div>
        </div>

        {wiz.step === "inference" && <InferenceStep wiz={wiz} />}
        {wiz.step === "embedding" && <EmbeddingStep wiz={wiz} />}
        {wiz.step === "storage" && <StorageStep wiz={wiz} />}
      </div>
    </div>
  );
}
