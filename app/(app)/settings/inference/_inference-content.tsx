"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, X, Trash2, ExternalLink } from "lucide-react";
import { Section, Divider, Slider } from "@/components/settings/settings-primitives";
import type { ProviderDef } from "@/lib/model-types";
import { useInferenceSetup } from "./use-inference-setup";
import { useEngineConfig } from "@/lib/hooks/use-engine-config";

// ── Constants ──────────────────────────────────────────────────

const ROUTING_PROVIDERS = ["venice", "anthropic", "local", "mlx", "ollama"] as const;
const COG_FUNCTIONS = ["dream", "reflect", "chat", "importance", "summary"] as const;

// ── Main Content ───────────────────────────────────────────────

export function InferenceContent() {
  const inference = useInferenceSetup();

  return (
    <>
      {/* ── Status ── */}
      <div className="flex items-center gap-2 -mt-2 mb-1">
        <span
          className="h-[6px] w-[6px] rounded-full shrink-0"
          style={{ background: inference.backendOnline === null ? "var(--text-faint)" : inference.statusConfig.color }}
        />
        <span className="t-small" style={{ color: inference.backendOnline === null ? "var(--text-faint)" : inference.statusConfig.color }}>
          {inference.backendOnline === null ? "checking..." : inference.statusConfig.label}
        </span>
        {inference.activeModel && (
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
            · {inference.activeModel}
          </span>
        )}
      </div>

      {/* ── Servers ── */}
      <Section title="servers">
        {/* Local servers */}
        {inference.localProviders.length > 0 && (
          <>
            {inference.localProviders.map((prov) => (
              <LocalServerRow
                key={prov.id}
                prov={prov}
                running={inference.runningByProvider[prov.id] ?? false}
                binaryInstalled={inference.binaryInstalledByProvider[prov.id] ?? false}
                starting={inference.servers.starting === prov.id}
                stopping={inference.servers.stopping === prov.id}
                hasModels={(inference.installedByProvider[prov.id] || []).length > 0}
                onStart={() => inference.handleStartProvider(prov.id)}
                onStop={() => inference.handleStopProvider(prov.id)}
              />
            ))}
            {inference.hostedProviders.length > 0 && (
              <div className="my-1.5" style={{ borderTop: "1px dashed var(--border)" }} />
            )}
          </>
        )}

        {/* Hosted servers */}
        {inference.hostedProviders.map((prov) => (
          <HostedServerRow
            key={prov.id}
            prov={prov}
            connected={inference.hostedConnected[prov.id] ?? false}
            onConnect={(config) => inference.handleConnectProvider(prov.id, config)}
          />
        ))}
      </Section>

      <Divider />

      {/* ── Models ── */}
      <Section title="models">
        {/* Default model indicator */}
        <div className="flex items-center gap-2 py-1 mb-1">
          <span
            className="h-[6px] w-[6px] rounded-full shrink-0"
            style={{ background: inference.activeModel ? "var(--accent)" : "var(--text-faint)" }}
          />
          <span className="t-small" style={{ color: "var(--text-faint)" }}>default</span>
          <span className="t-body truncate flex-1" style={{ color: inference.activeModel ? "var(--accent)" : "var(--text-faint)" }}>
            {inference.activeModel || "none selected"}
          </span>
          {inference.provider && inference.provider !== "unknown" && (
            <span className="t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>
              {inference.provider}
            </span>
          )}
        </div>

        {/* Local provider models */}
        {inference.localProviders
          .filter((p) => p.models.length > 0 || (inference.installedByProvider[p.id] || []).length > 0)
          .map((prov) => (
            <ProviderModelsSection key={prov.id} prov={prov} isLocal inference={inference} />
          ))}

        {/* Hosted provider models */}
        {inference.hostedProviders
          .filter((p) => p.models.length > 0)
          .map((prov) => (
            <ProviderModelsSection key={prov.id} prov={prov} isLocal={false} inference={inference} />
          ))}
      </Section>

      <Divider />

      {/* ── Routing (advanced, collapsed) ── */}
      <Section title="routing">
        <RoutingContent />
      </Section>

      <Divider />

      {/* ── Limits (collapsed) ── */}
      <Section title="limits">
        <LimitsContent />
      </Section>

      <Divider />

      {/* ── Fallback (collapsed) ── */}
      <Section title="fallback">
        <FallbackContent />
      </Section>

      {/* Error */}
      {inference.combinedError && (
        <p className="mt-2 t-tiny" style={{ color: "var(--error)" }}>{inference.combinedError}</p>
      )}
    </>
  );
}

// ── Local Server Row ─────────────────────────────────────────────

function LocalServerRow({
  prov, running, binaryInstalled, starting, stopping, hasModels, onStart, onStop,
}: {
  prov: ProviderDef; running: boolean; binaryInstalled: boolean;
  starting: boolean; stopping: boolean; hasModels: boolean;
  onStart: () => void; onStop: () => void;
}) {
  const statusDot = running ? "var(--success)" : binaryInstalled ? "var(--warning)" : "var(--text-faint)";
  const statusLabel = running ? "running" : binaryInstalled ? "stopped" : "not installed";

  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ background: statusDot }} />
      <span className="t-body flex-1" style={{ color: running ? "var(--text)" : "var(--text-faint)" }}>
        {prov.name}
      </span>
      <span className="t-tiny" style={{ color: statusDot }}>{statusLabel}</span>
      {running && (
        <button onClick={onStop} disabled={stopping}
          className="text-btn t-tiny transition active:scale-95"
          style={{ color: "var(--error)", opacity: stopping ? 0.5 : 1 }}>
          {stopping ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : "stop"}
        </button>
      )}
      {!running && binaryInstalled && hasModels && (
        <button onClick={onStart} disabled={starting}
          className="text-btn t-tiny transition active:scale-95"
          style={{ color: "var(--success)", opacity: starting ? 0.5 : 1 }}>
          {starting ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : "start"}
        </button>
      )}
      {!running && !binaryInstalled && (
        <a href={prov.url} target="_blank" rel="noopener noreferrer"
          className="text-btn t-tiny inline-flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
          install <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </div>
  );
}

// ── Hosted Server Row ────────────────────────────────────────────

function HostedServerRow({
  prov, connected, onConnect,
}: {
  prov: ProviderDef; connected: boolean;
  onConnect: (config: Record<string, string>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const credentialVars = prov.envVars.filter((e) => !e.key.includes("MODEL"));
  const hasRequired = credentialVars.filter((e) => e.required).every((e) => (values[e.key] || "").trim().length > 0);

  const handleSubmit = async () => {
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

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left transition active:scale-[0.99]">
        <span className="h-[5px] w-[5px] rounded-full shrink-0"
          style={{ background: connected ? "var(--success)" : "var(--text-faint)" }} />
        <span className="t-body flex-1" style={{ color: connected ? "var(--text)" : "var(--text-faint)" }}>
          {prov.name}
        </span>
        <span className="t-tiny" style={{ color: connected ? "var(--success)" : "var(--text-faint)" }}>
          {connected ? "saved" : "not saved"}
        </span>
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="pl-4 pb-2 space-y-2 animate-fade-slide-up">
          <div className="flex items-center justify-between">
            <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
              {connected ? "credentials saved" : "credentials"}
            </span>
            <a href={prov.url} target="_blank" rel="noopener noreferrer"
              className="t-tiny inline-flex items-center gap-0.5 transition" style={{ color: "var(--accent)" }}>
              get key <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          <div className="space-y-1.5">
            {credentialVars.map((env) => (
              <div key={env.key}>
                <span className="block t-tiny mb-0.5" style={{ color: "var(--text-faint)" }}>
                  {env.label}{env.required && <span style={{ color: "var(--warning)" }}> *</span>}
                </span>
                <input
                  type={env.key.includes("KEY") || env.key.includes("SECRET") ? "password" : "text"}
                  placeholder={env.placeholder}
                  value={values[env.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [env.key]: e.target.value }))}
                  className="w-full t-tiny bg-transparent px-0 py-1 outline-none transition"
                  style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }}
                  onFocus={(e) => { e.target.style.borderBottomColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderBottomColor = "var(--border)"; }}
                />
              </div>
            ))}
          </div>

          {warning && <p className="t-tiny" style={{ color: "var(--warning)" }}>{warning}</p>}
          <button onClick={handleSubmit} disabled={!hasRequired || submitting}
            className="text-btn t-body transition active:scale-95"
            style={{ color: connected ? "var(--success)" : "var(--accent)", opacity: !hasRequired || submitting ? 0.4 : 1 }}>
            {submitting ? <><Loader2 className="h-3 w-3 inline-block animate-spin mr-1" /> saving...</> : connected ? "update" : "save"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Provider Models Section ──────────────────────────────────────

function ProviderModelsSection({
  prov, isLocal, inference,
}: {
  prov: ProviderDef; isLocal: boolean; inference: ReturnType<typeof useInferenceSetup>;
}) {
  const installedModels = inference.installedByProvider[prov.id] || [];
  const { modelsLoading, activeModel } = inference;

  const isDefault = (modelId: string) => activeModel === modelId;

  const parseSize = (s?: string): number => {
    if (!s) return 999999;
    const m = s.match(/([\d.]+)\s*(MB|GB|TB)/i);
    if (!m) return 999999;
    const val = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    return unit === "MB" ? val : unit === "GB" ? val * 1024 : val * 1024 * 1024;
  };

  const sortedInstalled = [...installedModels].sort((a, b) => {
    const aD = isDefault(a) ? 1 : 0, bD = isDefault(b) ? 1 : 0;
    if (aD !== bD) return bD - aD;
    return parseSize(prov.models.find((m) => m.id === a)?.size) - parseSize(prov.models.find((m) => m.id === b)?.size);
  });

  const compatibleModels = isLocal ? prov.models.filter((m) => !installedModels.includes(m.id)) : prov.models;
  const hostedConnected = inference.hostedConnected[prov.id] ?? false;
  const hasContent = sortedInstalled.length > 0 || compatibleModels.length > 0;
  if (!hasContent) return null;

  // Local providers and providers with an active model open by default
  const hasActiveModel = isLocal
    ? sortedInstalled.some((m) => isDefault(m))
    : compatibleModels.some((m) => isDefault(m.id));
  const shouldOpen = isLocal || hasActiveModel;

  return (
    <Section title={prov.name} defaultOpen={shouldOpen}>
      {/* Installed local models */}
      {isLocal && sortedInstalled.map((modelId) => {
        const active = isDefault(modelId);
        const isLoading = modelsLoading.has(modelId);
        const knownModel = prov.models.find((m) => m.id === modelId);
        return (
          <div key={modelId}
            className="group relative flex items-center gap-2 py-0.5 transition cursor-pointer rounded-[4px] -mx-1 px-1"
            style={{ background: active ? "color-mix(in srgb, var(--accent) 6%, transparent)" : undefined }}
            onClick={() => { if (!isLoading && !active) inference.handleSwitchModel(modelId, prov.id, "all"); }}>
            {isLoading ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
            ) : (
              <span className="h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: active ? "var(--accent)" : "var(--success)" }} />
            )}
            <span className="t-body truncate" style={{ color: active ? "var(--accent)" : "var(--text)" }}>
              {knownModel ? knownModel.name : modelId}
            </span>
            {active && <span className="t-tiny shrink-0" style={{ color: "var(--accent)" }}>default</span>}
            <span className="t-tiny flex-1 text-right" style={{ color: "var(--text-faint)" }}>
              {knownModel?.size}{knownModel?.ram && ` ︱ ${knownModel.ram}`}
            </span>
            {!isLoading && (
              <button onClick={(e) => { e.stopPropagation(); inference.handleUninstallModel(modelId, prov.id); }}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition"
                style={{ color: "var(--text-faint)" }} title="Uninstall model">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Separator between installed and available */}
      {isLocal && sortedInstalled.length > 0 && compatibleModels.length > 0 && (
        <div className="my-1" style={{ borderTop: "1px dashed var(--border)" }} />
      )}

      {/* Available / catalog models */}
      {compatibleModels.map((model) => {
        const active = isDefault(model.id);
        const isLoading = modelsLoading.has(model.id);
        const progress = inference.installs.downloadPercent[model.id];
        const hasProgress = isLoading && progress !== undefined;
        return (
          <div key={model.id}
            className="group relative py-0.5 transition cursor-pointer rounded-[4px] -mx-1 px-1"
            style={{
              opacity: !isLocal && !hostedConnected && !active ? 0.4 : 1,
              background: active ? "color-mix(in srgb, var(--accent) 6%, transparent)" : undefined,
            }}
            onClick={() => {
              if (isLoading || active) return;
              if (!isLocal && !hostedConnected) return;
              if (isLocal) inference.handleInstallModel(model.id, prov.id);
              else inference.handleSwitchModel(model.id, prov.id, "all");
            }}>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
              ) : active ? (
                <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
              ) : (
                <span className="t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>+</span>
              )}
              <span className="t-body truncate" style={{ color: active ? "var(--accent)" : "var(--text)" }}>
                {model.name}
              </span>
              {active && <span className="t-tiny shrink-0" style={{ color: "var(--accent)" }}>default</span>}
              <span className="t-tiny flex-1 text-right" style={{ color: "var(--text-faint)" }}>
                {model.description}{model.size && ` · ${model.size}`}{model.ram && ` ︱ ${model.ram}`}
              </span>
              {hasProgress && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="t-tiny tabular-nums" style={{ color: "var(--accent)" }}>{Math.round(progress)}%</span>
                  <button onClick={(e) => { e.stopPropagation(); inference.handleCancelInstall(model.id); }}
                    className="transition" title="Cancel download" style={{ color: "var(--error)" }}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            {hasProgress && (
              <div className="mt-1 h-[2px] rounded-full overflow-hidden" style={{ background: "var(--bar-track)" }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress, 100)}%`, background: "var(--accent)" }} />
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}

// ── Routing Content ──────────────────────────────────────────────

function RoutingContent() {
  const [cogRoutes, setCogRoutes] = useState<Record<string, { provider: string; model: string }>>({});
  const [editingRoute, setEditingRoute] = useState<{ fn: string; provider: string; model: string } | null>(null);
  const [addingRoute, setAddingRoute] = useState(false);
  const [newRouteFn, setNewRouteFn] = useState(COG_FUNCTIONS[0] as string);
  const [newRouteProv, setNewRouteProv] = useState(ROUTING_PROVIDERS[0] as string);
  const [newRouteModel, setNewRouteModel] = useState("");
  const [routeSaving, setRouteSaving] = useState(false);

  const refreshRoutes = useCallback(async () => {
    try {
      const res = await fetch("/api/cortex/routes");
      setCogRoutes(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshRoutes(); }, [refreshRoutes]);

  const saveRoute = async (fn: string, provider: string, model: string) => {
    setRouteSaving(true);
    try {
      await fetch("/api/cortex/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ function: fn, route: { provider, model } }),
      });
      await refreshRoutes();
    } catch { /* ignore */ }
    setRouteSaving(false);
    setEditingRoute(null);
    setAddingRoute(false);
  };

  const resetRoutes = async () => {
    setRouteSaving(true);
    try {
      await fetch("/api/cortex/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "reset" }),
      });
      await refreshRoutes();
    } catch { /* ignore */ }
    setRouteSaving(false);
  };

  return (
    <div className="space-y-0.5">
      <p className="t-tiny mb-2" style={{ color: "var(--text-faint)" }}>
        override default model per cognitive function
      </p>

      {Object.entries(cogRoutes).map(([fn, route]) =>
        editingRoute?.fn === fn ? (
          <div key={fn} className="flex items-center gap-1 t-micro">
            <span className="w-16 shrink-0" style={{ color: "var(--text-muted)" }}>{fn}</span>
            <select value={editingRoute.provider}
              onChange={(e) => setEditingRoute({ ...editingRoute, provider: e.target.value })}
              className="rounded px-1 py-0.5 t-micro outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}>
              {ROUTING_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={editingRoute.model}
              onChange={(e) => setEditingRoute({ ...editingRoute, model: e.target.value })}
              className="flex-1 rounded px-1 py-0.5 t-micro outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }} />
            <button onClick={() => saveRoute(fn, editingRoute.provider, editingRoute.model)}
              disabled={routeSaving} className="t-micro transition active:scale-95" style={{ color: "var(--accent)" }}>
              {routeSaving ? "..." : "save"}
            </button>
            <button onClick={() => setEditingRoute(null)} className="t-micro" style={{ color: "var(--text-faint)" }}>×</button>
          </div>
        ) : (
          <div key={fn} className="flex items-center gap-2 t-micro group py-0.5 rounded-[4px] -mx-1 px-1 transition"
            style={{ cursor: "pointer" }}
            onClick={() => setEditingRoute({ fn, provider: route.provider, model: route.model })}>
            <span className="w-16 shrink-0" style={{ color: "var(--text-muted)" }}>{fn}</span>
            <span style={{ color: "var(--text)" }}>{route.model}</span>
            <span className="flex-1" style={{ color: "var(--text-faint)" }}>({route.provider})</span>
            <span className="opacity-0 group-hover:opacity-100 t-micro transition" style={{ color: "var(--accent)" }}>edit</span>
          </div>
        )
      )}

      {Object.keys(cogRoutes).length === 0 && !addingRoute && (
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>using defaults</span>
      )}

      {addingRoute ? (
        <div className="flex items-center gap-1 t-micro mt-1">
          <select value={newRouteFn} onChange={(e) => setNewRouteFn(e.target.value)}
            className="rounded px-1 py-0.5 t-micro outline-none"
            style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}>
            {COG_FUNCTIONS.filter((f) => !cogRoutes[f]).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={newRouteProv} onChange={(e) => setNewRouteProv(e.target.value)}
            className="rounded px-1 py-0.5 t-micro outline-none"
            style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}>
            {ROUTING_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={newRouteModel} onChange={(e) => setNewRouteModel(e.target.value)}
            placeholder="model name"
            className="flex-1 rounded px-1 py-0.5 t-micro outline-none"
            style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }} />
          <button onClick={() => { if (newRouteModel.trim()) saveRoute(newRouteFn, newRouteProv, newRouteModel.trim()); }}
            disabled={routeSaving} className="t-micro transition active:scale-95" style={{ color: "var(--accent)" }}>
            {routeSaving ? "..." : "save"}
          </button>
          <button onClick={() => setAddingRoute(false)} className="t-micro" style={{ color: "var(--text-faint)" }}>×</button>
        </div>
      ) : (
        <div className="flex gap-2 mt-1">
          <button onClick={() => setAddingRoute(true)} className="t-tiny transition active:scale-95" style={{ color: "var(--accent)" }}>
            + add route
          </button>
          {Object.keys(cogRoutes).length > 0 && (
            <button onClick={resetRoutes} disabled={routeSaving} className="t-tiny transition active:scale-95" style={{ color: "var(--text-faint)" }}>
              reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Limits Content ──────────────────────────────────────────────

function LimitsContent() {
  const [engineConfig, updateEngine] = useEngineConfig();

  return (
    <div className="space-y-1.5">
      <p className="t-tiny mb-2" style={{ color: "var(--text-faint)" }}>
        token limits for chat inference
      </p>
      <Slider
        label="Max Tokens"
        value={engineConfig.chatMaxTokens}
        min={128}
        max={4096}
        step={64}
        onChange={(v) => updateEngine({ chatMaxTokens: v })}
      />
    </div>
  );
}

// ── Fallback Content ─────────────────────────────────────────────

function FallbackContent() {
  const [engineConfig, updateEngine] = useEngineConfig();

  return (
    <div className="space-y-1.5">
      <p className="t-tiny mb-2" style={{ color: "var(--text-faint)" }}>
        strategy when primary provider is unavailable
      </p>
      <div className="flex items-center gap-2">
        <span className="t-small w-14 shrink-0" style={{ color: "var(--text-faint)" }}>primary</span>
        <select
          value={engineConfig.inferencePrimary}
          onChange={(e) => updateEngine({ inferencePrimary: e.target.value as "auto" | "venice" | "anthropic" | "local" })}
          className="rounded-[4px] px-1.5 py-0.5 t-tiny outline-none transition"
          style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}>
          {["auto", "venice", "anthropic", "local"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="t-small w-14 shrink-0" style={{ color: "var(--text-faint)" }}>fallback</span>
        <select
          value={engineConfig.inferenceFallback}
          onChange={(e) => updateEngine({ inferenceFallback: e.target.value as "anthropic" | "venice" | "local" | "none" })}
          className="rounded-[4px] px-1.5 py-0.5 t-tiny outline-none transition"
          style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}>
          {["anthropic", "venice", "local", "none"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}
