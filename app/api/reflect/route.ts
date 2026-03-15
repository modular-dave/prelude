import { NextRequest, NextResponse } from "next/server";
import { reflect, startReflectionSchedule, stopReflectionSchedule } from "@/lib/clude";

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

    // Default: run a single reflection session
    const journal = await reflect();
    return NextResponse.json({ success: true, journal });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
