// ── Model display helpers (pure utilities, no state) ─────────

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

/** Short display name from full HF model ID */
export function modelDisplayName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1].replace(/-4bit$/, "").replace(/-8bit$/, "");
}
