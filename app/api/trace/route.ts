import { NextRequest, NextResponse } from "next/server";
import { trace, explain } from "@/lib/clude";
import { apiError, parseIntParam } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const memoryId = parseIntParam(req.nextUrl.searchParams.get("memoryId"), NaN, 1);
    if (isNaN(memoryId)) {
      return apiError("memoryId required");
    }
    const maxDepth = parseIntParam(req.nextUrl.searchParams.get("maxDepth"), 3, 1, 10);

    const result = await trace(memoryId, maxDepth);
    if (!result) {
      return apiError("Memory not found", 404);
    }
    return NextResponse.json(result);
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { memoryId, question } = (await req.json()) as {
      memoryId: number;
      question: string;
    };
    if (!memoryId || !question) {
      return apiError("memoryId and question required");
    }

    const result = await explain(memoryId, question);
    if (!result) {
      return apiError("Memory not found", 404);
    }
    return NextResponse.json(result);
  } catch (err) {
    return apiError(String(err), 500);
  }
}
