import { NextRequest, NextResponse } from "next/server";
import { clinamen } from "@/lib/clude";
import type { MemoryType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const context = req.nextUrl.searchParams.get("context");
    if (!context) {
      return NextResponse.json({ error: "context required" }, { status: 400 });
    }
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "3", 10);
    const minImportance = parseFloat(req.nextUrl.searchParams.get("minImportance") ?? "0.6");
    const maxRelevance = parseFloat(req.nextUrl.searchParams.get("maxRelevance") ?? "0.35");
    const types = req.nextUrl.searchParams.get("types")?.split(",") as MemoryType[] | undefined;

    const memories = await clinamen({
      context,
      limit,
      memoryTypes: types,
      minImportance,
      maxRelevance,
    });
    return NextResponse.json(memories);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
