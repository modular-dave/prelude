"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrainScanline } from "@/components/brain/brain-scanline";
import {
  LOCAL_PROVIDERS,
  HOSTED_PROVIDERS,
  COG_FUNCS,
  EMB_LOCAL,
  EMB_HOSTED,
  type ProviderDef,
  type EmbProvider,
  type EmbModel,
} from "@/app/(app)/models/_types";
import type { CogFunc } from "@/lib/active-model-store";

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
    mlx: { available: boolean; inference: boolean; inferenceModel: string | null; embedding: boolean; embeddingModel: string | null; embeddingDims: number | null };
    ollama: { available: boolean; inferenceModels: string[]; embeddingModels: string[] };
    cloud: { available: boolean; configured: boolean };
  };
  recommended: string;
}

type Step = "detect" | "inference" | "embedding" | "confirm";

interface FuncAssignment {
  model: string;
  provider: string;
}

const S = {
  h1: { fontSize: 16, fontWeight: 500 } as const,
  h2: { fontSize: 13, fontWeight: 500 } as const,
  p: { fontSize: 11, fontWeight: 400, lineHeight: 1.6 } as const,
  small: { fontSize: 9, fontWeight: 400 } as const,
  accent: "var(--accent)",
  muted: "var(--text-muted)",
  faint: "var(--text-faint)",
};

const dot = (ok: boolean) => (
  <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: ok ? "#22c55e" : "var(--text-faint)" }} />
);

// ── Component ────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("detect");
  const [detecting, setDetecting] = useState(true);
  const [detection, setDetection] = useState<DetectResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Inference state
  const [infBackend, setInfBackend] = useState<string>("mlx");
  const [sameForAll, setSameForAll] = useState(true);
  const [assignments, setAssignments] = useState<Record<CogFunc, FuncAssignment>>({
    chat: { model: "", provider: "" },
    dream: { model: "", provider: "" },
    reflect: { model: "", provider: "" },
  });
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudBaseUrl, setCloudBaseUrl] = useState("");
  const [cloudProvider, setCloudProvider] = useState("venice");

  // Embedding state
  const [embBackend, setEmbBackend] = useState<string>("mlx");
  const [embModel, setEmbModel] = useState<string>("");
  const [embDims, setEmbDims] = useState<number>(384);
  const [embApiKey, setEmbApiKey] = useState("");
  const [embBaseUrl, setEmbBaseUrl] = useState("");

  // ── Step 1: Detect ──
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

        const rec = data.recommended;
        setInfBackend(rec);
        setEmbBackend(rec === "cloud" ? "cloud" : rec);

        // Pre-select models
        const provider = rec === "mlx" ? LOCAL_PROVIDERS.find(p => p.id === "mlx")!
          : rec === "ollama" ? LOCAL_PROVIDERS.find(p => p.id === "ollama")!
          : HOSTED_PROVIDERS[0];
        const defaultModel = data.backends.mlx.inferenceModel
          || (rec === "ollama" && data.backends.ollama.inferenceModels[0])
          || provider?.models[0]?.id || "";
        const a = { model: defaultModel, provider: rec };
        setAssignments({ chat: a, dream: { ...a }, reflect: { ...a } });

        // Pre-select embedding
        if (rec === "mlx") {
          const em = EMB_LOCAL.find(p => p.id === "mlx");
          setEmbModel(em?.models[0]?.id || "sentence-transformers/all-MiniLM-L6-v2");
          setEmbDims(em?.models[0]?.dims || 384);
          setEmbBaseUrl(em?.baseUrl || "http://127.0.0.1:11435/v1");
        } else if (rec === "ollama") {
          const em = EMB_LOCAL.find(p => p.id === "ollama");
          setEmbModel(em?.models[0]?.id || "nomic-embed-text");
          setEmbDims(em?.models[0]?.dims || 768);
          setEmbBaseUrl(em?.baseUrl || "http://127.0.0.1:11434/v1");
        }
      } catch {} finally { setDetecting(false); }
    })();
  }, []);

  // ── Helpers ──
  const getInfProvider = (): ProviderDef | undefined =>
    [...LOCAL_PROVIDERS, ...HOSTED_PROVIDERS].find(p => p.id === infBackend || p.id === cloudProvider);

  const getInfModels = () => {
    if (infBackend === "cloud") return HOSTED_PROVIDERS.find(p => p.id === cloudProvider)?.models || [];
    const provider = LOCAL_PROVIDERS.find(p => p.id === infBackend);
    if (!provider) return [];
    // Merge provider presets with actually installed models from detection
    if (infBackend === "ollama" && detection?.backends.ollama.inferenceModels.length) {
      const installed = detection.backends.ollama.inferenceModels;
      const presetIds = new Set(provider.models.map(m => m.id));
      const extra = installed.filter(m => !presetIds.has(m)).map(m => ({ id: m, name: m, description: "installed" }));
      return [...provider.models.filter(m => installed.includes(m.id)), ...extra];
    }
    return provider.models;
  };

  const getEmbProvider = (): EmbProvider | undefined =>
    [...EMB_LOCAL, ...EMB_HOSTED].find(p => p.id === embBackend);

  const getEmbModels = (): EmbModel[] => {
    const prov = getEmbProvider();
    return prov?.models || [];
  };

  const setAllAssignments = (model: string, provider: string) => {
    const a = { model, provider };
    setAssignments({ chat: a, dream: { ...a }, reflect: { ...a } });
  };

  const setFuncAssignment = (fn: CogFunc, model: string) => {
    setAssignments(prev => ({ ...prev, [fn]: { model, provider: infBackend === "cloud" ? cloudProvider : infBackend } }));
  };

  const resolveInfBaseUrl = () => {
    if (infBackend === "mlx") return "http://127.0.0.1:8899/v1";
    if (infBackend === "ollama") return "http://127.0.0.1:11434/v1";
    if (infBackend === "cloud") {
      const p = HOSTED_PROVIDERS.find(h => h.id === cloudProvider);
      return cloudBaseUrl || p?.envVars.find(v => v.key === "VENICE_BASE_URL")?.placeholder || "https://api.venice.ai/api/v1";
    }
    return "";
  };

  // ── Save ──
  const handleSave = async () => {
    setSaving(true);
    const LOCAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
    const baseUrl = resolveInfBaseUrl();
    const apiKey = infBackend === "cloud" ? cloudApiKey : "local";
    const prov = infBackend === "cloud" ? cloudProvider : infBackend;

    const config: Record<string, string> = {
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_KEY: LOCAL_KEY,
      VENICE_BASE_URL: baseUrl,
      VENICE_API_KEY: apiKey,
      VENICE_MODEL: assignments.chat.model,
      INFERENCE_CHAT_MODEL: assignments.chat.model,
      INFERENCE_CHAT_PROVIDER: prov,
      INFERENCE_DREAM_MODEL: assignments.dream.model,
      INFERENCE_DREAM_PROVIDER: prov,
      INFERENCE_REFLECT_MODEL: assignments.reflect.model,
      INFERENCE_REFLECT_PROVIDER: prov,
      EMBEDDING_PROVIDER: embBackend === "cloud" ? embBackend : "openai",
      EMBEDDING_BASE_URL: embBaseUrl || getEmbProvider()?.baseUrl || "",
      EMBEDDING_API_KEY: embApiKey || "local",
      EMBEDDING_MODEL: embModel,
      EMBEDDING_DIMENSIONS: String(embDims),
    };

    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", config }),
      });
      router.push("/");
    } finally { setSaving(false); }
  };

  // ── Platform label ──
  const osLabel = detection?.platform?.isAppleSilicon ? "Apple Silicon"
    : detection?.platform?.os === "darwin" ? "macOS Intel"
    : detection?.platform?.os === "linux" ? "Linux"
    : detection?.platform?.os === "win32" ? "Windows"
    : detection?.platform?.os || "...";

  // ── Render ──
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto">
      <div className="w-full max-w-md px-6 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <BrainScanline size={60} />
          <h1 className="font-mono mt-4" style={S.h1}>prelude setup</h1>
          <p className="font-mono mt-1" style={{ ...S.small, color: S.faint }}>
            {step === "detect" && "detecting environment..."}
            {step === "inference" && "configure inference"}
            {step === "embedding" && "configure embedding"}
            {step === "confirm" && "review configuration"}
          </p>
        </div>

        {/* ── STEP 1: DETECT ── */}
        {step === "detect" && (
          <div className="space-y-4">
            {detecting ? (
              <p className="font-mono text-center" style={{ ...S.p, color: S.muted }}>scanning hardware...</p>
            ) : detection ? (
              <>
                <div className="p-4" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
                  <p className="font-mono" style={S.h2}>platform</p>
                  <p className="font-mono mt-1" style={{ ...S.p, color: S.muted }}>{osLabel} · {detection.platform.arch}</p>
                  <p className="font-mono" style={{ ...S.small, color: S.faint }}>{detection.platform.cpuModel}</p>
                </div>
                <div className="p-4" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
                  <p className="font-mono mb-2" style={S.h2}>backends</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.mlx.available)}
                      <span className="font-mono" style={{ ...S.p, color: detection.backends.mlx.available ? "var(--text)" : S.faint }}>mlx</span>
                      <span className="font-mono" style={{ ...S.small, color: S.faint }}>
                        {detection.backends.mlx.inference ? "inference" : ""}{detection.backends.mlx.embedding ? " + embedding" : ""}
                        {!detection.backends.mlx.available && detection.platform.isAppleSilicon ? "not running" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.ollama.available)}
                      <span className="font-mono" style={{ ...S.p, color: detection.backends.ollama.available ? "var(--text)" : S.faint }}>ollama</span>
                      <span className="font-mono" style={{ ...S.small, color: S.faint }}>
                        {detection.backends.ollama.available ? `${detection.backends.ollama.inferenceModels.length + detection.backends.ollama.embeddingModels.length} models` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.cloud.configured)}
                      <span className="font-mono" style={{ ...S.p, color: detection.backends.cloud.configured ? "var(--text)" : S.faint }}>cloud</span>
                      <span className="font-mono" style={{ ...S.small, color: S.faint }}>{detection.backends.cloud.configured ? "api key set" : "needs api key"}</span>
                    </div>
                  </div>
                </div>
                <p className="font-mono text-center" style={{ ...S.small, color: S.accent }}>recommended: {detection.recommended}</p>
                <button onClick={() => setStep("inference")} className="w-full py-2 font-mono transition active:scale-[0.98]" style={{ ...S.p, color: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}>
                  continue
                </button>
              </>
            ) : (
              <button onClick={() => setStep("inference")} className="w-full py-2 font-mono" style={{ ...S.p, color: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}>
                configure manually
              </button>
            )}
          </div>
        )}

        {/* ── STEP 2: INFERENCE ── */}
        {step === "inference" && (
          <div className="space-y-4">
            {/* Backend tabs */}
            <div className="flex gap-2">
              {["mlx", "ollama", "cloud"].map((b) => {
                const avail = b === "mlx" ? (detection?.backends.mlx.available || detection?.platform.isAppleSilicon)
                  : b === "ollama" ? detection?.backends.ollama.available : true;
                return (
                  <button key={b} onClick={() => { setInfBackend(b); if (b !== "cloud") { const m = (b === "mlx" ? LOCAL_PROVIDERS.find(p=>p.id==="mlx") : LOCAL_PROVIDERS.find(p=>p.id==="ollama"))?.models[0]?.id || ""; setAllAssignments(m, b); }}}
                    disabled={!avail} className="flex-1 py-1.5 font-mono transition active:scale-[0.98] disabled:opacity-30"
                    style={{ ...S.p, color: infBackend === b ? S.accent : S.muted, border: `1px solid ${infBackend === b ? S.accent : "var(--border)"}`, borderRadius: 4, textAlign: "center" }}>
                    {b}
                  </button>
                );
              })}
            </div>

            {/* Cloud provider sub-tabs */}
            {infBackend === "cloud" && (
              <div className="flex gap-1">
                {HOSTED_PROVIDERS.map((hp) => (
                  <button key={hp.id} onClick={() => { setCloudProvider(hp.id); setAllAssignments(hp.models[0]?.id || "", hp.id); }}
                    className="flex-1 py-1 font-mono transition" style={{ ...S.small, color: cloudProvider === hp.id ? S.accent : S.faint, borderBottom: cloudProvider === hp.id ? `1px solid ${S.accent}` : "1px solid transparent" }}>
                    {hp.name}
                  </button>
                ))}
              </div>
            )}

            {/* Cloud API inputs */}
            {infBackend === "cloud" && (
              <div className="space-y-2">
                <input type="password" value={cloudApiKey} onChange={e => setCloudApiKey(e.target.value)} placeholder="API key"
                  className="w-full bg-transparent outline-none font-mono px-2 py-1" style={{ ...S.p, border: "1px solid var(--border)", borderRadius: 2 }} />
                <input type="text" value={cloudBaseUrl} onChange={e => setCloudBaseUrl(e.target.value)} placeholder={HOSTED_PROVIDERS.find(h=>h.id===cloudProvider)?.envVars[0]?.placeholder || ""}
                  className="w-full bg-transparent outline-none font-mono px-2 py-1" style={{ ...S.p, border: "1px solid var(--border)", borderRadius: 2 }} />
              </div>
            )}

            {/* Model selection */}
            <div className="p-4" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono" style={S.h2}>models</p>
                <button onClick={() => setSameForAll(!sameForAll)} className="font-mono transition" style={{ ...S.small, color: S.accent }}>
                  {sameForAll ? "per-function" : "same for all"}
                </button>
              </div>

              {sameForAll ? (
                /* Single model for all 3 functions */
                <div className="space-y-1">
                  {getInfModels().map((m) => (
                    <button key={m.id} onClick={() => setAllAssignments(m.id, infBackend === "cloud" ? cloudProvider : infBackend)}
                      className="block w-full text-left px-2 py-1 font-mono transition" style={{ ...S.p, color: assignments.chat.model === m.id ? S.accent : "var(--text)", background: assignments.chat.model === m.id ? "var(--surface)" : "transparent", borderRadius: 2 }}>
                      {m.name} <span style={{ color: S.faint }}>{m.description}</span>
                    </button>
                  ))}
                </div>
              ) : (
                /* Per-function model selection */
                <div className="space-y-3">
                  {COG_FUNCS.map(({ key, label, color }) => (
                    <div key={key}>
                      <p className="font-mono mb-1" style={{ ...S.small, color }}>{label}</p>
                      <div className="space-y-0.5">
                        {getInfModels().map((m) => (
                          <button key={m.id} onClick={() => setFuncAssignment(key, m.id)}
                            className="block w-full text-left px-2 py-0.5 font-mono transition" style={{ ...S.small, color: assignments[key].model === m.id ? color : "var(--text)", background: assignments[key].model === m.id ? "var(--surface)" : "transparent", borderRadius: 2 }}>
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep("detect")} className="flex-1 py-2 font-mono transition active:scale-[0.98]" style={{ ...S.p, color: S.muted, border: "1px solid var(--border)", borderRadius: 4 }}>back</button>
              <button onClick={() => setStep("embedding")} disabled={!assignments.chat.model} className="flex-1 py-2 font-mono transition active:scale-[0.98] disabled:opacity-30" style={{ ...S.p, color: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}>next</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: EMBEDDING ── */}
        {step === "embedding" && (
          <div className="space-y-4">
            {/* Backend tabs */}
            <div className="flex gap-2">
              {["mlx", "ollama", "openai", "voyage"].map((b) => {
                const isLocal = b === "mlx" || b === "ollama";
                const avail = b === "mlx" ? (detection?.backends.mlx.available || detection?.platform.isAppleSilicon)
                  : b === "ollama" ? detection?.backends.ollama.available : true;
                return (
                  <button key={b} onClick={() => {
                    setEmbBackend(b);
                    const prov = [...EMB_LOCAL, ...EMB_HOSTED].find(p => p.id === b);
                    if (prov?.models[0]) { setEmbModel(prov.models[0].id); setEmbDims(prov.models[0].dims); setEmbBaseUrl(prov.baseUrl); }
                  }}
                    disabled={!avail} className="flex-1 py-1.5 font-mono transition active:scale-[0.98] disabled:opacity-30"
                    style={{ ...S.p, color: embBackend === b ? S.accent : S.muted, border: `1px solid ${embBackend === b ? S.accent : "var(--border)"}`, borderRadius: 4, textAlign: "center" }}>
                    {b}
                  </button>
                );
              })}
            </div>

            {/* Cloud API key */}
            {(embBackend === "openai" || embBackend === "voyage") && (
              <input type="password" value={embApiKey} onChange={e => setEmbApiKey(e.target.value)} placeholder={`${embBackend} API key`}
                className="w-full bg-transparent outline-none font-mono px-2 py-1" style={{ ...S.p, border: "1px solid var(--border)", borderRadius: 2 }} />
            )}

            {/* Model list */}
            <div className="p-4" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
              <p className="font-mono mb-2" style={S.h2}>embedding model</p>
              <div className="space-y-1">
                {getEmbModels().map((m) => (
                  <button key={m.id} onClick={() => { setEmbModel(m.id); setEmbDims(m.dims); }}
                    className="block w-full text-left px-2 py-1 font-mono transition" style={{ ...S.p, color: embModel === m.id ? S.accent : "var(--text)", background: embModel === m.id ? "var(--surface)" : "transparent", borderRadius: 2 }}>
                    {m.name} <span style={{ color: S.faint }}>{m.dims}d · {m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dimension warning */}
            <p className="font-mono px-2" style={{ ...S.small, color: S.faint }}>
              embedding dimensions ({embDims}d) are locked after first use — changing later requires re-embedding all memories
            </p>

            <div className="flex gap-2">
              <button onClick={() => setStep("inference")} className="flex-1 py-2 font-mono transition active:scale-[0.98]" style={{ ...S.p, color: S.muted, border: "1px solid var(--border)", borderRadius: 4 }}>back</button>
              <button onClick={() => setStep("confirm")} className="flex-1 py-2 font-mono transition active:scale-[0.98]" style={{ ...S.p, color: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}>next</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: CONFIRM ── */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="p-4 space-y-3" style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
              <p className="font-mono" style={S.h2}>configuration</p>
              <div className="space-y-1">
                <Row label="platform" value={osLabel} />
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                {COG_FUNCS.map(({ key, label, color }) => (
                  <Row key={key} label={label.toLowerCase()} value={`${assignments[key].model.split("/").pop()}`} valueColor={color} />
                ))}
                <Row label="provider" value={infBackend === "cloud" ? cloudProvider : infBackend} />
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <Row label="embedding" value={`${embModel.split("/").pop()} · ${embDims}d`} />
                <Row label="emb provider" value={embBackend} />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep("embedding")} className="flex-1 py-2 font-mono transition active:scale-[0.98]" style={{ ...S.p, color: S.muted, border: "1px solid var(--border)", borderRadius: 4 }}>back</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 font-mono transition active:scale-[0.98] disabled:opacity-50" style={{ ...S.p, color: "#fff", background: S.accent, border: `1px solid ${S.accent}`, borderRadius: 4 }}>
                {saving ? "saving..." : "start prelude"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between">
      <span className="font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>{label}</span>
      <span className="font-mono" style={{ fontSize: 9, fontWeight: 400, color: valueColor || "var(--text)" }}>{value}</span>
    </div>
  );
}
