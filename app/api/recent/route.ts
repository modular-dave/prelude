import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseIntParam } from "@/lib/api-utils";
import type { MemoryType } from "@/lib/types";

const PAGE_SIZE = 1000; // Supabase PostgREST max_rows default
const VALID_MEMORY_TYPES = new Set(["episodic", "semantic", "procedural", "autobiographical", "reflection", "dream", "emergence"]);

export async function GET(req: NextRequest) {
  try {
    const hours = parseIntParam(req.nextUrl.searchParams.get("hours"), 24, 1, 87600);
    const limit = parseIntParam(req.nextUrl.searchParams.get("limit"), 100000, 1, 100000);
    const typesParam = req.nextUrl.searchParams.get("types");
    const types = typesParam
      ? (typesParam.split(",").filter(t => VALID_MEMORY_TYPES.has(t)) as MemoryType[])
      : undefined;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const allMemories: any[] = [];
    let from = 0;

    while (from < limit) {
      const to = Math.min(from + PAGE_SIZE - 1, limit - 1);
      let query = supabase
        .from("memories")
        .select("id, content, summary, memory_type, importance, emotional_valence, access_count, decay_factor, tags, source, metadata, created_at, last_accessed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (types && types.length > 0) {
        query = query.in("memory_type", types);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;

      allMemories.push(...data);
      if (data.length < PAGE_SIZE) break; // last page
      from += PAGE_SIZE;
    }

    return NextResponse.json(allMemories);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
