-- Fix embedding dimensions to match local model (bge-small-en-v1.5 = 384 dims)

-- Drop indexes first
DROP INDEX IF EXISTS idx_memories_embedding;
DROP INDEX IF EXISTS idx_fragments_embedding;

-- Alter columns
ALTER TABLE memories ALTER COLUMN embedding TYPE vector(384);
ALTER TABLE memory_fragments ALTER COLUMN embedding TYPE vector(384);

-- Recreate indexes
CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_fragments_embedding ON memory_fragments USING hnsw (embedding vector_cosine_ops);

-- Recreate functions with correct dimensions
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(384),
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
$$;

CREATE OR REPLACE FUNCTION match_fragments(
  query_embedding vector(384),
  match_count int DEFAULT 10,
  filter_memory_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  memory_id bigint,
  chunk_index int,
  content text,
  embedding vector(384),
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
$$;
