"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  EMB_LOCAL,
  EMB_HOSTED,
  EMB_TYPES,
} from "@/lib/model-types";
import { PORTS } from "@/lib/provider-registry";
import type { EmbType, EmbeddingConfig } from "@/lib/model-types";

// ── Types ──────────────────────────────────────────────────────

export interface EmbResult {
  ok: boolean;
  error?: string;
  provider?: string;
}

export interface SlotHealth {
  ok: boolean;
  dims?: number;
  latencyMs?: number;
}

export interface EmbLoadingProgress {
  elapsed: number;
  phase: string;
}

export interface EmbeddingSetupState {
  embConfig: EmbeddingConfig | null;
  embOpenProviders: Set<string>;
  embApiKeys: Record<string, string>;
  setEmbApiKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  embModel: string;
  embPort: string;
  embRunning: boolean;
  embDims: number | null;
  embLoadingModels: Set<string>;
  embLoadingProgress: Record<string, EmbLoadingProgress>;
  embTesting: boolean;
  embSaving: boolean;
  embResult: EmbResult | null;
  embTypeAssignments: Record<EmbType, { provider: string; model: string } | null>;
  handleEmbeddingSwitch: (providerId: string, modelId: string) => Promise<void>;
  slotHealth: Record<EmbType, SlotHealth | null>;
  activeEmbProvider: string | null;
  activeEmbModelId: string | null;
  resolveProvider: (baseUrl: string | null) => string | null;
  embStarting: boolean;
  embStopping: boolean;
  refreshEmbeddingConfig: () => Promise<void>;
  refreshEmbeddingStatus: () => Promise<void>;
  handleEmbeddingStart: (providerId: string) => Promise<void>;
  handleEmbeddingStop: () => Promise<void>;
  handleEmbeddingTest: () => Promise<void>;
  handleEmbeddingSave: () => Promise<void>;
  toggleEmbProvider: (id: string) => void;
  handleEmbeddingUse: (
    providerId: string,
    modelId: string,
    dims: number,
    baseUrl: string,
    apiKey: string,
    slot?: EmbType,
  ) => Promise<void>;
  handleEmbDisconnect: () => Promise<void>;
  handleEmbCancel: (providerId: string, modelId: string) => void;
  handleEmbSaveKey: (providerId: string) => Promise<void>;
  getEmbTypeTags: (providerId: string, modelId: string) => EmbType[];
  embMigrating: boolean;
  embMigrationProgress: { phase: string; done?: number; total?: number; percent?: number } | null;
}

// ── Hook ───────────────────────────────────────────────────────

export function useEmbeddingSetup(): EmbeddingSetupState {
  // ── State ──
  const [embConfig, setEmbConfig] = useState<EmbeddingConfig | null>(null);
  const [embOpenProviders, setEmbOpenProviders] = useState<Set<string>>(new Set());
  const [embApiKeys, setEmbApiKeys] = useState<Record<string, string>>({});
  const [embKeySaving, setEmbKeySaving] = useState<string | null>(null);
  const [embModel, setEmbModel] = useState("sentence-transformers/all-MiniLM-L6-v2");
  const [embPort, setEmbPort] = useState(String(PORTS.mlxEmbedding));
  const [embRunning, setEmbRunning] = useState(false);
  const [embDims, setEmbDims] = useState<number | null>(null);
  const [embStarting, setEmbStarting] = useState(false);
  const [embStopping, setEmbStopping] = useState(false);
  const [embLoadingModels, setEmbLoadingModels] = useState<Set<string>>(new Set());
  const [embLoadingProgress, setEmbLoadingProgress] = useState<Record<string, EmbLoadingProgress>>({});
  const embAbortRef = useRef<Record<string, AbortController>>({});
  const [embTesting, setEmbTesting] = useState(false);
  const [embSaving, setEmbSaving] = useState(false);
  const [embResult, setEmbResult] = useState<EmbResult | null>(null);
  const [embTypeAssignments, setEmbTypeAssignments] = useState<
    Record<EmbType, { provider: string; model: string } | null>
  >({ test: null, publish: null });
  const [slotHealth, setSlotHealth] = useState<
    Record<EmbType, SlotHealth | null>
  >({ test: null, publish: null });

  // Migration
  const [embMigrating, setEmbMigrating] = useState(false);
  const [embMigrationProgress, setEmbMigrationProgress] = useState<{ phase: string; done?: number; total?: number; percent?: number } | null>(null);

  // ── Helpers ──

  const resolveProvider = (baseUrl: string | null): string | null => {
    if (!baseUrl) return null;
    if (baseUrl.includes(`:${PORTS.mlxEmbedding}`)) return "mlx";
    if (baseUrl.includes(`:${PORTS.ollama}`)) return "ollama";
    if (baseUrl.includes("openai.com")) return "openai";
    if (baseUrl.includes("voyageai.com")) return "voyage";
    return null;
  };

  // ── Handlers ──

  const refreshEmbeddingConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      const cfg: EmbeddingConfig = {
        embedding: data.embedding || { provider: null, model: null, baseUrl: null, dimensions: null, connected: false },
        embeddingSlots: data.embeddingSlots || { test: null, publish: null },
        embeddingKeys: data.embeddingKeys || {},
      };
      setEmbConfig(cfg);
      if (data.embedding?.model) setEmbModel(data.embedding.model);
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
    } catch (e) {
      console.warn("[embedding] Failed to refresh config:", e);
    }
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
    } catch (e) {
      console.warn("[embedding] Failed to refresh status:", e);
    }
  }, [embPort]);

  const refreshSlotHealth = useCallback(async (cfg: EmbeddingConfig | null) => {
    if (!cfg?.embeddingSlots) return;
    const results: Record<EmbType, SlotHealth | null> = { test: null, publish: null };
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

  const handleEmbeddingStop = async () => {
    setEmbStopping(true);
    try {
      await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", port: parseInt(embPort) }),
      });
      setEmbRunning(false);
      setEmbDims(null);
    } catch (e) {
      console.warn("[embedding] Failed to stop server:", e);
    }
    setEmbStopping(false);
  };

  const handleEmbeddingStart = async (providerId: string) => {
    setEmbStarting(true);
    try {
      // Find the last-used model for this provider from slot config, or use default
      const slots = embConfig?.embeddingSlots;
      let modelId = embModel;
      let dims = 384;
      const allProviders = [...EMB_LOCAL, ...EMB_HOSTED];
      const prov = allProviders.find((p) => p.id === providerId);

      if (slots) {
        for (const t of ["publish", "test"] as EmbType[]) {
          const s = slots[t];
          if (s?.model && resolveProvider(s.baseUrl) === providerId) {
            modelId = s.model;
            dims = s.dimensions ?? dims;
            break;
          }
        }
      }
      // Resolve dims from model catalog if not from config
      if (prov) {
        const catalogModel = prov.models.find((m) => m.id === modelId);
        if (catalogModel) dims = catalogModel.dims;
      }

      const baseUrl = prov?.baseUrl || `http://127.0.0.1:${embPort}/v1`;
      await handleEmbeddingUse(providerId, modelId, dims, baseUrl, "local");
    } catch (e) {
      console.warn("[embedding] Failed to start server:", e);
    }
    setEmbStarting(false);
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
      await refreshEmbeddingConfig();
    } catch (e) {
      console.warn("[embedding] Failed to save config:", e);
    }
    setEmbSaving(false);
  };

  const toggleEmbProvider = (id: string) =>
    setEmbOpenProviders((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const activeEmbProvider = (() => {
    const url = embConfig?.embedding?.baseUrl || "";
    if (embRunning) return "mlx";
    if (url.includes(`:${PORTS.ollama}`)) return "ollama";
    if (url.includes("openai.com")) return "openai";
    if (url.includes("voyageai.com")) return "voyage";
    return null;
  })();

  const activeEmbModelId = embConfig?.embedding?.model || null;

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
        if (embRunning) {
          await fetch("/api/cortex/embedding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "stop", port: parseInt(embPort) }),
          });
        }
        if (controller.signal.aborted) return;
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
          setEmbRunning(true);
          if (spawnData.dimensions) dims = spawnData.dimensions;
          setEmbDims(dims);
          baseUrl = `http://127.0.0.1:${embPort}/v1`;
          apiKey = "local";
        } else {
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
      if (slot) {
        setEmbTypeAssignments((prev) => ({
          ...prev,
          [slot]: { provider: providerId, model: modelId },
        }));
      }
      setEmbResult({ ok: true, provider: providerId });

      // ── Step 5: Check if dimension migration is needed ──
      try {
        const checkRes = await fetch("/api/cortex/embedding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "migrate-check", dimensions: dims }),
        });
        const check = await checkRes.json();

        if (check.dimensionMismatch) {
          setEmbMigrating(true);
          setEmbMigrationProgress(null);

          const migrateRes = await fetch("/api/cortex/embedding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "migrate-execute",
              dimensions: dims,
              embeddingBaseUrl: baseUrl,
              embeddingModel: modelId,
              embeddingApiKey: apiKey || "local",
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
                  setEmbMigrationProgress(ev);
                } catch { /* skip */ }
              }
            }
          }
          setEmbMigrating(false);
          setEmbMigrationProgress(null);
        }
      } catch (e) {
        console.warn("[models] Embedding migration failed:", e);
        setEmbMigrating(false);
      }

      await refreshEmbeddingConfig();
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

  const handleEmbDisconnect = async () => {
    try {
      await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", port: parseInt(embPort) }),
      });
      setEmbRunning(false);
      setEmbDims(null);
      await refreshEmbeddingConfig();
    } catch (e) {
      console.warn("[embedding] Failed to disconnect:", e);
    }
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
      await refreshEmbeddingConfig();
    } catch (e) {
      console.warn("[embedding] Failed to save API key:", e);
    }
    setEmbKeySaving(null);
  };

  const getEmbTypeTags = (providerId: string, modelId: string): EmbType[] =>
    (["test", "publish"] as EmbType[]).filter(
      (t) => embTypeAssignments[t]?.provider === providerId && embTypeAssignments[t]?.model === modelId && slotHealth[t]?.ok
    );

  const handleEmbeddingSwitch = async (providerId: string, modelId: string) => {
    const allProviders = [...EMB_LOCAL, ...EMB_HOSTED];
    const prov = allProviders.find((p) => p.id === providerId);
    const catalogModel = prov?.models.find((m) => m.id === modelId);
    const dims = catalogModel?.dims ?? 384;
    const baseUrl = prov?.baseUrl || `http://127.0.0.1:${embPort}/v1`;
    const isLocal = prov?.baseUrl.includes("127.0.0.1");
    const apiKey = isLocal ? "local" : embApiKeys[providerId] || "";

    // Assign to "publish" slot first (starts server + verifies + saves)
    await handleEmbeddingUse(providerId, modelId, dims, baseUrl, apiKey, "publish");

    // Also assign to "test" slot (server already running, just save config)
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
        slot: "test",
      }),
    });
    setEmbTypeAssignments((prev) => ({
      ...prev,
      test: { provider: providerId, model: modelId },
    }));
    await refreshEmbeddingConfig();
  };

  // ── Effects ──

  useEffect(() => {
    refreshEmbeddingConfig();
    refreshEmbeddingStatus();
  }, [refreshEmbeddingConfig, refreshEmbeddingStatus]);

  useEffect(() => {
    if (embConfig) refreshSlotHealth(embConfig);
  }, [embConfig, refreshSlotHealth]);

  return {
    embConfig,
    embOpenProviders,
    embApiKeys,
    setEmbApiKeys,
    embModel,
    embPort,
    embRunning,
    embStarting,
    embStopping,
    embDims,
    embLoadingModels,
    embLoadingProgress,
    embTesting,
    embSaving,
    embResult,
    embTypeAssignments,
    handleEmbeddingSwitch,
    slotHealth,
    activeEmbProvider,
    activeEmbModelId,
    resolveProvider,
    refreshEmbeddingConfig,
    refreshEmbeddingStatus,
    handleEmbeddingStart,
    handleEmbeddingStop,
    handleEmbeddingTest,
    handleEmbeddingSave,
    toggleEmbProvider,
    handleEmbeddingUse,
    handleEmbDisconnect,
    handleEmbCancel,
    handleEmbSaveKey,
    getEmbTypeTags,
    embMigrating,
    embMigrationProgress,
  };
}
