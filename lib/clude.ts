import { ensureCortex } from "./cortex";
import type {
  MemoryType,
  Memory,
  MemorySummary,
  MemoryStats,
  MemoryLinkType,
  RecallOptions,
  StoreMemoryOptions,
} from "clude-bot";
import {
  getKnowledgeGraph,
  getGraphStats,
  getEntitiesInMemory,
  getEntityCooccurrences,
  getMemoriesByEntity,
  findSimilarEntities,
  extractAndLinkEntities,
} from "clude-bot/dist/core/memory-graph";
import type {
  Entity,
  EntityType,
  EntityMention,
} from "clude-bot/dist/core/memory-graph";
import { findClinamen } from "clude-bot/dist/features/clinamen";
import type { ClinamenMemory, ClinamenOptions } from "clude-bot/dist/features/clinamen";
import { traceMemory, explainMemory } from "clude-bot/dist/features/memory-trace";
import type { TraceResult, ExplainResult } from "clude-bot/dist/features/memory-trace";
import { logAction, logOutcome, refineStrategies } from "clude-bot/dist/features/action-learning";
import type { ActionRecord, OutcomeRecord } from "clude-bot/dist/features/action-learning";

// Re-export types for consumers
export type { MemoryType, Memory, MemorySummary, MemoryStats, MemoryLinkType };
export type { Entity, EntityType, EntityMention };
export type { ClinamenMemory, ClinamenOptions };
export type { TraceResult, ExplainResult };
export type { ActionRecord, OutcomeRecord };

// ── Memory CRUD ────────────────────────────────────────────────

export async function storeMemory(opts: {
  type: MemoryType;
  content: string;
  summary: string;
  tags?: string[];
  importance?: number;
  source?: string;
}): Promise<number | null> {
  const brain = await ensureCortex();
  return brain.store({
    type: opts.type,
    content: opts.content,
    summary: opts.summary,
    tags: opts.tags ?? [],
    importance: opts.importance ?? 0.5,
    source: opts.source ?? "prelude",
  });
}

export async function recallMemories(
  query: string,
  opts?: { limit?: number; types?: MemoryType[]; minImportance?: number; minDecay?: number }
) {
  const brain = await ensureCortex();
  return brain.recall({
    query,
    limit: opts?.limit ?? 10,
    memoryTypes: opts?.types,
    minImportance: opts?.minImportance,
    minDecay: opts?.minDecay,
  });
}

export async function recallSummaries(
  query: string,
  opts?: { limit?: number; types?: MemoryType[]; minImportance?: number; minDecay?: number }
) {
  const brain = await ensureCortex();
  return brain.recallSummaries({
    query,
    limit: opts?.limit ?? 10,
    memoryTypes: opts?.types,
    minImportance: opts?.minImportance,
    minDecay: opts?.minDecay,
  });
}

export async function hydrate(ids: number[]) {
  const brain = await ensureCortex();
  return brain.hydrate(ids);
}

export async function recent(hours: number, types?: MemoryType[], limit?: number) {
  const brain = await ensureCortex();
  return brain.recent(hours, types, limit);
}

export async function selfModel() {
  const brain = await ensureCortex();
  return brain.selfModel();
}

// ── Stats & Scoring ────────────────────────────────────────────

export async function getStats(): Promise<MemoryStats> {
  const brain = await ensureCortex();
  return brain.stats();
}

export async function scoreImportance(description: string): Promise<number> {
  const brain = await ensureCortex();
  return brain.scoreImportance(description);
}

export async function formatContext(memories: Memory[]): Promise<string> {
  const brain = await ensureCortex();
  return brain.formatContext(memories);
}

export async function inferConcepts(summary: string, source: string, tags: string[]): Promise<string[]> {
  const brain = await ensureCortex();
  return brain.inferConcepts(summary, source, tags);
}

// ── Memory Links ───────────────────────────────────────────────

export async function link(
  sourceId: number,
  targetId: number,
  type: MemoryLinkType,
  strength?: number
) {
  const brain = await ensureCortex();
  return brain.link(sourceId, targetId, type, strength);
}

// ── Decay ──────────────────────────────────────────────────────

export async function decay(): Promise<number> {
  const brain = await ensureCortex();
  return brain.decay();
}

// ── Dream Cycles ───────────────────────────────────────────────

export async function dream(opts?: { onEmergence?: (text: string) => Promise<void> }) {
  const brain = await ensureCortex();
  return brain.dream(opts);
}

// Use globalThis to share state across Next.js API route module boundaries
const g = globalThis as unknown as { __dreamScheduleActive?: boolean; __reflectionScheduleActive?: boolean };

export function isDreamScheduleActive(): boolean { return g.__dreamScheduleActive ?? false; }
export function isReflectionScheduleActive(): boolean { return g.__reflectionScheduleActive ?? false; }

export async function startDreamSchedule() {
  const brain = await ensureCortex();
  brain.startDreamSchedule();
  g.__dreamScheduleActive = true;
}

export async function stopDreamSchedule() {
  const brain = await ensureCortex();
  brain.stopDreamSchedule();
  g.__dreamScheduleActive = false;
}

// ── Active Reflection ──────────────────────────────────────────

export async function reflect(opts?: { onReflection?: (journal: unknown) => Promise<void> }) {
  const brain = await ensureCortex();
  return brain.reflect(opts);
}

export async function startReflectionSchedule() {
  const brain = await ensureCortex();
  brain.startReflectionSchedule();
  g.__reflectionScheduleActive = true;
}

export async function stopReflectionSchedule() {
  const brain = await ensureCortex();
  brain.stopReflectionSchedule();
  g.__reflectionScheduleActive = false;
}

// ── Entity Graph ───────────────────────────────────────────────
// These are module-level functions from clude-bot/dist/core/memory-graph.
// They operate on the same Supabase DB that Cortex initializes.
// We call ensureCortex() first to ensure the DB is ready.

export async function knowledgeGraph(opts?: {
  entityTypes?: EntityType[];
  minMentions?: number;
  includeMemories?: boolean;
  limit?: number;
}) {
  await ensureCortex();
  return getKnowledgeGraph(opts);
}

export async function graphStats() {
  await ensureCortex();
  return getGraphStats();
}

export async function entitiesInMemory(memoryId: number) {
  await ensureCortex();
  return getEntitiesInMemory(memoryId);
}

export async function entityCooccurrences(entityId: number, opts?: {
  minCooccurrence?: number;
  maxResults?: number;
}) {
  await ensureCortex();
  return getEntityCooccurrences(entityId, opts);
}

export async function memoriesByEntity(entityId: number, opts?: {
  limit?: number;
  memoryTypes?: MemoryType[];
}) {
  await ensureCortex();
  return getMemoriesByEntity(entityId, opts);
}

export async function similarEntities(query: string, opts?: {
  limit?: number;
  entityTypes?: EntityType[];
}) {
  await ensureCortex();
  return findSimilarEntities(query, opts);
}

export async function extractEntities(memoryId: number, content: string, summary: string, relatedUser?: string) {
  await ensureCortex();
  return extractAndLinkEntities(memoryId, content, summary, relatedUser);
}

// ── Clinamen (Anomaly Retrieval) ──────────────────────────────

export async function clinamen(opts: {
  context: string;
  limit?: number;
  memoryTypes?: MemoryType[];
  minImportance?: number;
  maxRelevance?: number;
}) {
  await ensureCortex();
  return findClinamen(opts);
}

// ── Memory Trace (Provenance) ─────────────────────────────────

export async function trace(memoryId: number, maxDepth?: number): Promise<TraceResult | null> {
  await ensureCortex();
  return traceMemory(memoryId, maxDepth);
}

export async function explain(memoryId: number, question: string): Promise<ExplainResult | null> {
  await ensureCortex();
  return explainMemory(memoryId, question);
}

// ── Action Learning ───────────────────────────────────────────

export async function recordAction(record: ActionRecord): Promise<number | null> {
  await ensureCortex();
  return logAction(record);
}

export async function recordOutcome(record: OutcomeRecord): Promise<number | null> {
  await ensureCortex();
  return logOutcome(record);
}

export async function learnFromActions(): Promise<string[]> {
  await ensureCortex();
  return refineStrategies();
}

// ── On-Chain Verification ─────────────────────────────────────

export async function verifyOnChain(memoryId: number): Promise<boolean> {
  const brain = await ensureCortex();
  return brain.verifyOnChain(memoryId);
}

// ── Event Listener ────────────────────────────────────────────

export async function onMemoryStored(handler: (payload: { importance: number; memoryType: string }) => void) {
  const brain = await ensureCortex();
  brain.on("memory:stored", handler);
}
