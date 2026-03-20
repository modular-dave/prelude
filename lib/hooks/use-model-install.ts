"use client";

import { useState, useCallback, useRef } from "react";

export interface ModelInstallState {
  installing: string | null;
  progress: string | null;
  downloadPercent: Record<string, number>;
  error: string | null;
  install: (model: string, provider: string) => Promise<void>;
  cancel: (model?: string) => void;
  uninstall: (model: string, provider: string) => Promise<void>;
  clearError: () => void;
}

export function useModelInstall(onComplete?: () => Promise<void>): ModelInstallState {
  const [installing, setInstalling] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const install = useCallback(async (model: string, provider: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setInstalling(trimmed);
    setProgress("starting...");
    setError(null);
    setDownloadPercent(p => ({ ...p, [trimmed]: 0 }));

    try {
      const res = await fetch(
        `/api/models/install?model=${encodeURIComponent(trimmed)}&provider=${encodeURIComponent(provider)}`,
        { signal: controller.signal },
      );
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to install model");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const data = line.startsWith("data: ") ? line.slice(6).trim() : line.trim();
          if (!data) continue;
          try {
            const ev = JSON.parse(data);
            if (ev.status === "done") {
              setProgress(null);
              await onComplete?.();
              return;
            }
            if (ev.status === "error") {
              setError(ev.error || "Install failed");
              return;
            }
            if (ev.percent != null) {
              const pct = Math.round(ev.percent);
              setProgress(`${pct}%`);
              setDownloadPercent(p => ({ ...p, [trimmed]: pct }));
            } else if (ev.status) {
              setProgress(ev.status);
            }
          } catch { /* partial SSE chunk */ }
        }
      }
      await onComplete?.();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Cancelled by user
      } else {
        setError(e instanceof Error ? e.message : "failed");
      }
    } finally {
      abortRef.current = null;
      setInstalling(null);
      setProgress(null);
      setDownloadPercent(p => {
        const next = { ...p };
        delete next[trimmed];
        return next;
      });
    }
  }, [onComplete]);

  const cancel = useCallback((model?: string) => {
    abortRef.current?.abort();
  }, []);

  const uninstall = useCallback(async (model: string, provider: string) => {
    setError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall", model, provider }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to uninstall model");
        return;
      }
      await onComplete?.();
    } catch {
      setError("Failed to connect to backend");
    }
  }, [onComplete]);

  return {
    installing,
    progress,
    downloadPercent,
    error,
    install,
    cancel,
    uninstall,
    clearError: () => setError(null),
  };
}
