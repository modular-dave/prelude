"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Cpu, Check, Trash2, Plus, Loader2, ChevronLeft, ChevronDown, ChevronRight, Monitor, Cloud, ExternalLink, Download, Square, X } from "lucide-react";
import Link from "next/link";
import {
  setActiveModel,
  addKnownModel,
  removeKnownModel,
  setAssignment as setLocalAssignment,
} from "@/lib/model-settings";
import type { CogFunc, Assignment } from "@/lib/active-model-store";
import { FloatNav } from "@/components/shell/float-nav";

// ── Provider Definitions ────────────────────────────────────────

interface ProviderDef {
  id: string;
  name: string;
  description: string;
  url: string;
  envVars: { key: string; label: string; required: boolean; placeholder: string }[];
  models: { id: string; name: string; description: string; size?: string; ram?: string }[];
}

const LOCAL_PROVIDERS: ProviderDef[] = [
  {
    id: "ollama",
    name: "Ollama",
    description: "Run open-source models locally. Works on macOS, Linux, and Windows.",
    url: "https://ollama.com",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "http://127.0.0.1:11434/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: false, placeholder: "local" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "qwen2.5:0.5b" },
    ],
    models: [
      { id: "qwen2.5:0.5b", name: "Qwen 2.5 0.5B", description: "Fast, lightweight", size: "400MB", ram: "1 GB" },
      { id: "llama3.2:1b", name: "Llama 3.2 1B", description: "Best for reasoning", size: "700MB", ram: "1.5 GB" },
      { id: "qwen2.5:1.5b", name: "Qwen 2.5 1.5B", description: "Balanced speed and quality", size: "1GB", ram: "2 GB" },
      { id: "gemma2:2b", name: "Gemma 2 2B", description: "Google, nuanced responses", size: "1.6GB", ram: "2.5 GB" },
      { id: "qwen2.5:3b", name: "Qwen 2.5 3B", description: "Good quality, moderate speed", size: "2GB", ram: "3 GB" },
      { id: "llama3.2:3b", name: "Llama 3.2 3B", description: "Strong reasoning, larger", size: "2GB", ram: "3 GB" },
      { id: "phi3:mini", name: "Phi-3 Mini", description: "Microsoft, 3.8B params", size: "2.3GB", ram: "3.5 GB" },
    ],
  },
  {
    id: "mlx",
    name: "MLX (Apple Silicon)",
    description: "Native Apple Silicon inference via mlx-lm. macOS only, fastest on M-series chips.",
    url: "https://github.com/ml-explore/mlx-lm",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "http://127.0.0.1:8080/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: false, placeholder: "local" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "mlx-community/Qwen2.5-1.5B-Instruct-4bit" },
    ],
    models: [
      { id: "mlx-community/SmolLM2-360M-Instruct", name: "SmolLM2 360M", description: "Tiny, low-resource devices", size: "200MB", ram: "0.5 GB" },
      { id: "mlx-community/Qwen2.5-0.5B-Instruct-4bit", name: "Qwen 2.5 0.5B", description: "Fast, best for quick replies", size: "280MB", ram: "0.5 GB" },
      { id: "mlx-community/Llama-3.2-1B-Instruct-4bit", name: "Llama 3.2 1B", description: "Best for reasoning", size: "680MB", ram: "1 GB" },
      { id: "mlx-community/Qwen2.5-1.5B-Instruct-4bit", name: "Qwen 2.5 1.5B", description: "Balanced, best for chat", size: "840MB", ram: "1.5 GB" },
      { id: "mlx-community/gemma-2-2b-it-4bit", name: "Gemma 2 2B", description: "Largest, nuanced responses", size: "1.4GB", ram: "2 GB" },
    ],
  },
  {
    id: "llamacpp",
    name: "llama.cpp Server",
    description: "High-performance C++ inference. Runs GGUF models on CPU or GPU.",
    url: "https://github.com/ggerganov/llama.cpp",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "http://127.0.0.1:8080/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: false, placeholder: "local" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "model-name" },
    ],
    models: [],
  },
];

const HOSTED_PROVIDERS: ProviderDef[] = [
  {
    id: "venice",
    name: "Venice AI",
    description: "Permissionless, private inference. No data retention. Supports Claude, GPT, open-source models.",
    url: "https://venice.ai",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: false, placeholder: "https://api.venice.ai/api/v1 (default)" },
      { key: "VENICE_API_KEY", label: "API Key", required: true, placeholder: "your-venice-api-key" },
      { key: "VENICE_MODEL", label: "Model", required: false, placeholder: "auto (per cognitive function)" },
    ],
    models: [
      { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", description: "Quality replies (via Venice)" },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6", description: "Best for reflection & emergence" },
      { id: "llama-3.3-70b", name: "Llama 3.3 70B", description: "General purpose, fast" },
      { id: "qwen3-235b-a22b-thinking-2507", name: "Qwen3 235B Thinking", description: "Deep reasoning for dreams" },
      { id: "deepseek-v3.2", name: "DeepSeek V3.2", description: "Strong open-source frontier" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified API for 100+ models. Pay-per-token, no commitments.",
    url: "https://openrouter.ai",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "https://openrouter.ai/api/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: true, placeholder: "your-openrouter-key" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "meta-llama/llama-3.3-70b-instruct" },
    ],
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", description: "Fast, general purpose" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", description: "Best quality" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast, multimodal" },
      { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B", description: "Frontier open-source" },
    ],
  },
  {
    id: "together",
    name: "Together AI",
    description: "Fast inference for open-source models. Good pricing for high-volume.",
    url: "https://together.ai",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "https://api.together.xyz/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: true, placeholder: "your-together-key" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    ],
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", description: "Optimized for speed" },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", name: "Qwen 2.5 72B Turbo", description: "Strong multilingual" },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", description: "Frontier open-source" },
    ],
  },
];

const COG_FUNCS: { key: CogFunc; label: string; color: string }[] = [
  { key: "chat", label: "Chat", color: "#3b82f6" },
  { key: "dream", label: "Dream", color: "#a855f7" },
  { key: "reflect", label: "Reflect", color: "#f59e0b" },
];

// ── Function Picker Popup ─────────────────────────────────────

function FunctionPicker({
  modelName,
  onSelect,
  onClose,
}: {
  modelName: string;
  onSelect: (fn: CogFunc | "all") => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 rounded-[8px] p-2 shadow-lg animate-fade-slide-up"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        minWidth: 200,
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 4,
      }}
    >
      <p className="font-mono t-micro px-2 py-1 truncate" style={{ color: "var(--text-faint)" }}>
        Use for:
      </p>
      {COG_FUNCS.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="flex w-full items-center gap-2 px-2 py-1.5 rounded-[4px] transition hover:opacity-80"
          style={{ background: "transparent" }}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-mono t-small" style={{ color: "var(--text)" }}>{label}</span>
        </button>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
      <button
        onClick={() => onSelect("all")}
        className="flex w-full items-center gap-2 px-2 py-1.5 rounded-[4px] transition hover:opacity-80"
        style={{ background: "transparent" }}
      >
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#22c55e" }} />
        <span className="font-mono t-small" style={{ color: "var(--text)" }}>All functions</span>
      </button>
    </div>
  );
}

// ── Hosted Config Form ──────────────────────────────────────────

function HostedConfigForm({
  provider: prov,
  connected,
  onConnect,
}: {
  provider: ProviderDef;
  connected: boolean;
  onConnect?: (config: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // Only credential env vars (exclude model — that's handled per-function below)
  const credentialVars = prov.envVars.filter((e) => !e.key.includes("MODEL"));

  const handleSubmit = async () => {
    if (!onConnect) return;
    setSubmitting(true);
    setWarning(null);
    try {
      await onConnect(values);
    } catch {
      setWarning("Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  const hasRequired = credentialVars
    .filter((e) => e.required)
    .every((e) => (values[e.key] || "").trim().length > 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="label">
          {connected ? "Saved" : "Credentials"}
        </h4>
        <a
          href={prov.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 t-tiny transition"
          style={{ color: "var(--accent)" }}
        >
          Get API key <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* Credential inputs (API key, base URL) */}
      <div className="space-y-1.5">
        {credentialVars.map((env) => (
          <div key={env.key}>
            <label className="block font-mono t-micro mb-0.5" style={{ color: "var(--text-faint)" }}>
              {env.label}
              {env.required && <span style={{ color: "#f59e0b" }}> *</span>}
            </label>
            <input
              type={env.key.includes("KEY") || env.key.includes("SECRET") ? "password" : "text"}
              placeholder={env.placeholder}
              value={values[env.key] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [env.key]: e.target.value }))}
              className="w-full font-mono t-tiny rounded-[6px] px-3 py-1.5 outline-none transition"
              style={{
                background: "var(--surface-dimmer, var(--surface))",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            />
          </div>
        ))}
      </div>

      {warning && (
        <p className="t-micro" style={{ color: "#f59e0b" }}>{warning}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={!hasRequired || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-[6px] px-3 py-2 transition cursor-pointer font-mono t-small"
        style={{
          background: connected ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)",
          border: `1px solid ${connected ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)"}`,
          color: connected ? "#22c55e" : "var(--accent)",
          opacity: !hasRequired || submitting ? 0.5 : 1,
        }}
      >
        {submitting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : connected ? (
          <Check className="h-3 w-3" />
        ) : null}
        {submitting ? "Saving…" : connected ? "Update" : "Save"}
      </button>
    </div>
  );
}

// ── Section Component ───────────────────────────────────────────

function ProviderSection({
  provider: prov,
  isActive,
  isLocal,
  providerRunning,
  binaryInstalled,
  activeModel,
  assignments,
  installedModels,
  modelsLoading,
  downloadProgress,
  startingProvider,
  onSwitch,
  onInstall,
  onCancelInstall,
  onUninstall,
  onStartProvider,
  stoppingProvider,
  onStopProvider,
  hostedConnected,
  onConnect,
}: {
  provider: ProviderDef;
  isActive: boolean;
  isLocal: boolean;
  providerRunning: boolean | null;
  binaryInstalled: boolean | null;
  activeModel: string | null;
  assignments: Record<CogFunc, Assignment | null>;
  installedModels: string[];
  modelsLoading: Set<string>;
  downloadProgress: Record<string, number>;
  startingProvider: boolean;
  stoppingProvider: boolean;
  onSwitch: (model: string, fn: CogFunc | "all") => void;
  onInstall: (model: string) => void;
  onCancelInstall: (model: string) => void;
  onUninstall: (model: string) => void;
  onStartProvider: () => void;
  onStopProvider: () => void;
  hostedConnected: boolean;
  onConnect?: (config: Record<string, string>) => Promise<void>;
}) {
  // A provider is "active" if any cognitive function has a model from this provider
  const ownsActiveModel = activeModel != null && (
    installedModels.includes(activeModel) ||
    prov.models.some((m) => m.id === activeModel)
  );
  // Also check if any assignment uses this provider
  const hasAssignment = Object.values(assignments).some(
    (a) => a && a.provider === prov.id
  );
  const highlighted = ownsActiveModel || hasAssignment || hostedConnected;
  const [open, setOpen] = useState(isActive || highlighted || hostedConnected);
  const [pickerModel, setPickerModel] = useState<string | null>(null);

  // Which cognitive functions is a model assigned to?
  const getFuncTags = (modelId: string): CogFunc[] =>
    (["chat", "dream", "reflect"] as CogFunc[]).filter(
      (fn) => assignments[fn]?.model === modelId
    );

  return (
    <div
      className="rounded-[8px]"
      style={{ border: highlighted ? "1px solid var(--accent)" : "1px solid var(--border)", overflow: "visible" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition"
        style={{ background: "var(--surface-dim)", borderRadius: open ? "8px 8px 0 0" : "8px" }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono" style={{ color: highlighted ? "var(--accent)" : "var(--text)" }}>
              {prov.name}
            </span>
            {isLocal && providerRunning === true && (
              <span
                className="rounded-full px-2 py-0.5 t-micro font-mono"
                style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
              >
                running
              </span>
            )}
            {isLocal && providerRunning === false && binaryInstalled === true && (
              <span
                className="rounded-full px-2 py-0.5 t-micro font-mono"
                style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}
              >
                stopped
              </span>
            )}
            {isLocal && providerRunning === false && binaryInstalled === false && (
              <span
                className="rounded-full px-2 py-0.5 t-micro font-mono"
                style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}
              >
                not installed
              </span>
            )}
            {!isLocal && hostedConnected && (
              <span
                className="rounded-full px-2 py-0.5 t-micro font-mono"
                style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
              >
                saved
              </span>
            )}
            {!isLocal && !hostedConnected && (
              <span
                className="rounded-full px-2 py-0.5 t-micro font-mono"
                style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}
              >
                not saved
              </span>
            )}
            {COG_FUNCS.filter((fn) => {
              const a = assignments[fn.key];
              return a && a.provider === prov.id;
            }).map((fn) => (
              <span
                key={fn.key}
                className="rounded-full px-1.5 py-0.5 t-micro font-mono"
                style={{ background: `${fn.color}22`, color: fn.color }}
              >
                {fn.label.toLowerCase()}
              </span>
            ))}
          </div>
          <span className="block t-tiny mt-0.5" style={{ color: "var(--text-faint)" }}>
            {prov.description}
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />
        )}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-4 animate-fade-slide-up" style={{ borderTop: "1px solid var(--border)" }}>
          {/* Hosted providers: editable config form */}
          {!isLocal && (
            <HostedConfigForm
              provider={prov}
              connected={hostedConnected}
              onConnect={onConnect}
            />
          )}

          {/* Provider actions: Start / Install */}
          {isLocal && providerRunning === false && binaryInstalled === true && (
            <>
              {/* MLX needs a model to start; Ollama can start empty */}
              {installedModels.length === 0 && prov.id !== "ollama" ? (
                <div
                  className="rounded-[6px] px-3 py-2 t-micro"
                  style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", color: "#f59e0b" }}
                >
                  Install and select a model below to start the server
                </div>
              ) : (
              <button
                onClick={onStartProvider}
                disabled={startingProvider}
                className="flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 transition cursor-pointer"
                style={{
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.2)",
                }}
              >
                {startingProvider ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: "#22c55e" }} />
                ) : (
                  <Cpu className="h-3.5 w-3.5 shrink-0" style={{ color: "#22c55e" }} />
                )}
                <div className="flex-1 min-w-0 text-left">
                  <span className="block font-mono t-small" style={{ color: "#22c55e" }}>
                    {startingProvider ? `Starting ${prov.name}…` : `Start ${prov.name}`}
                  </span>
                  <span className="block t-micro" style={{ color: "var(--text-faint)" }}>
                    {startingProvider ? "Waiting for server to be ready" : "Installed but not running — click to start server"}
                  </span>
                </div>
              </button>
              )}
            </>
          )}
          {isLocal && providerRunning === false && binaryInstalled === false && (
            <a
              href={prov.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-[6px] px-3 py-2.5 transition"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
            >
              <Download className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div className="flex-1 min-w-0">
                <span className="block font-mono t-small" style={{ color: "var(--accent)" }}>
                  Install {prov.name}
                </span>
                <span className="block t-micro" style={{ color: "var(--text-faint)" }}>
                  Not detected on this machine — click to download
                </span>
              </div>
              <ExternalLink className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
            </a>
          )}

          {/* Installed on machine (local providers only) */}
          {isLocal && installedModels.length > 0 && (() => {
            // Sort: active model first, then by tag count (desc), then by size (asc)
            const parseSize = (s?: string): number => {
              if (!s) return 999999;
              const m = s.match(/([\d.]+)\s*(MB|GB|TB)/i);
              if (!m) return 999999;
              const val = parseFloat(m[1]);
              const unit = m[2].toUpperCase();
              if (unit === "MB") return val;
              if (unit === "GB") return val * 1024;
              if (unit === "TB") return val * 1024 * 1024;
              return val;
            };
            const sortedInstalled = [...installedModels].sort((a, b) => {
              // Active model always on top
              const aActive = assignments.chat?.model === a || assignments.dream?.model === a || assignments.reflect?.model === a;
              const bActive = assignments.chat?.model === b || assignments.dream?.model === b || assignments.reflect?.model === b;
              if (aActive && !bActive) return -1;
              if (!aActive && bActive) return 1;
              // More tags = higher
              const aTagCount = getFuncTags(a).length;
              const bTagCount = getFuncTags(b).length;
              if (aTagCount !== bTagCount) return bTagCount - aTagCount;
              // Lightest first
              const aSize = parseSize(prov.models.find((m) => m.id === a)?.size);
              const bSize = parseSize(prov.models.find((m) => m.id === b)?.size);
              return aSize - bSize;
            });
            return (
            <div className="space-y-1.5">
              <h4 className="label">Installed on machine</h4>
              <div className="space-y-0.5">
                {sortedInstalled.map((modelId) => {
                  const funcTags = getFuncTags(modelId);
                  const isLoading = modelsLoading.has(modelId);
                  const knownModel = prov.models.find((m) => m.id === modelId);
                  return (
                    <div
                      key={modelId}
                      className="group relative flex items-center gap-2 rounded-[6px] px-3 py-2 transition cursor-pointer"
                      style={{
                        background: funcTags.length > 0 ? "var(--surface-dim)" : "transparent",
                      }}
                      onClick={() => {
                        if (isLoading) return;
                        setPickerModel(pickerModel === modelId ? null : modelId);
                      }}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                      ) : funcTags.length > 0 ? (
                        <Check className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "#22c55e" }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="truncate font-mono t-small"
                            style={{ color: funcTags.length > 0 ? "var(--accent)" : "var(--text)" }}
                          >
                            {knownModel ? knownModel.name : modelId}
                          </span>
                          {funcTags.map((fn) => {
                            const cfg = COG_FUNCS.find((c) => c.key === fn)!;
                            return (
                              <span
                                key={fn}
                                className="rounded-full px-1.5 py-0 t-micro font-mono shrink-0"
                                style={{ background: `${cfg.color}22`, color: cfg.color }}
                              >
                                {cfg.label.toLowerCase()}
                              </span>
                            );
                          })}
                        </div>
                        <span className="block truncate t-micro" style={{ color: "var(--text-faint)" }}>
                          {modelId}
                          {knownModel?.size && ` · ${knownModel.size}`}
                          {knownModel?.ram && ` ︱ ${knownModel.ram} RAM`}
                        </span>
                      </div>
                      {!isLoading && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUninstall(modelId);
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition p-0.5"
                          style={{ color: "var(--text-faint)" }}
                          title="Uninstall model"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {pickerModel === modelId && (
                        <FunctionPicker
                          modelName={modelId}
                          onSelect={(fn) => {
                            setPickerModel(null);
                            onSwitch(modelId, fn);
                          }}
                          onClose={() => setPickerModel(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {/* Compatible models (hide already-installed for local providers) */}
          {prov.models.length > 0 && (() => {
            const filtered = isLocal
              ? prov.models.filter((m) => !installedModels.includes(m.id))
              : prov.models;
            if (filtered.length === 0) return null;
            return (
            <div className="space-y-1.5">
              <h4 className="label">Compatible Models</h4>
              <div className="space-y-0.5">
                {filtered.map((model) => {
                  const funcTags = getFuncTags(model.id);
                  const isInstalled = false;
                  const isLoading = modelsLoading.has(model.id);
                  const progress = downloadProgress[model.id];
                  const hasProgress = isLoading && progress !== undefined;
                  return (
                    <div
                      key={model.id}
                      className="group relative rounded-[6px] px-3 py-2 transition cursor-pointer"
                      style={{
                        background: funcTags.length > 0 ? "var(--surface-dim)" : "transparent",
                        opacity: !isLocal && !hostedConnected && funcTags.length === 0 ? 0.5 : 1,
                      }}
                      onClick={() => {
                        if (isLoading) return;
                        if (!isLocal && !hostedConnected) return;
                        if (!isLocal || isInstalled) {
                          setPickerModel(pickerModel === model.id ? null : model.id);
                        } else {
                          onInstall(model.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                        ) : funcTags.length > 0 ? (
                          <Check className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} />
                        ) : isInstalled || !isLocal ? (
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "#22c55e" }} />
                        ) : (
                          <Plus className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)", opacity: 0.5 }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="truncate font-mono t-small"
                              style={{ color: funcTags.length > 0 ? "var(--accent)" : "var(--text)" }}
                            >
                              {model.name}
                            </span>
                            {funcTags.map((fn) => {
                              const cfg = COG_FUNCS.find((c) => c.key === fn)!;
                              return (
                                <span
                                  key={fn}
                                  className="rounded-full px-1.5 py-0 t-micro font-mono shrink-0"
                                  style={{ background: `${cfg.color}22`, color: cfg.color }}
                                >
                                  {cfg.label.toLowerCase()}
                                </span>
                              );
                            })}
                          </div>
                          <span className="block truncate t-micro" style={{ color: "var(--text-faint)" }}>
                            {model.description}
                            {model.size && ` · ${model.size}`}
                            {model.ram && ` ︱ ${model.ram} RAM`}
                          </span>
                        </div>
                        {hasProgress && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono t-micro tabular-nums" style={{ color: "var(--accent)" }}>
                              {Math.round(progress)}%
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onCancelInstall(model.id); }}
                              className="rounded-full p-0.5 transition hover:bg-[rgba(239,68,68,0.1)]"
                              title="Cancel download"
                              style={{ color: "#ef4444" }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {hasProgress && (
                        <div
                          className="mt-1.5 h-1 rounded-full overflow-hidden"
                          style={{ background: "rgba(59,130,246,0.12)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(progress, 100)}%`,
                              background: "var(--accent)",
                            }}
                          />
                        </div>
                      )}
                      {pickerModel === model.id && (
                        <FunctionPicker
                          modelName={model.id}
                          onSelect={(fn) => {
                            setPickerModel(null);
                            onSwitch(model.id, fn);
                          }}
                          onClose={() => setPickerModel(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {/* Stop server — at bottom of card */}
          {isLocal && providerRunning === true && (
            <button
              onClick={onStopProvider}
              disabled={stoppingProvider}
              className="flex w-full items-center gap-3 rounded-[6px] px-3 py-2 transition cursor-pointer"
              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              {stoppingProvider ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "#ef4444" }} />
              ) : (
                <Square className="h-3 w-3 shrink-0" style={{ color: "#ef4444" }} />
              )}
              <span className="font-mono t-small" style={{ color: "#ef4444" }}>
                {stoppingProvider ? `Stopping ${prov.name}…` : `Stop ${prov.name}`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function ModelsPage() {
  const [installedByProvider, setInstalledByProvider] = useState<Record<string, string[]>>({});
  const [runningByProvider, setRunningByProvider] = useState<Record<string, boolean>>({});
  const [binaryInstalledByProvider, setBinaryInstalledByProvider] = useState<Record<string, boolean>>({});
  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<CogFunc, Assignment | null>>({ chat: null, dream: null, reflect: null });
  const [modelsLoading, setModelsLoading] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});
  const [startingProviders, setStartingProviders] = useState<Set<string>>(new Set());
  const [stoppingProviders, setStoppingProviders] = useState<Set<string>>(new Set());
  const [modelError, setModelError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [localOpen, setLocalOpen] = useState(true);
  const [hostedOpen, setHostedOpen] = useState(true);
  const [hostedConnected, setHostedConnected] = useState<Record<string, boolean>>({});

  const refreshModels = useCallback(async () => {
    try {
      // Fetch global status (auto-detect active provider)
      const globalRes = await fetch("/api/models");
      const globalData = await globalRes.json();
      if (globalData.error) {
        setBackendOnline(false);
        return;
      }
      setBackendOnline(globalData.running);
      setActiveModelState(globalData.active || null);
      setProvider(globalData.provider || null);
      if (globalData.active) setActiveModel(globalData.active);
      if (globalData.assignments) setAssignments(globalData.assignments);

      // Fetch per-provider installed models in parallel
      const [ollamaRes, mlxRes] = await Promise.all([
        fetch("/api/models?provider=ollama").then((r) => r.json()).catch(() => ({ installed: [] })),
        fetch("/api/models?provider=mlx").then((r) => r.json()).catch(() => ({ installed: [] })),
      ]);
      setInstalledByProvider({
        ollama: ollamaRes.installed || [],
        mlx: mlxRes.installed || [],
      });
      setRunningByProvider({
        ollama: ollamaRes.running ?? false,
        mlx: mlxRes.running ?? false,
      });
      setBinaryInstalledByProvider({
        ollama: ollamaRes.binaryInstalled ?? false,
        mlx: mlxRes.binaryInstalled ?? false,
      });

      // Fetch hosted provider connection status
      try {
        const provRes = await fetch("/api/providers");
        const provData = await provRes.json();
        if (provData.providers) {
          const connected: Record<string, boolean> = {};
          for (const [id, info] of Object.entries(provData.providers)) {
            connected[id] = (info as { connected: boolean }).connected;
          }
          setHostedConnected(connected);
        }
      } catch {}
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const addLoading = (m: string) => setModelsLoading((s) => new Set(s).add(m));
  const removeLoading = (m: string) => setModelsLoading((s) => { const n = new Set(s); n.delete(m); return n; });

  const handleStartProvider = async (providerId: string) => {
    setStartingProviders((s) => new Set(s).add(providerId));
    setModelError(null);
    try {
      const installed = installedByProvider[providerId] || [];
      const model = installed[0] || undefined;
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", provider: providerId, model }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModelError(data.error || `Failed to start ${providerId}`);
        return;
      }
      await refreshModels();
    } catch {
      setModelError(`Failed to start ${providerId}`);
    } finally {
      setStartingProviders((s) => { const n = new Set(s); n.delete(providerId); return n; });
    }
  };

  const handleStopProvider = async (providerId: string) => {
    setStoppingProviders((s) => new Set(s).add(providerId));
    setModelError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", provider: providerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModelError(data.error || `Failed to stop ${providerId}`);
        return;
      }
      await refreshModels();
    } catch {
      setModelError(`Failed to stop ${providerId}`);
    } finally {
      setStoppingProviders((s) => { const n = new Set(s); n.delete(providerId); return n; });
    }
  };

  const handleConnectProvider = async (providerId: string, config: Record<string, string>) => {
    setModelError(null);
    const body: Record<string, string> = { provider: providerId };
    // Map env var keys to API fields
    for (const [key, value] of Object.entries(config)) {
      if (key.includes("BASE_URL")) body.baseUrl = value;
      else if (key.includes("API_KEY")) body.apiKey = value;
      else if (key.includes("MODEL")) body.model = value;
    }
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.warning) setModelError(data.warning);
    setHostedConnected((prev) => ({ ...prev, [providerId]: data.connected ?? false }));
    await refreshModels();
  };

  const handleSwitchModel = async (model: string, providerId: string, fn: CogFunc | "all" = "chat") => {
    addLoading(model);
    setModelError(null);
    try {
      const funcsToSet: CogFunc[] = fn === "all" ? ["chat", "dream", "reflect"] : [fn];
      for (const cogFn of funcsToSet) {
        const res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "switch", model, provider: providerId, cognitiveFunction: cogFn }),
        });
        const data = await res.json();
        if (!res.ok) {
          setModelError(data.error || "Failed to switch model");
          return;
        }
        // Update local assignments from response
        if (data.assignments) setAssignments(data.assignments);
        // Persist to localStorage
        setLocalAssignment(cogFn, model, providerId);
      }
      await refreshModels();
    } catch {
      setModelError("Failed to connect to backend");
    } finally {
      removeLoading(model);
    }
  };

  const handleInstallModel = async (model: string, providerId: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    const controller = new AbortController();
    abortControllers.current[trimmed] = controller;
    addLoading(trimmed);
    setModelError(null);
    setDownloadProgress((p) => ({ ...p, [trimmed]: 0 }));
    try {
      const res = await fetch(
        `/api/models/install?model=${encodeURIComponent(trimmed)}&provider=${encodeURIComponent(providerId)}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModelError(data.error || "Failed to install model");
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setModelError("No response stream");
        return;
      }
      // Stream connected — server is running (may have been auto-started), refresh UI
      refreshModels();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const chunk of lines) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.status === "downloading" && evt.percent !== undefined) {
              setDownloadProgress((p) => ({ ...p, [trimmed]: evt.percent }));
            } else if (evt.status === "error") {
              setModelError(evt.error || "Install failed");
            }
          } catch {}
        }
      }
      addKnownModel(trimmed);
      await refreshModels();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Cancelled by user — no error
      } else {
        setModelError("Failed to connect to backend");
      }
    } finally {
      delete abortControllers.current[trimmed];
      removeLoading(trimmed);
      setDownloadProgress((p) => {
        const next = { ...p };
        delete next[trimmed];
        return next;
      });
    }
  };

  const handleCancelInstall = (model: string) => {
    const controller = abortControllers.current[model];
    if (controller) controller.abort();
  };

  const handleUninstallModel = async (model: string, providerId: string) => {
    addLoading(model);
    setModelError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall", model, provider: providerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModelError(data.error || "Failed to uninstall model");
        return;
      }
      removeKnownModel(model);
      if (data.assignments) setAssignments(data.assignments);
      await refreshModels();
    } catch {
      setModelError("Failed to connect to backend");
    } finally {
      removeLoading(model);
    }
  };

  return (
    <div className="relative h-full overflow-y-auto p-6 pt-20" style={{ background: "var(--bg)" }}>
      <FloatNav route="brain" />

      <div className="animate-fade-slide-up">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <h1 className="t-heading" style={{ color: "var(--text)" }}>Models</h1>
        </div>
        <p className="mt-1 t-small" style={{ color: "var(--text-faint)" }}>
          Configure inference providers and models for chat, dreams, and reflections
        </p>
      </div>

      {/* Current status — per-function model assignments */}
      {(() => {
        const assignedCount = COG_FUNCS.filter(({ key }) => assignments[key]?.model).length;
        const statusLevel: "active" | "partial" | "inactive" =
          !backendOnline || assignedCount === 0
            ? "inactive"
            : assignedCount === 3
              ? "active"
              : "partial";
        const statusConfig = {
          active:  { color: "#22c55e", label: "Model status: active" },
          partial: { color: "#f59e0b", label: `Model status: partial (${assignedCount}/3)` },
          inactive: { color: "#ef4444", label: "Model status: inactive" },
        }[statusLevel];
        return (
          <div
            className="mt-6 rounded-[8px] px-4 py-3"
            style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-3 mb-2">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: backendOnline === null ? "var(--text-faint)" : statusConfig.color }}
              />
              <span className="font-mono t-small" style={{ color: backendOnline === null ? "var(--text-faint)" : statusConfig.color }}>
                {backendOnline === null ? "Checking..." : statusConfig.label}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {COG_FUNCS.map(({ key, label, color }) => {
                const assign = assignments[key];
                return (
                  <div
                    key={key}
                    className="rounded-[6px] px-2.5 py-1.5"
                    style={{ background: "var(--surface)", borderLeft: `2px solid ${color}` }}
                  >
                    <span className="block t-micro font-mono" style={{ color }}>
                      {label.toLowerCase()}
                    </span>
                    <span className="block font-mono t-tiny truncate mt-0.5" style={{ color: assign?.model ? "var(--accent)" : "var(--text-faint)" }}>
                      {assign?.model || "unassigned"}
                    </span>
                    {assign?.provider && assign.provider !== "unknown" && (
                      <span className="block t-micro truncate" style={{ color: "var(--text-faint)" }}>
                        via {assign.provider}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Error */}
      {modelError && (
        <div className="mt-4 rounded-[8px] p-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <p className="t-small text-red-500">{modelError}</p>
        </div>
      )}

      {/* ── Local Providers ──────────────────────────────────────── */}
      <div className="mt-8">
        <button
          onClick={() => setLocalOpen((v) => !v)}
          className="flex w-full items-center gap-2 mb-3 text-left"
        >
          <Monitor className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <span className="font-mono flex-1" style={{ color: "var(--text)" }}>Local</span>
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
            Run models on your machine
          </span>
          {localOpen ? (
            <ChevronDown className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
          ) : (
            <ChevronRight className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
          )}
        </button>
        {localOpen && (
          <div className="space-y-2 animate-fade-slide-up">
            {LOCAL_PROVIDERS.map((prov) => (
              <ProviderSection
                key={prov.id}
                provider={prov}
                isActive={provider === prov.id}
                isLocal={true}
                providerRunning={runningByProvider[prov.id] ?? false}
                binaryInstalled={binaryInstalledByProvider[prov.id] ?? false}
                activeModel={activeModel}
                assignments={assignments}
                installedModels={installedByProvider[prov.id] || []}
                modelsLoading={modelsLoading}
                downloadProgress={downloadProgress}
                startingProvider={startingProviders.has(prov.id)}
                stoppingProvider={stoppingProviders.has(prov.id)}
                onSwitch={(m, fn) => handleSwitchModel(m, prov.id, fn)}
                onInstall={(m) => handleInstallModel(m, prov.id)}
                onCancelInstall={handleCancelInstall}
                onUninstall={(m) => handleUninstallModel(m, prov.id)}
                onStartProvider={() => handleStartProvider(prov.id)}
                onStopProvider={() => handleStopProvider(prov.id)}
                hostedConnected={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Hosted Providers ─────────────────────────────────────── */}
      <div className="mt-8 mb-12">
        <button
          onClick={() => setHostedOpen((v) => !v)}
          className="flex w-full items-center gap-2 mb-3 text-left"
        >
          <Cloud className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <span className="font-mono flex-1" style={{ color: "var(--text)" }}>Hosted</span>
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
            Cloud inference APIs
          </span>
          {hostedOpen ? (
            <ChevronDown className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
          ) : (
            <ChevronRight className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
          )}
        </button>
        {hostedOpen && (
          <div className="space-y-2 animate-fade-slide-up">
            {HOSTED_PROVIDERS.map((prov) => (
              <ProviderSection
                key={prov.id}
                provider={prov}
                isActive={provider === prov.id}
                isLocal={false}
                providerRunning={null}
                binaryInstalled={null}
                activeModel={activeModel}
                assignments={assignments}
                installedModels={installedByProvider[prov.id] || []}
                modelsLoading={modelsLoading}
                downloadProgress={downloadProgress}
                startingProvider={false}
                stoppingProvider={false}
                onSwitch={(m, fn) => handleSwitchModel(m, prov.id, fn)}
                onInstall={(m) => handleInstallModel(m, prov.id)}
                onCancelInstall={handleCancelInstall}
                onUninstall={(m) => handleUninstallModel(m, prov.id)}
                onStartProvider={() => {}}
                onStopProvider={() => {}}
                hostedConnected={hostedConnected[prov.id] ?? false}
                onConnect={(config) => handleConnectProvider(prov.id, config)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
