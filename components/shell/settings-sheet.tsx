"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, ChevronDown, ChevronRight, Sliders, Cpu, Check, Trash2, Plus, Loader2 } from "lucide-react";
import { NeuroSlider } from "@/components/ui/neuro-slider";
import { TypeFilterToggles } from "@/components/ui/type-filter-toggles";
import { useMemory } from "@/lib/memory-context";
import { DEFAULT_RETRIEVAL_SETTINGS } from "@/lib/retrieval-settings";
import {
  loadModelSettings,
  saveModelSettings,
  setActiveModel,
  addKnownModel,
  removeKnownModel,
  modelDisplayName,
  PRESET_MODELS,
  MODEL_DESCRIPTIONS,
} from "@/lib/model-settings";

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(true);
  const [tuningOpen, setTuningOpen] = useState(false);
  const { retrievalSettings, updateRetrievalSettings } = useMemory();

  // Model management state
  const [modelSettings, setModelSettings] = useState(() => loadModelSettings());
  const [customModelInput, setCustomModelInput] = useState("");
  const [modelLoading, setModelLoading] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const refreshModelSettings = useCallback(() => {
    setModelSettings(loadModelSettings());
  }, []);

  // Check backend status when section opens
  useEffect(() => {
    if (!open || !modelOpen) return;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => setBackendOnline(!d.error))
      .catch(() => setBackendOnline(false));
  }, [open, modelOpen]);

  const handleSwitchModel = async (model: string) => {
    if (model === modelSettings.activeModel) return;
    setModelLoading(model);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        setActiveModel(model);
        refreshModelSettings();
      }
    } catch {
      // backend error
    } finally {
      setModelLoading(null);
    }
  };

  const handleAddModel = (model: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    addKnownModel(trimmed);
    refreshModelSettings();
    setCustomModelInput("");
  };

  const handleRemoveModel = (model: string) => {
    removeKnownModel(model);
    refreshModelSettings();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const s = retrievalSettings;
  const d = DEFAULT_RETRIEVAL_SETTINGS;
  const isDefault =
    s.recallLimit === d.recallLimit &&
    s.minImportance === d.minImportance &&
    s.minDecay === d.minDecay &&
    s.enabledTypes.length === d.enabledTypes.length &&
    s.clinamenLimit === d.clinamenLimit &&
    s.clinamenMinImportance === d.clinamenMinImportance &&
    s.clinamenMaxRelevance === d.clinamenMaxRelevance;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        ref={backdropRef}
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      <div className="relative z-10 w-full sm:w-96 h-full overflow-y-auto glass-panel animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 glass">
          <h2 className="heading">Settings</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] transition"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {/* Model */}
          <button
            onClick={() => setModelOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-xs transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Cpu className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1 font-medium">Model</span>
            <span className="truncate max-w-[120px] text-[9px]" style={{ color: "var(--text-faint)" }}>
              {modelDisplayName(modelSettings.activeModel)}
            </span>
            {modelOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {modelOpen && (
            <div className="space-y-4 px-1 pb-2 animate-fade-slide-up">
              {/* Backend status */}
              <div className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: backendOnline === true ? "#22c55e" : backendOnline === false ? "#ef4444" : "var(--text-faint)" }}
                />
                <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                  {backendOnline === true ? "Backend connected" : backendOnline === false ? "Backend offline" : "Checking..."}
                </span>
              </div>

              {/* Installed models */}
              {modelSettings.knownModels.length > 0 && (
                <div className="space-y-1">
                  <h4 className="label">Installed</h4>
                  {modelSettings.knownModels.map((model) => {
                    const isActive = model === modelSettings.activeModel;
                    const isLoading = model === modelLoading;
                    const desc = MODEL_DESCRIPTIONS[model];
                    return (
                      <div
                        key={model}
                        className="group flex items-center gap-2 rounded-[6px] px-2.5 py-2 transition cursor-pointer"
                        style={{ background: isActive ? "var(--surface-dim)" : "transparent" }}
                        onClick={() => handleSwitchModel(model)}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                        ) : isActive ? (
                          <Check className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} />
                        ) : (
                          <span className="h-3 w-3 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span
                            className="block truncate text-[11px]"
                            style={{ color: isActive ? "var(--accent)" : "var(--text)" }}
                          >
                            {modelDisplayName(model)}
                          </span>
                          {desc && (
                            <span className="block truncate text-[9px]" style={{ color: "var(--text-faint)" }}>
                              {desc}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveModel(model);
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition p-0.5"
                          style={{ color: "var(--text-faint)" }}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Available (not yet installed) */}
              {PRESET_MODELS.filter((p) => !modelSettings.knownModels.includes(p)).length > 0 && (
                <div className="space-y-1">
                  <h4 className="label">Available</h4>
                  {PRESET_MODELS.filter((p) => !modelSettings.knownModels.includes(p)).map((model) => {
                    const desc = MODEL_DESCRIPTIONS[model];
                    return (
                      <div
                        key={model}
                        className="group flex items-center gap-2 rounded-[6px] px-2.5 py-2 transition cursor-pointer"
                        style={{ opacity: 0.6 }}
                        onClick={() => handleAddModel(model)}
                      >
                        <Plus className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-[11px]" style={{ color: "var(--text)" }}>
                            {modelDisplayName(model)}
                          </span>
                          {desc && (
                            <span className="block truncate text-[9px]" style={{ color: "var(--text-faint)" }}>
                              {desc}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Custom model input */}
              <div className="space-y-1.5">
                <h4 className="label">Custom Model</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddModel(customModelInput);
                    }}
                    placeholder="mlx-community/model-name"
                    className="flex-1 rounded-[6px] px-2.5 py-1.5 text-[10px] bg-transparent outline-none"
                    style={{
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                  <button
                    onClick={() => handleAddModel(customModelInput)}
                    disabled={!customModelInput.trim()}
                    className="shrink-0 rounded-[6px] px-2.5 py-1.5 text-[10px] font-medium transition active:scale-95 disabled:opacity-30"
                    style={{ color: "var(--accent)" }}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Retrieval Tuning */}
          <button
            onClick={() => setTuningOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-xs transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Sliders className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1 font-medium">Retrieval Tuning</span>
            {!isDefault && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            )}
            {tuningOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {tuningOpen && (
            <div className="space-y-5 px-1 pb-2 animate-fade-slide-up">
              {/* Recall section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="label">Recall Filters</h4>
                  {!isDefault && (
                    <button
                      onClick={() => updateRetrievalSettings({ ...DEFAULT_RETRIEVAL_SETTINGS })}
                      className="text-[9px] font-medium transition"
                      style={{ color: "var(--accent)" }}
                    >
                      Reset
                    </button>
                  )}
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
                  onChange={(v) => updateRetrievalSettings({ minImportance: v })}
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
                  onChange={(types) => updateRetrievalSettings({ enabledTypes: types })}
                />
              </div>

              {/* Clinamen section */}
              <div className="space-y-3">
                <h4 className="label">Clinamen (Divergent Recall)</h4>
                <p className="text-[9px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
                  Surfaces high-importance memories with low relevance to the current context — for creative synthesis.
                </p>
                <NeuroSlider
                  label="Clinamen Limit"
                  value={s.clinamenLimit}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(v) => updateRetrievalSettings({ clinamenLimit: v })}
                />
                <NeuroSlider
                  label="Min Importance"
                  value={s.clinamenMinImportance}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => updateRetrievalSettings({ clinamenMinImportance: v })}
                  formatValue={(v) => v.toFixed(2)}
                />
                <NeuroSlider
                  label="Max Relevance"
                  value={s.clinamenMaxRelevance}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => updateRetrievalSettings({ clinamenMaxRelevance: v })}
                  formatValue={(v) => v.toFixed(2)}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
