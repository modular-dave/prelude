import { NextRequest, NextResponse } from "next/server";
import { recent } from "@/lib/clude";
import type { MemoryType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const hours = parseInt(req.nextUrl.searchParams.get("hours") ?? "24", 10);
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10000", 10);
    const typesParam = req.nextUrl.searchParams.get("types");
    const types = typesParam ? typesParam.split(",") as MemoryType[] : undefined;

    const memories = await recent(hours, types, limit);
    return NextResponse.json(memories);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
