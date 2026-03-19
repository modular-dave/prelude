"use client";

import { useState } from "react";
import { Loader2, X, Trash2 } from "lucide-react";
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
  const ownsActiveModel = activeModel != null && (
    installedModels.includes(activeModel) ||
    prov.models.some((m) => m.id === activeModel)
  );
  const hasAssignment = Object.values(assignments).some(
    (a) => a && a.provider === prov.id
  );
  const highlighted = ownsActiveModel || hasAssignment || hostedConnected;
  const [open, setOpen] = useState(isActive || highlighted || hostedConnected);
  const [pickerModel, setPickerModel] = useState<string | null>(null);

  const getFuncTags = (modelId: string): CogFunc[] =>
    (["chat", "dream", "reflect"] as CogFunc[]).filter(
      (fn) => assignments[fn]?.model === modelId
    );

  // Status dot + label
  const statusDot = isLocal
    ? providerRunning ? "var(--success)" : binaryInstalled ? "var(--warning)" : "var(--text-faint)"
    : hostedConnected ? "var(--success)" : "var(--text-faint)";
  const statusLabel = isLocal
    ? providerRunning ? "running" : binaryInstalled ? "stopped" : "not installed"
    : hostedConnected ? "saved" : "not saved";

  return (
    <div className="mt-1">
      {/* Provider header — plain text with +/− toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left transition active:scale-[0.99] py-1"
      >
        <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 11, fontWeight: 400 }}>
          {open ? "−" : "+"}
        </span>
        <span className="font-mono" style={{ color: highlighted ? "var(--accent)" : "var(--text)", fontSize: 11, fontWeight: 400 }}>
          {prov.name}
        </span>
        <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ background: statusDot }} />
        <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
          {statusLabel}
        </span>
        {/* Function tags as plain text */}
        {COG_FUNCS.filter((fn) => assignments[fn.key]?.provider === prov.id).map((fn) => (
          <span key={fn.key} className="font-mono" style={{ color: fn.color, fontSize: 9, fontWeight: 400 }}>
            {fn.label.toLowerCase()}
          </span>
        ))}
      </button>

      {open && (
        <div className="pl-4 mt-1 space-y-3 animate-fade-slide-up">
          <span className="font-mono block" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
            {prov.description}
          </span>

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
              {installedModels.length === 0 && prov.id !== "ollama" ? (
                <span className="font-mono block" style={{ color: "var(--warning)", fontSize: 9, fontWeight: 400 }}>
                  install and select a model below to start the server
                </span>
              ) : (
                <button
                  onClick={onStartProvider}
                  disabled={startingProvider}
                  className="text-btn font-mono transition active:scale-95"
                  style={{ color: "var(--success)", fontSize: 11, fontWeight: 400, opacity: startingProvider ? 0.5 : 1 }}
                >
                  {startingProvider ? (
                    <><Loader2 className="h-3 w-3 inline-block animate-spin mr-1" /> starting...</>
                  ) : (
                    `start ${prov.name.toLowerCase()}`
                  )}
                </button>
              )}
            </>
          )}
          {isLocal && providerRunning === false && binaryInstalled === false && (
            <a
              href={prov.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-btn font-mono"
              style={{ color: "var(--accent)", fontSize: 11, fontWeight: 400 }}
            >
              install {prov.name.toLowerCase()} →
            </a>
          )}

          {/* Installed on machine (local providers only) */}
          {isLocal && installedModels.length > 0 && (() => {
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
              const aActive = assignments.chat?.model === a || assignments.dream?.model === a || assignments.reflect?.model === a;
              const bActive = assignments.chat?.model === b || assignments.dream?.model === b || assignments.reflect?.model === b;
              if (aActive && !bActive) return -1;
              if (!aActive && bActive) return 1;
              const aTagCount = getFuncTags(a).length;
              const bTagCount = getFuncTags(b).length;
              if (aTagCount !== bTagCount) return bTagCount - aTagCount;
              const aSize = parseSize(prov.models.find((m) => m.id === a)?.size);
              const bSize = parseSize(prov.models.find((m) => m.id === b)?.size);
              return aSize - bSize;
            });
            return (
              <div className="space-y-1">
                <span className="font-mono block" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>installed</span>
                {sortedInstalled.map((modelId) => {
                  const funcTags = getFuncTags(modelId);
                  const isLoading = modelsLoading.has(modelId);
                  const knownModel = prov.models.find((m) => m.id === modelId);
                  return (
                    <div
                      key={modelId}
                      className="group relative flex items-center gap-2 py-0.5 transition cursor-pointer"
                      onClick={() => {
                        if (isLoading) return;
                        setPickerModel(pickerModel === modelId ? null : modelId);
                      }}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                      ) : (
                        <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: funcTags.length > 0 ? "var(--accent)" : "var(--success)" }} />
                      )}
                      <span className="font-mono truncate" style={{ color: funcTags.length > 0 ? "var(--accent)" : "var(--text)", fontSize: 11, fontWeight: 400 }}>
                        {knownModel ? knownModel.name : modelId}
                      </span>
                      {funcTags.map((fn) => {
                        const cfg = COG_FUNCS.find((c) => c.key === fn)!;
                        return (
                          <span key={fn} className="font-mono shrink-0" style={{ color: cfg.color, fontSize: 9, fontWeight: 400 }}>
                            {cfg.label.toLowerCase()}
                          </span>
                        );
                      })}
                      <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                        {knownModel?.size && `${knownModel.size}`}
                        {knownModel?.ram && ` ︱ ${knownModel.ram}`}
                      </span>
                      {!isLoading && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onUninstall(modelId); }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition"
                          style={{ color: "var(--text-faint)" }}
                          title="Uninstall model"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {pickerModel === modelId && (
                        <FunctionPicker
                          modelName={modelId}
                          onSelect={(fn) => { setPickerModel(null); onSwitch(modelId, fn); }}
                          onClose={() => setPickerModel(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Compatible models */}
          {prov.models.length > 0 && (() => {
            const filtered = isLocal
              ? prov.models.filter((m) => !installedModels.includes(m.id))
              : prov.models;
            if (filtered.length === 0) return null;
            return (
              <div className="space-y-1">
                <span className="font-mono block" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>compatible</span>
                {filtered.map((model) => {
                  const funcTags = getFuncTags(model.id);
                  const isLoading = modelsLoading.has(model.id);
                  const progress = downloadProgress[model.id];
                  const hasProgress = isLoading && progress !== undefined;
                  return (
                    <div
                      key={model.id}
                      className="group relative py-0.5 transition cursor-pointer"
                      style={{ opacity: !isLocal && !hostedConnected && funcTags.length === 0 ? 0.4 : 1 }}
                      onClick={() => {
                        if (isLoading) return;
                        if (!isLocal && !hostedConnected) return;
                        if (!isLocal) {
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
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                        ) : (
                          <span className="font-mono shrink-0" style={{ color: "var(--text-faint)", fontSize: 9 }}>+</span>
                        )}
                        <span className="font-mono truncate" style={{ color: funcTags.length > 0 ? "var(--accent)" : "var(--text)", fontSize: 11, fontWeight: 400 }}>
                          {model.name}
                        </span>
                        {funcTags.map((fn) => {
                          const cfg = COG_FUNCS.find((c) => c.key === fn)!;
                          return (
                            <span key={fn} className="font-mono shrink-0" style={{ color: cfg.color, fontSize: 9, fontWeight: 400 }}>
                              {cfg.label.toLowerCase()}
                            </span>
                          );
                        })}
                        <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                          {model.description}
                          {model.size && ` · ${model.size}`}
                          {model.ram && ` ︱ ${model.ram}`}
                        </span>
                        {hasProgress && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono tabular-nums" style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}>
                              {Math.round(progress)}%
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onCancelInstall(model.id); }}
                              className="transition"
                              title="Cancel download"
                              style={{ color: "var(--error)" }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {hasProgress && (
                        <div className="mt-1 h-[2px] overflow-hidden" style={{ background: "var(--bar-track)" }}>
                          <div
                            className="h-full transition-all duration-300"
                            style={{ width: `${Math.min(progress, 100)}%`, background: "var(--accent)" }}
                          />
                        </div>
                      )}
                      {pickerModel === model.id && (
                        <FunctionPicker
                          modelName={model.id}
                          onSelect={(fn) => { setPickerModel(null); onSwitch(model.id, fn); }}
                          onClose={() => setPickerModel(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Stop server */}
          {isLocal && providerRunning === true && (
            <button
              onClick={onStopProvider}
              disabled={stoppingProvider}
              className="text-btn font-mono transition active:scale-95"
              style={{ color: "var(--error)", fontSize: 11, fontWeight: 400, opacity: stoppingProvider ? 0.5 : 1 }}
            >
              {stoppingProvider ? (
                <><Loader2 className="h-3 w-3 inline-block animate-spin mr-1" /> stopping...</>
              ) : (
                `stop ${prov.name.toLowerCase()}`
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
