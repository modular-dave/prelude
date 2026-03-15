// Re-export Cortex SDK types as the single source of truth
export type {
  MemoryType,
  Memory,
  MemorySummary,
  MemoryStats,
  RecallOptions,
  StoreMemoryOptions,
  MemoryLinkType,
  MemoryConcept,
  DreamOptions,
} from "clude-bot";

// Entity graph types — re-exported via lib/clude.ts which uses require() to
// bypass the package.json exports restriction
export type { Entity, EntityType, EntityMention } from "@/lib/clude";

// EntityRelation is used by some components but not re-exported from clude.ts
// Define it locally to match the Cortex shape
export interface EntityRelation {
  id: number;
  source_entity_id: number;
  target_entity_id: number;
  relation_type: string;
  weight: number;
  context?: string;
  created_at: string;
}

// Re-import MemoryType for use in display constants
import type { MemoryType } from "clude-bot";

// ── Display-only constants (UI layer) ──────────────────────────

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

export const LINK_TYPE_COLORS: Record<string, string> = {
  supports: "#22c55e",
  contradicts: "#ef4444",
  elaborates: "#3b82f6",
  causes: "#f97316",
  follows: "#8b5cf6",
  relates: "#6b7280",
  resolves: "#14b8a6",
  conversation: "#a78bfa",
};

export const LINK_TYPE_LABELS: Record<string, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  elaborates: "Elaborates",
  causes: "Causes",
  follows: "Follows",
  relates: "Relates",
  resolves: "Resolves",
  conversation: "Conversation",
};

// ── Cortex knowledge graph shape (from getKnowledgeGraph()) ────

export interface KnowledgeGraphData {
  nodes: Array<{ id: string; type: string; label: string; size: number }>;
  edges: Array<{ source: string; target: string; type: string; weight: number }>;
}

export interface GraphStats {
  entityCount: number;
  relationCount: number;
  mentionCount: number;
  topEntities: Array<{ name: string; type: string; mentions: number }>;
}

export type ViewMode = "hebbian" | "retrieved";
