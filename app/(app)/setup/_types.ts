export type { ProviderDef, EmbProvider, EmbModel } from "@/lib/model-types";
export type { CogFunc } from "@/lib/active-model-store";

// ── Detection ────────────────────────────────────────────────────

export interface Platform {
  os: string;
  arch: string;
  isAppleSilicon: boolean;
  cpuModel: string;
}

export interface DetectResult {
  platform: Platform;
  backends: {
    mlx: {
      available: boolean;
      inference: boolean;
      inferenceModel: string | null;
      embedding: boolean;
      embeddingModel: string | null;
      embeddingDims: number | null;
    };
    ollama: {
      available: boolean;
      inferenceModels: string[];
      embeddingModels: string[];
    };
    cloud: {
      available: boolean;
      configured: boolean;
    };
  };
  recommended: string;
}

// ── Wizard ───────────────────────────────────────────────────────

export type Step = "inference" | "embedding" | "storage";

export const STEPS: Step[] = ["inference", "embedding", "storage"];

export interface FuncAssignment {
  model: string;
  provider: string;
}

export interface ServerAction {
  loading: boolean;
  error: string | null;
}

export interface SetupWizardState {
  // Navigation
  step: Step;
  goTo: (step: Step) => void;

  // Detection (invisible, runs on mount)
  detecting: boolean;
  detection: DetectResult | null;
  osLabel: string;

  // Inference
  infBackend: string;
  setInfBackend: (b: string) => void;
  sameForAll: boolean;
  toggleSameForAll: () => void;
  assignments: Record<string, FuncAssignment>;
  setAllAssignments: (model: string, provider: string) => void;
  setFuncAssignment: (fn: string, model: string) => void;
  cloudApiKey: string;
  setCloudApiKey: (v: string) => void;
  cloudBaseUrl: string;
  setCloudBaseUrl: (v: string) => void;
  cloudProvider: string;
  setCloudProvider: (id: string) => void;
  getInfModels: () => { id: string; name: string; description: string }[];

  // Server management
  startingServer: ServerAction;
  handleStartServer: (provider: "mlx" | "ollama") => Promise<void>;
  installingModel: { loading: boolean; progress: string | null };
  handleInstallModel: (model: string, provider: string) => Promise<void>;

  // Embedding
  embBackend: string;
  setEmbBackend: (b: string) => void;
  embModel: string;
  setEmbModel: (id: string) => void;
  embDims: number;
  setEmbDims: (d: number) => void;
  embApiKey: string;
  setEmbApiKey: (v: string) => void;
  embBaseUrl: string;
  setEmbBaseUrl: (v: string) => void;
  getEmbModels: () => { id: string; name: string; dims: number; size?: string; desc: string }[];

  // Test
  testingInf: boolean;
  testInfResult: { ok: boolean; error?: string } | null;
  handleTestInference: () => Promise<void>;
  testingEmb: boolean;
  testEmbResult: { ok: boolean; error?: string } | null;
  handleTestEmbedding: () => Promise<void>;

  // Save
  saving: boolean;
  saveError: string | null;
  handleSave: () => Promise<void>;

  // Migration
  migrating: boolean;
  migrationProgress: { phase: string; done?: number; total?: number; percent?: number } | null;
  migrationError: string | null;

  // Re-detect
  handleRescan: () => Promise<void>;
}
