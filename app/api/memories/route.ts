import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recallMemories, getStats, storeMemory } from "@/lib/clude";

function supabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  try {
    if (query === "__stats__") {
      const stats = await getStats();
      return NextResponse.json(stats);
    }

    // Tag-based lookup (no embedding search)
    const tag = req.nextUrl.searchParams.get("tag");
    if (tag) {
      const db = supabase();
      const { data, error } = await db
        .from("memories")
        .select("*")
        .contains("tags", [tag])
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    const minImportance = parseFloat(req.nextUrl.searchParams.get("min_importance") ?? "0") || undefined;
    const minDecay = parseFloat(req.nextUrl.searchParams.get("min_decay") ?? "0") || undefined;
    const typesParam = req.nextUrl.searchParams.get("types");
    const types = typesParam ? typesParam.split(",") as import("@/lib/clude").MemoryType[] : undefined;

    const memories = await recallMemories(query, { limit, minImportance, minDecay, types });
    return NextResponse.json(memories);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const db = supabase();

    if (body.all) {
      // Delete ALL memories
      const { error } = await db.from("memories").delete().neq("id", 0);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ deleted: "all" });
    }

    if (body.tag) {
      // Delete memories containing a specific tag
      const { error } = await db.from("memories").delete().contains("tags", [body.tag]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ deleted: body.tag });
    }

    if (body.id) {
      // Delete a single memory by ID
      const { error } = await db.from("memories").delete().eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ deleted: body.id });
    }

    if (body.ids && Array.isArray(body.ids)) {
      // Delete multiple memories by IDs
      const { error } = await db.from("memories").delete().in("id", body.ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ deleted: body.ids.length });
    }

    return NextResponse.json({ error: "Provide 'all', 'tag', 'id', or 'ids'" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = await storeMemory({
      type: body.type ?? "semantic",
      content: body.content,
      summary: body.summary ?? body.content.slice(0, 100),
      tags: body.tags ?? [],
      importance: body.importance ?? 0.6,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
