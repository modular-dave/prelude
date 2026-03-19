"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, ChevronDown, ChevronRight, ExternalLink, X } from "lucide-react";
import { EmbTypePicker } from "./_shared-components";
import {
  EMB_LOCAL,
  EMB_HOSTED,
  EMB_TYPES,
} from "./_types";
import type { EmbType, EmbeddingConfig } from "./_types";

export function EmbeddingSection() {
  // ── Embedding state ──
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
  const [embLoadingProgress, setEmbLoadingProgress] = useState<Record<string, { elapsed: number; phase: string }>>({});
  const embAbortRef = useRef<Record<string, AbortController>>({});
  const [embTesting, setEmbTesting] = useState(false);
  const [embSaving, setEmbSaving] = useState(false);
  const [embResult, setEmbResult] = useState<{
    ok: boolean;
    error?: string;
    provider?: string;
  } | null>(null);
  const [embTypeAssignments, setEmbTypeAssignments] = useState<
    Record<EmbType, { provider: string; model: string } | null>
  >({ test: null, publish: null });
  const [embPickerModel, setEmbPickerModel] = useState<string | null>(null);
  const [slotHealth, setSlotHealth] = useState<
    Record<EmbType, { ok: boolean; dims?: number; latencyMs?: number } | null>
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
    } catch {}
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

  const refreshSlotHealth = useCallback(async (cfg: EmbeddingConfig | null) => {
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
      await refreshEmbeddingConfig();
    } catch {}
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
      await refreshEmbeddingConfig();
    } catch {}
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

  return (
    <>
      {/* Status card — embedding assignments */}
      <div
        className="mt-3 rounded-[8px] px-4 py-3"
        style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
      >
        <span className="font-mono mt-1 mb-1 block" style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Embedding</span>
        <div className="grid grid-cols-2 gap-2">
          {EMB_TYPES.map(({ key, label, color }) => {
            const slot = embConfig?.embeddingSlots?.[key];
            const health = slotHealth[key];
            const provId = slot ? resolveProvider(slot.baseUrl) : null;
            const modelName = slot?.model?.split("/").pop() || null;
            return (
              <div
                key={`emb-${key}`}
                className="rounded-[6px] px-2.5 py-1.5"
                style={{ background: "var(--surface)", borderLeft: `2px solid ${color}` }}
              >
                <span className="block font-mono" style={{ color, fontSize: 9, fontWeight: 400 }}>
                  {label.toLowerCase()}
                </span>
                <span className="block font-mono truncate mt-0.5" style={{ color: modelName ? "var(--accent)" : "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                  {modelName || "unassigned"}
                </span>
                {provId && (
                  <span className="block font-mono truncate" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                    via {provId}{health?.ok ? ` · ${health.dims ?? "?"}d` : health === null ? "" : " · offline"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Embedding section */}
      <div className="mt-8 mb-12">
        <button
          onClick={() => setEmbeddingOpen((v) => !v)}
          className="flex w-full items-center gap-2 mb-3 text-left"
        >
          <span className="font-mono flex-1" style={{ color: "var(--text)", fontSize: 13, fontWeight: 500 }}>Embedding</span>
          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
            Semantic search & memory
          </span>
          {embeddingOpen ? (
            <ChevronDown className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
          ) : (
            <ChevronRight className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
          )}
        </button>
        {embeddingOpen && (
          <div className="space-y-3 animate-fade-slide-up">
            {/* Local */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Local</span>
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
                          <span className="font-mono" style={{ color: isActiveProvider ? "var(--accent)" : "var(--text)", fontSize: 13, fontWeight: 500 }}>
                            {prov.name}
                          </span>
                          {(() => {
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
                                <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--success)" }}>
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                                  {isMlx ? "running" : "active"}
                                </span>
                              );
                            }
                            if (isChecking) {
                              return (
                                <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--text-faint)" }} />
                                  checking...
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--text-faint)" }} />
                                inactive
                              </span>
                            );
                          })()}
                          {EMB_TYPES.filter((t) => embTypeAssignments[t.key]?.provider === prov.id && slotHealth[t.key]?.ok).map((t) => (
                            <span
                              key={t.key}
                              className="font-mono"
                              style={{ color: t.color, fontSize: 9, fontWeight: 400 }}
                            >
                              {t.label.toLowerCase()}
                            </span>
                          ))}
                        </div>
                        <p className="font-mono mt-0.5" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>{prov.desc}</p>
                      </div>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--text-faint)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}
                      />
                    </button>

                    {isOpen && (
                      <div className="animate-fade-slide-up" style={{ borderTop: "1px solid var(--border)" }}>
                        <div className="px-4 py-3 space-y-1.5">
                          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>models</span>
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
                                  background: typeTags.length > 0 ? "var(--surface-dim)" : isModelActive ? "color-mix(in srgb, var(--success) 8%, transparent)" : "transparent",
                                  border: isModelActive ? "1px solid color-mix(in srgb, var(--success) 30%, transparent)" : "1px solid transparent",
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
                                      <span className="font-mono" style={{ color: typeTags.length > 0 ? "var(--accent)" : isModelActive ? "var(--success)" : "var(--text)", fontSize: 11, fontWeight: 400 }}>
                                        {m.name}
                                      </span>
                                      {isModelActive && typeTags.length === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />}
                                      {typeTags.map((t) => {
                                        const cfg = EMB_TYPES.find((c) => c.key === t)!;
                                        return (
                                          <span
                                            key={t}
                                            className="font-mono shrink-0"
                                            style={{ color: cfg.color, fontSize: 9, fontWeight: 400 }}
                                          >
                                            {cfg.label.toLowerCase()}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    <p className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                                      {m.dims}d{m.size && ` · ${m.size}`} · {m.desc}
                                    </p>
                                  </div>
                                  {isLoading && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      {embLoadingProgress[pickerKey] && (
                                        <span className="font-mono tabular-nums" style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}>
                                          {embLoadingProgress[pickerKey].elapsed}s
                                        </span>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleEmbCancel(prov.id, m.id); }}
                                        className="rounded-full p-0.5 transition"
                                        title="Cancel"
                                        style={{ color: "var(--error)" }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                  {!isLoading && typeTags.length > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEmbDisconnect();
                                      }}
                                      className="font-mono transition shrink-0"
                                      style={{ color: "var(--error)", fontSize: 9, fontWeight: 400 }}
                                    >
                                      stop
                                    </button>
                                  )}
                                  {!isLoading && !isModelActive && typeTags.length === 0 && (
                                    <span
                                      className="font-mono shrink-0"
                                      style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}
                                    >
                                      {isMlx ? "start" : "connect"}
                                    </span>
                                  )}
                                </div>
                                {isLoading && (
                                  <div
                                    className="mt-1.5 h-1 rounded-full overflow-hidden"
                                    style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
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
                              className="flex items-start gap-1.5 font-mono rounded-[6px] px-2.5 py-2"
                              style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 6%, transparent)", fontSize: 9, fontWeight: 400 }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1" style={{ background: "var(--error)" }} />
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
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hosted</span>
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
                          <span className="font-mono" style={{ color: isActiveProvider ? "var(--accent)" : "var(--text)", fontSize: 13, fontWeight: 500 }}>
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
                                <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--success)" }}>
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                                  active
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--text-faint)" }} />
                                inactive
                              </span>
                            );
                          })()}
                          {EMB_TYPES.filter((t) => embTypeAssignments[t.key]?.provider === prov.id && slotHealth[t.key]?.ok).map((t) => (
                            <span
                              key={t.key}
                              className="font-mono"
                              style={{ color: t.color, fontSize: 9, fontWeight: 400 }}
                            >
                              {t.label.toLowerCase()}
                            </span>
                          ))}
                        </div>
                        <p className="font-mono mt-0.5" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>{prov.desc}</p>
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
                            <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>API Key</span>
                            {prov.url && (
                              <a
                                href={prov.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono inline-flex items-center gap-1 transition"
                                style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}
                              >
                                Get key <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              placeholder={embConfig?.embeddingKeys?.[prov.id] ? "••••••••  (saved)" : `${prov.id}-api-key...`}
                              value={apiKey}
                              onChange={(e) => setEmbApiKeys((k) => ({ ...k, [prov.id]: e.target.value }))}
                              className="flex-1 font-mono rounded-[6px] px-3 py-1.5 outline-none transition"
                              style={{
                                background: "var(--surface-dimmer, var(--surface))",
                                border: `1px solid ${embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 30%, transparent)" : "var(--border)"}`,
                                color: "var(--text)",
                                fontSize: 9,
                                fontWeight: 400,
                              }}
                              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                              onBlur={(e) => { e.target.style.borderColor = embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 30%, transparent)" : "var(--border)"; }}
                            />
                            <button
                              disabled={!apiKey || embKeySaving === prov.id}
                              onClick={() => handleEmbSaveKey(prov.id)}
                              className="shrink-0 rounded-[6px] px-3 py-1.5 font-mono transition"
                              style={{
                                background: embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 8%, transparent)" : "color-mix(in srgb, var(--accent) 8%, transparent)",
                                border: `1px solid ${embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 20%, transparent)" : "color-mix(in srgb, var(--accent) 20%, transparent)"}`,
                                color: embConfig?.embeddingKeys?.[prov.id] ? "var(--success)" : "var(--accent)",
                                opacity: !apiKey || embKeySaving === prov.id ? 0.5 : 1,
                                fontSize: 9,
                                fontWeight: 400,
                              }}
                            >
                              {embKeySaving === prov.id ? "Saving..." : embConfig?.embeddingKeys?.[prov.id] ? "Saved" : "Save"}
                            </button>
                          </div>
                        </div>

                        <div className="px-4 py-3 space-y-1.5">
                          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>models</span>
                          {prov.models.map((m) => {
                            const isModelActive = activeEmbProvider === prov.id && activeEmbModelId === m.id;
                            const typeTags = getEmbTypeTags(prov.id, m.id);
                            const pickerKey = `${prov.id}:${m.id}`;
                            const isLoading = embLoadingModels.has(pickerKey);
                            const keySaved = !!embConfig?.embeddingKeys?.[prov.id];
                            return (
                              <div
                                key={m.id}
                                className="group relative rounded-[6px] px-2.5 py-2 transition cursor-pointer"
                                style={{
                                  background: typeTags.length > 0 ? "var(--surface-dim)" : isModelActive ? "color-mix(in srgb, var(--success) 8%, transparent)" : "transparent",
                                  border: isModelActive ? "1px solid color-mix(in srgb, var(--success) 30%, transparent)" : "1px solid transparent",
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
                                      <span className="font-mono" style={{ color: typeTags.length > 0 ? "var(--accent)" : isModelActive ? "var(--success)" : "var(--text)", fontSize: 11, fontWeight: 400 }}>
                                        {m.name}
                                      </span>
                                      {isModelActive && typeTags.length === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />}
                                      {typeTags.map((t) => {
                                        const cfg = EMB_TYPES.find((c) => c.key === t)!;
                                        return (
                                          <span
                                            key={t}
                                            className="font-mono shrink-0"
                                            style={{ color: cfg.color, fontSize: 9, fontWeight: 400 }}
                                          >
                                            {cfg.label.toLowerCase()}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    <p className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                                      {m.dims}d{m.size && ` · ${m.size}`} · {m.desc}
                                    </p>
                                  </div>
                                  {isLoading && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleEmbCancel(prov.id, m.id); }}
                                        className="rounded-full p-0.5 transition"
                                        title="Cancel"
                                        style={{ color: "var(--error)" }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                  {!isLoading && typeTags.length > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEmbDisconnect();
                                      }}
                                      className="font-mono transition shrink-0"
                                      style={{ color: "var(--error)", fontSize: 9, fontWeight: 400 }}
                                    >
                                      stop
                                    </button>
                                  )}
                                  {!isLoading && !isModelActive && keySaved && typeTags.length === 0 && (
                                    <span
                                      className="font-mono shrink-0"
                                      style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}
                                    >
                                      connect
                                    </span>
                                  )}
                                </div>
                                {isLoading && (
                                  <div
                                    className="mt-1.5 h-1 rounded-full overflow-hidden"
                                    style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
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
                              className="flex items-start gap-1.5 font-mono rounded-[6px] px-2.5 py-2"
                              style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 6%, transparent)", fontSize: 9, fontWeight: 400 }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1" style={{ background: "var(--error)" }} />
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
      </div>
    </>
  );
}
