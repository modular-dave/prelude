import { NextRequest, NextResponse } from "next/server";
import { loadEngineConfig, updateEngineConfig } from "@/lib/engine-config";
import { inferConcepts } from "@/lib/clude";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const config = loadEngineConfig();
    return NextResponse.json(config.memoryConcepts);
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Infer: auto-detect concepts via LLM ──
    if (body.action === "infer") {
      const { summary, source, tags } = body as { action: string; summary: string; source: string; tags: string[] };
      if (!summary) return apiError("summary is required");
      const concepts = await inferConcepts(summary, source || "user", tags || []);
      return NextResponse.json({ concepts });
    }

    // ── Add/Remove: manual concept management ──
    const { add, remove } = body as { add?: string[]; remove?: string[] };
    const config = loadEngineConfig();
    let concepts = [...config.memoryConcepts];

    if (remove && remove.length > 0) {
      concepts = concepts.filter((c) => !remove.includes(c));
    }
    if (add && add.length > 0) {
      for (const c of add) {
        const normalized = c.trim().toLowerCase().replace(/\s+/g, "_");
        if (normalized && !concepts.includes(normalized)) {
          concepts.push(normalized);
        }
      }
    }

    updateEngineConfig({ memoryConcepts: concepts });
    return NextResponse.json(concepts);
  } catch (err) {
    return apiError(String(err), 500);
  }
}
