import { NextRequest, NextResponse } from "next/server";
import { similarEntities, entitiesInMemory } from "@/lib/clude";
import type { EntityType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q");
    const memoryId = req.nextUrl.searchParams.get("memoryId");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
    const entityTypes = req.nextUrl.searchParams.get("entityTypes")?.split(",") as EntityType[] | undefined;

    if (memoryId) {
      const entities = await entitiesInMemory(parseInt(memoryId, 10));
      return NextResponse.json(entities);
    }

    if (query) {
      const entities = await similarEntities(query, { limit, entityTypes });
      return NextResponse.json(entities);
    }

    return NextResponse.json([]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
