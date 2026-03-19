import { NextResponse } from "next/server";
import { knowledgeGraph } from "@/lib/clude";
import { supabase } from "@/lib/supabase";
import { TYPE_COLORS } from "@/lib/types";
import { ENTITY_COLORS, DEFAULT_ENTITY_COLOR } from "@/lib/3d-graph/constants";
import { compileGraph, memoryContextToRawGraph } from "@/lib/3d-graph/compiler/build";
import type { CompilerOutput } from "@/lib/3d-graph/compiler/build";
import { apiError } from "@/lib/api-utils";

// In-memory cache of the most recent compilation
let cachedOutput: CompilerOutput | null = null;
let cacheTimestamp = 0;

export async function POST() {
  try {
    // Fetch raw data from Supabase
    const [{ data: memories }, kg] = await Promise.all([
      supabase
        .from("memories")
        .select("id, memory_type, summary, content, importance, access_count, tags, created_at")
        .order("created_at", { ascending: false }),
      knowledgeGraph({ includeMemories: true }),
    ]);

    if (!memories) {
      return apiError("Failed to fetch memories", 500);
    }

    // Convert to raw graph format
    const rawGraph = memoryContextToRawGraph(
      memories, kg, TYPE_COLORS, ENTITY_COLORS, DEFAULT_ENTITY_COLOR,
    );

    // Compile
    const output = compileGraph(rawGraph);

    // Cache in memory
    cachedOutput = output;
    cacheTimestamp = Date.now();

    return NextResponse.json({
      manifest: output.manifest,
      tileCount: output.tiles.size,
      topologyChunkCount: output.topologyChunks.size,
      compiledAt: new Date(cacheTimestamp).toISOString(),
    });
  } catch (err: any) {
    console.error("Graph compilation failed:", err);
    return apiError(err.message, 500);
  }
}

export async function GET() {
  if (!cachedOutput) {
    return apiError("No compiled graph. POST to /api/graph/compile first.", 404);
  }

  return NextResponse.json({
    manifest: cachedOutput.manifest,
    compiledAt: new Date(cacheTimestamp).toISOString(),
  });
}

// Exported for the tiles route to access
export function getCachedOutput(): CompilerOutput | null {
  return cachedOutput;
}
