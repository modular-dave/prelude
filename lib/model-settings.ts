import type { CogFunc, Assignment } from "@/lib/active-model-store";

export interface ModelSettings {
  /** Per-function model assignments (chat, dream, reflect) */
  assignments: Record<CogFunc, Assignment | null>;
  knownModels: string[];
}

export const PRESET_MODELS = [
  "mlx-community/Qwen2.5-0.5B-Instruct-4bit",
  "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
  "mlx-community/Llama-3.2-1B-Instruct-4bit",
  "mlx-community/SmolLM2-360M-Instruct",
  "mlx-community/gemma-2-2b-it-4bit",
];

export const MODEL_DESCRIPTIONS: Record<string, string> = {
  "mlx-community/Qwen2.5-0.5B-Instruct-4bit": "Fast · best for quick replies",
  "mlx-community/Qwen2.5-1.5B-Instruct-4bit": "Balanced · best for chat",
  "mlx-community/Llama-3.2-1B-Instruct-4bit": "Best for reasoning & follow-up",
  "mlx-community/SmolLM2-360M-Instruct": "Tiny · best for low-resource devices",
  "mlx-community/gemma-2-2b-it-4bit": "Largest · best for nuanced responses",
};

const STORAGE_KEY = "prelude:model-settings";

const DEFAULT_SETTINGS: ModelSettings = {
  assignments: { chat: null, dream: null, reflect: null },
  knownModels: ["mlx-community/Qwen2.5-0.5B-Instruct-4bit"],
};

export function loadModelSettings(): ModelSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Migrate from old format (single activeModel) to per-function assignments
    if (parsed.activeModel && !parsed.assignments) {
      return {
        assignments: {
          chat: { model: parsed.activeModel, provider: "unknown" },
          dream: null,
          reflect: null,
        },
        knownModels: parsed.knownModels || DEFAULT_SETTINGS.knownModels,
      };
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveModelSettings(settings: ModelSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota exceeded
  }
}

// ── Per-function helpers ────────────────────────────────────────

export function getAssignment(fn: CogFunc): Assignment | null {
  return loadModelSettings().assignments[fn];
}

export function setAssignment(fn: CogFunc, model: string, provider: string): void {
  const settings = loadModelSettings();
  settings.assignments[fn] = { model, provider };
  if (!settings.knownModels.includes(model)) {
    settings.knownModels.push(model);
  }
  saveModelSettings(settings);
}

// ── Backward-compat aliases ────────────────────────────────────

export function getActiveModel(): string {
  const settings = loadModelSettings();
  return settings.assignments.chat?.model || "mlx-community/Qwen2.5-0.5B-Instruct-4bit";
}

export function setActiveModel(model: string): void {
  const settings = loadModelSettings();
  settings.assignments.chat = { model, provider: "unknown" };
  if (!settings.knownModels.includes(model)) {
    settings.knownModels.push(model);
  }
  saveModelSettings(settings);
}

export function addKnownModel(model: string): void {
  const settings = loadModelSettings();
  if (!settings.knownModels.includes(model)) {
    settings.knownModels.push(model);
    saveModelSettings(settings);
  }
}

export function removeKnownModel(model: string): void {
  const settings = loadModelSettings();
  settings.knownModels = settings.knownModels.filter((m) => m !== model);
  // Clear any assignments referencing the removed model
  for (const fn of ["chat", "dream", "reflect"] as CogFunc[]) {
    if (settings.assignments[fn]?.model === model) {
      settings.assignments[fn] = null;
    }
  }
  saveModelSettings(settings);
}

/** Short display name from full HF model ID */
export function modelDisplayName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1].replace(/-4bit$/, "").replace(/-8bit$/, "");
}
