import { NextRequest, NextResponse } from "next/server";
import { ensureCortex, recordMeterEvent } from "@/lib/cortex";
import { recallMemories, storeMemory, link } from "@/lib/clude";
import { supabase } from "@/lib/supabase";
import { apiError } from "@/lib/api-utils";

interface MemoryPack {
  name: string;
  description: string;
  version: string;
  exportedAt: string;
  memories: Array<{
    type: string;
    content: string;
    summary: string;
    tags: string[];
    importance: number;
    concepts: string[];
    emotional_valence: number;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: "export" | "import" | "preview" | "markdown" };

    if (action === "export") {
      const { name, description, source, types, query, ids, limit } = body as {
        name: string;
        description: string;
        source?: string;
        types?: string[];
        query?: string;
        ids?: number[];
        limit?: number;
      };

      await ensureCortex();
      let memories: any[] = [];

      if (ids && ids.length > 0) {
        const { data } = await supabase
          .from("memories")
          .select("*")
          .in("id", ids);
        memories = data || [];
      } else if (query) {
        memories = await recallMemories(query, { limit: limit || 100, types: types as any });
      } else if (types && types.length > 0) {
        const { data } = await supabase
          .from("memories")
          .select("*")
          .in("memory_type", types)
          .order("importance", { ascending: false })
          .limit(limit || 100);
        memories = data || [];
      } else {
        const { data } = await supabase
          .from("memories")
          .select("*")
          .order("importance", { ascending: false })
          .limit(limit || 100);
        memories = data || [];
      }

      const pack: MemoryPack = {
        name: name || "Memory Pack",
        description: description || "",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        memories: memories.map((m: any) => ({
          type: m.memory_type,
          content: m.content,
          summary: m.summary,
          tags: m.tags || [],
          importance: m.importance,
          concepts: m.concepts || [],
          emotional_valence: m.emotional_valence || 0,
        })),
      };

      recordMeterEvent("pack_export");
      return NextResponse.json(pack);
    }

    if (action === "import") {
      const { pack, importanceMultiplier, tagPrefix, allowedTypes } = body as {
        pack: MemoryPack;
        importanceMultiplier?: number;
        tagPrefix?: string;
        allowedTypes?: string[];
      };

      let imported = 0;
      let skipped = 0;

      for (const mem of pack.memories) {
        if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(mem.type)) {
          skipped++;
          continue;
        }

        const tags = tagPrefix
          ? mem.tags.map((t) => `${tagPrefix}${t}`)
          : [...mem.tags];
        tags.push("imported", `pack:${pack.name}`);

        const importance = Math.min(1, (mem.importance || 0.5) * (importanceMultiplier || 0.8));

        await storeMemory({
          type: mem.type as any,
          content: mem.content,
          summary: mem.summary,
          tags,
          importance,
          source: `import:${pack.name}`,
        });
        imported++;
      }

      recordMeterEvent("pack_import");
      return NextResponse.json({ imported, skipped });
    }

    if (action === "preview") {
      const { pack } = body as { pack: MemoryPack };
      const typeCounts: Record<string, number> = {};
      for (const mem of pack.memories) {
        typeCounts[mem.type] = (typeCounts[mem.type] || 0) + 1;
      }
      return NextResponse.json({
        memoryCount: pack.memories.length,
        types: typeCounts,
        sampleSummaries: pack.memories.slice(0, 5).map((m) => m.summary),
      });
    }

    if (action === "markdown") {
      const { name, description, types, query, ids, limit } = body;
      await ensureCortex();
      let memories: any[] = [];

      if (ids && ids.length > 0) {
        const { data } = await supabase.from("memories").select("*").in("id", ids);
        memories = data || [];
      } else if (query) {
        memories = await recallMemories(query, { limit: limit || 100, types });
      } else {
        const { data } = await supabase
          .from("memories")
          .select("*")
          .order("importance", { ascending: false })
          .limit(limit || 100);
        memories = data || [];
      }

      const lines = [`# ${name || "Memory Pack"}`, description ? `\n${description}\n` : "", `\nExported: ${new Date().toISOString()}\n`, `## Memories (${memories.length})\n`];

      for (const m of memories) {
        lines.push(`### ${m.summary}`);
        lines.push(`- **Type**: ${m.memory_type}`);
        lines.push(`- **Importance**: ${(m.importance * 100).toFixed(0)}%`);
        lines.push(`- **Tags**: ${(m.tags || []).join(", ") || "none"}`);
        lines.push(`\n${m.content}\n`);
        lines.push("---\n");
      }

      return new Response(lines.join("\n"), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    return apiError("action must be export, import, preview, or markdown");
  } catch (err) {
    return apiError(String(err), 500);
  }
}
