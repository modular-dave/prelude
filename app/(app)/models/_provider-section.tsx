"use client";

import { useState } from "react";
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Download, Square, X, Check, Trash2, Plus } from "lucide-react";
import type { CogFunc, Assignment } from "@/lib/active-model-store";
import { COG_FUNCS } from "./_types";
import type { ProviderDef } from "./_types";
import { FunctionPicker, HostedConfigForm } from "./_shared-components";

// ── Provider Section ─────────────────────────────────────────────

export function ProviderSection({
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
            <span className="font-mono" style={{ color: highlighted ? "var(--accent)" : "var(--text)", fontSize: 13, fontWeight: 500 }}>
              {prov.name}
            </span>
            {isLocal && providerRunning === true && (
              <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--success)" }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                running
              </span>
            )}
            {isLocal && providerRunning === false && binaryInstalled === true && (
              <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--warning)" }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--warning)" }} />
                stopped
              </span>
            )}
            {isLocal && providerRunning === false && binaryInstalled === false && (
              <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--text-faint)" }} />
                not installed
              </span>
            )}
            {!isLocal && hostedConnected && (
              <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--success)" }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                saved
              </span>
            )}
            {!isLocal && !hostedConnected && (
              <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--text-faint)" }} />
                not saved
              </span>
            )}
            {COG_FUNCS.filter((fn) => {
              const a = assignments[fn.key];
              return a && a.provider === prov.id;
            }).map((fn) => (
              <span
                key={fn.key}
                className="rounded-full px-1.5 py-0.5 font-mono"
                style={{ background: `color-mix(in srgb, ${fn.color} 13%, transparent)`, color: fn.color, fontSize: 9, fontWeight: 400 }}
              >
                {fn.label.toLowerCase()}
              </span>
            ))}
          </div>
          <span className="block font-mono mt-0.5" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
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
                  className="font-mono rounded-[6px] px-3 py-2"
                  style={{ background: "color-mix(in srgb, var(--warning) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)", fontSize: 9, fontWeight: 400 }}
                >
                  Install and select a model below to start the server
                </div>
              ) : (
              <button
                onClick={onStartProvider}
                disabled={startingProvider}
                className="flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 transition cursor-pointer"
                style={{
                  background: "color-mix(in srgb, var(--success) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--success) 20%, transparent)",
                }}
              >
                {startingProvider ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: "var(--success)" }} />
                ) : (
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                )}
                <div className="flex-1 min-w-0 text-left">
                  <span className="block font-mono" style={{ color: "var(--success)", fontSize: 11, fontWeight: 400 }}>
                    {startingProvider ? `Starting ${prov.name}…` : `Start ${prov.name}`}
                  </span>
                  <span className="block font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
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
              style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" }}
            >
              <Download className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div className="flex-1 min-w-0">
                <span className="block font-mono" style={{ color: "var(--accent)", fontSize: 11, fontWeight: 400 }}>
                  Install {prov.name}
                </span>
                <span className="block font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
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
              <h4 className="font-mono" style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Installed on machine</h4>
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
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--success)" }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="truncate font-mono"
                            style={{ color: funcTags.length > 0 ? "var(--accent)" : "var(--text)", fontSize: 11, fontWeight: 400 }}
                          >
                            {knownModel ? knownModel.name : modelId}
                          </span>
                          {funcTags.map((fn) => {
                            const cfg = COG_FUNCS.find((c) => c.key === fn)!;
                            return (
                              <span
                                key={fn}
                                className="rounded-full px-1.5 py-0 font-mono shrink-0"
                                style={{ background: `color-mix(in srgb, ${cfg.color} 13%, transparent)`, color: cfg.color, fontSize: 9, fontWeight: 400 }}
                              >
                                {cfg.label.toLowerCase()}
                              </span>
                            );
                          })}
                        </div>
                        <span className="block truncate font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
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
              <h4 className="font-mono" style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Compatible Models</h4>
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
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--success)" }} />
                        ) : (
                          <Plus className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)", opacity: 0.5 }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="truncate font-mono"
                              style={{ color: funcTags.length > 0 ? "var(--accent)" : "var(--text)", fontSize: 11, fontWeight: 400 }}
                            >
                              {model.name}
                            </span>
                            {funcTags.map((fn) => {
                              const cfg = COG_FUNCS.find((c) => c.key === fn)!;
                              return (
                                <span
                                  key={fn}
                                  className="rounded-full px-1.5 py-0 font-mono shrink-0"
                                  style={{ background: `color-mix(in srgb, ${cfg.color} 13%, transparent)`, color: cfg.color, fontSize: 9, fontWeight: 400 }}
                                >
                                  {cfg.label.toLowerCase()}
                                </span>
                              );
                            })}
                          </div>
                          <span className="block truncate font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                            {model.description}
                            {model.size && ` · ${model.size}`}
                            {model.ram && ` ︱ ${model.ram} RAM`}
                          </span>
                        </div>
                        {hasProgress && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono tabular-nums" style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}>
                              {Math.round(progress)}%
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onCancelInstall(model.id); }}
                              className="rounded-full p-0.5 transition"
                              title="Cancel download"
                              style={{ color: "var(--error)" }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {hasProgress && (
                        <div
                          className="mt-1.5 h-1 rounded-full overflow-hidden"
                          style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
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
              style={{ background: "color-mix(in srgb, var(--error) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--error) 15%, transparent)" }}
            >
              {stoppingProvider ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--error)" }} />
              ) : (
                <Square className="h-3 w-3 shrink-0" style={{ color: "var(--error)" }} />
              )}
              <span className="font-mono" style={{ color: "var(--error)", fontSize: 11, fontWeight: 400 }}>
                {stoppingProvider ? `Stopping ${prov.name}…` : `Stop ${prov.name}`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
