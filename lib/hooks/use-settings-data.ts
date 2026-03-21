"use client";

import { useEffect, useState, useCallback } from "react";
import { modelDisplayName } from "@/lib/model-display";

export function useSettingsData() {
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [cortexSummary, setCortexSummary] = useState<string | null>(null);

  const refreshActiveModel = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setActiveModel(data.active || null);
    } catch {
      // ignore
    }
  }, []);

  const refreshCortexSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      const connected = [
        data.supabase?.connected && "DB",
        data.inference?.connected && "LLM",
      ].filter(Boolean);
      setCortexSummary(connected.length > 0 ? connected.join(" + ") : "Setup needed");
    } catch {
      setCortexSummary(null);
    }
  }, []);

  useEffect(() => {
    refreshActiveModel();
    refreshCortexSummary();
  }, [refreshActiveModel, refreshCortexSummary]);

  return {
    activeModel,
    activeModelDisplay: activeModel ? modelDisplayName(activeModel) : null,
    cortexSummary,
  };
}
