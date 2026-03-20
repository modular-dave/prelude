"use client";

import { Dot, Line, Section } from "./_shared";
import type { SetupWizardState } from "./_types";
import { EMB_LOCAL, EMB_HOSTED } from "@/app/(app)/models/_types";

export function EmbeddingStep({ wiz }: { wiz: SetupWizardState }) {
  const mlxAvail = wiz.detection?.backends.mlx.available || wiz.detection?.platform.isAppleSilicon;
  const mlxRunning = wiz.detection?.backends.mlx.embedding;
  const isApple = wiz.detection?.platform.isAppleSilicon || wiz.detection?.platform.os === "darwin";
  const ollamaRunning = wiz.detection?.backends.ollama.available;
  // Ollama embeddings crash on Apple Metal — hide for embedding (inference is fine)
  const showOllama = ollamaRunning && !isApple;
  const isLocal = wiz.embBackend === "mlx" || wiz.embBackend === "ollama";
  const isHosted = wiz.embBackend === "openai" || wiz.embBackend === "voyage";

  return (
    <div className="space-y-5 animate-fade-slide-up">

      {/* ── Local: servers → models ── */}
      <Section label="local servers" active={isLocal} onSelect={() => wiz.setEmbBackend(mlxAvail ? "mlx" : "ollama")}>
        <div className="space-y-4">
          {/* MLX embedding */}
          {isApple && (
            <div>
              <div className="flex items-center gap-2 py-1">
                <Dot ok={!!mlxRunning} />
                <button
                  onClick={() => wiz.setEmbBackend("mlx")}
                  disabled={!mlxAvail}
                  className="t-body transition active:scale-[0.99] disabled:opacity-30"
                  style={{ color: wiz.embBackend === "mlx" ? "var(--text)" : mlxAvail ? "var(--text-faint)" : "var(--text-faint)" }}
                >
                  MLX
                </button>
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>Apple Silicon native</span>
                {mlxRunning && (
                  <span className="t-micro ml-auto" style={{ color: "var(--success)" }}>running</span>
                )}
                {mlxAvail && !mlxRunning && (
                  <span className="t-micro ml-auto" style={{ color: "var(--text-faint)" }}>not running</span>
                )}
              </div>
              {/* MLX models */}
              {wiz.embBackend === "mlx" && (
                <EmbModelList wiz={wiz} />
              )}
            </div>
          )}

          {/* Ollama embedding — hidden on Apple (Metal crash) */}
          {showOllama && (
            <div>
              <div className="flex items-center gap-2 py-1">
                <Dot ok />
                <button
                  onClick={() => wiz.setEmbBackend("ollama")}
                  className="t-body transition active:scale-[0.99]"
                  style={{ color: wiz.embBackend === "ollama" ? "var(--text)" : "var(--text-faint)" }}
                >
                  Ollama
                </button>
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>shared with inference</span>
                <span className="t-micro ml-auto" style={{ color: "var(--success)" }}>running</span>
              </div>
              {wiz.embBackend === "ollama" && (
                <EmbModelList wiz={wiz} />
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── Hosted: provider → key → models ── */}
      <Section label="hosted APIs" active={isHosted} onSelect={() => wiz.setEmbBackend(EMB_HOSTED[0].id)}>
        <div className="space-y-4">
          {EMB_HOSTED.map((hp) => (
            <div key={hp.id}>
              <div className="flex items-center gap-2 py-1">
                <Dot ok={wiz.embBackend === hp.id && !!wiz.embApiKey} />
                <button
                  onClick={() => wiz.setEmbBackend(hp.id)}
                  className="t-body transition active:scale-[0.99]"
                  style={{ color: wiz.embBackend === hp.id ? "var(--text)" : "var(--text-faint)" }}
                >
                  {hp.name}
                </button>
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>{hp.desc}</span>
              </div>
              {/* Nested: API key + models */}
              {wiz.embBackend === hp.id && (
                <div className="pl-4 mt-1.5 space-y-2">
                  <input
                    type="password"
                    value={wiz.embApiKey}
                    onChange={e => wiz.setEmbApiKey(e.target.value)}
                    placeholder={`${hp.name} api key`}
                    className="w-full bg-transparent outline-none font-mono t-body px-0 py-1"
                    style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }}
                  />
                  <EmbModelList wiz={wiz} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Test */}
      <div className="flex items-center gap-2">
        <button
          onClick={wiz.handleTestEmbedding}
          disabled={wiz.testingEmb || !wiz.embModel}
          className="text-btn t-micro transition active:scale-95"
          style={{ color: "var(--text-faint)", opacity: wiz.testingEmb || !wiz.embModel ? 0.4 : 1 }}
        >
          {wiz.testingEmb ? "testing..." : "test connection"}
        </button>
        {wiz.testEmbResult && (
          <span className="t-micro" style={{ color: wiz.testEmbResult.ok ? "var(--success)" : "var(--error)" }}>
            {wiz.testEmbResult.ok ? "connected" : wiz.testEmbResult.error || "failed"}
          </span>
        )}
      </div>

      <Line />

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => wiz.goTo("inference")}
          className="text-btn t-tiny transition active:scale-95"
          style={{ color: "var(--text-faint)" }}
        >
          ← back
        </button>
        <button
          onClick={() => wiz.goTo("storage")}
          disabled={!wiz.embModel}
          className="text-btn t-body transition active:scale-95"
          style={{ color: "var(--accent)", opacity: !wiz.embModel ? 0.3 : 1 }}
        >
          storage →
        </button>
      </div>
    </div>
  );
}

// ── Embedding Model List ─────────────────────────────────────

function EmbModelList({ wiz }: { wiz: SetupWizardState }) {
  const models = wiz.getEmbModels();
  return (
    <div className="pl-4 mt-1.5">
      <span className="t-micro" style={{ color: "var(--text-faint)" }}>model</span>
      <div className="space-y-0.5 mt-1">
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => { wiz.setEmbModel(m.id); wiz.setEmbDims(m.dims); }}
            className="block w-full text-left py-0.5 transition active:scale-[0.99]"
            style={{ color: wiz.embModel === m.id ? "var(--accent)" : "var(--text)", fontSize: 11 }}
          >
            {m.name}{" "}
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>{m.dims}d · {m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
