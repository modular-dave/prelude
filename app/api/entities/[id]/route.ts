import { NextRequest, NextResponse } from "next/server";
import { memoriesByEntity } from "@/lib/clude";
import { parseIntParam } from "@/lib/api-utils";
import type { MemoryType } from "@/lib/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const limit = parseIntParam(req.nextUrl.searchParams.get("limit"), 20, 1, 500);
    const typesParam = req.nextUrl.searchParams.get("types");
    const memoryTypes = typesParam ? typesParam.split(",") as MemoryType[] : undefined;

    const memories = await memoriesByEntity(parseInt(id, 10), { limit, memoryTypes });
    return NextResponse.json(memories);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
