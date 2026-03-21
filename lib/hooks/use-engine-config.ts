"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadEngineConfig,
  saveEngineConfig,
  DEFAULT_ENGINE_CONFIG,
  type EngineConfig,
} from "@/lib/engine-config";

/**
 * Shared hook for engine config state management.
 * Loads from localStorage on mount, saves + syncs to API on update.
 * Uses deep merge (one level) for nested objects like retrievalWeights, decayRates, typeBoosts.
 */
export function useEngineConfig(): [EngineConfig, (partial: Partial<EngineConfig>) => void] {
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_ENGINE_CONFIG);

  useEffect(() => {
    setConfig(loadEngineConfig());
  }, []);

  const update = useCallback((partial: Partial<EngineConfig>) => {
    setConfig((current) => {
      const updated = { ...current };
      for (const key of Object.keys(partial) as (keyof EngineConfig)[]) {
        const val = partial[key];
        if (
          val &&
          typeof val === "object" &&
          !Array.isArray(val) &&
          typeof updated[key] === "object" &&
          !Array.isArray(updated[key])
        ) {
          (updated as any)[key] = { ...(updated[key] as any), ...(val as any) };
        } else if (val !== undefined) {
          (updated as any)[key] = val;
        }
      }
      saveEngineConfig(updated);
      fetch("/api/cortex/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      }).catch(() => {});
      return updated;
    });
  }, []);

  return [config, update];
}
