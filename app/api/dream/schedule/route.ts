import { NextResponse } from "next/server";
import { startDreamSchedule, stopDreamSchedule } from "@/lib/clude";

export async function POST() {
  try {
    await startDreamSchedule();
    return NextResponse.json({ success: true, active: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await stopDreamSchedule();
    return NextResponse.json({ success: true, active: false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
