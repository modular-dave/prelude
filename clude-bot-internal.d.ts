// Type declarations for internal clude-bot modules not exposed via package.json exports.
// These modules exist at runtime but TypeScript needs explicit declarations.

declare module "clude-bot/dist/core/memory-graph" {
  import type { Memory, MemoryType } from "clude-bot";

  export type EntityType = "person" | "project" | "concept" | "token" | "wallet" | "location" | "event";

  export interface Entity {
    id: number;
    entity_type: EntityType;
    name: string;
    normalized_name: string;
    aliases: string[];
    description: string | null;
    metadata: Record<string, unknown>;
    mention_count: number;
    first_seen: string;
    last_seen: string;
    embedding: number[] | null;
  }

  export interface EntityMention {
    id: number;
    entity_id: number;
    memory_id: number;
    context: string;
    salience: number;
    created_at: string;
  }

  export interface EntityRelation {
    id: number;
    source_entity_id: number;
    target_entity_id: number;
    relation_type: string;
    strength: number;
    evidence_memory_ids: number[];
    created_at: string;
  }

  export function findOrCreateEntity(
    name: string,
    entityType: EntityType,
    opts?: { aliases?: string[]; description?: string; metadata?: Record<string, unknown> }
  ): Promise<Entity | null>;

  export function createEntityMention(
    entityId: number,
    memoryId: number,
    context: string,
    salience?: number
  ): Promise<void>;

  export function getMemoriesByEntity(
    entityId: number,
    opts?: { limit?: number; memoryTypes?: MemoryType[] }
  ): Promise<Memory[]>;

  export function getEntitiesInMemory(memoryId: number): Promise<Entity[]>;

  export function getEntityCooccurrences(
    entityId: number,
    opts?: { minCooccurrence?: number; maxResults?: number }
  ): Promise<Array<{ related_entity_id: number; cooccurrence_count: number; avg_salience: number }>>;

  export function createEntityRelation(
    sourceEntityId: number,
    targetEntityId: number,
    relationType: string,
    evidenceMemoryId?: number,
    strength?: number
  ): Promise<void>;

  export function extractEntitiesFromText(
    text: string
  ): Array<{ name: string; type: EntityType }>;

  export function extractAndLinkEntities(
    memoryId: number,
    content: string,
    summary: string,
    relatedUser?: string
  ): Promise<void>;

  export function getKnowledgeGraph(opts?: {
    entityTypes?: EntityType[];
    minMentions?: number;
    includeMemories?: boolean;
    limit?: number;
  }): Promise<{
    nodes: Array<{ id: string; type: string; label: string; size: number }>;
    edges: Array<{ source: string; target: string; type: string; weight: number }>;
  }>;

  export function findSimilarEntities(
    query: string,
    opts?: { limit?: number; entityTypes?: EntityType[] }
  ): Promise<Entity[]>;

  export function getGraphStats(): Promise<{
    entityCount: number;
    relationCount: number;
    mentionCount: number;
    topEntities: Array<{ name: string; type: string; mentions: number }>;
  }>;
}

declare module "clude-bot/dist/features/clinamen" {
  import type { Memory } from "clude-bot";

  export interface ClinamenMemory extends Memory {
    _divergence: number;
    _relevanceSim: number;
  }

  export interface ClinamenOptions {
    context: string;
    limit?: number;
    memoryTypes?: string[];
    minImportance?: number;
    maxRelevance?: number;
  }

  export function findClinamen(opts: ClinamenOptions): Promise<ClinamenMemory[]>;
}

declare module "clude-bot/dist/features/memory-trace" {
  export interface TraceNode {
    id: number;
    hash_id: string;
    summary: string;
    content: string;
    memory_type: string;
    source: string;
    importance: number;
    emotional_valence: number;
    decay_factor: number;
    access_count: number;
    created_at: string;
    last_accessed: string;
    tags: string[];
    concepts: string[];
    depth: number;
    relation: string;
    strength: number;
  }

  export interface TraceResult {
    root: TraceNode;
    ancestors: TraceNode[];
    descendants: TraceNode[];
    related: TraceNode[];
    links: Array<{ source_id: number; target_id: number; link_type: string; strength: number }>;
    entities: Array<{ id: number; name: string; entity_type: string; memory_count: number }>;
    timeline: TraceNode[];
    stats: {
      total_nodes: number;
      max_depth: number;
      link_types: Record<string, number>;
      time_span_days: number;
    };
  }

  export interface ExplainResult {
    explanation: string;
    trace_summary: string;
    key_memories: Array<{ id: number; summary: string; relevance: string }>;
    reasoning_chain: string[];
  }

  export function traceMemory(memoryId: number, maxDepth?: number): Promise<TraceResult | null>;
  export function explainMemory(memoryId: number, question: string): Promise<ExplainResult | null>;
}

declare module "clude-bot/dist/features/action-learning" {
  export interface ActionRecord {
    actionId: string;
    action: string;
    reasoning: string;
    feature: string;
    relatedUser?: string;
    trigger?: string;
    metadata?: Record<string, any>;
  }

  export interface OutcomeRecord {
    actionId: string;
    outcome: string;
    sentiment: "positive" | "negative" | "neutral";
    score?: number;
    measureMethod: string;
    metadata?: Record<string, any>;
  }

  export function logAction(record: ActionRecord): Promise<number | null>;
  export function logOutcome(record: OutcomeRecord): Promise<number | null>;
  export function refineStrategies(): Promise<string[]>;
}

declare module "clude-bot/dist/core/database" {
  interface SupabaseClient {
    from(table: string): any;
  }
  export function getDb(): SupabaseClient;
}
