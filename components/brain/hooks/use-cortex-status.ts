"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PORTS } from "@/lib/provider-registry";

// ── Probe cache + dedup — avoid re-probing on every mount (60s TTL) ──
let probeCache: { data: any; ts: number } | null = null;
let probeInflight: Promise<any> | null = null;
const PROBE_TTL = 60_000;

// ── Embedding auto-start — only attempt once per app session ──
let embAutoStartAttempted = false;

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
        // Use cached result if fresh enough to avoid 15s+ hangs on every mount
        let probe: any;
        if (probeCache && Date.now() - probeCache.ts < PROBE_TTL) {
          probe = probeCache.data;
        } else if (probeInflight) {
          probe = await probeInflight;
        } else {
          probeInflight = fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "probe" }),
          }).then(r => r.json()).then(d => { probeCache = { data: d, ts: Date.now() }; probeInflight = null; return d; })
            .catch(() => { probeInflight = null; return {}; });
          probe = await probeInflight;
        }
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

        // ── Auto-start embedding server if configured but not running ──
        if (!embAutoStartAttempted && !probe.embedding?.ok && configData.embedding?.model) {
          const embProvider = configData.embedding.provider;
          if (embProvider === "mlx") {
            embAutoStartAttempted = true;
            const port = PORTS.mlxEmbedding;
            fetch("/api/cortex/embedding", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "spawn", model: configData.embedding.model, port }),
            }).then(async (r) => {
              const d = await r.json().catch(() => ({}));
              if (r.ok && d.ok !== false) setEmbeddingConnected(true);
            }).catch(() => { /* fire-and-forget */ });
          }
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
