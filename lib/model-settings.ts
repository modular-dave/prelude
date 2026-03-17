export interface ModelSettings {
  activeModel: string;
  knownModels: string[];
}

export const PRESET_MODELS = [
  "mlx-community/Qwen2.5-0.5B-Instruct-4bit",
  "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
  "mlx-community/Llama-3.2-1B-Instruct-4bit",
  "mlx-community/SmolLM2-360M-Instruct-4bit",
  "mlx-community/gemma-2-2b-it-4bit",
];

export const MODEL_DESCRIPTIONS: Record<string, string> = {
  "mlx-community/Qwen2.5-0.5B-Instruct-4bit": "Fast · best for quick replies",
  "mlx-community/Qwen2.5-1.5B-Instruct-4bit": "Balanced · best for chat",
  "mlx-community/Llama-3.2-1B-Instruct-4bit": "Best for reasoning & follow-up",
  "mlx-community/SmolLM2-360M-Instruct-4bit": "Tiny · best for low-resource devices",
  "mlx-community/gemma-2-2b-it-4bit": "Largest · best for nuanced responses",
};

const STORAGE_KEY = "prelude:model-settings";

const DEFAULT_SETTINGS: ModelSettings = {
  activeModel: "mlx-community/Qwen2.5-0.5B-Instruct-4bit",
  knownModels: ["mlx-community/Qwen2.5-0.5B-Instruct-4bit"],
};

export function loadModelSettings(): ModelSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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

export function getActiveModel(): string {
  return loadModelSettings().activeModel;
}

export function setActiveModel(model: string): void {
  const settings = loadModelSettings();
  settings.activeModel = model;
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
  if (settings.activeModel === model) {
    settings.activeModel = settings.knownModels[0] || DEFAULT_SETTINGS.activeModel;
  }
  saveModelSettings(settings);
}

/** Short display name from full HF model ID */
export function modelDisplayName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1].replace(/-4bit$/, "").replace(/-8bit$/, "");
}
