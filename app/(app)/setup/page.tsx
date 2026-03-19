"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrainScanline } from "@/components/brain/brain-scanline";

// ── Types ────────────────────────────────────────────────────────

interface Platform {
  os: string;
  arch: string;
  isAppleSilicon: boolean;
  cpuModel: string;
}

interface DetectResult {
  platform: Platform;
  backends: {
    mlx: {
      available: boolean;
      inference: boolean;
      inferenceModel: string | null;
      embedding: boolean;
      embeddingModel: string | null;
      embeddingDims: number | null;
    };
    ollama: {
      available: boolean;
      inferenceModels: string[];
      embeddingModels: string[];
    };
    cloud: {
      available: boolean;
      configured: boolean;
    };
  };
  recommended: string;
}

type Step = "detect" | "inference" | "embedding" | "confirm";

const S = {
  h1: { fontSize: 16, fontWeight: 500 } as const,
  h2: { fontSize: 13, fontWeight: 500 } as const,
  p: { fontSize: 11, fontWeight: 400, lineHeight: 1.6 } as const,
  small: { fontSize: 9, fontWeight: 400 } as const,
  accent: "var(--accent)",
  muted: "var(--text-muted)",
  faint: "var(--text-faint)",
};

// ── Component ────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("detect");
  const [detecting, setDetecting] = useState(true);
  const [detection, setDetection] = useState<DetectResult | null>(null);
  const [saving, setSaving] = useState(false);

  // User choices
  const [selectedBackend, setSelectedBackend] = useState<"mlx" | "ollama" | "cloud">("mlx");
  const [selectedInfModel, setSelectedInfModel] = useState<string>("");
  const [selectedEmbModel, setSelectedEmbModel] = useState<string>("");
  const [selectedEmbDims, setSelectedEmbDims] = useState<number>(384);

  // Cloud config
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudBaseUrl, setCloudBaseUrl] = useState("");

  // ── Step 1: Detect hardware ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "detect" }),
        });
        const data: DetectResult = await res.json();
        setDetection(data);

        // Auto-select recommended backend
        const rec = data.recommended as "mlx" | "ollama" | "cloud";
        setSelectedBackend(rec);

        // Pre-select models
        if (rec === "mlx") {
          setSelectedInfModel(data.backends.mlx.inferenceModel || "mlx-community/Qwen2.5-0.5B-Instruct-4bit");
          setSelectedEmbModel(data.backends.mlx.embeddingModel || "sentence-transformers/all-MiniLM-L6-v2");
          setSelectedEmbDims(data.backends.mlx.embeddingDims || 384);
        } else if (rec === "ollama") {
          const infModels = data.backends.ollama.inferenceModels;
          const embModels = data.backends.ollama.embeddingModels;
          setSelectedInfModel(infModels[0] || "qwen2.5:0.5b");
          setSelectedEmbModel(embModels[0] || "nomic-embed-text");
          setSelectedEmbDims(embModels[0]?.includes("mxbai") ? 1024 : 768);
        }
      } catch {
        // Detection failed — still show the page
      } finally {
        setDetecting(false);
      }
    })();
  }, []);

  // ── Step 4: Save config ──
  const handleSave = async () => {
    setSaving(true);
    const config: Record<string, string> = {
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    };

    if (selectedBackend === "mlx") {
      config.VENICE_BASE_URL = "http://127.0.0.1:8899/v1";
      config.VENICE_API_KEY = "local";
      config.VENICE_MODEL = selectedInfModel;
      config.INFERENCE_CHAT_MODEL = selectedInfModel;
      config.INFERENCE_CHAT_PROVIDER = "mlx";
      config.EMBEDDING_PROVIDER = "openai";
      config.EMBEDDING_BASE_URL = "http://127.0.0.1:11435/v1";
      config.EMBEDDING_API_KEY = "local";
      config.EMBEDDING_MODEL = selectedEmbModel;
      config.EMBEDDING_DIMENSIONS = String(selectedEmbDims);
    } else if (selectedBackend === "ollama") {
      config.VENICE_BASE_URL = "http://127.0.0.1:11434/v1";
      config.VENICE_API_KEY = "local";
      config.VENICE_MODEL = selectedInfModel;
      config.INFERENCE_CHAT_MODEL = selectedInfModel;
      config.INFERENCE_CHAT_PROVIDER = "ollama";
      config.EMBEDDING_PROVIDER = "openai";
      config.EMBEDDING_BASE_URL = "http://127.0.0.1:11434/v1";
      config.EMBEDDING_API_KEY = "ollama";
      config.EMBEDDING_MODEL = selectedEmbModel;
      config.EMBEDDING_DIMENSIONS = String(selectedEmbDims);
    } else {
      config.VENICE_BASE_URL = cloudBaseUrl || "https://api.venice.ai/api/v1";
      config.VENICE_API_KEY = cloudApiKey;
      config.VENICE_MODEL = selectedInfModel || "llama-3.3-70b";
      config.INFERENCE_CHAT_MODEL = selectedInfModel || "llama-3.3-70b";
      config.INFERENCE_CHAT_PROVIDER = "venice";
      config.EMBEDDING_PROVIDER = "voyage";
      config.EMBEDDING_API_KEY = cloudApiKey;
      config.EMBEDDING_MODEL = "voyage-3-lite";
      config.EMBEDDING_DIMENSIONS = "1024";
    }

    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", config }),
      });
      router.push("/");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──

  const dot = (ok: boolean) => (
    <span
      className="inline-block h-[5px] w-[5px] rounded-full"
      style={{ background: ok ? "#22c55e" : "var(--text-faint)" }}
    />
  );

  const osLabel = detection?.platform
    ? detection.platform.isAppleSilicon
      ? "Apple Silicon"
      : detection.platform.os === "darwin"
        ? "macOS Intel"
        : detection.platform.os === "linux"
          ? "Linux"
          : detection.platform.os === "win32"
            ? "Windows"
            : detection.platform.os
    : "...";

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md px-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <BrainScanline size={60} />
          <h1 className="font-mono mt-4" style={S.h1}>
            prelude setup
          </h1>
          <p className="font-mono mt-1" style={{ ...S.small, color: S.faint }}>
            {step === "detect" && "detecting environment..."}
            {step === "inference" && "choose inference model"}
            {step === "embedding" && "choose embedding model"}
            {step === "confirm" && "review configuration"}
          </p>
        </div>

        {/* ── Step 1: Detection ── */}
        {step === "detect" && (
          <div className="space-y-4">
            {detecting ? (
              <p className="font-mono text-center" style={{ ...S.p, color: S.muted }}>
                scanning hardware...
              </p>
            ) : detection ? (
              <>
                {/* Platform */}
                <div className="p-4" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
                  <p className="font-mono" style={S.h2}>platform</p>
                  <p className="font-mono mt-1" style={{ ...S.p, color: S.muted }}>
                    {osLabel} · {detection.platform.arch}
                  </p>
                  <p className="font-mono" style={{ ...S.small, color: S.faint }}>
                    {detection.platform.cpuModel}
                  </p>
                </div>

                {/* Backends */}
                <div className="p-4" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
                  <p className="font-mono mb-2" style={S.h2}>backends</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.mlx.available)}
                      <span className="font-mono" style={{ ...S.p, color: detection.backends.mlx.available ? "var(--text)" : S.faint }}>
                        mlx
                      </span>
                      {detection.backends.mlx.available && (
                        <span className="font-mono" style={{ ...S.small, color: S.faint }}>
                          inference{detection.backends.mlx.inference ? " + embedding" : ""}
                        </span>
                      )}
                      {!detection.backends.mlx.available && detection.platform.isAppleSilicon && (
                        <span className="font-mono" style={{ ...S.small, color: S.faint }}>
                          not running
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.ollama.available)}
                      <span className="font-mono" style={{ ...S.p, color: detection.backends.ollama.available ? "var(--text)" : S.faint }}>
                        ollama
                      </span>
                      {detection.backends.ollama.available && (
                        <span className="font-mono" style={{ ...S.small, color: S.faint }}>
                          {detection.backends.ollama.inferenceModels.length} models
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.cloud.configured)}
                      <span className="font-mono" style={{ ...S.p, color: detection.backends.cloud.configured ? "var(--text)" : S.faint }}>
                        cloud
                      </span>
                      <span className="font-mono" style={{ ...S.small, color: S.faint }}>
                        {detection.backends.cloud.configured ? "api key set" : "needs api key"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recommended */}
                <p className="font-mono text-center" style={{ ...S.small, color: S.accent }}>
                  recommended: {detection.recommended}
                </p>

                <button
                  onClick={() => setStep("inference")}
                  className="w-full py-2 font-mono transition active:scale-[0.98]"
                  style={{ ...S.p, color: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}
                >
                  continue
                </button>
              </>
            ) : (
              <p className="font-mono text-center" style={{ ...S.p, color: S.faint }}>
                detection failed — configure manually below
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Choose inference model ── */}
        {step === "inference" && detection && (
          <div className="space-y-4">
            {/* Backend selector */}
            <div className="flex gap-2">
              {(["mlx", "ollama", "cloud"] as const).map((b) => {
                const available = b === "mlx" ? detection.backends.mlx.available || detection.platform.isAppleSilicon
                  : b === "ollama" ? detection.backends.ollama.available
                  : true; // cloud always available
                return (
                  <button
                    key={b}
                    onClick={() => setSelectedBackend(b)}
                    disabled={!available}
                    className="flex-1 py-1.5 font-mono transition active:scale-[0.98] disabled:opacity-30"
                    style={{
                      ...S.p,
                      color: selectedBackend === b ? S.accent : S.muted,
                      border: `1px solid ${selectedBackend === b ? S.accent : "var(--border)"}`,
                      borderRadius: 4,
                      textAlign: "center",
                    }}
                  >
                    {b}
                  </button>
                );
              })}
            </div>

            {/* Model list for selected backend */}
            <div className="p-4 space-y-2" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
              <p className="font-mono" style={S.h2}>inference model</p>

              {selectedBackend === "mlx" && (
                <>
                  {(detection.backends.mlx.inferenceModel
                    ? [detection.backends.mlx.inferenceModel]
                    : ["mlx-community/Qwen2.5-0.5B-Instruct-4bit", "mlx-community/Qwen2.5-1.5B-Instruct-4bit", "mlx-community/Llama-3.2-1B-Instruct-4bit"]
                  ).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelectedInfModel(m)}
                      className="block w-full text-left px-2 py-1 font-mono transition"
                      style={{
                        ...S.p,
                        color: selectedInfModel === m ? S.accent : "var(--text)",
                        background: selectedInfModel === m ? "var(--surface)" : "transparent",
                        borderRadius: 2,
                      }}
                    >
                      {m.split("/").pop()}
                    </button>
                  ))}
                </>
              )}

              {selectedBackend === "ollama" && (
                <>
                  {detection.backends.ollama.inferenceModels.length > 0 ? (
                    detection.backends.ollama.inferenceModels.map((m) => (
                      <button
                        key={m}
                        onClick={() => setSelectedInfModel(m)}
                        className="block w-full text-left px-2 py-1 font-mono transition"
                        style={{
                          ...S.p,
                          color: selectedInfModel === m ? S.accent : "var(--text)",
                          background: selectedInfModel === m ? "var(--surface)" : "transparent",
                          borderRadius: 2,
                        }}
                      >
                        {m}
                      </button>
                    ))
                  ) : (
                    <p className="font-mono" style={{ ...S.small, color: S.faint }}>
                      no models installed — run: ollama pull qwen2.5:0.5b
                    </p>
                  )}
                </>
              )}

              {selectedBackend === "cloud" && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={cloudBaseUrl}
                    onChange={(e) => setCloudBaseUrl(e.target.value)}
                    placeholder="API base URL (e.g., https://api.venice.ai/api/v1)"
                    className="w-full bg-transparent outline-none font-mono px-2 py-1"
                    style={{ ...S.p, border: "1px solid var(--border)", borderRadius: 2 }}
                  />
                  <input
                    type="password"
                    value={cloudApiKey}
                    onChange={(e) => setCloudApiKey(e.target.value)}
                    placeholder="API key"
                    className="w-full bg-transparent outline-none font-mono px-2 py-1"
                    style={{ ...S.p, border: "1px solid var(--border)", borderRadius: 2 }}
                  />
                  <input
                    type="text"
                    value={selectedInfModel}
                    onChange={(e) => setSelectedInfModel(e.target.value)}
                    placeholder="Model name (e.g., llama-3.3-70b)"
                    className="w-full bg-transparent outline-none font-mono px-2 py-1"
                    style={{ ...S.p, border: "1px solid var(--border)", borderRadius: 2 }}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("detect")}
                className="flex-1 py-2 font-mono transition active:scale-[0.98]"
                style={{ ...S.p, color: S.muted, border: "1px solid var(--border)", borderRadius: 4 }}
              >
                back
              </button>
              <button
                onClick={() => setStep("embedding")}
                disabled={!selectedInfModel}
                className="flex-1 py-2 font-mono transition active:scale-[0.98] disabled:opacity-30"
                style={{ ...S.p, color: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}
              >
                next
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Choose embedding model ── */}
        {step === "embedding" && detection && (
          <div className="space-y-4">
            <div className="p-4 space-y-2" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
              <p className="font-mono" style={S.h2}>embedding model</p>
              <p className="font-mono" style={{ ...S.small, color: S.faint }}>
                auto-selected for {selectedBackend}
              </p>

              {selectedBackend === "mlx" && (
                ["sentence-transformers/all-MiniLM-L6-v2"].map((m) => (
                  <button
                    key={m}
                    onClick={() => { setSelectedEmbModel(m); setSelectedEmbDims(384); }}
                    className="block w-full text-left px-2 py-1 font-mono transition"
                    style={{
                      ...S.p,
                      color: selectedEmbModel === m ? S.accent : "var(--text)",
                      background: selectedEmbModel === m ? "var(--surface)" : "transparent",
                      borderRadius: 2,
                    }}
                  >
                    {m.split("/").pop()} · 384d
                  </button>
                ))
              )}

              {selectedBackend === "ollama" && (
                (detection.backends.ollama.embeddingModels.length > 0
                  ? detection.backends.ollama.embeddingModels
                  : ["nomic-embed-text", "mxbai-embed-large"]
                ).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setSelectedEmbModel(m);
                      setSelectedEmbDims(m.includes("mxbai") ? 1024 : 768);
                    }}
                    className="block w-full text-left px-2 py-1 font-mono transition"
                    style={{
                      ...S.p,
                      color: selectedEmbModel === m ? S.accent : "var(--text)",
                      background: selectedEmbModel === m ? "var(--surface)" : "transparent",
                      borderRadius: 2,
                    }}
                  >
                    {m} · {m.includes("mxbai") ? "1024" : "768"}d
                  </button>
                ))
              )}

              {selectedBackend === "cloud" && (
                <p className="font-mono px-2 py-1" style={{ ...S.p, color: S.muted }}>
                  voyage-3-lite · 1024d
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("inference")}
                className="flex-1 py-2 font-mono transition active:scale-[0.98]"
                style={{ ...S.p, color: S.muted, border: "1px solid var(--border)", borderRadius: 4 }}
              >
                back
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="flex-1 py-2 font-mono transition active:scale-[0.98]"
                style={{ ...S.p, color: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}
              >
                next
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm & Save ── */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="p-4 space-y-3" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
              <p className="font-mono" style={S.h2}>configuration</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-mono" style={{ ...S.small, color: S.faint }}>platform</span>
                  <span className="font-mono" style={S.small}>{osLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono" style={{ ...S.small, color: S.faint }}>backend</span>
                  <span className="font-mono" style={S.small}>{selectedBackend}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono" style={{ ...S.small, color: S.faint }}>inference</span>
                  <span className="font-mono" style={S.small}>{selectedInfModel.split("/").pop()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono" style={{ ...S.small, color: S.faint }}>embedding</span>
                  <span className="font-mono" style={S.small}>{selectedEmbModel.split("/").pop()} · {selectedEmbDims}d</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("embedding")}
                className="flex-1 py-2 font-mono transition active:scale-[0.98]"
                style={{ ...S.p, color: S.muted, border: "1px solid var(--border)", borderRadius: 4 }}
              >
                back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 font-mono transition active:scale-[0.98] disabled:opacity-50"
                style={{ ...S.p, color: "#fff", background: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}
              >
                {saving ? "saving..." : "start prelude"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
