import { NextRequest, NextResponse } from "next/server";
import { knowledgeGraph } from "@/lib/clude";
import type { EntityType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const entityTypes = req.nextUrl.searchParams.get("entityTypes")?.split(",") as EntityType[] | undefined;
    const minMentions = parseInt(req.nextUrl.searchParams.get("minMentions") ?? "0", 10) || undefined;
    const includeMemories = req.nextUrl.searchParams.get("includeMemories") === "true";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10);

    const graph = await knowledgeGraph({ entityTypes, minMentions, includeMemories, limit });
    return NextResponse.json(graph);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
