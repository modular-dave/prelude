import { NextRequest, NextResponse } from "next/server";
import { clinamen } from "@/lib/clude";
import { apiError } from "@/lib/api-utils";
import type { MemoryType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const context = req.nextUrl.searchParams.get("context");
    if (!context) {
      return apiError("context required");
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
    return apiError(String(err), 500);
  }
}
