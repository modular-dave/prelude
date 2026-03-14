import { NextRequest, NextResponse } from "next/server";
import { recallMemories, getStats, storeMemory, deleteMemoriesBySummaries } from "@/lib/clude";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  if (query === "__stats__") {
    return NextResponse.json(getStats());
  }

  const minImportance = parseFloat(req.nextUrl.searchParams.get("min_importance") ?? "0") || undefined;
  const minDecay = parseFloat(req.nextUrl.searchParams.get("min_decay") ?? "0") || undefined;
  const typesParam = req.nextUrl.searchParams.get("types");
  const types = typesParam ? typesParam.split(",") as import("@/lib/clude").MemoryType[] : undefined;

  const memories = recallMemories(query, { limit, minImportance, minDecay, types });
  return NextResponse.json(memories);
}

export async function DELETE(req: NextRequest) {
  const { summaries } = (await req.json()) as { summaries: string[] };
  if (!summaries?.length) {
    return NextResponse.json({ deleted: 0 });
  }
  const deleted = deleteMemoriesBySummaries(summaries);
  return NextResponse.json({ deleted });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = storeMemory({
    type: body.type ?? "semantic",
    content: body.content,
    summary: body.summary ?? body.content.slice(0, 100),
    tags: body.tags ?? [],
    importance: body.importance ?? 0.6,
  });
  return NextResponse.json({ id });
}
