import { NextRequest, NextResponse } from "next/server";
import { reflect, getStats, startReflectionSchedule, stopReflectionSchedule } from "@/lib/clude";

const MIN_MEMORIES_FOR_REFLECTION = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { schedule } = body as { schedule?: "start" | "stop" };

    if (schedule === "start") {
      await startReflectionSchedule();
      return NextResponse.json({ success: true, schedule: "started" });
    }
    if (schedule === "stop") {
      await stopReflectionSchedule();
      return NextResponse.json({ success: true, schedule: "stopped" });
    }

    // Pre-check: need enough memories to reflect on
    const stats = await getStats();
    const total = stats.total ?? 0;
    if (total < MIN_MEMORIES_FOR_REFLECTION) {
      return NextResponse.json(
        {
          error: `Need at least ${MIN_MEMORIES_FOR_REFLECTION} memories to reflect (currently ${total}). Have some conversations first.`,
        },
        { status: 400 }
      );
    }

    // Default: run a single reflection session
    const journal = await reflect();
    if (!journal) {
      return NextResponse.json(
        {
          error: `Reflection produced no output. The system found too few qualifying seed memories. Try having more varied conversations first.`,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, journal });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
