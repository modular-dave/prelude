"use client";

import { useState, useCallback } from "react";

export interface ServerStatus {
  running: boolean;
  available: boolean;
  binaryInstalled: boolean;
}

export interface ServerControlState {
  status: Record<string, ServerStatus>;
  starting: string | null;
  stopping: string | null;
  error: string | null;
  start: (provider: "mlx" | "ollama", model?: string) => Promise<boolean>;
  stop: (provider: "mlx" | "ollama") => Promise<boolean>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export function useServerControl(onRefresh?: () => Promise<void>): ServerControlState {
  const [status, setStatus] = useState<Record<string, ServerStatus>>({});
  const [starting, setStarting] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ollamaRes, mlxRes] = await Promise.all([
        fetch("/api/models?provider=ollama").then(r => r.json()).catch(() => ({})),
        fetch("/api/models?provider=mlx").then(r => r.json()).catch(() => ({})),
      ]);
      setStatus({
        ollama: {
          running: ollamaRes.running ?? false,
          available: ollamaRes.running ?? ollamaRes.binaryInstalled ?? false,
          binaryInstalled: ollamaRes.binaryInstalled ?? false,
        },
        mlx: {
          running: mlxRes.running ?? false,
          available: mlxRes.running ?? mlxRes.binaryInstalled ?? false,
          binaryInstalled: mlxRes.binaryInstalled ?? false,
        },
      });
    } catch {
      // Silently fail — status stays as-is
    }
  }, []);

  const start = useCallback(async (provider: "mlx" | "ollama", model?: string): Promise<boolean> => {
    setStarting(provider);
    setError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", provider, model }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to start ${provider}`);
        return false;
      }
      await refresh();
      await onRefresh?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      return false;
    } finally {
      setStarting(null);
    }
  }, [refresh, onRefresh]);

  const stop = useCallback(async (provider: "mlx" | "ollama"): Promise<boolean> => {
    setStopping(provider);
    setError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", provider }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to stop ${provider}`);
        return false;
      }
      await refresh();
      await onRefresh?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      return false;
    } finally {
      setStopping(null);
    }
  }, [refresh, onRefresh]);

  return {
    status,
    starting,
    stopping,
    error,
    start,
    stop,
    refresh,
    clearError: () => setError(null),
  };
}
