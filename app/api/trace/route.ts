import { NextRequest, NextResponse } from "next/server";
import { trace, explain } from "@/lib/clude";

export async function GET(req: NextRequest) {
  try {
    const memoryId = parseInt(req.nextUrl.searchParams.get("memoryId") ?? "", 10);
    if (isNaN(memoryId)) {
      return NextResponse.json({ error: "memoryId required" }, { status: 400 });
    }
    const maxDepth = parseInt(req.nextUrl.searchParams.get("maxDepth") ?? "3", 10);

    const result = await trace(memoryId, maxDepth);
    if (!result) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { memoryId, question } = (await req.json()) as {
      memoryId: number;
      question: string;
    };
    if (!memoryId || !question) {
      return NextResponse.json({ error: "memoryId and question required" }, { status: 400 });
    }

    const result = await explain(memoryId, question);
    if (!result) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
