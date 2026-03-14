export type MemoryType =
  | "episodic"
  | "semantic"
  | "procedural"
  | "self_model"
  | "introspective";

export interface Memory {
  id: number;
  memory_type: MemoryType;
  content: string;
  summary: string;
  tags: string[];
  concepts: string[];
  importance: number;
  decay_factor: number;
  access_count: number;
  emotional_valence: number;
  source: string;
  source_id?: string;
  related_user?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  last_accessed: string;
}

export interface GraphNode {
  id: number;
  name: string;
  val: number;
  color: string;
  type: MemoryType;
  importance: number;
}

export interface GraphLink {
  source: number;
  target: number;
  value: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface DreamPhase {
  name: string;
  description: string;
  status: "idle" | "running" | "complete";
  result?: string;
  reasoning?: string;
  lastRun?: string;
}

export const TYPE_COLORS: Record<MemoryType, string> = {
  episodic: "#1a3abf",
  semantic: "#3a4a7a",
  procedural: "#2a6a3a",
  self_model: "#5a3a80",
  introspective: "#9a3030",
};

export const TYPE_LABELS: Record<MemoryType, string> = {
  episodic: "Episodic",
  semantic: "Semantic",
  procedural: "Procedural",
  self_model: "Self Model",
  introspective: "Introspective",
};

export const DECAY_RATES: Record<MemoryType, number> = {
  episodic: 0.07,
  semantic: 0.02,
  procedural: 0.03,
  self_model: 0.01,
  introspective: 0.02,
};

export type ViewMode = "hebbian" | "retrieved";
