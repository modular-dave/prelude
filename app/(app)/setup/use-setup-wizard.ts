"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LOCAL_PROVIDERS,
  HOSTED_PROVIDERS,
  EMB_LOCAL,
  EMB_HOSTED,
} from "@/app/(app)/models/_types";
import { resolveBaseUrl } from "@/lib/provider-registry";
import { useConnectionTest } from "@/lib/hooks/use-connection-test";
import { useServerControl } from "@/lib/hooks/use-server-control";
import { useModelInstall } from "@/lib/hooks/use-model-install";
import type { CogFunc } from "@/lib/active-model-store";
import type {
  Step,
  DetectResult,
  FuncAssignment,
  SetupWizardState,
  EmbModel,
} from "./_types";

// ── Hook ─────────────────────────────────────────────────────────

export function useSetupWizard(): SetupWizardState {
  const router = useRouter();

  // Navigation
  const [step, setStep] = useState<Step>("inference");

  // Detection (silent, on mount)
  const [detecting, setDetecting] = useState(true);
  const [detection, setDetection] = useState<DetectResult | null>(null);

  // Inference
  const [infBackend, _setInfBackend] = useState<string>("mlx");
  const [sameForAll, setSameForAll] = useState(true);
  const [assignments, setAssignments] = useState<Record<CogFunc, FuncAssignment>>({
    chat: { model: "", provider: "" },
    dream: { model: "", provider: "" },
    reflect: { model: "", provider: "" },
  });
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudBaseUrl, setCloudBaseUrl] = useState("");
  const [cloudProvider, setCloudProvider] = useState("venice");

  // Embedding
  const [embBackend, _setEmbBackend] = useState<string>("mlx");
  const [embModel, setEmbModel] = useState<string>("");
  const [embDims, setEmbDims] = useState<number>(384);
  const [embApiKey, setEmbApiKey] = useState("");
  const [embBaseUrl, setEmbBaseUrl] = useState("");

  // Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Migration
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{ phase: string; done?: number; total?: number; percent?: number } | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // ── Shared hooks ──

  const connTest = useConnectionTest();

  const runDetection = useCallback(async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect" }),
      });
      const data: DetectResult = await res.json();
      setDetection(data);

      const rec = data.recommended;
      _setInfBackend(rec);
      _setEmbBackend(rec === "cloud" ? "cloud" : rec);

      // Default inference model
      const provider = rec === "mlx" ? LOCAL_PROVIDERS.find(p => p.id === "mlx")!
        : rec === "ollama" ? LOCAL_PROVIDERS.find(p => p.id === "ollama")!
        : HOSTED_PROVIDERS[0];
      const defaultModel = data.backends.mlx.inferenceModel
        || (rec === "ollama" && data.backends.ollama.inferenceModels[0])
        || provider?.models[0]?.id || "";
      const a = { model: defaultModel as string, provider: rec };
      setAssignments({ chat: a, dream: { ...a }, reflect: { ...a } });

      // Default embedding
      if (rec === "mlx") {
        const em = EMB_LOCAL.find(p => p.id === "mlx");
        setEmbModel(em?.models[0]?.id || "sentence-transformers/all-MiniLM-L6-v2");
        setEmbDims(em?.models[0]?.dims || 384);
        setEmbBaseUrl(em?.baseUrl || resolveBaseUrl("mlx", "embedding"));
      } else if (rec === "ollama") {
        const em = EMB_LOCAL.find(p => p.id === "ollama");
        setEmbModel(em?.models[0]?.id || "nomic-embed-text");
        setEmbDims(em?.models[0]?.dims || 768);
        setEmbBaseUrl(em?.baseUrl || resolveBaseUrl("ollama", "embedding"));
      }
    } catch (e) {
      console.warn("[setup] Detection failed:", e);
    } finally {
      setDetecting(false);
    }
  }, []);

  const servers = useServerControl(runDetection);
  const installs = useModelInstall(runDetection);

  useEffect(() => { runDetection(); }, [runDetection]);

  // ── Helpers ──

  const setAllAssignments = (model: string, provider: string) => {
    const a = { model, provider };
    setAssignments({ chat: a, dream: { ...a }, reflect: { ...a } });
  };

  const setInfBackend = (b: string) => {
    _setInfBackend(b);
    connTest.clearResults();
    if (b !== "cloud") {
      const m = (b === "mlx"
        ? LOCAL_PROVIDERS.find(p => p.id === "mlx")
        : LOCAL_PROVIDERS.find(p => p.id === "ollama"))?.models[0]?.id || "";
      setAllAssignments(m, b);
    }
  };

  const setEmbBackend = (b: string) => {
    _setEmbBackend(b);
    connTest.clearResults();
    const prov = [...EMB_LOCAL, ...EMB_HOSTED].find(p => p.id === b);
    if (prov?.models[0]) {
      setEmbModel(prov.models[0].id);
      setEmbDims(prov.models[0].dims);
      setEmbBaseUrl(prov.baseUrl);
    }
  };

  const setFuncAssignment = (fn: string, model: string) => {
    setAssignments(prev => ({
      ...prev,
      [fn]: { model, provider: infBackend === "cloud" ? cloudProvider : infBackend },
    }));
  };

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

  const getEmbModels = (): EmbModel[] =>
    [...EMB_LOCAL, ...EMB_HOSTED].find(p => p.id === embBackend)?.models || [];

  const resolveInfBaseUrl = () => {
    if (infBackend === "mlx") return resolveBaseUrl("mlx", "inference");
    if (infBackend === "ollama") return resolveBaseUrl("ollama", "inference");
    if (infBackend === "cloud") {
      const p = HOSTED_PROVIDERS.find(h => h.id === cloudProvider);
      return cloudBaseUrl || p?.envVars.find(v => v.key === "VENICE_BASE_URL")?.placeholder || "https://api.venice.ai/api/v1";
    }
    return "";
  };

  const osLabel = detection?.platform?.isAppleSilicon ? "Apple Silicon"
    : detection?.platform?.os === "darwin" ? "macOS Intel"
    : detection?.platform?.os === "linux" ? "Linux"
    : detection?.platform?.os === "win32" ? "Windows"
    : detection?.platform?.os || "...";

  // ── Server management (delegated to shared hooks) ──

  const handleStartServer = async (provider: "mlx" | "ollama") => {
    await servers.start(provider);
  };

  const handleInstallModel = async (model: string, provider: string) => {
    await installs.install(model, provider);
  };

  // ── Test handlers (delegated to shared hook) ──

  const handleTestInference = async () => {
    const baseUrl = resolveInfBaseUrl();
    const model = assignments.chat.model;
    const apiKey = infBackend === "cloud" ? cloudApiKey : "local";
    await connTest.testInference(baseUrl, model, apiKey);
  };

  const handleTestEmbedding = async () => {
    const baseUrl = embBaseUrl || [...EMB_LOCAL, ...EMB_HOSTED].find(p => p.id === embBackend)?.baseUrl || "";
    await connTest.testEmbedding(baseUrl, embModel, embApiKey || "local", embBackend);
  };

  // ── Save with post-save verification ──

  const handleSave = async () => {
    setSaveError(null);
    if (!assignments.chat.model) { setSaveError("Select an inference model"); return; }
    if (!embModel) { setSaveError("Select an embedding model"); return; }
    if (infBackend === "cloud" && !cloudApiKey) { setSaveError("API key required for cloud inference"); return; }

    setSaving(true);
    const baseUrl = resolveInfBaseUrl();
    const apiKey = infBackend === "cloud" ? cloudApiKey : "local";
    const prov = infBackend === "cloud" ? cloudProvider : infBackend;
    const embUrl = embBaseUrl || [...EMB_LOCAL, ...EMB_HOSTED].find(p => p.id === embBackend)?.baseUrl || "";
    const embKey = embApiKey || "local";

    const config: Record<string, string> = {
      VENICE_BASE_URL: baseUrl,
      VENICE_API_KEY: apiKey,
      VENICE_MODEL: assignments.chat.model,
      INFERENCE_CHAT_MODEL: assignments.chat.model,
      INFERENCE_CHAT_PROVIDER: prov,
      INFERENCE_DREAM_MODEL: assignments.dream.model,
      INFERENCE_DREAM_PROVIDER: prov,
      INFERENCE_REFLECT_MODEL: assignments.reflect.model,
      INFERENCE_REFLECT_PROVIDER: prov,
      EMBEDDING_PROVIDER: embBackend,
      EMBEDDING_BASE_URL: embUrl,
      EMBEDDING_API_KEY: embKey,
      EMBEDDING_MODEL: embModel,
      EMBEDDING_DIMENSIONS: String(embDims),
    };

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", config }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Failed to save");
        return;
      }

      // ── Post-save verification ──
      const infResult = await connTest.testInference(baseUrl, assignments.chat.model, apiKey);
      if (!infResult.ok) {
        setSaveError(`Config saved but inference verification failed: ${infResult.error || "unreachable"}`);
      }

      const embResult = await connTest.testEmbedding(embUrl, embModel, embKey, embBackend);
      if (!embResult.ok && !saveError) {
        setSaveError(`Config saved but embedding verification failed: ${embResult.error || "unreachable"}`);
      }

      // ── Embedding dimension migration ──
      setSaving(false);
      setMigrating(true);
      setMigrationError(null);
      setMigrationProgress(null);

      try {
        const checkRes = await fetch("/api/cortex/embedding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "migrate-check", dimensions: embDims }),
        });
        const check = await checkRes.json();

        if (check.dimensionMismatch) {
          const migrateRes = await fetch("/api/cortex/embedding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "migrate-execute",
              dimensions: embDims,
              embeddingBaseUrl: embUrl,
              embeddingModel: embModel,
              embeddingApiKey: embKey,
            }),
          });

          if (migrateRes.body) {
            const reader = migrateRes.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() || "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const ev = JSON.parse(line.slice(6));
                  if (ev.phase === "error") {
                    setMigrationError(ev.error || "Migration failed");
                    setMigrating(false);
                    return;
                  }
                  setMigrationProgress(ev);
                } catch { /* skip malformed */ }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[setup] Migration failed:", e);
      }

      setMigrating(false);
      router.push("/");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
      setMigrating(false);
    }
  };

  return {
    step,
    goTo: setStep,
    detecting,
    detection,
    osLabel,
    infBackend,
    setInfBackend,
    sameForAll,
    toggleSameForAll: () => setSameForAll(v => !v),
    assignments,
    setAllAssignments,
    setFuncAssignment,
    cloudApiKey,
    setCloudApiKey,
    cloudBaseUrl,
    setCloudBaseUrl,
    cloudProvider,
    setCloudProvider,
    getInfModels,
    startingServer: {
      loading: servers.starting === infBackend,
      error: servers.error,
    },
    handleStartServer,
    installingModel: {
      loading: !!installs.installing,
      progress: installs.progress,
    },
    handleInstallModel,
    embBackend,
    setEmbBackend,
    embModel,
    setEmbModel,
    embDims,
    setEmbDims,
    embApiKey,
    setEmbApiKey,
    embBaseUrl,
    setEmbBaseUrl,
    getEmbModels,
    testingInf: connTest.testingInference,
    testInfResult: connTest.inferenceResult,
    handleTestInference,
    testingEmb: connTest.testingEmbedding,
    testEmbResult: connTest.embeddingResult,
    handleTestEmbedding,
    saving,
    saveError,
    handleSave,
    migrating,
    migrationProgress,
    migrationError,
    handleRescan: runDetection,
  };
}
