"use client";

import { Dot, Line } from "./_shared";
import type { SetupWizardState } from "./_types";

export function DetectStep({ wiz }: { wiz: SetupWizardState }) {
  if (wiz.detecting) {
    return <p className="t-body text-center" style={{ color: "var(--text-muted)" }}>scanning...</p>;
  }

  if (!wiz.detection) {
    return (
      <button
        onClick={() => wiz.goTo("inference")}
        className="text-btn t-body"
        style={{ color: "var(--accent)" }}
      >
        configure manually →
      </button>
    );
  }

  const { detection } = wiz;

  return (
    <div className="space-y-6 animate-fade-slide-up">
      {/* Platform */}
      <div>
        <div className="flex items-center gap-1.5">
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>platform︱</span>
          <span className="t-body" style={{ color: "var(--text)" }}>
            {wiz.osLabel} · {detection.platform.arch}
          </span>
        </div>
        <p className="t-micro mt-0.5" style={{ color: "var(--text-faint)" }}>
          {detection.platform.cpuModel}
        </p>
      </div>

      <Line />

      {/* Available inference servers */}
      <div className="space-y-2">
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>inference servers</span>
        <div className="space-y-1.5 mt-1">
          <div className="flex items-center gap-2">
            <Dot ok={detection.backends.mlx.available} />
            <span className="t-body" style={{ color: detection.backends.mlx.available ? "var(--text)" : "var(--text-faint)" }}>
              mlx
            </span>
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>
              {detection.backends.mlx.inference ? "inference" : ""}
              {detection.backends.mlx.embedding ? " + embedding" : ""}
              {!detection.backends.mlx.available && detection.platform.isAppleSilicon ? "not running" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Dot ok={detection.backends.ollama.available} />
            <span className="t-body" style={{ color: detection.backends.ollama.available ? "var(--text)" : "var(--text-faint)" }}>
              ollama
            </span>
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>
              {detection.backends.ollama.available
                ? `${detection.backends.ollama.inferenceModels.length + detection.backends.ollama.embeddingModels.length} models`
                : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Dot ok={detection.backends.cloud.configured} />
            <span className="t-body" style={{ color: detection.backends.cloud.configured ? "var(--text)" : "var(--text-faint)" }}>
              cloud
            </span>
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>
              {detection.backends.cloud.configured ? "api key set" : "needs api key"}
            </span>
          </div>
        </div>
      </div>

      <Line />

      {/* Continue */}
      <div className="flex items-center justify-between">
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
          recommended︱<span style={{ color: "var(--accent)" }}>{detection.recommended}</span>
        </span>
        <button
          onClick={() => wiz.goTo("inference")}
          className="text-btn t-body transition active:scale-95"
          style={{ color: "var(--accent)" }}
        >
          continue →
        </button>
      </div>
    </div>
  );
}
