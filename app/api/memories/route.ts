import { NextRequest, NextResponse } from "next/server";
import { recallMemories, getStats, storeMemory } from "@/lib/clude";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  if (query === "__stats__") {
    return NextResponse.json(getStats());
  }

  const memories = recallMemories(query, { limit });
  return NextResponse.json(memories);
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
