import { NextResponse } from "next/server";
import { startDreamSchedule, stopDreamSchedule } from "@/lib/clude";
import { apiError } from "@/lib/api-utils";

export async function POST() {
  try {
    await startDreamSchedule();
    return NextResponse.json({ success: true, active: true });
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function DELETE() {
  try {
    await stopDreamSchedule();
    return NextResponse.json({ success: true, active: false });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
