"use client";

import { useEffect, useState, useCallback } from "react";
import type { CogFunc, Assignment } from "@/lib/active-model-store";
import { useServerControl } from "@/lib/hooks/use-server-control";
import { useModelInstall } from "@/lib/hooks/use-model-install";
import { ProviderSection } from "./_provider-section";
import { COG_FUNCS, LOCAL_PROVIDERS, HOSTED_PROVIDERS } from "./_types";
import { usePlatform } from "@/lib/hooks/use-platform";

export function InferenceSection() {
  // ── Inference state ──
  const [installedByProvider, setInstalledByProvider] = useState<Record<string, string[]>>({});
  const [runningByProvider, setRunningByProvider] = useState<Record<string, boolean>>({});
  const [binaryInstalledByProvider, setBinaryInstalledByProvider] = useState<Record<string, boolean>>({});
  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<CogFunc, Assignment | null>>({ chat: null, dream: null, reflect: null });
  const [modelsLoading, setModelsLoading] = useState<Set<string>>(new Set());
  const [modelError, setModelError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [inferenceOpen, setInferenceOpen] = useState(true);
  const [hostedConnected, setHostedConnected] = useState<Record<string, boolean>>({});

  // ── Platform filtering ──
  const { capabilities } = usePlatform();
  const localProviders = capabilities
    ? (capabilities.isMobile ? [] : LOCAL_PROVIDERS.filter((p) => !p.guard || p.guard(capabilities)))
    : LOCAL_PROVIDERS;
  const hostedProviders = capabilities
    ? HOSTED_PROVIDERS.filter((p) => !p.guard || p.guard(capabilities))
    : HOSTED_PROVIDERS;

  // ── Shared hooks ──

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

  // ── Handlers using shared hooks ──

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
    active:  { color: "var(--success)", label: "Model status: active" },
    partial: { color: "var(--warning)", label: `Model status: partial (${assignedCount}/3)` },
    inactive: { color: "var(--error)", label: "Model status: inactive" },
  }[statusLevel];

  return (
    <>
      {/* Status — inference assignments */}
      <div className="mt-6">
        <div className="flex items-center gap-1.5">
          <span
            className="h-[5px] w-[5px] rounded-full shrink-0"
            style={{ background: backendOnline === null ? "var(--text-faint)" : statusConfig.color }}
          />
          <span className="font-mono" style={{ color: backendOnline === null ? "var(--text-faint)" : statusConfig.color, fontSize: 11, fontWeight: 400 }}>
            {backendOnline === null ? "checking..." : statusConfig.label}
          </span>
        </div>
        <div className="mt-2 space-y-0.5">
          {COG_FUNCS.map(({ key, label, color }) => {
            const assign = assignments[key];
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="font-mono" style={{ color, fontSize: 9, fontWeight: 400, width: 44 }}>
                  {label.toLowerCase()}
                </span>
                <span className="font-mono truncate" style={{ color: assign?.model ? "var(--text)" : "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                  {assign?.model || "unassigned"}
                </span>
                {assign?.provider && assign.provider !== "unknown" && (
                  <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                    ︱{assign.provider}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {combinedError && (
        <p className="mt-3 font-mono" style={{ color: "var(--error)", fontSize: 11, fontWeight: 400 }}>{combinedError}</p>
      )}

      {/* Inference section */}
      <div className="mt-8">
        <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0 8px" }} />
        <button
          onClick={() => setInferenceOpen(v => !v)}
          className="flex w-full items-center gap-1.5 mb-3 text-left transition active:scale-[0.99]"
        >
          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 11, fontWeight: 400 }}>
            {inferenceOpen ? "−" : "+"} inference︱
          </span>
          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
            chat, dream, reflect
          </span>
        </button>
        {inferenceOpen && (
          <div className="space-y-6 animate-fade-slide-up">
            {/* Local */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Local</span>
              </div>
              {localProviders.map(prov => (
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
                  downloadProgress={installs.downloadPercent}
                  startingProvider={servers.starting === prov.id}
                  stoppingProvider={servers.stopping === prov.id}
                  onSwitch={(m, fn) => handleSwitchModel(m, prov.id, fn)}
                  onInstall={m => handleInstallModel(m, prov.id)}
                  onCancelInstall={handleCancelInstall}
                  onUninstall={m => handleUninstallModel(m, prov.id)}
                  onStartProvider={() => handleStartProvider(prov.id)}
                  onStopProvider={() => handleStopProvider(prov.id)}
                  hostedConnected={false}
                />
              ))}
            </div>

            {/* Hosted */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hosted</span>
              </div>
              {hostedProviders.map(prov => (
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
                  downloadProgress={installs.downloadPercent}
                  startingProvider={false}
                  stoppingProvider={false}
                  onSwitch={(m, fn) => handleSwitchModel(m, prov.id, fn)}
                  onInstall={m => handleInstallModel(m, prov.id)}
                  onCancelInstall={handleCancelInstall}
                  onUninstall={m => handleUninstallModel(m, prov.id)}
                  onStartProvider={() => {}}
                  onStopProvider={() => {}}
                  hostedConnected={hostedConnected[prov.id] ?? false}
                  onConnect={config => handleConnectProvider(prov.id, config)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
