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

const dot = (ok: boolean) => (
  <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: ok ? "var(--success)" : "var(--text-faint)" }} />
);

const line = () => (
  <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />
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

        const provider = rec === "mlx" ? LOCAL_PROVIDERS.find(p => p.id === "mlx")!
          : rec === "ollama" ? LOCAL_PROVIDERS.find(p => p.id === "ollama")!
          : HOSTED_PROVIDERS[0];
        const defaultModel = data.backends.mlx.inferenceModel
          || (rec === "ollama" && data.backends.ollama.inferenceModels[0])
          || provider?.models[0]?.id || "";
        const a = { model: defaultModel, provider: rec };
        setAssignments({ chat: a, dream: { ...a }, reflect: { ...a } });

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
  const getInfModels = () => {
    if (infBackend === "cloud") return HOSTED_PROVIDERS.find(p => p.id === cloudProvider)?.models || [];
    const provider = LOCAL_PROVIDERS.find(p => p.id === infBackend);
    if (!provider) return [];
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

  const getEmbModels = (): EmbModel[] => getEmbProvider()?.models || [];

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

  const osLabel = detection?.platform?.isAppleSilicon ? "Apple Silicon"
    : detection?.platform?.os === "darwin" ? "macOS Intel"
    : detection?.platform?.os === "linux" ? "Linux"
    : detection?.platform?.os === "win32" ? "Windows"
    : detection?.platform?.os || "...";

  // ── Render ──
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto">
      <div className="w-full max-w-md px-6 py-12 font-mono">
        {/* Header */}
        <div className="mb-10 text-center">
          <BrainScanline size={48} />
          <p className="t-title mt-4" style={{ color: "var(--text)" }}>prelude</p>
          <p className="t-tiny mt-1" style={{ color: "var(--text-faint)" }}>
            {step === "detect" && "detecting environment"}
            {step === "inference" && "configure inference"}
            {step === "embedding" && "configure embedding"}
            {step === "confirm" && "review"}
          </p>
        </div>

        {/* ── STEP 1: DETECT ── */}
        {step === "detect" && (
          <div className="space-y-6">
            {detecting ? (
              <p className="t-body text-center" style={{ color: "var(--text-muted)" }}>scanning...</p>
            ) : detection ? (
              <>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="t-tiny" style={{ color: "var(--text-faint)" }}>platform︱</span>
                    <span className="t-body" style={{ color: "var(--text)" }}>{osLabel} · {detection.platform.arch}</span>
                  </div>
                  <p className="t-micro mt-0.5" style={{ color: "var(--text-faint)" }}>{detection.platform.cpuModel}</p>
                </div>

                {line()}

                <div className="space-y-2">
                  <span className="t-tiny" style={{ color: "var(--text-faint)" }}>backends</span>
                  <div className="space-y-1.5 mt-1">
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.mlx.available)}
                      <span className="t-body" style={{ color: detection.backends.mlx.available ? "var(--text)" : "var(--text-faint)" }}>mlx</span>
                      <span className="t-micro" style={{ color: "var(--text-faint)" }}>
                        {detection.backends.mlx.inference ? "inference" : ""}{detection.backends.mlx.embedding ? " + embedding" : ""}
                        {!detection.backends.mlx.available && detection.platform.isAppleSilicon ? "not running" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.ollama.available)}
                      <span className="t-body" style={{ color: detection.backends.ollama.available ? "var(--text)" : "var(--text-faint)" }}>ollama</span>
                      <span className="t-micro" style={{ color: "var(--text-faint)" }}>
                        {detection.backends.ollama.available ? `${detection.backends.ollama.inferenceModels.length + detection.backends.ollama.embeddingModels.length} models` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dot(detection.backends.cloud.configured)}
                      <span className="t-body" style={{ color: detection.backends.cloud.configured ? "var(--text)" : "var(--text-faint)" }}>cloud</span>
                      <span className="t-micro" style={{ color: "var(--text-faint)" }}>{detection.backends.cloud.configured ? "api key set" : "needs api key"}</span>
                    </div>
                  </div>
                </div>

                {line()}

                <div className="flex items-center justify-between">
                  <span className="t-tiny" style={{ color: "var(--text-faint)" }}>recommended︱<span style={{ color: "var(--accent)" }}>{detection.recommended}</span></span>
                  <button onClick={() => setStep("inference")} className="text-btn t-body transition active:scale-95" style={{ color: "var(--accent)" }}>
                    continue →
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => setStep("inference")} className="text-btn t-body" style={{ color: "var(--accent)" }}>
                configure manually →
              </button>
            )}
          </div>
        )}

        {/* ── STEP 2: INFERENCE ── */}
        {step === "inference" && (
          <div className="space-y-5">
            {/* Backend selector — like brain's viz mode buttons */}
            <div className="flex items-center gap-1.5">
              <span className="t-tiny" style={{ color: "var(--text-faint)" }}>backend︱</span>
              {["mlx", "ollama", "cloud"].map((b) => {
                const avail = b === "mlx" ? (detection?.backends.mlx.available || detection?.platform.isAppleSilicon)
                  : b === "ollama" ? detection?.backends.ollama.available : true;
                return (
                  <button key={b} onClick={() => { setInfBackend(b); if (b !== "cloud") { const m = (b === "mlx" ? LOCAL_PROVIDERS.find(p=>p.id==="mlx") : LOCAL_PROVIDERS.find(p=>p.id==="ollama"))?.models[0]?.id || ""; setAllAssignments(m, b); }}}
                    disabled={!avail} className="transition active:scale-95 disabled:opacity-20"
                    style={{ color: infBackend === b ? "var(--accent)" : "var(--text-faint)", fontSize: 11 }}>
                    {b}
                  </button>
                );
              })}
            </div>

            {/* Cloud provider sub-selector */}
            {infBackend === "cloud" && (
              <div className="flex items-center gap-1.5 ml-[60px]">
                {HOSTED_PROVIDERS.map((hp) => (
                  <button key={hp.id} onClick={() => { setCloudProvider(hp.id); setAllAssignments(hp.models[0]?.id || "", hp.id); }}
                    className="transition active:scale-95"
                    style={{ color: cloudProvider === hp.id ? "var(--accent)" : "var(--text-faint)", fontSize: 9 }}>
                    {hp.name}
                  </button>
                ))}
              </div>
            )}

            {/* Cloud API inputs — underline style */}
            {infBackend === "cloud" && (
              <div className="space-y-2">
                <input type="password" value={cloudApiKey} onChange={e => setCloudApiKey(e.target.value)} placeholder="API key"
                  className="w-full bg-transparent outline-none font-mono t-body px-0 py-1" style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }} />
                <input type="text" value={cloudBaseUrl} onChange={e => setCloudBaseUrl(e.target.value)} placeholder={HOSTED_PROVIDERS.find(h=>h.id===cloudProvider)?.envVars[0]?.placeholder || ""}
                  className="w-full bg-transparent outline-none font-mono t-body px-0 py-1" style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
            )}

            {line()}

            {/* Model selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="t-tiny" style={{ color: "var(--text-faint)" }}>models</span>
                <button onClick={() => setSameForAll(!sameForAll)} className="text-btn t-micro transition" style={{ color: "var(--accent)" }}>
                  {sameForAll ? "per-function" : "same for all"}
                </button>
              </div>

              {sameForAll ? (
                <div className="space-y-0.5">
                  {getInfModels().map((m) => (
                    <button key={m.id} onClick={() => setAllAssignments(m.id, infBackend === "cloud" ? cloudProvider : infBackend)}
                      className="block w-full text-left py-0.5 transition active:scale-[0.99]"
                      style={{ color: assignments.chat.model === m.id ? "var(--accent)" : "var(--text)", fontSize: 11 }}>
                      {m.name} <span className="t-micro" style={{ color: "var(--text-faint)" }}>{m.description}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {COG_FUNCS.map(({ key, label, color }) => (
                    <div key={key}>
                      <span className="t-micro" style={{ color }}>{label.toLowerCase()}</span>
                      <div className="space-y-0 mt-0.5">
                        {getInfModels().map((m) => (
                          <button key={m.id} onClick={() => setFuncAssignment(key, m.id)}
                            className="block w-full text-left py-0 transition"
                            style={{ color: assignments[key].model === m.id ? color : "var(--text-faint)", fontSize: 9 }}>
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {line()}

            <div className="flex items-center justify-between">
              <button onClick={() => setStep("detect")} className="text-btn t-tiny transition active:scale-95" style={{ color: "var(--text-faint)" }}>
                ← back
              </button>
              <button onClick={() => setStep("embedding")} disabled={!assignments.chat.model} className="text-btn t-body transition active:scale-95 disabled:opacity-30" style={{ color: "var(--accent)" }}>
                next →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: EMBEDDING ── */}
        {step === "embedding" && (
          <div className="space-y-5">
            <div className="flex items-center gap-1.5">
              <span className="t-tiny" style={{ color: "var(--text-faint)" }}>provider︱</span>
              {["mlx", "ollama", "openai", "voyage"].map((b) => {
                const avail = b === "mlx" ? (detection?.backends.mlx.available || detection?.platform.isAppleSilicon)
                  : b === "ollama" ? detection?.backends.ollama.available : true;
                return (
                  <button key={b} onClick={() => {
                    setEmbBackend(b);
                    const prov = [...EMB_LOCAL, ...EMB_HOSTED].find(p => p.id === b);
                    if (prov?.models[0]) { setEmbModel(prov.models[0].id); setEmbDims(prov.models[0].dims); setEmbBaseUrl(prov.baseUrl); }
                  }}
                    disabled={!avail} className="transition active:scale-95 disabled:opacity-20"
                    style={{ color: embBackend === b ? "var(--accent)" : "var(--text-faint)", fontSize: 11 }}>
                    {b}
                  </button>
                );
              })}
            </div>

            {/* Cloud API key — underline style */}
            {(embBackend === "openai" || embBackend === "voyage") && (
              <input type="password" value={embApiKey} onChange={e => setEmbApiKey(e.target.value)} placeholder={`${embBackend} api key`}
                className="w-full bg-transparent outline-none font-mono t-body px-0 py-1" style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }} />
            )}

            {line()}

            <div>
              <span className="t-tiny" style={{ color: "var(--text-faint)" }}>model</span>
              <div className="space-y-0.5 mt-1">
                {getEmbModels().map((m) => (
                  <button key={m.id} onClick={() => { setEmbModel(m.id); setEmbDims(m.dims); }}
                    className="block w-full text-left py-0.5 transition active:scale-[0.99]"
                    style={{ color: embModel === m.id ? "var(--accent)" : "var(--text)", fontSize: 11 }}>
                    {m.name} <span className="t-micro" style={{ color: "var(--text-faint)" }}>{m.dims}d · {m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="t-micro" style={{ color: "var(--text-faint)" }}>
              dimensions ({embDims}d) locked after first use — changing requires re-embedding
            </p>

            {line()}

            <div className="flex items-center justify-between">
              <button onClick={() => setStep("inference")} className="text-btn t-tiny transition active:scale-95" style={{ color: "var(--text-faint)" }}>
                ← back
              </button>
              <button onClick={() => setStep("confirm")} className="text-btn t-body transition active:scale-95" style={{ color: "var(--accent)" }}>
                next →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: CONFIRM ── */}
        {step === "confirm" && (
          <div className="space-y-5">
            <div className="space-y-1">
              <KV label="platform" value={`${osLabel} · ${detection?.platform.arch || ""}`} />
              {line()}
              {COG_FUNCS.map(({ key, label, color }) => (
                <KV key={key} label={label.toLowerCase()} value={assignments[key].model.split("/").pop() || ""} valueColor={color} />
              ))}
              <KV label="provider" value={infBackend === "cloud" ? cloudProvider : infBackend} />
              {line()}
              <KV label="embedding" value={`${embModel.split("/").pop()} · ${embDims}d`} />
              <KV label="emb provider" value={embBackend} />
            </div>

            {line()}

            <div className="flex items-center justify-between">
              <button onClick={() => setStep("embedding")} className="text-btn t-tiny transition active:scale-95" style={{ color: "var(--text-faint)" }}>
                ← back
              </button>
              <button onClick={handleSave} disabled={saving} className="text-btn t-body transition active:scale-95 disabled:opacity-50" style={{ color: "var(--accent)" }}>
                {saving ? "saving..." : "start prelude →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{label}</span>
      <span className="t-tiny" style={{ color: valueColor || "var(--text)" }}>{value}</span>
    </div>
  );
}
