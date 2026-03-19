import { NextResponse } from "next/server";
import { isDreamScheduleActive, isReflectionScheduleActive } from "@/lib/clude";

export async function GET() {
  return NextResponse.json({
    schedules: {
      dream: isDreamScheduleActive(),
      reflection: isReflectionScheduleActive(),
    },
  });
}
