import { NextRequest, NextResponse } from "next/server";
import { clinamen } from "@/lib/clude";
import { apiError, parseIntParam } from "@/lib/api-utils";
import type { MemoryType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const context = req.nextUrl.searchParams.get("context");
    if (!context) {
      return apiError("context required");
    }
    const limit = parseIntParam(req.nextUrl.searchParams.get("limit"), 3, 1, 50);
    const minImportance = Math.min(Math.max(parseFloat(req.nextUrl.searchParams.get("minImportance") ?? "0.6") || 0.6, 0), 1);
    const maxRelevance = Math.min(Math.max(parseFloat(req.nextUrl.searchParams.get("maxRelevance") ?? "0.35") || 0.35, 0), 1);
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
