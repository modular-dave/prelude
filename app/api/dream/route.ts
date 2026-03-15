import { NextRequest, NextResponse } from "next/server";
import { ensureCortex } from "@/lib/cortex";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || "50");

    const { data: logs, error } = await supabase
      .from("dream_logs")
      .select("id, session_type, input_memory_ids, output, new_memories_created, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: logs || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const brain = await ensureCortex();
    let emergenceThought: string | null = null;

    // Record timestamp before dream starts so we can query logs created during this cycle
    const startedAt = new Date().toISOString();

    await brain.dream({
      onEmergence: async (thought: string) => {
        emergenceThought = thought;
      },
    });

    // Fetch dream logs created during this cycle
    const { data: logs } = await supabase
      .from("dream_logs")
      .select("id, session_type, input_memory_ids, output, new_memories_created, created_at")
      .gte("created_at", startedAt)
      .order("created_at", { ascending: true });

    // Fetch newly created memories for richer display
    const newMemoryIds = (logs || []).flatMap((l: any) => l.new_memories_created || []);
    let newMemories: any[] = [];
    if (newMemoryIds.length > 0) {
      const { data } = await supabase
        .from("memories")
        .select("id, memory_type, summary, importance, tags, source, created_at")
        .in("id", newMemoryIds);
      newMemories = data || [];
    }

    // Structure phases
    const phases = (logs || []).map((log: any) => ({
      id: log.id,
      phase: log.session_type,
      output: log.output,
      inputCount: (log.input_memory_ids || []).length,
      newMemoryIds: log.new_memories_created || [],
      createdAt: log.created_at,
    }));

    return NextResponse.json({
      success: true,
      emergence: emergenceThought,
      phases,
      newMemories: newMemories.map((m: any) => ({
        id: m.id,
        type: m.memory_type,
        summary: m.summary,
        importance: m.importance,
        tags: m.tags,
        source: m.source,
        createdAt: m.created_at,
      })),
      stats: {
        totalPhases: phases.length,
        totalNewMemories: newMemoryIds.length,
        totalInputMemories: phases.reduce((s: number, p: any) => s + p.inputCount, 0),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
