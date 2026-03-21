"use client";

import { useEffect, useState, useCallback } from "react";
import type { CogFunc, Assignment } from "@/lib/active-model-store";
import { useServerControl } from "@/lib/hooks/use-server-control";
import { useModelInstall } from "@/lib/hooks/use-model-install";
import { COG_FUNCS, LOCAL_PROVIDERS, HOSTED_PROVIDERS } from "@/lib/model-types";
import type { ProviderDef } from "@/lib/model-types";
import { usePlatform } from "@/lib/hooks/use-platform";

// ── Types ──────────────────────────────────────────────────────

export interface InferenceSetupState {
  installedByProvider: Record<string, string[]>;
  runningByProvider: Record<string, boolean>;
  binaryInstalledByProvider: Record<string, boolean>;
  activeModel: string | null;
  assignments: Record<CogFunc, Assignment | null>;
  modelsLoading: Set<string>;
  modelError: string | null;
  backendOnline: boolean | null;
  provider: string | null;
  hostedConnected: Record<string, boolean>;
  combinedError: string | null;
  statusLevel: "active" | "partial" | "inactive";
  statusConfig: { color: string; label: string };
  localProviders: ProviderDef[];
  hostedProviders: ProviderDef[];
  servers: ReturnType<typeof useServerControl>;
  installs: ReturnType<typeof useModelInstall>;
  handleStartProvider: (providerId: string) => Promise<void>;
  handleStopProvider: (providerId: string) => Promise<void>;
  handleConnectProvider: (providerId: string, config: Record<string, string>) => Promise<void>;
  handleSwitchModel: (model: string, providerId: string, fn?: CogFunc | "all") => Promise<void>;
  handleInstallModel: (model: string, providerId: string) => Promise<void>;
  handleCancelInstall: (model: string) => void;
  handleUninstallModel: (model: string, providerId: string) => Promise<void>;
}

// ── Hook ───────────────────────────────────────────────────────

export function useInferenceSetup(): InferenceSetupState {
  // ── State ──
  const [installedByProvider, setInstalledByProvider] = useState<Record<string, string[]>>({});
  const [runningByProvider, setRunningByProvider] = useState<Record<string, boolean>>({});
  const [binaryInstalledByProvider, setBinaryInstalledByProvider] = useState<Record<string, boolean>>({});
  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<CogFunc, Assignment | null>>({ chat: null, dream: null, reflect: null });
  const [modelsLoading, setModelsLoading] = useState<Set<string>>(new Set());
  const [modelError, setModelError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [hostedConnected, setHostedConnected] = useState<Record<string, boolean>>({});

  // ── Platform filtering ──
  const { capabilities } = usePlatform();
  const localProviders = capabilities
    ? (capabilities.isMobile ? [] : LOCAL_PROVIDERS.filter((p) => !p.guard || p.guard(capabilities)))
    : LOCAL_PROVIDERS;
  const hostedProviders = capabilities
    ? HOSTED_PROVIDERS.filter((p) => !p.guard || p.guard(capabilities))
    : HOSTED_PROVIDERS;

  // ── Refresh ──

  const refreshModels = useCallback(async () => {
    try {
      const globalRes = await fetch("/api/models");
      const globalData = await globalRes.json();
      if (globalData.error) {
        setBackendOnline(false);
        return;
      }
      setBackendOnline(globalData.running);
      setActiveModelState(globalData.active || null);
      setProvider(globalData.provider || null);
      if (globalData.assignments) setAssignments(globalData.assignments);

      const [ollamaRes, mlxRes] = await Promise.all([
        fetch("/api/models?provider=ollama").then(r => r.json()).catch(() => ({ installed: [] })),
        fetch("/api/models?provider=mlx").then(r => r.json()).catch(() => ({ installed: [] })),
      ]);
      // Filter out embedding models from inference lists
      const isEmbeddingModel = (name: string) => /embed/i.test(name);
      setInstalledByProvider({
        ollama: (ollamaRes.installed || []).filter((m: string) => !isEmbeddingModel(m)),
        mlx: (mlxRes.installed || []).filter((m: string) => !isEmbeddingModel(m)),
      });
      setRunningByProvider({
        ollama: ollamaRes.running ?? false,
        mlx: mlxRes.running ?? false,
      });
      setBinaryInstalledByProvider({
        ollama: ollamaRes.binaryInstalled ?? false,
        mlx: mlxRes.binaryInstalled ?? false,
      });

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
      } catch (e) {
        console.warn("[models] Failed to fetch hosted provider status:", e);
      }
    } catch (e) {
      console.warn("[models] Failed to refresh models:", e);
      setBackendOnline(false);
    }
  }, []);

  const servers = useServerControl(refreshModels);
  const installs = useModelInstall(refreshModels);

  useEffect(() => { refreshModels(); }, [refreshModels]);

  const addLoading = (m: string) => setModelsLoading(s => new Set(s).add(m));
  const removeLoading = (m: string) => setModelsLoading(s => { const n = new Set(s); n.delete(m); return n; });

  // ── Handlers ──

  const handleStartProvider = async (providerId: string) => {
    const installed = installedByProvider[providerId] || [];
    const model = installed[0] || undefined;
    await servers.start(providerId as "mlx" | "ollama", model);
  };

  const handleStopProvider = async (providerId: string) => {
    await servers.stop(providerId as "mlx" | "ollama");
  };

  const handleConnectProvider = async (providerId: string, config: Record<string, string>) => {
    setModelError(null);
    const body: Record<string, string> = { provider: providerId };
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
    setHostedConnected(prev => ({ ...prev, [providerId]: data.connected ?? false }));
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
        if (data.assignments) setAssignments(data.assignments);
      }
      await refreshModels();
    } catch {
      setModelError("Failed to connect to backend");
    } finally {
      removeLoading(model);
    }
  };

  const handleInstallModel = async (model: string, providerId: string) => {
    addLoading(model.trim());
    await installs.install(model, providerId);
    removeLoading(model.trim());
  };

  const handleCancelInstall = (_model: string) => {
    installs.cancel();
  };

  const handleUninstallModel = async (model: string, providerId: string) => {
    addLoading(model);
    await installs.uninstall(model, providerId);
    removeLoading(model);
  };

  // ── Derived values ──
  const combinedError = modelError || servers.error || installs.error;
  const assignedCount = COG_FUNCS.filter(({ key }) => assignments[key]?.model).length;
  const statusLevel: "active" | "partial" | "inactive" =
    !backendOnline || assignedCount === 0
      ? "inactive"
      : assignedCount === 3
        ? "active"
        : "partial";
  const statusConfig = {
    active:  { color: "var(--success)", label: "active" },
    partial: { color: "var(--warning)", label: `partial (${assignedCount}/3)` },
    inactive: { color: "var(--error)", label: "inactive" },
  }[statusLevel];

  return {
    installedByProvider,
    runningByProvider,
    binaryInstalledByProvider,
    activeModel,
    assignments,
    modelsLoading,
    modelError,
    backendOnline,
    provider,
    hostedConnected,
    combinedError,
    statusLevel,
    statusConfig,
    localProviders,
    hostedProviders,
    servers,
    installs,
    handleStartProvider,
    handleStopProvider,
    handleConnectProvider,
    handleSwitchModel,
    handleInstallModel,
    handleCancelInstall,
    handleUninstallModel,
  };
}
