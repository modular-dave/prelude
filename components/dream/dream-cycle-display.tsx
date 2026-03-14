"use client";

import { useEffect, useState } from "react";
import { Moon, Loader2, CheckCircle2, Circle, X, ChevronDown, ChevronRight, Sliders, Save, Trash2 } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import {
  runConsolidation,
  runCompaction,
  runReflection,
  runContradiction,
  runEmergence,
} from "@/lib/dream-engine";
import type { DreamPhaseResult } from "@/lib/dream-engine";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/types";
import type { MemoryType } from "@/lib/types";
import { NeuroSlider } from "@/components/ui/neuro-slider";
import type { DreamSettings, DreamPreset } from "@/lib/dream-settings";
import {
  DEFAULT_DREAM_SETTINGS,
  BUILT_IN_PRESETS,
  loadDreamSettings,
  saveDreamSettings,
  loadDreamPresets,
  saveDreamPresets,
} from "@/lib/dream-settings";

const PHASE_ICONS = {
  idle: Circle,
  running: Loader2,
  complete: CheckCircle2,
};

const PHASE_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#f43f5e",
];

const ROMAN = ["I", "II", "III", "IV", "V"];

/* ── Metric bar (themed) ── */
function MetricBar({ value, label, color }: { value: number; label: string; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[9px]" style={{ color: "var(--text-faint)" }}>{label}</span>
      <div className="h-1.5 flex-1 rounded-full" style={{ background: "var(--bar-track)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color || "var(--accent)" }}
        />
      </div>
      <span className="w-8 text-right text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>{pct}%</span>
    </div>
  );
}

/* ── Expanded detail panel ── */
function PhaseDetailPanel({ phase, color, onClose }: { phase: DreamPhaseResult; color: string; onClose: () => void }) {
  return (
    <div
      className="mt-3 rounded-[8px] p-5 animate-fade-slide-up"
      style={{
        background: "var(--surface-dim)",
        borderTopWidth: 2, borderTopStyle: "solid", borderTopColor: color,
        borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "var(--border)",
        borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--border)",
        borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xs font-semibold" style={{ color }}>{phase.name}</h3>
        <button onClick={onClose} className="shrink-0" style={{ color: "var(--text-faint)" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Reasoning */}
      {phase.reasoning && (
        <div className="mt-3">
          <p className="label mb-1.5">Agent Reasoning</p>
          <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {phase.reasoning}
          </p>
        </div>
      )}

      {/* Phase-specific content */}
      <ConsolidationDetail phase={phase} />
      <CompactionDetail phase={phase} />
      <ReflectionDetail phase={phase} />
      <ContradictionDetail phase={phase} />
      <EmergenceDetail phase={phase} />

      {phase.lastRun && (
        <p className="mt-4 text-[9px]" style={{ color: "var(--text-faint)" }}>
          Completed {new Date(phase.lastRun).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

/* ── Consolidation ── */
function ConsolidationDetail({ phase }: { phase: DreamPhaseResult }) {
  if (!phase.clusters || phase.clusters.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      <p className="label">Clusters ({phase.clusters.length})</p>
      {phase.clusters.slice(0, 5).map((c) => (
        <div key={c.tag} className="rounded-[6px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-blue-500">{c.tag}</span>
            <span className="text-[9px] font-mono" style={{ color: "var(--text-faint)" }}>
              {c.memoryIds.length} memories
            </span>
          </div>
          <MetricBar value={c.avgImportance} label="Avg Importance" color="#3b82f6" />
          <div className="mt-2 space-y-1">
            {c.memories.slice(0, 3).map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-[9px]">
                <span className="shrink-0 font-mono" style={{ color: TYPE_COLORS[m.type] }}>#{m.id}</span>
                <span style={{ color: "var(--text-muted)" }}>{m.summary.slice(0, 60)}{m.summary.length > 60 ? "..." : ""}</span>
              </div>
            ))}
            {c.memories.length > 3 && (
              <p className="text-[9px]" style={{ color: "var(--text-faint)" }}>+{c.memories.length - 3} more</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Compaction ── */
function CompactionDetail({ phase }: { phase: DreamPhaseResult }) {
  if (phase.candidates === undefined) return null;
  if (phase.candidates.length === 0) {
    return (
      <div className="mt-4">
        <p className="label mb-1.5">Compaction Candidates</p>
        <p className="text-[10px] text-green-500" style={{ opacity: 0.8 }}>All memories are healthy — nothing to compact.</p>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <p className="label">Flagged Memories ({phase.candidates.length})</p>
      {phase.candidates.map((c) => (
        <div key={c.id} className="rounded-[6px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono" style={{ color: TYPE_COLORS[c.type] }}>#{c.id}</span>
            <span className="flex-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{c.summary.slice(0, 50)}{c.summary.length > 50 ? "..." : ""}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            <MetricBar value={c.importance} label="Importance" color="#f59e0b" />
            <MetricBar value={c.decayFactor} label="Decay" color="#f43f5e" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Reflection ── */
function ReflectionDetail({ phase }: { phase: DreamPhaseResult }) {
  if (!phase.reflection) return null;
  const r = phase.reflection;
  const sortedTypes = Object.entries(r.typeCounts).sort(([, a], [, b]) => b - a);
  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="label mb-1.5">Type Distribution</p>
        <div className="space-y-1">
          {sortedTypes.map(([type, count]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[9px]" style={{ color: TYPE_COLORS[type as MemoryType] || "var(--text-muted)" }}>
                {TYPE_LABELS[type as MemoryType] || type}
              </span>
              <div className="h-1.5 flex-1 rounded-full" style={{ background: "var(--bar-track)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(count / r.totalMemories) * 100}%`,
                    background: TYPE_COLORS[type as MemoryType] || "var(--accent)",
                  }}
                />
              </div>
              <span className="w-8 text-right text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[6px] p-2.5 text-center" style={{ background: "var(--surface-dimmer)" }}>
          <p className="text-[9px]" style={{ color: "var(--text-faint)" }}>Importance</p>
          <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{Math.round(r.avgImportance * 100)}%</p>
        </div>
        <div className="rounded-[6px] p-2.5 text-center" style={{ background: "var(--surface-dimmer)" }}>
          <p className="text-[9px]" style={{ color: "var(--text-faint)" }}>Valence</p>
          <p className={`text-sm font-semibold ${r.avgValence > 0.1 ? "text-green-500" : r.avgValence < -0.1 ? "text-red-500" : ""}`}
            style={Math.abs(r.avgValence) <= 0.1 ? { color: "var(--text-muted)" } : undefined}
          >
            {r.avgValence > 0 ? "+" : ""}{r.avgValence.toFixed(2)}
          </p>
        </div>
        <div className="rounded-[6px] p-2.5 text-center" style={{ background: "var(--surface-dimmer)" }}>
          <p className="text-[9px]" style={{ color: "var(--text-faint)" }}>Tone</p>
          <p className={`text-sm font-semibold ${r.emotionalTone === "positive" ? "text-green-500" : r.emotionalTone === "negative" ? "text-red-500" : ""}`}
            style={r.emotionalTone === "neutral" ? { color: "var(--text-muted)" } : undefined}
          >
            {r.emotionalTone}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Contradiction ── */
function ContradictionDetail({ phase }: { phase: DreamPhaseResult }) {
  if (phase.contradictions === undefined) return null;
  if (phase.contradictions.length === 0) {
    return (
      <div className="mt-4">
        <p className="label mb-1.5">Conflicts</p>
        <p className="text-[10px] text-green-500" style={{ opacity: 0.8 }}>No contradictions detected — emotional consistency across concepts.</p>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <p className="label">Conflicts ({phase.contradictions.length})</p>
      {phase.contradictions.map((c, i) => (
        <div key={i} className="rounded-[6px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <p className="text-[10px] font-medium text-rose-500">on &ldquo;{c.sharedConcept}&rdquo;</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-[4px] p-2" style={{ background: "var(--surface-dim)" }}>
              <div className="flex items-center gap-1 text-[9px]">
                <span className="font-mono" style={{ color: TYPE_COLORS[c.memoryA.type] }}>#{c.memoryA.id}</span>
                <span className={c.memoryA.valence > 0 ? "text-green-500" : "text-red-500"}>
                  {c.memoryA.valence > 0 ? "+" : ""}{c.memoryA.valence.toFixed(1)}
                </span>
              </div>
              <p className="mt-1 text-[9px]" style={{ color: "var(--text-muted)" }}>{c.memoryA.summary.slice(0, 50)}{c.memoryA.summary.length > 50 ? "..." : ""}</p>
            </div>
            <div className="rounded-[4px] p-2" style={{ background: "var(--surface-dim)" }}>
              <div className="flex items-center gap-1 text-[9px]">
                <span className="font-mono" style={{ color: TYPE_COLORS[c.memoryB.type] }}>#{c.memoryB.id}</span>
                <span className={c.memoryB.valence > 0 ? "text-green-500" : "text-red-500"}>
                  {c.memoryB.valence > 0 ? "+" : ""}{c.memoryB.valence.toFixed(1)}
                </span>
              </div>
              <p className="mt-1 text-[9px]" style={{ color: "var(--text-muted)" }}>{c.memoryB.summary.slice(0, 50)}{c.memoryB.summary.length > 50 ? "..." : ""}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Emergence ── */
function EmergenceDetail({ phase }: { phase: DreamPhaseResult }) {
  if (!phase.emergence) return null;
  const e = phase.emergence;
  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="label mb-1.5">Surfaced Memory</p>
        <div className="rounded-[6px] p-3" style={{ background: "var(--surface-dimmer)" }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono" style={{ color: TYPE_COLORS[e.memory.type as MemoryType] }}>#{e.memory.id}</span>
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
              {TYPE_LABELS[e.memory.type as MemoryType] || e.memory.type}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{e.memory.summary}</p>
          <MetricBar value={e.memory.importance} label="Importance" color="#8b5cf6" />
          {e.relatedConcepts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {e.relatedConcepts.slice(0, 6).map((c) => (
                <span key={c} className="rounded-full px-2 py-0.5 text-[8px]" style={{ background: "var(--surface-dim)", color: "var(--text-muted)" }}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {e.connectedMemories.length > 0 && (
        <div>
          <p className="label mb-1.5">Connected Memories ({e.connectedMemories.length})</p>
          <div className="space-y-1">
            {e.connectedMemories.map((m) => (
              <div key={m.id} className="flex items-start gap-2 rounded-[4px] px-2 py-1.5 text-[9px]" style={{ background: "var(--surface-dimmer)" }}>
                <span className="shrink-0 font-mono" style={{ color: TYPE_COLORS[m.type] }}>#{m.id}</span>
                <span className="flex-1" style={{ color: "var(--text-muted)" }}>{m.summary.slice(0, 50)}{m.summary.length > 50 ? "..." : ""}</span>
                <span className="shrink-0" style={{ color: "var(--text-faint)" }}>
                  {m.sharedConcepts.slice(0, 2).join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */
export function DreamCycleDisplay() {
  const { memories } = useMemory();
  const [phases, setPhases] = useState<DreamPhaseResult[]>([
    { name: "Consolidation", description: "Group related memories by shared tags", status: "idle" },
    { name: "Compaction", description: "Compress fading low-importance memories", status: "idle" },
    { name: "Reflection", description: "Review self-model against knowledge", status: "idle" },
    { name: "Contradiction Resolution", description: "Find and resolve conflicting memories", status: "idle" },
    { name: "Emergence", description: "Discover unexpected connections", status: "idle" },
  ]);
  const [running, setRunning] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Dream settings
  const [settings, setSettings] = useState<DreamSettings>(DEFAULT_DREAM_SETTINGS);
  const [userPresets, setUserPresets] = useState<DreamPreset[]>([]);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    setSettings(loadDreamSettings());
    setUserPresets(loadDreamPresets());
  }, []);

  const updateSettings = (patch: Partial<DreamSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveDreamSettings(next);
  };

  const applyPreset = (preset: DreamPreset) => {
    setSettings({ ...preset.settings });
    saveDreamSettings(preset.settings);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = [...userPresets.filter((p) => p.name !== name), { name, settings: { ...settings } }];
    setUserPresets(next);
    saveDreamPresets(next);
    setSavingPreset(false);
    setPresetName("");
  };

  const deletePreset = (name: string) => {
    const next = userPresets.filter((p) => p.name !== name);
    setUserPresets(next);
    saveDreamPresets(next);
  };

  const isDefault =
    settings.clusterMinSize === DEFAULT_DREAM_SETTINGS.clusterMinSize &&
    settings.compactionMaxImportance === DEFAULT_DREAM_SETTINGS.compactionMaxImportance &&
    settings.compactionMaxDecay === DEFAULT_DREAM_SETTINGS.compactionMaxDecay &&
    settings.contradictionMinValenceDiff === DEFAULT_DREAM_SETTINGS.contradictionMinValenceDiff &&
    settings.contradictionMaxResults === DEFAULT_DREAM_SETTINGS.contradictionMaxResults &&
    settings.emergenceMaxConnections === DEFAULT_DREAM_SETTINGS.emergenceMaxConnections;

  const runDream = async () => {
    if (running) return;
    setRunning(true);
    setSelectedIdx(null);

    const runners = [
      (m: typeof memories) => runConsolidation(m, settings),
      (m: typeof memories) => runCompaction(m, settings),
      (m: typeof memories) => runReflection(m),
      (m: typeof memories) => runContradiction(m, settings),
      (m: typeof memories) => runEmergence(m, settings),
    ];

    for (let i = 0; i < runners.length; i++) {
      setPhases((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "running" as const } : p
        )
      );
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

      const result = runners[i](memories);
      setPhases((prev) =>
        prev.map((p, idx) => (idx === i ? result : p))
      );
      await new Promise((r) => setTimeout(r, 200));
    }

    setRunning(false);
  };

  const toggleCard = (i: number) => {
    if (phases[i].status !== "complete") return;
    setSelectedIdx(selectedIdx === i ? null : i);
  };

  const allPresets = [...BUILT_IN_PRESETS, ...userPresets];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <Moon className="h-4 w-4" />
            Dream Cycle
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
            5-phase memory consolidation inspired by biological sleep
          </p>
        </div>
        <button
          onClick={runDream}
          disabled={running || memories.length === 0}
          className="rounded-[6px] px-4 py-2 text-xs font-medium transition active:scale-95 disabled:opacity-40 glass"
          style={{ color: "var(--text)" }}
        >
          {running ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Dreaming...
            </span>
          ) : (
            "Run Dream Cycle"
          )}
        </button>
      </div>

      {/* Dream Tuning */}
      <div className="mt-4">
        <button
          onClick={() => setTuningOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-xs transition"
          style={{ color: "var(--text-muted)" }}
        >
          <Sliders className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <span className="flex-1 font-medium">Dream Tuning</span>
          {!isDefault && (
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          )}
          {tuningOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {tuningOpen && (
          <div className="space-y-4 px-1 pb-3 animate-fade-slide-up">
            {/* Preset selector */}
            <div className="flex items-center gap-2">
              <select
                className="flex-1 rounded-[6px] px-2.5 py-1.5 text-[10px] font-medium"
                style={{ background: "var(--surface-dim)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                value=""
                onChange={(e) => {
                  const p = allPresets.find((pr) => pr.name === e.target.value);
                  if (p) applyPreset(p);
                }}
              >
                <option value="" disabled>Load preset...</option>
                {BUILT_IN_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
                {userPresets.length > 0 && (
                  <optgroup label="Your Presets">
                    {userPresets.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>

              {savingPreset ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    className="w-24 rounded-[4px] px-2 py-1 text-[10px]"
                    style={{ background: "var(--surface-dim)", color: "var(--text)", border: "1px solid var(--border)" }}
                    placeholder="Name..."
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") setSavingPreset(false); }}
                  />
                  <button
                    onClick={savePreset}
                    className="rounded-[4px] p-1 transition"
                    style={{ color: "var(--accent)" }}
                  >
                    <Save className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setSavingPreset(false)}
                    className="rounded-[4px] p-1 transition"
                    style={{ color: "var(--text-faint)" }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSavingPreset(true)}
                  className="rounded-[4px] px-2 py-1 text-[9px] font-medium transition"
                  style={{ color: "var(--accent)" }}
                >
                  Save
                </button>
              )}

              {!isDefault && (
                <button
                  onClick={() => { setSettings({ ...DEFAULT_DREAM_SETTINGS }); saveDreamSettings(DEFAULT_DREAM_SETTINGS); }}
                  className="text-[9px] font-medium transition"
                  style={{ color: "var(--text-faint)" }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* User preset delete buttons */}
            {userPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {userPresets.map((p) => (
                  <span
                    key={p.name}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]"
                    style={{ background: "var(--surface-dim)", color: "var(--text-muted)" }}
                  >
                    {p.name}
                    <button onClick={() => deletePreset(p.name)} style={{ color: "var(--text-faint)" }}>
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Consolidation */}
            <div className="space-y-2">
              <h4 className="label">Consolidation</h4>
              <NeuroSlider
                label="Cluster Min Size"
                value={settings.clusterMinSize}
                min={2} max={10} step={1}
                onChange={(v) => updateSettings({ clusterMinSize: v })}
              />
            </div>

            {/* Compaction */}
            <div className="space-y-2">
              <h4 className="label">Compaction</h4>
              <NeuroSlider
                label="Max Importance"
                value={settings.compactionMaxImportance}
                min={0} max={1} step={0.05}
                onChange={(v) => updateSettings({ compactionMaxImportance: v })}
                formatValue={(v) => v.toFixed(2)}
              />
              <NeuroSlider
                label="Max Decay Factor"
                value={settings.compactionMaxDecay}
                min={0} max={1} step={0.05}
                onChange={(v) => updateSettings({ compactionMaxDecay: v })}
                formatValue={(v) => v.toFixed(2)}
              />
            </div>

            {/* Contradiction */}
            <div className="space-y-2">
              <h4 className="label">Contradiction</h4>
              <NeuroSlider
                label="Min Valence Diff"
                value={settings.contradictionMinValenceDiff}
                min={0.1} max={1} step={0.1}
                onChange={(v) => updateSettings({ contradictionMinValenceDiff: v })}
                formatValue={(v) => v.toFixed(1)}
              />
              <NeuroSlider
                label="Max Results"
                value={settings.contradictionMaxResults}
                min={1} max={20} step={1}
                onChange={(v) => updateSettings({ contradictionMaxResults: v })}
              />
            </div>

            {/* Emergence */}
            <div className="space-y-2">
              <h4 className="label">Emergence</h4>
              <NeuroSlider
                label="Max Connections"
                value={settings.emergenceMaxConnections}
                min={1} max={20} step={1}
                onChange={(v) => updateSettings({ emergenceMaxConnections: v })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Phase cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-5">
        {phases.map((phase, i) => {
          const Icon = PHASE_ICONS[phase.status];
          const isSelected = selectedIdx === i;
          return (
            <button
              key={phase.name}
              onClick={() => toggleCard(i)}
              disabled={phase.status !== "complete"}
              className="rounded-[6px] p-4 text-left transition disabled:cursor-default"
              style={{
                background: "var(--surface-dim)",
                borderTopWidth: phase.status === "complete" || isSelected ? 2 : 1,
                borderTopStyle: "solid",
                borderTopColor: phase.status === "complete" || isSelected ? PHASE_COLORS[i] : "var(--border)",
                borderRightWidth: isSelected ? 2 : 1,
                borderRightStyle: "solid",
                borderRightColor: isSelected ? PHASE_COLORS[i] : "var(--border)",
                borderBottomWidth: isSelected ? 2 : 1,
                borderBottomStyle: "solid",
                borderBottomColor: isSelected ? PHASE_COLORS[i] : "var(--border)",
                borderLeftWidth: isSelected ? 2 : 1,
                borderLeftStyle: "solid",
                borderLeftColor: isSelected ? PHASE_COLORS[i] : "var(--border)",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold" style={{ color: PHASE_COLORS[i], opacity: 0.6 }}>
                  {ROMAN[i]}
                </span>
                <Icon
                  className={`h-3.5 w-3.5 ${
                    phase.status === "running"
                      ? "animate-spin text-blue-500"
                      : phase.status === "complete"
                        ? "text-green-500"
                        : ""
                  }`}
                  style={phase.status === "idle" ? { color: "var(--text-faint)" } : undefined}
                />
              </div>
              <p className="mt-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                {phase.name}
              </p>
              <p className="mt-1 text-[9px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
                {phase.status === "complete" && phase.result ? phase.result : phase.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Expanded detail panel */}
      {selectedIdx !== null && phases[selectedIdx].status === "complete" && (
        <PhaseDetailPanel
          phase={phases[selectedIdx]}
          color={PHASE_COLORS[selectedIdx]}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </div>
  );
}
