"use client";

import { useEffect, useState, useCallback } from "react";
import { useRef } from "react";
import {
  Brain,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Moon,
  Database,
  Cpu,
  Sliders,

  Monitor,
  Cloud,
  ExternalLink,
  Power,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemory } from "@/lib/memory-context";
import { NeuroSlider } from "@/components/ui/neuro-slider";
import { TypeFilterToggles } from "@/components/ui/type-filter-toggles";
import { DEFAULT_RETRIEVAL_SETTINGS } from "@/lib/retrieval-settings";
import { FloatNav } from "@/components/shell/float-nav";

// ── Types ───────────────────────────────────────────────────────────

interface EmbSlotConfig {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  dimensions: number | null;
}

interface CortexConfig {
  supabase: { url: string | null; connected: boolean };
  inference: {
    baseUrl: string | null;
    model: string | null;
    provider: string;
    connected: boolean;
  };
  embedding: {
    provider: string | null;
    model: string | null;
    baseUrl: string | null;
    dimensions: number | null;
    connected: boolean;
  };
  embeddingSlots: {
    test: EmbSlotConfig | null;
    publish: EmbSlotConfig | null;
  };
  embeddingKeys: Record<string, boolean>;
  ownerWallet: string | null;
  features: Record<string, boolean>;
}

// ── Embedding Providers ─────────────────────────────────────────────

interface EmbModel {
  id: string;
  name: string;
  dims: number;
  size?: string;
  desc: string;
}

interface EmbProvider {
  id: string;
  name: string;
  desc: string;
  url?: string;
  baseUrl: string;
  models: EmbModel[];
}

const EMB_LOCAL: EmbProvider[] = [
  {
    id: "ollama",
    name: "Ollama (Windows, Linux)",
    desc: "Uses Ollama server (shared with inference)",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: [
      { id: "nomic-embed-text", name: "nomic-embed-text", dims: 768, size: "274 MB", desc: "Best overall ︱ 0.3 GB RAM" },
      { id: "mxbai-embed-large", name: "mxbai-embed-large", dims: 1024, size: "670 MB", desc: "High quality, large ︱ 0.7 GB RAM" },
      { id: "all-minilm", name: "all-minilm", dims: 384, size: "46 MB", desc: "Fast, lightweight ︱ 0.1 GB RAM" },
      { id: "snowflake-arctic-embed", name: "snowflake-arctic-embed", dims: 768, size: "274 MB", desc: "Snowflake, strong benchmarks ︱ 0.3 GB RAM" },
    ],
  },
  {
    id: "mlx",
    name: "MLX (Apple Silicon)",
    desc: "Dedicated server via mlx_embeddings",
    baseUrl: "http://127.0.0.1:11435/v1",
    models: [
      { id: "sentence-transformers/all-MiniLM-L6-v2", name: "all-MiniLM-L6-v2", dims: 384, size: "91 MB", desc: "Fast, best for general use ︱ 0.1 GB RAM" },
      { id: "nomic-ai/nomic-embed-text-v1.5", name: "nomic-embed-text-v1.5", dims: 768, size: "548 MB", desc: "High quality, Matryoshka ︱ 0.5 GB RAM" },
      { id: "BAAI/bge-small-en-v1.5", name: "bge-small-en-v1.5", dims: 384, size: "133 MB", desc: "Compact, strong benchmarks ︱ 0.2 GB RAM" },
      { id: "BAAI/bge-base-en-v1.5", name: "bge-base-en-v1.5", dims: 768, size: "438 MB", desc: "Balanced ︱ 0.5 GB RAM" },
      { id: "sentence-transformers/all-mpnet-base-v2", name: "all-mpnet-base-v2", dims: 768, size: "438 MB", desc: "Highest quality, slower ︱ 0.5 GB RAM" },
    ],
  },
];

const EMB_HOSTED: EmbProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    desc: "Industry standard embedding API",
    url: "https://platform.openai.com",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "text-embedding-3-small", name: "text-embedding-3-small", dims: 1536, size: "hosted", desc: "Fast, cost-effective" },
      { id: "text-embedding-3-large", name: "text-embedding-3-large", dims: 3072, size: "hosted", desc: "Highest quality" },
    ],
  },
  {
    id: "voyage",
    name: "Voyage AI",
    desc: "High-quality embeddings, strong for code",
    url: "https://www.voyageai.com",
    baseUrl: "https://api.voyageai.com/v1",
    models: [
      { id: "voyage-3", name: "voyage-3", dims: 1024, size: "hosted", desc: "Best overall quality" },
      { id: "voyage-3-lite", name: "voyage-3-lite", dims: 512, size: "hosted", desc: "Fast, cost-effective" },
      { id: "voyage-code-3", name: "voyage-code-3", dims: 1024, size: "hosted", desc: "Optimized for code" },
    ],
  },
];

// ── Embedding Types ─────────────────────────────────────────────────

type EmbType = "test" | "publish";

const EMB_TYPES: { key: EmbType; label: string; color: string }[] = [
  { key: "test", label: "Test", color: "#a855f7" },
  { key: "publish", label: "Publish", color: "#22c55e" },
];

function EmbTypePicker({
  onSelect,
  onClose,
}: {
  onSelect: (t: EmbType) => void;
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
        minWidth: 160,
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 4,
      }}
    >
      <p className="font-mono t-micro px-2 py-1" style={{ color: "var(--text-faint)" }}>
        Use for:
      </p>
      {EMB_TYPES.map(({ key, label, color }) => (
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
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function CortexPage() {
  const [config, setConfig] = useState<CortexConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Section open states
  const [supabaseOpen, setSupabaseOpen] = useState(false);
  const [embeddingOpen, setEmbeddingOpen] = useState(true);
  const [embOpenProviders, setEmbOpenProviders] = useState<Set<string>>(new Set());
  const [embApiKeys, setEmbApiKeys] = useState<Record<string, string>>({});
  const [embKeySaving, setEmbKeySaving] = useState<string | null>(null);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);


  // Supabase form
  const [sbUrl, setSbUrl] = useState("");
  const [sbKey, setSbKey] = useState("");
  const [sbTesting, setSbTesting] = useState(false);
  const [sbSaving, setSbSaving] = useState(false);
  const [sbResult, setSbResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  // Embedding
  const [embModel, setEmbModel] = useState(
    "sentence-transformers/all-MiniLM-L6-v2",
  );
  const [embPort, setEmbPort] = useState("11435");
  const [embRunning, setEmbRunning] = useState(false);
  const [embDims, setEmbDims] = useState<number | null>(null);
  const [embLoadingModels, setEmbLoadingModels] = useState<Set<string>>(new Set());
  const [embLoadingProgress, setEmbLoadingProgress] = useState<Record<string, { elapsed: number; phase: string }>>({});
  const embAbortRef = useRef<Record<string, AbortController>>({});
  const [embTesting, setEmbTesting] = useState(false);
  const [embSaving, setEmbSaving] = useState(false);
  const [embResult, setEmbResult] = useState<{
    ok: boolean;
    error?: string;
    provider?: string;
  } | null>(null);

  // Embedding type assignments (test / publish)
  const [embTypeAssignments, setEmbTypeAssignments] = useState<
    Record<EmbType, { provider: string; model: string } | null>
  >({ test: null, publish: null });
  const [embPickerModel, setEmbPickerModel] = useState<string | null>(null);

  // Live health status for embedding slots
  const [slotHealth, setSlotHealth] = useState<
    Record<EmbType, { ok: boolean; dims?: number; latencyMs?: number } | null>
  >({ test: null, publish: null });

  // Schedules (from memory context, same as settings sheet)
  const { retrievalSettings, updateRetrievalSettings } = useMemory();
  const [dreamScheduleLoading, setDreamScheduleLoading] = useState(false);
  const [reflectionScheduleLoading, setReflectionScheduleLoading] =
    useState(false);

  const s = retrievalSettings;

  const resolveProvider = (baseUrl: string | null): string | null => {
    if (!baseUrl) return null;
    if (baseUrl.includes(":11435")) return "mlx";
    if (baseUrl.includes(":11434")) return "ollama";
    if (baseUrl.includes("openai.com")) return "openai";
    if (baseUrl.includes("voyageai.com")) return "voyage";
    return null;
  };

  const refreshConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfig(data);
      // Pre-fill supabase URL if available
      if (data.supabase?.url) setSbUrl(data.supabase.url);
      if (data.embedding?.model) setEmbModel(data.embedding.model);
      // Restore slot assignments from server
      const slots = data.embeddingSlots;
      if (slots) {
        const assignments: Record<EmbType, { provider: string; model: string } | null> = { test: null, publish: null };
        for (const t of ["test", "publish"] as EmbType[]) {
          const s = slots[t];
          if (s?.model) {
            const prov = resolveProvider(s.baseUrl);
            if (prov) assignments[t] = { provider: prov, model: s.model };
          }
        }
        setEmbTypeAssignments(assignments);
      }
    } catch {}
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshEmbeddingStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", port: parseInt(embPort) }),
      });
      const data = await res.json();
      setEmbRunning(data.running ?? false);
      if (data.dimensions) setEmbDims(data.dimensions);
    } catch {}
  }, [embPort]);

  // Check live health of each configured embedding slot (server-side, uses stored API keys)
  const refreshSlotHealth = useCallback(async (cfg: CortexConfig | null) => {
    if (!cfg?.embeddingSlots) return;
    const results: Record<EmbType, { ok: boolean; dims?: number; latencyMs?: number } | null> = { test: null, publish: null };
    for (const t of ["test", "publish"] as EmbType[]) {
      const slot = cfg.embeddingSlots[t];
      if (!slot?.baseUrl || !slot?.model) continue;
      const start = Date.now();
      try {
        const res = await fetch("/api/cortex/embedding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "health", slot: t }),
        });
        const data = await res.json();
        results[t] = { ok: data.ok, dims: data.dimensions, latencyMs: Date.now() - start };
      } catch {
        results[t] = { ok: false, latencyMs: Date.now() - start };
      }
    }
    setSlotHealth(results);
  }, []);

  useEffect(() => {
    refreshConfig();
    refreshEmbeddingStatus();
  }, [refreshConfig, refreshEmbeddingStatus]);

  // Check slot health after config loads
  useEffect(() => {
    if (config) refreshSlotHealth(config);
  }, [config, refreshSlotHealth]);

  // ── Supabase handlers ──

  const handleSupabaseTest = async () => {
    setSbTesting(true);
    setSbResult(null);
    try {
      const res = await fetch("/api/cortex/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", url: sbUrl, serviceKey: sbKey }),
      });
      setSbResult(await res.json());
    } catch {
      setSbResult({ ok: false, error: "Request failed" });
    }
    setSbTesting(false);
  };

  const handleSupabaseSave = async () => {
    setSbSaving(true);
    try {
      await fetch("/api/cortex/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", url: sbUrl, serviceKey: sbKey }),
      });
      await refreshConfig();
    } catch {}
    setSbSaving(false);
  };

  // ── Embedding handlers ──

  const handleEmbeddingStop = async () => {
    try {
      await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", port: parseInt(embPort) }),
      });
      setEmbRunning(false);
      setEmbDims(null);
    } catch {}
  };

  const handleEmbeddingTest = async () => {
    setEmbTesting(true);
    setEmbResult(null);
    try {
      const res = await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", port: parseInt(embPort) }),
      });
      const data = await res.json();
      setEmbResult(data);
      if (data.dimensions) setEmbDims(data.dimensions);
    } catch {
      setEmbResult({ ok: false, error: "Request failed" });
    }
    setEmbTesting(false);
  };

  const handleEmbeddingSave = async () => {
    setEmbSaving(true);
    try {
      await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          model: embModel,
          port: parseInt(embPort),
        }),
      });
      await refreshConfig();
    } catch {}
    setEmbSaving(false);
  };

  // ── Embedding helpers ──

  const toggleEmbProvider = (id: string) =>
    setEmbOpenProviders((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const activeEmbProvider = (() => {
    const url = config?.embedding?.baseUrl || "";
    if (embRunning) return "mlx";
    if (url.includes(":11434")) return "ollama";
    if (url.includes("openai.com")) return "openai";
    if (url.includes("voyageai.com")) return "voyage";
    return null;
  })();

  const activeEmbModelId = config?.embedding?.model || null;

  const handleEmbeddingUse = async (
    providerId: string,
    modelId: string,
    dims: number,
    baseUrl: string,
    apiKey: string,
    slot?: EmbType,
  ) => {
    const modelKey = `${providerId}:${modelId}`;
    const controller = new AbortController();
    embAbortRef.current[modelKey] = controller;
    setEmbLoadingModels((s) => new Set(s).add(modelKey));
    setEmbResult(null);
    try {
      // ── Step 1: Start/connect the server ──
      if (providerId === "mlx") {
        // Stop existing MLX if running a different model
        if (embRunning) {
          await fetch("/api/cortex/embedding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "stop", port: parseInt(embPort) }),
          });
        }
        if (controller.signal.aborted) return;
        // Spawn server (non-blocking)
        const spawnRes = await fetch("/api/cortex/embedding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "spawn", model: modelId, port: parseInt(embPort) }),
          signal: controller.signal,
        });
        const spawnData = await spawnRes.json();
        if (!spawnData.ok) {
          setEmbResult({ ok: false, error: spawnData.error });
          return;
        }
        if (spawnData.phase === "ready") {
          // Already running
          setEmbRunning(true);
          if (spawnData.dimensions) dims = spawnData.dimensions;
          setEmbDims(dims);
          baseUrl = `http://127.0.0.1:${embPort}/v1`;
          apiKey = "local";
        } else {
          // Poll until ready, crashed, or timeout (90s)
          const startTime = Date.now();
          const timeout = 90_000;
          let ready = false;
          while (Date.now() - startTime < timeout) {
            if (controller.signal.aborted) return;
            await new Promise((r) => setTimeout(r, 1000));
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            setEmbLoadingProgress((p) => ({ ...p, [modelKey]: { elapsed, phase: "loading" } }));
            try {
              const pollRes = await fetch("/api/cortex/embedding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "poll", port: parseInt(embPort) }),
                signal: controller.signal,
              });
              const pollData = await pollRes.json();
              if (pollData.phase === "ready") {
                setEmbRunning(true);
                if (pollData.dimensions) dims = pollData.dimensions;
                setEmbDims(dims);
                ready = true;
                break;
              }
              if (pollData.phase === "crashed") {
                setEmbResult({ ok: false, error: pollData.error || "Server crashed during startup" });
                return;
              }
            } catch {
              if (controller.signal.aborted) return;
            }
          }
          if (!ready) {
            setEmbResult({ ok: false, error: `Server failed to start within ${timeout / 1000}s` });
            return;
          }
          baseUrl = `http://127.0.0.1:${embPort}/v1`;
          apiKey = "local";
        }
      }

      if (controller.signal.aborted) return;

      // ── Step 2: Verify the endpoint actually works ──
      const verifyRes = await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", baseUrl, apiKey: apiKey || undefined, provider: providerId, model: modelId }),
        signal: controller.signal,
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.ok) {
        setEmbResult({ ok: false, error: verifyData.error || "Connection failed", provider: providerId });
        return;
      }
      if (verifyData.dimensions) dims = verifyData.dimensions;

      // ── Step 3: Disconnect previous slot assignment if different ──
      if (slot) {
        const prev = embTypeAssignments[slot];
        if (prev && (prev.provider !== providerId || prev.model !== modelId)) {
          // If previous was MLX and nothing else uses it, stop it
          if (prev.provider === "mlx") {
            const otherSlot = slot === "test" ? "publish" : "test";
            const otherUsesMlx = embTypeAssignments[otherSlot]?.provider === "mlx";
            if (!otherUsesMlx) {
              await fetch("/api/cortex/embedding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "stop", port: parseInt(embPort) }),
              });
              setEmbRunning(false);
              setEmbDims(null);
            }
          }
          // Clear previous slot config
          await fetch("/api/cortex/embedding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "disconnect", slot }),
          });
        }
      }

      // ── Step 4: Save config ──
      await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          provider: providerId,
          baseUrl,
          apiKey: apiKey || undefined,
          model: modelId,
          dimensions: dims,
          ...(slot ? { slot } : {}),
        }),
      });
      setEmbModel(modelId);
      setEmbDims(dims);
      // Update local type assignment state on success
      if (slot) {
        setEmbTypeAssignments((prev) => ({
          ...prev,
          [slot]: { provider: providerId, model: modelId },
        }));
      }
      setEmbResult({ ok: true, provider: providerId });
      await refreshConfig();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Cancelled by user
      } else {
        setEmbResult({ ok: false, error: "Failed to configure embedding" });
      }
    } finally {
      delete embAbortRef.current[modelKey];
      setEmbLoadingModels((s) => { const n = new Set(s); n.delete(modelKey); return n; });
      setEmbLoadingProgress((p) => { const next = { ...p }; delete next[modelKey]; return next; });
    }
  };

  // ── Service disconnect handlers ──

  const handleDisconnect = async (service: "supabase" | "inference" | "embedding") => {
    try {
      if (service === "supabase") {
        await fetch("/api/cortex/supabase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "disconnect" }),
        });
      } else if (service === "inference") {
        await fetch("/api/cortex/inference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "disconnect" }),
        });
      } else if (service === "embedding") {
        await fetch("/api/cortex/embedding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "disconnect", port: parseInt(embPort) }),
        });
        setEmbRunning(false);
        setEmbDims(null);
      }
      await refreshConfig();
    } catch {}
  };

  const handleEmbCancel = (providerId: string, modelId: string) => {
    const key = `${providerId}:${modelId}`;
    const controller = embAbortRef.current[key];
    if (controller) controller.abort();
  };

  const handleEmbSaveKey = async (providerId: string) => {
    const apiKey = embApiKeys[providerId];
    if (!apiKey) return;
    setEmbKeySaving(providerId);
    try {
      await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-key", provider: providerId, apiKey }),
      });
      await refreshConfig();
    } catch {}
    setEmbKeySaving(null);
  };

  // ── Embedding type helpers ──

  const getEmbTypeTags = (providerId: string, modelId: string): EmbType[] =>
    (["test", "publish"] as EmbType[]).filter(
      (t) => embTypeAssignments[t]?.provider === providerId && embTypeAssignments[t]?.model === modelId && slotHealth[t]?.ok
    );

  const handleEmbTypeSelect = async (providerId: string, modelId: string, dims: number, baseUrl: string, apiKey: string, embType: EmbType) => {
    setEmbPickerModel(null);
    // Save to slot and activate — only update local state on success
    await handleEmbeddingUse(providerId, modelId, dims, baseUrl, apiKey, embType);
  };

  // ── Render ──

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2
          className="h-5 w-5 animate-spin"
          style={{ color: "var(--accent)" }}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto p-6 pt-20" style={{ background: "var(--bg)" }}>
      <FloatNav route="brain" />

      <div className="animate-fade-slide-up">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <h1 className="t-heading" style={{ color: "var(--text)" }}>
            Cortex
          </h1>
        </div>
        <p
          className="mt-1 t-small"
          style={{ color: "var(--text-faint)" }}
        >
          Configure memory infrastructure, embedding, and cognitive schedules
        </p>
      </div>

      {/* ── Service Status ── */}
      <div
        className="mt-6 rounded-[8px] px-4 py-3"
        style={{
          background: "var(--surface-dim)",
          border: "1px solid var(--border)",
        }}
      >
        <h4 className="label mb-2">Services</h4>
        <div className="space-y-1.5">
          {([
            {
              key: "supabase" as const,
              name: "Supabase",
              connected: config?.supabase?.connected,
              detail: config?.supabase?.url,
              required: true,
            },
            {
              key: "inference" as const,
              name: "Inference",
              connected: config?.inference?.connected,
              detail: config?.inference?.provider,
              required: true,
            },
          ]).map((svc) => (
            <div
              key={svc.name}
              className="group flex items-center gap-2 rounded-[6px] px-2.5 py-1.5"
              style={{ background: "var(--surface)" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: svc.connected
                    ? "#22c55e"
                    : svc.required
                      ? "#ef4444"
                      : "var(--text-faint)",
                }}
              />
              <span className="t-small" style={{ color: "var(--text)" }}>
                {svc.name}
              </span>
              {svc.detail && (
                <span
                  className="ml-auto truncate max-w-[180px] t-tiny"
                  style={{ color: "var(--text-faint)" }}
                >
                  {svc.detail}
                </span>
              )}
              {svc.connected && (
                <button
                  onClick={() => handleDisconnect(svc.key)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition p-0.5 rounded"
                  style={{ color: "var(--text-faint)" }}
                  title={`Disconnect ${svc.name}`}
                >
                  <Power className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          {/* Embedding slots */}
          {EMB_TYPES.map((t) => {
            const slot = config?.embeddingSlots?.[t.key];
            const provId = slot ? resolveProvider(slot.baseUrl) : null;
            const health = slotHealth[t.key];
            // Dot: green = live, orange = configured but unreachable, gray = not assigned
            const dotColor = !slot
              ? "var(--text-faint)"
              : health === null
                ? "var(--text-faint)" // still checking
                : health.ok
                  ? "#22c55e"
                  : "#f59e0b";
            return (
              <div
                key={`emb-${t.key}`}
                className="group flex items-center gap-2 rounded-[6px] px-2.5 py-1.5"
                style={{ background: "var(--surface)" }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: dotColor }}
                />
                <span className="t-small" style={{ color: "var(--text)" }}>
                  Embedding
                </span>
                <span
                  className="rounded-full px-1.5 py-0 t-micro font-mono"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {t.label.toLowerCase()}
                </span>
                <span
                  className="ml-auto truncate max-w-[200px] t-tiny"
                  style={{ color: "var(--text-faint)" }}
                >
                  {!slot
                    ? "not assigned"
                    : health === null
                      ? "checking..."
                      : health.ok
                        ? `${provId || slot.provider} · ${slot.model?.split("/").pop() || "?"} · ${health.dims ?? slot.dimensions ?? "?"}d · ${health.latencyMs}ms`
                        : `${provId || slot.provider} · unreachable`}
                </span>
                {slot && (
                  <button
                    onClick={() => handleDisconnect("embedding")}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition p-0.5 rounded"
                    style={{ color: "var(--text-faint)" }}
                    title={`Disconnect ${t.label}`}
                  >
                    <Power className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}
          {config?.inference?.model && (
            <div
              className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5"
              style={{ background: "var(--surface)" }}
            >
              <Cpu
                className="h-2.5 w-2.5"
                style={{ color: "var(--text-faint)" }}
              />
              <span className="t-small" style={{ color: "var(--text)" }}>
                Model
              </span>
              <span
                className="ml-auto truncate max-w-[180px] t-tiny"
                style={{ color: "var(--text-faint)" }}
              >
                {config.inference.model}
              </span>
            </div>
          )}
        </div>
        {config?.features && Object.keys(config.features).length > 0 && (
          <>
            <h4 className="label mb-2 mt-3">Features</h4>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(config.features).map(([key, enabled]) => (
                <div
                  key={key}
                  className="flex items-center gap-1.5 rounded-[4px] px-2 py-1"
                  style={{ background: "var(--surface)" }}
                >
                  <span
                    className="h-1 w-1 shrink-0 rounded-full"
                    style={{
                      background: enabled ? "#22c55e" : "var(--text-faint)",
                    }}
                  />
                  <span
                    className="t-tiny truncate"
                    style={{
                      color: enabled ? "var(--text)" : "var(--text-faint)",
                    }}
                  >
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {/* ── Supabase Setup ── */}
        <button
          onClick={() => setSupabaseOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
          style={{ color: "var(--text-muted)" }}
        >
          <Database
            className="h-3.5 w-3.5"
            style={{ color: "var(--accent)" }}
          />
          <span className="flex-1">Supabase</span>
          {config?.supabase?.connected && (
            <span className="t-tiny" style={{ color: "#22c55e" }}>
              Connected
            </span>
          )}
          {supabaseOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {supabaseOpen && (
          <div className="space-y-3 px-1 pb-2 animate-fade-slide-up">
            <p
              className="t-tiny leading-relaxed"
              style={{ color: "var(--text-faint)" }}
            >
              Connect to Supabase for persistent memory storage with pgvector
              semantic search.
            </p>
            <div className="space-y-2">
              <div>
                <label
                  className="label block mb-1"
                  style={{ fontSize: "8px" }}
                >
                  Project URL
                </label>
                <input
                  type="text"
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                  className="w-full rounded-[6px] px-2.5 py-2 t-small bg-transparent outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div>
                <label
                  className="label block mb-1"
                  style={{ fontSize: "8px" }}
                >
                  Service Key
                </label>
                <input
                  type="password"
                  value={sbKey}
                  onChange={(e) => setSbKey(e.target.value)}
                  placeholder="eyJhbGci..."
                  className="w-full rounded-[6px] px-2.5 py-2 t-small bg-transparent outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={sbTesting || !sbUrl || !sbKey}
                  onClick={handleSupabaseTest}
                  className="rounded-full px-3 py-1 t-tiny transition"
                  style={{
                    background: "var(--surface)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    opacity: sbTesting || !sbUrl || !sbKey ? 0.5 : 1,
                  }}
                >
                  {sbTesting ? "Testing..." : "Test Connection"}
                </button>
                <button
                  disabled={sbSaving || !sbUrl || !sbKey}
                  onClick={handleSupabaseSave}
                  className="rounded-full px-3 py-1 t-tiny transition"
                  style={{
                    background: "rgba(var(--accent-rgb, 99,102,241), 0.15)",
                    color: "var(--accent)",
                    border: "1px solid var(--border)",
                    opacity: sbSaving || !sbUrl || !sbKey ? 0.5 : 1,
                  }}
                >
                  {sbSaving ? "Saving..." : "Save"}
                </button>
              </div>
              {sbResult && (
                <div
                  className="flex items-center gap-1.5 t-tiny"
                  style={{
                    color: sbResult.ok ? "#22c55e" : "#ef4444",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: sbResult.ok ? "#22c55e" : "#ef4444",
                    }}
                  />
                  {sbResult.ok
                    ? "Connection successful"
                    : sbResult.error || "Connection failed"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Embedding ── */}
        <button
          onClick={() => setEmbeddingOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
          style={{ color: "var(--text-muted)" }}
        >
          <Database className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <span className="flex-1">Embedding</span>
          {EMB_TYPES.filter((t) => embTypeAssignments[t.key] && slotHealth[t.key]?.ok).map((t) => (
            <span
              key={t.key}
              className="rounded-full px-1.5 py-0.5 t-micro font-mono"
              style={{ background: `${t.color}22`, color: t.color }}
            >
              {t.label.toLowerCase()}
            </span>
          ))}
          {activeEmbProvider && (
            <span className="t-tiny font-mono" style={{ color: "var(--text-faint)" }}>
              {activeEmbProvider}
            </span>
          )}
          {embeddingOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {embeddingOpen && (
          <div className="space-y-3 animate-fade-slide-up">
            {/* Local */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Monitor className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
                <span className="font-mono t-micro" style={{ color: "var(--text-faint)" }}>Local</span>
              </div>
              {EMB_LOCAL.map((prov) => {
                const isOpen = embOpenProviders.has(prov.id);
                const isMlx = prov.id === "mlx";
                const isActiveProvider = activeEmbProvider === prov.id;
                return (
                  <div
                    key={prov.id}
                    className="rounded-[8px]"
                    style={{ border: isActiveProvider ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                  >
                    <button
                      onClick={() => toggleEmbProvider(prov.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition"
                      style={{ background: "var(--surface-dim)", borderRadius: isOpen ? "8px 8px 0 0" : "8px" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ color: isActiveProvider ? "var(--accent)" : "var(--text)" }}>
                            {prov.name}
                          </span>
                          {(() => {
                            // Derive running/stopped status from slot health
                            const assignedSlots = (["test", "publish"] as EmbType[]).filter(
                              (t) => embTypeAssignments[t]?.provider === prov.id
                            );
                            const hasAssignment = assignedSlots.length > 0;
                            const isHealthy = isMlx
                              ? embRunning
                              : hasAssignment && assignedSlots.some((t) => slotHealth[t]?.ok);
                            const isChecking = hasAssignment && assignedSlots.every((t) => slotHealth[t] === null);

                            if (isHealthy || (isMlx && embRunning)) {
                              return (
                                <span className="rounded-full px-2 py-0.5 t-micro font-mono" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                                  {isMlx ? "running" : "active"}
                                </span>
                              );
                            }
                            if (isChecking) {
                              return (
                                <span className="rounded-full px-2 py-0.5 t-micro font-mono" style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}>
                                  checking...
                                </span>
                              );
                            }
                            // Local providers always show status
                            return (
                              <span className="rounded-full px-2 py-0.5 t-micro font-mono" style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}>
                                inactive
                              </span>
                            );
                          })()}
                          {EMB_TYPES.filter((t) => embTypeAssignments[t.key]?.provider === prov.id && slotHealth[t.key]?.ok).map((t) => (
                            <span
                              key={t.key}
                              className="rounded-full px-1.5 py-0.5 t-micro font-mono"
                              style={{ background: `${t.color}22`, color: t.color }}
                            >
                              {t.label.toLowerCase()}
                            </span>
                          ))}
                        </div>
                        <p className="t-tiny mt-0.5" style={{ color: "var(--text-faint)" }}>{prov.desc}</p>
                      </div>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--text-faint)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}
                      />
                    </button>

                    {isOpen && (
                      <div className="animate-fade-slide-up" style={{ borderTop: "1px solid var(--border)" }}>
                        <div className="px-4 py-3 space-y-1.5">
                          <span className="font-mono t-micro" style={{ color: "var(--text-faint)" }}>models</span>
                          {prov.models.map((m) => {
                            const isModelActive = activeEmbProvider === prov.id && activeEmbModelId === m.id;
                            const typeTags = getEmbTypeTags(prov.id, m.id);
                            const pickerKey = `${prov.id}:${m.id}`;
                            const isLoading = embLoadingModels.has(pickerKey);
                            return (
                              <div
                                key={m.id}
                                className="group relative rounded-[6px] px-2.5 py-2 transition cursor-pointer"
                                style={{
                                  background: typeTags.length > 0 ? "var(--surface-dim)" : isModelActive ? "rgba(34,197,94,0.08)" : "transparent",
                                  border: isModelActive ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
                                }}
                                onClick={() => {
                                  if (isLoading) return;
                                  if (embLoadingModels.size > 0) return;
                                  setEmbPickerModel(embPickerModel === pickerKey ? null : pickerKey);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  {isLoading ? (
                                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                                  ) : (
                                    <div className="w-3" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono t-small" style={{ color: typeTags.length > 0 ? "var(--accent)" : isModelActive ? "#22c55e" : "var(--text)" }}>
                                        {m.name}
                                      </span>
                                      {isModelActive && typeTags.length === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#22c55e" }} />}
                                      {typeTags.map((t) => {
                                        const cfg = EMB_TYPES.find((c) => c.key === t)!;
                                        return (
                                          <span
                                            key={t}
                                            className="rounded-full px-1.5 py-0 t-micro font-mono shrink-0"
                                            style={{ background: `${cfg.color}22`, color: cfg.color }}
                                          >
                                            {cfg.label.toLowerCase()}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    <p className="t-micro" style={{ color: "var(--text-faint)" }}>
                                      {m.dims}d{m.size && ` · ${m.size}`} · {m.desc}
                                    </p>
                                  </div>
                                  {isLoading && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      {embLoadingProgress[pickerKey] && (
                                        <span className="font-mono t-micro tabular-nums" style={{ color: "var(--accent)" }}>
                                          {embLoadingProgress[pickerKey].elapsed}s
                                        </span>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleEmbCancel(prov.id, m.id); }}
                                        className="rounded-full p-0.5 transition hover:bg-[rgba(239,68,68,0.1)]"
                                        title="Cancel"
                                        style={{ color: "#ef4444" }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                  {!isLoading && typeTags.length > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDisconnect("embedding");
                                      }}
                                      className="rounded-full px-2 py-0.5 t-micro font-mono transition shrink-0"
                                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                                    >
                                      stop
                                    </button>
                                  )}
                                  {!isLoading && !isModelActive && typeTags.length === 0 && (
                                    <span
                                      className="t-micro font-mono shrink-0"
                                      style={{ color: "var(--text-faint)" }}
                                    >
                                      {isMlx ? "start" : "connect"}
                                    </span>
                                  )}
                                </div>
                                {isLoading && (
                                  <div
                                    className="mt-1.5 h-1 rounded-full overflow-hidden"
                                    style={{ background: "rgba(59,130,246,0.12)" }}
                                  >
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: embLoadingProgress[pickerKey]
                                          ? `${Math.min((embLoadingProgress[pickerKey].elapsed / 60) * 100, 95)}%`
                                          : "5%",
                                        background: "var(--accent)",
                                        transition: "width 1s linear",
                                      }}
                                    />
                                  </div>
                                )}
                                {embPickerModel === pickerKey && (
                                  <EmbTypePicker
                                    onSelect={(t) => handleEmbTypeSelect(prov.id, m.id, m.dims, prov.baseUrl, "local", t)}
                                    onClose={() => setEmbPickerModel(null)}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {embResult && !embResult.ok && embResult.provider === prov.id && (
                          <div className="px-4 pb-3">
                            <div
                              className="flex items-start gap-1.5 t-tiny font-mono rounded-[6px] px-2.5 py-2"
                              style={{ color: "#ef4444", background: "rgba(239,68,68,0.06)" }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1" style={{ background: "#ef4444" }} />
                              <span className="break-words min-w-0">
                                {(embResult.error || "failed").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim().slice(0, 200)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hosted */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Cloud className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
                <span className="font-mono t-micro" style={{ color: "var(--text-faint)" }}>Hosted</span>
              </div>
              {EMB_HOSTED.map((prov) => {
                const isOpen = embOpenProviders.has(prov.id);
                const isActiveProvider = activeEmbProvider === prov.id;
                const apiKey = embApiKeys[prov.id] || "";
                return (
                  <div
                    key={prov.id}
                    className="rounded-[8px]"
                    style={{ border: isActiveProvider ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                  >
                    <button
                      onClick={() => toggleEmbProvider(prov.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition"
                      style={{ background: "var(--surface-dim)", borderRadius: isOpen ? "8px 8px 0 0" : "8px" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ color: isActiveProvider ? "var(--accent)" : "var(--text)" }}>
                            {prov.name}
                          </span>
                          {(() => {
                            const assignedSlots = (["test", "publish"] as EmbType[]).filter(
                              (t) => embTypeAssignments[t]?.provider === prov.id
                            );
                            const hasAssignment = assignedSlots.length > 0;
                            const isHealthy = hasAssignment && assignedSlots.some((t) => slotHealth[t]?.ok);
                            if (isHealthy) {
                              return (
                                <span className="rounded-full px-2 py-0.5 t-micro font-mono" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                                  active
                                </span>
                              );
                            }
                            return (
                              <span className="rounded-full px-2 py-0.5 t-micro font-mono" style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}>
                                inactive
                              </span>
                            );
                          })()}
                          {EMB_TYPES.filter((t) => embTypeAssignments[t.key]?.provider === prov.id && slotHealth[t.key]?.ok).map((t) => (
                            <span
                              key={t.key}
                              className="rounded-full px-1.5 py-0.5 t-micro font-mono"
                              style={{ background: `${t.color}22`, color: t.color }}
                            >
                              {t.label.toLowerCase()}
                            </span>
                          ))}
                        </div>
                        <p className="t-tiny mt-0.5" style={{ color: "var(--text-faint)" }}>{prov.desc}</p>
                      </div>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--text-faint)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}
                      />
                    </button>

                    {isOpen && (
                      <div className="animate-fade-slide-up" style={{ borderTop: "1px solid var(--border)" }}>
                        <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
                          <div className="flex items-center justify-between">
                            <label className="font-mono t-micro" style={{ color: "var(--text-faint)" }}>API Key</label>
                            {prov.url && (
                              <a
                                href={prov.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 t-micro transition"
                                style={{ color: "var(--accent)" }}
                              >
                                Get key <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              placeholder={config?.embeddingKeys?.[prov.id] ? "••••••••  (saved)" : `${prov.id}-api-key...`}
                              value={apiKey}
                              onChange={(e) => setEmbApiKeys((k) => ({ ...k, [prov.id]: e.target.value }))}
                              className="flex-1 font-mono t-tiny rounded-[6px] px-3 py-1.5 outline-none transition"
                              style={{
                                background: "var(--surface-dimmer, var(--surface))",
                                border: `1px solid ${config?.embeddingKeys?.[prov.id] ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                                color: "var(--text)",
                              }}
                              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                              onBlur={(e) => { e.target.style.borderColor = config?.embeddingKeys?.[prov.id] ? "rgba(34,197,94,0.3)" : "var(--border)"; }}
                            />
                            <button
                              disabled={!apiKey || embKeySaving === prov.id}
                              onClick={() => handleEmbSaveKey(prov.id)}
                              className="shrink-0 rounded-[6px] px-3 py-1.5 font-mono t-tiny transition"
                              style={{
                                background: config?.embeddingKeys?.[prov.id] ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)",
                                border: `1px solid ${config?.embeddingKeys?.[prov.id] ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)"}`,
                                color: config?.embeddingKeys?.[prov.id] ? "#22c55e" : "var(--accent)",
                                opacity: !apiKey || embKeySaving === prov.id ? 0.5 : 1,
                              }}
                            >
                              {embKeySaving === prov.id ? "Saving..." : config?.embeddingKeys?.[prov.id] ? "Saved" : "Save"}
                            </button>
                          </div>
                        </div>

                        <div className="px-4 py-3 space-y-1.5">
                          <span className="font-mono t-micro" style={{ color: "var(--text-faint)" }}>models</span>
                          {prov.models.map((m) => {
                            const isModelActive = activeEmbProvider === prov.id && activeEmbModelId === m.id;
                            const typeTags = getEmbTypeTags(prov.id, m.id);
                            const pickerKey = `${prov.id}:${m.id}`;
                            const isLoading = embLoadingModels.has(pickerKey);
                            const keySaved = !!config?.embeddingKeys?.[prov.id];
                            return (
                              <div
                                key={m.id}
                                className="group relative rounded-[6px] px-2.5 py-2 transition cursor-pointer"
                                style={{
                                  background: typeTags.length > 0 ? "var(--surface-dim)" : isModelActive ? "rgba(34,197,94,0.08)" : "transparent",
                                  border: isModelActive ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
                                  opacity: !keySaved && !isModelActive && typeTags.length === 0 ? 0.5 : 1,
                                }}
                                onClick={() => {
                                  if (!keySaved || isLoading || embLoadingModels.size > 0) return;
                                  setEmbPickerModel(embPickerModel === pickerKey ? null : pickerKey);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  {isLoading ? (
                                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                                  ) : (
                                    <div className="w-3" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono t-small" style={{ color: typeTags.length > 0 ? "var(--accent)" : isModelActive ? "#22c55e" : "var(--text)" }}>
                                        {m.name}
                                      </span>
                                      {isModelActive && typeTags.length === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#22c55e" }} />}
                                      {typeTags.map((t) => {
                                        const cfg = EMB_TYPES.find((c) => c.key === t)!;
                                        return (
                                          <span
                                            key={t}
                                            className="rounded-full px-1.5 py-0 t-micro font-mono shrink-0"
                                            style={{ background: `${cfg.color}22`, color: cfg.color }}
                                          >
                                            {cfg.label.toLowerCase()}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    <p className="t-micro" style={{ color: "var(--text-faint)" }}>
                                      {m.dims}d{m.size && ` · ${m.size}`} · {m.desc}
                                    </p>
                                  </div>
                                  {isLoading && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleEmbCancel(prov.id, m.id); }}
                                        className="rounded-full p-0.5 transition hover:bg-[rgba(239,68,68,0.1)]"
                                        title="Cancel"
                                        style={{ color: "#ef4444" }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                  {!isLoading && typeTags.length > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDisconnect("embedding");
                                      }}
                                      className="rounded-full px-2 py-0.5 t-micro font-mono transition shrink-0"
                                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                                    >
                                      stop
                                    </button>
                                  )}
                                  {!isLoading && !isModelActive && keySaved && typeTags.length === 0 && (
                                    <span
                                      className="t-micro font-mono shrink-0"
                                      style={{ color: "var(--text-faint)" }}
                                    >
                                      connect
                                    </span>
                                  )}
                                </div>
                                {isLoading && (
                                  <div
                                    className="mt-1.5 h-1 rounded-full overflow-hidden"
                                    style={{ background: "rgba(59,130,246,0.12)" }}
                                  >
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: "60%",
                                        background: "var(--accent)",
                                        animation: "indeterminate 1.5s ease-in-out infinite",
                                      }}
                                    />
                                  </div>
                                )}
                                {embPickerModel === pickerKey && (
                                  <EmbTypePicker
                                    onSelect={(t) => handleEmbTypeSelect(prov.id, m.id, m.dims, prov.baseUrl, apiKey, t)}
                                    onClose={() => setEmbPickerModel(null)}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {embResult && !embResult.ok && embResult.provider === prov.id && (
                          <div className="px-4 pb-3">
                            <div
                              className="flex items-start gap-1.5 t-tiny font-mono rounded-[6px] px-2.5 py-2"
                              style={{ color: "#ef4444", background: "rgba(239,68,68,0.06)" }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1" style={{ background: "#ef4444" }} />
                              <span className="break-words min-w-0">
                                {(embResult.error || "failed").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim().slice(0, 200)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Retrieval Tuning ── */}
        <button
          onClick={() => setTuningOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
          style={{ color: "var(--text-muted)" }}
        >
          <Sliders
            className="h-3.5 w-3.5"
            style={{ color: "var(--accent)" }}
          />
          <span className="flex-1">Retrieval Tuning</span>
          {(() => {
            const d = DEFAULT_RETRIEVAL_SETTINGS;
            const isDefault =
              s.recallLimit === d.recallLimit &&
              s.minImportance === d.minImportance &&
              s.minDecay === d.minDecay &&
              s.enabledTypes.length === d.enabledTypes.length &&
              s.clinamenLimit === d.clinamenLimit &&
              s.clinamenMinImportance === d.clinamenMinImportance &&
              s.clinamenMaxRelevance === d.clinamenMaxRelevance;
            return !isDefault ? (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            ) : null;
          })()}
          {tuningOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {tuningOpen && (
          <div className="space-y-5 px-1 pb-2 animate-fade-slide-up">
            {/* Recall section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="label">Recall Filters</h4>
                <button
                  onClick={() =>
                    updateRetrievalSettings({
                      ...DEFAULT_RETRIEVAL_SETTINGS,
                    })
                  }
                  className="t-tiny transition"
                  style={{ color: "var(--accent)" }}
                >
                  Reset
                </button>
              </div>
              <NeuroSlider
                label="Recall Limit"
                value={s.recallLimit}
                min={1}
                max={20}
                step={1}
                onChange={(v) => updateRetrievalSettings({ recallLimit: v })}
              />
              <NeuroSlider
                label="Min Importance"
                value={s.minImportance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  updateRetrievalSettings({ minImportance: v })
                }
                formatValue={(v) => v.toFixed(2)}
              />
              <NeuroSlider
                label="Min Decay Factor"
                value={s.minDecay}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateRetrievalSettings({ minDecay: v })}
                formatValue={(v) => v.toFixed(2)}
              />
              <TypeFilterToggles
                enabled={s.enabledTypes}
                onChange={(types) =>
                  updateRetrievalSettings({ enabledTypes: types })
                }
              />
            </div>

            {/* Clinamen section */}
            <div className="space-y-3">
              <h4 className="label">Clinamen (Divergent Recall)</h4>
              <p
                className="t-tiny leading-relaxed"
                style={{ color: "var(--text-faint)" }}
              >
                Surfaces high-importance memories with low relevance to the
                current context — for creative synthesis.
              </p>
              <NeuroSlider
                label="Clinamen Limit"
                value={s.clinamenLimit}
                min={1}
                max={10}
                step={1}
                onChange={(v) =>
                  updateRetrievalSettings({ clinamenLimit: v })
                }
              />
              <NeuroSlider
                label="Min Importance"
                value={s.clinamenMinImportance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  updateRetrievalSettings({ clinamenMinImportance: v })
                }
                formatValue={(v) => v.toFixed(2)}
              />
              <NeuroSlider
                label="Max Relevance"
                value={s.clinamenMaxRelevance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  updateRetrievalSettings({ clinamenMaxRelevance: v })
                }
                formatValue={(v) => v.toFixed(2)}
              />
            </div>
          </div>
        )}

        {/* ── Schedules ── */}
        <button
          onClick={() => setSchedulesOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left t-btn transition"
          style={{ color: "var(--text-muted)" }}
        >
          <Moon className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <span className="flex-1">Schedules</span>
          {(s.dreamScheduleEnabled || s.reflectionScheduleEnabled) && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "#22c55e" }}
            />
          )}
          {schedulesOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {schedulesOpen && (
          <div className="space-y-3 px-1 pb-2 animate-fade-slide-up">
            <p
              className="t-tiny leading-relaxed"
              style={{ color: "var(--text-faint)" }}
            >
              Automated background processes for memory consolidation and
              introspection.
            </p>

            {/* Dream Schedule */}
            <div
              className="rounded-[6px] overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <div
                className="flex items-center justify-between px-2.5 py-2"
                style={{ background: "var(--surface-dim)" }}
              >
                <div className="flex items-center gap-2">
                  <Moon
                    className="h-3 w-3"
                    style={{
                      color: s.dreamScheduleEnabled
                        ? "#22c55e"
                        : "var(--text-faint)",
                    }}
                  />
                  <div>
                    <span
                      className="block"
                      style={{ color: "var(--text)" }}
                    >
                      Dream Cycle
                    </span>
                    <span
                      className="block t-tiny"
                      style={{ color: "var(--text-faint)" }}
                    >
                      Consolidate, compact, reflect, resolve, emerge
                    </span>
                  </div>
                </div>
                <button
                  disabled={dreamScheduleLoading}
                  onClick={async () => {
                    setDreamScheduleLoading(true);
                    try {
                      const method = s.dreamScheduleEnabled
                        ? "DELETE"
                        : "POST";
                      await fetch("/api/dream/schedule", { method });
                      updateRetrievalSettings({
                        dreamScheduleEnabled: !s.dreamScheduleEnabled,
                      });
                    } finally {
                      setDreamScheduleLoading(false);
                    }
                  }}
                  className="rounded-full px-2.5 py-1 t-tiny transition"
                  style={{
                    background: s.dreamScheduleEnabled
                      ? "rgba(34,197,94,0.15)"
                      : "var(--surface)",
                    color: s.dreamScheduleEnabled
                      ? "#22c55e"
                      : "var(--text-faint)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {dreamScheduleLoading
                    ? "..."
                    : s.dreamScheduleEnabled
                      ? "Active"
                      : "Off"}
                </button>
              </div>
              <div
                className="px-2.5 py-2 space-y-1.5"
                style={{
                  background: "var(--surface-dimmer, var(--surface))",
                }}
              >
                <h4 className="label" style={{ fontSize: "8px" }}>
                  Schedule Parameters
                </h4>
                {[
                  { label: "Cron", value: "Every 6 hours", mono: true },
                  { label: "Initial delay", value: "2 min after start" },
                  { label: "Cycle timeout", value: "10 min max" },
                  {
                    label: "Decay schedule",
                    value: "Daily 3:00 AM UTC",
                    mono: true,
                  },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="t-tiny"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className={`t-tiny ${p.mono ? "font-mono" : ""}`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4 className="label pt-1" style={{ fontSize: "8px" }}>
                  Event-Driven Triggers
                </h4>
                {[
                  {
                    label: "Importance threshold",
                    value: "2.0 cumulative",
                  },
                  {
                    label: "Min interval",
                    value: "30 min between reflections",
                  },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="t-tiny"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className="t-tiny"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4 className="label pt-1" style={{ fontSize: "8px" }}>
                  Decay Rates (per 24h)
                </h4>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {[
                    { type: "Episodic", rate: "0.93" },
                    { type: "Semantic", rate: "0.98" },
                    { type: "Procedural", rate: "0.97" },
                    { type: "Self Model", rate: "0.99" },
                    { type: "Introspective", rate: "0.98" },
                  ].map((d) => (
                    <div
                      key={d.type}
                      className="flex items-center justify-between"
                    >
                      <span
                        className="t-tiny"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {d.type}
                      </span>
                      <span
                        className="t-tiny font-mono"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {d.rate}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reflection Schedule */}
            <div
              className="rounded-[6px] overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <div
                className="flex items-center justify-between px-2.5 py-2"
                style={{ background: "var(--surface-dim)" }}
              >
                <div className="flex items-center gap-2">
                  <Brain
                    className="h-3 w-3"
                    style={{
                      color: s.reflectionScheduleEnabled
                        ? "#22c55e"
                        : "var(--text-faint)",
                    }}
                  />
                  <div>
                    <span
                      className="block"
                      style={{ color: "var(--text)" }}
                    >
                      Active Reflection
                    </span>
                    <span
                      className="block t-tiny"
                      style={{ color: "var(--text-faint)" }}
                    >
                      Journaling, introspection, self-model
                    </span>
                  </div>
                </div>
                <button
                  disabled={reflectionScheduleLoading}
                  onClick={async () => {
                    setReflectionScheduleLoading(true);
                    try {
                      const action = s.reflectionScheduleEnabled
                        ? "stop"
                        : "start";
                      await fetch("/api/reflect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ schedule: action }),
                      });
                      updateRetrievalSettings({
                        reflectionScheduleEnabled:
                          !s.reflectionScheduleEnabled,
                      });
                    } finally {
                      setReflectionScheduleLoading(false);
                    }
                  }}
                  className="rounded-full px-2.5 py-1 t-tiny transition"
                  style={{
                    background: s.reflectionScheduleEnabled
                      ? "rgba(34,197,94,0.15)"
                      : "var(--surface)",
                    color: s.reflectionScheduleEnabled
                      ? "#22c55e"
                      : "var(--text-faint)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {reflectionScheduleLoading
                    ? "..."
                    : s.reflectionScheduleEnabled
                      ? "Active"
                      : "Off"}
                </button>
              </div>
              <div
                className="px-2.5 py-2 space-y-1.5"
                style={{
                  background: "var(--surface-dimmer, var(--surface))",
                }}
              >
                <h4 className="label" style={{ fontSize: "8px" }}>
                  Schedule Parameters
                </h4>
                {[
                  { label: "Interval", value: "Every 3 hours" },
                  {
                    label: "Cron",
                    value: "At :30 past 1,4,7,10,13,16,19,22h UTC",
                    mono: true,
                  },
                  { label: "Initial delay", value: "30 min after start" },
                  { label: "Session timeout", value: "8 min max" },
                  { label: "Quiet hours", value: "23:00 - 08:00 UTC" },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="t-tiny"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className={`t-tiny ${p.mono ? "font-mono" : ""}`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4 className="label pt-1" style={{ fontSize: "8px" }}>
                  Reflection Constraints
                </h4>
                {[
                  { label: "Min memories", value: "5 required" },
                  { label: "Max journal tokens", value: "1,500" },
                  { label: "Seed limit", value: "15 unique memories" },
                  { label: "Importance", value: "0.8 (stored)" },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="t-tiny"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      className="t-tiny"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.value}
                    </span>
                  </div>
                ))}
                <h4 className="label pt-1" style={{ fontSize: "8px" }}>
                  Seed Selection
                </h4>
                <div className="space-y-0.5">
                  {[
                    "Recent episodic (last 6h, up to 10)",
                    "High-importance (last 48h, >= 0.7)",
                    "Clinamen (high-importance, low-relevance)",
                    "Random older (up to 30 days fallback)",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className="h-0.5 w-0.5 shrink-0 rounded-full"
                        style={{ background: "var(--text-faint)" }}
                      />
                      <span
                        className="t-micro"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Wallet ── */}
        {config?.ownerWallet && (
          <div className="px-1 pt-2">
            <h4 className="label mb-1">Owner Wallet</h4>
            <div
              className="rounded-[6px] px-2.5 py-1.5 font-mono t-tiny truncate"
              style={{
                background: "var(--surface-dim)",
                color: "var(--text-faint)",
              }}
            >
              {config.ownerWallet}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
