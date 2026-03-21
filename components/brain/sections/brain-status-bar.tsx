"use client";

import type { CortexStatus } from "@/components/brain/hooks/use-cortex-status";

interface BrainStatusBarProps {
  compact: boolean;
  filteredCount: number;
  cortexStatus: CortexStatus;
  dreamScheduleEnabled: boolean;
  reflectionScheduleEnabled: boolean;
  collapsed: Record<string, boolean>;
  toggleSection: (key: string) => void;
}

export function BrainStatusBar({
  compact,
  filteredCount,
  cortexStatus,
  dreamScheduleEnabled,
  reflectionScheduleEnabled,
  collapsed,
  toggleSection,
}: BrainStatusBarProps) {
  const {
    cortexOnline, inferenceConnected, embeddingConnected,
    dreamToggling, reflectToggling, inferenceModelLabel, embeddingModelLabel,
    toggleDreamSchedule, toggleReflectSchedule,
  } = cortexStatus;

  const inferenceActive = inferenceConnected;
  const embeddingActive = embeddingConnected;
  const dreamActive = dreamScheduleEnabled;
  const reflectActive = reflectionScheduleEnabled;
  const modelActive = inferenceActive || embeddingActive;
  const memActive = dreamActive || reflectActive;
  const activeCount = [modelActive, memActive].filter(Boolean).length;
  const inactiveGrey = "var(--text-faint)";
  const status = cortexOnline === null ? "..." : !cortexOnline ? "inactive" : activeCount === 2 ? "live" : activeCount > 0 ? "partial" : "inactive";
  const dotColor = status === "live" ? "var(--success)" : status === "partial" ? "var(--warning)" : inactiveGrey;
  const textColor = status === "live" ? "var(--success)" : status === "partial" ? "var(--warning)" : inactiveGrey;
  const modelDot = inferenceActive && embeddingActive ? "var(--success)" : inferenceActive || embeddingActive ? "var(--warning)" : inactiveGrey;
  const modelText = inferenceActive && embeddingActive ? "var(--success)" : inferenceActive || embeddingActive ? "var(--warning)" : inactiveGrey;
  const modelLabel = inferenceActive && embeddingActive ? "active" : inferenceActive || embeddingActive ? "partial" : "inactive";
  const memDot = dreamActive && reflectActive ? "var(--success)" : dreamActive || reflectActive ? "var(--warning)" : inactiveGrey;
  const memText = dreamActive && reflectActive ? "var(--success)" : dreamActive || reflectActive ? "var(--warning)" : inactiveGrey;
  const memLabel = dreamActive && reflectActive ? "active" : dreamActive || reflectActive ? "partial" : "inactive";

  return (
    <div className="absolute top-0 right-4 pointer-events-auto select-none text-right">
      <div className="flex items-center gap-1.5 justify-end">
        {!compact && (
          <span className="font-mono" style={{ color: "var(--accent)" }}>
            Neural Map
          </span>
        )}
        {!compact && (
          <span className="font-mono" style={{ color: "var(--text-faint)" }}>
            {filteredCount}
          </span>
        )}
        <span
          className="h-[5px] w-[5px] rounded-full"
          style={{ background: status === "..." ? "var(--text-faint)" : dotColor }}
        />
        <span className="font-mono" style={{ color: status === "..." ? "var(--text-faint)" : textColor }}>
          {status}
        </span>
      </div>
      {!compact && (
      <div className="mt-1 space-y-0.5">
          {/* Models section — collapsible */}
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => toggleSection("model")}
              className="font-mono transition active:scale-95"
              style={{ color: "var(--text-faint)" }}
            >
              {!(collapsed.model ?? true) ? "−" : "+"} models︱
            </button>
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: modelDot }}
            />
            <span
              className="font-mono cursor-pointer"
              onClick={() => toggleSection("model")}
              style={{ color: modelText }}
            >
              {modelLabel}
            </span>
          </div>
          {!(collapsed.model ?? true) && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                {inferenceModelLabel || "inference"}︱
              </span>
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: inferenceActive ? "var(--success)" : "var(--text-faint)" }}
              />
              <span className="font-mono" style={{ color: inferenceActive ? "var(--success)" : "var(--text-faint)" }}>
                {inferenceActive ? "live" : "offline"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 justify-end">
              <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                {embeddingModelLabel || "embedding"}︱
              </span>
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: embeddingActive ? "var(--success)" : "var(--text-faint)" }}
              />
              <span className="font-mono" style={{ color: embeddingActive ? "var(--success)" : "var(--text-faint)" }}>
                {embeddingActive ? "live" : "offline"}
              </span>
            </div>
          </div>
          )}

          {/* Memory section — collapsible */}
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => toggleSection("memory")}
              className="font-mono transition active:scale-95"
              style={{ color: "var(--text-faint)" }}
            >
              {!(collapsed.memory ?? true) ? "−" : "+"} memory︱
            </button>
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: memDot }}
            />
            <span
              className="font-mono cursor-pointer"
              onClick={() => toggleSection("memory")}
              style={{ color: memText }}
            >
              {memLabel}
            </span>
          </div>
          {!(collapsed.memory ?? true) && (
          <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={toggleDreamSchedule}
              disabled={dreamToggling}
              className="font-mono transition active:scale-95"
              style={{ color: "var(--text-faint)" }}
            >
              dream︱
            </button>
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: dreamActive ? "var(--success)" : "var(--text-faint)" }}
            />
            <span
              className="font-mono cursor-pointer"
              onClick={toggleDreamSchedule}
              style={{ color: dreamActive ? "var(--success)" : "var(--text-faint)" }}
            >
              {dreamToggling ? "..." : dreamActive ? "active" : "inactive"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={toggleReflectSchedule}
              disabled={reflectToggling}
              className="font-mono transition active:scale-95"
              style={{ color: "var(--text-faint)" }}
            >
              reflect︱
            </button>
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: reflectActive ? "var(--success)" : "var(--text-faint)" }}
            />
            <span
              className="font-mono cursor-pointer"
              onClick={toggleReflectSchedule}
              style={{ color: reflectActive ? "var(--success)" : "var(--text-faint)" }}
            >
              {reflectToggling ? "..." : reflectActive ? "active" : "inactive"}
            </span>
          </div>
          </div>
          )}
      </div>
      )}
    </div>
  );
}
