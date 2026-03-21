"use client";

import { useState, useEffect, useCallback } from "react";
import type { DetectResult, PlatformCapabilities } from "@/lib/detect-platform";

export function usePlatform(): {
  detection: DetectResult | null;
  capabilities: PlatformCapabilities | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [detection, setDetection] = useState<DetectResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect" }),
      });
      const data: DetectResult = await r.json();
      setDetection(data);
    } catch {
      // Detection failed — platform stays null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const capabilities: PlatformCapabilities | null = detection ? {
    canRunMLX: detection.platform.isAppleSilicon,
    canRunOllama: true,
    ollamaEmbeddingBroken: detection.platform.isAppleSilicon || detection.platform.os === "darwin",
    isDesktop: typeof window !== "undefined" && !("Capacitor" in window),
    isMobile: typeof window !== "undefined" && "Capacitor" in window,
  } : null;

  return { detection, capabilities, loading, refresh };
}
