/**
 * Embedding dimension migration — detects mismatches, alters schema,
 * and batch re-embeds existing memories when the user switches models.
 *
 * Runs server-side only. Uses Supabase pg-meta REST endpoint for raw SQL
 * (local stack on :54323) with psql fallback for desktop deployments.
 */

import { supabase } from "./supabase";

// ── Types ────────────────────────────────────────────────────────

export interface MigrationCheck {
  dimensionMismatch: boolean;
  currentDims: number | null;
  targetDims: number;
  memoryCounts: { total: number; withEmbedding: number };
  needsMigration: boolean;
}

export interface MigrationProgress {
  phase: "clearing" | "schema" | "reembedding" | "done" | "error";
  done?: number;
  total?: number;
  percent?: number;
  processed?: number;
  failed?: number;
  error?: string;
}

// ── Raw SQL execution ────────────────────────────────────────────

async function runSqlDirect(sql: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  // Primary: pg-meta REST endpoint (local Supabase stack)
  const pgMetaUrl = process.env.SUPABASE_PG_META_URL || "http://127.0.0.1:54323";
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";

  try {
    const res = await fetch(`${pgMetaUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `pg-meta ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    // Fallback: psql via direct postgres connection
    try {
      const { execSync } = await import("child_process");
      const pgUrl = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
      const result = execSync(`psql "${pgUrl}" -t -A -c ${JSON.stringify(sql)}`, {
        timeout: 30_000,
        encoding: "utf-8",
      });
      return { ok: true, data: result.trim() };
    } catch (psqlErr) {
      return { ok: false, error: `SQL execution failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

// ── Dimension detection ──────────────────────────────────────────

async function getCurrentDbDimensions(): Promise<number | null> {
  const result = await runSqlDirect(`
    SELECT atttypmod FROM pg_attribute
    JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
    WHERE pg_class.relname = 'memories' AND pg_attribute.attname = 'embedding'
    AND atttypmod > 0
  `);

  if (!result.ok || !result.data) return null;

  // pg-meta returns array of rows, psql returns raw text
  const raw = Array.isArray(result.data) ? result.data[0]?.atttypmod : parseInt(result.data, 10);
  const atttypmod = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (isNaN(atttypmod) || atttypmod <= 4) return null;

  // pgvector stores atttypmod = dims + 4
  return atttypmod - 4;
}

async function getMemoryCount(): Promise<{ total: number; withEmbedding: number }> {
  const { count: total } = await supabase
    .from("memories")
    .select("id", { count: "exact", head: true });

  const { count: withEmbedding } = await supabase
    .from("memories")
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);

  return { total: total ?? 0, withEmbedding: withEmbedding ?? 0 };
}

export async function checkMigration(targetDims: number): Promise<MigrationCheck> {
  const [currentDims, memoryCounts] = await Promise.all([
    getCurrentDbDimensions(),
    getMemoryCount(),
  ]);

  const dimensionMismatch = currentDims !== null && currentDims !== targetDims;
  const needsMigration = dimensionMismatch && memoryCounts.withEmbedding > 0;

  return { dimensionMismatch, currentDims, targetDims, memoryCounts, needsMigration };
}

// ── Schema migration ─────────────────────────────────────────────

export async function migrateSchema(
  dims: number,
  onProgress?: (event: MigrationProgress) => void,
): Promise<{ ok: boolean; error?: string }> {
  // 1. Nullify old embeddings (incompatible with new model)
  onProgress?.({ phase: "clearing" });
  const clearResult = await runSqlDirect(`
    UPDATE memories SET embedding = NULL WHERE embedding IS NOT NULL;
    UPDATE memory_fragments SET embedding = NULL WHERE embedding IS NOT NULL;
  `);
  if (!clearResult.ok) return { ok: false, error: `Clear failed: ${clearResult.error}` };

  // 2. Schema DDL
  onProgress?.({ phase: "schema" });
  const ddl = `
    DROP INDEX IF EXISTS idx_memories_embedding;
    DROP INDEX IF EXISTS idx_fragments_embedding;

    ALTER TABLE memories ALTER COLUMN embedding TYPE vector(${dims});
    ALTER TABLE memory_fragments ALTER COLUMN embedding TYPE vector(${dims});

    CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX idx_fragments_embedding ON memory_fragments USING hnsw (embedding vector_cosine_ops);

    ${matchMemoriesSql(dims)}
    ${matchFragmentsSql(dims)}
  `;

  const ddlResult = await runSqlDirect(ddl);
  if (!ddlResult.ok) return { ok: false, error: `Schema migration failed: ${ddlResult.error}` };

  return { ok: true };
}

// ── Batch re-embedding ───────────────────────────────────────────

export async function reembedBatch(opts: {
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingApiKey: string;
  batchSize?: number;
  onProgress?: (event: MigrationProgress) => void;
}): Promise<{ ok: boolean; processed: number; failed: number; error?: string }> {
  const { embeddingBaseUrl, embeddingModel, embeddingApiKey, batchSize = 20, onProgress } = opts;
  let processed = 0;
  let failed = 0;

  // Re-embed memories
  const { count: memTotal } = await supabase
    .from("memories")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  const total = (memTotal ?? 0);

  // Also count fragments
  const { count: fragTotal } = await supabase
    .from("memory_fragments")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  const grandTotal = total + (fragTotal ?? 0);

  if (grandTotal === 0) {
    onProgress?.({ phase: "done", processed: 0, failed: 0 });
    return { ok: true, processed: 0, failed: 0 };
  }

  onProgress?.({ phase: "reembedding", done: 0, total: grandTotal, percent: 0 });

  // Process memories
  let offset = 0;
  while (true) {
    const { data: rows } = await supabase
      .from("memories")
      .select("id, content, summary")
      .is("embedding", null)
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (!rows || rows.length === 0) break;

    const texts = rows.map((r: any) => r.summary || r.content || "");
    try {
      const embeddings = await callEmbeddingEndpoint(embeddingBaseUrl, embeddingApiKey, embeddingModel, texts);
      for (let i = 0; i < rows.length; i++) {
        if (embeddings[i]) {
          await supabase.from("memories").update({ embedding: JSON.stringify(embeddings[i]) }).eq("id", rows[i].id);
          processed++;
        } else {
          failed++;
        }
      }
    } catch {
      failed += rows.length;
    }

    onProgress?.({
      phase: "reembedding",
      done: processed + failed,
      total: grandTotal,
      percent: Math.round(((processed + failed) / grandTotal) * 100),
    });

    offset += batchSize;
  }

  // Process fragments
  offset = 0;
  while (true) {
    const { data: rows } = await supabase
      .from("memory_fragments")
      .select("id, content")
      .is("embedding", null)
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (!rows || rows.length === 0) break;

    const texts = rows.map((r: any) => r.content || "");
    try {
      const embeddings = await callEmbeddingEndpoint(embeddingBaseUrl, embeddingApiKey, embeddingModel, texts);
      for (let i = 0; i < rows.length; i++) {
        if (embeddings[i]) {
          await supabase.from("memory_fragments").update({ embedding: JSON.stringify(embeddings[i]) }).eq("id", rows[i].id);
          processed++;
        } else {
          failed++;
        }
      }
    } catch {
      failed += rows.length;
    }

    onProgress?.({
      phase: "reembedding",
      done: processed + failed,
      total: grandTotal,
      percent: Math.round(((processed + failed) / grandTotal) * 100),
    });

    offset += batchSize;
  }

  onProgress?.({ phase: "done", processed, failed });
  return { ok: true, processed, failed };
}

// ── Embedding endpoint call ──────────────────────────────────────

async function callEmbeddingEndpoint(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: string[],
): Promise<(number[] | null)[]> {
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`Embedding endpoint ${res.status}`);

  const data = await res.json();
  const results: (number[] | null)[] = [];
  for (let i = 0; i < input.length; i++) {
    const item = data.data?.find((d: any) => d.index === i) || data.data?.[i];
    results.push(item?.embedding || null);
  }
  return results;
}

// ── SQL templates ────────────────────────────────────────────────

function matchMemoriesSql(dims: number): string {
  return `
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(${dims}),
  match_count int DEFAULT 10,
  filter_types text[] DEFAULT NULL,
  min_importance float DEFAULT 0,
  min_decay float DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  memory_type text,
  content text,
  summary text,
  tags text[],
  concepts text[],
  emotional_valence float,
  importance float,
  access_count int,
  source text,
  source_id text,
  related_user text,
  related_wallet text,
  metadata jsonb,
  created_at timestamptz,
  last_accessed timestamptz,
  decay_factor float,
  evidence_ids bigint[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.memory_type,
    m.content,
    m.summary,
    m.tags,
    m.concepts,
    m.emotional_valence::float,
    m.importance::float,
    m.access_count,
    m.source,
    m.source_id,
    m.related_user,
    m.related_wallet,
    m.metadata,
    m.created_at,
    m.last_accessed,
    m.decay_factor::float,
    m.evidence_ids,
    (1 - (m.embedding <=> query_embedding))::float AS similarity
  FROM memories m
  WHERE m.embedding IS NOT NULL
    AND (filter_types IS NULL OR m.memory_type = ANY(filter_types))
    AND m.importance >= min_importance
    AND m.decay_factor >= min_decay
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;`;
}

function matchFragmentsSql(dims: number): string {
  return `
CREATE OR REPLACE FUNCTION match_fragments(
  query_embedding vector(${dims}),
  match_count int DEFAULT 10,
  filter_memory_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  memory_id bigint,
  chunk_index int,
  content text,
  embedding vector(${dims}),
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.memory_id,
    f.chunk_index,
    f.content,
    f.embedding,
    (1 - (f.embedding <=> query_embedding))::float AS similarity
  FROM memory_fragments f
  WHERE f.embedding IS NOT NULL
    AND (filter_memory_id IS NULL OR f.memory_id = filter_memory_id)
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;`;
}
