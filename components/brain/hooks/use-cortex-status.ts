"use client";

import { useState, useEffect, useCallback } from "react";

export interface CortexStatus {
  cortexOnline: boolean | null;
  activeModel: string | null;
  inferenceConnected: boolean;
  embeddingConnected: boolean;
  dreamToggling: boolean;
  reflectToggling: boolean;
  inferenceModelLabel: string | null;
  embeddingModelLabel: string | null;
  toggleDreamSchedule: () => Promise<void>;
  toggleReflectSchedule: () => Promise<void>;
}

/**
 * Probes cortex/inference/embedding status on mount and provides
 * toggle callbacks for dream + reflection schedules.
 */
export function useCortexStatus(
  retrievalSettings: { dreamScheduleEnabled: boolean; reflectionScheduleEnabled: boolean },
  updateRetrievalSettings: (patch: Partial<{ dreamScheduleEnabled: boolean; reflectionScheduleEnabled: boolean }>) => void,
): CortexStatus {
  const [cortexOnline, setCortexOnline] = useState<boolean | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [inferenceConnected, setInferenceConnected] = useState(false);
  const [embeddingConnected, setEmbeddingConnected] = useState(false);
  const [dreamToggling, setDreamToggling] = useState(false);
  const [reflectToggling, setReflectToggling] = useState(false);
  const [inferenceModelLabel, setInferenceModelLabel] = useState<string | null>(null);
  const [embeddingModelLabel, setEmbeddingModelLabel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Fetch config (env vars) + status (schedules) immediately for fast render
        const [configRes, statusRes] = await Promise.all([
          fetch("/api/config"),
          fetch("/api/status"),
        ]);
        const configData = await configRes.json();
        const statusData = await statusRes.json();
        if (configData.inference?.model) setInferenceModelLabel(`${configData.inference.provider} · ${configData.inference.model.split("/").pop()}`);
        if (configData.embedding?.model) setEmbeddingModelLabel(`${configData.embedding.provider} · ${configData.embedding.model.split("/").pop()}`);
        updateRetrievalSettings({
          dreamScheduleEnabled: statusData.schedules?.dream ?? false,
          reflectionScheduleEnabled: statusData.schedules?.reflection ?? false,
        });

        // Then probe actual service availability (slower but accurate)
        const probeRes = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "probe" }),
        });
        const probe = await probeRes.json();
        setCortexOnline(probe.supabase?.ok ?? false);
        setInferenceConnected(probe.inference?.ok ?? false);
        setEmbeddingConnected(probe.embedding?.ok ?? false);
        if (probe.inference?.ok && probe.inference.model) {
          setActiveModel(probe.inference.model);
          setInferenceModelLabel(`${probe.inference.provider} · ${probe.inference.model.split("/").pop()}`);
        }
        if (probe.embedding?.ok && probe.embedding.model) {
          setEmbeddingModelLabel(`${probe.embedding.provider} · ${probe.embedding.model.split("/").pop()}`);
        }
      } catch {
        setCortexOnline(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDreamSchedule = useCallback(async () => {
    setDreamToggling(true);
    try {
      const method = retrievalSettings.dreamScheduleEnabled ? "DELETE" : "POST";
      await fetch("/api/dream/schedule", { method });
      updateRetrievalSettings({ dreamScheduleEnabled: !retrievalSettings.dreamScheduleEnabled });
    } finally {
      setDreamToggling(false);
    }
  }, [retrievalSettings.dreamScheduleEnabled, updateRetrievalSettings]);

  const toggleReflectSchedule = useCallback(async () => {
    setReflectToggling(true);
    try {
      const action = retrievalSettings.reflectionScheduleEnabled ? "stop" : "start";
      await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: action }),
      });
      updateRetrievalSettings({ reflectionScheduleEnabled: !retrievalSettings.reflectionScheduleEnabled });
    } finally {
      setReflectToggling(false);
    }
  }, [retrievalSettings.reflectionScheduleEnabled, updateRetrievalSettings]);

  return {
    cortexOnline,
    activeModel,
    inferenceConnected,
    embeddingConnected,
    dreamToggling,
    reflectToggling,
    inferenceModelLabel,
    embeddingModelLabel,
    toggleDreamSchedule,
    toggleReflectSchedule,
  };
}
