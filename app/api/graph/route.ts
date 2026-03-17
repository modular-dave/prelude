import { NextRequest, NextResponse } from "next/server";
import { knowledgeGraph, graphStats } from "@/lib/clude";
import { supabase } from "@/lib/supabase";
import type { EntityType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const entityTypes = req.nextUrl.searchParams.get("entityTypes")?.split(",") as EntityType[] | undefined;
    const minMentions = parseInt(req.nextUrl.searchParams.get("minMentions") ?? "0", 10) || undefined;
    const includeMemories = req.nextUrl.searchParams.get("includeMemories") === "true";
    const limit = req.nextUrl.searchParams.has("limit") ? parseInt(req.nextUrl.searchParams.get("limit")!, 10) : undefined;
    const bundle = req.nextUrl.searchParams.get("bundle") === "true";

    if (bundle) {
      // Single request returns graph + stats + ALL memory links
      // Supabase caps at 1000 rows per request, so fetch all in parallel pages
      const PAGE = 1000;
      const [graph, stats, firstPage] = await Promise.all([
        knowledgeGraph({ entityTypes, minMentions, includeMemories, limit }),
        graphStats(),
        supabase
          .from("memory_links")
          .select("source_id, target_id, link_type, strength")
          .order("strength", { ascending: false })
          .range(0, PAGE - 1),
      ]);
      let allLinks = firstPage.data ?? [];
      if (allLinks.length === PAGE) {
        // More pages exist — fetch remaining in parallel
        const { count } = await supabase.from("memory_links").select("*", { count: "exact", head: true });
        if (count && count > PAGE) {
          const pages = Math.ceil(count / PAGE);
          const fetches = [];
          for (let p = 1; p < pages; p++) {
            fetches.push(
              supabase
                .from("memory_links")
                .select("source_id, target_id, link_type, strength")
                .order("strength", { ascending: false })
                .range(p * PAGE, (p + 1) * PAGE - 1)
            );
          }
          const results = await Promise.all(fetches);
          for (const r of results) {
            if (r.data) allLinks = allLinks.concat(r.data);
          }
        }
      }
      return NextResponse.json({
        graph,
        stats,
        links: allLinks,
      });
    }

    const graph = await knowledgeGraph({ entityTypes, minMentions, includeMemories, limit });
    return NextResponse.json(graph);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
