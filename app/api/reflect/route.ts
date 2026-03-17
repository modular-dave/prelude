import { NextRequest, NextResponse } from "next/server";
import { reflect, getStats, startReflectionSchedule, stopReflectionSchedule } from "@/lib/clude";
import { getAssignment } from "@/lib/active-model-store";
import { swapVeniceModel } from "@/lib/cortex";

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

    // Pre-check: inference backend must be configured
    if (!process.env.VENICE_BASE_URL) {
      return NextResponse.json(
        {
          error: "Reflection requires an inference backend. Set VENICE_BASE_URL (and optionally VENICE_API_KEY / VENICE_MODEL) in your environment to enable dream cycles and reflections.",
        },
        { status: 400 }
      );
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

    // Swap to reflect-assigned model if configured
    const reflectAssign = getAssignment("reflect");
    if (reflectAssign) swapVeniceModel(reflectAssign.model);

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
