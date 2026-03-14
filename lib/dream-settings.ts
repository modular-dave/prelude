export interface DreamSettings {
  clusterMinSize: number;
  compactionMaxImportance: number;
  compactionMaxDecay: number;
  contradictionMinValenceDiff: number;
  contradictionMaxResults: number;
  emergenceMaxConnections: number;
}

export const DEFAULT_DREAM_SETTINGS: DreamSettings = {
  clusterMinSize: 2,
  compactionMaxImportance: 0.3,
  compactionMaxDecay: 0.5,
  contradictionMinValenceDiff: 0.5,
  contradictionMaxResults: 5,
  emergenceMaxConnections: 6,
};

export interface DreamPreset {
  name: string;
  settings: DreamSettings;
  builtIn?: boolean;
}

export const BUILT_IN_PRESETS: DreamPreset[] = [
  {
    name: "Default",
    settings: { ...DEFAULT_DREAM_SETTINGS },
    builtIn: true,
  },
  {
    name: "Deep Clean",
    settings: {
      clusterMinSize: 2,
      compactionMaxImportance: 0.5,
      compactionMaxDecay: 0.7,
      contradictionMinValenceDiff: 0.3,
      contradictionMaxResults: 10,
      emergenceMaxConnections: 4,
    },
    builtIn: true,
  },
  {
    name: "Creative",
    settings: {
      clusterMinSize: 3,
      compactionMaxImportance: 0.2,
      compactionMaxDecay: 0.3,
      contradictionMinValenceDiff: 0.3,
      contradictionMaxResults: 8,
      emergenceMaxConnections: 12,
    },
    builtIn: true,
  },
];

const SETTINGS_KEY = "prelude:dream-settings";
const PRESETS_KEY = "prelude:dream-presets";

export function loadDreamSettings(): DreamSettings {
  if (typeof window === "undefined") return { ...DEFAULT_DREAM_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_DREAM_SETTINGS };
    return { ...DEFAULT_DREAM_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DREAM_SETTINGS };
  }
}

export function saveDreamSettings(s: DreamSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // quota exceeded or private browsing
  }
}

export function loadDreamPresets(): DreamPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DreamPreset[];
  } catch {
    return [];
  }
}

export function saveDreamPresets(presets: DreamPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // quota exceeded or private browsing
  }
}
