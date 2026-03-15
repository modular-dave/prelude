#!/usr/bin/env node
/**
 * Generates embeddings for all memories that have null embeddings.
 * Uses the local embedding endpoint configured in .env.local.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const EMBEDDING_URL = process.env.EMBEDDING_BASE_URL || "http://127.0.0.1:11435/v1/embeddings";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "BAAI/bge-small-en-v1.5";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getEmbedding(text) {
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: text, model: EMBEDDING_MODEL }),
  });
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  // Get all memories with null embedding
  const { data: memories, error } = await supabase
    .from("memories")
    .select("id, content, summary")
    .is("embedding", null)
    .order("id");

  if (error) throw error;
  console.log(`Found ${memories.length} memories without embeddings`);

  let done = 0;
  for (const m of memories) {
    const text = m.summary || m.content || "";
    if (!text) continue;

    try {
      const embedding = await getEmbedding(text);
      const { error: updateErr } = await supabase
        .from("memories")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", m.id);

      if (updateErr) {
        console.log(`  [${m.id}] update failed: ${updateErr.message}`);
      } else {
        done++;
        if (done % 10 === 0) process.stdout.write(`  ${done}/${memories.length}\n`);
      }
    } catch (err) {
      console.log(`  [${m.id}] embedding failed: ${err.message}`);
    }
  }

  console.log(`Done! Generated embeddings for ${done}/${memories.length} memories.`);
}

main().catch(console.error);
