// ── Chat Settings ──
// Runtime behavior toggles for chat — delegates to unified EngineConfig store.

import { loadEngineConfig, saveEngineConfig } from "./engine-config";

export interface ChatSettings {
  webSearchEnabled: boolean;
}

export function loadChatSettings(): ChatSettings {
  const ec = loadEngineConfig();
  return { webSearchEnabled: ec.webSearchEnabled };
}

export function saveChatSettings(settings: ChatSettings): void {
  const ec = loadEngineConfig();
  saveEngineConfig({ ...ec, webSearchEnabled: settings.webSearchEnabled });

  // Sync to API
  if (typeof window !== "undefined") {
    fetch("/api/cortex/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webSearchEnabled: settings.webSearchEnabled }),
    }).catch(() => {});
  }
}
