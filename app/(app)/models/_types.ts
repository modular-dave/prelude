import type { CogFunc } from "@/lib/active-model-store";

// ── Provider Definitions ────────────────────────────────────────

export interface ProviderDef {
  id: string;
  name: string;
  description: string;
  url: string;
  envVars: { key: string; label: string; required: boolean; placeholder: string }[];
  models: { id: string; name: string; description: string; size?: string; ram?: string }[];
}

export const LOCAL_PROVIDERS: ProviderDef[] = [
  {
    id: "ollama",
    name: "Ollama",
    description: "Run open-source models locally. Works on macOS, Linux, and Windows.",
    url: "https://ollama.com",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "http://127.0.0.1:11434/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: false, placeholder: "local" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "qwen2.5:0.5b" },
    ],
    models: [
      { id: "qwen2.5:0.5b", name: "Qwen 2.5 0.5B", description: "Fast, lightweight", size: "400MB", ram: "1 GB" },
      { id: "llama3.2:1b", name: "Llama 3.2 1B", description: "Best for reasoning", size: "700MB", ram: "1.5 GB" },
      { id: "qwen2.5:1.5b", name: "Qwen 2.5 1.5B", description: "Balanced speed and quality", size: "1GB", ram: "2 GB" },
      { id: "gemma2:2b", name: "Gemma 2 2B", description: "Google, nuanced responses", size: "1.6GB", ram: "2.5 GB" },
      { id: "qwen2.5:3b", name: "Qwen 2.5 3B", description: "Good quality, moderate speed", size: "2GB", ram: "3 GB" },
      { id: "llama3.2:3b", name: "Llama 3.2 3B", description: "Strong reasoning, larger", size: "2GB", ram: "3 GB" },
      { id: "phi3:mini", name: "Phi-3 Mini", description: "Microsoft, 3.8B params", size: "2.3GB", ram: "3.5 GB" },
    ],
  },
  {
    id: "mlx",
    name: "MLX (Apple Silicon)",
    description: "Native Apple Silicon inference via mlx-lm. macOS only, fastest on M-series chips.",
    url: "https://github.com/ml-explore/mlx-lm",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "http://127.0.0.1:8080/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: false, placeholder: "local" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "mlx-community/Qwen2.5-1.5B-Instruct-4bit" },
    ],
    models: [
      { id: "mlx-community/SmolLM2-360M-Instruct", name: "SmolLM2 360M", description: "Tiny, low-resource devices", size: "200MB", ram: "0.5 GB" },
      { id: "mlx-community/Qwen2.5-0.5B-Instruct-4bit", name: "Qwen 2.5 0.5B", description: "Fast, best for quick replies", size: "280MB", ram: "0.5 GB" },
      { id: "mlx-community/Llama-3.2-1B-Instruct-4bit", name: "Llama 3.2 1B", description: "Best for reasoning", size: "680MB", ram: "1 GB" },
      { id: "mlx-community/Qwen2.5-1.5B-Instruct-4bit", name: "Qwen 2.5 1.5B", description: "Balanced, best for chat", size: "840MB", ram: "1.5 GB" },
      { id: "mlx-community/gemma-2-2b-it-4bit", name: "Gemma 2 2B", description: "Largest, nuanced responses", size: "1.4GB", ram: "2 GB" },
    ],
  },
  {
    id: "llamacpp",
    name: "llama.cpp Server",
    description: "High-performance C++ inference. Runs GGUF models on CPU or GPU.",
    url: "https://github.com/ggerganov/llama.cpp",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "http://127.0.0.1:8080/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: false, placeholder: "local" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "model-name" },
    ],
    models: [],
  },
];

export const HOSTED_PROVIDERS: ProviderDef[] = [
  {
    id: "venice",
    name: "Venice AI",
    description: "Permissionless, private inference. No data retention. Supports Claude, GPT, open-source models.",
    url: "https://venice.ai",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: false, placeholder: "https://api.venice.ai/api/v1 (default)" },
      { key: "VENICE_API_KEY", label: "API Key", required: true, placeholder: "your-venice-api-key" },
      { key: "VENICE_MODEL", label: "Model", required: false, placeholder: "auto (per cognitive function)" },
    ],
    models: [
      { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", description: "Quality replies (via Venice)" },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6", description: "Best for reflection & emergence" },
      { id: "llama-3.3-70b", name: "Llama 3.3 70B", description: "General purpose, fast" },
      { id: "qwen3-235b-a22b-thinking-2507", name: "Qwen3 235B Thinking", description: "Deep reasoning for dreams" },
      { id: "deepseek-v3.2", name: "DeepSeek V3.2", description: "Strong open-source frontier" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified API for 100+ models. Pay-per-token, no commitments.",
    url: "https://openrouter.ai",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "https://openrouter.ai/api/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: true, placeholder: "your-openrouter-key" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "meta-llama/llama-3.3-70b-instruct" },
    ],
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", description: "Fast, general purpose" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", description: "Best quality" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast, multimodal" },
      { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B", description: "Frontier open-source" },
    ],
  },
  {
    id: "together",
    name: "Together AI",
    description: "Fast inference for open-source models. Good pricing for high-volume.",
    url: "https://together.ai",
    envVars: [
      { key: "VENICE_BASE_URL", label: "Base URL", required: true, placeholder: "https://api.together.xyz/v1" },
      { key: "VENICE_API_KEY", label: "API Key", required: true, placeholder: "your-together-key" },
      { key: "VENICE_MODEL", label: "Model", required: true, placeholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    ],
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", description: "Optimized for speed" },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", name: "Qwen 2.5 72B Turbo", description: "Strong multilingual" },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", description: "Frontier open-source" },
    ],
  },
];

export const COG_FUNCS: { key: CogFunc; label: string; color: string }[] = [
  { key: "chat", label: "Chat", color: "var(--accent)" },
  { key: "dream", label: "Dream", color: "#a855f7" },
  { key: "reflect", label: "Reflect", color: "var(--warning)" },
];

// ── Embedding Types & Providers ──────────────────────────────

export interface EmbSlotConfig {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  dimensions: number | null;
}

export interface EmbModel {
  id: string;
  name: string;
  dims: number;
  size?: string;
  desc: string;
}

export interface EmbProvider {
  id: string;
  name: string;
  desc: string;
  url?: string;
  baseUrl: string;
  models: EmbModel[];
}

export interface EmbeddingConfig {
  embedding: {
    provider: string | null;
    model: string | null;
    baseUrl: string | null;
    dimensions: number | null;
    connected: boolean;
  };
  embeddingSlots: {
    test: EmbSlotConfig | null;
    publish: EmbSlotConfig | null;
  };
  embeddingKeys: Record<string, boolean>;
}

export const EMB_LOCAL: EmbProvider[] = [
  {
    id: "ollama",
    name: "Ollama (Windows, Linux)",
    desc: "Uses Ollama server (shared with inference)",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: [
      { id: "nomic-embed-text", name: "nomic-embed-text", dims: 768, size: "274 MB", desc: "Best overall ︱ 0.3 GB RAM" },
      { id: "mxbai-embed-large", name: "mxbai-embed-large", dims: 1024, size: "670 MB", desc: "High quality, large ︱ 0.7 GB RAM" },
      { id: "all-minilm", name: "all-minilm", dims: 384, size: "46 MB", desc: "Fast, lightweight ︱ 0.1 GB RAM" },
      { id: "snowflake-arctic-embed", name: "snowflake-arctic-embed", dims: 768, size: "274 MB", desc: "Snowflake, strong benchmarks ︱ 0.3 GB RAM" },
    ],
  },
  {
    id: "mlx",
    name: "MLX (Apple Silicon)",
    desc: "Dedicated server via mlx_embeddings",
    baseUrl: "http://127.0.0.1:11435/v1",
    models: [
      { id: "sentence-transformers/all-MiniLM-L6-v2", name: "all-MiniLM-L6-v2", dims: 384, size: "91 MB", desc: "Fast, best for general use ︱ 0.1 GB RAM" },
      { id: "nomic-ai/nomic-embed-text-v1.5", name: "nomic-embed-text-v1.5", dims: 768, size: "548 MB", desc: "High quality, Matryoshka ︱ 0.5 GB RAM" },
      { id: "BAAI/bge-small-en-v1.5", name: "bge-small-en-v1.5", dims: 384, size: "133 MB", desc: "Compact, strong benchmarks ︱ 0.2 GB RAM" },
      { id: "BAAI/bge-base-en-v1.5", name: "bge-base-en-v1.5", dims: 768, size: "438 MB", desc: "Balanced ︱ 0.5 GB RAM" },
      { id: "sentence-transformers/all-mpnet-base-v2", name: "all-mpnet-base-v2", dims: 768, size: "438 MB", desc: "Highest quality, slower ︱ 0.5 GB RAM" },
    ],
  },
];

export const EMB_HOSTED: EmbProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    desc: "Industry standard embedding API",
    url: "https://platform.openai.com",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "text-embedding-3-small", name: "text-embedding-3-small", dims: 1536, size: "hosted", desc: "Fast, cost-effective" },
      { id: "text-embedding-3-large", name: "text-embedding-3-large", dims: 3072, size: "hosted", desc: "Highest quality" },
    ],
  },
  {
    id: "voyage",
    name: "Voyage AI",
    desc: "High-quality embeddings, strong for code",
    url: "https://www.voyageai.com",
    baseUrl: "https://api.voyageai.com/v1",
    models: [
      { id: "voyage-3", name: "voyage-3", dims: 1024, size: "hosted", desc: "Best overall quality" },
      { id: "voyage-3-lite", name: "voyage-3-lite", dims: 512, size: "hosted", desc: "Fast, cost-effective" },
      { id: "voyage-code-3", name: "voyage-code-3", dims: 1024, size: "hosted", desc: "Optimized for code" },
    ],
  },
];

export type EmbType = "test" | "publish";

export const EMB_TYPES: { key: EmbType; label: string; color: string }[] = [
  { key: "test", label: "Test", color: "#a855f7" },
  { key: "publish", label: "Publish", color: "var(--success)" },
];
