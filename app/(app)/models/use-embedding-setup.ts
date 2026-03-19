"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  EMB_LOCAL,
  EMB_HOSTED,
  EMB_TYPES,
} from "./_types";
import type { EmbType, EmbeddingConfig } from "./_types";

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
  embeddingOpen: boolean;
  setEmbeddingOpen: (v: boolean | ((p: boolean) => boolean)) => void;
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
  embPickerModel: string | null;
  setEmbPickerModel: (v: string | null) => void;
  slotHealth: Record<EmbType, SlotHealth | null>;
  activeEmbProvider: string | null;
  activeEmbModelId: string | null;
  resolveProvider: (baseUrl: string | null) => string | null;
  refreshEmbeddingConfig: () => Promise<void>;
  refreshEmbeddingStatus: () => Promise<void>;
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
  handleEmbTypeSelect: (
    providerId: string,
    modelId: string,
    dims: number,
    baseUrl: string,
    apiKey: string,
    embType: EmbType,
  ) => Promise<void>;
}

// ── Hook ───────────────────────────────────────────────────────

export function useEmbeddingSetup(): EmbeddingSetupState {
  // ── State ──
  const [embConfig, setEmbConfig] = useState<EmbeddingConfig | null>(null);
  const [embeddingOpen, setEmbeddingOpen] = useState(true);
  const [embOpenProviders, setEmbOpenProviders] = useState<Set<string>>(new Set());
  const [embApiKeys, setEmbApiKeys] = useState<Record<string, string>>({});
  const [embKeySaving, setEmbKeySaving] = useState<string | null>(null);
  const [embModel, setEmbModel] = useState("sentence-transformers/all-MiniLM-L6-v2");
  const [embPort, setEmbPort] = useState("11435");
  const [embRunning, setEmbRunning] = useState(false);
  const [embDims, setEmbDims] = useState<number | null>(null);
  const [embLoadingModels, setEmbLoadingModels] = useState<Set<string>>(new Set());
  const [embLoadingProgress, setEmbLoadingProgress] = useState<Record<string, EmbLoadingProgress>>({});
  const embAbortRef = useRef<Record<string, AbortController>>({});
  const [embTesting, setEmbTesting] = useState(false);
  const [embSaving, setEmbSaving] = useState(false);
  const [embResult, setEmbResult] = useState<EmbResult | null>(null);
  const [embTypeAssignments, setEmbTypeAssignments] = useState<
    Record<EmbType, { provider: string; model: string } | null>
  >({ test: null, publish: null });
  const [embPickerModel, setEmbPickerModel] = useState<string | null>(null);
  const [slotHealth, setSlotHealth] = useState<
    Record<EmbType, SlotHealth | null>
  >({ test: null, publish: null });

  // ── Helpers ──

  const resolveProvider = (baseUrl: string | null): string | null => {
    if (!baseUrl) return null;
    if (baseUrl.includes(":11435")) return "mlx";
    if (baseUrl.includes(":11434")) return "ollama";
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
    if (url.includes(":11434")) return "ollama";
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

  const handleEmbTypeSelect = async (providerId: string, modelId: string, dims: number, baseUrl: string, apiKey: string, embType: EmbType) => {
    setEmbPickerModel(null);
    await handleEmbeddingUse(providerId, modelId, dims, baseUrl, apiKey, embType);
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
    embeddingOpen,
    setEmbeddingOpen,
    embOpenProviders,
    embApiKeys,
    setEmbApiKeys,
    embModel,
    embPort,
    embRunning,
    embDims,
    embLoadingModels,
    embLoadingProgress,
    embTesting,
    embSaving,
    embResult,
    embTypeAssignments,
    embPickerModel,
    setEmbPickerModel,
    slotHealth,
    activeEmbProvider,
    activeEmbModelId,
    resolveProvider,
    refreshEmbeddingConfig,
    refreshEmbeddingStatus,
    handleEmbeddingStop,
    handleEmbeddingTest,
    handleEmbeddingSave,
    toggleEmbProvider,
    handleEmbeddingUse,
    handleEmbDisconnect,
    handleEmbCancel,
    handleEmbSaveKey,
    getEmbTypeTags,
    handleEmbTypeSelect,
  };
}
