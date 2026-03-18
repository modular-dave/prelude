import { NextRequest, NextResponse } from "next/server";
import { ensureCortex, swapVeniceModel } from "@/lib/cortex";
import { getAssignment } from "@/lib/active-model-store";
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

export async function DELETE(req: NextRequest) {
  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body = clear all */ }

    if (body.logIds && Array.isArray(body.logIds)) {
      // Delete specific dream log entries + their created memories
      const { data: logs } = await supabase
        .from("dream_logs")
        .select("id, new_memories_created")
        .in("id", body.logIds);

      const memIds = (logs || []).flatMap((l: any) => l.new_memories_created || []);

      const { error: logErr } = await supabase
        .from("dream_logs")
        .delete()
        .in("id", body.logIds);
      if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

      if (memIds.length > 0) {
        await supabase.from("memories").delete().in("id", memIds);
      }

      return NextResponse.json({ deleted: body.logIds.length });
    }

    // Clear all dream logs
    const { error: logErr } = await supabase
      .from("dream_logs")
      .delete()
      .neq("id", 0);
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

    // Also clear dream-generated memories
    const { error: memErr } = await supabase
      .from("memories")
      .delete()
      .or("source.eq.consolidation,source.eq.emergence,tags.cs.{consolidation},tags.cs.{emergence}");
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

    return NextResponse.json({ deleted: "dreams" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (!process.env.VENICE_BASE_URL) {
      return NextResponse.json(
        { error: "Dream cycles require an inference backend. Set VENICE_BASE_URL (and optionally VENICE_API_KEY / VENICE_MODEL) in your environment." },
        { status: 400 }
      );
    }

    // Swap to dream-assigned model if configured
    const dreamAssign = getAssignment("dream");
    if (dreamAssign) swapVeniceModel(dreamAssign.model);

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
